import { SAMPLE_EPDA, type EpdaTenant } from './epda-data'

// Satu item temuan kerusakan.
export type DamageItem = {
  location: string // lokasi/objek (mis. Hatch No.2, Cargo, Fender berth)
  description: string // uraian kerusakan
  cause: string // dugaan penyebab
  severity: string // ringan / sedang / berat
  estimate: number // estimasi biaya (opsional, 0 = sembunyikan kolom nilai)
}

export type DamageData = {
  tenant: EpdaTenant
  docNumber: string
  date: string
  place: string
  // Kapal & call
  vesselName: string
  imo: string
  flag?: string
  port: string
  voyageNo?: string
  // Survei
  occasion: string // saat survei (mis. "On arrival / before discharge")
  surveyor: string // surveyor / pihak yang hadir
  attendedBy: string // pihak hadir lain (Master, Agent, Terminal)
  currency: string
  // Temuan
  items: DamageItem[]
  conclusion: string
  remarks: string
}

export const damageTotal = (d: DamageData) => (d.items ?? []).reduce((s, it) => s + (it.estimate || 0), 0)

// ====== DATA CONTOH ======
export const SAMPLE_DAMAGE: DamageData = {
  tenant: SAMPLE_EPDA.tenant,
  docNumber: 'DMG/2026/06/0131',
  date: '01 Jul 2026',
  place: 'Samarinda',
  vesselName: 'MT Soechi Asia',
  imo: '9456231',
  flag: 'Indonesia',
  port: 'Samarinda',
  voyageNo: 'V.118',
  occasion: 'On arrival, prior to commencement of cargo operations',
  surveyor: 'PT Surveyor Indonesia (independent surveyor)',
  attendedBy: 'Master, Chief Officer, Port Agent & Terminal Representative',
  currency: 'IDR',
  items: [
    { location: 'Manifold area (port side)', description: 'Paint scratches and minor dent on coaming', cause: 'Contact during berthing', severity: 'Ringan', estimate: 5_000_000 },
    { location: 'Berth fender No. 3', description: 'Rubber fender torn ±0.4 m', cause: 'Heavy contact at berthing', severity: 'Sedang', estimate: 25_000_000 },
    { location: 'Cargo hose connection', description: 'Gasket leak observed during connection', cause: 'Wear / improper seating', severity: 'Ringan', estimate: 1_500_000 },
  ],
  conclusion:
    'Damages as listed above were found and recorded jointly. The vessel is otherwise in seaworthy condition. ' +
    'Parties reserve their respective rights pending further assessment.',
  remarks: 'Foto-foto dan bukti pendukung terlampir terpisah.',
}
