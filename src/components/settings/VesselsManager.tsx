'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Loader2, Ship, FileUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT, type Lang } from '@/lib/i18n'
import { VesselImportDialog, useVesselImportLabel } from './VesselImportDialog'
import { emptyForm, toForm, VesselFieldsGrid, type FormState, type Vessel } from './vessel-form'

export type { Vessel } from './vessel-form'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    addBtn: 'Tambah Kapal',
    errNameReq: 'Nama kapal wajib diisi.', errSave: 'Gagal menyimpan.', errConn: 'Gagal terhubung ke server.', errDelete: 'Gagal menghapus.',
    confirmPre: 'Hapus kapal "', confirmPost: '"? Tindakan ini tidak bisa dibatalkan.',
    emptyTitle: 'Belum ada kapal', emptyDesc: 'Tambah data kapal sekali — dipakai otomatis untuk port call & dokumen.',
    thName: 'Nama Kapal', thFlag: 'Bendera', thType: 'Tipe', thAction: 'Aksi',
    editTitle: 'Ubah Kapal', dialogDesc: 'Data ini dipakai untuk mengisi otomatis partikular kapal di port call & dokumen.',
    tipEdit: 'Ubah', tipDelete: 'Hapus', cancel: 'Batal', saveChanges: 'Simpan Perubahan',
  },
  en: {
    addBtn: 'Add Vessel',
    errNameReq: 'Vessel name is required.', errSave: 'Failed to save.', errConn: 'Failed to connect to server.', errDelete: 'Failed to delete.',
    confirmPre: 'Delete vessel "', confirmPost: '"? This action cannot be undone.',
    emptyTitle: 'No vessels yet', emptyDesc: 'Add a vessel once — auto-used for port calls & documents.',
    thName: 'Vessel Name', thFlag: 'Flag', thType: 'Type', thAction: 'Action',
    editTitle: 'Edit Vessel', dialogDesc: 'This data auto-fills vessel particulars in port calls & documents.',
    tipEdit: 'Edit', tipDelete: 'Delete', cancel: 'Cancel', saveChanges: 'Save changes',
  },
}
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

const num = (n: number | null) => (n == null ? '—' : n.toLocaleString('en-US'))

export function VesselsManager({ vessels }: { vessels: Vessel[] }) {
  const t = useT(STR)
  const importLabel = useVesselImportLabel()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editing, setEditing] = useState<Vessel | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }))

  function openAdd() {
    setEditing(null)
    setForm(emptyForm())
    setError('')
    setOpen(true)
  }
  function openEdit(v: Vessel) {
    setEditing(v)
    setForm(toForm(v))
    setError('')
    setOpen(true)
  }

  async function submit() {
    if (!form.name.trim()) {
      setError(t.errNameReq)
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await fetch(editing ? `/api/vessels/${editing.id}` : '/api/vessels', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        setError((await res.text()) || t.errSave)
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

  async function remove(v: Vessel) {
    if (!confirm(`${t.confirmPre}${v.name}${t.confirmPost}`)) return
    setDeletingId(v.id)
    try {
      const res = await fetch(`/api/vessels/${v.id}`, { method: 'DELETE' })
      if (!res.ok) {
        alert((await res.text()) || t.errDelete)
        return
      }
      router.refresh()
    } catch {
      alert(t.errConn)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setImportOpen(true)}
          className="inline-flex items-center gap-2 border border-border-muted text-text-secondary hover:text-white hover:border-accent-purple/50 hover:bg-surface-tertiary rounded px-4 py-2 text-sm font-medium transition-colors"
        >
          <FileUp className="w-4 h-4" /> {importLabel}
        </button>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center gap-2 bg-accent-blue hover:bg-primary text-[#231a06] rounded px-4 py-2 text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> {t.addBtn}
        </button>
      </div>

      <section className="bg-card-bg border border-card-border rounded-lg overflow-hidden">
        {vessels.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="p-3 rounded-full bg-surface-tertiary text-text-secondary">
              <Ship className="w-6 h-6" />
            </div>
            <div>
              <p className="text-text-primary text-sm font-medium">{t.emptyTitle}</p>
              <p className="text-text-secondary text-xs mt-1">{t.emptyDesc}</p>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className="inline-flex items-center gap-2 border border-border-muted text-text-secondary hover:text-white hover:border-accent-purple/50 hover:bg-surface-tertiary rounded px-4 py-2 text-sm font-medium transition-colors"
              >
                <FileUp className="w-4 h-4" /> {importLabel}
              </button>
              <button
                type="button"
                onClick={openAdd}
                className="inline-flex items-center gap-2 bg-accent-blue hover:bg-primary text-[#231a06] rounded px-4 py-2 text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" /> {t.addBtn}
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-secondary text-text-secondary font-mono uppercase tracking-widest border-b border-card-border text-[10px]">
                  <th className="px-5 py-3 font-medium">{t.thName}</th>
                  <th className="px-5 py-3 font-medium">IMO</th>
                  <th className="px-5 py-3 font-medium">{t.thFlag}</th>
                  <th className="px-5 py-3 font-medium">{t.thType}</th>
                  <th className="px-5 py-3 font-medium text-right">GT</th>
                  <th className="px-5 py-3 font-medium text-right">{t.thAction}</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {vessels.map((v, i) => (
                  <tr
                    key={v.id}
                    className={cn(
                      'hover:bg-surface-tertiary/30 transition-colors',
                      i < vessels.length - 1 && 'border-b border-card-border/50'
                    )}
                  >
                    <td className="px-5 py-4 text-text-primary">{v.name}</td>
                    <td className="px-5 py-4 font-mono text-text-secondary">{v.imoNumber ?? '—'}</td>
                    <td className="px-5 py-4 text-text-secondary">{v.flag ?? '—'}</td>
                    <td className="px-5 py-4 text-text-secondary">{v.vesselType ?? '—'}</td>
                    <td className="px-5 py-4 font-mono text-text-primary text-right">{num(v.gt)}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEdit(v)}
                          title={t.tipEdit}
                          className="p-1.5 rounded text-text-secondary hover:text-accent-blue hover:bg-surface-tertiary transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(v)}
                          disabled={deletingId === v.id}
                          title={t.tipDelete}
                          className="p-1.5 rounded text-text-secondary hover:text-status-danger hover:bg-surface-tertiary transition-colors disabled:opacity-50"
                        >
                          {deletingId === v.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <VesselImportDialog open={importOpen} onOpenChange={setImportOpen} onSaved={() => router.refresh()} />

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="bg-surface-secondary border-card-border text-text-primary max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-display text-white">
              {editing ? t.editTitle : t.addBtn}
            </DialogTitle>
            <DialogDescription className="text-text-secondary">
              {t.dialogDesc}
            </DialogDescription>
          </DialogHeader>

          <VesselFieldsGrid form={form} set={set} />

          {error && (
            <p className="text-status-danger text-xs bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2">
              {error}
            </p>
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
              onClick={submit}
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded text-sm font-medium bg-accent-blue hover:bg-primary text-[#231a06] transition-colors disabled:opacity-50"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {editing ? t.saveChanges : t.addBtn}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
