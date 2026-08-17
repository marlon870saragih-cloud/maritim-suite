'use client'

// Daftar tugas (Fase 7d) — alternatif tabel dari TaskBoard, dipakai di tab
// Tugas Voyage Workspace (papan mini ATAU daftar, §15) dan bisa juga di /tasks.
// Penyaringan (assignee/status/due/category) tinggal di pemanggil (URL/props),
// sama seperti listTasks() di server — daftar ini hanya menyortir apa yang
// sudah diterima, dan itu murni tampilan (bukan aturan bisnis).
//
// Ganti status lewat dropdown memanggil transisiTersedia milik TIAP tugas
// (dikirim task.service.ts dari transisiTersediaTugas(), K51/§12/6) — tak ada
// daftar transisi ditulis ulang di sini.

import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang, useT, type Lang } from '@/lib/i18n'
import { SlaBadge } from './SlaBadge'
import { BlockedReasonDialog } from './BlockedReasonDialog'
import {
  TASK_STATUS_COLOR,
  TASK_PRIORITY_COLOR,
  STATUS_LABEL_ID,
  STATUS_LABEL_EN,
  PRIORITY_LABEL_ID,
  PRIORITY_LABEL_EN,
  CATEGORY_LABEL_ID,
  CATEGORY_LABEL_EN,
  namaPenanggungJawab,
  type TaskRow,
  type TaskStatusStr,
  type UserOption,
} from './task-shared'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    empty: 'Tidak ada tugas yang cocok dengan penyaring ini.',
    title: 'Judul', category: 'Kategori', priority: 'Prioritas', status: 'Status',
    assignee: 'Penanggung Jawab', due: 'Tenggat', unassigned: '— belum ditugaskan —',
    errMove: 'Gagal mengubah status.', errConn: 'Gagal terhubung ke server.',
  },
  en: {
    empty: 'No tasks match this filter.',
    title: 'Title', category: 'Category', priority: 'Priority', status: 'Status',
    assignee: 'Assignee', due: 'Due', unassigned: '— unassigned —',
    errMove: 'Failed to change status.', errConn: 'Failed to connect to server.',
  },
}

type SortKey = 'title' | 'priority' | 'status' | 'dueAt'
type PendingBlock = { taskId: string }

function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string
  active: boolean
  dir: 'asc' | 'desc'
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 hover:text-text-primary transition-colors"
    >
      {label}
      {active ? (
        dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
      ) : (
        <ArrowUpDown className="w-3 h-3 opacity-30" />
      )}
    </button>
  )
}

export function TaskList({
  tasks,
  users,
  onMutated,
  onOpenTask,
}: {
  tasks: readonly TaskRow[]
  users: readonly UserOption[]
  onMutated: (updated: TaskRow) => void
  onOpenTask: (task: TaskRow) => void
}) {
  const t = useT(STR)
  const { lang } = useLang()
  const statusLabel = lang === 'id' ? STATUS_LABEL_ID : STATUS_LABEL_EN
  const priorityLabel = lang === 'id' ? PRIORITY_LABEL_ID : PRIORITY_LABEL_EN
  const categoryLabel = lang === 'id' ? CATEGORY_LABEL_ID : CATEGORY_LABEL_EN

  const [sortKey, setSortKey] = useState<SortKey>('dueAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [pendingBlock, setPendingBlock] = useState<PendingBlock | null>(null)
  const [blockReason, setBlockReason] = useState('')

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = useMemo(() => {
    const arr = [...tasks]
    const mul = sortDir === 'asc' ? 1 : -1
    arr.sort((a, b) => {
      switch (sortKey) {
        case 'title':
          return a.title.localeCompare(b.title) * mul
        case 'priority':
          return a.priority.localeCompare(b.priority) * mul
        case 'status':
          return a.status.localeCompare(b.status) * mul
        case 'dueAt': {
          const av = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY
          const bv = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY
          return (av - bv) * mul
        }
      }
    })
    return arr
  }, [tasks, sortKey, sortDir])

  async function changeStatus(task: TaskRow, target: TaskStatusStr, blockedReason?: string) {
    setBusyId(task.id)
    setError('')
    try {
      const res = await fetch(`/api/tasks/${task.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: target, blockedReason }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error?.message ?? t.errMove)
        return
      }
      const body = await res.json()
      onMutated(body.tugas)
    } catch {
      setError(t.errConn)
    } finally {
      setBusyId(null)
    }
  }

  function handleStatusSelect(task: TaskRow, target: string) {
    if (!target || target === task.status) return
    const ts = target as TaskStatusStr
    if (ts === 'BLOCKED') {
      setPendingBlock({ taskId: task.id })
      setBlockReason('')
      return
    }
    void changeStatus(task, ts)
  }

  function confirmBlock() {
    if (!pendingBlock || !blockReason.trim()) return
    const task = tasks.find((tk) => tk.id === pendingBlock.taskId)
    setPendingBlock(null)
    if (!task) return
    void changeStatus(task, 'BLOCKED', blockReason.trim())
  }

  const fmtDue = (d: string | null) => {
    if (!d) return '—'
    const v = new Date(d)
    return Number.isNaN(v.getTime())
      ? '—'
      : v.toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  if (sorted.length === 0) {
    return <p className="text-text-secondary text-sm text-center py-10">{t.empty}</p>
  }

  return (
    <div className="overflow-x-auto">
      {error && (
        <p className="text-status-danger text-xs bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2 mb-3">
          {error}
        </p>
      )}
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="text-text-secondary font-mono uppercase tracking-widest text-[10px] border-b border-card-border/50">
            <th className="px-3 py-2 font-medium">
              <SortHeader label={t.title} active={sortKey === 'title'} dir={sortDir} onClick={() => toggleSort('title')} />
            </th>
            <th className="px-3 py-2 font-medium">{t.category}</th>
            <th className="px-3 py-2 font-medium">
              <SortHeader label={t.priority} active={sortKey === 'priority'} dir={sortDir} onClick={() => toggleSort('priority')} />
            </th>
            <th className="px-3 py-2 font-medium">
              <SortHeader label={t.status} active={sortKey === 'status'} dir={sortDir} onClick={() => toggleSort('status')} />
            </th>
            <th className="px-3 py-2 font-medium">{t.assignee}</th>
            <th className="px-3 py-2 font-medium">
              <SortHeader label={t.due} active={sortKey === 'dueAt'} dir={sortDir} onClick={() => toggleSort('dueAt')} />
            </th>
          </tr>
        </thead>
        <tbody className="text-sm">
          {sorted.map((task) => {
            const assigneeName = namaPenanggungJawab(users, task.assigneeUserId)
            const isBusy = busyId === task.id
            return (
              <tr
                key={task.id}
                className="border-b border-card-border/30 last:border-0 hover:bg-surface-tertiary/20 transition-colors"
              >
                <td className="px-3 py-2.5 align-top max-w-[280px]">
                  <button
                    type="button"
                    onClick={() => onOpenTask(task)}
                    className="text-text-primary hover:text-accent-blue text-left transition-colors"
                  >
                    {task.title}
                  </button>
                  {task.status === 'BLOCKED' && task.blockedReason && (
                    <p className="text-[10px] text-status-danger/90 mt-0.5">{task.blockedReason}</p>
                  )}
                </td>
                <td className="px-3 py-2.5 align-top text-text-secondary text-xs">
                  {task.category ? (categoryLabel[task.category] ?? task.category) : '—'}
                </td>
                <td className="px-3 py-2.5 align-top">
                  <span
                    className={cn(
                      'text-[9px] px-1.5 py-0.5 rounded-full border font-mono uppercase tracking-wider',
                      TASK_PRIORITY_COLOR[task.priority],
                    )}
                  >
                    {priorityLabel[task.priority]}
                  </span>
                </td>
                <td className="px-3 py-2.5 align-top">
                  <div className="flex items-center gap-1.5">
                    {isBusy && <Loader2 className="w-3 h-3 animate-spin text-accent-blue" />}
                    <select
                      value={task.status}
                      disabled={isBusy}
                      onChange={(e) => handleStatusSelect(task, e.target.value)}
                      className={cn(
                        'text-[10px] px-1.5 py-1 rounded-full border font-mono uppercase tracking-wider bg-transparent disabled:opacity-50',
                        TASK_STATUS_COLOR[task.status],
                      )}
                    >
                      <option value={task.status}>{statusLabel[task.status]}</option>
                      {task.transisiTersedia
                        .filter((s) => s !== task.status)
                        .map((s) => (
                          <option key={s} value={s} className="bg-surface-secondary text-text-primary">
                            {statusLabel[s]}
                          </option>
                        ))}
                    </select>
                  </div>
                </td>
                <td className="px-3 py-2.5 align-top text-text-secondary text-xs">
                  {assigneeName ?? t.unassigned}
                </td>
                <td className="px-3 py-2.5 align-top">
                  <div className="flex items-center gap-2">
                    <span className="text-text-secondary text-xs font-mono">{fmtDue(task.dueAt)}</span>
                    <SlaBadge dueAt={task.dueAt} completedAt={task.completedAt} slaHours={task.slaHours} />
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <BlockedReasonDialog
        open={pendingBlock !== null}
        reason={blockReason}
        onReasonChange={setBlockReason}
        onConfirm={confirmBlock}
        onCancel={() => setPendingBlock(null)}
        busy={busyId === pendingBlock?.taskId}
      />
    </div>
  )
}
