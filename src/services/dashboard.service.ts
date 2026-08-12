// Dashboard (Fase 5) — murni BACA, agregasi lintas-modul (Voyage, Disbursement,
// Invoice v2, MaritimeDocument lama). Tak pernah menulis, tak pernah jadi sumber
// kebenaran angka — semua angka dibaca apa adanya dari kolom yang sudah dihitung
// modul masing-masing (K11: nilai server menang, di sini "server" = modul sumbernya).
//
// Dua sistem invoice (legacy MaritimeDocument vs Invoice v2) masih hidup
// berdampingan (belum disatukan — lihat catatan tracker/page.tsx), jadi KPI
// "Outstanding"/"Ditagihkan Bulan Ini" menjumlah keduanya, sama seperti Tracker.

import type { DisbursementKind, DisbursementStatus, VoyageStatus } from '@prisma/client'
import type { TenantContext } from './context'
import { forTenant } from './tenant-db'

const KIND_APPROVAL: readonly DisbursementKind[] = ['EPDA', 'FPDA', 'FDA']
const STATUS_PENDING: DisbursementStatus = 'PENDING_REVIEW'
const STATUS_AKTIF_VOYAGE: readonly VoyageStatus[] = [
  'PLANNED', 'CONFIRMED', 'ARRIVED', 'BERTHED', 'WORKING', 'COMPLETED', 'DEPARTED',
]

function monthRange(now: Date): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return { start, end }
}

export type DashboardData = {
  kpi: {
    activeVoyages: number
    voyagesThisMonth: number
    outstandingAR: number
    pendingApprovals: number
    billedThisMonth: number
    overdueInvoices: number
  }
  currency: string
  voyagesByStatus: { status: string; count: number }[]
  upcomingEtas: {
    id: string
    voyageNumber: string
    vesselName: string
    port: string | null
    eta: Date
  }[]
  pendingApprovalDocs: {
    id: string
    docNumber: string
    kind: DisbursementKind
    voyageId: string
    voyageNumber: string
    grandTotal: number
    baseCurrency: string
  }[]
  topOutstanding: {
    docNumber: string
    principal: string
    outstanding: number
    currency: string
    overdueDays: number
    href: string | null
  }[]
}

export async function getDashboardData(ctx: TenantContext): Promise<DashboardData> {
  const db = forTenant(ctx)
  const now = new Date()
  const { start: monthStart, end: monthEnd } = monthRange(now)
  const in7Days = new Date(now.getTime() + 7 * 86_400_000)

  const [
    voyages,
    pendingDisbursements,
    upcomingVoyages,
    v2Invoices,
    legacyDocs,
  ] = await Promise.all([
    db.voyage.findMany({ where: { deletedAt: null }, select: { id: true, status: true, createdAt: true } }),
    db.disbursement.findMany({
      where: { kind: { in: [...KIND_APPROVAL] }, status: STATUS_PENDING, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: { voyage: { select: { voyageNumber: true } } },
    }),
    db.voyage.findMany({
      where: { deletedAt: null, eta: { gte: now, lte: in7Days }, status: { in: [...STATUS_AKTIF_VOYAGE] } },
      orderBy: { eta: 'asc' },
      include: { vessel: { select: { name: true } }, port: { select: { name: true } } },
      take: 10,
    }),
    db.invoice.findMany({
      where: { deletedAt: null },
      include: { customer: { select: { name: true } } },
    }),
    db.maritimeDocument.findMany({ where: { docType: 'INVOICE' }, take: 500 }),
  ])

  // ---- KPI voyage ----
  const activeVoyages = voyages.filter((v) => STATUS_AKTIF_VOYAGE.includes(v.status)).length
  const voyagesThisMonth = voyages.filter((v) => v.createdAt >= monthStart && v.createdAt < monthEnd).length

  const byStatusMap = new Map<string, number>()
  for (const v of voyages) byStatusMap.set(v.status, (byStatusMap.get(v.status) ?? 0) + 1)
  const voyagesByStatus = Array.from(byStatusMap.entries()).map(([status, count]) => ({ status, count }))

  // ---- KPI invoice (v2 + legacy digabung, pola sama tracker/page.tsx) ----
  let outstandingAR = 0
  let billedThisMonth = 0
  let overdueInvoices = 0
  const topOutstanding: DashboardData['topOutstanding'] = []

  for (const inv of v2Invoices) {
    const outstanding = inv.status === 'PAID' || inv.status === 'CANCELLED' ? 0 : inv.grandTotal - inv.amountPaid
    outstandingAR += outstanding
    if (inv.invoiceDate >= monthStart && inv.invoiceDate < monthEnd) billedThisMonth += inv.grandTotal
    const overdueDays = inv.dueDate ? Math.floor((now.getTime() - inv.dueDate.getTime()) / 86_400_000) : 0
    if (outstanding > 0 && overdueDays > 0) {
      overdueInvoices += 1
      topOutstanding.push({
        docNumber: inv.invoiceNumber,
        principal: inv.customer?.name || '—',
        outstanding,
        currency: inv.currency,
        overdueDays,
        href: inv.voyageId ? `/voyages/${inv.voyageId}/invoices/${inv.id}` : null,
      })
    }
  }

  type LegacyLineItems = { billToName?: string; dueDate?: string }
  for (const d of legacyDocs) {
    if (d.status === 'PAID' || d.status === 'CANCELLED') continue
    const amount = d.grandTotal ?? 0
    outstandingAR += amount
    if (d.issuedAt >= monthStart && d.issuedAt < monthEnd) billedThisMonth += amount
    const li = (d.lineItems ?? {}) as LegacyLineItems
    const due = li.dueDate ? new Date(li.dueDate) : d.issuedAt
    const overdueDays = Number.isNaN(due.getTime()) ? 0 : Math.floor((now.getTime() - due.getTime()) / 86_400_000)
    if (overdueDays > 0) {
      overdueInvoices += 1
      topOutstanding.push({
        docNumber: d.docNumber,
        principal: li.billToName || '—',
        outstanding: amount,
        currency: d.currency,
        overdueDays,
        href: null,
      })
    }
  }
  topOutstanding.sort((a, b) => b.outstanding - a.outstanding)

  return {
    kpi: {
      activeVoyages,
      voyagesThisMonth,
      outstandingAR,
      pendingApprovals: pendingDisbursements.length,
      billedThisMonth,
      overdueInvoices,
    },
    currency: v2Invoices[0]?.currency ?? legacyDocs[0]?.currency ?? 'IDR',
    voyagesByStatus,
    upcomingEtas: upcomingVoyages
      .filter((v): v is typeof v & { eta: Date } => v.eta !== null)
      .map((v) => ({
        id: v.id,
        voyageNumber: v.voyageNumber,
        vesselName: v.vessel?.name ?? '—',
        port: v.port?.name ?? null,
        eta: v.eta,
      })),
    pendingApprovalDocs: pendingDisbursements.map((d) => ({
      id: d.id,
      docNumber: d.docNumber,
      kind: d.kind,
      voyageId: d.voyageId,
      voyageNumber: d.voyage?.voyageNumber ?? '—',
      grandTotal: d.grandTotal,
      baseCurrency: d.baseCurrency,
    })),
    topOutstanding: topOutstanding.slice(0, 8),
  }
}
