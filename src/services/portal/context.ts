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
 */
export async function requirePortal(): Promise<SesiPortal> {
  const session = await getServerSession(portalAuthOptions)
  const portalUserId = session?.user?.portalUserId
  if (!portalUserId) throw unauthorized()

  // K166 — kalau seseorang punya >1 PortalAccess aktif (mewakili dua pihak
  // pada tenant yang sama), interim 8a memilih yang paling baru dibuat.
  // Layar "pilih pihak" (K166 penjelasan) belum ada — "Belum ada layar
  // portal" adalah cakupan 8a yang eksplisit (§17); menyusul di 8f/8g.
  const akses = await prisma.portalAccess.findFirst({
    where: { portalUserId, revokedAt: null },
    orderBy: { createdAt: 'desc' },
  })
  if (!akses) throw unauthorized('Akses portal tidak aktif. Hubungi keagenan Anda.')
  if (!akses.customerId && !akses.vendorId) throw unauthorized()

  const pihak = akses.pihak === 'VENDOR' ? 'VENDOR' : 'CUSTOMER'
  const pihakId = pihak === 'VENDOR' ? akses.vendorId : akses.customerId
  if (!pihakId) throw unauthorized()

  return { tenantId: akses.tenantId, portalUserId, pihak, pihakId }
}
