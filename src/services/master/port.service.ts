// ⭐ MODUL RUJUKAN — pola untuk SEMUA modul Master Data di Fase 1.
//
// Vessel, Customer, Vendor, Currency, ExchangeRate, ServiceCatalog dan
// seterusnya dibuat dengan meniru berkas ini. Kalau ada yang perlu menyimpang,
// tulis alasannya di komentar supaya tidak dikira kelalaian.
//
// Enam aturan yang menjadikan berkas ini rujukan:
//  1. Argumen pertama SELALU TenantContext. Service tidak pernah membaca sesi.
//  2. Semua akses DB lewat forTenant(ctx). Pembagian kerjanya: TypeScript
//     mewajibkan tenantId pada create() (lupa = gagal kompilasi), sedangkan
//     guard mengunci tenantId pada setiap `where` (yang TypeScript tak bisa
//     tangkap). Dua celah itu saling menutup.
//  3. Tidak ada findUnique/update/delete satuan (guard menolaknya). Pakai
//     findFirst / updateMany / deleteMany, lalu periksa hasilnya.
//  4. Hapus = soft delete (isi deletedAt). Data lama tidak pernah benar-benar
//     hilang — penting untuk audit dan sengketa dengan principal.
//  5. Kesalahan dilempar sebagai ServiceError, bukan Response. Service tidak
//     tahu HTTP.
//  6. Baris "milik tenant lain" dilaporkan NOT_FOUND, bukan FORBIDDEN — supaya
//     keberadaan datanya tidak ikut terbongkar.

import type { Port } from '@prisma/client'
import type { TenantContext } from '../context'
import { requireRole } from '../context'
import { forTenant } from '../tenant-db'
import { conflict, notFound } from '../errors'
import { bool, num, str, wajib } from '../input'

export type PortInput = ReturnType<typeof bacaInput>

/** Ambil & rapikan field pelabuhan dari body. Dipakai bersama oleh create & update. */
function bacaInput(body: Record<string, unknown>) {
  return {
    name: wajib(str(body.name), 'Nama pelabuhan'),
    unlocode: str(body.unlocode)?.toUpperCase() ?? null,
    country: str(body.country)?.toUpperCase() ?? null,
    timezone: str(body.timezone),
    latitude: num(body.latitude),
    longitude: num(body.longitude),
    portAuthority: str(body.portAuthority),
    pilotRequired: bool(body.pilotRequired),
    tugRequired: bool(body.tugRequired),
    maxDraft: num(body.maxDraft),
    maxLoa: num(body.maxLoa),
    workingHours: str(body.workingHours),
    notes: str(body.notes),
    isActive: bool(body.isActive, true),
  }
}

/** Daftar pelabuhan aktif (yang sudah dihapus tidak ikut). */
export async function listPorts(
  ctx: TenantContext,
  opts: { termasukNonAktif?: boolean; cari?: string | null } = {},
): Promise<Port[]> {
  const db = forTenant(ctx)
  const cari = opts.cari?.trim()
  return db.port.findMany({
    where: {
      deletedAt: null,
      ...(opts.termasukNonAktif ? {} : { isActive: true }),
      ...(cari
        ? {
            OR: [
              { name: { contains: cari, mode: 'insensitive' } },
              { unlocode: { contains: cari, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { name: 'asc' },
  })
}

/** Satu pelabuhan. NOT_FOUND bila tidak ada, sudah dihapus, atau milik tenant lain. */
export async function getPort(ctx: TenantContext, id: string): Promise<Port> {
  const db = forTenant(ctx)
  // findFirst, bukan findUnique — lihat aturan 3 di kepala berkas.
  const port = await db.port.findFirst({ where: { id, deletedAt: null } })
  if (!port) throw notFound('Pelabuhan')
  return port
}

export async function createPort(ctx: TenantContext, body: Record<string, unknown>): Promise<Port> {
  requireRole(ctx, 'ADMIN', 'OPERATOR')
  const db = forTenant(ctx)
  const data = bacaInput(body)

  await pastikanUnlocodeBelumDipakai(ctx, data.unlocode)

  // tenantId ditulis eksplisit karena TypeScript memang mewajibkannya pada
  // create() — dan itu bagus: lupa mengisinya pada create ketahuan saat kompilasi.
  // Guard tetap menimpanya dengan tenant dari konteks, jadi salah nilai pun aman.
  // Pembagian kerjanya: TypeScript menjaga create, guard menjaga where. Lihat
  // aturan 2 di kepala berkas.
  return db.port.create({ data: { ...data, tenantId: ctx.tenantId } })
}

export async function updatePort(
  ctx: TenantContext,
  id: string,
  body: Record<string, unknown>,
): Promise<Port> {
  requireRole(ctx, 'ADMIN', 'OPERATOR')
  const db = forTenant(ctx)
  const data = bacaInput(body)

  await pastikanUnlocodeBelumDipakai(ctx, data.unlocode, id)

  // updateMany, bukan update — supaya tenantId ikut jadi syarat pencocokan.
  const hasil = await db.port.updateMany({ where: { id, deletedAt: null }, data })
  if (hasil.count === 0) throw notFound('Pelabuhan')
  return getPort(ctx, id)
}

/**
 * Hapus = soft delete. Baris tetap ada supaya Voyage/EPDA lama yang menunjuk
 * pelabuhan ini tidak berubah artinya (prinsip snapshot, K5).
 */
export async function removePort(ctx: TenantContext, id: string): Promise<void> {
  requireRole(ctx, 'ADMIN')
  const db = forTenant(ctx)

  const dipakai = await db.voyage.count({ where: { portId: id } })
  if (dipakai > 0) {
    throw conflict(
      `Pelabuhan ini dipakai di ${dipakai} voyage. Nonaktifkan saja (isActive = false) agar riwayat tetap utuh.`,
    )
  }

  const hasil = await db.port.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date(), isActive: false },
  })
  if (hasil.count === 0) throw notFound('Pelabuhan')
}

/** UN/LOCODE unik per tenant (@@unique([tenantId, unlocode]) di schema). */
async function pastikanUnlocodeBelumDipakai(
  ctx: TenantContext,
  unlocode: string | null,
  kecualiId?: string,
): Promise<void> {
  if (!unlocode) return
  const db = forTenant(ctx)
  const ada = await db.port.findFirst({
    where: { unlocode, ...(kecualiId ? { id: { not: kecualiId } } : {}) },
    select: { id: true, name: true, deletedAt: true },
  })
  if (!ada) return
  throw conflict(
    ada.deletedAt
      ? `UN/LOCODE ${unlocode} masih dipegang pelabuhan "${ada.name}" yang sudah dihapus. Pulihkan atau pakai kode lain.`
      : `UN/LOCODE ${unlocode} sudah dipakai pelabuhan "${ada.name}".`,
  )
}
