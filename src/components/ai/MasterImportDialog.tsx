'use client'

// Import Master Data dari PDF/Excel/Gambar (Fase 6h bagian 1 · K81) — generalisasi
// `VesselImportDialog.tsx` (Fase 1) untuk tiga target: Customer, Vendor, Port.
//
// Beda kunci dari VesselImportDialog: satu berkas di sini biasanya berisi
// SATU DAFTAR (banyak baris), bukan satu entitas — jadi pratinjau berbentuk
// daftar kartu bercentang (default semua tercentang), bukan satu form. Tiap
// baris tetap bisa disunting sebelum disimpan (K81: "field yang tak ada di
// berkas kosong, bukan ditebak" — operator yang mengisi manual bila perlu).
//
// Penyimpanan TETAP lewat POST/PATCH /api/customers|vendors|ports yang sudah
// ada — dipanggil SATU PER SATU baris yang dicentang (bukan endpoint batch
// baru): tiap panggilan lewat validasi & tenant-guard yang sudah ada, dan
// kegagalan satu baris tak menggagalkan baris lain.

import { useEffect, useRef, useState } from 'react'
import { Check, FileUp, Loader2, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react'
import { useLang, useT, type Lang } from '@/lib/i18n'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

const MAX_BYTES = 10 * 1024 * 1024
const ACCEPT = '.pdf,.xlsx,.xlsm,.csv,.txt,.jpg,.jpeg,.png,.webp,application/pdf,image/*'
const okType = (name: string) => /\.(pdf|xlsx|xlsm|csv|txt|jpe?g|png|webp)$/i.test(name)

export type MasterTarget = 'customer' | 'vendor' | 'port'

type FieldSpec = { key: string; label: Record<Lang, string>; type?: 'text' | 'email' | 'number'; required?: boolean }

const FIELDS: Record<MasterTarget, FieldSpec[]> = {
  customer: [
    { key: 'name', label: { id: 'Nama Customer', en: 'Customer Name' }, required: true },
    { key: 'customerType', label: { id: 'Tipe', en: 'Type' } },
    { key: 'address', label: { id: 'Alamat', en: 'Address' } },
    { key: 'npwp', label: { id: 'NPWP', en: 'NPWP' } },
    { key: 'email', label: { id: 'Email', en: 'Email' }, type: 'email' },
    { key: 'phone', label: { id: 'Telepon', en: 'Phone' } },
    { key: 'contactPerson', label: { id: 'Kontak Person', en: 'Contact Person' } },
    { key: 'paymentTermDays', label: { id: 'Termin Bayar (hari)', en: 'Payment Term (days)' }, type: 'number' },
  ],
  vendor: [
    { key: 'name', label: { id: 'Nama Vendor', en: 'Vendor Name' }, required: true },
    { key: 'vendorType', label: { id: 'Tipe', en: 'Type' } },
    { key: 'address', label: { id: 'Alamat', en: 'Address' } },
    { key: 'npwp', label: { id: 'NPWP', en: 'NPWP' } },
    { key: 'email', label: { id: 'Email', en: 'Email' }, type: 'email' },
    { key: 'phone', label: { id: 'Telepon', en: 'Phone' } },
    { key: 'contactPerson', label: { id: 'Kontak Person', en: 'Contact Person' } },
    { key: 'bankName', label: { id: 'Nama Bank', en: 'Bank Name' } },
    { key: 'bankAccount', label: { id: 'No. Rekening', en: 'Account No.' } },
    { key: 'paymentTermDays', label: { id: 'Termin Bayar (hari)', en: 'Payment Term (days)' }, type: 'number' },
  ],
  port: [
    { key: 'name', label: { id: 'Nama Pelabuhan', en: 'Port Name' }, required: true },
    { key: 'unlocode', label: { id: 'UN/LOCODE', en: 'UN/LOCODE' } },
    { key: 'country', label: { id: 'Negara', en: 'Country' } },
    { key: 'portAuthority', label: { id: 'Otoritas Pelabuhan', en: 'Port Authority' } },
    { key: 'maxDraft', label: { id: 'Draft Maks (m)', en: 'Max Draft (m)' }, type: 'number' },
    { key: 'maxLoa', label: { id: 'LOA Maks (m)', en: 'Max LOA (m)' }, type: 'number' },
    { key: 'workingHours', label: { id: 'Jam Kerja', en: 'Working Hours' } },
  ],
}

const ENDPOINT: Record<MasterTarget, string> = { customer: '/api/customers', vendor: '/api/vendors', port: '/api/ports' }

const TRIGGER_LABEL: Record<MasterTarget, Record<Lang, string>> = {
  customer: { id: 'Import Customer dari PDF/Excel', en: 'Import Customers from PDF/Excel' },
  vendor: { id: 'Import Vendor dari PDF/Excel', en: 'Import Vendors from PDF/Excel' },
  port: { id: 'Import Pelabuhan dari PDF/Excel', en: 'Import Ports from PDF/Excel' },
}

const STR: Record<Lang, Record<string, string>> = {
  id: {
    descPick: 'Unggah daftar (PDF, Excel, CSV, atau foto/screenshot). AI membacanya, Anda cek dulu sebelum disimpan.',
    descPreview: 'Periksa tiap baris hasil bacaan AI, perbaiki bila perlu, centang yang mau disimpan.',
    drop: 'Tarik berkas ke sini atau klik untuk memilih',
    formats: 'PDF, XLSX, XLSM, CSV, TXT, JPG, PNG, WEBP — maksimal 10 MB',
    reading: 'AI sedang membaca berkas…',
    extract: 'Baca dengan AI',
    changeFile: 'Ganti berkas',
    cancel: 'Batal',
    save: 'Simpan yang dicentang',
    guard: 'AI hanya memindahkan yang tertulis di dokumen — field yang tak tertulis dibiarkan kosong.',
    existsBadge: 'Sudah ada — akan diperbarui',
    newBadge: 'Baru',
    noneFound: 'AI tidak menemukan baris apa pun di berkas ini. Coba berkas lain.',
    errTooBig: 'Berkas terlalu besar (maksimal 10 MB).',
    errType: 'Hanya berkas PDF, Excel (.xlsx/.xlsm), CSV/teks, atau gambar (JPG/PNG/WEBP).',
    errRead: 'Gagal membaca berkas.',
    errConn: 'Gagal terhubung ke server.',
    resultTitle: 'Hasil',
    resultOk: 'tersimpan',
    resultFail: 'gagal',
    close: 'Tutup',
  },
  en: {
    descPick: 'Upload a list (PDF, Excel, CSV, or a photo/screenshot). AI reads it, you review before saving.',
    descPreview: 'Check each row the AI read, fix if needed, tick the ones to save.',
    drop: 'Drag a file here or click to choose',
    formats: 'PDF, XLSX, XLSM, CSV, TXT, JPG, PNG, WEBP — max 10 MB',
    reading: 'AI is reading the file…',
    extract: 'Read with AI',
    changeFile: 'Change file',
    cancel: 'Cancel',
    save: 'Save checked',
    guard: 'AI only moves what the document states — fields not stated are left empty.',
    existsBadge: 'Already exists — will be updated',
    newBadge: 'New',
    noneFound: 'AI found no rows in this file. Try another file.',
    errTooBig: 'File is too large (max 10 MB).',
    errType: 'Only PDF, Excel (.xlsx/.xlsm), CSV/text, or image (JPG/PNG/WEBP) files.',
    errRead: 'Failed to read the file.',
    errConn: 'Failed to connect to server.',
    resultTitle: 'Result',
    resultOk: 'saved',
    resultFail: 'failed',
    close: 'Close',
  },
}

type Row = {
  form: Record<string, string>
  existingId: string | null
  existingLabel: string | null
  include: boolean
}

export function MasterImportDialog({
  target,
  open,
  onOpenChange,
  onSaved,
}: {
  target: MasterTarget
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved?: () => void
}) {
  const t = useT(STR)
  const { lang } = useLang()
  const fields = FIELDS[target]
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [saveResult, setSaveResult] = useState<{ ok: number; fail: number } | null>(null)

  useEffect(() => {
    if (!open) return
    setFile(null)
    setRows(null)
    setBusy(false)
    setError('')
    setDragging(false)
    setSaveResult(null)
  }, [open])

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
      body.append('target', target)
      body.append('file', file)
      const res = await fetch('/api/ai/master-import', { method: 'POST', body })
      const respBody = await res.json().catch(() => null)
      if (!res.ok) {
        setError(respBody?.error?.message ?? t.errRead)
        return
      }
      const items: { draft: Record<string, string>; existing: (Record<string, unknown> & { id: string; name: string }) | null }[] =
        respBody?.items ?? []
      if (items.length === 0) {
        setError(t.noneFound)
        return
      }
      setRows(
        items.map(({ draft, existing }) => {
          const form: Record<string, string> = {}
          for (const f2 of fields) {
            const fromExisting = existing && existing[f2.key] != null ? String(existing[f2.key]) : ''
            const fromDraft = draft[f2.key]
            form[f2.key] = fromDraft && fromDraft.trim() ? fromDraft.trim() : fromExisting
          }
          return { form, existingId: existing?.id ?? null, existingLabel: existing?.name ?? null, include: true }
        }),
      )
    } catch {
      setError(t.errConn)
    } finally {
      setBusy(false)
    }
  }

  function setRowField(i: number, key: string, v: string) {
    setRows((prev) => (prev ? prev.map((r, idx) => (idx === i ? { ...r, form: { ...r.form, [key]: v } } : r)) : prev))
  }
  function toggleRow(i: number) {
    setRows((prev) => (prev ? prev.map((r, idx) => (idx === i ? { ...r, include: !r.include } : r)) : prev))
  }

  async function saveChecked() {
    if (!rows || busy) return
    const toSave = rows.filter((r) => r.include && r.form.name?.trim())
    if (toSave.length === 0) return
    setBusy(true)
    setError('')
    let ok = 0
    let fail = 0
    for (const row of toSave) {
      try {
        const res = await fetch(row.existingId ? `${ENDPOINT[target]}/${row.existingId}` : ENDPOINT[target], {
          method: row.existingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(row.form),
        })
        if (res.ok) ok++
        else fail++
      } catch {
        fail++
      }
    }
    setBusy(false)
    setSaveResult({ ok, fail })
    if (ok > 0) onSaved?.()
  }

  const checkedCount = rows?.filter((r) => r.include).length ?? 0

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="bg-surface-secondary border-card-border text-text-primary max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent-purple" /> {TRIGGER_LABEL[target][lang]}
          </DialogTitle>
          <DialogDescription className="text-text-secondary">{rows ? t.descPreview : t.descPick}</DialogDescription>
        </DialogHeader>

        {saveResult ? (
          <div className="space-y-3">
            <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">{t.resultTitle}</p>
            <p className="text-sm text-text-primary">
              {saveResult.ok} {t.resultOk}
              {saveResult.fail > 0 && <span className="text-status-danger"> · {saveResult.fail} {t.resultFail}</span>}
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded text-sm font-medium bg-accent-blue hover:bg-primary text-[#231a06] transition-colors"
              >
                {t.close}
              </button>
            </div>
          </div>
        ) : !rows ? (
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
                dragging ? 'border-accent-purple/70 bg-accent-purple/10' : 'border-border-muted bg-surface hover:border-accent-purple/40'
              }`}
            >
              <FileUp className="w-6 h-6 text-text-secondary" />
              <p className="text-sm text-text-primary text-center">{file ? file.name : t.drop}</p>
              <p className="text-[11px] text-text-secondary font-mono">{t.formats}</p>
            </div>
            <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => choose(e.target.files?.[0])} />

            {error && (
              <p className="text-status-danger text-xs bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2">{error}</p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={busy}
                className="px-4 py-2 rounded text-sm font-medium border border-border-muted text-text-secondary hover:text-white hover:bg-surface-tertiary transition-colors disabled:opacity-50"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={extract}
                disabled={busy || !file}
                className="inline-flex items-center gap-2 px-4 py-2 rounded text-sm font-medium bg-accent-blue hover:bg-primary text-[#231a06] transition-colors disabled:opacity-50"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {busy ? t.reading : t.extract}
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 bg-status-success/10 border border-status-success/25 rounded-md px-2.5 py-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-status-success flex-shrink-0" />
              <span className="text-[11px] text-status-success">{t.guard}</span>
            </div>

            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
              {rows.map((row, i) => (
                <div key={i} className="rounded-lg border border-border-muted bg-surface p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={row.include}
                        onChange={() => toggleRow(i)}
                        className="w-4 h-4 rounded border-border-muted accent-accent-blue"
                      />
                      <span className="text-sm text-text-primary font-medium">{row.form.name || `#${i + 1}`}</span>
                    </label>
                    {row.existingId ? (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-accent-amber/30 bg-accent-amber/10 text-accent-amber">
                        <RefreshCw className="w-2.5 h-2.5" /> {t.existsBadge}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-status-success/30 bg-status-success/10 text-status-success">
                        <Check className="w-2.5 h-2.5" /> {t.newBadge}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {fields.map((f) => (
                      <div key={f.key} className={f.key === 'name' || f.key === 'address' ? 'col-span-2' : undefined}>
                        <label className="block text-[9px] font-mono uppercase tracking-wider text-text-secondary mb-0.5">
                          {f.label[lang]}
                        </label>
                        <input
                          type={f.type === 'number' ? 'number' : f.type === 'email' ? 'email' : 'text'}
                          value={row.form[f.key] ?? ''}
                          onChange={(e) => setRowField(i, f.key, e.target.value)}
                          className="w-full bg-surface-secondary border border-border-muted rounded px-2 py-1.5 text-xs text-text-primary focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/40"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {error && (
              <p className="text-status-danger text-xs bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2">{error}</p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setRows(null)
                  setFile(null)
                  setError('')
                }}
                disabled={busy}
                className="px-4 py-2 rounded text-sm font-medium border border-border-muted text-text-secondary hover:text-white hover:bg-surface-tertiary transition-colors disabled:opacity-50"
              >
                {t.changeFile}
              </button>
              <button
                type="button"
                onClick={saveChecked}
                disabled={busy || checkedCount === 0}
                className="inline-flex items-center gap-2 px-4 py-2 rounded text-sm font-medium bg-accent-blue hover:bg-primary text-[#231a06] transition-colors disabled:opacity-50"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {t.save} ({checkedCount})
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Label tombol pemicu — dipakai pemanggil agar teksnya konsisten dua bahasa. */
export function useMasterImportLabel(target: MasterTarget) {
  const { lang } = useLang()
  return TRIGGER_LABEL[target][lang]
}
