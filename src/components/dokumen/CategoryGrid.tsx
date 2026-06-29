'use client'

import { useRouter } from 'next/navigation'
import { ClipboardList, Ship, Receipt, Users, type LucideIcon } from 'lucide-react'

type Category = {
  id: string
  title: string
  count: number
  icon: LucideIcon
  tags: string[]
  href: string
  bar: string
  iconText: string
  badge: string
  hoverBorder: string
}

// Class warna ditulis literal (bukan template) agar Tailwind JIT meng-generate-nya.
const CATEGORIES: Category[] = [
  {
    id: 'fal',
    title: 'FAL Forms',
    count: 7,
    icon: ClipboardList,
    tags: ['FAL 1', 'FAL 5', 'FAL 2'],
    href: '/dokumen/new/FAL_1',
    bar: 'bg-accent-blue',
    iconText: 'text-accent-blue',
    badge: 'bg-accent-blue/10 text-accent-blue',
    hoverBorder: 'hover:border-accent-blue/50',
  },
  {
    id: 'portcall',
    title: 'Port Call Ops',
    count: 8,
    icon: Ship,
    tags: ['NOR', 'SOF', 'Arrival', 'Departure'],
    href: '/dokumen/new/SOF',
    bar: 'bg-accent-teal',
    iconText: 'text-accent-teal',
    badge: 'bg-accent-teal/10 text-accent-teal',
    hoverBorder: 'hover:border-accent-teal/50',
  },
  {
    id: 'clearance',
    title: 'Clearance & SIB',
    count: 5,
    icon: Receipt,
    tags: ['Agency Appt.', 'SIB'],
    href: '/dokumen/new/AGENCY_APPOINTMENT',
    bar: 'bg-accent-amber',
    iconText: 'text-accent-amber',
    badge: 'bg-accent-amber/10 text-accent-amber',
    hoverBorder: 'hover:border-accent-amber/50',
  },
  {
    id: 'crew',
    title: 'Crew & Husbandry',
    count: 4,
    icon: Users,
    tags: ['Crew List', 'Sign-On'],
    href: '/dokumen/new/FAL_5',
    bar: 'bg-accent-purple',
    iconText: 'text-accent-purple',
    badge: 'bg-accent-purple/10 text-accent-purple',
    hoverBorder: 'hover:border-accent-purple/50',
  },
]

export function CategoryGrid() {
  const router = useRouter()

  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {CATEGORIES.map((cat) => {
        const Icon = cat.icon
        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => router.push(cat.href)}
            className={`text-left bg-card-bg border border-card-border rounded-lg p-5 relative
                        overflow-hidden group transition-colors cursor-pointer ${cat.hoverBorder}`}
          >
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${cat.bar}`} />
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 bg-surface-tertiary rounded-md ${cat.iconText}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="font-display text-lg text-white">{cat.title}</h3>
              </div>
              <span className={`px-2 py-1 rounded text-xs font-mono ${cat.badge}`}>
                {cat.count} dokumen
              </span>
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              {cat.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-1 bg-surface-tertiary border border-border-muted rounded
                             text-xs text-text-secondary font-mono uppercase"
                >
                  {tag}
                </span>
              ))}
            </div>
          </button>
        )
      })}
    </section>
  )
}
