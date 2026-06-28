import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { SoaForm, type SoaParty } from '@/components/finance/SoaForm'

export const dynamic = 'force-dynamic'

type InvStored = {
  billToName?: string
  billToAddress?: string
  billToNpwp?: string
  billToAttn?: string
  invoiceDate?: string
  vesselVoyage?: string
  portCall?: string
}

export default async function NewSoaPage() {
  const session = await getServerSession(authOptions)
  const invoices = session?.user
    ? await prisma.maritimeDocument.findMany({
        where: { tenantId: session.user.tenantId, docType: 'INVOICE' },
        orderBy: { createdAt: 'asc' },
        take: 200,
      })
    : []

  // Kelompokkan invoice per principal (billToName) → tiap pihak punya baris tagihan.
  const map = new Map<string, SoaParty>()
  for (const inv of invoices) {
    const li = (inv.lineItems ?? {}) as InvStored
    const name = li.billToName || 'Tanpa nama'
    if (!map.has(name)) {
      map.set(name, {
        name,
        address: li.billToAddress ?? '',
        npwp: li.billToNpwp ?? '',
        attn: li.billToAttn ?? '',
        rows: [],
      })
    }
    map.get(name)!.rows.push({
      date: li.invoiceDate ?? '',
      docNumber: inv.docNumber,
      ref: li.vesselVoyage || li.portCall || '',
      amount: inv.grandTotal ?? 0,
      paid: inv.status === 'PAID' ? inv.grandTotal ?? 0 : 0,
    })
  }

  return <SoaForm parties={Array.from(map.values())} />
}
