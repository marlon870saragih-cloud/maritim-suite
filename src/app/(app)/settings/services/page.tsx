import { PageHeader } from '@/components/shared/PageHeader'
import { ServicesManager } from '@/components/settings/ServicesManager'
import { ServiceTemplatesManager } from '@/components/settings/ServiceTemplatesManager'
import { getLang, type Lang } from '@/lib/i18n-server'
import { requireTenant } from '@/services/context'
import { listServiceCatalog } from '@/services/master/service-catalog.service'
import { listServiceTemplates } from '@/services/master/service-template.service'
import { listPorts } from '@/services/master/port.service'

export const dynamic = 'force-dynamic'

const PH: Record<Lang, { kicker: string; title: string; desc: string; tplTitle: string; tplDesc: string }> = {
  id: {
    kicker: 'Master Data', title: 'Katalog jasa', desc: 'Jenis jasa (Pilotage, Tug, dst) dan tarifnya — dasar EPDA/FDA.',
    tplTitle: 'Template Jasa', tplDesc: 'Paket jasa siap pakai — sekali pilih di EPDA, semua item termuat.',
  },
  en: {
    kicker: 'Master Data', title: 'Service catalog', desc: 'Service types (Pilotage, Tug, etc.) and their rates — basis for EPDA/FDA.',
    tplTitle: 'Service Templates', tplDesc: 'Ready-to-use service bundles — pick once in an EPDA, all items load.',
  },
}

export default async function ServicesSettingsPage() {
  const ctx = await requireTenant()
  const [services, ports, templates] = await Promise.all([
    listServiceCatalog(ctx, { termasukNonAktif: true }),
    listPorts(ctx, { termasukNonAktif: true }),
    listServiceTemplates(ctx, { termasukNonAktif: true }),
  ])
  const lang = getLang()
  const portOptions = ports.map((p) => ({ id: p.id, name: p.name }))
  const serviceOptions = services.map((s) => ({ id: s.id, serviceCode: s.serviceCode, serviceName: s.serviceName }))

  return (
    <div className="p-margin-page max-w-[1600px] mx-auto space-y-10">
      <div className="space-y-8">
        <PageHeader kicker={PH[lang].kicker} title={PH[lang].title} description={PH[lang].desc} />
        <ServicesManager services={services} ports={portOptions} />
      </div>

      <div className="space-y-8">
        <PageHeader kicker={PH[lang].kicker} title={PH[lang].tplTitle} description={PH[lang].tplDesc} />
        <ServiceTemplatesManager templates={templates} services={serviceOptions} ports={portOptions} />
      </div>
    </div>
  )
}
