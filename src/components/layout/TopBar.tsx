'use client'

import { usePathname } from 'next/navigation'
import { Bell, HelpCircle } from 'lucide-react'
import type { ChromeUser } from './Sidebar'

const TITLES: Record<string, string> = {
  '/finance': 'Finance Generator',
  '/dokumen': 'Maritime Dokumen',
  '/portcall': 'Port Call Manager',
  '/tracker': 'DA & Invoice Tracker',
  '/settings': 'Pengaturan',
}

function titleFor(pathname: string): string {
  const match = Object.keys(TITLES).find((k) => pathname.startsWith(k))
  return match ? TITLES[match] : 'Maritime Suite'
}

export function TopBar({ user }: { user: ChromeUser }) {
  const pathname = usePathname()
  const onTrial = user.trialDaysLeft !== null

  return (
    <header
      className="h-row-standard sticky top-0 bg-surface border-b border-border-muted z-10
                 px-margin-page flex justify-between items-center"
    >
      <h1 className="font-display text-2xl text-on-surface tracking-tight">{titleFor(pathname)}</h1>

      <div className="flex items-center gap-6">
        {/* Badge plan / trial — dari data tenant */}
        {onTrial ? (
          <div
            className="px-3 py-1 rounded-full border border-status-warning bg-status-warning/10
                       text-status-warning font-mono text-[10px] uppercase tracking-widest
                       flex items-center gap-2"
          >
            <span className="w-2 h-2 rounded-full bg-status-warning animate-pulse" />
            Trial: {user.trialDaysLeft} hari lagi
          </div>
        ) : (
          <div
            className="px-3 py-1 rounded-full border border-accent-teal/40 bg-accent-teal/10
                       text-accent-teal font-mono text-[10px] uppercase tracking-widest"
          >
            {user.planLabel}
          </div>
        )}

        <div className="flex items-center gap-3 text-text-secondary">
          <button
            type="button"
            aria-label="Notifikasi"
            className="hover:text-accent-blue transition-colors p-1"
          >
            <Bell className="w-5 h-5" />
          </button>
          <button
            type="button"
            aria-label="Bantuan"
            className="hover:text-accent-blue transition-colors p-1"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
          <div
            title={user.name}
            className="w-8 h-8 rounded-full bg-[#0D3060] border border-border-muted ml-2
                       flex items-center justify-center text-[11px] font-semibold text-accent-blue"
          >
            {user.initials}
          </div>
        </div>
      </div>
    </header>
  )
}
