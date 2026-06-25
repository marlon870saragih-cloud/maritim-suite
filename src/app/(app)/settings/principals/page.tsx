import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PageHeader } from '@/components/shared/PageHeader'
import { PrincipalsManager } from '@/components/settings/PrincipalsManager'

export const dynamic = 'force-dynamic'

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
      <PageHeader
        kicker="Master Data"
        title="Principal & kontak"
        description="Daftar principal beserta format dokumen preferensi."
      />
      <PrincipalsManager principals={principals} />
    </div>
  )
}
