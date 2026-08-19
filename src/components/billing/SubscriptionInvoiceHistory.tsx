// Riwayat kuitansi langganan (K164, Fase 8e) — server-rendered (daftarnya
// sudah diambil di page.tsx yang sama, tak perlu fetch klien kedua). Bukan
// 'use client': tautan unduh cukup <a href>, tak butuh state apa pun.

import { Receipt } from 'lucide-react'

type Lang = 'id' | 'en'

type Row = { id: string; invoiceNumber: string; issuedAt: string; currency: string; grandTotal: number }

const T = {
  id: { heading: 'Riwayat kuitansi', empty: 'Belum ada kuitansi — muncul otomatis begitu pembayaran pertama lunas.', download: 'Unduh PDF' },
  en: { heading: 'Receipt history', empty: 'No receipts yet — appears automatically once the first payment clears.', download: 'Download PDF' },
} as const

const fmtTanggal = (iso: string, lang: Lang) =>
  new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso))

export function SubscriptionInvoiceHistory({ lang, invoices }: { lang: Lang; invoices: Row[] }) {
  const t = T[lang]

  return (
    <div className="bg-card-bg border border-card-border rounded-lg p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Receipt className="h-4 w-4 text-accent-blue" />
        <h3 className="font-display text-lg text-white">{t.heading}</h3>
      </div>

      {invoices.length === 0 ? (
        <p className="text-text-secondary text-sm">{t.empty}</p>
      ) : (
        <div className="divide-y divide-card-border">
          {invoices.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-white text-sm font-mono">{inv.invoiceNumber}</p>
                <p className="text-text-secondary text-xs">{fmtTanggal(inv.issuedAt, lang)}</p>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <span className="text-white text-sm font-mono">
                  {inv.currency} {inv.grandTotal.toLocaleString('en-US')}
                </span>
                <a
                  href={`/api/billing/invoices/${inv.id}/pdf?download=1`}
                  className="inline-flex items-center gap-1 rounded-md border border-card-border px-2.5 py-1 text-xs
                             text-text-secondary hover:text-white hover:border-accent-blue/50 transition-colors"
                >
                  {t.download}
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
