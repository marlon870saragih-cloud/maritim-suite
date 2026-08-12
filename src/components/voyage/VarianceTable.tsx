// Layar variance FDA vs EPDA (K46, §12/9 docs/FASE-3-EPDA-ENGINE.md) — tabel per
// baris urut |varianceBase| menurun + ringkasan header, TANPA penilaian merah/
// hijau (P12 belum dijawab). Server component murni, sama pola dengan CompareTable.

import { cn } from '@/lib/utils'
import { getLang } from '@/lib/i18n-server'
import type { HasilVarianceDokumen } from '@/services/finance/fda.service'
import type { StatusVariance } from '@/services/finance/variance'

const STR = {
  id: {
    ringkasan: 'Ringkasan', header: 'Perubahan Header', field: 'Field', epda: 'EPDA', fda: 'FDA', selisih: 'Selisih',
    lines: 'Baris Biaya', description: 'Deskripsi',
    noHeaderChange: 'Tidak ada perubahan header.',
    STATUS: {
      SAMA: 'Sama', BERUBAH: 'Berubah', TAK_DIANGGARKAN: 'Tak Dianggarkan', TIDAK_TEREALISASI: 'Tidak Terealisasi',
    } as Record<StatusVariance, string>,
  },
  en: {
    ringkasan: 'Summary', header: 'Header Changes', field: 'Field', epda: 'EPDA', fda: 'FDA', selisih: 'Variance',
    lines: 'Cost Lines', description: 'Description',
    noHeaderChange: 'No header changes.',
    STATUS: {
      SAMA: 'Same', BERUBAH: 'Changed', TAK_DIANGGARKAN: 'Unbudgeted', TIDAK_TEREALISASI: 'Not Realized',
    } as Record<StatusVariance, string>,
  },
} as const

const STATUS_COLOR: Record<StatusVariance, string> = {
  SAMA: 'bg-surface-tertiary text-text-secondary border-border-muted',
  BERUBAH: 'bg-accent-amber/12 text-accent-amber border-accent-amber/30',
  TAK_DIANGGARKAN: 'bg-status-danger/12 text-status-danger border-status-danger/30',
  TIDAK_TEREALISASI: 'bg-status-danger/12 text-status-danger border-status-danger/30',
}

const fmt = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 })
const fmtPct = (n: number | null) => (n === null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(1)}%`)

export function VarianceTable({ hasil }: { hasil: HasilVarianceDokumen }) {
  const t = STR[getLang()]

  return (
    <div className="space-y-6">
      <section className="bg-card-bg border border-card-border rounded-lg p-5">
        <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-3">{t.ringkasan}</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(hasil.ringkasan.jumlah) as StatusVariance[]).map((status) => (
            <span
              key={status}
              className={cn('text-xs px-2.5 py-1 rounded-full border font-mono', STATUS_COLOR[status])}
            >
              {hasil.ringkasan.jumlah[status]} {t.STATUS[status]}
            </span>
          ))}
        </div>
      </section>

      <section className="bg-card-bg border border-card-border rounded-lg p-5">
        <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-3">{t.header}</p>
        {hasil.header.filter((h) => h.variance !== 0).length === 0 ? (
          <p className="text-text-secondary text-sm">{t.noHeaderChange}</p>
        ) : (
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="text-text-secondary font-mono uppercase tracking-widest text-[10px] border-b border-card-border">
                <th className="py-2 font-medium">{t.field}</th>
                <th className="py-2 font-medium text-right">{t.epda}</th>
                <th className="py-2 font-medium text-right">{t.fda}</th>
                <th className="py-2 font-medium text-right">{t.selisih}</th>
              </tr>
            </thead>
            <tbody>
              {hasil.header
                .filter((h) => h.variance !== 0)
                .map((h) => (
                  <tr key={h.field} className="border-b border-card-border/50 last:border-0">
                    <td className="py-2 font-mono text-text-secondary">{h.field}</td>
                    <td className="py-2 text-right font-mono text-text-primary">{fmt(h.epda)}</td>
                    <td className="py-2 text-right font-mono text-text-primary">{fmt(h.fda)}</td>
                    <td
                      className={cn(
                        'py-2 text-right font-mono',
                        h.variance > 0 ? 'text-status-danger' : 'text-status-success',
                      )}
                    >
                      {h.variance > 0 ? '+' : ''}
                      {fmt(h.variance)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="bg-card-bg border border-card-border rounded-lg p-5">
        <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-3">{t.lines}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="text-text-secondary font-mono uppercase tracking-widest text-[10px] border-b border-card-border">
                <th className="py-2 pr-3 font-medium" />
                <th className="py-2 pr-3 font-medium">{t.description}</th>
                <th className="py-2 pr-3 font-medium text-right">{t.epda}</th>
                <th className="py-2 pr-3 font-medium text-right">{t.fda}</th>
                <th className="py-2 pr-3 font-medium text-right">{t.selisih}</th>
                <th className="py-2 font-medium text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {hasil.baris.map((b, i) => (
                <tr key={i} className="border-b border-card-border/40 last:border-0">
                  <td className="py-2 pr-3">
                    <span
                      className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded-full border font-mono uppercase tracking-wider whitespace-nowrap',
                        STATUS_COLOR[b.status],
                      )}
                    >
                      {t.STATUS[b.status]}
                    </span>
                  </td>
                  <td className="py-2 pr-3">{b.description}</td>
                  <td className="py-2 pr-3 text-right font-mono text-text-primary">{fmt(b.epdaBase)}</td>
                  <td className="py-2 pr-3 text-right font-mono text-text-primary">{fmt(b.fdaBase)}</td>
                  <td
                    className={cn(
                      'py-2 pr-3 text-right font-mono',
                      b.varianceBase > 0 ? 'text-status-danger' : b.varianceBase < 0 ? 'text-status-success' : 'text-text-secondary',
                    )}
                  >
                    {b.varianceBase > 0 ? '+' : ''}
                    {fmt(b.varianceBase)}
                  </td>
                  <td className="py-2 text-right font-mono text-text-secondary">{fmtPct(b.variancePct)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-card-border font-medium">
                <td className="py-2 pr-3" />
                <td className="py-2 pr-3 text-text-primary">Total</td>
                <td className="py-2 pr-3 text-right font-mono text-text-primary">{fmt(hasil.ringkasan.epdaBase)}</td>
                <td className="py-2 pr-3 text-right font-mono text-text-primary">{fmt(hasil.ringkasan.fdaBase)}</td>
                <td
                  className={cn(
                    'py-2 pr-3 text-right font-mono',
                    hasil.ringkasan.varianceBase > 0 ? 'text-status-danger' : 'text-status-success',
                  )}
                >
                  {hasil.ringkasan.varianceBase > 0 ? '+' : ''}
                  {fmt(hasil.ringkasan.varianceBase)}
                </td>
                <td className="py-2 text-right font-mono text-text-secondary">{fmtPct(hasil.ringkasan.variancePct)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  )
}
