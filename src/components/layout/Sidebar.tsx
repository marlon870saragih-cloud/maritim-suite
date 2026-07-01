'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  DollarSign,
  FileText,
  Ship,
  BarChart3,
  Database,
  Building2,
  Settings,
  Lock,
  Sparkles,
  BookOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'
import { DOC_CATEGORIES } from '@/lib/doc-categories'
import { useMobileNav } from './MobileNav'

const DOK_COUNT = new Set(DOC_CATEGORIES.flatMap((c) => c.docs.map((d) => d.type))).size

const navItems = [
  { id: 'finance', label: 'Finance Generator', sublabel: 'EPDA · FPDA · Invoice', href: '/finance', icon: DollarSign },
  { id: 'dokumen', label: 'Maritime Dokumen', sublabel: 'FAL · SOF · NOR · Clearance', href: '/dokumen', icon: FileText, count: DOK_COUNT },
  { id: 'portcall', label: 'Port Call Manager', sublabel: 'Status · Timeline · Task', href: '/portcall', icon: Ship },
  { id: 'tracker', label: 'DA & Invoice Tracker', sublabel: 'Outstanding · Aging', href: '/tracker', icon: BarChart3, locked: true },
] as const

export type ChromeUser = {
  name: string
  initials: string
  roleLabel: string
  planLabel: string
  trialDaysLeft: number | null
  companyName: string
}

const SB = {
  id: {
    aiTitle: 'Asisten Dokumen AI', aiDesc: 'Ngobrol · buat dokumen & port call',
    sectMain: 'Menu Utama', sectMaster: 'Master Data',
    vesselLabel: 'Vessel Database', principalLabel: 'Principal & Kontak',
    vesselWord: 'kapal', principalWord: 'principal', settings: 'Pengaturan', guide: 'Panduan',
  },
  en: {
    aiTitle: 'AI Document Assistant', aiDesc: 'Chat · create documents & port calls',
    sectMain: 'Main menu', sectMaster: 'Master Data',
    vesselLabel: 'Vessel Database', principalLabel: 'Principals & Contacts',
    vesselWord: 'vessels', principalWord: 'principals', settings: 'Settings', guide: 'User Guide',
  },
}

export function Sidebar({
  modulesEnabled,
  vesselCount,
  principalCount,
  user,
}: {
  modulesEnabled: string[]
  vesselCount: number
  principalCount: number
  user: ChromeUser
}) {
  const pathname = usePathname()
  const t = useT(SB)
  const { open, setOpen } = useMobileNav()

  return (
    <>
      {/* Overlay gelap di mobile saat drawer terbuka */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden="true"
        className={cn(
          'fixed inset-0 z-30 bg-black/50 backdrop-blur-[1px] md:hidden transition-opacity duration-200',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
      />
      <nav
        className={cn(
          'w-[240px] h-screen fixed top-0 bg-surface-secondary border-r border-border-muted flex flex-col z-40 print:hidden',
          'transition-[left] duration-200 md:left-0',
          open ? 'left-0 shadow-2xl' : '-left-[240px]'
        )}
      >
      {/* Brand */}
      <div className="px-4 py-5 border-b border-border-muted">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded bg-accent-blue/15 flex items-center justify-center border border-accent-blue/30">
            <Ship className="w-4 h-4 text-accent-blue" />
          </div>
          <span className="font-display text-base text-text-primary font-normal">Maritime Suite</span>
        </div>
        <p className="text-[10px] text-accent-blue uppercase tracking-widest ml-11 font-mono truncate">
          {user.companyName}
        </p>
      </div>

      {/* Navigation */}
      <div className="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
        <Link
          href="/finance/asisten"
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded relative border transition-all duration-200 group mb-1',
            pathname.startsWith('/finance/asisten')
              ? 'bg-accent-blue/20 border-accent-blue/55'
              : 'bg-accent-blue/[0.08] border-accent-blue/30 hover:bg-accent-blue/15'
          )}
        >
          <Sparkles className="w-4 h-4 flex-shrink-0 text-accent-blue" />
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium text-text-primary truncate">{t.aiTitle}</p>
            <p className="text-[10px] text-accent-blue/80 truncate">{t.aiDesc}</p>
          </div>
        </Link>

        <p className="px-3 py-2 text-[9px] text-text-secondary uppercase tracking-widest font-mono">
          {t.sectMain}
        </p>
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href)
          const isLocked = 'locked' in item && item.locked && !modulesEnabled.includes(item.id)
          const Icon = item.icon

          return (
            <Link
              key={item.id}
              href={isLocked ? '#' : item.href}
              onClick={isLocked ? (e) => e.preventDefault() : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded relative border transition-all duration-200 group',
                isActive
                  ? 'bg-surface-tertiary border-border-muted'
                  : isLocked
                    ? 'border-transparent opacity-40 cursor-not-allowed'
                    : 'border-transparent hover:bg-surface-tertiary/60 hover:border-border-muted'
              )}
            >
              <div
                className={cn(
                  'absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r transition-all duration-200',
                  isActive ? 'h-[70%] bg-accent-blue' : 'h-0 group-hover:h-[60%] group-hover:bg-accent-blue/60'
                )}
              />
              <Icon
                className={cn(
                  'w-4 h-4 flex-shrink-0 transition-colors duration-200',
                  isActive ? 'text-accent-blue' : 'text-text-secondary/70 group-hover:text-accent-blue'
                )}
              />
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    'text-[12px] font-medium truncate transition-colors duration-200',
                    isActive ? 'text-text-primary' : 'text-text-secondary group-hover:text-text-primary'
                  )}
                >
                  {item.label}
                </p>
                <p
                  className={cn(
                    'text-[10px] truncate font-mono transition-colors duration-200',
                    isActive ? 'text-accent-blue/70' : 'text-text-secondary/55 group-hover:text-text-secondary/80'
                  )}
                >
                  {item.sublabel}
                </p>
              </div>

              {'count' in item && item.count && !isLocked && (
                <span
                  className={cn(
                    'text-[9px] px-1.5 py-0.5 rounded-full font-mono border',
                    isActive
                      ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/40'
                      : 'bg-surface-tertiary text-text-secondary border-border-muted'
                  )}
                >
                  {item.count}
                </span>
              )}
              {isLocked && <Lock className="w-3 h-3 text-text-secondary/50 flex-shrink-0" />}
            </Link>
          )
        })}

        {/* Master Data */}
        <p className="px-3 py-2 mt-4 text-[9px] text-text-secondary uppercase tracking-widest font-mono">
          {t.sectMaster}
        </p>
        {[
          { href: '/settings/vessels', label: t.vesselLabel, sublabel: `${vesselCount} ${t.vesselWord}`, icon: Database },
          { href: '/settings/principals', label: t.principalLabel, sublabel: `${principalCount} ${t.principalWord}`, icon: Building2 },
        ].map((item) => {
          const isActive = pathname.startsWith(item.href)
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded relative border transition-all duration-200 group',
                isActive
                  ? 'bg-surface-tertiary border-border-muted'
                  : 'border-transparent hover:bg-surface-tertiary/60 hover:border-border-muted'
              )}
            >
              <Icon
                className={cn(
                  'w-4 h-4 transition-colors',
                  isActive ? 'text-accent-blue' : 'text-text-secondary/70 group-hover:text-accent-blue'
                )}
              />
              <div>
                <p
                  className={cn(
                    'text-[12px] font-medium transition-colors',
                    isActive ? 'text-text-primary' : 'text-text-secondary group-hover:text-text-primary'
                  )}
                >
                  {item.label}
                </p>
                <p className="text-[10px] font-mono text-text-secondary/55">{item.sublabel}</p>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Bottom */}
      <div className="p-3 border-t border-border-muted space-y-1">
        <Link
          href="/panduan"
          className="flex items-center gap-3 px-3 py-2 rounded border border-transparent hover:bg-surface-tertiary/60 hover:border-border-muted transition-all duration-200 group"
        >
          <BookOpen className="w-4 h-4 text-text-secondary/70 group-hover:text-accent-blue transition-colors" />
          <span className="text-[11px] text-text-secondary group-hover:text-text-primary transition-colors">
            {t.guide}
          </span>
        </Link>
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2 rounded border border-transparent hover:bg-surface-tertiary/60 hover:border-border-muted transition-all duration-200 group"
        >
          <Settings className="w-4 h-4 text-text-secondary/70 group-hover:text-accent-blue transition-colors" />
          <span className="text-[11px] text-text-secondary group-hover:text-text-primary transition-colors">
            {t.settings}
          </span>
        </Link>

        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-accent-blue/15 border border-accent-blue/35 flex items-center justify-center text-[11px] font-semibold text-accent-blue flex-shrink-0">
            {user.initials}
          </div>
          <div>
            <p className="text-[11px] font-medium text-text-primary">{user.name}</p>
            <p className="text-[9px] text-text-secondary">{user.roleLabel}</p>
            <span className="text-[9px] bg-accent-blue/12 text-accent-blue px-2 py-0.5 rounded-full border border-accent-blue/30 uppercase tracking-wider font-mono mt-1 inline-block">
              {user.planLabel}
            </span>
          </div>
        </div>
      </div>
      </nav>
    </>
  )
}
