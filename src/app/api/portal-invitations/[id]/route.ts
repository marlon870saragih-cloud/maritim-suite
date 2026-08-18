import { withTenant } from '@/services/http'
import { cancelPortalInvitation } from '@/services/portal/invitation.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// DELETE /api/portal-invitations/[id] — hanya undangan yang BELUM diterima.
export const DELETE = withTenant(async (ctx, _req, { params }: Ctx) => {
  await cancelPortalInvitation(ctx, params.id)
  return Response.json({ ok: true })
})
