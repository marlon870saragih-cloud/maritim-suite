import { jsonBody, withTenant } from '@/services/http'
import { createTeamMember, listTeam } from '@/services/user.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withTenant(async (ctx) => Response.json(await listTeam(ctx)))

export const POST = withTenant(async (ctx, req) => {
  const member = await createTeamMember(ctx, await jsonBody(req))
  return Response.json({ ok: true, member }, { status: 201 })
})
