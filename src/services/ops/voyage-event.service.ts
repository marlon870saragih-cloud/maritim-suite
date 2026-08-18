// VoyageEvent (K130, Fase 7g) — fakta bertanda waktu selama satu kunjungan
// kapal. Pola meniru comment.service.ts (CRUD sederhana, tanpa update, soft
// delete). BUKAN entitas polimorfik (K84/K85) — voyageId adalah FK langsung,
// jadi kepemilikan dibuktikan lewat query voyage biasa, bukan owner-guard.ts.

import type { VoyageEvent } from '@prisma/client'
import type { TenantContext } from '../context'
import { requireRole } from '../context'
import { forTenant } from '../tenant-db'
import { notFound, validation } from '../errors'
import { str, tanggal, wajib } from '../input'
import { pastikanLanggananAktif } from '../subscription'
import { KODE_PERISTIWA, type KodePeristiwa } from './event-codes'

/** Sejalan K98/PERAN_KELOLA_TUGAS (task.service.ts) — mencatat peristiwa adalah pekerjaan operasional. */
const PERAN_KELOLA_PERISTIWA = ['ADMIN', 'OPERATOR', 'MANAJER_OPERASI'] as const

export type VoyageEventRow = {
  id: string
  voyageId: string
  portCallId: string | null
  eventCode: string
  description: string | null
  occurredAt: Date
  source: string
  remarks: string | null
  recordedByUserId: string
  recordedByName: string | null
  createdAt: Date
}

async function pastikanVoyageMilikTenant(ctx: TenantContext, voyageId: string): Promise<void> {
  const v = await forTenant(ctx).voyage.findFirst({ where: { id: voyageId, deletedAt: null }, select: { id: true } })
  if (!v) throw notFound('Voyage')
}

/** Daftar peristiwa satu voyage, terurut `occurredAt` MENAIK — urutan kronologi asli, bukan urutan input (bukti K130). */
export async function listVoyageEvents(ctx: TenantContext, voyageId: string): Promise<VoyageEventRow[]> {
  await pastikanVoyageMilikTenant(ctx, voyageId)
  const rows = await forTenant(ctx).voyageEvent.findMany({
    where: { voyageId, deletedAt: null },
    orderBy: { occurredAt: 'asc' },
  })
  return namakanPencatat(ctx, rows)
}

/**
 * `recordedByUserId` disalin jadi nama tampilan lewat satu query `User`
 * tambahan (bukan `include` Prisma langsung) — pola sama `Approval.userName`
 * (disalin, bukan relasi hidup): pencatat bisa nonaktif nanti dan baris lama
 * harus tetap terbaca.
 */
async function namakanPencatat(ctx: TenantContext, rows: VoyageEvent[]): Promise<VoyageEventRow[]> {
  const ids = Array.from(new Set(rows.map((r) => r.recordedByUserId)))
  const users =
    ids.length === 0
      ? []
      : await forTenant(ctx).user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
  const namaById = new Map(users.map((u) => [u.id, u.name]))
  return rows.map((r) => ({
    id: r.id,
    voyageId: r.voyageId,
    portCallId: r.portCallId,
    eventCode: r.eventCode,
    description: r.description,
    occurredAt: r.occurredAt,
    source: r.source,
    remarks: r.remarks,
    recordedByUserId: r.recordedByUserId,
    recordedByName: namaById.get(r.recordedByUserId) ?? null,
    createdAt: r.createdAt,
  }))
}

export async function createVoyageEvent(
  ctx: TenantContext,
  voyageId: string,
  body: Record<string, unknown>,
): Promise<VoyageEventRow> {
  requireRole(ctx, ...PERAN_KELOLA_PERISTIWA)
  await pastikanLanggananAktif(ctx)
  await pastikanVoyageMilikTenant(ctx, voyageId)

  const eventCode = wajib(str(body.eventCode), 'Kode peristiwa')
  if (!KODE_PERISTIWA.includes(eventCode as KodePeristiwa)) {
    throw validation(`Kode peristiwa tidak dikenal. Pilihan: ${KODE_PERISTIWA.join(', ')}.`)
  }
  const occurredAt = tanggal(body.occurredAt)
  if (!occurredAt) throw validation('Waktu kejadian wajib diisi.')

  const portCallId = str(body.portCallId)
  if (portCallId) {
    const pc = await forTenant(ctx).portCall.findFirst({ where: { id: portCallId }, select: { id: true } })
    if (!pc) throw notFound('Port call')
  }

  const row = await forTenant(ctx).voyageEvent.create({
    data: {
      tenantId: ctx.tenantId,
      voyageId,
      portCallId,
      eventCode,
      description: str(body.description),
      occurredAt,
      source: 'MANUAL',
      remarks: str(body.remarks),
      recordedByUserId: ctx.userId,
    },
  })

  const [dinamai] = await namakanPencatat(ctx, [row])
  return dinamai
}

/** Soft delete — hilang dari timeline & prefill SOF, tetap ada di DB (K130/7). */
export async function removeVoyageEvent(ctx: TenantContext, voyageId: string, id: string): Promise<void> {
  requireRole(ctx, ...PERAN_KELOLA_PERISTIWA)
  await pastikanVoyageMilikTenant(ctx, voyageId)

  const hasil = await forTenant(ctx).voyageEvent.updateMany({
    where: { id, voyageId, deletedAt: null },
    data: { deletedAt: new Date() },
  })
  if (hasil.count === 0) throw notFound('Peristiwa')
}
