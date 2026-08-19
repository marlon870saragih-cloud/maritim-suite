import { PageHeader } from '@/components/shared/PageHeader'
import { getLang, type Lang } from '@/lib/i18n-server'
import { requireTenant } from '@/services/context'
import { getOnboardingStatus } from '@/services/saas/onboarding.service'
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard'

export const dynamic = 'force-dynamic'

const PH: Record<Lang, { kicker: string; title: string; desc: string }> = {
  id: { kicker: 'Mulai Cepat', title: 'Onboarding', desc: 'Kemajuan tersimpan otomatis — kembali kapan saja.' },
  en: { kicker: 'Quick Start', title: 'Onboarding', desc: 'Progress saves automatically — come back anytime.' },
}

export default async function OnboardingPage() {
  const lang = getLang()
  const ctx = await requireTenant()
  const status = await getOnboardingStatus(ctx)

  return (
    <div className="p-margin-page max-w-[900px] mx-auto space-y-6">
      <PageHeader kicker={PH[lang].kicker} title={PH[lang].title} description={PH[lang].desc} />
      <OnboardingWizard initial={status} lang={lang} isAdmin={ctx.role === 'ADMIN'} />
    </div>
  )
}
