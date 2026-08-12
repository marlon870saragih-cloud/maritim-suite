'use client'

// Pintu import partikular kapal: upload → AI ekstrak → PREVIEW yang bisa diedit →
// Simpan. Penyimpanan sengaja tetap lewat POST/PATCH /api/vessels yang sudah ada,
// jadi route ekstraksi tak pernah menulis ke database.

import { useEffect, useRef, useState } from 'react'
import { FileUp, Loader2, Sparkles, AlertTriangle, ShieldCheck, RefreshCw } from 'lucide-react'
import { useT, type Lang } from '@/lib/i18n'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { emptyForm, toForm, VesselFieldsGrid, type FormState, type Vessel } from './vessel-form'

const MAX_BYTES = 10 * 1024 * 1024
const ACCEPT = '.pdf,.xlsx,.xlsm,.csv,.jpg,.jpeg,.png,.webp,application/pdf,image/*'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    trigger: 'Import dari PDF/Excel/Gambar',
    title: 'Import Partikular Kapal',
    descPick: 'Unggah ship particular (PDF, Excel, atau foto/screenshot). AI membacanya, Anda cek dulu sebelum disimpan.',
    descPreview: 'Periksa hasil bacaan AI, perbaiki bila perlu, lalu simpan.',
    drop: 'Tarik berkas ke sini atau klik untuk memilih',
    formats: 'PDF, XLSX, XLSM, CSV, JPG, PNG, WEBP — maksimal 10 MB',
    reading: 'AI sedang membaca berkas…',
    extract: 'Baca dengan AI',
    exists: 'Kapal ini sudah ada di master data',
    existsUpdate: 'Data di bawah akan MEMPERBARUI kapal tersebut, bukan membuat baru.',
    existsSwitchNew: 'Buat kapal baru saja',
    existsSwitchUpd: 'Perbarui kapal yang ada',
    creatingNew: 'Akan disimpan sebagai KAPAL BARU (bisa jadi duplikat).',
    guard: 'AI hanya memindahkan yang tertulis di dokumen — field yang tak tertulis dibiarkan kosong.',
    oldPrefix: 'Lama: ',
    empty: '(kosong)',
    changeFile: 'Ganti berkas',
    cancel: 'Batal',
    saveNew: 'Simpan Kapal Baru',
    saveUpd: 'Simpan Perubahan',
    errNameReq: 'Nama kapal wajib diisi.',
    errTooBig: 'Berkas terlalu besar (maksimal 10 MB).',
    errType: 'Hanya berkas PDF, Excel (.xlsx/.xlsm), CSV, atau gambar (JPG/PNG/WEBP).',
    errRead: 'Gagal membaca berkas.',
    errSave: 'Gagal menyimpan.',
    errConn: 'Gagal terhubung ke server.',
    errEmpty: 'AI tidak menemukan data kapal di berkas ini. Coba berkas lain atau isi manual.',
  },
  en: {
    trigger: 'Import from PDF/Excel/Image',
    title: 'Import Vessel Particulars',
    descPick: 'Upload a ship particular (PDF, Excel, or a photo/screenshot). AI reads it, you review before saving.',
    descPreview: 'Check what the AI read, fix if needed, then save.',
    drop: 'Drag a file here or click to choose',
    formats: 'PDF, XLSX, XLSM, CSV, JPG, PNG, WEBP — max 10 MB',
    reading: 'AI is reading the file…',
    extract: 'Read with AI',
    exists: 'This vessel already exists in master data',
    existsUpdate: 'The fields below will UPDATE that vessel instead of creating a new one.',
    existsSwitchNew: 'Create as new vessel',
    existsSwitchUpd: 'Update the existing vessel',
    creatingNew: 'Will be saved as a NEW VESSEL (may create a duplicate).',
    guard: 'AI only moves what the document states — fields not stated are left empty.',
    oldPrefix: 'Was: ',
    empty: '(empty)',
    changeFile: 'Change file',
    cancel: 'Cancel',
    saveNew: 'Save New Vessel',
    saveUpd: 'Save Changes',
    errNameReq: 'Vessel name is required.',
    errTooBig: 'File is too large (max 10 MB).',
    errType: 'Only PDF, Excel (.xlsx/.xlsm), CSV, or image (JPG/PNG/WEBP) files.',
    errRead: 'Failed to read the file.',
    errSave: 'Failed to save.',
    errConn: 'Failed to connect to server.',
    errEmpty: 'AI found no vessel data in this file. Try another file or fill it in manually.',
  },
}

type ImportResult = { draft: Record<string, string>; existingVessel: Vessel | null }

const okType = (name: string) => /\.(pdf|xlsx|xlsm|csv|jpe?g|png|webp)$/i.test(name)

export function VesselImportDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved?: (info: { name: string; updated: boolean }) => void
}) {
  const t = useT(STR)
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [asNew, setAsNew] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)

  // Setiap dialog dibuka: mulai bersih, jangan sisa hasil import sebelumnya.
  useEffect(() => {
    if (!open) return
    setFile(null)
    setResult(null)
    setForm(emptyForm())
    setAsNew(false)
    setBusy(false)
    setError('')
    setDragging(false)
  }, [open])

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }))
  const existing = result?.existingVessel ?? null
  const updating = !!existing && !asNew

  function choose(f: File | null | undefined) {
    setError('')
    if (!f) return
    if (!okType(f.name)) {
      setError(t.errType)
      return
    }
    if (f.size > MAX_BYTES) {
      setError(t.errTooBig)
      return
    }
    setFile(f)
  }

  async function extract() {
    if (!file || busy) return
    setBusy(true)
    setError('')
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/ai/vessel-import', { method: 'POST', body })
      if (!res.ok) {
        setError((await res.text()) || t.errRead)
        return
      }
      const r = (await res.json()) as ImportResult
      const filled = Object.values(r.draft).some((v) => v && v.trim())
      if (!filled) {
        setError(t.errEmpty)
        return
      }
      setResult(r)
      // Kapal sudah ada → mulai dari data lama, lalu ditimpa field yang BERHASIL
      // dibaca AI, supaya field yang tak tertulis di dokumen tidak jadi kosong.
      const base = r.existingVessel ? toForm(r.existingVessel) : emptyForm()
      const merged: FormState = { ...base }
      for (const [k, v] of Object.entries(r.draft)) if (v && v.trim()) merged[k] = v.trim()
      setForm(merged)
      setAsNew(false)
    } catch {
      setError(t.errConn)
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (busy) return
    if (!form.name?.trim()) {
      setError(t.errNameReq)
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await fetch(updating ? `/api/vessels/${existing!.id}` : '/api/vessels', {
        method: updating ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        setError((await res.text()) || t.errSave)
        return
      }
      onOpenChange(false)
      onSaved?.({ name: form.name.trim(), updated: updating })
    } catch {
      setError(t.errConn)
    } finally {
      setBusy(false)
    }
  }

  // Nilai lama ditampilkan di bawah field hanya bila berubah — jadi diff-nya kelihatan.
  const hints: Record<string, string> | undefined = updating
    ? Object.fromEntries(
        Object.entries(toForm(existing!))
          .filter(([k, old]) => (form[k] ?? '') !== old)
          .map(([k, old]) => [k, `${t.oldPrefix}${old || t.empty}`]),
      )
    : undefined

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="bg-surface-secondary border-card-border text-text-primary max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent-purple" /> {t.title}
          </DialogTitle>
          <DialogDescription className="text-text-secondary">
            {result ? t.descPreview : t.descPick}
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <>
            <div
              role="button"
              tabIndex={0}
              onClick={() => !busy && fileRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click()
              }}
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                choose(e.dataTransfer.files?.[0])
              }}
              className={`flex flex-col items-center justify-center gap-2 py-10 px-4 rounded-lg border border-dashed cursor-pointer transition-colors ${
                dragging
                  ? 'border-accent-purple/70 bg-accent-purple/10'
                  : 'border-border-muted bg-surface hover:border-accent-purple/40'
              }`}
            >
              <FileUp className="w-6 h-6 text-text-secondary" />
              <p className="text-sm text-text-primary text-center">{file ? file.name : t.drop}</p>
              <p className="text-[11px] text-text-secondary font-mono">{t.formats}</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => choose(e.target.files?.[0])}
            />
          </>
        ) : (
          <div className="space-y-3">
            {existing && (
              <div
                className={`rounded-md px-3 py-2.5 border text-xs ${
                  updating
                    ? 'bg-accent-amber/10 border-accent-amber/30'
                    : 'bg-status-danger/10 border-status-danger/30'
                }`}
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle
                    className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${updating ? 'text-accent-amber' : 'text-status-danger'}`}
                  />
                  <div className="flex-1">
                    <p className="text-text-primary font-medium">
                      {t.exists} — <span className="font-mono">{existing.name}</span>
                      {existing.imoNumber && <span className="text-text-secondary"> · IMO {existing.imoNumber}</span>}
                    </p>
                    <p className="text-text-secondary mt-0.5">{updating ? t.existsUpdate : t.creatingNew}</p>
                    <button
                      type="button"
                      onClick={() => setAsNew((p) => !p)}
                      className="inline-flex items-center gap-1.5 mt-1.5 text-[11px] text-accent-blue hover:underline"
                    >
                      <RefreshCw className="w-3 h-3" />
                      {asNew ? t.existsSwitchUpd : t.existsSwitchNew}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <VesselFieldsGrid form={form} set={set} hints={hints} />

            <div className="flex items-center gap-1.5 bg-status-success/10 border border-status-success/25 rounded-md px-2.5 py-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-status-success flex-shrink-0" />
              <span className="text-[11px] text-status-success">{t.guard}</span>
            </div>
          </div>
        )}

        {error && (
          <p className="text-status-danger text-xs bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          {result ? (
            <button
              type="button"
              onClick={() => {
                setResult(null)
                setFile(null)
                setError('')
              }}
              disabled={busy}
              className="px-4 py-2 rounded text-sm font-medium border border-border-muted text-text-secondary hover:text-white hover:bg-surface-tertiary transition-colors disabled:opacity-50"
            >
              {t.changeFile}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={busy}
              className="px-4 py-2 rounded text-sm font-medium border border-border-muted text-text-secondary hover:text-white hover:bg-surface-tertiary transition-colors disabled:opacity-50"
            >
              {t.cancel}
            </button>
          )}
          <button
            type="button"
            onClick={result ? save : extract}
            disabled={busy || (!result && !file)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded text-sm font-medium bg-accent-blue hover:bg-primary text-[#231a06] transition-colors disabled:opacity-50"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {busy && !result ? t.reading : result ? (updating ? t.saveUpd : t.saveNew) : t.extract}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Label tombol pemicu — dipakai pemanggil agar teksnya konsisten dua bahasa. */
export function useVesselImportLabel() {
  return useT(STR).trigger
}
