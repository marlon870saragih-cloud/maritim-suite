'use client'

// Daftar perintah kerja (WO) vendor (K171) — hanya milik pihak ini. TANPA
// VendorRating/skor (K171: penilaian tak pernah terlihat vendor yang dinilai).

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { useT, type Lang } from '@/lib/i18n'

type WoRow = {
  id: string; nomor: string; lingkup: string; status: string; mataUang: string
  nilaiKesepakatan: number | null; jadwalMulai: string | null; jadwalSelesai: string | null
  kapal: string | null; pelabuhan: string | null; voyage: string | null
}

const T: Record<Lang, Record<string, string>> = {
  id: { title: 'Perintah Kerja', desc: 'Work Order yang ditujukan kepada Anda.', empty: 'Belum ada perintah kerja.' },
  en: { title: 'Work Orders', desc: 'Work orders addressed to you.', empty: 'No work orders yet.' },
}

const STATUS_WARNA: Record<string, string> = {
  ISSUED: 'bg-accent-blue/15 text-accent-blue',
  IN_PROGRESS: 'bg-status-warning/15 text-status-warning',
  COMPLETED: 'bg-status-success/15 text-status-success',
  VERIFIED: 'bg-surface-tertiary text-text-secondary',
  CANCELLED: 'bg-status-danger/15 text-status-danger',
}

function fmtTanggal(iso: string) {
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso))
}

export default function PortalWorkOrdersPage() {
  const t = useT(T)
  const [rows, setRows] = useState<WoRow[] | null>(null)

  useEffect(() => {
    let hidup = true
    fetch('/api/portal/work-orders').then((r) => (r.ok ? r.json() : [])).then((d) => hidup && setRows(d))
    return () => {
      hidup = false
    }
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-white">{t.title}</h1>
        <p className="text-text-secondary text-sm">{t.desc}</p>
      </div>

      {rows && rows.length === 0 && (
        <div className="bg-card-bg border border-card-border rounded-lg p-8 text-center text-text-secondary text-sm">{t.empty}</div>
      )}

      <div className="divide-y divide-card-border bg-card-bg border border-card-border rounded-lg">
        {(rows ?? []).map((wo) => (
          <Link
            key={wo.id}
            href={`/portal/work-orders/${wo.id}`}
            className="flex items-center justify-between gap-4 p-4 hover:bg-surface-tertiary/30 transition-colors"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-white text-sm font-mono">{wo.nomor}</p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wide font-mono ${STATUS_WARNA[wo.status] ?? 'bg-surface-tertiary text-text-secondary'}`}>
                  {wo.status}
                </span>
              </div>
              <p className="text-text-secondary text-xs mt-0.5 truncate">
                {wo.lingkup}{wo.kapal ? ` · ${wo.kapal}` : ''}{wo.jadwalMulai ? ` · ${fmtTanggal(wo.jadwalMulai)}` : ''}
              </p>
            </div>
            <div className="text-right shrink-0">
              {wo.nilaiKesepakatan !== null && <p className="text-white text-sm font-mono">{wo.mataUang} {wo.nilaiKesepakatan.toLocaleString('en-US')}</p>}
            </div>
            <ChevronRight className="h-4 w-4 text-text-secondary shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  )
}
