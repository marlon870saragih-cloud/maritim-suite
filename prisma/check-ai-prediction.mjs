// Uji modul murni AI Layer (src/services/ai/*.ts — Fase 6b).
//
// Jalankan:  node prisma/check-ai-prediction.mjs   (atau: npm run test:ai)
//
// Kenapa ada: modul-modul ini menentukan seberapa yakin sistem MENGAKU dirinya
// terhadap angka yang akan dilihat operator saat menyusun EPDA. Rumus keyakinan
// yang cuma bisa diuji lewat DB berisi satu dokumen tak pernah benar-benar
// diuji (K51/1) — dan formula keyakinan yang salah tidak menghasilkan galat,
// ia menghasilkan layar yang terlihat profesional sambil berbohong.
//
// TIDAK menyentuh database sama sekali — itu memang inti K51/K11. Berkas `.ts`
// diimpor LANGSUNG (Node 24 mengurai TypeScript sendiri), jadi yang diuji adalah
// objek yang persis sama dengan yang dipakai server dan browser, bukan tiruannya.
//
// ⚠️ Pagar K51 dibuktikan DUA LAPIS, meniru check-epda-calc.mjs:
//   - Lapis runtime: hilangkan kata `type` dari `import type { CalcMethod } from
//     '@prisma/client'` di src/services/ai/prediction-core.ts, lalu jalankan
//     `npx tsc --noEmit`. Bundel klien ikut menyeret seluruh @prisma/client dan
//     bonus K51/2 (UI mengimpor modul yang sama) batal. Yang runtuh SEKETIKA di
//     sini hanyalah impor nilai RELATIF antar modul murni: ubah salah satu
//     `import type` antar berkas di src/services/ai/ menjadi `import` biasa →
//     berkas ini GAGAL MEMUAT (ERR_MODULE_NOT_FOUND — ESM butuh ekstensi
//     eksplisit, dan menuliskan `.ts` eksplisit ditolak tsc dengan TS5097; tak
//     ada bentuk yang lolos keduanya). Kembalikan sesudah membuktikan.
//   - Lapis statis (bagian 1 di bawah, OTOMATIS): impor nilai dari
//     '@prisma/client' TIDAK membuat berkas ini gagal — sudah terbukti di
//     Fase 3. Karena itu kemurnian diperiksa dengan MEMBACA sumber modulnya,
//     sama seperti pemeriksaan TENANT_MODELS vs schema.prisma di
//     check-tenant-guard.mjs: periksa sumbernya, jangan menunggu gejalanya.
//
//   Lapis statis SUDAH DIBUKTIKAN NYATA, bukan diasumsikan: saat menulis berkas
//   ini, `import type { CalcMethod }` di prediction-core.ts sengaja diubah jadi
//   `import { CalcMethod }`, dan bagian 1 langsung menerbitkan DUA kegagalan
//   ("setiap impor ber-`import type`" dan "tanpa impor nilai dari
//   @prisma/client") sementara 296 pemeriksaan lain tetap lulus — persis bukti
//   bahwa jalur runtime saja tidak akan menangkapnya. Impor lalu dikembalikan.

import { readFileSync } from 'node:fs'
import {
  AMBANG_BAND,
  AMBANG_NYATA,
  K_KECUKUPAN,
  KUNCI_TEKS,
  LANTAI_RESENSI,
  PENDAMPING_WAJIB,
  TEKS_KEYAKINAN,
  TOPI,
  V_SAMPEL_TUNGGAL,
  hitungConfidence,
  hitungR,
  hitungS,
  hitungV,
  kunciTeks,
  teksKeyakinan,
  tentukanBand,
  tentukanTier,
  terapkanTopi,
} from '../src/services/ai/confidence.ts'
import {
  hitungCv,
  hitungKuantil,
  kuantilR7,
  median,
  rataRata,
  ringkasSampel,
  saringCalcMethod,
  simpanganBakuSampel,
} from '../src/services/ai/prediction-core.ts'
import {
  FAKTOR_M,
  HITUNGAN_TINGKAT_KOSONG,
  KRITERIA_KEMIRIPAN,
  TINGKAT_KEMIRIPAN,
  labelTingkat,
  pilihTingkat,
  tingkatMaksimum,
} from '../src/services/ai/similarity.ts'
import {
  AMBANG,
  BUTUH_HISTORI,
  KODE_ANOMALI,
  aturanBarisGanda,
  aturanDiLuarKatalog,
  aturanHargaMenyimpang,
  aturanJasaHilang,
  aturanKursMenyimpang,
  aturanManualBesar,
  aturanNonaktif,
  aturanTotalMenyimpang,
  aturanVarianceBesar,
  jalankanSemuaAturan,
  ringkasanNonaktif,
} from '../src/services/ai/anomaly-rules.ts'
import {
  AMBANG_DIGIT,
  ekstrakAngka,
  kumpulkanAngkaPayload,
  periksaNarasi,
} from '../src/services/ai/narasi-guard.ts'
import {
  ANGGARAN_KARAKTER_BAWAAN,
  potongKonteks,
  ukuranKonteks,
} from '../src/services/ai/konteks.ts'

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

/**
 * Toleransi pembulatan untuk fixture emas K69: dokumen menuliskan confidence
 * dengan DUA desimal (0,32 · 0,48 · 0,73), jadi selisih sampai setengah satuan
 * desimal terakhir memang tak berarti apa-apa. 0,005 adalah persis batas itu —
 * lebih longgar dari itu akan membuat uji ini berhenti mendeteksi perubahan
 * formula yang sungguhan.
 */
const TOLERANSI = 0.005

const dekat = (nama, dapat, harap, tol = TOLERANSI) =>
  cek(nama, Math.abs(dapat - harap) <= tol, `dapat ${dapat}, harap ${harap} (±${tol})`)

// ============================================================================
// 1. Pagar K51 — modul murni benar-benar murni (pemeriksaan statis)
// ============================================================================
console.log('\n1. Pagar K51: modul murni tanpa impor nilai')

const MODUL_MURNI = [
  'provenance.ts',
  'confidence.ts',
  'prediction-core.ts',
  'similarity.ts',
  'anomaly-rules.ts',
  'narasi-guard.ts',
  'konteks.ts',
]

const komentar = (b) => b.startsWith('//') || b.startsWith('*') || b.startsWith('/*')

for (const nama of MODUL_MURNI) {
  const isi = readFileSync(new URL(`../src/services/ai/${nama}`, import.meta.url), 'utf8')
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
  cek(
    `${nama}: tanpa impor nilai dari @prisma/client`,
    !kode.some((b) => b.startsWith('import ') && !b.startsWith('import type ') && b.includes('@prisma/client')),
  )
  cek(`${nama}: tanpa throw untuk kondisi domain`, !kode.some((b) => b.startsWith('throw ')))
}

// ============================================================================
// 2. Fixture emas K69 — kelima baris contoh di §5 dokumen desain
// ============================================================================
console.log('\n2. Fixture emas K69 (tabel "Akibat yang disengaja")')

// Baris 1 — hari ini: 0 FDA nyata, 1 FDA uji. "S×R×V×M apa pun" → ≤ 0,20, RENDAH.
for (const [usia, cv, m] of [
  [0, 0, 1],
  [6, 0.1, 0.85],
  [36, 2, 0.55],
]) {
  const h = hitungConfidence({ nNyata: 0, nLatihan: 1, usiaBulan: usia, cv, m })
  cek(
    `K69/1 (0 nyata, 1 uji · usia ${usia}, cv ${cv}, M ${m}): tier LATIHAN, ≤0,20, RENDAH`,
    h.tier === 'LATIHAN' && h.confidence <= 0.2 && h.band === 'RENDAH',
    `tier ${h.tier}, confidence ${h.confidence}, band ${h.band}`,
  )
}

const k69b = hitungConfidence({ nNyata: 1, nLatihan: 0, usiaBulan: 0, cv: 0, m: 1 })
dekat('K69/2 (1 nyata, baru, ketat) confidence = 0,125', k69b.confidence, 0.125)
sama('K69/2 tier', k69b.tier, 'CAMPURAN')
sama('K69/2 band', k69b.band, 'RENDAH')
dekat('K69/2 topi CAMPURAN = 0,40', k69b.topi, 0.4)

const k69c = hitungConfidence({ nNyata: 3, nLatihan: 0, usiaBulan: 6, cv: 0.1, m: 1 })
dekat('K69/3 (3 nyata, ±6 bln, cv 0,1, ketat) confidence = 0,32', k69c.confidence, 0.32)
sama('K69/3 tier', k69c.tier, 'NYATA')
sama('K69/3 band (3 kunjungan memang belum banyak)', k69c.band, 'RENDAH')

const k69d = hitungConfidence({ nNyata: 9, nLatihan: 0, usiaBulan: 6, cv: 0.1, m: 1 })
dekat('K69/4 (9 nyata, ±6 bln, cv 0,1, ketat) confidence = 0,48', k69d.confidence, 0.48)
sama('K69/4 band', k69d.band, 'SEDANG')

const k69e = hitungConfidence({ nNyata: 30, nLatihan: 0, usiaBulan: 3, cv: 0.05, m: 1 })
dekat('K69/5 (30 nyata, ±3 bln, cv 0,05, ketat) confidence = 0,73', k69e.confidence, 0.73)
sama('K69/5 band', k69e.band, 'TINGGI')

// ============================================================================
// 3. Faktor S — tabel K68
// ============================================================================
console.log('\n3. S(n) = n/(n+3) — tabel K68')

for (const [n, harap] of [
  [0, 0.0],
  [1, 0.25],
  [2, 0.4],
  [3, 0.5],
  [6, 0.67],
  [9, 0.75],
  [20, 0.87],
  [50, 0.94],
]) {
  dekat(`S(${n}) = ${harap}`, hitungS(n), harap)
}

sama('K_KECUKUPAN = 3 (interim P16)', K_KECUKUPAN, 3)
sama('AMBANG_NYATA = 3 (interim P16)', AMBANG_NYATA, 3)
cek('S tak pernah mencapai 1, bahkan pada n = 10.000', hitungS(10_000) < 1)
sama('S(0) tepat 0 (bukan pembulatan)', hitungS(0), 0)
cek('S(-5) → 0, bukan negatif/NaN', hitungS(-5) === 0)
cek('S(NaN) → 0', hitungS(Number.NaN) === 0)

// ============================================================================
// 4. Faktor R — resensi & LANTAI
// ============================================================================
console.log('\n4. R(usiaBulan) = maks(0,20 ; 0,5^(usia/12))')

dekat('R(0) = 1,00', hitungR(0), 1.0)
dekat('R(12) = 0,50', hitungR(12), 0.5)
dekat('R(24) = 0,25', hitungR(24), 0.25)
dekat('R(36) = 0,20 (lantai, mentah 0,125)', hitungR(36), 0.2)
sama('R(60) = 0,20 LANTAI, bukan 0,03', hitungR(60), LANTAI_RESENSI)
cek('R(600) tetap di lantai', hitungR(600) === LANTAI_RESENSI)
dekat('R(-3) diperlakukan sebagai 0 → 1,00', hitungR(-3), 1.0)
dekat('R(6) = 0,7071', hitungR(6), 0.70711, 0.0001)

// ============================================================================
// 5. Faktor V — sebaran, dan hukuman sampel tunggal
// ============================================================================
console.log('\n5. V(cv) = 1/(1+cv); n=1 → 0,50 (BUKAN 1)')

for (const [cv, harap] of [
  [0, 1.0],
  [0.1, 0.91],
  [0.25, 0.8],
  [0.5, 0.67],
  [1.0, 0.5],
]) {
  dekat(`V(n≥2, cv ${cv}) = ${harap}`, hitungV(5, cv), harap)
}

sama('V(n=1) = 0,50 — sebaran TIDAK DIKETAHUI, dihukum', hitungV(1, 0), V_SAMPEL_TUNGGAL)
cek('V(n=1) bukan 1', hitungV(1, 0) !== 1)
sama('V(n=0) = 0 (tak dipakai; nilai pesimis)', hitungV(0, 0), 0)
cek('V tak pernah NaN untuk cv NaN', Number.isFinite(hitungV(5, Number.NaN)))

// ============================================================================
// 6. INVARIAN TOPI — pagar utama Fase 6, diuji MENYELURUH (bukan disampel)
// ============================================================================
console.log('\n6. Invarian topi provenance (K69) — grid penuh')

const NILAI_M = Object.values(FAKTOR_M) // 1,00 · 0,85 · 0,70 · 0,55

let kombinasi = 0
let langgarNaN = 0
let langgarTopi = 0
let langgarLatihan = 0
let langgarBandNolNyata = 0
let langgarMaks = 0

for (let n = 0; n <= 100; n++) {
  for (const nLatihan of [0, 1]) {
    for (let usia = 0; usia <= 60; usia++) {
      for (let cvKali10 = 0; cvKali10 <= 20; cvKali10++) {
        const cv = cvKali10 / 10
        for (const m of NILAI_M) {
          kombinasi++
          const h = hitungConfidence({ nNyata: n, nLatihan, usiaBulan: usia, cv, m })
          if (!Number.isFinite(h.confidence)) langgarNaN++
          if (h.confidence > TOPI[h.tier] + 1e-12) langgarTopi++
          if (h.tier === 'LATIHAN' && h.confidence > 0.2) langgarLatihan++
          if (n === 0 && h.band !== 'RENDAH') langgarBandNolNyata++
          if (h.confidence < 0 || h.confidence > 0.95) langgarMaks++
        }
      }
    }
  }
}

console.log(`  … ${kombinasi.toLocaleString('en-US')} kombinasi diperiksa (n 0–100 × nLatihan {0,1} × usia 0–60 bln × cv 0–2,0 × 4 nilai M)`)
sama('tidak ada NaN/Infinity di seluruh grid', langgarNaN, 0)
sama("tier 'LATIHAN' tidak pernah confidence > 0,20", langgarLatihan, 0)
sama('confidence tidak pernah melewati TOPI tier-nya', langgarTopi, 0)
sama("nNyata = 0 tidak pernah menghasilkan band selain RENDAH", langgarBandNolNyata, 0)
sama('confidence selalu dalam [0 ; 0,95]', langgarMaks, 0)
cek('grid benar-benar penuh (bukan sampel)', kombinasi === 101 * 2 * 61 * 21 * 4, `${kombinasi}`)

// Topi diuji SENDIRI juga: pada implementasi hari ini tier LATIHAN selalu
// berujung 0 (S memakai nNyata, K68), sehingga jalur normal tak pernah
// memperlihatkan topi LATIHAN bekerja. Ini yang membuktikan pagarnya nyata.
console.log('\n6b. Topi sebagai fungsi tersendiri (lapis kedua)')
sama('terapkanTopi(0,99 · LATIHAN) = 0,20', terapkanTopi(0.99, 'LATIHAN'), 0.2)
sama('terapkanTopi(0,99 · KATALOG) = 0', terapkanTopi(0.99, 'KATALOG'), 0)
sama('terapkanTopi(0,99 · CAMPURAN) = 0,40', terapkanTopi(0.99, 'CAMPURAN'), 0.4)
sama('terapkanTopi(0,99 · NYATA) = 0,95', terapkanTopi(0.99, 'NYATA'), 0.95)
sama('terapkanTopi(0,10 · NYATA) tak menaikkan apa pun', terapkanTopi(0.1, 'NYATA'), 0.1)

let langgarTopiLangsung = 0
for (const tier of ['NYATA', 'CAMPURAN', 'LATIHAN', 'KATALOG']) {
  for (let i = 0; i <= 100; i++) {
    if (terapkanTopi(i / 100, tier) > TOPI[tier]) langgarTopiLangsung++
  }
}
sama('terapkanTopi tak pernah melewati topi (404 nilai)', langgarTopiLangsung, 0)

console.log('\n6c. tentukanTier & band')
sama('nNyata 3 → NYATA', tentukanTier({ nNyata: 3, nLatihan: 0 }), 'NYATA')
sama('nNyata 2 → CAMPURAN', tentukanTier({ nNyata: 2, nLatihan: 99 }), 'CAMPURAN')
sama('nNyata 1 → CAMPURAN', tentukanTier({ nNyata: 1, nLatihan: 0 }), 'CAMPURAN')
sama('nNyata 0, nLatihan 1 → LATIHAN', tentukanTier({ nNyata: 0, nLatihan: 1 }), 'LATIHAN')
sama('tak ada sampel sama sekali → KATALOG', tentukanTier({ nNyata: 0, nLatihan: 0 }), 'KATALOG')
cek('nLatihan tak pernah menggeser tier ke atas (K59)', tentukanTier({ nNyata: 0, nLatihan: 500 }) === 'LATIHAN')
sama('band 0,70 → TINGGI', tentukanBand(AMBANG_BAND.TINGGI), 'TINGGI')
sama('band 0,6999 → SEDANG', tentukanBand(0.6999), 'SEDANG')
sama('band 0,40 → SEDANG', tentukanBand(AMBANG_BAND.SEDANG), 'SEDANG')
sama('band 0,3999 → RENDAH', tentukanBand(0.3999), 'RENDAH')
sama('band 0 → RENDAH', tentukanBand(0), 'RENDAH')

console.log('\n6d. n = 0 — jalur yang paling sering dilalui hari ini')
const nol = hitungConfidence({ nNyata: 0, nLatihan: 0, usiaBulan: 0, cv: 0, m: 1 })
sama('n=0 → S = 0', nol.faktor.s, 0)
sama('n=0 → confidence 0', nol.confidence, 0)
sama('n=0 → tier KATALOG', nol.tier, 'KATALOG')
cek('n=0 → tanpa NaN di keempat faktor', Object.values(nol.faktor).every(Number.isFinite))

console.log('\n6e. n = 1 — sampel tunggal')
const satu = hitungConfidence({ nNyata: 1, nLatihan: 0, usiaBulan: 0, cv: 0, m: 1 })
sama('n=1 → V = 0,5 (bukan 1)', satu.faktor.v, 0.5)
dekat('n=1 → confidence 0,125', satu.confidence, 0.125)

console.log('\n6f. faktor M dijepit — satu-satunya cara formula bisa berbohong ke atas')
const mLiar = hitungConfidence({ nNyata: 30, nLatihan: 0, usiaBulan: 0, cv: 0, m: 5 })
sama('M = 5 dijepit ke 1', mLiar.faktor.m, 1)
cek('M liar tetap di bawah topi NYATA', mLiar.confidence <= TOPI.NYATA)

// ============================================================================
// 7. Kuantil R-7 & sebaran (prediction-core.ts)
// ============================================================================
console.log('\n7. Kuantil metode R-7 (numpy/Excel PERCENTILE.INC)')

// Hitung tangan untuk [100,200,300,400], n = 4 → h = 3p :
//   p25 → h = 0,75 → 100 + 0,75×(200−100) = 175
//   p50 → h = 1,50 → 200 + 0,50×(300−200) = 250
//   p75 → h = 2,25 → 300 + 0,25×(400−300) = 325
// (Metode "nearest rank" akan memberi 100/250/400 — sengaja BUKAN itu.)
const q4 = hitungKuantil([100, 200, 300, 400])
sama('[100,200,300,400] p25 = 175', q4.p25, 175)
sama('[100,200,300,400] median = 250', q4.median, 250)
sama('[100,200,300,400] p75 = 325', q4.p75, 325)

// Sampel Pilotage §15/6c butir 3 — hitung tangan: n = 3 → h = 2p
//   p25 → h = 0,5  → 4.500.000 + 0,5×250.000 = 4.625.000
//   p50 → h = 1,0  → 4.750.000
//   p75 → h = 1,5  → 4.750.000 + 0,5×250.000 = 4.875.000
const qPilot = hitungKuantil([4_750_000, 4_500_000, 5_000_000])
sama('Pilotage p25 = 4.625.000', qPilot.p25, 4_625_000)
sama('Pilotage median = 4.750.000', qPilot.median, 4_750_000)
sama('Pilotage p75 = 4.875.000', qPilot.p75, 4_875_000)
cek('masukan tak terurut diurutkan sendiri', qPilot.median === 4_750_000)

const q1 = hitungKuantil([500])
cek('n=1 → p25 = median = p75 (K64/2)', q1.p25 === 500 && q1.median === 500 && q1.p75 === 500)
sama('n=0 → null (bukan 0)', hitungKuantil([]), null)
sama('median([]) → null', median([]), null)
sama('kuantilR7([], 0.5) → null', kuantilR7([], 0.5), null)
sama('rataRata([]) → null', rataRata([]), null)

const asli = [300, 100, 200]
hitungKuantil(asli)
cek('array pemanggil tidak diubah', asli[0] === 300 && asli[1] === 100 && asli[2] === 200)

console.log('\n7b. cv — simpangan baku SAMPEL (pembagi n−1)')
// [100,200,300,400]: rata-rata 250; Σ(x−μ)² = 22500+2500+2500+22500 = 50000
// sd sampel = √(50000/3) = 129,0994 ; cv = 129,0994/250 = 0,516398
dekat('sd sampel [100..400] = 129,0994', simpanganBakuSampel([100, 200, 300, 400]), 129.0994, 0.0001)
dekat('cv [100..400] = 0,5164', hitungCv([100, 200, 300, 400]), 0.5164, 0.0001)
sama('sd sampel n<2 → null (sebaran tak diketahui, bukan nol)', simpanganBakuSampel([500]), null)
sama('cv n=1 → 0 (V-nya sudah dihukum terpisah)', hitungCv([500]), 0)
sama('cv rata-rata 0 → 0, bukan Infinity', hitungCv([0, 0, 0]), 0)
cek('cv tak pernah NaN', Number.isFinite(hitungCv([])))

// ============================================================================
// 8. Penyaringan sampel K61 (calcMethod + MINIMUM_MENGIKAT)
// ============================================================================
console.log('\n8. Penyaringan sampel K61')

const s = (over) => ({
  itemId: 'i',
  disbursementId: 'd',
  docNumber: 'FDA/2026/08/0001',
  calcMethod: 'PER_UNIT',
  unitPrice: 4_750_000,
  minCharge: null,
  minimumMengikat: false,
  nyata: true,
  ...over,
})

const sampelCampur = [
  s({ itemId: 'a', unitPrice: 4_500_000 }),
  s({ itemId: 'b', unitPrice: 4_750_000 }),
  s({ itemId: 'c', unitPrice: 5_000_000 }),
  s({ itemId: 'd', calcMethod: 'FLAT', unitPrice: 99_000_000 }),
  s({ itemId: 'e', calcMethod: 'PER_GT', unitPrice: 75 }),
]

sama('saringCalcMethod membuang calcMethod berbeda', saringCalcMethod(sampelCampur, 'PER_UNIT').length, 3)
const r1 = ringkasSampel(sampelCampur, 'PER_UNIT')
sama('ringkasSampel n = 3', r1.n, 3)
sama('median tak tercemar baris FLAT 99 juta', r1.unitPrice.median, 4_750_000)
sama('nNyata = 3', r1.nNyata, 3)
sama('nLatihan = 0', r1.nLatihan, 0)
sama('tanpa MINIMUM_MENGIKAT → minChargeMedian null', r1.minChargeMedian, null)

// K61: baris MINIMUM_MENGIKAT IKUT di sampel harga satuan, minCharge-nya dibawa terpisah.
const sampelMin = [
  s({ itemId: 'a', unitPrice: 1_000_000, minimumMengikat: true, minCharge: 2_000_000 }),
  s({ itemId: 'b', unitPrice: 1_200_000, minimumMengikat: true, minCharge: 2_400_000 }),
  s({ itemId: 'c', unitPrice: 1_400_000 }),
]
const r2 = ringkasSampel(sampelMin, 'PER_UNIT')
sama('MINIMUM_MENGIKAT tetap masuk sampel harga satuan (n=3)', r2.n, 3)
sama('median harga satuan = 1.200.000', r2.unitPrice.median, 1_200_000)
sama('minChargeMedian terpisah = 2.200.000', r2.minChargeMedian, 2_200_000)
sama('nMinimumMengikat = 2', r2.nMinimumMengikat, 2)

const r3 = ringkasSampel(
  [s({ unitPrice: 0 }), s({ unitPrice: Number.NaN }), s({ unitPrice: 4_750_000 })],
  'PER_UNIT',
)
sama('harga ≤0 / NaN dibuang sebelum distatistikkan', r3.n, 1)
sama('sampel latihan terhitung terpisah', ringkasSampel([s({ nyata: false })], 'PER_UNIT').nLatihan, 1)
sama('tak ada sampel → unitPrice null', ringkasSampel([], 'PER_UNIT').unitPrice, null)

// ============================================================================
// 9. Kemiripan K63 — dan tingkat 5 yang TIDAK PERNAH ADA
// ============================================================================
console.log('\n9. Tingkat kemiripan K63')

sama('empat tingkat, tidak lebih', TINGKAT_KEMIRIPAN.length, 4)
cek('tingkat 5 tidak ada di TINGKAT_KEMIRIPAN', !TINGKAT_KEMIRIPAN.includes(5))
cek('FAKTOR_M berkunci persis 1,2,3,4', Object.keys(FAKTOR_M).join(',') === '1,2,3,4')
cek('KRITERIA_KEMIRIPAN berkunci persis 1,2,3,4', Object.keys(KRITERIA_KEMIRIPAN).join(',') === '1,2,3,4')
sama('M tingkat 1', FAKTOR_M[1], 1.0)
sama('M tingkat 2', FAKTOR_M[2], 0.85)
sama('M tingkat 3', FAKTOR_M[3], 0.7)
sama('M tingkat 4', FAKTOR_M[4], 0.55)
cek('semua tingkat mensyaratkan pelabuhan sama (lintas pelabuhan mustahil)',
  Object.values(KRITERIA_KEMIRIPAN).every((k) => k.pelabuhanSama === true))

sama('tingkat paling ketat yang punya sampel menang', pilihTingkat({ 1: 2, 2: 9, 3: 40, 4: 90 }).tingkat, 1)
sama('tingkat 1 kosong → turun ke 2', pilihTingkat({ 1: 0, 2: 9, 3: 40, 4: 90 }).tingkat, 2)
sama('tingkat 1–2 kosong → turun ke 3', pilihTingkat({ 1: 0, 2: 0, 3: 5, 4: 90 }).tingkat, 3)
sama('hanya tingkat 4 → tingkat 4', pilihTingkat({ 1: 0, 2: 0, 3: 0, 4: 9 }).tingkat, 4)
sama('tingkat 3 membawa M 0,70', pilihTingkat({ 1: 0, 2: 0, 3: 5, 4: 90 }).m, 0.7)
sama('n ikut dibawa (dipakai hitungS)', pilihTingkat({ 1: 0, 2: 0, 3: 5, 4: 90 }).n, 5)
sama('tak ada sampel di mana pun → null (→ tier KATALOG)', pilihTingkat(HITUNGAN_TINGKAT_KOSONG), null)

// Tingkat 5 tak bisa terpilih walau pemanggil nekat menyuntikkannya.
const nekat = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 999 }
sama('kunci "5" yang diselundupkan diabaikan total', pilihTingkat(nekat), null)

sama('MANUAL diperketat satu tingkat (maks 3)', tingkatMaksimum('MANUAL'), 3)
sama('FLAT diperketat satu tingkat (maks 3)', tingkatMaksimum('FLAT'), 3)
sama('PER_GT tetap sampai tingkat 4', tingkatMaksimum('PER_GT'), 4)
sama('MANUAL: hanya tingkat 4 yang punya sampel → null', pilihTingkat({ 1: 0, 2: 0, 3: 0, 4: 9 }, 'MANUAL'), null)
sama('PER_GT: hanya tingkat 4 → tingkat 4', pilihTingkat({ 1: 0, 2: 0, 3: 0, 4: 9 }, 'PER_GT').tingkat, 4)
cek('label tingkat dua bahasa terisi', labelTingkat(1, 'id').length > 0 && labelTingkat(1, 'en').length > 0)

// ============================================================================
// 10. Delapan aturan anomali (K71–K74)
// ============================================================================
console.log('\n10. Aturan anomali — K71')

sama('delapan kode, tidak kurang tidak lebih', KODE_ANOMALI.length, 8)

const b = (over) => ({
  itemId: 'it-1',
  serviceId: 'sv-1',
  deskripsi: 'Pilotage in & out',
  calcMethod: 'PER_UNIT',
  unitPrice: 4_750_000,
  amount: 9_500_000,
  amountBase: 9_500_000,
  exchangeRate: 1,
  unitPriceKatalog: 4_750_000,
  variancePct: null,
  ...over,
})

const ktx = (over) => ({
  grandTotalBase: 100_000_000,
  medianGrandTotalHistori: null,
  kursAcuan: null,
  nNyata: 5,
  nLatihan: 0,
  ...over,
})

const ktxKosong = ktx({ nNyata: 0 })

// -- HARGA_MENYIMPANG ------------------------------------------------------
const histPilot = { serviceId: 'sv-1', nama: 'Pilotage', medianUnitPrice: 4_750_000, kemunculanPct: 100 }
const aHarga = aturanHargaMenyimpang(b({ unitPrice: 8_500_000 }), histPilot, ktx())
cek('HARGA_MENYIMPANG bunyi pada 8,5 jt vs median 4,75 jt', aHarga !== null)
sama('HARGA_MENYIMPANG ambang 30', aHarga.dasar.ambang, 30)
sama('HARGA_MENYIMPANG pembanding = median', aHarga.dasar.pembanding, 4_750_000)
cek('pesan menyebut ambangnya (K73)', aHarga.pesan.includes('ambang 30%'))
sama('HARGA_MENYIMPANG diam saat wajar', aturanHargaMenyimpang(b({ unitPrice: 5_000_000 }), histPilot, ktx()), null)
sama('HARGA_MENYIMPANG DIAM saat nNyata < 3 (K74)',
  aturanHargaMenyimpang(b({ unitPrice: 8_500_000 }), histPilot, ktx({ nNyata: 2 })), null)

// -- DI_LUAR_KATALOG -------------------------------------------------------
const aKatalog = aturanDiLuarKatalog(b({ unitPrice: 6_000_000 }), ktxKosong)
cek('DI_LUAR_KATALOG bunyi tanpa histori sama sekali', aKatalog !== null)
sama('DI_LUAR_KATALOG ambang 1', aKatalog.dasar.ambang, 1)
sama('toleransi pembulatan (0,4%) tidak bunyi',
  aturanDiLuarKatalog(b({ unitPrice: 4_770_000 }), ktxKosong), null)
sama('MANUAL dikecualikan (tak punya tarif katalog)',
  aturanDiLuarKatalog(b({ calcMethod: 'MANUAL', unitPrice: 9e9 }), ktxKosong), null)
sama('tanpa tarif katalog → diam',
  aturanDiLuarKatalog(b({ unitPriceKatalog: null, unitPrice: 1 }), ktxKosong), null)

// -- MANUAL_BESAR: WAJIB memakai amountBase, BUKAN amount -------------------
const aManual = aturanManualBesar(
  b({ calcMethod: 'MANUAL', amount: 1_000_000, amountBase: 30_000_000 }),
  ktxKosong,
)
cek('MANUAL_BESAR bunyi: amountBase 30 jt dari total 100 jt = 30%', aManual !== null)
sama('MANUAL_BESAR dasar.nilai = amountBase (BUKAN amount)', aManual.dasar.nilai, 30_000_000)
sama('MANUAL_BESAR ambang 20', aManual.dasar.ambang, 20)
sama(
  'amount besar tapi amountBase kecil → TIDAK bunyi (bukti pakai amountBase)',
  aturanManualBesar(b({ calcMethod: 'MANUAL', amount: 90_000_000, amountBase: 10_000_000 }), ktxKosong),
  null,
)
sama('baris non-MANUAL tak pernah kena', aturanManualBesar(b({ amountBase: 90_000_000 }), ktxKosong), null)
sama('grandTotal 0 → diam (bukan Infinity)',
  aturanManualBesar(b({ calcMethod: 'MANUAL', amountBase: 1 }), ktx({ grandTotalBase: 0 })), null)

// -- JASA_HILANG -----------------------------------------------------------
const histTug = { serviceId: 'sv-9', nama: 'Tug assistance', medianUnitPrice: 6_250_000, kemunculanPct: 90 }
const aHilang = aturanJasaHilang([b()], [histPilot, histTug], ktx())
sama('JASA_HILANG bunyi untuk 1 jasa yang absen', aHilang.length, 1)
sama('JASA_HILANG itemId null (bicara soal baris yang TIDAK ada)', aHilang[0].itemId, null)
sama('JASA_HILANG ambang 80', aHilang[0].dasar.ambang, 80)
cek('JASA_HILANG menyebut nama jasanya', aHilang[0].pesan.includes('Tug assistance'))
sama('JASA_HILANG DIAM saat nNyata < 3 (K74)',
  aturanJasaHilang([b()], [histPilot, histTug], ktx({ nNyata: 2 })).length, 0)
sama('jasa yang jarang muncul (50%) tidak bunyi',
  aturanJasaHilang([b()], [{ ...histTug, kemunculanPct: 50 }], ktx()).length, 0)

// -- BARIS_GANDA -----------------------------------------------------------
const kembar = [
  b({ itemId: 'it-1', amount: 9_500_000 }),
  b({ itemId: 'it-2', amount: 9_500_000 }),
]
const aGanda = aturanBarisGanda(kembar, ktxKosong)
sama('BARIS_GANDA bunyi untuk dua baris identik', aGanda.length, 1)
sama('BARIS_GANDA menunjuk baris kedua (yang berlebih)', aGanda[0].itemId, 'it-2')
sama('BARIS_GANDA tingkat TINGGI', aGanda[0].tingkat, 'TINGGI')
sama('BARIS_GANDA ambang 0 = toleransi nol (K73 tetap dipenuhi)', aGanda[0].dasar.ambang, 0)
sama('nilai berbeda → bukan baris ganda',
  aturanBarisGanda([b({ itemId: 'x', amount: 1 }), b({ itemId: 'y', amount: 2 })], ktxKosong).length, 0)
sama('jasa berbeda dengan nilai sama → bukan baris ganda',
  aturanBarisGanda([b({ itemId: 'x' }), b({ itemId: 'y', serviceId: 'sv-2' })], ktxKosong).length, 0)
sama('serviceId null dilewati (tak bisa dibuktikan "jasa sama")',
  aturanBarisGanda([b({ itemId: 'x', serviceId: null }), b({ itemId: 'y', serviceId: null })], ktxKosong).length, 0)
sama('tiga baris identik → dua anomali',
  aturanBarisGanda([b({ itemId: 'x' }), b({ itemId: 'y' }), b({ itemId: 'z' })], ktxKosong).length, 2)

// -- KURS_MENYIMPANG -------------------------------------------------------
const aKurs = aturanKursMenyimpang(b({ exchangeRate: 17_000 }), ktx({ kursAcuan: 16_000 }))
cek('KURS_MENYIMPANG bunyi pada selisih 6,25%', aKurs !== null)
sama('KURS_MENYIMPANG ambang 5', aKurs.dasar.ambang, 5)
sama('selisih 2,5% → diam',
  aturanKursMenyimpang(b({ exchangeRate: 16_400 }), ktx({ kursAcuan: 16_000 })), null)
sama('tanpa kurs acuan → diam (bukan menuduh)',
  aturanKursMenyimpang(b({ exchangeRate: 17_000 }), ktx({ kursAcuan: null })), null)

// -- VARIANCE_BESAR (ambang PLACEHOLDER — P12) ------------------------------
const aVar = aturanVarianceBesar(b({ variancePct: 40 }), ktxKosong)
cek('VARIANCE_BESAR bunyi pada 40%', aVar !== null)
sama('VARIANCE_BESAR ambang interim 25 (TODO P12)', aVar.dasar.ambang, AMBANG.VARIANCE_BESAR_PCT)
cek('pesan VARIANCE_BESAR menandai P12 belum dijawab', aVar.pesan.includes('P12'))
cek('variance negatif besar juga bunyi (nilai mutlak)', aturanVarianceBesar(b({ variancePct: -40 }), ktxKosong) !== null)
sama('variance kecil → diam', aturanVarianceBesar(b({ variancePct: 10 }), ktxKosong), null)
sama('EPDA (variancePct null) → diam total', aturanVarianceBesar(b({ variancePct: null }), ktxKosong), null)

// -- TOTAL_MENYIMPANG ------------------------------------------------------
const aTotal = aturanTotalMenyimpang(ktx({ grandTotalBase: 200_000_000, medianGrandTotalHistori: 100_000_000 }))
cek('TOTAL_MENYIMPANG bunyi pada selisih 100%', aTotal !== null)
sama('TOTAL_MENYIMPANG ambang 35', aTotal.dasar.ambang, 35)
sama('TOTAL_MENYIMPANG itemId null (tingkat dokumen)', aTotal.itemId, null)
sama('TOTAL_MENYIMPANG DIAM saat nNyata < 3 (K74)',
  aturanTotalMenyimpang(ktx({ nNyata: 2, grandTotalBase: 200_000_000, medianGrandTotalHistori: 100_000_000 })), null)
sama('selisih 10% → diam',
  aturanTotalMenyimpang(ktx({ grandTotalBase: 110_000_000, medianGrandTotalHistori: 100_000_000 })), null)

console.log('\n10b. Orkestrasi & K73 (setiap anomali membawa dasar.ambang)')
const masukanLengkap = {
  baris: [
    b({ itemId: 'it-1', unitPrice: 8_500_000, exchangeRate: 17_000 }),
    b({ itemId: 'it-2', unitPrice: 8_500_000, exchangeRate: 17_000 }),
    b({ itemId: 'it-3', serviceId: 'sv-3', calcMethod: 'MANUAL', amount: 1, amountBase: 40_000_000, unitPriceKatalog: null }),
    b({ itemId: 'it-4', serviceId: 'sv-4', variancePct: 80, unitPriceKatalog: 4_750_000 }),
  ],
  histori: [histPilot, histTug],
  konteks: ktx({ kursAcuan: 16_000, medianGrandTotalHistori: 40_000_000 }),
}
const semua = jalankanSemuaAturan(masukanLengkap)
cek('orkestrasi menghasilkan banyak anomali', semua.length >= 6, `dapat ${semua.length}`)
cek('SETIAP anomali membawa dasar.ambang berupa angka (K73)',
  semua.every((a) => typeof a.dasar.ambang === 'number' && Number.isFinite(a.dasar.ambang)))
cek('SETIAP anomali membawa nNyata & nLatihan',
  semua.every((a) => typeof a.dasar.nNyata === 'number' && typeof a.dasar.nLatihan === 'number'))
cek('SETIAP anomali berkode sah', semua.every((a) => KODE_ANOMALI.includes(a.kode)))
cek('SETIAP anomali bertingkat sah', semua.every((a) => ['INFO', 'PERHATIAN', 'TINGGI'].includes(a.tingkat)))
cek('SETIAP pesan terisi (tanpa placeholder tersisa)',
  semua.every((a) => a.pesan.length > 0 && !a.pesan.includes('{')))
cek('urutan keluaran deterministik',
  JSON.stringify(jalankanSemuaAturan(masukanLengkap)) === JSON.stringify(semua))
cek('BARIS_GANDA ikut terdeteksi lewat orkestrasi', semua.some((a) => a.kode === 'BARIS_GANDA'))
cek('MANUAL_BESAR ikut terdeteksi lewat orkestrasi', semua.some((a) => a.kode === 'MANUAL_BESAR'))

console.log('\n10c. Aturan nonaktif — K74 mengatakannya, bukan diam-diam mati')
const nonaktif = aturanNonaktif(ktx({ nNyata: 0 }))
sama('jumlah aturan nonaktif = jumlah aturan berbasis histori',
  nonaktif.length, KODE_ANOMALI.filter((k) => BUTUH_HISTORI[k]).length)
cek('daftar nonaktif memuat ketiga aturan berbasis histori',
  ['HARGA_MENYIMPANG', 'JASA_HILANG', 'TOTAL_MENYIMPANG'].every((k) => nonaktif.some((n) => n.kode === k)))
cek('tiap entri membawa alasan dua bahasa + nNyata + minimal',
  nonaktif.every((n) => n.alasan.id.length > 0 && n.alasan.en.length > 0 && n.nNyata === 0 && n.minimal === 3))
sama('nNyata cukup → tak ada yang nonaktif', aturanNonaktif(ktx({ nNyata: 3 })).length, 0)
const ringkas74 = ringkasanNonaktif(ktx({ nNyata: 0 }))
cek('kalimat panel menyebut jumlah & keadaan sekarang', ringkas74.includes('3') && ringkas74.includes('0'))
sama('kalimat panel hilang begitu histori cukup', ringkasanNonaktif(ktx({ nNyata: 3 })), null)
cek('kalimat panel tersedia dalam bahasa Inggris', (ringkasanNonaktif(ktx({ nNyata: 0 }), 'en') ?? '').includes('real port calls'))
cek('semua aturan yang jalan tanpa histori memang bunyi saat nNyata=0',
  jalankanSemuaAturan({ ...masukanLengkap, konteks: ktx({ nNyata: 0, kursAcuan: 16_000 }) })
    .every((a) => BUTUH_HISTORI[a.kode] === false))

// ============================================================================
// 11. narasi-guard (K67)
// ============================================================================
console.log('\n11. narasi-guard — angka ≥4 digit wajib ada di payload')

sama('ambang 4 digit (K67)', AMBANG_DIGIT, 4)

const payload = {
  serviceCode: 'PILOT',
  unitPrice: { p25: 4_625_000, median: 4_750_000, p75: 4_875_000 },
  dasar: { nNyata: 3, nLatihan: 1, rentangTanggal: { dari: '2026-02-01', sampai: '2026-07-31' } },
  sumber: [{ docNumber: 'FDA/2026/08/0001', unitPrice: 4_750_000 }],
}

const lolos1 = periksaNarasi(
  'Median harga satuan Rp 4.750.000 dari 3 kunjungan nyata, rentang Rp 4.625.000–Rp 4.875.000.',
  payload,
)
cek('narasi ber-angka payload → DITERIMA', lolos1.diterima, JSON.stringify(lolos1.angkaTakDikenal))
sama('tiga deret ≥4 digit diperiksa', lolos1.jumlahDiperiksa, 3)

const tolak1 = periksaNarasi('Perkiraan biaya baris ini Rp 12.345.678.', payload)
cek('"Rp 12.345.678" yang tak ada di payload → DITOLAK', tolak1.diterima === false)
cek('angka pengarangnya dilaporkan apa adanya', tolak1.angkaTakDikenal.includes('12.345.678'))

const lolos2 = periksaNarasi('Ada 3 kunjungan dan 2 tug pada tahun 2026.', payload)
cek('"3 kunjungan"/"2 tug" di bawah ambang & "2026" ada di payload → LOLOS', lolos2.diterima)
sama('hanya "2026" yang benar-benar diperiksa', lolos2.jumlahDiperiksa, 1)

const tolak2 = periksaNarasi('Berlaku sampai tahun 2031.', payload)
cek('tahun karangan "2031" → DITOLAK (ambang 4 digit memang mengenai tahun)', tolak2.diterima === false)

const lolos3 = periksaNarasi('Median Rp 4.750.000,00 per unit.', payload)
cek('format desimal id "4.750.000,00" tetap diterima', lolos3.diterima, JSON.stringify(lolos3.angkaTakDikenal))

const lolos4 = periksaNarasi('Dokumen sumbernya FDA/2026/08/0001.', payload)
cek('nomor dokumen dari payload dikenali', lolos4.diterima)

sama('narasi tanpa angka → diterima', periksaNarasi('Tidak ada catatan khusus.', payload).diterima, true)
sama('narasi kosong → diterima', periksaNarasi('', payload).diterima, true)
cek('payload kosong + narasi berangka → ditolak', periksaNarasi('Rp 4.750.000', {}).diterima === false)
cek('ekstrakAngka menemukan deret berpemisah', ekstrakAngka('Rp 4.750.000').length === 1)
cek('payload bersarang ikut terbaca', kumpulkanAngkaPayload(payload).has('4875000'))
cek('payload bersiklus tidak menggantung', (() => {
  const a = { n: 4_750_000 }
  a.diri = a
  return kumpulkanAngkaPayload(a).has('4750000')
})())

// ============================================================================
// 12. konteks.ts — pemotongan deterministik (K76/3)
// ============================================================================
console.log('\n12. KonteksAI — anggaran & pemotongan')

sama('anggaran bawaan 8.000 karakter', ANGGARAN_KARAKTER_BAWAAN, 8000)

const seratusBaris = Array.from({ length: 100 }, (_, i) => ({
  deskripsi: `Baris jasa nomor ${i + 1} pada dokumen uji`,
  qty: 1,
  unit: 'call',
  harga: (i + 1) * 1000,
  jumlah: (i + 1) * 1000,
}))

const konteksBesar = {
  jenis: 'DISBURSEMENT',
  ringkas: 'EPDA MT Tribuana di Samarinda, ETA 2026-08-20, status DRAFT.',
  fakta: { gt: 8432, etmal: 3, baseCurrency: 'IDR' },
  baris: seratusBaris,
  total: { subtotal: 5_050_000, agency: 126_250, pajak: 0, grandTotal: 5_176_250, mataUang: 'IDR' },
}

cek('konteks 100 baris memang melewati anggaran', ukuranKonteks(konteksBesar) > 8000)

const dipotong = potongKonteks(konteksBesar)
cek('hasil pemotongan muat anggaran 8.000', ukuranKonteks(dipotong) <= 8000, `${ukuranKonteks(dipotong)}`)
cek('sebagian baris tetap ada', dipotong.baris.length > 0 && dipotong.baris.length < 100, `${dipotong.baris.length}`)
cek('catatan pemotongan SELALU ada', typeof dipotong.catatanPemotongan === 'string' && dipotong.catatanPemotongan.length > 0)
cek('catatan menyebut berapa dari berapa',
  dipotong.catatanPemotongan.includes(String(dipotong.baris.length)) && dipotong.catatanPemotongan.includes('100'),
  dipotong.catatanPemotongan)
cek('baris terbesar dipertahankan (100.000 = baris ke-100)', dipotong.baris[0].jumlah === 100_000)
cek('urutan menurun menurut |jumlah|',
  dipotong.baris.every((x, i) => i === 0 || Math.abs(dipotong.baris[i - 1].jumlah) >= Math.abs(x.jumlah)))
cek('pemotongan deterministik (dua panggilan identik)',
  JSON.stringify(potongKonteks(konteksBesar)) === JSON.stringify(dipotong))
cek('objek asli tidak diubah', konteksBesar.baris.length === 100 && konteksBesar.catatanPemotongan === undefined)

// Koreksi bernilai negatif besar adalah justru baris yang paling mungkin
// ditanyakan orang — ia tak boleh terbuang lebih dulu hanya karena tandanya.
const negatif = potongKonteks({
  ...konteksBesar,
  baris: [
    ...seratusBaris,
    { deskripsi: 'Koreksi tagihan vendor', qty: 1, unit: null, harga: -999_999, jumlah: -999_999 },
  ],
})
cek('urutan pakai NILAI MUTLAK (koreksi negatif besar menang)',
  negatif.baris[0].jumlah === -999_999, JSON.stringify(negatif.baris[0]))
cek('catatan menghitung 101 baris asli', negatif.catatanPemotongan.includes('101'))

const kecil = potongKonteks({ ...konteksBesar, baris: seratusBaris.slice(0, 2) })
sama('konteks yang muat tidak dipotong', kecil.baris.length, 2)
sama('konteks yang muat tanpa catatan pemotongan', kecil.catatanPemotongan, undefined)
cek('konteks yang muat mempertahankan urutan asli', kecil.baris[0].jumlah === 1000)

const sempit = potongKonteks(konteksBesar, { anggaranKarakter: 500 })
cek('anggaran sangat sempit → catatan tetap terpasang',
  typeof sempit.catatanPemotongan === 'string' && sempit.catatanPemotongan.includes('100'))

const inggris = potongKonteks(konteksBesar, { bahasa: 'en' })
cek('catatan pemotongan tersedia dua bahasa', inggris.catatanPemotongan.includes('lines shown'))

sama('konteks tanpa baris → tak dipotong, tak dicatat',
  potongKonteks({ jenis: 'VOYAGE', ringkas: 'x', fakta: {} }).catatanPemotongan, undefined)

// ============================================================================
// 13. Peta teks K70 — kata-katanya juga bagian dari keputusan
// ============================================================================
console.log('\n13. Peta teks K70')

sama('enam keadaan teks', KUNCI_TEKS.length, 6)
sama('KATALOG → kunci KATALOG', kunciTeks('KATALOG', 'RENDAH'), 'KATALOG')
sama('LATIHAN → kunci LATIHAN', kunciTeks('LATIHAN', 'RENDAH'), 'LATIHAN')
sama('CAMPURAN + RENDAH', kunciTeks('CAMPURAN', 'RENDAH'), 'CAMPURAN_RENDAH')
sama('CAMPURAN + SEDANG tetap memakai kalimat CAMPURAN', kunciTeks('CAMPURAN', 'SEDANG'), 'CAMPURAN_RENDAH')
sama('NYATA + RENDAH', kunciTeks('NYATA', 'RENDAH'), 'NYATA_RENDAH')
sama('NYATA + SEDANG', kunciTeks('NYATA', 'SEDANG'), 'NYATA_SEDANG')
sama('NYATA + TINGGI', kunciTeks('NYATA', 'TINGGI'), 'NYATA_TINGGI')

// CAMPURAN + SEDANG memang bisa terjadi: nNyata=2 → S 0,40 × R 1 × V 1 × M 1
// = 0,40 = topi CAMPURAN, dan 0,40 sudah masuk band SEDANG.
const campSedang = hitungConfidence({ nNyata: 2, nLatihan: 0, usiaBulan: 0, cv: 0, m: 1 })
sama('CAMPURAN bisa mencapai band SEDANG tepat di topinya', campSedang.band, 'SEDANG')
sama('… dan tier-nya tetap CAMPURAN', campSedang.tier, 'CAMPURAN')

for (const bahasa of ['id', 'en']) {
  for (const kunci of KUNCI_TEKS) {
    cek(`teks ${bahasa}/${kunci} ada dan tak kosong`, TEKS_KEYAKINAN[bahasa][kunci].length > 0)
  }
}

const isian = { nNyata: 9, nLatihan: 2, periode: 'Feb–Jul 2026' }
for (const [tier, band] of [
  ['KATALOG', 'RENDAH'],
  ['LATIHAN', 'RENDAH'],
  ['CAMPURAN', 'RENDAH'],
  ['NYATA', 'RENDAH'],
  ['NYATA', 'SEDANG'],
  ['NYATA', 'TINGGI'],
]) {
  const t = teksKeyakinan(tier, band, isian, 'id')
  cek(`teks ${tier}/${band} terisi penuh (tanpa placeholder tersisa)`, !t.includes('{'), t)
}
cek('teks NYATA/SEDANG menempelkan periode', teksKeyakinan('NYATA', 'SEDANG', isian).includes('Feb–Jul 2026'))
cek('periode null → frasa pengganti, bukan tanggal karangan',
  teksKeyakinan('NYATA', 'SEDANG', { nNyata: 9, nLatihan: 0, periode: null }).includes('periode yang tercatat'))
cek('teks LATIHAN membawa nLatihan (K70 kolom "wajib tampil")',
  teksKeyakinan('LATIHAN', 'RENDAH', isian).includes('2'))
cek('teks en tersedia', teksKeyakinan('NYATA', 'TINGGI', isian, 'en').includes('real port calls'))
cek('PENDAMPING_WAJIB menuntut nNyata di semua keadaan bersampel nyata (K64/1)',
  ['CAMPURAN_RENDAH', 'NYATA_RENDAH', 'NYATA_SEDANG', 'NYATA_TINGGI'].every((k) =>
    PENDAMPING_WAJIB[k].includes('nNyata')))
cek('PENDAMPING_WAJIB menuntut nLatihan pada tier LATIHAN', PENDAMPING_WAJIB.LATIHAN.includes('nLatihan'))

// ============================================================================
console.log(`\n${'='.repeat(46)}`)
console.log(gagal === 0 ? `✅ SEMUA LULUS (${lulus} pemeriksaan)` : `❌ ${gagal} GAGAL, ${lulus} lulus`)
process.exitCode = gagal === 0 ? 0 : 1
