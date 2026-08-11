// Variance EPDA vs FDA — MURNI, tanpa impor nilai (K46, §9).
//
// Dihitung saat diminta, TIDAK disimpan: tak ada kolomnya di skema, dan menyimpan
// angka turunan uang menjamin ada dua versi kebenaran.
//
// Semua dalam `baseCurrency` — pasangan baris bisa beda mata uang, dan hanya
// `amountBase` yang bisa dibandingkan dengan arti.

export type ItemVariance = {
  id: string
  /** Rantai K40. Pada item FDA: menunjuk baris EPDA padanannya. */
  sourceItemId: string | null
  description: string
  sectionLetter: string | null
  amountBase: number
}

export type StatusVariance =
  | 'SAMA'
  | 'BERUBAH'
  /** Baris FDA tanpa padanan EPDA — biaya aktual yang tak diestimasi (K45). */
  | 'TAK_DIANGGARKAN'
  /** Baris EPDA tanpa keturunan di FDA — diestimasi tapi tidak terjadi (K46). */
  | 'TIDAK_TEREALISASI'

export type BarisVariance = {
  status: StatusVariance
  epda: ItemVariance | null
  fda: ItemVariance | null
  description: string
  sectionLetter: string | null
  epdaBase: number
  fdaBase: number
  varianceBase: number
  /** `null` bila basis 0 — jangan cetak `Infinity`, jangan cetak 0 (dua-duanya bohong). */
  variancePct: number | null
}

export type HeaderVariance = {
  subtotal: number
  agencyAmount: number
  taxAmount: number
  grandTotal: number
}

export type RingkasanVariance = {
  epdaBase: number
  fdaBase: number
  varianceBase: number
  variancePct: number | null
  jumlah: Readonly<Record<StatusVariance, number>>
}

export type HasilVariance = {
  /** Urut `|varianceBase|` menurun (K46) — tanpa penilaian merah/hijau sampai P12 dijawab. */
  baris: BarisVariance[]
  ringkasan: RingkasanVariance
  header: readonly { field: keyof HeaderVariance; epda: number; fda: number; variance: number }[]
}

const persen = (variance: number, basis: number): number | null =>
  basis === 0 ? null : (variance / basis) * 100

const FIELD_HEADER = ['subtotal', 'agencyAmount', 'taxAmount', 'grandTotal'] as const

export function hitungVariance(
  itemEpda: readonly ItemVariance[],
  itemFda: readonly ItemVariance[],
  headerEpda?: HeaderVariance,
  headerFda?: HeaderVariance,
): HasilVariance {
  const petaEpda = new Map(itemEpda.map((i) => [i.id, i]))
  const terpakai = new Set<string>()
  const baris: BarisVariance[] = []

  for (const fda of itemFda) {
    const epda = fda.sourceItemId === null ? undefined : petaEpda.get(fda.sourceItemId)
    if (!epda) {
      baris.push({
        status: 'TAK_DIANGGARKAN',
        epda: null,
        fda,
        description: fda.description,
        sectionLetter: fda.sectionLetter,
        epdaBase: 0,
        fdaBase: fda.amountBase,
        varianceBase: fda.amountBase,
        variancePct: null,
      })
      continue
    }
    terpakai.add(epda.id)
    const varianceBase = fda.amountBase - epda.amountBase
    baris.push({
      status: varianceBase === 0 ? 'SAMA' : 'BERUBAH',
      epda,
      fda,
      description: fda.description,
      sectionLetter: fda.sectionLetter ?? epda.sectionLetter,
      epdaBase: epda.amountBase,
      fdaBase: fda.amountBase,
      varianceBase,
      variancePct: persen(varianceBase, epda.amountBase),
    })
  }

  // Wajib ikut ditampilkan: kalau tidak, jasa yang diestimasi tapi tidak terjadi
  // hilang tanpa jejak dan total variance tidak berjumlah (K46).
  for (const epda of itemEpda) {
    if (terpakai.has(epda.id)) continue
    baris.push({
      status: 'TIDAK_TEREALISASI',
      epda,
      fda: null,
      description: epda.description,
      sectionLetter: epda.sectionLetter,
      epdaBase: epda.amountBase,
      fdaBase: 0,
      varianceBase: -epda.amountBase,
      variancePct: persen(-epda.amountBase, epda.amountBase),
    })
  }

  baris.sort((a, b) => Math.abs(b.varianceBase) - Math.abs(a.varianceBase))

  const jumlah: Record<StatusVariance, number> = {
    SAMA: 0,
    BERUBAH: 0,
    TAK_DIANGGARKAN: 0,
    TIDAK_TEREALISASI: 0,
  }
  for (const b of baris) jumlah[b.status] += 1

  const epdaBase = baris.reduce((j, b) => j + b.epdaBase, 0)
  const fdaBase = baris.reduce((j, b) => j + b.fdaBase, 0)
  const varianceBase = baris.reduce((j, b) => j + b.varianceBase, 0)

  const header =
    headerEpda && headerFda
      ? FIELD_HEADER.map((f) => ({
          field: f,
          epda: headerEpda[f],
          fda: headerFda[f],
          variance: headerFda[f] - headerEpda[f],
        }))
      : []

  return {
    baris,
    ringkasan: { epdaBase, fdaBase, varianceBase, variancePct: persen(varianceBase, epdaBase), jumlah },
    header,
  }
}
