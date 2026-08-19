// Halaman Pemakaian (K183/K184, Fase 8j). TANPA pagar peran — pola sama
// /settings (quota) — hanya menyajikan informasi tentang perusahaan sendiri.

import { PageHeader } from '@/components/shared/PageHeader'
import { getLang, type Lang } from '@/lib/i18n-server'
import { UsageSummary } from '@/components/saas/UsageSummary'

export const dynamic = 'force-dynamic'

const PH: Record<Lang, { kicker: string; title: string; desc: string }> = {
  id: { kicker: 'Pengaturan', title: 'Pemakaian', desc: 'Fitur mana yang tim Anda pakai — bukan penilaian orang.' },
  en: { kicker: 'Settings', title: 'Usage', desc: 'Which features your team uses — not a judgment of people.' },
}

export default function UsagePage() {
  const lang = getLang()
  const t = PH[lang]

  return (
    <div className="p-margin-page max-w-[900px] mx-auto space-y-6">
      <PageHeader kicker={t.kicker} title={t.title} description={t.desc} />
      <UsageSummary />
    </div>
  )
}
