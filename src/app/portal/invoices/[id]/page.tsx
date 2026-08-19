'use client'

// Detail tagihan (K167) + konfirmasi pembayaran (K169). Konfirmasi TIDAK
// PERNAH mengubah Invoice.status/amountPaid — server yang menegakkannya
// (payment-confirmation.service.ts); layar ini hanya mengirim & menampilkan
// pesan bahwa konfirmasinya sudah diteruskan ke FINANCE.

import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'next/navigation'
import { Download, Loader2, Send, CheckCircle2 } from 'lucide-react'
import { useT, type Lang } from '@/lib/i18n'

type InvoiceDetail = {
  id: string; nomor: string; tanggal: string; jatuhTempo: string | null
  mataUang: string; total: number; sudahDibayar: number; sisa: number
  status: string; kapal: string | null; voyage: string | null
  baris: { uraian: string; jumlah: number }[]
  pembayaran: { tanggal: string; jumlah: number; mataUang: string; rujukan: string | null }[]
}

const T: Record<Lang, Record<string, string>> = {
  id: {
    back: 'Tagihan Saya', download: 'Unduh PDF', total: 'Total', paid: 'Sudah dibayar', due: 'Sisa',
    items: 'Rincian', payments: 'Riwayat pembayaran tercatat', noPayments: 'Belum ada pembayaran tercatat.',
    confirmTitle: 'Konfirmasi pembayaran', confirmDesc: 'Sudah transfer? Beri tahu kami — tim keuangan akan memverifikasi dan mencatatnya.',
    ref: 'Nomor rujukan transfer', note: 'Catatan (opsional)', proof: 'Bukti transfer (opsional)',
    submit: 'Kirim konfirmasi', submitting: 'Mengirim…',
    sent: 'Terkirim. Tim keuangan kami akan memverifikasi dan mencatat pembayaran Anda — status tagihan belum berubah sampai itu selesai.',
    errRef: 'Nomor rujukan wajib diisi.', errGeneric: 'Gagal mengirim konfirmasi. Coba lagi.',
  },
  en: {
    back: 'My Invoices', download: 'Download PDF', total: 'Total', paid: 'Paid', due: 'Balance',
    items: 'Line items', payments: 'Recorded payment history', noPayments: 'No payments recorded yet.',
    confirmTitle: 'Confirm payment', confirmDesc: "Already transferred? Let us know — our finance team will verify and record it.",
    ref: 'Transfer reference number', note: 'Note (optional)', proof: 'Proof of transfer (optional)',
    submit: 'Send confirmation', submitting: 'Sending…',
    sent: "Sent. Our finance team will verify and record your payment — the invoice status hasn't changed until that's done.",
    errRef: 'Reference number is required.', errGeneric: 'Failed to send confirmation. Please try again.',
  },
}

const fmtTanggal = (iso: string) => new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso))

export default function PortalInvoiceDetailPage() {
  const t = useT(T)
  const params = useParams<{ id: string }>()
  const [inv, setInv] = useState<InvoiceDetail | null>(null)
  const [notFound404, setNotFound404] = useState(false)

  const [kirim, setKirim] = useState(false)
  const [terkirim, setTerkirim] = useState(false)
  const [errKonfirmasi, setErrKonfirmasi] = useState<string | null>(null)

  useEffect(() => {
    let hidup = true
    fetch(`/api/portal/invoices/${params.id}`).then((r) => {
      if (r.status === 404) {
        if (hidup) setNotFound404(true)
        return null
      }
      return r.json()
    }).then((d) => hidup && d && setInv(d))
    return () => {
      hidup = false
    }
  }, [params.id])

  async function kirimKonfirmasi(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const ref = String(form.get('referenceNumber') || '').trim()
    if (!ref) {
      setErrKonfirmasi(t.errRef)
      return
    }
    setKirim(true)
    setErrKonfirmasi(null)
    try {
      const res = await fetch(`/api/portal/invoices/${params.id}/confirm-payment`, { method: 'POST', body: form })
      if (!res.ok) {
        setErrKonfirmasi(t.errGeneric)
        return
      }
      setTerkirim(true)
    } catch {
      setErrKonfirmasi(t.errGeneric)
    } finally {
      setKirim(false)
    }
  }

  if (notFound404) {
    return <p className="text-text-secondary text-sm">Not found.</p>
  }
  if (!inv) {
    return <Loader2 className="h-5 w-5 animate-spin text-text-secondary" />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest">{inv.status}</p>
          <h1 className="font-display text-2xl text-white">{inv.nomor}</h1>
          <p className="text-text-secondary text-sm mt-0.5">
            {fmtTanggal(inv.tanggal)}{inv.kapal ? ` · ${inv.kapal}` : ''}{inv.voyage ? ` · ${inv.voyage}` : ''}
          </p>
        </div>
        <a
          href={`/api/portal/invoices/${inv.id}/pdf?download=1`}
          className="inline-flex items-center gap-1.5 rounded-md border border-card-border px-3 py-2 text-xs
                     text-text-secondary hover:text-white hover:border-accent-blue/50 transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          {t.download}
        </a>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card-bg border border-card-border rounded-lg p-4">
          <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest">{t.total}</p>
          <p className="text-white font-mono text-lg mt-1">{inv.mataUang} {inv.total.toLocaleString('en-US')}</p>
        </div>
        <div className="bg-card-bg border border-card-border rounded-lg p-4">
          <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest">{t.paid}</p>
          <p className="text-status-success font-mono text-lg mt-1">{inv.mataUang} {inv.sudahDibayar.toLocaleString('en-US')}</p>
        </div>
        <div className="bg-card-bg border border-card-border rounded-lg p-4">
          <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest">{t.due}</p>
          <p className={`font-mono text-lg mt-1 ${inv.sisa > 0 ? 'text-status-warning' : 'text-white'}`}>{inv.mataUang} {inv.sisa.toLocaleString('en-US')}</p>
        </div>
      </div>

      <div className="bg-card-bg border border-card-border rounded-lg overflow-hidden">
        <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest px-4 py-3 border-b border-card-border">{t.items}</p>
        {inv.baris.map((b, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-2.5 border-b border-card-border last:border-b-0">
            <span className="text-white text-sm">{b.uraian}</span>
            <span className="text-text-secondary text-sm font-mono">{inv.mataUang} {b.jumlah.toLocaleString('en-US')}</span>
          </div>
        ))}
      </div>

      <div className="bg-card-bg border border-card-border rounded-lg overflow-hidden">
        <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest px-4 py-3 border-b border-card-border">{t.payments}</p>
        {inv.pembayaran.length === 0 ? (
          <p className="text-text-secondary text-sm px-4 py-3">{t.noPayments}</p>
        ) : (
          inv.pembayaran.map((p, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-2.5 border-b border-card-border last:border-b-0">
              <span className="text-white text-sm">{fmtTanggal(p.tanggal)}{p.rujukan ? ` · ${p.rujukan}` : ''}</span>
              <span className="text-status-success text-sm font-mono">{p.mataUang} {p.jumlah.toLocaleString('en-US')}</span>
            </div>
          ))
        )}
      </div>

      {inv.sisa > 0 && (
        <div className="bg-card-bg border border-card-border rounded-lg p-5 space-y-4">
          <div>
            <h3 className="font-display text-lg text-white">{t.confirmTitle}</h3>
            <p className="text-text-secondary text-sm">{t.confirmDesc}</p>
          </div>

          {terkirim ? (
            <p className="flex items-start gap-2 text-sm rounded-md px-3 py-2 bg-status-success/10 text-status-success">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              {t.sent}
            </p>
          ) : (
            <form onSubmit={kirimKonfirmasi} className="space-y-3">
              {errKonfirmasi && <p className="text-sm rounded-md px-3 py-2 bg-status-danger/10 text-status-danger">{errKonfirmasi}</p>}
              <div className="space-y-1.5">
                <label className="text-[11px] font-mono uppercase tracking-wider text-text-secondary">{t.ref}</label>
                <input
                  name="referenceNumber" type="text" required
                  className="w-full h-10 px-3 rounded-md border border-card-border bg-surface-tertiary/40 text-white text-sm focus:outline-none focus:border-accent-blue"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-mono uppercase tracking-wider text-text-secondary">{t.note}</label>
                <textarea
                  name="note" rows={2}
                  className="w-full px-3 py-2 rounded-md border border-card-border bg-surface-tertiary/40 text-white text-sm focus:outline-none focus:border-accent-blue"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-mono uppercase tracking-wider text-text-secondary">{t.proof}</label>
                <input
                  name="file" type="file" accept="image/*,.pdf"
                  className="w-full text-sm text-text-secondary file:mr-3 file:rounded-md file:border file:border-card-border file:bg-surface-tertiary/40 file:px-3 file:py-1.5 file:text-white file:text-xs"
                />
              </div>
              <button
                type="submit"
                disabled={kirim}
                className="inline-flex items-center gap-2 rounded-lg bg-accent-blue px-5 py-2.5 text-sm font-medium text-white
                           transition-colors hover:bg-accent-blue/90 disabled:opacity-40"
              >
                {kirim ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {kirim ? t.submitting : t.submit}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
