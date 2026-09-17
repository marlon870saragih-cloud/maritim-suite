// Akses Vessel Call Intake (PRD-004 Step 3) — gerbang intake DI ATAS gerbang Automation Hub.
//
// Urutan disengaja:
//   1. Flag VESSEL_CALL_INTAKE_ENABLED mati / konfigurasi tak sah → NOT_FOUND (fitur tak terungkap).
//   2. requireAutomation: tenant di luar allowlist → NOT_FOUND; peran selain
//      ADMIN/MANAJER_OPERASI (termasuk OPERATOR, D3) → FORBIDDEN.
// Konteks sistem TIDAK dipakai intake: setiap tindakan milik manusia yang nyata.

import type { TenantContext } from '../context'
import { forbidden, notFound } from '../errors'
import { bolehAksesAutomation, requireAutomation } from '../automation/access'
import { bacaKonfigurasiIntake, type KonfigurasiIntake } from './intake-gate'

export function konfigurasiIntake(): KonfigurasiIntake {
  return bacaKonfigurasiIntake(process.env)
}

/** Untuk layout/halaman server: menu & halaman intake hanya bila semua pagar lolos. */
export function bolehAksesIntake(pengguna: { tenantId?: string | null; role?: string | null }): boolean {
  return konfigurasiIntake().aktif && bolehAksesAutomation(pengguna)
}

export function requireIntake(ctx: TenantContext): KonfigurasiIntake {
  const k = konfigurasiIntake()
  if (!k.aktif) throw notFound('Vessel Call Intake')
  requireAutomation(ctx)
  if (ctx.system) throw forbidden('Vessel Call Intake hanya untuk pengguna manusia.')
  return k
}
