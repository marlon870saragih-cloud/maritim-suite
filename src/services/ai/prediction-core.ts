// Statistik sampel prediksi biaya — MURNI, tanpa satu pun impor nilai
// (K51, mengikuti K11). Lihat docs/FASE-6-AI-LAYER.md §4 (K60–K64).
//
// Berkas ini menjawab satu pertanyaan saja: dari sekumpulan baris FDA histori
// yang sudah diambil service (berpagar tenant, K65), berapa harga satuan yang
// pantas dilaporkan dan seberapa lebar sebarannya.
//
// Yang SENGAJA tidak ada di sini:
//   - perkalian uang. `amount` prediksi dihitung `hitungBaris()` Fase 3 (K61) —
//     tidak ada aritmatika uang kedua di seluruh Fase 6.
//   - query. Modul ini tak tahu apa itu Prisma; sampelnya masuk sebagai array.
//   - `new Date()`. Umur sampel dihitung service dan masuk ke confidence.ts
//     sebagai angka bulan.
//
// Kontrak K51: `import type` SAJA, tak melempar untuk kondisi domain, tak ada
// `new Date()`. Sampel kosong → `null` yang eksplisit, bukan 0 dan bukan NaN —
// 0 akan terbaca sebagai "harganya nol", dan itu bohong yang mahal.

import type { CalcMethod } from '@prisma/client'

// ------------------------------------------------------------------- masukan

/**
 * Satu baris histori yang sudah dibaca service dari `DisbursementItem` FDA.
 * Semua field yang dibutuhkan statistik ADA di sini — modul ini tidak pernah
 * mengambil apa pun sendiri.
 */
export type SampelHistori = {
  itemId: string
  disbursementId: string
  docNumber: string
  /** Dipakai penyaringan K61: harga satuan antar `calcMethod` tak sebanding. */
  calcMethod: CalcMethod
  /** Satu-satunya kolom yang sudah dinormalkan terhadap GT/etmal/ton (K13/K61). */
  unitPrice: number
  /** `ServiceRate.minCharge` yang berlaku saat baris itu dibuat (K15). */
  minCharge: number | null
  /**
   * true bila baris itu terbit warning `MINIMUM_MENGIKAT` (K16-4), yakni
   * `amount = minCharge` dan bukan `q × p`. Lihat `ringkasSampel()`.
   */
  minimumMengikat: boolean
  /** Asal efektif (K58) sudah dihitung service lewat `provenance.ts`. */
  nyata: boolean
}

// -------------------------------------------------------- kuantil (metode R-7)

/**
 * Kuantil dengan **interpolasi linear tipe R-7** — metode bawaan
 * `numpy.percentile`, `Excel PERCENTILE.INC`, dan `quantile(type=7)` di R.
 *
 * Kenapa metodenya dipatok dan ditulis di sini, bukan "pakai median saja":
 * ada sembilan definisi kuantil yang lazim dan semuanya memberi jawaban berbeda
 * untuk sampel kecil — persis ukuran sampel yang akan dipunyai sistem ini
 * selama bertahun-tahun pertama. Dua tafsir kuantil berarti operator yang
 * mengecek angka p25 di Excel akan mendapat angka lain dan menyimpulkan
 * aplikasinya salah hitung. Memilih R-7 membuat hasil di sini **dapat
 * direproduksi dengan alat yang sudah dipakai orang** tanpa penjelasan apa pun.
 *
 *   h = (n − 1) × p ;  hasil = x[⌊h⌋] + (h − ⌊h⌋) × ( x[⌈h⌉] − x[⌊h⌋] )
 *
 * Contoh yang jadi fixture uji: [100,200,300,400] → p25 = 175, p50 = 250,
 * p75 = 325 (bukan 100/250/400, yang keluar dari metode "nearest rank").
 */
export function kuantilR7(nilaiTerurut: readonly number[], p: number): number | null {
  const n = nilaiTerurut.length
  if (n === 0) return null
  if (n === 1) return nilaiTerurut[0]
  const proporsi = Math.min(1, Math.max(0, p))
  const h = (n - 1) * proporsi
  const bawah = Math.floor(h)
  const atas = Math.ceil(h)
  if (bawah === atas) return nilaiTerurut[bawah]
  return nilaiTerurut[bawah] + (h - bawah) * (nilaiTerurut[atas] - nilaiTerurut[bawah])
}

export type Kuantil = { p25: number; median: number; p75: number }

/**
 * p25/median/p75 dari sekumpulan nilai. Menyalin & mengurutkan sendiri — jangan
 * berasumsi pemanggil mengirim data terurut, dan jangan mengubah array miliknya.
 *
 * n < 2 → ketiganya bernilai sama (K64/2). UI wajib menulis "satu kunjungan
 * saja" alih-alih menggambar rentang p25–p75 yang lebarnya nol; rentang palsu
 * lebih menyesatkan daripada tidak ada rentang.
 */
export function hitungKuantil(nilai: readonly number[]): Kuantil | null {
  const bersih = nilai.filter((v) => Number.isFinite(v))
  if (bersih.length === 0) return null
  const urut = [...bersih].sort((a, b) => a - b)
  if (urut.length === 1) return { p25: urut[0], median: urut[0], p75: urut[0] }
  return {
    p25: kuantilR7(urut, 0.25) as number,
    median: kuantilR7(urut, 0.5) as number,
    p75: kuantilR7(urut, 0.75) as number,
  }
}

/** Median saja — dipakai `minChargeMedian` & aturan anomali berbasis histori. */
export function median(nilai: readonly number[]): number | null {
  return hitungKuantil(nilai)?.median ?? null
}

// ------------------------------------------------------------ sebaran (cv)

export function rataRata(nilai: readonly number[]): number | null {
  const bersih = nilai.filter((v) => Number.isFinite(v))
  if (bersih.length === 0) return null
  return bersih.reduce((a, b) => a + b, 0) / bersih.length
}

/**
 * Simpangan baku **sampel** (pembagi n − 1, koreksi Bessel), bukan populasi.
 * Alasannya bukan kerapian statistik: sampel di sini memang benar-benar sampel
 * dari semua kunjungan yang mungkin, dan pembagi n memberi sebaran yang terlalu
 * kecil justru pada n kecil — yaitu keadaan yang akan berlaku bertahun-tahun.
 * Terlalu kecil = V terlalu besar = sistem terdengar lebih yakin dari haknya.
 *
 * n < 2 → `null`, bukan 0. Sebaran satu titik tidak nol; ia tidak diketahui,
 * dan `confidence.hitungV()` yang menghukumnya (V = 0,5).
 */
export function simpanganBakuSampel(nilai: readonly number[]): number | null {
  const bersih = nilai.filter((v) => Number.isFinite(v))
  if (bersih.length < 2) return null
  const mu = bersih.reduce((a, b) => a + b, 0) / bersih.length
  const jumlahKuadrat = bersih.reduce((a, b) => a + (b - mu) * (b - mu), 0)
  return Math.sqrt(jumlahKuadrat / (bersih.length - 1))
}

/**
 * Koefisien variasi = simpangan baku sampel ÷ rata-rata (K68).
 *
 * Dua penjagaan yang wajib, karena keduanya berujung di layar sebagai NaN:
 *   - n < 2 → 0 (V-nya sudah ditangani `V_SAMPEL_TUNGGAL`, cv tak dipakai).
 *   - rata-rata 0 (atau negatif — harga satuan tak boleh negatif, tapi data
 *     bisa saja rusak) → 0, bukan Infinity. cv 0 di sini berarti "sebaran tak
 *     terhitung", dan keyakinannya sudah ditekan dari jalur lain (n kecil).
 */
export function hitungCv(nilai: readonly number[]): number {
  const sd = simpanganBakuSampel(nilai)
  const mu = rataRata(nilai)
  if (sd === null || mu === null || mu <= 0) return 0
  return sd / mu
}

// ------------------------------------------------- penyaringan sampel (K61)

/**
 * K61 — buang baris histori yang `calcMethod`-nya berbeda dari baris yang
 * sedang disusun. Harga satuan `PER_GT` dan `FLAT` untuk jasa yang sama bukan
 * besaran yang sebanding: yang satu rupiah per GT, yang lain rupiah gelondongan.
 * Mencampurnya menghasilkan median yang tidak berarti apa-apa, lalu melaporkan
 * sebarannya yang raksasa sebagai "ketidakpastian" — padahal yang terjadi cuma
 * salah unit pembanding.
 */
export function saringCalcMethod(
  sampel: readonly SampelHistori[],
  calcMethodTarget: CalcMethod,
): SampelHistori[] {
  return sampel.filter((s) => s.calcMethod === calcMethodTarget)
}

/** Buang harga satuan yang tak masuk akal (non-finite/≤0) sebelum distatistikkan. */
export function saringHargaSah(sampel: readonly SampelHistori[]): SampelHistori[] {
  return sampel.filter((s) => Number.isFinite(s.unitPrice) && s.unitPrice > 0)
}

// ------------------------------------------------------------------ ringkasan

export type RingkasanSampel = {
  /** Jumlah sampel yang benar-benar dipakai (sesudah semua penyaringan). */
  n: number
  nNyata: number
  nLatihan: number
  /** `null` bila tak ada sampel sama sekali — jangan pernah 0 (K64). */
  unitPrice: Kuantil | null
  cv: number
  /**
   * Median `minCharge` dari baris ber-`MINIMUM_MENGIKAT` (K61). Dibawa
   * TERSENDIRI dan diterapkan lagi oleh `hitungBaris()`, bukan dicampur ke
   * sampel harga satuan.
   */
  minChargeMedian: number | null
  nMinimumMengikat: number
  /** Sampel yang lolos, untuk `dasar.sumber` di `PrediksiBaris` (K64). */
  dipakai: SampelHistori[]
}

/**
 * Ringkas sampel histori jadi bahan `PrediksiBaris` + `hitungConfidence()`.
 *
 * Perlakuan `MINIMUM_MENGIKAT` mengikuti K61 kata per kata: baris seperti itu
 * **IKUT** dalam sampel harga satuan (tarifnya memang segitu — yang berbeda
 * cuma cara `amount`-nya terbentuk), sementara `minCharge`-nya dibawa sebagai
 * median tersendiri supaya `hitungBaris()` bisa menerapkannya lagi. Membuangnya
 * dari sampel utama akan menghapus justru jasa-jasa bertarif kecil yang paling
 * sering kena minimum; memakai `amount`-nya sebagai harga satuan akan
 * menggelembungkan median tanpa jejak.
 *
 * `campurLatihan` SENGAJA tidak ada sebagai opsi: K59 memutuskan sampel nyata
 * dan latihan tak pernah dicampur. Yang dilakukan service adalah memanggil
 * fungsi ini dengan HANYA sampel nyata bila ada satu pun, dan dengan sampel
 * latihan hanya bila nyata = 0.
 */
export function ringkasSampel(
  sampelMentah: readonly SampelHistori[],
  calcMethodTarget: CalcMethod,
): RingkasanSampel {
  const dipakai = saringHargaSah(saringCalcMethod(sampelMentah, calcMethodTarget))
  const harga = dipakai.map((s) => s.unitPrice)
  const minimumMengikat = dipakai.filter((s) => s.minimumMengikat)
  const minCharge = minimumMengikat
    .map((s) => s.minCharge)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0)

  return {
    n: dipakai.length,
    nNyata: dipakai.filter((s) => s.nyata).length,
    nLatihan: dipakai.filter((s) => !s.nyata).length,
    unitPrice: hitungKuantil(harga),
    cv: hitungCv(harga),
    minChargeMedian: median(minCharge),
    nMinimumMengikat: minimumMengikat.length,
    dipakai,
  }
}
