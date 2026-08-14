'use client'

// Import Tarif dari PDF/Excel (Fase 6h bagian 2 · K82) — SATU-SATUNYA dialog
// impor AI di seluruh Fase 6 yang menulis ANGKA UANG. Beda sengaja dari
// `MasterImportDialog.tsx` (K81, dipisah jadi komponen sendiri per §11):
//
//   1. TIDAK ADA tombol "terima semua". Setiap baris tercentang SATU PER SATU
//      oleh operator, dan bawaannya TIDAK TERCENTANG (lebih ketat dari K81
//      yang bawaannya tercentang) — untuk tarif, memaksa operator menyentuh
//      tiap baris sebelum tersimpan adalah keseluruhan nilainya (K82/2).
//   2. Tiap baris WAJIB tampil sebagai DIFF (tarif lama → baru + % perubahan),
//      bukan cuma nilai baru.
//   3. Baris yang jasanya tak dikenal di ServiceCatalog TIDAK BISA dicentang
//      sama sekali — diarahkan ke Master › Jasa dulu (K82/3), bukan dibuatkan
//      jasa baru otomatis.
//   4. Penyimpanan lewat endpoint TERPISAH (`api/ai/rate-import`, bukan
//      `api/service-rates` generik) supaya AuditLog+nama berkas WAJIB tercatat
//      (K82/4) — bukan tergantung operator ingat mengisi catatan.
//   5. Hasilnya SELALU baris ServiceRate BARU (K82/1) — dialog ini tidak
//      pernah menawarkan "perbarui tarif lama", beda dari Customer/Vendor/Port
//      yang menawarkan update baris yang cocok.

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, FileUp, Loader2, ShieldAlert, ShieldCheck, Sparkles, TrendingDown, TrendingUp } from 'lucide-react'
import { useLang, useT, type Lang } from '@/lib/i18n'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

const MAX_BYTES = 10 * 1024 * 1024
const ACCEPT = '.pdf,.xlsx,.xlsm,.csv,.txt,.jpg,.jpeg,.png,.webp,application/pdf,image/*'
const okType = (name: string) => /\.(pdf|xlsx|xlsm|csv|txt|jpe?g|png|webp)$/i.test(name)

const STR: Record<Lang, Record<string, string>> = {
  id: {
    trigger: 'Import Tarif dari PDF/Excel',
    title: 'Import Tarif',
    descPick: 'Unggah edaran/lembar tarif (PDF, Excel, CSV, atau foto). AI membaca angkanya, WAJIB Anda periksa satu-satu sebelum disimpan.',
    descPreview: 'Periksa tiap baris. Baris tersimpan SELALU jadi tarif baru (tarif lama tidak pernah ditimpa/dihapus).',
    drop: 'Tarik berkas ke sini atau klik untuk memilih',
    formats: 'PDF, XLSX, XLSM, CSV, TXT, JPG, PNG, WEBP — maksimal 10 MB',
    reading: 'AI sedang membaca berkas…',
    extract: 'Baca dengan AI',
    changeFile: 'Ganti berkas',
    cancel: 'Batal',
    save: 'Simpan yang dicentang',
    guard: 'Setiap baris tersimpan menjadi TARIF BARU (bukan menimpa) dan dicatat di jejak audit beserta nama berkas ini.',
    unmatched: 'Jasa belum ada di katalog — buat dulu di Master › Jasa, lalu ulangi impor.',
    matchedAs: 'Cocok dengan jasa',
    portGeneral: 'Berlaku umum (semua pelabuhan)',
    oldRate: 'Tarif lama',
    newRate: 'Tarif baru',
    noOldRate: 'Belum ada tarif sebelumnya untuk jasa/pelabuhan ini',
    fVesselType: 'Tipe Kapal', fGtMin: 'GT Min', fGtMax: 'GT Maks', fRate: 'Rate', fCurrency: 'Mata Uang',
    fMinCharge: 'Minimum Charge', fFrom: 'Berlaku Dari',
    noneFound: 'AI tidak menemukan baris tarif apa pun di berkas ini. Coba berkas lain.',
    errTooBig: 'Berkas terlalu besar (maksimal 10 MB).',
    errType: 'Hanya berkas PDF, Excel (.xlsx/.xlsm), CSV/teks, atau gambar (JPG/PNG/WEBP).',
    errRead: 'Gagal membaca berkas.',
    errConn: 'Gagal terhubung ke server.',
    errRateReq: 'Rate wajib diisi dan lebih besar dari 0.',
    resultTitle: 'Hasil', resultOk: 'tersimpan', resultFail: 'gagal', close: 'Tutup',
  },
  en: {
    trigger: 'Import Rates from PDF/Excel',
    title: 'Import Rates',
    descPick: 'Upload a tariff circular/sheet (PDF, Excel, CSV, or photo). AI reads the figures — you MUST check each row before saving.',
    descPreview: 'Check each row. Saved rows ALWAYS become a new rate (the old rate is never overwritten/deleted).',
    drop: 'Drag a file here or click to choose',
    formats: 'PDF, XLSX, XLSM, CSV, TXT, JPG, PNG, WEBP — max 10 MB',
    reading: 'AI is reading the file…',
    extract: 'Read with AI',
    changeFile: 'Change file',
    cancel: 'Cancel',
    save: 'Save checked',
    guard: 'Every saved row becomes a NEW RATE (never overwritten) and is recorded in the audit trail with this file name.',
    unmatched: 'Service not yet in the catalog — create it in Master › Services first, then re-import.',
    matchedAs: 'Matched to service',
    portGeneral: 'Applies generally (all ports)',
    oldRate: 'Old rate',
    newRate: 'New rate',
    noOldRate: 'No previous rate for this service/port',
    fVesselType: 'Vessel Type', fGtMin: 'GT Min', fGtMax: 'GT Max', fRate: 'Rate', fCurrency: 'Currency',
    fMinCharge: 'Minimum Charge', fFrom: 'Effective From',
    noneFound: 'AI found no rate rows in this file. Try another file.',
    errTooBig: 'File is too large (max 10 MB).',
    errType: 'Only PDF, Excel (.xlsx/.xlsm), CSV/text, or image (JPG/PNG/WEBP) files.',
    errRead: 'Failed to read the file.',
    errConn: 'Failed to connect to server.',
    errRateReq: 'Rate is required and must be greater than 0.',
    resultTitle: 'Result', resultOk: 'saved', resultFail: 'failed', close: 'Close',
  },
}

type ServiceMatch = { id: string; serviceCode: string; serviceName: string } | null
type PortMatch = { id: string; name: string } | null
type CurrentRate = { rate: number; currency: string; effectiveFrom: string; minCharge: number | null } | null

type Row = {
  form: {
    vesselType: string
    gtMin: string
    gtMax: string
    rate: string
    currency: string
    minCharge: string
    effectiveFrom: string
  }
  serviceMatch: ServiceMatch
  serviceRaw: string
  portMatch: PortMatch
  currentRate: CurrentRate
  checked: boolean
}

export function RateImportDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved?: () => void
}) {
  const t = useT(STR)
  const { lang } = useLang()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [saveResult, setSaveResult] = useState<{ ok: number; fail: number; errors: string[] } | null>(null)

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
      body.append('target', 'tarif')
      body.append('file', file)
      const res = await fetch('/api/ai/master-import', { method: 'POST', body })
      const respBody = await res.json().catch(() => null)
      if (!res.ok) {
        setError(respBody?.error?.message ?? t.errRead)
        return
      }
      const items: {
        draft: Record<string, string>
        serviceMatch: ServiceMatch
        portMatch: PortMatch
        currentRate: CurrentRate
      }[] = respBody?.items ?? []
      if (items.length === 0) {
        setError(t.noneFound)
        return
      }
      setRows(
        items.map(({ draft, serviceMatch, portMatch, currentRate }) => ({
          form: {
            vesselType: draft.vesselType ?? '',
            gtMin: draft.gtMin ?? '',
            gtMax: draft.gtMax ?? '',
            rate: draft.rate ?? '',
            currency: draft.currency ?? currentRate?.currency ?? '',
            minCharge: draft.minCharge ?? '',
            effectiveFrom: draft.effectiveFrom ?? '',
          },
          serviceMatch,
          serviceRaw: draft.serviceName || draft.serviceCode || '',
          portMatch,
          currentRate,
          // K82/2 — bawaan TIDAK tercentang, beda sengaja dari MasterImportDialog (K81).
          checked: false,
        })),
      )
    } catch {
      setError(t.errConn)
    } finally {
      setBusy(false)
    }
  }

  function setRowField(i: number, key: keyof Row['form'], v: string) {
    setRows((prev) => (prev ? prev.map((r, idx) => (idx === i ? { ...r, form: { ...r.form, [key]: v } } : r)) : prev))
  }
  function toggleRow(i: number) {
    setRows((prev) => (prev ? prev.map((r, idx) => (idx === i && r.serviceMatch ? { ...r, checked: !r.checked } : r)) : prev))
  }

  async function saveChecked() {
    if (!rows || busy || !file) return
    const toSave = rows.filter((r) => r.checked && r.serviceMatch)
    if (toSave.length === 0) return
    const invalid = toSave.find((r) => !r.form.rate || Number(r.form.rate) <= 0)
    if (invalid) {
      setError(t.errRateReq)
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/ai/rate-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceFileName: file.name,
          items: toSave.map((r) => ({
            serviceId: r.serviceMatch!.id,
            portId: r.portMatch?.id || null,
            vesselType: r.form.vesselType || null,
            gtMin: r.form.gtMin || null,
            gtMax: r.form.gtMax || null,
            rate: r.form.rate,
            currency: r.form.currency || undefined,
            minCharge: r.form.minCharge || null,
            effectiveFrom: r.form.effectiveFrom || null,
          })),
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setError(body?.error?.message ?? t.errRead)
        return
      }
      const hasil: { ok: boolean; error?: string }[] = body?.hasil ?? []
      const ok = hasil.filter((h) => h.ok).length
      const fail = hasil.length - ok
      setSaveResult({ ok, fail, errors: hasil.filter((h) => !h.ok).map((h) => h.error ?? '').filter(Boolean) })
      if (ok > 0) onSaved?.()
    } catch {
      setError(t.errConn)
    } finally {
      setBusy(false)
    }
  }

  const checkedCount = rows?.filter((r) => r.checked).length ?? 0
  const fmtNum = (n: number) => n.toLocaleString(lang === 'id' ? 'id-ID' : 'en-US', { maximumFractionDigits: 2 })

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="bg-surface-secondary border-card-border text-text-primary max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent-purple" /> {t.title}
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
            {saveResult.errors.length > 0 && (
              <ul className="text-xs text-status-danger list-disc pl-4 space-y-0.5">
                {saveResult.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
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
            <div className="flex items-center gap-1.5 bg-accent-amber/10 border border-accent-amber/25 rounded-md px-2.5 py-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-accent-amber flex-shrink-0" />
              <span className="text-[11px] text-accent-amber">{t.guard}</span>
            </div>

            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
              {rows.map((row, i) => {
                const rateNum = Number(row.form.rate)
                const pct =
                  row.currentRate && row.currentRate.currency === row.form.currency && row.currentRate.rate > 0 && Number.isFinite(rateNum)
                    ? ((rateNum - row.currentRate.rate) / row.currentRate.rate) * 100
                    : null
                return (
                  <div
                    key={i}
                    className={`rounded-lg border p-3 space-y-2 ${
                      row.serviceMatch ? 'border-border-muted bg-surface' : 'border-status-danger/40 bg-status-danger/5'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <label className={`flex items-center gap-2 ${row.serviceMatch ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                        <input
                          type="checkbox"
                          checked={row.checked}
                          disabled={!row.serviceMatch}
                          onChange={() => toggleRow(i)}
                          className="w-4 h-4 rounded border-border-muted accent-accent-blue disabled:opacity-50"
                        />
                        <span className="text-sm text-text-primary font-medium">
                          {row.serviceMatch ? row.serviceMatch.serviceName : row.serviceRaw || `#${i + 1}`}
                        </span>
                      </label>
                      {row.serviceMatch ? (
                        <span className="text-[10px] font-mono text-text-secondary">
                          {t.matchedAs} <span className="text-accent-blue">{row.serviceMatch.serviceCode}</span>
                        </span>
                      ) : null}
                    </div>

                    {!row.serviceMatch && (
                      <p className="flex items-start gap-1.5 text-xs text-status-danger">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> {t.unmatched}
                      </p>
                    )}

                    <p className="text-[11px] text-text-secondary">{row.portMatch ? row.portMatch.name : t.portGeneral}</p>

                    {row.serviceMatch && (
                      <>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-[9px] font-mono uppercase tracking-wider text-text-secondary mb-0.5">{t.fVesselType}</label>
                            <input
                              value={row.form.vesselType}
                              onChange={(e) => setRowField(i, 'vesselType', e.target.value)}
                              className="w-full bg-surface-secondary border border-border-muted rounded px-2 py-1.5 text-xs text-text-primary focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/40"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-mono uppercase tracking-wider text-text-secondary mb-0.5">{t.fGtMin}</label>
                            <input
                              type="number"
                              value={row.form.gtMin}
                              onChange={(e) => setRowField(i, 'gtMin', e.target.value)}
                              className="w-full bg-surface-secondary border border-border-muted rounded px-2 py-1.5 text-xs text-text-primary focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/40"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-mono uppercase tracking-wider text-text-secondary mb-0.5">{t.fGtMax}</label>
                            <input
                              type="number"
                              value={row.form.gtMax}
                              onChange={(e) => setRowField(i, 'gtMax', e.target.value)}
                              className="w-full bg-surface-secondary border border-border-muted rounded px-2 py-1.5 text-xs text-text-primary focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/40"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-mono uppercase tracking-wider text-text-secondary mb-0.5">{t.fRate} *</label>
                            <input
                              type="number"
                              value={row.form.rate}
                              onChange={(e) => setRowField(i, 'rate', e.target.value)}
                              className="w-full bg-surface-secondary border border-accent-amber/40 rounded px-2 py-1.5 text-xs text-text-primary font-mono focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/40"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-mono uppercase tracking-wider text-text-secondary mb-0.5">{t.fCurrency}</label>
                            <input
                              value={row.form.currency}
                              onChange={(e) => setRowField(i, 'currency', e.target.value.toUpperCase())}
                              placeholder="IDR"
                              className="w-full bg-surface-secondary border border-border-muted rounded px-2 py-1.5 text-xs text-text-primary focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/40"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-mono uppercase tracking-wider text-text-secondary mb-0.5">{t.fMinCharge}</label>
                            <input
                              type="number"
                              value={row.form.minCharge}
                              onChange={(e) => setRowField(i, 'minCharge', e.target.value)}
                              className="w-full bg-surface-secondary border border-border-muted rounded px-2 py-1.5 text-xs text-text-primary focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/40"
                            />
                          </div>
                          <div className="col-span-3">
                            <label className="block text-[9px] font-mono uppercase tracking-wider text-text-secondary mb-0.5">{t.fFrom}</label>
                            <input
                              type="date"
                              value={row.form.effectiveFrom}
                              onChange={(e) => setRowField(i, 'effectiveFrom', e.target.value)}
                              className="w-full bg-surface-secondary border border-border-muted rounded px-2 py-1.5 text-xs text-text-primary focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/40"
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-xs pt-1 border-t border-border-muted/60">
                          {row.currentRate ? (
                            <>
                              <span className="text-text-secondary">
                                {t.oldRate}: <span className="font-mono text-text-primary">{row.currentRate.currency} {fmtNum(row.currentRate.rate)}</span>
                              </span>
                              <span className="text-text-secondary">→</span>
                              <span className="text-text-secondary">
                                {t.newRate}: <span className="font-mono text-text-primary">{row.form.currency || '?'} {row.form.rate ? fmtNum(rateNum) : '—'}</span>
                              </span>
                              {pct !== null && (
                                <span className={`inline-flex items-center gap-0.5 font-mono ${pct >= 0 ? 'text-status-danger' : 'text-status-success'}`}>
                                  {pct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                  {pct >= 0 ? '+' : ''}{fmtNum(pct)}%
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-text-secondary italic">{t.noOldRate}</span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>

            {error && (
              <p className="text-status-danger text-xs bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2">{error}</p>
            )}

            <div className="flex items-center gap-1.5 bg-status-success/10 border border-status-success/25 rounded-md px-2.5 py-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-status-success flex-shrink-0" />
              <span className="text-[11px] text-status-success">{t.guard}</span>
            </div>

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
export function useRateImportLabel() {
  const { lang } = useLang()
  return STR[lang].trigger
}
