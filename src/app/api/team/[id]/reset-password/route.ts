import { jsonBody, withTenant } from '@/services/http'
import { resetTeamMemberPassword } from '@/services/user.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export const POST = withTenant(async (ctx, req, { params }: Ctx) => {
  await resetTeamMemberPassword(ctx, params.id, await jsonBody(req))
  return Response.json({ ok: true })
})
