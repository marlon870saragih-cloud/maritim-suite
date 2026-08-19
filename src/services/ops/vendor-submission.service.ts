// Sisi STAF dari tagihan vendor (K172, Fase 8g) — jalur INTERNAL biasa
// (TenantContext/forTenant). Menulis submissionnya sendiri ada di
// services/portal/vendor-submission.service.ts (portal-guard, K148); berkas
// ini SENGAJA terpisah karena §13 dokumen desain melarang service internal
// (disbursement-item.service.ts) mengimpor apa pun dari services/portal/ —
// cetakan pembagian yang sama dengan attachment.service.ts vs
// document.service.ts untuk model Attachment.

import type { TenantContext } from '../context'
import { forTenant } from '../tenant-db'
import { notFound, conflict } from '../errors'

/**
 * Cetakan `PortalDb` (portal-db.ts): tipe minimal yang berlaku BAIK untuk
 * `forTenant(ctx)` biasa MAUPUN `tx` di dalam `forTenant(ctx).$transaction(...)`
 * — `tautkanKeDisbursementItem()` dipanggil dari disbursement-item.service.ts
 * di DALAM satu transaksi bersama pembuatan DisbursementItem-nya sendiri
 * (K172/1: kalau tautannya gagal — submission sudah dipakai baris lain —
 * DisbursementItem yang baru dibuat WAJIB ikut batal, bukan tertinggal
 * sebagai baris biaya yatim tanpa penanda asal).
 */
type VendorInvoiceSubmissionDb = { vendorInvoiceSubmission: ReturnType<typeof forTenant>['vendorInvoiceSubmission'] }

export type SumberVendorInvoiceUntukDiambil = {
  id: string
  invoiceNo: string
  invoiceDate: Date
  currency: string
  amount: number
  note: string | null
  vendor: { id: string; name: string } | null
  purchaseOrderId: string | null
  workOrderId: string | null
  /** WorkOrder.agreedAmount bila ditautkan — untuk selisih K172/3. `null` bila tak ditautkan/tak ada nilainya. */
  workOrderAgreedAmount: number | null
}

/**
 * K122/K172/1 — VendorInvoiceSubmission voyage ini yang BELUM dipakai
 * (`linkedDisbursementItemId = null`), untuk tab "Tagihan Vendor" di dialog
 * "Ambil dari PO/WO" builder FDA. Cetakan `listPoUntukDiambil`/
 * `listWoUntukDiambil` (purchase.service.ts/workorder.service.ts, K122) —
 * bedanya `linkedDisbursementItemId` sudah kolom LANGSUNG di model ini,
 * tak perlu query kedua ke DisbursementItem seperti PO/WO.
 */
export async function listSubmissionsUntukDiambil(
  ctx: TenantContext,
  voyageId: string,
): Promise<SumberVendorInvoiceUntukDiambil[]> {
  const rows = await forTenant(ctx).vendorInvoiceSubmission.findMany({
    where: { voyageId, linkedDisbursementItemId: null, status: { not: 'REJECTED' } },
    include: { vendor: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  })

  const woIds = Array.from(new Set(rows.map((r) => r.workOrderId).filter((x): x is string => !!x)))
  const wos = woIds.length
    ? await forTenant(ctx).workOrder.findMany({ where: { id: { in: woIds } }, select: { id: true, agreedAmount: true } })
    : []
  const agreedAmountWo = new Map(wos.map((w) => [w.id, w.agreedAmount]))

  return rows.map((r) => ({
    id: r.id,
    invoiceNo: r.invoiceNo,
    invoiceDate: r.invoiceDate,
    currency: r.currency,
    amount: r.amount,
    note: r.note,
    vendor: r.vendor,
    purchaseOrderId: r.purchaseOrderId,
    workOrderId: r.workOrderId,
    workOrderAgreedAmount: r.workOrderId ? (agreedAmountWo.get(r.workOrderId) ?? null) : null,
  }))
}

/**
 * K172/1 — dipanggil SESUDAH DisbursementItem lahir (addItem(), pemeriksaan
 * inti increment ini): tandai submission ini terpakai. `where` menyertakan
 * `linkedDisbursementItemId: null` supaya satu tagihan vendor tak bisa
 * dipakai dua kali (mis. dua tab browser operator berbeda) — hitungan 0
 * berarti sudah dipakai orang lain lebih dulu, dilaporkan CONFLICT.
 */
export async function tautkanKeDisbursementItem(
  ctx: TenantContext,
  db: VendorInvoiceSubmissionDb,
  submissionId: string,
  disbursementItemId: string,
): Promise<void> {
  const hasil = await db.vendorInvoiceSubmission.updateMany({
    where: { id: submissionId, linkedDisbursementItemId: null },
    data: {
      linkedDisbursementItemId: disbursementItemId,
      status: 'ACCEPTED',
      reviewedByUserId: ctx.userId,
      reviewedAt: new Date(),
    },
  })
  if (hasil.count === 0) {
    const ada = await db.vendorInvoiceSubmission.findFirst({ where: { id: submissionId }, select: { id: true } })
    throw ada ? conflict('Tagihan vendor ini sudah dipakai di baris biaya lain.') : notFound('Tagihan vendor')
  }
}
