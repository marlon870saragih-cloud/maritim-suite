// Uji HTTP WA-2a 2a-G — MODE PRODUKSI LOKAL: `next build` + `next start` (NODE_ENV=production) dengan flag
// WA2_CLIENT_FOUNDATION_ENABLED=true SENGAJA dinyalakan. Gerbang WA-2a wajib tetap menolak SEMUA 11 endpoint
// dengan 403 WA2_ENV_NOT_ALLOWED — sebelum CSRF/Content-Type/ukuran/JSON diperiksa — dan DB tidak berubah.
//
//   npx next build   (env yang sama; PORTAL_DATABASE_URL & DATABASE_URL = DB uji loopback)
//   DATABASE_URL=$U DIRECT_URL=$U NEXTAUTH_URL=http://localhost:3300 NEXTAUTH_SECRET=<acak> NEXT_TELEMETRY_DISABLED=1 \
//   AUTOMATION_MONITORING_ENABLED=true AUTOMATION_TENANT_IDS=wa2gprodtenantaaaaaa01 WA2_CLIENT_FOUNDATION_ENABLED=true \
//   NODE_OPTIONS="--import $PWD/prisma/wa1-egress-trap.mjs" npx next start -H 127.0.0.1 -p 3300 > server-prod.log 2>&1
//   WA2G_PROD_DB_URL=$U WA2G_PROD_BASE_URL=http://127.0.0.1:3300 WA2G_PROD_SERVER_LOG=server-prod.log node prisma/check-wa2a-g-prod.mjs
//
// Proses UJI ini sendiri non-produksi (fixture dibuat lewat service F3/F4 dengan NODE_ENV=test); hanya SERVER yang
// produksi. Tanpa WA2G_PROD_DB_URL / WA2G_PROD_BASE_URL → DILEWATI (kode 3). DB & server WAJIB loopback.

import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = fileURLToPath(new URL('..', import.meta.url))
let lulus = 0
let gagal = 0
function cek(nama, kondisi, detail = '') {
  if (kondisi) {
    lulus++
    console.log(`  ✅ ${nama}${detail ? ` — ${detail}` : ''}`)
  } else {
    gagal++
    console.log(`  ❌ ${nama}${detail ? ` — ${detail}` : ''}`)
  }
}
const bagian = (j) => console.log(`\n${j}`)

const URL_DB = process.env.WA2G_PROD_DB_URL
const BASE = process.env.WA2G_PROD_BASE_URL
const LOG = process.env.WA2G_PROD_SERVER_LOG
if (!URL_DB || !BASE) {
  console.log('DILEWATI — WA2G_PROD_DB_URL dan WA2G_PROD_BASE_URL wajib diset (DB & next start loopback).')
  process.exit(3)
}
const LOOPBACK = ['127.0.0.1', 'localhost', '::1', '[::1]']
const tolak = []
for (const [n, v] of [['WA2G_PROD_DB_URL', URL_DB], ['WA2G_PROD_BASE_URL', BASE]]) {
  try {
    const u = new URL(v)
    if (!LOOPBACK.includes(u.hostname)) tolak.push(`${n} bukan loopback`)
    if ([...u.searchParams.keys()].some((k) => k.toLowerCase() === 'host')) tolak.push(`${n} memuat parameter host`)
  } catch {
    tolak.push(`${n} tak terurai`)
  }
}
if ((process.env.NODE_ENV ?? '').trim().toLowerCase() === 'production') tolak.push('NODE_ENV=production di proses uji')
for (const n of ['DATABASE_URL', 'DIRECT_URL']) if (process.env[n] && process.env[n] !== URL_DB) tolak.push(`${n} menunjuk DB lain (ambigu)`)
if (tolak.length) {
  console.log(`❌ DITOLAK (DB/server tidak disentuh): ${tolak.join(' | ')}`)
  process.exit(1)
}
const ASAL = process.env.WA2G_PROD_APP_ORIGIN ?? new URL(BASE).origin.replace('127.0.0.1', 'localhost')
process.env.DATABASE_URL = URL_DB
process.env.DIRECT_URL = URL_DB
process.env.NODE_ENV = 'test'
process.env.WA2_CLIENT_FOUNDATION_ENABLED = 'true'
process.env.AUTOMATION_MONITORING_ENABLED = 'true'
delete process.env.WA1_INTERNAL_FAKE_TEST_ENABLED

const fetchAsli = globalThis.fetch
const egressUji = []
globalThis.fetch = (url, init) => {
  const u = new URL(typeof url === 'string' ? url : url.url)
  if (u.origin !== new URL(BASE).origin) {
    egressUji.push(u.host)
    throw new Error(`EGRESS_DILARANG_DALAM_UJI:${u.host}`)
  }
  return fetchAsli(url, init)
}

const require = createRequire(import.meta.url)
const jiti = require('jiti')(fileURLToPath(import.meta.url), { alias: { '@': join(AKAR, 'src') }, interopDefault: true })
const KT = jiti('../src/services/whatsapp/wa-contact.service.ts')
const CS = jiti('../src/services/whatsapp/wa-consent.service.ts')
const GS = jiti('../src/services/whatsapp/wa-grant.service.ts')
const KJ = jiti('../src/services/whatsapp/wa-schedule-confirmation.service.ts')
const MS = jiti('../src/services/whatsapp/wa-message.service.ts')
const AP = jiti('../src/services/whatsapp/wa-message-approval.service.ts')
const { PrismaClient } = await import('@prisma/client')
const bcrypt = (await import('bcryptjs')).default
const adm = new PrismaClient({ datasources: { db: { url: URL_DB } } })

const ID_A = 'wa2gprodtenantaaaaaa01'
process.env.AUTOMATION_TENANT_IDS = ID_A
const TAG = 'WA2GP-'
const SANDI = 'UjiWa2gProd!2026'
const JAM = 3_600_000
const BUKTI = 'Dokumen penunjukan resmi & konfirmasi telepon ke kantor pihak (uji sintetis).'
const POLA_NOMOR = /\+?62996\d{8}/

function buatSesi() {
  const jar = new Map()
  const simpan = (res) => {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pasangan] = c.split(';')
      const i = pasangan.indexOf('=')
      if (i > 0) jar.set(pasangan.slice(0, i).trim(), pasangan.slice(i + 1).trim())
    }
  }
  const header = () => Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ')
  return {
    async ambil(path, init = {}) {
      const res = await fetch(`${BASE}${path}`, { ...init, redirect: 'manual', headers: { ...(init.headers ?? {}), cookie: header() } })
      simpan(res)
      return res
    },
    punya: () => jar.has('next-auth.session-token') || jar.has('__Secure-next-auth.session-token'),
  }
}
async function login(email) {
  const s = buatSesi()
  const { csrfToken } = await (await s.ambil('/api/auth/csrf')).json()
  await s.ambil('/api/auth/callback/credentials', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken, email, password: SANDI, json: 'true' }).toString(),
  })
  if (!s.punya()) throw new Error(`login gagal untuk ${email}`)
  return s
}
const P = '/api/automation/client-messages'
const rekaman = []
async function api(sesi, metode, path, body, headers = {}) {
  const mentah = typeof body === 'string'
  const dasar = { origin: ASAL, ...(metode === 'POST' ? { 'content-type': 'application/json' } : {}) }
  const gabung = Object.fromEntries(Object.entries({ ...dasar, ...headers }).filter(([, v]) => v !== null))
  const init = { method: metode, headers: gabung, body: body === undefined ? undefined : mentah ? body : JSON.stringify(body) }
  const res = sesi ? await sesi.ambil(path, init) : await fetch(`${BASE}${path}`, { ...init, redirect: 'manual' })
  const teks = await res.text()
  let json = null
  try {
    json = JSON.parse(teks)
  } catch {
    /* bukan JSON */
  }
  rekaman.push({ path: `${metode} ${path}`, teks })
  return { status: res.status, json, teks }
}
const ditolakProduksi = (r) => r.status === 403 && r.json?.error?.code === 'FORBIDDEN' && /WA2_ENV_NOT_ALLOWED/.test(r.json.error.message) && r.json.ok === undefined
const ringkas = (r) => `${r.status} ${r.json?.hasil ?? r.json?.error?.code ?? ''} ${r.json?.error?.message ?? ''}`.trim()

async function bersihkan() {
  await adm.tahApprovalRequest.deleteMany({ where: { tenantId: ID_A } })
  await adm.auditLog.deleteMany({ where: { tenantId: ID_A } })
  await adm.tenant.deleteMany({ where: { id: ID_A } })
}
async function potret() {
  const where = { tenantId: ID_A }
  const [m, a, au, k, cs, kf, sg] = await Promise.all([
    adm.waClientMessage.findMany({ where, select: { id: true, state: true, version: true, updatedAt: true, approvalRequestId: true }, orderBy: { id: 'asc' } }),
    adm.tahApprovalRequest.findMany({ where, select: { id: true, status: true, executionStatus: true, version: true }, orderBy: { id: 'asc' } }),
    adm.auditLog.count({ where }),
    adm.waContact.findMany({ where, select: { id: true, version: true }, orderBy: { id: 'asc' } }),
    adm.waConsentState.findMany({ where, select: { id: true, version: true }, orderBy: { id: 'asc' } }),
    adm.voyageScheduleConfirmation.count({ where }),
    adm.monitoringSignal.count({ where }),
  ])
  return JSON.stringify({ m, a, au, k, cs, kf, sg })
}

try {
  await bersihkan()
  // ------------------------------------------------------------ fixture (proses uji non-produksi)
  const t = await adm.tenant.create({ data: { id: ID_A, companyName: `${TAG}A`, trialEndsAt: new Date(Date.now() + 30 * 24 * JAM) } })
  const C1 = await adm.customer.create({ data: { tenantId: t.id, name: `${TAG}Customer 1` } })
  const P1 = await adm.principal.create({ data: { tenantId: t.id, name: `${TAG}Principal 1` } })
  const kapal = await adm.vessel.create({ data: { tenantId: t.id, name: 'MV CONTOH SINTETIS' } })
  const port = await adm.port.create({ data: { tenantId: t.id, name: 'Balikpapan', timezone: 'Asia/Makassar' } })
  const hash = await bcrypt.hash(SANDI, 10)
  const ctx = {}
  const email = {}
  for (const [p, role] of [['maker', 'ADMIN'], ['manajer', 'MANAJER_OPERASI'], ['admin2', 'ADMIN'], ['checker', 'MANAJER_OPERASI']]) {
    email[p] = `wa2gp-${p}@uji.local`
    const u = await adm.user.create({ data: { tenantId: t.id, email: email[p], name: `${TAG}${p}`, password: hash, role, isActive: true } })
    ctx[p] = { tenantId: t.id, userId: u.id, role }
  }
  const v = await adm.voyage.create({ data: { tenantId: t.id, vesselId: kapal.id, portId: port.id, voyageNumber: `${TAG}VYG-1`, dataOrigin: 'NYATA', status: 'CONFIRMED', customerId: C1.id, principalId: P1.id, eta: new Date('2026-10-15T00:00:00Z'), etd: new Date('2026-10-17T00:00:00Z') } })
  const au = await adm.auditLog.create({ data: { tenantId: t.id, tableName: 'Voyage', recordId: v.id, action: 'UPDATE', oldValue: { peristiwa: 'UBAH_TANGGAL', eta: '2026-10-13' }, newValue: { peristiwa: 'UBAH_TANGGAL', medan: ['eta'], eta: '2026-10-15' }, createdAt: new Date(Date.now() - JAM) } })
  const s = await adm.monitoringSignal.create({ data: { tenantId: t.id, voyageId: v.id, kind: 'ETA_CHANGED', severity: 'INFO', dedupeKey: `${TAG}sig-1`, sourceType: 'AUDIT_LOG', sourceRef: au.id, explanation: 'uji', recommendation: 'uji', after: { eta: '2026-10-15' } } })
  await KJ.catatKonfirmasiJadwal(ctx.manajer, v.id, { field: 'eta', nilai: '2026-10-15', sourceKind: 'MASTER_OR_SHIP', sourceNote: 'Noon report kapal (uji sintetis).' })
  const kontak = async () => {
    const r = await KT.buatKontak(ctx.maker, { partyType: 'CUSTOMER', partyId: C1.id, nomor: `+62996${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`, displayName: 'PIC uji', language: 'ID' })
    await KT.verifikasiKontak(ctx.maker, r.contactId, { metode: 'DOCUMENT', bukti: BUKTI, berlakuSampai: GS.tambahBulan(new Date(), 6) })
    await CS.catatOptIn(ctx.maker, r.contactId, { kanal: 'EMAIL', bukti: BUKTI })
    return r.contactId
  }
  const cid = await kontak()
  const cid2 = await kontak()
  const d = await MS.buatDraftPesanKlien(ctx.maker, { signalId: s.id, contactId: cid })
  await MS.pratinjauPesanKlien(ctx.admin2, { messageId: d.messageId, snapshotFingerprint: d.snapshotFingerprint })
  const rq = await AP.mintaApprovalPesanKlien(ctx.admin2, { messageId: d.messageId, snapshotFingerprint: d.snapshotFingerprint })
  const mid = d.messageId
  const fp = d.snapshotFingerprint
  const aid = rq.approvalRequestId
  const sesiCk = await login(email.checker)
  const sesiMk = await login(email.maker)
  const awal = await potret()

  bagian('[PROD] next start (NODE_ENV=production) + flag WA-2 true → semua endpoint ditolak WA2_ENV_NOT_ALLOWED')
  const ep = [
    ['GET', P],
    ['POST', P, { signalId: s.id, contactId: cid2 }],
    ['GET', `${P}/candidates/signals`],
    ['GET', `${P}/candidates/contacts?signalId=${s.id}`],
    ['GET', `${P}/${mid}`],
    ['GET', `${P}/${mid}/history`],
    ['POST', `${P}/${mid}/preview`, { snapshotFingerprint: fp }],
    ['POST', `${P}/${mid}/request-approval`, { snapshotFingerprint: fp }],
    ['POST', `${P}/${mid}/cancel`, { alasan: 'Dibatalkan staf (uji).' }],
    ['POST', `${P}/approvals/${aid}/approve`, { proposalHash: fp }],
    ['POST', `${P}/approvals/${aid}/reject`, { proposalHash: fp, decisionNote: 'Isi tidak sesuai (uji).' }],
  ]
  const label = (p) => p.replace(mid, ':id').replace(aid, ':aid').replace(/\?.*/, '')
  for (const [m, path, body] of ep) {
    const r = await api(sesiCk, m, path, body)
    cek(`${m} ${label(path)} (checker sah, body sah) → 403 WA2_ENV_NOT_ALLOWED`, ditolakProduksi(r), ringkas(r))
  }
  const RUSAK = [
    ['tanpa Origin', (b) => [b, { origin: null }]],
    ['Origin asing', (b) => [b, { origin: 'http://evil.example' }]],
    ['Sec-Fetch-Site cross-site', (b) => [b, { 'sec-fetch-site': 'cross-site' }]],
    ['Content-Type text/plain', (b) => [JSON.stringify(b), { 'content-type': 'text/plain' }]],
    ['tanpa Content-Type', (b) => [JSON.stringify(b), { 'content-type': null }]],
    ['body > 16 KiB', (b) => [JSON.stringify({ ...b, x: 'a'.repeat(20_000) }), {}]],
    ['JSON rusak', () => ['{"x":', {}]],
    ['body array', () => [JSON.stringify([1, 2]), {}]],
  ]
  let lolosRusak = 0
  const gagalRusak = []
  for (const [m, path, body] of ep.filter(([m]) => m === 'POST')) {
    for (const [n, f] of RUSAK) {
      const [b, h] = f(body)
      const r = await api(sesiMk, m, path, b, h)
      if (ditolakProduksi(r)) lolosRusak++
      else gagalRusak.push(`${label(path)} ${n}: ${ringkas(r)}`)
    }
  }
  const nPost = ep.filter(([m]) => m === 'POST').length
  cek(`${nPost} POST × ${RUSAK.length} variasi CSRF/body rusak → SEMUA 403 WA2_ENV_NOT_ALLOWED (gerbang sebelum CSRF/body)`, nPost === 6 && gagalRusak.length === 0 && lolosRusak === nPost * RUSAK.length, gagalRusak.slice(0, 3).join(' | ') || `${lolosRusak} permintaan`)
  cek('produksi: tanpa sesi → 401 (pagar sesi tetap di depan)', (await api(null, 'GET', P)).status === 401)
  cek('DB TIDAK berubah (pesan, approval, audit, kontak, consent, konfirmasi, sinyal) setelah semua permintaan', (await potret()) === awal)
  const mAkhir = await adm.waClientMessage.findFirst({ where: { id: mid } })
  cek('pesan fixture tetap PENDING_APPROVAL, successKey kosong', mAkhir.state === 'PENDING_APPROVAL' && mAkhir.successKey === null)
  cek(`${rekaman.length} respons: tanpa nomor utuh, tanpa ok:true`, !rekaman.some((r) => POLA_NOMOR.test(r.teks) || /"ok":true/.test(r.teks)))
  cek('proses uji: 0 egress ke luar server loopback', egressUji.length === 0, egressUji.join(','))
  if (LOG && existsSync(LOG)) {
    const log = readFileSync(LOG, 'utf8')
    cek('log server produksi: perangkap egress AKTIF', /\[WA1-EGRESS\] TRAP-AKTIF/.test(log))
    const blok = log.split('\n').filter((l) => l.includes('[WA1-EGRESS] BLOCKED'))
    cek('log server produksi: 0 upaya koneksi keluar', blok.length === 0, blok.slice(0, 3).join(' | '))
    cek('log server produksi: tanpa nomor utuh', !POLA_NOMOR.test(log))
  } else {
    cek('log server tersedia untuk diperiksa (WA2G_PROD_SERVER_LOG)', false, 'tidak diset/tidak ada')
  }
} catch (e) {
  gagal++
  console.log(`  ❌ PENGECUALIAN TAK TERDUGA: ${e?.stack ?? e}`)
} finally {
  await bersihkan().catch((e) => console.log(`  ⚠️  pembersihan gagal: ${e?.message}`))
  await adm.$disconnect()
}

console.log(`\n${gagal === 0 ? '✅ SEMUA LULUS' : '❌ ADA YANG GAGAL'} — lulus ${lulus}, gagal ${gagal}`)
process.exit(gagal === 0 ? 0 : 1)
