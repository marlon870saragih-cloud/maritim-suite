import Link from 'next/link'
import { Building2, Database, Users, ChevronRight } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'

const SECTIONS = [
  { href: '/settings/company', title: 'Profil Perusahaan', desc: 'Nama, alamat, NPWP, rekening bank', icon: Building2 },
  { href: '/settings/vessels', title: 'Database Kapal', desc: 'Kelola data kapal & spesifikasi', icon: Database },
  { href: '/settings/principals', title: 'Principal & Kontak', desc: 'Daftar principal dan format dokumen', icon: Users },
]

export default function SettingsPage() {
  return (
    <div className="p-margin-page max-w-[1600px] mx-auto space-y-8">
      <PageHeader kicker="Pengaturan" title="Pengaturan akun" description="Kelola data master dan profil perusahaan Anda." />

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SECTIONS.map((s) => {
          const Icon = s.icon
          return (
            <Link
              key={s.href}
              href={s.href}
              className="group bg-card-bg border border-card-border rounded-lg p-5 flex items-center gap-4
                         hover:border-accent-blue/50 transition-colors"
            >
              <div className="p-2.5 bg-surface-tertiary rounded-md text-accent-blue">
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-display text-lg text-white">{s.title}</h3>
                <p className="text-text-secondary text-xs">{s.desc}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-text-secondary group-hover:text-accent-blue transition-colors" />
            </Link>
          )
        })}
      </section>

      <div className="bg-card-bg border border-card-border rounded-lg p-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-0.5">Paket Saat Ini</p>
          <p className="text-white text-sm">
            Trial · <span className="text-status-warning">14 hari lagi</span>
          </p>
        </div>
        <span className="text-[10px] bg-[#041E38] text-accent-teal px-3 py-1 rounded-full border border-[#0D4A3A] uppercase tracking-wider font-mono">
          Full Suite
        </span>
      </div>
    </div>
  )
}
