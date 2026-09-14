// Uji skrip infrastruktur PRD-002 Step 3: pelapor backup & pemanggil job terjadwal.
//
// Jalankan:  node prisma/check-infra-scripts.mjs      (butuh bash, curl, gzip; TANPA DB/dev server)
//            BASH_BIN=/usr/bin/bash node prisma/check-infra-scripts.mjs
//
// Skrip di deploy/scripts/ dijalankan SUNGGUHAN lewat bash, melawan server HTTP
// palsu di proses ini (127.0.0.1, port acak) dan direktori backup sementara di
// folder temp OS. Tidak ada yang menyentuh database, systemd, atau produksi.
// Semua berkas sementara dihapus di akhir, termasuk saat gagal di tengah.

import { spawn } from 'node:child_process'
import http from 'node:http'
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { randomBytes } from 'node:crypto'

const AKAR = fileURLToPath(new URL('..', import.meta.url))
const BASH = process.env.BASH_BIN ?? 'bash'
const LAPOR = join(AKAR, 'deploy', 'scripts', 'pg-backup-report.sh')
const JOBRUN = join(AKAR, 'deploy', 'scripts', 'maritime-job-run.sh')
const posix = (p) => p.replace(/\\/g, '/')
const JAM = 3_600_000

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
const info = (s) => console.log(`     · ${s}`)

// ------------------------------------------------------------ server palsu

const permintaan = []
let balasan = { status: 200, body: '{"ok":true}' }
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  permintaan.push({
    method: req.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    token: req.headers['x-job-token'] ?? null,
  })
  res.writeHead(balasan.status, { 'content-type': 'application/json' })
  res.end(balasan.body)
})

const KERJA = mkdtempSync(join(tmpdir(), 'p2s3-infra-'))
const TOKEN = randomBytes(24).toString('base64url')
const FILE_TOKEN = join(KERJA, 'job-runner-token')
const TMP = join(KERJA, 'tmp')
let BASE = ''
const PORT_MATI = 'http://127.0.0.1:9'

function jalankan(skrip, args, env = {}) {
  return new Promise((resolve) => {
    const anak = spawn(BASH, [posix(skrip), ...args], {
      env: {
        ...process.env,
        CREDENTIALS_DIRECTORY: '',
        TMPDIR: posix(TMP),
        REPORT_RETRY: '0',
        REPORT_MAX_TIME: '5',
        JOB_MAX_TIME: '5',
        ...env,
      },
    })
    let out = ''
    anak.stdout.on('data', (b) => (out += b))
    anak.stderr.on('data', (b) => (out += b))
    const batas = setTimeout(() => anak.kill(), 60_000)
    anak.on('close', (code) => {
      clearTimeout(batas)
      resolve({ code, out })
    })
  })
}

async function panggil(skrip, args, env) {
  const awal = permintaan.length
  const r = await jalankan(skrip, args, env)
  return { ...r, req: permintaan.slice(awal) }
}

let nDir = 0
function dirBaru() {
  const d = join(KERJA, `backup-${++nDir}`)
  mkdirSync(d)
  return d
}

/** Artefak .sql.gz sungguhan; isi acak supaya ukurannya ≈ `bytes` (tak termampatkan). */
function artefak(dir, nama, { umurJam = 1, bytes = 4096, rusak = false } = {}) {
  const p = join(dir, nama)
  writeFileSync(p, rusak ? randomBytes(bytes) : gzipSync(randomBytes(bytes)))
  const detik = (Date.now() - umurJam * JAM) / 1000
  utimesSync(p, detik, detik)
  return p
}

const envLapor = (dir, ekstra = {}) => ({
  BACKUP_DIR: posix(dir),
  BACKUP_GLOB: 'maritime_suite*',
  MAX_AGE_HOURS: '26',
  MIN_BYTES: '1024',
  RETENTION_DAYS: '',
  JOB_BASE_URL: BASE,
  JOB_TOKEN_FILE: posix(FILE_TOKEN),
  ...ekstra,
})
const envJob = (ekstra = {}) => ({ JOB_BASE_URL: BASE, JOB_TOKEN_FILE: posix(FILE_TOKEN), ...ekstra })
const polaLog = (nama) => new RegExp(`^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z \\[${nama}\\]`, 'm')

// ===================================================================== pelapor backup

async function ujiPelaporBackup() {
  console.log('\n[1] Backup sukses + artefak valid → exit 0, laporan berhasil=true')
  balasan = { status: 200, body: '{"job":"backup-status","ok":true}' }
  const d1 = dirBaru()
  artefak(d1, 'maritime_suite-2026-09-13.sql.gz', { umurJam: 25 })
  const terbaru = artefak(d1, 'maritime_suite-2026-09-14.sql.gz', { umurJam: 1, bytes: 8192 })
  artefak(d1, 'galangan-2026-09-14.sql.gz', { umurJam: 0.1, bytes: 16384 }) // pola lain, lebih baru — harus diabaikan
  const r1 = await panggil(LAPOR, ['ok'], envLapor(d1))
  cek('exit 0', r1.code === 0, `exit=${r1.code}`)
  cek('tepat satu laporan terkirim', r1.req.length === 1, `permintaan=${r1.req.length}`)
  cek('POST /api/jobs/run?job=backup-status', r1.req[0]?.method === 'POST' && r1.req[0]?.path === '/api/jobs/run' && r1.req[0]?.query.job === 'backup-status')
  cek('berhasil=true', r1.req[0]?.query.berhasil === 'true', JSON.stringify(r1.req[0]?.query))
  cek('ukuranBytes = ukuran artefak TERBARU yang cocok BACKUP_GLOB', Number(r1.req[0]?.query.ukuranBytes) === statSync(terbaru).size, `${r1.req[0]?.query.ukuranBytes} vs ${statSync(terbaru).size}`)
  cek('token = isi berkas token (tanpa newline)', r1.req[0]?.token === TOKEN)
  cek('token TIDAK tercetak di log', !r1.out.includes(TOKEN))
  cek('log bertimestamp ISO-UTC', polaLog('pg-backup-report').test(r1.out))

  console.log('\n[2] pg-backup.service GAGAL → laporan berhasil=false, exit 0 (laporan terkirim)')
  const r2 = await panggil(LAPOR, ['gagal'], envLapor(dirBaru()))
  cek('exit 0', r2.code === 0, `exit=${r2.code}`)
  cek('berhasil=false', r2.req[0]?.query.berhasil === 'false')
  cek('pesan terisi', (r2.req[0]?.query.pesan ?? '').length > 0, r2.req[0]?.query.pesan)
  cek('log menyebut BACKUP GAGAL', r2.out.includes('BACKUP GAGAL'))

  console.log('\n[3] Hook pelaporan belum dikonfigurasi (token tak ada) → OPSIONAL, bukan kegagalan backup')
  const d3 = dirBaru()
  artefak(d3, 'maritime_suite-a.sql.gz')
  const r3 = await panggil(LAPOR, ['ok'], envLapor(d3, { JOB_TOKEN_FILE: posix(join(KERJA, 'tidak-ada')) }))
  cek('artefak valid + hook tak ada → exit 0', r3.code === 0, `exit=${r3.code}`)
  cek('tak ada permintaan HTTP', r3.req.length === 0)
  cek('log PERINGATAN hook belum dikonfigurasi', r3.out.includes('PERINGATAN hook pelaporan belum dikonfigurasi'))
  const r3b = await panggil(LAPOR, ['ok'], envLapor(dirBaru(), { JOB_TOKEN_FILE: posix(join(KERJA, 'tidak-ada')) }))
  cek('artefak TIDAK ada + hook tak ada → tetap exit 1 (masalah backup tak disembunyikan)', r3b.code === 1, `exit=${r3b.code}`)

  console.log('\n[4] Validasi artefak')
  const kosong = await panggil(LAPOR, ['ok'], envLapor(dirBaru()))
  cek('direktori tanpa artefak → exit 1 + berhasil=false', kosong.code === 1 && kosong.req[0]?.query.berhasil === 'false', `exit=${kosong.code} pesan=${kosong.req[0]?.query.pesan}`)
  const tanpaDir = await panggil(LAPOR, ['ok'], envLapor(join(KERJA, 'dir-tidak-ada')))
  cek('BACKUP_DIR tidak ada → exit 1 + berhasil=false', tanpaDir.code === 1 && tanpaDir.req[0]?.query.berhasil === 'false')
  const dTua = dirBaru()
  artefak(dTua, 'maritime_suite-lama.sql.gz', { umurJam: 30 })
  const tua = await panggil(LAPOR, ['ok'], envLapor(dTua))
  cek('artefak terbaru 30 jam (> 26) → exit 1 + berhasil=false', tua.code === 1 && tua.req[0]?.query.berhasil === 'false', tua.req[0]?.query.pesan)
  const dKecil = dirBaru()
  artefak(dKecil, 'maritime_suite-kecil.sql.gz', { bytes: 8 })
  const kecil = await panggil(LAPOR, ['ok'], envLapor(dKecil))
  cek('artefak < MIN_BYTES → exit 1 + berhasil=false', kecil.code === 1 && kecil.req[0]?.query.berhasil === 'false', kecil.req[0]?.query.pesan)
  const dRusak = dirBaru()
  artefak(dRusak, 'maritime_suite-rusak.sql.gz', { rusak: true })
  const rusak = await panggil(LAPOR, ['ok'], envLapor(dRusak))
  cek('.gz rusak (gzip -t gagal) → exit 1 + berhasil=false', rusak.code === 1 && rusak.req[0]?.query.berhasil === 'false', rusak.req[0]?.query.pesan)
  cek('ukuranBytes=0 saat tidak sehat (kartu tak mengklaim ukuran palsu)', [kosong, tua, kecil, rusak].every((x) => x.req[0]?.query.ukuranBytes === '0'))

  console.log('\n[5] Laporan gagal terkirim → exit 2, backup TIDAK dianggap gagal')
  const d5 = dirBaru()
  artefak(d5, 'maritime_suite-ok.sql.gz')
  balasan = { status: 500, body: '{"error":{"code":"INTERNAL"}}' }
  const r5 = await panggil(LAPOR, ['ok'], envLapor(d5))
  cek('aplikasi membalas 500 → exit 2', r5.code === 2, `exit=${r5.code}`)
  cek('log menjelaskan backup tidak dianggap gagal', r5.out.includes('backup TIDAK dianggap gagal'))
  balasan = { status: 200, body: '{"ok":true}' }
  const r5b = await panggil(LAPOR, ['ok'], envLapor(d5, { JOB_BASE_URL: PORT_MATI }))
  cek('aplikasi tak terjangkau → exit 2', r5b.code === 2, `exit=${r5b.code}`)
  cek('berkas artefak tetap utuh sesudahnya', existsSync(join(d5, 'maritime_suite-ok.sql.gz')))

  console.log('\n[6] Retensi: peringatan saja, TIDAK menghapus')
  const d6 = dirBaru()
  const lama = artefak(d6, 'maritime_suite-sangat-lama.sql.gz', { umurJam: 24 * 10 })
  artefak(d6, 'maritime_suite-baru.sql.gz', { umurJam: 1 })
  const r6 = await panggil(LAPOR, ['ok'], envLapor(d6, { RETENTION_DAYS: '7' }))
  cek('exit 0 (artefak terbaru valid)', r6.code === 0, `exit=${r6.code}`)
  cek('log PERINGATAN retensi', r6.out.includes('PERINGATAN retensi'))
  cek('berkas lama TIDAK dihapus', existsSync(lama))
  const r6b = await panggil(LAPOR, ['ok'], envLapor(d6, { RETENTION_DAYS: '30' }))
  cek('tak ada berkas melewati retensi → tanpa peringatan', r6b.code === 0 && !r6b.out.includes('PERINGATAN retensi'))

  console.log('\n[7] Argumen & kredensial systemd')
  const salah = await panggil(LAPOR, ['entah'], envLapor(dirBaru()))
  cek('argumen tak dikenal → exit 64, tanpa permintaan', salah.code === 64 && salah.req.length === 0, `exit=${salah.code}`)
  const dirKred = join(KERJA, 'cred-lapor')
  mkdirSync(dirKred)
  const tokenKred = randomBytes(20).toString('base64url')
  writeFileSync(join(dirKred, 'job-token'), tokenKred)
  const d7 = dirBaru()
  artefak(d7, 'maritime_suite-k.sql.gz')
  const r7 = await panggil(LAPOR, ['ok'], envLapor(d7, { CREDENTIALS_DIRECTORY: posix(dirKred), JOB_TOKEN_FILE: posix(join(KERJA, 'tidak-ada')) }))
  cek('$CREDENTIALS_DIRECTORY/job-token dipakai lebih dulu (LoadCredential)', r7.code === 0 && r7.req[0]?.token === tokenKred, `exit=${r7.code}`)
}

// ============================================================ pemanggil job terjadwal

async function ujiPemanggilJob() {
  console.log('\n[8] maritime-job-run: ok:true → exit 0')
  balasan = { status: 200, body: '{"job":"reminders","ok":true,"total":{"dibuat":3,"dilewati":1,"dibatasi":0,"gagal":0},"hasil":[]}' }
  const r8 = await panggil(JOBRUN, ['reminders'], envJob())
  cek('exit 0', r8.code === 0, `exit=${r8.code} ${r8.out.trim()}`)
  cek('POST /api/jobs/run?job=reminders', r8.req[0]?.method === 'POST' && r8.req[0]?.path === '/api/jobs/run' && r8.req[0]?.query.job === 'reminders')
  cek('token dari berkas', r8.req[0]?.token === TOKEN)
  cek('token TIDAK tercetak di log', !r8.out.includes(TOKEN))
  cek('log memuat total & timestamp', r8.out.includes('"dibuat":3') && polaLog('maritime-job-run').test(r8.out))

  console.log('\n[9] maritime-job-run: kegagalan terlihat sebagai exit ≠ 0')
  balasan = { status: 200, body: '{"job":"reminders","ok":false,"total":{"dibuat":0,"dilewati":0,"dibatasi":0,"gagal":2},"hasil":[]}' }
  const sebagian = await panggil(JOBRUN, ['reminders'], envJob())
  cek('HTTP 200 tapi ok:false → exit 1', sebagian.code === 1 && sebagian.out.includes('GAGAL SEBAGIAN'), `exit=${sebagian.code}`)
  balasan = { status: 401, body: '{"error":{"code":"UNAUTHORIZED"}}' }
  const r401 = await panggil(JOBRUN, ['reminders'], envJob())
  cek('HTTP 401 → exit 1', r401.code === 1, `exit=${r401.code}`)
  balasan = { status: 500, body: '{"error":{"code":"INTERNAL"}}' }
  const r500 = await panggil(JOBRUN, ['reminders'], envJob())
  cek('HTTP 500 → exit 1', r500.code === 1, `exit=${r500.code}`)
  const mati = await panggil(JOBRUN, ['reminders'], envJob({ JOB_BASE_URL: PORT_MATI }))
  cek('aplikasi tak terjangkau → exit 75', mati.code === 75, `exit=${mati.code}`)
  const tanpaToken = await panggil(JOBRUN, ['reminders'], envJob({ JOB_TOKEN_FILE: posix(join(KERJA, 'tidak-ada')) }))
  cek('token tak terbaca → exit 78, tanpa permintaan', tanpaToken.code === 78 && tanpaToken.req.length === 0, `exit=${tanpaToken.code}`)

  console.log('\n[10] maritime-job-run: argumen & kredensial systemd')
  const jahat = await panggil(JOBRUN, ['reminders;rm'], envJob())
  cek('nama job tak sah → exit 64, tanpa permintaan', jahat.code === 64 && jahat.req.length === 0, `exit=${jahat.code}`)
  const kosong = await panggil(JOBRUN, [], envJob())
  cek('tanpa argumen → exit 64', kosong.code === 64, `exit=${kosong.code}`)
  balasan = { status: 200, body: '{"job":"reminders","ok":true,"total":{"dibuat":0,"dilewati":0,"dibatasi":0,"gagal":0},"hasil":[]}' }
  const dirKred = join(KERJA, 'cred-job')
  mkdirSync(dirKred)
  const tokenKred = randomBytes(20).toString('base64url')
  writeFileSync(join(dirKred, 'job-token'), `${tokenKred}\r\n`)
  const kred = await panggil(JOBRUN, ['reminders'], envJob({ CREDENTIALS_DIRECTORY: posix(dirKred), JOB_TOKEN_FILE: posix(join(KERJA, 'tidak-ada')) }))
  cek('$CREDENTIALS_DIRECTORY/job-token dipakai & CRLF dibuang', kred.code === 0 && kred.req[0]?.token === tokenKred, `exit=${kred.code}`)
}

// ------------------------------------------------------------------------ main

async function main() {
  mkdirSync(TMP)
  writeFileSync(FILE_TOKEN, `${TOKEN}\n`)
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  BASE = `http://127.0.0.1:${server.address().port}`
  console.log(`Uji skrip infrastruktur PRD-002 Step 3 — bash=${BASH}, server palsu ${BASE}`)
  const opsi = await jalankan(JOBRUN, ['--help'], { JOB_BASE_URL: BASE, JOB_TOKEN_FILE: posix(FILE_TOKEN) })
  cek('sanity: bash menjalankan skrip; nama job berawalan "-" ditolak → exit 64', opsi.code === 64, `exit=${opsi.code}`)

  try {
    await ujiPelaporBackup()
    await ujiPemanggilJob()
  } finally {
    server.close()
    rmSync(KERJA, { recursive: true, force: true })
    cek('berkas sementara dibersihkan', !existsSync(KERJA))
  }

  console.log(`\n${gagal === 0 ? '✅ SEMUA LULUS' : '❌ ADA YANG GAGAL'} — lulus ${lulus}, gagal ${gagal}`)
  if (gagal > 0) process.exitCode = 1
}

main().catch((e) => {
  console.error('\n💥', e)
  process.exitCode = 1
  server.close()
})
