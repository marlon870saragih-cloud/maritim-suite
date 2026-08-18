// Penomoran PurchaseOrder/PurchaseRequisition (K32/K117, Fase 7i). Pola PERSIS
// disbursement-number.ts (K32, Fase 3): mekanisme paralel di service layer,
// bukan lewat extension Prisma yang menomori MaritimeDocument — PurchaseOrder
// bukan MaritimeDocument. `formatDocNumber()`+`monthWindow()` tetap dipakai
// ulang; format nomor cuma satu di seluruh repo.

import type { PurchaseKind } from '@prisma/client'
import { formatDocNumber, monthWindow } from '@/lib/doc-number'
import type { TenantContext } from '../context'
import { forTenant } from '../tenant-db'

function prefixBulan(kind: PurchaseKind, year: number, mm: string): string {
  const contoh = formatDocNumber(kind === 'PR' ? 'PURCHASE_REQUISITION' : 'PURCHASE_ORDER', year, mm, 1)
  return contoh.slice(0, contoh.lastIndexOf('/') + 1)
}

function urutanDari(docNumber: string): number {
  const ekor = docNumber.slice(docNumber.lastIndexOf('/') + 1)
  const n = Number(ekor)
  return Number.isFinite(n) ? n : 0
}

/**
 * PR dan PO punya SERI TERPISAH (beda dari EPDA/FPDA yang sengaja berbagi
 * seri di disbursement-number.ts) — `PurchaseKind` PR≠PO tidak punya alasan
 * K3-serupa untuk berbagi nomor, dan memisahkannya membuat "PR/2026/08/0001"
 * berarti persis PR pertama bulan itu, bukan PR-atau-PO pertama.
 */
export async function nextPurchaseNumber(ctx: TenantContext, kind: PurchaseKind): Promise<string> {
  const { year, mm } = monthWindow()
  const prefix = prefixBulan(kind, year, mm)

  const terakhir = await forTenant(ctx).purchaseOrder.findFirst({
    where: { kind, docNumber: { startsWith: prefix } },
    orderBy: { docNumber: 'desc' },
    select: { docNumber: true },
  })

  return formatDocNumber(
    kind === 'PR' ? 'PURCHASE_REQUISITION' : 'PURCHASE_ORDER',
    year,
    mm,
    (terakhir ? urutanDari(terakhir.docNumber) : 0) + 1,
  )
}

/** Sama prinsipnya, untuk WorkOrder (K121) — seri sendiri, docType `WORK_ORDER` (prefix `WO`). */
export async function nextWorkOrderNumber(ctx: TenantContext): Promise<string> {
  const { year, mm } = monthWindow()
  const contoh = formatDocNumber('WORK_ORDER', year, mm, 1)
  const prefix = contoh.slice(0, contoh.lastIndexOf('/') + 1)

  const terakhir = await forTenant(ctx).workOrder.findFirst({
    where: { woNumber: { startsWith: prefix } },
    orderBy: { woNumber: 'desc' },
    select: { woNumber: true },
  })

  return formatDocNumber('WORK_ORDER', year, mm, (terakhir ? urutanDari(terakhir.woNumber) : 0) + 1)
}
