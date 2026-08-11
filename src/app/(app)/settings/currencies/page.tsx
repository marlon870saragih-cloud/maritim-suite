import { PageHeader } from '@/components/shared/PageHeader'
import { CurrenciesManager } from '@/components/settings/CurrenciesManager'
import { getLang, type Lang } from '@/lib/i18n-server'
import { requireTenant } from '@/services/context'
import { listCurrencies } from '@/services/master/currency.service'

export const dynamic = 'force-dynamic'

const PH: Record<Lang, { kicker: string; title: string; desc: string }> = {
  id: { kicker: 'Master Data', title: 'Mata uang', desc: 'Daftar mata uang yang dipakai untuk invoice & disbursement.' },
  en: { kicker: 'Master Data', title: 'Currencies', desc: 'Currency list used for invoices & disbursements.' },
}

export default async function CurrenciesSettingsPage() {
  const ctx = await requireTenant()
  const currencies = await listCurrencies(ctx, { termasukNonAktif: true })

  return (
    <div className="p-margin-page max-w-[1600px] mx-auto space-y-8">
      <PageHeader kicker={PH[getLang()].kicker} title={PH[getLang()].title} description={PH[getLang()].desc} />
      <CurrenciesManager currencies={currencies} />
    </div>
  )
}
