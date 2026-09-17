import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/shared/PageHeader'
import { getLang, type Lang } from '@/lib/i18n-server'
import { requireTenant } from '@/services/context'
import { bolehAksesIntake } from '@/services/intake/intake-access'
import { IntakeReview } from '@/components/automation/IntakeReview'

export const dynamic = 'force-dynamic'

const PH: Record<Lang, { kicker: string; title: string; desc: string }> = {
  id: {
    kicker: 'Automation Hub · Intake',
    title: 'Tinjau Intake',
    desc: 'Periksa usulan AI, pastikan kecocokan master & duplikat, lalu setujui atau tolak.',
  },
  en: {
    kicker: 'Automation Hub · Intake',
    title: 'Review Intake',
    desc: 'Check the AI proposal, confirm master matches & duplicates, then approve or reject.',
  },
}

export default async function VesselCallIntakeReviewPage({ params }: { params: { id: string } }) {
  const t = PH[getLang()]
  const ctx = await requireTenant()
  // Kepemilikan intake dibuktikan API (withTenant + forTenant) — halaman hanya memeriksa pagar fitur.
  if (!bolehAksesIntake(ctx)) notFound()

  return (
    <div className="p-margin-page max-w-[1600px] mx-auto space-y-6">
      <PageHeader kicker={t.kicker} title={t.title} description={t.desc} />
      <IntakeReview id={params.id} />
    </div>
  )
}
