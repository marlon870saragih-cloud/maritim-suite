// Urutan kartu dalam kolom Kanban — MURNI, tanpa impor nilai (K92, §3).
//
// ❌ MURNI. Tak ada satu pun impor: berkas ini hanya berhitung dengan angka dan
// id. Yang menulis ke database adalah task.service.ts (7c), dan ia menulis
// PERSIS apa yang dikembalikan di sini.
//
// KENAPA Float DAN BUKAN Int: menggeser satu kartu dengan `Int` berarti menomori
// ulang seluruh kolom — puluhan baris ditulis untuk satu tarikan mouse, dan dua
// orang yang menggeser bersamaan menghasilkan urutan yang saling menimpa TANPA
// GALAT. Dengan Float, satu pergeseran menyentuh SATU baris.
//
// Harga yang dibayar: presisi Float habis sesudah ~50 sisipan berturut-turut di
// celah yang SAMA. Itu ditangani di sini juga — normalisasi malas, satu kolom
// saja, dan hanya saat memang perlu. Kejadiannya langka; menanganinya di satu
// tempat lebih murah daripada membayarnya di setiap pergeseran.

/** Subset Task yang dipakai mengurutkan. */
export type KartuPapan = {
  id: string
  boardOrder: number
}

/** Jarak baku antar kartu sesudah normalisasi, dan nilai kartu pertama di kolom kosong. */
export const LANGKAH_URUTAN = 1

/**
 * Ambang normalisasi K92. Bukan `Number.EPSILON`: yang dijaga bukan "masih bisa
 * dibedakan komputer" melainkan "masih ada ruang untuk sisipan berikutnya".
 * Celah 1e-6 masih memuat belasan sisipan lagi sebelum benar-benar mentok, jadi
 * normalisasi selalu terjadi SEBELUM ada dua kartu yang boardOrder-nya tabrakan.
 */
export const AMBANG_NORMALISASI = 1e-6

/** Kartu paling atas kolom → `min − 1`. */
export const urutanDiAtas = (min: number): number => min - LANGKAH_URUTAN

/** Kartu paling bawah kolom → `max + 1`. */
export const urutanDiBawah = (max: number): number => max + LANGKAH_URUTAN

/** Di antara dua tetangga → rata-ratanya. */
export const urutanDiAntara = (atas: number, bawah: number): number => (atas + bawah) / 2

/** Urutkan kolom sebagaimana papan menampilkannya: boardOrder naik, seri → id. */
export function urutkanKolom(kolom: readonly KartuPapan[]): readonly KartuPapan[] {
  return kolom
    .slice()
    .sort((a, b) =>
      a.boardOrder !== b.boardOrder
        ? a.boardOrder - b.boardOrder
        : a.id < b.id
          ? -1
          : a.id > b.id
            ? 1
            : 0,
    )
}

export type HasilPenempatan = {
  /** Nilai yang harus ditulis ke SATU baris — tidak ada baris lain yang disentuh. */
  boardOrder: number
  /**
   * Sesudah penempatan ini, kolomnya sudah terlalu rapat dan perlu dinomori
   * ulang. Pemanggil yang memutuskan kapan menjalankannya (K92: "malas"),
   * berkas ini hanya melaporkan.
   */
  butuhNormalisasi: boolean
}

/**
 * K92 — tempatkan satu kartu pada `indeksTujuan` di kolom yang SUDAH terurut.
 *
 * `indeksTujuan` adalah posisi akhir yang diinginkan: `0` = paling atas,
 * `kolom.length` = paling bawah, `n` = tepat di atas kartu ke-n saat ini.
 * Nilai di luar rentang dijepit, bukan ditolak — UI drag-and-drop kadang
 * mengirim indeks yang meleset satu, dan menolaknya berarti kartu melompat balik
 * ke tempat asalnya tanpa penjelasan.
 */
export function hitungPenempatan(
  kolomTerurut: readonly KartuPapan[],
  indeksTujuan: number,
): HasilPenempatan {
  const n = kolomTerurut.length
  if (n === 0) return { boardOrder: LANGKAH_URUTAN, butuhNormalisasi: false }

  const i = Math.max(0, Math.min(Math.trunc(indeksTujuan), n))

  if (i === 0) return { boardOrder: urutanDiAtas(kolomTerurut[0].boardOrder), butuhNormalisasi: false }
  if (i === n)
    return { boardOrder: urutanDiBawah(kolomTerurut[n - 1].boardOrder), butuhNormalisasi: false }

  const atas = kolomTerurut[i - 1].boardOrder
  const bawah = kolomTerurut[i].boardOrder
  const nilai = urutanDiAntara(atas, bawah)

  // Celah yang tersisa SESUDAH sisipan ini, bukan sebelumnya: yang menentukan
  // apakah sisipan BERIKUTNYA masih punya ruang.
  const celahTersisa = Math.min(nilai - atas, bawah - nilai)
  return { boardOrder: nilai, butuhNormalisasi: celahTersisa < AMBANG_NORMALISASI }
}

/**
 * Apakah kolom ini sudah terlalu rapat di mana pun? Dipakai sebagai pemeriksaan
 * kedua (mis. saat memuat papan), terpisah dari hasil satu penempatan.
 */
export function butuhNormalisasi(kolomTerurut: readonly KartuPapan[]): boolean {
  for (let i = 1; i < kolomTerurut.length; i++) {
    if (kolomTerurut[i].boardOrder - kolomTerurut[i - 1].boardOrder < AMBANG_NORMALISASI) return true
  }
  return false
}

/**
 * K92 — nomori ulang SATU kolom menjadi 1..n, mempertahankan urutan relatif
 * yang sedang tampil. Bukan "urutkan ulang": urutan yang masuk adalah urutan
 * yang keluar, hanya nilainya yang dirapikan.
 *
 * Mengembalikan HANYA baris yang nilainya benar-benar berubah — kolom dengan 40
 * kartu yang cuma dua di antaranya rapat tidak perlu 40 UPDATE.
 */
export function normalisasiKolom(
  kolomTerurut: readonly KartuPapan[],
): readonly { id: string; boardOrder: number }[] {
  const perubahan: { id: string; boardOrder: number }[] = []
  kolomTerurut.forEach((kartu, i) => {
    const nilai = (i + 1) * LANGKAH_URUTAN
    if (kartu.boardOrder !== nilai) perubahan.push({ id: kartu.id, boardOrder: nilai })
  })
  return perubahan
}

/** Terapkan hasil normalisasi pada salinan kolom — dipakai uji & pratinjau UI. */
export function terapkanNormalisasi(
  kolomTerurut: readonly KartuPapan[],
  perubahan: readonly { id: string; boardOrder: number }[],
): readonly KartuPapan[] {
  const peta = new Map(perubahan.map((p) => [p.id, p.boardOrder]))
  return kolomTerurut.map((k) => ({ ...k, boardOrder: peta.get(k.id) ?? k.boardOrder }))
}
