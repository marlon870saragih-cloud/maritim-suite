import { ShieldAlert } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { getLang, type Lang } from '@/lib/i18n-server'
import { requireTenant } from '@/services/context'
import { listTeam } from '@/services/user.service'
import { ServiceError } from '@/services/errors'
import { TeamManager } from '@/components/settings/TeamManager'

export const dynamic = 'force-dynamic'

const PH: Record<Lang, { kicker: string; title: string; desc: string; denied: string }> = {
  id: {
    kicker: 'Pengaturan', title: 'Tim', desc: 'Anggota tim, peran, dan akses masing-masing.',
    denied: 'Halaman ini hanya untuk ADMIN.',
  },
  en: {
    kicker: 'Settings', title: 'Team', desc: 'Team members, roles, and each person’s access.',
    denied: 'This page is ADMIN-only.',
  },
}

export default async function TeamPage() {
  const t = PH[getLang()]
  const ctx = await requireTenant()

  try {
    const members = await listTeam(ctx)
    return (
      <div className="p-margin-page max-w-[1200px] mx-auto space-y-6">
        <PageHeader kicker={t.kicker} title={t.title} description={t.desc} />
        <TeamManager
          members={members.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }))}
          currentUserId={ctx.userId}
        />
      </div>
    )
  } catch (e) {
    if (e instanceof ServiceError && e.code === 'FORBIDDEN') {
      return (
        <div className="p-margin-page max-w-[1200px] mx-auto space-y-6">
          <PageHeader kicker={t.kicker} title={t.title} description={t.desc} />
          <div className="bg-card-bg border border-card-border rounded-lg p-10 text-center">
            <ShieldAlert className="w-8 h-8 text-text-secondary mx-auto mb-3" />
            <p className="text-text-secondary text-sm">{t.denied}</p>
          </div>
        </div>
      )
    }
    throw e
  }
}
