// Merek portal ber-slug — SATU-SATUNYA jalur portal lain yang berjalan TANPA
// sesi apa pun (di luar access.service.ts's acceptPortalInvitation, K168) —
// pengunjung yang membuka `/portal/<slug>/login` belum jadi siapa-siapa,
// jadi belum bisa punya PortalContext.
//
// Daftar putih kolom paling ketat di seluruh portal (K167 semangatnya, tapi
// lebih ekstrem): TAK PERNAH mengembalikan apa pun selain nama tampilan +
// warna + logo. Sengaja TIDAK mengembalikan tenantId (pengunjung anonim tak
// perlu tahu id internal), status langganan, jumlah pengguna, atau APA PUN
// yang bisa dipakai menyimpulkan sesuatu tentang tenant selain "tenant ini
// ada dan namanya X" — satu-satunya hal yang memang harus terlihat SEBELUM
// login supaya halaman masuk terasa milik mereka (K180).

import { prisma } from '@/lib/prisma'
import { notFound } from '../errors'
import { periksaWarnaAksen } from '../saas/contrast'

export type BrandingPublik = {
  companyName: string
  /** Hex tervalidasi, atau `null` bila tenant belum mengatur/warnanya tak sah — pemanggil jatuh ke warna bawaan Maritime Suite. */
  brandPrimaryColor: string | null
  tekstAksenAman: '#FFFFFF' | '#000000' | null
  /** `data:image/...;base64,...` (M6, cadangan) — `null` bila tenant sudah dimigrasi K181 (lihat `logoUrl` vs `logoViaAttachment`). */
  logoDataUrl: string | null
  /** `true` bila logonya lewat Attachment (K181) — pemanggil menyusun URL `/api/portal/branding/<slug>/logo` sendiri, bukan lewat field ini. */
  logoViaAttachment: boolean
}

/**
 * Cari tenant lewat `portalSlug` PUBLIK — dipakai halaman `/portal/[slug]/login`
 * SEBELUM ada sesi apa pun. `slug` yang tak ketemu → NOT_FOUND (K182/8:
 * "404 rapi, bukan galat server" — `toResponse()` di services/http.ts sudah
 * menerjemahkan ServiceError NOT_FOUND jadi 404, jadi tak ada penanganan
 * khusus yang perlu ditulis di sini maupun di route-nya).
 */
export async function brandingPublikUntukSlug(slug: unknown): Promise<BrandingPublik> {
  const s = typeof slug === 'string' ? slug.trim().toLowerCase() : ''
  if (!s) throw notFound('Portal')

  const t = await prisma.tenant.findFirst({
    where: { portalSlug: s },
    select: { companyName: true, brandPrimaryColor: true, logoUrl: true, logoAttachmentId: true },
  })
  if (!t) throw notFound('Portal')

  const kontras = t.brandPrimaryColor ? periksaWarnaAksen(t.brandPrimaryColor) : null

  return {
    companyName: t.companyName,
    brandPrimaryColor: kontras?.hex ?? null,
    tekstAksenAman: kontras?.tekstAman ?? null,
    logoDataUrl: t.logoAttachmentId ? null : t.logoUrl,
    logoViaAttachment: !!t.logoAttachmentId,
  }
}

/**
 * Berkas logo (bytes) lewat Attachment, untuk `slug` yang SUDAH dimigrasi
 * K181. Raw `prisma` + `tenantId` eksplisit dari hasil pencarian slug di
 * atas (BUKAN dari input pemanggil) — Attachment memang model bertenant,
 * tapi tak ada sesi apa pun di sini untuk `forTenant(ctx)` menyaringnya;
 * penyaringan manual ini setara persis, dan amannya datang dari `tenantId`
 * yang sudah terbukti lewat langkah slug→tenant, bukan dipercaya mentah.
 */
export async function logoPublikUntukSlug(
  slug: unknown,
): Promise<{ storageKey: string; mimeType: string; fileName: string } | null> {
  const s = typeof slug === 'string' ? slug.trim().toLowerCase() : ''
  if (!s) throw notFound('Portal')

  const t = await prisma.tenant.findFirst({ where: { portalSlug: s }, select: { id: true, logoAttachmentId: true } })
  if (!t) throw notFound('Portal')
  if (!t.logoAttachmentId) return null

  const att = await prisma.attachment.findFirst({
    where: { id: t.logoAttachmentId, tenantId: t.id, entityType: 'TENANT', deletedAt: null },
    select: { storageKey: true, mimeType: true, fileName: true },
  })
  return att
}
