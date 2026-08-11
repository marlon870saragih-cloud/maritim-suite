import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PageHeader } from '@/components/shared/PageHeader'
import { VoyagesManager } from '@/components/voyage/VoyagesManager'
import { getLang, type Lang } from '@/lib/i18n-server'
import { requireTenant } from '@/services/context'
import { listVoyages } from '@/services/master/voyage.service'
import { listCustomers } from '@/services/master/customer.service'
import { listPorts } from '@/services/master/port.service'

export const dynamic = 'force-dynamic'

const PH: Record<Lang, { kicker: string; title: string; desc: string }> = {
  id: { kicker: 'Operasional', title: 'Voyage', desc: 'Folder digital 1 pelayaran — port call, cargo, EPDA/FDA, invoice terkumpul di sini.' },
  en: { kicker: 'Operations', title: 'Voyages', desc: 'Digital folder for one call — port call, cargo, EPDA/FDA, invoices all live here.' },
}

export default async function VoyagesPage() {
  const ctx = await requireTenant()
  const session = await getServerSession(authOptions)
  const tenantId = session!.user.tenantId

  const [voyages, vessels, principals, customers, ports] = await Promise.all([
    listVoyages(ctx),
    prisma.vessel.findMany({ where: { tenantId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.principal.findMany({ where: { tenantId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    listCustomers(ctx),
    listPorts(ctx),
  ])

  return (
    <div className="p-margin-page max-w-[1600px] mx-auto space-y-8">
      <PageHeader kicker={PH[getLang()].kicker} title={PH[getLang()].title} description={PH[getLang()].desc} />
      <VoyagesManager
        voyages={voyages}
        vessels={vessels}
        principals={principals}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        ports={ports.map((p) => ({ id: p.id, name: p.name }))}
      />
    </div>
  )
}
