'use client'

// Kolom pembanding prediksi biaya per baris (Fase 6d · K60/K64). Menerima satu
// `PrediksiBaris` APA ADANYA dari respons `POST /api/ai/predict`.
//
// Bentuk `PrediksiBarisUI` di bawah didefinisikan LOKAL (bukan diimpor dari
// `services/ai/prediction.service.ts`) — mengikuti konvensi berkas lain di
// direktori ini (`LineItem`/`DisbRow`/`InvoiceRow`: tipe respons JSON
// didefinisikan di sisi klien sendiri). Alasannya bukan gaya: `prediction.
// service.ts` mengimpor `forTenant`/Prisma; mengimpor APA PUN darinya ke
// komponen klien — bahkan `import type` — mempertaruhkan seluruh lapisan DB
// ikut ter-bundle ke browser kalau suatu saat berkas itu berubah punya impor
// bernilai. Satu-satunya impor dari `services/ai/` di sini adalah
// `confidence.ts` — MURNI (K51), memang dirancang aman diimpor browser.
//
// K64/3: prediksi TIDAK PERNAH otomatis mengisi `unitPrice`. Tombol "Pakai
// angka ini" memanggil `onApply` yang diteruskan pemanggil ke handler PATCH
// yang SAMA dipakai kolom Harga Satuan biasa (DisbursementBuilder.patchItem)
// — bukan jalur simpan kedua. Ini penyimpangan sadar dari kalimat verifikasi
// §15/6d ("tidak tersimpan sampai tombol Simpan ditekan"): builder ini TIDAK
// PERNAH punya tombol Simpan per baris sejak 3c (tiap field auto-tersimpan
// saat blur, "nilai server yang menang" — lihat kepala DisbursementBuilder.
// tsx). Menambah jalur staged-edit kedua khusus prediksi akan membuat DUA
// model penyimpanan berbeda di tabel yang sama. Yang tetap benar dari niat
// K64/3: unitPrice TAK PERNAH berubah tanpa klik eksplisit operator.

import { Link2, Loader2, Sparkles } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useT, type Lang } from '@/lib/i18n'
import type { BandKeyakinan, TierPrediksi } from '@/services/ai/confidence'
import type { TingkatKemiripan } from '@/services/ai/similarity'
import { ConfidenceBadge } from './ConfidenceBadge'

const STR: Record<Lang, Record<string, string>> = {
  id: { apply: 'Pakai angka ini', katalog: 'katalog', sources: 'Sumber dokumen' },
  en: { apply: 'Use this figure', katalog: 'catalogue', sources: 'Source documents' },
}

/** Bentuk JSON `PrediksiBaris` (lihat catatan berkas — sengaja tak diimpor dari service). */
export type PrediksiBarisUI = {
  serviceId: string
  serviceCode: string
  calcMethod: string
  tier: TierPrediksi
  unitPrice: { p25: number; median: number; p75: number } | null
  unitPriceKatalog: number | null
  minChargeMedian: number | null
  quantity: number
  amountPrediksi: number
  confidence: number
  band: BandKeyakinan
  dasar: {
    tingkatKemiripan: TingkatKemiripan | null
    tingkatLabel: string | null
    nNyata: number
    nLatihan: number
    rentangTanggal: { dari: string; sampai: string } | null
    sumber: { disbursementId: string; docNumber: string; itemId: string; unitPrice: number }[]
  }
  warnings: { kode: string; pesan: string; itemId?: string | null }[]
  teks: string
}

const fmt = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 })

export function PredictionColumn({
  prediksi,
  voyageId,
  disabled,
  onApply,
}: {
  prediksi: PrediksiBarisUI
  voyageId: string
  disabled?: boolean
  onApply: (unitPrice: number) => void
}) {
  const t = useT(STR)
  const angka = prediksi.tier === 'KATALOG' ? prediksi.unitPriceKatalog : (prediksi.unitPrice?.median ?? null)

  return (
    <div className="space-y-1 min-w-[160px]">
      <ConfidenceBadge
        tier={prediksi.tier}
        band={prediksi.band}
        nNyata={prediksi.dasar.nNyata}
        nLatihan={prediksi.dasar.nLatihan}
        rentangTanggal={prediksi.dasar.rentangTanggal}
        tingkatKemiripan={prediksi.dasar.tingkatKemiripan}
      />
      {angka !== null && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="font-mono text-[11px] text-text-secondary cursor-default">
                {prediksi.unitPrice
                  ? `${fmt(prediksi.unitPrice.p25)} – ${fmt(prediksi.unitPrice.median)} – ${fmt(prediksi.unitPrice.p75)}`
                  : `${fmt(angka)} (${t.katalog})`}
              </span>
            </TooltipTrigger>
            {prediksi.dasar.sumber.length > 0 && (
              <TooltipContent className="max-w-[300px] text-[11px]">
                <p className="font-mono uppercase tracking-wider text-[9px] opacity-70 mb-1.5">{t.sources}</p>
                <ul className="space-y-1">
                  {prediksi.dasar.sumber.map((s) => (
                    <li key={s.itemId}>
                      <a
                        href={`/voyages/${voyageId}/disbursements/${s.disbursementId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-mono hover:underline"
                      >
                        <Link2 className="w-3 h-3 flex-shrink-0" />
                        {s.docNumber}: {fmt(s.unitPrice)}
                      </a>
                    </li>
                  ))}
                </ul>
              </TooltipContent>
            )}
          </Tooltip>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onApply(angka)}
            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-accent-blue/40 text-accent-blue hover:bg-accent-blue/10 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {disabled ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {t.apply}
          </button>
        </div>
      )}
    </div>
  )
}
