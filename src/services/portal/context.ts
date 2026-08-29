// Konteks portal — satu-satunya pintu masuk identitas pihak luar ke lapisan
// service portal. Cetakan services/context.ts, dengan satu beda mendasar
// (K149): TIDAK ADA `role`. Pihak luar tidak punya peran internal (K143).

import { getServerSession } from 'next-auth'
import { portalAuthOptions } from '@/lib/portal-auth'
import { prisma } from '@/lib/prisma'
import { unauthorized } from '../errors'
import type { PortalDb } from './portal-db'

export type PortalContext = {
  tenantId: string
  portalUserId: string
  pihak: 'CUSTOMER' | 'VENDOR'
  pihakId: string // Customer.id atau Vendor.id
  db: PortalDb
  // TIDAK ADA `role` — lihat catatan berkas.
}

/** Bahan sebelum transaksi ber-RLS dibuka — belum punya `db` (withPortalTx yang mengisinya). */
export type SesiPortal = Omit<PortalContext, 'db'>

/**
 * C1.3 — SATU query otoritatif untuk "apakah pihak ini masih berhak SEKARANG?".
 *
 * Dipisah dari `requirePortal()` supaya bisa diuji langsung tanpa konteks HTTP
 * (lihat prisma/check-portal-revocation.mjs) — `requirePortal()` sendiri butuh
 * `getServerSession()` yang hanya hidup di dalam permintaan.
 *
 * Seluruh syarat berada di dalam SATU klausa `where`, bukan pemeriksaan
 * berantai sesudah query. Konsekuensinya dua:
 *   - fail-closed otomatis: satu syarat tak terpenuhi → tak ada baris → tolak;
 *     tidak ada cabang kode yang bisa lupa memeriksa sesuatu.
 *   - nol query tambahan: relasi diperiksa lewat JOIN pada query yang memang
 *     sudah dijalankan tiap permintaan, bukan lewat perjalanan ke DB berikutnya.
 *
 * Yang diperiksa (C1.3 R-1/R-2/R-3):
 *   1. PortalAccess milik portalUserId itu, BELUM dicabut (`revokedAt`).
 *   2. PortalAccess berada di tenant yang sama dengan sesi.
 *   3. PortalUser-nya masih ada, aktif, dan tidak dihapus.
 *   4. Pihak yang diwakili (Customer/Vendor) masih ada, aktif, tidak dihapus.
 *   5. Ikatan pihak konsisten: CUSTOMER wajib punya customerId; VENDOR wajib
 *      punya vendorId. Tak ada baris yang boleh bersandar pada kolom seberang.
 *
 * K166 dipertahankan: bila seseorang punya >1 akses sah, dipilih yang paling
 * baru dibuat. Karena pemilihan terjadi ULANG setiap permintaan, mencabut satu
 * akses TIDAK PERNAH menjatuhkan akses lain yang masih sah — sifat inilah yang
 * hilang seandainya memakai sessionVersion (yang melekat pada user, bukan akses).
 */
export async function cariAksesPortalAktif(portalUserId: string, tenantId: string) {
  return prisma.portalAccess.findFirst({
    where: {
      portalUserId,
      tenantId,
      revokedAt: null,
      portalUser: { isActive: true, deletedAt: null },
      OR: [
        {
          pihak: 'CUSTOMER',
          customerId: { not: null },
          customer: { isActive: true, deletedAt: null },
        },
        {
          pihak: 'VENDOR',
          vendorId: { not: null },
          vendor: { isActive: true, deletedAt: null },
        },
      ],
    },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Ambil sesi portal + PortalAccess AKTIF-nya. MELEMPAR UNAUTHORIZED bila
 * belum login atau tak punya akses aktif.
 *
 * Query PortalAccess di sini memakai klien INTERNAL (`prisma`, bukan
 * `forPortal`) — ini kebutuhan bootstrapping yang sama seperti
 * `requireTenant()` di services/context.ts (belum ada konteks untuk memagari
 * apa pun sebelum baris ini selesai). Amannya BUKAN dari pagar tenant/portal
 * (belum ada), melainkan dari sumber `portalUserId`: ia berasal dari JWT yang
 * ditandatangani server (PORTAL_NEXTAUTH_SECRET) dan tak bisa dipalsukan
 * klien, dan query di bawah menyaring TEPAT satu portalUserId itu.
 *
 * K168 — PortalAccess dibaca ULANG setiap permintaan (bukan dipercaya dari
 * isi token), supaya pencabutan akses (`revokedAt`) berlaku SEKETIKA pada
 * permintaan berikutnya, bukan menunggu token kedaluwarsa.
 *
 * C1.3 — K168 diperluas: BUKAN HANYA `revokedAt`. Sebelum perbaikan ini,
 * PortalUser yang dinonaktifkan dan Customer yang dihapus tetap lolos, karena
 * keduanya hanya pernah diperiksa saat login. Satu-satunya nilai yang masih
 * berasal dari token adalah `portalUserId` dan `tenantId` — keduanya sekadar
 * kunci pencarian, bukan keputusan otorisasi. Cookie basi karenanya tidak
 * pernah cukup untuk mempertahankan akses.
 */
export async function requirePortal(): Promise<SesiPortal> {
  const session = await getServerSession(portalAuthOptions)
  const portalUserId = session?.user?.portalUserId
  const tenantId = session?.user?.tenantId
  if (!portalUserId || !tenantId) throw unauthorized()

  const akses = await cariAksesPortalAktif(portalUserId, tenantId)
  if (!akses) throw unauthorized('Akses portal tidak aktif. Hubungi keagenan Anda.')

  const pihak = akses.pihak === 'VENDOR' ? 'VENDOR' : 'CUSTOMER'
  const pihakId = pihak === 'VENDOR' ? akses.vendorId : akses.customerId
  if (!pihakId) throw unauthorized()

  return { tenantId: akses.tenantId, portalUserId, pihak, pihakId }
}
