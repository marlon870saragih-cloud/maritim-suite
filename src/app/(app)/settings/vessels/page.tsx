import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PageHeader } from '@/components/shared/PageHeader'
import { VesselsManager } from '@/components/settings/VesselsManager'
import { getLang, type Lang } from '@/lib/i18n-server'

export const dynamic = 'force-dynamic'

const PH: Record<Lang, { kicker: string; title: string; desc: string }> = {
  id: { kicker: 'Master Data', title: 'Database kapal', desc: 'Data kapal untuk pengisian otomatis dokumen & port call.' },
  en: { kicker: 'Master Data', title: 'Vessel database', desc: 'Vessel data for auto-filling documents & port calls.' },
}

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
      <PageHeader kicker={PH[getLang()].kicker} title={PH[getLang()].title} description={PH[getLang()].desc} />
      <VesselsManager vessels={vessels} />
    </div>
  )
}
