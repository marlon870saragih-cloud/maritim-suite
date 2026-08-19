// Perpindahan status permintaan hak subjek data (K187) — SELALU oleh manusia.

import { jejakDari, jsonBody, withTenant } from '@/services/http'
import { updateDataRequest } from '@/services/saas/data-request.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// PATCH /api/settings/data-requests/[id] { status?, hasil? }
export const PATCH = withTenant(async (ctx, req, { params }: Ctx) => {
  const body = await jsonBody(req)
  const permintaan = await updateDataRequest(ctx, params.id, body, jejakDari(req))
  return Response.json({ ok: true, permintaan })
})
