import { SAMPLE_EPDA, type EpdaTenant } from './epda-data'

// Satu baris pengukuran tangki.
export type UllageTank = {
  tank: string // No.1 P, No.1 S, Slop, …
  ullage: string // ullage terbaca (mis. "1.85 m")
  tempC: string // suhu (°C)
  volumeM3: number // volume teramati dari tabel kalibrasi kapal (m³)
}

export type UllageData = {
  tenant: EpdaTenant
  docNumber: string
  date: string
  // Kapal & call
  vesselName: string
  imo: string
  flag?: string
  port: string
  voyageNo?: string
  // Survei kargo
  product: string // jenis kargo cair
  condition: string // "Before loading" | "After loading" | "On arrival"
  densityKgL: number // densitas @15°C (kg/L) untuk konversi MT
  tanks: UllageTank[]
  surveyor: string
  remarks: string
}

export const ullageTotalVolume = (d: UllageData) => (d.tanks ?? []).reduce((s, t) => s + (t.volumeM3 || 0), 0)
// MT = m³ × densitas(kg/L)  (1 m³ × 1 kg/L = 1 MT)
export const ullageTotalMt = (d: UllageData) => Math.round(ullageTotalVolume(d) * (d.densityKgL || 0) * 1000) / 1000

// ====== DATA CONTOH ======
export const SAMPLE_ULLAGE: UllageData = {
  tenant: SAMPLE_EPDA.tenant,
  docNumber: 'ULL/2026/06/0141',
  date: '01 Jul 2026',
  vesselName: 'MT Soechi Asia',
  imo: '9456231',
  flag: 'Indonesia',
  port: 'Samarinda',
  voyageNo: 'V.118',
  product: 'MGO (Marine Gas Oil)',
  condition: 'After loading',
  densityKgL: 0.86,
  tanks: [
    { tank: 'No.1 Port', ullage: '1.85 m', tempC: '31.5', volumeM3: 1450.5 },
    { tank: 'No.1 Stbd', ullage: '1.88 m', tempC: '31.4', volumeM3: 1448.2 },
    { tank: 'No.2 Port', ullage: '1.92 m', tempC: '31.6', volumeM3: 1672.0 },
    { tank: 'No.2 Stbd', ullage: '1.90 m', tempC: '31.5', volumeM3: 1675.3 },
    { tank: 'Slop Port', ullage: '4.20 m', tempC: '31.2', volumeM3: 120.0 },
  ],
  surveyor: 'PT Surveyor Indonesia',
  remarks: 'Pengukuran dilakukan bersama Chief Officer. Volume teramati dari tabel kalibrasi kapal.',
}
