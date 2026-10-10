import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/shared/PageHeader'
import { getLang, type Lang } from '@/lib/i18n-server'
import { requireTenant } from '@/services/context'
import { bolehAksesKomunikasi } from '@/services/communication/comm-access'
import { FIXTURE_PENERIMA } from '@/services/communication/comm-fixture'
import { samarkanPengenal } from '@/services/communication/comm-policy'
import { CommunicationWorkspace } from '@/components/automation/CommunicationWorkspace'

export const dynamic = 'force-dynamic'

const PH: Record<Lang, { kicker: string; title: string }> = {
  id: { kicker: 'Komunikasi (Simulasi)', title: 'Update klien' },
  en: { kicker: 'Communications (Simulation)', title: 'Client update' },
}

// WA-1 Step 2I — data kandidat dimuat client lewat API Step 2H (gerbang & isolasi tenant diputus server).
// Halaman ini hanya meneruskan daftar fixture uji (pengenal SUDAH disamarkan) untuk pilihan penerima.
export default async function CommunicationDetailPage({ params }: { params: { id: string } }) {
  const t = PH[getLang()]
  const ctx = await requireTenant()
  if (!bolehAksesKomunikasi(ctx)) notFound()
  const fixtures = FIXTURE_PENERIMA.filter((f) => f.aktif).map((f) => ({ id: f.id, nama: f.nama, samaran: samarkanPengenal(f.pengenal) }))

  return (
    <div className="p-margin-page max-w-[1600px] mx-auto space-y-6">
      <PageHeader kicker={t.kicker} title={t.title} />
      <CommunicationWorkspace candidateId={params.id} fixtures={fixtures} />
    </div>
  )
}
