// Papan Kanban penuh lintas-voyage (Fase 7d, §15 butir 2). Shell server:
// sesi + ambil tugas SESUAI filter URL saat ini (supaya render pertama tidak
// berkedip dari "semua" ke "milik saya"), sisanya interaktif di
// TasksPageClient (client) — pola sama dengan voyages/[id]/page.tsx.

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PageHeader } from '@/components/shared/PageHeader'
import { getLang, type Lang } from '@/lib/i18n-server'
import { requireTenant } from '@/services/context'
import { listTasks } from '@/services/ops/task.service'
import { TasksPageClient } from '@/components/ops/TasksPageClient'

export const dynamic = 'force-dynamic'

const PH: Record<Lang, { kicker: string; title: string; desc: string }> = {
  id: {
    kicker: 'Operasional', title: 'Tugas',
    desc: 'Papan Kanban lintas-voyage — checklist, jadwal, dan SLA tiap tugas dalam satu layar.',
  },
  en: {
    kicker: 'Operations', title: 'Tasks',
    desc: 'Cross-voyage Kanban board — every task’s checklist, schedule, and SLA in one screen.',
  },
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const t = PH[getLang()]
  const ctx = await requireTenant()
  const session = await getServerSession(authOptions)
  const tenantId = session!.user.tenantId

  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null
  const assignee = one(searchParams.assignee) ?? 'me'
  const voyageId = one(searchParams.voyageId)
  const category = one(searchParams.category)
  const due = one(searchParams.due)

  const [tasks, users, voyages] = await Promise.all([
    listTasks(ctx, {
      assignee: assignee === 'all' ? null : assignee,
      voyageId,
      category,
      due,
      termasukSelesai: true,
    }),
    prisma.user.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.voyage.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, voyageNumber: true },
      orderBy: { voyageNumber: 'desc' },
    }),
  ])

  return (
    <div className="p-margin-page max-w-[1600px] mx-auto space-y-6">
      <PageHeader kicker={t.kicker} title={t.title} description={t.desc} />
      <TasksPageClient
        initialTasks={JSON.parse(JSON.stringify(tasks))}
        users={users}
        voyages={voyages}
        role={session!.user.role}
        currentUserId={session!.user.id}
      />
    </div>
  )
}
