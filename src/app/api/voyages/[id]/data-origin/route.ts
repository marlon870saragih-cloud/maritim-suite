// Fase 6a / K56 — ADMIN melabeli ulang asal data sebuah Voyage.
// Setiap pelabelan menulis satu baris AuditLog (asal lama & baru).

import { jejakDari, jsonBody, withTenant } from '@/services/http'
import { labelUlangAsal } from '@/services/ai/origin.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// PATCH /api/voyages/[id]/data-origin  body: { dataOrigin: 'SEED'|'UJI'|'NYATA' }
export const PATCH = withTenant(async (ctx, req, { params }: Ctx) => {
  const body = await jsonBody(req)
  const hasil = await labelUlangAsal(ctx, 'Voyage', params.id, body.dataOrigin, jejakDari(req))
  return Response.json({ ok: true, ...hasil })
})
