// Pola meniru port.service.ts (⭐ MODUL RUJUKAN) — lihat docs/POLA-SERVICE-LAYER.md.
// Fase 2: Voyage = hub (1 voyage = folder digital: PortCall, Cargo, Disbursement,
// Invoice, dokumen). Modul ini baru CRUD + penomoran; Voyage Workspace (UI yang
// menyatukan semuanya) dibangun terpisah di atas service ini.

import type {
  Cargo, Customer, Port, PortCall, Principal, Vessel, Voyage, VoyageStatus,
} from '@prisma/client'
import type { TenantContext } from '../context'
import { requireRole } from '../context'
import { forTenant } from '../tenant-db'
import { conflict, notFound } from '../errors'
import { pilihan, str, tanggal, wajib } from '../input'
import { stempelAsal } from '../ai/origin.service'

const STATUSES: readonly VoyageStatus[] = [
  'PLANNED', 'CONFIRMED', 'ARRIVED', 'BERTHED', 'WORKING', 'COMPLETED', 'DEPARTED', 'CLOSED', 'CANCELLED',
]

export type VoyageListRow = Voyage & {
  vessel: Pick<Vessel, 'id' | 'name' | 'imoNumber'> | null
  principal: Pick<Principal, 'id' | 'name'> | null
  customer: Pick<Customer, 'id' | 'name'> | null
  port: Pick<Port, 'id' | 'name' | 'unlocode'> | null
}

export type VoyageDetail = Voyage & {
  vessel: Vessel | null
  principal: Principal | null
  customer: Customer | null
  port: Port | null
  cargoes: Cargo[]
  portCalls: PortCall[]
  /** Cuma jumlah: panel finansial Workspace masih placeholder sampai Fase 3/4. */
  _count: { disbursements: number; invoices: number; documents: number }
}

export type VoyageInput = ReturnType<typeof bacaInput>

function bacaInput(body: Record<string, unknown>) {
  return {
    vesselId: wajib(str(body.vesselId), 'Kapal'),
    principalId: str(body.principalId),
    customerId: str(body.customerId),
    portId: str(body.portId),
    agencyType: str(body.agencyType),
    status: pilihan(body.status, STATUSES, 'Status', 'PLANNED'),
    eta: tanggal(body.eta),
    etb: tanggal(body.etb),
    etc: tanggal(body.etc),
    etd: tanggal(body.etd),
    ata: tanggal(body.ata),
    atb: tanggal(body.atb),
    atd: tanggal(body.atd),
    baseCurrency: str(body.baseCurrency)?.toUpperCase() ?? 'IDR',
    notes: str(body.notes),
  }
}

/** vesselId wajib, principalId/customerId/portId opsional — semua diverifikasi milik tenant ini. */
async function pastikanRelasiMilikTenant(
  ctx: TenantContext,
  data: Pick<VoyageInput, 'vesselId' | 'principalId' | 'customerId' | 'portId'>,
): Promise<void> {
  const db = forTenant(ctx)
  const vessel = await db.vessel.findFirst({ where: { id: data.vesselId }, select: { id: true } })
  if (!vessel) throw notFound('Kapal')
  if (data.principalId) {
    const p = await db.principal.findFirst({ where: { id: data.principalId }, select: { id: true } })
    if (!p) throw notFound('Principal')
  }
  if (data.customerId) {
    const c = await db.customer.findFirst({ where: { id: data.customerId, deletedAt: null }, select: { id: true } })
    if (!c) throw notFound('Customer')
  }
  if (data.portId) {
    const port = await db.port.findFirst({ where: { id: data.portId, deletedAt: null }, select: { id: true } })
    if (!port) throw notFound('Pelabuhan')
  }
}

/**
 * Nomor voyage berikutnya: VYG-YYYY-NNNNNN, berurutan per tenant per tahun
 * (tahun = saat voyage dibuat). Pola sama dengan `prisma/backfill-v2.mjs`.
 * Tanpa unique-constraint/lock — risiko tabrakan diterima sejalan dengan
 * penomoran dokumen (`lib/doc-number.ts`): app dipakai satu operator sekaligus.
 */
async function nextVoyageNumber(ctx: TenantContext): Promise<string> {
  const db = forTenant(ctx)
  const year = new Date().getFullYear()
  const prefix = `VYG-${year}-`
  const terakhir = await db.voyage.findFirst({
    where: { voyageNumber: { startsWith: prefix } },
    orderBy: { voyageNumber: 'desc' },
    select: { voyageNumber: true },
  })
  const seq = terakhir ? Number(terakhir.voyageNumber.slice(prefix.length)) : 0
  return `${prefix}${String(seq + 1).padStart(6, '0')}`
}

export async function listVoyages(
  ctx: TenantContext,
  opts: { status?: VoyageStatus | null; vesselId?: string | null; cari?: string | null } = {},
): Promise<VoyageListRow[]> {
  const db = forTenant(ctx)
  const cari = opts.cari?.trim()
  return db.voyage.findMany({
    where: {
      deletedAt: null,
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.vesselId ? { vesselId: opts.vesselId } : {}),
      ...(cari ? { voyageNumber: { contains: cari, mode: 'insensitive' } } : {}),
    },
    include: {
      vessel: { select: { id: true, name: true, imoNumber: true } },
      principal: { select: { id: true, name: true } },
      customer: { select: { id: true, name: true } },
      port: { select: { id: true, name: true, unlocode: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getVoyage(ctx: TenantContext, id: string): Promise<VoyageDetail> {
  const db = forTenant(ctx)
  const voyage = await db.voyage.findFirst({
    where: { id, deletedAt: null },
    include: {
      vessel: true,
      principal: true,
      customer: true,
      port: true,
      cargoes: { orderBy: { createdAt: 'asc' } },
      portCalls: { orderBy: [{ eta: 'asc' }, { createdAt: 'asc' }] },
      _count: { select: { disbursements: true, invoices: true, documents: true } },
    },
  })
  if (!voyage) throw notFound('Voyage')
  return voyage
}

export async function createVoyage(ctx: TenantContext, body: Record<string, unknown>): Promise<Voyage> {
  requireRole(ctx, 'ADMIN', 'OPERATOR')
  const db = forTenant(ctx)
  const data = bacaInput(body)

  await pastikanRelasiMilikTenant(ctx, data)
  const voyageNumber = await nextVoyageNumber(ctx)

  // Fase 6a / K56 — cap asal ditempel SAAT baris dibuat (snapshot), bukan
  // disimpulkan saat query. Satu baris; artinya seluruhnya di ai/provenance.ts.
  const dataOrigin = await stempelAsal(ctx)

  return db.voyage.create({ data: { ...data, dataOrigin, voyageNumber, tenantId: ctx.tenantId } })
}

export async function updateVoyage(
  ctx: TenantContext,
  id: string,
  body: Record<string, unknown>,
): Promise<Voyage> {
  requireRole(ctx, 'ADMIN', 'OPERATOR')
  const db = forTenant(ctx)
  const data = bacaInput(body)

  await pastikanRelasiMilikTenant(ctx, data)

  // voyageNumber TIDAK ikut diubah — nomor sekali terbit dipertahankan (dipakai
  // di PDF/rujukan lain), sejalan prinsip snapshot K5.
  const hasil = await db.voyage.updateMany({ where: { id, deletedAt: null }, data })
  if (hasil.count === 0) throw notFound('Voyage')
  return getVoyage(ctx, id)
}

/** Hapus = soft delete. Ditolak bila sudah punya aktivitas — pakai status CANCELLED, bukan hapus. */
export async function removeVoyage(ctx: TenantContext, id: string): Promise<void> {
  requireRole(ctx, 'ADMIN')
  const db = forTenant(ctx)

  const [portCallCount, cargoCount, disbCount, invoiceCount, docCount] = await Promise.all([
    db.portCall.count({ where: { voyageId: id } }),
    db.cargo.count({ where: { voyageId: id } }),
    db.disbursement.count({ where: { voyageId: id } }),
    db.invoice.count({ where: { voyageId: id } }),
    db.maritimeDocument.count({ where: { voyageId: id } }),
  ])
  const dipakai = portCallCount + cargoCount + disbCount + invoiceCount + docCount
  if (dipakai > 0) {
    throw conflict(
      `Voyage ini sudah punya ${dipakai} aktivitas (port call/cargo/disbursement/invoice/dokumen). Ubah status ke CANCELLED, jangan dihapus.`,
    )
  }

  const hasil = await db.voyage.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date(), status: 'CANCELLED' },
  })
  if (hasil.count === 0) throw notFound('Voyage')
}

/** Ganti status saja — dipisah dari update() supaya transisi lifecycle tak perlu kirim ulang semua field. */
export async function setVoyageStatus(
  ctx: TenantContext,
  id: string,
  status: string,
): Promise<Voyage> {
  requireRole(ctx, 'ADMIN', 'OPERATOR')
  const nilai = pilihan(status, STATUSES, 'Status')
  const db = forTenant(ctx)
  const hasil = await db.voyage.updateMany({ where: { id, deletedAt: null }, data: { status: nilai } })
  if (hasil.count === 0) throw notFound('Voyage')
  return getVoyage(ctx, id)
}
