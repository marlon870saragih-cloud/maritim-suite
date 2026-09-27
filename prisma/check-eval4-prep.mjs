// PRD-005 Eval-4 prep — uji LURING remediasi H20 (TANPA DB, TANPA dev server, TANPA jaringan).
//
// Jalankan:  node prisma/check-eval4-prep.mjs
//
// `globalThis.fetch` diganti stub SEBELUM modul dimuat; OPENROUTER_API_KEY wajib TIDAK diset. Setiap
// "panggilan penyedia" berakhir di stub dan dihitung — nol byte ke jaringan, nol biaya.
//
// Lapis:
//   A. scorer-2 — pasangan muatan wajib bernama sama; komoditas karangan FATAL; F5_UNSUPPORTED vs F5_GT_CONFLICT
//   B. pemeriksa konsistensi GT ↔ sumber — historis (H20 terdeteksi) + uji mutasi
//   C. regresi R1–R12 ujung-ke-ujung (validator produksi → scorer-2)
//   D. Prompt v4 — identitas/hash baru; v3 tetap persis & tetap aktif di jalur produksi
//   E. Sonnet 5 gagal-tertutup — tanpa fallback ke SPK_MODEL (Sonnet 4.5), tanpa ulang, tanpa pengganti
//   F. kunci lingkup — tanpa runner Eval-4, registri tak dipromosikan, fixture/penilai historis tak berubah

import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const AKAR = fileURLToPath(new URL('..', import.meta.url))
const baca = (rel) => readFileSync(join(AKAR, rel), 'utf8')
const sha = (rel) => createHash('sha256').update(readFileSync(join(AKAR, rel))).digest('hex')

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

// ---------------------------------------------------------------- jaring jaringan
if (process.env.OPENROUTER_API_KEY) {
  console.log('❌ OPENROUTER_API_KEY terset — uji ini wajib tanpa kunci sungguhan.')
  process.exit(1)
}
let stub = null
const permintaan = []
globalThis.fetch = async (url, init = {}) => {
  permintaan.push({ url: String(url), init })
  if (!stub) throw new Error('JARINGAN_DILARANG_DALAM_UJI')
  return stub(String(url), init, permintaan.length)
}
const jawab = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } })
const jawabTool = (model, args = { classification: 'NOT_RELEVANT', vessels: [], cargoes: [] }) =>
  jawab({ id: 'gen-uji', model, usage: { prompt_tokens: 10, completion_tokens: 2 }, choices: [{ message: { tool_calls: [{ function: { name: 'isi_intake_kunjungan', arguments: JSON.stringify(args) } }] } }] })

const require = createRequire(import.meta.url)
const jiti = require('jiti')(fileURLToPath(import.meta.url), { alias: { '@': join(AKAR, 'src') }, interopDefault: true })
const muat = (rel) => jiti(join(AKAR, rel))
process.env.OPENROUTER_API_KEY = 'stub-kunci-uji-eval4-prep'

const X = muat('src/lib/ai/vessel-call-extract.ts')
const PR = muat('src/lib/ai/perekam-panggilan.ts')
const OR = muat('src/lib/ai/openrouter.ts')
const MC = muat('src/lib/ai/model-capabilities.ts')
const P = muat('src/services/intake/intake-policy.ts')
const V = muat('src/lib/vessels.ts')
const S1 = await import('./spike-eval1-scorer.mjs')
const S2 = await import('./spike-eval4-scorer.mjs')
const G = await import('./spike-gt-konsistensi.mjs')
const M = await import('./spike-eval4-identitas-model.mjs')
const RG = await import('./fixtures/spike-intake/eval4-regresi-muatan.mjs')
const F1 = await import('./fixtures/spike-intake/eval1-cases.mjs')
const F2 = await import('./fixtures/spike-intake/eval2-cases.mjs')
const F3 = await import('./fixtures/spike-intake/eval3-cases.mjs')

const HARI = '2026-09-26'
const NORM_V = { imo: V.normalisasiImo, imoSah: V.imoCheckDigitSah, mmsi: V.normalisasiMmsi, mmsiSah: V.mmsiSah, callSign: V.normalisasiCallSign }
const NORM_S = { namaKapal: P.normalisasiNamaKapal, namaPort: P.normalisasiNamaPort, namaPihak: P.normalisasiNamaPihak, unlocode: P.normalisasiUnlocode, imo: V.normalisasiImo, mmsi: V.normalisasiMmsi, callSign: V.normalisasiCallSign }
const validasi = (raw, teks, jenis = 'TEXT') =>
  P.validasiEkstraksi(structuredClone(raw), { inputKind: jenis, sourceText: teks === null ? null : P.normalisasiTeksSumber(teks), hariIni: HARI, norm: NORM_V })
const skor2 = (k, raw) => S2.nilaiKasusV2(k, raw, validasi(raw, k.teks), NORM_S)
const skor1 = (k, raw) => S1.nilaiKasus(k, raw, validasi(raw, k.teks), NORM_S)
const fatal = (l) => l.fatal.map((f) => `${f.kode}${f.jenis ? `/${f.jenis}` : ''}@${f.jalur}`)

const K3 = Object.fromEntries(F3.bangunKasusEval3(new Date(`${HARI}T00:00:00Z`)).map((k) => [k.id, k]))
const RGK = Object.fromEntries(RG.KASUS_REGRESI_MUATAN.map((k) => [k.id, k]))
const H20 = K3.H20
const RH20 = RGK['RG-H20']
const DASAR_H20 = { classification: 'UNSUPPORTED_REQUEST', vessels: [{ name: 'MV LAYANG BENGAWAN', imo: '9998535' }], portName: 'Probolinggo', portUnlocode: 'IDPRO', eta: '2026-10-28' }
const denganMuatan = (cargoes, x = {}) => ({ ...DASAR_H20, ...x, cargoes })

// =====================================================================
bagian('A. scorer-2 (koreksi penilaian muatan — scorer-1 tidak diubah)')
{
  cek('A0 versi scorer-3 (bukti sumber leksikon); scorer-1 tetap', S2.VERSI_PENILAI_V2 === 'prd005-e5-eval4/scorer-3' && S1.VERSI_PENILAI === 'prd005-step3c-eval1/scorer-1')
  const setia = denganMuatan([{ name: 'sawn timber', operation: 'LOAD' }])
  const s1 = skor1(H20, setia)
  const s2 = skor2(H20, setia)
  cek('A1 GT historis H20 + ekstraksi SETIA: scorer-1 = F5 FATAL (cacat yang diaudit, dipertahankan untuk Eval-3)', s1.RAW.jumlah.FATAL === 1 && s1.POST.jumlah.FATAL === 1, fatal(s1.POST).join(','))
  cek('A2 GT historis H20 + ekstraksi SETIA: scorer-2 = 0 FATAL, F5_GT_CONFLICT, kasus INCONCLUSIVE_GT (bukan salah model)',
    s2.RAW.jumlah.FATAL === 0 && s2.POST.jumlah.FATAL === 0 && s2.POST.konflikGt.some((x) => x.jenis === 'F5_GT_CONFLICT') && s2.integritasGt === 'INCONCLUSIVE_GT')
  cek('A3 run dengan satu kasus INCONCLUSIVE_GT → run INCONCLUSIVE_GT (tak boleh PASS)', S2.integritasGtRun([s2, skor2(RH20, setia)]).status === 'INCONCLUSIVE_GT' && S2.integritasGtRun([skor2(RH20, setia)]).status === 'OK')
  const qty = denganMuatan([{ name: 'sawn timber', quantity: 5000, unit: 'CBM', operation: 'LOAD' }])
  const q2h = skor2(H20, qty)
  cek('A4 GT historis H20 + jumlah KARANGAN: tetap F5 FATAL (F5_UNSUPPORTED) di RAW — konflik GT tak melonggarkan', q2h.RAW.fatal.some((f) => f.kode === 'F5' && f.jenis === 'F5_UNSUPPORTED'))
  const coal = denganMuatan([{ name: 'coal', operation: 'LOAD' }])
  const c1 = skor1({ ...RH20, gt: RH20.gt }, coal)
  const c2 = skor2(RH20, coal)
  cek('A5 GT "sawn timber" vs prediksi "coal": scorer-1 hanya MINOR (dipasang menurut urutan) — cacat terbukti', c1.RAW.jumlah.FATAL === 0 && c1.RAW.jumlah.MINOR >= 1)
  cek('A6 GT "sawn timber" vs prediksi "coal": scorer-2 = FATAL F5_UNSUPPORTED (tak dipasangkan)', c2.RAW.fatal.some((f) => f.kode === 'F5' && f.jenis === 'F5_UNSUPPORTED' && f.jalur === 'cargoes[0]'), fatal(c2.RAW).join(','))
  cek('A7 komoditas karangan TANPA jumlah/operasi pun FATAL (scorer-1: MINOR)', skor2(RH20, denganMuatan([{ name: 'coal' }])).RAW.jumlah.FATAL === 1 && skor1(K3.H20, denganMuatan([{ name: 'coal' }])).RAW.jumlah.FATAL === 0)
  cek('A8 GT RG-H20 + setia → 0 FATAL/0 MAJOR, integritas OK', (() => { const r = skor2(RH20, setia); return r.RAW.jumlah.FATAL === 0 && r.POST.jumlah.FATAL === 0 && r.POST.jumlah.MAJOR === 0 && r.integritasGt === 'OK' })())
  cek('A9 GT RG-H20 + operasi DISCHARGE (sumber "load") → F5_UNSUPPORTED', skor2(RH20, denganMuatan([{ name: 'sawn timber', operation: 'DISCHARGE' }])).RAW.fatal.some((f) => f.jenis === 'F5_UNSUPPORTED'))
  // Paritas: untuk jawaban sempurna dari GT (muatan dari bentuk 0), scorer-2 = scorer-1 pada semua kasus Eval-1/2/3 TEXT.
  const pilih = (n) => (!n || !('status' in n) ? null : n.status === 'PRESENT' ? n.value : n.status === 'ACCEPTABLE' ? n.values.find((x) => x !== null) ?? null : null)
  const FA = ['portName', 'portUnlocode', 'jetty', 'eta', 'etb', 'etc', 'etd', 'principalName', 'customerName', 'agencyType', 'clientReference', 'requestDate']
  const sempurna = (k) => {
    const g = k.gt
    const o = { classification: g.classification.values[0], vessels: k.kapalBukti ? structuredClone(k.kapalBukti) : g.vessels.daftar.map((v) => Object.fromEntries(['name', 'imo', 'mmsi', 'callSign', 'vesselType', 'role'].map((f) => [f, pilih(v[f])]).filter(([, x]) => x !== null))) }
    for (const f of FA) if (pilih(g[f]) !== null) o[f] = pilih(g[f])
    o.cargoes = (g.cargoes?.bentukDiterima?.[0] ?? []).map((r) => Object.fromEntries(['name', 'quantity', 'unit', 'operation'].map((f) => [f, pilih(r[f])]).filter(([, x]) => x !== null)))
    return o
  }
  const semua = [...F1.bangunKasusEval1(new Date(`${HARI}T00:00:00Z`)).filter((k) => k.kind === 'TEXT'), ...F2.bangunKasusEval2(new Date(`${HARI}T00:00:00Z`)), ...Object.values(K3)]
  const beda = semua.filter((k) => {
    const raw = sempurna(k)
    const a = skor1(k, raw)
    const b = skor2(k, raw)
    return JSON.stringify([a.RAW?.jumlah, a.POST?.jumlah]) !== JSON.stringify([b.RAW?.jumlah, b.POST?.jumlah]) || b.integritasGt !== 'OK'
  })
  cek(`A10 paritas scorer-2 = scorer-1 untuk jawaban sempurna (${semua.length} kasus TEXT Eval-1/2/3)`, beda.length === 0, beda.map((k) => k.id).join(','))
  // Grounding tanpa negatif palsu yang berbahaya: tak ada baris dibuang, 0 FATAL POST; satu-satunya kehilangan
  // = E10 (dokumen OCR rusak sengaja: "1O.000", "DISCH") — jumlah & operasi dikosongkan (gagal-tertutup, MAJOR, bukan FATAL).
  const bermuatan = semua.filter((k) => (k.gt.cargoes?.bentukDiterima?.[0] ?? []).length)
  const hasilA11 = bermuatan.map((k) => ({ k, p: validasi(sempurna(k), k.teks).proposal, s: skor2(k, sempurna(k)) }))
  cek(`A11 muatan jawaban sempurna Eval-1/2 (${bermuatan.length} kasus): tak ada baris dibuang, 0 FATAL POST`, hasilA11.every(({ k, p, s }) => p.cargoes.length === k.gt.cargoes.bentukDiterima[0].length && p.cargoesDropped === 0 && s.POST.jumlah.FATAL === 0))
  const berflag = hasilA11.filter(({ p }) => p.cargoes.some((c) => c.flags.length)).map(({ k }) => k.id)
  cek('A11b hanya E10 (OCR rusak) yang kehilangan nilai muatan — trade-off gagal-tertutup yang diketahui', JSON.stringify(berflag) === '["E10"]', berflag.join(','))
}

// =====================================================================
bagian('B. pemeriksa konsistensi GT ↔ sumber')
{
  const hist = {
    E1: G.periksaKonsistensiGtSumber(F1.bangunKasusEval1(new Date(`${HARI}T00:00:00Z`))),
    E2: G.periksaKonsistensiGtSumber(F2.bangunKasusEval2(new Date(`${HARI}T00:00:00Z`))),
    E3: G.periksaKonsistensiGtSumber(Object.values(K3)),
  }
  cek('B1 (R8) GT historis H20 TERDETEKSI tidak konsisten (K1: sawn timber + LOAD, GT hanya [])', hist.E3.gagal.length === 1 && hist.E3.gagal[0].kasus === 'H20' && hist.E3.gagal[0].aturan === 'K1')
  cek('B2 temuan historis lain: tak ada GAGAL di Eval-1/Eval-2; T07/H18 ("completion of discharge", "Discharging completed") bukan bukti operasi → tanpa INFO',
    hist.E1.lulus && hist.E2.lulus && [...hist.E1.temuan, ...hist.E2.temuan, ...hist.E3.temuan].filter((t) => t.aturan === 'K4').length === 0)
  cek('B3 kasus regresi Eval-4 lulus pemeriksa', G.periksaKonsistensiGtSumber(RG.KASUS_REGRESI_MUATAN).lulus)
  const mut = (teks, cargoes) => G.periksaKasus({ id: 'MUT', teks, gt: { cargoes } })
  cek('B4 mutasi K1: "load 5,000 MT coal" + GT [] → GAGAL', mut('Please load 5,000 MT coal', { bentukDiterima: [[]] }).some((t) => t.aturan === 'K1'))
  cek('B5 mutasi K2: GT nama "nickel ore" tak tertulis → GAGAL', mut('Please load 5,000 MT coal', { bentukDiterima: [[{ name: { status: 'PRESENT', value: 'nickel ore' }, quantity: { status: 'PRESENT', value: 5000 } }]] }).some((t) => t.aturan === 'K2'))
  cek('B6 mutasi K3: GT jumlah 7000 tak tertulis → GAGAL; 5000 dari "5,000" → lulus', mut('Please load 5,000 MT coal', { bentukDiterima: [[{ name: { status: 'PRESENT', value: 'coal' }, quantity: { status: 'PRESENT', value: 7000 } }]] }).some((t) => t.aturan === 'K3') &&
    mut('Please load 5,000 MT coal', { bentukDiterima: [[{ name: { status: 'PRESENT', value: 'coal' }, quantity: { status: 'PRESENT', value: 5000 } }]] }).length === 0)
  cek('B7 NOT_SCORED tidak diklaim apa pun', mut('load coal', { status: 'NOT_SCORED' }).length === 0)
  cek('B8 CLI pemeriksa ada & membaca fixture tanpa menulis', /periksaKonsistensiGtSumber/.test(baca('prisma/check-gt-source-consistency.mjs')) && !/writeFile|appendFile|rmSync|unlink/.test(baca('prisma/check-gt-source-consistency.mjs') + baca('prisma/spike-gt-konsistensi.mjs')))
}

// =====================================================================
bagian('C. regresi R1–R12 ujung-ke-ujung (validator produksi → scorer-2)')
{
  const r = (cargoes) => skor2(RH20, denganMuatan(cargoes))
  const r1 = r([{ name: 'sawn timber', operation: 'LOAD' }])
  const p1 = validasi(denganMuatan([{ name: 'sawn timber', operation: 'LOAD' }]), RH20.teks).proposal
  cek('R1 H20 setia: POST mempertahankan sawn timber/LOAD; scorer 0 FATAL', p1.cargoes.length === 1 && p1.cargoes[0].operation === 'LOAD' && r1.RAW.jumlah.FATAL === 0 && r1.POST.jumlah.FATAL === 0)
  const raw2 = denganMuatan([{ name: 'sawn timber', quantity: 5000, unit: 'CBM', operation: 'LOAD' }])
  const p2 = validasi(raw2, RH20.teks).proposal
  const r2 = skor2(RH20, raw2)
  cek('R2 jumlah karangan: POST nama & LOAD tetap, jumlah/satuan null + flag; RAW F5_UNSUPPORTED; POST 0 FATAL',
    p2.cargoes[0].name === 'sawn timber' && p2.cargoes[0].operation === 'LOAD' && p2.cargoes[0].quantity === null && p2.cargoes[0].unit === null && p2.cargoes[0].flags.includes('CARGO_QUANTITY_NOT_IN_SOURCE') &&
      r2.RAW.fatal.some((f) => f.jenis === 'F5_UNSUPPORTED') && r2.POST.jumlah.FATAL === 0, `${fatal(r2.RAW)} → ${fatal(r2.POST)}`)
  const raw3 = denganMuatan([{ name: 'coal', quantity: 5000, unit: 'MT', operation: 'LOAD' }])
  const r3 = skor2(RH20, raw3)
  cek('R3 komoditas karangan: validator membuang baris; scorer RAW FATAL F5_UNSUPPORTED; POST 0 FATAL', validasi(raw3, RH20.teks).proposal.cargoes.length === 0 && r3.RAW.fatal.some((f) => f.jenis === 'F5_UNSUPPORTED') && r3.POST.jumlah.FATAL === 0)
  const q = (teks, n) => validasi({ classification: 'NEW_NOMINATION', vessels: [], cargoes: [{ name: 'coal', quantity: n, unit: 'MT', operation: 'LOAD' }] }, teks).proposal.cargoes[0]?.quantity
  cek('R4 jumlah berbukti bertahan: "5,000 MT coal"=5000, "5.000 MT"=5000, "CPO 10.000 MT"=10000; "5.000" bukan 5',
    q('load 5,000 MT coal', 5000) === 5000 && q('muat 5.000 MT coal', 5000) === 5000 && q('muat 5.000 MT coal', 5) === null &&
      validasi({ classification: 'NEW_NOMINATION', vessels: [], cargoes: [{ name: 'CPO', quantity: 10000, unit: 'MT', operation: 'LOAD' }] }, 'Kebutuhan : keagenan kapal untuk muat CPO di Bontang\nMuatan    : CPO 10.000 MT').proposal.cargoes[0].quantity === 10000)
  const op = validasi({ classification: 'NEW_NOMINATION', vessels: [], cargoes: [{ name: 'coal', operation: 'LOAD' }] }, 'Please discharge coal at Gresik').proposal.cargoes[0]
  cek('R5 "discharge coal" + LOAD → operasi tak bertahan (CONTRADICTS)', op.operation === null && op.flags.includes('CARGO_OPERATION_CONTRADICTS_SOURCE'))
  cek('R6 baris tanpa nama tetap dilewati', validasi(denganMuatan([{ quantity: 1, operation: 'LOAD' }]), RH20.teks).proposal.cargoes.length === 0)
  const RH18 = RGK['RG-H18']
  const r7 = (cargoes) => skor2(RH18, { classification: 'NOT_RELEVANT', vessels: [], cargoes })
  cek('R7 H18: operasi tanpa nama / nama karangan / kata umum → POST 0 FATAL; nama karangan RAW FATAL',
    [[{ operation: 'DISCHARGE' }], [{ name: 'iron ore', quantity: 30000, unit: 'MT', operation: 'DISCHARGE' }], [{ name: 'cargo', operation: 'DISCHARGE' }]].every((c) => r7(c).POST.jumlah.FATAL === 0) &&
      r7([{ name: 'iron ore', operation: 'DISCHARGE' }]).RAW.jumlah.FATAL === 1)
  cek('R8 GT historis H20 terdeteksi pemeriksa (lihat B1)', G.periksaKasus(H20).some((t) => t.aturan === 'K1' && t.tingkat === 'GAGAL'))
  const pdf = validasi(denganMuatan([{ name: 'coal', quantity: 5000, unit: 'MT', operation: 'LOAD' }]), null, 'PDF').proposal.cargoes[0]
  cek('R9 PDF/gambar: muatan UNVERIFIED_SOURCE, wajib konfirmasi', pdf.flags.includes('UNVERIFIED_SOURCE') && !P.cargoTepercaya(pdf) && P.cargoTepercaya({ ...pdf, confirmed: true }))
  cek('R10 baris lama tanpa metadata validasi TIDAK tepercaya', !P.cargoTepercaya({ name: 'coal', quantity: 5000, unit: 'MT', operation: 'LOAD', source: 'SOURCE_DOCUMENT' }))
  cek('R11 non-keagenan: syaratApproval menolak NOT_RELEVANT/UNSUPPORTED (uji penuh + kunci sumber: check-intake-policy.mjs [8])',
    ['NOT_RELEVANT', 'UNSUPPORTED_REQUEST'].every((c) => P.syaratApproval({ status: 'NEEDS_REVIEW', classification: c, proposal: p1, matches: { vessels: [], principal: P.cocokKosong(), customer: P.cocokKosong(), port: P.cocokKosong() }, duplicateLevel: 'NO_DUPLICATE', portalAccessCount: 0, keputusan: { duplicateDecision: null, decisionReason: null, duplicateConfirmed: false, portalExposureAck: false } }).includes('CLASSIFICATION_NOT_SUPPORTED')))
  const setia = G.muatanSetiaDariSumber(H20)
  cek('R12 pembangkit "sempurna" dari sumber: H20 → [SAWN TIMBER / LOAD], tanpa jumlah (bukan [] paksa)', setia.length === 1 && setia[0].name === 'SAWN TIMBER' && setia[0].operation === 'LOAD' && setia[0].quantity === null)
  cek('R12 keluaran sempurna-dari-sumber: GT historis → INCONCLUSIVE_GT (bukan F5 tersembunyi); GT RG-H20 → 0 FATAL, OK',
    skor2(H20, denganMuatan(setia)).integritasGt === 'INCONCLUSIVE_GT' && (() => { const x = skor2(RH20, denganMuatan(setia)); return x.POST.jumlah.FATAL === 0 && x.integritasGt === 'OK' })())
  cek('R12 H18 (tanpa komoditas) → [] ; tak ada komoditas yang ditebak', G.muatanSetiaDariSumber(RH18).length === 0)
}

// =====================================================================
bagian('D. Prompt v4 (kandidat Eval-4) — v3 tetap persis & aktif')
{
  const V3 = X.PROMPT_INTAKE_V3
  const V4 = X.PROMPT_INTAKE_V4
  const hashDari = (p) => createHash('sha256').update(p.system).update('\n').update(JSON.stringify(p.tool)).digest('hex')
  cek('D1 v3 TIDAK berubah: hash 8e326ac4… persis = ikatan Eval-3; versi 3/skema 3', V3.hash === '8e326ac496821be87d5bdf85f0eec8e46ac817a80062a4e0d1b46c3839e67eea' && V3.hash === F3.IKATAN_PROMPT_EVAL3.hashPrompt && V3.versi === '3' && V3.versiSkema === '3')
  cek('D2 v3 tetap AKTIF di jalur produksi (ekspor lama = v3)', X.VERSI_PROMPT_INTAKE === '3' && X.HASH_PROMPT_INTAKE === V3.hash && X.SYSTEM_PROMPT_INTAKE === V3.system && X.TOOL_INTAKE === V3.tool)
  cek('D3 v4: id sama, versi 4, skema 4, hash = sha256(prompt + "\\n" + skema) dan ≠ v3', V4.id === 'vessel-call-extract' && V4.versi === '4' && V4.versiSkema === '4' && V4.hash === hashDari(V4) && V4.hash !== V3.hash && /^[0-9a-f]{64}$/.test(V4.hash))
  const n3 = X.ATURAN_PROMPT_INTAKE.length
  cek('D4 delta teks minimal: v4 = v3 + SATU aturan di AKHIR (penomoran v3 tetap)', V4.system.startsWith(V3.system + '\n') && V4.system.slice(V3.system.length + 1) === `${n3 + 1}. ${X.ATURAN_MUATAN_V4.teks}` && X.ATURAN_PROMPT_INTAKE_V4.length === n3 + 1)
  const t = X.ATURAN_MUATAN_V4.teks
  cek('D5 aturan muatan: hanya dari bukti tertulis; jangan menyimpulkan/memperkirakan/mengarang jumlah; kosongkan jumlah & satuan; operasi hanya bila jelas; kata umum bukan muatan',
    /HANYA dari yang tertulis jelas/.test(t) && /Jangan pernah menyimpulkan, memperkirakan, atau mengarang jumlah/.test(t) && /kosongkan quantity dan unit/.test(t) && /operation \(LOAD\/DISCHARGE\) hanya bila dokumen jelas/.test(t) && /bukan nama muatan/.test(t))
  const buang = (tool) => JSON.parse(JSON.stringify(tool), (k, v) => (k === 'description' ? undefined : v))
  cek('D6 skema v4: bentuk, enum, dan field wajib SAMA dengan v3 (hanya deskripsi muatan berubah)', JSON.stringify(buang(V4.tool)) === JSON.stringify(buang(V3.tool)) &&
    JSON.stringify({ ...V4.tool.function.parameters.properties, cargoes: null }) === JSON.stringify({ ...V3.tool.function.parameters.properties, cargoes: null }))
  cek('D5b anti-kebocoran: contoh aturan v4 tidak memuat kalimat/komoditas fixture evaluasi (sawn timber, H20)', !/sawn timber|LAYANG BENGAWAN|Probolinggo/i.test(V4.system + JSON.stringify(V4.tool)) &&
    [...Object.values(K3), ...RG.KASUS_REGRESI_MUATAN].every((k) => !k.teks.toLowerCase().includes('pupuk curah')))
  cek('D7 deskripsi muatan v4: jumlah hanya bila tertulis; operasi hanya bila jelas', /HANYA bila angkanya tertulis/.test(V4.tool.function.parameters.properties.cargoes.items.properties.quantity.description) && /hanya bila dokumen jelas/.test(V4.tool.function.parameters.properties.cargoes.items.properties.operation.description))

  stub = () => jawabTool('anthropic/claude-sonnet-4.5')
  permintaan.length = 0
  const catat = []
  await PR.jalankanDenganKonteks({ model: null, kemampuan: null, catat: (m) => catat.push(m) }, () => X.ekstrakDenganBatasWaktu(X.ekstrakLewatOpenRouter, { kind: 'TEXT', text: 'Nominasi MV Contoh' }, 5000))
  const b3 = JSON.parse(permintaan[0]?.init.body ?? '{}')
  cek('D8 jalur produksi mengirim v3 PERSIS (system & tool), buku besar versi 3/hash v3', permintaan.length === 1 && b3.messages[0].content === V3.system && JSON.stringify(b3.tools) === JSON.stringify([V3.tool]) && catat[0]?.promptVersion === '3' && catat[0]?.promptHash === V3.hash)
  stub = () => jawabTool('anthropic/claude-sonnet-5')
  permintaan.length = 0
  catat.length = 0
  await PR.jalankanDenganKonteks({ model: null, kemampuan: null, catat: (m) => catat.push(m) }, () =>
    X.ekstrakDenganBatasWaktu(X.buatEkstraktorOpenRouter(V4, { modelWajib: 'anthropic/claude-sonnet-5', servedWajib: 'anthropic/claude-sonnet-5' }), { kind: 'TEXT', text: 'Nominasi MV Contoh' }, 5000))
  const b4 = JSON.parse(permintaan[0]?.init.body ?? '{}')
  cek('D9 ekstraktor v4 eksplisit mengirim v4 (system & tool) dan mencatat versi 4/skema 4/hash v4', permintaan.length === 1 && b4.messages[0].content === V4.system && JSON.stringify(b4.tools) === JSON.stringify([V4.tool]) && catat[0]?.promptVersion === '4' && catat[0]?.schemaVersion === '4' && catat[0]?.promptHash === V4.hash)
  cek('D10 buku besar tak menyimpan teks prompt v4', !JSON.stringify(catat).includes('MUATAN') && !JSON.stringify(catat).includes('Anda membaca'))
}

// =====================================================================
bagian('E. Sonnet 5 gagal-tertutup (tanpa fallback Sonnet 4.5, tanpa ulang, tanpa pengganti)')
{
  const S5 = 'anthropic/claude-sonnet-5'
  const S45 = 'anthropic/claude-sonnet-4.5'
  const catatE = []
  const coba = async (opsi, konteksModel = null, served = S5) => {
    stub = () => jawabTool(served)
    permintaan.length = 0
    catatE.length = 0
    try {
      await PR.jalankanDenganKonteks({ model: konteksModel, kemampuan: null, catat: (m) => catatE.push(m) }, () =>
        X.ekstrakDenganBatasWaktu(X.buatEkstraktorOpenRouter(X.PROMPT_INTAKE_V4, opsi), { kind: 'TEXT', text: 'Nominasi MV Contoh' }, 5000))
      return { ok: true, n: permintaan.length, body: JSON.parse(permintaan[0]?.init.body ?? '{}') }
    } catch (e) {
      return { ok: false, kode: e?.kode ?? String(e), n: permintaan.length, body: JSON.parse(permintaan[0]?.init.body ?? '{}') }
    }
  }
  cek('E0 identitas owner: EXPECTED_MODEL_ID = anthropic/claude-sonnet-5; EXPECTED_SERVED_MODEL_ID BELUM diverifikasi (null, tak ditebak)', M.EXPECTED_MODEL_ID === S5 && M.EXPECTED_SERVED_MODEL_ID === null)
  cek('E1 bawaan klien (SPK_MODEL) masih Sonnet 4.5 → itulah fallback yang wajib diblok', OR.SPK_MODEL === S45)
  const tanpaServed = (() => { try { M.opsiEkstraktorEval4(); return null } catch (e) { return String(e.message) } })()
  cek('E2 opsi Eval-4 MENOLAK selama identitas dilayani belum diverifikasi → run LIVE mustahil', tanpaServed === 'INCONCLUSIVE_MODEL_IDENTITY:SERVED_BELUM_DIVERIFIKASI')
  const tolakOpsi = (x) => { try { M.opsiEkstraktorEval4(x); return null } catch (e) { return String(e.message) } }
  cek('E3 opsi Eval-4 menolak model diminta kosong / Sonnet 4.5 / dilayani Sonnet 4.5', /EXPECTED_MODEL_ID_TIDAK_ADA/.test(tolakOpsi({ diminta: '', dilayani: S5 })) && /BUKAN_MODEL_OWNER/.test(tolakOpsi({ diminta: S45, dilayani: S5 })) && /SERVED_MODEL_HISTORIS/.test(tolakOpsi({ diminta: S5, dilayani: S45 })))
  const kosongModel = await coba({ modelWajib: '' })
  cek('E4 modelWajib kosong → ditolak TANPA panggilan (bukan jatuh ke SPK_MODEL)', !kosongModel.ok && kosongModel.kode === 'AI_UNAVAILABLE' && kosongModel.n === 0)
  const konteks45 = await coba({ modelWajib: S5, servedWajib: S5 }, S45)
  cek('E5 konteks agen meminta Sonnet 4.5 → ditolak TANPA panggilan (tanpa substitusi)', !konteks45.ok && konteks45.n === 0)
  const ok = await coba({ modelWajib: S5, servedWajib: S5 })
  cek('E6 tanpa konteks: badan permintaan model = Sonnet 5 PERSIS, tanpa models/route (bukan SPK_MODEL)', ok.ok && ok.n === 1 && ok.body.model === S5 && ok.body.models === undefined && ok.body.route === undefined && M.periksaBadanPermintaanEval4(ok.body).length === 0)
  const dilayani45 = await coba({ modelWajib: S5, servedWajib: S5 }, null, S45)
  cek('E7 penyedia melayani Sonnet 4.5 → gagal, TEPAT satu panggilan (tanpa ulang)', !dilayani45.ok && dilayani45.kode === 'AI_UNAVAILABLE' && dilayani45.n === 1)
  cek('E7b buku besar mencatat SEKALI: diminta Sonnet 5, DILAYANI Sonnet 4.5 (bukti forensik), status ERROR', catatE.length === 1 && catatE[0].requestedModel === S5 && catatE[0].servedModel === S45 && catatE[0].status === 'ERROR')
  const tanpaServedMeta = await coba({ modelWajib: S5, servedWajib: S5 }, null, null)
  cek('E8 penyedia tak melaporkan model dilayani → gagal, tanpa ulang', !tanpaServedMeta.ok && tanpaServedMeta.n === 1)
  const lama = await coba({})
  cek('E9 lingkup: tanpa opsi Eval-4, perilaku historis jalur umum tak diubah (fallback SPK_MODEL tetap ada di luar Eval-4)', lama.ok && lama.body.model === S45)
  const cekId = (x) => M.periksaIdentitasModel(x, { diminta: S5, dilayani: S5 })
  cek('E10 periksaIdentitasModel: beda/tak ada/ambigu/historis → INCONCLUSIVE_MODEL_IDENTITY, berhenti, tanpa ulang/pengganti',
    [{ diminta: S5, dilayani: 'anthropic/claude-sonnet-5-preview' }, { diminta: S5, dilayani: null }, { diminta: S5, dilayani: `${S5}, ${S45}` }, { diminta: S5, dilayani: S45 }, { diminta: undefined, dilayani: S5 }, { diminta: S45, dilayani: S5 }]
      .map(cekId).every((r) => !r.ok && r.status === 'INCONCLUSIVE_MODEL_IDENTITY' && r.berhenti === true && r.ulang === false && r.pengganti === null) && cekId({ diminta: S5, dilayani: S5 }).ok)
  cek('E11 periksaIdentitasModel memakai harapan bawaan (served null) → selalu menolak', M.periksaIdentitasModel({ diminta: S5, dilayani: S5 }).alasan === 'SERVED_BELUM_DIVERIFIKASI')
  cek('E12 periksaBadanPermintaanEval4: tanpa model / Sonnet 4.5 / larik fallback / allow_fallbacks → ditolak',
    M.periksaBadanPermintaanEval4({}).includes('MODEL_TIDAK_ADA') && M.periksaBadanPermintaanEval4({ model: S45 }).includes('MODEL_HISTORIS_DIMINTA') &&
      M.periksaBadanPermintaanEval4({ model: S5, models: [S5, S45] }).includes('FALLBACK_DIMINTA') && M.periksaBadanPermintaanEval4({ model: S5, provider: { allow_fallbacks: true } }).includes('FALLBACK_DIMINTA'))
  const siap = M.kesiapanLiveEval4({ otorisasiOwnerLive: true, dilayani: S5 })
  cek('E13 kesiapan LIVE Eval-4 SELALU tidak siap di commit ini (runner belum ada; otorisasi owner = gerbang terpisah)', !M.kesiapanLiveEval4().siap && !siap.siap && siap.alasan.includes('RUNNER_EVAL4_BELUM_DIBANGUN'))
}

// =====================================================================
bagian('F. kunci lingkup & efek samping')
{
  cek('F1 Sonnet 5 TETAP PENDING_SPIKE di registri (tanpa promosi)', MC.PETA_KEMAMPUAN_MODEL.find((m) => m.slug === 'anthropic/claude-sonnet-5')?.status === 'PENDING_SPIKE')
  cek('F2 tak ada runner LIVE Eval-4 / skrip npm LIVE Eval-4', !readdirSync(join(AKAR, 'prisma')).some((f) => /eval4.*runner|runner.*eval4/i.test(f)) && !Object.keys(JSON.parse(baca('package.json')).scripts).some((s) => /eval4/i.test(s) && !/prep/.test(s)))
  cek('F3 modul Eval-4 luring tanpa jaringan/kunci/DB', ['prisma/spike-eval4-scorer.mjs', 'prisma/spike-gt-konsistensi.mjs', 'prisma/spike-eval4-identitas-model.mjs', 'prisma/fixtures/spike-intake/eval4-regresi-muatan.mjs'].every((f) => !/fetch\(|OPENROUTER_API_KEY|PrismaClient|process\.env/.test(baca(f))))
  cek('F4 fixture & scorer historis tidak berubah (Eval-3 SHA c6098c1a…, scorer-1 e5c89ca4…)', sha('prisma/fixtures/spike-intake/eval3-cases.mjs') === 'c6098c1a06a9cc771e202b15c65fd38d351a89a258f03985002ef4a3450853d1' && sha('prisma/spike-eval1-scorer.mjs') === 'e5c89ca4ca917ea51856ab74795e388ac91860e1cd8843fd16294cdda300f493')
  cek('F5 semua "panggilan penyedia" di uji ini berakhir di stub (openrouter.ai tersimulasi, nol jaringan nyata)', permintaan.every((p) => /openrouter\.ai/.test(p.url)))
}

// =====================================================================
bagian('G. Leksikon maritim & celah grounding (audit alias — kasus serangan A–P + tambahan)')
{
  const LX = muat('src/lib/maritim-lexicon.ts')
  const c1 = (teks, cargo, jenis = 'TEXT') => validasi({ classification: 'NEW_NOMINATION', vessels: [], cargoes: [cargo] }, teks, jenis).proposal.cargoes[0] ?? null
  const q = (teks, cargo) => c1(teks, cargo)?.quantity
  const K1 = Object.fromEntries(F1.bangunKasusEval1(new Date(`${HARI}T00:00:00Z`)).map((k) => [k.id, k]))
  cek('G0 leksikon: versi, modul data tanpa impor, tanpa lookbehind; DISCH hanya konteks BARIS_MUATAN; DISCHG/LDG/LOADG/TON/TONS/M/T TIDAK ada',
    LX.VERSI_LEKSIKON === 'maritim-lexicon/1' && !/^\s*import\s/m.test(baca('src/lib/maritim-lexicon.ts')) && !/\(\?<[!=a-zA-Z]/.test(baca('src/lib/maritim-lexicon.ts')) &&
      LX.OPERASI_LEKSIKON.DISCHARGE.alias.includes('DISCH') && LX.OPERASI_LEKSIKON.DISCHARGE.konteks === 'BARIS_MUATAN' &&
      !JSON.stringify(LX.OPERASI_LEKSIKON).match(/"(DISCHG|LDG|LOADG|L D)"/) && !['TON', 'TONS', 'M T'].some((x) => LX.SATUAN_LEKSIKON.MT.alias.includes(x)) &&
      JSON.stringify(LX.SATUAN_LEKSIKON.MT.alias) === '["MT","METRIC TON","METRIC TONS","METRIC TONNE","METRIC TONNES","TONNE","TONNES"]' && JSON.stringify(LX.SATUAN_LEKSIKON.CBM.alias) === '["CBM","M3"]')
  cek('G0b setiap entri leksikon punya provenans; tak ada istilah niat keagenan (AGENT/AGENCY/NOMINATION) di leksikon', [...Object.values(LX.OPERASI_LEKSIKON), ...Object.values(LX.SATUAN_LEKSIKON)].every((e) => e.provenans.length > 0) && !/AGENT|AGENCY|NOMINAT|APPOINT/.test(baca('src/lib/maritim-lexicon.ts').replace(/^\s*\/\/.*$/gm, '')))
  // A–D uang / tarif / lumpsum / partikular
  cek('A "Jumlah : IDR 45.600.000" (E12) → bukan jumlah muatan', (() => { const c = c1(G.teksKasus(K1.E12), { name: 'Jasa keagenan', quantity: 45600000 }); return c && c.quantity === null && c.flags.includes('CARGO_QUANTITY_NOT_IN_SOURCE') })())
  cek('B "Freight rate: USD 9.75 per MT" (E13) → bukan jumlah muatan', q(G.teksKasus(K1.E13), { name: 'Coal', quantity: 9.75, unit: 'MT', operation: 'LOAD' }) === null)
  cek('C "Rate USD 5,000 lumpsum; coal" → bukan jumlah muatan', q('Rate USD 5,000 lumpsum; coal', { name: 'coal', quantity: 5000 }) === null && q('coal 5,000 lumpsum', { name: 'coal', quantity: 5000 }) === null)
  cek('D "MT SINAR JAYA GRT 1200" → bukan jumlah muatan (MT awalan kapal, GRT partikular)', q('MT SINAR JAYA ETA 12, load coal\nMT SINAR JAYA GRT 1200', { name: 'coal', quantity: 1200, unit: 'MT', operation: 'LOAD' }) === null &&
    q('Cargo: coal, DWT 45,000 MT', { name: 'coal', quantity: 45000, unit: 'MT' }) === null)
  // E–F operasi dari frasa non-operasi
  cek('E "vessel max load line 12m" → tanpa operasi LOAD', (() => { const c = c1('coal terminal, vessel max load line 12m', { name: 'coal', operation: 'LOAD' }); return c.operation === null && c.flags.includes('CARGO_OPERATION_NOT_IN_SOURCE') })())
  cek('F "Load port: Taboneo. Discharge port: Gresik. Cargo: coal" → tanpa operasi (bukan ambigu, bukan tebakan)', (() => { const c = c1('Load port: Taboneo. Discharge port: Gresik. Cargo: coal', { name: 'coal', operation: 'LOAD' }); return c.operation === null && c.flags.includes('CARGO_OPERATION_NOT_IN_SOURCE') && !c.flags.includes('CARGO_OPERATION_AMBIGUOUS') })())
  // G–K pengenal / tanggal / jam / rujukan / LOA
  cek('G "IMO 9998535" → bukan jumlah', q('MV LAYANG IMO 9998535, load coal 5,000 MT', { name: 'coal', quantity: 9998535 }) === null)
  cek('H "ETA 28 October 2026" → bukan jumlah (2026 / 28)', [2026, 28].every((n) => q('load coal, ETA 28 October 2026', { name: 'coal', quantity: n }) === null))
  cek('I "12:30" → bukan jumlah', [30, 12, 1230].every((n) => q('load coal at 12:30', { name: 'coal', quantity: n }) === null))
  cek('J "Ref 0412" → bukan jumlah', q('Ref 0412 load coal', { name: 'coal', quantity: 412 }) === null)
  cek('K "SNTLQB/LOA/0202" & "LOA 183,5 m" → LOA tak menjadi fakta jumlah muatan', q('No. SNTLQB/LOA/0202 load coal', { name: 'coal', quantity: 202 }) === null && q('coal, LOA 183,5 m', { name: 'coal', quantity: 183.5 }) === null)
  // L niat keagenan TIDAK dari leksikon
  cek('L "advise your agency fee" (H20) → validator tak pernah menaikkan klasifikasi; leksikon tanpa istilah niat', validasi({ ...DASAR_H20, cargoes: [] }, K3.H20.teks).classification === 'UNSUPPORTED_REQUEST' &&
    validasi({ ...DASAR_H20, classification: 'NOT_RELEVANT', cargoes: [] }, K3.H20.teks).classification === 'NOT_RELEVANT')
  // M–N
  cek('M "completion of discharge" / "Discharging completed" → bukan operasi DISCHARGE saat ini', ['coal: estimated departure two days after completion of discharge', 'coal discharging completed without incident'].every((t) => { const c = c1(t, { name: 'coal', operation: 'DISCHARGE' }); return c.operation === null && c.flags.includes('CARGO_OPERATION_NOT_IN_SOURCE') }))
  cek('N "Jasa bongkar muat coal" → ambigu, tak ada tebakan tunggal (dipertahankan + wajib konfirmasi)', (() => { const c = c1('Jasa bongkar muat coal di Gresik', { name: 'coal', operation: 'DISCHARGE' }); return c.operation === 'DISCHARGE' && c.flags.includes('CARGO_OPERATION_AMBIGUOUS') && !P.cargoTepercaya(c) })())
  // O perkiraan
  const o = c1('muatan sekitar 50.000 MT batubara', { name: 'batubara', quantity: 50000, unit: 'MT' })
  cek('O "sekitar 50.000 MT" → 50000 MT + APPROXIMATE_QUANTITY, wajib konfirmasi', o.quantity === 50000 && o.unit === 'MT' && o.flags.includes('APPROXIMATE_QUANTITY') && !P.cargoTepercaya(o) && P.PERLU_KONFIRMASI_CARGO.includes('APPROXIMATE_QUANTITY'))
  cek('O2 "+/- 7.500 MT" & "approx. 7,500 MT" → APPROXIMATE_QUANTITY; angka pasti "15.000 MT" → tanpa flag', c1('Muatan : Batubara total 15.000 MT (tongkang +/- 7.500 MT)', { name: 'Batubara', quantity: 7500, unit: 'MT' }).flags.includes('APPROXIMATE_QUANTITY') &&
    c1('approx. 7,500 MT coal was loaded', { name: 'coal', quantity: 7500, unit: 'MT' }).flags.includes('APPROXIMATE_QUANTITY') && c1('Muatan : Batubara total 15.000 MT (tongkang +/- 7.500 MT)', { name: 'Batubara', quantity: 15000, unit: 'MT' }).flags.length === 0)
  // P OCR angka
  const pOcr = c1('Carg0 :  Nicke1 0re   1O.000 MT   DISCH', { name: 'Nickel Ore', quantity: 10000, unit: 'MT', operation: 'DISCHARGE' })
  cek('P "Carg0 : Nicke1 0re 1O.000 MT DISCH" → Nickel Ore / 10000 / MT / DISCHARGE + OCR_CORRECTED, wajib konfirmasi', pOcr.quantity === 10000 && pOcr.unit === 'MT' && pOcr.operation === 'DISCHARGE' && pOcr.flags.includes('OCR_CORRECTED') && !P.cargoTepercaya(pOcr))
  cek('P2 OCR angka TIDAK menebak: tanpa satuan tepat sesudahnya / <2 digit asli / nilai beda / huruf lain → dikosongkan',
    q('Cargo: nickel ore 1O.000 in bulk', { name: 'nickel ore', quantity: 10000 }) === null && q('Cargo: nickel ore lO MT', { name: 'nickel ore', quantity: 10 }) === null &&
      q('Cargo: nickel ore 1O.000 MT', { name: 'nickel ore', quantity: 1000 }) === null && q('Cargo: nickel ore 1Q.000 MT', { name: 'nickel ore', quantity: 10000 }) === null)
  // tambahan (≥ 20 kasus total)
  cek('Q satuan hanya TEPAT sesudah angka: "5000 tons" (TON bukan MT) & "5000 M/T" → jumlah & satuan kosong', [['load coal 5000 tons', 'MT'], ['load coal 5000 M/T', 'MT']].every(([t, u]) => { const c = c1(t, { name: 'coal', quantity: 5000, unit: u, operation: 'LOAD' }); return c.quantity === null && c.unit === null }))
  cek('R CBM: "3200 m³" / "3200 m3" / "3200 CBM" berbukti; MT↔CBM tak dikonversi', ['load clinker 3200 m³', 'load clinker 3200 m3', 'load clinker 3200 CBM'].every((t) => { const c = c1(t, { name: 'clinker', quantity: 3200, unit: 'CBM' }); return c.quantity === 3200 && c.unit === 'CBM' }) &&
    (() => { const c = c1('load clinker 3200 CBM', { name: 'clinker', quantity: 3200, unit: 'MT' }); return c.quantity === 3200 && c.unit === null && c.flags.includes('CARGO_UNIT_NOT_IN_SOURCE') })())
  cek('S tarif muat "5,000 MT per day" / "5,000 MT/day" → bukan jumlah muatan', ['coal load rate 5,000 MT per day', 'coal 5,000 MT/day'].every((t) => q(t, { name: 'coal', quantity: 5000 }) === null))
  cek('T DISCH hanya di konteks muatan: "Next port DISCH Gresik" tanpa nama/label muatan → bukan bukti', (() => { const c = c1('coal for Samarinda\nNext port DISCH Gresik', { name: 'coal', operation: 'DISCHARGE' }); return c.operation === null })())
  cek('U DISCHG / LDG tidak dikenal (belum disetujui owner)', c1('Cargo: coal 5,000 MT DISCHG', { name: 'coal', operation: 'DISCHARGE' }).operation === null && c1('Cargo: coal 5,000 MT LDG', { name: 'coal', operation: 'LOAD' }).operation === null)
  cek('V operasi per baris: dua kapal (E05) — coal LOAD & gypsum DISCHARGE masing-masing tunggal, bukan ambigu', (() => { const t = G.teksKasus(K1.E05); const a = c1(t, { name: 'coal', operation: 'LOAD' }); const b = c1(t, { name: 'gypsum', operation: 'DISCHARGE' }); return a.operation === 'LOAD' && b.operation === 'DISCHARGE' && !a.flags.length && !b.flags.length })())
  cek('X uang yang BERSEBELAHAN satuan / sesudah label jumlah tetap bukan jumlah: "coal USD 9.75 MT", "Jumlah: 45.600.000 IDR"', q('Cargo: coal USD 9.75 MT', { name: 'coal', quantity: 9.75 }) === null && q('Cargo: coal\nJumlah: 45.600.000 IDR', { name: 'coal', quantity: 45600000 }) === null)
  cek('Y OCR angka lewat label jumlah TANPA satuan tetap ditolak: "Quantity: 1O.000"', q('Cargo: nickel ore\nQuantity: 1O.000', { name: 'nickel ore', quantity: 10000 }) === null)
  cek('W label jumlah tanpa satuan: "Quantity: 5000" berbukti (satuan tetap kosong); "Jumlah : IDR 5000" tidak', q('Cargo: coal\nQuantity: 5000', { name: 'coal', quantity: 5000 }) === 5000 && q('Cargo: coal\nJumlah : IDR 5000', { name: 'coal', quantity: 5000 }) === null)
}

// =====================================================================
bagian('H. Regresi historis (fixture beku — tidak diubah)')
{
  const K1 = Object.fromEntries(F1.bangunKasusEval1(new Date(`${HARI}T00:00:00Z`)).map((k) => [k.id, k]))
  const pil = (n) => (!n || !('status' in n) ? null : n.status === 'PRESENT' ? n.value : n.status === 'ACCEPTABLE' ? n.values.find((x) => x !== null) ?? null : null)
  const muatanGt = (k) => (k.gt.cargoes?.bentukDiterima?.[0] ?? []).map((r) => Object.fromEntries(['name', 'quantity', 'unit', 'operation'].map((f) => [f, pil(r[f])]).filter(([, x]) => x !== null)))
  const vk = (k, cargoes) => validasi({ classification: 'NEW_NOMINATION', vessels: [], cargoes }, G.teksKasus(k), k.kind === 'PDF' ? 'PDF' : 'TEXT').proposal
  cek('H-E09 (PDF): muatan GT dipertahankan tetapi UNVERIFIED_SOURCE → wajib konfirmasi (PDF tak di-grounding)', (() => { const p = vk(K1.E09, muatanGt(K1.E09)); return p.cargoes.length === 1 && p.cargoes[0].flags.includes('UNVERIFIED_SOURCE') && !P.cargoTepercaya(p.cargoes[0]) })())
  cek('H-E10: muatan GT pulih (10000 MT DISCHARGE) + OCR_CORRECTED, wajib konfirmasi', (() => { const c = vk(K1.E10, muatanGt(K1.E10))[`cargoes`][0]; return c.quantity === 10000 && c.operation === 'DISCHARGE' && c.flags.includes('OCR_CORRECTED') && !P.cargoTepercaya(c) })())
  cek('H-E12: uang invoice bukan jumlah muatan', vk(K1.E12, [{ name: 'Jasa keagenan', quantity: 45600000 }]).cargoes.every((c) => c.quantity === null))
  cek('H-E13: jumlah GT 50,000 MT bertahan PASTI; tarif 9.75 & port dues 12500 tidak', (() => { const p = vk(K1.E13, muatanGt(K1.E13)); return p.cargoes[0].quantity === 50000 && p.cargoes[0].flags.length === 0 })() &&
    [9.75, 12500].every((n) => vk(K1.E13, [{ name: 'Coal', quantity: n, unit: 'MT' }]).cargoes[0].quantity === null))
  const H18 = K3.H18
  cek('H-H18: komoditas karangan dibuang; operasi tanpa nama tak jadi baris', vk(H18, [{ name: 'iron ore', quantity: 30000, unit: 'MT', operation: 'DISCHARGE' }]).cargoes.length === 0 && vk(H18, [{ operation: 'DISCHARGE' }]).cargoes.length === 0)
  cek('H-H20: sawn timber / LOAD setia dipertahankan; GT historis → INCONCLUSIVE_GT (bukan F5)', vk(K3.H20, [{ name: 'sawn timber', operation: 'LOAD' }]).cargoes[0].operation === 'LOAD' &&
    skor2(K3.H20, denganMuatan([{ name: 'sawn timber', operation: 'LOAD' }])).integritasGt === 'INCONCLUSIVE_GT')
  cek('H-RG-H18 / RG-H20: setia → 0 FATAL, integritas OK', skor2(RGK['RG-H20'], denganMuatan([{ name: 'sawn timber', operation: 'LOAD' }])).POST.jumlah.FATAL === 0 &&
    (() => { const r = skor2(RGK['RG-H18'], { classification: 'NOT_RELEVANT', vessels: [], cargoes: [] }); return r.POST.jumlah.FATAL === 0 && r.integritasGt === 'OK' })())
  cek('H-scorer-3: uang di sumber TIDAK menjadi "berbukti" → jumlah uang tetap F5_UNSUPPORTED (bukan GT_CONFLICT)', (() => {
    const k = { ...RH20, teks: RH20.teks + '\nRate USD 5,000 lumpsum for sawn timber' }
    return skor2(k, denganMuatan([{ name: 'sawn timber', quantity: 5000, operation: 'LOAD' }])).RAW.fatal.some((f) => f.jenis === 'F5_UNSUPPORTED')
  })())
}

// =====================================================================
bagian('K. linkExistingIntake — klasifikasi non-keagenan tak bisa ditautkan (OWNER D10)')
{
  const svc = baca('src/services/intake/intake.service.ts')
  const link = svc.slice(svc.indexOf('export async function linkExistingIntake('), svc.indexOf('\n}\n', svc.indexOf('export async function linkExistingIntake(')))
  cek('K1 daftar-izin: NEW_* & INSUFFICIENT boleh; NOT_RELEVANT, UNSUPPORTED_REQUEST, klasifikasi tak dikenal → tidak (gagal-tertutup)',
    ['NEW_NOMINATION', 'NEW_APPOINTMENT', 'INSUFFICIENT_INFORMATION'].every(P.bolehTautkanVoyage) && !['NOT_RELEVANT', 'UNSUPPORTED_REQUEST', 'APPROVE_NOW', '', 'new_nomination'].some(P.bolehTautkanVoyage))
  const iG = link.indexOf('P.bolehTautkanVoyage(row.classification)')
  cek('K2 pagar dijalankan SEBELUM hitung duplikat & SEBELUM tulis intake (updateMany/catatAudit)', iG > 0 && iG < link.indexOf('hitungDuplikat(') && iG < link.indexOf('updateMany(') && iG < link.indexOf('catatAudit(') && /CLASSIFICATION_NOT_LINKABLE/.test(link))
  const ui = baca('src/components/automation/IntakeReview.tsx')
  cek('K3 UI tidak menawarkan "Tautkan" untuk klasifikasi yang diblok', /bisaEdit && c\.type === 'VOYAGE' && bolehTautkanVoyage\(d\.classification\) && \(/.test(ui) && /bisaEdit && bolehTautkanVoyage\(d\.classification\) && <p[^>]*>\{t\.linkNote\}/.test(ui))
  const reg = baca('docs/TAH-TECH-DEBT.md')
  cek('K4 TD-005-03 (alur pembaruan operasional kelak) tercatat OPEN selama UNSUPPORTED_REQUEST tak bisa ditautkan', /## TD-005-03[\s\S]*?- Status: OPEN/.test(reg) && !P.bolehTautkanVoyage('UNSUPPORTED_REQUEST'))
}

console.log(`\n${gagal === 0 ? '✅ SEMUA LULUS' : '❌ ADA YANG GAGAL'} — lulus ${lulus}, gagal ${gagal}`)
process.exit(gagal === 0 ? 0 : 1)
