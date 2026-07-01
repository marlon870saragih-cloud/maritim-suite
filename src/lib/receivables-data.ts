// Bangun ringkasan piutang (deterministik) untuk konteks AI tanya-jawab Tracker.
// SEMUA angka dihitung di sini (mesin), AI hanya membaca & merangkum.

import { prisma } from '@/lib/prisma'
import { AGING, parseDocDate, overdueDays, bucketFor } from '@/lib/receivables'

type InvStored = { billToName?: string; vesselVoyage?: string; invoiceDate?: string; dueDate?: string }

export type ReceivablesSummary = {
  currency: string
  totals: { invoiceCount: number; outstanding: number; paid: number; overdueCount: number }
  byPrincipal: { principal: string; count: number; outstanding: number }[]
  aging: { label: string; count: number; value: number }[]
  overdue: { docNumber: string; principal: string; vessel: string; outstanding: number; overdueDays: number; due: string }[]
}

/** Ringkasan piutang invoice milik tenant (total, per-principal, aging, daftar nunggak). */
export async function buildReceivablesSummary(tenantId: string): Promise<ReceivablesSummary> {
  const invoices = await prisma.maritimeDocument.findMany({
    where: { tenantId, docType: 'INVOICE' },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  const now = new Date()
  const rows = invoices.map((d) => {
    const li = (d.lineItems ?? {}) as InvStored
    const amount = d.grandTotal ?? 0
    const settled = d.status === 'PAID' || d.status === 'CANCELLED'
    const due = parseDocDate(li.dueDate) ?? d.issuedAt
    const od = overdueDays(due, now)
    const outstanding = settled ? 0 : amount
    return {
      docNumber: d.docNumber,
      principal: li.billToName || '—',
      vessel: li.vesselVoyage || '—',
      status: d.status,
      amount,
      outstanding,
      overdueDays: outstanding ? od : 0,
      bucket: outstanding ? bucketFor(od) : ('current' as const),
      due: li.dueDate || '—',
    }
  })

  const totals = {
    invoiceCount: rows.length,
    outstanding: rows.reduce((s, r) => s + r.outstanding, 0),
    paid: rows.filter((r) => r.status === 'PAID').reduce((s, r) => s + r.amount, 0),
    overdueCount: rows.filter((r) => r.outstanding > 0 && r.overdueDays > 0).length,
  }

  const pMap = new Map<string, { principal: string; count: number; outstanding: number }>()
  for (const r of rows) {
    const p = pMap.get(r.principal) ?? { principal: r.principal, count: 0, outstanding: 0 }
    p.count += 1
    p.outstanding += r.outstanding
    pMap.set(r.principal, p)
  }
  const byPrincipal = Array.from(pMap.values())
    .filter((p) => p.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding)

  const aging = AGING.map((b) => {
    const matched = rows.filter((r) => r.outstanding > 0 && r.bucket === b.key)
    return { label: b.label, count: matched.length, value: matched.reduce((s, r) => s + r.outstanding, 0) }
  })

  const overdue = rows
    .filter((r) => r.outstanding > 0)
    .sort((a, b) => b.overdueDays - a.overdueDays)
    .slice(0, 30)
    .map((r) => ({ docNumber: r.docNumber, principal: r.principal, vessel: r.vessel, outstanding: r.outstanding, overdueDays: r.overdueDays, due: r.due }))

  return { currency: invoices[0]?.currency ?? 'IDR', totals, byPrincipal, aging, overdue }
}
