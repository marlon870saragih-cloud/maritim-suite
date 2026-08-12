'use client'

// Notification Center (Fase 5d) — bell di TopBar. Poll ringan tiap 60 detik
// (tak ada infrastruktur push/websocket di repo ini) supaya badge tak basi
// terlalu lama tanpa membebani server.

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, CheckCheck, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT, type Lang } from '@/lib/i18n'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    notif: 'Notifikasi', empty: 'Belum ada notifikasi.', markAll: 'Tandai semua terbaca', loading: 'Memuat…',
  },
  en: {
    notif: 'Notifications', empty: 'No notifications yet.', markAll: 'Mark all read', loading: 'Loading…',
  },
}

type Row = {
  id: string
  type: string
  title: string
  message: string | null
  href: string | null
  readAt: string | null
  createdAt: string
}

const POLL_MS = 60_000

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'now'
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  return `${Math.floor(hr / 24)}d`
}

export function NotificationBell() {
  const t = useT(STR)
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [unread, setUnread] = useState(0)
  const [busy, setBusy] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  async function load() {
    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) return
      const body = await res.json()
      setRows(body.rows)
      setUnread(body.unread)
    } catch {
      /* diam — badge cuma sekadar info, jangan ganggu UI kalau gagal */
    }
  }

  useEffect(() => {
    load()
    const id = setInterval(load, POLL_MS)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  async function openItem(r: Row) {
    if (!r.readAt) {
      fetch(`/api/notifications/${r.id}/read`, { method: 'POST' }).then(load)
    }
    setOpen(false)
    if (r.href) router.push(r.href)
  }

  async function markAll() {
    setBusy(true)
    try {
      await fetch('/api/notifications/read-all', { method: 'POST' })
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        aria-label={t.notif}
        onClick={() => setOpen((o) => !o)}
        className="hidden sm:block relative hover:text-accent-blue transition-colors p-1"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-status-danger text-white text-[9px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-[70vh] overflow-y-auto bg-surface-secondary border border-card-border rounded-lg shadow-2xl z-50">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-card-border">
            <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">{t.notif}</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAll}
                disabled={busy}
                className="inline-flex items-center gap-1 text-[11px] text-accent-blue hover:underline disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCheck className="w-3 h-3" />}
                {t.markAll}
              </button>
            )}
          </div>

          {rows === null ? (
            <p className="text-text-secondary text-xs px-4 py-6 text-center">{t.loading}</p>
          ) : rows.length === 0 ? (
            <p className="text-text-secondary text-xs px-4 py-6 text-center">{t.empty}</p>
          ) : (
            <ul>
              {rows.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => openItem(r)}
                    className={cn(
                      'w-full text-left px-4 py-3 border-b border-card-border/40 last:border-0 hover:bg-surface-tertiary/50 transition-colors',
                      !r.readAt && 'bg-accent-blue/[0.04]',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {!r.readAt && <span className="w-1.5 h-1.5 rounded-full bg-accent-blue mt-1.5 shrink-0" />}
                      <div className={cn('min-w-0 flex-1', r.readAt && 'pl-3.5')}>
                        <p className="text-text-primary text-xs font-medium truncate">{r.title}</p>
                        {r.message && <p className="text-text-secondary text-[11px] mt-0.5 line-clamp-2">{r.message}</p>}
                        <p className="text-text-secondary/60 text-[10px] font-mono mt-0.5">{relTime(r.createdAt)}</p>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
