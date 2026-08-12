// Reports (Fase 5c) — murni baca, agregasi per-voyage. Angka dijumlah dari
// dokumen yang MASIH AKTIF saja (belum disalip revisi, belum dibatalkan) —
// menjumlah semua versi/revisi akan melipatgandakan nilai yang sama.

import type { TenantContext } from './context'
import { forTenant } from './tenant-db'

export type VoyageRegisterRow = {
  voyageId: string
  voyageNumber: string
  vesselName: string
  principal: string | null
  port: string | null
  status: string
  eta: Date | null
  etd: Date | null
  baseCurrency: string
  epdaTotal: number
  fdaTotal: number
  invoiceTotal: number
  invoicePaid: number
  invoiceOutstanding: number
}

export async function getVoyageRegister(ctx: TenantContext): Promise<VoyageRegisterRow[]> {
  const db = forTenant(ctx)

  const voyages = await db.voyage.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
    include: {
      vessel: { select: { name: true } },
      principal: { select: { name: true } },
      port: { select: { name: true } },
      disbursements: {
        where: { deletedAt: null, supersededBy: null, status: { not: 'CANCELLED' } },
        select: { kind: true, grandTotal: true },
      },
      invoices: {
        where: { deletedAt: null, status: { not: 'CANCELLED' } },
        select: { grandTotal: true, amountPaid: true },
      },
    },
  })

  return voyages.map((v) => {
    const epdaTotal = v.disbursements
      .filter((d) => d.kind === 'EPDA' || d.kind === 'FPDA')
      .reduce((s, d) => s + d.grandTotal, 0)
    const fdaTotal = v.disbursements.filter((d) => d.kind === 'FDA').reduce((s, d) => s + d.grandTotal, 0)
    const invoiceTotal = v.invoices.reduce((s, i) => s + i.grandTotal, 0)
    const invoicePaid = v.invoices.reduce((s, i) => s + i.amountPaid, 0)

    return {
      voyageId: v.id,
      voyageNumber: v.voyageNumber,
      vesselName: v.vessel?.name ?? '—',
      principal: v.principal?.name ?? null,
      port: v.port?.name ?? null,
      status: v.status,
      eta: v.eta,
      etd: v.etd,
      baseCurrency: v.baseCurrency,
      epdaTotal,
      fdaTotal,
      invoiceTotal,
      invoicePaid,
      invoiceOutstanding: invoiceTotal - invoicePaid,
    }
  })
}
