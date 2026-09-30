// Kebijakan retensi lampiran — logika MURNI, TANPA impor (P36, menutup K110).
//
// Dipisah dari attachment-retention.ts dengan alasan yang sama seperti
// ais-policy.ts dan intake-policy.ts: aturan "kapan sebuah berkas boleh
// dimusnahkan" adalah bagian yang paling mahal bila salah, jadi ia harus bisa
// diuji tanpa basis data, tanpa server, dan tanpa disk.

/**
 * Masa tenang sesudah soft delete sebelum berkas fisik dimusnahkan.
 *
 * 30 hari dipilih sadar, bukan diwarisi: ia lebih panjang dari jendela 24 jam
 * tempat pengunggah boleh membatalkan hapusnya sendiri (attachment.service.ts)
 * dan lebih panjang dari siklus backup harian, sehingga setiap "hapus" yang
 * disesali masih bisa dipulihkan dari dump SEBELUM berkasnya hilang untuk
 * selamanya. Pola angkanya mengikuti ais-policy.ts (90/180 hari).
 */
export const RETENSI_LAMPIRAN_HARI = 30

/** Batas baris per jalan — penyapuan harus selesai, bukan menggantung berjam-jam. */
export const MAKS_BARIS_PER_JALAN = 500

const HARI = 24 * 60 * 60 * 1000

/**
 * Batas atas `deletedAt` yang sudah boleh dimusnahkan. Baris dengan
 * `deletedAt <= batas` sudah lewat masa tenang.
 */
export function batasRetensiLampiran(sekarang: Date): Date {
  return new Date(sekarang.getTime() - RETENSI_LAMPIRAN_HARI * HARI)
}

/**
 * Kunci penyimpanan WAJIB diawali id tenant pemilik barisnya.
 *
 * Penyapuan berjalan LINTAS TENANT (ia pekerjaan sistem, bukan milik satu
 * penyewa), jadi ia tidak lewat forTenant() dan kehilangan pagar otomatis
 * tenant-guard. Pemeriksaan ini yang menggantikannya: baris yang storageKey-nya
 * menunjuk direktori tenant lain TIDAK dihapus — ia dilewati dan dilaporkan,
 * karena satu-satunya cara keadaan itu muncul adalah kerusakan data atau
 * pemalsuan, dan keduanya harus dilihat manusia, bukan dieksekusi.
 *
 * Perbandingannya memakai segmen penuh (`tenantId` + `/`), bukan startsWith
 * telanjang: tanpa itu, kunci milik tenant `abc-jahat` lolos sebagai milik
 * tenant `abc`.
 *
 * Lapis kedua tetap berdiri di storage/local.ts (pathDariKunci membuktikan
 * hasilnya masih di dalam direktori unggahan), jadi `../` tetap mustahil walau
 * pemeriksaan ini entah bagaimana dilewati.
 */
export function kunciMilikTenant(storageKey: string, tenantId: string): boolean {
  if (!storageKey || !tenantId || storageKey.includes('\0')) return false
  const pemisah = storageKey.indexOf('/')
  return pemisah > 0 && storageKey.slice(0, pemisah) === tenantId
}

export type HasilSapuRetensi = {
  /** Batas `deletedAt` yang dipakai jalan ini (ISO) — supaya hasilnya bisa dibaca ulang. */
  batas: string
  diperiksa: number
  dimusnahkan: number
  /** Kunci tak sah / bukan milik tenantnya — TIDAK disentuh, butuh mata manusia. */
  dilewati: number
  /** Penghapusan fisik gagal; baris sengaja dibiarkan agar dicoba lagi. */
  gagal: number
}

/** Satu baris antrean penyapuan — hanya yang dibutuhkan, bukan seluruh Attachment. */
export type BarisRetensi = { id: string; tenantId: string; storageKey: string }

/**
 * Orkestrasi penyapuan — MURNI terhadap infrastruktur: antrean, penyimpanan, dan
 * penanda semuanya disuntikkan. Inilah yang benar-benar memutuskan nasib setiap
 * berkas, jadi ia harus bisa diuji tanpa basis data dan tanpa server; service di
 * attachment-retention.ts hanya menyambungkan Prisma ke sini.
 *
 * URUTAN OPERASI DISENGAJA: berkas dihapus DULU, baris ditandai SESUDAHNYA.
 * Disk dan basis data tak bisa berbagi satu transaksi, jadi yang bisa dipilih
 * hanyalah arah kegagalannya:
 *   • hapus berkas gagal  → baris tidak ditandai → tetap di antrean, dicoba lagi
 *     jalan berikutnya. Tak ada kebohongan yang tersimpan.
 *   • berkas terhapus tapi penandaan gagal → jalan berikutnya memanggil hapus()
 *     atas berkas yang sudah tiada; ENOENT ditelan (storage/local.ts), lalu
 *     barisnya ditandai. Penyapuan menyembuhkan dirinya sendiri.
 * Urutan sebaliknya tidak punya sifat itu: baris bisa tertandai `purgedAt`
 * sementara berkasnya masih utuh di disk, dan tak akan ada yang memeriksanya
 * lagi — persis kebohongan permanen yang K110 ingin dihindari.
 */
export async function sapuBaris(
  antre: readonly BarisRetensi[],
  batas: Date,
  penyimpanan: { hapus(kunci: string): Promise<void> },
  tandai: (id: string) => Promise<boolean>,
): Promise<HasilSapuRetensi> {
  const hasil: HasilSapuRetensi = {
    batas: batas.toISOString(),
    diperiksa: antre.length,
    dimusnahkan: 0,
    dilewati: 0,
    gagal: 0,
  }

  for (const baris of antre) {
    if (!kunciMilikTenant(baris.storageKey, baris.tenantId)) {
      hasil.dilewati++
      // storageKey TIDAK ikut tercetak: yang berguna untuk menelusuri adalah
      // barisnya, dan kunci satu-satunya bagian yang tak boleh bocor ke log.
      console.error('[attachment-retention] kunci bukan milik tenantnya — dilewati', {
        attachmentId: baris.id,
        tenantId: baris.tenantId,
      })
      continue
    }

    try {
      await penyimpanan.hapus(baris.storageKey)
    } catch (e) {
      hasil.gagal++
      console.error('[attachment-retention] berkas gagal dimusnahkan — akan dicoba lagi', {
        attachmentId: baris.id,
        kode: (e as NodeJS.ErrnoException)?.code ?? 'ERROR',
      })
      continue
    }

    if (await tandai(baris.id)) hasil.dimusnahkan++
  }

  return hasil
}
