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
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  {
    id: 'finance',
    label: 'Finance Generator',
    sublabel: 'EPDA · FPDA · Invoice',
    href: '/finance',
    icon: DollarSign,
  },
  {
    id: 'dokumen',
    label: 'Maritime Dokumen',
    sublabel: 'FAL · SOF · NOR · Clearance',
    href: '/dokumen',
    icon: FileText,
    count: 29,
  },
  {
    id: 'portcall',
    label: 'Port Call Manager',
    sublabel: 'Status · Timeline · Task',
    href: '/portcall',
    icon: Ship,
  },
  {
    id: 'tracker',
    label: 'DA & Invoice Tracker',
    sublabel: 'Outstanding · Aging',
    href: '/tracker',
    icon: BarChart3,
    locked: true,
  },
] as const

export type ChromeUser = {
  name: string
  initials: string
  roleLabel: string
  planLabel: string
  trialDaysLeft: number | null
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

  return (
    <nav
      className="w-[240px] h-screen fixed left-0 top-0
                 bg-surface-secondary border-r border-border-muted
                 flex flex-col z-20"
    >
      {/* Brand */}
      <div className="px-4 py-5 border-b border-border-muted">
        <div className="flex items-center gap-3 mb-1">
          <div
            className="w-8 h-8 rounded bg-accent-blue/20 flex items-center
                       justify-center border border-accent-blue/30"
          >
            <Ship className="w-4 h-4 text-accent-blue" />
          </div>
          <span className="font-display text-base text-text-primary font-normal">
            Maritime Suite
          </span>
        </div>
        <p className="text-[10px] text-text-secondary uppercase tracking-widest ml-11 font-mono">
          PT Tribuana Solusi Maritim
        </p>
      </div>

      {/* Navigation */}
      <div className="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
        <p className="px-3 py-2 text-[9px] text-border-muted uppercase tracking-widest font-mono">
          Menu Utama
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
                'flex items-center gap-3 px-3 py-2.5 rounded relative',
                'border transition-all duration-200 group',
                isActive
                  ? 'bg-[#0D2A50] border-[#1D4A8A] text-white'
                  : isLocked
                    ? 'border-transparent text-text-secondary opacity-40 cursor-not-allowed'
                    : 'border-transparent text-text-secondary hover:bg-[#0D2244] hover:border-[#1A3A6A]'
              )}
            >
              {/* Active indicator */}
              <div
                className={cn(
                  'absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r',
                  'transition-all duration-200',
                  isActive
                    ? 'h-[70%] bg-accent-teal'
                    : 'h-0 group-hover:h-[60%] group-hover:bg-accent-blue'
                )}
              />

              <Icon
                className={cn(
                  'w-4 h-4 flex-shrink-0 transition-colors duration-200',
                  isActive ? 'text-accent-teal' : 'text-[#3D5A80] group-hover:text-accent-blue'
                )}
              />

              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    'text-[12px] font-medium truncate transition-colors duration-200',
                    isActive ? 'text-white' : 'text-[#4A6A8A] group-hover:text-[#B8D4F8]'
                  )}
                >
                  {item.label}
                </p>
                <p
                  className={cn(
                    'text-[10px] truncate transition-colors duration-200',
                    isActive ? 'text-accent-blue/70' : 'text-[#1E3A5F] group-hover:text-[#3A5A7A]'
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
                      ? 'bg-[#0A1E3A] text-accent-teal border-[#0D4A3A]'
                      : 'bg-[#0D2A50] text-accent-blue border-[#1A3A6A]'
                  )}
                >
                  {item.count}
                </span>
              )}

              {isLocked && <Lock className="w-3 h-3 text-[#1A2E45] flex-shrink-0" />}
            </Link>
          )
        })}

        {/* Master Data section */}
        <p className="px-3 py-2 mt-4 text-[9px] text-border-muted uppercase tracking-widest font-mono">
          Master Data
        </p>
        {[
          {
            href: '/settings/vessels',
            label: 'Vessel Database',
            sublabel: `${vesselCount} kapal`,
            icon: Database,
          },
          {
            href: '/settings/principals',
            label: 'Principal & Kontak',
            sublabel: `${principalCount} principal`,
            icon: Building2,
          },
        ].map((item) => {
          const isActive = pathname.startsWith(item.href)
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded relative',
                'border transition-all duration-200 group',
                isActive
                  ? 'bg-[#0D2A50] border-[#1D4A8A]'
                  : 'border-transparent text-text-secondary hover:bg-[#0D2244] hover:border-[#1A3A6A]'
              )}
            >
              <Icon className="w-4 h-4 text-[#3D5A80] group-hover:text-accent-blue transition-colors" />
              <div>
                <p className="text-[12px] font-medium text-[#4A6A8A] group-hover:text-[#B8D4F8] transition-colors">
                  {item.label}
                </p>
                <p className="text-[10px] text-[#1E3A5F]">{item.sublabel}</p>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Bottom */}
      <div className="p-3 border-t border-border-muted space-y-1">
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2 rounded border border-transparent
                     text-text-secondary hover:bg-[#0D2244] hover:border-[#1A3A6A]
                     transition-all duration-200 group"
        >
          <Settings className="w-4 h-4 text-[#2A4A6A] group-hover:text-accent-blue transition-colors" />
          <span className="text-[11px] text-[#2A4A6A] group-hover:text-[#7AAAD8] transition-colors">
            Pengaturan
          </span>
        </Link>

        <div className="flex items-center gap-3 px-3 py-2">
          <div
            className="w-8 h-8 rounded-full bg-[#0D3060] border border-[#1A3A6A]
                       flex items-center justify-center text-[11px] font-semibold text-accent-blue flex-shrink-0"
          >
            {user.initials}
          </div>
          <div>
            <p className="text-[11px] font-medium text-[#4A7A9A]">{user.name}</p>
            <p className="text-[9px] text-[#1E3A5F]">{user.roleLabel}</p>
            <span
              className="text-[9px] bg-[#041E38] text-accent-teal px-2 py-0.5 rounded-full
                         border border-[#0D4A3A] uppercase tracking-wider font-mono mt-1 inline-block"
            >
              {user.planLabel}
            </span>
          </div>
        </div>
      </div>
    </nav>
  )
}
