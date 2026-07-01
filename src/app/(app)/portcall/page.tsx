import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PageHeader } from '@/components/shared/PageHeader'
import { PortCallManager, type PortCallRow } from '@/components/portcall/PortCallManager'
import { toLinkedDoc } from '@/lib/documents'
import { getLang, type Lang } from '@/lib/i18n-server'

export const dynamic = 'force-dynamic'

const PH: Record<Lang, { kicker: string; title: string; desc: string }> = {
  id: { kicker: 'Manajemen Port Call', title: 'Jadwal & status kunjungan kapal', desc: 'Pusat data kunjungan — pilih kapal & principal sekali, dipakai otomatis di semua dokumen.' },
  en: { kicker: 'Port Call Management', title: 'Vessel call schedule & status', desc: 'Central call data — pick the vessel & principal once, auto-used across all documents.' },
}

export default async function PortCallPage() {
  const t = PH[getLang()]
  const session = await getServerSession(authOptions)
  const tenantId = session?.user?.tenantId

  const [portCalls, vessels, principals] = tenantId
    ? await Promise.all([
        prisma.portCall.findMany({
          where: { tenantId },
          include: {
            vessel: { select: { id: true, name: true } },
            principal: { select: { id: true, name: true } },
            documents: {
              select: { id: true, docType: true, docNumber: true, status: true },
              orderBy: { createdAt: 'desc' },
            },
          },
          orderBy: [{ eta: 'desc' }, { createdAt: 'desc' }],
        }),
        prisma.vessel.findMany({
          where: { tenantId },
          select: {
            id: true, name: true, imoNumber: true, flag: true, vesselType: true,
            gt: true, nrt: true, loa: true, maxDraft: true,
          },
          orderBy: { name: 'asc' },
        }),
        prisma.principal.findMany({
          where: { tenantId },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
      ])
    : [[], [], []]

  return (
    <div className="p-margin-page max-w-[1600px] mx-auto space-y-8">
      <PageHeader kicker={t.kicker} title={t.title} description={t.desc} />
      <PortCallManager
        portCalls={portCalls.map((pc) => ({
          ...pc,
          documents: pc.documents.map(toLinkedDoc),
        })) as unknown as PortCallRow[]}
        vessels={vessels}
        principals={principals}
      />
    </div>
  )
}
