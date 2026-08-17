'use client'

// Satu kartu Kanban (Fase 7d). Presentational murni: seluruh keputusan (boleh
// digeser ke mana, siapa penanggung jawabnya) datang lewat props dari
// TaskBoard/TaskList — kartu ini tidak pernah memanggil API sendiri.

import type { DragEvent } from 'react'
import { User, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang, useT, type Lang } from '@/lib/i18n'
import { SlaBadge } from './SlaBadge'
import {
  TASK_PRIORITY_COLOR,
  PRIORITY_LABEL_ID,
  PRIORITY_LABEL_EN,
  CATEGORY_LABEL_ID,
  CATEGORY_LABEL_EN,
  namaPenanggungJawab,
  type TaskRow,
  type UserOption,
} from './task-shared'

const STR: Record<Lang, Record<string, string>> = {
  id: { unassigned: 'Belum ditugaskan', blocked: 'Macet:' },
  en: { unassigned: 'Unassigned', blocked: 'Blocked:' },
}

export function TaskCard({
  task,
  users,
  onClick,
  draggable = false,
  onDragStart,
  onDragEnd,
  isDragging = false,
  className,
}: {
  task: TaskRow
  users: readonly UserOption[]
  onClick?: () => void
  draggable?: boolean
  onDragStart?: (e: DragEvent<HTMLDivElement>) => void
  onDragEnd?: (e: DragEvent<HTMLDivElement>) => void
  isDragging?: boolean
  className?: string
}) {
  const t = useT(STR)
  const { lang } = useLang()
  const assigneeName = namaPenanggungJawab(users, task.assigneeUserId)
  const priorityLabel = (lang === 'id' ? PRIORITY_LABEL_ID : PRIORITY_LABEL_EN)[task.priority]
  const categoryLabel = task.category
    ? ((lang === 'id' ? CATEGORY_LABEL_ID : CATEGORY_LABEL_EN)[task.category] ?? task.category)
    : null

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={cn(
        'group rounded-md border border-card-border/60 bg-surface/40 px-3 py-2.5 text-left transition-colors',
        'hover:border-accent-blue/40 hover:bg-surface-tertiary/40 cursor-pointer',
        draggable && 'cursor-grab active:cursor-grabbing',
        isDragging && 'opacity-40',
        className,
      )}
    >
      <div className="flex items-start gap-1.5">
        {draggable && (
          <GripVertical className="w-3.5 h-3.5 text-text-secondary/30 mt-0.5 flex-shrink-0 group-hover:text-text-secondary/60" />
        )}
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-text-primary text-[13px] leading-snug break-words">{task.title}</p>

          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={cn(
                'text-[9px] px-1.5 py-0.5 rounded-full border font-mono uppercase tracking-wider',
                TASK_PRIORITY_COLOR[task.priority],
              )}
            >
              {priorityLabel}
            </span>
            {categoryLabel && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-border-muted text-text-secondary font-mono uppercase tracking-wider">
                {categoryLabel}
              </span>
            )}
            <SlaBadge dueAt={task.dueAt} completedAt={task.completedAt} slaHours={task.slaHours} />
          </div>

          {task.status === 'BLOCKED' && task.blockedReason && (
            <p className="text-[10px] text-status-danger/90 flex items-start gap-1">
              <span className="font-mono uppercase tracking-wider">{t.blocked}</span>
              <span className="break-words">{task.blockedReason}</span>
            </p>
          )}

          <div className="flex items-center gap-1 text-[10px] text-text-secondary">
            <User className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{assigneeName ?? t.unassigned}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
