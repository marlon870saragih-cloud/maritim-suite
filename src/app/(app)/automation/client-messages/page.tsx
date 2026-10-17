import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/shared/PageHeader'
import { getLang, type Lang } from '@/lib/i18n-server'
import { requireTenant } from '@/services/context'
import { bolehAksesWa2 } from '@/services/whatsapp/wa2-access'
import { ClientMessageList } from '@/components/automation/ClientMessageList'

export const dynamic = 'force-dynamic'

const PH: Record<Lang, { kicker: string; title: string; desc: string }> = {
  id: {
    kicker: 'Automation Hub',
    title: 'Pesan Klien WhatsApp',
    desc: 'Draft update klien dari sinyal kapal: dipratinjau, dimintakan approval, lalu disetujui checker lain. BELUM DIKIRIM — tidak ada pengiriman WhatsApp pada fase ini.',
  },
  en: {
    kicker: 'Automation Hub',
    title: 'WhatsApp Client Messages',
    desc: 'Client update drafts from vessel signals: previewed, sent for approval, then approved by another checker. NOT SENT — no WhatsApp sending in this phase.',
  },
}

// WA-2a 2a-G (T3) — tanpa sesi: layout (app) mengalihkan ke /login. Sesi tidak berhak (tenant di luar allowlist,
// peran selain ADMIN/MANAJER_OPERASI, flag mati, produksi) → 404. Data dimuat client lewat API 2a-G.
export default async function ClientMessagesPage() {
  const t = PH[getLang()]
  const ctx = await requireTenant()
  if (!bolehAksesWa2(ctx)) notFound()

  return (
    <div className="p-margin-page max-w-[1600px] mx-auto space-y-6">
      <PageHeader kicker={t.kicker} title={t.title} description={t.desc} />
      <section className="bg-card-bg border border-card-border rounded-lg p-4 sm:p-5">
        <ClientMessageList />
      </section>
    </div>
  )
}
