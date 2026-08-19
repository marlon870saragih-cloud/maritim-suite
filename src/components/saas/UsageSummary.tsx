'use client'

// Settings › Pemakaian (K183/K184, Fase 8j). Baca-saja, terbuka untuk semua
// peran (pola sama QuotaMeter — informasi perusahaan sendiri, bukan
// operasional). Menjawab DUA dari empat pertanyaan K184 di sisi tenant:
// fitur mana dipakai, fitur mana tak pernah disentuh. (Onboarding-stall &
// churn lintas-tenant adalah bacaan Marlon lewat skrip — prisma/usage-report.mjs
// — SENGAJA tak jadi layar di sini, K184.)

import { useEffect, useState } from 'react'
import { Activity, Loader2 } from 'lucide-react'
import { useT, useLang, type Lang } from '@/lib/i18n'

type Ringkasan = {
  jendelaHari: number
  perPeristiwa: { nama: string; jumlah: number }[]
  peristiwaTerakhir: string | null
}

const LABEL: Record<string, { id: string; en: string }> = {
  VOYAGE_CREATED: { id: 'Voyage dibuat', en: 'Voyages created' },
  DISBURSEMENT_SENT: { id: 'EPDA/FDA dikirim ke principal', en: 'EPDA/FDA sent to principal' },
  INVOICE_ISSUED: { id: 'Invoice diterbitkan', en: 'Invoices issued' },
  AI_PREDICT_USED: { id: 'Perkiraan biaya AI dipakai', en: 'AI cost prediction used' },
  AI_VESSEL_IMPORT_USED: { id: 'Impor partikular kapal (AI)', en: 'Vessel particulars import (AI)' },
  PORTAL_LOGIN: { id: 'Masuk ke portal pelanggan/vendor', en: 'Customer/vendor portal logins' },
  ONBOARDING_STEP_DONE: { id: 'Langkah onboarding diselesaikan', en: 'Onboarding steps completed' },
  TASK_COMPLETED: { id: 'Tugas diselesaikan', en: 'Tasks completed' },
  REPORT_EXPORTED: { id: 'Laporan diekspor', en: 'Reports exported' },
  VENDOR_INVOICE_SUBMITTED: { id: 'Tagihan vendor dikirim (portal)', en: 'Vendor invoices submitted (portal)' },
}

const T: Record<Lang, Record<string, string>> = {
  id: {
    title: 'Pemakaian', desc: 'Fitur mana yang dipakai tim Anda 30 hari terakhir — bukan penilaian orang, hanya fitur.',
    empty: 'Belum ada pemakaian tercatat.', last: 'Aktivitas terakhir tercatat:',
    notUsed: 'Belum dipakai: ',
  },
  en: {
    title: 'Usage', desc: 'Which features your team used in the last 30 days — not a judgment of people, just features.',
    empty: 'No usage recorded yet.', last: 'Last recorded activity:',
    notUsed: 'Not yet used: ',
  },
}

export function UsageSummary() {
  const t = useT(T)
  const { lang } = useLang()
  const [data, setData] = useState<Ringkasan | null>(null)

  useEffect(() => {
    fetch('/api/settings/usage')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setData(d))
  }, [])

  if (!data) return <Loader2 className="h-5 w-5 animate-spin text-text-secondary" />

  const terpakai = data.perPeristiwa.filter((p) => p.jumlah > 0)
  const takTerpakai = data.perPeristiwa.filter((p) => p.jumlah === 0)
  const maks = Math.max(1, ...data.perPeristiwa.map((p) => p.jumlah))

  return (
    <div className="bg-card-bg border border-card-border rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-accent-blue" />
          <h2 className="font-display text-white text-base">{t.title}</h2>
        </div>
        <span className="text-[11px] font-mono uppercase tracking-wider text-text-secondary">
          {lang === 'id' ? `${data.jendelaHari} hari terakhir` : `last ${data.jendelaHari} days`}
        </span>
      </div>
      <p className="text-text-secondary text-xs">{t.desc}</p>

      {data.peristiwaTerakhir && (
        <p className="text-text-secondary text-xs">
          {t.last} <span className="text-white">{new Date(data.peristiwaTerakhir).toLocaleString(lang === 'id' ? 'id-ID' : 'en-US')}</span>
        </p>
      )}

      {terpakai.length === 0 ? (
        <p className="text-text-secondary text-xs">{t.empty}</p>
      ) : (
        <div className="space-y-2">
          {terpakai
            .sort((a, b) => b.jumlah - a.jumlah)
            .map((p) => (
              <div key={p.nama} className="flex items-center gap-3">
                <span className="text-xs text-text-secondary w-56 shrink-0 truncate">
                  {LABEL[p.nama]?.[lang] ?? p.nama}
                </span>
                <div className="flex-1 h-2 rounded-full bg-surface-tertiary/40 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent-blue"
                    style={{ width: `${Math.max(4, (p.jumlah / maks) * 100)}%` }}
                  />
                </div>
                <span className="text-xs text-white font-mono w-8 text-right shrink-0">{p.jumlah}</span>
              </div>
            ))}
        </div>
      )}

      {takTerpakai.length > 0 && (
        <p className="text-text-secondary/60 text-[11px] pt-1 border-t border-card-border">
          {t.notUsed + takTerpakai.map((p) => LABEL[p.nama]?.[lang] ?? p.nama).join(', ')}
        </p>
      )}
    </div>
  )
}
