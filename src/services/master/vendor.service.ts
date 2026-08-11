// Pola meniru port.service.ts (⭐ MODUL RUJUKAN) — lihat docs/POLA-SERVICE-LAYER.md.

import type { Vendor } from '@prisma/client'
import type { TenantContext } from '../context'
import { requireRole } from '../context'
import { forTenant } from '../tenant-db'
import { conflict, notFound } from '../errors'
import { bool, int, str, wajib } from '../input'

export type VendorInput = ReturnType<typeof bacaInput>

function bacaInput(body: Record<string, unknown>) {
  return {
    name: wajib(str(body.name), 'Nama vendor'),
    vendorType: str(body.vendorType),
    address: str(body.address),
    npwp: str(body.npwp),
    email: str(body.email),
    phone: str(body.phone),
    contactPerson: str(body.contactPerson),
    bankName: str(body.bankName),
    bankAccount: str(body.bankAccount),
    paymentTermDays: int(body.paymentTermDays),
    isActive: bool(body.isActive, true),
  }
}

export async function listVendors(
  ctx: TenantContext,
  opts: { termasukNonAktif?: boolean; cari?: string | null } = {},
): Promise<Vendor[]> {
  const db = forTenant(ctx)
  const cari = opts.cari?.trim()
  return db.vendor.findMany({
    where: {
      deletedAt: null,
      ...(opts.termasukNonAktif ? {} : { isActive: true }),
      ...(cari
        ? {
            OR: [
              { name: { contains: cari, mode: 'insensitive' } },
              { vendorType: { contains: cari, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { name: 'asc' },
  })
}

export async function getVendor(ctx: TenantContext, id: string): Promise<Vendor> {
  const db = forTenant(ctx)
  const vendor = await db.vendor.findFirst({ where: { id, deletedAt: null } })
  if (!vendor) throw notFound('Vendor')
  return vendor
}

export async function createVendor(
  ctx: TenantContext,
  body: Record<string, unknown>,
): Promise<Vendor> {
  requireRole(ctx, 'ADMIN', 'OPERATOR')
  const db = forTenant(ctx)
  return db.vendor.create({ data: { ...bacaInput(body), tenantId: ctx.tenantId } })
}

export async function updateVendor(
  ctx: TenantContext,
  id: string,
  body: Record<string, unknown>,
): Promise<Vendor> {
  requireRole(ctx, 'ADMIN', 'OPERATOR')
  const db = forTenant(ctx)
  const hasil = await db.vendor.updateMany({
    where: { id, deletedAt: null },
    data: bacaInput(body),
  })
  if (hasil.count === 0) throw notFound('Vendor')
  return getVendor(ctx, id)
}

/** Hapus = soft delete. Ditolak bila masih dipakai di service catalog/disbursement (prinsip snapshot, K5). */
export async function removeVendor(ctx: TenantContext, id: string): Promise<void> {
  requireRole(ctx, 'ADMIN')
  const db = forTenant(ctx)

  const [catalogCount, disbCount] = await Promise.all([
    db.serviceCatalog.count({ where: { defaultVendorId: id } }),
    db.disbursementItem.count({ where: { vendorId: id } }),
  ])
  const dipakai = catalogCount + disbCount
  if (dipakai > 0) {
    throw conflict(
      `Vendor ini dipakai di ${dipakai} katalog jasa/item disbursement. Nonaktifkan saja (isActive = false) agar riwayat tetap utuh.`,
    )
  }

  const hasil = await db.vendor.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date(), isActive: false },
  })
  if (hasil.count === 0) throw notFound('Vendor')
}
