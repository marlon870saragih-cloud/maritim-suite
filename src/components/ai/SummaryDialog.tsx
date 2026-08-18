'use client'

// Dialog "Ringkas" — Document Summary (Fase 6g · K80).
//
// Dua sumber, dua tab: dokumen SISTEM (Voyage/Disbursement/Invoice yang
// sedang dibuka — `systemContext`) dan BERKAS unggahan pihak ketiga (selalu
// tersedia). K80 — jalur berkas STATELESS: bytes-nya dikirim ke
// `/api/ai/summarize`, dibaca, lalu dibuang; tidak ada yang tersimpan di
// server (tak ada tabel/direktori lampiran di repo ini sama sekali).

import { useEffect, useRef, useState } from 'react'
import { Check, Copy, FileText, Loader2, Upload } from 'lucide-react'
import { useLang, useT, type Lang } from '@/lib/i18n'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import type { JenisKonteks } from '@/services/ai/konteks'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    title: 'Ringkas Dokumen', desc: 'Ringkasan siap-tempel untuk email/laporan. Berkas unggahan tidak pernah disimpan.',
    tabSystem: 'Dari Dokumen Ini', tabUpload: 'Unggah Berkas',
    summarizeSystem: 'Ringkas', summarizeUpload: 'Unggah & Ringkas',
    chooseFile: 'Pilih berkas…', fileHint: 'PDF, Excel (.xlsx), CSV/teks, atau gambar (JPG/PNG/WEBP), maksimal 10 MB.',
    resultTitle: 'Ringkasan', sourceSystem: 'Sumber: dokumen sistem (angka terverifikasi)', sourceUpload: 'Sumber: berkas unggahan — baca ulang sebelum dipakai, tidak diverifikasi terhadap sistem.',
    copy: 'Salin', copied: 'Tersalin',
    warnUnverified: 'Ada angka pada ringkasan yang tak cocok dengan dokumen — periksa ulang sebelum dipakai.',
    errSummarize: 'Gagal membuat ringkasan.', errConn: 'Gagal terhubung ke server.', errNoFile: 'Pilih berkas dulu.',
    saveAttachment: 'Simpan berkas ini ke lampiran',
    lampiranOk: 'Berkas tersimpan sebagai lampiran.', lampiranFail: 'Ringkasan berhasil, tapi gagal menyimpan lampiran',
  },
  en: {
    title: 'Summarize Document', desc: 'A paste-ready summary for email/reports. Uploaded files are never stored.',
    tabSystem: 'From This Document', tabUpload: 'Upload File',
    summarizeSystem: 'Summarize', summarizeUpload: 'Upload & Summarize',
    chooseFile: 'Choose file…', fileHint: 'PDF, Excel (.xlsx), CSV/text, or image (JPG/PNG/WEBP), max 10 MB.',
    resultTitle: 'Summary', sourceSystem: 'Source: system document (verified figures)', sourceUpload: 'Source: uploaded file — re-read before use, not verified against the system.',
    copy: 'Copy', copied: 'Copied',
    warnUnverified: 'Some figures in the summary do not match the document — double-check before use.',
    errSummarize: 'Failed to generate summary.', errConn: 'Failed to connect to server.', errNoFile: 'Choose a file first.',
    saveAttachment: 'Save this file to attachments',
    lampiranOk: 'File saved as an attachment.', lampiranFail: 'Summary succeeded, but saving the attachment failed',
  },
}

type Tab = 'system' | 'upload'

export function SummaryDialog({
  open,
  onOpenChange,
  systemContext,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  systemContext?: { jenis: JenisKonteks; id: string }
}) {
  const t = useT(STR)
  const { lang } = useLang()
  const [tab, setTab] = useState<Tab>(systemContext ? 'system' : 'upload')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{
    summary: string
    sumber: 'sistem' | 'berkas'
    ditolak: boolean
    lampiran?: { ok: boolean; error?: string }
  } | null>(null)
  const [copied, setCopied] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  // K111 — bawaan MATI (revisi K80): meringkas dokumen pihak ketiga sekali
  // pakai adalah hal wajar; menyimpannya diam-diam bukan.
  const [saveAttachment, setSaveAttachment] = useState(false)

  useEffect(() => {
    if (!open) return
    setTab(systemContext ? 'system' : 'upload')
    setResult(null)
    setError('')
    setFileName('')
    setSaveAttachment(false)
    if (fileRef.current) fileRef.current.value = ''
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function summarizeSystem() {
    if (!systemContext) return
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch(`/api/ai/summarize?bahasa=${lang}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jenis: systemContext.jenis, id: systemContext.id }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setError(body?.error?.message ?? t.errSummarize)
        return
      }
      setResult({ summary: body.summary, sumber: body.sumber, ditolak: !!body.ditolak })
    } catch {
      setError(t.errConn)
    } finally {
      setBusy(false)
    }
  }

  async function summarizeUpload() {
    const file = fileRef.current?.files?.[0]
    if (!file) {
      setError(t.errNoFile)
      return
    }
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const form = new FormData()
      form.append('file', file)
      if (saveAttachment && systemContext) {
        form.append('simpanLampiran', 'true')
        form.append('entityType', systemContext.jenis)
        form.append('entityId', systemContext.id)
      }
      const res = await fetch(`/api/ai/summarize?bahasa=${lang}`, { method: 'POST', body: form })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setError(body?.error?.message ?? t.errSummarize)
        return
      }
      setResult({ summary: body.summary, sumber: body.sumber, ditolak: false, lampiran: body.lampiran })
    } catch {
      setError(t.errConn)
    } finally {
      setBusy(false)
    }
  }

  function copySummary() {
    if (!result) return
    navigator.clipboard?.writeText(result.summary).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="bg-surface-secondary border-card-border text-text-primary max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-white">{t.title}</DialogTitle>
          <DialogDescription className="text-text-secondary">{t.desc}</DialogDescription>
        </DialogHeader>

        {systemContext && (
          <div className="flex gap-1 border-b border-border-muted">
            {(['system', 'upload'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setTab(k)
                  setResult(null)
                  setError('')
                }}
                className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                  tab === k ? 'border-accent-blue text-white' : 'border-transparent text-text-secondary hover:text-white'
                }`}
              >
                {k === 'system' ? t.tabSystem : t.tabUpload}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-3">
          {tab === 'system' ? (
            <button
              type="button"
              onClick={summarizeSystem}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded text-xs font-medium bg-accent-blue hover:bg-primary text-[#231a06] transition-colors disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
              {t.summarizeSystem}
            </button>
          ) : (
            <div className="space-y-2">
              <label className="inline-flex items-center gap-2 cursor-pointer rounded border border-border-muted px-3 py-2 text-xs font-medium text-text-secondary hover:text-white hover:border-accent-blue/60 hover:bg-surface-tertiary transition-colors">
                <Upload className="w-3.5 h-3.5" />
                {fileName || t.chooseFile}
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.xlsx,.xlsm,.csv,.txt,.jpg,.jpeg,.png,.webp,image/*"
                  className="hidden"
                  onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')}
                />
              </label>
              <p className="text-text-secondary text-[11px]">{t.fileHint}</p>
              {systemContext && (
                <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveAttachment}
                    onChange={(e) => setSaveAttachment(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-border-muted accent-accent-blue"
                  />
                  {t.saveAttachment}
                </label>
              )}
              <button
                type="button"
                onClick={summarizeUpload}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded text-xs font-medium bg-accent-blue hover:bg-primary text-[#231a06] transition-colors disabled:opacity-50"
              >
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {t.summarizeUpload}
              </button>
            </div>
          )}

          {error && (
            <p className="text-status-danger text-xs bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2">{error}</p>
          )}

          {result && (
            <div className="space-y-2 pt-2 border-t border-card-border">
              <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">{t.resultTitle}</p>
              <p className="text-sm text-text-primary whitespace-pre-wrap rounded border border-border-muted bg-surface px-3 py-2.5">
                {result.summary}
              </p>
              <p className="text-text-secondary text-[11px] italic">
                {result.sumber === 'sistem' ? t.sourceSystem : t.sourceUpload}
              </p>
              {result.ditolak && (
                <p className="text-status-danger text-xs bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2">
                  {t.warnUnverified}
                </p>
              )}
              {result.lampiran && (
                <p className={`text-xs ${result.lampiran.ok ? 'text-status-success' : 'text-status-danger'}`}>
                  {result.lampiran.ok ? t.lampiranOk : `${t.lampiranFail}: ${result.lampiran.error}`}
                </p>
              )}
              <button
                type="button"
                onClick={copySummary}
                className="inline-flex items-center gap-1.5 rounded border border-border-muted px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:text-white hover:border-accent-blue/60 hover:bg-surface-tertiary transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? t.copied : t.copy}
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
