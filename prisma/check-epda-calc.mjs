// Uji mesin hitung EPDA (services/finance/*.ts — modul murni Fase 3).
//
// Jalankan:  node prisma/check-epda-calc.mjs   (atau: npm run test:calc)
//
// Kenapa ada: modul ini menentukan ANGKA yang dikirim ke principal. Rumus uang yang
// tidak diuji adalah tebakan yang kebetulan belum ketahuan salah. Daftar kasus di
// bawah adalah salinan langsung dari acceptance test §14/3a FASE-3-EPDA-ENGINE.md,
// termasuk fixture emas dari EPDA-Tribuana.pdf nyata beserta angka harapannya.
//
// TIDAK menyentuh database sama sekali — itu memang inti K11. Berkas .ts diimpor
// LANGSUNG (Node 24 mengurai TypeScript sendiri), jadi yang diuji adalah objek yang
// persis sama dengan yang dipakai aplikasi dan browser, bukan tiruannya.
//
// ⚠️ Pagar K11 dibuktikan dua lapis, karena satu lapis saja tidak cukup:
//   - Lapis runtime: hilangkan `type` dari `import type { CalcWarning } from
//     './calc-engine'` di rate-resolver.ts → berkas ini GAGAL memuat seketika
//     (ERR_MODULE_NOT_FOUND — ESM butuh ekstensi eksplisit, dan menuliskan `.ts`
//     eksplisit ditolak tsc dengan TS5097; tak ada bentuk yang lolos keduanya).
//   - Lapis statis (bagian 1): impor nilai dari '@prisma/client' TIDAK membuat
//     berkas ini gagal — sudah dicoba, tetap lolos 256 pemeriksaan. Karena itu
//     kemurnian juga diperiksa dengan membaca sumber modulnya.

import { readFileSync } from 'node:fs'
import {
  WARNING_PEMBLOKIR,
  adaWarningPemblokir,
  bulatkan,
  hitungBaris,
  hitungEtmal,
  usulKuantitas,
  verifikasiBaris,
} from '../src/services/finance/calc-engine.ts'
import { hitungTotal } from '../src/services/finance/totals.ts'
import {
  BOLEH_UBAH_ITEM,
  STATUS_TERMINAL,
  TRANSISI,
  bolehTransisi,
  bolehTransisiUntukKind,
  bolehUbahItem,
  butuhSyaratSubmit,
  transisiTersedia,
} from '../src/services/finance/disbursement-status.ts'
import {
  IZINKAN_SETUJU_SENDIRI,
  KEPUTUSAN_APPROVAL,
  STATUS_DARI_KEPUTUSAN,
  bolehMemutuskan,
  kebijakanApproval,
  levelBerikutnya,
  rondeLengkap,
} from '../src/services/finance/approval-policy.ts'
import { labelBracket, lolosSaringan, pilihTarif, skorTarif } from '../src/services/finance/rate-resolver.ts'
import { bandingkanVersi } from '../src/services/finance/compare.ts'
import { hitungVariance } from '../src/services/finance/variance.ts'

let lulus = 0
let gagal = 0

function cek(nama, syarat, keterangan = '') {
  if (syarat) {
    lulus++
    console.log(`  ✅ ${nama}`)
  } else {
    gagal++
    console.log(`  ❌ ${nama}${keterangan !== '' ? ` — ${keterangan}` : ''}`)
  }
}

const sama = (nama, dapat, harap) => cek(nama, dapat === harap, `dapat ${dapat}, harap ${harap}`)

const adaWarning = (hasil, kode) => hasil.warnings.some((w) => w.kode === kode)
const adaPelanggaran = (hasil, kode) => hasil.pelanggaran.some((p) => p.kode === kode)

/** Mesin baris disuntikkan ke totals.ts — lihat catatan kepala totals.ts. */
const mesin = { hitungBaris, bulatkan }

/** IDR: decimals 0 (seed Currency), satu mata uang, kurs 1. */
const IDR = { decimals: 0, exchangeRate: 1, decimalsBase: 0 }

const jam = (n) => new Date(Date.UTC(2026, 5, 28, 0, 0, 0) + n * 3600_000)
const tgl = (s) => new Date(`${s}T00:00:00.000Z`)

// ============================================================================
// 1. Pagar K11 — modul murni benar-benar murni (pemeriksaan statis)
// ============================================================================
console.log('\n1. Pagar K11: modul murni tanpa impor nilai')

// Kenapa diperiksa dengan MEMBACA BERKASNYA, bukan cukup mengandalkan "kalau
// rusak, uji ini gagal": ternyata tidak selalu gagal. Sudah dicoba — mengubah
// `import type { CalcMethod }` menjadi `import { CalcMethod }` dari '@prisma/client'
// tetap dimuat Node dengan lancar, karena CalcMethod memang ada sebagai nilai
// runtime. Yang rusak justru bundel klien (seluruh @prisma/client terbawa ke
// browser, membatalkan bonus K11) dan itu tak terlihat dari sini. Yang runtuh
// seketika hanyalah impor nilai RELATIF antar modul murni.
//
// Jadi pagar ini bekerja seperti pemeriksaan TENANT_MODELS vs schema.prisma di
// check-tenant-guard.mjs: memeriksa sumbernya, bukan menunggu gejalanya.
const MODUL_MURNI = [
  'calc-engine.ts',
  'totals.ts',
  'disbursement-status.ts',
  'approval-policy.ts',
  'rate-resolver.ts',
  'compare.ts',
  'variance.ts',
]

const komentar = (b) => b.startsWith('//') || b.startsWith('*') || b.startsWith('/*')

for (const nama of MODUL_MURNI) {
  const isi = readFileSync(new URL(`../src/services/finance/${nama}`, import.meta.url), 'utf8')
  const kode = isi
    .split('\n')
    .map((b) => b.trim())
    .filter((b) => !komentar(b))
  const imporNilai = kode.filter((b) => b.startsWith('import ') && !b.startsWith('import type '))
  cek(`${nama}: setiap impor ber-\`import type\``, imporNilai.length === 0, imporNilai.join(' | '))
  cek(`${nama}: tanpa require()`, !kode.some((b) => b.includes('require(')))
  cek(
    `${nama}: tanpa new Date() — semua tanggal masuk sebagai argumen`,
    !kode.some((b) => b.includes('new Date(')),
  )
}

// ============================================================================
// 2. Fixture emas — replika EPDA-Tribuana.pdf (SAMPLE_EPDA di lib/pdf/epda-data.ts)
//    GT 8.432 · 3 etmal · agency 2,5%
// ============================================================================
console.log('\n2. Fixture emas EPDA Tribuana (GT 8.432, 3 etmal, agency 2,5%)')

const GOLDEN = [
  { sec: 'A', desc: 'Anchorage dues (labuh)', calcMethod: 'PER_GT_PER_CALL', quantity: 8432, unitPrice: 75, harap: 632_400 },
  { sec: 'A', desc: 'Berthing dues (tambat)', calcMethod: 'PER_GT_PER_DAY', quantity: 8432 * 3, unitPrice: 120, harap: 3_035_520 },
  { sec: 'A', desc: 'Light & navigation dues', calcMethod: 'PER_GT', quantity: 8432, unitPrice: 55, harap: 463_760 },
  { sec: 'A', desc: 'VTS / port service charge', calcMethod: 'FLAT', quantity: 1, unitPrice: 2_500_000, harap: 2_500_000 },
  { sec: 'B', desc: 'Pilotage in & out (pandu)', calcMethod: 'PER_UNIT', quantity: 2, unitPrice: 4_750_000, harap: 9_500_000 },
  { sec: 'B', desc: 'Tug assistance (tunda)', calcMethod: 'PER_UNIT', quantity: 4, unitPrice: 6_250_000, harap: 25_000_000 },
  { sec: 'B', desc: 'Mooring gang (kepil)', calcMethod: 'PER_UNIT', quantity: 2, unitPrice: 1_800_000, harap: 3_600_000 },
  { sec: 'C', desc: 'Customs, Immigration & Quarantine', calcMethod: 'FLAT', quantity: 1, unitPrice: 3_500_000, harap: 3_500_000 },
  { sec: 'C', desc: 'Harbour master clearance (SPB)', calcMethod: 'FLAT', quantity: 1, unitPrice: 1_250_000, harap: 1_250_000 },
  { sec: 'C', desc: 'Documentation & cabotage report', calcMethod: 'FLAT', quantity: 1, unitPrice: 900_000, harap: 900_000 },
  // Baris "Agency fee" ini ADA di PDF nyata sebagai lump sum seksi D, terpisah dari
  // baris total "Agency handling 2,5%". K21 melarangnya sebagai item hanya bila
  // serviceCode-nya AGENCY_FEE — penegakan itu milik service layer (3b), bukan mesin.
  { sec: 'D', desc: 'Agency fee (lump sum)', calcMethod: 'FLAT', quantity: 1, unitPrice: 12_500_000, harap: 12_500_000 },
  { sec: 'D', desc: 'Boat hire & transportation', calcMethod: 'PER_DAY', quantity: 3, unitPrice: 1_500_000, harap: 4_500_000 },
  { sec: 'D', desc: 'Communication, bank & sundries', calcMethod: 'FLAT', quantity: 1, unitPrice: 2_000_000, harap: 2_000_000 },
]

const emas = hitungTotal(
  GOLDEN.map((g) => ({ calcMethod: g.calcMethod, quantity: g.quantity, unitPrice: g.unitPrice, sectionLetter: g.sec, ...IDR })),
  { agencyPct: 2.5, decimalsBase: 0 },
  mesin,
)

GOLDEN.forEach((g, i) => sama(`${g.desc} (${g.calcMethod})`, emas.baris[i].amount, g.harap))

sama('subtotal seksi A', emas.perSeksi.A, 6_631_680)
sama('subtotal seksi B', emas.perSeksi.B, 38_100_000)
sama('subtotal seksi C', emas.perSeksi.C, 5_650_000)
sama('subtotal seksi D', emas.perSeksi.D, 19_000_000)
sama('subtotal dokumen', emas.subtotal, 69_381_680)
sama('agency handling 2,5%', emas.agencyAmount, 1_734_542)
sama('pajak (tak ada baris taxable)', emas.taxAmount, 0)
sama('TOTAL', emas.grandTotal, 71_116_222)
cek('tak ada pelanggaran pada fixture emas', emas.pelanggaran.length === 0, JSON.stringify(emas.pelanggaran))
cek('tak ada warning pemblokir pada fixture emas', !adaWarningPemblokir(emas.warnings), JSON.stringify(emas.warnings))
cek(
  'subtotal = jumlah kolom amount yang tercetak (K23)',
  emas.subtotal === emas.baris.reduce((j, b) => j + b.amount, 0),
)

// ============================================================================
// 3. Usulan kuantitas — 11 CalcMethod tabel K16
// ============================================================================
console.log('\n3. usulKuantitas() — seluruh 11 CalcMethod (tabel K16)')

const KONTEKS = { gt: 8432, nrt: 4015, etmal: 3, calls: 1, cargoTon: 6000, basisPersen: 69_381_680 }
const usul = (m, k = KONTEKS) => usulKuantitas(m, k)

sama('FLAT → 1', usul('FLAT').quantity, 1)
sama('PER_UNIT → 1 (operator isi jumlah unit)', usul('PER_UNIT').quantity, 1)
sama('PER_GT → gt', usul('PER_GT').quantity, 8432)
sama('PER_GT_PER_CALL → gt × calls', usul('PER_GT_PER_CALL').quantity, 8432)
sama('PER_GT_PER_DAY → gt × etmal (pengali dikalikan habis, K13)', usul('PER_GT_PER_DAY').quantity, 25_296)
sama('PER_DAY → etmal', usul('PER_DAY').quantity, 3)
sama('PER_HOUR → 1 (operator isi jumlah jam)', usul('PER_HOUR').quantity, 1)
sama('PER_TON → cargoTon', usul('PER_TON').quantity, 6000)
sama('PERCENTAGE → basisPersen', usul('PERCENTAGE').quantity, 69_381_680)
sama('TIERED → 1 (GT hanya memilih baris tarif, K26)', usul('TIERED').quantity, 1)
sama('MANUAL → 1', usul('MANUAL').quantity, 1)
cek(
  'usulan cocok dengan quantity fixture emas',
  usul('PER_GT_PER_CALL').quantity === GOLDEN[0].quantity &&
    usul('PER_GT_PER_DAY').quantity === GOLDEN[1].quantity &&
    usul('PER_GT').quantity === GOLDEN[2].quantity &&
    usul('PER_DAY').quantity === GOLDEN[11].quantity,
)

// ============================================================================
// 4. Nilai konteks kosong → amount 0 + warning; bukan lemparan, bukan NaN (K16-2)
// ============================================================================
console.log('\n4. Konteks kosong → 0 + warning (bukan lemparan, bukan NaN)')

const kosong = { gt: null, nrt: null, etmal: null, calls: 1, cargoTon: null, basisPersen: 0 }

const uGt = usul('PER_GT', kosong)
sama('gt = null → quantity 0', uGt.quantity, 0)
cek('gt = null → warning GT_TIDAK_ADA', uGt.warnings.some((w) => w.kode === 'GT_TIDAK_ADA'))
const bGt = hitungBaris({ calcMethod: 'PER_GT', quantity: uGt.quantity, unitPrice: 55, ...IDR })
sama('gt = null → amount 0', bGt.amount, 0)
cek('gt = null → amount bukan NaN', Number.isFinite(bGt.amount))
cek('gt = null → tidak melempar & tak ada pelanggaran', bGt.pelanggaran.length === 0)

const uEtmal = usul('PER_GT_PER_DAY', kosong)
cek('etmal = null → warning ETMAL_TIDAK_ADA', uEtmal.warnings.some((w) => w.kode === 'ETMAL_TIDAK_ADA'))
cek('etmal = null → juga melaporkan GT_TIDAK_ADA', uEtmal.warnings.some((w) => w.kode === 'GT_TIDAK_ADA'))
sama('etmal & gt null → quantity 0 (bukan NaN)', uEtmal.quantity, 0)

cek('cargoTon = null → warning TON_TIDAK_ADA', usul('PER_TON', kosong).warnings.some((w) => w.kode === 'TON_TIDAK_ADA'))
cek('basisPersen = 0 → warning BASIS_PERSEN_NOL', usul('PERCENTAGE', kosong).warnings.some((w) => w.kode === 'BASIS_PERSEN_NOL'))

cek('GT_TIDAK_ADA memblokir submit', WARNING_PEMBLOKIR.has('GT_TIDAK_ADA'))
cek('TARIF_TIDAK_ADA memblokir submit', WARNING_PEMBLOKIR.has('TARIF_TIDAK_ADA'))
cek('KURS_TIDAK_ADA memblokir submit', WARNING_PEMBLOKIR.has('KURS_TIDAK_ADA'))
cek('TARIF_AMBIGU memblokir submit', WARNING_PEMBLOKIR.has('TARIF_AMBIGU'))
cek('MINIMUM_MENGIKAT TIDAK memblokir (cuma menjelaskan)', !WARNING_PEMBLOKIR.has('MINIMUM_MENGIKAT'))
cek('adaWarningPemblokir() abai pada warning penjelas', !adaWarningPemblokir([{ kode: 'MINIMUM_MENGIKAT', pesan: '' }]))
cek('adaWarningPemblokir() menangkap yang pemblokir', adaWarningPemblokir([{ kode: 'MINIMUM_MENGIKAT', pesan: '' }, { kode: 'GT_TIDAK_ADA', pesan: '' }]))

// ============================================================================
// 5. Aturan keras K16-1 & K16-3
// ============================================================================
console.log('\n5. Aturan keras: FLAT berkuantitas, kuantitas negatif, harga negatif')

const flat3 = hitungBaris({ calcMethod: 'FLAT', quantity: 3, unitPrice: 2_500_000, ...IDR })
cek('FLAT dengan quantity = 3 → pelanggaran FLAT_BERKUANTITAS', adaPelanggaran(flat3, 'FLAT_BERKUANTITAS'))
sama('FLAT ditolak → amount 0 (tidak 3× tanpa jejak)', flat3.amount, 0)
cek(
  'pesan penolakan menyebut penggantinya (PER_UNIT)',
  flat3.pelanggaran.some((p) => p.pesan.includes('PER_UNIT')),
)
cek('FLAT dengan quantity = 1 → sah', hitungBaris({ calcMethod: 'FLAT', quantity: 1, unitPrice: 2_500_000, ...IDR }).pelanggaran.length === 0)

const qNeg = hitungBaris({ calcMethod: 'PER_UNIT', quantity: -2, unitPrice: 100, ...IDR })
cek('quantity negatif → pelanggaran QUANTITY_NEGATIF', adaPelanggaran(qNeg, 'QUANTITY_NEGATIF'))

// K16-3: baris koreksi/diskon/refund pada FDA itu nyata dan tidak boleh diblokir.
const pNeg = hitungBaris({ calcMethod: 'MANUAL', quantity: 1, unitPrice: -500_000, ...IDR })
cek('unitPrice negatif DIIZINKAN (baris koreksi FDA)', pNeg.pelanggaran.length === 0)
sama('unitPrice negatif → amount negatif', pNeg.amount, -500_000)

cek(
  'decimals tak dikenal → pelanggaran DESIMAL_TIDAK_DIKENAL (bukan asal 2)',
  adaPelanggaran(hitungBaris({ calcMethod: 'FLAT', quantity: 1, unitPrice: 100, decimals: null, exchangeRate: 1 }), 'DESIMAL_TIDAK_DIKENAL'),
)
cek(
  'quantity NaN → pelanggaran ANGKA_TIDAK_SAH (tak pernah menghasilkan NaN)',
  adaPelanggaran(hitungBaris({ calcMethod: 'PER_GT', quantity: Number.NaN, unitPrice: 55, ...IDR }), 'ANGKA_TIDAK_SAH'),
)

// ============================================================================
// 6. minCharge mengikat (K16-4) — Pilotage GT kecil dari seed
// ============================================================================
console.log('\n6. minCharge: 500 GT × 175 = 87.500 → minimum 2.500.000')

const minKena = hitungBaris({
  calcMethod: 'PER_GT_PER_CALL',
  quantity: 500,
  unitPrice: 175,
  minCharge: 2_500_000,
  ...IDR,
})
sama('amount naik ke minCharge', minKena.amount, 2_500_000)
cek('warning MINIMUM_MENGIKAT muncul', adaWarning(minKena, 'MINIMUM_MENGIKAT'))
cek('warning membawa nilai hitung asli untuk ditampilkan', minKena.warnings.find((w) => w.kode === 'MINIMUM_MENGIKAT').data.hitung === 87_500)
cek('minCharge bukan pelanggaran (baris tetap sah)', minKena.pelanggaran.length === 0)

// Catatan yang layak diketahui 3b: pada tarif seed (175/GT, min 2.500.000) minimum
// masih MENGIKAT sampai GT 14.286 — termasuk untuk MT Soechi Asia (8.432 GT), yang
// hasilnya cuma 1.475.600. Butuh GT besar untuk melewatinya.
const minLewat = hitungBaris({
  calcMethod: 'PER_GT_PER_CALL',
  quantity: 20_000,
  unitPrice: 175,
  minCharge: 2_500_000,
  ...IDR,
})
sama('GT besar (20.000) → q × p yang menang', minLewat.amount, 3_500_000)
cek('minCharge tak mengikat → tanpa warning', !adaWarning(minLewat, 'MINIMUM_MENGIKAT'))
sama(
  'tarif seed 175/GT masih mengikat pada 8.432 GT (1.475.600 < 2.500.000)',
  hitungBaris({ calcMethod: 'PER_GT_PER_CALL', quantity: 8432, unitPrice: 175, minCharge: 2_500_000, ...IDR }).amount,
  2_500_000,
)

// ============================================================================
// 7. PERCENTAGE dua lintasan (K20)
// ============================================================================
console.log('\n7. PERCENTAGE dua lintasan — tak ada persen-dari-persen')

const barisPersen = [
  { calcMethod: 'FLAT', quantity: 1, unitPrice: 1000, sectionLetter: 'A', ...IDR },
  { calcMethod: 'FLAT', quantity: 1, unitPrice: 2000, sectionLetter: 'A', ...IDR },
  { calcMethod: 'PERCENTAGE', quantity: 0, unitPrice: 10, sectionLetter: 'D', ...IDR },
  { calcMethod: 'PERCENTAGE', quantity: 0, unitPrice: 5, sectionLetter: 'D', ...IDR },
]
const p1 = hitungTotal(barisPersen, { agencyPct: 0, decimalsBase: 0 }, mesin)

sama('basisPersen = Σ baris non-persen', p1.basisPersen, 3000)
sama('baris 10% = 300 (bukan 330 — tak menghitung baris persen lain)', p1.baris[2].amount, 300)
sama('baris 5% = 150 (bukan 165)', p1.baris[3].amount, 150)
sama('quantity baris persen = basis, invarian K13 tetap utuh', p1.baris[2].quantity, 3000)
sama('subtotal memasukkan baris persen', p1.subtotal, 3450)

// Urutan diacak: hasil harus identik (tidak tergantung displayOrder).
const acak = [barisPersen[3], barisPersen[1], barisPersen[2], barisPersen[0]]
const p2 = hitungTotal(acak, { agencyPct: 0, decimalsBase: 0 }, mesin)
sama('urutan diacak → basisPersen sama', p2.basisPersen, 3000)
sama('urutan diacak → subtotal sama', p2.subtotal, 3450)
sama('urutan diacak → baris 5% tetap 150', p2.baris[0].amount, 150)
sama('urutan diacak → baris 10% tetap 300', p2.baris[2].amount, 300)

const persenValas = hitungBaris({ calcMethod: 'PERCENTAGE', quantity: 3000, unitPrice: 10, decimals: 2, exchangeRate: 16_270, decimalsBase: 0 })
cek(
  'baris persen ber-kurs ≠ 1 ditolak (K20)',
  adaPelanggaran(persenValas, 'PERSEN_BUKAN_MATA_UANG_DASAR'),
)

// ============================================================================
// 8. hitungEtmal (K17)
// ============================================================================
console.log('\n8. hitungEtmal() — ceil, minimum 1')

sama('25 jam → 2 etmal', hitungEtmal(jam(0), jam(25)), 2)
sama('23 jam → 1 etmal', hitungEtmal(jam(0), jam(23)), 1)
sama('0 jam → 1 etmal (minimum)', hitungEtmal(jam(0), jam(0)), 1)
sama('tepat 24 jam → 1 etmal', hitungEtmal(jam(0), jam(24)), 1)
sama('tepat 48 jam → 2 etmal', hitungEtmal(jam(0), jam(48)), 2)
sama('72 jam → 3 etmal (kunjungan Tribuana)', hitungEtmal(jam(0), jam(72)), 3)
sama('selesai < mulai → null', hitungEtmal(jam(10), jam(2)), null)
sama('mulai kosong → null', hitungEtmal(null, jam(24)), null)
sama('selesai kosong → null', hitungEtmal(jam(0), null), null)
sama('tanggal tak sah → null', hitungEtmal(jam(0), new Date('bukan-tanggal')), null)

// ============================================================================
// 9. Pembulatan (K23)
// ============================================================================
console.log('\n9. Pembulatan half-up pada nilai absolut')

sama('0,5 → 1 (half-up)', bulatkan(0.5, 0), 1)
sama('-0,5 → -1 (simetris; Math.round akan memberi -0)', bulatkan(-0.5, 0), -1)
sama('1,4 → 1', bulatkan(1.4, 0), 1)
sama('-1,4 → -1', bulatkan(-1.4, 0), -1)
sama('-2,5 → -3', bulatkan(-2.5, 0), -3)
sama('0 tetap 0 (bukan -0)', Object.is(bulatkan(-0.2, 0), 0), true)
sama('USD 2 desimal: 12,344 → 12,34', bulatkan(12.344, 2), 12.34)
sama('USD 2 desimal: 12,346 → 12,35', bulatkan(12.346, 2), 12.35)

const idrTakBersen = hitungBaris({ calcMethod: 'PER_UNIT', quantity: 3, unitPrice: 1_500_000.4, ...IDR })
sama('IDR (decimals 0) tak pernah menyisakan sen', idrTakBersen.amount, 4_500_001)
cek('IDR amount bilangan bulat', Number.isInteger(idrTakBersen.amount))

// Dibulatkan per BARIS, bukan di akhir: kalau di akhir, total di PDF tak sama
// dengan jumlah kolom yang dicetak.
const tigaSetengah = hitungTotal(
  [0, 1, 2].map(() => ({ calcMethod: 'PER_UNIT', quantity: 1, unitPrice: 0.5, ...IDR })),
  { agencyPct: 0, decimalsBase: 0 },
  mesin,
)
sama('3 baris @0,5 IDR → subtotal 3 (per baris), bukan 2 (di akhir)', tigaSetengah.subtotal, 3)

// ============================================================================
// 10. Kurs & pajak (K22, K29, K30)
// ============================================================================
console.log('\n10. Kurs tak pernah diam-diam 1; pajak selalu dari data')

const tanpaKurs = hitungBaris({ calcMethod: 'PER_UNIT', quantity: 1, unitPrice: 12_000, decimals: 2, exchangeRate: null, decimalsBase: 0 })
cek('kurs null → warning KURS_TIDAK_ADA', adaWarning(tanpaKurs, 'KURS_TIDAK_ADA'))
sama('kurs null → amountBase 0, BUKAN 12.000 (larangan keras K30)', tanpaKurs.amountBase, 0)
cek('kurs null → amountBase ≠ amount', tanpaKurs.amountBase !== tanpaKurs.amount)

const denganKurs = hitungBaris({ calcMethod: 'PER_UNIT', quantity: 1, unitPrice: 12_000, decimals: 2, exchangeRate: 16_270, decimalsBase: 0 })
sama('USD 12.000 × 16.270 → Rp 195.240.000', denganKurs.amountBase, 195_240_000)
sama('amount tetap dalam mata uang baris', denganKurs.amount, 12_000)

const kenaPajak = hitungBaris({ calcMethod: 'FLAT', quantity: 1, unitPrice: 1_000_000, taxable: true, taxPct: 11, ...IDR })
sama('taxable + taxPct 11 → taxAmount 110.000', kenaPajak.taxAmount, 110_000)
sama('taxAmountBase ikut terisi', kenaPajak.taxAmountBase, 110_000)
sama('tidak taxable → taxAmount null (bukan 0)', hitungBaris({ calcMethod: 'FLAT', quantity: 1, unitPrice: 1_000_000, ...IDR }).taxAmount, null)

const pajakTanpaTarif = hitungBaris({ calcMethod: 'FLAT', quantity: 1, unitPrice: 1_000_000, taxable: true, taxPct: null, ...IDR })
cek('taxable tanpa taxPct → warning PAJAK_TANPA_TARIF (bukan diam-diam 0)', adaWarning(pajakTanpaTarif, 'PAJAK_TANPA_TARIF'))
sama('taxable tanpa taxPct → taxAmount null', pajakTanpaTarif.taxAmount, null)
cek('…dan warning itu memblokir submit (K22)', adaWarningPemblokir(pajakTanpaTarif.warnings))

const denganPajakHeader = hitungTotal(
  [{ calcMethod: 'FLAT', quantity: 1, unitPrice: 69_381_680, sectionLetter: 'A', ...IDR }],
  { agencyPct: 2.5, decimalsBase: 0, agencyTaxPct: 11 },
  mesin,
)
sama('pajak atas agencyAmount: 11% dari 1.734.542', denganPajakHeader.taxAmount, 190_800)
sama('grandTotal = subtotal + agency + pajak', denganPajakHeader.grandTotal, 69_381_680 + 1_734_542 + 190_800)

// ============================================================================
// 11. Invarian K13 — amount selalu bisa diturunkan ulang
// ============================================================================
console.log('\n11. Invarian K13: amount = f(calcMethod, quantity, unitPrice, minCharge)')

let semuaCocok = true
GOLDEN.forEach((g, i) => {
  const v = verifikasiBaris({
    calcMethod: g.calcMethod,
    quantity: g.quantity,
    unitPrice: g.unitPrice,
    ...IDR,
    amount: emas.baris[i].amount,
    amountBase: emas.baris[i].amountBase,
  })
  if (!v.cocok) {
    semuaCocok = false
    console.log(`     ↳ ${g.desc}: tersimpan ${v.amountTersimpan}, diturunkan ${v.amountDiturunkan}`)
  }
})
cek(`ke-13 baris fixture emas bisa diturunkan ulang`, semuaCocok)

cek(
  'baris ber-minCharge tetap bisa diturunkan ulang (alasan K15 ada)',
  verifikasiBaris({ calcMethod: 'PER_GT_PER_CALL', quantity: 500, unitPrice: 175, minCharge: 2_500_000, ...IDR, amount: 2_500_000 }).cocok,
)
cek(
  'baris PERCENTAGE bisa diturunkan ulang dari quantity tersimpan',
  verifikasiBaris({ calcMethod: 'PERCENTAGE', quantity: 3000, unitPrice: 10, ...IDR, amount: 300 }).cocok,
)
cek(
  'baris valas bisa diturunkan ulang termasuk amountBase',
  verifikasiBaris({ calcMethod: 'PER_UNIT', quantity: 1, unitPrice: 12_000, decimals: 2, exchangeRate: 16_270, decimalsBase: 0, amount: 12_000, amountBase: 195_240_000 }).cocok,
)
// Pemeriksaannya harus punya gigi: amount yang diketik tangan (dilarang K14) tertangkap.
cek(
  'amount yang diubah tangan TERTANGKAP (verifikasi bukan formalitas)',
  verifikasiBaris({ calcMethod: 'PER_GT', quantity: 8432, unitPrice: 55, ...IDR, amount: 9_999_999 }).cocok === false,
)
cek(
  'amountBase yang tidak konsisten TERTANGKAP',
  verifikasiBaris({ calcMethod: 'PER_UNIT', quantity: 1, unitPrice: 12_000, decimals: 2, exchangeRate: 16_270, decimalsBase: 0, amount: 12_000, amountBase: 12_000 }).cocok === false,
)

// ============================================================================
// 12. pilihTarif — saring, skor, tie-break, ambiguitas (K25)
// ============================================================================
console.log('\n12. pilihTarif() — spesifisitas, tie-break, kejujuran soal ambiguitas')

const tarifDasar = {
  portId: null,
  vesselType: null,
  gtMin: null,
  gtMax: null,
  rate: 100,
  currency: 'IDR',
  minCharge: null,
  effectiveFrom: tgl('2026-01-01'),
  effectiveTo: null,
  createdAt: tgl('2026-01-01'),
}
const ctxTarif = { tanggalJasa: tgl('2026-06-28'), portId: 'port-smr', vesselType: 'TANKER', gt: 8432 }

const umumBaru = { ...tarifDasar, id: 'r-umum', rate: 200, effectiveFrom: tgl('2026-06-01'), createdAt: tgl('2026-06-01') }
const khususPort = { ...tarifDasar, id: 'r-port', portId: 'port-smr', rate: 175, effectiveFrom: tgl('2026-01-01') }

const pPort = pilihTarif([umumBaru, khususPort], ctxTarif)
sama('tarif khusus pelabuhan mengalahkan tarif umum yang lebih baru', pPort.terpilih.id, 'r-port')
sama('skor port = +4', pPort.skor, 4)
cek('tanpa warning ambiguitas', pPort.warnings.length === 0)
sama('urutan kandidat diacak → pemenang sama', pilihTarif([khususPort, umumBaru], ctxTarif).terpilih.id, 'r-port')

sama('bobot port(4) > vesselType(2) + bracket(1)', skorTarif({ ...tarifDasar, id: 'x', portId: 'port-smr' }, ctxTarif) > skorTarif({ ...tarifDasar, id: 'y', vesselType: 'TANKER', gtMin: 1, gtMax: 99_999 }, ctxTarif), true)
sama('skor vesselType = +2', skorTarif({ ...tarifDasar, id: 'y', vesselType: 'TANKER' }, ctxTarif), 2)
sama('skor bracket GT = +1', skorTarif({ ...tarifDasar, id: 'z', gtMin: 5001, gtMax: 10_000 }, ctxTarif), 1)
sama('skor port + vesselType + bracket = 7', skorTarif({ ...tarifDasar, id: 'w', portId: 'port-smr', vesselType: 'TANKER', gtMin: 5001, gtMax: 10_000 }, ctxTarif), 7)

cek('effectiveFrom di masa depan disaring', !lolosSaringan({ ...tarifDasar, id: 'a', effectiveFrom: tgl('2026-12-01') }, ctxTarif))
cek('effectiveTo sudah lewat disaring', !lolosSaringan({ ...tarifDasar, id: 'b', effectiveTo: tgl('2026-03-01') }, ctxTarif))
cek('effectiveTo masih berlaku lolos', lolosSaringan({ ...tarifDasar, id: 'c', effectiveTo: tgl('2026-12-31') }, ctxTarif))
cek('portId pelabuhan lain disaring', !lolosSaringan({ ...tarifDasar, id: 'd', portId: 'port-bpn' }, ctxTarif))
cek('vesselType lain disaring', !lolosSaringan({ ...tarifDasar, id: 'e', vesselType: 'BULK' }, ctxTarif))
cek('bracket GT cocok lolos', lolosSaringan({ ...tarifDasar, id: 'f', gtMin: 5001, gtMax: 10_000 }, ctxTarif))
cek('bracket GT tak cocok disaring', !lolosSaringan({ ...tarifDasar, id: 'g', gtMin: 10_001, gtMax: 20_000 }, ctxTarif))
cek(
  'gt kosong → hanya baris TANPA bracket yang lolos',
  !lolosSaringan({ ...tarifDasar, id: 'h', gtMin: 5001, gtMax: 10_000 }, { ...ctxTarif, gt: null }) &&
    lolosSaringan({ ...tarifDasar, id: 'i' }, { ...ctxTarif, gt: null }),
)

const kembarA = { ...tarifDasar, id: 'r-aaa', portId: 'port-smr', rate: 175, createdAt: tgl('2026-02-01') }
const kembarB = { ...tarifDasar, id: 'r-bbb', portId: 'port-smr', rate: 190, createdAt: tgl('2026-02-01') }
const ambigu = pilihTarif([kembarA, kembarB], ctxTarif)
cek('dua tarif berskor & bertanggal sama → warning TARIF_AMBIGU', adaWarning(ambigu, 'TARIF_AMBIGU'))
cek(
  'warning menyebut KEDUA id supaya bisa diklik di UI',
  (() => {
    const w = ambigu.warnings.find((x) => x.kode === 'TARIF_AMBIGU')
    return w.data.tarifDipakai === 'r-aaa' && w.data.tarifPesaing === 'r-bbb'
  })(),
)
sama('tie-break id terkecil → deterministik', ambigu.terpilih.id, 'r-aaa')
sama('acak → tie-break tetap sama', pilihTarif([kembarB, kembarA], ctxTarif).terpilih.id, 'r-aaa')

const tieCreated = pilihTarif(
  [
    { ...tarifDasar, id: 'r-lama', portId: 'port-smr', createdAt: tgl('2026-02-01') },
    { ...tarifDasar, id: 'r-baru', portId: 'port-smr', createdAt: tgl('2026-05-01') },
  ],
  ctxTarif,
)
sama('tie-break kedua: createdAt terbaru menang', tieCreated.terpilih.id, 'r-baru')

const effBeda = pilihTarif(
  [
    { ...tarifDasar, id: 'r-1', portId: 'port-smr', effectiveFrom: tgl('2026-01-01') },
    { ...tarifDasar, id: 'r-2', portId: 'port-smr', effectiveFrom: tgl('2026-06-01') },
  ],
  ctxTarif,
)
sama('skor sama → effectiveFrom terbaru menang', effBeda.terpilih.id, 'r-2')
cek('effectiveFrom berbeda → BUKAN ambigu', !adaWarning(effBeda, 'TARIF_AMBIGU'))

const nihil = pilihTarif([], ctxTarif)
sama('tanpa kandidat → terpilih null', nihil.terpilih, null)
cek('tanpa kandidat → warning TARIF_TIDAK_ADA', adaWarning(nihil, 'TARIF_TIDAK_ADA'))
sama('label bracket untuk basis (K26)', labelBracket({ ...tarifDasar, id: 'l', gtMin: 5001, gtMax: 10_000 }), 'bracket GT 5001–10000')
sama('bracket tanpa batas atas', labelBracket({ ...tarifDasar, id: 'm', gtMin: 10_001, gtMax: null }), 'bracket GT 10001+')
sama('tanpa bracket → null', labelBracket({ ...tarifDasar, id: 'n' }), null)

// ============================================================================
// 13. Tabel transisi status (K34–K36)
// ============================================================================
console.log('\n13. Tabel transisi status — yang tak tercantum ditolak')

const SAH = [
  ['DRAFT', 'PENDING_REVIEW'],
  ['DRAFT', 'CANCELLED'],
  ['PENDING_REVIEW', 'APPROVED'],
  ['PENDING_REVIEW', 'REVISION_REQUESTED'],
  ['PENDING_REVIEW', 'DRAFT'],
  ['PENDING_REVIEW', 'CANCELLED'],
  ['REVISION_REQUESTED', 'PENDING_REVIEW'],
  ['REVISION_REQUESTED', 'CANCELLED'],
  ['APPROVED', 'SENT'],
  ['APPROVED', 'REVISION_REQUESTED'],
  ['APPROVED', 'CANCELLED'],
  ['SENT', 'REVISED'],
  ['SENT', 'CLOSED'],
  ['FINAL', 'CLOSED'],
]
for (const [dari, ke] of SAH) cek(`${dari} → ${ke} sah`, bolehTransisi(dari, ke))

const TAK_SAH = [
  ['APPROVED', 'DRAFT'],
  ['SENT', 'DRAFT'],
  ['SENT', 'APPROVED'],
  ['SENT', 'PENDING_REVIEW'],
  ['DRAFT', 'APPROVED'],
  ['DRAFT', 'SENT'],
  ['DRAFT', 'REVISED'],
  ['PENDING_REVIEW', 'SENT'],
  ['REVISION_REQUESTED', 'APPROVED'],
  ['FINAL', 'SENT'],
  ['FINAL', 'REVISED'],
  ['CANCELLED', 'DRAFT'],
  ['CANCELLED', 'PENDING_REVIEW'],
]
for (const [dari, ke] of TAK_SAH) cek(`${dari} → ${ke} DITOLAK`, !bolehTransisi(dari, ke))

const SEMUA_STATUS = Object.keys(TRANSISI)
for (const terminal of ['REVISED', 'CLOSED', 'CANCELLED']) {
  cek(
    `${terminal} → apa pun DITOLAK (terminal)`,
    SEMUA_STATUS.every((ke) => !bolehTransisi(terminal, ke)),
  )
  cek(`${terminal} terdaftar terminal & daftar transisinya kosong`, STATUS_TERMINAL.has(terminal) && TRANSISI[terminal].length === 0)
}
sama('graf memuat ke-9 status', SEMUA_STATUS.length, 9)

cek('SENT → FINAL sah untuk FDA (K35)', bolehTransisiUntukKind('FDA', 'SENT', 'FINAL'))
cek('SENT → FINAL DITOLAK untuk EPDA (estimasi tak pernah final)', !bolehTransisiUntukKind('EPDA', 'SENT', 'FINAL'))
cek('SENT → FINAL DITOLAK untuk FPDA', !bolehTransisiUntukKind('FPDA', 'SENT', 'FINAL'))
cek('SENT → REVISED tetap sah untuk EPDA', bolehTransisiUntukKind('EPDA', 'SENT', 'REVISED'))
cek('tombol EPDA di SENT tak menawarkan FINAL', !transisiTersedia('EPDA', 'SENT').includes('FINAL'))
cek('tombol FDA di SENT menawarkan FINAL', transisiTersedia('FDA', 'SENT').includes('FINAL'))

cek('item boleh diubah pada DRAFT', bolehUbahItem('DRAFT'))
cek('item boleh diubah pada REVISION_REQUESTED', bolehUbahItem('REVISION_REQUESTED'))
for (const s of ['PENDING_REVIEW', 'APPROVED', 'SENT', 'FINAL', 'REVISED', 'CLOSED', 'CANCELLED']) {
  cek(`item TIDAK boleh diubah pada ${s} (→ CONFLICT)`, !bolehUbahItem(s))
}
sama('BOLEH_UBAH_ITEM berisi tepat 2 status', BOLEH_UBAH_ITEM.size, 2)

cek('DRAFT → PENDING_REVIEW butuh syarat submit', butuhSyaratSubmit('DRAFT', 'PENDING_REVIEW'))
cek('REVISION_REQUESTED → PENDING_REVIEW butuh syarat submit yang sama', butuhSyaratSubmit('REVISION_REQUESTED', 'PENDING_REVIEW'))
cek('PENDING_REVIEW → APPROVED bukan syarat submit', !butuhSyaratSubmit('PENDING_REVIEW', 'APPROVED'))

// ============================================================================
// 14. Kebijakan approval interim (K43/K44 — P1/P2)
// ============================================================================
console.log('\n14. Kebijakan approval interim: 1 level, peran ADMIN')

const kK = { kind: 'EPDA', grandTotal: 71_116_222, baseCurrency: 'IDR' }
sama('satu level', kebijakanApproval(kK).length, 1)
sama('level 1 = ADMIN', kebijakanApproval(kK)[0].peran.join(','), 'ADMIN')
cek('ADMIN boleh memutuskan level 1', bolehMemutuskan('ADMIN', 1, kK))
for (const peran of ['OPERATOR', 'FINANCE', 'VIEWER']) {
  cek(`${peran} tidak boleh memutuskan (→ 403)`, !bolehMemutuskan(peran, 1, kK))
}
cek('level di luar kebijakan ditolak', !bolehMemutuskan('ADMIN', 2, kK))
sama('belum ada approval → level berikutnya 1', levelBerikutnya([], kK), 1)
sama('level 1 sudah → ronde selesai', levelBerikutnya([1], kK), null)
cek('ronde belum lengkap tanpa approval', !rondeLengkap([], kK))
cek('ronde lengkap sesudah level 1', rondeLengkap([1], kK))
cek('kebijakan FDA sama dengan EPDA (interim)', kebijakanApproval({ ...kK, kind: 'FDA' }).length === kebijakanApproval(kK).length)
cek('setuju-sendiri diizinkan-tercatat (P2)', IZINKAN_SETUJU_SENDIRI === true)
sama('tiga keputusan yang sah', KEPUTUSAN_APPROVAL.join(','), 'APPROVED,REJECTED,REQUEST_REVISION')
sama('REJECTED → CANCELLED (dokumen mati)', STATUS_DARI_KEPUTUSAN.REJECTED, 'CANCELLED')
sama('REQUEST_REVISION → REVISION_REQUESTED (masih hidup)', STATUS_DARI_KEPUTUSAN.REQUEST_REVISION, 'REVISION_REQUESTED')
cek(
  'ketiga status hasil keputusan bisa dicapai dari PENDING_REVIEW',
  KEPUTUSAN_APPROVAL.every((k) => bolehTransisi('PENDING_REVIEW', STATUS_DARI_KEPUTUSAN[k])),
)

// ============================================================================
// 15. bandingkanVersi (K39)
// ============================================================================
console.log('\n15. bandingkanVersi() — BARU / DIHAPUS / BERUBAH / SAMA')

const itemV1 = [
  { id: 'v1-a', sourceItemId: null, description: 'Pilotage', quantity: 8432, unitPrice: 175, currency: 'IDR', exchangeRate: 1, amount: 1_475_600, amountBase: 1_475_600, vendorId: 'vd-1' },
  { id: 'v1-b', sourceItemId: null, description: 'Tug', quantity: 4, unitPrice: 6_250_000, currency: 'IDR', exchangeRate: 1, amount: 25_000_000, amountBase: 25_000_000, vendorId: null },
  { id: 'v1-c', sourceItemId: null, description: 'Contingency', quantity: 1, unitPrice: 2_000_000, currency: 'IDR', exchangeRate: 1, amount: 2_000_000, amountBase: 2_000_000, vendorId: null },
]
const itemV2 = [
  { ...itemV1[0], id: 'v2-a', sourceItemId: 'v1-a' },
  { ...itemV1[1], id: 'v2-b', sourceItemId: 'v1-b', quantity: 6, amount: 37_500_000, amountBase: 37_500_000 },
  { id: 'v2-d', sourceItemId: null, description: 'Overtime clearance', quantity: 1, unitPrice: 900_000, currency: 'IDR', exchangeRate: 1, amount: 900_000, amountBase: 900_000, vendorId: null },
]

const diff = bandingkanVersi(itemV1, itemV2)
sama('1 baris SAMA', diff.ringkasan.SAMA, 1)
sama('1 baris BERUBAH', diff.ringkasan.BERUBAH, 1)
sama('1 baris BARU (tanpa sourceItemId)', diff.ringkasan.BARU, 1)
sama('1 baris DIHAPUS (tak punya keturunan)', diff.ringkasan.DIHAPUS, 1)
sama('baris DIHAPUS adalah Contingency', diff.baris.find((b) => b.status === 'DIHAPUS').lama.id, 'v1-c')
sama(
  'field yang berubah terdaftar tepat',
  diff.baris.find((b) => b.status === 'BERUBAH').fieldBerubah.join(','),
  'quantity,amount,amountBase',
)
cek('baris SAMA tak punya field berubah', diff.baris.find((b) => b.status === 'SAMA').fieldBerubah.length === 0)

const putus = bandingkanVersi(itemV1, [{ ...itemV2[0], sourceItemId: 'tidak-ada' }])
sama('sourceItemId menunjuk baris yang tak ada di versi pembanding → BARU', putus.baris[0].status, 'BARU')

const diffDeskripsi = bandingkanVersi([itemV1[0]], [{ ...itemV1[0], id: 'v2-a', sourceItemId: 'v1-a', description: 'Pilotage (2 gerakan)' }])
sama('perubahan deskripsi terdeteksi', diffDeskripsi.baris[0].fieldBerubah.join(','), 'description')
const diffVendor = bandingkanVersi([itemV1[0]], [{ ...itemV1[0], id: 'v2-a', sourceItemId: 'v1-a', vendorId: 'vd-2' }])
sama('perubahan vendor terdeteksi', diffVendor.baris[0].fieldBerubah.join(','), 'vendorId')

const hLama = { agencyPct: 2.5, subtotal: 28_475_600, agencyAmount: 711_890, taxAmount: 0, grandTotal: 29_187_490 }
const hBaru = { agencyPct: 3, subtotal: 39_875_600, agencyAmount: 1_196_268, taxAmount: 0, grandTotal: 41_071_868 }
const diffH = bandingkanVersi(itemV1, itemV2, hLama, hBaru)
sama('diff header memuat 5 field', diffH.header.length, 5)
sama('delta grandTotal', diffH.header.find((h) => h.field === 'grandTotal').delta, 41_071_868 - 29_187_490)
sama('delta agencyPct', diffH.header.find((h) => h.field === 'agencyPct').delta, 0.5)
cek('tanpa argumen header → diff header kosong (tak mengarang)', diff.header.length === 0)

// ============================================================================
// 16. hitungVariance (K46)
// ============================================================================
console.log('\n16. hitungVariance() — termasuk TAK DIANGGARKAN & TIDAK TEREALISASI')

const epdaItem = [
  { id: 'e1', sourceItemId: null, description: 'Pilotage', sectionLetter: 'B', amountBase: 1_000_000 },
  { id: 'e2', sourceItemId: null, description: 'Tug', sectionLetter: 'B', amountBase: 2_000_000 },
  { id: 'e3', sourceItemId: null, description: 'Contingency', sectionLetter: 'D', amountBase: 500_000 },
]
const fdaItem = [
  { id: 'f1', sourceItemId: 'e1', description: 'Pilotage', sectionLetter: 'B', amountBase: 1_200_000 },
  { id: 'f2', sourceItemId: 'e2', description: 'Tug', sectionLetter: 'B', amountBase: 2_000_000 },
  { id: 'f4', sourceItemId: null, description: 'Overtime syahbandar', sectionLetter: 'C', amountBase: 300_000 },
]

const vr = hitungVariance(epdaItem, fdaItem)
const cariV = (id) => vr.baris.find((b) => (b.fda && b.fda.id === id) || (b.epda && b.epda.id === id && !b.fda))

sama('naik 20% → varianceBase +200.000', cariV('f1').varianceBase, 200_000)
sama('naik 20% → variancePct 20', cariV('f1').variancePct, 20)
sama('tak berubah → SAMA', cariV('f2').status, 'SAMA')
sama('tak berubah → variance 0', cariV('f2').varianceBase, 0)
sama('baris FDA tanpa sourceItemId → TAK_DIANGGARKAN', cariV('f4').status, 'TAK_DIANGGARKAN')
sama('TAK_DIANGGARKAN → variance = seluruh nilainya', cariV('f4').varianceBase, 300_000)
sama('TAK_DIANGGARKAN → variancePct null (basis 0, bukan Infinity)', cariV('f4').variancePct, null)
sama('baris EPDA tanpa keturunan → TIDAK_TEREALISASI', cariV('e3').status, 'TIDAK_TEREALISASI')
sama('TIDAK_TEREALISASI → variance negatif penuh', cariV('e3').varianceBase, -500_000)
sama('TIDAK_TEREALISASI → variancePct -100', cariV('e3').variancePct, -100)
sama('4 baris variance (2 berpasangan + 1 ekstra + 1 hilang)', vr.baris.length, 4)

sama('Σ epdaBase', vr.ringkasan.epdaBase, 3_500_000)
sama('Σ fdaBase', vr.ringkasan.fdaBase, 3_500_000)
cek(
  'total variance BERJUMLAH: Σ per baris = fdaBase − epdaBase',
  vr.ringkasan.varianceBase === vr.ringkasan.fdaBase - vr.ringkasan.epdaBase &&
    vr.ringkasan.varianceBase === vr.baris.reduce((j, b) => j + b.varianceBase, 0),
  `Σ=${vr.ringkasan.varianceBase}`,
)
sama('urut |varianceBase| menurun — terbesar di atas', vr.baris[0].varianceBase, -500_000)
cek(
  'urutan benar-benar menurun',
  vr.baris.every((b, i) => i === 0 || Math.abs(vr.baris[i - 1].varianceBase) >= Math.abs(b.varianceBase)),
)
sama('hitungan status: 1 BERUBAH', vr.ringkasan.jumlah.BERUBAH, 1)
sama('hitungan status: 1 SAMA', vr.ringkasan.jumlah.SAMA, 1)
sama('hitungan status: 1 TAK_DIANGGARKAN', vr.ringkasan.jumlah.TAK_DIANGGARKAN, 1)
sama('hitungan status: 1 TIDAK_TEREALISASI', vr.ringkasan.jumlah.TIDAK_TEREALISASI, 1)

const vrHeader = hitungVariance(
  epdaItem,
  fdaItem,
  { subtotal: 3_500_000, agencyAmount: 87_500, taxAmount: 0, grandTotal: 3_587_500 },
  { subtotal: 3_500_000, agencyAmount: 87_500, taxAmount: 9625, grandTotal: 3_597_125 },
)
sama('variance header memuat 4 field', vrHeader.header.length, 4)
sama('variance grandTotal header', vrHeader.header.find((h) => h.field === 'grandTotal').variance, 9625)
cek('tanpa argumen header → tak mengarang variance header', vr.header.length === 0)

const vrKosong = hitungVariance([], [])
sama('dokumen kosong → tanpa baris', vrKosong.baris.length, 0)
sama('dokumen kosong → variancePct null (bukan NaN)', vrKosong.ringkasan.variancePct, null)

// ============================================================================
console.log(`\n${'='.repeat(46)}`)
console.log(gagal === 0 ? `✅ SEMUA LULUS (${lulus} pemeriksaan)` : `❌ ${gagal} GAGAL, ${lulus} lulus`)
process.exitCode = gagal === 0 ? 0 : 1
