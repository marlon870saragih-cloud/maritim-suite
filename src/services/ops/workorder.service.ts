// WorkOrder (K121, K123, Fase 7i) — SPK ke vendor untuk satu pekerjaan.
// Terpisah dari PurchaseOrder (barang, bukan jasa) dan dari Task (ke dalam,
// bukan ke luar) — lihat tabel K121 di dokumen desain.

import type { WorkOrder, WorkOrderStatus } from '@prisma/client'
import type { TenantContext } from '../context'
import { requireRole } from '../context'
import { forTenant } from '../tenant-db'
import { notFound, validation, conflict } from '../errors'
import { str, num, tanggal, wajib, pilihan } from '../input'
import { pastikanLanggananAktif } from '../subscription'
import { bolehTransisiWo, transisiTersediaWo } from './wo-status'
import { nextWorkOrderNumber } from './purchase-number'

/** K123 — buat/terbitkan WO. FINANCE sengaja TIDAK ikut (beda dari PO — WO adalah urusan operasional, bukan finansial). */
const PERAN_KELOLA_WO = ['ADMIN', 'OPERATOR', 'MANAJER_OPERASI'] as const
/** K123 — verifikasi hasil (VERIFIED) TERPISAH: pelaksana bilang selesai, penanggung jawab bilang diterima. */
const PERAN_VERIFIKASI_WO = ['ADMIN', 'MANAJER_OPERASI'] as const

const STATUS: readonly WorkOrderStatus[] = ['DRAFT', 'ISSUED', 'IN_PROGRESS', 'COMPLETED', 'VERIFIED', 'CANCELLED']

export type WorkOrderDetail = WorkOrder & {
  vendor: { id: string; name: string } | null
  voyage: { id: string; voyageNumber: string } | null
  service: { id: string; serviceName: string } | null
}

async function lengkapi(ctx: TenantContext, wo: WorkOrder): Promise<WorkOrderDetail> {
  const [vendor, voyage, service] = await Promise.all([
    forTenant(ctx).vendor.findFirst({ where: { id: wo.vendorId }, select: { id: true, name: true } }),
    forTenant(ctx).voyage.findFirst({ where: { id: wo.voyageId }, select: { id: true, voyageNumber: true } }),
    wo.serviceId
      ? forTenant(ctx).serviceCatalog.findFirst({ where: { id: wo.serviceId }, select: { id: true, serviceName: true } })
      : null,
  ])
  return { ...wo, vendor, voyage, service }
}

export async function listWorkOrders(
  ctx: TenantContext,
  f: { voyageId?: string | null; status?: string | null; vendorId?: string | null } = {},
): Promise<WorkOrderDetail[]> {
  const rows = await forTenant(ctx).workOrder.findMany({
    where: {
      deletedAt: null,
      ...(f.voyageId ? { voyageId: f.voyageId } : {}),
      ...(f.status ? { status: f.status as WorkOrderStatus } : {}),
      ...(f.vendorId ? { vendorId: f.vendorId } : {}),
    },
    orderBy: { createdAt: 'desc' },
  })
  return Promise.all(rows.map((r) => lengkapi(ctx, r)))
}

export async function getWorkOrder(ctx: TenantContext, id: string): Promise<WorkOrderDetail> {
  const row = await forTenant(ctx).workOrder.findFirst({ where: { id, deletedAt: null } })
  if (!row) throw notFound('Work Order')
  return lengkapi(ctx, row)
}

/** WO WAJIB voyageId (K121: "tak ada work order tanpa kunjungan") — beda sengaja dari PO yang boleh tanpa voyage (pengadaan kantor). */
export async function createWorkOrder(ctx: TenantContext, body: Record<string, unknown>): Promise<WorkOrderDetail> {
  requireRole(ctx, ...PERAN_KELOLA_WO)
  await pastikanLanggananAktif(ctx)

  const voyageId = wajib(str(body.voyageId), 'Voyage')
  const v = await forTenant(ctx).voyage.findFirst({ where: { id: voyageId, deletedAt: null }, select: { id: true } })
  if (!v) throw notFound('Voyage')

  const vendorId = wajib(str(body.vendorId), 'Vendor')
  const vendor = await forTenant(ctx).vendor.findFirst({ where: { id: vendorId, deletedAt: null }, select: { id: true } })
  if (!vendor) throw notFound('Vendor')

  const serviceId = str(body.serviceId)
  if (serviceId) {
    const s = await forTenant(ctx).serviceCatalog.findFirst({ where: { id: serviceId }, select: { id: true } })
    if (!s) throw notFound('Jasa')
  }

  const scope = wajib(str(body.scope), 'Uraian pekerjaan')
  const plannedStart = tanggal(body.plannedStart)
  const plannedEnd = tanggal(body.plannedEnd)
  if (plannedStart && plannedEnd && plannedEnd < plannedStart) {
    throw validation('plannedEnd tidak boleh sebelum plannedStart.')
  }

  const woNumber = await nextWorkOrderNumber(ctx)

  const wo = await forTenant(ctx).workOrder.create({
    data: {
      tenantId: ctx.tenantId,
      voyageId,
      vendorId,
      serviceId,
      woNumber,
      scope,
      status: 'DRAFT',
      plannedStart,
      plannedEnd,
      agreedAmount: num(body.agreedAmount),
      currency: (str(body.currency) ?? 'IDR').toUpperCase(),
      notes: str(body.notes),
      createdByUserId: ctx.userId,
    },
  })
  return lengkapi(ctx, wo)
}

type PatchWo = {
  scope?: string
  plannedStart?: Date | null
  plannedEnd?: Date | null
  agreedAmount?: number | null
  notes?: string | null
}

export async function updateWorkOrder(ctx: TenantContext, id: string, body: Record<string, unknown>): Promise<WorkOrderDetail> {
  requireRole(ctx, ...PERAN_KELOLA_WO)
  const wo = await getWorkOrder(ctx, id)
  if (wo.status !== 'DRAFT') throw conflict(`Hanya WO DRAFT yang bisa diubah (status sekarang: ${wo.status}).`)

  const data: PatchWo = {}
  if ('scope' in body) data.scope = wajib(str(body.scope), 'Uraian pekerjaan')
  const plannedStart = 'plannedStart' in body ? tanggal(body.plannedStart) : wo.plannedStart
  const plannedEnd = 'plannedEnd' in body ? tanggal(body.plannedEnd) : wo.plannedEnd
  if (plannedStart && plannedEnd && plannedEnd < plannedStart) {
    throw validation('plannedEnd tidak boleh sebelum plannedStart.')
  }
  if ('plannedStart' in body) data.plannedStart = plannedStart
  if ('plannedEnd' in body) data.plannedEnd = plannedEnd
  if ('agreedAmount' in body) data.agreedAmount = num(body.agreedAmount)
  if ('notes' in body) data.notes = str(body.notes)

  if (Object.keys(data).length > 0) {
    const hasil = await forTenant(ctx).workOrder.updateMany({ where: { id, deletedAt: null }, data })
    if (hasil.count === 0) throw notFound('Work Order')
  }
  return getWorkOrder(ctx, id)
}

export async function removeWorkOrder(ctx: TenantContext, id: string): Promise<void> {
  requireRole(ctx, 'ADMIN')
  const wo = await getWorkOrder(ctx, id)
  if (wo.status !== 'DRAFT') throw conflict(`Hanya WO DRAFT yang bisa dihapus (status sekarang: ${wo.status}).`)
  const hasil = await forTenant(ctx).workOrder.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date(), status: 'CANCELLED' },
  })
  if (hasil.count === 0) throw notFound('Work Order')
}

/**
 * K123 — `VERIFIED` butuh peran terpisah (`PERAN_VERIFIKASI_WO`); status lain
 * (termasuk `COMPLETED`, boleh "oleh pembuat" — siapa pun `PERAN_KELOLA_WO`)
 * lewat `PERAN_KELOLA_WO` biasa. `actualStart`/`actualEnd` (K114 — bahan
 * metrik ketepatan waktu vendor, 7j) diisi OTOMATIS pada transisi yang
 * relevan, bukan field terpisah yang bisa lupa diisi.
 */
export async function setWorkOrderStatus(ctx: TenantContext, id: string, tujuan: unknown): Promise<WorkOrderDetail> {
  const ke = pilihan(tujuan, STATUS, 'Status tujuan')
  const wo = await getWorkOrder(ctx, id)

  if (ke === 'VERIFIED') {
    requireRole(ctx, ...PERAN_VERIFIKASI_WO)
  } else {
    requireRole(ctx, ...PERAN_KELOLA_WO)
  }

  if (!bolehTransisiWo(wo.status, ke)) {
    throw conflict(
      `Transisi ${wo.status} → ${ke} tidak diizinkan. Yang tersedia: ${transisiTersediaWo(wo.status).join(', ') || '(tidak ada — status terminal)'}.`,
    )
  }

  const extra: { actualStart?: Date; actualEnd?: Date } = {}
  if (ke === 'IN_PROGRESS' && !wo.actualStart) extra.actualStart = new Date()
  if (ke === 'COMPLETED') extra.actualEnd = new Date()

  const hasil = await forTenant(ctx).workOrder.updateMany({
    where: { id, deletedAt: null },
    data: { status: ke, ...extra },
  })
  if (hasil.count === 0) throw notFound('Work Order')
  return getWorkOrder(ctx, id)
}

/** K122 — WO `COMPLETED` **atau** `VERIFIED` yang belum pernah dipakai, untuk dialog "Ambil dari PO/WO". */
export async function listWoUntukDiambil(ctx: TenantContext, voyageId: string): Promise<WorkOrderDetail[]> {
  const rows = await forTenant(ctx).workOrder.findMany({
    where: { deletedAt: null, voyageId, status: { in: ['COMPLETED', 'VERIFIED'] } },
    orderBy: { woNumber: 'asc' },
  })
  const dipakai = await forTenant(ctx).disbursementItem.findMany({
    where: { sourceWorkOrderId: { in: rows.map((r) => r.id) } },
    select: { sourceWorkOrderId: true },
  })
  const idDipakai = new Set(dipakai.map((d) => d.sourceWorkOrderId))
  const belumDipakai = rows.filter((r) => !idDipakai.has(r.id))
  return Promise.all(belumDipakai.map((r) => lengkapi(ctx, r)))
}
