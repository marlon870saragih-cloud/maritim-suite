import { PageHeader } from '@/components/shared/PageHeader'
import { VendorsManager } from '@/components/settings/VendorsManager'
import { getLang, type Lang } from '@/lib/i18n-server'
import { requireTenant } from '@/services/context'
import { listVendors } from '@/services/master/vendor.service'

export const dynamic = 'force-dynamic'

const PH: Record<Lang, { kicker: string; title: string; desc: string }> = {
  id: { kicker: 'Master Data', title: 'Database vendor', desc: 'Data vendor (pilot, tug, dll) untuk katalog jasa & disbursement.' },
  en: { kicker: 'Master Data', title: 'Vendor database', desc: 'Vendor (pilot, tug, etc.) data for service catalog & disbursements.' },
}

export default async function VendorsSettingsPage() {
  const ctx = await requireTenant()
  const vendors = await listVendors(ctx, { termasukNonAktif: true })

  return (
    <div className="p-margin-page max-w-[1600px] mx-auto space-y-8">
      <PageHeader kicker={PH[getLang()].kicker} title={PH[getLang()].title} description={PH[getLang()].desc} />
      <VendorsManager vendors={vendors} />
    </div>
  )
}
