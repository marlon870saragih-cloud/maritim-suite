'use client'

// Badge keyakinan prediksi (Fase 6d, §12/1 · K64/K70). Warna+band+n TAMPAK di
// badge; kalimat lengkap (K70) + tingkat kemiripan (K63) muncul di tooltip.
//
// `tier`/`band`/teks dihitung dari `confidence.ts` dan `similarity.ts` —
// KEDUANYA modul murni (K51), aman diimpor browser — bukan dari field `teks`/
// `tingkatLabel` yang dikirim server. Alasannya: field server sudah dibakukan
// dalam bahasa saat `predict` dipanggil, dan akan basi begitu operator
// menekan toggle id/en (yang di app ini TIDAK memicu fetch ulang prediksi).
// Menghitung ulang di klien dari modul yang sama membuat badge ikut berganti
// bahasa seketika, tanpa request kedua.
//
// K64/1 ditegakkan di BENTUK komponen ini, bukan diingat oleh pemanggil:
// `nNyata`/`nLatihan` WAJIB diisi (bukan opsional) — badge tak bisa dirender
// tanpanya, jadi "confidence tanpa n di sebelahnya" tak bisa terjadi lewat
// jalur ini.

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useLang } from '@/lib/i18n'
import { teksKeyakinan, type BandKeyakinan, type TierPrediksi } from '@/services/ai/confidence'
import { labelTingkat, type TingkatKemiripan } from '@/services/ai/similarity'

/**
 * Warna murni fungsi BAND, bukan tier. Sengaja begitu: invarian 6b membuktikan
 * tier LATIHAN/KATALOG mekanis tak pernah menghasilkan band selain RENDAH,
 * jadi aturan "tidak pernah hijau untuk LATIHAN/KATALOG" (§15/6d) otomatis
 * terjamin lewat satu pemetaan warna — tak perlu dijaga dua kali dengan cek
 * `tier` kedua di sini yang bisa menyimpang dari invariannya sendiri.
 */
const WARNA: Record<BandKeyakinan, string> = {
  RENDAH: 'bg-surface-tertiary text-text-secondary border-border-muted',
  SEDANG: 'bg-accent-amber/12 text-accent-amber border-accent-amber/30',
  TINGGI: 'bg-status-success/12 text-status-success border-status-success/30',
}

function formatPeriode(dari: string, sampai: string, lang: 'id' | 'en'): string {
  const locale = lang === 'id' ? 'id-ID' : 'en-GB'
  const f = (iso: string) => new Date(iso).toLocaleDateString(locale, { month: 'short', year: 'numeric' })
  const a = f(dari)
  const b = f(sampai)
  return a === b ? a : `${a}–${b}`
}

export function ConfidenceBadge({
  tier,
  band,
  nNyata,
  nLatihan,
  rentangTanggal,
  tingkatKemiripan,
}: {
  tier: TierPrediksi
  band: BandKeyakinan
  nNyata: number
  nLatihan: number
  rentangTanggal: { dari: string; sampai: string } | null
  tingkatKemiripan?: TingkatKemiripan | null
}) {
  const { lang } = useLang()
  const periode = rentangTanggal ? formatPeriode(rentangTanggal.dari, rentangTanggal.sampai, lang) : null
  const teks = teksKeyakinan(tier, band, { nNyata, nLatihan, periode }, lang)
  const tingkat =
    tingkatKemiripan != null ? labelTingkat(tingkatKemiripan, lang) : null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border font-mono uppercase tracking-wider cursor-default whitespace-nowrap',
            WARNA[band],
          )}
        >
          {band}
          <span className="normal-case tracking-normal opacity-80">
            · {nNyata > 0 ? nNyata : nLatihan}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[260px] text-[11px] leading-relaxed space-y-1">
        <p>{teks}</p>
        {tingkat && <p className="opacity-70">{tingkat}</p>}
      </TooltipContent>
    </Tooltip>
  )
}
