// Layar bandingkan versi (K39, §12/8 docs/FASE-3-EPDA-ENGINE.md) — dua kolom
// (lama → baru), penanda warna BARU/DIHAPUS/BERUBAH/SAMA, diff header di atas.
// Server component murni: diffnya sudah dihitung di server (bandingkanDokumen),
// di sini cuma menampilkan — tak ada interaksi yang butuh state klien.

import { cn } from '@/lib/utils'
import { getLang } from '@/lib/i18n-server'
import type { HasilBandingDokumen } from '@/services/finance/revision.service'
import type { FieldBanding, StatusDiff } from '@/services/finance/compare'

const STR = {
  id: {
    ringkasan: 'Ringkasan', header: 'Perubahan Header', field: 'Field', old: 'Lama', new: 'Baru', delta: 'Selisih',
    lines: 'Baris Biaya', description: 'Deskripsi', qty: 'Kuantitas', price: 'Harga Satuan', amount: 'Amount',
    noHeaderChange: 'Tidak ada perubahan header.',
    STATUS: { BARU: 'Baru', DIHAPUS: 'Dihapus', BERUBAH: 'Berubah', SAMA: 'Sama' } as Record<StatusDiff, string>,
  },
  en: {
    ringkasan: 'Summary', header: 'Header Changes', field: 'Field', old: 'Old', new: 'New', delta: 'Delta',
    lines: 'Cost Lines', description: 'Description', qty: 'Quantity', price: 'Unit Price', amount: 'Amount',
    noHeaderChange: 'No header changes.',
    STATUS: { BARU: 'New', DIHAPUS: 'Removed', BERUBAH: 'Changed', SAMA: 'Same' } as Record<StatusDiff, string>,
  },
} as const

const STATUS_COLOR: Record<StatusDiff, string> = {
  BARU: 'bg-status-success/12 text-status-success border-status-success/30',
  DIHAPUS: 'bg-status-danger/12 text-status-danger border-status-danger/30',
  BERUBAH: 'bg-accent-amber/12 text-accent-amber border-accent-amber/30',
  SAMA: 'bg-surface-tertiary text-text-secondary border-border-muted',
}

const fmt = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 })

export function CompareTable({ hasil }: { hasil: HasilBandingDokumen }) {
  const t = STR[getLang()]

  return (
    <div className="space-y-6">
      <section className="bg-card-bg border border-card-border rounded-lg p-5">
        <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-3">{t.ringkasan}</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(hasil.ringkasan) as StatusDiff[]).map((status) => (
            <span
              key={status}
              className={cn('text-xs px-2.5 py-1 rounded-full border font-mono', STATUS_COLOR[status])}
            >
              {hasil.ringkasan[status]} {t.STATUS[status]}
            </span>
          ))}
        </div>
      </section>

      <section className="bg-card-bg border border-card-border rounded-lg p-5">
        <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-3">{t.header}</p>
        {hasil.header.filter((h) => h.delta !== 0).length === 0 ? (
          <p className="text-text-secondary text-sm">{t.noHeaderChange}</p>
        ) : (
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="text-text-secondary font-mono uppercase tracking-widest text-[10px] border-b border-card-border">
                <th className="py-2 font-medium">{t.field}</th>
                <th className="py-2 font-medium text-right">{t.old}</th>
                <th className="py-2 font-medium text-right">{t.new}</th>
                <th className="py-2 font-medium text-right">{t.delta}</th>
              </tr>
            </thead>
            <tbody>
              {hasil.header
                .filter((h) => h.delta !== 0)
                .map((h) => (
                  <tr key={h.field} className="border-b border-card-border/50 last:border-0">
                    <td className="py-2 font-mono text-text-secondary">{h.field}</td>
                    <td className="py-2 text-right font-mono text-text-primary">{fmt(h.lama)}</td>
                    <td className="py-2 text-right font-mono text-text-primary">{fmt(h.baru)}</td>
                    <td
                      className={cn(
                        'py-2 text-right font-mono',
                        h.delta > 0 ? 'text-status-success' : 'text-status-danger',
                      )}
                    >
                      {h.delta > 0 ? '+' : ''}
                      {fmt(h.delta)}
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
                <th className="py-2 pr-3 font-medium text-right">{t.qty}</th>
                <th className="py-2 pr-3 font-medium text-right">{t.price}</th>
                <th className="py-2 font-medium text-right">{t.amount}</th>
              </tr>
            </thead>
            <tbody>
              {hasil.baris.map((b, i) => {
                const acuan = b.baru ?? b.lama
                if (!acuan) return null
                const berubah = (f: FieldBanding) => b.fieldBerubah.includes(f)
                return (
                  <tr key={i} className="border-b border-card-border/40 last:border-0">
                    <td className="py-2 pr-3">
                      <span
                        className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded-full border font-mono uppercase tracking-wider',
                          STATUS_COLOR[b.status],
                        )}
                      >
                        {t.STATUS[b.status]}
                      </span>
                    </td>
                    <td className={cn('py-2 pr-3', b.status === 'DIHAPUS' && 'line-through text-text-secondary')}>
                      {acuan.description}
                    </td>
                    <td
                      className={cn(
                        'py-2 pr-3 text-right font-mono',
                        berubah('quantity') ? 'text-accent-amber' : 'text-text-primary',
                      )}
                    >
                      {b.lama && b.baru && berubah('quantity') ? (
                        <>
                          {fmt(b.lama.quantity)} → {fmt(b.baru.quantity)}
                        </>
                      ) : (
                        fmt(acuan.quantity)
                      )}
                    </td>
                    <td
                      className={cn(
                        'py-2 pr-3 text-right font-mono',
                        berubah('unitPrice') ? 'text-accent-amber' : 'text-text-primary',
                      )}
                    >
                      {b.lama && b.baru && berubah('unitPrice') ? (
                        <>
                          {fmt(b.lama.unitPrice)} → {fmt(b.baru.unitPrice)}
                        </>
                      ) : (
                        fmt(acuan.unitPrice)
                      )}
                    </td>
                    <td
                      className={cn(
                        'py-2 text-right font-mono',
                        berubah('amountBase') ? 'text-accent-amber' : 'text-text-primary',
                      )}
                    >
                      {b.lama && b.baru && berubah('amountBase') ? (
                        <>
                          {fmt(b.lama.amountBase)} → {fmt(b.baru.amountBase)}
                        </>
                      ) : (
                        fmt(acuan.amountBase)
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
