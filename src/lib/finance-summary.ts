import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AGING, parseDocDate, overdueDays, bucketFor, type AgingKey } from './receivables'

// Ringkasan keuangan (piutang/invoice) — sumber tunggal untuk ekspor PDF & Excel.
// Semua angka dari data invoice tersimpan (grandTotal, subtotals) — machine-computed.

export type FinRow = {
  docNumber: string
  date: string
  principal: string
  vessel: string
  currency: string
  dpp: number
  vat: number
  total: number
  status: string
  dueLabel: string
  overdueDays: number
  bucket: AgingKey
  outstanding: number
}

export type FinAging = { key: AgingKey; label: string; count: number; value: number }
export type FinPrincipal = { principal: string; count: number; outstanding: number; invoiced: number }

export type FinSummary = {
  rows: FinRow[]
  count: number
  totalInvoiced: number
  totalOutstanding: number
  totalPaid: number
  totalVat: number
  overdueCount: number
  aging: FinAging[]
  byPrincipal: FinPrincipal[]
  currency: string
  generatedAt: string
  company: string
}

type InvStored = { billToName?: string; vesselVoyage?: string; portCall?: string; invoiceDate?: string; dueDate?: string }
type InvSubs = { subtotal?: number; agency?: number; dpp?: number; vat?: number }

export async function getFinanceSummary(): Promise<FinSummary | null> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null

  const [tenant, invoices] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: session.user.tenantId }, select: { companyName: true } }),
    prisma.maritimeDocument.findMany({
      where: { tenantId: session.user.tenantId, docType: 'INVOICE' },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    }),
  ])

  const now = new Date()
  const rows: FinRow[] = invoices.map((d) => {
    const li = (d.lineItems ?? {}) as InvStored
    const sub = (d.subtotals ?? {}) as InvSubs
    const total = d.grandTotal ?? 0
    const paid = d.status === 'PAID'
    const cancelled = d.status === 'CANCELLED'
    const due = parseDocDate(li.dueDate) ?? d.issuedAt
    const od = overdueDays(due, now)
    const outstanding = paid || cancelled ? 0 : total
    const dpp = sub.dpp ?? (sub.subtotal ?? 0) + (sub.agency ?? 0)
    return {
      docNumber: d.docNumber,
      date: li.invoiceDate || '',
      principal: li.billToName || '—',
      vessel: li.vesselVoyage || li.portCall || '—',
      currency: d.currency,
      dpp,
      vat: sub.vat ?? 0,
      total,
      status: d.status,
      dueLabel: li.dueDate || '—',
      overdueDays: outstanding ? od : 0,
      bucket: outstanding ? bucketFor(od) : 'current',
      outstanding,
    }
  })

  const totalInvoiced = rows.reduce((s, r) => s + r.total, 0)
  const totalOutstanding = rows.reduce((s, r) => s + r.outstanding, 0)
  const totalPaid = rows.filter((r) => r.status === 'PAID').reduce((s, r) => s + r.total, 0)
  const totalVat = rows.reduce((s, r) => s + r.vat, 0)
  const overdueCount = rows.filter((r) => r.outstanding > 0 && r.overdueDays > 0).length

  const aging: FinAging[] = AGING.map((b) => {
    const m = rows.filter((r) => r.outstanding > 0 && r.bucket === b.key)
    return { key: b.key, label: b.label, count: m.length, value: m.reduce((s, r) => s + r.outstanding, 0) }
  })

  const pMap = new Map<string, FinPrincipal>()
  for (const r of rows) {
    if (!pMap.has(r.principal)) pMap.set(r.principal, { principal: r.principal, count: 0, outstanding: 0, invoiced: 0 })
    const p = pMap.get(r.principal)!
    p.count += 1
    p.outstanding += r.outstanding
    p.invoiced += r.total
  }
  const byPrincipal = Array.from(pMap.values()).sort((a, b) => b.outstanding - a.outstanding)

  return {
    rows,
    count: rows.length,
    totalInvoiced,
    totalOutstanding,
    totalPaid,
    totalVat,
    overdueCount,
    aging,
    byPrincipal,
    currency: rows[0]?.currency || 'IDR',
    generatedAt: now.toISOString().slice(0, 10),
    company: tenant?.companyName ?? 'Maritime Suite',
  }
}
