// Uji Validator V3 (SPEC:V3 docs/PRD-005-VALIDATOR-V3.md + ADDENDUM-1). LURING, deterministik, tanpa jaringan/DB/model.
//
//   node prisma/check-validator-v3.mjs            (bagian X/E butuh riwayat git untuk validator dasar d097fe5)
//
// Uji disusun per KELAS ATURAN dengan kosakata netral (BUKAN salinan kasus W/Z). Eval-5 & Eval-6 = REGRESSION ONLY:
// hasilnya DILAPORKAN (overall / tepercaya / review / null), tidak dioptimasi.

import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as S3 from './spike-eval4-scorer.mjs'
import * as G from './spike-gt-konsistensi.mjs'
import * as R3 from './spike-eval3-runner.mjs'
import * as RG from './fixtures/spike-intake/eval4-regresi-muatan.mjs'
import * as F1 from './fixtures/spike-intake/eval1-cases.mjs'
import * as F2 from './fixtures/spike-intake/eval2-cases.mjs'
import * as F3 from './fixtures/spike-intake/eval3-cases.mjs'
import * as F4 from './fixtures/spike-intake/eval4-heldout-cases.mjs'
import * as D5 from './fixtures/spike-intake/eval5-blind-cases.mjs'
import * as D6 from './fixtures/spike-intake/eval6-blind-cases.mjs'
import * as KV3 from './spike-kandidat-v3.mjs'

const AKAR = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(import.meta.url)
const jiti = require('jiti')(fileURLToPath(import.meta.url), { alias: { '@': join(AKAR, 'src') }, interopDefault: true })
const P = jiti(join(AKAR, 'src/services/intake/intake-policy.ts'))
const V = jiti(join(AKAR, 'src/lib/vessels.ts'))
const L3 = jiti(join(AKAR, 'src/lib/maritim-lexicon-v3.ts'))
const sha = (rel) => createHash('sha256').update(readFileSync(join(AKAR, rel))).digest('hex')
const baca = (rel) => readFileSync(join(AKAR, rel), 'utf8')

let lulus = 0
let gagal = 0
const hitung = {}
let bagianAktif = ''
function cek(nama, kondisi, detail = '') {
  hitung[bagianAktif] ??= { lulus: 0, gagal: 0 }
  if (kondisi) {
    lulus++
    hitung[bagianAktif].lulus++
  } else {
    gagal++
    hitung[bagianAktif].gagal++
  }
  console.log(`  ${kondisi ? '✅' : '❌'} ${nama}${!kondisi && detail ? ` — ${detail}` : ''}`)
}
const bagian = (kode, j) => {
  bagianAktif = kode
  console.log(`\n${j}`)
}
let fetchNyata = 0
globalThis.fetch = async () => {
  fetchNyata++
  throw new Error('JARINGAN_DILARANG')
}

const NORM = { imo: V.normalisasiImo, imoSah: V.imoCheckDigitSah, mmsi: V.normalisasiMmsi, mmsiSah: V.mmsiSah, callSign: V.normalisasiCallSign }
const NORM_SKOR = { namaKapal: P.normalisasiNamaKapal, namaPort: P.normalisasiNamaPort, namaPihak: P.normalisasiNamaPihak, unlocode: P.normalisasiUnlocode, imo: V.normalisasiImo, mmsi: V.normalisasiMmsi, callSign: V.normalisasiCallSign }
const HARI = '2026-09-28'
const H = new Date(`${HARI}T00:00:00Z`)
const validasi = (raw, teks, PX = P) => PX.validasiEkstraksi(structuredClone(raw), { inputKind: 'TEXT', sourceText: PX.normalisasiTeksSumber(teks), hariIni: HARI, norm: NORM })
const baris = (teks, cargoes, extra = {}) => validasi({ classification: 'NEW_NOMINATION', vessels: [{ name: 'MV UJI VTIGA' }], cargoes, ...extra }, teks).proposal.cargoes
const muat = (teks, cargo, extra) => baris(teks, [cargo], extra)[0] ?? null
const c = (name, quantity = null, unit = null, operation = null) => ({ name, quantity, unit, operation })
const f = (x) => JSON.stringify(x)
const tepercaya = (x) => !!x && P.cargoTepercaya(x)
const ada = (x, fl) => !!x && x.flags.includes(fl)

// ============================================================================ G tata kelola
bagian('G', 'G. Tata kelola: spesifikasi beku, leksikon v3, v1/v2 historis')
{
  cek('G1 spesifikasi V3 beku (sha tercatat di kandidat)', sha('docs/PRD-005-VALIDATOR-V3.md') === KV3.SHA_SPEK_V3)
  cek('G2 adendum keselamatan-1 beku (sha tercatat di kandidat)', sha('docs/PRD-005-VALIDATOR-V3-ADDENDUM-1.md') === KV3.SHA_ADENDUM_V3)
  cek('G3 leksikon v3 berversi maritim-lexicon/3, provenans SPEC:V3', L3.VERSI_LEKSIKON === 'maritim-lexicon/3' && L3.PROVENANS === 'SPEC:V3')
  cek('G4 leksikon v3 tanpa impor, tanpa lookbehind, tanpa provenans kasus evaluasi (E5:/E6:)', !/^\s*import\s/m.test(baca('src/lib/maritim-lexicon-v3.ts')) && !/\(\?<[!=a-zA-Z]/.test(baca('src/lib/maritim-lexicon-v3.ts')) && !/E[56]:/.test(baca('src/lib/maritim-lexicon-v3.ts')))
  cek('G5 v1 & v2 byte-identik (artefak historis)', sha('src/lib/maritim-lexicon.ts') === '864e4e3bf4cb47ef6e1d112ad42b5c9efd9d402c459e2d8be465f0bbab41fb83' && sha('src/lib/maritim-lexicon-v2.ts') === 'b459c81add6823fda1541f6a170bb977f35b6bb0d77e5994774637cd8ece24a5')
  cek('G6 validator mengimpor HANYA v3; penilai scorer-3 & pemeriksa GT tetap v1 (tak diubah)', /from '\.\.\/\.\.\/lib\/maritim-lexicon-v3'/.test(baca('src/services/intake/intake-policy.ts')) && !/maritim-lexicon-v2/.test(baca('src/services/intake/intake-policy.ts').replace(/^\/\/.*$/gm, '')) && /from '\.\.\/src\/lib\/maritim-lexicon\.ts'/.test(baca('prisma/spike-eval4-scorer.mjs')))
  cek('G7 TIDAK ada daftar inklusi satuan terbuka: satu-satunya daftar satuan diterima = alias v2 beku (MT/CBM/WMT/KL), tanpa TON', JSON.stringify(Object.keys(L3.ALIAS_SATUAN_WARISAN)) === '["MT","CBM","WMT","KL"]' && !Object.values(L3.ALIAS_SATUAN_WARISAN).flat().some((x) => /^TONS?$/.test(x)))
  cek('G8 prompt v4 & perekat rute TIDAK diubah (sha kandidat Eval-5)', ['src/lib/ai/vessel-call-extract.ts', 'src/lib/ai/model-capabilities.ts', 'src/lib/ai/openrouter.ts'].every((r) => sha(r) === KV3.SHA_KANDIDAT_V3[r]))
  cek('G9 penilai beku (scorer-3) TIDAK diubah', sha('prisma/spike-eval4-scorer.mjs') === KV3.SHA_PENILAI_BEKU)
}

// ============================================================================ Q pasangan jumlah/satuan
bagian('Q', 'Q. Verifikasi pasangan jumlah + satuan (satuan sah apa pun yang tertulis; ejaan sumber — D1/D4)')
{
  const unik = [['drums', 'Please load 1200 drums lubricant at Kendari.', 'lubricant'], ['coils', 'Cargo: steel wire 350 coils, discharge', 'steel wire'], ['karung', 'Muatan: kopra 800 karung, bongkar', 'kopra'], ['TEU', 'Cargo: containers 64 TEU, load', 'containers'], ['bales', 'Cargo: cotton 900 bales, discharge', 'cotton'], ['pallets', 'Muatan: keramik 420 pallets, muat', 'keramik']]
  for (const [u, t, nm] of unik) {
    const q = Number((t.match(/\d+/) ?? [])[0])
    const r = muat(t, c(nm, q, u, t.includes('bongkar') || t.includes('discharge') ? 'DISCHARGE' : 'LOAD'))
    cek(`Q1 satuan tak terdaftar "${u}" tertulis tepat sesudah angka → jumlah & satuan dipertahankan (literal), informatif NONSTANDARD`, r?.quantity === q && r.unit === u && ada(r, 'CARGO_UNIT_NONSTANDARD') && tepercaya(r), f(r))
  }
  const ton = muat('Muatan: jagung 10,000 ton, muat', c('jagung', 10000, 'TON', 'LOAD'))
  cek('Q2 D1 model "TON", sumber "ton" → disimpan ejaan sumber "ton" (tanpa normalisasi ke MT)', ton?.quantity === 10000 && ton.unit === 'ton', f(ton))
  const tonMt = muat('Muatan: jagung 10,000 ton, muat', c('jagung', 10000, 'MT', 'LOAD'))
  cek('Q3 D1 model menormalkan ton→MT → pasangan usulan TIDAK tertulis → jumlah & satuan null (AM1)', tonMt?.quantity === null && tonMt.unit === null && ada(tonMt, 'CARGO_QUANTITY_NOT_IN_SOURCE'), f(tonMt))
  const leg = muat('load coal 5000 metric tons', c('coal', 5000, 'MT', 'LOAD'))
  cek('Q4 alias v2 beku: sumber "metric tons", model "MT" → dipertahankan (paritas v2)', leg?.quantity === 5000 && leg.unit === 'MT' && tepercaya(leg), f(leg))
  const wmt = muat('Cargo: nickel ore 55000 WMT, load', c('nickel ore', 55000, 'MT', 'LOAD'))
  cek('Q5 sumber WMT, model MT → jumlah tetap, satuan null (WMT tak pernah jadi MT)', wmt?.quantity === 55000 && wmt.unit === null && ada(wmt, 'CARGO_UNIT_NOT_IN_SOURCE'), f(wmt))
  const lekat = muat('Cargo: coal 5000MT, load', c('coal', 5000, 'MT', 'LOAD'))
  cek('Q6 satuan menempel "5000MT" → terverifikasi', lekat?.quantity === 5000 && lekat.unit === 'MT', f(lekat))
  const tak = muat('Cargo: coal 5000, load', c('coal', 5000, 'drums', 'LOAD'))
  cek('Q7 angka tanpa satuan tertulis → jumlah & satuan null', tak?.quantity === null && tak.unit === null, f(tak))
  const lbl = muat('Commodity: bauxite\nQty: 6000', c('bauxite', 6000, null, null))
  cek('Q8 label jumlah "Qty: 6000" (tanpa satuan) → jumlah dipertahankan', lbl?.quantity === 6000 && lbl.unit === null, f(lbl))
  const lblU = muat('Commodity: bauxite\nQuantity (WMT): 6000', c('bauxite', 6000, 'WMT', null))
  cek('Q9 satuan berlabel "Quantity (WMT): 6000" → jumlah & satuan WMT', lblU?.quantity === 6000 && lblU.unit === 'WMT', f(lblU))
  const salah = muat('Cargo: urea 3000 bags, discharge', c('urea', 3000, 'drums', 'DISCHARGE'))
  cek('Q10 satuan usulan beda dari tertulis (bags vs drums), bukan alias beku → jumlah & satuan null', salah?.quantity === null && salah.unit === null, f(salah))
  const tanpaU = muat('Cargo: urea 3000 bags, discharge', c('urea', 3000, null, 'DISCHARGE'))
  cek('Q11 model tanpa satuan + satuan terbuka tak diusulkan → jumlah null (AM1)', tanpaU?.quantity === null, f(tanpaU))
}

// ============================================================================ D kelas terlarang
bagian('D', 'D. Kelas satuan terlarang & pengecualian angka non-muatan')
{
  const kasus = [
    ['LOA 145 m', 'LOA 145 m. Cargo: coal load', 145, 'm'],
    ['kecepatan knots', 'Cargo: coal load, speed 12 knots', 12, 'knots'],
    ['waktu days', 'Cargo: coal load, laytime 3 days', 3, 'days'],
    ['waktu LT (AM2)', 'Cargo: coal load, arrived at 0915 LT', 915, 'LT'],
    ['badan usaha PT', 'Cargo: coal load for 2 PT Anugerah', 2, 'PT'],
    ['awalan kapal MV', 'Cargo: coal load, assisted by 2 MV Bahari', 2, 'MV'],
    ['tarif MT/day', 'Cargo: coal load rate 8000 MT/day', 8000, 'MT/day'],
    ['persen', 'Cargo: coal load, moisture 12 %', 12, '%'],
  ]
  for (const [nm, t, q, u] of kasus) {
    const r = muat(t, c('coal', q, u, 'LOAD'))
    cek(`D1 ${nm}: "${q} ${u}" tak pernah jadi jumlah muatan`, r?.quantity === null, f(r))
  }
  const partikular = [['DWT', 'DWT 55,000', 55000], ['GRT', 'GRT 4.500', 4500], ['NRT', 'NRT 2.100', 2100], ['DRAFT', 'Draft 9', 9], ['BEAM', 'Beam 24', 24], ['DEADWEIGHT', 'Deadweight 30000', 30000]]
  for (const [nm, frag, q] of partikular) {
    const r = muat(`Cargo: coal, ${frag} MT, load`, c('coal', q, 'MT', 'LOAD'))
    cek(`D2 partikular ${nm} → bukan jumlah (label mandiri)`, r?.quantity === null, f(r))
  }
  const kontak = [['telepon', 'Cargo: coal 5000 MT load. Call +62-812-3456-7890 MT', 7890], ['referensi', 'Cargo: coal load. Ref: ABC/2026/4500 MT', 4500], ['PO komposit', 'Cargo: coal load PO-4518-2207 MT', 2207], ['IMO', 'Cargo: coal load IMO 9876543 MT', 9876543], ['MMSI', 'Cargo: coal load MMSI 525123456 MT', 525123456], ['rekening', 'Cargo: coal load Acc 123456789 MT', 123456789], ['voyage', 'Cargo: coal load Voy 214 MT', 214], ['invoice', 'Cargo: coal load Invoice 7788 MT', 7788], ['dermaga', 'Cargo: coal load Dermaga 2 MT', 2]]
  for (const [nm, t, q] of kontak) {
    const r = muat(t, c('coal', q, 'MT', 'LOAD'))
    cek(`D3 ${nm} → bukan jumlah`, r?.quantity === null, f(r))
  }
  const uang = [['USD per MT', 'Cargo: coal load, freight USD 45 per MT', 45, 'MT'], ['Rp per KL', 'Cargo: HSD discharge, harga Rp 9.500 per KL', 9500, 'KL'], ['@ per karung', 'Cargo: semen 40.000 karung @ 50 kg, bongkar', 50, 'kg'], ['each', 'Cargo: transformer 86.4 MT each, discharge', 86.4, 'MT'], ['$', 'Cargo: coal load $ 12 MT', 12, 'MT'], ['sesudah angka', 'Cargo: coal load, 45 USD MT', 45, 'USD']]
  for (const [nm, t, q, u] of uang) {
    const r = muat(t, c(t.includes('HSD') ? 'HSD' : t.includes('semen') ? 'semen' : t.includes('transformer') ? 'transformer' : 'coal', q, u, null))
    cek(`D4 uang/tarif ${nm} → bukan jumlah`, r?.quantity === null, f(r))
  }
  const dim = muat('Cargo: plywood 2 x 40 MT, load', c('plywood', 40, 'MT', 'LOAD'))
  cek('D5 dimensi "2 x 40" → bukan jumlah', dim?.quantity === null, f(dim))
}

// ============================================================================ T token/batas
bagian('T', 'T. Batas token: nama komposit vs label partikular (aturan umum, bukan per fixture)')
{
  const h = muat('Cargo: steel H-beam 420 MT, discharge', c('steel H-beam', 420, 'MT', 'DISCHARGE'))
  cek('T1 "H-beam 420 MT" (komposit) → jumlah dipertahankan', h?.quantity === 420 && h.unit === 'MT' && tepercaya(h), f(h))
  const i = muat('Cargo: I-beam 300 units, load', c('I-beam', 300, 'units', 'LOAD'))
  cek('T2 "I-beam 300 units" (komposit, satuan non-massa D4) → dipertahankan literal', i?.quantity === 300 && i.unit === 'units', f(i))
  const wf = muat('Cargo: WF-beams 150 pcs, load', c('WF-beams', 150, 'pcs', 'LOAD'))
  cek('T3 "WF-beams 150 pcs" → dipertahankan', wf?.quantity === 150 && wf.unit === 'pcs', f(wf))
  const sb = muat('Cargo: steel beam 250 MT, load', c('steel beam', 250, 'MT', 'LOAD'))
  cek('T4 "steel beam 250 MT": BEAM di dalam nama muatan usulan → bukan label', sb?.quantity === 250, f(sb))
  const lepas = muat('Cargo: steel, Beam 250 MT, load', c('steel', 250, 'MT', 'LOAD'))
  cek('T5 "Beam 250 MT" berdiri sendiri (bukan bagian nama) → label partikular → bukan jumlah', lepas?.quantity === null, f(lepas))
  const lb = muat('LOA 145 m Beam 24 m\nCargo: steel, load', c('steel', 24, 'm', 'LOAD'))
  cek('T6 "Beam 24 m" → bukan jumlah (label + satuan panjang)', lb?.unit === null && lb.quantity === null, f(lb))
  const mtKapal = muat('Cargo: coal load. Sandar di Dermaga 2\nMT TESTKAPAL SATU tiba', c('coal', 2, 'MT', 'LOAD'), { vessels: [{ name: 'MT TESTKAPAL SATU' }] })
  cek('T7 "Dermaga 2" + "MT <kapal>" → nomor tambatan bukan jumlah', mtKapal?.quantity === null, f(mtKapal))
}

// ============================================================================ A perkiraan
bagian('A', 'A. Penanda perkiraan (menutup celah "±"): nilai literal + APPROXIMATE_QUANTITY, tak pernah tepercaya')
{
  const apx = [['±', 'Cargo: gypsum ± 5.000 MT, load', 5000], ['+/-', 'Cargo: gypsum +/- 5000 MT, load', 5000], ['approx.', 'Cargo: gypsum approx. 5000 MT, load', 5000], ['about', 'Cargo: gypsum about 5000 MT, load', 5000], ['circa', 'Cargo: gypsum circa 5000 MT, load', 5000], ['sekitar', 'Muatan: gipsum sekitar 5.000 MT, muat', 5000], ['kurang lebih', 'Muatan: gipsum kurang lebih 5.000 MT, muat', 5000], ['kira-kira', 'Muatan: gipsum kira-kira 5.000 MT, muat', 5000], ['ABT', 'CGO: GYPSUM ABT 5000 MT LOAD', 5000], ['ca.', 'Cargo: gypsum ca. 5000 MT, load', 5000], ['rentang ke-1', 'Cargo: gypsum 5.000-6.000 MT, load', 5000], ['rentang ke-2', 'Cargo: gypsum 5000-6000 MT, load', 6000], ['rentang TO', 'Cargo: gypsum 5000 to 6000 MT, load', 5000], ['toleransi', 'Cargo: gypsum 5000 MT (tolerance +/- 5%), load', 5000], ['MOLOO', 'Cargo: gypsum 5000 MT 10% MOLOO, load', 5000]]
  for (const [nm, t, q] of apx) {
    const nama = t.includes('GYPSUM') ? 'GYPSUM' : t.includes('gipsum') ? 'gipsum' : 'gypsum'
    const r = muat(t, c(nama, q, 'MT', 'LOAD'))
    cek(`A1 ${nm} → jumlah ${q} dipertahankan + APPROXIMATE_QUANTITY + tak tepercaya`, r?.quantity === q && ada(r, 'APPROXIMATE_QUANTITY') && !tepercaya(r), f(r))
  }
  const tgl = muat('Cargo: gypsum 5.000-6.000 MT, load', c('gypsum', 6000, 'MT', 'LOAD'))
  cek('A3 batasan terdokumentasi: "5.000-6.000" ujung ke-2 berbentuk tanggal → null (konservatif, masker tanggal lama)', tgl?.quantity === null, f(tgl))
  const grade = muat('Muatan (bongkar):\n1. Gasoline 90 - 18.000 KL', c('Gasoline 90', 90, 'KL', 'DISCHARGE'))
  cek('A4 AM5: "Gasoline 90 - 18.000 KL" bukan rentang → 90 tak pernah jumlah', grade?.quantity === null, f(grade))
  const g2 = muat('Muatan (bongkar):\n1. Gasoline 90 - 18.000 KL', c('Gasoline 90', 18000, 'KL', 'DISCHARGE'))
  cek('A5 … sedangkan 18.000 KL tetap terverifikasi, tanpa flag perkiraan', g2?.quantity === 18000 && !ada(g2, 'APPROXIMATE_QUANTITY'), f(g2))
  const pasti = muat('Cargo: gypsum 5,000 MT, load', c('gypsum', 5000, 'MT', 'LOAD'))
  cek('A2 angka pasti → tanpa flag perkiraan, tepercaya', pasti?.quantity === 5000 && !ada(pasti, 'APPROXIMATE_QUANTITY') && tepercaya(pasti), f(pasti))
}

// ============================================================================ O morfologi operasi
bagian('O', 'O. Famili morfologi operasi tertutup (tanpa panggilan AI)')
{
  const kuat = [['loading', 'Cargo: coal 5000 MT, loading at Taboneo', 'LOAD'], ['muat', 'Muatan: batubara 5000 MT, muat di Satui', 'LOAD'], ['memuat', 'Muatan: batubara 5000 MT untuk memuat', 'LOAD'], ['pemuatan', 'Muatan: batubara 5000 MT, pemuatan di Satui', 'LOAD'], ['to be loaded', 'Cargo: coal 5000 MT to be loaded', 'LOAD'], ['akan dimuat', 'Muatan: batubara 5000 MT akan dimuat', 'LOAD'], ['untuk dimuat', 'Muatan: batubara 5000 MT untuk dimuat', 'LOAD'], ['discharging', 'Cargo: coal 5000 MT, discharging', 'DISCHARGE'], ['bongkaran', 'Muatan: batubara 5000 MT, bongkaran di dermaga umum', 'DISCHARGE'], ['pembongkaran', 'Muatan: batubara 5000 MT, pembongkaran di dermaga', 'DISCHARGE'], ['membongkar', 'Muatan: batubara 5000 MT untuk membongkar', 'DISCHARGE'], ['unloading', 'Cargo: coal 5000 MT, unloading', 'DISCHARGE'], ['akan dibongkar', 'Muatan: batubara 5000 MT akan dibongkar', 'DISCHARGE'], ['to be discharged', 'Cargo: coal 5000 MT to be discharged', 'DISCHARGE']]
  for (const [nm, t, op] of kuat) {
    const nama = t.includes('batubara') ? 'batubara' : 'coal'
    const r = muat(t, c(nama, 5000, 'MT', op))
    cek(`O1 bentuk KUAT "${nm}" di baris muatan → ${op} tepercaya (T1)`, r?.operation === op && tepercaya(r) && r.jejak?.tier === 1, f(r))
  }
  const lemah = [['dimuat', 'Muatan: batubara 5000 MT, dimuat di Satui', 'LOAD'], ['loaded', 'Cargo: coal 5000 MT loaded at Satui', 'LOAD'], ['dibongkar', 'Muatan: batubara 5000 MT, dibongkar di Tual', 'DISCHARGE'], ['discharged', 'Cargo: coal 5000 MT discharged at Tual', 'DISCHARGE']]
  for (const [nm, t, op] of lemah) {
    const nama = t.includes('batubara') ? 'batubara' : 'coal'
    const r = muat(t, c(nama, 5000, 'MT', op))
    cek(`O2 bentuk LEMAH "${nm}" → nilai + CONTEXTUAL (review), tak tepercaya`, r?.operation === op && ada(r, 'CARGO_OPERATION_CONTEXTUAL') && !tepercaya(r), f(r))
  }
  const bukan = [['MUATAN kata benda', 'Muatan: batubara 5000 MT, tujuan Tual'], ['loading port', 'Cargo: coal 5000 MT. Loading port: Satui'], ['loaded draft', 'Cargo: coal 5000 MT, loaded draft 9 m'], ['load/discharge komposit', 'Cargo: coal 5000 MT, load/discharge terms FIOS'], ['bongkar muat', 'Muatan: batubara 5000 MT, jasa bongkar muat'], ['download (fragmen)', 'Cargo: coal 5000 MT, download the form'], ['payload (fragmen)', 'Cargo: coal 5000 MT, payload check'], ['completion of loading', 'Cargo: coal 5000 MT, completion of loading notice']]
  for (const [nm, t] of bukan) {
    const nama = t.includes('batubara') ? 'batubara' : 'coal'
    const r = muat(t, c(nama, 5000, 'MT', 'LOAD'))
    cek(`O3 "${nm}" BUKAN bukti LOAD → null`, r?.operation === null, f(r))
  }
  const kontra = muat('Cargo: coal 5000 MT, discharge', c('coal', 5000, 'MT', 'LOAD'))
  cek('O4 hanya lawan di baris muatan → null + CONTRADICTS', kontra?.operation === null && ada(kontra, 'CARGO_OPERATION_CONTRADICTS_SOURCE'), f(kontra))
  const dua = muat('Cargo: coal 5000 MT, load and discharge', c('coal', 5000, 'MT', 'LOAD'))
  cek('O5 kedua famili KUAT di baris muatan → nilai + AMBIGUOUS (review)', dua?.operation === 'LOAD' && ada(dua, 'CARGO_OPERATION_AMBIGUOUS') && !tepercaya(dua), f(dua))
}

// ============================================================================ P lampau
bagian('P', 'P. Bukti lampau/sebelumnya tak pernah menjadi operasi kini (D3/D7)')
{
  const lampau = [['telah dimuat', 'Muatan: semen 3000 MT telah dimuat di Gresik', 'LOAD'], ['sudah dibongkar', 'Muatan: semen 3000 MT sudah dibongkar kemarin', 'DISCHARGE'], ['last voyage', 'Cargo: coal 3000 MT, last voyage discharged at Tual', 'DISCHARGE'], ['previously loaded', 'Cargo: coal 3000 MT previously loaded at Satui', 'LOAD'], ['was loaded', 'Cargo: coal 3000 MT was loaded at Satui', 'LOAD'], ['sebelumnya', 'Muatan: semen 3000 MT, sebelumnya dimuat di Gresik', 'LOAD'], ['ex', 'Cargo: coal 3000 MT ex loading at Satui', 'LOAD']]
  for (const [nm, t, op] of lampau) {
    const nama = t.includes('semen') ? 'semen' : 'coal'
    const r = muat(t, c(nama, 3000, 'MT', op))
    cek(`P1 lampau-saja "${nm}" → operasi NULL + PAST_REFERENCE (bukan nilai + review — D7)`, r?.operation === null && ada(r, 'CARGO_OPERATION_PAST_REFERENCE'), f(r))
  }
  const kiniLawan = muat('Cargo: coal 3000 MT was loaded at Satui; will discharge at Tual', c('coal', 3000, 'MT', 'LOAD'))
  cek('P2 lampau LOAD + kini DISCHARGE, model LOAD → null + CONTRADICTS', kiniLawan?.operation === null && ada(kiniLawan, 'CARGO_OPERATION_CONTRADICTS_SOURCE'), f(kiniLawan))
  const lalu = muat('Cargo: CPO 3000 MT, load.\nNote: last voyage discharged 4100 MT CPO at Dumai.', c('CPO', 4100, 'MT', 'LOAD'))
  cek('P4 AM4: jumlah di klausa lampau (voyage lalu) tak pernah jumlah muatan kini', lalu?.quantity === null, f(lalu))
  const kiniSama = muat('Cargo: coal 3000 MT was loaded at Satui; will discharge at Tual', c('coal', 3000, 'MT', 'DISCHARGE'))
  cek('P3 lampau LOAD + kini DISCHARGE, model DISCHARGE → DISCHARGE (bukti kini)', kiniSama?.operation === 'DISCHARGE', f(kiniSama))
}

// ============================================================================ M multi muatan / pelabuhan / T2 / T3
bagian('M', 'M. Multi-muatan, pengikatan, tier T2/T3, multi-pelabuhan')
{
  const dua = baris('Muatan: beras 1.500 ton dan gula 600 ton, bongkar', [c('beras', 1500, 'ton', 'DISCHARGE'), c('gula', 600, 'ton', 'DISCHARGE')])
  cek('M1 dua muatan satu baris → tiap jumlah terikat ke namanya', dua[0]?.quantity === 1500 && dua[1]?.quantity === 600 && dua.every((x) => x.operation === 'DISCHARGE'), f(dua))
  const tukar = baris('Muatan: beras 1.500 ton dan gula 600 ton, bongkar', [c('beras', 600, 'ton', 'DISCHARGE'), c('gula', 1500, 'ton', 'DISCHARGE')])
  cek('M2 jumlah tertukar antar muatan → null + RELATION_AMBIGUOUS (misatribusi ditolak)', tukar.every((x) => x.quantity === null && ada(x, 'CARGO_RELATION_AMBIGUOUS')), f(tukar))
  const omit = muat('Cargo: bongkar 1450 MT semen dan 380 MT besi beton', c('semen', 380, 'MT', 'DISCHARGE'))
  cek('M3 komoditas yang TAK diusulkan tak meminjamkan jumlahnya (AM3)', omit?.quantity === null, f(omit))
  const t2 = muat('Regarding the urea cargo (3000 MT),\nThe consignee will discharge it at Gresik.', c('urea', 3000, 'MT', 'DISCHARGE'))
  cek('M4 T2: operasi di kalimat yang sama (lintas baris) → nilai + CONTEXTUAL', t2?.operation === 'DISCHARGE' && ada(t2, 'CARGO_OPERATION_CONTEXTUAL') && t2.jejak?.tier === 2 && !tepercaya(t2), f(t2))
  const doc = 'We appoint you as agent at Gresik. Kindly handle the discharge operation.\n\nCargo: wheat 21,000 MT'
  const t3 = muat(doc, c('wheat', 21000, 'MT', 'DISCHARGE'), { portName: 'Gresik' })
  cek('M5 T3 (D2): satu muatan, satu famili kini, tanpa koreksi/multi-pelabuhan → nilai + DOCUMENT_LEVEL', t3?.operation === 'DISCHARGE' && ada(t3, 'CARGO_OPERATION_DOCUMENT_LEVEL') && !tepercaya(t3), f(t3))
  const t3dua = baris(`${doc}\nCargo: barley 5,000 MT`, [c('wheat', 21000, 'MT', 'DISCHARGE'), c('barley', 5000, 'MT', 'DISCHARGE')], { portName: 'Gresik' })
  cek('M6 T3 ditolak bila > 1 muatan → null', t3dua.every((x) => x.operation === null), f(t3dua))
  const t3port = muat('We appoint you as agent. Kindly handle the discharge operation.\nLoad port: Satui, discharge port: Gresik\n\nCargo: wheat 21,000 MT', c('wheat', 21000, 'MT', 'DISCHARGE'), { portName: 'Gresik' })
  cek('M7 T3 multi-pelabuhan dan kalimat bukti tak menyebut pelabuhan POST → null', t3port?.operation === null, f(t3port))
  const t3kor = muat('Correction to our previous mail. Kindly handle the discharge operation.\n\nCargo: wheat 21,000 MT', c('wheat', 21000, 'MT', 'DISCHARGE'))
  cek('M8 T3 ditolak bila ada penanda koreksi → null', t3kor?.operation === null, f(t3kor))
  const t3lawan = muat('Kindly handle the discharge operation. Please also load bunkers.\n\nCargo: wheat 21,000 MT', c('wheat', 21000, 'MT', 'DISCHARGE'))
  cek('M9 T3 ditolak bila ada famili kini lawan → null', t3lawan?.operation === null, f(t3lawan))
  const grup = muat('Vessel: MV UJI VTIGA\nCargo: clinker 7000 MT\nOperation: discharge', c('clinker', 7000, 'MT', 'DISCHARGE'))
  cek('M10 grup label "Operation: discharge" → T1 tepercaya', grup?.operation === 'DISCHARGE' && tepercaya(grup), f(grup))
}

// ============================================================================ B blok & sambungan baris
bagian('B', 'B. Blok muatan & baris terlipat')
{
  const blok = muat('Cargo:\n- coal\n- 5,000 MT', c('coal', 5000, 'MT', null))
  cek('B1 blok muatan satu komoditas: jumlah di butir terpisah → terikat', blok?.quantity === 5000, f(blok))
  const blokLain = muat('Cargo:\n- coal\n- 5,000 MT clinker', c('coal', 5000, 'MT', null))
  cek('B2 butir blok memuat komoditas lain (tak diusulkan) → tak terikat', blokLain?.quantity === null, f(blokLain))
  const lipat = muat('Cargo: coal 5000\nMT, load', c('coal', 5000, 'MT', 'LOAD'))
  cek('B3 baris terlipat (angka di akhir baris, satuan di baris berikut) → terverifikasi', lipat?.quantity === 5000 && lipat.unit === 'MT', f(lipat))
  const kosong = muat('Cargo: coal 5000\n\nMT, load', c('coal', 5000, 'MT', 'LOAD'))
  cek('B4 baris kosong di antara → tidak disambung', kosong?.quantity === null, f(kosong))
  const titik = muat('Cargo: coal 5000.\nMT Sentosa arrives', c('coal', 5000, 'MT', null))
  cek('B5 baris diakhiri tanda baca → tidak disambung', titik?.quantity === null, f(titik))
}

// ============================================================================ Z zona & koreksi
bagian('Z', 'Z. Zona (SIG/QUOTED), penekanan kutipan, koreksi')
{
  const sig = baris('Cargo: CPO 3000 MT, load\n\nRegards,\nPT Semen Nusa\nsemen 9000 MT', [c('CPO', 3000, 'MT', 'LOAD'), c('semen', 9000, 'MT', null)])
  cek('Z1 fakta hanya di tanda tangan (SIG) → baris dibuang', sig.length === 1 && sig[0].name === 'CPO', f(sig))
  const kutip = muat('FYI, please handle.\n-----Original Message-----\nFrom: ops\nSent: Monday\nCargo: urea 3000 MT, discharge', c('urea', 3000, 'MT', 'DISCHARGE'))
  cek('Z2 bukti hanya di kutipan → nilai + EVIDENCE_QUOTED, tak pernah tepercaya', kutip?.quantity === 3000 && kutip.operation === 'DISCHARGE' && ada(kutip, 'CARGO_EVIDENCE_QUOTED') && !tepercaya(kutip), f(kutip))
  const topMenang = muat('Cargo: urea 3500 MT, discharge\n> Cargo: urea 3000 MT, discharge', c('urea', 3000, 'MT', 'DISCHARGE'))
  cek('Z3 TOP punya jumlah → nilai kutipan (lama) tak dipakai → null', topMenang?.quantity === null, f(topMenang))
  const abaikan = baris('Please disregard previous email.\n> Cargo: urea 3000 MT, discharge', [c('urea', 3000, 'MT', 'DISCHARGE')])
  cek('Z4 "disregard previous" → seluruh kutipan ditekan → baris dibuang', abaikan.length === 0, f(abaikan))
  const kor1 = muat('Koreksi: muatan coal dari 5000 MT menjadi 5500 MT', c('coal', 5500, 'MT', null))
  cek('Z5 koreksi eksplisit, model = target → nilai + CORRECTION_APPLIED (review)', kor1?.quantity === 5500 && ada(kor1, 'CARGO_CORRECTION_APPLIED') && !tepercaya(kor1), f(kor1))
  const kor2 = muat('Koreksi: muatan coal dari 5000 MT menjadi 5500 MT', c('coal', 5000, 'MT', null))
  cek('Z6 koreksi eksplisit, model = nilai lama → null + CORRECTION_UNRESOLVED', kor2?.quantity === null && ada(kor2, 'CARGO_CORRECTION_UNRESOLVED'), f(kor2))
  const kor3 = muat('Revised: cargo coal 5000 MT. Cargo coal 5500 MT.', c('coal', 5500, 'MT', null))
  cek('Z7 penanda koreksi tanpa pola penggantian + dua nilai → null (tak menebak)', kor3?.quantity === null && ada(kor3, 'CARGO_CORRECTION_UNRESOLVED'), f(kor3))
  const lot = baris('Cargo: coal 5000 MT to Tual and coal 3000 MT to Dobo, load', [c('coal', 5000, 'MT', 'LOAD'), c('coal', 3000, 'MT', 'LOAD')])
  cek('Z8 tanpa penanda koreksi, dua lot nama sama → keduanya dipertahankan', lot[0]?.quantity === 5000 && lot[1]?.quantity === 3000, f(lot))
}

// ============================================================================ N masukan cacat
bagian('N', 'N. Masukan cacat')
{
  const kosong = baris('', [c('coal', 5000, 'MT', 'LOAD')])[0]
  cek('N1 masukan TEXT tanpa teks → UNVERIFIED_SOURCE, tak tepercaya (perilaku lama, tak berubah)', !!kosong && ada(kosong, 'UNVERIFIED_SOURCE') && !tepercaya(kosong), f(kosong))
  const neg = muat('Cargo: coal 5000 MT, load', { name: 'coal', quantity: -5, unit: 'MT', operation: 'LOAD' })
  cek('N2 jumlah negatif → null', neg?.quantity === null, f(neg))
  const bs = muat('Cargo: coal 5000 MT, load', { name: 'coal', quantity: 'banyak', unit: 'MT', operation: 'LOAD' })
  cek('N3 jumlah bukan angka → null', bs?.quantity === null, f(bs))
  const u = muat('Cargo: coal 5000 MT, load', c('coal', 5000, 'M/T+%$#@!', 'LOAD'))
  cek('N4 satuan berbentuk tak sah → null', u?.unit === null, f(u))
  cek('N5 nama tanda baca saja → dibuang', baris('Cargo: coal 5000 MT', [c('---', 5000, 'MT', null)]).length === 0)
  const besar = `Cargo: coal 5000 MT, load\n${'lorem ipsum 123 dolor, '.repeat(4000)}`
  const t0 = Date.now()
  const r = muat(besar, c('coal', 5000, 'MT', 'LOAD'))
  cek('N6 teks sangat panjang → tanpa crash, < 5 s', r?.quantity === 5000 && Date.now() - t0 < 5000, `${Date.now() - t0} ms`)
  const pdf = P.validasiEkstraksi({ classification: 'NEW_NOMINATION', vessels: [{ name: 'MV UJI VTIGA' }], cargoes: [c('coal', 5000, 'MT', 'LOAD')] }, { inputKind: 'PDF', sourceText: null, hariIni: HARI, norm: NORM }).proposal.cargoes[0]
  cek('N7 PDF/gambar → nilai + UNVERIFIED_SOURCE, tak tepercaya (tak berubah)', pdf?.quantity === 5000 && ada(pdf, 'UNVERIFIED_SOURCE') && !tepercaya(pdf), f(pdf))
  cek('N8 op bukan LOAD/DISCHARGE → null', muat('Cargo: coal 5000 MT, load', c('coal', 5000, 'MT', 'TRANSSHIP'))?.operation === null)
}

// ============================================================================ K metamorfik / properti
bagian('K', 'K. Metamorfik & properti')
{
  const netral = ['drums', 'coils', 'bales', 'logs', 'cartons', 'kaleng', 'ikat', 'cases', 'rolls', 'sheets']
  const terlarang = ['knots', 'days', 'hours', 'meters', 'LT', 'UTC', 'PT', 'MV', 'DWT', 'GRT', 'percent', 'tahun']
  let okNetral = 0
  for (const u of netral) {
    const r = muat(`Cargo: timber 777 ${u}, load`, c('timber', 777, u, 'LOAD'))
    if (r?.quantity === 777 && r.unit === u && r.operation === 'LOAD') okNetral++
  }
  cek(`K1 metamorfik: satuan netral acak ditukar → pasangan tetap terverifikasi (${okNetral}/${netral.length})`, okNetral === netral.length)
  let okTerlarang = 0
  for (const u of terlarang) {
    const r = muat(`Cargo: timber 777 ${u}, load`, c('timber', 777, u, 'LOAD'))
    if (r?.quantity === null && r.unit === null) okTerlarang++
  }
  cek(`K2 metamorfik: satuan dari kelas terlarang → jumlah & satuan null (${okTerlarang}/${terlarang.length})`, okTerlarang === terlarang.length)
  const penanda = ['telah', 'sudah', 'was', 'previously', 'sebelumnya', 'last voyage']
  let okLampau = 0
  for (const p of penanda) {
    const dasar = muat('Cargo: timber 777 logs, loading at Tual', c('timber', 777, 'logs', 'LOAD'))
    const r = muat(`Cargo: timber 777 logs, ${p} loading at Tual`, c('timber', 777, 'logs', 'LOAD'))
    if (tepercaya(dasar) && r?.operation === null && ada(r, 'CARGO_OPERATION_PAST_REFERENCE')) okLampau++
  }
  cek(`K3 metamorfik: menyisipkan penanda lampau → operasi tepercaya menjadi null (${okLampau}/${penanda.length})`, okLampau === penanda.length)
  const pindahSig = baris('Pls handle.\n\nBest regards,\nOps\nCargo: timber 777 logs, loading', [c('timber', 777, 'logs', 'LOAD')])
  const pindahKutip = muat('Pls handle.\n> Cargo: timber 777 logs, loading', c('timber', 777, 'logs', 'LOAD'))
  cek('K4 metamorfik: memindahkan baris muatan ke SIG → dibuang; ke QUOTED → tak tepercaya', pindahSig.length === 0 && !tepercaya(pindahKutip) && ada(pindahKutip, 'CARGO_EVIDENCE_QUOTED'), f([pindahSig, pindahKutip]))
  const ap = ['±', 'approx', 'sekitar', 'about']
  cek('K5 metamorfik: menyisipkan penanda perkiraan → selalu APPROXIMATE_QUANTITY', ap.every((p) => ada(muat(`Cargo: timber ${p} 777 logs, loading`, c('timber', 777, 'logs', 'LOAD')), 'APPROXIMATE_QUANTITY')))
}

// ============================================================================ I invarian keselamatan pada korpus + X diferensial
bagian('X', 'X/I. Diferensial V2→V3 terklasifikasi + invarian keselamatan (19.003 varian Eval-1..5+RG, + Eval-6)')
const hasilX = { total: 0, berubah: 0, kelas: {}, takTerklasifikasi: [], invarian: { dicek: 0, gagal: [] }, transisi: { 'trusted→review': 0, 'review→trusted': 0, 'value→null': 0, 'null→value': 0, 'value→value': 0, 'flag-only': 0, 'row-dropped': 0, 'row-added': 0 }, tanpaDukungan: [], misatribusi: [] }
let lama = null
try {
  const dir = mkdtempSync(join(tmpdir(), 'validator-v2-'))
  mkdirSync(join(dir, 'src/services/intake'), { recursive: true })
  mkdirSync(join(dir, 'src/lib'), { recursive: true })
  for (const rel of ['src/services/intake/intake-policy.ts', 'src/lib/maritim-lexicon-v2.ts']) writeFileSync(join(dir, rel), execFileSync('git', ['show', `${KV3.COMMIT_DASAR_V2}:${rel}`], { cwd: AKAR }))
  lama = jiti(join(dir, 'src/services/intake/intake-policy.ts'))
} catch {
  lama = null
}
if (!lama) cek('X0 validator dasar v2 dapat dimuat dari riwayat git', false, 'git show gagal')
else {
  const REVIEW = new Set(P.PERLU_KONFIRMASI_CARGO)
  const KELAS_A = new Set(['O_T1', 'O_T1_WEAK', 'O_T1_AMBIGUOUS', 'O_T2', 'O_T2_AMBIGUOUS', 'O_T3', 'Q_PAIR', 'Q_LEGACY_ADJ', 'Q_CORRECTION_TARGET', 'U_LITERAL', 'U_LEGACY'])
  const KELAS_B = { EXCL_ZONE: 'B-zona', EXCL_PAST_CLAUSE: 'B-lampau', Q_RELATION: 'B-misatribusi', Q_CORRECTION: 'B-koreksi', O_PAST_ONLY: 'B-lampau', O_CONTRADICTS: 'B-kontradiksi-V3(lampau/bukan-op)', O_NONE: 'B-bukan-op/zona', U_MISMATCH: 'B-ikut-jumlah', U_NO_QUANTITY: 'B-ikut-jumlah', U_SHAPE_OR_DENIED: 'B-pengecualian' }
  const tambahKelas = (k, id) => {
    hasilX.kelas[k] ??= { n: 0, kasus: new Set() }
    hasilX.kelas[k].n++
    hasilX.kelas[k].kasus.add(id)
  }
  // Orakel independen (I4/I7) untuk jumlah yang BARU dipertahankan: ada okurensi angka itu yang TIDAK didahului label
  // pengecualian mandiri, tak berada di klausa uang, tak diikuti '/', '%', 'per', dan bukan fragmen telepon/referensi.
  const LBL = new Set(L3.LABEL_BUKAN_JUMLAH.flatMap((x) => x.split(' ')))
  const oracleJumlah = (teks, q) => {
    const T = P.normalisasiTeksSumber(teks)
    for (const m of T.matchAll(/\d[\d.,]*/g)) {
      if (P.nilaiAngkaSumber(m[0].replace(/[.,]$/, '')) !== q) continue
      const seb = T.slice(Math.max(0, m.index - 40), m.index)
      const ses = T.slice(m.index + m[0].length, m.index + m[0].length + 20)
      const kataSeb = (seb.match(/([A-Za-z]+)[\s:=#.()]*$/) ?? [])[1]?.toUpperCase()
      const kompositSeb = /[A-Za-z0-9]-[A-Za-z]+[\s:]*$/.test(seb)
      if (kataSeb && LBL.has(kataSeb) && !kompositSeb) continue
      if (/(?:\bUSD|\bIDR|\bRp|\$|\bSGD|\bEUR|freight|price|harga|biaya|tarif|rate)[^;()|\n]*$/i.test(seb.split(/[;()|\n]|,\s/).pop() ?? '')) continue
      if (/^\s*[A-Za-z³]*\s*(?:\/|%|per\b|each\b)/i.test(ses)) continue
      if (/[A-Za-z0-9][-/#.]$/.test(seb) || /[+]\d/.test(seb.slice(-6))) continue
      return true
    }
    return false
  }
  const cekInvarian = (k, teks, row) => {
    hasilX.invarian.dicek++
    const T = P.normalisasiTeksSumber(teks).toUpperCase()
    const salah = []
    const tok = P.tokenMuatan(row.name)
    if (!tok.length) salah.push('I1-nama')
    if (row.quantity !== null && !(T.match(/\d[\d.,]*/g) ?? []).some((t) => P.nilaiAngkaSumber(t) === row.quantity) && !row.flags.includes('OCR_CORRECTED')) salah.push('I1-jumlah')
    if (row.unit !== null && row.jejak?.unit === 'U_LITERAL' && !T.replace(/³/g, '3').includes(row.unit.toUpperCase().replace(/³/g, '3'))) salah.push('I1-satuan')
    if (row.operation !== null && !row.jejak?.operation?.startsWith('O_T')) salah.push('I3-operasi-tanpa-tier')
    if (row.operation !== null && (row.jejak?.tier ?? 1) >= 2 && !row.flags.some((x) => REVIEW.has(x))) salah.push('I3-tier2+-tanpa-review')
    if (P.cargoTepercaya(row) && row.operation !== null && !(row.jejak?.operation === 'O_T1' && row.jejak?.zona === 'TOP')) salah.push('I3-tepercaya-bukan-T1-TOP')
    if (P.cargoTepercaya(row) && row.flags.includes('CARGO_EVIDENCE_QUOTED')) salah.push('I5-kutipan-tepercaya')
    if (row.quantity !== null && !row.flags.includes('OCR_CORRECTED')) {
      if (!oracleJumlah(teks, row.quantity)) hasilX.tanpaDukungan.push(`${k.id}:${row.name}:${row.quantity}`)
      // orakel misatribusi independen: ada baris (±1) yang memuat angka itu DAN nama baris ini atau label/blok muatan
      const fis = P.normalisasiTeksSumber(teks).split(/\r?\n/)
      const tNama = P.tokenMuatan(row.name).join(' ')
      const punya = (i) => (fis[i] ?? '').match(/\d[\d.,]*/g)?.some((t) => P.nilaiAngkaSumber(t.replace(/[.,]$/, '')) === row.quantity)
      const konteks = (i) => { const w = P.tokenMuatan(fis[i] ?? '').join(' '); return (tNama && ` ${w} `.includes(` ${tNama} `)) || /^\s*(?:[-•*·]|[a-z]\.|\d+\.)?\s*(cargo|cargoes|muatan|kargo|commodity|komoditas|qty|quantity|kuantitas|jumlah)\b/i.test(fis[i] ?? '') }
      const ok = fis.some((_, i) => punya(i) && [i - 2, i - 1, i, i + 1, i + 2].some(konteks))
      if (!ok) hasilX.misatribusi.push(`${k.id}:${row.name}:${row.quantity}`)
    }
    if (salah.length && hasilX.invarian.gagal.length < 20) hasilX.invarian.gagal.push(`${k.id}:${row.name}:${salah.join(',')}`)
    return salah.length === 0
  }
  const korpusDasar = [...F1.bangunKasusEval1(H), ...F2.bangunKasusEval2(H), ...F3.bangunKasusEval3(H), ...F4.bangunKasusHeldoutEval4(H), ...RG.KASUS_REGRESI_MUATAN, ...D5.bangunKasusEval5(H)]
  const korpus6 = D6.bangunKasusEval6(H)
  const jalankan = (korpus, label) => {
    let n = 0
    for (const k of korpus) {
      const teks = G.teksKasus(k)
      if (!teks) continue
      const dasar = R3.jawabanSempurnaEval3(k)
      const angka = [...new Set((teks.match(/\d[\d.,]*/g) ?? []).map((t) => Number(t.replace(/,/g, ''))).filter(Number.isFinite))].slice(0, 25)
      const nama = [...new Set([...(dasar.cargoes ?? []).map((x) => x.name), 'coal'])]
      const varian = [dasar]
      for (const nm of nama) for (const op of ['LOAD', 'DISCHARGE', null]) for (const u of ['MT', 'WMT', 'KL', 'CBM']) for (const q of [null, ...angka]) varian.push({ ...dasar, cargoes: [{ name: nm, quantity: q, unit: q === null ? null : u, operation: op }] })
      for (const raw of varian) {
        n++
        const a = validasi(raw, teks, lama).proposal.cargoes
        const b = validasi(raw, teks).proposal.cargoes
        for (const row of b) cekInvarian(k, teks, row)
        const polos = (x) => JSON.stringify(x.map(({ jejak, ...y }) => y))
        if (polos(a) === polos(b)) continue
        hasilX.berubah++
        const T = hasilX.transisi
        for (const x of a) {
          const y = b.find((z) => z.name === x.name)
          if (!y) { T['row-dropped']++; continue }
          if (P.cargoTepercaya(x) && !P.cargoTepercaya(y)) T['trusted→review']++
          if (!P.cargoTepercaya(x) && P.cargoTepercaya(y)) {
            T['review→trusted']++
            // klasifikasi: (a) nilai yang dulu di-review kini null; (b) AMBIGUOUS hilang karena bukti lawan LAMPAU/bukan-op (D3/§5.2)
            const approxTetap = (x.flags ?? []).includes('APPROXIMATE_QUANTITY') && y.quantity !== null
            const ambTetap = (x.flags ?? []).includes('CARGO_OPERATION_AMBIGUOUS') && y.operation !== null && y.jejak?.operation !== 'O_T1'
            const lainTetap = (x.flags ?? []).some((z) => REVIEW.has(z) && !['APPROXIMATE_QUANTITY', 'CARGO_OPERATION_AMBIGUOUS'].includes(z))
            if (approxTetap || ambTetap || lainTetap) hasilX.takTerklasifikasi.push(`${label}:${k.id}:${y.name}:review→trusted`)
            const alasan = (x.flags ?? []).filter((z) => REVIEW.has(z) && !y.flags.includes(z)).join('+') || 'tanpa-flag-v2'
            hasilX.naik ??= {}
            hasilX.naik[`${alasan}→${y.jejak?.operation ?? ''}/${y.jejak?.quantity ?? ''}`] ??= new Set()
            hasilX.naik[`${alasan}→${y.jejak?.operation ?? ''}/${y.jejak?.quantity ?? ''}`].add(k.id)
          }
          let nilaiBeda = false
          for (const fl of ['quantity', 'unit', 'operation']) {
            if (x[fl] === y[fl]) continue
            nilaiBeda = true
            if (x[fl] !== null && y[fl] === null) T['value→null']++
            else if (x[fl] === null && y[fl] !== null) T['null→value']++
            else T['value→value']++
          }
          if (!nilaiBeda && JSON.stringify(x.flags) !== JSON.stringify(y.flags)) T['flag-only']++
        }
        for (const y of b) if (!a.some((x) => x.name === y.name)) T['row-added']++
        // baris dibuang/ditambah
        for (const x of a) if (!b.some((y) => y.name === x.name)) tambahKelas('B-zona(baris-dibuang)', k.id)
        b.forEach((y, i) => {
          const x = a[i] && a[i].name === y.name ? a[i] : a.find((z) => z.name === y.name)
          if (!x) {
            if (y.flags.includes('CARGO_EVIDENCE_QUOTED')) tambahKelas('A-baris-kutipan(review)', k.id)
            else hasilX.takTerklasifikasi.push(`${label}:${k.id}:${y.name}:baris-baru`)
            return
          }
          let adaNilai = false
          for (const fl of ['quantity', 'unit', 'operation']) {
            if (x[fl] === y[fl]) continue
            adaNilai = true
            const aturan = y.jejak?.[fl] ?? '?'
            if (x[fl] !== null && y[fl] === null) {
              const kl = KELAS_B[aturan] ?? (String(aturan).startsWith('EXCL_') ? 'B-pengecualian' : null)
              if (kl) tambahKelas(kl, k.id)
              else hasilX.takTerklasifikasi.push(`${label}:${k.id}:${y.name}:${fl}:${x[fl]}→null:${aturan}`)
            } else if (fl === 'quantity' && y[fl] !== null && !oracleJumlah(teks, y[fl])) hasilX.takTerklasifikasi.push(`${label}:${k.id}:${y.name}:quantity:${x[fl]}→${y[fl]}:ORACLE_TOLAK`)
            else if (y[fl] !== null && KELAS_A.has(aturan) && (fl !== 'operation' || aturan === 'O_T1' || y.flags.some((z) => REVIEW.has(z)))) tambahKelas(`A-${fl}:${aturan}`, k.id)
            else hasilX.takTerklasifikasi.push(`${label}:${k.id}:${y.name}:${fl}:${x[fl]}→${y[fl]}:${aturan}`)
          }
          if (!adaNilai) {
            const baru = y.flags.filter((z) => !(x.flags ?? []).includes(z))
            const hilang = (x.flags ?? []).filter((z) => !y.flags.includes(z))
            const V3F = new Set(['APPROXIMATE_QUANTITY', 'CARGO_UNIT_NONSTANDARD', 'CARGO_OPERATION_CONTEXTUAL', 'CARGO_OPERATION_DOCUMENT_LEVEL', 'CARGO_EVIDENCE_QUOTED', 'CARGO_CORRECTION_APPLIED', 'CARGO_OPERATION_PAST_REFERENCE', 'CARGO_RELATION_AMBIGUOUS', 'CARGO_CORRECTION_UNRESOLVED', 'CARGO_OPERATION_NOT_IN_SOURCE', 'CARGO_OPERATION_CONTRADICTS_SOURCE', 'CARGO_OPERATION_AMBIGUOUS', 'CARGO_QUANTITY_NOT_IN_SOURCE', 'CARGO_UNIT_NOT_IN_SOURCE'])
            if (!baru.length && !hilang.length) tambahKelas('C-urutan-flag', k.id)
            else if ([...baru, ...hilang].every((z) => V3F.has(z))) tambahKelas(`C-flag:${[...baru.map((z) => `+${z}`), ...hilang.map((z) => `-${z}`)].join(',')}`, k.id)
            else hasilX.takTerklasifikasi.push(`${label}:${k.id}:${y.name}:flag:${baru}|${hilang}`)
          }
        })
      }
    }
    return n
  }
  const n1 = jalankan(korpusDasar, 'E1-5+RG')
  const n6 = jalankan(korpus6, 'E6')
  hasilX.total = n1 + n6
  console.log(`     varian: ${n1} (Eval-1..5 + RG) + ${n6} (Eval-6) = ${hasilX.total}; keluaran berubah: ${hasilX.berubah}`)
  for (const [k, v] of Object.entries(hasilX.kelas).sort()) console.log(`       ${k.padEnd(62)} ${String(v.n).padStart(5)}  [${[...v.kasus].slice(0, 12).join(',')}${v.kasus.size > 12 ? ',…' : ''}]`)
  cek('X1 korpus 19.003 varian Eval-1..5+RG tetap (generator identik)', n1 === 19003, String(n1))
  cek('X2 setiap perbedaan V2→V3 terklasifikasi (A/B/C); 0 tak terklasifikasi', hasilX.takTerklasifikasi.length === 0, hasilX.takTerklasifikasi.slice(0, 8).join(' | '))
  cek('X3 setiap JUMLAH yang baru dipertahankan lolos orakel pengecualian independen (I4/I7)', !hasilX.takTerklasifikasi.some((x) => x.endsWith('ORACLE_TOLAK')), hasilX.takTerklasifikasi.filter((x) => x.endsWith('ORACLE_TOLAK')).slice(0, 6).join(' | '))
  console.log(`     transisi: ${JSON.stringify(hasilX.transisi)}`)
  for (const [kk, v] of Object.entries(hasilX.naik ?? {})) console.log(`       review→trusted: ${kk} [${[...v].join(',')}]`)
  console.log(`     orakel independen: tanpa-dukungan ${hasilX.tanpaDukungan.length}, misatribusi ${hasilX.misatribusi.length}`)
  cek('X4 setiap review→trusted terklasifikasi: nilai ber-review kini null, atau ambiguitas hilang karena bukti lawan lampau/bukan-op (T1 kuat)', !hasilX.takTerklasifikasi.some((x) => x.endsWith('review→trusted')), hasilX.takTerklasifikasi.filter((x) => x.endsWith('review→trusted')).slice(0, 5).join(' | '))
  cek('X5 orakel independen: 0 jumlah POST tanpa dukungan sumber (seluruh korpus)', hasilX.tanpaDukungan.length === 0, hasilX.tanpaDukungan.slice(0, 6).join(' | '))
  cek('X6 orakel independen: 0 jumlah POST termisatribusi (seluruh korpus)', hasilX.misatribusi.length === 0, hasilX.misatribusi.slice(0, 6).join(' | '))
  cek(`I1–I5 invarian keselamatan pada setiap baris POST korpus (${hasilX.invarian.dicek} baris)`, hasilX.invarian.gagal.length === 0, hasilX.invarian.gagal.join(' | '))
}

// ============================================================================ E regresi Eval-5 / Eval-6 (jawaban sempurna) — DILAPORKAN
bagian('E', 'E. Regresi H20/H18/E09 + Eval-5 & Eval-6 (REGRESSION ONLY; jawaban sempurna; dilaporkan per D6)')
const laporE = {}
{
  const baris1 = (teks, cg) => validasi({ classification: 'NEW_NOMINATION', vessels: [{ name: 'MV REGRESI' }], cargoes: [cg] }, teks).proposal.cargoes[0] ?? null
  const rg = Object.fromEntries(RG.KASUS_REGRESI_MUATAN.map((k) => [k.id, k]))
  const h20 = rg['RG-H20'] ? validasi(R3.jawabanSempurnaEval3(rg['RG-H20']), G.teksKasus(rg['RG-H20'])).proposal.cargoes : null
  const h20b = rg['RG-H20'] ? baris1(G.teksKasus(rg['RG-H20']), { name: 'clinker', quantity: 5000, unit: 'MT', operation: 'LOAD' }) : null
  cek('E1 RG-H20: jumlah karangan 5000 MT tak pernah dipertahankan', !!rg['RG-H20'] && !JSON.stringify(h20).includes('5000') && (h20b === null || h20b.quantity === null), f([h20, h20b]))
  const h18 = rg['RG-H18'] ? baris1(G.teksKasus(rg['RG-H18']), { name: 'coal', quantity: 30000, unit: 'MT', operation: 'DISCHARGE' }) : 'x'
  cek('E2 RG-H18: baris muatan karangan (coal) dibuang', h18 === null, f(h18))
  const e09 = F1.bangunKasusEval1(H).find((k) => k.id === 'E09')
  const e09r = baris1(G.teksKasus(e09), { name: 'coal', quantity: 7500, unit: 'MT', operation: 'LOAD' })
  cek('E3 E09: "was loaded" (lampau) + "will be discharged" → LOAD null (tak pernah operasi kini)', e09r?.operation === null, f(e09r))
  const metrik = (kasus) => {
    const m = { slot: 0, benar: 0, tepercayaBenar: 0, reviewBenar: 0, nullManual: 0, review: 0, fatal: 0, karangan: 0, tepercayaSalah: 0, tidakLulus: [] }
    for (const k of kasus) {
      const raw = R3.jawabanSempurnaEval3(k)
      const post = validasi(raw, G.teksKasus(k))
      const n = S3.nilaiKasusV2(k, raw, post, NORM_SKOR)
      const benarKlas = k.gt.classification.values.includes(post.classification)
      const ok = benarKlas && n.POST.jumlah.FATAL === 0 && n.POST.jumlah.MAJOR === 0
      m.slot += 2
      if (ok) m.benar += 2
      else m.tidakLulus.push(k.id)
      m.fatal += n.POST.jumlah.FATAL
      m.karangan += n.POST.karanganMuatan ?? 0
      const rows = post.proposal.cargoes
      const perluReview = rows.some((r) => !P.cargoTepercaya(r))
      const adaNull = n.POST.baris.some((b) => b.hasil === S3.HASIL?.MISSING || b.hasil === 'MISSING')
      if (ok && !perluReview) m.tepercayaBenar += 2
      if (ok && perluReview) m.reviewBenar += 2
      if (perluReview) m.review += 2
      if (adaNull) m.nullManual += 2
      // keselamatan: nilai TEPERCAYA yang salah/karangan (FATAL di baris muatan tepercaya)
      for (const b of n.POST.baris) if (b.keparahan?.tingkat === 'FATAL' && /^cargoes\[(\d+)\]/.test(b.jalur) && P.cargoTepercaya(rows[Number(b.jalur.match(/^cargoes\[(\d+)\]/)[1])] ?? {})) m.tepercayaSalah++
    }
    return m
  }
  const tampil = (lbl, m) => {
    const p = (x) => `${((100 * x) / m.slot).toFixed(1)}%`
    console.log(`     ${lbl}: overall ${m.benar}/${m.slot} (${p(m.benar)}) · trusted-correct ${m.tepercayaBenar} (${p(m.tepercayaBenar)}) · review-correct ${m.reviewBenar} (${p(m.reviewBenar)}) · null/manual ${m.nullManual} (${p(m.nullManual)}) · review rate ${p(m.review)} · FATAL ${m.fatal} · tak lulus: ${m.tidakLulus.join(',') || '-'}`)
  }
  const m5 = metrik(D5.bangunKasusEval5(H))
  const m6 = metrik(D6.bangunKasusEval6(H))
  laporE.eval5 = m5
  laporE.eval6 = m6
  tampil('Eval-5', m5)
  tampil('Eval-6', m6)
  cek('E4 Eval-5 (regresi): 0 FATAL POST, 0 nilai TEPERCAYA salah/karangan', m5.fatal === 0 && m5.tepercayaSalah === 0, f(m5))
  cek('E5 Eval-6 (regresi): 0 FATAL POST, 0 nilai TEPERCAYA salah/karangan', m6.fatal === 0 && m6.tepercayaSalah === 0, f(m6))
  // injeksi angka terlarang GT Eval-5 & Eval-6 sebagai jumlah × {MT, WMT, KL, CBM, ton, units}
  let coba = 0
  const lolos = []
  for (const k of [...D5.bangunKasusEval5(H), ...D6.bangunKasusEval6(H)]) {
    const nama = R3.jawabanSempurnaEval3(k).cargoes?.[0]?.name
    if (!nama) continue
    for (const t of k.gt.terlarang ?? []) {
      if (typeof t.nilai !== 'number') continue
      for (const u of ['MT', 'WMT', 'KL', 'CBM', 'ton', 'units']) {
        coba++
        const r = baris1(G.teksKasus(k), { name: nama, quantity: t.nilai, unit: u, operation: null })
        if (r?.quantity === t.nilai) lolos.push(`${k.id}:${t.nilai}${u}`)
      }
    }
  }
  cek(`E6 injeksi angka terlarang GT (uang/partikular/pengenal/waktu) Eval-5+6 × 6 satuan: 0 lolos dari ${coba}`, lolos.length === 0 && coba > 0, lolos.join(' '))
}

cek('0 panggilan jaringan', fetchNyata === 0)
console.log('\nRingkasan per bagian:', Object.entries(hitung).map(([k, v]) => `${k} ${v.lulus}/${v.lulus + v.gagal}`).join(' · '))
console.log(`\n${gagal === 0 ? '✅' : '❌'} ${lulus} lulus, ${gagal} gagal`)
if (process.env.V3_LAPORAN) writeFileSync(process.env.V3_LAPORAN, JSON.stringify({ hitung, diferensial: { ...hasilX, kelas: Object.fromEntries(Object.entries(hasilX.kelas).map(([k, v]) => [k, { n: v.n, kasus: [...v.kasus] }])) }, regresi: laporE }, null, 1))
process.exit(gagal === 0 ? 0 : 1)
