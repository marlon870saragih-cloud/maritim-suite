import { PageHeader } from '@/components/shared/PageHeader'
import { getLang, type Lang } from '@/lib/i18n-server'
import { requireTenant } from '@/services/context'
import { getDashboardData } from '@/services/dashboard.service'
import { DashboardView } from '@/components/dashboard/DashboardView'
import { OnboardingCard } from '@/components/onboarding/OnboardingCard'

export const dynamic = 'force-dynamic'

const PH: Record<Lang, { kicker: string; title: string; desc: string }> = {
  id: { kicker: 'Dashboard', title: 'Ringkasan Operasional', desc: 'Voyage, approval, dan piutang — sekali lihat.' },
  en: { kicker: 'Dashboard', title: 'Operations Overview', desc: 'Voyages, approvals, and receivables — at a glance.' },
}

export default async function DashboardPage() {
  const ctx = await requireTenant()
  const data = await getDashboardData(ctx)

  return (
    <div className="p-margin-page max-w-[1600px] mx-auto space-y-6">
      <PageHeader kicker={PH[getLang()].kicker} title={PH[getLang()].title} description={PH[getLang()].desc} />
      <OnboardingCard lang={getLang()} />
      <DashboardView
        kpi={data.kpi}
        currency={data.currency}
        voyagesByStatus={data.voyagesByStatus}
        upcomingEtas={data.upcomingEtas.map((v) => ({ ...v, eta: v.eta.toISOString() }))}
        pendingApprovalDocs={data.pendingApprovalDocs}
        topOutstanding={data.topOutstanding}
      />
    </div>
  )
}
