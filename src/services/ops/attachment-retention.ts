// Retensi lampiran — P36, menutup hutang yang K110 tinggalkan.
//
// MASALAH YANG DIPECAHKAN
// K110 memutuskan hapus lampiran = SOFT delete, dan melarang setiap jalur kode
// Fase 7 menyentuh berkas fisik. Keputusan itu benar pada waktunya (menghapus
// berkas saat barisnya hilang membuat "hapus" tak bisa dibatalkan), tapi
// akibatnya berkas menumpuk selamanya: `penyimpananLokal.hapus()` ada dan tak
// pernah dipanggil siapa pun. Berkas ini memberi batas itu satu tempat yang
// eksplisit — bukan menghapus lebih awal, melainkan menghapus PADA WAKTUNYA.
//
// KAPAN SEBUAH BERKAS BOLEH DIMUSNAHKAN — tepat tiga syarat, semuanya wajib:
//   1. barisnya sudah di-soft-delete (`deletedAt` terisi) — seseorang memang
//      menekan hapus; lampiran yang masih hidup tak pernah tersentuh;
//   2. soft-delete-nya sudah lewat RETENSI_LAMPIRAN_HARI — masa tenang supaya
//      "hapus" yang disesali masih bisa dipulihkan dari backup;
//   3. berkasnya belum dimusnahkan (`purgedAt` masih NULL).
//
// PEMBAGIAN BERKAS: seluruh keputusan ada di attachment-retention-policy.ts
// (murni, tanpa impor, bisa diuji tanpa DB/server/disk — pola ais-policy.ts).
// Berkas INI hanya menyambungkan Prisma ke sana: satu query dan satu penanda.
//
// YANG SENGAJA TIDAK DILAKUKAN:
//   • Baris DB tidak ikut dihapus. Menghapus lampiran TIDAK menulis AuditLog di
//     mana pun (lihat attachment.service.ts — tak ada catatAudit), jadi baris
//     inilah satu-satunya bukti berkas itu pernah ada. `purgedAt` mengubahnya
//     jadi nisan, bukan menghilangkannya.
//   • Berkas yatim yang barisnya SUDAH hilang TIDAK terjangkau penyapuan ini:
//     tanpa baris, tak ada storageKey yang bisa dipercaya. Dua sumbernya sama-
//     sama disengaja dan terdokumentasi — cascade hapus tenant (K188 menyatakan
//     berkas fisik memang tidak ikut) dan unggahan yang gagal di langkah 4
//     uploadAttachment. Membersihkannya menuntut penyisiran disk-lawan-DB, yaitu
//     menghapus berdasarkan KETIADAAN baris: kelas risiko yang sama sekali lain,
//     dan itu keputusan pemilik yang terpisah (lihat laporan Step 5B-C2F).

import { prisma } from '@/lib/prisma'
import { penyimpananLokal, type PenyimpananBerkas } from './storage/local'
import {
  batasRetensiLampiran,
  MAKS_BARIS_PER_JALAN,
  sapuBaris,
  type HasilSapuRetensi,
} from './attachment-retention-policy'

export {
  RETENSI_LAMPIRAN_HARI,
  MAKS_BARIS_PER_JALAN,
  batasRetensiLampiran,
  kunciMilikTenant,
  sapuBaris,
  type BarisRetensi,
  type HasilSapuRetensi,
} from './attachment-retention-policy'

/**
 * Musnahkan berkas fisik lampiran yang masa retensinya sudah lewat.
 *
 * Idempoten (K88): `purgedAt IS NULL` adalah antreannya, jadi jalan kedua pada
 * hari yang sama tidak menemukan pekerjaan.
 */
export async function sapuLampiranKedaluwarsa(opts?: {
  sekarang?: Date
  penyimpanan?: PenyimpananBerkas
  maksBaris?: number
}): Promise<HasilSapuRetensi> {
  const sekarang = opts?.sekarang ?? new Date()
  const penyimpanan = opts?.penyimpanan ?? penyimpananLokal
  const maks = Math.min(Math.max(opts?.maksBaris ?? MAKS_BARIS_PER_JALAN, 1), MAKS_BARIS_PER_JALAN)
  const batas = batasRetensiLampiran(sekarang)

  // Sengaja `prisma` mentah, bukan forTenant(): ini pekerjaan lintas tenant.
  // Penggantinya kunciMilikTenant() di dalam sapuBaris — lihat catatannya.
  const antre = await prisma.attachment.findMany({
    where: { purgedAt: null, deletedAt: { not: null, lte: batas } },
    select: { id: true, tenantId: true, storageKey: true },
    orderBy: { deletedAt: 'asc' },
    take: maks,
  })

  return sapuBaris(antre, batas, penyimpanan, async (id) => {
    // `purgedAt: null` diulang di where: dua penjadwal yang kelewat rajin tidak
    // boleh saling menimpa cap waktunya.
    const n = await prisma.attachment.updateMany({
      where: { id, purgedAt: null },
      data: { purgedAt: sekarang },
    })
    return n.count > 0
  })
}
