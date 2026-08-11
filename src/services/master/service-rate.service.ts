// Pola meniru port.service.ts (⭐ MODUL RUJUKAN) — lihat docs/POLA-SERVICE-LAYER.md.
//
// PENYIMPANGAN SENGAJA dari pola Port: model ServiceRate tak punya `deletedAt`.
// Ini AMAN (beda dengan Port/Customer/Vendor) karena prinsip snapshot (K5):
// saat item EPDA/FDA dibuat, ia MENYALIN rate saat itu ke DisbursementItem —
// dokumen lama tidak pernah membaca ServiceRate lagi setelah dibuat. Karena
// itu update/hard-delete di sini tidak mengubah arti dokumen lama.

import type { ServiceRate } from '@prisma/client'
import type { TenantContext } from '../context'
import { requireRole } from '../context'
import { forTenant } from '../tenant-db'
import { notFound, validation } from '../errors'
import { num, str, tanggal, wajib } from '../input'
import { getServiceCatalog } from './service-catalog.service'
import { getPort } from './port.service'

export type ServiceRateInput = ReturnType<typeof bacaInput>

function bacaInput(body: Record<string, unknown>) {
  const rate = num(body.rate)
  if (rate === null || rate <= 0) throw validation('Rate harus lebih besar dari 0.')
  const gtMin = num(body.gtMin)
  const gtMax = num(body.gtMax)
  if (gtMin !== null && gtMax !== null && gtMin > gtMax) {
    throw validation('GT minimum tidak boleh lebih besar dari GT maksimum.')
  }
  return {
    serviceId: wajib(str(body.serviceId), 'Jasa'),
    portId: str(body.portId),
    vesselType: str(body.vesselType),
    gtMin,
    gtMax,
    rate,
    currency: str(body.currency)?.toUpperCase() ?? 'IDR',
    minCharge: num(body.minCharge),
    effectiveFrom: tanggal(body.effectiveFrom) ?? new Date(),
    effectiveTo: tanggal(body.effectiveTo),
  }
}

/** serviceId/portId wajib memang milik tenant ini — getServiceCatalog/getPort sudah NOT_FOUND kalau bukan. */
async function pastikanRelasiMilikTenant(
  ctx: TenantContext,
  data: Pick<ServiceRateInput, 'serviceId' | 'portId'>,
): Promise<void> {
  await getServiceCatalog(ctx, data.serviceId)
  if (data.portId) await getPort(ctx, data.portId)
}

export async function listServiceRates(
  ctx: TenantContext,
  opts: { serviceId?: string | null; portId?: string | null } = {},
): Promise<ServiceRate[]> {
  const db = forTenant(ctx)
  return db.serviceRate.findMany({
    where: {
      ...(opts.serviceId ? { serviceId: opts.serviceId } : {}),
      ...(opts.portId ? { portId: opts.portId } : {}),
    },
    orderBy: [{ serviceId: 'asc' }, { effectiveFrom: 'desc' }],
  })
}

export async function getServiceRate(ctx: TenantContext, id: string): Promise<ServiceRate> {
  const db = forTenant(ctx)
  const rate = await db.serviceRate.findFirst({ where: { id } })
  if (!rate) throw notFound('Tarif')
  return rate
}

export async function createServiceRate(
  ctx: TenantContext,
  body: Record<string, unknown>,
): Promise<ServiceRate> {
  requireRole(ctx, 'ADMIN', 'OPERATOR')
  const db = forTenant(ctx)
  const data = bacaInput(body)

  await pastikanRelasiMilikTenant(ctx, data)

  return db.serviceRate.create({ data: { ...data, tenantId: ctx.tenantId } })
}

export async function updateServiceRate(
  ctx: TenantContext,
  id: string,
  body: Record<string, unknown>,
): Promise<ServiceRate> {
  requireRole(ctx, 'ADMIN', 'OPERATOR')
  const db = forTenant(ctx)
  const data = bacaInput(body)

  await pastikanRelasiMilikTenant(ctx, data)

  const hasil = await db.serviceRate.updateMany({ where: { id }, data })
  if (hasil.count === 0) throw notFound('Tarif')
  return getServiceRate(ctx, id)
}

/** Hard delete — lihat catatan di kepala berkas (prinsip snapshot menjaga dokumen lama). */
export async function removeServiceRate(ctx: TenantContext, id: string): Promise<void> {
  requireRole(ctx, 'ADMIN')
  const db = forTenant(ctx)
  const hasil = await db.serviceRate.deleteMany({ where: { id } })
  if (hasil.count === 0) throw notFound('Tarif')
}
