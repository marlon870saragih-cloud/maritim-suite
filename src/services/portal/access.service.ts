// Penerimaan undangan & pengelolaan akses portal (K166/K168, Fase 8a).
//
// `acceptPortalInvitation` SENGAJA TIDAK menerima TenantContext — penerima
// belum punya sesi apa pun (ia belum jadi siapa-siapa sampai baris ini
// selesai). Begitu tenantId undangan diketahui, sisanya lewat
// `systemContext(tenantId)` — pola yang sama dipakai penyemaian tenant baru
// (K153) dan skrip CLI, bukan jalan pintas baru.

import { createHash } from 'node:crypto'
import bcrypt from 'bcryptjs'
import type { Role } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { systemContext, requireRole, type TenantContext } from '../context'
import { forTenant } from '../tenant-db'
import { notFound, validation, conflict } from '../errors'
import { str, wajib } from '../input'

type Pihak = 'CUSTOMER' | 'VENDOR'

/** K170 tabel peran (Customer) / K173 (Vendor) — "Mencabut akses portal". */
const PERAN_CABUT: Readonly<Record<Pihak, readonly Role[]>> = {
  CUSTOMER: ['ADMIN', 'MANAJER_OPERASI', 'FINANCE'],
  VENDOR: ['ADMIN', 'OPERATOR', 'MANAJER_OPERASI'],
}

const PANJANG_SANDI_MIN = 8

/**
 * K168 — terima undangan: pasang kata sandi sendiri, `PortalUser` +
 * `PortalAccess` lahir SAAT INI (bukan saat diundang).
 *
 * Compare-and-swap pada `acceptedAt` (updateMany + cek count, aturan #4
 * POLA-SERVICE-LAYER.md) memastikan token yang dipakai DUA KALI bersamaan
 * hanya memenangkan SATU permintaan — K150 butir 9.
 */
export async function acceptPortalInvitation(
  token: string,
  body: Record<string, unknown>,
): Promise<{ portalUserId: string; accessId: string; pihak: Pihak; email: string }> {
  if (!token || typeof token !== 'string') throw validation('Token undangan wajib disertakan.')
  const tokenHash = createHash('sha256').update(token).digest('hex')

  const invAwal = await prisma.portalInvitation.findFirst({ where: { tokenHash } })
  if (!invAwal) throw notFound('Undangan')
  if (invAwal.expiresAt < new Date()) throw validation('Undangan sudah kedaluwarsa. Minta undangan baru dari keagenan Anda.')

  const password = wajib(str(body.password), 'Kata sandi')
  if (password.length < PANJANG_SANDI_MIN) {
    throw validation(`Kata sandi minimal ${PANJANG_SANDI_MIN} karakter.`)
  }
  const name = str(body.name) ?? invAwal.email

  const ctx = systemContext(invAwal.tenantId)
  const db = forTenant(ctx)

  const ditandai = await db.portalInvitation.updateMany({
    where: { id: invAwal.id, acceptedAt: null },
    data: { acceptedAt: new Date() },
  })
  if (ditandai.count === 0) throw conflict('Undangan ini sudah pernah dipakai.')

  let portalUser = await db.portalUser.findFirst({
    where: { tenantId: invAwal.tenantId, email: invAwal.email, deletedAt: null },
  })
  if (!portalUser) {
    const hash = await bcrypt.hash(password, 10)
    portalUser = await db.portalUser.create({
      data: {
        tenantId: invAwal.tenantId,
        email: invAwal.email,
        password: hash,
        name,
        passwordSetAt: new Date(),
      },
    })
  }

  const akses = await db.portalAccess.create({
    data: {
      tenantId: invAwal.tenantId,
      portalUserId: portalUser.id,
      pihak: invAwal.pihak,
      customerId: invAwal.customerId,
      vendorId: invAwal.vendorId,
    },
  })

  return { portalUserId: portalUser.id, accessId: akses.id, pihak: invAwal.pihak as Pihak, email: invAwal.email }
}

export type PortalAccessDetail = {
  id: string
  portalUserId: string
  /** String polos apa adanya dari DB (K166: bukan enum DB) — bukan union sengaja. */
  pihak: string
  customerId: string | null
  vendorId: string | null
  createdAt: Date
  revokedAt: Date | null
}

/** K170 — "Melihat siapa saja yang punya akses portal" terbuka untuk semua peran internal. */
export async function listPortalAccess(
  ctx: TenantContext,
  f: { customerId?: string | null; vendorId?: string | null } = {},
): Promise<PortalAccessDetail[]> {
  return forTenant(ctx).portalAccess.findMany({
    where: {
      ...(f.customerId ? { customerId: f.customerId } : {}),
      ...(f.vendorId ? { vendorId: f.vendorId } : {}),
    },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * K168 — cabut akses = mengisi `revokedAt`. Sesi yang sedang berjalan mati
 * pada permintaan BERIKUTNYA (bukan seketika di tengah permintaan yang
 * sudah terlanjur jalan) — `requirePortal()` (K149) membaca ulang baris ini
 * SETIAP permintaan portal, tidak pernah mempercayai isi token saja.
 */
export async function revokePortalAccess(ctx: TenantContext, id: string): Promise<void> {
  const db = forTenant(ctx)
  const akses = await db.portalAccess.findFirst({ where: { id } })
  if (!akses) throw notFound('Akses portal')
  requireRole(ctx, ...PERAN_CABUT[akses.pihak as Pihak])

  if (akses.revokedAt) return // sudah dicabut — idempoten, bukan galat

  const hasil = await db.portalAccess.updateMany({
    where: { id, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  if (hasil.count === 0) throw notFound('Akses portal')
}
