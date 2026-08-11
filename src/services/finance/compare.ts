// Bandingkan dua versi dokumen — MURNI, tanpa impor nilai (K39, §7).
//
// Diff dihitung SAAT DIMINTA dan tidak pernah disimpan: diff yang disimpan pasti
// melenceng dari kenyataan begitu ada yang mengedit; diff yang dihitung tak bisa
// berbohong. Karena itu tak ada kolom diff di skema, dan tak boleh ada.
//
// Kunci pencocokan = rantai `sourceItemId` (K40: "baris asal tempat baris ini
// disalin"). Item versi N menunjuk pendahulunya di versi N−1.

export type ItemBanding = {
  id: string
  sourceItemId: string | null
  description: string
  quantity: number
  unitPrice: number
  currency: string
  exchangeRate: number
  amount: number
  amountBase: number
  vendorId: string | null
}

/** Field yang membuat sebuah baris dianggap `BERUBAH` (K39). */
export const FIELD_DIBANDINGKAN = [
  'quantity',
  'unitPrice',
  'currency',
  'exchangeRate',
  'amount',
  'amountBase',
  'description',
  'vendorId',
] as const

export type FieldBanding = (typeof FIELD_DIBANDINGKAN)[number]

export type StatusDiff = 'BARU' | 'DIHAPUS' | 'BERUBAH' | 'SAMA'

export type BarisDiff = {
  status: StatusDiff
  lama: ItemBanding | null
  baru: ItemBanding | null
  fieldBerubah: readonly FieldBanding[]
}

export type HeaderBanding = {
  agencyPct: number
  subtotal: number
  agencyAmount: number
  taxAmount: number
  grandTotal: number
}

export type DiffHeader = { field: keyof HeaderBanding; lama: number; baru: number; delta: number }

export type HasilBanding = {
  baris: BarisDiff[]
  header: DiffHeader[]
  ringkasan: Readonly<Record<StatusDiff, number>>
}

const FIELD_HEADER = ['agencyPct', 'subtotal', 'agencyAmount', 'taxAmount', 'grandTotal'] as const

export function bandingkanVersi(
  itemLama: readonly ItemBanding[],
  itemBaru: readonly ItemBanding[],
  headerLama?: HeaderBanding,
  headerBaru?: HeaderBanding,
): HasilBanding {
  const petaLama = new Map(itemLama.map((i) => [i.id, i]))
  const terpakai = new Set<string>()
  const baris: BarisDiff[] = []

  for (const baru of itemBaru) {
    const lama = baru.sourceItemId === null ? undefined : petaLama.get(baru.sourceItemId)
    if (!lama) {
      baris.push({ status: 'BARU', lama: null, baru, fieldBerubah: [] })
      continue
    }
    terpakai.add(lama.id)
    const fieldBerubah = FIELD_DIBANDINGKAN.filter((f) => lama[f] !== baru[f])
    baris.push({
      status: fieldBerubah.length === 0 ? 'SAMA' : 'BERUBAH',
      lama,
      baru,
      fieldBerubah,
    })
  }

  for (const lama of itemLama) {
    if (!terpakai.has(lama.id)) {
      baris.push({ status: 'DIHAPUS', lama, baru: null, fieldBerubah: [] })
    }
  }

  const header: DiffHeader[] = []
  if (headerLama && headerBaru) {
    for (const f of FIELD_HEADER) {
      header.push({ field: f, lama: headerLama[f], baru: headerBaru[f], delta: headerBaru[f] - headerLama[f] })
    }
  }

  const ringkasan: Record<StatusDiff, number> = { BARU: 0, DIHAPUS: 0, BERUBAH: 0, SAMA: 0 }
  for (const b of baris) ringkasan[b.status] += 1

  return { baris, header, ringkasan }
}
