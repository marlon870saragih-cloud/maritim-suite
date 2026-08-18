// Undangan portal (K166/K168, Fase 8a) — sisi INTERNAL (forTenant), dipakai
// staf mengundang pelanggan/vendor. Menerima undangan (acceptInvitation)
// SENGAJA di berkas terpisah (access.service.ts) karena penerimanya BELUM
// PUNYA sesi apa pun — tak ada TenantContext untuk dipagari.

import { randomBytes, createHash } from 'node:crypto'
import type { Role } from '@prisma/client'
import type { TenantContext } from '../context'
import { requireRole } from '../context'
import { forTenant } from '../tenant-db'
import { notFound, validation, conflict } from '../errors'
import { str, wajib, pilihan } from '../input'

const PIHAK = ['CUSTOMER', 'VENDOR'] as const
type Pihak = (typeof PIHAK)[number]

/** K170 tabel peran (Customer Portal) / K173 tabel peran (Vendor Portal). */
const PERAN_UNDANG: Readonly<Record<Pihak, readonly Role[]>> = {
  CUSTOMER: ['ADMIN', 'FINANCE'],
  VENDOR: ['ADMIN', 'OPERATOR', 'MANAJER_OPERASI'],
}

const MASA_BERLAKU_HARI = 7

function buatToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('hex')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  return { token, tokenHash }
}

export type PortalInvitationDetail = {
  id: string
  email: string
  /** String polos apa adanya dari DB (K166: bukan enum DB) — bukan union sengaja. */
  pihak: string
  customerId: string | null
  vendorId: string | null
  expiresAt: Date
  acceptedAt: Date | null
  createdAt: Date
}

/**
 * K166/K168 — undang satu pihak luar ke portal. Token dikembalikan SEKALI di
 * respons (`token`, dalam bentuk mentah) — TIDAK PERNAH disimpan apa adanya
 * (hanya `tokenHash` yang masuk DB). Sampai P10 (pengiriman surel) dijawab,
 * pemanggil (route/UI) yang bertanggung jawab menampilkan tautannya untuk
 * disalin & dikirim manual (K168, sejalan K136 Fase 7).
 */
export async function inviteToPortal(
  ctx: TenantContext,
  body: Record<string, unknown>,
): Promise<{ invitation: PortalInvitationDetail; token: string }> {
  const pihak = pilihan(body.pihak, PIHAK, 'Pihak')
  requireRole(ctx, ...PERAN_UNDANG[pihak])

  const email = wajib(str(body.email), 'Email')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw validation('Format email tidak sah.')

  const db = forTenant(ctx)
  let customerId: string | null = null
  let vendorId: string | null = null

  if (pihak === 'CUSTOMER') {
    customerId = wajib(str(body.customerId), 'Customer')
    const c = await db.customer.findFirst({ where: { id: customerId, deletedAt: null }, select: { id: true } })
    if (!c) throw notFound('Customer')
  } else {
    vendorId = wajib(str(body.vendorId), 'Vendor')
    const v = await db.vendor.findFirst({ where: { id: vendorId, deletedAt: null }, select: { id: true } })
    if (!v) throw notFound('Vendor')
  }

  const { token, tokenHash } = buatToken()
  const expiresAt = new Date(Date.now() + MASA_BERLAKU_HARI * 24 * 60 * 60 * 1000)

  const inv = await db.portalInvitation.create({
    data: {
      tenantId: ctx.tenantId,
      email,
      pihak,
      customerId,
      vendorId,
      tokenHash,
      expiresAt,
      invitedByUserId: ctx.userId,
    },
  })

  return { invitation: inv, token }
}

/** K170 — "Melihat siapa saja yang punya akses portal" terbuka untuk semua peran internal. */
export async function listPortalInvitations(
  ctx: TenantContext,
  f: { customerId?: string | null; vendorId?: string | null } = {},
): Promise<PortalInvitationDetail[]> {
  return forTenant(ctx).portalInvitation.findMany({
    where: {
      ...(f.customerId ? { customerId: f.customerId } : {}),
      ...(f.vendorId ? { vendorId: f.vendorId } : {}),
    },
    orderBy: { createdAt: 'desc' },
  })
}

/** K170 — muncul di panel Customer/Vendor, dipagari sama seperti undangan (PERAN_UNDANG). */
export async function cancelPortalInvitation(ctx: TenantContext, id: string): Promise<void> {
  const db = forTenant(ctx)
  const inv = await db.portalInvitation.findFirst({ where: { id } })
  if (!inv) throw notFound('Undangan')
  if (inv.acceptedAt) throw conflict('Undangan ini sudah diterima — tidak bisa dibatalkan lagi.')
  requireRole(ctx, ...PERAN_UNDANG[inv.pihak as Pihak])

  const hasil = await db.portalInvitation.deleteMany({ where: { id } })
  if (hasil.count === 0) throw notFound('Undangan')
}
