import Link from 'next/link'
import Script from 'next/script'
import { getServerSession } from 'next-auth'
import { Building2, Database, Users, ChevronRight } from 'lucide-react'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PageHeader } from '@/components/shared/PageHeader'
import { BillingPanel } from '@/components/billing/BillingPanel'
import { midtransIsProduction } from '@/lib/billing/midtrans'
import { isSuperadmin } from '@/lib/billing/superadmin'
import { getLang, type Lang } from '@/lib/i18n-server'

export const dynamic = 'force-dynamic'

const PLAN_LABEL: Record<string, string> = {
  TRIAL: 'Trial',
  STARTER: '2 Modul',
  PRO: '3 Modul',
  FULL_SUITE: 'Semua Modul',
}

const TR: Record<Lang, {
  kicker: string; title: string; desc: string; planNow: string; daysLeft: string; expired: string
  sections: { href: string; title: string; desc: string; icon: typeof Building2 }[]
}> = {
  id: {
    kicker: 'Pengaturan', title: 'Pengaturan akun', desc: 'Kelola data master dan profil perusahaan Anda.',
    planNow: 'Paket Saat Ini', daysLeft: 'hari lagi', expired: 'sudah berakhir',
    sections: [
      { href: '/settings/company', title: 'Profil Perusahaan', desc: 'Nama, alamat, NPWP, rekening bank', icon: Building2 },
      { href: '/settings/vessels', title: 'Database Kapal', desc: 'Kelola data kapal & spesifikasi', icon: Database },
      { href: '/settings/principals', title: 'Principal & Kontak', desc: 'Daftar principal dan format dokumen', icon: Users },
    ],
  },
  en: {
    kicker: 'Settings', title: 'Account settings', desc: 'Manage your master data and company profile.',
    planNow: 'Current Plan', daysLeft: 'days left', expired: 'has expired',
    sections: [
      { href: '/settings/company', title: 'Company Profile', desc: 'Name, address, NPWP, bank account', icon: Building2 },
      { href: '/settings/vessels', title: 'Vessel Database', desc: 'Manage vessel data & specs', icon: Database },
      { href: '/settings/principals', title: 'Principals & Contacts', desc: 'Principal list and document formats', icon: Users },
    ],
  },
}

function daysLeftFrom(date: Date | null | undefined): number | null {
  if (!date) return null
  const end = new Date(date).getTime()
  if (Number.isNaN(end)) return null
  return Math.max(0, Math.ceil((end - Date.now()) / 86_400_000))
}

export default async function SettingsPage() {
  const lang = getLang()
  const tr = TR[lang]
  const SECTIONS = tr.sections
  const session = await getServerSession(authOptions)

  // Baca tenant SEGAR dari DB (bukan dari sesi JWT yang bisa basi setelah pembayaran).
  const tenant = session?.user?.tenantId
    ? await prisma.tenant.findUnique({ where: { id: session.user.tenantId } })
    : null

  const plan = tenant?.plan ?? 'TRIAL'
  const planLabel = PLAN_LABEL[plan] ?? plan
  const daysLeft =
    plan === 'TRIAL' ? daysLeftFrom(tenant?.trialEndsAt) : daysLeftFrom(tenant?.subscriptionEndsAt)

  const superadmin = isSuperadmin(session?.user?.email)

  const snapUrl = midtransIsProduction
    ? 'https://app.midtrans.com/snap/snap.js'
    : 'https://app.sandbox.midtrans.com/snap/snap.js'
  const clientKey = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY ?? ''

  return (
    <div className="p-margin-page max-w-[1600px] mx-auto space-y-8">
      {clientKey && <Script src={snapUrl} data-client-key={clientKey} strategy="afterInteractive" />}

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
            {daysLeft !== null && (
              <>
                {' · '}
                {daysLeft > 0 ? (
                  <span className="text-status-warning">
                    {daysLeft} {tr.daysLeft}
                  </span>
                ) : (
                  <span className="text-status-danger">{tr.expired}</span>
                )}
              </>
            )}
          </p>
        </div>
        <span className="text-[10px] bg-accent-teal/12 text-accent-teal px-3 py-1 rounded-full border border-accent-teal/30 uppercase tracking-wider font-mono">
          {planLabel}
        </span>
      </div>

      <BillingPanel lang={lang} />

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
