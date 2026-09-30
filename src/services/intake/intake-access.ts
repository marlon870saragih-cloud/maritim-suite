// Akses Vessel Call Intake (PRD-004 Step 3) — gerbang intake DI ATAS gerbang Automation Hub.
//
// Urutan disengaja:
//   1. Flag VESSEL_CALL_INTAKE_ENABLED mati / konfigurasi tak sah → NOT_FOUND (fitur tak terungkap).
//   2. requireAutomation: tenant di luar allowlist → NOT_FOUND; peran selain
//      ADMIN/MANAJER_OPERASI (termasuk OPERATOR, D3) → FORBIDDEN.
//   3. PRD-005 Step 3B (owner Q4) — TAH_INTAKE_MODEL: tak diset/kosong → perilaku lama.
//      DISET tapi tak menunjuk model VERIFIED di peta kemampuan → seluruh intake GAGAL
//      TERTUTUP (NOT_FOUND, details.code MODEL_TIDAK_TERVERIFIKASI), TANPA fallback ke
//      OPENROUTER_SPK_MODEL. Diperiksa SETELAH pagar tenant/peran supaya kode
//      konfigurasi hanya terlihat oleh pengguna yang memang berhak atas fitur ini.
// Konteks sistem TIDAK dipakai intake: setiap tindakan milik manusia yang nyata.

import type { TenantContext } from '../context'
import { ServiceError, forbidden, notFound } from '../errors'
import { bolehAksesAutomation, requireAutomation } from '../automation/access'
import { resolusiModelIntake, type ResolusiModel } from '@/lib/ai/model-capabilities'
import { bacaKonfigurasiIntake, type KonfigurasiIntake } from './intake-gate'

export function konfigurasiIntake(): KonfigurasiIntake {
  return bacaKonfigurasiIntake(process.env)
}

/** Resolusi TAH_INTAKE_MODEL saat ini (Q4). */
export function modelIntake(): ResolusiModel {
  return resolusiModelIntake(process.env)
}

/** Untuk layout/halaman server: menu & halaman intake hanya bila semua pagar lolos. */
export function bolehAksesIntake(pengguna: { tenantId?: string | null; role?: string | null }): boolean {
  return konfigurasiIntake().aktif && modelIntake().aktif && bolehAksesAutomation(pengguna)
}

export function requireIntake(ctx: TenantContext): KonfigurasiIntake {
  const k = konfigurasiIntake()
  if (!k.aktif) throw notFound('Vessel Call Intake')
  requireAutomation(ctx)
  if (ctx.system) throw forbidden('Vessel Call Intake hanya untuk pengguna manusia.')
  const m = modelIntake()
  if (!m.aktif) {
    // Kode saja di log — nilai setelan tidak dicetak.
    console.error('[intake] TAH_INTAKE_MODEL tidak terverifikasi — intake ditutup', { kode: m.alasan, detail: m.detail })
    throw new ServiceError('NOT_FOUND', 'Vessel Call Intake tidak tersedia: model AI yang dikonfigurasi belum terverifikasi.', {
      code: 'MODEL_TIDAK_TERVERIFIKASI',
    })
  }
  return k
}
