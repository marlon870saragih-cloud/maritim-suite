import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { getLang, type Lang } from '@/lib/i18n-server'
import { requireTenant } from '@/services/context'
import { getVoyageRegister } from '@/services/reports.service'
import { VoyageRegisterTable } from '@/components/reports/VoyageRegisterTable'

export const dynamic = 'force-dynamic'

const PH: Record<Lang, { kicker: string; title: string; desc: string; back: string }> = {
  id: { kicker: 'Laporan', title: 'Voyage & Finance Register', desc: 'Semua voyage beserta total EPDA/FDA/Invoice — dokumen yang sudah dibatalkan/disalip tidak dihitung.', back: 'Kembali ke Laporan' },
  en: { kicker: 'Reports', title: 'Voyage & Finance Register', desc: 'All voyages with EPDA/FDA/Invoice totals — cancelled/superseded documents are excluded.', back: 'Back to Reports' },
}

export default async function VoyageRegisterPage() {
  const t = PH[getLang()]
  const ctx = await requireTenant()
  const rows = await getVoyageRegister(ctx)

  return (
    <div className="p-margin-page max-w-[1600px] mx-auto space-y-6">
      <Link href="/reports" className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-accent-blue transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> {t.back}
      </Link>
      <PageHeader kicker={t.kicker} title={t.title} description={t.desc} />
      <VoyageRegisterTable rows={rows.map((r) => ({ ...r, eta: r.eta?.toISOString() ?? null, etd: r.etd?.toISOString() ?? null }))} />
    </div>
  )
}
