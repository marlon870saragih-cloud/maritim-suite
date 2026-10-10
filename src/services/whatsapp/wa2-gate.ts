// Gerbang WA-2a (Step 2C) — satu titik untuk seluruh service kontak/consent.
//
// Urutan disengaja (pola gerbang WA-1, tanpa mengubah WA-1):
//   1. requireAutomation(ctx): tenant di allowlist Automation (gagal → NOT_FOUND) lalu peran
//      ADMIN/MANAJER_OPERASI (gagal → FORBIDDEN).
//   2. Konteks sistem ditolak — jalur SYSTEM (STOP otomatis dari pesan masuk) baru dibuka WA-2c.
//   3. Flag WA2_CLIENT_FOUNDATION_ENABLED harus PERSIS "true"; NODE_ENV=production SELALU ditolak
//      di WA-2a (fondasi belum disetujui untuk produksi; migrasi 2B belum diterapkan di sana).
// `process.env` dibaca HANYA di gerbangWa2 → bacaKonfigurasiWa2 (fungsi murni, teruji).

import type { TenantContext } from '../context'
import { forbidden } from '../errors'
import { requireAutomation } from '../automation/access'
import { FLAG_WA2 } from './wa2-policy'

export type KonfigurasiWa2 = { aktif: true; alasan: null } | { aktif: false; alasan: 'WA2_DISABLED' | 'WA2_ENV_NOT_ALLOWED' }

/** Gagal tertutup. Produksi diperiksa PALING DULU dan tak bisa dibuka flag apa pun. */
export function bacaKonfigurasiWa2(env: Readonly<Record<string, string | undefined>>): KonfigurasiWa2 {
  if ((env.NODE_ENV ?? '').trim().toLowerCase() === 'production') return { aktif: false, alasan: 'WA2_ENV_NOT_ALLOWED' }
  if ((env[FLAG_WA2] ?? '').trim() !== 'true') return { aktif: false, alasan: 'WA2_DISABLED' }
  return { aktif: true, alasan: null }
}

export function gerbangWa2(ctx: TenantContext): void {
  requireAutomation(ctx)
  if (ctx.system) throw forbidden('Kontak/consent WhatsApp hanya dapat dikelola pengguna, bukan proses sistem.')
  const k = bacaKonfigurasiWa2(process.env)
  if (!k.aktif) throw forbidden(`Fondasi WhatsApp klien tidak aktif (${k.alasan}).`)
}
