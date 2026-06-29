import { SAMPLE_EPDA, type EpdaTenant } from './epda-data'

// Satu baris perhitungan waktu (periode) pada Time Sheet / Laytime Statement.
export type TimeSheetRow = {
  date: string // "30 Jun 2026"
  fromTime: string // "08:00"
  toTime: string // "12:00"
  description: string
  percent: number // % laytime dihitung (100 = penuh, 50 = setengah, 0 = dikecualikan)
}

export type TimeSheetData = {
  tenant: EpdaTenant
  docNumber: string
  date: string
  // Kapal & call
  vesselName: string
  imo: string
  flag?: string
  port: string
  voyageNo?: string
  operation: string // 'Loading' | 'Discharging'
  cargo: string
  cargoQty?: string
  charterer: string // ditujukan kepada
  // Syarat laytime
  currency: string
  laytimeAllowedHours: number // laytime diizinkan (jam)
  demurrageRate: number // per hari (over)
  despatchRate: number // per hari (saved) — umumnya ½ demurrage
  norTendered: string // "30 Jun 2026 08:30"
  laytimeCommenced: string
  // Perincian waktu
  rows: TimeSheetRow[]
  remarks: string
}

const parseHM = (s: string): number => {
  const m = (s || '').trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return NaN
  return Number(m[1]) + Number(m[2]) / 60
}

/** Jam dihitung untuk satu baris (memperhitungkan lewat tengah malam & persentase). */
export function rowCountedHours(r: TimeSheetRow): number {
  const a = parseHM(r.fromTime)
  const b = parseHM(r.toTime)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  let dur = b - a
  if (dur < 0) dur += 24
  const pct = Number.isFinite(r.percent) ? r.percent : 100
  return (dur * pct) / 100
}

export type LaytimeResult = {
  usedHours: number
  allowedHours: number
  balanceHours: number // + = despatch (hemat), − = demurrage (over)
  kind: 'DEMURRAGE' | 'DESPATCH' | 'EVEN'
  days: number // jumlah hari demurrage/despatch (positif)
  amount: number
}

/** Hitung laytime terpakai vs diizinkan → demurrage / despatch. */
export function computeLaytime(d: TimeSheetData): LaytimeResult {
  const usedHours = (d.rows ?? []).reduce((s, r) => s + rowCountedHours(r), 0)
  const allowedHours = Number.isFinite(d.laytimeAllowedHours) ? d.laytimeAllowedHours : 0
  const balanceHours = allowedHours - usedHours
  if (Math.abs(balanceHours) < 1e-9) {
    return { usedHours, allowedHours, balanceHours: 0, kind: 'EVEN', days: 0, amount: 0 }
  }
  const over = balanceHours < 0
  const days = Math.abs(balanceHours) / 24
  const rate = over ? d.demurrageRate : d.despatchRate
  return {
    usedHours,
    allowedHours,
    balanceHours,
    kind: over ? 'DEMURRAGE' : 'DESPATCH',
    days,
    amount: Math.round(days * (rate || 0)),
  }
}

// ====== DATA CONTOH ======
export const SAMPLE_TIMESHEET: TimeSheetData = {
  tenant: SAMPLE_EPDA.tenant,
  docNumber: 'TS/2026/06/0101',
  date: '02 Jul 2026',
  vesselName: 'MT Soechi Asia',
  imo: '9456231',
  flag: 'Indonesia',
  port: 'Samarinda',
  voyageNo: 'V.118',
  operation: 'Loading',
  cargo: 'MGO',
  cargoQty: '6,000 KL',
  charterer: 'PT Soechi Lines Tbk',
  currency: 'USD',
  laytimeAllowedHours: 36,
  demurrageRate: 12000,
  despatchRate: 6000,
  norTendered: '30 Jun 2026 08:30',
  laytimeCommenced: '30 Jun 2026 14:30',
  rows: [
    { date: '30 Jun 2026', fromTime: '14:30', toTime: '24:00', description: 'Loading in progress', percent: 100 },
    { date: '01 Jul 2026', fromTime: '00:00', toTime: '06:00', description: 'Rain stoppage (excepted)', percent: 0 },
    { date: '01 Jul 2026', fromTime: '06:00', toTime: '18:00', description: 'Loading in progress', percent: 100 },
    { date: '01 Jul 2026', fromTime: '18:00', toTime: '20:00', description: 'Awaiting shore tank (half rate)', percent: 50 },
  ],
  remarks: 'Perhitungan sesuai Charter Party. Waktu hujan dikecualikan dari laytime.',
}
