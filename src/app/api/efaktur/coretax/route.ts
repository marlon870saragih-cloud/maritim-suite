import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildCoretaxXml, type EfakturInvoice } from '@/lib/efaktur'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type InvLine = { description?: string; qty?: number; unitPrice?: number }
type InvStored = {
  invoiceDate?: string
  billToName?: string
  billToNpwp?: string
  billToAddress?: string
  vesselVoyage?: string
  portCall?: string
  lines?: InvLine[]
  vatPct?: number
}
type InvSubs = { subtotal?: number; agency?: number; vat?: number }

// GET /api/efaktur/coretax → XML impor Faktur Pajak Keluaran untuk Coretax DJP.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  const [tenant, invoices] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: session.user.tenantId }, select: { npwp: true } }),
    prisma.maritimeDocument.findMany({
      where: { tenantId: session.user.tenantId, docType: 'INVOICE' },
      orderBy: { createdAt: 'asc' },
      take: 1000,
    }),
  ])

  const rows: EfakturInvoice[] = invoices.map((inv) => {
    const li = (inv.lineItems ?? {}) as InvStored
    const sub = (inv.subtotals ?? {}) as InvSubs
    const ref = li.vesselVoyage || li.portCall || ''
    // Itemisasi: tiap baris invoice → satu jasa; agency fee (markup) jadi baris tersendiri.
    const goods = (li.lines ?? []).map((l) => ({
      name: `${l.description ?? 'Jasa'}${ref ? ' — ' + ref : ''}`,
      amount: (l.qty ?? 0) * (l.unitPrice ?? 0),
    }))
    if ((sub.agency ?? 0) > 0) {
      goods.push({ name: `Agency handling fee${ref ? ' — ' + ref : ''}`, amount: sub.agency ?? 0 })
    }
    if (goods.length === 0) {
      goods.push({ name: `Jasa keagenan kapal${ref ? ' — ' + ref : ''}`, amount: (sub.subtotal ?? 0) + (sub.agency ?? 0) })
    }
    return {
      docNumber: inv.docNumber,
      invoiceDate: li.invoiceDate ?? '',
      buyerName: li.billToName ?? '',
      buyerNpwp: li.billToNpwp ?? '',
      buyerAddress: li.billToAddress ?? '',
      vatRate: li.vatPct ?? 11,
      goods,
    }
  })

  const xml = buildCoretaxXml({ npwp: tenant?.npwp ?? '' }, rows)
  const today = new Date().toISOString().slice(0, 10)
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="efaktur-coretax-${today}.xml"`,
      'Cache-Control': 'no-store',
    },
  })
}
