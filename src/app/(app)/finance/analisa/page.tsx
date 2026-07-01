import { getServerSession } from 'next-auth'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PageHeader } from '@/components/shared/PageHeader'
import { PrintButton } from '@/components/shared/PrintButton'
import { ProfitVariance, type DisbDoc, type InvDoc } from '@/components/finance/ProfitVariance'

export const dynamic = 'force-dynamic'

type Stored = { sections?: { letter: string; title: string; items?: { amount?: number }[] }[]; vesselName?: string; vesselVoyage?: string; agencyPct?: number }
type Subs = { subtotal?: number; agencyAmount?: number; agency?: number; vat?: number }

export default async function AnalisaPage() {
  const session = await getServerSession(authOptions)
  const docs = session?.user
    ? await prisma.maritimeDocument.findMany({
        where: { tenantId: session.user.tenantId, docType: { in: ['EPDA', 'FPDA', 'INVOICE'] } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
    : []

  const mapDisb = (d: (typeof docs)[number]): DisbDoc => {
    const li = (d.lineItems ?? {}) as Stored
    const sub = (d.subtotals ?? {}) as Subs
    const sections = (li.sections ?? []).map((s) => ({
      letter: s.letter,
      title: s.title,
      amount: (s.items ?? []).reduce((a, it) => a + (it.amount || 0), 0),
    }))
    return {
      id: d.id,
      docNumber: d.docNumber,
      vessel: li.vesselName ?? '',
      portCallId: d.portCallId,
      sections,
      subtotal: sub.subtotal ?? 0,
      agency: sub.agencyAmount ?? 0,
      total: d.grandTotal ?? 0,
    }
  }
  const mapInv = (d: (typeof docs)[number]): InvDoc => {
    const li = (d.lineItems ?? {}) as Stored
    const sub = (d.subtotals ?? {}) as Subs
    return {
      id: d.id,
      docNumber: d.docNumber,
      vessel: li.vesselVoyage ?? '',
      portCallId: d.portCallId,
      subtotal: sub.subtotal ?? 0,
      agency: sub.agency ?? 0,
      vat: sub.vat ?? 0,
      total: d.grandTotal ?? 0,
    }
  }

  const epdas = docs.filter((d) => d.docType === 'EPDA').map(mapDisb)
  const fpdas = docs.filter((d) => d.docType === 'FPDA').map(mapDisb)
  const invoices = docs.filter((d) => d.docType === 'INVOICE').map(mapInv)

  return (
    <div className="p-margin-page max-w-[1600px] mx-auto space-y-6 print-report">
      <Link
        href="/finance"
        className="print:hidden inline-flex items-center gap-2 text-text-secondary hover:text-accent-blue text-sm transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Kembali ke Finance
      </Link>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader
          kicker="Analisa Keuangan"
          title="Laba & Variance per Port Call"
          description="Bandingkan estimasi (EPDA) vs aktual (FPDA), dan hitung laba dari Invoice vs biaya FPDA."
        />
        <PrintButton />
      </div>
      <ProfitVariance epdas={epdas} fpdas={fpdas} invoices={invoices} />
    </div>
  )
}
