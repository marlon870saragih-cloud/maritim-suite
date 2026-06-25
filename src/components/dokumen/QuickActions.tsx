'use client'

import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'

export function QuickActions() {
  const router = useRouter()

  return (
    <section className="flex flex-wrap gap-3">
      <button
        type="button"
        onClick={() => router.push('/dokumen/new/FAL_BUNDLE')}
        className="bg-[#2E86DE] hover:bg-accent-blue text-white px-5 py-2 rounded
                   font-mono uppercase tracking-wider text-sm transition-colors flex items-center gap-2"
      >
        <Plus className="w-[18px] h-[18px]" />
        FAL Bundle
      </button>
      <button
        type="button"
        onClick={() => router.push('/dokumen/new/ARRIVAL_REPORT')}
        className="bg-surface-tertiary hover:bg-[#162844] border border-border-muted text-text-primary
                   px-5 py-2 rounded font-mono uppercase tracking-wider text-sm transition-colors"
      >
        Arrival Report
      </button>
      <button
        type="button"
        onClick={() => router.push('/dokumen/new/SOF')}
        className="bg-surface-tertiary hover:bg-[#162844] border border-border-muted text-text-primary
                   px-5 py-2 rounded font-mono uppercase tracking-wider text-sm transition-colors"
      >
        Statement of Facts
      </button>
    </section>
  )
}
