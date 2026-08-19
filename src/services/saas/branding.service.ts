// Settings › Merek (K180, Fase 8i) — sisi INTERNAL (TenantContext), ADMIN-only.
//
// Logo TIDAK lewat uploadAttachment()/pastikanEntitasMilikTenant() (K85)
// biasa — dan itu sengaja, bukan alpa. `Tenant` BUKAN model bertenant (id-nya
// ADALAH tenantId, lihat catatan services/subscription.ts): `forTenant(ctx)`
// tidak menyuntikkan/menyaring apa pun padanya. Mendaftarkan entityType
// 'TENANT' di ENTITAS_DIDUKUNG (owner-guard.ts) berarti pastikanEntitasMilikTenant()
// akan memeriksa kepemilikan lewat `tenant.findFirst({where:{id:entityId}})`
// TANPA penyaring tenant sama sekali — entityId dari tenant MANA PUN akan
// "terbukti sah". Itu lubang lintas-tenant kalau id-nya sempat dipercaya dari
// input. Berkas ini menghindarinya sepenuhnya: `entityId` Attachment logo
// SELALU `ctx.tenantId` (dari sesi, tak pernah dari body permintaan) — tak
// ada verifikasi kepemilikan yang perlu dilakukan karena tak ada id asing
// yang pernah dipercaya.

import type { Attachment } from '@prisma/client'
import type { TenantContext } from '../context'
import { requireRole } from '../context'
import { forTenant } from '../tenant-db'
import { notFound, validation, conflict } from '../errors'
import { str } from '../input'
import { periksaBerkas } from '../ops/attachment.service'
import { pastikanKuota } from './quota.service'
import { buatStorageKey, buatTokenBerkas, penyimpananLokal, sha256, type PenyimpananBerkas } from '../ops/storage/local'
import { periksaWarnaAksen, type PeriksaKontras } from './contrast'

const PANJANG_SLUG_MIN = 3
const PANJANG_SLUG_MAKS = 40
/** Huruf kecil, angka, strip — cocok jadi segmen path (K182) maupun label subdomain nanti. */
const POLA_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

/**
 * Slug yang DILARANG — bertabrakan dengan rute `/portal/*` yang sudah ada
 * (login, accept, dan segmen "app" itu sendiri via route group). Daftar
 * putih kebalikannya (daftar hitam) sengaja di sini karena ini bukan
 * pertanyaan keamanan (K148 semangat) — hanya menghindari tabrakan rute,
 * jumlahnya kecil dan tertutup.
 */
const SLUG_TERLARANG = new Set(['login', 'accept', 'app', 'api', 'logo'])

export type BrandingTenant = {
  companyName: string
  brandPrimaryColor: string | null
  portalSlug: string | null
  /** Logo TERSEDIA untuk ditampilkan — via Attachment (K181) atau `logoUrl` cadangan (M6). Tak membocorkan sumbernya ke pemanggil. */
  logoTersedia: boolean
  /** Hanya benar bila sumbernya `logoAttachmentId` (K181) — dipakai UI settings menandai "sudah dimigrasi". */
  logoViaAttachment: boolean
  kontras: PeriksaKontras | null
}

async function muatTenant(ctx: TenantContext) {
  const t = await forTenant(ctx).tenant.findFirst({
    where: { id: ctx.tenantId },
    select: { companyName: true, brandPrimaryColor: true, portalSlug: true, logoUrl: true, logoAttachmentId: true },
  })
  if (!t) throw notFound('Tenant')
  return t
}

export async function getBranding(ctx: TenantContext): Promise<BrandingTenant> {
  requireRole(ctx, 'ADMIN')
  const t = await muatTenant(ctx)
  return {
    companyName: t.companyName,
    brandPrimaryColor: t.brandPrimaryColor,
    portalSlug: t.portalSlug,
    logoTersedia: !!(t.logoAttachmentId || t.logoUrl),
    logoViaAttachment: !!t.logoAttachmentId,
    kontras: t.brandPrimaryColor ? periksaWarnaAksen(t.brandPrimaryColor) : null,
  }
}

function bersihkanSlug(v: unknown): string | null {
  const s = str(v)
  if (!s) return null
  return s.toLowerCase()
}

async function pastikanSlugTersedia(ctx: TenantContext, slug: string): Promise<void> {
  if (slug.length < PANJANG_SLUG_MIN || slug.length > PANJANG_SLUG_MAKS) {
    throw validation(`Alamat portal harus ${PANJANG_SLUG_MIN}-${PANJANG_SLUG_MAKS} karakter.`)
  }
  if (!POLA_SLUG.test(slug)) {
    throw validation('Alamat portal hanya boleh huruf kecil, angka, dan tanda hubung (mis. "tribuana-maritim") — tanpa spasi atau simbol lain, tak diawali/diakhiri tanda hubung.')
  }
  if (SLUG_TERLARANG.has(slug)) {
    throw validation(`"${slug}" tidak bisa dipakai — bertabrakan dengan halaman portal yang sudah ada.`)
  }
  // Tenant BUKAN model bertenant (lihat catatan kepala berkas) — pengecekan
  // keunikan ini SENGAJA lintas-tenant (itulah maksud @@unique portalSlug),
  // jadi klien mentah `forTenant(ctx).tenant` (bukan filter tenantId) tepat di sini.
  const bentrok = await forTenant(ctx).tenant.findFirst({
    where: { portalSlug: slug, id: { not: ctx.tenantId } },
    select: { id: true },
  })
  if (bentrok) throw conflict(`Alamat portal "${slug}" sudah dipakai tenant lain.`)
}

export type UpdateBrandingBody = {
  brandPrimaryColor?: unknown
  portalSlug?: unknown
}

export async function updateBranding(ctx: TenantContext, body: UpdateBrandingBody): Promise<BrandingTenant> {
  requireRole(ctx, 'ADMIN')

  const data: { brandPrimaryColor?: string | null; portalSlug?: string | null } = {}

  if ('brandPrimaryColor' in body) {
    const warna = str(body.brandPrimaryColor)
    if (warna) {
      const cek = periksaWarnaAksen(warna)
      if (!cek.hex) throw validation('Format warna tidak sah — gunakan kode hex, mis. "#0059BB".')
      // Kontras rendah TIDAK ditolak (K180: "sistem memakai varian yang
      // terbaca", bukan menolak pilihan tenant) — hanya diberi tahu via
      // `kontras.peringatan` pada respons, ditampilkan UI sebagai peringatan.
      data.brandPrimaryColor = cek.hex
    } else {
      data.brandPrimaryColor = null
    }
  }

  if ('portalSlug' in body) {
    const slug = bersihkanSlug(body.portalSlug)
    if (slug) {
      await pastikanSlugTersedia(ctx, slug)
      data.portalSlug = slug
    } else {
      data.portalSlug = null
    }
  }

  const hasil = await forTenant(ctx).tenant.updateMany({ where: { id: ctx.tenantId }, data })
  if (hasil.count === 0) throw notFound('Tenant')

  return getBranding(ctx)
}

// ------------------------------------------------------------------- logo

export type HasilUnggahLogo = { attachment: { id: string; fileName: string; sizeBytes: number; sha256: string } }

/**
 * Unggah logo baru. Menggantikan yang lama: Attachment lama (bila ada)
 * di-SOFT-DELETE (K110 — tak pernah hard-delete) supaya daftar lampiran
 * tenant tak menumpuk logo basi tanpa batas, TAPI `logoUrl` cadangan (M6)
 * tidak disentuh sama sekali oleh jalur ini.
 */
export async function unggahLogo(
  ctx: TenantContext,
  input: { fileName: string; mimeType: string | null; isi: Buffer },
  penyimpanan: PenyimpananBerkas = penyimpananLokal,
): Promise<HasilUnggahLogo> {
  requireRole(ctx, 'ADMIN')

  const { fileName, ext, mimeType } = periksaBerkas(input.fileName, input.mimeType, input.isi.length)
  await pastikanKuota(ctx, 'PENYIMPANAN')

  const db = forTenant(ctx)
  const tenantSebelum = await db.tenant.findFirst({ where: { id: ctx.tenantId }, select: { logoAttachmentId: true } })

  const storageKey = buatStorageKey(ctx.tenantId, buatTokenBerkas(), ext)
  await penyimpanan.simpan(storageKey, input.isi, mimeType)

  const attachment = await db.attachment.create({
    data: {
      tenantId: ctx.tenantId,
      entityType: 'TENANT',
      entityId: ctx.tenantId, // SELALU tenant milik sesi ini — lihat catatan kepala berkas
      fileName,
      mimeType,
      sizeBytes: input.isi.length,
      sha256: sha256(input.isi),
      storageKey,
      kind: 'BRANDING',
      uploadedByUserId: ctx.userId,
    },
  })

  await db.tenant.updateMany({ where: { id: ctx.tenantId }, data: { logoAttachmentId: attachment.id } })

  if (tenantSebelum?.logoAttachmentId) {
    await db.attachment.updateMany({
      where: { id: tenantSebelum.logoAttachmentId },
      data: { deletedAt: new Date() },
    })
  }

  return { attachment: { id: attachment.id, fileName: attachment.fileName, sizeBytes: attachment.sizeBytes, sha256: attachment.sha256 } }
}

/** Berkas logo tenant sendiri, untuk pratinjau di Settings › Merek. NOT_FOUND bila belum pernah diunggah lewat K181. */
export async function bacaLogoSendiri(
  ctx: TenantContext,
  penyimpanan: PenyimpananBerkas = penyimpananLokal,
): Promise<{ row: Attachment; isi: Buffer }> {
  requireRole(ctx, 'ADMIN')
  const t = await forTenant(ctx).tenant.findFirst({ where: { id: ctx.tenantId }, select: { logoAttachmentId: true } })
  if (!t?.logoAttachmentId) throw notFound('Logo')
  // Attachment ADALAH model bertenant — forTenant(ctx) menyaringnya dengan
  // benar di sini (beda dari Tenant sendiri, lihat catatan kepala berkas).
  const row = await forTenant(ctx).attachment.findFirst({ where: { id: t.logoAttachmentId, deletedAt: null } })
  if (!row) throw notFound('Logo')
  const isi = await penyimpanan.baca(row.storageKey)
  return { row, isi }
}
