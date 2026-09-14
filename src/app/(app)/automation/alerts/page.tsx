import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/shared/PageHeader'
import { getLang, type Lang } from '@/lib/i18n-server'
import { requireTenant } from '@/services/context'
import { bolehAksesAutomation } from '@/services/automation/access'
import { SignalList } from '@/components/automation/SignalList'

export const dynamic = 'force-dynamic'

const PH: Record<Lang, { kicker: string; title: string; desc: string }> = {
  id: {
    kicker: 'Automation Hub',
    title: 'Alerts',
    desc: 'Sinyal pemantauan lintas voyage. Akui atau abaikan setelah ditinjau — peninjauan tidak mengubah data voyage.',
  },
  en: {
    kicker: 'Automation Hub',
    title: 'Alerts',
    desc: 'Monitoring signals across voyages. Acknowledge or dismiss after review — reviewing never changes voyage data.',
  },
}

export default async function AutomationAlertsPage() {
  const t = PH[getLang()]
  const ctx = await requireTenant()
  if (!bolehAksesAutomation(ctx)) notFound()

  return (
    <div className="p-margin-page max-w-[1600px] mx-auto space-y-6">
      <PageHeader kicker={t.kicker} title={t.title} description={t.desc} />
      <section className="bg-card-bg border border-card-border rounded-lg p-4 sm:p-5">
        <SignalList />
      </section>
    </div>
  )
}
