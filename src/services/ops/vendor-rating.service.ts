// VendorRating (K115, Fase 7j) — penilaian manusia atas satu pekerjaan
// vendor. APPEND-ONLY, seperti Approval: penilaian yang bisa diedit sesudah
// faktanya bukan penilaian, melainkan opini terkini yang menyamar sebagai
// riwayat. TIDAK ADA fungsi update/delete di berkas ini, dan tidak akan ada.

import type { TenantContext } from '../context'
import { requireRole } from '../context'
import { forTenant } from '../tenant-db'
import { notFound, validation } from '../errors'
import { str } from '../input'

/** K116 — MANAJER_OPERASI boleh menilai vendor, TAPI tidak mengubah profil (vendor.service.ts tetap ADMIN/OPERATOR untuk itu). */
const PERAN_NILAI_VENDOR = ['ADMIN', 'OPERATOR', 'MANAJER_OPERASI'] as const

export type VendorRatingRow = {
  id: string
  vendorId: string
  workOrderId: string | null
  voyageId: string | null
  score: number
  note: string | null
  ratedByName: string | null
  createdAt: Date
}

export async function listVendorRatings(ctx: TenantContext, vendorId: string): Promise<VendorRatingRow[]> {
  const vendor = await forTenant(ctx).vendor.findFirst({ where: { id: vendorId, deletedAt: null }, select: { id: true } })
  if (!vendor) throw notFound('Vendor')
  return forTenant(ctx).vendorRating.findMany({
    where: { vendorId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, vendorId: true, workOrderId: true, voyageId: true, score: true, note: true, ratedByName: true, createdAt: true },
  })
}

export async function createVendorRating(ctx: TenantContext, vendorId: string, body: Record<string, unknown>): Promise<VendorRatingRow> {
  requireRole(ctx, ...PERAN_NILAI_VENDOR)

  const vendor = await forTenant(ctx).vendor.findFirst({ where: { id: vendorId, deletedAt: null }, select: { id: true } })
  if (!vendor) throw notFound('Vendor')

  const score = Number(body.score)
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    throw validation('Skor wajib bilangan bulat 1 sampai 5.')
  }

  const workOrderId = str(body.workOrderId)
  if (workOrderId) {
    const wo = await forTenant(ctx).workOrder.findFirst({ where: { id: workOrderId, vendorId, deletedAt: null }, select: { id: true } })
    if (!wo) throw notFound('Work Order')
  }
  const voyageId = str(body.voyageId)
  if (voyageId) {
    const v = await forTenant(ctx).voyage.findFirst({ where: { id: voyageId, deletedAt: null }, select: { id: true } })
    if (!v) throw notFound('Voyage')
  }

  const user = await forTenant(ctx).user.findFirst({ where: { id: ctx.userId }, select: { name: true } })

  const row = await forTenant(ctx).vendorRating.create({
    data: {
      tenantId: ctx.tenantId,
      vendorId,
      workOrderId,
      voyageId,
      score,
      note: str(body.note),
      ratedByUserId: ctx.userId,
      ratedByName: user?.name ?? null,
    },
    select: { id: true, vendorId: true, workOrderId: true, voyageId: true, score: true, note: true, ratedByName: true, createdAt: true },
  })
  return row
}

// SENGAJA tidak ada updateVendorRating()/removeVendorRating() — lihat K115.
