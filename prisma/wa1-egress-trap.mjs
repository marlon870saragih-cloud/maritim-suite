// WA-1 Step 2J — perangkap egress untuk PROSES SERVER uji (bukan kode aplikasi).
//
// Dimuat lewat NODE_OPTIONS="--import <jalur absolut>/prisma/wa1-egress-trap.mjs" saat menjalankan `next dev`/`next start`
// LOKAL untuk uji E2E. Setiap koneksi keluar ke host selain loopback/unix socket DIBLOKIR dan dicatat ke
// stderr dengan penanda `[WA1-EGRESS] BLOCKED`; koneksi loopback (PostgreSQL lokal, server itu sendiri)
// diizinkan. Penanda `[WA1-EGRESS] TRAP-AKTIF pid=…` membuktikan perangkap termuat di proses tersebut.
// Mencakup: net.Socket#connect (dipakai net/tls/http/https/undici-fetch), tls.connect, dns.lookup (+promises),
// dns.resolve*. Tidak pernah dipakai di produksi.

import net from 'node:net'
import tls from 'node:tls'
import dns from 'node:dns'

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost', '::ffff:127.0.0.1', '0.0.0.0', '::'])
const bolehHost = (h) => h === undefined || h === null || h === '' || LOOPBACK.has(String(h).replace(/^\[|\]$/g, '').toLowerCase()) || /^127\./.test(String(h))
const catat = (jenis, sasaran) => process.stderr.write(`[WA1-EGRESS] BLOCKED ${jenis} ${sasaran} pid=${process.pid}\n`)
const galat = (sasaran) => Object.assign(new Error(`WA1 egress trap: koneksi keluar diblokir (${sasaran})`), { code: 'WA1_EGRESS_BLOCKED' })

function sasaranDari(args) {
  const a0 = args[0]
  if (Array.isArray(a0)) return sasaranDari(a0) // bentuk internal [options, cb] (normalizeArgs)
  if (a0 && typeof a0 === 'object') return a0.path ? { unix: true } : { host: a0.host ?? a0.hostname, port: a0.port }
  if (typeof a0 === 'string' && !/^\d+$/.test(a0)) return { unix: true } // path unix socket
  return { host: typeof args[1] === 'string' ? args[1] : undefined, port: a0 }
}

const asliConnect = net.Socket.prototype.connect
net.Socket.prototype.connect = function (...args) {
  const s = sasaranDari(args)
  if (!s.unix && !bolehHost(s.host)) {
    const t = `${s.host}:${s.port}`
    catat('net', t)
    process.nextTick(() => this.destroy(galat(t)))
    return this
  }
  return asliConnect.apply(this, args)
}

const asliTls = tls.connect
tls.connect = function (...args) {
  const s = sasaranDari(args)
  if (!s.unix && !bolehHost(s.host)) {
    const t = `${s.host}:${s.port}`
    catat('tls', t)
    throw galat(t)
  }
  return asliTls.apply(this, args)
}

const asliLookup = dns.lookup
dns.lookup = function (host, ...rest) {
  if (!bolehHost(host)) {
    catat('dns', host)
    const cb = rest.find((x) => typeof x === 'function')
    if (cb) return process.nextTick(() => cb(galat(host)))
    throw galat(host)
  }
  return asliLookup.call(this, host, ...rest)
}
if (dns.promises) {
  const asliPLookup = dns.promises.lookup
  dns.promises.lookup = function (host, ...rest) {
    if (!bolehHost(host)) {
      catat('dns', host)
      return Promise.reject(galat(host))
    }
    return asliPLookup.call(this, host, ...rest)
  }
}
for (const nama of ['resolve', 'resolve4', 'resolve6', 'resolveAny', 'resolveCname', 'resolveMx', 'resolveTxt', 'resolveSrv']) {
  const asli = dns[nama]
  if (typeof asli !== 'function') continue
  dns[nama] = function (host, ...rest) {
    catat('dns', host)
    const cb = rest.find((x) => typeof x === 'function')
    if (cb) return process.nextTick(() => cb(galat(host)))
    throw galat(host)
  }
}

process.stderr.write(`[WA1-EGRESS] TRAP-AKTIF pid=${process.pid}\n`)
