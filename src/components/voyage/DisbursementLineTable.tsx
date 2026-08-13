'use client'

// Tabel baris, dikelompokkan A/B/C/D (§12/3, K48) — cermin PDF, supaya yang di
// layar = yang tercetak. `amount`/`amountBase` dibaca LANGSUNG dari kolom
// tersimpan tiap item — server menulis ulang keduanya lewat hitungUlang()
// setiap kali baris berubah, jadi tak perlu hitungan preview kedua di klien
// (K11: nilai server yang menang, di sini malah satu-satunya sumber).

import { AlertTriangle, Loader2, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT, type Lang } from '@/lib/i18n'
import type { CalcWarning } from '@/services/finance/calc-engine'
import { PredictionColumn, type PrediksiBarisUI } from '@/components/ai/PredictionColumn'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    section: 'Seksi', noSection: '— Tanpa Seksi —', desc: 'Deskripsi', qty: 'Kuantitas', unitPrice: 'Harga Satuan',
    amount: 'Jumlah', vendor: 'Vendor', action: 'Aksi', subtotalSection: 'Subtotal', prediction: 'Prediksi',
    empty: 'Belum ada baris. Tambah dari katalog atau template di atas.',
    tipDelete: 'Hapus baris',
  },
  en: {
    section: 'Section', noSection: '— No Section —', desc: 'Description', qty: 'Quantity', unitPrice: 'Unit Price',
    amount: 'Amount', vendor: 'Vendor', action: 'Action', subtotalSection: 'Subtotal', prediction: 'Prediction',
    empty: 'No lines yet. Add from catalog or template above.',
    tipDelete: 'Delete line',
  },
}

export type LineItem = {
  id: string
  serviceId: string | null
  description: string
  basis: string | null
  quantity: number
  unit: string | null
  unitPrice: number
  currency: string
  calcMethod: string
  sectionLetter: string | null
  vendorId: string | null
  vendorName: string | null
  amount: number
  amountBase: number
}

const fmt = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 })

function warningsFor(warnings: readonly CalcWarning[], itemId: string): CalcWarning[] {
  return warnings.filter((w) => w.itemId === itemId)
}

export function DisbursementLineTable({
  items, warnings, baseCurrency, editable, busyId, onQuantityChange, onUnitPriceChange, onRemove, onJumpTarget,
  voyageId, predictions, predictionBusyId, onApplyPrediction,
}: {
  items: LineItem[]
  warnings: readonly CalcWarning[]
  baseCurrency: string
  editable: boolean
  busyId: string | null
  onQuantityChange: (itemId: string, quantity: string) => void
  onUnitPriceChange: (itemId: string, unitPrice: string) => void
  onRemove: (itemId: string) => void
  onJumpTarget?: (itemId: string, el: HTMLElement | null) => void
  /**
   * Fase 6d — kolom prediksi biaya, PER SERVICE (K60: satu prediksi per jasa,
   * bukan per baris — dua baris jasa sama berbagi prediksi yang sama). Tak
   * diisi ATAU `null` (predict gagal/tenant trial habis/dsb) = kolom
   * disembunyikan seluruhnya, bukan ditampilkan kosong — builder tetap
   * berfungsi penuh tanpa prediksi (fitur suplemen, K54).
   */
  voyageId?: string
  predictions?: Map<string, PrediksiBarisUI> | null
  predictionBusyId?: string | null
  onApplyPrediction?: (itemId: string, unitPrice: number) => void
}) {
  const t = useT(STR)
  const showPredictions = editable && !!voyageId && !!predictions && !!onApplyPrediction

  const bySection = new Map<string, LineItem[]>()
  items.forEach((item) => {
    const key = item.sectionLetter ?? '—'
    const arr = bySection.get(key) ?? []
    arr.push(item)
    bySection.set(key, arr)
  })
  const sections = Array.from(bySection.keys()).sort()

  if (items.length === 0) {
    return <p className="text-text-secondary text-sm text-center py-10">{t.empty}</p>
  }

  return (
    <div className="space-y-5">
      {sections.map((letter) => {
        const rows = bySection.get(letter)!
        const subtotal = rows.reduce((sum, item) => sum + item.amountBase, 0)
        return (
          <div key={letter} className="border border-card-border/60 rounded-md overflow-hidden">
            <div className="bg-surface-secondary px-3.5 py-2 flex items-center justify-between">
              <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">
                {t.section} {letter === '—' ? '' : letter} {letter === '—' && `(${t.noSection})`}
              </p>
            </div>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-text-secondary font-mono uppercase tracking-widest text-[10px] border-b border-card-border/50">
                  <th className="px-3.5 py-2 font-medium">{t.desc}</th>
                  <th className="px-3.5 py-2 font-medium w-28">{t.qty}</th>
                  <th className="px-3.5 py-2 font-medium w-32">{t.unitPrice}</th>
                  {showPredictions && <th className="px-3.5 py-2 font-medium w-44">{t.prediction}</th>}
                  <th className="px-3.5 py-2 font-medium text-right w-36">{t.amount}</th>
                  {editable && <th className="px-3.5 py-2 font-medium w-10" />}
                </tr>
              </thead>
              <tbody className="text-sm">
                {rows.map((item) => {
                  const w = warningsFor(warnings, item.id)
                  const isBusy = busyId === item.id
                  return (
                    <tr
                      key={item.id}
                      ref={(el) => onJumpTarget?.(item.id, el)}
                      className="border-b border-card-border/30 last:border-0 hover:bg-surface-tertiary/20 transition-colors"
                    >
                      <td className="px-3.5 py-2.5 align-top">
                        <p className="text-text-primary">{item.description}</p>
                        {item.basis && <p className="text-[11px] text-text-secondary font-mono mt-0.5">{item.basis}</p>}
                        {item.vendorName && <p className="text-[11px] text-text-secondary mt-0.5">{item.vendorName}</p>}
                        {w.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {w.map((warn, i) => (
                              <p key={i} className="flex items-start gap-1 text-[11px] text-accent-amber">
                                <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                {warn.pesan}
                              </p>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 align-top">
                        <input
                          type="number"
                          disabled={!editable || isBusy}
                          defaultValue={item.quantity}
                          onBlur={(e) => onQuantityChange(item.id, e.target.value)}
                          className="w-full bg-surface border border-border-muted rounded px-2 py-1.5 text-sm text-text-primary disabled:opacity-60 disabled:bg-transparent disabled:border-transparent focus:border-accent-blue focus:outline-none"
                        />
                        {item.unit && <p className="text-[10px] text-text-secondary mt-0.5">{item.unit}</p>}
                      </td>
                      <td className="px-3.5 py-2.5 align-top">
                        <input
                          // Kunci ikut `unitPrice`: input ini TAK TERKENDALI
                          // (`defaultValue`, bukan `value`) supaya blur-per-blur
                          // tak mengganggu ketikan operator (pola lama). Tapi
                          // itu berarti perubahan `unitPrice` dari LUAR field
                          // ini sendiri — mis. tombol "Pakai angka ini" (6d)
                          // yang men-PATCH lalu menyegarkan `disb` dari server —
                          // tak pernah terlihat, karena `defaultValue` hanya
                          // dibaca React sekali saat mount. Kunci yang berubah
                          // memaksa remount, sehingga nilai server yang baru
                          // memang tampil (K11: nilai server yang menang, di
                          // sini juga soal apa yang TERLIHAT, bukan cuma tersimpan).
                          key={`unitPrice-${item.id}-${item.unitPrice}`}
                          type="number"
                          disabled={!editable || isBusy}
                          defaultValue={item.unitPrice}
                          onBlur={(e) => onUnitPriceChange(item.id, e.target.value)}
                          className="w-full bg-surface border border-border-muted rounded px-2 py-1.5 text-sm text-text-primary disabled:opacity-60 disabled:bg-transparent disabled:border-transparent focus:border-accent-blue focus:outline-none"
                        />
                        <p className="text-[10px] text-text-secondary mt-0.5 font-mono">{item.currency}</p>
                      </td>
                      {showPredictions && (
                        <td className="px-3.5 py-2.5 align-top">
                          {item.serviceId && predictions?.get(item.serviceId) ? (
                            <PredictionColumn
                              prediksi={predictions.get(item.serviceId)!}
                              voyageId={voyageId!}
                              disabled={isBusy || predictionBusyId === item.id}
                              onApply={(unitPrice) => onApplyPrediction?.(item.id, unitPrice)}
                            />
                          ) : (
                            <span className="text-[10px] text-text-secondary/50">—</span>
                          )}
                        </td>
                      )}
                      <td className="px-3.5 py-2.5 align-top text-right font-mono text-text-primary">
                        {fmt(item.amountBase)}
                        {item.currency !== baseCurrency && (
                          <p className="text-[10px] text-text-secondary">
                            {item.currency} {fmt(item.amount)}
                          </p>
                        )}
                      </td>
                      {editable && (
                        <td className="px-3.5 py-2.5 align-top text-right">
                          <button
                            type="button"
                            title={t.tipDelete}
                            disabled={isBusy}
                            onClick={() => onRemove(item.id)}
                            className="p-1.5 rounded text-text-secondary hover:text-status-danger hover:bg-surface-tertiary transition-colors disabled:opacity-50"
                          >
                            {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className={cn('px-3.5 py-2 flex justify-end gap-2 text-xs bg-surface/40')}>
              <span className="text-text-secondary font-mono uppercase tracking-wider">{t.subtotalSection}</span>
              <span className="text-text-primary font-mono">
                {baseCurrency} {fmt(subtotal)}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
