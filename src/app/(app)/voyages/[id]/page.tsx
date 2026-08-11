// Halaman voyage MINIMAL (read-only) — placeholder sengaja disederhanakan.
// Voyage Workspace sungguhan (tab, CRUD cargo, ringkasan finansial, tautan
// dokumen/EPDA/FDA/invoice, kontrol transisi status) dibangun di atas ini.

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { getLang, type Lang } from '@/lib/i18n-server'
import { requireTenant } from '@/services/context'
import { getVoyage } from '@/services/master/voyage.service'
import { ServiceError } from '@/services/errors'

export const dynamic = 'force-dynamic'

const PH: Record<Lang, { kicker: string; back: string; vessel: string; principal: string; customer: string; port: string; status: string; eta: string; etd: string; cargo: string; portCalls: string; empty: string }> = {
  id: {
    kicker: 'Voyage', back: 'Kembali ke daftar voyage', vessel: 'Kapal', principal: 'Principal', customer: 'Customer',
    port: 'Pelabuhan', status: 'Status', eta: 'ETA', etd: 'ETD', cargo: 'Cargo', portCalls: 'Port Call', empty: '—',
  },
  en: {
    kicker: 'Voyage', back: 'Back to voyage list', vessel: 'Vessel', principal: 'Principal', customer: 'Customer',
    port: 'Port', status: 'Status', eta: 'ETA', etd: 'ETD', cargo: 'Cargo', portCalls: 'Port Calls', empty: '—',
  },
}

function fmt(d: Date | null) {
  return d ? new Date(d).toLocaleDateString('id-ID') : '—'
}

export default async function VoyageDetailPage({ params }: { params: { id: string } }) {
  const t = PH[getLang()]
  const ctx = await requireTenant()

  let voyage
  try {
    voyage = await getVoyage(ctx, params.id)
  } catch (e) {
    if (e instanceof ServiceError && e.code === 'NOT_FOUND') notFound()
    throw e
  }

  return (
    <div className="p-margin-page max-w-[1200px] mx-auto space-y-6">
      <Link href="/voyages" className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-accent-blue transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> {t.back}
      </Link>

      <PageHeader kicker={t.kicker} title={voyage.voyageNumber} description={voyage.notes ?? undefined} />

      <section className="bg-card-bg border border-card-border rounded-lg p-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1">{t.vessel}</p>
          <p className="text-text-primary">{voyage.vessel?.name ?? t.empty}</p>
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1">{t.principal}</p>
          <p className="text-text-primary">{voyage.principal?.name ?? t.empty}</p>
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1">{t.customer}</p>
          <p className="text-text-primary">{voyage.customer?.name ?? t.empty}</p>
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1">{t.port}</p>
          <p className="text-text-primary">{voyage.port?.name ?? t.empty}</p>
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1">{t.status}</p>
          <p className="text-text-primary font-mono">{voyage.status}</p>
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1">{t.eta}</p>
          <p className="text-text-primary">{fmt(voyage.eta)}</p>
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1">{t.etd}</p>
          <p className="text-text-primary">{fmt(voyage.etd)}</p>
        </div>
      </section>

      <section className="bg-card-bg border border-card-border rounded-lg p-5">
        <h3 className="font-display text-white text-sm mb-3">{t.cargo}</h3>
        {voyage.cargoes.length === 0 ? (
          <p className="text-text-secondary text-xs">{t.empty}</p>
        ) : (
          <ul className="space-y-1 text-sm text-text-secondary">
            {voyage.cargoes.map((c) => (
              <li key={c.id}>
                {c.cargoName} — {c.quantity ?? '—'} {c.unit ?? ''} {c.operation ? `(${c.operation})` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-card-bg border border-card-border rounded-lg p-5">
        <h3 className="font-display text-white text-sm mb-3">{t.portCalls}</h3>
        {voyage.portCalls.length === 0 ? (
          <p className="text-text-secondary text-xs">{t.empty}</p>
        ) : (
          <ul className="space-y-1 text-sm text-text-secondary">
            {voyage.portCalls.map((pc) => (
              <li key={pc.id}>{pc.port} — {pc.status}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
