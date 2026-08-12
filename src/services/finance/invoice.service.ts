// Invoice — satu gerbang: hanya lahir dari FDA berstatus FINAL (K47,
// docs/FASE-3-EPDA-ENGINE.md §10). Fase 4 mengimpor dari disbursement.service.ts;
// arah sebaliknya DILARANG (K47) — lihat guard di setDisbursementStatus().
//
// Angkanya TIDAK dihitung ulang di sini. Invoice mewarisi baseCurrency &
// amountBase yang sudah di-snapshot FDA (K47) — menghitung ulang FX saat
// penagihan akan menghasilkan angka berbeda dari FDA yang sudah dikirim ke
// principal, sama seperti EPDA→FDA (K29 vs K5).

import type { Invoice, InvoiceItem, InvoicePayment, InvoiceStatus } from '@prisma/client'
import type { TenantContext } from '../context'
import { requireRole } from '../context'
import { conflict, notFound, validation } from '../errors'
import { pilihan, str, tanggal } from '../input'
import { forTenant } from '../tenant-db'
import { pastikanLanggananAktif } from '../subscription'
import { getDisbursement } from './disbursement.service'
import { nextInvoiceNumber } from './invoice-number'
import {
  bolehBayar,
  bolehTransisiManual,
  transisiManualTersedia,
  STATUS_BOLEH_OVERDUE,
  STATUS_INVOICE_AKTIF,
} from './invoice-status'
import { catatAudit, type Jejak } from './audit'

export type InvoiceWithItems = Invoice & {
  items: InvoiceItem[]
  payments: InvoicePayment[]
  customer: { name: string; address: string | null; npwp: string | null; contactPerson: string | null } | null
}

const ITEM_ORDER = [{ displayOrder: 'asc' as const }, { createdAt: 'asc' as const }]
const PAYMENT_ORDER = [{ paymentDate: 'asc' as const }, { createdAt: 'asc' as const }]

const STATUSES: readonly InvoiceStatus[] = [
  'DRAFT', 'ISSUED', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED',
]

const bulat2 = (n: number): number => Math.round(n * 100) / 100

// ------------------------------------------------------------------- pembacaan

/** Pintu masuk WAJIB untuk semua akses item/pembayaran (pola sama getDisbursement, K44 aturan 1). */
export async function getInvoice(ctx: TenantContext, id: string): Promise<InvoiceWithItems> {
  const inv = await forTenant(ctx).invoice.findFirst({
    where: { id, deletedAt: null },
    include: {
      items: { orderBy: ITEM_ORDER },
      payments: { orderBy: PAYMENT_ORDER },
      customer: { select: { name: true, address: true, npwp: true, contactPerson: true } },
    },
  })
  if (!inv) throw notFound('Invoice')
  return inv
}

export type InvoiceDetail = InvoiceWithItems & {
  outstanding: number
  transisiTersedia: readonly InvoiceStatus[]
  bolehBayar: boolean
}

export async function getInvoiceDetail(ctx: TenantContext, id: string): Promise<InvoiceDetail> {
  const inv = await getInvoice(ctx, id)
  return {
    ...inv,
    outstanding: bulat2(inv.grandTotal - inv.amountPaid),
    transisiTersedia: transisiManualTersedia(inv.status),
    bolehBayar: bolehBayar(inv.status),
  }
}

export async function listInvoicesByVoyage(ctx: TenantContext, voyageId: string) {
  return forTenant(ctx).invoice.findMany({
    where: { voyageId, deletedAt: null },
    orderBy: [{ createdAt: 'desc' }],
    include: { customer: { select: { name: true } }, _count: { select: { items: true, payments: true } } },
  })
}

// -------------------------------------------------------------------- tulis

/**
 * Buat Invoice dari satu dokumen FDA (K47). `sourceId` sudah eksplisit dari
 * pemanggil — sama seperti buatFdaDariEpda(), operator memilih lewat baris
 * mana yang diklik, bukan lewat pencarian otomatis di sini.
 */
export async function createInvoiceFromFda(
  ctx: TenantContext,
  sourceId: string,
  body: Record<string, unknown>,
  jejak: Jejak = {},
): Promise<InvoiceDetail> {
  requireRole(ctx, 'ADMIN', 'OPERATOR')
  await pastikanLanggananAktif(ctx)

  const fda = await getDisbursement(ctx, sourceId) // K44 aturan 1 — juga menyaring deletedAt

  if (fda.kind !== 'FDA') {
    throw conflict(`Invoice hanya bisa dibuat dari dokumen FDA (dokumen ini: ${fda.kind}).`)
  }
  if (fda.supersededBy !== null) {
    throw conflict('Dokumen FDA ini sudah disalip versi lebih baru — buat Invoice dari versi terbaru.')
  }
  if (fda.status !== 'FINAL') {
    throw conflict(`FDA harus berstatus FINAL sebelum ditagihkan (status sekarang: ${fda.status}).`)
  }
  if (fda.items.length === 0) {
    throw validation('FDA ini belum punya baris biaya — tidak ada yang bisa ditagihkan.')
  }

  const sudahAda = await forTenant(ctx).invoice.count({
    where: { sourceDisbursementId: fda.id, deletedAt: null, status: { in: [...STATUS_INVOICE_AKTIF] } },
  })
  if (sudahAda > 0) {
    throw conflict('Sudah ada Invoice aktif yang dibuat dari FDA ini. Batalkan dulu bila memang perlu Invoice baru.')
  }

  const voyage = await forTenant(ctx).voyage.findFirst({
    where: { id: fda.voyageId, deletedAt: null },
    select: { customerId: true },
  })
  if (!voyage) throw notFound('Voyage')

  const invoiceNumber = await nextInvoiceNumber(ctx)

  // K47: unitPrice diturunkan (informasional) dalam baseCurrency FDA — `amount`
  // TETAP amountBase apa adanya, sesuai prinsip "nilai server menang" (K11).
  const itemsData = fda.items.map((it) => ({
    description: it.description,
    quantity: it.quantity,
    unit: it.unit,
    unitPrice: it.quantity !== 0 ? bulat2(it.amountBase / it.quantity) : it.amountBase,
    amount: it.amountBase,
    taxable: it.taxable,
    taxAmount: it.taxAmount,
    displayOrder: it.displayOrder,
  }))

  const dibuat = await forTenant(ctx).invoice.create({
    data: {
      tenantId: ctx.tenantId,
      voyageId: fda.voyageId,
      sourceDisbursementId: fda.id,
      invoiceNumber,
      customerId: voyage.customerId,
      currency: fda.baseCurrency,
      subtotal: fda.subtotal,
      taxAmount: fda.taxAmount,
      grandTotal: fda.grandTotal,
      status: 'DRAFT',
      dueDate: tanggal(body.dueDate),
      notes: str(body.notes),
      items: { create: itemsData },
    },
    include: { items: { orderBy: ITEM_ORDER }, payments: { orderBy: PAYMENT_ORDER } },
  })

  await catatAudit(
    ctx,
    {
      tableName: 'Invoice',
      recordId: dibuat.id,
      action: 'CREATE',
      newValue: { invoiceNumber, sourceDisbursementId: fda.id, grandTotal: dibuat.grandTotal },
    },
    jejak,
  )

  return getInvoiceDetail(ctx, dibuat.id)
}

type PatchHeader = { notes?: string | null; dueDate?: Date | null }

/** Header ringan — hanya field yang benar-benar dikirim yang disentuh (pola updateDisbursement). */
export async function updateInvoice(
  ctx: TenantContext,
  id: string,
  body: Record<string, unknown>,
  jejak: Jejak = {},
): Promise<InvoiceDetail> {
  requireRole(ctx, 'ADMIN', 'OPERATOR')
  const inv = await getInvoice(ctx, id)
  if (inv.status !== 'DRAFT') {
    throw conflict(`Invoice ber-status ${inv.status} tidak bisa diubah. Hanya DRAFT yang bisa disunting.`)
  }

  const data: PatchHeader = {}
  const lama: Record<string, unknown> = {}

  if ('notes' in body) {
    data.notes = str(body.notes)
    lama.notes = inv.notes
  }
  if ('dueDate' in body) {
    data.dueDate = tanggal(body.dueDate)
    lama.dueDate = inv.dueDate
  }

  if (Object.keys(data).length === 0) return getInvoiceDetail(ctx, id)

  const hasil = await forTenant(ctx).invoice.updateMany({ where: { id }, data })
  if (hasil.count === 0) throw notFound('Invoice')

  await catatAudit(ctx, { tableName: 'Invoice', recordId: id, action: 'UPDATE', oldValue: lama, newValue: data }, jejak)
  return getInvoiceDetail(ctx, id)
}

/**
 * Transisi status MANUAL (invoice-status.ts). PARTIALLY_PAID/PAID sengaja
 * bukan tujuan yang sah di sini — lihat komentar TRANSISI_MANUAL.
 */
export async function setInvoiceStatus(
  ctx: TenantContext,
  id: string,
  tujuan: unknown,
  jejak: Jejak = {},
): Promise<InvoiceDetail> {
  requireRole(ctx, 'ADMIN', 'OPERATOR')
  const ke = pilihan(tujuan, STATUSES, 'Status tujuan')
  const inv = await getInvoice(ctx, id)

  if (!bolehTransisiManual(inv.status, ke)) {
    throw conflict(
      `Transisi ${inv.status} → ${ke} tidak diizinkan. Yang tersedia: ` +
        `${transisiManualTersedia(inv.status).join(', ') || '(tidak ada — status terminal)'}.`,
    )
  }

  // 4b — OVERDUE tak punya cron (belum ada infrastruktur job terjadwal di repo
  // ini): ditandai manual, tapi tetap dijaga tak asal klik — harus benar-benar
  // sudah lewat jatuh tempo.
  if (ke === 'OVERDUE') {
    if (!STATUS_BOLEH_OVERDUE.has(inv.status)) {
      throw conflict(`Invoice ber-status ${inv.status} tidak relevan ditandai terlambat.`)
    }
    if (!inv.dueDate) throw validation('Invoice ini belum punya tanggal jatuh tempo — isi dulu sebelum ditandai terlambat.')
    if (inv.dueDate.getTime() > Date.now()) {
      throw validation('Tanggal jatuh tempo invoice ini belum lewat.')
    }
  }

  if (ke !== 'CANCELLED') await pastikanLanggananAktif(ctx)

  const hasil = await forTenant(ctx).invoice.updateMany({
    where: { id, deletedAt: null },
    data: { status: ke },
  })
  if (hasil.count === 0) throw notFound('Invoice')

  await catatAudit(
    ctx,
    { tableName: 'Invoice', recordId: id, action: 'UPDATE', oldValue: { status: inv.status }, newValue: { status: ke } },
    jejak,
  )

  return getInvoiceDetail(ctx, id)
}

/** Hapus = soft delete, hanya DRAFT (pola removeDisbursement). */
export async function removeInvoice(ctx: TenantContext, id: string, jejak: Jejak = {}): Promise<void> {
  requireRole(ctx, 'ADMIN')
  const inv = await getInvoice(ctx, id)

  if (inv.status !== 'DRAFT') {
    throw conflict(`Hanya Invoice DRAFT yang bisa dihapus. Invoice ber-status ${inv.status} dibatalkan lewat status CANCELLED.`)
  }

  const hasil = await forTenant(ctx).invoice.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date(), status: 'CANCELLED' },
  })
  if (hasil.count === 0) throw notFound('Invoice')

  await catatAudit(ctx, { tableName: 'Invoice', recordId: id, action: 'DELETE', oldValue: { status: inv.status, invoiceNumber: inv.invoiceNumber } }, jejak)
}
