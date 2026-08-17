'use client'

// Papan Kanban penuh lintas-voyage (Fase 7d, §15 butir 2) — `/tasks`, layar
// yang dibuka manajer operasi tiap pagi. Penyaring (voyage/penanggung jawab/
// kategori/keadaan SLA) hidup di URL query string — BUKAN di database (K91:
// "yang boleh berbeda per pengguna adalah PENYARING papan... dan itu tinggal
// di URL, bukan di database") — jadi bisa dibagikan/ditandai (bookmarkable).
//
// Bawaan Kanban (bukan daftar): ini layar pemindaian cepat lintas-voyage;
// VoyageTaskPanel (tab Tugas satu voyage) sebaliknya bawaan daftar — ruang
// tab yang sempit lebih cocok tabel ringkas. Sama komponen TaskBoard/TaskList,
// beda hanya bawaan tampilannya.

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { LayoutGrid, List, Plus } from 'lucide-react'
import type { Role } from '@prisma/client'
import { cn } from '@/lib/utils'
import { useLang, useT, type Lang } from '@/lib/i18n'
import { TaskBoard } from './TaskBoard'
import { TaskList } from './TaskList'
import { TaskDialog } from './TaskDialog'
import { CAN_MANAGE_TASKS, TASK_CATEGORIES, CATEGORY_LABEL_ID, CATEGORY_LABEL_EN, type TaskRow, type UserOption } from './task-shared'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    myTasks: 'Tugas Saya', allTasks: 'Semua Tugas', addTask: 'Tugas Baru',
    viewBoard: 'Papan', viewList: 'Daftar',
    fVoyage: 'Voyage', fCategory: 'Kategori', fDue: 'Tenggat',
    allVoyages: '— semua voyage —', allCategories: '— semua kategori —',
    dueAny: '— semua —', dueOverdue: 'Sudah lewat', due24: '24 jam ke depan', due7: '7 hari ke depan',
    officeTask: '(tugas kantor)', empty: 'Tidak ada tugas yang cocok dengan penyaring ini.',
    errLoad: 'Gagal memuat daftar tugas.',
  },
  en: {
    myTasks: 'My Tasks', allTasks: 'All Tasks', addTask: 'New Task',
    viewBoard: 'Board', viewList: 'List',
    fVoyage: 'Voyage', fCategory: 'Category', fDue: 'Due',
    allVoyages: '— all voyages —', allCategories: '— all categories —',
    dueAny: '— any —', dueOverdue: 'Overdue', due24: 'Next 24h', due7: 'Next 7 days',
    officeTask: '(office task)', empty: 'No tasks match this filter.',
    errLoad: 'Failed to load tasks.',
  },
}

export function TasksPageClient({
  initialTasks,
  users,
  voyages,
  role,
  currentUserId,
}: {
  initialTasks: TaskRow[]
  users: UserOption[]
  voyages: readonly { id: string; voyageNumber: string }[]
  role: Role
  currentUserId: string
}) {
  const t = useT(STR)
  const { lang } = useLang()
  const categoryLabel = lang === 'id' ? CATEGORY_LABEL_ID : CATEGORY_LABEL_EN
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const assignee = searchParams.get('assignee') ?? 'me'
  const voyageId = searchParams.get('voyageId') ?? ''
  const category = searchParams.get('category') ?? ''
  const due = searchParams.get('due') ?? ''

  const [tasks, setTasks] = useState(initialTasks)
  const [view, setView] = useState<'board' | 'list'>('board')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [dialogTask, setDialogTask] = useState<TaskRow | null | undefined>(undefined)
  const firstRun = useRef(true)

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.replace(`${pathname}?${params.toString()}`)
  }

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    const params = new URLSearchParams()
    if (assignee === 'me') params.set('assignee', 'me')
    if (voyageId) params.set('voyageId', voyageId)
    if (category) params.set('category', category)
    if (due) params.set('due', due)
    params.set('semua', '1')

    let batal = false
    setLoading(true)
    setError('')
    fetch(`/api/tasks?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: TaskRow[]) => !batal && setTasks(data))
      .catch(() => !batal && setError(t.errLoad))
      .finally(() => !batal && setLoading(false))
    return () => {
      batal = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignee, voyageId, category, due])

  function mergeTask(updated: TaskRow) {
    setTasks((prev) => {
      const exists = prev.some((tk) => tk.id === updated.id)
      // Tugas yang baru dibuat mungkin tak lagi cocok penyaring aktif (mis.
      // dibuat untuk voyage lain) — dibiarkan tampil sampai penyaring diganti
      // atau halaman disegarkan; lebih jujur daripada raib tanpa penjelasan.
      return exists ? prev.map((tk) => (tk.id === updated.id ? updated : tk)) : [...prev, updated]
    })
  }

  const boleh = CAN_MANAGE_TASKS.includes(role)
  const inputCls =
    'bg-surface border border-border-muted rounded px-2 py-1.5 text-xs text-text-primary focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/40'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex rounded border border-border-muted overflow-hidden">
          <button
            type="button"
            onClick={() => updateParam('assignee', 'me')}
            className={cn(
              'px-3 py-1.5 text-xs font-medium transition-colors',
              assignee === 'me' ? 'bg-accent-blue/15 text-accent-blue' : 'text-text-secondary hover:text-text-primary',
            )}
          >
            {t.myTasks}
          </button>
          <button
            type="button"
            onClick={() => updateParam('assignee', 'all')}
            className={cn(
              'px-3 py-1.5 text-xs font-medium transition-colors border-l border-border-muted',
              assignee === 'all' ? 'bg-accent-blue/15 text-accent-blue' : 'text-text-secondary hover:text-text-primary',
            )}
          >
            {t.allTasks}
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select value={voyageId} onChange={(e) => updateParam('voyageId', e.target.value)} className={inputCls}>
            <option value="">{t.allVoyages}</option>
            {voyages.map((v) => (
              <option key={v.id} value={v.id}>{v.voyageNumber}</option>
            ))}
          </select>
          <select value={category} onChange={(e) => updateParam('category', e.target.value)} className={inputCls}>
            <option value="">{t.allCategories}</option>
            {TASK_CATEGORIES.map((c) => (
              <option key={c} value={c}>{categoryLabel[c] ?? c}</option>
            ))}
          </select>
          <select value={due} onChange={(e) => updateParam('due', e.target.value)} className={inputCls}>
            <option value="">{t.dueAny}</option>
            <option value="lewat">{t.dueOverdue}</option>
            <option value="24j">{t.due24}</option>
            <option value="7h">{t.due7}</option>
          </select>

          <div className="inline-flex rounded border border-border-muted overflow-hidden">
            <button
              type="button"
              onClick={() => setView('board')}
              className={cn('p-1.5 transition-colors', view === 'board' ? 'bg-accent-blue/15 text-accent-blue' : 'text-text-secondary hover:text-text-primary')}
              title={t.viewBoard}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              className={cn('p-1.5 transition-colors border-l border-border-muted', view === 'list' ? 'bg-accent-blue/15 text-accent-blue' : 'text-text-secondary hover:text-text-primary')}
              title={t.viewList}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>

          {boleh && (
            <button
              type="button"
              onClick={() => setDialogTask(null)}
              className="inline-flex items-center gap-1.5 bg-accent-blue hover:bg-primary text-[#231a06] rounded px-3 py-1.5 text-xs font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> {t.addTask}
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="text-status-danger text-xs bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2">
          {error}
        </p>
      )}

      <div className={cn('transition-opacity', loading && 'opacity-50 pointer-events-none')}>
        {tasks.length === 0 ? (
          <p className="text-text-secondary text-sm text-center py-16">{t.empty}</p>
        ) : view === 'board' ? (
          <TaskBoard tasks={tasks} users={users} role={role} onMutated={mergeTask} onOpenTask={(tk) => setDialogTask(tk)} />
        ) : (
          <TaskList tasks={tasks} users={users} onMutated={mergeTask} onOpenTask={(tk) => setDialogTask(tk)} />
        )}
      </div>

      <TaskDialog
        open={dialogTask !== undefined}
        onOpenChange={(o) => !o && setDialogTask(undefined)}
        task={dialogTask ?? null}
        role={role}
        currentUserId={currentUserId}
        users={users}
        voyageOptions={voyages}
        onSaved={mergeTask}
      />
    </div>
  )
}
