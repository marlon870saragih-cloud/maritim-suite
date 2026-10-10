import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/shared/PageHeader'
import { getLang, type Lang } from '@/lib/i18n-server'
import { requireTenant } from '@/services/context'
import { bolehAksesKomunikasi } from '@/services/communication/comm-access'
import { CommunicationList } from '@/components/automation/CommunicationList'

export const dynamic = 'force-dynamic'

const PH: Record<Lang, { kicker: string; title: string; desc: string }> = {
  id: {
    kicker: 'Automation Hub',
    title: 'Komunikasi (Simulasi)',
    desc: 'Update klien WA-1 dalam mode simulasi FAKE: disiapkan dari sinyal, dipratinjau, disetujui, lalu disimulasikan — tidak ada pesan WhatsApp yang dikirim.',
  },
  en: {
    kicker: 'Automation Hub',
    title: 'Communications (Simulation)',
    desc: 'WA-1 client updates in FAKE simulation mode: prepared from signals, previewed, approved, then simulated — no WhatsApp message is sent.',
  },
}

// WA-1 Step 2I — hanya ADMIN/MANAJER_OPERASI, tenant allowlist, flag WA-1 aktif, non-produksi.
export default async function CommunicationsPage() {
  const t = PH[getLang()]
  const ctx = await requireTenant()
  if (!bolehAksesKomunikasi(ctx)) notFound()

  return (
    <div className="p-margin-page max-w-[1600px] mx-auto space-y-6">
      <PageHeader kicker={t.kicker} title={t.title} description={t.desc} />
      <section className="bg-card-bg border border-card-border rounded-lg p-4 sm:p-5">
        <CommunicationList />
      </section>
    </div>
  )
}
