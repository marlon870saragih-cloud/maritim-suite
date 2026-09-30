// Uji integrasi OPSIONAL — G8 Eval-3 (CONTROLLED EVALUATION LEDGER E2E) terhadap PostgreSQL LOOPBACK terisolasi.
// PRD-005 E5 Step 14B. TANPA AI, TANPA jaringan: transport = stub deterministik; 0 panggilan model.
//
// Jalankan (HANYA dengan DB sekali pakai di 127.0.0.1/localhost):
//   EVAL3_LEDGER_DB_URL=postgresql://postgres@127.0.0.1:55432/maritime_suite \
//   env -u SPIKE_OPENROUTER_API_KEY node prisma/check-eval3-ledger-db.mjs
// Tanpa EVAL3_LEDGER_DB_URL → DILEWATI (kode 3). BUKAN bagian regresi normal (tak butuh PostgreSQL).
//
// Membuktikan dengan layanan buku besar TAH & submitIntake produksi yang NYATA di DB loopback:
//   A. jalur ledger evaluasi terkendali SUKSES (AgentRun + AgentModelCall tertaut, Sonnet 5 requested = served,
//      identitas Prompt v3, audit CREATE/UPDATE);
//   B. submitIntake produksi MENOLAK Sonnet 5 (MODEL_TIDAK_TERVERIFIKASI, 0 panggilan, 0 baris);
//   + probe gagal-tertutup, sentinel bersih, pembersihan, dan NOL SISA (diperiksa ulang secara independen).

import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = fileURLToPath(new URL('..', import.meta.url))
let lulus = 0
let gagal = 0
function cek(nama, kondisi, detail = '') {
  if (kondisi) lulus++
  else gagal++
  console.log(`  ${kondisi ? '✅' : '❌'} ${nama}${detail ? ` — ${detail}` : ''}`)
}

const URL_DB = process.env.EVAL3_LEDGER_DB_URL
if (!URL_DB) {
  console.log('DILEWATI — EVAL3_LEDGER_DB_URL tidak diset (uji opsional; butuh PostgreSQL loopback sekali pakai).')
  process.exit(3)
}
const tolak = []
if (process.env.OPENROUTER_API_KEY) tolak.push('OPENROUTER_API_KEY terset')
if (process.env.SPIKE_OPENROUTER_API_KEY) tolak.push('SPIKE_OPENROUTER_API_KEY terset (jalankan dengan env -u)')
if (process.env.SPIKE_AUTHORIZED) tolak.push('SPIKE_AUTHORIZED terset')
if ([process.env.NODE_ENV, process.env.VERCEL_ENV].includes('production')) tolak.push('lingkungan produksi')
for (const n of ['DATABASE_URL', 'DIRECT_URL']) if (process.env[n] && process.env[n] !== URL_DB) tolak.push(`${n} menunjuk DB lain`)

const R = await import('./spike-eval3-runner.mjs')
const d = R.uraiDbLoopback(URL_DB)
if (!d.ok) tolak.push(`DB bukan loopback 127.0.0.1/localhost (${d.alasan})`)
if (tolak.length) {
  console.log(`❌ DITOLAK (0 panggilan, DB tidak disentuh): ${tolak.join(' | ')}`)
  process.exit(1)
}

let panggilanJaringan = 0
globalThis.fetch = async () => {
  panggilanJaringan++
  throw new Error('JARINGAN_DILARANG_DALAM_UJI')
}
const H = await import('./spike-eval1.mjs')
const S5 = H.MODEL_S5
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !['SPIKE_OPENROUTER_API_KEY', 'EVAL3_LEDGER_DB_URL'].includes(k)))
env.SPIKE_DATABASE_URL = URL_DB

console.log(`\nG8 Eval-3 — DB loopback ${d.host}:${d.port}/${d.database} — transport STUB`)
const l = await R.jalankanRunnerEval3({ mode: 'offline', env, hariIni: new Date('2026-09-26T00:00:00Z'), g12Uji: true })
const b = l.ledger.bukti
const g8 = l.ledger.g8

cek('runner offline (stub), 0 panggilan nyata, 0 fetch jaringan', l.transport === 'STUB' && l.panggilanNyata === 0 && panggilanJaringan === 0 && l.label === R.LABEL_DRY)
cek('buku besar dijalankan pada DB LOOPBACK nyata (identitas server diverifikasi)', l.ledger.status === 'DIJALANKAN' && l.ledger.sumber === 'DB_LOOPBACK' && b?.db?.cocok === true && b.db.port === d.port && b.db.database === d.database, JSON.stringify(b?.db ?? l.ledger.galat))
if (!b) {
  console.log(`\n❌ ${lulus} lulus, ${gagal + 1} gagal (buku besar tidak berjalan)`)
  process.exit(1)
}
cek('B. submitIntake PRODUKSI menolak Sonnet 5: MODEL_TIDAK_TERVERIFIKASI, 0 panggilan penyedia, 0 baris', b.penolakanProduksi.kode === 'MODEL_TIDAK_TERVERIFIKASI' && b.penolakanProduksi.panggilanPenyedia === 0 && b.penolakanProduksi.percobaanDitolak === 0 && b.penolakanProduksi.barisIntake === 0 && b.penolakanProduksi.barisRun === 0 && g8.penolakanProduksiS5Ok === true)
cek('A. jalur ledger evaluasi terkendali: 2 slot (H07, H22) OK', b.slot.length === 2 && b.slot.map((s) => s.kasus).join() === 'H07,H22' && b.slot.every((s) => s.status === 'OK'))
cek('A. AgentRun + 1 AgentModelCall tertaut per slot; audit CREATE+UPDATE; hasil NO_PROPOSAL', b.slot.every((s) => s.cek.tautanPanggilan && s.cek.satuPanggilan && s.cek.audit && s.cek.hasilCocok && s.cek.statusSucceeded))
cek('A. requested = served = Sonnet 5 PERSIS', b.slot.every((s) => s.modelCall.length === 1 && s.modelCall[0].requestedModel === S5 && s.modelCall[0].servedModel === S5))
cek('A. identitas Prompt v3 tercatat (versi 3, skema 3, hash cocok)', b.slot.every((s) => s.modelCall[0].promptVersion === '3' && s.modelCall[0].schemaVersion === '3' && s.modelCall[0].promptHashCocok))
cek('probe gagal-tertutup produksi: INSERT AgentRun ditolak → melempar, 0 panggilan, 0 baris', b.probeGagalTertutup.ok === true && b.probeGagalTertutup.panggilanPenyedia === 0)
cek('sentinel/privasi baris buku besar bersih', b.sentinelBersih === true && b.temuanPrivasiLedger.length === 0)
cek('pembersihan runner: sisa 0', b.pembersihan?.bersih === true && b.pembersihan.sisaBaris === 0)
cek('G8 lulus dengan ambang beku; label CONTROLLED_EVALUATION_LEDGER_E2E; klaim bukan persetujuan produksi', l.gerbang.G8.lulus === true && g8.jenis === 'CONTROLLED_EVALUATION_LEDGER_E2E' && /BUKAN persetujuan produksi/.test(g8.klaim) && l.semantikG8.bukanPersetujuanProduksiS5 === true)
cek('laporan lulus pemindai privasi', l.privasi.lulus === true, l.privasi.temuan.join(','))

// Pemeriksaan sisa INDEPENDEN (klien Prisma sendiri).
process.env.DATABASE_URL = URL_DB
const require = createRequire(import.meta.url)
const jiti = require('jiti')(fileURLToPath(import.meta.url), { alias: { '@': join(AKAR, 'src') }, interopDefault: true })
const { prisma } = jiti(join(AKAR, 'src/lib/prisma.ts'))
try {
  const [x] = await prisma.$queryRawUnsafe(`SELECT
    (SELECT count(*)::int FROM "Tenant" WHERE id LIKE 'e5eval3%') AS tenant,
    (SELECT count(*)::int FROM "AgentRun" WHERE "tenantId" LIKE 'e5eval3%') AS run,
    (SELECT count(*)::int FROM "AgentModelCall" WHERE "tenantId" LIKE 'e5eval3%') AS mc,
    (SELECT count(*)::int FROM "AuditLog" WHERE "tenantId" LIKE 'e5eval3%') AS audit,
    (SELECT count(*)::int FROM "VesselCallIntake" WHERE "tenantId" LIKE 'e5eval3%') AS intake,
    (SELECT count(*)::int FROM "User" WHERE email LIKE 'e5-eval3-%') AS pengguna,
    (SELECT count(*)::int FROM pg_trigger WHERE tgname LIKE 'e5_eval3_%') AS pemicu,
    (SELECT count(*)::int FROM pg_proc WHERE proname LIKE 'e5_eval3_%') AS fungsi`)
  const total = Object.values(x).reduce((a, v) => a + Number(v), 0)
  cek('sisa INDEPENDEN = 0 (Tenant, User, AgentRun, AgentModelCall, AuditLog, VesselCallIntake, pemicu, fungsi)', total === 0, JSON.stringify(x))
} finally {
  await prisma.$disconnect().catch(() => {})
  delete process.env.DATABASE_URL
}
cek('0 panggilan jaringan selama seluruh uji', panggilanJaringan === 0)

console.log(`\n${gagal === 0 ? '✅' : '❌'} ${lulus} lulus, ${gagal} gagal`)
process.exit(gagal === 0 ? 0 : 1)
