// Profil pengguna portal — "mengubah kata sandi & nama sendiri" (K169),
// satu-satunya tulisan lain yang diizinkan selain konfirmasi pembayaran.
// Menyentuh barisnya SENDIRI saja: `PortalUser` bukan model di
// MODEL_PORTAL/MODEL_PORTAL_TULIS (K148) — portal-guard tidak mengenalnya
// sama sekali — jadi berkas ini memakai klien internal, dipagari eksplisit
// oleh `portalUserId` dari sesi (bukan dari input, K150 semangat yang sama).

import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { validation } from '../errors'
import type { PortalContext } from './context'

const PANJANG_SANDI_MIN = 8
const PANJANG_NAMA_MAKS = 120

export type ProfilPortal = { name: string; email: string; phone: string | null }

export async function getProfilPortal(pctx: PortalContext): Promise<ProfilPortal> {
  const u = await prisma.portalUser.findFirst({
    where: { id: pctx.portalUserId, tenantId: pctx.tenantId },
    select: { name: true, email: true, phone: true },
  })
  if (!u) throw validation('Profil tidak ditemukan.')
  return u
}

export async function updateProfilPortal(
  pctx: PortalContext,
  body: { name?: unknown; password?: unknown; phone?: unknown },
): Promise<ProfilPortal> {
  const data: { name?: string; password?: string; phone?: string | null } = {}

  if (body.name !== undefined) {
    const name = String(body.name ?? '').trim()
    if (!name) throw validation('Nama tidak boleh kosong.')
    if (name.length > PANJANG_NAMA_MAKS) throw validation(`Nama maksimal ${PANJANG_NAMA_MAKS} karakter.`)
    data.name = name
  }

  if (body.phone !== undefined) {
    const phone = String(body.phone ?? '').trim()
    data.phone = phone || null
  }

  if (body.password !== undefined) {
    const password = String(body.password ?? '')
    if (password.length < PANJANG_SANDI_MIN) {
      throw validation(`Kata sandi minimal ${PANJANG_SANDI_MIN} karakter.`)
    }
    data.password = await bcrypt.hash(password, 10)
  }

  // `updateMany` ber-where `id` DAN `tenantId` — pihak luar tak bisa
  // menyunting baris `PortalUser` mana pun kecuali miliknya sendiri, sekalipun
  // ada bug lain yang lolos di lapisan atasnya.
  const hasil = await prisma.portalUser.updateMany({
    where: { id: pctx.portalUserId, tenantId: pctx.tenantId },
    data,
  })
  if (hasil.count === 0) throw validation('Profil tidak ditemukan.')

  return getProfilPortal(pctx)
}
