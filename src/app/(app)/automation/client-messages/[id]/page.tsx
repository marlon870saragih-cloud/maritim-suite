import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/shared/PageHeader'
import { getLang, type Lang } from '@/lib/i18n-server'
import { requireTenant } from '@/services/context'
import { bolehAksesWa2 } from '@/services/whatsapp/wa2-access'
import { ClientMessageWorkspace } from '@/components/automation/ClientMessageWorkspace'

export const dynamic = 'force-dynamic'

const PH: Record<Lang, { kicker: string; title: string }> = {
  id: { kicker: 'Pesan Klien WhatsApp', title: 'Detail pesan klien' },
  en: { kicker: 'WhatsApp Client Messages', title: 'Client message detail' },
}

// WA-2a 2a-G (T3) — pagar sama dengan halaman daftar. Detail, riwayat, dan aksi dimuat client lewat API 2a-G;
// isolasi tenant & maker-checker diputus server. `?hasil=` hanya menampilkan kode hasil yang dikenal.
export default async function ClientMessageDetailPage({ params, searchParams }: { params: { id: string }; searchParams: { hasil?: string | string[] } }) {
  const t = PH[getLang()]
  const ctx = await requireTenant()
  if (!bolehAksesWa2(ctx)) notFound()
  // Divalidasi komponen client terhadap daftar kode hasil yang dikenal; nilai lain diabaikan.
  const hasilAwal = typeof searchParams.hasil === 'string' ? searchParams.hasil.slice(0, 40) : null

  return (
    <div className="p-margin-page max-w-[1600px] mx-auto space-y-6">
      <PageHeader kicker={t.kicker} title={t.title} />
      <ClientMessageWorkspace messageId={params.id} hasilAwal={hasilAwal} />
    </div>
  )
}
