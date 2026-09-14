// Akses Automation Hub (PRD-002 Step 5B) — menerapkan gate.ts ke TenantContext.
//
// Dua pagar, keduanya WAJIB, urutan disengaja:
//   1. Tenant diizinkan (flag + allowlist id). Gagal → NOT_FOUND: tenant lain
//      bahkan tak diberi tahu bahwa fitur ini ada.
//   2. Peran ADMIN / MANAJER_OPERASI. Gagal → FORBIDDEN.
// Konteks sistem (job terjadwal) melewati pagar peran, TIDAK melewati pagar tenant.

import type { TenantContext } from '../context'
import { forbidden, notFound } from '../errors'
import {
  bacaKonfigurasiAutomation,
  peranBolehAutomation,
  tenantBolehAutomation,
  type KonfigurasiAutomation,
} from './gate'

export function konfigurasiAutomation(): KonfigurasiAutomation {
  return bacaKonfigurasiAutomation(process.env)
}

/** Untuk layout/halaman server: tampilkan menu hanya bila KEDUA pagar lolos. */
export function bolehAksesAutomation(pengguna: { tenantId?: string | null; role?: string | null }): boolean {
  return tenantBolehAutomation(konfigurasiAutomation(), pengguna.tenantId) && peranBolehAutomation(pengguna.role)
}

export function requireAutomation(ctx: TenantContext): void {
  if (!tenantBolehAutomation(konfigurasiAutomation(), ctx.tenantId)) throw notFound('Automation Hub')
  if (!ctx.system && !peranBolehAutomation(ctx.role)) {
    throw forbidden('Automation Hub hanya untuk peran: ADMIN, MANAJER_OPERASI.')
  }
}
