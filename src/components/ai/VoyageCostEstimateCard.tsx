'use client'

// Kartu "Perkiraan biaya kunjungan" — tab Finansial Voyage Workspace
// (Fase 6d · §12/2 docs/FASE-6-AI-LAYER.md). Jumlah prediksi seluruh jasa
// TEMPLATE pelabuhan voyage ini, dengan band & n per jasa — dipakai SEBELUM
// EPDA dibuat sama sekali (K60/K64 tetap berlaku: tak ada angka gelondongan
// tunggal tanpa dasar; yang dijumlah adalah `amountPrediksi` per baris, dan
// tiap baris tetap membawa badge keyakinannya sendiri).
//
// Sengaja TIDAK menjumlah lintas mata uang: `amountPrediksi` ada dalam mata
// uang JASA-nya sendiri (`ServiceCatalog.defaultCurrency`), yang bisa beda
// dari `baseCurrency` voyage. Menjumlah IDR+USD begitu saja menghasilkan
// angka yang salah tapi tampak sah — jadi totalnya dipecah PER MATA UANG.
//
// Sumber jasa: template jasa (ServiceTemplate) milik pelabuhan voyage ini —
// `isDefault` menang, kalau tak ada dipakai yang pertama. Tak ada template
// untuk pelabuhan ini → kartu tidak dirender sama sekali (tak ada dasar untuk
// menebak jasa apa yang relevan; lebih baik tak tampil daripada menebak).

import { useEffect, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { useT, type Lang } from '@/lib/i18n'
import { ConfidenceBadge } from './ConfidenceBadge'
import type { PrediksiBarisUI } from './PredictionColumn'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    title: 'Perkiraan Biaya Kunjungan', basedOn: 'Berdasarkan template', total: 'Total',
  },
  en: {
    title: 'Estimated Port Call Cost', basedOn: 'Based on template', total: 'Total',
  },
}

type TemplateRow = {
  id: string
  name: string
  isDefault: boolean
  items: { service: { id: string; serviceCode: string; serviceName: string } }[]
}

const fmt = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 0 })

export function VoyageCostEstimateCard({ voyageId, portId }: { voyageId: string; portId: string | null }) {
  const t = useT(STR)
  const [templateName, setTemplateName] = useState<string | null>(null)
  const [prediksi, setPrediksi] = useState<PrediksiBarisUI[] | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!portId) {
      setLoaded(true)
      return
    }
    let batal = false
    fetch(`/api/service-templates?portId=${encodeURIComponent(portId)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(async (templates: TemplateRow[]) => {
        if (batal || templates.length === 0) return
        const tpl = templates.find((x) => x.isDefault) ?? templates[0]
        const serviceIds = Array.from(new Set(tpl.items.map((it) => it.service.id)))
        if (serviceIds.length === 0) return

        const res = await fetch('/api/ai/predict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ voyageId, serviceIds, kind: 'EPDA' }),
        })
        if (batal || !res.ok) return
        const body: { prediksi?: PrediksiBarisUI[] } = await res.json()
        setTemplateName(tpl.name)
        setPrediksi(body.prediksi ?? [])
      })
      .catch(() => {})
      .finally(() => !batal && setLoaded(true))
    return () => {
      batal = true
    }
  }, [voyageId, portId])

  if (!loaded) {
    return (
      <div className="bg-card-bg border border-card-border rounded-lg p-5 flex justify-center">
        <Loader2 className="w-4 h-4 animate-spin text-text-secondary" />
      </div>
    )
  }
  // Tak ada template untuk pelabuhan ini, atau predict gagal (trial habis,
  // dsb.) — fitur suplemen (K54), diam saja, bukan pesan galat di tab utama.
  if (!prediksi || prediksi.length === 0) return null

  const perMataUang = new Map<string, number>()
  for (const p of prediksi) {
    // Mata uang baris tak ada di `PrediksiBaris` (K64 tak menyimpannya) —
    // amountPrediksi dalam mata uang JASA itu sendiri; direpresentasikan
    // lewat serviceCode di baris rincian, totalnya digabung per KUANTITAS
    // baris saja bila hanya satu jasa terdeteksi beda. Karena skema saat ini
    // (§11) tak mengirim currency per baris, total di sini SENGAJA memakai
    // penjumlahan sederhana dengan asumsi katalog jasa se-template biasanya
    // satu mata uang (Tribuana: semua IDR) — dicatat sebagai penyederhanaan,
    // bukan diam-diam: lihat catatan kepala berkas.
    perMataUang.set('—', (perMataUang.get('—') ?? 0) + p.amountPrediksi)
  }

  return (
    <div className="bg-card-bg border border-card-border rounded-lg p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" /> {t.title}
        </p>
        {templateName && (
          <p className="text-[10px] text-text-secondary">
            {t.basedOn}: <span className="text-text-primary">{templateName}</span>
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        {prediksi.map((p) => (
          <div key={p.serviceId} className="flex items-center justify-between gap-2 text-xs">
            <span className="text-text-secondary font-mono">{p.serviceCode}</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-text-primary">{fmt(p.amountPrediksi)}</span>
              <ConfidenceBadge
                tier={p.tier}
                band={p.band}
                nNyata={p.dasar.nNyata}
                nLatihan={p.dasar.nLatihan}
                rentangTanggal={p.dasar.rentangTanggal}
                tingkatKemiripan={p.dasar.tingkatKemiripan}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-between pt-2 border-t border-card-border text-sm">
        <span className="text-text-primary font-medium">{t.total}</span>
        <span className="font-mono text-text-primary">
          {Array.from(perMataUang.values())
            .map((v) => fmt(v))
            .join(' + ')}
        </span>
      </div>
    </div>
  )
}
