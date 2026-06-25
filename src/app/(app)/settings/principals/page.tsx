import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/shared/PageHeader'

const PRINCIPALS = [
  { name: 'Ocean Tankers Pte Ltd', contact: 'Mr. Lim', email: 'ops@oceantankers.sg', format: 'FPDA' },
  { name: 'Pacific Shipping Co', contact: 'Ibu Sari', email: 'agency@pacshipping.co.id', format: 'EPDA' },
  { name: 'Star Maritime Ltd', contact: 'Mr. Chan', email: 'da@starmaritime.hk', format: 'FPDA' },
]

export default function PrincipalsSettingsPage() {
  return (
    <div className="p-margin-page max-w-[1600px] mx-auto space-y-8">
      <PageHeader
        kicker="Master Data"
        title="Principal & kontak"
        description="Daftar principal beserta format dokumen preferensi."
        action={
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-2 bg-[#2E86DE] text-white rounded px-4 py-2 text-sm font-medium opacity-60 cursor-not-allowed"
          >
            <Plus className="w-4 h-4" /> Tambah Principal
          </button>
        }
      />

      <section className="bg-card-bg border border-card-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-secondary text-text-secondary font-mono uppercase tracking-widest border-b border-card-border text-[10px]">
                <th className="px-5 py-3 font-medium">Nama Principal</th>
                <th className="px-5 py-3 font-medium">Kontak</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Format</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {PRINCIPALS.map((p, i) => (
                <tr
                  key={p.email}
                  className={cn(
                    'hover:bg-surface-tertiary/30 transition-colors',
                    i < PRINCIPALS.length - 1 && 'border-b border-card-border/50'
                  )}
                >
                  <td className="px-5 py-4 text-text-primary">{p.name}</td>
                  <td className="px-5 py-4 text-text-secondary">{p.contact}</td>
                  <td className="px-5 py-4 font-mono text-text-secondary">{p.email}</td>
                  <td className="px-5 py-4">
                    <span className="px-2 py-1 bg-accent-blue/10 text-accent-blue rounded text-xs font-mono">
                      {p.format}
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
