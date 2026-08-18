// Kalender (K134, Fase 7h) — gabungan enam sumber, hanya-baca.

import { withTenant } from '@/services/http'
import { getKalender } from '@/services/ops/calendar.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
export const GET = withTenant(async (ctx, req) => {
  const q = new URL(req.url).searchParams
  return Response.json(await getKalender(ctx, q.get('from'), q.get('to')))
})
