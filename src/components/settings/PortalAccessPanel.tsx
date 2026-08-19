'use client'

// Kelola akses portal satu pihak (K166/K168, Fase 8f) — undang, lihat siapa
// sudah/belum aktif, cabut. Dipakai dari halaman Customer (8f) dan siap
// dipakai ulang apa adanya untuk Vendor (8g) lewat prop `pihak`.
//
// Sampai P10 (mailer) dijawab, undangan TIDAK dikirim surel — tautannya
// ditampilkan untuk disalin & dikirim tenant sendiri (WhatsApp/surel pribadi),
// persis K168. Token mentah HANYA muncul sekali, tepat sesudah dibuat.

import { useEffect, useState } from 'react'
import { Copy, Check, Loader2, Mail, Send, UserX, X } from 'lucide-react'

type Pihak = 'CUSTOMER' | 'VENDOR'

type Invitation = { id: string; email: string; expiresAt: string; acceptedAt: string | null; createdAt: string }
type Access = { id: string; portalUserId: string; createdAt: string; revokedAt: string | null }

const T = {
  invite: 'Undang ke portal', email: 'Email', send: 'Kirim undangan', sending: 'Mengirim…',
  linkReady: 'Undangan dibuat. Salin tautan ini dan kirim ke pelanggan (belum ada pengirim surel otomatis):',
  copy: 'Salin', copied: 'Tersalin',
  pending: 'Undangan menunggu', accepted: 'Aktif sejak', revoked: 'Dicabut', cancel: 'Batalkan', revokeBtn: 'Cabut akses',
  noInvites: 'Belum ada undangan.', noAccess: 'Belum ada akses aktif.',
  errEmail: 'Email wajib diisi.', errGeneric: 'Gagal memproses. Coba lagi.',
  close: 'Tutup',
}

function fmt(iso: string) {
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso))
}

export function PortalAccessPanel({
  pihak,
  id, // customerId atau vendorId
  onClose,
}: {
  pihak: Pihak
  id: string
  onClose: () => void
}) {
  const qKey = pihak === 'CUSTOMER' ? 'customerId' : 'vendorId'

  const [invitations, setInvitations] = useState<Invitation[] | null>(null)
  const [accesses, setAccesses] = useState<Access[] | null>(null)
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [tautanBaru, setTautanBaru] = useState<string | null>(null)
  const [disalin, setDisalin] = useState(false)
  const [sibuk, setSibuk] = useState<string | null>(null)

  async function muat() {
    const [invRes, accRes] = await Promise.all([
      fetch(`/api/portal-invitations?${qKey}=${id}`),
      fetch(`/api/portal-access?${qKey}=${id}`),
    ])
    setInvitations(invRes.ok ? await invRes.json() : [])
    setAccesses(accRes.ok ? await accRes.json() : [])
  }

  useEffect(() => {
    muat()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function kirimUndangan() {
    if (!email.trim()) {
      setErr(T.errEmail)
      return
    }
    setSending(true)
    setErr(null)
    try {
      const res = await fetch('/api/portal-invitations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pihak, email: email.trim(), [qKey]: id }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setErr(body?.error?.message ?? T.errGeneric)
        return
      }
      const { token } = await res.json()
      setTautanBaru(`${window.location.origin}/portal/accept/${token}`)
      setEmail('')
      await muat()
    } catch {
      setErr(T.errGeneric)
    } finally {
      setSending(false)
    }
  }

  async function salinTautan() {
    if (!tautanBaru) return
    await navigator.clipboard?.writeText(tautanBaru).catch(() => {})
    setDisalin(true)
    setTimeout(() => setDisalin(false), 1800)
  }

  async function batalkanUndangan(invId: string) {
    setSibuk(invId)
    try {
      await fetch(`/api/portal-invitations/${invId}`, { method: 'DELETE' })
      await muat()
    } finally {
      setSibuk(null)
    }
  }

  async function cabutAkses(accId: string) {
    if (!confirm('Cabut akses portal ini? Sesi yang sedang berjalan akan berhenti pada permintaan berikutnya.')) return
    setSibuk(accId)
    try {
      await fetch(`/api/portal-access/${accId}`, { method: 'DELETE' })
      await muat()
    } finally {
      setSibuk(null)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2 border-b border-card-border pb-3">
        <h3 className="font-display text-white text-base flex items-center gap-2">
          <Mail className="h-4 w-4 text-accent-blue" />
          {T.invite}
        </h3>
        <button type="button" onClick={onClose} className="text-text-secondary hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2">
        {err && <p className="text-xs rounded-md px-3 py-2 bg-status-danger/10 text-status-danger">{err}</p>}
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nama@pelanggan.co.id"
            className="flex-1 h-9 px-3 rounded-md border border-card-border bg-surface-tertiary/40 text-white text-sm focus:outline-none focus:border-accent-blue"
          />
          <button
            type="button"
            onClick={kirimUndangan}
            disabled={sending}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent-blue px-3 py-2 text-xs font-medium text-white hover:bg-accent-blue/90 disabled:opacity-40"
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {sending ? T.sending : T.send}
          </button>
        </div>

        {tautanBaru && (
          <div className="rounded-md border border-accent-teal/40 bg-accent-teal/5 p-3 space-y-2">
            <p className="text-xs text-text-secondary">{T.linkReady}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate text-[11px] text-white bg-surface-tertiary/60 rounded px-2 py-1.5">{tautanBaru}</code>
              <button
                type="button"
                onClick={salinTautan}
                className="inline-flex items-center gap-1 rounded-md border border-card-border px-2 py-1.5 text-[11px] text-text-secondary hover:text-white"
              >
                {disalin ? <Check className="h-3 w-3 text-accent-teal" /> : <Copy className="h-3 w-3" />}
                {disalin ? T.copied : T.copy}
              </button>
            </div>
          </div>
        )}
      </div>

      <div>
        <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-2">{T.pending}</p>
        {invitations && invitations.filter((i) => !i.acceptedAt).length === 0 && (
          <p className="text-text-secondary text-xs">{T.noInvites}</p>
        )}
        <div className="space-y-1.5">
          {(invitations ?? []).filter((i) => !i.acceptedAt).map((inv) => (
            <div key={inv.id} className="flex items-center justify-between gap-2 rounded-md border border-card-border px-3 py-2">
              <div className="min-w-0">
                <p className="text-white text-xs truncate">{inv.email}</p>
                <p className="text-text-secondary text-[10px]">s.d. {fmt(inv.expiresAt)}</p>
              </div>
              <button
                type="button"
                onClick={() => batalkanUndangan(inv.id)}
                disabled={sibuk === inv.id}
                className="text-[11px] text-text-secondary hover:text-status-danger shrink-0"
              >
                {sibuk === inv.id ? <Loader2 className="h-3 w-3 animate-spin" /> : T.cancel}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-2">Akses aktif</p>
        {accesses && accesses.filter((a) => !a.revokedAt).length === 0 && (
          <p className="text-text-secondary text-xs">{T.noAccess}</p>
        )}
        <div className="space-y-1.5">
          {(accesses ?? []).filter((a) => !a.revokedAt).map((acc) => (
            <div key={acc.id} className="flex items-center justify-between gap-2 rounded-md border border-accent-teal/30 bg-accent-teal/5 px-3 py-2">
              <p className="text-white text-xs">{T.accepted} {fmt(acc.createdAt)}</p>
              <button
                type="button"
                onClick={() => cabutAkses(acc.id)}
                disabled={sibuk === acc.id}
                className="inline-flex items-center gap-1 text-[11px] text-text-secondary hover:text-status-danger shrink-0"
              >
                {sibuk === acc.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserX className="h-3 w-3" />}
                {T.revokeBtn}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
