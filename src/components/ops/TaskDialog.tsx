'use client'

// Buat/ubah tugas (Fase 7d). Precedent langsung: RevisionDialog.tsx (dialog
// kecil, fetch + router.refresh(), galat dari body.error.message).
//
// Jangkar vs manual MUTUALLY EXCLUSIVE, mengikuti tetapkanDueAt() di
// task.service.ts: mengirim `dueAt` eksplisit SELALU menang dan menetapkan
// dueAtManual=true; mengirim anchor+offsetHours membiarkan server menghitung
// lewat hitungDueAt() dan tugas tetap ikut bergeser saat ETA/ETB berubah
// (K94). Pratinjau tenggat di sini memanggil `hitungDueAt()` (MURNI,
// task-schedule.ts) LANGSUNG dengan tanggal jangkar voyage yang dikirim lewat
// prop `voyageAnchors` — bukan tebakan UI, angka yang sama persis dengan yang
// nanti dihitung server.
//
// Peran (K98): tombol pemicu dialog ini digerbangi CAN_MANAGE_TASKS oleh
// PEMANGGIL (VoyageTaskPanel/TasksPageClient), dan komponen ini menolak
// render isi form kalau somehow terbuka dengan peran yang tak berhak —
// pertahanan lapis kedua, server (task.service.ts requireRole) tetap yang
// sesungguhnya menegakkan.

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Role } from '@prisma/client'
import { Loader2 } from 'lucide-react'
import { useLang, useT, type Lang } from '@/lib/i18n'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { hitungDueAt, type TanggalJangkar } from '@/services/ops/task-schedule'
import {
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  CATEGORY_LABEL_ID,
  CATEGORY_LABEL_EN,
  PRIORITY_LABEL_ID,
  PRIORITY_LABEL_EN,
  CAN_MANAGE_TASKS,
  type TaskPriorityStr,
  type TaskRow,
  type UserOption,
} from './task-shared'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    titleCreate: 'Tugas Baru', titleEdit: 'Ubah Tugas',
    desc: 'Judul, kategori, prioritas, penanggung jawab, dan tenggat.',
    fTitle: 'Judul', fDesc: 'Deskripsi', fCategory: 'Kategori', fPriority: 'Prioritas',
    fAssignee: 'Penanggung Jawab', fSla: 'Target SLA (jam)',
    dueMode: 'Tenggat', dueNone: 'Tanpa tenggat', dueAnchor: 'Dari jangkar voyage', dueManual: 'Tanggal manual',
    fAnchor: 'Jangkar', fOffset: 'Offset (jam, negatif = sebelum jangkar)', fManualDate: 'Tanggal & jam',
    preview: 'Perkiraan tenggat', previewNone: 'Belum bisa dihitung — tanggal jangkarnya belum diisi di voyage ini.',
    fVoyage: 'Voyage', voyageNone: '— tugas kantor (tanpa voyage) —',
    selNone: '— tidak ada —', selCategory: '— pilih kategori —',
    cancel: 'Batal', save: 'Simpan', create: 'Buat Tugas',
    errTitle: 'Judul tugas wajib diisi.', errSave: 'Gagal menyimpan tugas.', errConn: 'Gagal terhubung ke server.',
    denied: 'Peran Anda tidak berhak membuat/mengubah tugas.',
    anchor_ETA: 'ETA', anchor_ETB: 'ETB', anchor_ETC: 'ETC', anchor_ETD: 'ETD', anchor_ATA: 'ATA',
    anchor_VOYAGE_CREATED: 'Voyage dibuat',
    onlySelf: 'Peran Anda hanya bisa menugaskan ke diri sendiri.',
  },
  en: {
    titleCreate: 'New Task', titleEdit: 'Edit Task',
    desc: 'Title, category, priority, assignee, and due date.',
    fTitle: 'Title', fDesc: 'Description', fCategory: 'Category', fPriority: 'Priority',
    fAssignee: 'Assignee', fSla: 'SLA target (hours)',
    dueMode: 'Due date', dueNone: 'No due date', dueAnchor: 'From voyage anchor', dueManual: 'Manual date',
    fAnchor: 'Anchor', fOffset: 'Offset (hours, negative = before anchor)', fManualDate: 'Date & time',
    preview: 'Estimated due date', previewNone: "Can't calculate yet — this voyage's anchor date isn't filled in.",
    fVoyage: 'Voyage', voyageNone: '— office task (no voyage) —',
    selNone: '— none —', selCategory: '— select category —',
    cancel: 'Cancel', save: 'Save', create: 'Create Task',
    errTitle: 'Task title is required.', errSave: 'Failed to save task.', errConn: 'Failed to connect to server.',
    denied: 'Your role cannot create/edit tasks.',
    anchor_ETA: 'ETA', anchor_ETB: 'ETB', anchor_ETC: 'ETC', anchor_ETD: 'ETD', anchor_ATA: 'ATA',
    anchor_VOYAGE_CREATED: 'Voyage created',
    onlySelf: 'Your role can only assign tasks to yourself.',
  },
}

const ANCHOR_OPTIONS = ['ETA', 'ETB', 'ETC', 'ETD', 'ATA', 'VOYAGE_CREATED'] as const

const inputCls =
  'w-full bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary ' +
  'placeholder:text-text-secondary/40 focus:border-accent-blue focus:outline-none ' +
  'focus:ring-1 focus:ring-accent-blue/40 transition-colors'
const labelCls = 'block text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1'

type DueMode = 'none' | 'anchor' | 'manual'

function toLocalInput(d: string | null): string {
  if (!d) return ''
  const v = new Date(d)
  if (Number.isNaN(v.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}T${pad(v.getHours())}:${pad(v.getMinutes())}`
}

function formForTask(task: TaskRow | null) {
  const dueMode: DueMode = task?.dueAtManual ? 'manual' : task?.anchor && task.anchor !== 'MANUAL' ? 'anchor' : 'none'
  return {
    title: task?.title ?? '',
    description: task?.description ?? '',
    category: task?.category ?? '',
    priority: task?.priority ?? ('NORMAL' as const),
    assigneeUserId: task?.assigneeUserId ?? '',
    slaHours: task?.slaHours != null ? String(task.slaHours) : '',
    voyageId: task?.voyageId ?? '',
    dueMode,
    anchor: task?.anchor && task.anchor !== 'MANUAL' ? task.anchor : 'ETA',
    offsetHours: task?.offsetHours != null ? String(task.offsetHours) : '0',
    manualDate: dueMode === 'manual' ? toLocalInput(task?.dueAt ?? null) : '',
  }
}

export function TaskDialog({
  open,
  onOpenChange,
  task,
  role,
  currentUserId,
  users,
  fixedVoyageId,
  voyageOptions,
  voyageAnchors,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  /** null/undefined = mode buat baru. */
  task?: TaskRow | null
  role: Role
  currentUserId: string
  users: readonly UserOption[]
  /** Voyage Workspace: voyage-nya tetap, tak bisa dipilih. */
  fixedVoyageId?: string | null
  /** /tasks global: operator memilih voyage (atau kosong = tugas kantor, K83). */
  voyageOptions?: readonly { id: string; voyageNumber: string }[]
  /** Tanggal jangkar voyage — untuk pratinjau tenggat LANGSUNG dari hitungDueAt() murni. */
  voyageAnchors?: TanggalJangkar | null
  onSaved: (task: TaskRow) => void
}) {
  const t = useT(STR)
  const { lang } = useLang()
  const router = useRouter()
  const isEdit = !!task
  const [form, setForm] = useState(() => formForTask(task ?? null))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const boleh = CAN_MANAGE_TASKS.includes(role)
  const onlySelf = role === 'OPERATOR'

  function resetOpen(o: boolean) {
    if (!o) {
      setForm(formForTask(task ?? null))
      setError('')
    }
    onOpenChange(o)
  }

  const set = <K extends keyof ReturnType<typeof formForTask>>(k: K, v: ReturnType<typeof formForTask>[K]) =>
    setForm((p) => ({ ...p, [k]: v }))

  const preview = useMemo(() => {
    if (form.dueMode !== 'anchor' || !voyageAnchors) return undefined
    const off = Number(form.offsetHours)
    return hitungDueAt(form.anchor, Number.isFinite(off) ? off : 0, voyageAnchors)
  }, [form.dueMode, form.anchor, form.offsetHours, voyageAnchors])

  const assignableUsers = onlySelf ? users.filter((u) => u.id === currentUserId) : users

  const categoryLabel = (c: string): string =>
    (lang === 'id' ? CATEGORY_LABEL_ID[c] : CATEGORY_LABEL_EN[c]) ?? c
  const priorityLabel = (p: TaskPriorityStr): string => (lang === 'id' ? PRIORITY_LABEL_ID : PRIORITY_LABEL_EN)[p]

  async function submit() {
    if (!form.title.trim()) {
      setError(t.errTitle)
      return
    }
    if (onlySelf && form.assigneeUserId && form.assigneeUserId !== currentUserId) {
      setError(t.onlySelf)
      return
    }

    const body: Record<string, unknown> = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      category: form.category || null,
      priority: form.priority,
      assigneeUserId: form.assigneeUserId || null,
      slaHours: form.slaHours.trim() === '' ? null : Number(form.slaHours),
    }

    if (form.dueMode === 'manual') {
      body.anchor = 'MANUAL'
      body.offsetHours = null
      body.dueAt = form.manualDate ? new Date(form.manualDate).toISOString() : null
    } else if (form.dueMode === 'anchor') {
      body.anchor = form.anchor
      body.offsetHours = Number(form.offsetHours) || 0
      body.dueAt = null
    } else {
      body.anchor = null
      body.offsetHours = null
      body.dueAt = null
    }

    if (!isEdit && !fixedVoyageId) {
      body.voyageId = form.voyageId || null
    }

    setBusy(true)
    setError('')
    try {
      const url = isEdit
        ? `/api/tasks/${task!.id}`
        : fixedVoyageId
          ? `/api/voyages/${fixedVoyageId}/tasks`
          : '/api/tasks'
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => null)
        setError(errBody?.error?.message ?? t.errSave)
        return
      }
      const resBody = await res.json()
      onSaved(resBody.tugas)
      router.refresh()
      onOpenChange(false)
    } catch {
      setError(t.errConn)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && resetOpen(o)}>
      <DialogContent className="bg-surface-secondary border-card-border text-text-primary max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-white">{isEdit ? t.titleEdit : t.titleCreate}</DialogTitle>
          <DialogDescription className="text-text-secondary">{t.desc}</DialogDescription>
        </DialogHeader>

        {!boleh ? (
          <p className="text-status-danger text-xs bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2">
            {t.denied}
          </p>
        ) : (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>
                {t.fTitle} <span className="text-status-danger">*</span>
              </label>
              <input autoFocus value={form.title} onChange={(e) => set('title', e.target.value)} className={inputCls} />
            </div>

            <div>
              <label className={labelCls}>{t.fDesc}</label>
              <textarea
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                rows={2}
                className={inputCls + ' resize-none'}
              />
            </div>

            {!isEdit && !fixedVoyageId && voyageOptions && (
              <div>
                <label className={labelCls}>{t.fVoyage}</label>
                <select value={form.voyageId} onChange={(e) => set('voyageId', e.target.value)} className={inputCls}>
                  <option value="">{t.voyageNone}</option>
                  {voyageOptions.map((v) => (
                    <option key={v.id} value={v.id}>{v.voyageNumber}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{t.fCategory}</label>
                <select value={form.category} onChange={(e) => set('category', e.target.value)} className={inputCls}>
                  <option value="">{t.selCategory}</option>
                  {TASK_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{categoryLabel(c)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>{t.fPriority}</label>
                <select
                  value={form.priority}
                  onChange={(e) => set('priority', e.target.value as (typeof TASK_PRIORITIES)[number])}
                  className={inputCls}
                >
                  {TASK_PRIORITIES.map((p) => (
                    <option key={p} value={p}>{priorityLabel(p)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className={labelCls}>{t.fAssignee}</label>
              <select
                value={form.assigneeUserId}
                onChange={(e) => set('assigneeUserId', e.target.value)}
                className={inputCls}
              >
                <option value="">{t.selNone}</option>
                {assignableUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              {onlySelf && <p className="text-[10px] text-text-secondary mt-1">{t.onlySelf}</p>}
            </div>

            <div>
              <label className={labelCls}>{t.dueMode}</label>
              <div className="flex gap-1.5">
                {(['none', 'anchor', 'manual'] as DueMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => set('dueMode', m)}
                    className={
                      'flex-1 px-2 py-1.5 rounded text-[11px] font-medium border transition-colors ' +
                      (form.dueMode === m
                        ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/40'
                        : 'border-border-muted text-text-secondary hover:text-text-primary')
                    }
                  >
                    {m === 'none' ? t.dueNone : m === 'anchor' ? t.dueAnchor : t.dueManual}
                  </button>
                ))}
              </div>
            </div>

            {form.dueMode === 'anchor' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>{t.fAnchor}</label>
                  <select value={form.anchor} onChange={(e) => set('anchor', e.target.value)} className={inputCls}>
                    {ANCHOR_OPTIONS.map((a) => (
                      <option key={a} value={a}>{(t as Record<string, string>)['anchor_' + a]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>{t.fOffset}</label>
                  <input
                    type="number"
                    value={form.offsetHours}
                    onChange={(e) => set('offsetHours', e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div className="col-span-2 text-[11px] text-text-secondary bg-surface/40 border border-card-border/50 rounded px-2.5 py-2">
                  {t.preview}:{' '}
                  {voyageAnchors ? (
                    preview ? (
                      <span className="text-text-primary font-mono">{preview.toLocaleString('id-ID')}</span>
                    ) : (
                      <span className="opacity-70">{t.previewNone}</span>
                    )
                  ) : (
                    <span className="opacity-70">{t.previewNone}</span>
                  )}
                </div>
              </div>
            )}

            {form.dueMode === 'manual' && (
              <div>
                <label className={labelCls}>{t.fManualDate}</label>
                <input
                  type="datetime-local"
                  value={form.manualDate}
                  onChange={(e) => set('manualDate', e.target.value)}
                  className={inputCls}
                />
              </div>
            )}

            <div>
              <label className={labelCls}>{t.fSla}</label>
              <input
                type="number"
                min={0}
                value={form.slaHours}
                onChange={(e) => set('slaHours', e.target.value)}
                className={inputCls}
              />
            </div>

            {error && (
              <p className="text-status-danger text-xs bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => resetOpen(false)}
                disabled={busy}
                className="px-4 py-2 rounded text-sm font-medium border border-border-muted text-text-secondary hover:text-white hover:bg-surface-tertiary transition-colors disabled:opacity-50"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={busy}
                className="inline-flex items-center gap-2 px-4 py-2 rounded text-sm font-medium bg-accent-blue hover:bg-primary text-[#231a06] transition-colors disabled:opacity-50"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {isEdit ? t.save : t.create}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
