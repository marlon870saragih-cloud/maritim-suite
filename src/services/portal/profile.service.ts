// Profil pengguna portal — "mengubah kata sandi & nama sendiri" (K169),
// satu-satunya tulisan lain yang diizinkan selain konfirmasi pembayaran.
// Menyentuh barisnya SENDIRI saja: `PortalUser` bukan model di
// MODEL_PORTAL/MODEL_PORTAL_TULIS (K148) — portal-guard tidak mengenalnya
// sama sekali — jadi berkas ini memakai klien internal, dipagari eksplisit
// oleh `portalUserId` dari sesi (bukan dari input, K150 semangat yang sama).

import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { validation } from '../errors'
import { periksaWarnaAksen } from '../saas/contrast'
import type { PortalContext } from './context'

const PANJANG_SANDI_MIN = 8
const PANJANG_NAMA_MAKS = 120

export type MerekPortalSesi = {
  companyName: string
  accentColor: string | null
  accentTextColor: '#FFFFFF' | '#000000' | null
  /** `null` = tak ada logo sama sekali. Kalau ada, `viaAttachment` menentukan bentuknya: `true` → pemanggil pakai `/api/portal/branding/logo` (K181); `false` → field ini ADALAH data URL siap-pakai (M6, cadangan). */
  logoDataUrl: string | null
  logoViaAttachment: boolean
}

export type ProfilPortal = {
  name: string; email: string; phone: string | null; pihak: 'CUSTOMER' | 'VENDOR'
  /** Fase 8i / K180 — dibaca dari SESI (pctx.tenantId), bukan slug: begitu login, merek yang berlaku adalah merek tenant SUNGGUHAN, apa pun alamat yang dipakai masuk. */
  merek: MerekPortalSesi
}

async function merekUntukSesi(pctx: PortalContext): Promise<MerekPortalSesi> {
  const t = await prisma.tenant.findFirst({
    where: { id: pctx.tenantId },
    select: { companyName: true, brandPrimaryColor: true, logoUrl: true, logoAttachmentId: true },
  })
  const kontras = t?.brandPrimaryColor ? periksaWarnaAksen(t.brandPrimaryColor) : null
  return {
    companyName: t?.companyName ?? 'Maritime Suite',
    accentColor: kontras?.hex ?? null,
    accentTextColor: kontras?.tekstAman ?? null,
    logoDataUrl: t?.logoAttachmentId ? null : (t?.logoUrl ?? null),
    logoViaAttachment: !!t?.logoAttachmentId,
  }
}

/**
 * `pihak` diambil dari `pctx` (sudah dibaca ulang PortalAccess tiap
 * permintaan lewat requirePortal(), K168), BUKAN query baru — dipakai
 * PortalNav.tsx (Fase 8g) untuk memutuskan navigasi mana yang ditampilkan
 * tanpa endpoint baru.
 */
export async function getProfilPortal(pctx: PortalContext): Promise<ProfilPortal> {
  const u = await prisma.portalUser.findFirst({
    where: { id: pctx.portalUserId, tenantId: pctx.tenantId },
    select: { name: true, email: true, phone: true },
  })
  if (!u) throw validation('Profil tidak ditemukan.')
  return { ...u, pihak: pctx.pihak, merek: await merekUntukSesi(pctx) }
}

/**
 * Berkas logo (bytes) untuk sesi portal AUTENTIK — dipakai nav/header portal
 * sesudah login (beda dari `logoPublikUntukSlug()` di public-branding.ts
 * yang dipakai SEBELUM login). `Attachment` bukan model di MODEL_PORTAL
 * (K148, sama seperti PortalUser di atas), jadi klien INTERNAL dipakai —
 * amannya datang dari `pctx.tenantId` (sesi tervalidasi server), bukan dari
 * input pemanggil.
 */
export async function bacaLogoUntukSesi(
  pctx: PortalContext,
): Promise<{ storageKey: string; mimeType: string } | null> {
  const t = await prisma.tenant.findFirst({ where: { id: pctx.tenantId }, select: { logoAttachmentId: true } })
  if (!t?.logoAttachmentId) return null
  const att = await prisma.attachment.findFirst({
    where: { id: t.logoAttachmentId, tenantId: pctx.tenantId, entityType: 'TENANT', deletedAt: null },
    select: { storageKey: true, mimeType: true },
  })
  return att
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
