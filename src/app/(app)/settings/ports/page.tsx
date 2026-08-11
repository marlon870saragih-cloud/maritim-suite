import { PageHeader } from '@/components/shared/PageHeader'
import { PortsManager } from '@/components/settings/PortsManager'
import { getLang, type Lang } from '@/lib/i18n-server'
import { requireTenant } from '@/services/context'
import { listPorts } from '@/services/master/port.service'

export const dynamic = 'force-dynamic'

const PH: Record<Lang, { kicker: string; title: string; desc: string }> = {
  id: { kicker: 'Master Data', title: 'Database pelabuhan', desc: 'Data pelabuhan untuk pengisian otomatis voyage & dokumen.' },
  en: { kicker: 'Master Data', title: 'Port database', desc: 'Port data for auto-filling voyages & documents.' },
}

export default async function PortsSettingsPage() {
  const ctx = await requireTenant()
  const ports = await listPorts(ctx, { termasukNonAktif: true })

  return (
    <div className="p-margin-page max-w-[1600px] mx-auto space-y-8">
      <PageHeader kicker={PH[getLang()].kicker} title={PH[getLang()].title} description={PH[getLang()].desc} />
      <PortsManager ports={ports} />
    </div>
  )
}
