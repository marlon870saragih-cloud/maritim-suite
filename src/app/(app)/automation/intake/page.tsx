import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/shared/PageHeader'
import { getLang, type Lang } from '@/lib/i18n-server'
import { requireTenant } from '@/services/context'
import { bolehAksesIntake } from '@/services/intake/intake-access'
import { IntakeList } from '@/components/automation/IntakeList'

export const dynamic = 'force-dynamic'

// Automation Hub › Vessel Call Intake (PRD-004 Step 3). Privat: flag intake +
// allowlist tenant + ADMIN/MANAJER_OPERASI. Selain itu → 404.

const PH: Record<Lang, { kicker: string; title: string; desc: string }> = {
  id: {
    kicker: 'Automation Hub',
    title: 'Intake Kunjungan Kapal',
    desc: 'Ubah nominasi/appointment menjadi usulan voyage. AI hanya membaca; manusia memeriksa dan menyetujui sebelum voyage dibuat.',
  },
  en: {
    kicker: 'Automation Hub',
    title: 'Vessel Call Intake',
    desc: 'Turn nominations/appointments into proposed voyages. AI only reads; a person reviews and approves before a voyage is created.',
  },
}

export default async function VesselCallIntakePage() {
  const t = PH[getLang()]
  const ctx = await requireTenant()
  if (!bolehAksesIntake(ctx)) notFound()

  return (
    <div className="p-margin-page max-w-[1600px] mx-auto space-y-6">
      <PageHeader kicker={t.kicker} title={t.title} description={t.desc} />
      <IntakeList />
    </div>
  )
}
