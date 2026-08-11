import { PageHeader } from '@/components/shared/PageHeader'
import { CustomersManager } from '@/components/settings/CustomersManager'
import { getLang, type Lang } from '@/lib/i18n-server'
import { requireTenant } from '@/services/context'
import { listCustomers } from '@/services/master/customer.service'

export const dynamic = 'force-dynamic'

const PH: Record<Lang, { kicker: string; title: string; desc: string }> = {
  id: { kicker: 'Master Data', title: 'Database customer', desc: 'Data customer (pihak ditagih) untuk voyage & invoice.' },
  en: { kicker: 'Master Data', title: 'Customer database', desc: 'Customer (billed party) data for voyages & invoices.' },
}

export default async function CustomersSettingsPage() {
  const ctx = await requireTenant()
  const customers = await listCustomers(ctx, { termasukNonAktif: true })

  return (
    <div className="p-margin-page max-w-[1600px] mx-auto space-y-8">
      <PageHeader kicker={PH[getLang()].kicker} title={PH[getLang()].title} description={PH[getLang()].desc} />
      <CustomersManager customers={customers} />
    </div>
  )
}
