// Penilaian SLA — MURNI, tanpa impor nilai (K100/K104, §4).
//
// ❌ MURNI. `sekarang` masuk sebagai argumen (tak ada `new Date()`), dan ambang
// "mendekati" juga masuk sebagai argumen — lihat catatan di bawah, itu bukan
// kelalaian.
//
// KENAPA KEADAAN SLA TIDAK DISIMPAN (berbeda dari `dueAt` yang justru disimpan,
// K94): keadaan SLA berubah SETIAP DETIK tanpa ada yang menyentuh datanya.
// Menyimpannya berarti punya kolom yang selalu basi kecuali ada job yang terus
// memperbaruinya — job yang menulis ribuan baris tiap jam untuk informasi yang
// bisa dihitung dalam mikrodetik dari dua kolom yang sudah ada.
//
// K104 — SEMUA hitungan di sini adalah JAM KALENDER, bukan jam kerja. Tugas
// ber-slaHours 8 yang dibuat Jumat pukul 17.00 jatuh tempo Sabtu pukul 01.00.
// Itu benar untuk keagenan kapal (pandu bekerja 24 jam) dan salah untuk urusan
// bank/instansi; kesalahannya dibuat terlihat di layar, bukan disembunyikan.
//
// ⚠️ KENAPA `ambangMendekatiJam` ADALAH ARGUMEN DAN BUKAN IMPOR dari
// sla-policy.ts, meski K100 menuliskan tanda tangan berisi empat field saja:
// modul murni TIDAK BOLEH saling memanggil di tingkat nilai. Impor nilai relatif
// tanpa ekstensi gagal di Node (ERR_MODULE_NOT_FOUND) dan yang ber-ekstensi
// `.ts` gagal di tsc (TS5097) — tak ada bentuk yang lolos keduanya (K11/K51).
// Memberi nilai bawaan di berkas ini berarti menyalin angka P32 ke tempat kedua,
// yang justru dilarang K105. Jadi ambangnya WAJIB disuntikkan, persis seperti
// totals.ts menerima mesin barisnya sebagai argumen. Pemanggil mengimpor
// AMBANG_MENDEKATI_JAM dari sla-policy.ts.

export type KeadaanSla = 'AMAN' | 'MENDEKATI' | 'TERLAMBAT' | 'DILANGGAR' | 'TIDAK_BER_SLA'

export type MasukanSla = {
  /** `null` = tugas tanpa tenggat. Keadaan SAH dan sering, bukan kasus tepi (K74). */
  dueAt: Date | null
  /** Snapshot K99. `null` = belum selesai. */
  completedAt: Date | null
  /**
   * Target penyelesaian (K100). TIDAK ikut menentukan kelima keadaan — K99
   * menetapkan pasangan (`dueAt`, `completedAt`) sebagai SATU-SATUNYA bahan
   * perhitungan, dan `slaHours` sudah terwujud di dalam `dueAt` saat tugas
   * dibuat. Ia ada di sini supaya pemanggil bisa meneruskannya utuh ke tampilan
   * ("target 8 jam") tanpa mengambilnya dari tempat kedua.
   */
  slaHours?: number | null
  /** Selalu disuntikkan (K11). */
  sekarang: Date
  /** Dari sla-policy.ts — lihat catatan kepala berkas. */
  ambangMendekatiJam: number
}

export type HasilSla = {
  keadaan: KeadaanSla
  /** Jam tersisa sampai tenggat; NEGATIF = sudah lewat. `null` bila tak ber-SLA. */
  sisaJam: number | null
  /** Hanya terisi pada `TERLAMBAT`/`DILANGGAR`. */
  telatJam: number | null
}

const JAM = 3_600_000

const selisihJam = (a: Date, b: Date): number => (a.getTime() - b.getTime()) / JAM

/**
 * K100 — kelima keadaan SLA dari (`dueAt`, `completedAt`, `sekarang`).
 *
 * | Keadaan        | Definisi                                                    |
 * |----------------|-------------------------------------------------------------|
 * | TIDAK_BER_SLA  | `dueAt = null` — BUKAN pelanggaran, BUKAN aman              |
 * | DILANGGAR      | sudah selesai, `completedAt > dueAt` — penilaian akhir      |
 * | TERLAMBAT      | belum selesai, `sekarang > dueAt` — masih bisa diperbaiki   |
 * | MENDEKATI      | belum selesai, sisa ≤ ambang (inklusif)                     |
 * | AMAN           | sisanya masih lebih dari ambang, ATAU selesai tepat waktu   |
 *
 * Dua batas yang ditetapkan DI SINI supaya tidak ada dua tafsir nanti:
 *
 *   1. Selesai TEPAT pada detik `dueAt` → BUKAN `DILANGGAR`. Perbandingannya
 *      `completedAt > dueAt` (ketat), bukan `>=`. Tenggat "pukul 08.00" yang
 *      dipenuhi pukul 08.00.000 adalah tenggat yang dipenuhi; menghukumnya
 *      berarti tenggat sebenarnya satu milidetik lebih awal daripada yang
 *      tertulis di layar.
 *   2. Sisa TEPAT `ambangMendekatiJam` → `MENDEKATI`, bukan `AMAN`. Ambangnya
 *      inklusif, sejalan kata "≤" di K100.
 *
 * Tugas yang selesai tepat waktu mendapat `AMAN` — kelima keadaan itu TERTUTUP
 * (K100 tak menyediakan keadaan keenam "selesai tepat waktu"), dan `AMAN` adalah
 * satu-satunya yang berarti "tidak ada masalah". `sisaJam`-nya diukur dari
 * `completedAt`, bukan dari `sekarang`: sesudah pekerjaan dinilai, angkanya
 * membeku dan tidak boleh terus menyusut sepanjang hari.
 */
export function nilaiSla(m: MasukanSla): HasilSla {
  if (!(m.dueAt instanceof Date) || Number.isNaN(m.dueAt.getTime())) {
    return { keadaan: 'TIDAK_BER_SLA', sisaJam: null, telatJam: null }
  }

  const selesai = m.completedAt instanceof Date && !Number.isNaN(m.completedAt.getTime())

  if (selesai) {
    const completedAt = m.completedAt as Date
    const sisa = selisihJam(m.dueAt, completedAt)
    // Batas 1: `>` ketat — tepat pada detik dueAt tidak dihitung melanggar.
    if (completedAt.getTime() > m.dueAt.getTime()) {
      return { keadaan: 'DILANGGAR', sisaJam: sisa, telatJam: -sisa }
    }
    return { keadaan: 'AMAN', sisaJam: sisa, telatJam: null }
  }

  const sisa = selisihJam(m.dueAt, m.sekarang)

  if (m.sekarang.getTime() > m.dueAt.getTime()) {
    return { keadaan: 'TERLAMBAT', sisaJam: sisa, telatJam: -sisa }
  }
  // Batas 2: `<=` — sisa tepat pada ambang sudah MENDEKATI.
  if (sisa <= m.ambangMendekatiJam) {
    return { keadaan: 'MENDEKATI', sisaJam: sisa, telatJam: null }
  }
  return { keadaan: 'AMAN', sisaJam: sisa, telatJam: null }
}

/**
 * Urutan kegawatan untuk mengurutkan di aplikasi (K100: tanpa kolom keadaan,
 * pengurutan gabungan dilakukan SESUDAH pembatasan jumlah baris, bukan di SQL).
 * Angka kecil = lebih gawat.
 */
export const PERINGKAT_KEGAWATAN: Readonly<Record<KeadaanSla, number>> = {
  DILANGGAR: 0,
  TERLAMBAT: 1,
  MENDEKATI: 2,
  AMAN: 3,
  TIDAK_BER_SLA: 4,
}

/** Keadaan yang pantas memicu pengingat (K102). */
export const KEADAAN_PERLU_PENGINGAT: ReadonlySet<KeadaanSla> = new Set<KeadaanSla>([
  'MENDEKATI',
  'TERLAMBAT',
  'DILANGGAR',
])
