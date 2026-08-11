'use client'

// Beda dengan manager master data lain: ini LOG, bukan tabel yang bisa
// diubah/dihapus (lihat catatan di exchange-rate.service.ts — prinsip
// snapshot). UI-nya karena itu cuma "daftar riwayat + form catat baru".

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT, type Lang } from '@/lib/i18n'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    addBtn: 'Catat Kurs',
    errReq: 'Dari/Ke mata uang dan rate wajib diisi.', errSave: 'Gagal menyimpan.', errConn: 'Gagal terhubung ke server.',
    emptyTitle: 'Belum ada riwayat kurs', emptyDesc: 'Catat kurs sekali — dipakai untuk konversi mata uang di dokumen.',
    thPair: 'Pasangan', thRate: 'Rate', thDate: 'Berlaku', thSource: 'Sumber',
    dialogTitle: 'Catat Kurs Baru', dialogDesc: 'Ini LOG — kurs lama tidak pernah diubah, hanya ditambah baris baru.',
    fFrom: 'Dari', fTo: 'Ke', fRate: 'Rate', fDate: 'Tanggal Berlaku', fSource: 'Sumber',
    cancel: 'Batal', save: 'Simpan',
  },
  en: {
    addBtn: 'Record Rate',
    errReq: 'From/To currency and rate are required.', errSave: 'Failed to save.', errConn: 'Failed to connect to server.',
    emptyTitle: 'No exchange rate history yet', emptyDesc: 'Record a rate once — used for currency conversion in documents.',
    thPair: 'Pair', thRate: 'Rate', thDate: 'Effective', thSource: 'Source',
    dialogTitle: 'Record New Rate', dialogDesc: 'This is a LOG — old rates are never edited, only new rows added.',
    fFrom: 'From', fTo: 'To', fRate: 'Rate', fDate: 'Effective Date', fSource: 'Source',
    cancel: 'Cancel', save: 'Save',
  },
}

export type ExchangeRate = {
  id: string
  fromCurrency: string
  toCurrency: string
  rate: number
  effectiveDate: string | Date
  source: string | null
}

type FormState = { fromCurrency: string; toCurrency: string; rate: string; effectiveDate: string; source: string }

const today = () => new Date().toISOString().slice(0, 10)
const emptyForm = (): FormState => ({ fromCurrency: '', toCurrency: 'IDR', rate: '', effectiveDate: today(), source: 'MANUAL' })

const inputCls =
  'w-full bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary ' +
  'placeholder:text-text-secondary/40 focus:border-accent-blue focus:outline-none ' +
  'focus:ring-1 focus:ring-accent-blue/40 transition-colors'
const labelCls = 'block text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1'

export function ExchangeRatesManager({ rates }: { rates: ExchangeRate[] }) {
  const t = useT(STR)
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const set = (k: keyof FormState, v: string) => setForm((p) => ({ ...p, [k]: v }))

  function openAdd() {
    setForm(emptyForm())
    setError('')
    setOpen(true)
  }

  async function submit() {
    if (!form.fromCurrency.trim() || !form.toCurrency.trim() || !form.rate.trim()) {
      setError(t.errReq)
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/exchange-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error?.message ?? t.errSave)
        return
      }
      setOpen(false)
      router.refresh()
    } catch {
      setError(t.errConn)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center gap-2 bg-accent-blue hover:bg-primary text-[#231a06] rounded px-4 py-2 text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> {t.addBtn}
        </button>
      </div>

      <section className="bg-card-bg border border-card-border rounded-lg overflow-hidden">
        {rates.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="p-3 rounded-full bg-surface-tertiary text-text-secondary">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <p className="text-text-primary text-sm font-medium">{t.emptyTitle}</p>
              <p className="text-text-secondary text-xs mt-1">{t.emptyDesc}</p>
            </div>
            <button
              type="button"
              onClick={openAdd}
              className="inline-flex items-center gap-2 mt-1 bg-accent-blue hover:bg-primary text-[#231a06] rounded px-4 py-2 text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> {t.addBtn}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-secondary text-text-secondary font-mono uppercase tracking-widest border-b border-card-border text-[10px]">
                  <th className="px-5 py-3 font-medium">{t.thPair}</th>
                  <th className="px-5 py-3 font-medium text-right">{t.thRate}</th>
                  <th className="px-5 py-3 font-medium">{t.thDate}</th>
                  <th className="px-5 py-3 font-medium">{t.thSource}</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {rates.map((r, i) => (
                  <tr
                    key={r.id}
                    className={cn(
                      'hover:bg-surface-tertiary/30 transition-colors',
                      i < rates.length - 1 && 'border-b border-card-border/50',
                    )}
                  >
                    <td className="px-5 py-4 font-mono text-text-primary">
                      {r.fromCurrency} → {r.toCurrency}
                    </td>
                    <td className="px-5 py-4 font-mono text-text-primary text-right">
                      {r.rate.toLocaleString('id-ID')}
                    </td>
                    <td className="px-5 py-4 text-text-secondary">
                      {new Date(r.effectiveDate).toLocaleDateString('id-ID')}
                    </td>
                    <td className="px-5 py-4 text-text-secondary">{r.source ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="bg-surface-secondary border-card-border text-text-primary max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-white">{t.dialogTitle}</DialogTitle>
            <DialogDescription className="text-text-secondary">{t.dialogDesc}</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>
                {t.fFrom} <span className="text-status-danger">*</span>
              </label>
              <input
                value={form.fromCurrency}
                onChange={(e) => set('fromCurrency', e.target.value)}
                placeholder="USD"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>
                {t.fTo} <span className="text-status-danger">*</span>
              </label>
              <input
                value={form.toCurrency}
                onChange={(e) => set('toCurrency', e.target.value)}
                placeholder="IDR"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>
                {t.fRate} <span className="text-status-danger">*</span>
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={form.rate}
                onChange={(e) => set('rate', e.target.value)}
                placeholder="16200"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{t.fDate}</label>
              <input
                type="date"
                value={form.effectiveDate}
                onChange={(e) => set('effectiveDate', e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>{t.fSource}</label>
              <input
                value={form.source}
                onChange={(e) => set('source', e.target.value)}
                placeholder="MANUAL / BI / ECB"
                className={inputCls}
              />
            </div>
          </div>

          {error && (
            <p className="text-status-danger text-xs bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="px-4 py-2 rounded text-sm font-medium border border-border-muted text-text-secondary hover:text-white hover:bg-surface-tertiary transition-colors disabled:opacity-50"
            >
              {t.cancel}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded text-sm font-medium bg-accent-blue hover:bg-primary text-[#231a06] transition-colors disabled:opacity-50"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {t.save}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
