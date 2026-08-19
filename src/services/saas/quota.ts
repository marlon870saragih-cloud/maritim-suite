// Mesin kuota — MURNI, tanpa satu pun impor (K156, Fase 8c).
//
// ❌ MURNI. Tak ada `new Date()`, tak ada query, tak ada lemparan. Angkanya
// hidup di commercial-policy.ts; berkas ini hanya memutuskan ARTI sepasang
// (terpakai, batas).
//
// ⚠️ KENAPA `ambangPeringatan` ADALAH ARGUMEN DAN BUKAN IMPOR dari
// commercial-policy.ts, meski K156 menuliskan tanda tangan `nilaiKuota({
// terpakai, batas })` saja: modul murni TIDAK BOLEH saling memanggil di tingkat
// nilai. Impor nilai relatif tanpa ekstensi gagal di Node (ERR_MODULE_NOT_FOUND)
// dan yang ber-ekstensi `.ts` gagal di tsc (TS5097) — tak ada bentuk yang lolos
// keduanya (K11/K51). Memberi nilai bawaan di sini berarti menyalin angka P49 ke
// tempat kedua, yang justru dilarang K146. Jadi ambangnya WAJIB disuntikkan,
// persis alasan & bentuk yang sama dengan `ambangMendekatiJam` di sla.ts.
//
// ═══ ARAH KEGAGALAN: MEMBUKA, BUKAN MENUTUP ═══
// Data rusak (batas negatif, hitungan NaN, ambang di luar 0..1) TIDAK PERNAH
// menghasilkan HABIS. Ia menghasilkan TIDAK_DIBATASI atau diperlakukan sebagai
// nol-terpakai — selalu ke arah MELOLOSKAN.
//
// Ini sengaja BERLAWANAN dengan portal-guard.ts (K148, fail-closed) dan
// tenant-guard.ts, dan perbedaannya bukan inkonsistensi:
//   • Pagar isolasi menjaga DATA PIHAK LAIN. Salah meloloskan = kebocoran
//     permanen yang tak bisa ditarik kembali → gagal dengan MENOLAK.
//   • Pagar kuota menjaga MARGIN KAMI SENDIRI. Salah menolak = pelanggan
//     berbayar tak bisa bekerja hari ini; salah meloloskan = beberapa baris
//     melewati batas sampai bug diperbaiki → gagal dengan MENERIMA.
// K146 menuliskan pertimbangan yang sama dengan kalimatnya sendiri: "penolakan
// yang salah pada pelanggan berbayar jauh lebih merusak daripada tidak ada
// batas". Berkas ini menjalankan kalimat itu sampai ke kasus tepinya.

export type KeadaanKuota = 'TIDAK_DIBATASI' | 'AMAN' | 'MENDEKATI' | 'HABIS'

export type MasukanKuota = {
  /** Sudah dipakai. Negatif / NaN / Infinity (data rusak) dibaca sebagai 0. */
  terpakai: number
  /**
   * Batas dari `commercial-policy.ts`.
   * `null` = tak dibatasi (bawaan hari ini, K146).
   * `0` = kebijakan SAH "tidak boleh sama sekali" — BUKAN data rusak, dan
   * sengaja dibedakan dari `null`.
   */
  batas: number | null
  /** Rasio 0..1 dari `AMBANG_PERINGATAN_KUOTA` — lihat catatan kepala berkas. */
  ambangPeringatan: number
}

export type HasilKuota = {
  keadaan: KeadaanKuota
  /** Sisa jatah, TIDAK PERNAH negatif. `null` bila tak dibatasi. */
  sisa: number | null
  /**
   * Persen terpakai, MENTAH (tak dibulatkan) — lihat `nilaiKuota`. `null` bila
   * tak dibatasi. Pembulatan untuk layar adalah urusan pemanggil.
   */
  persen: number | null
  /** Diteruskan apa adanya supaya pemanggil tak perlu mengambilnya dari tempat kedua. */
  batas: number | null
  /** Hitungan yang BENAR-BENAR dipakai sesudah pembersihan data rusak. */
  terpakai: number
}

const angkaSah = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

/**
 * K156 — keempat keadaan dari (`terpakai`, `batas`).
 *
 * | Keadaan         | Definisi                                                     |
 * |-----------------|--------------------------------------------------------------|
 * | TIDAK_DIBATASI  | `batas` null / rusak — tak ada yang dihitung, tak ada layar   |
 * | AMAN            | `< ambang`                                                    |
 * | MENDEKATI       | `≥ ambang` (inklusif) dan `< 100%`                            |
 * | HABIS           | `≥ 100%` (inklusif) — pembuatan BARU ditolak                   |
 *
 * Tiga batas yang ditetapkan DI SINI supaya tidak ada dua tafsir nanti:
 *
 *   1. **Vonis diambil dari rasio MENTAH, tidak pernah dari persen yang sudah
 *      dibulatkan.** Terpakai 99,96% yang dibulatkan jadi "100%" di layar tetap
 *      `MENDEKATI`, bukan `HABIS`. Membiarkan pembulatan menaikkan keadaan
 *      berarti ada pelanggan yang ditolak bekerja oleh kesalahan pembulatan
 *      empat per sepuluh ribu — persis penolakan-salah yang K146 larang.
 *   2. **Tepat di batas = HABIS.** Voyage ke-25 pada batas 25 sudah memakai
 *      seluruh jatah; yang ditolak adalah yang ke-26. (Pemanggil memeriksa
 *      SEBELUM membuat baris, jadi `terpakai` saat pemeriksaan adalah 25 dan
 *      permintaan yang sedang berjalan akan jadi yang ke-26.)
 *   3. **`batas = 0` → HABIS, bukan TIDAK_DIBATASI.** Nol adalah kebijakan yang
 *      bisa dipilih ("paket ini tidak boleh membuat voyage"); menyamakannya
 *      dengan `null` membuat kebijakan itu mustahil ditulis. Persennya
 *      dilaporkan 100 (bukan NaN dari 0/0): meterannya memang penuh.
 */
export function nilaiKuota(m: MasukanKuota): HasilKuota {
  // Batas rusak (bukan angka, NaN, Infinity, negatif) → MEMBUKA, bukan menahan.
  if (!angkaSah(m.batas) || m.batas < 0) {
    return { keadaan: 'TIDAK_DIBATASI', sisa: null, persen: null, batas: null, terpakai: bersihkanTerpakai(m.terpakai) }
  }

  const batas = m.batas
  const terpakai = bersihkanTerpakai(m.terpakai)

  // Batas nol: kebijakan sah, dan satu-satunya jalan menghindari 0/0 = NaN.
  if (batas === 0) {
    return { keadaan: 'HABIS', sisa: 0, persen: 100, batas: 0, terpakai }
  }

  const rasio = terpakai / batas
  const sisa = Math.max(0, batas - terpakai)
  const persen = rasio * 100
  const ambang = bersihkanAmbang(m.ambangPeringatan)

  // Urutan `>=` ini yang mewujudkan batas 1 & 2 di atas — rasio mentah, bukan persen.
  const keadaan: KeadaanKuota = rasio >= 1 ? 'HABIS' : rasio >= ambang ? 'MENDEKATI' : 'AMAN'

  return { keadaan, sisa, persen, batas, terpakai }
}

/** Hitungan rusak dibaca 0 — sekali lagi ke arah meloloskan, bukan menahan. */
function bersihkanTerpakai(n: unknown): number {
  return angkaSah(n) && n > 0 ? n : 0
}

/**
 * Ambang di luar 0..1 dijepit. Yang TIDAK berupa angka jatuh ke 1, bukan 0:
 * ambang 0 membuat SEMUA keadaan jadi MENDEKATI (termasuk pemakaian nol), dan
 * lonceng yang berbunyi terus adalah lonceng yang dilatih untuk diabaikan —
 * pertimbangan yang sama sudah dibayar di K103/BATAS_NOTIFIKASI_PER_JALAN.
 */
function bersihkanAmbang(n: unknown): number {
  if (!angkaSah(n)) return 1
  return Math.min(1, Math.max(0, n))
}

/** Angka kecil = lebih gawat. Untuk memilih kuota terburuk yang ditampilkan di spanduk. */
export const PERINGKAT_KEADAAN_KUOTA: Readonly<Record<KeadaanKuota, number>> = {
  HABIS: 0,
  MENDEKATI: 1,
  AMAN: 2,
  TIDAK_DIBATASI: 3,
}

/** Keadaan yang MENAHAN pembuatan baru. Sengaja satu — K156/1. */
export const KEADAAN_MENAHAN: ReadonlySet<KeadaanKuota> = new Set<KeadaanKuota>(['HABIS'])

/**
 * Keadaan yang pantas menerbitkan notifikasi (K156).
 *
 * `HABIS` ikut, bukan hanya `MENDEKATI`: tenant yang melompat dari 60% ke 120%
 * dalam sehari tidak pernah melewati keadaan MENDEKATI, dan justru dialah yang
 * paling perlu diberi tahu.
 */
export const KEADAAN_PERLU_PERINGATAN: ReadonlySet<KeadaanKuota> = new Set<KeadaanKuota>([
  'MENDEKATI',
  'HABIS',
])
