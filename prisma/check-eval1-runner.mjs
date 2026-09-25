// Uji LURING runner Eval-1 (PRD-005 Step 3C, tahap E3B). NOL panggilan penyedia sungguhan.
//
// Jalankan:  node prisma/check-eval1-runner.mjs
//            [TEST_SPIKE_DATABASE_URL=postgresql://…@127.0.0.1:…/…]  → juga uji eksekutor LEDGER_E2E
//                                                                 di DB LOKAL sekali pakai
//
// Setiap respons penyedia berasal dari stub/test-double deterministik (fixture GT beku atau
// korupsinya) — label laporan selalu DRY_RUN / NON-LIVE. fetch global & http/https/tls diganti
// jebakan SEBELUM modul apa pun dimuat: percobaan keluar apa pun = gagal & dihitung.
//
// Bagian:
//   A. CLI & argumen (mode eksplisit, jalur laporan)      D. kesetaraan dengan harness E2 (jalankanEval1)
//   B. prasyarat / gerbang otorisasi                       E. mode LANGSUNG lewat test-double (tukar kunci)
//   C. alur penuh luring (tanpa DB)                        F. jalur gagal-tertutup
//   G. LEDGER_E2E di DB lokal (opsional)
//   H. CLI proses anak; Z. invarian

import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, symlinkSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

let jebakan = 0
globalThis.fetch = async () => {
  jebakan++
  throw new Error('UJI_JARINGAN_NYATA_DILARANG')
}
{
  const req = createRequire(import.meta.url)
  for (const m of ['node:http', 'node:https', 'node:tls']) {
    const mod = req(m)
    for (const f of ['request', 'get', 'connect']) {
      if (typeof mod[f] === 'function') {
        mod[f] = () => {
          jebakan++
          throw new Error(`UJI_JARINGAN_NYATA_DILARANG ${m}`)
        }
      }
    }
  }
}

const R = await import('./spike-eval1-runner.mjs')
const H = await import('./spike-eval1.mjs')
const F = await import('./fixtures/spike-intake/eval1-cases.mjs')

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
const bagian = (t) => console.log(`\n── ${t}`)

const HARI = new Date(Date.UTC(2026, 8, 25))
const kasus = F.bangunKasusEval1(HARI)
const TMP = mkdtempSync(join(tmpdir(), 'eval1-runner-uji-'))
const KUNCI_DUMMY = 'sk-or-v1-DUMMY-e3b-bukan-kunci-asli-000000'
const DB_UJI = process.env.TEST_SPIKE_DATABASE_URL ?? null
const shaAwal = H.shaBerkas(readFileSync(H.BERKAS_FIXTURE))
const shaHarnessE2 = H.shaBerkas(readFileSync(join(AKAR, 'prisma/spike-eval1.mjs')))
const shaPenilaiE2 = H.shaBerkas(readFileSync(join(AKAR, 'prisma/spike-eval1-scorer.mjs')))
const LENGKAP = (db = 'postgresql://u@127.0.0.1:5432/spike') => ({ SPIKE_AUTHORIZED: H.FRASA_OTORISASI_EVAL1, SPIKE_OPENROUTER_API_KEY: KUNCI_DUMMY, SPIKE_DATABASE_URL: db })
const sempurna = (k) => R.keluaranFixtureDariGt(k)
const diam = { log: () => {} }

// ============================================================ A. CLI & argumen
bagian('A. CLI & argumen')
{
  const u = R.uraiArgumen
  cek('A1 tanpa --mode → MODE_WAJIB_EKSPLISIT (tak ada mode bawaan)', u(['--report', '/tmp/x.json']).galat.some((g) => g.startsWith('MODE_WAJIB_EKSPLISIT')) && u(['--report', '/tmp/x.json']).mode === null)
  cek('A2 mode tak sah (LIVE/prod) → ditolak', u(['--mode', 'LIVE', '--report', '/tmp/x']).galat.some((g) => g.startsWith('MODE_TIDAK_SAH')) && u(['--mode=prod', '--report=/tmp/x']).galat.some((g) => g.startsWith('MODE_TIDAK_SAH')))
  cek('A3 flag lama --live → ditolak (tak ambigu)', u(['--live', '--mode', 'offline', '--report', '/tmp/x']).galat.some((g) => g.startsWith('FLAG_LIVE_LAMA_DITOLAK')))
  cek('A4 --mode ganda berbeda → MODE_GANDA', u(['--mode', 'offline', '--mode', 'live', '--report', '/tmp/x']).galat.includes('MODE_GANDA'))
  cek('A5 tanpa --report → REPORT_WAJIB_EKSPLISIT', u(['--mode', 'offline']).galat.some((g) => g.startsWith('REPORT_WAJIB_EKSPLISIT')))
  cek('A6 argumen tak dikenal → ditolak', u(['--mode', 'offline', '--report', '/tmp/x', '--yolo']).galat.some((g) => g.startsWith('ARGUMEN_TIDAK_DIKENAL')))
  cek('A7 argumen sah → mode & laporan terurai', (() => { const a = u(['--mode=offline', '--report', '/tmp/x.json']); return a.mode === 'offline' && a.laporan === '/tmp/x.json' && a.galat.length === 0 })())
  const j = R.periksaJalurLaporan
  cek('A8 laporan relatif → REPORT_HARUS_ABSOLUT', j('laporan.json').includes('REPORT_HARUS_ABSOLUT'))
  cek('A9 laporan di dalam repo → ditolak', j(join(AKAR, 'laporan.json')).includes('REPORT_DI_DALAM_REPO_DITOLAK') && j(join(AKAR, 'prisma/fixtures/x.json')).includes('REPORT_DI_DALAM_REPO_DITOLAK'))
  const tautan = join(TMP, 'tautan-ke-repo')
  symlinkSync(AKAR, tautan)
  cek('A10 laporan lewat symlink ke repo → ditolak (realpath)', j(join(tautan, 'x.json')).includes('REPORT_DI_DALAM_REPO_DITOLAK'))
  cek('A11 direktori laporan tak ada → ditolak', j(join(TMP, 'tidak-ada', 'x.json')).includes('REPORT_DIREKTORI_TIDAK_ADA'))
  cek('A12 laporan di luar repo → lolos', j(join(TMP, 'ok.json')).length === 0)
  const keluaran = []
  const cetak = (t) => keluaran.push(t)
  cek('A13 CLI tanpa argumen → kode 2, hanya rencana, 0 panggilan', (await R.cli([], {}, cetak)) === 2 && jebakan === 0)
  cek('A14 CLI --mode live tanpa prasyarat → kode 3, 0 panggilan', (await R.cli(['--mode', 'live', '--report', join(TMP, 'l.json')], {}, cetak)) === 3 && jebakan === 0 && !existsSync(join(TMP, 'l.json')))
  cek('A15 CLI laporan di dalam repo → kode 3 SEBELUM run', (await R.cli(['--mode', 'offline', '--report', join(AKAR, 'x.json')], {}, cetak)) === 3 && !existsSync(join(AKAR, 'x.json')))
  cek('A16 CLI mode tak sah → kode 3', (await R.cli(['--mode', 'turbo', '--report', join(TMP, 't.json')], {}, cetak)) === 3)
}

// ============================================================ B. prasyarat
bagian('B. Prasyarat / gerbang otorisasi')
{
  const p = (env, mode = 'live', proses = {}) => R.periksaPrasyaratRunner(env, mode, proses)
  const ada = (g, re) => g.some((x) => re.test(x))
  cek('B1 live lengkap (kunci dummy, DB lokal) → lolos', p(LENGKAP()).length === 0)
  cek('B2 kunci spike hilang → ditolak', ada(p({ ...LENGKAP(), SPIKE_OPENROUTER_API_KEY: '' }), /SPIKE_OPENROUTER_API_KEY/))
  cek('B3 tabrakan OPENROUTER_API_KEY di env → ditolak', ada(p({ ...LENGKAP(), OPENROUTER_API_KEY: 'x' }), /OPENROUTER_API_KEY harus KOSONG/))
  cek('B4 tabrakan OPENROUTER_API_KEY di process.env saja → ditolak', ada(p(LENGKAP(), 'live', { OPENROUTER_API_KEY: 'prod' }), /OPENROUTER_API_KEY harus KOSONG/))
  cek('B5 tabrakan kunci juga ditolak di mode offline', ada(p({ OPENROUTER_API_KEY: 'x' }, 'offline'), /OPENROUTER_API_KEY/))
  cek('B6 frasa salah → ditolak', ada(p({ ...LENGKAP(), SPIKE_AUTHORIZED: 'ya' }), /frasa otorisasi Eval-1/))
  cek('B7 frasa Phase 0 → ditolak eksplisit', ada(p({ ...LENGKAP(), SPIKE_AUTHORIZED: H.FRASA_PHASE0 }), /PHASE 0/))
  cek('B8 NODE_ENV=production (env atau proses) → ditolak', ada(p({ ...LENGKAP(), NODE_ENV: 'production' }), /production/) && ada(p(LENGKAP(), 'live', { NODE_ENV: 'production' }), /production/))
  cek('B9 DB spike bukan lokal → ditolak', ada(p({ ...LENGKAP(), SPIKE_DATABASE_URL: 'postgresql://u@db.contoh.invalid:5432/x' }), /localhost/))
  cek('B10 DB spike bukan postgres → ditolak', ada(p({ ...LENGKAP(), SPIKE_DATABASE_URL: 'mysql://u@127.0.0.1/x' }), /PROTOKOL/))
  cek('B11 live tanpa DB spike → ditolak', ada(p({ ...LENGKAP(), SPIKE_DATABASE_URL: undefined }), /wajib untuk mode live/))
  cek('B12 offline tanpa DB spike → lolos (ledger tak dijalankan → G8 null)', p({}, 'offline').length === 0)
  cek('B13 DATABASE_URL ≠ SPIKE_DATABASE_URL (env/proses) → ditolak', ada(p({ ...LENGKAP(), DATABASE_URL: 'postgresql://prod.invalid/x' }), /DATABASE_URL harus kosong/) && ada(p(LENGKAP(), 'live', { DATABASE_URL: 'postgresql://prod.invalid/x' }), /DATABASE_URL/))
  cek('B14 DATABASE_URL produksi di offline tanpa DB spike → ditolak', ada(p({}, 'offline', { DATABASE_URL: 'postgresql://prod.invalid/x' }), /DATABASE_URL/))
  cek('B15 OPENROUTER_SPK_MODEL=Sonnet 5 → ditolak; =Sonnet 4.5 → lolos', ada(p({ ...LENGKAP(), OPENROUTER_SPK_MODEL: H.MODEL_S5 }), /OPENROUTER_SPK_MODEL/) && p({ ...LENGKAP(), OPENROUTER_SPK_MODEL: H.MODEL_S45 }).length === 0)
  cek('B16 TAH_INTAKE_MODEL terisi → ditolak', ada(p({ ...LENGKAP(), TAH_INTAKE_MODEL: H.MODEL_S5 }), /TAH_INTAKE_MODEL/))
  cek('B17 VESSEL_CALL_INTAKE_EXTRACTOR=FAKE → ditolak', ada(p({ ...LENGKAP(), VESSEL_CALL_INTAKE_EXTRACTOR: 'FAKE' }), /EXTRACTOR/))
  let n = 0
  const hitung = async () => (n++, new Response('{}'))
  const l1 = await R.jalankanRunner({ mode: 'live', env: { ...LENGKAP(), SPIKE_OPENROUTER_API_KEY: '' }, transportUji: hitung, hariIni: HARI, ...diam })
  cek('B18 jalankanRunner live tanpa prasyarat → DITOLAK_PRASYARAT, 0 panggilan transport', l1.verdict === 'DITOLAK_PRASYARAT' && l1.panggilanNyata === 0 && n === 0)
  const l2 = await R.jalankanRunner({ env: {}, hariIni: HARI, ...diam })
  cek('B19 jalankanRunner tanpa mode → DITOLAK_MODE (bawaan BUKAN live)', l2.verdict === 'DITOLAK_MODE' && jebakan === 0)
  const l3 = await R.jalankanRunner({ mode: 'offline', env: {}, transportUji: hitung, hariIni: HARI, ...diam })
  cek('B20 offline + transportUji → ditolak (tak ada campur mode)', l3.verdict === 'DITOLAK_PRASYARAT' && l3.galat.includes('MODE_OFFLINE_TIDAK_MENERIMA_TRANSPORT') && n === 0)
  const l4 = await R.jalankanRunner({ mode: 'live', env: LENGKAP(), transportUji: hitung, jawabStub: sempurna, hariIni: HARI, ...diam })
  cek('B21 live + stub → ditolak', l4.verdict === 'DITOLAK_PRASYARAT' && l4.galat.includes('MODE_LIVE_TIDAK_MENERIMA_STUB') && n === 0)
  const l5 = await R.jalankanRunner({ mode: 'live', env: LENGKAP(), nilaiKasusUji: () => ({}), hariIni: HARI, ...diam })
  cek('B22 transport JARINGAN + seam uji → ditolak SEBELUM panggilan apa pun', l5.verdict === 'DITOLAK_PRASYARAT' && l5.galat.includes('SEAM_UJI_DILARANG_SAAT_JARINGAN') && jebakan === 0)
}

// ============================================================ C. alur penuh luring (tanpa DB)
bagian('C. Alur penuh luring — jalur ekstraksi/validator/penilai asli, penyedia = stub')
let lapC
{
  lapC = await R.jalankanRunner({ mode: 'offline', env: {}, hariIni: HARI, ...diam })
  cek('C1 label DRY_RUN / NON-LIVE, transport STUB, panggilanNyata 0', lapC.label === R.LABEL_DRY && lapC.transport === 'STUB' && lapC.panggilanNyata === 0 && lapC.mode === 'offline')
  cek('C2 49 panggilan transport (51 − 2 LEDGER_E2E tanpa DB)', lapC.panggilanTransport === 49, `${lapC.panggilanTransport}`)
  cek('C3 slot LEDGER_E2E TIDAK_DIJALANKAN (SPIKE_DATABASE_URL tak diset), G8 null → INCONCLUSIVE', lapC.slot.filter((x) => x.blok === 'LEDGER_E2E').every((x) => x.status === 'TIDAK_DIJALANKAN') && lapC.gerbang.G8.lulus === null && lapC.verdict === 'INCONCLUSIVE')
  const s = lapC.slot.filter((x) => x.panggilan.length)
  cek('C4 requested & served model tercatat per panggilan', s.every((x) => x.panggilan.every((p) => p.requestedModel === x.requestedModel && p.servedModel === x.requestedModel)))
  cek('C5 pemakaian & biaya tercatat per panggilan', s.every((x) => x.panggilan.every((p) => p.promptTokens === 2500 && p.completionTokens === 400 && p.biayaUsd === 0.01)) && lapC.biayaUsd === 0.49)
  cek('C6 perekam jalur TAH: requested/served/promptId per slot', s.every((x) => x.perekam.length === x.panggilan.length && x.perekam.every((m) => m.promptId === 'vessel-call-extract' && m.requestedModel === x.requestedModel && m.servedModel === x.requestedModel)))
  cek('C7 hasil RAW & POST terpisah untuk 49 slot', s.every((x) => x.hasil?.RAW && x.hasil?.POST))
  cek('C8 G1–G7 lulus pada fixture sempurna', ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7'].every((g) => lapC.gerbang[g].lulus === true))
  cek('C9 privasi laporan lulus; env proses dipulihkan (kunci/DB kosong)', lapC.privasi.lulus && process.env.OPENROUTER_API_KEY === undefined && process.env.DATABASE_URL === undefined && process.env.TAH_CORE_ENABLED === undefined)
  cek('C10 tak ada percobaan jaringan lain; jebakan = 0', lapC.jaringanTerblokir === 0 && jebakan === 0)
  const w = R.tulisLaporanAman(join(TMP, 'c.json'), lapC)
  const isi = JSON.parse(readFileSync(w.jalur, 'utf8'))
  cek('C11 laporan ditulis di luar repo, berlabel DRY_RUN', !w.ditahan && isi.label === R.LABEL_DRY && isi.panggilanNyata === 0)
}

// ============================================================ G. LEDGER_E2E (DB lokal)
bagian('G. LEDGER_E2E — submitIntake + buku besar TAH asli di DB lokal sekali pakai')
if (!DB_UJI) {
  console.log('  ⏭  dilewati (TEST_SPIKE_DATABASE_URL tidak diset)')
} else {
  const { PrismaClient } = await import('@prisma/client')
  const db = new PrismaClient({ datasourceUrl: DB_UJI })
  const hitungE3b = async () => db.tenant.count({ where: { id: { startsWith: R.AWALAN_TENANT } } })

  const l = await R.jalankanRunner({ mode: 'offline', env: { SPIKE_DATABASE_URL: DB_UJI }, hariIni: HARI, ...diam })
  const b = l.ledger.bukti
  cek('G1 51 panggilan transport; ledger DIJALANKAN; G8 dari eksekutor → PASS mesin (label DRY_RUN)', l.panggilanTransport === 51 && l.ledger.status === 'DIJALANKAN' && l.ledger.g8.sumber === 'LEDGER_E2E_EXECUTOR' && l.gerbang.G8.lulus === true && l.verdict === 'PASS' && l.label === R.LABEL_DRY, `${l.verdict}`)
  cek('G2 DB tersambung = DB spike lokal (identitas server diverifikasi)', b.db.cocok && b.db.lokal && b.db.port === Number(new URL(DB_UJI).port))
  cek('G3 2 slot: submit OK → intake NEEDS_REVIEW → 1 AgentRun SUCCEEDED/PROPOSAL_CREATED, subjek & hash cocok', b.slot.length === 2 && b.slot.every((s) => s.submit === 'OK' && s.intake.status === 'NEEDS_REVIEW' && s.jumlahRun === 1 && s.run.status === 'SUCCEEDED' && s.run.outcome === 'PROPOSAL_CREATED' && s.run.subjekCocok && s.run.inputHashCocok))
  cek('G4 AgentModelCall = panggilan pencegat; requested S4.5, served, token, promptHash cocok', b.slot.every((s) => s.modelCall.length === s.panggilanPencegat && s.modelCall.every((c) => c.requestedModel === H.MODEL_S45 && c.servedModel === H.MODEL_S45 && c.inputTokens === 2500 && c.promptHashCocok)))
  cek('G5 audit AgentRun CREATE + UPDATE tercatat', b.slot.every((s) => s.auditRun.includes('CREATE') && s.auditRun.includes('UPDATE')))
  cek('G6 probe tulis-ledger-gagal: submit melempar, 0 panggilan penyedia, 0 baris intake/run', b.probeGagalTertutup.ok && b.probeGagalTertutup.panggilanPenyedia === 0)
  cek('G7 baris ledger bebas sentinel/badan dokumen/kontak/kunci', b.sentinelBersih && b.temuanPrivasiLedger.length === 0)
  cek('G8 pembersihan: 0 baris sisa, 0 tenant E3B, 0 pemicu', b.pembersihan.bersih && (await hitungE3b()) === 0 && (await db.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname LIKE 'e3b_eval1_%'`))[0].n === 0)
  const l2 = await R.jalankanRunner({ mode: 'offline', env: { SPIKE_DATABASE_URL: DB_UJI }, hariIni: HARI, ...diam })
  cek('G9 jalan ulang deterministik: bukti ledger identik, tetap bersih', JSON.stringify(l2.ledger.bukti.slot) === JSON.stringify(b.slot) && l2.verdict === 'PASS' && (await hitungE3b()) === 0)

  const td = R.buatPenyediaStub(kasus)
  const lv = await R.jalankanRunner({ mode: 'live', env: LENGKAP(DB_UJI), transportUji: td.fn, hariIni: HARI, ...diam })
  cek('G10 LIVE (test-double) + DB: 51 panggilan, semua Bearer <kunci spike>, G8 lulus, panggilanNyata 0', lv.panggilanTransport === 51 && td.catatan.every((c) => c.authorization === `Bearer ${KUNCI_DUMMY}`) && lv.gerbang.G8.lulus === true && lv.panggilanNyata === 0 && lv.transport === 'TEST_DOUBLE')

  const lr = await R.jalankanRunner({ mode: 'offline', env: { SPIKE_DATABASE_URL: DB_UJI }, hariIni: HARI, jawabStub: (k, model, n) => (n > 49 ? { __tanpaTool: true } : sempurna(k)), ...diam })
  const br = lr.ledger.bukti
  cek('G11 ekstraksi gagal di slot ledger → run FAILED, bukti tak lengkap → G8 gagal → FAIL', br.slot.every((s) => s.submit === 'GAGAL:AI_BAD_RESPONSE' && s.run?.status === 'FAILED' && s.modelCall.length === 1 && !s.lengkap) && lr.gerbang.G8.lulus === false && lr.verdict === 'FAIL', lr.verdict)
  cek('G12 kegagalan ledger tetap dibersihkan', br.pembersihan.bersih && (await hitungE3b()) === 0)

  const salahDb = DB_UJI.replace(/\/[^/?]+(\?|$)/, '/postgres$1')
  const lm = await R.jalankanRunner({ mode: 'offline', env: { SPIKE_DATABASE_URL: salahDb }, hariIni: HARI, ...diam })
  cek('G13 DB spike lokal TANPA skema eval (db postgres) → GAGAL_INFRASTRUKTUR, INCONCLUSIVE, tak ada tulis', lm.ledger.status === 'GAGAL_INFRASTRUKTUR' && lm.gerbang.G8.lulus === null && lm.verdict === 'INCONCLUSIVE' && (await hitungE3b()) === 0, `${lm.ledger.status}/${lm.ledger.galat}`)

  // sisa run yang crash (tenant E3B yatim) disapu; tenant lain berawalan mirip TIDAK disentuh
  const yatim = `${R.AWALAN_TENANT}yatim${Date.now().toString(36)}`.padEnd(25, '0')
  const mirip = `${R.AWALAN_TENANT}lain${Date.now().toString(36)}`.padEnd(25, '0')
  await db.tenant.create({ data: { id: yatim, companyName: R.NAMA_TENANT } })
  await db.tenant.create({ data: { id: mirip, companyName: 'BUKAN E3B' } })
  const ly = await R.jalankanRunner({ mode: 'offline', env: { SPIKE_DATABASE_URL: DB_UJI }, hariIni: HARI, ...diam })
  const masihMirip = await db.tenant.count({ where: { id: mirip } })
  await db.tenant.deleteMany({ where: { id: mirip } })
  cek('G14 sapu sisa: tenant E3B yatim dihapus; tenant lain (nama beda) tak disentuh', ly.ledger.bukti.sisaDisapu === 1 && (await db.tenant.count({ where: { id: yatim } })) === 0 && masihMirip === 1)

  const anak = spawnSync(process.execPath, ['--input-type=module', '-e', `
    globalThis.fetch = async () => { throw new Error('x') }
    const R = await import(${JSON.stringify(join(AKAR, 'prisma/spike-eval1-runner.mjs'))})
    const l = await R.jalankanRunner({ mode: 'offline', env: { SPIKE_DATABASE_URL: 'postgresql://e3b@127.0.0.1:1/tak_ada' }, hariIni: new Date(${HARI.getTime()}) })
    console.log(JSON.stringify({ s: l.ledger.status, v: l.verdict, g8: l.gerbang.G8.lulus }))`], { cwd: AKAR, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME } })
  const hasilAnak = (() => { try { return JSON.parse(anak.stdout.trim().split('\n').pop()) } catch { return null } })()
  cek('G15 DB lokal tak terjangkau (proses anak) → GAGAL_INFRASTRUKTUR, G8 null, INCONCLUSIVE', hasilAnak?.s === 'GAGAL_INFRASTRUKTUR' && hasilAnak?.g8 === null && hasilAnak?.v === 'INCONCLUSIVE', JSON.stringify(hasilAnak))
  const sisaTabel = await db.$queryRawUnsafe(`SELECT (SELECT count(*) FROM "Tenant")::int t, (SELECT count(*) FROM "AgentRun")::int r, (SELECT count(*) FROM "VesselCallIntake")::int i, (SELECT count(*) FROM "AuditLog")::int a, (SELECT count(*) FROM "SecurityEvent")::int s`)
  cek('G16 DB sekali pakai kembali kosong (Tenant/AgentRun/Intake/Audit/SecurityEvent = 0)', Object.values(sisaTabel[0]).every((n) => n === 0), JSON.stringify(sisaTabel[0]))
  await db.$disconnect()
}

// ============================================================ D. kesetaraan dengan harness E2
bagian('D. Kesetaraan dengan harness E2 (jalankanEval1) — penilaian identik')
{
  const bersih = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k === 'latensiP95Ms' || k === 'latencyMs' ? undefined : v)))
  const jawab = (k, model) => {
    const r = sempurna(k)
    if (model === H.MODEL_S5 && k.id === 'E09') r.cargoes[0].operation = 'LOAD'
    if (k.id === 'E10') delete r.portName
    return r
  }
  const e2 = await H.jalankanEval1({ env: {}, fetchStub: R.buatPenyediaStub(kasus, jawab).fn, hariIni: HARI })
  const rn = await R.jalankanRunner({ mode: 'offline', env: {}, jawabStub: jawab, hariIni: HARI, ...diam })
  cek('D1 ringkasan S5_RUN1/RUN2/S45/TANPA_SUHU identik', JSON.stringify(bersih(e2.ringkasan)) === JSON.stringify(bersih(rn.ringkasan)))
  const g = (l) => Object.fromEntries(['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7'].map((x) => [x, bersih(l.gerbang[x])]))
  cek('D2 gerbang G1–G7 identik', JSON.stringify(g(e2)) === JSON.stringify(g(rn)))
  const hs = (l) => l.slot.filter((x) => x.hasil).map((x) => [x.seq, x.status, x.hasil])
  cek('D3 status + hasil per slot (RAW/POST/atribusi) identik untuk 49 slot', JSON.stringify(hs(e2)) === JSON.stringify(hs(rn)) && hs(rn).length === 49)
  cek('D4 verdict: E2 FAIL = runner FAIL (G1 E09:F5)', e2.verdict === 'FAIL' && rn.verdict === 'FAIL' && rn.gerbang.G1.detail.some((d) => d.includes('E09:F5')))
  cek('D5 berkas harness & penilai E2 tidak berubah', H.shaBerkas(readFileSync(join(AKAR, 'prisma/spike-eval1.mjs'))) === shaHarnessE2 && H.shaBerkas(readFileSync(join(AKAR, 'prisma/spike-eval1-scorer.mjs'))) === shaPenilaiE2)
}

// ============================================================ E. mode LANGSUNG via test-double
bagian('E. Mode LANGSUNG lewat test-double — tukar kunci & jalur yang sama dengan E4')
{
  const td = R.buatPenyediaStub(kasus)
  const l = await R.jalankanRunner({ mode: 'live', env: { ...LENGKAP(), SPIKE_DATABASE_URL: 'postgresql://u@127.0.0.1:1/tak-dipakai' }, transportUji: td.fn, hariIni: HARI, ...diam }).catch((e) => ({ galat: e }))
  // DB tak terjangkau (port 1) → ledger GAGAL_INFRASTRUKTUR; bagian kunci tetap diperiksa di sini.
  cek('E1 transport TEST_DOUBLE, label DRY_RUN, panggilanNyata 0 (bukan jaringan)', l.transport === 'TEST_DOUBLE' && l.label === R.LABEL_DRY && l.panggilanNyata === 0 && l.mode === 'live')
  cek('E2 setiap panggilan membawa kunci spike (Bearer <dummy>) — tukar kunci Phase 0', td.catatan.length === 49 && td.catatan.every((c) => c.authorization === `Bearer ${KUNCI_DUMMY}`))
  cek('E3 OPENROUTER_API_KEY proses dipulihkan (kosong) setelah run', process.env.OPENROUTER_API_KEY === undefined)
  const teks = JSON.stringify(l)
  cek('E4 kunci tak ada di laporan; kunciTerpakai hanya nama variabel', !teks.includes(KUNCI_DUMMY) && l.kunciTerpakai === 'SPIKE_OPENROUTER_API_KEY (nilai tidak dicatat)' && l.privasi.lulus)
  cek('E5 model diminta: 15 S4.5 lalu 34 S5', td.catatan.slice(0, 15).every((c) => c.model === H.MODEL_S45) && td.catatan.slice(15).every((c) => c.model === H.MODEL_S5))
  cek('E6 ledger tak terjangkau → GAGAL_INFRASTRUKTUR, G8 null → INCONCLUSIVE (bukan PASS)', l.ledger.status === 'GAGAL_INFRASTRUKTUR' && l.gerbang.G8.lulus === null && l.verdict === 'INCONCLUSIVE', `${l.ledger.status}/${l.verdict}`)
  cek('E7 URL DB tak bocor ke laporan', !teks.includes('127.0.0.1:1/tak-dipakai'))
}

// ============================================================ F. jalur gagal-tertutup
bagian('F. Jalur gagal-tertutup (tak ada kegagalan yang menjadi PASS)')
{
  const rusak = {
    E14: { __mentah: '{classification: NEW_NOMINATION' },
    E01: { __tanpaTool: true },
    E03: { __mentah: '' },
    E07: { __mentah: 'null' },
    E05: { __mentah: '[]' },
    E06: { __mentah: '{}' },
    E13: { __mentah: JSON.stringify({ classification: 'NEW_NOMINATION', vessels: { name: 'X' }, cargoes: [] }) },
    E12: { __http: 500 },
    E15: { __lempar: true },
  }
  const l = await R.jalankanRunner({ mode: 'offline', env: {}, jawabStub: (k, model, n) => (model === H.MODEL_S5 && n > 15 && n <= 30 && rusak[k.id] ? rusak[k.id] : sempurna(k)), hariIni: HARI, ...diam })
  const st = (id) => l.slot.find((x) => x.blok === 'S5_RUN1' && x.kasus === id)?.status
  cek('F1 respons model rusak (tanpa tool / JSON rusak / kosong) → GAGAL:AI_BAD_RESPONSE', ['E01', 'E14', 'E03'].every((id) => st(id) === 'GAGAL:AI_BAD_RESPONSE'), ['E01', 'E14', 'E03'].map(st).join(' | '))
  cek('F2 kegagalan transport & HTTP 500 → GAGAL:AI_UNAVAILABLE', st('E12') === 'GAGAL:AI_UNAVAILABLE' && st('E15') === 'GAGAL:AI_UNAVAILABLE', `${st('E12')} | ${st('E15')}`)
  cek('F3 argumen tool tak sah (null/array/{}/vessels objek) → GAGAL:ARGUMEN_TIDAK_SAH', ['E07', 'E05', 'E06', 'E13'].every((id) => /^GAGAL:ARGUMEN_TIDAK_SAH/.test(st(id))))
  cek('F4 run tidak lengkap, G7 gagal, verdict ≠ PASS/CONDITIONAL', l.ringkasan.S5_RUN1.lengkap === false && l.gerbang.G7.lulus === false && !['PASS', 'CONDITIONAL'].includes(l.verdict), l.verdict)

  const Pol = createRequire(import.meta.url)('jiti')(fileURLToPath(import.meta.url), { alias: { '@': join(AKAR, 'src') }, interopDefault: true })(join(AKAR, 'src/services/intake/intake-policy.ts'))
  const lv = await R.jalankanRunner({
    mode: 'offline',
    env: {},
    hariIni: HARI,
    validasiUji: (raw, o) => {
      if (String(raw?.vessels?.[0]?.name ?? '').includes('HARMONY')) throw new Error('validator rusak')
      return Pol.validasiEkstraksi(raw, o)
    },
    ...diam,
  })
  const gv = lv.slot.filter((x) => x.status === 'GAGAL:VALIDATOR_ERROR')
  cek('F5 validator melempar → GAGAL:VALIDATOR_ERROR, slot tanpa hasil, verdict ≠ PASS', gv.length > 0 && gv.every((x) => x.hasil === null) && lv.verdict !== 'PASS', `${gv.length} slot, ${lv.verdict}`)

  const S = await import('./spike-eval1-scorer.mjs')
  const lp = await R.jalankanRunner({ mode: 'offline', env: {}, hariIni: HARI, nilaiKasusUji: (k, ...a) => (k.id === 'E04' ? (() => { throw new Error('penilai rusak') })() : S.nilaiKasus(k, ...a)), ...diam })
  const gp = lp.slot.filter((x) => x.status === 'GAGAL:PENILAI_ERROR')
  cek('F6 penilai melempar → GAGAL:PENILAI_ERROR, run tak lengkap, verdict ≠ PASS', gp.length === 3 && lp.ringkasan.S5_RUN1.lengkap === false && lp.verdict !== 'PASS', `${gp.length} slot, ${lp.verdict}`)

  const ls = await R.jalankanRunner({ mode: 'offline', env: {}, hariIni: HARI, opsiStub: { served: 'anthropic/claude-haiku-4.5' }, ...diam })
  cek('F7 served ≠ requested → berhenti setelah 1 panggilan, FAIL', ls.berhenti === 'SERVED_MODEL_BERBEDA' && ls.panggilanTransport === 1 && ls.verdict === 'FAIL')
  const lc = await R.jalankanRunner({ mode: 'offline', env: {}, hariIni: HARI, opsiStub: { tanpaBiaya: true }, ...diam })
  cek('F8 usage.cost tak ada → berhenti USAGE_COST_TIDAK_ADA, bukan PASS', lc.berhenti === 'USAGE_COST_TIDAK_ADA' && lc.panggilanTransport === 1 && lc.verdict !== 'PASS')

  const lt = await R.jalankanRunner({ mode: 'offline', env: {}, hariIni: HARI, jawabStub: (k, model) => { const r = sempurna(k); if (model === H.MODEL_S5 && k.id === 'E08') r.vessels[0].imo = '9998024'; return r }, ...diam })
  const e08 = lt.slot.find((x) => x.blok === 'S5_RUN1' && x.kasus === 'E08').hasil
  const imo = (L) => L.field.find((f) => f.jalur === 'vessels[0].imo')
  cek('F9 IMO jebakan E08 lolos validator ber-flag → POST FATAL F1 → FAIL; atribusi terlihat', lt.verdict === 'FAIL' && e08.POST.fatal.some((f) => f.kode === 'F1') && !!imo(e08.RAW)?.atribusi && !!imo(e08.POST)?.atribusi)
  const lh = await R.jalankanRunner({ mode: 'offline', env: {}, hariIni: HARI, jawabStub: (k, model) => { const r = sempurna(k); if (model === H.MODEL_S5 && k.id === 'E01') r.vessels[0].imo = '1234568'; return r }, ...diam })
  const e01 = lh.slot.find((x) => x.blok === 'S5_RUN1' && x.kasus === 'E01').hasil
  cek('F10 IMO karangan: RAW atribusi MODEL, POST MISSING atribusi VALIDATOR (perilaku E2 beku)', imo(e01.RAW)?.atribusi === 'MODEL' && imo(e01.POST)?.hasil === 'MISSING' && imo(e01.POST)?.atribusi === 'VALIDATOR')

  // kebocoran rahasia: served model berisi kunci → pemindai menemukan → laporan DITAHAN
  const td = R.buatPenyediaStub(kasus, sempurna, { served: () => KUNCI_DUMMY })
  const lk = await R.jalankanRunner({ mode: 'live', env: { ...LENGKAP(), SPIKE_DATABASE_URL: 'postgresql://u@127.0.0.1:1/x' }, transportUji: td.fn, hariIni: HARI, ...diam })
  cek('F11 kunci bocor ke metadata → privasi GAGAL (KUNCI_API)', lk.privasi.lulus === false && lk.privasi.temuan.includes('KUNCI_API'))
  const w = R.tulisLaporanAman(join(TMP, 'bocor.json'), lk)
  const isiBocor = readFileSync(w.jalur, 'utf8')
  cek('F12 laporan bocor DITAHAN: hanya pemberitahuan, kunci tak tertulis', w.ditahan && !isiBocor.includes(KUNCI_DUMMY) && JSON.parse(isiBocor).verdict === 'LAPORAN_DITAHAN_PRIVASI')
  let tolakRepo = null
  try {
    R.tulisLaporanAman(join(AKAR, 'prisma/laporan.json'), lapC)
  } catch (e) {
    tolakRepo = e.message
  }
  cek('F13 tulisLaporanAman di dalam repo → dilempar, berkas tak ada', tolakRepo === 'EVAL1_REPORT_DI_DALAM_REPO_DITOLAK' && !existsSync(join(AKAR, 'prisma/laporan.json')))
  const bukanLaporan = R.tulisLaporanAman(join(TMP, 'tak-dipindai.json'), { label: R.LABEL_DRY })
  cek('F14 laporan tanpa hasil pindai privasi → DITAHAN', bukanLaporan.ditahan)
  cek('F15 tak ada jalur untuk menyuntik bukti G8 dari luar (opsi `ledger` diabaikan)', (await R.jalankanRunner({ mode: 'offline', env: {}, hariIni: HARI, ledger: { failClosedOk: true, e2eOk: true, sentinelBersih: true }, ...diam })).gerbang.G8.lulus === null)
  cek('F16 env proses dipulihkan setelah semua jalur gagal', ['OPENROUTER_API_KEY', 'DATABASE_URL', 'DIRECT_URL', 'TAH_CORE_ENABLED', 'VESSEL_CALL_INTAKE_ENABLED', 'AUTOMATION_TENANT_IDS'].every((n) => process.env[n] === undefined))
}

// ============================================================ H. CLI proses anak
bagian('H. CLI proses anak (luring) — jebakan jaringan dipasang via --import')
{
  const jebak = join(TMP, 'jebak.mjs')
  const { writeFileSync } = await import('node:fs')
  writeFileSync(jebak, "globalThis.__n=0;globalThis.fetch=async()=>{globalThis.__n++;throw new Error('JEBAKAN')};process.on('exit',()=>console.log('JEBAKAN='+globalThis.__n))\n")
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, ...(DB_UJI ? { SPIKE_DATABASE_URL: DB_UJI } : {}) }
  const lap = join(TMP, 'cli-offline.json')
  const r = spawnSync(process.execPath, ['--import', jebak, join(AKAR, 'prisma/spike-eval1-runner.mjs'), '--mode', 'offline', '--report', lap], { cwd: AKAR, encoding: 'utf8', env })
  const isi = existsSync(lap) ? JSON.parse(readFileSync(lap, 'utf8')) : {}
  cek('H1 CLI offline → kode 0, laporan DRY_RUN di luar repo, JEBAKAN=0', r.status === 0 && isi.label === R.LABEL_DRY && isi.panggilanNyata === 0 && /JEBAKAN=0/.test(r.stdout), `kode=${r.status} verdict=${isi.verdict}`)
  const r2 = spawnSync(process.execPath, ['--import', jebak, join(AKAR, 'prisma/spike-eval1-runner.mjs'), '--mode', 'live', '--report', join(TMP, 'cli-live.json')], { cwd: AKAR, encoding: 'utf8', env: { ...env, SPIKE_AUTHORIZED: H.FRASA_OTORISASI_EVAL1 } })
  cek('H2 CLI live tanpa kunci spike → kode 3, tanpa laporan, JEBAKAN=0', r2.status === 3 && !existsSync(join(TMP, 'cli-live.json')) && /JEBAKAN=0/.test(r2.stdout))
  const r3 = spawnSync(process.execPath, ['--import', jebak, join(AKAR, 'prisma/spike-eval1-runner.mjs')], { cwd: AKAR, encoding: 'utf8', env })
  cek('H3 CLI tanpa argumen → kode 2 (rencana saja), JEBAKAN=0', r3.status === 2 && /JEBAKAN=0/.test(r3.stdout))
}

// ============================================================ Z. invarian
bagian('Z. Invarian')
cek('Z1 GT beku tak berubah (sha berkas)', H.shaBerkas(readFileSync(H.BERKAS_FIXTURE)) === shaAwal && shaAwal === H.SHA_BERKAS_BEKU && H.verifikasiBeku().length === 0)
cek('Z2 tak ada panggilan jaringan nyata sepanjang uji (jebakan fetch/http/https/tls)', jebakan === 0, String(jebakan))
rmSync(TMP, { recursive: true, force: true })
console.log(`\n${gagal ? '❌ ADA YANG GAGAL' : '✅ SEMUA LULUS'} — lulus ${lulus}, gagal ${gagal}`)
process.exit(gagal ? 1 : 0)
