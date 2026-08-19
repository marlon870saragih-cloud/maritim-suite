// Status backup terakhir (K186) — ADMIN & DIREKTUR (tabel peran §11).
//
// `statusBackup()` sendiri tak menerima TenantContext (SystemConfig bukan
// tabel bertenant), jadi pagar perannya dipasang DI SINI — satu-satunya
// tempat yang tahu siapa pemanggilnya.

import { withTenant } from '@/services/http'
import { requireRole } from '@/services/context'
import { statusBackup } from '@/services/saas/backup-status.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withTenant(async (ctx) => {
  requireRole(ctx, 'ADMIN', 'DIREKTUR')
  return Response.json(await statusBackup())
})
