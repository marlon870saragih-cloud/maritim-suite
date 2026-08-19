// Identitas PENJUAL Maritime Suite — SATU sumber, dipakai di dua tempat yang
// TIDAK BOLEH pernah beda: instruksi transfer manual (BillingPanel.tsx) dan
// kop kuitansi langganan (K164, Fase 8e).
//
// Maritime Suite dijual oleh PT Tribuana Solusi Maritim sendiri (pemilik app
// A) — bukan entitas terpisah. Berkas ini data biasa, TANPA impor apa pun dari
// `lib/pdf/` (yang mendaftarkan efek samping `@react-pdf/renderer` saat
// diimpor) supaya aman dipakai dari komponen klien (`BillingPanel.tsx`) apa
// adanya.

export const BANK_PENJUAL = {
  name: 'Bank Mandiri',
  account: '148-00-68812000',
  holder: 'PT Tribuana Solusi Maritim',
} as const

export const WA_PENJUAL = '6282154950193' // 0821-5495-0193

export const IDENTITAS_PENJUAL = {
  companyName: 'PT Tribuana Solusi Maritim',
  companyTagline: 'Maritime Suite — Ship Agency Operating System',
  companyAddress: 'Jl Abdul Azis Samad No 59B, Samarinda',
  companyEmail: 'adm@tribuanagency.co.id',
  bankName: BANK_PENJUAL.name,
  bankAccount: BANK_PENJUAL.account,
  bankHolder: BANK_PENJUAL.holder,
} as const
