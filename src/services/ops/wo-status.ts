// Transisi status WorkOrder (K121, Fase 7i) — MURNI (K11/K51).
//
// VERIFIED dipisah sadar dari COMPLETED (K121/§6): yang bilang "selesai"
// adalah pelaksana (pembuat WO/tim sendiri, K123), yang bilang "hasilnya
// diterima" adalah penanggung jawab (MANAJER_OPERASI). Tak ada jalan balik
// dari VERIFIED — kalau ternyata bermasalah, itu percakapan manusia (catatan/
// WO baru), bukan status yang dibongkar lagi (sejalan K42 untuk Approval).
import type { WorkOrderStatus } from '@prisma/client'

export const TRANSISI_WO: Readonly<Record<WorkOrderStatus, readonly WorkOrderStatus[]>> = {
  DRAFT: ['ISSUED', 'CANCELLED'],
  ISSUED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['VERIFIED'],
  VERIFIED: [],
  CANCELLED: [],
}

export function bolehTransisiWo(dari: WorkOrderStatus, ke: WorkOrderStatus): boolean {
  return TRANSISI_WO[dari].includes(ke)
}

export function transisiTersediaWo(status: WorkOrderStatus): readonly WorkOrderStatus[] {
  return TRANSISI_WO[status]
}
