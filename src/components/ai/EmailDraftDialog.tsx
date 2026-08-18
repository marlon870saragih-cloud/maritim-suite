'use client'

// Dialog "Draft email" (Fase 6g · K78–K79).
//
// K78 — TIDAK ADA tombol Kirim di layar. Cuma Salin + tautan `mailto:` yang
// membuka klien email PENGGUNA sendiri; server tidak pernah mengirim apa pun.
// Status `SENT` pada dokumen tetap ditandai manual operator, tidak berubah.
//
// K79 — templat yang ditawarkan bergantung konteks tempat dialog dibuka
// (lihat `templatTersedia()`); penerima & angka datang dari server
// (`/api/ai/email-draft`), bukan dikarang di sini.

import { useEffect, useState } from 'react'
import { Check, Copy, ExternalLink, Loader2 } from 'lucide-react'
import { useLang, useT, type Lang } from '@/lib/i18n'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    title: 'Draft Email', desc: 'Hanya draf — tidak ada yang dikirim dari sini. Salin ke klien email Anda.',
    template: 'Templat', item: 'Baris jasa (vendor)',
    tplEpda: 'Pengantar EPDA/FPDA', tplFda: 'Penyelesaian FDA', tplInvoice: 'Penagihan Invoice', tplVendor: 'Permintaan Penawaran Vendor',
    lang: 'Bahasa draf', generate: 'Buat Draft', regenerate: 'Buat Ulang',
    to: 'Kepada', toEmpty: 'Tidak ada email tersimpan untuk pihak ini — isi manual sebelum mengirim.',
    subject: 'Subjek', body: 'Isi',
    copy: 'Salin', copied: 'Tersalin', openMail: 'Buka di Klien Email',
    warnUnverified: 'Ada angka pada draf yang tak cocok dengan data — periksa ulang sebelum dipakai.',
    errGenerate: 'Gagal membuat draf.', errConn: 'Gagal terhubung ke server.',
    noTemplate: 'Tidak ada templat yang relevan untuk dokumen ini pada status sekarang.',
  },
  en: {
    title: 'Email Draft', desc: 'Draft only — nothing is sent from here. Copy it into your own email client.',
    template: 'Template', item: 'Service line (vendor)',
    tplEpda: 'EPDA/FPDA Cover Letter', tplFda: 'FDA Settlement', tplInvoice: 'Invoice Reminder', tplVendor: 'Vendor RFQ',
    lang: 'Draft language', generate: 'Generate Draft', regenerate: 'Regenerate',
    to: 'To', toEmpty: 'No email on file for this party — fill it in manually before sending.',
    subject: 'Subject', body: 'Body',
    copy: 'Copy', copied: 'Copied', openMail: 'Open in Email Client',
    warnUnverified: 'Some figures in the draft do not match the data — double-check before use.',
    errGenerate: 'Failed to generate draft.', errConn: 'Failed to connect to server.',
    noTemplate: 'No relevant template for this document at its current status.',
  },
}

export type EmailDraftItem = { id: string; description: string; vendorId: string | null; vendorName: string | null }

export type EmailDraftContext =
  | { kind: 'DISBURSEMENT'; disbursementId: string; disbKind: string; status: string; items: EmailDraftItem[] }
  | { kind: 'INVOICE'; invoiceId: string }

type Templat = 'EPDA_INTRO' | 'FDA_SETTLEMENT' | 'INVOICE_REMINDER' | 'VENDOR_RFQ'

const STATUS_EPDA_INTRO = new Set(['APPROVED', 'SENT', 'FINAL', 'CLOSED'])
const STATUS_FDA_FINAL = new Set(['FINAL', 'CLOSED'])

/** Cermin `email-draft.service.ts` — dipakai UI untuk memilih templat yang masuk akal DITAWARKAN, bukan sumber kebenaran validasi (server tetap memvalidasi ulang). */
export function templatTersedia(ctx: EmailDraftContext): Templat[] {
  if (ctx.kind === 'INVOICE') return ['INVOICE_REMINDER']
  const hasil: Templat[] = []
  if ((ctx.disbKind === 'EPDA' || ctx.disbKind === 'FPDA') && STATUS_EPDA_INTRO.has(ctx.status)) hasil.push('EPDA_INTRO')
  if (ctx.disbKind === 'FDA' && STATUS_FDA_FINAL.has(ctx.status)) hasil.push('FDA_SETTLEMENT')
  if (ctx.items.some((it) => it.vendorId)) hasil.push('VENDOR_RFQ')
  return hasil
}

export function EmailDraftDialog({
  open,
  onOpenChange,
  context,
  onLogged,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  context: EmailDraftContext
  /** K137 — dipanggil sesudah EmailLog DRAFTED berhasil dicatat (Salin/Buka di email), supaya EmailLogPanel di layar bisa menyegarkan diri. */
  onLogged?: () => void
}) {
  const t = useT(STR)
  const { lang } = useLang()
  const tersedia = templatTersedia(context)
  const vendorItems = context.kind === 'DISBURSEMENT' ? context.items.filter((it) => it.vendorId) : []

  const [templat, setTemplat] = useState<Templat | null>(tersedia[0] ?? null)
  const [itemId, setItemId] = useState<string>(vendorItems[0]?.id ?? '')
  const [draftLang, setDraftLang] = useState<'id' | 'en'>(lang)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{
    subject: string
    body: string
    to: string | null
    toName: string | null
    ditolak: boolean
  } | null>(null)
  const [copied, setCopied] = useState(false)
  // K137 — SATU EmailLog per draft yang dihasilkan (bukan satu per klik):
  // menekan Salin dua kali atas draft yang SAMA tak boleh menggandakan
  // baris riwayat. Direset setiap generate() sukses membuat draft baru.
  const [logged, setLogged] = useState(false)

  useEffect(() => {
    if (!open) return
    setTemplat(tersedia[0] ?? null)
    setItemId(vendorItems[0]?.id ?? '')
    setDraftLang(lang)
    setResult(null)
    setLogged(false)
    setError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const TPL_LABEL: Record<Templat, string> = {
    EPDA_INTRO: t.tplEpda, FDA_SETTLEMENT: t.tplFda, INVOICE_REMINDER: t.tplInvoice, VENDOR_RFQ: t.tplVendor,
  }

  async function generate() {
    if (!templat) return
    if (templat === 'VENDOR_RFQ' && !itemId) return
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch('/api/ai/email-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templat,
          entityId: context.kind === 'DISBURSEMENT' ? context.disbursementId : context.invoiceId,
          itemId: templat === 'VENDOR_RFQ' ? itemId : undefined,
          bahasa: draftLang,
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setError(body?.error?.message ?? t.errGenerate)
        return
      }
      setResult({ subject: body.subject, body: body.body, to: body.to, toName: body.toName, ditolak: !!body.ditolak })
      setLogged(false)
    } catch {
      setError(t.errConn)
    } finally {
      setBusy(false)
    }
  }

  /** K137 — dipanggil dari copyAll()/mailto onClick, bukan dari generate(): baru berarti sesudah operator benar-benar berniat memakainya. */
  function catatEmailLog() {
    if (logged || !result) return
    setLogged(true) // optimis — draft ini tak boleh dicatat dua kali walau permintaan di bawah gagal
    fetch('/api/email-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entityType: context.kind,
        entityId: context.kind === 'DISBURSEMENT' ? context.disbursementId : context.invoiceId,
        template: templat,
        toAddress: result.to,
        subject: result.subject,
        bodySnapshot: result.body,
      }),
    })
      .then((r) => r.ok && onLogged?.())
      .catch(() => {})
  }

  function copyAll() {
    if (!result) return
    const teks = `${t.to}: ${result.to ?? '—'}\n${t.subject}: ${result.subject}\n\n${result.body}`
    navigator.clipboard?.writeText(teks).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
    catatEmailLog()
  }

  const mailtoHref = result?.to
    ? `mailto:${encodeURIComponent(result.to)}?subject=${encodeURIComponent(result.subject)}&body=${encodeURIComponent(result.body)}`
    : null

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="bg-surface-secondary border-card-border text-text-primary max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-white">{t.title}</DialogTitle>
          <DialogDescription className="text-text-secondary">{t.desc}</DialogDescription>
        </DialogHeader>

        {tersedia.length === 0 ? (
          <p className="text-text-secondary text-sm">{t.noTemplate}</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1">{t.template}</label>
                <select
                  value={templat ?? ''}
                  onChange={(e) => setTemplat(e.target.value as Templat)}
                  className="w-full bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/40"
                >
                  {tersedia.map((tpl) => (
                    <option key={tpl} value={tpl}>{TPL_LABEL[tpl]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1">{t.lang}</label>
                <select
                  value={draftLang}
                  onChange={(e) => setDraftLang(e.target.value as 'id' | 'en')}
                  className="w-full bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/40"
                >
                  <option value="id">Bahasa Indonesia</option>
                  <option value="en">English</option>
                </select>
              </div>
            </div>

            {templat === 'VENDOR_RFQ' && (
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1">{t.item}</label>
                <select
                  value={itemId}
                  onChange={(e) => setItemId(e.target.value)}
                  className="w-full bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/40"
                >
                  {vendorItems.map((it) => (
                    <option key={it.id} value={it.id}>{it.description} — {it.vendorName}</option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={generate}
              disabled={busy || !templat || (templat === 'VENDOR_RFQ' && !itemId)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded text-xs font-medium bg-accent-blue hover:bg-primary text-[#231a06] transition-colors disabled:opacity-50"
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {result ? t.regenerate : t.generate}
            </button>

            {error && (
              <p className="text-status-danger text-xs bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2">{error}</p>
            )}

            {result && (
              <div className="space-y-3 pt-2 border-t border-card-border">
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1">{t.to}</label>
                  <p className="text-sm text-text-primary">{result.to ?? '—'}</p>
                  {!result.to && <p className="text-accent-amber text-xs mt-0.5">{t.toEmpty}</p>}
                </div>

                {result.ditolak && (
                  <p className="text-status-danger text-xs bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2">
                    {t.warnUnverified}
                  </p>
                )}

                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1">{t.subject}</label>
                  <input
                    value={result.subject}
                    onChange={(e) => setResult((r) => (r ? { ...r, subject: e.target.value } : r))}
                    className="w-full bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/40"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1">{t.body}</label>
                  <textarea
                    value={result.body}
                    onChange={(e) => setResult((r) => (r ? { ...r, body: e.target.value } : r))}
                    rows={10}
                    className="w-full bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/40 resize-y"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={copyAll}
                    className="inline-flex items-center gap-1.5 rounded border border-border-muted px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:text-white hover:border-accent-blue/60 hover:bg-surface-tertiary transition-colors"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? t.copied : t.copy}
                  </button>
                  {mailtoHref && (
                    <a
                      href={mailtoHref}
                      onClick={catatEmailLog}
                      className="inline-flex items-center gap-1.5 rounded border border-border-muted px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:text-white hover:border-accent-blue/60 hover:bg-surface-tertiary transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> {t.openMail}
                    </a>
                  )}
                </div>
                {/* K78 — SENGAJA tidak ada tombol "Kirim" di layar ini. */}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
