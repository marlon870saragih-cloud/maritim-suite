import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PageHeader } from '@/components/shared/PageHeader'
import { VesselsManager } from '@/components/settings/VesselsManager'

export const dynamic = 'force-dynamic'

export default async function VesselsSettingsPage() {
  const session = await getServerSession(authOptions)
  const vessels = session?.user
    ? await prisma.vessel.findMany({
        where: { tenantId: session.user.tenantId },
        orderBy: { name: 'asc' },
      })
    : []

  return (
    <div className="p-margin-page max-w-[1600px] mx-auto space-y-8">
      <PageHeader
        kicker="Master Data"
        title="Database kapal"
        description="Data kapal untuk pengisian otomatis dokumen & port call."
      />
      <VesselsManager vessels={vessels} />
    </div>
  )
}
