import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { Building2, Database, Users, ChevronRight } from 'lucide-react'
import { authOptions } from '@/lib/auth'
import { PageHeader } from '@/components/shared/PageHeader'
import { getLang, type Lang } from '@/lib/i18n-server'

export const dynamic = 'force-dynamic'

const PLAN_LABEL: Record<string, string> = {
  TRIAL: 'Trial',
  STARTER: 'Starter',
  PRO: 'Pro',
  FULL_SUITE: 'Full Suite',
}

const TR: Record<Lang, {
  kicker: string; title: string; desc: string; planNow: string; daysLeft: string
  sections: { href: string; title: string; desc: string; icon: typeof Building2 }[]
}> = {
  id: {
    kicker: 'Pengaturan', title: 'Pengaturan akun', desc: 'Kelola data master dan profil perusahaan Anda.',
    planNow: 'Paket Saat Ini', daysLeft: 'hari lagi',
    sections: [
      { href: '/settings/company', title: 'Profil Perusahaan', desc: 'Nama, alamat, NPWP, rekening bank', icon: Building2 },
      { href: '/settings/vessels', title: 'Database Kapal', desc: 'Kelola data kapal & spesifikasi', icon: Database },
      { href: '/settings/principals', title: 'Principal & Kontak', desc: 'Daftar principal dan format dokumen', icon: Users },
    ],
  },
  en: {
    kicker: 'Settings', title: 'Account settings', desc: 'Manage your master data and company profile.',
    planNow: 'Current Plan', daysLeft: 'days left',
    sections: [
      { href: '/settings/company', title: 'Company Profile', desc: 'Name, address, NPWP, bank account', icon: Building2 },
      { href: '/settings/vessels', title: 'Vessel Database', desc: 'Manage vessel data & specs', icon: Database },
      { href: '/settings/principals', title: 'Principals & Contacts', desc: 'Principal list and document formats', icon: Users },
    ],
  },
}

export default async function SettingsPage() {
  const tr = TR[getLang()]
  const SECTIONS = tr.sections
  const session = await getServerSession(authOptions)
  const tenant = session?.user?.tenant
  const plan = tenant?.plan ?? 'TRIAL'
  const planLabel = PLAN_LABEL[plan] ?? plan

  let trialDaysLeft: number | null = null
  if (plan === 'TRIAL' && tenant?.trialEndsAt) {
    const end = new Date(tenant.trialEndsAt).getTime()
    if (!Number.isNaN(end)) trialDaysLeft = Math.max(0, Math.ceil((end - Date.now()) / 86_400_000))
  }

  return (
    <div className="p-margin-page max-w-[1600px] mx-auto space-y-8">
      <PageHeader kicker={tr.kicker} title={tr.title} description={tr.desc} />

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SECTIONS.map((sec) => {
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

      <div className="bg-card-bg border border-card-border rounded-lg p-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-0.5">{tr.planNow}</p>
          <p className="text-white text-sm">
            {planLabel}
            {trialDaysLeft !== null && (
              <>
                {' · '}
                <span className="text-status-warning">{trialDaysLeft} {tr.daysLeft}</span>
              </>
            )}
          </p>
        </div>
        <span className="text-[10px] bg-accent-teal/12 text-accent-teal px-3 py-1 rounded-full border border-accent-teal/30 uppercase tracking-wider font-mono">
          {planLabel}
        </span>
      </div>
    </div>
  )
}
