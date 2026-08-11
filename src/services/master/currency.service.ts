// Pola meniru port.service.ts (⭐ MODUL RUJUKAN) — lihat docs/POLA-SERVICE-LAYER.md.
//
// PENYIMPANGAN SENGAJA dari pola Port: model Currency tak punya `deletedAt`
// (lihat schema.prisma). Dokumen lama menyimpan kode mata uang sebagai TEKS
// biasa, bukan relasi FK — jadi menghapus baris Currency master tidak merusak
// riwayat (prinsip snapshot tetap terjaga lewat teks, bukan lewat soft delete
// di sini). removeCurrency() karena itu hard-delete, bukan isi deletedAt.

import type { Currency } from '@prisma/client'
import type { TenantContext } from '../context'
import { requireRole } from '../context'
import { forTenant } from '../tenant-db'
import { conflict, notFound } from '../errors'
import { bool, int, str, wajib } from '../input'

export type CurrencyInput = ReturnType<typeof bacaInput>

function bacaInput(body: Record<string, unknown>) {
  return {
    code: wajib(str(body.code), 'Kode mata uang')!.toUpperCase(),
    name: str(body.name),
    symbol: str(body.symbol),
    decimals: int(body.decimals) ?? 2,
    isActive: bool(body.isActive, true),
  }
}

export async function listCurrencies(
  ctx: TenantContext,
  opts: { termasukNonAktif?: boolean } = {},
): Promise<Currency[]> {
  const db = forTenant(ctx)
  return db.currency.findMany({
    where: opts.termasukNonAktif ? {} : { isActive: true },
    orderBy: { code: 'asc' },
  })
}

export async function getCurrency(ctx: TenantContext, id: string): Promise<Currency> {
  const db = forTenant(ctx)
  const currency = await db.currency.findFirst({ where: { id } })
  if (!currency) throw notFound('Mata uang')
  return currency
}

export async function createCurrency(
  ctx: TenantContext,
  body: Record<string, unknown>,
): Promise<Currency> {
  requireRole(ctx, 'ADMIN', 'OPERATOR')
  const db = forTenant(ctx)
  const data = bacaInput(body)

  await pastikanKodeBelumDipakai(ctx, data.code)

  return db.currency.create({ data: { ...data, tenantId: ctx.tenantId } })
}

export async function updateCurrency(
  ctx: TenantContext,
  id: string,
  body: Record<string, unknown>,
): Promise<Currency> {
  requireRole(ctx, 'ADMIN', 'OPERATOR')
  const db = forTenant(ctx)
  const data = bacaInput(body)

  await pastikanKodeBelumDipakai(ctx, data.code, id)

  const hasil = await db.currency.updateMany({ where: { id }, data })
  if (hasil.count === 0) throw notFound('Mata uang')
  return getCurrency(ctx, id)
}

/** Hard delete — lihat catatan di kepala berkas. Sarankan nonaktifkan bila ragu. */
export async function removeCurrency(ctx: TenantContext, id: string): Promise<void> {
  requireRole(ctx, 'ADMIN')
  const db = forTenant(ctx)
  const hasil = await db.currency.deleteMany({ where: { id } })
  if (hasil.count === 0) throw notFound('Mata uang')
}

/** Kode mata uang unik per tenant (@@unique([tenantId, code]) di schema). */
async function pastikanKodeBelumDipakai(
  ctx: TenantContext,
  code: string,
  kecualiId?: string,
): Promise<void> {
  const db = forTenant(ctx)
  const ada = await db.currency.findFirst({
    where: { code, ...(kecualiId ? { id: { not: kecualiId } } : {}) },
    select: { id: true },
  })
  if (!ada) return
  throw conflict(`Kode mata uang ${code} sudah terdaftar.`)
}
