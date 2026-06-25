import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/shared/PageHeader'

const VESSELS = [
  { name: 'MV Ocean Blue', imo: '9123456', flag: 'Indonesia', type: 'Bulk Carrier', gt: '25.000' },
  { name: 'MT Pacific Pearl', imo: '9234567', flag: 'Singapore', type: 'Oil Tanker', gt: '18.000' },
  { name: 'MV Star Liner', imo: '9345678', flag: 'Panama', type: 'Container', gt: '32.000' },
]

export default function VesselsSettingsPage() {
  return (
    <div className="p-margin-page max-w-[1600px] mx-auto space-y-8">
      <PageHeader
        kicker="Master Data"
        title="Database kapal"
        description="Data kapal untuk pengisian otomatis dokumen & port call."
        action={
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-2 bg-[#2E86DE] text-white rounded px-4 py-2 text-sm font-medium opacity-60 cursor-not-allowed"
          >
            <Plus className="w-4 h-4" /> Tambah Kapal
          </button>
        }
      />

      <section className="bg-card-bg border border-card-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-secondary text-text-secondary font-mono uppercase tracking-widest border-b border-card-border text-[10px]">
                <th className="px-5 py-3 font-medium">Nama Kapal</th>
                <th className="px-5 py-3 font-medium">IMO</th>
                <th className="px-5 py-3 font-medium">Bendera</th>
                <th className="px-5 py-3 font-medium">Tipe</th>
                <th className="px-5 py-3 font-medium text-right">GT</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {VESSELS.map((v, i) => (
                <tr
                  key={v.imo}
                  className={cn(
                    'hover:bg-surface-tertiary/30 transition-colors',
                    i < VESSELS.length - 1 && 'border-b border-card-border/50'
                  )}
                >
                  <td className="px-5 py-4 text-text-primary">{v.name}</td>
                  <td className="px-5 py-4 font-mono text-text-secondary">{v.imo}</td>
                  <td className="px-5 py-4 text-text-secondary">{v.flag}</td>
                  <td className="px-5 py-4 text-text-secondary">{v.type}</td>
                  <td className="px-5 py-4 font-mono text-text-primary text-right">{v.gt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
