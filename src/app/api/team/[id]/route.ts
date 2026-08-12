import { jsonBody, withTenant } from '@/services/http'
import { updateTeamMember } from '@/services/user.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export const PATCH = withTenant(async (ctx, req, { params }: Ctx) => {
  const member = await updateTeamMember(ctx, params.id, await jsonBody(req))
  return Response.json({ ok: true, member })
})
