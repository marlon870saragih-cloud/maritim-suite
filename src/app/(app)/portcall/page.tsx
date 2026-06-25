import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/shared/PageHeader'

type Call = {
  vessel: string
  port: string
  eta: string
  etd: string
  status: 'UPCOMING' | 'IN_PORT' | 'DEPARTED'
}

const CALLS: Call[] = [
  { vessel: 'MV Ocean Blue', port: 'Tanjung Priok', eta: '24 Jun 2026', etd: '—', status: 'IN_PORT' },
  { vessel: 'MT Pacific Pearl', port: 'Belawan', eta: '26 Jun 2026', etd: '—', status: 'UPCOMING' },
  { vessel: 'MV Star Liner', port: 'Tanjung Perak', eta: '20 Jun 2026', etd: '22 Jun 2026', status: 'DEPARTED' },
]

const STATUS: Record<Call['status'], { label: string; cls: string }> = {
  UPCOMING: { label: 'Akan Tiba', cls: 'bg-accent-blue/10 text-accent-blue border-accent-blue/20' },
  IN_PORT: { label: 'Di Pelabuhan', cls: 'bg-accent-teal/10 text-accent-teal border-accent-teal/20' },
  DEPARTED: { label: 'Berangkat', cls: 'bg-surface-tertiary text-text-secondary border-border-muted' },
}

export default function PortCallPage() {
  return (
    <div className="p-margin-page max-w-[1600px] mx-auto space-y-8">
      <PageHeader
        kicker="Manajemen Port Call"
        title="Jadwal & status kunjungan kapal"
        description="Pantau ETA/ETD, status sandar, dan dokumen tiap port call."
      />

      <section className="bg-card-bg border border-card-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-secondary text-text-secondary font-mono uppercase tracking-widest border-b border-card-border text-[10px]">
                <th className="px-5 py-3 font-medium">Kapal</th>
                <th className="px-5 py-3 font-medium">Port</th>
                <th className="px-5 py-3 font-medium">ETA</th>
                <th className="px-5 py-3 font-medium">ETD</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {CALLS.map((c, i) => (
                <tr
                  key={c.vessel}
                  className={cn(
                    'hover:bg-surface-tertiary/30 transition-colors',
                    i < CALLS.length - 1 && 'border-b border-card-border/50'
                  )}
                >
                  <td className="px-5 py-4 text-text-primary">{c.vessel}</td>
                  <td className="px-5 py-4 text-text-secondary">{c.port}</td>
                  <td className="px-5 py-4 font-mono text-text-primary">{c.eta}</td>
                  <td className="px-5 py-4 font-mono text-text-secondary">{c.etd}</td>
                  <td className="px-5 py-4">
                    <span
                      className={cn(
                        'inline-flex px-2 py-1 rounded text-xs font-mono border uppercase tracking-wider',
                        STATUS[c.status].cls
                      )}
                    >
                      {STATUS[c.status].label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
