'use client'

// Panel Catatan (Fase 7f · K128) — komentar datar per entitas, BUKAN messenger.
// currentUserId diambil dari useSession() (bukan prop) supaya panel ini bisa
// dipasang di layar mana pun tanpa mewajibkan pemanggilnya mengulir sesi turun
// lewat props.
//
// @sebut (mention picker) SENGAJA belum ada di UI ini — backend sudah
// mendukung `mentionedUserIds` (comment.service.ts, 7a), tapi memasang picker
// pengguna butuh daftar user tenant di SETIAP layar yang memasang panel ini
// (Disbursement/Invoice/Vendor belum membawa prop itu). Nilai inti K128
// ("tempelkan keputusan pada dokumennya") sudah tercapai tanpa itu; @sebut
// menyusul sebagai peningkatan terpisah (P42).

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Loader2, MessageSquare, Pencil, Trash2, X } from 'lucide-react'
import { useT, type Lang } from '@/lib/i18n'
import type { EntityType } from '@/services/ops/owner-guard'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    title: 'Catatan',
    empty: 'Belum ada catatan.',
    placeholder: 'Tulis catatan…',
    send: 'Kirim',
    edited: 'disunting',
    save: 'Simpan', cancel: 'Batal',
    tipEdit: 'Sunting', tipDelete: 'Hapus',
    confirmDelete: 'Hapus catatan ini?',
    errLoad: 'Gagal memuat catatan.', errSave: 'Gagal menyimpan.', errDelete: 'Gagal menghapus.', errConn: 'Gagal terhubung ke server.',
  },
  en: {
    title: 'Notes',
    empty: 'No notes yet.',
    placeholder: 'Write a note…',
    send: 'Send',
    edited: 'edited',
    save: 'Save', cancel: 'Cancel',
    tipEdit: 'Edit', tipDelete: 'Delete',
    confirmDelete: 'Delete this note?',
    errLoad: 'Failed to load notes.', errSave: 'Failed to save.', errDelete: 'Failed to delete.', errConn: 'Failed to connect to server.',
  },
}

type CommentRow = {
  id: string
  body: string
  authorUserId: string
  authorName: string | null
  editedAt: string | null
  createdAt: string
  deleted: boolean
}

const fmtTime = (d: string) =>
  new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export function CommentPanel({ entityType, entityId }: { entityType: EntityType; entityId: string }) {
  const t = useT(STR)
  const { data: session } = useSession()
  const currentUserId = (session?.user as { id?: string } | undefined)?.id ?? null

  const [rows, setRows] = useState<CommentRow[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')

  async function load() {
    setLoadError('')
    try {
      const res = await fetch(`/api/comments?entityType=${entityType}&entityId=${entityId}`)
      if (!res.ok) {
        setLoadError(t.errLoad)
        return
      }
      setRows(await res.json())
    } catch {
      setLoadError(t.errConn)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId])

  async function send() {
    const isi = draft.trim()
    if (!isi) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType, entityId, body: isi }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setError(body?.error?.message ?? t.errSave)
        return
      }
      setDraft('')
      await load()
    } catch {
      setError(t.errConn)
    } finally {
      setBusy(false)
    }
  }

  function startEdit(c: CommentRow) {
    setEditingId(c.id)
    setEditDraft(c.body)
    setError('')
  }

  async function saveEdit(id: string) {
    const isi = editDraft.trim()
    if (!isi) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/comments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: isi }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setError(body?.error?.message ?? t.errSave)
        return
      }
      setEditingId(null)
      await load()
    } catch {
      setError(t.errConn)
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (!confirm(t.confirmDelete)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/comments/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        alert(body?.error?.message ?? t.errDelete)
        return
      }
      await load()
    } catch {
      alert(t.errConn)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
        <MessageSquare className="w-3.5 h-3.5" /> {t.title} {rows && rows.length > 0 ? `(${rows.length})` : ''}
      </p>

      {loadError && <p className="text-status-danger text-xs">{loadError}</p>}

      {rows && rows.length === 0 ? (
        <p className="text-text-secondary text-sm">{t.empty}</p>
      ) : rows ? (
        <ul className="space-y-2.5">
          {rows.map((c) => {
            const mine = !c.deleted && currentUserId && c.authorUserId === currentUserId
            const editing = editingId === c.id
            return (
              <li key={c.id} className="border border-card-border/50 rounded-md px-3 py-2.5 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-text-secondary text-[11px] font-mono">
                    {c.authorName ?? '—'} · {fmtTime(c.createdAt)}
                    {c.editedAt && ` · ${t.edited}`}
                  </p>
                  {mine && !editing && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => startEdit(c)}
                        title={t.tipEdit}
                        className="p-1 rounded text-text-secondary hover:text-accent-blue hover:bg-surface-tertiary transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(c.id)}
                        title={t.tipDelete}
                        className="p-1 rounded text-text-secondary hover:text-status-danger hover:bg-surface-tertiary transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                {editing ? (
                  <div className="mt-1.5 space-y-1.5">
                    <textarea
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      rows={2}
                      autoFocus
                      className="w-full bg-surface border border-border-muted rounded px-2 py-1.5 text-sm text-text-primary focus:border-accent-blue focus:outline-none resize-none"
                    />
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="p-1 rounded text-text-secondary hover:text-text-primary transition-colors"
                        title={t.cancel}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => saveEdit(c.id)}
                        disabled={busy}
                        className="px-2.5 py-1 rounded text-xs font-medium bg-accent-blue hover:bg-primary text-[#231a06] transition-colors disabled:opacity-50"
                      >
                        {t.save}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className={c.deleted ? 'text-text-secondary italic mt-1' : 'text-text-primary mt-1 whitespace-pre-wrap'}>
                    {c.body}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      ) : null}

      <div className="flex items-start gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t.placeholder}
          rows={2}
          className="flex-1 bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary placeholder:text-text-secondary/40 focus:border-accent-blue focus:outline-none resize-none"
        />
        <button
          type="button"
          onClick={send}
          disabled={busy || !draft.trim()}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded text-xs font-medium bg-accent-blue hover:bg-primary text-[#231a06] transition-colors disabled:opacity-50 shrink-0"
        >
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {t.send}
        </button>
      </div>
      {error && <p className="text-status-danger text-xs">{error}</p>}
    </div>
  )
}
