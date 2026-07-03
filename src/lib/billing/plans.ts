// Sumber kebenaran harga langganan — SELALU di server.
// JANGAN pernah percaya angka (gross_amount) yang dikirim dari browser;
// checkout hanya menerima `planId` + pilihan modul, harga & modul final dihitung di sini.
import type { Plan } from '@prisma/client'

export type BillingModule = 'finance' | 'dokumen' | 'portcall' | 'tracker'

// Port Call Manager WAJIB di semua paket. Sisanya dipilih user sesuai kuota paket.
export const MANDATORY_MODULES: BillingModule[] = ['portcall']

export const BILLING_MODULES: {
  id: BillingModule
  labelId: string
  labelEn: string
  mandatory: boolean
}[] = [
  { id: 'portcall', labelId: 'Port Call Manager', labelEn: 'Port Call Manager', mandatory: true },
  { id: 'finance', labelId: 'Finance Generator', labelEn: 'Finance Generator', mandatory: false },
  { id: 'dokumen', labelId: 'Maritime Dokumen', labelEn: 'Maritime Documents', mandatory: false },
  { id: 'tracker', labelId: 'DA & Invoice Tracker', labelEn: 'DA & Invoice Tracker', mandatory: false },
]

// Modul yang bisa dipilih user (semua kecuali yang wajib).
export const CHOOSABLE_MODULES: BillingModule[] = BILLING_MODULES.filter((m) => !m.mandatory).map(
  (m) => m.id,
)

export interface BillingPlan {
  id: string // dipakai di order_id & request checkout
  plan: Plan // enum Prisma yang dipetakan
  priceIDR: number // gross_amount ke Midtrans — integer, tanpa desimal
  choiceCount: number // jumlah modul PILIHAN (di luar yang wajib) yang boleh dipilih
  labelId: string
  labelEn: string
}

export const BILLING_PLANS: Record<string, BillingPlan> = {
  // Port Call (wajib) + 1 pilihan = 2 modul total.
  m1: { id: 'm1', plan: 'STARTER', priceIDR: 250_000, choiceCount: 1, labelId: '2 Modul', labelEn: '2 Modules' },
  // Port Call (wajib) + 2 pilihan = 3 modul total.
  m2: { id: 'm2', plan: 'PRO', priceIDR: 450_000, choiceCount: 2, labelId: '3 Modul', labelEn: '3 Modules' },
  // Semua modul aktif.
  all: { id: 'all', plan: 'FULL_SUITE', priceIDR: 600_000, choiceCount: CHOOSABLE_MODULES.length, labelId: 'Semua Modul', labelEn: 'All Modules' },
}

// Jumlah modul total (wajib + pilihan) — untuk tampilan.
export function planModuleCount(plan: BillingPlan): number {
  return MANDATORY_MODULES.length + plan.choiceCount
}

// Apakah paket ini butuh user memilih modul (bukan paket "semua").
export function planNeedsChoice(plan: BillingPlan): boolean {
  return plan.choiceCount < CHOOSABLE_MODULES.length
}

// Langganan berlaku 30 hari sejak pembayaran terkonfirmasi (bayar sekali, perpanjang manual).
export const SUBSCRIPTION_DAYS = 30

export function getBillingPlan(id: string): BillingPlan | null {
  return BILLING_PLANS[id] ?? null
}

// Bangun daftar modul final: [modul wajib, ...pilihan valid].
// `chosen` = modul PILIHAN dari user (tanpa yang wajib). null bila tidak valid.
export function resolveModules(plan: BillingPlan, chosen: string[] | undefined): BillingModule[] | null {
  // Paket "semua" → semua modul, abaikan pilihan.
  if (!planNeedsChoice(plan)) return [...MANDATORY_MODULES, ...CHOOSABLE_MODULES]

  if (!Array.isArray(chosen)) return null
  const unique = Array.from(new Set(chosen)) as BillingModule[]
  if (unique.length !== plan.choiceCount) return null
  if (!unique.every((m) => CHOOSABLE_MODULES.includes(m))) return null
  return [...MANDATORY_MODULES, ...unique]
}
