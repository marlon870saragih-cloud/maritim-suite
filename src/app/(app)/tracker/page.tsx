import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PageHeader } from '@/components/shared/PageHeader'
import { ReceivablesTracker, type InvoiceRow, type PrincipalSummary, type AgingSummary } from '@/components/tracker/ReceivablesTracker'
import { AGING, parseDocDate, overdueDays, bucketFor } from '@/lib/receivables'

export const dynamic = 'force-dynamic'

type InvStored = {
  billToName?: string
  vesselVoyage?: string
  invoiceDate?: string
  dueDate?: string
}

export default async function TrackerPage() {
  const session = await getServerSession(authOptions)
  const invoices = session?.user
    ? await prisma.maritimeDocument.findMany({
        where: { tenantId: session.user.tenantId, docType: 'INVOICE' },
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
    : []

  const now = new Date()
  const rows: InvoiceRow[] = invoices.map((d) => {
    const li = (d.lineItems ?? {}) as InvStored
    const amount = d.grandTotal ?? 0
    const paid = d.status === 'PAID'
    const cancelled = d.status === 'CANCELLED'
    const due = parseDocDate(li.dueDate) ?? d.issuedAt
    const od = overdueDays(due, now)
    const outstanding = paid || cancelled ? 0 : amount
    return {
      id: d.id,
      docNumber: d.docNumber,
      principal: li.billToName || '—',
      vessel: li.vesselVoyage || '—',
      currency: d.currency,
      amount,
      status: d.status,
      dueLabel: li.dueDate || '—',
      overdueDays: outstanding ? od : 0,
      bucket: outstanding ? bucketFor(od) : 'current',
      outstanding,
    }
  })

  // ringkasan
  const totalOutstanding = rows.reduce((s, r) => s + r.outstanding, 0)
  const totalPaid = rows.filter((r) => r.status === 'PAID').reduce((s, r) => s + r.amount, 0)
  const overdueCount = rows.filter((r) => r.outstanding > 0 && r.overdueDays > 0).length

  // per principal (hanya yang punya outstanding)
  const pMap = new Map<string, PrincipalSummary>()
  for (const r of rows) {
    if (!pMap.has(r.principal)) pMap.set(r.principal, { principal: r.principal, count: 0, outstanding: 0 })
    const p = pMap.get(r.principal)!
    p.count += 1
    p.outstanding += r.outstanding
  }
  const byPrincipal = Array.from(pMap.values())
    .filter((p) => p.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding)

  // aging buckets
  const aging: AgingSummary[] = AGING.map((b) => {
    const matched = rows.filter((r) => r.outstanding > 0 && r.bucket === b.key)
    return { key: b.key, label: b.label, count: matched.length, value: matched.reduce((s, r) => s + r.outstanding, 0) }
  })

  return (
    <div className="p-margin-page max-w-[1600px] mx-auto space-y-6">
      <PageHeader
        kicker="DA & Invoice Tracker"
        title="Pelacak tagihan & piutang"
        description="Outstanding per principal, aging 30/60/90 hari, dan status pembayaran invoice keagenan."
      />
      <ReceivablesTracker
        rows={rows}
        byPrincipal={byPrincipal}
        aging={aging}
        totals={{ outstanding: totalOutstanding, paid: totalPaid, overdueCount }}
        currency={rows[0]?.currency ?? 'IDR'}
      />
    </div>
  )
}
