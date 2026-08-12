import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { getLang, type Lang } from '@/lib/i18n-server'
import { requireTenant } from '@/services/context'
import { getInvoiceDetail } from '@/services/finance/invoice.service'
import { ServiceError } from '@/services/errors'
import { InvoiceDetail, type BuilderInvoice } from '@/components/voyage/InvoiceDetail'

export const dynamic = 'force-dynamic'

const PH: Record<Lang, { kicker: string; back: string }> = {
  id: { kicker: 'Invoice', back: 'Kembali ke voyage' },
  en: { kicker: 'Invoice', back: 'Back to voyage' },
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: { id: string; invoiceId: string }
}) {
  const t = PH[getLang()]
  const ctx = await requireTenant()

  let inv
  try {
    inv = await getInvoiceDetail(ctx, params.invoiceId)
  } catch (e) {
    if (e instanceof ServiceError && e.code === 'NOT_FOUND') notFound()
    throw e
  }
  if (inv.voyageId !== params.id) notFound()

  const builderInv: BuilderInvoice = {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    status: inv.status,
    currency: inv.currency,
    subtotal: inv.subtotal,
    taxAmount: inv.taxAmount,
    grandTotal: inv.grandTotal,
    amountPaid: inv.amountPaid,
    outstanding: inv.outstanding,
    dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
    invoiceDate: inv.invoiceDate.toISOString(),
    customerName: inv.customer?.name ?? null,
    transisiTersedia: inv.transisiTersedia,
    bolehBayar: inv.bolehBayar,
    items: inv.items.map((it) => ({
      id: it.id,
      description: it.description,
      quantity: it.quantity,
      unit: it.unit,
      unitPrice: it.unitPrice,
      amount: it.amount,
    })),
    payments: inv.payments.map((p) => ({
      id: p.id,
      paymentDate: p.paymentDate.toISOString(),
      amount: p.amount,
      currency: p.currency,
      exchangeRate: p.exchangeRate,
      bankName: p.bankName,
      referenceNumber: p.referenceNumber,
      notes: p.notes,
    })),
  }

  return (
    <div className="p-margin-page max-w-[1400px] mx-auto space-y-6">
      <Link
        href={`/voyages/${params.id}`}
        className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-accent-blue transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> {t.back}
      </Link>
      <PageHeader kicker={t.kicker} title={inv.invoiceNumber} />
      <InvoiceDetail invoice={builderInv} />
    </div>
  )
}
