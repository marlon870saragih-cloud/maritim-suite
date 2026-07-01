import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PageHeader } from '@/components/shared/PageHeader'
import { PrincipalsManager } from '@/components/settings/PrincipalsManager'
import { getLang, type Lang } from '@/lib/i18n-server'

export const dynamic = 'force-dynamic'

const PH: Record<Lang, { kicker: string; title: string; desc: string }> = {
  id: { kicker: 'Master Data', title: 'Principal & kontak', desc: 'Daftar principal beserta format dokumen preferensi.' },
  en: { kicker: 'Master Data', title: 'Principals & contacts', desc: 'Principal list with their preferred document formats.' },
}

export default async function PrincipalsSettingsPage() {
  const session = await getServerSession(authOptions)
  const principals = session?.user
    ? await prisma.principal.findMany({
        where: { tenantId: session.user.tenantId },
        orderBy: { name: 'asc' },
      })
    : []

  return (
    <div className="p-margin-page max-w-[1600px] mx-auto space-y-8">
      <PageHeader kicker={PH[getLang()].kicker} title={PH[getLang()].title} description={PH[getLang()].desc} />
      <PrincipalsManager principals={principals} />
    </div>
  )
}
