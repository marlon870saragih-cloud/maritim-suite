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
import { normalisasiEmailPortal } from './email'

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
 *
 * C1.4 — dua perubahan:
 *   1. Surel disimpan dalam bentuk KANONIK (services/portal/email.ts). Baris
 *      `PortalInvitation` inilah yang kelak jadi `PortalUser.email` saat
 *      undangan diterima, jadi kanonikalisasinya harus terjadi di sini —
 *      bukan belakangan, saat kendala unik sudah terlanjur dilewati.
 *   2. Undangan yang PASTI gagal ditolak SEBELUM token dibuat (lihat pagar
 *      di bawah). Sebelumnya undangan selalu berhasil dan kegagalannya baru
 *      muncul di layar PENERIMA — staf yang mengundang tak pernah tahu.
 */
export async function inviteToPortal(
  ctx: TenantContext,
  body: Record<string, unknown>,
): Promise<{ invitation: PortalInvitationDetail; token: string }> {
  const pihak = pilihan(body.pihak, PIHAK, 'Pihak')
  requireRole(ctx, ...PERAN_UNDANG[pihak])

  const email = normalisasiEmailPortal(wajib(str(body.email), 'Email'))
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

  // C1.4 — pagar sebelum token dibuat.
  //
  // HANYA satu keadaan yang ditolak: identitas yang masih HIDUP dan SUDAH
  // punya akses aktif ke pihak yang sama. Undangan itu tak punya pekerjaan
  // tersisa — menerimanya tak akan mengubah apa pun, dan tanpa pagar ini
  // penerima justru bertemu galat teknis (lihat cabang bertahan di
  // access.service.ts) atas keadaan yang staf-lah yang bisa memperbaikinya.
  //
  // TIGA keadaan lain SENGAJA tetap boleh diundang — semuanya adalah alasan
  // sah orang diundang ulang, dan menolaknya berarti mengunci akun keluar
  // untuk selamanya (persis cacat yang C1.4 perbaiki):
  //   - PortalUser ada tapi sudah dihapus lembut / dinonaktifkan → dipulihkan;
  //   - aksesnya ada tapi sudah dicabut                          → dihidupkan;
  //   - identitasnya aktif tapi belum punya akses ke pihak ini   → ditambah.
  const identitas = await db.portalUser.findFirst({
    // TANPA `deletedAt: null` — sengaja. Kendala unik (tenantId, email) tidak
    // mengenal penghapusan lembut, jadi pencarian identitas pun tidak boleh.
    where: { email },
    select: { id: true, isActive: true, deletedAt: true },
  })
  if (identitas && identitas.isActive && identitas.deletedAt === null) {
    const aksesHidup = await db.portalAccess.findFirst({
      where: { portalUserId: identitas.id, pihak, customerId, vendorId, revokedAt: null },
      select: { id: true },
    })
    if (aksesHidup) {
      // Tanpa id/teknis apa pun: pesan ini dibaca staf di panel Customer/Vendor.
      throw conflict('Pengguna portal ini sudah memiliki akses aktif ke pihak tersebut.')
    }
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
