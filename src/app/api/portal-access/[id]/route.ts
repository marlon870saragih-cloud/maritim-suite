import { withTenant } from '@/services/http'
import { revokePortalAccess } from '@/services/portal/access.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// DELETE /api/portal-access/[id] — K168: mencabut = mengisi revokedAt (soft), bukan hard-delete.
export const DELETE = withTenant(async (ctx, _req, { params }: Ctx) => {
  await revokePortalAccess(ctx, params.id)
  return Response.json({ ok: true })
})
