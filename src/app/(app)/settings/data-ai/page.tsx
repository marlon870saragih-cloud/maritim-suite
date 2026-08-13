// Settings › Data & AI (Fase 6a). Pola halaman meniru settings/audit/page.tsx:
// server component memanggil service langsung, komponen klien hanya menampilkan.

import { PageHeader } from '@/components/shared/PageHeader'
import { getLang, type Lang } from '@/lib/i18n-server'
import { requireTenant } from '@/services/context'
import { ringkasanProvenance } from '@/services/ai/origin.service'
import { DataOriginPanel } from '@/components/settings/DataOriginPanel'

export const dynamic = 'force-dynamic'

const PH: Record<Lang, { kicker: string; title: string; desc: string }> = {
  id: {
    kicker: 'Pengaturan',
    title: 'Data & AI',
    desc: 'Asal data yang tersimpan — dasar keyakinan prediksi biaya.',
  },
  en: {
    kicker: 'Settings',
    title: 'Data & AI',
    desc: 'Origin of stored data — the basis for cost-prediction confidence.',
  },
}

export default async function DataAiPage() {
  const lang = getLang()
  const t = PH[lang]
  const ctx = await requireTenant()

  // Halaman ini bisa DIBACA semua peran: menyembunyikan hitungan justru membuat
  // operator tak pernah tahu bahwa jumlah data nyata masih nol. Yang dibatasi
  // ADMIN adalah TINDAKANNYA (go-live & label ulang) — digerbangi di service,
  // bukan hanya di UI.
  const ringkasan = await ringkasanProvenance(ctx)

  return (
    <div className="p-margin-page max-w-[1600px] mx-auto space-y-6">
      <PageHeader kicker={t.kicker} title={t.title} description={t.desc} />
      <DataOriginPanel ringkasan={ringkasan} lang={lang} bolehGoLive={ctx.role === 'ADMIN'} />
    </div>
  )
}
