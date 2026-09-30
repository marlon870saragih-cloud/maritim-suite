import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/shared/PageHeader'
import { getLang, type Lang } from '@/lib/i18n-server'
import { requireTenant } from '@/services/context'
import { bolehAksesAutomation } from '@/services/automation/access'
import { MonitoringOverview } from '@/components/automation/MonitoringOverview'
import { AisHealthCard } from '@/components/automation/AisHealthCard'

export const dynamic = 'force-dynamic'

// Automation Hub › Active Monitoring (PRD-002 Step 5B). Privat: tenant di
// allowlist id + ADMIN/MANAJER_OPERASI. Selain itu → 404 (tak membocorkan keberadaan).

const PH: Record<Lang, { kicker: string; title: string; desc: string }> = {
  id: {
    kicker: 'Automation Hub',
    title: 'Pemantauan Voyage',
    desc: 'Pemantauan internal atas perubahan voyage di Maritim Suite. Sinyal hanya untuk ditinjau manusia — tidak ada tindakan otomatis.',
  },
  en: {
    kicker: 'Automation Hub',
    title: 'Voyage Monitoring',
    desc: 'Internal monitoring of voyage changes in Maritim Suite. Signals are for human review only — no automatic action.',
  },
}

export default async function AutomationMonitoringPage() {
  const t = PH[getLang()]
  const ctx = await requireTenant()
  if (!bolehAksesAutomation(ctx)) notFound()

  return (
    <div className="p-margin-page max-w-[1600px] mx-auto space-y-6">
      <PageHeader kicker={t.kicker} title={t.title} description={t.desc} />
      <MonitoringOverview />
      {/* PRD-003 Step 4 — kesehatan pengambilan posisi AIS (tanpa kunci/URL penyedia). */}
      <AisHealthCard />
    </div>
  )
}
