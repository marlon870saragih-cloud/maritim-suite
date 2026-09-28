// Uji REGRESI remediasi validator pasca-Eval-5 (keputusan owner "CONTROLLED VALIDATOR REMEDIATION").
// LURING, deterministik, tanpa jaringan/DB/model. Validator produksi (intake-policy.ts + leksikon v2) dipanggil apa adanya.
//
//   node prisma/check-validator-remediasi.mjs
//
// R1 WMT (grup sendiri) · R2 KL (grup sendiri) · R3 frasa "to be loaded/discharged" · R4 sambungan lintas baris Z40
// + pengecualian telepon · R5 leksikon v2 terpisah dari v1 historis. Z17 tetap konservatif (keputusan owner 1).
// Dataset Eval-5 Z01–Z40 = EXPOSED — REGRESSION ONLY (bukan held-out).

import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as S from './spike-eval1-scorer.mjs'
import * as S3 from './spike-eval4-scorer.mjs'
import * as G from './spike-gt-konsistensi.mjs'
import * as R3 from './spike-eval3-runner.mjs'
import * as RG from './fixtures/spike-intake/eval4-regresi-muatan.mjs'
import * as F1 from './fixtures/spike-intake/eval1-cases.mjs'
import * as D5 from './fixtures/spike-intake/eval5-blind-cases.mjs'

const AKAR = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(import.meta.url)
const jiti = require('jiti')(fileURLToPath(import.meta.url), { alias: { '@': join(AKAR, 'src') }, interopDefault: true })
const P = jiti(join(AKAR, 'src/services/intake/intake-policy.ts'))
const V = jiti(join(AKAR, 'src/lib/vessels.ts'))
const L1 = jiti(join(AKAR, 'src/lib/maritim-lexicon.ts'))
const L2 = jiti(join(AKAR, 'src/lib/maritim-lexicon-v2.ts'))
const sha = (rel) => createHash('sha256').update(readFileSync(join(AKAR, rel))).digest('hex')

let lulus = 0
let gagal = 0
function cek(nama, kondisi, detail = '') {
  if (kondisi) lulus++
  else gagal++
  console.log(`  ${kondisi ? '✅' : '❌'} ${nama}${!kondisi && detail ? ` — ${detail}` : ''}`)
}
const bagian = (j) => console.log(`\n${j}`)
let fetchNyata = 0
globalThis.fetch = async () => {
  fetchNyata++
  throw new Error('JARINGAN_DILARANG')
}

const NORM = { imo: V.normalisasiImo, imoSah: V.imoCheckDigitSah, mmsi: V.normalisasiMmsi, mmsiSah: V.mmsiSah, callSign: V.normalisasiCallSign }
const NORM_SKOR = { namaKapal: P.normalisasiNamaKapal, namaPort: P.normalisasiNamaPort, namaPihak: P.normalisasiNamaPihak, unlocode: P.normalisasiUnlocode, imo: V.normalisasiImo, mmsi: V.normalisasiMmsi, callSign: V.normalisasiCallSign }
const HARI = '2026-09-28'
const validasi = (raw, teks) => P.validasiEkstraksi(structuredClone(raw), { inputKind: 'TEXT', sourceText: P.normalisasiTeksSumber(teks), hariIni: HARI, norm: NORM })
/** Satu baris muatan usulan → baris POST (atau null bila dibuang). */
const muat = (teks, cargo) => validasi({ classification: 'NEW_NOMINATION', vessels: [{ name: 'MV UJI REMEDIASI' }], cargoes: [cargo] }, teks).proposal.cargoes[0] ?? null
const baris = (teks, cargoes) => validasi({ classification: 'NEW_NOMINATION', vessels: [{ name: 'MV UJI REMEDIASI' }], cargoes }, teks).proposal.cargoes
const bersih = (c) => !!c && P.cargoTepercaya(c) && c.flags.length === 0
const f = (c) => JSON.stringify(c)

// ============================================================================ R5 tata kelola leksikon
bagian('R5. Tata kelola leksikon: v2 untuk validator, v1 historis tak berubah')
{
  cek('R5a v1 byte-identik dengan SHA beku Eval-4/Eval-5 (864e4e3b…)', sha('src/lib/maritim-lexicon.ts') === '864e4e3bf4cb47ef6e1d112ad42b5c9efd9d402c459e2d8be465f0bbab41fb83' && L1.VERSI_LEKSIKON === 'maritim-lexicon/1')
  cek('R5b v2 berversi maritim-lexicon/2, basis v1', L2.VERSI_LEKSIKON === 'maritim-lexicon/2' && L2.VERSI_LEKSIKON_DASAR === 'maritim-lexicon/1')
  cek('R5c validator mengimpor v2; penilai scorer-3 & pemeriksa GT tetap v1', /from '\.\.\/\.\.\/lib\/maritim-lexicon-v2'/.test(readFileSync(join(AKAR, 'src/services/intake/intake-policy.ts'), 'utf8')) && /from '\.\.\/src\/lib\/maritim-lexicon\.ts'/.test(readFileSync(join(AKAR, 'prisma/spike-eval4-scorer.mjs'), 'utf8')) && /from '\.\.\/src\/lib\/maritim-lexicon\.ts'/.test(readFileSync(join(AKAR, 'prisma/spike-gt-konsistensi.mjs'), 'utf8')))
  cek('R5d WMT & KL grup SENDIRI (bukan alias MT/CBM); alias MT/CBM v2 = v1', JSON.stringify(L2.SATUAN_LEKSIKON.WMT.alias) === '["WMT"]' && JSON.stringify(L2.SATUAN_LEKSIKON.KL.alias) === '["KL"]' && JSON.stringify(L2.SATUAN_LEKSIKON.MT.alias) === JSON.stringify(L1.SATUAN_LEKSIKON.MT.alias) && JSON.stringify(L2.SATUAN_LEKSIKON.CBM.alias) === JSON.stringify(L1.SATUAN_LEKSIKON.CBM.alias))
  cek('R5e operasi kata tunggal v2 = v1 (TANPA LOADED/DISCHARGED); frasa terikat hanya TO BE LOADED / TO BE DISCHARGED', JSON.stringify(L2.OPERASI_LEKSIKON) === JSON.stringify(L1.OPERASI_LEKSIKON) && !/"LOADED"|"DISCHARGED"/.test(JSON.stringify(L2.OPERASI_LEKSIKON)) && JSON.stringify(L2.FRASA_OPERASI_LEKSIKON.LOAD.alias) === '["TO BE LOADED"]' && JSON.stringify(L2.FRASA_OPERASI_LEKSIKON.DISCHARGE.alias) === '["TO BE DISCHARGED"]')
  cek('R5f FRASA_BUKAN_OPERASI, label muatan, mata uang, kata uang v2 = v1 (tidak dikurangi)', ['FRASA_BUKAN_OPERASI', 'LABEL_BARIS_MUATAN', 'MATA_UANG', 'KATA_UANG', 'LABEL_JUMLAH', 'PENANDA_PERKIRAAN'].every((k) => JSON.stringify(L2[k]) === JSON.stringify(L1[k])))
  cek('R5g label bukan-jumlah v2 ⊇ v1 (hanya bertambah: kontak/rekening/tambatan)', L1.LABEL_BUKAN_JUMLAH.every((x) => L2.LABEL_BUKAN_JUMLAH.includes(x)) && ['TELP', 'HP', 'ACC', 'REKENING', 'DERMAGA', 'BERTH'].every((x) => L2.LABEL_BUKAN_JUMLAH.includes(x)))
  cek('R5h setiap entri baru berprovenans keputusan owner (OWNER:EVAL5-REMEDIASI-R*)', [L2.SATUAN_LEKSIKON.WMT, L2.SATUAN_LEKSIKON.KL, L2.FRASA_OPERASI_LEKSIKON.LOAD, L2.FRASA_OPERASI_LEKSIKON.DISCHARGE, L2.ATURAN_LINTAS_BARIS].every((e) => e.provenans.some((p) => /^OWNER:EVAL5-REMEDIASI-R[1-4]$/.test(p))))
  cek('R5i v2 tanpa impor & tanpa lookbehind (dibundel ke peramban)', !/^\s*import\s/m.test(readFileSync(join(AKAR, 'src/lib/maritim-lexicon-v2.ts'), 'utf8')) && !/\(\?<[!=a-zA-Z]/.test(readFileSync(join(AKAR, 'src/lib/maritim-lexicon-v2.ts'), 'utf8')))
}

// ============================================================================ positif
bagian('Positif — nilai eksplisit di sumber dipertahankan')
{
  const w = muat('Muatan : bijih nikel (nickel ore) 55000 WMT, muat curah', { name: 'bijih nikel', quantity: 55000, unit: 'WMT', operation: 'LOAD' })
  cek('P1 "55000 WMT" → quantity 55000, unit WMT, LOAD, tanpa flag', w?.quantity === 55000 && w.unit === 'WMT' && w.operation === 'LOAD' && bersih(w), f(w))
  const wmt = muat('Muatan : bijih nikel 55000 WMT, muat', { name: 'bijih nikel', quantity: 55000, unit: 'MT', operation: 'LOAD' })
  cek('P1b sumber WMT, model menulis MT → satuan DIKOSONGKAN (WMT tak pernah dinormalkan ke MT)', wmt?.quantity === 55000 && wmt.unit === null && wmt.flags.includes('CARGO_UNIT_NOT_IN_SOURCE'), f(wmt))
  const mtw = muat('Muatan : bijih nikel 55000 MT, muat', { name: 'bijih nikel', quantity: 55000, unit: 'WMT', operation: 'LOAD' })
  cek('P1c sumber MT, model menulis WMT → satuan dikosongkan', mtw?.unit === null && mtw.flags.includes('CARGO_UNIT_NOT_IN_SOURCE'), f(mtw))
  const k = muat('Rencana bongkar HSD (solar) sebanyak 4500 KL.', { name: 'HSD', quantity: 4500, unit: 'KL', operation: 'DISCHARGE' })
  cek('P2 "4500 KL" → quantity 4500, unit KL, DISCHARGE, tanpa flag', k?.quantity === 4500 && k.unit === 'KL' && k.operation === 'DISCHARGE' && bersih(k), f(k))
  const kl = muat('rencana bongkar hsd sebanyak 4500 kl', { name: 'HSD', quantity: 4500, unit: 'kl', operation: 'DISCHARGE' })
  cek('P2b huruf kecil "4500 kl" setara', kl?.quantity === 4500 && kl.unit === 'kl' && bersih(kl), f(kl))
  const kc = muat('Rencana bongkar HSD sebanyak 4500 KL.', { name: 'HSD', quantity: 4500, unit: 'CBM', operation: 'DISCHARGE' })
  cek('P2c sumber KL, model menulis CBM → satuan dikosongkan (KL tak pernah dinormalkan ke CBM)', kc?.quantity === 4500 && kc.unit === null && kc.flags.includes('CARGO_UNIT_NOT_IN_SOURCE'), f(kc))
  const tl = muat('Cargo: 12000 MT palm kernel expeller in bulk, to be loaded for European receivers.', { name: 'palm kernel expeller', quantity: 12000, unit: 'MT', operation: 'LOAD' })
  cek('P3 Cargo … "to be loaded" → LOAD', tl?.operation === 'LOAD' && bersih(tl), f(tl))
  const td = muat('Cargo: 8000 MT urea in bags, to be discharged at Luwuk.', { name: 'urea', quantity: 8000, unit: 'MT', operation: 'DISCHARGE' })
  cek('P4 Cargo … "to be discharged" → DISCHARGE', td?.operation === 'DISCHARGE' && bersih(td), f(td))
  const tdLawan = muat('Cargo: 8000 MT urea in bags, to be discharged at Luwuk.', { name: 'urea', quantity: 8000, unit: 'MT', operation: 'LOAD' })
  cek('P4b "to be discharged" + model LOAD → CONTRADICTS, operasi null', tdLawan?.operation === null && tdLawan.flags.includes('CARGO_OPERATION_CONTRADICTS_SOURCE'), f(tdLawan))
  const z40 = 'Pls act as our agent at Jayapura. Cargo: bongkar 1450 MT semen zak dan 380\nMT besi beton, cnee PT Uji. Sandar di\nDermaga Umum 2 kalau available.'
  const r = baris(z40, [{ name: 'semen zak', quantity: 1450, unit: 'MT', operation: 'DISCHARGE' }, { name: 'besi beton', quantity: 380, unit: 'MT', operation: 'DISCHARGE' }])
  cek('P5 struktur Z40: baris ke-2 "380 / MT besi beton" direkonstruksi → 380 MT DISCHARGE; baris ke-1 tetap', r[0]?.quantity === 1450 && bersih(r[0]) && r[1]?.quantity === 380 && r[1].unit === 'MT' && r[1].operation === 'DISCHARGE' && bersih(r[1]), f(r))
  const r5 = baris('Cargo: load 900 MT clinker and 250\nWMT nickel ore', [{ name: 'nickel ore', quantity: 250, unit: 'WMT', operation: 'LOAD' }])
  cek('P5b sambungan dengan satuan WMT', r5[0]?.quantity === 250 && r5[0].unit === 'WMT' && r5[0].operation === 'LOAD', f(r5))
}

// ============================================================================ negatif / adversarial
bagian('Negatif / adversarial — fakta tak berbukti tetap 0')
{
  const nol = (c) => !!c && c.quantity === null
  // H20 / H18 — kasus regresi beku (teks asli fixture)
  const h20 = RG.KASUS_REGRESI_MUATAN.find((k) => k.id === 'RG-H20')
  const h18 = RG.KASUS_REGRESI_MUATAN.find((k) => k.id === 'RG-H18')
  const a1 = muat(h20.teks, { name: 'sawn timber', quantity: 5000, unit: 'MT', operation: 'LOAD' })
  cek('N1 H20: "to load sawn timber" tanpa jumlah + model 5000 MT → jumlah & satuan dikosongkan, LOAD tetap', nol(a1) && a1.unit === null && a1.operation === 'LOAD', f(a1))
  const a1b = muat(h20.teks, { name: 'sawn timber', quantity: 5000, unit: 'WMT', operation: 'LOAD' })
  const a1c = muat(h20.teks, { name: 'sawn timber', quantity: 5000, unit: 'KL', operation: 'LOAD' })
  cek('N1b H20 dengan satuan baru WMT/KL karangan → tetap dikosongkan', nol(a1b) && nol(a1c) && a1b.unit === null && a1c.unit === null)
  const a1d = muat(h20.teks, { name: 'coal', quantity: null, unit: null, operation: 'LOAD' })
  cek('N1c H20: komoditas karangan "coal" → baris dibuang', a1d === null, f(a1d))
  const a2 = muat(h18.teks, { name: 'coal', quantity: null, unit: null, operation: 'DISCHARGE' })
  const a2b = baris(h18.teks, [{ name: 'cargo', quantity: 3000, unit: 'MT', operation: 'DISCHARGE' }])
  cek('N2 RG-H18: "Discharging completed" tanpa komoditas → tidak ada muatan tersimpan', a2 === null && a2b.length === 0, `${f(a2)} ${f(a2b)}`)
  // E09 — teks asli Eval-1
  const e09 = G.teksKasus(F1.bangunKasusEval1(new Date(`${HARI}T00:00:00Z`)).find((k) => k.id === 'E09'))
  const e1 = muat(e09, { name: 'coal', quantity: 7500, unit: 'MT', operation: 'LOAD' })
  cek('N3 E09 "was loaded … will be discharged": model LOAD TIDAK diterima (tanpa alias LOADED)', !!e1 && e1.operation === null, f(e1))
  const e2 = muat(e09, { name: 'coal', quantity: 7500, unit: 'MT', operation: 'DISCHARGE' })
  cek('N3b E09: DISCHARGE juga tidak didukung baris muatan (tanpa alias DISCHARGED) → null, bukan tebakan', !!e2 && e2.operation === null, f(e2))
  for (const [id, teks, q, u] of [
    ['N4 "DWT 58112 WMT"', 'Cargo: nickel ore, vessel DWT 58112 WMT class, muat', 58112, 'WMT'],
    ['N5 "GRT 4500 KL"', 'Muatan: HSD, kapal GRT 4500 KL, bongkar', 4500, 'KL'],
    ['N6 "LOA 1450 MT"', 'Cargo: coal LOA 1450 MT, load', 1450, 'MT'],
    ['N7 "USD 45/KL"', 'Cargo: HSD discharge, price USD 45/KL', 45, 'KL'],
    ['N8 "Rp 9.500 per KL"', 'Muatan: HSD bongkar, harga Rp 9.500 per KL', 9500, 'KL'],
    ['N9 "4500 KL/day"', 'Cargo: HSD discharge rate 4500 KL/day', 4500, 'KL'],
    ['N9b "4500 KL per day"', 'Cargo: HSD discharge at 4500 KL per day', 4500, 'KL'],
    ['N10 telepon "+62-555-4500 MT"', 'Muatan: batubara, muat. Telp +62-555-4500 MT', 4500, 'MT'],
    ['N10b telepon "0812-3456-4500 KL"', 'Muatan: HSD bongkar, hubungi 0812-3456-4500 KL', 4500, 'KL'],
    ['N10c telepon "(021) 555 4500 MT"', 'Cargo: coal load, call (021) 555 4500 MT', 4500, 'MT'],
    ['N10d telepon berlabel "HP 4500 MT"', 'Cargo: coal load, HP 4500 MT', 4500, 'MT'],
    ['N11 "IMO 9000012 MT"', 'Cargo: coal load IMO 9000012 MT', 9000012, 'MT'],
    ['N11b "Ref 4500 KL"', 'Muatan: HSD bongkar Ref 4500 KL', 4500, 'KL'],
    ['N11c "Acc 7700 MT" (rekening)', 'Cargo: coal load, Acc 7700 MT', 7700, 'MT'],
    ['N11d "Rek 7700 KL" (rekening)', 'Muatan: HSD bongkar, Rek 7700 KL', 7700, 'KL'],
    ['N11e "Dermaga 2" (tambatan)', 'Muatan: semen bongkar di Dermaga 2 MT', 2, 'MT'],
  ]) {
    const nama = /HSD/.test(teks) ? 'HSD' : /nickel/.test(teks) ? 'nickel ore' : /batubara/.test(teks) ? 'batubara' : /semen/.test(teks) ? 'semen' : 'coal'
    const c = muat(teks, { name: nama, quantity: q, unit: u, operation: null })
    cek(`${id} → bukan jumlah muatan (quantity & unit null)`, nol(c) && c.unit === null && c.flags.includes('CARGO_QUANTITY_NOT_IN_SOURCE'), f(c))
  }
  const rentang = muat('Cargo: coal load 5000-6000 MT', { name: 'coal', quantity: 6000, unit: 'MT', operation: 'LOAD' })
  cek('N10e rentang jumlah "5000-6000 MT" bukan telepon (perilaku lama dipertahankan)', rentang?.quantity === 6000, f(rentang))
  const ld = muat('Cargo: 5000 MT coal. Loaded draft 9.8 m', { name: 'coal', quantity: 5000, unit: 'MT', operation: 'LOAD' })
  cek('N12 "loaded draft" bukan bukti LOAD', ld?.operation === null && ld.flags.includes('CARGO_OPERATION_NOT_IN_SOURCE'), f(ld))
  const lp = muat('Cargo: 5000 MT coal, last port Samarinda - loaded', { name: 'coal', quantity: 5000, unit: 'MT', operation: 'LOAD' })
  cek('N13 "last port … loaded" bukan bukti LOAD', lp?.operation === null, f(lp))
  const pp = 'Cargo: 5000 MT coal loaded at Samarinda (previous port), to be discharged at Luwuk'
  const pp1 = muat(pp, { name: 'coal', quantity: 5000, unit: 'MT', operation: 'LOAD' })
  const pp2 = muat(pp, { name: 'coal', quantity: 5000, unit: 'MT', operation: 'DISCHARGE' })
  cek('N14 muat di pelabuhan sebelumnya / bongkar di sini: LOAD → CONTRADICTS null; DISCHARGE → diterima', pp1?.operation === null && pp1.flags.includes('CARGO_OPERATION_CONTRADICTS_SOURCE') && pp2?.operation === 'DISCHARGE' && bersih(pp2), `${f(pp1)} ${f(pp2)}`)
  const mc = baris('Cargo: 3000 MT coal to be loaded and 2000 MT sand to be discharged', [{ name: 'coal', quantity: 3000, unit: 'MT', operation: 'LOAD' }, { name: 'sand', quantity: 2000, unit: 'MT', operation: 'DISCHARGE' }])
  cek('N15 beberapa muatan, dua arah di satu baris → keduanya AMBIGUOUS (wajib konfirmasi), tak ada yang tepercaya otomatis', mc.length === 2 && mc.every((c) => c.flags.includes('CARGO_OPERATION_AMBIGUOUS') && !P.cargoTepercaya(c)), f(mc))
  const mp = muat('Cargo: 5000 MT coal\nLoad port: Satui, discharge port: Luwuk', { name: 'coal', quantity: 5000, unit: 'MT', operation: 'DISCHARGE' })
  cek('N16 beberapa pelabuhan (label load/discharge port) bukan bukti operasi', mp?.operation === null, f(mp))
  const kosongBaris = baris('Cargo: bongkar semen 1450 MT dan 380\n\nMT besi beton', [{ name: 'besi beton', quantity: 380, unit: 'MT', operation: 'DISCHARGE' }])
  // Operasi di sini datang dari baris berlabel "Cargo: bongkar …" — aturan v1 yang TIDAK berubah (semua baris berlabel muatan
  // adalah bukti operasi); dibuktikan identik dengan validator lama di bagian X. Yang diuji: jumlah/satuan TIDAK disambung.
  cek('N17 baris kosong di antara jumlah dan satuan → TIDAK disambung (jumlah & satuan null)', kosongBaris[0]?.quantity === null && kosongBaris[0].unit === null && kosongBaris[0].flags.includes('CARGO_QUANTITY_NOT_IN_SOURCE'), f(kosongBaris))
  const sTanpaJ = muat('Cargo: besi beton MT, bongkar', { name: 'besi beton', quantity: null, unit: 'MT', operation: 'DISCHARGE' })
  cek('N18 satuan tanpa jumlah → satuan dikosongkan (CARGO_UNIT_WITHOUT_QUANTITY)', sTanpaJ?.unit === null && sTanpaJ.flags.includes('CARGO_UNIT_WITHOUT_QUANTITY'), f(sTanpaJ))
  const jTanpaS = muat('Cargo: besi beton 380, bongkar', { name: 'besi beton', quantity: 380, unit: 'MT', operation: 'DISCHARGE' })
  cek('N19 jumlah tanpa satuan (tanpa label jumlah) → jumlah & satuan null', jTanpaS?.quantity === null && jTanpaS.unit === null, f(jTanpaS))
  const namaTakTepat = baris('Cargo: bongkar 1450 MT semen dan 380\nMT, cnee PT Uji, besi beton', [{ name: 'besi beton', quantity: 380, unit: 'MT', operation: 'DISCHARGE' }])
  cek('N20 sambungan: nama muatan TIDAK tepat sesudah satuan → tidak disambung', namaTakTepat[0]?.quantity === null, f(namaTakTepat))
  const curi = baris('Cargo: bongkar 1450 MT semen zak dan 380\nMT besi beton', [{ name: 'semen zak', quantity: 380, unit: 'MT', operation: 'DISCHARGE' }])
  cek('N21 sambungan milik "besi beton" tidak bisa dipakai baris "semen zak" (380 → null)', curi[0]?.quantity === null, f(curi))
  const dwtLintas = baris('Particulars: DWT 58112\nMT coal, load', [{ name: 'coal', quantity: 58112, unit: 'MT', operation: 'LOAD' }])
  cek('N22 sambungan dengan label partikular (DWT) sebelum angka → tidak disambung', dwtLintas[0]?.quantity === null, f(dwtLintas))
  const telLintas = baris('Muatan batubara, muat. Hubungi +62-555-4500\nMT batubara', [{ name: 'batubara', quantity: 4500, unit: 'MT', operation: 'LOAD' }])
  cek('N23 sambungan dengan fragmen telepon di akhir baris → tidak disambung', telLintas[0]?.quantity === null, f(telLintas))
  const tambat = baris('Cargo: coal load. Sandar di Dermaga 2\nMT TESTVESSEL ALFA arrives', [{ name: 'TESTVESSEL ALFA', quantity: 2, unit: 'MT', operation: null }])
  cek('N24 "Dermaga 2" + baris berikut "MT <nama kapal>" → nomor tambatan tak menjadi jumlah', tambat[0]?.quantity === null, f(tambat))
  const uangLintas = baris('Cargo: HSD discharge, price USD 45\nKL HSD', [{ name: 'HSD', quantity: 45, unit: 'KL', operation: 'DISCHARGE' }])
  cek('N25 sambungan dengan mata uang sebelum angka → tidak disambung', uangLintas[0]?.quantity === null, f(uangLintas))
  const tarifLintas = baris('Cargo: HSD discharge 4500\nKL/day HSD', [{ name: 'HSD', quantity: 4500, unit: 'KL', operation: 'DISCHARGE' }])
  cek('N26 sambungan dengan tarif "/day" sesudah satuan → tidak disambung', tarifLintas[0]?.quantity === null, f(tarifLintas))
  const tigaBaris = baris('Cargo: bongkar semen 380\nMT\nbesi beton', [{ name: 'besi beton', quantity: 380, unit: 'MT', operation: 'DISCHARGE' }])
  cek('N27 nama di baris ke-3 (pencarian multi-baris) → tidak disambung', tigaBaris[0]?.quantity === null, f(tigaBaris))
  // Z17 — keputusan owner 1
  const z17 = D5.bangunKasusEval5(new Date(`${HARI}T00:00:00Z`)).find((k) => k.id === 'Z17')
  const zc = muat(z17.teks, { name: 'milling wheat', quantity: 21000, unit: 'MT', operation: 'DISCHARGE' })
  cek('Z17 "discharge call" di luar baris muatan → operasi tetap null (konservatif, keputusan owner 1)', zc?.quantity === 21000 && zc.unit === 'MT' && zc.operation === null && zc.flags.includes('CARGO_OPERATION_NOT_IN_SOURCE'), f(zc))
  const zc2 = muat('We nominate you for the following loading call:\nCargo: 21000 MT milling wheat in bulk', { name: 'milling wheat', quantity: 21000, unit: 'MT', operation: 'LOAD' })
  cek('Z17b "loading call" di luar baris muatan → operasi null', zc2?.operation === null, f(zc2))
}

// ============================================================================ Eval-5 sebagai REGRESI
bagian('Eval-5 Z01–Z40 sebagai REGRESI (EXPOSED — REGRESSION ONLY): jawaban sempurna → validator → scorer-3')
{
  const kasus = D5.bangunKasusEval5(new Date(`${HARI}T00:00:00Z`))
  const hasil = kasus.map((k) => {
    const raw = R3.jawabanSempurnaEval3(k)
    const post = P.validasiEkstraksi(structuredClone(raw), { inputKind: 'TEXT', sourceText: P.normalisasiTeksSumber(k.teks), hariIni: HARI, norm: NORM })
    const n = S3.nilaiKasusV2(k, raw, post, NORM_SKOR)
    return { id: k.id, lulus: k.gt.classification.values.includes(post.classification) && n.POST.jumlah.FATAL === 0 && n.POST.jumlah.MAJOR === 0, fatal: n.POST.jumlah.FATAL, major: n.POST.jumlah.MAJOR, gt: n.integritasGt }
  })
  const gagalK = hasil.filter((h) => !h.lulus).map((h) => h.id)
  console.log(`     ringkas: ${hasil.filter((h) => h.lulus).length}/40 kasus lulus (× 2 ulangan = ${2 * hasil.filter((h) => h.lulus).length}/80); tidak lulus: ${gagalK.join(',') || '-'}`)
  cek('E5a jawaban sempurna: 0 FATAL POST di 40 kasus', hasil.every((h) => h.fatal === 0), f(hasil.filter((h) => h.fatal)))
  cek('E5b Z05, Z07, Z08, Z40 kini lulus (0 MAJOR)', ['Z05', 'Z07', 'Z08', 'Z40'].every((id) => hasil.find((h) => h.id === id).lulus), f(hasil.filter((h) => ['Z05', 'Z07', 'Z08', 'Z40'].includes(h.id))))
  cek('E5c satu-satunya kasus tak lulus = Z17 (konservatif, keputusan owner 1) → 39/40 = 78/80', JSON.stringify(gagalK) === '["Z17"]', f(gagalK))
  cek('E5d tak ada INCONCLUSIVE_GT', hasil.every((h) => h.gt === 'OK'))
  // injeksi: setiap angka terlarang/partikular GT dijadikan jumlah muatan karangan dengan tiap satuan → wajib dikosongkan
  let percobaan = 0
  const lolos = []
  for (const k of kasus) {
    const angka = (k.gt.terlarang ?? []).filter((t) => typeof t.nilai === 'number').map((t) => t.nilai)
    const namaMuatan = (k.gt.cargoes.bentukDiterima.flat()[0]?.name?.value) ?? null
    if (!angka.length || !namaMuatan) continue
    for (const q of angka) for (const u of ['MT', 'WMT', 'KL', 'CBM']) {
      percobaan++
      const raw = { ...R3.jawabanSempurnaEval3(k), cargoes: [{ name: namaMuatan, quantity: q, unit: u, operation: null }] }
      const c = P.validasiEkstraksi(structuredClone(raw), { inputKind: 'TEXT', sourceText: P.normalisasiTeksSumber(k.teks), hariIni: HARI, norm: NORM }).proposal.cargoes[0]
      if (c && c.quantity !== null) lolos.push(`${k.id}:${q}${u}`)
    }
  }
  cek(`E5e injeksi angka terlarang GT (uang/partikular/pengenal) sebagai jumlah muatan × {MT,WMT,KL,CBM}: 0 lolos dari ${percobaan} percobaan`, percobaan > 0 && lolos.length === 0, lolos.join(' '))
}

// ============================================================================ X — perbandingan dengan validator LAMA
bagian('X. Perubahan perilaku HANYA di kasus sasaran: validator baru vs validator dasar (commit 97348e0, leksikon v1)')
{
  const BASIS = '97348e0732d449fc860d49d6c30540addb6b973c'
  const { execFileSync } = await import('node:child_process')
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  let lama = null
  try {
    const dir = mkdtempSync(join(tmpdir(), 'validator-lama-'))
    mkdirSync(join(dir, 'src/services/intake'), { recursive: true })
    mkdirSync(join(dir, 'src/lib'), { recursive: true })
    for (const rel of ['src/services/intake/intake-policy.ts', 'src/lib/maritim-lexicon.ts']) writeFileSync(join(dir, rel), execFileSync('git', ['show', `${BASIS}:${rel}`], { cwd: AKAR }))
    lama = jiti(join(dir, 'src/services/intake/intake-policy.ts'))
  } catch {
    lama = null
  }
  if (!lama) cek('X0 validator dasar dapat dimuat dari riwayat git (butuh riwayat penuh)', false, 'git show gagal')
  else {
    const H = new Date(`${HARI}T00:00:00Z`)
    const F2 = await import('./fixtures/spike-intake/eval2-cases.mjs')
    const F3 = await import('./fixtures/spike-intake/eval3-cases.mjs')
    const F4 = await import('./fixtures/spike-intake/eval4-heldout-cases.mjs')
    const korpus = [...F1.bangunKasusEval1(H), ...F2.bangunKasusEval2(H), ...F3.bangunKasusEval3(H), ...F4.bangunKasusHeldoutEval4(H), ...RG.KASUS_REGRESI_MUATAN, ...D5.bangunKasusEval5(H)]
    const run = (PX, raw, teks) => JSON.stringify(PX.validasiEkstraksi(structuredClone(raw), { inputKind: 'TEXT', sourceText: PX.normalisasiTeksSumber(teks), hariIni: HARI, norm: NORM }))
    let n = 0
    const beda = new Set()
    let hilang = 0
    const dipertahankan = new Set()
    for (const k of korpus) {
      const teks = G.teksKasus(k)
      if (!teks) continue
      const dasar = R3.jawabanSempurnaEval3(k)
      const angka = [...new Set((teks.match(/\d[\d.,]*/g) ?? []).map((t) => Number(t.replace(/,/g, ''))).filter(Number.isFinite))].slice(0, 25)
      const nama = [...new Set([...(dasar.cargoes ?? []).map((c) => c.name), 'coal'])]
      const varian = [dasar]
      for (const nm of nama) for (const op of ['LOAD', 'DISCHARGE', null]) for (const u of ['MT', 'WMT', 'KL', 'CBM']) for (const q of [null, ...angka]) varian.push({ ...dasar, cargoes: [{ name: nm, quantity: q, unit: q === null ? null : u, operation: op }] })
      for (const raw of varian) {
        n++
        const a = run(lama, raw, teks)
        const b = run(P, raw, teks)
        if (a === b) continue
        beda.add(k.id)
        const cl = JSON.parse(a).proposal.cargoes
        JSON.parse(b).proposal.cargoes.forEach((c, i) => {
          for (const fl of ['quantity', 'unit', 'operation']) {
            if (c[fl] === null && cl[i]?.[fl] != null) hilang++
            if (c[fl] !== null && (cl[i]?.[fl] ?? null) === null) dipertahankan.add(`${k.id}:${c.name}:${fl}=${c[fl]}`)
          }
        })
      }
    }
    console.log(`     ${n} varian dibandingkan; kasus berubah: ${[...beda].join(',')}`)
    cek('X1 perilaku berubah HANYA pada Z05, Z07, Z08, Z40 (Eval-1..4, RG, dan 36 kasus Eval-5 lain identik)', JSON.stringify([...beda].sort()) === '["Z05","Z07","Z08","Z40"]', [...beda].join(','))
    cek('X2 tak ada nilai yang sebelumnya dipertahankan kini hilang', hilang === 0, String(hilang))
    const harap = ['Z05:bijih nikel:quantity=55000', 'Z05:bijih nikel:unit=WMT', 'Z07:palm kernel expeller:operation=LOAD', 'Z08:HSD:quantity=4500', 'Z08:HSD:unit=KL', 'Z40:besi beton:quantity=380', 'Z40:besi beton:unit=MT', 'Z40:besi beton:operation=DISCHARGE']
    cek('X3 nilai yang KINI dipertahankan = tepat nilai tertulis di sumber (55000 WMT, LOAD, 4500 KL, 380 MT DISCHARGE)', JSON.stringify([...dipertahankan].sort()) === JSON.stringify([...harap].sort()), [...dipertahankan].join(' | '))
  }
}

cek('0 panggilan jaringan', fetchNyata === 0)
console.log(`\n${gagal === 0 ? '✅' : '❌'} ${lulus} lulus, ${gagal} gagal`)
process.exit(gagal === 0 ? 0 : 1)
