// Onboarding wizard (K151-K154, Fase 8b) — enam langkah, SEMUA boleh
// dilewati (K152): wizard adalah tawaran, bukan gerbang. Kemajuan disimpan
// di `Tenant.onboardingState` (server, K152 — bukan localStorage, supaya
// bertahan lintas perangkat & reload).

import type { Role } from '@prisma/client'
import type { TenantContext } from '../context'
import { requireRole, systemContext } from '../context'
import { forTenant } from '../tenant-db'
import { notFound, validation } from '../errors'
import { seedTenant, type HasilSeed } from './seed-data'
// Fase 8j — pemakaian (K183/K184): di langkah mana onboarding berhenti.
import { catatPemakaian } from './usage.service'

export const LANGKAH_ONBOARDING = [
  'PROFIL',
  'MATA_UANG',
  'PELABUHAN',
  'KATALOG_JASA',
  'UNDANG_REKAN',
  'KAPAL_PERTAMA',
] as const
export type LangkahOnboarding = (typeof LANGKAH_ONBOARDING)[number]

type OnboardingStateJson = {
  selesai?: LangkahOnboarding[]
  dilewati?: boolean
  diseedPada?: string
}

function bacaState(raw: unknown): OnboardingStateJson {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as OnboardingStateJson
  return {}
}

export type StatusLangkah = { langkah: LangkahOnboarding; selesai: boolean }
export type OnboardingStatus = {
  dilewati: boolean
  semuaSelesai: boolean
  sudahDiseed: boolean
  langkah: StatusLangkah[]
}

function ringkas(state: OnboardingStateJson): OnboardingStatus {
  const selesai = new Set(state.selesai ?? [])
  return {
    dilewati: !!state.dilewati,
    semuaSelesai: LANGKAH_ONBOARDING.every((l) => selesai.has(l)),
    sudahDiseed: !!state.diseedPada,
    langkah: LANGKAH_ONBOARDING.map((l) => ({ langkah: l, selesai: selesai.has(l) })),
  }
}

/** K152 tabel peran — "Melihat kartu kemajuan onboarding" terbuka untuk SEMUA peran. */
export async function getOnboardingStatus(ctx: TenantContext): Promise<OnboardingStatus> {
  const tenant = await forTenant(ctx).tenant.findFirst({
    where: { id: ctx.tenantId },
    select: { onboardingState: true },
  })
  if (!tenant) throw notFound('Tenant')
  return ringkas(bacaState(tenant.onboardingState))
}

/** K152 tabel peran — "Menjalankan langkah wizard" & "Mengundang rekan kerja" ADMIN saja. */
const PERAN_KELOLA_ONBOARDING: readonly Role[] = ['ADMIN']

async function simpanState(ctx: TenantContext, ubah: (s: OnboardingStateJson) => OnboardingStateJson) {
  const db = forTenant(ctx)
  const tenant = await db.tenant.findFirst({ where: { id: ctx.tenantId }, select: { onboardingState: true } })
  if (!tenant) throw notFound('Tenant')
  const baru = ubah(bacaState(tenant.onboardingState))
  await db.tenant.updateMany({ where: { id: ctx.tenantId }, data: { onboardingState: baru } })
  return ringkas(baru)
}

export async function completeStep(ctx: TenantContext, langkah: unknown): Promise<OnboardingStatus> {
  requireRole(ctx, ...PERAN_KELOLA_ONBOARDING)
  if (typeof langkah !== 'string' || !(LANGKAH_ONBOARDING as readonly string[]).includes(langkah)) {
    throw validation(`Langkah tidak sah. Pilihan: ${LANGKAH_ONBOARDING.join(', ')}.`)
  }
  const hasil = await simpanState(ctx, (s) => {
    const selesai = new Set(s.selesai ?? [])
    selesai.add(langkah as LangkahOnboarding)
    return { ...s, selesai: Array.from(selesai) }
  })
  // Fase 8j / K183 — satu baris per langkah selesai; distribusi `meta.langkah`
  // lintas tenant menjawab "di langkah mana onboarding paling sering berhenti".
  await catatPemakaian(ctx, 'ONBOARDING_STEP_DONE', { langkah })
  return hasil
}

/** K152 — "Lewati semua langkah → aplikasi tetap bisa dipakai penuh; kartu
 * hilang; onboardingState mencatat 'dilewati', bukan 'selesai'." Sengaja
 * TIDAK menandai semua langkah sebagai selesai satu-satu — dilewati adalah
 * keadaan berbeda dari selesai, keduanya harus bisa dibedakan di data. */
export async function skipOnboarding(ctx: TenantContext): Promise<OnboardingStatus> {
  requireRole(ctx, ...PERAN_KELOLA_ONBOARDING)
  return simpanState(ctx, (s) => ({ ...s, dilewati: true }))
}

/**
 * K153 — penyemaian awal. Idempoten (aman dipanggil berkali-kali — lihat
 * seed-data.ts). Dipanggil OTOMATIS sekali oleh `/api/auth/register`
 * (K151/2) lewat `systemContext(tenantId)`, dan boleh juga dipicu ULANG
 * manual dari langkah "Katalog jasa & tarif" (K152/4) — mis. kalau
 * penyemaian awal gagal, atau tenant ingin menyalin template lagi.
 *
 * SENGAJA menerima `tenantId` polos (bukan `TenantContext`) dan membangun
 * `systemContext` sendiri di dalam — penyemaian adalah aksi SISTEM yang
 * berjalan atas nama tenant baru, bukan tindakan staf yang perlu dipagari
 * peran (staf yang memicu ulang dari UI tetap lewat route ber-ADMIN-gate;
 * fungsi ini sendiri tidak menuntut peran apa pun, cocok dipanggil dari
 * konteks pendaftaran yang belum punya sesi staf sama sekali).
 */
export async function seedTenantOnboarding(tenantId: string): Promise<HasilSeed> {
  const ctx = systemContext(tenantId)
  const db = forTenant(ctx)
  const hasil = await seedTenant(db, tenantId)
  await simpanState(ctx, (s) => ({ ...s, diseedPada: s.diseedPada ?? new Date().toISOString() }))
  return hasil
}

/** K152/4 — pemicu ULANG manual dari langkah "Katalog jasa & tarif", lewat sesi
 * staf sungguhan (bukan pendaftaran). ADMIN saja, sejalan PERAN_KELOLA_ONBOARDING. */
export async function seedTenantOnboardingManual(ctx: TenantContext): Promise<HasilSeed> {
  requireRole(ctx, ...PERAN_KELOLA_ONBOARDING)
  return seedTenantOnboarding(ctx.tenantId)
}
