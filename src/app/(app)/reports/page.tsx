import Link from 'next/link'
import { ChevronRight, Route, TrendingUp, Wallet } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { getLang, type Lang } from '@/lib/i18n-server'

export const dynamic = 'force-dynamic'

const TR: Record<Lang, {
  kicker: string; title: string; desc: string
  items: { href: string; title: string; desc: string; icon: typeof Route }[]
}> = {
  id: {
    kicker: 'Laporan', title: 'Laporan', desc: 'Rekap lintas-voyage dan ekspor untuk dibagikan.',
    items: [
      { href: '/reports/voyage-register', title: 'Voyage & Finance Register', desc: 'Semua voyage + total EPDA/FDA/Invoice, bisa diunduh Excel', icon: Route },
      { href: '/finance/analisa', title: 'Analisa Keuangan (Variance)', desc: 'Estimasi vs realisasi per port call', icon: TrendingUp },
      { href: '/tracker', title: 'DA & Invoice Tracker', desc: 'Outstanding per principal, aging 30/60/90 hari', icon: Wallet },
    ],
  },
  en: {
    kicker: 'Reports', title: 'Reports', desc: 'Cross-voyage rollups and exports to share.',
    items: [
      { href: '/reports/voyage-register', title: 'Voyage & Finance Register', desc: 'All voyages + EPDA/FDA/Invoice totals, downloadable as Excel', icon: Route },
      { href: '/finance/analisa', title: 'Financial Analysis (Variance)', desc: 'Estimate vs actual per port call', icon: TrendingUp },
      { href: '/tracker', title: 'DA & Invoice Tracker', desc: 'Outstanding per principal, 30/60/90-day aging', icon: Wallet },
    ],
  },
}

export default function ReportsHubPage() {
  const t = TR[getLang()]
  return (
    <div className="p-margin-page max-w-[1200px] mx-auto space-y-6">
      <PageHeader kicker={t.kicker} title={t.title} description={t.desc} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {t.items.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-start gap-3 bg-card-bg border border-card-border rounded-lg p-5 hover:border-accent-blue/50 transition-colors group"
            >
              <div className="p-2 rounded bg-accent-blue/10 text-accent-blue">
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-text-primary font-medium">{item.title}</p>
                <p className="text-text-secondary text-sm mt-0.5">{item.desc}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-text-secondary group-hover:text-accent-blue transition-colors mt-1" />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
