// Pola meniru port.service.ts (⭐ MODUL RUJUKAN) — lihat docs/POLA-SERVICE-LAYER.md.
//
// Ini master data "jenis jasa" (Pilotage, Tug, Light Dues, dst), BUKAN mesin
// hitung. calcMethod cuma menandai CARA menghitung; rumus sesungguhnya jalan
// nanti di Fase 3 (EPDA engine) saat item dokumen dibuat dari sini + ServiceRate.

import type { CalcMethod, ServiceCatalog, ServiceCategory } from '@prisma/client'
import type { TenantContext } from '../context'
import { requireRole } from '../context'
import { forTenant } from '../tenant-db'
import { conflict, notFound } from '../errors'
import { bool, int, num, pilihan, str, wajib } from '../input'

const CALC_METHODS: readonly CalcMethod[] = [
  'FLAT', 'PER_UNIT', 'PER_GT', 'PER_GT_PER_CALL', 'PER_GT_PER_DAY',
  'PER_DAY', 'PER_HOUR', 'PER_TON', 'PERCENTAGE', 'TIERED', 'MANUAL',
]
const CATEGORIES: readonly ServiceCategory[] = [
  'PORT_CHARGES', 'MARINE_SERVICES', 'GOVERNMENT', 'HUSBANDRY', 'AGENCY', 'OTHER',
]

export type ServiceCatalogInput = ReturnType<typeof bacaInput>

function bacaInput(body: Record<string, unknown>) {
  return {
    serviceCode: wajib(str(body.serviceCode), 'Kode jasa').toUpperCase(),
    serviceName: wajib(str(body.serviceName), 'Nama jasa'),
    category: pilihan(body.category, CATEGORIES, 'Kategori'),
    calcMethod: pilihan(body.calcMethod, CALC_METHODS, 'Cara hitung', 'MANUAL'),
    defaultUnit: str(body.defaultUnit),
    defaultCurrency: str(body.defaultCurrency)?.toUpperCase() ?? 'IDR',
    taxable: bool(body.taxable),
    taxPct: num(body.taxPct),
    defaultVendorId: str(body.defaultVendorId),
    glAccount: str(body.glAccount),
    usedInEstimate: bool(body.usedInEstimate, true),
    usedInActual: bool(body.usedInActual, true),
    sectionLetter: str(body.sectionLetter)?.toUpperCase() ?? null,
    displayOrder: int(body.displayOrder) ?? 0,
    isActive: bool(body.isActive, true),
  }
}

export async function listServiceCatalog(
  ctx: TenantContext,
  opts: { termasukNonAktif?: boolean; kategori?: ServiceCategory | null; cari?: string | null } = {},
): Promise<ServiceCatalog[]> {
  const db = forTenant(ctx)
  const cari = opts.cari?.trim()
  return db.serviceCatalog.findMany({
    where: {
      deletedAt: null,
      ...(opts.termasukNonAktif ? {} : { isActive: true }),
      ...(opts.kategori ? { category: opts.kategori } : {}),
      ...(cari
        ? {
            OR: [
              { serviceName: { contains: cari, mode: 'insensitive' } },
              { serviceCode: { contains: cari, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ sectionLetter: 'asc' }, { displayOrder: 'asc' }, { serviceName: 'asc' }],
  })
}

export async function getServiceCatalog(ctx: TenantContext, id: string): Promise<ServiceCatalog> {
  const db = forTenant(ctx)
  const svc = await db.serviceCatalog.findFirst({ where: { id, deletedAt: null } })
  if (!svc) throw notFound('Jasa')
  return svc
}

export async function createServiceCatalog(
  ctx: TenantContext,
  body: Record<string, unknown>,
): Promise<ServiceCatalog> {
  requireRole(ctx, 'ADMIN', 'OPERATOR')
  const db = forTenant(ctx)
  const data = bacaInput(body)

  await pastikanKodeBelumDipakai(ctx, data.serviceCode)

  return db.serviceCatalog.create({ data: { ...data, tenantId: ctx.tenantId } })
}

export async function updateServiceCatalog(
  ctx: TenantContext,
  id: string,
  body: Record<string, unknown>,
): Promise<ServiceCatalog> {
  requireRole(ctx, 'ADMIN', 'OPERATOR')
  const db = forTenant(ctx)
  const data = bacaInput(body)

  await pastikanKodeBelumDipakai(ctx, data.serviceCode, id)

  const hasil = await db.serviceCatalog.updateMany({ where: { id, deletedAt: null }, data })
  if (hasil.count === 0) throw notFound('Jasa')
  return getServiceCatalog(ctx, id)
}

/** Hapus = soft delete. Ditolak bila masih dipakai di tarif/template/disbursement (prinsip snapshot, K5). */
export async function removeServiceCatalog(ctx: TenantContext, id: string): Promise<void> {
  requireRole(ctx, 'ADMIN')
  const db = forTenant(ctx)

  const [rateCount, templateCount, disbCount] = await Promise.all([
    db.serviceRate.count({ where: { serviceId: id } }),
    db.serviceTemplateItem.count({ where: { serviceId: id } }),
    db.disbursementItem.count({ where: { serviceId: id } }),
  ])
  const dipakai = rateCount + templateCount + disbCount
  if (dipakai > 0) {
    throw conflict(
      `Jasa ini dipakai di ${dipakai} tarif/template/item disbursement. Nonaktifkan saja (isActive = false) agar riwayat tetap utuh.`,
    )
  }

  const hasil = await db.serviceCatalog.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date(), isActive: false },
  })
  if (hasil.count === 0) throw notFound('Jasa')
}

/** Kode jasa unik per tenant (@@unique([tenantId, serviceCode]) di schema). */
async function pastikanKodeBelumDipakai(
  ctx: TenantContext,
  serviceCode: string,
  kecualiId?: string,
): Promise<void> {
  const db = forTenant(ctx)
  const ada = await db.serviceCatalog.findFirst({
    where: { serviceCode, ...(kecualiId ? { id: { not: kecualiId } } : {}) },
    select: { id: true, serviceName: true, deletedAt: true },
  })
  if (!ada) return
  throw conflict(
    ada.deletedAt
      ? `Kode jasa ${serviceCode} masih dipegang jasa "${ada.serviceName}" yang sudah dihapus. Pulihkan atau pakai kode lain.`
      : `Kode jasa ${serviceCode} sudah dipakai jasa "${ada.serviceName}".`,
  )
}
