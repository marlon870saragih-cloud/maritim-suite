import { jejakDari, jsonBody, withTenant } from '@/services/http'
import { setDisbursementStatus } from '@/services/finance/disbursement.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export const POST = withTenant(async (ctx, req, { params }: Ctx) => {
  const body = await jsonBody(req)
  const disbursement = await setDisbursementStatus(ctx, params.id, body.status, jejakDari(req))
  return Response.json({ ok: true, disbursement })
})
