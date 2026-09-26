// Uji LURING runner Eval-2 — PRD-005 E5 Step 5 (TANPA AI, TANPA jaringan, TANPA DB).
//
// Jalankan:  node prisma/check-eval2-runner.mjs
//
// Semua respons "model" berasal dari stub/fixture. fetch global dipasangi penghitung yang
// MELEMPAR — bukti tak ada byte ke jaringan. Tanpa SPIKE_DATABASE_URL → LEDGER_E2E tidak
// dijalankan (G8 null → verdict tak pernah PASS dari runner saja; PASS gerbang diuji terpisah
// dengan bukti ledger tersuntik).
//
// Lapis: A rencana · B integritas & prasyarat · C run sempurna & pelapisan RAW/POST ·
// D G9 · E G10 · F G11 · G gagal-tertutup · H batas panggilan/biaya & served model ·
// I diagnostik & privasi · J CLI · K integritas akhir & nol jaringan.

import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
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

if (process.env.OPENROUTER_API_KEY || process.env.SPIKE_AUTHORIZED) {
  console.log('❌ OPENROUTER_API_KEY / SPIKE_AUTHORIZED terset — uji luring ini wajib tanpa keduanya.')
  process.exit(1)
}
// Kunci uji khusus di lingkungan TIDAK dibaca, dicetak, atau dipakai uji ini.
const ENV_UJI = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'SPIKE_OPENROUTER_API_KEY' && k !== 'SPIKE_DATABASE_URL'))

let panggilanJaringan = 0
globalThis.fetch = async () => {
  panggilanJaringan++
  throw new Error('JARINGAN_DILARANG_DALAM_UJI')
}

const R = await import('./spike-eval2-runner.mjs')
const E = await import('./spike-eval2-penilai.mjs')
const B = await import('./spike-eval2-beku.mjs')
const F = await import('./fixtures/spike-intake/eval2-cases.mjs')
const H = await import('./spike-eval1.mjs')
const S = await import('./spike-eval1-scorer.mjs')
const require = createRequire(import.meta.url)
const jiti = require('jiti')(fileURLToPath(import.meta.url), { alias: { '@': join(AKAR, 'src') }, interopDefault: true })
const P = jiti(join(AKAR, 'src/services/intake/intake-policy.ts'))
const V = jiti(join(AKAR, 'src/lib/vessels.ts'))
const NORM = { namaKapal: P.normalisasiNamaKapal, namaPort: P.normalisasiNamaPort, namaPihak: P.normalisasiNamaPihak, unlocode: P.normalisasiUnlocode, imo: V.normalisasiImo, mmsi: V.normalisasiMmsi, callSign: V.normalisasiCallSign }
const HARI = new Date('2026-09-26T00:00:00Z')
const LEDGER_OK = { failClosedOk: true, e2eOk: true, sentinelBersih: true }

/** Satu run luring (stub) dengan seam; G12 disuntik agar cepat (G12 nyata diuji di bagian K). */
const run = (opsi = {}) => R.jalankanRunnerEval2({ mode: 'offline', env: ENV_UJI, hariIni: HARI, g12Uji: true, ...opsi })
const slotDari = (lap) => lap.__slotMemori ?? []
const reEvaluasi = (lap, extra = {}) => E.evaluasiGerbangEval2({ slots: slotDari(lap), operasional: lap.operasional, ledger: LEDGER_OK, g12: true, norm: NORM, ...extra })
const sempurna = R.jawabanSempurna
/** Jawaban stub: sempurna kecuali kasus/blok tertentu dimutasi. `blok` = 'S45' | 'S5' | null (semua). */
const mutasi = (peta, blok = null) => (k, model) => {
  const cocokBlok = blok === null || (blok === 'S45' ? model === H.MODEL_S45 : model === H.MODEL_S5)
  if (k && peta[k.id] && cocokBlok) return peta[k.id](structuredClone(sempurna(k)), k)
  return sempurna(k)
}

// =====================================================================
bagian('A. RENCANA 80 SLOT (beku) & validasi gagal-tertutup')
const RENCANA = E.susunRencanaEval2()
{
  const hitung = (b) => RENCANA.filter((s) => s.blok === b).length
  cek('80 slot: kontrol 26 · S5 run1 26 · S5 run2 26 · LEDGER_E2E 2', RENCANA.length === 80 && hitung('S45_KONTROL') === 26 && hitung('S5_RUN1') === 26 && hitung('S5_RUN2') === 26 && hitung('LEDGER_E2E') === 2)
  cek('urutan & model per blok = RENCANA_EVAL2 beku; seq 1…80', RENCANA.every((s, i) => s.seq === i + 1 && s.model === F.RENCANA_EVAL2.blok.find((b) => b.blok === s.blok).model))
  cek('LEDGER_E2E memakai T03 (tunggal) & T12 (multi-kapal)', JSON.stringify(RENCANA.filter((s) => s.blok === 'LEDGER_E2E').map((s) => s.kasus)) === '["T03","T12"]')
  cek('rencana sah → 0 galat', E.validasiRencanaEval2(RENCANA, { allowlist: H.ALLOWLIST }).length === 0)
  const v = (r) => E.validasiRencanaEval2(r, { allowlist: H.ALLOWLIST })
  cek('rencana tak lengkap (79) → RENCANA_TIDAK_LENGKAP + JUMLAH_BLOK_BERBEDA', (() => { const g = v(RENCANA.slice(0, 79)); return g.some((x) => x.startsWith('RENCANA_TIDAK_LENGKAP')) && g.some((x) => x.startsWith('JUMLAH_BLOK_BERBEDA')) })())
  cek('duplikat kasus/run → DUPLIKAT', v(RENCANA.map((s, i) => (i === 1 ? { ...s, kasus: 'T01' } : s))).some((x) => x.startsWith('DUPLIKAT:S45_KONTROL|T01')))
  cek('kasus tak dikenal → KASUS_TIDAK_DIKENAL', v(RENCANA.map((s, i) => (i === 0 ? { ...s, kasus: 'T99' } : s))).some((x) => x.startsWith('KASUS_TIDAK_DIKENAL')))
  cek('model tak dikenal / beda dari blok → MODEL_TIDAK_DIKENAL + MODEL_BEDA_DARI_RENCANA', (() => { const g = v(RENCANA.map((s, i) => (i === 30 ? { ...s, model: 'openai/gpt-x' } : s))); return g.some((x) => x.startsWith('MODEL_TIDAK_DIKENAL')) && g.some((x) => x.startsWith('MODEL_BEDA_DARI_RENCANA')) })())
  cek('metadata slot hilang → METADATA_SLOT_TIDAK_LENGKAP', v(RENCANA.map((s, i) => (i === 5 ? { seq: 6, blok: s.blok, kasus: s.kasus } : s))).some((x) => x.startsWith('METADATA_SLOT_TIDAK_LENGKAP')))
  cek('rencana melebihi maks 90 → RENCANA_MELEBIHI_MAKS_PANGGILAN', v([...RENCANA, ...Array.from({ length: 11 }, (_, i) => ({ seq: 81 + i, blok: 'S5_RUN1', model: H.MODEL_S5, kasus: 'T01' }))]).includes('RENCANA_MELEBIHI_MAKS_PANGGILAN'))
  cek('blok tak dikenal & seq kacau → ditolak', (() => { const g = v(RENCANA.map((s, i) => (i === 2 ? { ...s, blok: 'S5_RUN3', seq: 99 } : s))); return g.some((x) => x.startsWith('BLOK_TIDAK_DIKENAL')) && g.some((x) => x.startsWith('SEQ_TIDAK_BERURUTAN')) })())
}

// =====================================================================
bagian('B. INTEGRITAS & PRASYARAT (semua ditolak SEBELUM panggilan apa pun)')
{
  const r1 = await run({ bekuUji: () => B.verifikasiBekuEval2({ mod: { ...F, GERBANG_EVAL2: { ...F.GERBANG_EVAL2, G2: { ...F.GERBANG_EVAL2.G2, ambang: { akurasiMin: 0.5, newPalsuNegatifMaks: 0 } } } } }) })
  cek('hash GT beku tak cocok (gerbang dilonggarkan) → DITOLAK_INTEGRITAS, 0 panggilan', r1.verdict === 'DITOLAK_INTEGRITAS' && r1.galat.includes('HASH_GT_BERBEDA') && r1.panggilanNyata === 0)
  const r2 = await run({ bekuUji: () => B.verifikasiBekuEval2({ isiBerkas: Buffer.from('fixture berubah') }) })
  cek('SHA fixture tak cocok → DITOLAK_INTEGRITAS (SHA_BERKAS_BERBEDA)', r2.verdict === 'DITOLAK_INTEGRITAS' && r2.galat.includes('SHA_BERKAS_BERBEDA'))
  const r3 = await run({ rencanaUji: RENCANA.slice(0, 60) })
  cek('rencana tak lengkap → DITOLAK_RENCANA', r3.verdict === 'DITOLAK_RENCANA')
  const r4 = await run({ batasUji: { ...R.BATAS_EVAL2, maksPanggilan: 91 } })
  cek('batas panggilan > 90 → DITOLAK_BATAS', r4.verdict === 'DITOLAK_BATAS' && r4.galat.includes('BATAS_MELEBIHI_BEKU:maksPanggilan'))
  const r5 = await run({ batasUji: { ...R.BATAS_EVAL2, biayaKerasUsd: 3.5 } })
  cek('batas biaya keras > US$3,00 → DITOLAK_BATAS', r5.verdict === 'DITOLAK_BATAS' && r5.galat.includes('BATAS_MELEBIHI_BEKU:biayaKerasUsd'))
  const r6 = await run({ batasUji: { ...R.BATAS_EVAL2, maksPanggilan: 70 } })
  cek('batas panggilan < rencana (70 < 80) → DITOLAK (tak memulai run yang pasti terpotong)', r6.verdict === 'DITOLAK_BATAS' && r6.galat.includes('RENCANA_MELEBIHI_BATAS_PANGGILAN'))
  cek('BATAS_EVAL2 = beku: 90 panggilan, lunak US$2,70, keras US$3,00; token = Eval-1', R.BATAS_EVAL2.maksPanggilan === 90 && R.BATAS_EVAL2.biayaLunakUsd === 2.7 && R.BATAS_EVAL2.biayaKerasUsd === 3 && R.BATAS_EVAL2.tokenInput === H.BATAS_OWNER.tokenInput)
  const pp = (env, mode) => R.periksaPrasyaratEval2(env, mode, {})
  cek('LIVE tanpa frasa → ditolak', pp({ SPIKE_OPENROUTER_API_KEY: 'x', SPIKE_DATABASE_URL: 'postgresql://u@127.0.0.1:5432/d' }, 'live').some((g) => g.includes('frasa otorisasi Eval-2')))
  cek('LIVE dengan frasa Eval-1 / Phase 0 → ditolak', [H.FRASA_OTORISASI_EVAL1, H.FRASA_PHASE0].every((f) => pp({ SPIKE_AUTHORIZED: f, SPIKE_OPENROUTER_API_KEY: 'x', SPIKE_DATABASE_URL: 'postgresql://u@127.0.0.1:5432/d' }, 'live').some((g) => g.includes('Eval-1/Phase 0'))))
  cek('LIVE tanpa kunci uji khusus / tanpa DB lokal → ditolak', pp({ SPIKE_AUTHORIZED: R.FRASA_OTORISASI_EVAL2 }, 'live').length === 2)
  cek('OPENROUTER_API_KEY (kunci produksi) terset → ditolak (offline & live)', ['offline', 'live'].every((m) => pp({ OPENROUTER_API_KEY: 'x' }, m).some((g) => g.includes('OPENROUTER_API_KEY'))))
  cek('DB non-lokal / DATABASE_URL lain → ditolak', pp({ SPIKE_DATABASE_URL: 'postgresql://u@db.prod.example:5432/d' }, 'offline').some((g) => g.includes('localhost')) && pp({ DATABASE_URL: 'postgresql://u@db.prod.example/d' }, 'offline').some((g) => g.includes('DATABASE_URL')))
  cek('NODE_ENV=production & TAH_INTAKE_MODEL terset → ditolak', pp({ NODE_ENV: 'production' }, 'offline').length === 1 && pp({ TAH_INTAKE_MODEL: H.MODEL_S5 }, 'offline').length === 1)
  cek('frasa lengkap + kunci uji + DB lokal → lolos prasyarat (tanpa dijalankan)', pp({ SPIKE_AUTHORIZED: R.FRASA_OTORISASI_EVAL2, SPIKE_OPENROUTER_API_KEY: 'x', SPIKE_DATABASE_URL: 'postgresql://u@127.0.0.1:5432/d' }, 'live').length === 0)
  const r7 = await R.jalankanRunnerEval2({ mode: 'live', env: { ...ENV_UJI, SPIKE_AUTHORIZED: R.FRASA_OTORISASI_EVAL2, SPIKE_OPENROUTER_API_KEY: 'x', SPIKE_DATABASE_URL: 'postgresql://u@127.0.0.1:5432/d' }, validasiUji: P.validasiEkstraksi })
  cek('seam uji di mode live jaringan → DITOLAK (tak ada jalan pintas saat LIVE)', r7.verdict === 'DITOLAK_PRASYARAT' && r7.galat.includes('SEAM_UJI_DILARANG_SAAT_JARINGAN'))
  const r8 = await R.jalankanRunnerEval2({ mode: 'live', env: ENV_UJI, hariIni: HARI })
  cek('mode live tanpa otorisasi → DITOLAK_PRASYARAT, 0 panggilan', r8.verdict === 'DITOLAK_PRASYARAT' && r8.panggilanNyata === 0)
  const r9 = await R.jalankanRunnerEval2({ mode: 'bebas', env: ENV_UJI })
  cek('mode tak sah → DITOLAK_MODE', r9.verdict === 'DITOLAK_MODE')
}

// =====================================================================
bagian('C. RUN SEMPURNA (stub dari GT) & pelapisan A–G')
const lapSempurna = await run()
{
  const slots = slotDari(lapSempurna)
  cek('78 slot dinilai, semua OK, 0 panggilan nyata, transport STUB', slots.length === 78 && slots.every((s) => s.status === 'OK') && lapSempurna.panggilanNyata === 0 && lapSempurna.transport === 'STUB' && lapSempurna.panggilanTransport === 78)
  cek('tanpa DB: LEDGER_E2E tidak dijalankan → G8 null → verdict INCONCLUSIVE (tak pernah PASS tanpa bukti ledger)', lapSempurna.ledger.status === 'TIDAK_DIJALANKAN' && lapSempurna.gerbang.G8.lulus === null && lapSempurna.verdict === 'INCONCLUSIVE')
  const ev = reEvaluasi(lapSempurna)
  cek('dengan bukti ledger tersuntik & G12 lulus → semua gerbang lulus → PASS', ev.verdict === 'PASS' && ev.gagal.length === 0, ev.gagal.join(','))
  cek('PASS tetap BUKAN aktivasi (catatan eksplisit)', /PENDING_SPIKE/.test(ev.catatan) && /PENDING_SPIKE/.test(lapSempurna.catatanModel))
  const s = slots.find((x) => x.blok === 'S5_RUN1' && x.kasus.id === 'T11')
  cek('lapisan terpisah: sumber (sidik), panggilan (metadata), RAW (objek), POST (proposal validator), nilai RAW & POST', !!s.sumber?.sha256_12 && s.panggilan.length === 1 && s.raw && s.post?.proposal && s.nilai?.RAW && s.nilai?.POST && s.raw !== s.post.proposal)
  cek('RAW tidak pernah ditimpa POST: RAW tetap argumen tool (string polos), POST berbentuk FieldUsulan', typeof s.raw.vessels[0].name === 'string' && typeof s.post.proposal.vessels[0].name === 'object')
  cek('jalur produksi dipakai: perekam mencatat prompt v2 / skema v2 & model slot', s.perekam.length === 1 && s.perekam[0].promptVersion === '2' && s.perekam[0].schemaVersion === '2' && s.perekam[0].requestedModel === H.MODEL_S5)
  cek('tanpa fallback: setiap panggilan meminta model slotnya & dilayani model itu', slots.every((x) => x.panggilan.every((p) => p.requestedModel === x.model && p.servedModel === x.model)))
  cek('laporan TIDAK memuat objek RAW/POST/nilai (hanya diagnostik)', !('raw' in lapSempurna.diagnostik[0]) && !('post' in lapSempurna.diagnostik[0]) && !JSON.stringify(lapSempurna).includes('"extracted"'))
}

// =====================================================================
bagian('D. G9 — tanggal tak berbukti (5 field, SEMUA run termasuk kontrol)')
{
  // Model menyimpulkan tahun untuk semua node tanpaTahun (kasus TANGGAL + T25) di kedua model.
  const tebakTahun = Object.fromEntries(['T06', 'T07', 'T08', 'T09', 'T10', 'T25'].map((id) => [id, (o, k) => {
    for (const f of E.FIELD_TANGGAL) if (k.gt[f]?.tanpaTahun) o[f] = k.tanggal.X?.iso ?? k.tanggal.D?.iso ?? '2026-10-05'
    return o
  }]))
  const lap = await run({ jawabStub: mutasi(tebakTahun) })
  const ev = reEvaluasi(lap)
  cek('pagar Step 1 menahan: G9 LULUS (POST bersih) walau RAW menyimpulkan tahun di kontrol & S5', ev.gerbang.G9.lulus === true && ev.gerbang.G9.detail.length === 0)
  cek('G9R GAGAL (model S5 mengisi node tanpaTahun) dengan atribusi MODEL, kontrol dilaporkan informatif', ev.gerbang.G9R.lulus === false && ev.gerbang.G9R.detail.every((x) => x.atribusi === 'MODEL' && x.post === null && x.flags.includes('DATE_NOT_IN_SOURCE')) && ev.gerbang.G9R.kontrolInformatif.length > 0)
  cek('G9R mencatat nilai RAW, nilai POST, flag validator & kasus', ev.gerbang.G9R.detail.some((x) => x.kasus === 'T10' && x.field === 'eta' && /^\d{4}-\d{2}-\d{2}$/.test(x.raw)))
  cek('RAW ETA simpulan dinilai F4 di RAW, tidak di POST (lapisan terpisah)', slotDari(lap).some((s) => s.kasus.id === 'T10' && s.nilai.RAW.fatal.some((f) => f.kode === 'F4') && s.nilai.POST.jumlah.FATAL === 0))
  // Tahun simpulan pada eta ber-GT ABSENT = HALLUCINATED kritis di RAW (penilai Eval-1) → G4 ikut gagal.
  cek('verdict: hanya gerbang kondisional gagal (G4 halusinasi RAW + G9R) → CONDITIONAL (bukan PASS)', ev.verdict === 'CONDITIONAL' && ev.gagal.join() === 'G4,G9R' && ev.gagal.every((g) => !F.GERBANG_EVAL2[g].keras))
  // Regresi validator tersimulasi: pagar tanggal dilewati → tanggal simpulan LOLOS ke POST.
  const validatorBocor = (raw, ctx) => {
    const h = P.validasiEkstraksi(raw, ctx)
    for (const f of E.FIELD_TANGGAL) if (h.proposal[f].flags.includes('DATE_NOT_IN_SOURCE')) h.proposal[f] = { value: h.proposal[f].extracted, source: 'SOURCE_DOCUMENT', flags: [], extracted: h.proposal[f].extracted, confirmed: false }
    return h
  }
  const lapBocor = await run({ jawabStub: mutasi(tebakTahun, 'S45'), validasiUji: validatorBocor })
  const evB = reEvaluasi(lapBocor)
  cek('validator bocor di KONTROL saja → G9 GAGAL (keras) → verdict FAIL', evB.gerbang.G9.lulus === false && evB.verdict === 'FAIL' && evB.gerbang.G9.detail.every((x) => x.blok === 'S45_KONTROL'))
  cek('G9 mencatat raw/post/flag/atribusi VALIDATOR_LOLOS per kasus & field (etb/etd/eta …)', evB.gerbang.G9.detail.length >= 8 && evB.gerbang.G9.detail.every((x) => x.raw === x.post && x.atribusi === 'VALIDATOR_LOLOS') && new Set(evB.gerbang.G9.detail.map((x) => x.field)).has('etb'))
}

// =====================================================================
bagian('E. G10 — kapal hilang RAW→POST wajib terlihat (vesselsDropped)')
{
  // Mode kegagalan E03 di S5: token SNT2K dibuang dari nama tongkang T11.
  const e03 = { T11: (o) => { o.vessels[1].name = 'BG PRIMA 301'; o.vessels[2].name = 'BG PRIMA 302'; return o } }
  const lap = await run({ jawabStub: mutasi(e03, 'S5') })
  const ev = reEvaluasi(lap)
  const s = slotDari(lap).find((x) => x.blok === 'S5_RUN1' && x.kasus.id === 'T11')
  cek('validator membuang 2 tongkang & MENGHITUNG (vesselsDropped = 2), tug tetap', s.post.proposal.vesselsDropped === 2 && s.post.proposal.vessels.length === 1)
  cek('G10 LULUS (kehilangan terlihat), kapal yang dibuang TIDAK dipulihkan', ev.gerbang.G10.lulus === true && s.post.proposal.vessels.every((v) => !/PRIMA/.test(v.name.value ?? '')))
  cek('kehilangan tetap dihitung penilai (MAJOR MISSING_VESSEL, bukan disembunyikan)', s.nilai.POST.kapal.hilang.length === 2 && s.nilai.POST.jumlah.MAJOR >= 2)
  // Regresi validator tersimulasi: kapal dibuang TANPA dihitung.
  const hilangDiam = (raw, ctx) => {
    const h = P.validasiEkstraksi(raw, ctx)
    if (h.proposal.vessels.length > 1) {
      h.proposal.vessels = h.proposal.vessels.slice(0, 1)
      h.proposal.vesselsDropped = 0
    }
    return h
  }
  const lapD = await run({ validasiUji: hilangDiam })
  const evD = reEvaluasi(lapD)
  cek('kapal hilang diam-diam → G10 GAGAL (keras) → FAIL, jenis INVARIAN_HITUNG & KAPAL_GT_HILANG', evD.gerbang.G10.lulus === false && evD.verdict === 'FAIL' && evD.gerbang.G10.detail.some((x) => x.jenis === 'INVARIAN_HITUNG') && evD.gerbang.G10.detail.some((x) => x.jenis === 'KAPAL_GT_HILANG'))
  cek('G10 berlaku di SEMUA run (termasuk kontrol)', new Set(evD.gerbang.G10.detail.map((x) => x.blok)).size === 3)
}

// =====================================================================
bagian('F. G11 — kasus negatif & adversarial (TBN, Hull No., riwayat, sister, tebakan OCR)')
{
  const cases = [
    ['T24 TBN sebagai kapal', { T24: (o) => ({ ...o, classification: 'NEW_NOMINATION', vessels: [{ name: 'TBN' }] }) }, 'FATAL_POST'],
    ['T26 Hull No. sebagai IMO', { T26: (o) => ({ ...o, classification: 'NEW_NOMINATION', vessels: [{ imo: '2211047' }] }) }, 'FATAL_POST'],
    ['T14 kapal riwayat ditambahkan', { T14: (o) => ({ ...o, vessels: [...o.vessels, { name: 'MV PELANGI SELATAN', imo: '9998341' }] }) }, 'KAPAL_DIKECUALIKAN_DI_POST'],
    ['T18 sister vessel ditambahkan', { T18: (o) => ({ ...o, vessels: [...o.vessels, { name: 'MV ANGGREK BAHARI', imo: '9998377' }] }) }, 'KAPAL_DIKECUALIKAN_DI_POST'],
  ]
  for (const [nama, peta, jenis] of cases) {
    const lap = await run({ jawabStub: mutasi(peta, 'S45') })
    const ev = reEvaluasi(lap)
    cek(`${nama} (di KONTROL saja) → G11 GAGAL (${jenis}) → FAIL`, ev.gerbang.G11.lulus === false && ev.verdict === 'FAIL' && ev.gerbang.G11.detail.some((x) => x.jenis === jenis && x.blok === 'S45_KONTROL'), JSON.stringify(ev.gerbang.G11.detail.map((x) => x.jenis)))
  }
  // Tebakan pada kasus negatif yang DITAHAN validator → aman di POST, G11 lulus.
  const aman = { T05: (o) => ({ ...o, classification: 'NEW_NOMINATION', vessels: [{ name: 'MV ORCA STAR', imo: '9998244' }] }), T23: (o) => ({ ...o, classification: 'NEW_NOMINATION', portName: 'Samarinda' }), T25: (o) => ({ ...o, classification: 'NEW_NOMINATION', eta: '2026-10-26' }) }
  const lapA = await run({ jawabStub: mutasi(aman, 'S5') })
  const evA = reEvaluasi(lapA)
  const kls = (id) => slotDari(lapA).find((x) => x.blok === 'S5_RUN1' && x.kasus.id === id)
  cek('T05/T23/T25 NEW_* palsu di RAW ditahan validator → POST INSUFFICIENT, G11 lulus', evA.gerbang.G11.lulus === true && ['T05', 'T23', 'T25'].every((id) => kls(id).post.classification === 'INSUFFICIENT_INFORMATION'))
  cek('… tetapi RAW tercatat F9 (NEW_* palsu) → terlihat di diagnostik temuan RAW', ['T05', 'T23', 'T25'].every((id) => kls(id).nilai.RAW.fatal.some((f) => f.kode === 'F9')))
  cek('semua kasus negatif & adversarial (T05,T10,T14,T18,T23–T26) dinilai di ketiga blok', ['T05', 'T10', 'T14', 'T18', 'T23', 'T24', 'T25', 'T26'].every((id) => slotDari(lapA).filter((x) => x.kasus.id === id && x.nilai).length === 3))
}

// =====================================================================
bagian('G. GAGAL-TERTUTUP pada hasil rusak (tak pernah PASS)')
{
  const pola = [
    ['JSON argumen rusak', { __mentah: '{"classification": "NEW_NOMIN' }, /GAGAL:AI_BAD_RESPONSE/],
    ['argumen tool tak sah (klasifikasi di luar enum)', { classification: 'APPROVE_NOW', vessels: [], cargoes: [] }, /GAGAL:ARGUMEN_TIDAK_SAH/],
    ['argumen tanpa field wajib (vessels bukan larik)', { classification: 'NEW_NOMINATION', vessels: 'MV X', cargoes: [] }, /GAGAL:ARGUMEN_TIDAK_SAH/],
    ['respons tanpa tool call', { __tanpaTool: true }, /GAGAL:AI_BAD_RESPONSE/],
    ['badan respons bukan JSON (model tak dilaporkan)', { __bukanJson: true }, /GAGAL:SERVED_MODEL_TIDAK_DILAPORKAN/],
    ['HTTP 500 penyedia', { __http: 500 }, /GAGAL:AI_UNAVAILABLE/],
    ['kegagalan transport', { __lempar: true }, /GAGAL:AI_UNAVAILABLE/],
  ]
  for (const [nama, jawaban, harap] of pola) {
    const lap = await run({ jawabStub: (k, model) => (k?.id === 'T07' && model === H.MODEL_S5 ? jawaban : sempurna(k)) })
    const s = slotDari(lap).filter((x) => x.kasus.id === 'T07' && x.blok !== 'S45_KONTROL')
    const ev = reEvaluasi(lap)
    // Slot pertama wajib gagal dengan sebab yang tepat; bila pencegat menghentikan run (mis. model tak dilaporkan),
    // slot sesudahnya TIDAK_DIJALANKAN. Tak satu pun slot terdampak dinilai.
    cek(`${nama} → slot gagal (${s[0]?.status}), tidak dinilai, verdict ${ev.verdict} ≠ PASS`, harap.test(s[0]?.status) && s.every((x) => (harap.test(x.status) || x.status === 'TIDAK_DIJALANKAN') && x.nilai === null) && ev.verdict !== 'PASS' && lap.verdict !== 'PASS')
  }
  cek('input penilai rusak → masalahKasusPenilai menolak (GT tanpa klasifikasi / kind salah)', E.masalahKasusPenilai({ id: 'T01', kind: 'PDF', gt: {} }).length >= 3 && E.masalahKasusPenilai(null).length === 1)
  const lapV = await run({ validasiUji: () => { throw new Error('validator meledak') } })
  cek('validator melempar → slot GAGAL:VALIDATOR_ERROR, tak dinilai → tak pernah PASS', slotDari(lapV).every((s) => s.status === 'GAGAL:VALIDATOR_ERROR') && lapV.verdict !== 'PASS' && reEvaluasi(lapV).verdict !== 'PASS')
  const evRusak = (() => { try { return E.evaluasiGerbangEval2({ slots: null, operasional: {}, ledger: null, g12: true, norm: NORM }) } catch { return 'MELEMPAR' } })()
  cek('masukan gerbang rusak → melempar (runner memetakan ke GAGAL_PENILAI)', evRusak === 'MELEMPAR')
  cek('G12 belum dievaluasi → INCONCLUSIVE; G12 gagal → FAIL', reEvaluasi(lapSempurna, { g12: null }).verdict === 'INCONCLUSIVE' && reEvaluasi(lapSempurna, { g12: false }).verdict === 'FAIL')
  cek('G8 ledger gagal (probe gagal-tertutup) → FAIL', reEvaluasi(lapSempurna, { ledger: { ...LEDGER_OK, failClosedOk: false } }).verdict === 'FAIL')
}

// =====================================================================
bagian('H. BATAS PANGGILAN / BIAYA & SERVED MODEL')
{
  // Pagar proyeksi: 1,20/panggilan → sesudah 2 panggilan (2,40), panggilan ke-3 akan jadi 3,60 > 3,00 → ditolak.
  const lap = await run({ opsiStub: { biaya: () => 1.2 } })
  cek('proyeksi biaya: panggilan yang akan melewati US$3,00 TIDAK dimulai; total tak pernah > 3,00', lap.panggilanTransport === 2 && lap.biayaUsd <= 3 && lap.ditolakPencegat.some((d) => d.alasan === 'PROYEKSI_BIAYA_KERAS'), `transport=${lap.panggilanTransport} biaya=${lap.biayaUsd}`)
  const st = slotDari(lap).map((s) => s.status)
  cek('… slot yang panggilannya ditolak = DIHENTIKAN:PROYEKSI_BIAYA_KERAS, 75 sisanya TIDAK_DIJALANKAN → verdict bukan PASS', st.filter((x) => x === 'DIHENTIKAN:PROYEKSI_BIAYA_KERAS').length === 1 && st.filter((x) => x === 'TIDAK_DIJALANKAN').length === 75 && lap.verdict !== 'PASS' && reEvaluasi(lap).verdict !== 'PASS')
  const lapL = await run({ opsiStub: { biaya: () => 0.25 } })
  cek('batas lunak US$2,70: 0,25/panggilan → berhenti sesudah 11 panggilan (2,75 ≥ 2,70), tanpa melewati batas keras', lapL.panggilanTransport === 11 && lapL.biayaUsd === 2.75 && lapL.biayaUsd <= 3 && lapL.ditolakPencegat.some((d) => d.alasan === 'BERHENTI_LUNAK_BIAYA'), `transport=${lapL.panggilanTransport} biaya=${lapL.biayaUsd}`)
  const lapC = await run({ opsiStub: { tanpaBiaya: true } })
  cek('usage.cost hilang → berhenti (USAGE_COST_TIDAK_ADA), tanpa menebak biaya', lapC.berhenti === 'USAGE_COST_TIDAK_ADA' && lapC.panggilanTransport === 1 && lapC.verdict !== 'PASS')
  const lapS = await run({ opsiStub: { served: (m) => (m === H.MODEL_S5 ? 'anthropic/claude-sonnet-4.5' : m) } })
  const sS = slotDari(lapS)
  cek('served ≠ requested → slot GAGAL:SERVED_MODEL_BERBEDA (tak dinilai), run berhenti, verdict FAIL', sS.some((s) => s.status === 'GAGAL:SERVED_MODEL_BERBEDA') && lapS.berhenti === 'SERVED_MODEL_BERBEDA' && lapS.operasional.servedCocok === false && reEvaluasi(lapS).verdict === 'FAIL')
  cek('tanpa fallback model: slot S5 yang dilayani model lain TIDAK dinilai sebagai S5', sS.filter((s) => s.blok !== 'S45_KONTROL').every((s) => s.nilai === null))
  // Batas panggilan keras pencegat (dipakai ulang dari Eval-1) dengan batas Eval-2.
  const { pencegat, keadaan } = H.buatPencegat(async () => new Response(JSON.stringify({ model: H.MODEL_S5, usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.001 }, choices: [] }), { status: 200 }), R.BATAS_EVAL2)
  const body = JSON.stringify({ model: H.MODEL_S5 })
  let ditolak = 0
  for (let i = 0; i < 91; i++) await pencegat(H.URL_OPENROUTER, { body }).catch(() => ditolak++)
  cek('pencegat dengan BATAS_EVAL2: panggilan ke-91 ditolak (BATAS_PANGGILAN)', keadaan.total === 90 && ditolak === 1 && keadaan.ditolak.some((d) => d.alasan === 'BATAS_PANGGILAN'))
  const { pencegat: p2, keadaan: k2 } = H.buatPencegat(async () => new Response('{}'), R.BATAS_EVAL2)
  await p2(H.URL_OPENROUTER, { body: JSON.stringify({ model: 'openai/gpt-x' }) }).catch(() => {})
  await p2('https://api.openai.com/v1/chat/completions', { body }).catch(() => {})
  cek('model di luar allowlist & host lain → ditolak pencegat, 0 panggilan', k2.total === 0 && k2.ditolak.map((d) => d.alasan).join() === 'MODEL_TIDAK_DIIZINKAN,HOST_TIDAK_DIIZINKAN')
}

// =====================================================================
bagian('I. DIAGNOSTIK TERSANITASI & PRIVASI')
{
  const d = lapSempurna.diagnostik
  const x = d.find((z) => z.kasus === 'T11' && z.blok === 'S5_RUN1')
  cek('diagnostik per slot: kasus, model, run, klasifikasi harap/RAW/POST, jumlah kapal RAW/POST, vesselsDropped', d.length === 78 && x.model === H.MODEL_S5 && x.run === 1 && x.klasifikasi.raw && x.klasifikasi.post && x.kapal.raw === 3 && x.kapal.post === 3 && x.kapal.dropped === 0)
  cek('diagnostik: tanggal RAW/POST + flag untuk 5 field, temuan RAW & POST (FATAL/MAJOR/MINOR), panggilan (latensi/token/biaya), atribusi gerbang', E.FIELD_TANGGAL.every((f) => f in x.tanggal) && x.temuan.RAW && x.temuan.POST && 'MAJOR' in x.temuan.POST && x.panggilan[0].latencyMs !== undefined && x.panggilan[0].biayaUsd === 0.01 && Array.isArray(x.gerbang))
  const d2 = d.find((z) => z.kasus === 'T11' && z.blok === 'S5_RUN2')
  cek('sidik identitas bisa dibandingkan antar-run dalam satu laporan (run1 = run2 untuk jawaban sama)', JSON.stringify(x.kapal.rawEntri) === JSON.stringify(d2.kapal.rawEntri))
  cek('token nama: sentinel SNT2K muncul sebagai sidik yang SAMA di nama tug & tongkang (diagnosis hipotesis E03), bukan sebagai teks', x.kapal.rawEntri[0].name.token.includes(x.kapal.rawEntri[1].name.token[1]))
  const lapE = await run({ jawabStub: mutasi({ T11: (o) => { o.vessels[1].name = 'BG PRIMA 301'; return o } }, 'S5') })
  const xe = lapE.diagnostik.find((z) => z.kasus === 'T11' && z.blok === 'S5_RUN1')
  cek('token yang hilang terlihat: jumlah token tongkang 4 → 3 & bentuk berubah, tanpa menampilkan nama', xe.kapal.rawEntri[1].name.token.length === 3 && x.kapal.rawEntri[1].name.token.length === 4 && xe.kapal.rawEntri[1].name.bentuk !== x.kapal.rawEntri[1].name.bentuk)
  const teks = JSON.stringify(lapSempurna)
  const kasus = F.bangunKasusEval2(HARI)
  cek('laporan tanpa sentinel, tanpa nilai GT string (nama/pihak/email/rujukan), tanpa kutipan dokumen', !F.POLA_SENTINEL_EVAL2.test(teks) && R.nilaiGtTerlarangDiLaporan(kasus).every((v) => !teks.toUpperCase().includes(v.toUpperCase())) && lapSempurna.privasi.lulus)
  cek('laporan tanpa kunci, frasa, garam HMAC, isi prompt', !teks.includes(R.KUNCI_STUB) && !teks.includes(R.FRASA_OTORISASI_EVAL2) && !/Anda membaca|garam/.test(teks))
  const pindai = (t) => R.pindaiLaporanEval2(t, { kunci: 'sk-or-v1-UJI', kasus })
  cek('pemindai menangkap: nama kapal GT, sentinel, kunci, frasa Eval-1/Eval-2, kutipan dokumen, kontak', pindai('"KENANGA LAUT"').includes('NILAI_GT_UTUH') && pindai('snt2c').includes('SENTINEL_EVAL2') && pindai('sk-or-v1-UJI').includes('KUNCI_API') && pindai(H.FRASA_OTORISASI_EVAL1).includes('FRASA_OTORISASI') && pindai(R.FRASA_OTORISASI_EVAL2).includes('FRASA_OTORISASI') && pindai(kasus[2].teks.split('\n')[6]).includes('BADAN_DOKUMEN') && pindai('x@contoh.invalid').includes('KONTAK'))
  const dir = mkdtempSync(join(tmpdir(), 'eval2-uji-'))
  const bocor = { ...lapSempurna, privasi: { lulus: false, temuan: ['NILAI_GT_UTUH'] } }
  const w = R.tulisLaporanAman(join(dir, 'lap.json'), bocor)
  cek('privasi gagal → laporan DITAHAN (hanya pemberitahuan minimal)', w.ditahan === true && existsSync(w.jalur))
  let dalamRepo = null
  try { R.tulisLaporanAman(join(AKAR, 'laporan-eval2.json'), lapSempurna) } catch (e) { dalamRepo = e.message }
  cek('jalur laporan di dalam repo → ditolak', /DI_DALAM_REPO/.test(dalamRepo ?? '') && !existsSync(join(AKAR, 'laporan-eval2.json')))
}

// =====================================================================
bagian('J. CLI')
{
  const out = []
  const c0 = await R.cli([], ENV_UJI, (s) => out.push(s))
  cek('tanpa argumen → hanya integritas & rencana (exit 2), tanpa run', c0 === 2 && out.some((l) => /80 \/ maks 90/.test(l)) && out.some((l) => /OK/.test(l)))
  const c1 = await R.cli(['--mode', 'live', '--report', join(tmpdir(), 'x.json')], ENV_UJI, () => {})
  cek('--mode live tanpa otorisasi → exit 3 (0 panggilan)', c1 === 3)
  const c2 = await R.cli(['--live'], ENV_UJI, () => {})
  cek('flag lama --live / tanpa --report → exit 3', c2 === 3)
}

// =====================================================================
bagian('K. G12 NYATA, INTEGRITAS AKHIR & NOL JARINGAN')
{
  cek('G12 nyata: check-eval2-gt.mjs lulus sebagai proses anak', R.jalankanG12() === true)
  cek('Eval-2 beku utuh sesudah semua run (hash & SHA)', B.verifikasiBekuEval2().length === 0 && B.hitungHashGtEval2() === '59365c755fb8e42d0413ce832bcf509ce9106b7223b8dc0a7840de409af93dd6')
  cek('Eval-1 beku utuh', H.verifikasiBeku().length === 0)
  cek('env proses dipulihkan (OPENROUTER_API_KEY/DATABASE_URL tak tersisa)', !process.env.OPENROUTER_API_KEY && !process.env.DATABASE_URL)
  cek('NOL panggilan jaringan nyata selama seluruh uji', panggilanJaringan === 0)
}

console.log(`\n${gagal === 0 ? '✅ SEMUA LULUS' : '❌ ADA YANG GAGAL'} — lulus ${lulus}, gagal ${gagal}`)
process.exit(gagal === 0 ? 0 : 1)
