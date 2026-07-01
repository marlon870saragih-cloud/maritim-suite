'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, HelpCircle, Menu } from 'lucide-react'
import type { ChromeUser } from './Sidebar'
import { useT, useLang, LangToggle } from '@/lib/i18n'
import { useMobileNav } from './MobileNav'

const PRODUCT_TITLES: Record<string, string> = {
  '/finance': 'Finance Generator',
  '/dokumen': 'Maritime Dokumen',
  '/portcall': 'Port Call Manager',
  '/tracker': 'DA & Invoice Tracker',
}

const TB = {
  id: { settings: 'Pengaturan', trialPost: 'hari lagi', notif: 'Notifikasi', help: 'Bantuan', menu: 'Buka menu', fallback: 'Maritime Suite' },
  en: { settings: 'Settings', trialPost: 'days left', notif: 'Notifications', help: 'Help', menu: 'Open menu', fallback: 'Maritime Suite' },
}

export function TopBar({ user }: { user: ChromeUser }) {
  const pathname = usePathname()
  const t = useT(TB)
  const { setOpen } = useMobileNav()
  useLang() // re-render on language change

  function titleFor(): string {
    const product = Object.keys(PRODUCT_TITLES).find((k) => pathname.startsWith(k))
    if (product) return PRODUCT_TITLES[product]
    if (pathname.startsWith('/settings')) return t.settings
    return t.fallback
  }

  const onTrial = user.trialDaysLeft !== null

  return (
    <header className="print:hidden h-row-standard sticky top-0 bg-surface border-b border-border-muted z-10 px-margin-page flex justify-between items-center gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t.menu}
          className="md:hidden -ml-1 p-2 rounded text-text-secondary hover:text-accent-blue hover:bg-surface-tertiary transition-colors shrink-0"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="font-display text-lg md:text-2xl text-on-surface tracking-tight truncate">{titleFor()}</h1>
      </div>

      <div className="flex items-center gap-3 md:gap-5 shrink-0">
        {onTrial ? (
          <div className="hidden sm:flex px-3 py-1 rounded-full border border-status-warning bg-status-warning/10 text-status-warning font-mono text-[10px] uppercase tracking-widest items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-status-warning animate-pulse" />
            Trial: {user.trialDaysLeft} {t.trialPost}
          </div>
        ) : (
          <div className="hidden sm:block px-3 py-1 rounded-full border border-accent-blue/40 bg-accent-blue/10 text-accent-blue font-mono text-[10px] uppercase tracking-widest">
            {user.planLabel}
          </div>
        )}

        <LangToggle tone="ink" />

        <div className="flex items-center gap-3 text-text-secondary">
          <button type="button" aria-label={t.notif} className="hidden sm:block hover:text-accent-blue transition-colors p-1">
            <Bell className="w-5 h-5" />
          </button>
          <Link href="/panduan" aria-label={t.help} title={t.help} className="hover:text-accent-blue transition-colors p-1">
            <HelpCircle className="w-5 h-5" />
          </Link>
          <div
            title={user.name}
            className="w-8 h-8 rounded-full bg-accent-blue/15 border border-accent-blue/35 ml-1 flex items-center justify-center text-[11px] font-semibold text-accent-blue"
          >
            {user.initials}
          </div>
        </div>
      </div>
    </header>
  )
}
