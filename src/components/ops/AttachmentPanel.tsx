'use client'

// Panel Lampiran (Fase 7f · K106-K110) — dipakai di 8 layar (Voyage Workspace,
// Disbursement Builder, Invoice, Vendor, Tugas). Satu komponen, satu pintu:
// daftar + unggah + unduh + hapus (soft), semuanya lewat API attachments yang
// sudah ada dari 7a.

import { useEffect, useState } from 'react'
import { AlertTriangle, Download, FileText, Globe, Loader2, Paperclip, Trash2, Upload } from 'lucide-react'
import { useT, type Lang } from '@/lib/i18n'
import type { EntityType } from '@/services/ops/owner-guard'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    title: 'Lampiran',
    empty: 'Belum ada lampiran.',
    upload: 'Unggah',
    uploading: 'Mengunggah…',
    kind: 'Jenis', note: 'Catatan (opsional)', sensitive: 'Sensitif (mis. paspor awak) — dibatasi peran tertentu',
    kind_RECEIPT: 'Kuitansi', kind_RATE_SHEET: 'Lembar Tarif', kind_CREW_DOC: 'Dokumen Awak',
    kind_VENDOR_DOC: 'Dokumen Vendor', kind_CONTRACT: 'Kontrak', kind_GENERAL: 'Umum',
    tipDelete: 'Hapus', tipDownload: 'Unduh',
    confirmDelete: 'Hapus lampiran ini? Berkas fisiknya tetap tersimpan (kebijakan retensi).',
    errLoad: 'Gagal memuat lampiran.', errUpload: 'Gagal mengunggah.', errDelete: 'Gagal menghapus.',
    errConn: 'Gagal terhubung ke server.', errNoFile: 'Pilih berkas dulu.',
    duplicateNote: 'Berkas serupa sudah pernah dilampirkan sebelumnya.',
    shared: 'Dibagikan ke portal', notShared: 'Belum dibagikan', share: 'Bagikan ke portal', unshare: 'Tarik dari portal',
    sensitiveBlocked: 'Lampiran sensitif tidak bisa dibagikan ke portal.',
  },
  en: {
    title: 'Attachments',
    empty: 'No attachments yet.',
    upload: 'Upload',
    uploading: 'Uploading…',
    kind: 'Kind', note: 'Note (optional)', sensitive: 'Sensitive (e.g. crew passport) — restricted to some roles',
    kind_RECEIPT: 'Receipt', kind_RATE_SHEET: 'Rate Sheet', kind_CREW_DOC: 'Crew Document',
    kind_VENDOR_DOC: 'Vendor Document', kind_CONTRACT: 'Contract', kind_GENERAL: 'General',
    tipDelete: 'Delete', tipDownload: 'Download',
    confirmDelete: 'Delete this attachment? The physical file stays stored (retention policy).',
    errLoad: 'Failed to load attachments.', errUpload: 'Failed to upload.', errDelete: 'Failed to delete.',
    errConn: 'Failed to connect to server.', errNoFile: 'Choose a file first.',
    duplicateNote: 'A matching file was already attached before.',
    shared: 'Shared to portal', notShared: 'Not shared', share: 'Share to portal', unshare: 'Unshare from portal',
    sensitiveBlocked: 'Sensitive attachments cannot be shared to the portal.',
  },
}

const JENIS_LAMPIRAN = ['RECEIPT', 'RATE_SHEET', 'CREW_DOC', 'VENDOR_DOC', 'CONTRACT', 'GENERAL'] as const

type AttachmentRow = {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  kind: string | null
  note: string | null
  sensitive: boolean
  createdAt: string
  sharedToPortal: boolean
}

/** K170 — hanya entitas yang benar-benar diproyeksikan ke Customer Portal (K167). Menampilkan
 * toggle di entitas lain (mis. Disbursement/Task) akan membuat janji yang tak pernah ditepati:
 * tak ada consumer yang membaca sharedToPortal di luar dua entityType ini (document.service.ts). */
const ENTITAS_BISA_DIBAGIKAN: readonly EntityType[] = ['INVOICE', 'VOYAGE']

const fmtSize = (b: number) => (b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`)

export function AttachmentPanel({ entityType, entityId }: { entityType: EntityType; entityId: string }) {
  const t = useT(STR)
  const [rows, setRows] = useState<AttachmentRow[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [kind, setKind] = useState<(typeof JENIS_LAMPIRAN)[number]>('GENERAL')
  const [sensitive, setSensitive] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function load() {
    setLoadError('')
    try {
      const res = await fetch(`/api/attachments?entityType=${entityType}&entityId=${entityId}`)
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

  async function upload(file: File | null | undefined) {
    if (!file) {
      setError(t.errNoFile)
      return
    }
    setBusy(true)
    setError('')
    try {
      const form = new FormData()
      form.append('entityType', entityType)
      form.append('entityId', entityId)
      form.append('file', file)
      form.append('kind', kind)
      if (note.trim()) form.append('note', note.trim())
      if (sensitive) form.append('sensitive', 'true')
      const res = await fetch('/api/attachments', { method: 'POST', body: form })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setError(body?.error?.message ?? t.errUpload)
        return
      }
      setNote('')
      setSensitive(false)
      await load()
    } catch {
      setError(t.errConn)
    } finally {
      setBusy(false)
    }
  }

  const [sharingId, setSharingId] = useState<string | null>(null)

  async function toggleShare(id: string, share: boolean) {
    setSharingId(id)
    try {
      const res = await fetch(`/api/attachments/${id}/share`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ share }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        alert(body?.error?.message ?? t.errConn)
        return
      }
      await load()
    } catch {
      alert(t.errConn)
    } finally {
      setSharingId(null)
    }
  }

  async function remove(id: string) {
    if (!confirm(t.confirmDelete)) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/attachments/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        alert(body?.error?.message ?? t.errDelete)
        return
      }
      await load()
    } catch {
      alert(t.errConn)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
        <Paperclip className="w-3.5 h-3.5" /> {t.title} {rows && rows.length > 0 ? `(${rows.length})` : ''}
      </p>

      {loadError && <p className="text-status-danger text-xs">{loadError}</p>}

      {rows && rows.length === 0 ? (
        <p className="text-text-secondary text-sm">{t.empty}</p>
      ) : rows ? (
        <ul className="space-y-2">
          {rows.map((a) => (
            <li
              key={a.id}
              className="flex items-start justify-between gap-3 text-sm border border-card-border/50 rounded-md px-3 py-2.5"
            >
              <div className="flex items-start gap-2 min-w-0">
                <FileText className="w-4 h-4 text-text-secondary shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-text-primary truncate">{a.fileName}</p>
                  <p className="text-text-secondary text-[11px] mt-0.5">
                    {fmtSize(a.sizeBytes)}
                    {a.kind && a.kind !== 'GENERAL' ? ` · ${(t as Record<string, string>)['kind_' + a.kind] ?? a.kind}` : ''}
                    {a.sensitive && <span className="text-accent-amber"> · 🔒</span>}
                  </p>
                  {a.note && <p className="text-text-secondary text-[11px] mt-0.5 italic">{a.note}</p>}
                  {ENTITAS_BISA_DIBAGIKAN.includes(entityType) && (
                    <p className={`text-[11px] mt-0.5 ${a.sharedToPortal ? 'text-accent-teal' : 'text-text-secondary/60'}`}>
                      {a.sharedToPortal ? t.shared : t.notShared}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {ENTITAS_BISA_DIBAGIKAN.includes(entityType) && (
                  <button
                    type="button"
                    onClick={() => toggleShare(a.id, !a.sharedToPortal)}
                    disabled={sharingId === a.id || (!a.sharedToPortal && a.sensitive)}
                    title={a.sensitive && !a.sharedToPortal ? t.sensitiveBlocked : a.sharedToPortal ? t.unshare : t.share}
                    className={`p-1.5 rounded transition-colors disabled:opacity-30 ${
                      a.sharedToPortal
                        ? 'text-accent-teal hover:text-status-danger hover:bg-surface-tertiary'
                        : 'text-text-secondary hover:text-accent-teal hover:bg-surface-tertiary'
                    }`}
                  >
                    {sharingId === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                  </button>
                )}
                <a
                  href={`/api/attachments/${a.id}/content`}
                  title={t.tipDownload}
                  className="p-1.5 rounded text-text-secondary hover:text-accent-blue hover:bg-surface-tertiary transition-colors"
                >
                  <Download className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  onClick={() => remove(a.id)}
                  disabled={deletingId === a.id}
                  title={t.tipDelete}
                  className="p-1.5 rounded text-text-secondary hover:text-status-danger hover:bg-surface-tertiary transition-colors disabled:opacity-50"
                >
                  {deletingId === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="border border-dashed border-border-muted rounded-md p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as (typeof JENIS_LAMPIRAN)[number])}
            className="bg-surface border border-border-muted rounded px-2 py-1.5 text-xs text-text-primary focus:border-accent-blue focus:outline-none"
          >
            {JENIS_LAMPIRAN.map((k) => (
              <option key={k} value={k}>
                {(t as Record<string, string>)['kind_' + k]}
              </option>
            ))}
          </select>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t.note}
            className="bg-surface border border-border-muted rounded px-2 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent-blue focus:outline-none"
          />
        </div>
        <label className="flex items-center gap-2 text-[11px] text-text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={sensitive}
            onChange={(e) => setSensitive(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-border-muted accent-accent-amber"
          />
          {t.sensitive}
        </label>
        <label className="inline-flex items-center gap-2 cursor-pointer rounded border border-border-muted px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-white hover:border-accent-blue/60 hover:bg-surface-tertiary transition-colors">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          {busy ? t.uploading : t.upload}
          <input
            type="file"
            disabled={busy}
            className="hidden"
            onChange={(e) => {
              upload(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
        {error && (
          <p className="flex items-start gap-1.5 text-status-danger text-xs">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {error}
          </p>
        )}
      </div>
    </div>
  )
}
