'use client'

// Papan Kanban lintas/dalam-voyage (Fase 7d, K91/K92). Lima kolom TETAP — bukan
// data, K91 — memakai HTML5 drag-and-drop bawaan (draggable/onDragStart/
// onDragOver/onDrop). Tidak ada dependensi DnD baru: package.json belum punya
// satu pun (@dnd-kit/react-beautiful-dnd dsb.), dan lingkup ini tidak butuhnya.
//
// Kartu dipindah ke KOLOM lain → dua panggilan BERURUTAN, persis komentar di
// api/tasks/[id]/order/route.ts: POST /status (ganti kolom) lalu POST /order
// (tempatkan di posisi jatuhnya) — bukan satu panggilan gabungan, karena
// keduanya memang dua mesin murni berbeda (K91 vs K92). Kartu dipindah dalam
// kolom yang SAMA → hanya POST /order.
//
// Target transisi yang boleh diseret dihitung dari `transisiTersediaTugas()`
// (task-status.ts, MURNI) dengan peran pengguna sekarang — BUKAN daftar
// di-hardcode di sini (K51/§12/6). Kolom yang bukan target sah menolak drop
// SEBELUM sampai ke server (server tetap menolak ulang bila somehow lolos).
//
// State lokal HANYA berubah sesudah respons API sukses (tidak ada optimistic
// update mendahului konfirmasi) — itu yang membuat "status berubah DAN tetap
// berubah sesudah reload" bisa dibuktikan, bukan cuma tampilan yang berubah
// duluan lalu diam-diam batal kalau request gagal.

import { useRef, useState, type DragEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang, useT, type Lang } from '@/lib/i18n'
import { transisiTersediaTugas } from '@/services/ops/task-status'
import type { Role } from '@prisma/client'
import { TaskCard } from './TaskCard'
import { BlockedReasonDialog } from './BlockedReasonDialog'
import {
  TASK_STATUSES,
  TASK_STATUS_COLOR,
  STATUS_LABEL_ID,
  STATUS_LABEL_EN,
  CAN_MANAGE_TASKS,
  type TaskRow,
  type TaskStatusStr,
  type UserOption,
} from './task-shared'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    empty: 'Tidak ada tugas',
    errMove: 'Gagal memindah tugas.',
    errConn: 'Gagal terhubung ke server.',
    errTransisi: 'Transisi status ini tidak diperbolehkan.',
  },
  en: {
    empty: 'No tasks',
    errMove: 'Failed to move task.',
    errConn: 'Failed to connect to server.',
    errTransisi: 'This status transition is not allowed.',
  },
}

type PendingBlock = { taskId: string; targetIndex: number }

export function TaskBoard({
  tasks,
  users,
  role,
  onMutated,
  onOpenTask,
}: {
  tasks: readonly TaskRow[]
  users: readonly UserOption[]
  role: Role
  onMutated: (updated: TaskRow) => void
  onOpenTask: (task: TaskRow) => void
}) {
  const t = useT(STR)
  const { lang } = useLang()
  const router = useRouter()
  const statusLabel = lang === 'id' ? STATUS_LABEL_ID : STATUS_LABEL_EN

  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overInfo, setOverInfo] = useState<{ status: TaskStatusStr; index: number } | null>(null)
  const [movingId, setMovingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [pendingBlock, setPendingBlock] = useState<PendingBlock | null>(null)
  const [blockReason, setBlockReason] = useState('')
  const columnRefs = useRef<Partial<Record<TaskStatusStr, HTMLDivElement | null>>>({})

  const canDrag = CAN_MANAGE_TASKS.includes(role)

  const byColumn = (status: TaskStatusStr) =>
    tasks.filter((tk) => tk.status === status).sort((a, b) => a.boardOrder - b.boardOrder)

  function otherCardsIndex(status: TaskStatusStr, excludeId: string, clientY: number): number {
    const container = columnRefs.current[status]
    if (!container) return 0
    const els = Array.from(container.querySelectorAll<HTMLElement>('[data-task-id]')).filter(
      (el) => el.dataset.taskId !== excludeId,
    )
    for (let i = 0; i < els.length; i++) {
      const rect = els[i].getBoundingClientRect()
      if (clientY < rect.top + rect.height / 2) return i
    }
    return els.length
  }

  function handleDragStart(e: DragEvent<HTMLDivElement>, task: TaskRow) {
    if (!canDrag) {
      e.preventDefault()
      return
    }
    e.dataTransfer.setData('text/plain', task.id)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingId(task.id)
    setError('')
  }

  function handleDragEnd() {
    setDraggingId(null)
    setOverInfo(null)
  }

  function handleColumnDragOver(e: DragEvent<HTMLDivElement>, status: TaskStatusStr) {
    if (!draggingId) return
    e.preventDefault()
    const index = otherCardsIndex(status, draggingId, e.clientY)
    setOverInfo({ status, index })
  }

  async function performMove(task: TaskRow, targetStatus: TaskStatusStr, targetIndex: number, blockedReason?: string) {
    setMovingId(task.id)
    setError('')
    try {
      if (targetStatus !== task.status) {
        const res = await fetch(`/api/tasks/${task.id}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: targetStatus, blockedReason }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          setError(body?.error?.message ?? t.errMove)
          return
        }
        const statusBody = await res.json()
        onMutated(statusBody.tugas)
      }

      const orderRes = await fetch(`/api/tasks/${task.id}/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ indeksTujuan: targetIndex }),
      })
      if (!orderRes.ok) {
        const body = await orderRes.json().catch(() => null)
        setError(body?.error?.message ?? t.errMove)
        return
      }
      const orderBody = await orderRes.json()
      onMutated(orderBody.tugas)
      router.refresh()
    } catch {
      setError(t.errConn)
    } finally {
      setMovingId(null)
      setDraggingId(null)
      setOverInfo(null)
    }
  }

  function handleColumnDrop(e: DragEvent<HTMLDivElement>, status: TaskStatusStr) {
    e.preventDefault()
    const taskId = e.dataTransfer.getData('text/plain')
    const task = tasks.find((tk) => tk.id === taskId)
    setOverInfo(null)
    setDraggingId(null)
    if (!task || !canDrag) return

    const index = otherCardsIndex(status, task.id, e.clientY)

    if (status !== task.status) {
      // §12/6 — daftar sah datang dari mesin murni, bukan hard-code di sini.
      const boleh = transisiTersediaTugas(task.status, role)
      if (!boleh.includes(status)) {
        setError(t.errTransisi)
        return
      }
      if (status === 'BLOCKED') {
        setPendingBlock({ taskId: task.id, targetIndex: index })
        setBlockReason('')
        return
      }
    }

    void performMove(task, status, index)
  }

  function confirmBlock() {
    if (!pendingBlock || !blockReason.trim()) return
    const task = tasks.find((tk) => tk.id === pendingBlock.taskId)
    if (!task) return
    void performMove(task, 'BLOCKED', pendingBlock.targetIndex, blockReason.trim())
    setPendingBlock(null)
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-status-danger text-xs bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {TASK_STATUSES.map((status) => {
          const col = byColumn(status)
          const isOver = overInfo?.status === status
          return (
            <div key={status} className="min-w-0">
              <div className="flex items-center justify-between mb-2 px-0.5">
                <span
                  className={cn(
                    'text-[10px] px-2 py-0.5 rounded-full border font-mono uppercase tracking-wider',
                    TASK_STATUS_COLOR[status],
                  )}
                >
                  {statusLabel[status]}
                </span>
                <span className="text-[10px] text-text-secondary font-mono">{col.length}</span>
              </div>

              <div
                ref={(el) => {
                  columnRefs.current[status] = el
                }}
                onDragOver={(e) => handleColumnDragOver(e, status)}
                onDrop={(e) => handleColumnDrop(e, status)}
                className={cn(
                  'rounded-md border min-h-[120px] p-1.5 space-y-1.5 transition-colors',
                  isOver ? 'border-accent-blue/50 bg-accent-blue/5' : 'border-card-border/40 bg-surface/20',
                )}
              >
                {col.length === 0 && (
                  <p className="text-[11px] text-text-secondary/50 text-center py-6">{t.empty}</p>
                )}
                {col.map((task) => (
                  <div key={task.id} data-task-id={task.id} className="relative">
                    <TaskCard
                      task={task}
                      users={users}
                      draggable={canDrag}
                      onDragStart={(e) => handleDragStart(e, task)}
                      onDragEnd={handleDragEnd}
                      isDragging={draggingId === task.id}
                      onClick={() => onOpenTask(task)}
                    />
                    {movingId === task.id && (
                      <div className="absolute inset-0 flex items-center justify-center bg-surface/60 rounded-md">
                        <Loader2 className="w-4 h-4 animate-spin text-accent-blue" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <BlockedReasonDialog
        open={pendingBlock !== null}
        reason={blockReason}
        onReasonChange={setBlockReason}
        onConfirm={confirmBlock}
        onCancel={() => setPendingBlock(null)}
        busy={movingId === pendingBlock?.taskId}
      />
    </div>
  )
}
