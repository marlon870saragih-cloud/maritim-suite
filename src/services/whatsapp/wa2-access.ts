// WA-2a 2a-G — pagar akses boolean untuk halaman server (wa2-gate.ts beku, tidak diubah).
//
// true  = gerbangWa2(ctx) lolos (tenant di allowlist Automation, ADMIN/MANAJER_OPERASI, bukan konteks sistem,
//         flag WA2_CLIENT_FOUNDATION_ENABLED aktif, bukan produksi).
// false = gerbang menolak dengan ServiceError (halaman memanggil notFound()). Galat lain diteruskan.

import type { TenantContext } from '../context'
import { ServiceError } from '../errors'
import { gerbangWa2 } from './wa2-gate'

export function bolehAksesWa2(ctx: TenantContext): boolean {
  try {
    gerbangWa2(ctx)
    return true
  } catch (e) {
    if (e instanceof ServiceError) return false
    throw e
  }
}
