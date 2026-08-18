// Timeline satu voyage (K131, Fase 7g) — delapan sumber digabung, hanya-baca (K132).

import { withTenant } from '@/services/http'
import { buildTimeline } from '@/services/ops/timeline.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// GET /api/voyages/[id]/timeline?bahasa=id|en
export const GET = withTenant(async (ctx, req, { params }: Ctx) => {
  const bahasaQ = new URL(req.url).searchParams.get('bahasa')
  const bahasa = bahasaQ === 'en' ? 'en' : 'id'
  return Response.json(await buildTimeline(ctx, params.id, { bahasa }))
})
