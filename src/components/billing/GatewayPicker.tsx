'use client'

// Pemilih gerbang pembayaran (K162, Fase 8d).
//
// Bentuknya mengikuti putusan K162 secara harfiah:
//   • BUKAN pemilihan otomatis — pembeli yang gagal bayar tak akan tahu ada
//     jalan kedua, padahal kemampuan mencoba jalan kedua adalah SELURUH alasan
//     dua gerbang dibangun (K158).
//   • BUKAN "selalu tanya tanpa bawaan" — satu pilihan tambahan di layar bayar
//     menurunkan penyelesaian pembayaran, untuk keputusan yang tak dimengerti
//     pembeli.
//   • Bawaan + tombol "coba yang lain". Bawaannya = pilihan terakhir yang
//     BERHASIL (`Tenant.preferredGateway`), jatuh ke `GERBANG_BAWAAN`.
//
// Karena itu: bila hanya SATU gerbang tersedia, komponen ini tidak menampilkan
// apa pun — tak ada pilihan untuk dibuat, dan menampilkan satu tombol radio
// yang tak bisa diapa-apakan hanya menambah kebisingan.

import { CreditCard } from 'lucide-react'
import { LABEL_GERBANG, type Gerbang } from '@/lib/billing/gateway'

type Lang = 'id' | 'en'

const T = {
  id: { heading: 'Bayar lewat', via: 'Lewat' },
  en: { heading: 'Pay via', via: 'Via' },
} as const

export function GatewayPicker({
  lang,
  tersedia,
  terpilih,
  onPilih,
  disabled,
}: {
  lang: Lang
  tersedia: readonly Gerbang[]
  terpilih: Gerbang | null
  onPilih: (g: Gerbang) => void
  disabled?: boolean
}) {
  if (tersedia.length < 2) return null

  return (
    <div>
      <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-2">
        {T[lang].heading}
      </p>
      <div className="flex flex-wrap gap-2">
        {tersedia.map((g) => {
          const aktif = terpilih === g
          return (
            <button
              key={g}
              type="button"
              disabled={disabled}
              onClick={() => onPilih(g)}
              className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors disabled:opacity-40 ${
                aktif
                  ? 'border-accent-blue bg-accent-blue/10 text-white'
                  : 'border-card-border text-text-secondary hover:border-accent-blue/50'
              }`}
            >
              <CreditCard className={`h-3.5 w-3.5 ${aktif ? 'text-accent-blue' : ''}`} />
              {LABEL_GERBANG[g]}
            </button>
          )
        })}
      </div>
    </div>
  )
}
