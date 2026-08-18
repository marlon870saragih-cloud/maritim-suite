// Hapus (soft) satu peristiwa (K130/7) — hilang dari timeline & prefill SOF, tetap ada di DB.

import { withTenant } from '@/services/http'
import { removeVoyageEvent } from '@/services/ops/voyage-event.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string; eventId: string } }

// DELETE /api/voyages/[id]/events/[eventId]
export const DELETE = withTenant(async (ctx, _req, { params }: Ctx) => {
  await removeVoyageEvent(ctx, params.id, params.eventId)
  return Response.json({ ok: true })
})
