// Halaman Kepatuhan (K186/K187, Fase 8k) — status backup, ekspor mandiri,
// permintaan hak subjek data.
//
// Dua pagar peran BERBEDA hidup di layar yang sama, dan itu disengaja:
//   - Melihat status backup & mencatat DataRequest — ADMIN/OPERATOR/
//     MANAJER_OPERASI/DIREKTUR (tabel peran §11).
//   - Meminta & mengunduh EKSPOR — ADMIN saja, termasuk BUKAN DIREKTUR
//     (K186: menyalin seluruh data perusahaan keluar adalah tindakan, bukan
//     penglihatan).
// Karena itu halaman ini tidak "digerbangi" satu kali di atas; ia menurunkan
// `bolehEkspor` ke panel, dan pagar sesungguhnya tetap di service layer.

import { ShieldAlert } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { getLang, type Lang } from '@/lib/i18n-server'
import { requireTenant } from '@/services/context'
import { ServiceError } from '@/services/errors'
import { listDataRequests } from '@/services/saas/data-request.service'
import { CompliancePanel } from '@/components/saas/CompliancePanel'

export const dynamic = 'force-dynamic'

const PH: Record<Lang, { kicker: string; title: string; desc: string; denied: string }> = {
  id: {
    kicker: 'Pengaturan', title: 'Kepatuhan & Data',
    desc: 'Status backup, ekspor mandiri seluruh data, dan permintaan hak subjek data (UU PDP).',
    denied: 'Halaman ini untuk ADMIN, OPERATOR, MANAJER OPERASI, dan DIREKTUR.',
  },
  en: {
    kicker: 'Settings', title: 'Compliance & Data',
    desc: 'Backup status, full self-service data export, and data subject requests.',
    denied: 'This page is for ADMIN, OPERATOR, OPERATIONS MANAGER, and DIRECTOR.',
  },
}

export default async function CompliancePage() {
  const lang = getLang()
  const t = PH[lang]
  const ctx = await requireTenant()

  try {
    // Memicu pagar peran K187 (pola sama BillingPage/BrandingPage).
    await listDataRequests(ctx)

    return (
      <div className="p-margin-page max-w-[900px] mx-auto space-y-6">
        <PageHeader kicker={t.kicker} title={t.title} description={t.desc} />
        <CompliancePanel bolehEkspor={ctx.role === 'ADMIN'} />
      </div>
    )
  } catch (e) {
    if (e instanceof ServiceError && e.code === 'FORBIDDEN') {
      return (
        <div className="p-margin-page max-w-[900px] mx-auto space-y-6">
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
