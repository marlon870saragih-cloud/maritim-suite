// Pola meniru port.service.ts (⭐ MODUL RUJUKAN) — lihat docs/POLA-SERVICE-LAYER.md.

import type { Customer } from '@prisma/client'
import type { TenantContext } from '../context'
import { requireRole } from '../context'
import { forTenant } from '../tenant-db'
import { conflict, notFound } from '../errors'
import { bool, int, num, str, wajib } from '../input'

export type CustomerInput = ReturnType<typeof bacaInput>

function bacaInput(body: Record<string, unknown>) {
  return {
    name: wajib(str(body.name), 'Nama customer'),
    customerType: str(body.customerType),
    address: str(body.address),
    npwp: str(body.npwp),
    email: str(body.email),
    phone: str(body.phone),
    contactPerson: str(body.contactPerson),
    currency: str(body.currency)?.toUpperCase() ?? 'IDR',
    creditLimit: num(body.creditLimit),
    paymentTermDays: int(body.paymentTermDays),
    isActive: bool(body.isActive, true),
  }
}

export async function listCustomers(
  ctx: TenantContext,
  opts: { termasukNonAktif?: boolean; cari?: string | null } = {},
): Promise<Customer[]> {
  const db = forTenant(ctx)
  const cari = opts.cari?.trim()
  return db.customer.findMany({
    where: {
      deletedAt: null,
      ...(opts.termasukNonAktif ? {} : { isActive: true }),
      ...(cari
        ? {
            OR: [
              { name: { contains: cari, mode: 'insensitive' } },
              { npwp: { contains: cari, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { name: 'asc' },
  })
}

export async function getCustomer(ctx: TenantContext, id: string): Promise<Customer> {
  const db = forTenant(ctx)
  const customer = await db.customer.findFirst({ where: { id, deletedAt: null } })
  if (!customer) throw notFound('Customer')
  return customer
}

export async function createCustomer(
  ctx: TenantContext,
  body: Record<string, unknown>,
): Promise<Customer> {
  requireRole(ctx, 'ADMIN', 'OPERATOR')
  const db = forTenant(ctx)
  return db.customer.create({ data: { ...bacaInput(body), tenantId: ctx.tenantId } })
}

export async function updateCustomer(
  ctx: TenantContext,
  id: string,
  body: Record<string, unknown>,
): Promise<Customer> {
  requireRole(ctx, 'ADMIN', 'OPERATOR')
  const db = forTenant(ctx)
  const hasil = await db.customer.updateMany({
    where: { id, deletedAt: null },
    data: bacaInput(body),
  })
  if (hasil.count === 0) throw notFound('Customer')
  return getCustomer(ctx, id)
}

/** Hapus = soft delete. Ditolak bila masih dipakai di voyage/invoice (prinsip snapshot, K5). */
export async function removeCustomer(ctx: TenantContext, id: string): Promise<void> {
  requireRole(ctx, 'ADMIN')
  const db = forTenant(ctx)

  const [voyageCount, invoiceCount] = await Promise.all([
    db.voyage.count({ where: { customerId: id } }),
    db.invoice.count({ where: { customerId: id } }),
  ])
  const dipakai = voyageCount + invoiceCount
  if (dipakai > 0) {
    throw conflict(
      `Customer ini dipakai di ${dipakai} voyage/invoice. Nonaktifkan saja (isActive = false) agar riwayat tetap utuh.`,
    )
  }

  const hasil = await db.customer.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date(), isActive: false },
  })
  if (hasil.count === 0) throw notFound('Customer')
}
