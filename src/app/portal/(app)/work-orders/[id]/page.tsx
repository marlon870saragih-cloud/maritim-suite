'use client'

// Detail Perintah Kerja (WO) vendor + konfirmasi selesai (K173). Konfirmasi
// TIDAK PERNAH mengubah WorkOrder.status/actualEnd — server yang
// menegakkannya (wo-confirmation.service.ts); layar ini hanya mengirim &
// menampilkan pesan bahwa konfirmasinya sudah diteruskan ke tim operasi.

import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, Send, CheckCircle2 } from 'lucide-react'
import { useT, type Lang } from '@/lib/i18n'

type WoDetail = {
  id: string; nomor: string; lingkup: string; status: string; mataUang: string
  nilaiKesepakatan: number | null; jadwalMulai: string | null; jadwalSelesai: string | null
  kapal: string | null; pelabuhan: string | null; voyage: string | null
}

const T: Record<Lang, Record<string, string>> = {
  id: {
    back: 'Perintah Kerja Saya', agreed: 'Nilai Kesepakatan', planned: 'Jadwal Rencana', scope: 'Lingkup Pekerjaan',
    confirmTitle: 'Konfirmasi selesai', confirmDesc: 'Sudah selesai dikerjakan? Beri tahu kami — tim operasi akan memverifikasi dan mencatatnya.',
    note: 'Catatan (opsional)', submit: 'Kirim konfirmasi', submitting: 'Mengirim…',
    sent: 'Terkirim. Tim operasi kami akan memverifikasi dan mencatat penyelesaiannya — status belum berubah sampai itu selesai.',
    errGeneric: 'Gagal mengirim konfirmasi. Coba lagi.',
    alreadyConfirmable: 'Konfirmasi hanya bisa dikirim untuk perintah kerja yang sedang berjalan.',
  },
  en: {
    back: 'My Work Orders', agreed: 'Agreed Amount', planned: 'Planned Schedule', scope: 'Scope of Work',
    confirmTitle: 'Confirm completion', confirmDesc: "Already done? Let us know — our operations team will verify and record it.",
    note: 'Note (optional)', submit: 'Send confirmation', submitting: 'Sending…',
    sent: "Sent. Our operations team will verify and record completion — the status hasn't changed until that's done.",
    errGeneric: 'Failed to send confirmation. Please try again.',
    alreadyConfirmable: 'Confirmation can only be sent for a work order that is in progress.',
  },
}

const fmtTanggal = (iso: string) => new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso))

export default function PortalWorkOrderDetailPage() {
  const t = useT(T)
  const params = useParams<{ id: string }>()
  const [wo, setWo] = useState<WoDetail | null>(null)
  const [notFound404, setNotFound404] = useState(false)

  const [kirim, setKirim] = useState(false)
  const [terkirim, setTerkirim] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let hidup = true
    fetch(`/api/portal/work-orders/${params.id}`).then((r) => {
      if (r.status === 404) {
        if (hidup) setNotFound404(true)
        return null
      }
      return r.json()
    }).then((d) => hidup && d && setWo(d))
    return () => {
      hidup = false
    }
  }, [params.id])

  async function kirimKonfirmasi(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setKirim(true)
    setErr(null)
    try {
      const res = await fetch(`/api/portal/work-orders/${params.id}/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ note: form.get('note') }),
      })
      if (!res.ok) {
        setErr(t.errGeneric)
        return
      }
      setTerkirim(true)
    } catch {
      setErr(t.errGeneric)
    } finally {
      setKirim(false)
    }
  }

  if (notFound404) return <p className="text-text-secondary text-sm">Not found.</p>
  if (!wo) return <Loader2 className="h-5 w-5 animate-spin text-text-secondary" />

  const bisaKonfirmasi = wo.status === 'ISSUED' || wo.status === 'IN_PROGRESS'

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest">{wo.status}</p>
        <h1 className="font-display text-2xl text-white">{wo.nomor}</h1>
        <p className="text-text-secondary text-sm mt-0.5">
          {wo.kapal ? `${wo.kapal} · ` : ''}{wo.pelabuhan ?? ''}{wo.voyage ? ` · ${wo.voyage}` : ''}
        </p>
      </div>

      <div className="bg-card-bg border border-card-border rounded-lg p-4 space-y-1">
        <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest">{t.scope}</p>
        <p className="text-white text-sm">{wo.lingkup}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {wo.nilaiKesepakatan !== null && (
          <div className="bg-card-bg border border-card-border rounded-lg p-4">
            <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest">{t.agreed}</p>
            <p className="text-white font-mono text-lg mt-1">{wo.mataUang} {wo.nilaiKesepakatan.toLocaleString('en-US')}</p>
          </div>
        )}
        <div className="bg-card-bg border border-card-border rounded-lg p-4">
          <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest">{t.planned}</p>
          <p className="text-white text-sm mt-1">
            {wo.jadwalMulai ? fmtTanggal(wo.jadwalMulai) : '—'} — {wo.jadwalSelesai ? fmtTanggal(wo.jadwalSelesai) : '—'}
          </p>
        </div>
      </div>

      {bisaKonfirmasi && (
        <div className="bg-card-bg border border-card-border rounded-lg p-5 space-y-4">
          <div>
            <h2 className="font-display text-white text-base">{t.confirmTitle}</h2>
            <p className="text-text-secondary text-xs mt-0.5">{t.confirmDesc}</p>
          </div>

          {terkirim ? (
            <p className="text-sm rounded-md px-3 py-2 bg-status-success/10 text-status-success flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              {t.sent}
            </p>
          ) : (
            <form onSubmit={kirimKonfirmasi} className="space-y-3">
              {err && <p className="text-sm rounded-md px-3 py-2 bg-status-danger/10 text-status-danger">{err}</p>}
              <div className="space-y-1.5">
                <label className="text-[11px] font-mono uppercase tracking-wider text-text-secondary">{t.note}</label>
                <textarea
                  name="note" rows={3}
                  className="w-full px-3 py-2 rounded-md border border-card-border bg-surface-tertiary/40 text-white text-sm
                             focus:outline-none focus:border-accent-blue resize-none"
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
