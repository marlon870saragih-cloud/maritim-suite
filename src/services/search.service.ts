// Global Search (Fase 5f) — command palette lintas-modul. Navigasi cepat ke
// entitas yang punya halaman detail sungguhan (Voyage/Disbursement/Invoice).
// Master Data (Vessel/Customer/Vendor/Principal) SENGAJA belum diikutkan:
// halaman itu semua cuma daftar tunggal tanpa rute detail per-item
// (settings/vessels dst tak punya [id]), jadi hasil pencariannya cuma bisa
// menuju daftar yang sama — nilai navigasinya rendah dibanding tiga di atas.
// Gampang ditambah nanti begitu halaman detailnya ada.

import type { TenantContext } from './context'
import { forTenant } from './tenant-db'

export type SearchResultType = 'VOYAGE' | 'DISBURSEMENT' | 'INVOICE'

export type SearchResult = {
  type: SearchResultType
  id: string
  label: string
  sublabel: string
  href: string
}

const LIMIT_PER_TYPE = 6
const MIN_QUERY_LEN = 2

export async function globalSearch(ctx: TenantContext, rawQuery: string): Promise<SearchResult[]> {
  const q = rawQuery.trim()
  if (q.length < MIN_QUERY_LEN) return []

  const db = forTenant(ctx)
  const ci = { contains: q, mode: 'insensitive' as const }

  const [voyages, disbursements, invoices] = await Promise.all([
    db.voyage.findMany({
      where: { deletedAt: null, OR: [{ voyageNumber: ci }, { vessel: { name: ci } }] },
      include: { vessel: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: LIMIT_PER_TYPE,
    }),
    db.disbursement.findMany({
      where: { deletedAt: null, docNumber: ci },
      include: { voyage: { select: { voyageNumber: true } } },
      orderBy: { createdAt: 'desc' },
      take: LIMIT_PER_TYPE,
    }),
    db.invoice.findMany({
      where: { deletedAt: null, invoiceNumber: ci },
      include: { voyage: { select: { voyageNumber: true } } },
      orderBy: { createdAt: 'desc' },
      take: LIMIT_PER_TYPE,
    }),
  ])

  const results: SearchResult[] = []

  for (const v of voyages) {
    results.push({ type: 'VOYAGE', id: v.id, label: v.voyageNumber, sublabel: v.vessel?.name ?? '—', href: `/voyages/${v.id}` })
  }
  for (const d of disbursements) {
    results.push({
      type: 'DISBURSEMENT',
      id: d.id,
      label: d.docNumber,
      sublabel: d.voyage?.voyageNumber ?? '—',
      href: `/voyages/${d.voyageId}/disbursements/${d.id}`,
    })
  }
  for (const i of invoices) {
    if (!i.voyageId) continue // K47: Invoice v2 selalu punya voyageId lewat FDA — jaga-jaga saja
    results.push({
      type: 'INVOICE',
      id: i.id,
      label: i.invoiceNumber,
      sublabel: i.voyage?.voyageNumber ?? '—',
      href: `/voyages/${i.voyageId}/invoices/${i.id}`,
    })
  }

  return results
}
