import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PageHeader } from '@/components/shared/PageHeader'
import { CompanyProfileForm, type CompanyProfile } from '@/components/settings/CompanyProfileForm'
import { getLang, type Lang } from '@/lib/i18n-server'

export const dynamic = 'force-dynamic'

const PH: Record<Lang, { kicker: string; title: string; desc: string }> = {
  id: { kicker: 'Pengaturan', title: 'Profil perusahaan', desc: 'Data ini muncul di kop dokumen, invoice, dan DA.' },
  en: { kicker: 'Settings', title: 'Company profile', desc: 'This data appears on document letterheads, invoices, and DAs.' },
}

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
    signerName: s(tenant?.signerName),
    signerTitle: s(tenant?.signerTitle),
    defaultAgencyPct: tenant?.defaultAgencyPct != null ? String(tenant.defaultAgencyPct) : '2.5',
    defaultCurrency: s(tenant?.defaultCurrency) || 'IDR',
    logoUrl: tenant?.logoUrl ?? null,
  }

  return (
    <div className="p-margin-page max-w-[900px] mx-auto space-y-8">
      <PageHeader kicker={PH[getLang()].kicker} title={PH[getLang()].title} description={PH[getLang()].desc} />
      <CompanyProfileForm initial={initial} />
    </div>
  )
}
