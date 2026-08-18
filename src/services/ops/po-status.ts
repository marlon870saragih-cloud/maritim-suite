// Transisi status PurchaseOrder/PurchaseRequisition (K120, Fase 7i) — MURNI
// (K11/K51). `Approval.entityType` sudah menyebut `PO` sejak Fase 0 — ini
// penggenapan rencana yang sudah ada, bukan perluasan.
//
// ⚠️ APPROVED tidak pernah tercapai lewat graf ini (lihat purchase.service.ts
// setPurchaseOrderStatus(), yang menolaknya eksplisit) — sama seperti
// disbursement-status.ts, transisi ke status disetujui HANYA lewat
// po-approval.service.ts, supaya jejak Approval selalu tercatat (Fase 5e/K34).

import type { PurchaseStatus } from '@prisma/client'

export const TRANSISI_PO: Readonly<Record<PurchaseStatus, readonly PurchaseStatus[]>> = {
  DRAFT: ['PENDING_APPROVAL', 'CANCELLED'],
  PENDING_APPROVAL: ['APPROVED', 'DRAFT', 'CANCELLED'],
  APPROVED: ['SENT', 'CANCELLED'],
  SENT: ['PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'],
  PARTIALLY_RECEIVED: ['RECEIVED', 'CLOSED', 'CANCELLED'],
  RECEIVED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
}

export function bolehTransisiPo(dari: PurchaseStatus, ke: PurchaseStatus): boolean {
  return TRANSISI_PO[dari].includes(ke)
}

export function transisiTersediaPo(status: PurchaseStatus): readonly PurchaseStatus[] {
  return TRANSISI_PO[status]
}
