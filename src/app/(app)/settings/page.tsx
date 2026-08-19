import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { Building2, Database, Users, ChevronRight, Anchor, Truck, Coins, TrendingUp, ListChecks, ShieldAlert, UsersRound, Sparkles, Clock3, CreditCard } from 'lucide-react'
import { authOptions } from '@/lib/auth'
import { isSuperadmin } from '@/lib/billing/superadmin'
import { PageHeader } from '@/components/shared/PageHeader'
import { getLang, type Lang } from '@/lib/i18n-server'

export const dynamic = 'force-dynamic'

const TR: Record<Lang, {
  kicker: string; title: string; desc: string
  sections: { href: string; title: string; desc: string; icon: typeof Building2 }[]
}> = {
  id: {
    kicker: 'Pengaturan', title: 'Pengaturan akun', desc: 'Kelola data master dan profil perusahaan Anda.',
    sections: [
      { href: '/settings/company', title: 'Profil Perusahaan', desc: 'Nama, alamat, NPWP, rekening bank', icon: Building2 },
      { href: '/settings/vessels', title: 'Database Kapal', desc: 'Kelola data kapal & spesifikasi', icon: Database },
      { href: '/settings/principals', title: 'Principal & Kontak', desc: 'Daftar principal dan format dokumen', icon: Users },
      { href: '/settings/ports', title: 'Database Pelabuhan', desc: 'UN/LOCODE, otoritas, syarat pandu/tunda', icon: Anchor },
      { href: '/settings/customers', title: 'Customer', desc: 'Pihak ditagih untuk voyage & invoice', icon: Users },
      { href: '/settings/vendors', title: 'Vendor', desc: 'Pilot, tug, dan penyedia jasa lain', icon: Truck },
      { href: '/settings/currencies', title: 'Mata Uang', desc: 'Kode ISO 4217 yang dipakai tenant ini', icon: Coins },
      { href: '/settings/exchange-rates', title: 'Riwayat Kurs', desc: 'Log kurs untuk konversi mata uang', icon: TrendingUp },
      { href: '/settings/services', title: 'Katalog Jasa & Tarif', desc: 'Jenis jasa dan tarif — dasar EPDA/FDA', icon: ListChecks },
      { href: '/settings/team', title: 'Tim', desc: 'Anggota tim, peran, dan akses (ADMIN)', icon: UsersRound },
      { href: '/settings/billing', title: 'Langganan & Billing', desc: 'Paket, kuota, gerbang bayar, kuitansi (ADMIN/FINANCE)', icon: CreditCard },
      { href: '/settings/audit', title: 'Jejak Audit', desc: 'Riwayat perubahan dokumen — siapa mengubah apa (ADMIN)', icon: ShieldAlert },
      { href: '/settings/jobs', title: 'Pekerjaan Terjadwal', desc: 'Jalankan pengingat manual & lihat hasil jalan terakhir (ADMIN)', icon: Clock3 },
      { href: '/settings/data-ai', title: 'Data & AI', desc: 'Asal data (nyata/uji/contoh) — dasar keyakinan prediksi', icon: Sparkles },
    ],
  },
  en: {
    kicker: 'Settings', title: 'Account settings', desc: 'Manage your master data and company profile.',
    sections: [
      { href: '/settings/company', title: 'Company Profile', desc: 'Name, address, NPWP, bank account', icon: Building2 },
      { href: '/settings/vessels', title: 'Vessel Database', desc: 'Manage vessel data & specs', icon: Database },
      { href: '/settings/principals', title: 'Principals & Contacts', desc: 'Principal list and document formats', icon: Users },
      { href: '/settings/ports', title: 'Port Database', desc: 'UN/LOCODE, authority, pilot/tug requirements', icon: Anchor },
      { href: '/settings/customers', title: 'Customers', desc: 'Billed parties for voyages & invoices', icon: Users },
      { href: '/settings/vendors', title: 'Vendors', desc: 'Pilots, tugs, and other service providers', icon: Truck },
      { href: '/settings/currencies', title: 'Currencies', desc: 'ISO 4217 codes used by this tenant', icon: Coins },
      { href: '/settings/exchange-rates', title: 'Exchange Rate History', desc: 'Rate log for currency conversion', icon: TrendingUp },
      { href: '/settings/services', title: 'Service Catalog & Rates', desc: 'Service types and rates — basis for EPDA/FDA', icon: ListChecks },
      { href: '/settings/team', title: 'Team', desc: 'Team members, roles, and access (ADMIN)', icon: UsersRound },
      { href: '/settings/billing', title: 'Subscription & Billing', desc: 'Plan, quota, payment gateway, receipts (ADMIN/FINANCE)', icon: CreditCard },
      { href: '/settings/audit', title: 'Audit Log', desc: 'Document change history — who changed what (ADMIN)', icon: ShieldAlert },
      { href: '/settings/jobs', title: 'Scheduled Jobs', desc: 'Manually run reminders & view last run result (ADMIN)', icon: Clock3 },
      { href: '/settings/data-ai', title: 'Data & AI', desc: 'Data origin (real/test/sample) — basis of prediction confidence', icon: Sparkles },
    ],
  },
}

export default async function SettingsPage() {
  const lang = getLang()
  const tr = TR[lang]
  const session = await getServerSession(authOptions)
  const superadmin = isSuperadmin(session?.user?.email)

  return (
    <div className="p-margin-page max-w-[1600px] mx-auto space-y-8">
      <PageHeader kicker={tr.kicker} title={tr.title} description={tr.desc} />

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tr.sections.map((sec) => {
          const Icon = sec.icon
          return (
            <Link
              key={sec.href}
              href={sec.href}
              className="group bg-card-bg border border-card-border rounded-lg p-5 flex items-center gap-4
                         hover:border-accent-blue/50 transition-colors"
            >
              <div className="p-2.5 bg-surface-tertiary rounded-md text-accent-blue">
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-display text-lg text-white">{sec.title}</h3>
                <p className="text-text-secondary text-xs">{sec.desc}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-text-secondary group-hover:text-accent-blue transition-colors" />
            </Link>
          )
        })}
      </section>

      {superadmin && (
        <Link
          href="/admin"
          className="group bg-card-bg border border-accent-blue/40 rounded-lg p-5 flex items-center gap-4 hover:border-accent-blue transition-colors"
        >
          <div className="p-2.5 bg-surface-tertiary rounded-md text-accent-blue">
            <Users className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="font-display text-lg text-white">Panel Admin — Kelola Langganan</h3>
            <p className="text-text-secondary text-xs">Aktifkan langganan tenant setelah verifikasi transfer manual.</p>
          </div>
          <ChevronRight className="w-5 h-5 text-text-secondary group-hover:text-accent-blue transition-colors" />
        </Link>
      )}
    </div>
  )
}
