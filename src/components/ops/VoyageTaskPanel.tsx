'use client'

// Tab "Tugas" di Voyage Workspace (Fase 7d, §15 butir 1). Papan Kanban mini
// ATAU daftar — dokumen desain sengaja membiarkan pilihannya bebas untuk tab
// voyage ini; KEPUTUSAN di sini: bawaannya DAFTAR (lebih ringkas dalam ruang
// tab yang sempit), dengan tombol untuk berpindah ke papan bila operator ingin
// menyeret kartu antar-kolom. Papan penuh lintas-voyage (/tasks) sebaliknya
// papan-dulu (lihat TasksPageClient) — keduanya memakai TaskBoard/TaskList
// yang SAMA, hanya bawaannya berbeda.
//
// Ringkasan "N dari M selesai · K terlambat" dihitung ULANG di klien dari
// `nilaiSla()` (sama alasan SlaBadge: keadaan SLA berubah tiap detik) —
// bukan cuma menghitung field `sla.keadaan` yang dibekukan pada saat fetch.

import { useMemo, useState } from 'react'
import { LayoutGrid, List, ListChecks, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT, type Lang } from '@/lib/i18n'
import type { Role } from '@prisma/client'
import { nilaiSla } from '@/services/ops/sla'
import { AMBANG_MENDEKATI_JAM } from '@/services/ops/sla-policy'
import type { TanggalJangkar } from '@/services/ops/task-schedule'
import { TaskBoard } from './TaskBoard'
import { TaskList } from './TaskList'
import { TaskDialog } from './TaskDialog'
import { ApplyTemplateDialog } from './ApplyTemplateDialog'
import { CAN_MANAGE_TASKS, type TaskRow, type UserOption } from './task-shared'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    addTask: 'Tugas Baru', applyChecklist: 'Terapkan Checklist',
    viewBoard: 'Papan', viewList: 'Daftar',
    doneOf: 'dari', doneWord: 'selesai', lateWord: 'terlambat',
    empty: 'Belum ada tugas pada voyage ini. Terapkan checklist atau buat tugas baru.',
  },
  en: {
    addTask: 'New Task', applyChecklist: 'Apply Checklist',
    viewBoard: 'Board', viewList: 'List',
    doneOf: 'of', doneWord: 'done', lateWord: 'overdue',
    empty: 'No tasks on this voyage yet. Apply a checklist or create a task.',
  },
}

export function VoyageTaskPanel({
  voyageId,
  initialTasks,
  users,
  role,
  currentUserId,
  voyageAnchors,
}: {
  voyageId: string
  initialTasks: TaskRow[]
  users: UserOption[]
  role: Role
  currentUserId: string
  voyageAnchors: TanggalJangkar
}) {
  const t = useT(STR)
  const [tasks, setTasks] = useState(initialTasks)
  const [view, setView] = useState<'list' | 'board'>('list')
  const [dialogTask, setDialogTask] = useState<TaskRow | null | undefined>(undefined)
  const [applyOpen, setApplyOpen] = useState(false)

  const boleh = CAN_MANAGE_TASKS.includes(role)

  function mergeTask(updated: TaskRow) {
    setTasks((prev) => {
      const exists = prev.some((tk) => tk.id === updated.id)
      return exists ? prev.map((tk) => (tk.id === updated.id ? updated : tk)) : [...prev, updated]
    })
  }

  async function handleApplied() {
    // K95 — respons apply-template tidak membawa daftar tugas yang lahir
    // (hanya hitungannya, ditampilkan di dalam ApplyTemplateDialog sendiri).
    // `router.refresh()` menyegarkan RSC lain di halaman (mis. tab lain),
    // tapi state lokal panel ini (useState sekali di mount) tidak ikut
    // berubah dari situ — jadi disegarkan eksplisit di sini lewat fetch yang
    // SAMA persis dengan yang dipakai page.tsx (listTasks ber-voyageId),
    // supaya tugas baru langsung terlihat tanpa reload manual.
    const res = await fetch(`/api/voyages/${voyageId}/tasks`)
    if (res.ok) setTasks(await res.json())
  }

  const { total, done, late } = useMemo(() => {
    const sekarang = new Date()
    const relevan = tasks.filter((tk) => tk.status !== 'CANCELLED')
    const doneCount = relevan.filter((tk) => tk.status === 'DONE').length
    const lateCount = relevan.filter((tk) => {
      const hasil = nilaiSla({
        dueAt: tk.dueAt ? new Date(tk.dueAt) : null,
        completedAt: tk.completedAt ? new Date(tk.completedAt) : null,
        slaHours: tk.slaHours,
        sekarang,
        ambangMendekatiJam: AMBANG_MENDEKATI_JAM,
      })
      return hasil.keadaan === 'TERLAMBAT' || hasil.keadaan === 'DILANGGAR'
    }).length
    return { total: relevan.length, done: doneCount, late: lateCount }
  }, [tasks])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 text-xs text-text-secondary">
          {total > 0 && (
            <>
              <span className="font-mono">
                {done} {t.doneOf} {total} {t.doneWord}
              </span>
              {late > 0 && (
                <span className="text-status-danger font-mono">
                  · {late} {t.lateWord}
                </span>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded border border-border-muted overflow-hidden">
            <button
              type="button"
              onClick={() => setView('list')}
              className={cn(
                'p-1.5 transition-colors',
                view === 'list' ? 'bg-accent-blue/15 text-accent-blue' : 'text-text-secondary hover:text-text-primary',
              )}
              title={t.viewList}
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setView('board')}
              className={cn(
                'p-1.5 transition-colors border-l border-border-muted',
                view === 'board' ? 'bg-accent-blue/15 text-accent-blue' : 'text-text-secondary hover:text-text-primary',
              )}
              title={t.viewBoard}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>

          {boleh && (
            <>
              <button
                type="button"
                onClick={() => setApplyOpen(true)}
                className="inline-flex items-center gap-1.5 rounded border border-border-muted px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:text-white hover:border-accent-blue/60 hover:bg-surface-tertiary transition-colors"
              >
                <ListChecks className="w-3.5 h-3.5" /> {t.applyChecklist}
              </button>
              <button
                type="button"
                onClick={() => setDialogTask(null)}
                className="inline-flex items-center gap-1.5 bg-accent-blue hover:bg-primary text-[#231a06] rounded px-3 py-1.5 text-xs font-medium transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> {t.addTask}
              </button>
            </>
          )}
        </div>
      </div>

      {tasks.length === 0 ? (
        <p className="text-text-secondary text-sm text-center py-10">{t.empty}</p>
      ) : view === 'board' ? (
        <TaskBoard
          tasks={tasks}
          users={users}
          role={role}
          onMutated={mergeTask}
          onOpenTask={(tk) => setDialogTask(tk)}
        />
      ) : (
        <TaskList tasks={tasks} users={users} onMutated={mergeTask} onOpenTask={(tk) => setDialogTask(tk)} />
      )}

      <TaskDialog
        open={dialogTask !== undefined}
        onOpenChange={(o) => !o && setDialogTask(undefined)}
        task={dialogTask ?? null}
        role={role}
        currentUserId={currentUserId}
        users={users}
        fixedVoyageId={voyageId}
        voyageAnchors={voyageAnchors}
        onSaved={mergeTask}
      />

      <ApplyTemplateDialog
        open={applyOpen}
        onOpenChange={setApplyOpen}
        voyageId={voyageId}
        onApplied={handleApplied}
      />
    </div>
  )
}
