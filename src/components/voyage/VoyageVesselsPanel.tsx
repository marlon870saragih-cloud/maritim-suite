'use client'

// Kapal-kapal voyage (PRD-002 Step 2) — mis. tug yang menarik barge. Kapal UTAMA
// tetap ditentukan di Particulars (`Voyage.vesselId`); panel ini hanya menambah
// kapal terkait beserta perannya. Bentuk minimal sengaja: daftar + satu dialog.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT, type Lang } from '@/lib/i18n'
import { PERAN_KAPAL_VOYAGE } from '@/lib/vessels'
import type { KapalVoyageRow } from '@/services/master/voyage-vessel.service'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

type Option = { id: string; name: string }
type Baris = { vesselId: string; role: string }

const STR: Record<Lang, Record<string, string>> = {
  id: {
    title: 'Kapal', primary: 'Kapal Utama', related: 'Kapal Terkait', role: 'Peran', roleNone: '— tanpa peran —',
    roleTUG: 'Tug', roleBARGE: 'Barge', edit: 'Ubah Kapal',
    dialogTitle: 'Kapal Voyage',
    dialogDesc: 'Kapal utama ditentukan di Particulars. Tambahkan kapal terkait (mis. barge yang ditarik tug) dan tentukan perannya.',
    add: 'Tambah', selVessel: '— pilih kapal —', moveUp: 'Naikkan', moveDown: 'Turunkan', remove: 'Hapus',
    cancel: 'Batal', save: 'Simpan', errSave: 'Gagal menyimpan.', errConn: 'Gagal terhubung ke server.',
  },
  en: {
    title: 'Vessels', primary: 'Primary Vessel', related: 'Related Vessel', role: 'Role', roleNone: '— no role —',
    roleTUG: 'Tug', roleBARGE: 'Barge', edit: 'Edit Vessels',
    dialogTitle: 'Voyage Vessels',
    dialogDesc: 'The primary vessel is set in Particulars. Add related vessels (e.g. the barge towed by the tug) and set their roles.',
    add: 'Add', selVessel: '— select vessel —', moveUp: 'Move up', moveDown: 'Move down', remove: 'Remove',
    cancel: 'Cancel', save: 'Save', errSave: 'Failed to save.', errConn: 'Failed to connect to server.',
  },
}

const inputCls =
  'w-full bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary ' +
  'focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/40 transition-colors'

export function VoyageVesselsPanel({
  voyageId, rows, vessels, canEdit,
}: {
  voyageId: string
  rows: KapalVoyageRow[]
  vessels: Option[]
  canEdit: boolean
}) {
  const t = useT(STR)
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [daftar, setDaftar] = useState<Baris[]>([])
  const [tambahId, setTambahId] = useState('')
  const [tambahRole, setTambahRole] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const utamaId = rows.find((r) => r.isPrimary)?.vesselId ?? ''
  const nama = new Map<string, string>(vessels.map((v) => [v.id, v.name]))
  for (const r of rows) if (r.vessel) nama.set(r.vesselId, r.vessel.name)
  const labelPeran = (role: string | null) => (role ? (t[`role${role}`] ?? role) : null)

  function openEdit() {
    setDaftar(rows.map((r) => ({ vesselId: r.vesselId, role: r.role ?? '' })))
    setTambahId('')
    setTambahRole('')
    setError('')
    setOpen(true)
  }

  const ubah = (i: number, role: string) => setDaftar((d) => d.map((b, j) => (j === i ? { ...b, role } : b)))
  const hapus = (i: number) => setDaftar((d) => d.filter((_, j) => j !== i))
  const geser = (i: number, arah: -1 | 1) =>
    setDaftar((d) => {
      const j = i + arah
      if (j < 0 || j >= d.length) return d
      const salin = [...d]
      ;[salin[i], salin[j]] = [salin[j], salin[i]]
      return salin
    })
  function tambah() {
    if (!tambahId || daftar.some((b) => b.vesselId === tambahId)) return
    setDaftar((d) => [...d, { vesselId: tambahId, role: tambahRole }])
    setTambahId('')
    setTambahRole('')
  }

  async function simpan() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/voyages/${voyageId}/vessels`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vessels: daftar.map((b) => ({ vesselId: b.vesselId, role: b.role || null })) }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error?.message ?? t.errSave)
        return
      }
      setOpen(false)
      router.refresh()
    } catch {
      setError(t.errConn)
    } finally {
      setBusy(false)
    }
  }

  const tersedia = vessels.filter((v) => !daftar.some((b) => b.vesselId === v.id))

  return (
    <div className="rounded-md border border-card-border/60 bg-surface/30 px-3.5 py-3">
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">{t.title}</p>
        {canEdit && (
          <button
            type="button"
            onClick={openEdit}
            className="inline-flex items-center gap-1.5 rounded border border-border-muted px-2 py-1 text-[11px] font-medium text-text-secondary hover:text-white hover:border-accent-blue/60 hover:bg-surface-tertiary transition-colors"
          >
            <Pencil className="w-3 h-3" /> {t.edit}
          </button>
        )}
      </div>
      <ul className="flex flex-wrap gap-2">
        {rows.map((r) => (
          <li
            key={r.vesselId}
            className="inline-flex items-center gap-2 rounded border border-card-border/70 bg-surface/50 px-2.5 py-1.5 text-sm"
          >
            <span className="text-text-primary">{r.vessel?.name ?? nama.get(r.vesselId) ?? '—'}</span>
            <span
              className={cn(
                'text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border',
                r.isPrimary
                  ? 'bg-accent-blue/12 text-accent-blue border-accent-blue/30'
                  : 'bg-surface-tertiary text-text-secondary border-border-muted',
              )}
            >
              {r.isPrimary ? t.primary : t.related}
            </span>
            {labelPeran(r.role) && <span className="text-[11px] text-text-secondary">{labelPeran(r.role)}</span>}
          </li>
        ))}
      </ul>

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="bg-surface-secondary border-card-border text-text-primary max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-display text-white">{t.dialogTitle}</DialogTitle>
            <DialogDescription className="text-text-secondary">{t.dialogDesc}</DialogDescription>
          </DialogHeader>

          <ul className="space-y-2">
            {daftar.map((b, i) => {
              const utama = b.vesselId === utamaId
              return (
                <li key={b.vesselId} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary truncate">{nama.get(b.vesselId) ?? b.vesselId}</p>
                    <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">
                      {utama ? t.primary : t.related}
                    </p>
                  </div>
                  <label className="sr-only" htmlFor={`peran-${b.vesselId}`}>{t.role}</label>
                  <select
                    id={`peran-${b.vesselId}`}
                    value={b.role}
                    onChange={(e) => ubah(i, e.target.value)}
                    className={inputCls + ' w-36'}
                  >
                    <option value="">{t.roleNone}</option>
                    {PERAN_KAPAL_VOYAGE.map((p) => (
                      <option key={p} value={p}>{t[`role${p}`]}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => geser(i, -1)} disabled={i === 0} title={t.moveUp} aria-label={t.moveUp}
                    className="p-1.5 rounded text-text-secondary hover:text-white hover:bg-surface-tertiary disabled:opacity-30">
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => geser(i, 1)} disabled={i === daftar.length - 1} title={t.moveDown} aria-label={t.moveDown}
                    className="p-1.5 rounded text-text-secondary hover:text-white hover:bg-surface-tertiary disabled:opacity-30">
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => hapus(i)} disabled={utama} title={t.remove} aria-label={t.remove}
                    className="p-1.5 rounded text-text-secondary hover:text-status-danger hover:bg-surface-tertiary disabled:opacity-30">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              )
            })}
          </ul>

          <div className="flex items-center gap-2 pt-2 border-t border-card-border/60">
            <label className="sr-only" htmlFor="tambah-kapal">{t.selVessel}</label>
            <select id="tambah-kapal" value={tambahId} onChange={(e) => setTambahId(e.target.value)} className={inputCls}>
              <option value="">{t.selVessel}</option>
              {tersedia.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
            <label className="sr-only" htmlFor="tambah-peran">{t.role}</label>
            <select id="tambah-peran" value={tambahRole} onChange={(e) => setTambahRole(e.target.value)} className={inputCls + ' w-36'}>
              <option value="">{t.roleNone}</option>
              {PERAN_KAPAL_VOYAGE.map((p) => (
                <option key={p} value={p}>{t[`role${p}`]}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={tambah}
              disabled={!tambahId}
              className="inline-flex items-center gap-1.5 shrink-0 rounded border border-border-muted px-3 py-2 text-xs font-medium text-text-secondary hover:text-white hover:bg-surface-tertiary disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" /> {t.add}
            </button>
          </div>

          {error && (
            <p className="text-status-danger text-xs bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="px-4 py-2 rounded text-sm font-medium border border-border-muted text-text-secondary hover:text-white hover:bg-surface-tertiary transition-colors disabled:opacity-50"
            >
              {t.cancel}
            </button>
            <button
              type="button"
              onClick={simpan}
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded text-sm font-medium bg-accent-blue hover:bg-primary text-[#231a06] transition-colors disabled:opacity-50"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {t.save}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
