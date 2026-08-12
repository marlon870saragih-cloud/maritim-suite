// Mesin status Invoice — MURNI, tanpa impor nilai (pola sama disbursement-status.ts).
//
// Beda penting dari Disbursement: PARTIALLY_PAID/PAID TIDAK pernah jadi tujuan
// transisi manual di sini — keduanya cuma boleh lahir dari recordPayment()
// (invoice-payment.service.ts), yang menghitungnya dari amountPaid vs grandTotal.
// Menaruhnya di tabel ini akan membuka jalan mengubah status "lunas" tanpa
// mengubah angka bayarnya — dua sumber kebenaran yang bisa berbeda.

import type { InvoiceStatus } from '@prisma/client'

/**
 * Tujuan transisi MANUAL (lewat setInvoiceStatus). Apa pun yang tidak tercantum = ditolak.
 *
 * OVERDUE: tak ada cron di repo ini (4b), jadi penandaannya manual — operator
 * klik "Tandai Terlambat" pada invoice yang `dueDate`-nya sudah lewat (dicek di
 * service, bukan di sini — tabel ini murni graf transisi). Lolos dari OVERDUE
 * cuma lewat recordPayment() (→ PARTIALLY_PAID/PAID) atau dibatalkan manual;
 * TIDAK ada jalan balik manual ke ISSUED/SENT supaya status "terlambat" tak
 * bisa disembunyikan tanpa uang benar-benar masuk.
 */
export const TRANSISI_MANUAL: Readonly<Record<InvoiceStatus, readonly InvoiceStatus[]>> = {
  DRAFT: ['ISSUED', 'CANCELLED'],
  ISSUED: ['SENT', 'OVERDUE', 'CANCELLED'],
  SENT: ['OVERDUE', 'CANCELLED'],
  PARTIALLY_PAID: ['OVERDUE', 'CANCELLED'],
  OVERDUE: ['CANCELLED'],
  PAID: [],
  CANCELLED: [],
}

/** Status asal yang boleh ditandai OVERDUE (dicek bersama syarat `dueDate` lewat — lihat setInvoiceStatus). */
export const STATUS_BOLEH_OVERDUE: ReadonlySet<InvoiceStatus> = new Set<InvoiceStatus>([
  'ISSUED',
  'SENT',
  'PARTIALLY_PAID',
])

/** Status yang boleh menerima pembayaran (invoice-payment.service.ts). */
export const STATUS_BOLEH_BAYAR: ReadonlySet<InvoiceStatus> = new Set<InvoiceStatus>([
  'ISSUED',
  'SENT',
  'PARTIALLY_PAID',
  'OVERDUE',
])

/** Status yang membuat FDA sumbernya masih dianggap "punya kewajiban terbuka" (lihat K47 di disbursement.service.ts). */
export const STATUS_INVOICE_AKTIF: readonly InvoiceStatus[] = [
  'DRAFT',
  'ISSUED',
  'SENT',
  'PARTIALLY_PAID',
  'OVERDUE',
]

export const transisiManualTersedia = (dari: InvoiceStatus): readonly InvoiceStatus[] =>
  TRANSISI_MANUAL[dari]

export const bolehTransisiManual = (dari: InvoiceStatus, ke: InvoiceStatus): boolean =>
  TRANSISI_MANUAL[dari].includes(ke)

export const bolehBayar = (status: InvoiceStatus): boolean => STATUS_BOLEH_BAYAR.has(status)

/** Status baru sesudah pembayaran dicatat — satu-satunya tempat PARTIALLY_PAID/PAID lahir. */
export const statusDariPembayaran = (amountPaid: number, grandTotal: number): InvoiceStatus =>
  amountPaid >= grandTotal ? 'PAID' : 'PARTIALLY_PAID'
