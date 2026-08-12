import { ShieldAlert } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { getLang, type Lang } from '@/lib/i18n-server'
import { requireTenant } from '@/services/context'
import { listAuditLog, listAuditLogFacets } from '@/services/audit-log.service'
import { ServiceError } from '@/services/errors'
import { AuditLogViewer } from '@/components/settings/AuditLogViewer'

export const dynamic = 'force-dynamic'

const PH: Record<Lang, { kicker: string; title: string; desc: string; denied: string }> = {
  id: {
    kicker: 'Pengaturan', title: 'Jejak Audit', desc: 'Riwayat perubahan dokumen — siapa mengubah apa, kapan.',
    denied: 'Halaman ini hanya untuk ADMIN dan Direktur.',
  },
  en: {
    kicker: 'Settings', title: 'Audit Log', desc: 'Document change history — who changed what, when.',
    denied: 'This page is for ADMIN and Direktur only.',
  },
}

export default async function AuditLogPage() {
  const t = PH[getLang()]
  const ctx = await requireTenant()

  try {
    const [rows, facets] = await Promise.all([listAuditLog(ctx), listAuditLogFacets(ctx)])
    return (
      <div className="p-margin-page max-w-[1600px] mx-auto space-y-6">
        <PageHeader kicker={t.kicker} title={t.title} description={t.desc} />
        <AuditLogViewer initialRows={rows} tables={facets.tables} actions={facets.actions} />
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
