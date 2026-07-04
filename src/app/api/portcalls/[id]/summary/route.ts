import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { portCallToParticulars } from '@/lib/portcall-particulars'
import { toLinkedDoc } from '@/lib/documents'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/portcalls/:id/summary → partikular + daftar dokumen ter-link + rekap finansial.
// Sumber data Port Call Summary (mengandalkan tautan portCallId).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  const pc = await prisma.portCall.findFirst({
    where: { id: params.id, tenantId: session.user.tenantId },
    include: {
      vessel: { select: { name: true, imoNumber: true, flag: true, vesselType: true, callSign: true, gt: true, nrt: true, loa: true, maxDraft: true } },
      principal: { select: { name: true, address: true, npwp: true, contactPerson: true } },
    },
  })
  if (!pc) return new Response('Not found', { status: 404 })

  const docs = await prisma.maritimeDocument.findMany({
    where: {
      tenantId: session.user.tenantId,
      portCallId: params.id,
      docType: { not: 'PORT_CALL_SUMMARY' }, // rekap tak mendaftarkan dirinya sendiri
    },
    select: { id: true, docType: true, docNumber: true, status: true, grandTotal: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })

  // Rekap finansial: total terbaru per jenis dokumen disbursement/penagihan.
  const latestTotal = (type: string) => {
    const d = docs.find((x) => x.docType === type)
    return d?.grandTotal ?? 0
  }
  const finance = {
    epda: latestTotal('EPDA'),
    fpda: latestTotal('FPDA'),
    invoice: latestTotal('INVOICE'),
  }

  return Response.json({
    particulars: portCallToParticulars(pc),
    documents: docs.map((d) => {
      const l = toLinkedDoc(d)
      return { label: l.label, docNumber: d.docNumber, status: d.status, docType: d.docType }
    }),
    finance,
  })
}
