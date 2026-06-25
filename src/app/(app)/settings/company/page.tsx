import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PageHeader } from '@/components/shared/PageHeader'
import { CompanyProfileForm, type CompanyProfile } from '@/components/settings/CompanyProfileForm'

export const dynamic = 'force-dynamic'

const s = (v: string | null | undefined) => v ?? ''

export default async function CompanySettingsPage() {
  const session = await getServerSession(authOptions)
  const tenant = session?.user
    ? await prisma.tenant.findUnique({ where: { id: session.user.tenantId } })
    : null

  const initial: CompanyProfile = {
    companyName: s(tenant?.companyName),
    companyTagline: s(tenant?.companyTagline),
    companyAddress: s(tenant?.companyAddress),
    companyPhone: s(tenant?.companyPhone),
    companyEmail: s(tenant?.companyEmail),
    npwp: s(tenant?.npwp),
    bankName: s(tenant?.bankName),
    bankAccount: s(tenant?.bankAccount),
    bankHolder: s(tenant?.bankHolder),
    bankSwift: s(tenant?.bankSwift),
    defaultAgencyPct: tenant?.defaultAgencyPct != null ? String(tenant.defaultAgencyPct) : '2.5',
    defaultCurrency: s(tenant?.defaultCurrency) || 'IDR',
    logoUrl: tenant?.logoUrl ?? null,
  }

  return (
    <div className="p-margin-page max-w-[900px] mx-auto space-y-8">
      <PageHeader
        kicker="Pengaturan"
        title="Profil perusahaan"
        description="Data ini muncul di kop dokumen, invoice, dan DA."
      />
      <CompanyProfileForm initial={initial} />
    </div>
  )
}
