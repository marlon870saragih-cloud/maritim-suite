'use client'

// Detail Pesanan (PO) vendor (K171). Baca-saja + unduh PDF — vendor tidak
// pernah menulis apa pun pada PO (beda dari WO yang punya konfirmasi K173).

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Download, Loader2 } from 'lucide-react'
import { useT, type Lang } from '@/lib/i18n'

type PoDetail = {
  id: string; nomor: string; tanggal: string; status: string
  mataUang: string; total: number; jatuhTempo: string | null; kirimKe: string | null
  kapal: string | null; voyage: string | null
  baris: { uraian: string; kuantitas: number; satuan: string | null; hargaSatuan: number; jumlah: number }[]
}

const T: Record<Lang, Record<string, string>> = {
  id: {
    back: 'Pesanan Saya', download: 'Unduh PDF', total: 'Total', neededBy: 'Dibutuhkan sebelum', deliverTo: 'Kirim ke',
    items: 'Rincian', qty: 'Kuantitas', unitPrice: 'Harga Satuan',
  },
  en: {
    back: 'My Purchase Orders', download: 'Download PDF', total: 'Total', neededBy: 'Needed by', deliverTo: 'Deliver to',
    items: 'Line items', qty: 'Quantity', unitPrice: 'Unit price',
  },
}

const fmtTanggal = (iso: string) => new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso))

export default function PortalPurchaseOrderDetailPage() {
  const t = useT(T)
  const params = useParams<{ id: string }>()
  const [po, setPo] = useState<PoDetail | null>(null)
  const [notFound404, setNotFound404] = useState(false)

  useEffect(() => {
    let hidup = true
    fetch(`/api/portal/purchase-orders/${params.id}`).then((r) => {
      if (r.status === 404) {
        if (hidup) setNotFound404(true)
        return null
      }
      return r.json()
    }).then((d) => hidup && d && setPo(d))
    return () => {
      hidup = false
    }
  }, [params.id])

  if (notFound404) return <p className="text-text-secondary text-sm">Not found.</p>
  if (!po) return <Loader2 className="h-5 w-5 animate-spin text-text-secondary" />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest">{po.status}</p>
          <h1 className="font-display text-2xl text-white">{po.nomor}</h1>
          <p className="text-text-secondary text-sm mt-0.5">
            {fmtTanggal(po.tanggal)}{po.kapal ? ` · ${po.kapal}` : ''}{po.voyage ? ` · ${po.voyage}` : ''}
          </p>
        </div>
        <a
          href={`/api/portal/purchase-orders/${po.id}/pdf?download=1`}
          className="inline-flex items-center gap-1.5 rounded-md border border-card-border px-3 py-2 text-xs
                     text-text-secondary hover:text-white hover:border-accent-blue/50 transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          {t.download}
        </a>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card-bg border border-card-border rounded-lg p-4">
          <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest">{t.total}</p>
          <p className="text-white font-mono text-lg mt-1">{po.mataUang} {po.total.toLocaleString('en-US')}</p>
        </div>
        <div className="bg-card-bg border border-card-border rounded-lg p-4">
          <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest">{t.neededBy}</p>
          <p className="text-white font-mono text-lg mt-1">{po.jatuhTempo ? fmtTanggal(po.jatuhTempo) : '—'}</p>
        </div>
        <div className="bg-card-bg border border-card-border rounded-lg p-4">
          <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest">{t.deliverTo}</p>
          <p className="text-white text-sm mt-1">{po.kirimKe ?? '—'}</p>
        </div>
      </div>

      <div className="bg-card-bg border border-card-border rounded-lg overflow-hidden">
        <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest px-4 py-3 border-b border-card-border">{t.items}</p>
        {po.baris.map((b, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-2.5 border-b border-card-border last:border-b-0">
            <div className="min-w-0">
              <p className="text-white text-sm">{b.uraian}</p>
              <p className="text-text-secondary text-xs">{b.kuantitas}{b.satuan ? ` ${b.satuan}` : ''} × {po.mataUang} {b.hargaSatuan.toLocaleString('en-US')}</p>
            </div>
            <span className="text-text-secondary text-sm font-mono shrink-0">{po.mataUang} {b.jumlah.toLocaleString('en-US')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
