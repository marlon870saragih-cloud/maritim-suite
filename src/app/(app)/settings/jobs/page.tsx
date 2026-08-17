import { ShieldAlert } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { getLang, type Lang } from '@/lib/i18n-server'
import { requireTenant, requireRole } from '@/services/context'
import { ServiceError } from '@/services/errors'
import { JobRunnerPanel } from '@/components/settings/JobRunnerPanel'

export const dynamic = 'force-dynamic'

// Settings › Pekerjaan Terjadwal (§15 poin 7, K88, Fase 7e-UI) — ADMIN saja.
//
// Berbeda dari settings/audit/page.tsx (template langsung berkas ini): tidak
// ada `list*()` service untuk dipanggil di sini, karena tak ada data yang
// dibaca server-side (lihat catatan persistensi di JobRunnerPanel.tsx —
// "hasil jalan terakhir" sengaja hanya state klien, bukan tabel baru).
// Gerbang ADMIN karena itu dipanggil langsung (`requireRole`), bukan lewat
// service — tapi pola try/catch ServiceError('FORBIDDEN') tetap sama persis
// dengan audit/page.tsx supaya pesan "khusus ADMIN" konsisten se-aplikasi.

const PH: Record<Lang, { kicker: string; title: string; desc: string; denied: string }> = {
  id: {
    kicker: 'Pengaturan',
    title: 'Pekerjaan Terjadwal',
    desc: 'Jalankan job pengingat secara manual dan lihat hasil jalan terakhir.',
    denied: 'Halaman ini hanya untuk ADMIN.',
  },
  en: {
    kicker: 'Settings',
    title: 'Scheduled Jobs',
    desc: 'Manually run the reminder job and view the last run result.',
    denied: 'This page is for ADMIN only.',
  },
}

export default async function ScheduledJobsPage() {
  const t = PH[getLang()]
  const ctx = await requireTenant()

  try {
    requireRole(ctx, 'ADMIN')
    return (
      <div className="p-margin-page max-w-[1600px] mx-auto space-y-6">
        <PageHeader kicker={t.kicker} title={t.title} description={t.desc} />
        <JobRunnerPanel />
      </div>
    )
  } catch (e) {
    if (e instanceof ServiceError && e.code === 'FORBIDDEN') {
      return (
        <div className="p-margin-page max-w-[1600px] mx-auto space-y-6">
          <PageHeader kicker={t.kicker} title={t.title} description={t.desc} />
          <div className="bg-card-bg border border-card-border rounded-lg p-10 text-center">
            <ShieldAlert className="w-8 h-8 text-text-secondary mx-auto mb-3" />
            <p className="text-text-secondary text-sm">{t.denied}</p>
          </div>
        </div>
      )
    }
    throw e
  }
}
