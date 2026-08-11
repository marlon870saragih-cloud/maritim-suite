import { PageHeader } from '@/components/shared/PageHeader'
import { ExchangeRatesManager } from '@/components/settings/ExchangeRatesManager'
import { getLang, type Lang } from '@/lib/i18n-server'
import { requireTenant } from '@/services/context'
import { listExchangeRates } from '@/services/master/exchange-rate.service'

export const dynamic = 'force-dynamic'

const PH: Record<Lang, { kicker: string; title: string; desc: string }> = {
  id: { kicker: 'Master Data', title: 'Riwayat kurs', desc: 'Log kurs mata uang — kurs lama tidak pernah diubah, hanya ditambah.' },
  en: { kicker: 'Master Data', title: 'Exchange rate history', desc: 'Currency rate log — old rates are never edited, only added.' },
}

export default async function ExchangeRatesSettingsPage() {
  const ctx = await requireTenant()
  const rates = await listExchangeRates(ctx)

  return (
    <div className="p-margin-page max-w-[1600px] mx-auto space-y-8">
      <PageHeader kicker={PH[getLang()].kicker} title={PH[getLang()].title} description={PH[getLang()].desc} />
      <ExchangeRatesManager rates={rates} />
    </div>
  )
}
