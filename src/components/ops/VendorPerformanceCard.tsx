'use client'

// Kartu Kinerja Vendor (K113-K116, Fase 7j) — skor DIHITUNG SAAT DIMINTA, tak
// pernah disimpan. Panel SELALU tampil (bukti K70/K113): vendor tanpa data
// tetap dapat kalimat penjelas, bukan disembunyikan.

import { useEffect, useState } from 'react'
import { Loader2, Star } from 'lucide-react'
import { useLang, useT, type Lang } from '@/lib/i18n'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    title: 'Kinerja', combined: 'Skor Gabungan', ketepatanWaktu: 'Ketepatan Waktu', ketepatanHarga: 'Ketepatan Harga',
    penyelesaianTugas: 'Penyelesaian Tugas', penilaianManual: 'Penilaian Manual', samples: 'sampel',
    rate: 'Nilai Vendor', score: 'Skor (1-5)', note: 'Catatan', send: 'Kirim Penilaian',
    ratingsTitle: 'Riwayat Penilaian', noRatings: 'Belum ada penilaian.',
    errLoad: 'Gagal memuat skor.', errConn: 'Gagal terhubung ke server.', errSave: 'Gagal menyimpan penilaian.',
    tier_BELUM_ADA_DATA: 'Belum Ada Data', tier_DATA_TIPIS: 'Data Tipis', tier_CUKUP_DATA: 'Cukup Data',
  },
  en: {
    title: 'Performance', combined: 'Combined Score', ketepatanWaktu: 'On-Time Rate', ketepatanHarga: 'Price Accuracy',
    penyelesaianTugas: 'Task Completion', penilaianManual: 'Manual Rating', samples: 'samples',
    rate: 'Rate Vendor', score: 'Score (1-5)', note: 'Note', send: 'Submit Rating',
    ratingsTitle: 'Rating History', noRatings: 'No ratings yet.',
    errLoad: 'Failed to load score.', errConn: 'Failed to connect to server.', errSave: 'Failed to save rating.',
    tier_BELUM_ADA_DATA: 'No Data Yet', tier_DATA_TIPIS: 'Thin Data', tier_CUKUP_DATA: 'Enough Data',
  },
}

type MetrikSkor = { nilai: number | null; n: number }
type SkorVendor = {
  metrik: { ketepatanWaktu: MetrikSkor; ketepatanHarga: MetrikSkor; penyelesaianTugas: MetrikSkor; penilaianManual: MetrikSkor }
  skorGabungan: number | null
  tier: 'CUKUP_DATA' | 'DATA_TIPIS' | 'BELUM_ADA_DATA'
  catatan: { id: string; en: string }
}
type RatingRow = { id: string; score: number; note: string | null; ratedByName: string | null; createdAt: string }

const TIER_WARNA: Record<string, string> = {
  CUKUP_DATA: 'bg-status-success/12 text-status-success border-status-success/30',
  DATA_TIPIS: 'bg-accent-amber/12 text-accent-amber border-accent-amber/30',
  BELUM_ADA_DATA: 'bg-surface-tertiary text-text-secondary border-border-muted',
}

function MetrikRow({ label, m }: { label: string; m: MetrikSkor }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-text-secondary">{label}</span>
      <span className="font-mono text-text-primary">
        {m.nilai === null ? '—' : m.nilai} <span className="text-text-secondary text-[10px]">(n={m.n})</span>
      </span>
    </div>
  )
}

export function VendorPerformanceCard({ vendorId }: { vendorId: string }) {
  const t = useT(STR)
  const { lang } = useLang()
  const [skor, setSkor] = useState<SkorVendor | null>(null)
  const [ratings, setRatings] = useState<RatingRow[] | null>(null)
  const [error, setError] = useState('')
  const [score, setScore] = useState('5')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    setError('')
    try {
      const [sRes, rRes] = await Promise.all([
        fetch(`/api/vendors/${vendorId}/performance`),
        fetch(`/api/vendors/${vendorId}/ratings`),
      ])
      if (!sRes.ok || !rRes.ok) {
        setError(t.errLoad)
        return
      }
      setSkor(await sRes.json())
      setRatings(await rRes.json())
    } catch {
      setError(t.errConn)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId])

  async function submitRating() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/vendors/${vendorId}/ratings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score, note: note || null }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error?.message ?? t.errSave)
        return
      }
      setNote('')
      await load()
    } catch {
      setError(t.errConn)
    } finally {
      setBusy(false)
    }
  }

  if (!skor) {
    return (
      <div className="space-y-3">
        <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">{t.title}</p>
        {error ? <p className="text-status-danger text-xs">{error}</p> : null}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">{t.title}</p>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono uppercase tracking-wider ${TIER_WARNA[skor.tier]}`}>
          {(t as Record<string, string>)['tier_' + skor.tier]}
        </span>
      </div>

      <p className="text-text-secondary text-xs">{lang === 'id' ? skor.catatan.id : skor.catatan.en}</p>

      <div className="rounded-md border border-card-border/60 bg-surface/30 px-3.5 py-3 space-y-2">
        <div className="flex items-center justify-between text-sm font-display text-text-primary pb-1.5 border-b border-card-border/60">
          <span>{t.combined}</span>
          <span className="font-mono">{skor.skorGabungan === null ? '—' : skor.skorGabungan}</span>
        </div>
        <MetrikRow label={t.ketepatanWaktu} m={skor.metrik.ketepatanWaktu} />
        <MetrikRow label={t.ketepatanHarga} m={skor.metrik.ketepatanHarga} />
        <MetrikRow label={t.penyelesaianTugas} m={skor.metrik.penyelesaianTugas} />
        <MetrikRow label={t.penilaianManual} m={skor.metrik.penilaianManual} />
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">{t.rate}</p>
        <div className="flex items-center gap-2">
          <select
            value={score}
            onChange={(e) => setScore(e.target.value)}
            className="bg-surface border border-border-muted rounded px-2 py-1.5 text-xs text-text-primary focus:border-accent-blue focus:outline-none"
          >
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>{n} ★</option>
            ))}
          </select>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t.note}
            className="flex-1 bg-surface border border-border-muted rounded px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent-blue focus:outline-none"
          />
          <button
            type="button"
            onClick={submitRating}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-accent-blue hover:bg-primary text-[#231a06] transition-colors disabled:opacity-50 shrink-0"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {t.send}
          </button>
        </div>
        {error && <p className="text-status-danger text-xs">{error}</p>}
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">{t.ratingsTitle}</p>
        {ratings && ratings.length === 0 ? (
          <p className="text-text-secondary text-sm">{t.noRatings}</p>
        ) : (
          <ul className="space-y-1.5">
            {ratings?.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-2 text-sm border-b border-card-border/40 pb-1.5 last:border-0">
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-0.5 text-accent-amber">
                    <Star className="w-3 h-3 fill-current" /> {r.score}
                  </span>
                  {r.note && <span className="text-text-secondary text-xs">— {r.note}</span>}
                </div>
                <span className="text-text-secondary text-[10px] font-mono shrink-0">{r.ratedByName}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
