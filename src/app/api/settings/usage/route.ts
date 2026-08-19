// Ringkasan pemakaian tenant sendiri (K184) — baca-saja, terbuka untuk semua
// peran. Pola sama /api/quota (K156): ini informasi tentang perusahaan
// sendiri, bukan data operasional.

import { withTenant } from '@/services/http'
import { ringkasanPemakaian } from '@/services/saas/usage.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withTenant(async (ctx) => {
  return Response.json(await ringkasanPemakaian(ctx))
})
