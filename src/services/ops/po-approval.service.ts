// Approval PurchaseOrder (K120, Fase 7i). `Approval.entityType` sudah
// menyebut kemungkinan nilai ini sejak Fase 0 — penggenapan rencana lama,
// bukan perluasan (K120).
//
// SENGAJA bukan generalisasi approval.service.ts (Disbursement): berkas itu
// dikunci pada `getDisbursement`/`disbursement.updateMany`/`disbursement-status.ts`
// di banyak titik, dan approval-policy.ts bertipe `DisbursementKind`
// eksplisit — bukan seam entity-agnostic yang tinggal disambung. Menggeneralisasinya
// demi PO berarti mempertaruhkan alur Disbursement yang sudah teruji berat,
// untuk kebijakan PO yang jauh lebih sederhana: SATU level, ADMIN saja
// (interim P39, K120) — tak perlu levelBerikutnya()/rondeLengkap() multi-ronde
// sama sekali. Tabel `Approval` (entityType/entityId generik, tanpa FK) tetap
// DIPAKAI ULANG APA ADANYA — cuma jalur tulisnya yang paralel.

import type { TenantContext } from '../context'
import { requireRole } from '../context'
import { forTenant } from '../tenant-db'
import { notFound, conflict, validation } from '../errors'
import { str, pilihan } from '../input'
import { catatAudit } from '../finance/audit'
import { getPurchaseOrder, type PurchaseOrderDetail } from './purchase.service'

/** K120 interim — satu-satunya titik sentuh kebijakan approval PO. Ubah di sini saat P39 terjawab. */
const PERAN_SETUJUI_PO = ['ADMIN'] as const

const KEPUTUSAN = ['APPROVED', 'REJECTED', 'REQUEST_REVISION'] as const
type Keputusan = (typeof KEPUTUSAN)[number]

const STATUS_DARI_KEPUTUSAN: Record<Keputusan, 'APPROVED' | 'CANCELLED' | 'DRAFT'> = {
  APPROVED: 'APPROVED',
  REJECTED: 'CANCELLED',
  REQUEST_REVISION: 'DRAFT',
}

export type StatusApprovalPoUi = {
  approvals: { id: string; userName: string | null; userRole: string | null; decision: string; note: string | null; createdAt: Date }[]
  bolehMemutuskanSekarang: boolean
}

export async function statusApprovalPoUntukUi(ctx: TenantContext, poId: string): Promise<StatusApprovalPoUi> {
  const approvals = await forTenant(ctx).approval.findMany({
    where: { entityType: 'PURCHASE_ORDER', entityId: poId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, userName: true, userRole: true, decision: true, note: true, createdAt: true },
  })
  const po = await getPurchaseOrder(ctx, poId)
  // K42-serupa: ronde SEKARANG dihitung dari approval sesudah PENDING_APPROVAL
  // TERAKHIR kali diajukan — bukan cocok persis (PO tak punya versi bertingkat
  // seperti Disbursement), jadi disederhanakan: status PENDING_APPROVAL DAN
  // belum ada approval APAPUN sejak dokumen ini terakhir diajukan berarti
  // boleh diputuskan. Karena satu level saja (K120), "belum ada keputusan
  // sejak diajukan" cukup dijawab: status masih PENDING_APPROVAL (keputusan
  // APAPUN langsung memindahkannya keluar dari status itu).
  return {
    approvals,
    bolehMemutuskanSekarang: po.status === 'PENDING_APPROVAL' && PERAN_SETUJUI_PO.includes(ctx.role as (typeof PERAN_SETUJUI_PO)[number]),
  }
}

/**
 * Putuskan approval satu PO. SATU level (K120) berarti satu keputusan
 * langsung menuntaskan ronde — tak ada `levelBerikutnya()`.
 */
export async function putuskanApprovalPo(
  ctx: TenantContext,
  poId: string,
  body: Record<string, unknown>,
): Promise<PurchaseOrderDetail> {
  requireRole(ctx, ...PERAN_SETUJUI_PO)

  const po = await getPurchaseOrder(ctx, poId)
  if (po.status !== 'PENDING_APPROVAL') {
    throw conflict(`Dokumen ini tidak sedang menunggu approval (status sekarang: ${po.status}).`)
  }

  const keputusan = pilihan(body.decision, KEPUTUSAN, 'Keputusan')
  const catatan = str(body.note)
  if (keputusan !== 'APPROVED' && !catatan) {
    throw validation('Catatan wajib diisi untuk penolakan/permintaan revisi.')
  }

  const user = await forTenant(ctx).user.findFirst({ where: { id: ctx.userId }, select: { name: true } })

  await forTenant(ctx).approval.create({
    data: {
      tenantId: ctx.tenantId,
      entityType: 'PURCHASE_ORDER',
      entityId: poId,
      level: 1,
      userId: ctx.userId,
      userName: user?.name ?? null,
      userRole: ctx.role,
      decision: keputusan,
      note: catatan,
    },
  })

  const statusBaru = STATUS_DARI_KEPUTUSAN[keputusan]
  const hasil = await forTenant(ctx).purchaseOrder.updateMany({
    where: { id: poId, deletedAt: null },
    data: { status: statusBaru },
  })
  if (hasil.count === 0) throw notFound('Purchase Order/Requisition')

  await catatAudit(ctx, {
    tableName: 'PurchaseOrder',
    recordId: poId,
    action: 'APPROVE',
    oldValue: { status: 'PENDING_APPROVAL' },
    newValue: { status: statusBaru, decision: keputusan },
  })

  return getPurchaseOrder(ctx, poId)
}
