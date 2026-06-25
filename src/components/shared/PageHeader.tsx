import type { ReactNode } from 'react'

export function PageHeader({
  kicker,
  title,
  description,
  action,
}: {
  kicker: string
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <section className="flex items-end justify-between gap-4 flex-wrap">
      <div className="space-y-1">
        <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest">{kicker}</p>
        <h1 className="font-display text-[22px] text-[#C8DCF8] leading-tight">{title}</h1>
        {description && <p className="text-text-secondary text-sm">{description}</p>}
      </div>
      {action}
    </section>
  )
}
