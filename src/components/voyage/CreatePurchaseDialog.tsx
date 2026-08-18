'use client'

// Buat PR/PO baru (Fase 7i) — header minimal, baris ditambah di halaman detail.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useT, type Lang } from '@/lib/i18n'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    title: 'Buat PR/PO Baru', desc: 'Baris ditambahkan sesudah dokumen dibuat, di halaman detail.',
    fKind: 'Jenis', kindPR: 'PR (Permintaan Internal)', kindPO: 'PO (Pesanan ke Vendor)',
    fVoyage: 'Voyage', selVoyageNone: '— pengadaan kantor (tanpa voyage) —',
    fVendor: 'Vendor', selVendorNone: '— belum tentukan —',
    fCurrency: 'Mata Uang', cancel: 'Batal', create: 'Buat',
    errVendorReq: 'PO wajib punya vendor.', errSave: 'Gagal membuat dokumen.', errConn: 'Gagal terhubung ke server.',
  },
  en: {
    title: 'Create New PR/PO', desc: 'Lines are added after the document is created, on the detail page.',
    fKind: 'Kind', kindPR: 'PR (Internal Requisition)', kindPO: 'PO (Vendor Order)',
    fVoyage: 'Voyage', selVoyageNone: '— office procurement (no voyage) —',
    fVendor: 'Vendor', selVendorNone: '— not decided yet —',
    fCurrency: 'Currency', cancel: 'Cancel', create: 'Create',
    errVendorReq: 'PO requires a vendor.', errSave: 'Failed to create document.', errConn: 'Failed to connect to server.',
  },
}

type Option = { id: string; name?: string; voyageNumber?: string }

const inputCls =
  'w-full bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary ' +
  'focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/40 transition-colors'
const labelCls = 'block text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1'

export function CreatePurchaseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT(STR)
  const router = useRouter()
  const [kind, setKind] = useState<'PR' | 'PO'>('PR')
  const [voyageId, setVoyageId] = useState('')
  const [vendorId, setVendorId] = useState('')
  const [currency, setCurrency] = useState('IDR')
  const [voyages, setVoyages] = useState<Option[]>([])
  const [vendors, setVendors] = useState<Option[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setKind('PR')
    setVoyageId('')
    setVendorId('')
    setCurrency('IDR')
    setError('')
    fetch('/api/voyages').then((r) => (r.ok ? r.json() : [])).then(setVoyages).catch(() => {})
    fetch('/api/vendors').then((r) => (r.ok ? r.json() : [])).then(setVendors).catch(() => {})
  }, [open])

  async function create() {
    if (kind === 'PO' && !vendorId) {
      setError(t.errVendorReq)
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, voyageId: voyageId || null, vendorId: vendorId || null, currency }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body?.error?.message ?? t.errSave)
        return
      }
      onOpenChange(false)
      router.push(`/procurement/${body.po.id}`)
    } catch {
      setError(t.errConn)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="bg-surface-secondary border-card-border text-text-primary max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-white">{t.title}</DialogTitle>
          <DialogDescription className="text-text-secondary">{t.desc}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className={labelCls}>{t.fKind}</label>
            <div className="flex gap-1.5">
              {(['PR', 'PO'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`flex-1 px-2 py-1.5 rounded text-xs font-medium border transition-colors ${kind === k ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/40' : 'border-border-muted text-text-secondary hover:text-text-primary'}`}
                >
                  {k === 'PR' ? t.kindPR : t.kindPO}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>{t.fVoyage}</label>
            <select value={voyageId} onChange={(e) => setVoyageId(e.target.value)} className={inputCls}>
              <option value="">{t.selVoyageNone}</option>
              {voyages.map((v) => (
                <option key={v.id} value={v.id}>{v.voyageNumber}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>
              {t.fVendor} {kind === 'PO' && <span className="text-status-danger">*</span>}
            </label>
            <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className={inputCls}>
              <option value="">{t.selVendorNone}</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t.fCurrency}</label>
            <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} className={inputCls} />
          </div>

          {error && <p className="text-status-danger text-xs bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => onOpenChange(false)} disabled={busy} className="px-4 py-2 rounded text-sm font-medium border border-border-muted text-text-secondary hover:text-white hover:bg-surface-tertiary transition-colors disabled:opacity-50">
              {t.cancel}
            </button>
            <button type="button" onClick={create} disabled={busy} className="inline-flex items-center gap-2 px-4 py-2 rounded text-sm font-medium bg-accent-blue hover:bg-primary text-[#231a06] transition-colors disabled:opacity-50">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {t.create}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
