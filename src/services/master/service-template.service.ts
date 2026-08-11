// Pola meniru port.service.ts (⭐ MODUL RUJUKAN) — lihat docs/POLA-SERVICE-LAYER.md.
//
// PENYIMPANGAN SENGAJA: ServiceTemplate tak punya `deletedAt` dan boleh
// hard-delete. Ini cuma "resep" (daftar jasa + qty bawaan) untuk mempercepat
// pengisian EPDA — begitu dipakai, itemnya DISALIN jadi DisbursementItem
// (prinsip snapshot, K5). Tak ada dokumen yang menyimpan templateId, jadi
// menghapus/mengubah template tidak pernah mengubah arti dokumen lama.
//
// items dikelola SEKALIGUS dengan template (bukan endpoint terpisah) —
// updateServiceTemplate mengganti seluruh daftar item (hapus semua, buat ulang)
// karena templat memang kecil (segelintir baris) dan klien selalu mengirim
// daftar lengkap, bukan patch parsial.

import type { ServiceTemplate, ServiceTemplateItem } from '@prisma/client'
import type { TenantContext } from '../context'
import { requireRole } from '../context'
import { forTenant } from '../tenant-db'
import { notFound, validation } from '../errors'
import { bool, int, num, str, wajib } from '../input'
import { getServiceCatalog } from './service-catalog.service'
import { getPort } from './port.service'

export type ServiceTemplateWithItems = ServiceTemplate & {
  items: (ServiceTemplateItem & { service: { id: string; serviceCode: string; serviceName: string } })[]
}

type ItemInput = { serviceId: string; defaultQty: number | null; displayOrder: number }

function bacaItems(raw: unknown): ItemInput[] {
  if (!Array.isArray(raw)) return []
  return raw.map((it, i) => {
    const o = (it ?? {}) as Record<string, unknown>
    return {
      serviceId: wajib(str(o.serviceId), `Jasa pada baris ${i + 1}`),
      defaultQty: num(o.defaultQty),
      displayOrder: int(o.displayOrder) ?? i,
    }
  })
}

function bacaScalar(body: Record<string, unknown>) {
  return {
    name: wajib(str(body.name), 'Nama template'),
    portId: str(body.portId),
    vesselType: str(body.vesselType),
    isDefault: bool(body.isDefault),
    isActive: bool(body.isActive, true),
  }
}

/** Validasi bahwa portId & tiap serviceId item benar milik tenant ini. */
async function pastikanRelasiMilikTenant(
  ctx: TenantContext,
  portId: string | null,
  items: ItemInput[],
): Promise<void> {
  if (portId) await getPort(ctx, portId)
  const idUnik = Array.from(new Set(items.map((i) => i.serviceId)))
  for (const serviceId of idUnik) {
    await getServiceCatalog(ctx, serviceId)
  }
}

const INCLUDE_ITEMS = {
  items: {
    orderBy: { displayOrder: 'asc' as const },
    include: { service: { select: { id: true, serviceCode: true, serviceName: true } } },
  },
}

export async function listServiceTemplates(
  ctx: TenantContext,
  opts: { termasukNonAktif?: boolean; portId?: string | null } = {},
): Promise<ServiceTemplateWithItems[]> {
  const db = forTenant(ctx)
  return db.serviceTemplate.findMany({
    where: {
      ...(opts.termasukNonAktif ? {} : { isActive: true }),
      ...(opts.portId ? { portId: opts.portId } : {}),
    },
    orderBy: { name: 'asc' },
    include: INCLUDE_ITEMS,
  }) as Promise<ServiceTemplateWithItems[]>
}

export async function getServiceTemplate(
  ctx: TenantContext,
  id: string,
): Promise<ServiceTemplateWithItems> {
  const db = forTenant(ctx)
  const tpl = await db.serviceTemplate.findFirst({ where: { id }, include: INCLUDE_ITEMS })
  if (!tpl) throw notFound('Template jasa')
  return tpl as ServiceTemplateWithItems
}

export async function createServiceTemplate(
  ctx: TenantContext,
  body: Record<string, unknown>,
): Promise<ServiceTemplateWithItems> {
  requireRole(ctx, 'ADMIN', 'OPERATOR')
  const db = forTenant(ctx)
  const data = bacaScalar(body)
  const items = bacaItems(body.items)
  if (items.length === 0) throw validation('Template harus punya minimal 1 jasa.')

  await pastikanRelasiMilikTenant(ctx, data.portId, items)

  const tpl = await db.serviceTemplate.create({
    data: {
      ...data,
      tenantId: ctx.tenantId,
      items: { create: items },
    },
  })
  return getServiceTemplate(ctx, tpl.id)
}

export async function updateServiceTemplate(
  ctx: TenantContext,
  id: string,
  body: Record<string, unknown>,
): Promise<ServiceTemplateWithItems> {
  requireRole(ctx, 'ADMIN', 'OPERATOR')
  await getServiceTemplate(ctx, id) // NOT_FOUND kalau tak ada / milik tenant lain
  const db = forTenant(ctx)
  const data = bacaScalar(body)
  const items = bacaItems(body.items)
  if (items.length === 0) throw validation('Template harus punya minimal 1 jasa.')

  await pastikanRelasiMilikTenant(ctx, data.portId, items)

  await db.$transaction([
    db.serviceTemplate.updateMany({ where: { id }, data }),
    db.serviceTemplateItem.deleteMany({ where: { templateId: id } }),
    db.serviceTemplateItem.createMany({
      data: items.map((it) => ({ templateId: id, ...it })),
    }),
  ])
  return getServiceTemplate(ctx, id)
}

/** Hard delete — items ikut terhapus (onDelete: Cascade). Lihat catatan di kepala berkas. */
export async function removeServiceTemplate(ctx: TenantContext, id: string): Promise<void> {
  requireRole(ctx, 'ADMIN')
  const db = forTenant(ctx)
  const hasil = await db.serviceTemplate.deleteMany({ where: { id } })
  if (hasil.count === 0) throw notFound('Template jasa')
}
