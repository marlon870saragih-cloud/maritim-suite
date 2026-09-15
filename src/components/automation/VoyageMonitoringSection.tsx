'use client'

// Timeline pemantauan satu voyage (PRD-002 Step 5B). SENGAJA terpisah dari tab
// Timeline/Peristiwa voyage: yang di sini SINYAL OTOMASI, bukan fakta SOF.

import { Radar } from 'lucide-react'
import { useT, type Lang } from '@/lib/i18n'
import { SignalList } from './SignalList'
import { VoyageAisPosition } from './VoyageAisPosition'

const STR: Record<Lang, { title: string; desc: string }> = {
  id: {
    title: 'Sinyal Automation Hub',
    desc: 'Sinyal otomasi internal — BUKAN peristiwa operasional/SOF. Tidak mengubah data voyage dan tidak mengirim kabar ke luar.',
  },
  en: {
    title: 'Automation Hub signals',
    desc: 'Internal automation signals — NOT operational/SOF events. They never change voyage data or contact anyone.',
  },
}

export function VoyageMonitoringSection({ voyageId }: { voyageId: string }) {
  const t = useT(STR)
  return (
    <section className="bg-card-bg border border-dashed border-accent-blue/40 rounded-lg p-4 sm:p-5 space-y-4" aria-labelledby="ah-voyage-signals">
      <div>
        <h2 id="ah-voyage-signals" className="flex items-center gap-2 font-display text-lg text-text-primary">
          <Radar className="w-4 h-4 text-accent-blue" aria-hidden="true" /> {t.title}
        </h2>
        <p className="mt-1 text-xs text-text-secondary">{t.desc}</p>
      </div>
      <VoyageAisPosition voyageId={voyageId} />
      <SignalList voyageId={voyageId} showVoyage={false} />
    </section>
  )
}
