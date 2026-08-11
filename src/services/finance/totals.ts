// Total dokumen — MURNI, dua lintasan (K20/K21/K22/K23).
//
// ⚠️ Kenapa `hitungBaris`/`bulatkan` MASUK SEBAGAI ARGUMEN, bukan diimpor:
// dokumen desain menganggap totals.ts bisa memanggil calc-engine.ts langsung,
// tapi itu ternyata mustahil sekaligus memenuhi K11. Terbukti empiris di repo ini:
// `import { x } from './calc-engine'` gagal di Node (ERR_MODULE_NOT_FOUND — ESM
// butuh ekstensi), `from './calc-engine.ts'` gagal di tsc (TS5097). Tak ada
// bentuk impor nilai lintas-modul yang lolos keduanya, jadi modul murni saling
// merujuk lewat `import type` saja dan mesin barisnya disuntikkan.
//
// Efek sampingnya justru bagus: mustahil ada implementasi pembulatan kedua di sini.
//
// Pola pemanggilan (server maupun klien):
//   import { hitungBaris, bulatkan } from '@/services/finance/calc-engine'
//   import { hitungTotal } from '@/services/finance/totals'
//   hitungTotal(baris, opsi, { hitungBaris, bulatkan })

import type { CalcMethod } from '@prisma/client'
import type { BarisHitung, CalcWarning, HasilBaris, Pelanggaran } from './calc-engine'

export type MesinBaris = {
  hitungBaris: (baris: BarisHitung) => HasilBaris
  bulatkan: (n: number, decimals: number) => number
}

export type BarisTotal = BarisHitung & {
  /** Untuk subtotal per seksi PDF A–D (§12/3, K48). */
  sectionLetter?: string | null
}

export type OpsiTotal = {
  /** K21: agency fee hidup di header, bukan sebagai baris item. */
  agencyPct: number
  /** `Currency.decimals` baseCurrency (K23). */
  decimalsBase: number
  /**
   * Tarif pajak atas `agencyAmount`, bila jasa agency fee ber-`taxable` (K22).
   * Dibaca dari data — kode tak pernah meng-hardcode angkanya.
   */
  agencyTaxPct?: number | null
}

export type HasilBarisTotal = HasilBaris & {
  /**
   * Kuantitas yang benar-benar dipakai. Sama dengan yang tersimpan KECUALI baris
   * PERCENTAGE, yang basisnya fungsi dari baris lain — service menyimpan nilai
   * ini balik supaya invarian K13 tetap utuh.
   */
  quantity: number
  sectionLetter: string | null
  calcMethod: CalcMethod
}

export type HasilTotal = {
  baris: HasilBarisTotal[]
  /** Σ `amountBase` semua baris yang SUDAH dibulatkan (K23). */
  subtotal: number
  /** Basis lintasan 1: Σ `amountBase` baris non-PERCENTAGE (K20). */
  basisPersen: number
  perSeksi: Record<string, number>
  agencyAmount: number
  /** Pajak baris (dalam base) + pajak atas agencyAmount (K22). */
  taxAmount: number
  grandTotal: number
  warnings: CalcWarning[]
  pelanggaran: Pelanggaran[]
}

/**
 * Dua lintasan (K20): lintasan 1 semua baris non-persen, lintasan 2 baris persen.
 * Deterministik, tidak tergantung `displayOrder`, dan tidak ada persen-dari-persen —
 * dua baris PERCENTAGE tak pernah saling menghitung karena keduanya memakai basis
 * yang sama dari lintasan 1.
 */
export function hitungTotal(
  baris: readonly BarisTotal[],
  opsi: OpsiTotal,
  mesin: MesinBaris,
): HasilTotal {
  const hasil: (HasilBarisTotal | null)[] = baris.map(() => null)
  const warnings: CalcWarning[] = []
  const pelanggaran: Pelanggaran[] = []

  const jalankan = (i: number, quantity: number) => {
    const b = baris[i]
    const r = mesin.hitungBaris({ ...b, quantity })
    warnings.push(...r.warnings)
    pelanggaran.push(...r.pelanggaran)
    hasil[i] = { ...r, quantity, sectionLetter: b.sectionLetter ?? null, calcMethod: b.calcMethod }
  }

  // --- lintasan 1: semua baris non-PERCENTAGE ---
  baris.forEach((b, i) => {
    if (b.calcMethod !== 'PERCENTAGE') jalankan(i, b.quantity)
  })

  const basisPersen = hasil.reduce(
    (jml, r) => (r && r.calcMethod !== 'PERCENTAGE' ? jml + r.amountBase : jml),
    0,
  )

  // --- lintasan 2: baris PERCENTAGE, semuanya atas basis yang sama ---
  baris.forEach((b, i) => {
    if (b.calcMethod === 'PERCENTAGE') jalankan(i, basisPersen)
  })

  const terhitung = hasil.filter((r): r is HasilBarisTotal => r !== null)

  const subtotal = terhitung.reduce((jml, r) => jml + r.amountBase, 0)

  const perSeksi: Record<string, number> = {}
  for (const r of terhitung) {
    const kunci = r.sectionLetter ?? '—'
    perSeksi[kunci] = (perSeksi[kunci] ?? 0) + r.amountBase
  }

  const agencyAmount = mesin.bulatkan((subtotal * opsi.agencyPct) / 100, opsi.decimalsBase)

  const pajakBaris = terhitung.reduce((jml, r) => jml + (r.taxAmountBase ?? 0), 0)
  const pajakAgency =
    opsi.agencyTaxPct === null || opsi.agencyTaxPct === undefined || !Number.isFinite(opsi.agencyTaxPct)
      ? 0
      : mesin.bulatkan((agencyAmount * opsi.agencyTaxPct) / 100, opsi.decimalsBase)
  const taxAmount = pajakBaris + pajakAgency

  return {
    baris: terhitung,
    subtotal,
    basisPersen,
    perSeksi,
    agencyAmount,
    taxAmount,
    grandTotal: subtotal + agencyAmount + taxAmount,
    warnings,
    pelanggaran,
  }
}
