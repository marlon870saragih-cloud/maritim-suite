// Tipe data untuk EPDA (Estimated Port Disbursement Account).
// Nantinya diisi dari DB: tenant (profil) + portCall/vessel + line items.

export type EpdaLineItem = {
  description: string
  basis?: string // sub-keterangan abu (mis. "per GT per call")
  qty?: string // mis. "8,432 GT", "1 call", "2 mov"
  rate?: number // tarif satuan (IDR); kosong = tampilkan strip
  amount: number // jumlah (IDR)
}

export type EpdaSection = {
  letter: string // A, B, C, D
  title: string
  items: EpdaLineItem[]
}

export type EpdaTenant = {
  companyName: string
  companyTagline?: string
  companyAddress?: string
  companyPhone?: string
  companyEmail?: string
  npwp?: string
  logoUrl?: string // data URL / URL gambar (opsional)
  bankName?: string
  bankAccount?: string
  bankHolder?: string
  bankSwift?: string
}

export type EpdaData = {
  tenant: EpdaTenant
  docNumber: string
  issuedAt: string
  validUntil: string
  currency: string
  // Partikular kapal & call
  vesselName: string
  principal: string
  imo: string
  flag: string
  port: string
  portCode: string
  gt: string
  nrt: string
  eta: string
  etd: string
  loa: string
  draft: string
  cargo: string
  // Isi
  sections: EpdaSection[]
  // Mode lump sum: sembunyikan rincian seksi → satu baris total disbursement.
  lumpSum?: boolean
  lumpSumDesc?: string
  lumpSumAmount?: number
  agencyPct: number // mis. 2.5
  usdRate?: number // kurs indikatif untuk catatan USD
  advanceReceived?: number // FPDA: dana muka yang sudah diterima (untuk hitung saldo)
  notes: string[]
  preparedByRole: string
  approvedByRole: string
}

// Hitung subtotal per seksi.
export const sectionSubtotal = (s: EpdaSection) =>
  s.items.reduce((sum, it) => sum + (it.amount || 0), 0)

// Hitung subtotal keseluruhan + agency handling + total.
export function computeTotals(d: EpdaData) {
  const subtotal = d.lumpSum
    ? Math.round(d.lumpSumAmount || 0)
    : d.sections.reduce((sum, s) => sum + sectionSubtotal(s), 0)
  const agencyAmount = Math.round((subtotal * d.agencyPct) / 100)
  const total = subtotal + agencyAmount
  const usd = d.usdRate ? Math.round(total / d.usdRate) : undefined
  return { subtotal, agencyAmount, total, usd }
}

// ====== DATA CONTOH (replika EPDA-Tribuana.pdf) — untuk verifikasi format ======
export const SAMPLE_EPDA: EpdaData = {
  tenant: {
    companyName: 'PT Tribuana Solusi Maritim',
    companyTagline: 'Shipping Agency · Liquid Cargo',
    companyAddress: 'Jl. Abdul Azis Samad No. 59B, Samarinda, Kalimantan Timur 75112',
    companyPhone: '+62 541 2226588',
    companyEmail: 'adm@tribuanagency.co.id',
    bankName: 'Bank Mandiri — Samarinda',
    bankAccount: '142-00-1234567-8',
    bankHolder: 'PT Tribuana Solusi Maritim',
    bankSwift: 'BMRIIDJA',
  },
  docNumber: 'EPDA/2026/06/0142',
  issuedAt: '22 Jun 2026',
  validUntil: '06 Jul 2026',
  currency: 'IDR',
  vesselName: 'MT Soechi Asia',
  principal: 'Soechi Lines, Jakarta',
  imo: '9456231',
  flag: 'Indonesia',
  port: 'Samarinda',
  portCode: 'IDSMR',
  gt: '8,432',
  nrt: '4,015',
  eta: '28 Jun',
  etd: '01 Jul 2026',
  loa: '112.5 m',
  draft: '6.8 m',
  cargo: 'MGO 6,000 KL — Discharge',
  agencyPct: 2.5,
  usdRate: 16270,
  sections: [
    {
      letter: 'A',
      title: 'Port Authority & Government Charges',
      items: [
        { description: 'Anchorage dues (labuh)', basis: 'per GT per call', qty: '8,432 GT', rate: 75, amount: 632400 },
        { description: 'Berthing dues (tambat)', basis: 'per GT per etmal × 3', qty: '8,432 GT', rate: 120, amount: 3035520 },
        { description: 'Light & navigation dues (rambu)', qty: '8,432 GT', rate: 55, amount: 463760 },
        { description: 'VTS / port service charge', qty: '1 call', rate: 2500000, amount: 2500000 },
      ],
    },
    {
      letter: 'B',
      title: 'Pilotage, Towage & Mooring',
      items: [
        { description: 'Pilotage in & out (pandu)', basis: '2 movements', qty: '2 mov', rate: 4750000, amount: 9500000 },
        { description: 'Tug assistance (tunda)', basis: '2 tugs × 2 movements', qty: '4 unit', rate: 6250000, amount: 25000000 },
        { description: 'Mooring gang (kepil)', qty: '2 mov', rate: 1800000, amount: 3600000 },
      ],
    },
    {
      letter: 'C',
      title: 'Clearance & Documentation',
      items: [
        { description: 'Customs, Immigration & Quarantine (CIQP)', basis: 'in & out', rate: 3500000, amount: 3500000 },
        { description: 'Harbour master clearance (SPB)', qty: '1 set', rate: 1250000, amount: 1250000 },
        { description: 'Documentation & cabotage report', qty: '1 set', rate: 900000, amount: 900000 },
      ],
    },
    {
      letter: 'D',
      title: 'Agency & Disbursements',
      items: [
        { description: 'Agency fee', basis: 'per GT scale, min. applied', qty: 'lump sum', rate: 12500000, amount: 12500000 },
        { description: 'Boat hire & transportation', qty: '3 days', rate: 1500000, amount: 4500000 },
        { description: 'Communication, bank & sundries', qty: 'est.', rate: 2000000, amount: 2000000 },
      ],
    },
  ],
  notes: [
    'This is a proforma estimate; actual charges will be billed in the Final Disbursement Account (FDA) supported by original receipts.',
    'Figures are based on declared particulars & an estimated stay of 3 days. Overstay, shifting, or schedule changes are charged separately.',
    "Funds in full are requested prior to the vessel's arrival to ensure uninterrupted service.",
    'Government tariffs follow PP/PM rates prevailing at the time of the call.',
  ],
  preparedByRole: 'Operations Department',
  approvedByRole: 'Branch Manager',
}

// ====== DATA CONTOH FPDA (Final Disbursement Account) ======
// Struktur sama dengan EPDA + dana muka (advance) untuk menghitung saldo akhir.
export const SAMPLE_FPDA: EpdaData = {
  ...SAMPLE_EPDA,
  sections: JSON.parse(JSON.stringify(SAMPLE_EPDA.sections)),
  docNumber: 'FDA/2026/07/0142',
  issuedAt: '03 Jul 2026',
  validUntil: '17 Jul 2026',
  advanceReceived: 70000000,
  notes: [
    'This Final Disbursement Account reflects actual charges incurred, supported by original receipts available on request.',
    'Figures supersede the proforma estimate (EPDA); differences arise from actual port stay & tariffs applied.',
    'Balance due is payable within 14 days; any overpayment is refunded to the principal.',
    'Government tariffs applied follow PP/PM rates prevailing at the time of the call.',
  ],
}
