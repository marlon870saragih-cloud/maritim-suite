import { jejakDari, jsonBody, withTenant } from '@/services/http'
import { revise } from '@/services/finance/revision.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export const POST = withTenant(async (ctx, req, { params }: Ctx) => {
  const disbursement = await revise(ctx, params.id, await jsonBody(req), jejakDari(req))
  return Response.json({ ok: true, disbursement })
})
