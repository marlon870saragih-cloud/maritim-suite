// Kalender (Fase 7h, K134) — shell server tipis: cuma sesi, sisanya
// interaktif (fetch per-bulan) di CalendarView.tsx (client).

import { PageHeader } from '@/components/shared/PageHeader'
import { getLang, type Lang } from '@/lib/i18n-server'
import { requireTenant } from '@/services/context'
import { CalendarView } from '@/components/ops/CalendarView'

export const dynamic = 'force-dynamic'

const PH: Record<Lang, { kicker: string; title: string; desc: string }> = {
  id: {
    kicker: 'Operasional', title: 'Kalender',
    desc: 'Kedatangan/keberangkatan kapal, tenggat tugas, jatuh tempo invoice, dan dokumen kedaluwarsa — satu tampilan.',
  },
  en: {
    kicker: 'Operations', title: 'Calendar',
    desc: 'Vessel arrivals/departures, task due dates, invoice due dates, and expiring documents — one view.',
  },
}

export default async function CalendarPage() {
  await requireTenant()
  return (
    <div className="p-margin-page max-w-[1400px] mx-auto space-y-6">
      <PageHeader kicker={PH[getLang()].kicker} title={PH[getLang()].title} description={PH[getLang()].desc} />
      <CalendarView />
    </div>
  )
}
