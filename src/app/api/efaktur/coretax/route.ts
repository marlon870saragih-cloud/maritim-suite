import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildCoretaxXml, type EfakturInvoice } from '@/lib/efaktur'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type InvStored = {
  invoiceDate?: string
  billToName?: string
  billToNpwp?: string
  billToAddress?: string
  vesselVoyage?: string
  portCall?: string
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
    const dpp = (sub.subtotal ?? 0) + (sub.agency ?? 0)
    return {
      docNumber: inv.docNumber,
      invoiceDate: li.invoiceDate ?? '',
      buyerName: li.billToName ?? '',
      buyerNpwp: li.billToNpwp ?? '',
      buyerAddress: li.billToAddress ?? '',
      description: `Jasa keagenan kapal${li.vesselVoyage ? ' — ' + li.vesselVoyage : ''}`,
      dpp,
      vat: sub.vat ?? 0,
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
