'use client'

// Tagihan saya (K172) — riwayat unggahan + status, dan form kirim baru.
// Berkas WAJIB (beda dari konfirmasi pembayaran K169 yang opsional). Kirim
// TIDAK PERNAH langsung jadi baris biaya — hanya "usulan" yang operator ambil
// sendiri lewat builder FDA (K122 sejalan).

import { useEffect, useState, type FormEvent } from 'react'
import { Loader2, Send, Plus, X } from 'lucide-react'
import { useT, type Lang } from '@/lib/i18n'

type SubmissionRow = {
  id: string; nomorTagihan: string; tanggalTagihan: string; mataUang: string; jumlah: number
  catatan: string | null; status: string; catatanTinjauan: string | null; ditinjauPada: string | null
  purchaseOrder: string | null; workOrder: string | null; createdAt: string
}
type PoOption = { id: string; nomor: string }
type WoOption = { id: string; nomor: string }

const T: Record<Lang, Record<string, string>> = {
  id: {
    title: 'Tagihan Saya', desc: 'Riwayat tagihan yang Anda kirim, dan statusnya.', empty: 'Belum ada tagihan terkirim.',
    newBtn: 'Kirim Tagihan Baru', formTitle: 'Kirim Tagihan Baru',
    invoiceNo: 'Nomor Tagihan', invoiceDate: 'Tanggal Tagihan', amount: 'Jumlah', currency: 'Mata Uang',
    note: 'Catatan (opsional)', file: 'Berkas Tagihan (wajib)', linkPo: 'Terkait Pesanan (opsional)', linkWo: 'Terkait Perintah Kerja (opsional)',
    none: '— Tidak ada —', submit: 'Kirim', submitting: 'Mengirim…', cancel: 'Batal',
    errGeneric: 'Gagal mengirim tagihan. Coba lagi.', errRateLimit: 'Batas kiriman harian tercapai. Coba lagi besok.',
  },
  en: {
    title: 'My Invoices', desc: 'Your submitted invoices and their status.', empty: 'No invoices submitted yet.',
    newBtn: 'Send New Invoice', formTitle: 'Send New Invoice',
    invoiceNo: 'Invoice Number', invoiceDate: 'Invoice Date', amount: 'Amount', currency: 'Currency',
    note: 'Note (optional)', file: 'Invoice File (required)', linkPo: 'Related Purchase Order (optional)', linkWo: 'Related Work Order (optional)',
    none: '— None —', submit: 'Send', submitting: 'Sending…', cancel: 'Cancel',
    errGeneric: 'Failed to send invoice. Please try again.', errRateLimit: 'Daily sending limit reached. Try again tomorrow.',
  },
}

const STATUS_WARNA: Record<string, string> = {
  SUBMITTED: 'bg-accent-blue/15 text-accent-blue',
  UNDER_REVIEW: 'bg-status-warning/15 text-status-warning',
  ACCEPTED: 'bg-status-success/15 text-status-success',
  REJECTED: 'bg-status-danger/15 text-status-danger',
}

const fmtTanggal = (iso: string) => new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso))

const inputCls =
  'w-full h-10 px-3 rounded-md border border-card-border bg-surface-tertiary/40 text-white text-sm focus:outline-none focus:border-accent-blue'
const labelCls = 'text-[11px] font-mono uppercase tracking-wider text-text-secondary'

export default function PortalSubmissionsPage() {
  const t = useT(T)
  const [rows, setRows] = useState<SubmissionRow[] | null>(null)
  const [pos, setPos] = useState<PoOption[]>([])
  const [wos, setWos] = useState<WoOption[]>([])
  const [formOpen, setFormOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function muat() {
    const r = await fetch('/api/portal/submissions')
    setRows(r.ok ? await r.json() : [])
  }

  useEffect(() => {
    muat()
    fetch('/api/portal/purchase-orders').then((r) => (r.ok ? r.json() : [])).then((d: { id: string; nomor: string }[]) => setPos(d.map((x) => ({ id: x.id, nomor: x.nomor }))))
    fetch('/api/portal/work-orders').then((r) => (r.ok ? r.json() : [])).then((d: { id: string; nomor: string }[]) => setWos(d.map((x) => ({ id: x.id, nomor: x.nomor }))))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function kirim(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/portal/submissions', { method: 'POST', body: new FormData(e.currentTarget) })
      if (!res.ok) {
        setErr(res.status === 429 ? t.errRateLimit : t.errGeneric)
        return
      }
      setFormOpen(false)
      await muat()
    } catch {
      setErr(t.errGeneric)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl text-white">{t.title}</h1>
          <p className="text-text-secondary text-sm">{t.desc}</p>
        </div>
        {!formOpen && (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-accent-blue px-4 py-2 text-sm font-medium text-white hover:bg-accent-blue/90 transition-colors"
          >
            <Plus className="h-4 w-4" /> {t.newBtn}
          </button>
        )}
      </div>

      {formOpen && (
        <form onSubmit={kirim} className="bg-card-bg border border-card-border rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-white text-base">{t.formTitle}</h2>
            <button type="button" onClick={() => setFormOpen(false)} className="text-text-secondary hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>

          {err && <p className="text-sm rounded-md px-3 py-2 bg-status-danger/10 text-status-danger">{err}</p>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className={labelCls}>{t.invoiceNo}</label>
              <input name="invoiceNo" required className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>{t.invoiceDate}</label>
              <input name="invoiceDate" type="date" required className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>{t.amount}</label>
              <input name="amount" type="number" step="0.01" min="0" required className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>{t.currency}</label>
              <input name="currency" defaultValue="IDR" className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>{t.linkPo}</label>
              <select name="purchaseOrderId" className={inputCls}>
                <option value="">{t.none}</option>
                {pos.map((p) => <option key={p.id} value={p.id}>{p.nomor}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>{t.linkWo}</label>
              <select name="workOrderId" className={inputCls}>
                <option value="">{t.none}</option>
                {wos.map((w) => <option key={w.id} value={w.id}>{w.nomor}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <label className={labelCls}>{t.note}</label>
              <textarea name="note" rows={2} className="w-full px-3 py-2 rounded-md border border-card-border bg-surface-tertiary/40 text-white text-sm focus:outline-none focus:border-accent-blue resize-none" />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <label className={labelCls}>{t.file}</label>
              <input name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png,.webp" className={`${inputCls} h-auto py-2`} />
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-accent-blue px-5 py-2.5 text-sm font-medium text-white
                       transition-colors hover:bg-accent-blue/90 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {busy ? t.submitting : t.submit}
          </button>
        </form>
      )}

      {rows && rows.length === 0 && !formOpen && (
        <div className="bg-card-bg border border-card-border rounded-lg p-8 text-center text-text-secondary text-sm">{t.empty}</div>
      )}

      <div className="divide-y divide-card-border bg-card-bg border border-card-border rounded-lg">
        {(rows ?? []).map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-white text-sm font-mono">{s.nomorTagihan}</p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wide font-mono ${STATUS_WARNA[s.status] ?? 'bg-surface-tertiary text-text-secondary'}`}>
                  {s.status}
                </span>
              </div>
              <p className="text-text-secondary text-xs mt-0.5">
                {fmtTanggal(s.tanggalTagihan)}{s.purchaseOrder ? ` · ${s.purchaseOrder}` : ''}{s.workOrder ? ` · ${s.workOrder}` : ''}
              </p>
              {s.catatanTinjauan && <p className="text-text-secondary text-xs mt-1 italic">{s.catatanTinjauan}</p>}
            </div>
            <p className="text-white text-sm font-mono shrink-0">{s.mataUang} {s.jumlah.toLocaleString('en-US')}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
