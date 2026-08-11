// Voyage Workspace — halaman pusat satu pelayaran. Shell server: ambil voyage +
// pilihan master data, sisanya interaktif di VoyageWorkspace (client).

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PageHeader } from '@/components/shared/PageHeader'
import { getLang, type Lang } from '@/lib/i18n-server'
import { requireTenant } from '@/services/context'
import { getVoyage } from '@/services/master/voyage.service'
import { listCustomers } from '@/services/master/customer.service'
import { listPorts } from '@/services/master/port.service'
import { ServiceError } from '@/services/errors'
import { VoyageWorkspace } from '@/components/voyage/VoyageWorkspace'

export const dynamic = 'force-dynamic'

const PH: Record<Lang, { kicker: string; desc: string; back: string }> = {
  id: {
    kicker: 'Voyage Workspace',
    desc: 'Folder digital satu pelayaran — status, particulars, cargo, port call, dan finansial voyage ini.',
    back: 'Kembali ke daftar voyage',
  },
  en: {
    kicker: 'Voyage Workspace',
    desc: 'Digital folder for one call — this voyage’s status, particulars, cargo, port calls, and financials.',
    back: 'Back to voyage list',
  },
}

export default async function VoyageDetailPage({ params }: { params: { id: string } }) {
  const t = PH[getLang()]
  const ctx = await requireTenant()
  const session = await getServerSession(authOptions)
  const tenantId = session!.user.tenantId

  let voyage
  try {
    voyage = await getVoyage(ctx, params.id)
  } catch (e) {
    if (e instanceof ServiceError && e.code === 'NOT_FOUND') notFound()
    throw e
  }

  const [vessels, principals, customers, ports] = await Promise.all([
    prisma.vessel.findMany({ where: { tenantId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.principal.findMany({ where: { tenantId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    listCustomers(ctx),
    listPorts(ctx),
  ])

  return (
    <div className="p-margin-page max-w-[1400px] mx-auto space-y-6">
      <Link
        href="/voyages"
        className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-accent-blue transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> {t.back}
      </Link>

      <PageHeader kicker={t.kicker} title={voyage.voyageNumber} description={t.desc} />

      <VoyageWorkspace
        voyage={voyage}
        counts={voyage._count}
        vessels={vessels}
        principals={principals}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        ports={ports.map((p) => ({ id: p.id, name: p.name }))}
      />
    </div>
  )
}
