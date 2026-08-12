// Pembayaran Invoice (AR) — satu-satunya jalur yang boleh menghasilkan status
// PARTIALLY_PAID/PAID (invoice-status.ts). amountPaid & status ditulis dalam
// satu transaksi bersama baris InvoicePayment supaya tak pernah selisih (K11-serupa:
// nilai server menang, klien tak pernah mengirim amountPaid/status langsung).

import type { InvoicePayment } from '@prisma/client'
import type { TenantContext } from '../context'
import { requireRole } from '../context'
import { conflict, validation } from '../errors'
import { num, str, tanggal } from '../input'
import { forTenant } from '../tenant-db'
import { getInvoice, getInvoiceDetail, type InvoiceDetail } from './invoice.service'
import { bolehBayar, statusDariPembayaran } from './invoice-status'
import { catatAudit, type Jejak } from './audit'
import { notify } from '../notification.service'

const bulat2 = (n: number): number => Math.round(n * 100) / 100

/**
 * Catat satu pembayaran. `amount`/`currency`/`exchangeRate` adalah milik
 * TRANSAKSI pembayaran itu sendiri (mis. pelanggan bayar USD atas invoice
 * IDR) — dikonversi ke `invoice.currency` lewat `exchangeRate` yang diisi
 * operator (tak ada auto-kurs di sini: ini uang yang sudah diterima, bukan
 * estimasi, jadi kursnya adalah kurs transaksi bank yang sesungguhnya).
 */
export async function recordPayment(
  ctx: TenantContext,
  invoiceId: string,
  body: Record<string, unknown>,
  jejak: Jejak = {},
): Promise<InvoiceDetail> {
  requireRole(ctx, 'ADMIN', 'OPERATOR')
  const inv = await getInvoice(ctx, invoiceId) // K44 aturan 1

  if (!bolehBayar(inv.status)) {
    throw conflict(`Invoice ber-status ${inv.status} tidak bisa menerima pembayaran. Terbitkan (ISSUED) dulu.`)
  }

  const amount = num(body.amount)
  if (amount === null || amount <= 0) throw validation('Jumlah bayar harus angka > 0.')

  const exchangeRate = num(body.exchangeRate) ?? 1
  if (exchangeRate <= 0) throw validation('Kurs harus angka > 0.')

  const currency = (str(body.currency) ?? inv.currency).toUpperCase()
  const amountBase = bulat2(amount * exchangeRate)
  const totalBaru = bulat2(inv.amountPaid + amountBase)

  if (totalBaru > inv.grandTotal + 1) {
    // Toleransi Rp1 untuk pembulatan. Lebih dari itu = kemungkinan salah input.
    throw validation(
      `Pembayaran ini (${currency} ${amount}) membuat total bayar (${inv.currency} ${totalBaru}) melebihi grand total (${inv.currency} ${inv.grandTotal}). Periksa jumlah atau kurs.`,
    )
  }

  const statusBaru = statusDariPembayaran(totalBaru, inv.grandTotal)
  const db = forTenant(ctx)

  const dibuat = await db.$transaction(async (tx) => {
    const payment = await tx.invoicePayment.create({
      data: {
        tenantId: ctx.tenantId,
        invoiceId: inv.id,
        paymentDate: tanggal(body.paymentDate) ?? new Date(),
        amount,
        currency,
        exchangeRate,
        bankName: str(body.bankName),
        referenceNumber: str(body.referenceNumber),
        notes: str(body.notes),
      },
    })
    await tx.invoice.updateMany({
      where: { id: inv.id },
      data: { amountPaid: totalBaru, status: statusBaru },
    })
    return payment
  })

  await catatAudit(
    ctx,
    {
      tableName: 'InvoicePayment',
      recordId: dibuat.id,
      action: 'CREATE',
      newValue: { invoiceId: inv.id, amount, currency, exchangeRate, amountBase, statusBaru },
    },
    jejak,
  )

  if (statusBaru === 'PAID') {
    await notify(ctx, {
      type: 'INVOICE_PAID',
      title: `${inv.invoiceNumber} lunas`,
      entityType: 'INVOICE',
      entityId: invoiceId,
      href: inv.voyageId ? `/voyages/${inv.voyageId}/invoices/${invoiceId}` : undefined,
    })
  }

  return getInvoiceDetail(ctx, invoiceId)
}

export type { InvoicePayment }
