import { jejakDari, jsonBody, withTenant } from '@/services/http'
import { createDisbursement, listDisbursements } from '@/services/finance/disbursement.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export const GET = withTenant(async (ctx, _req, { params }: Ctx) =>
  Response.json(await listDisbursements(ctx, params.id)),
)

export const POST = withTenant(async (ctx, req, { params }: Ctx) => {
  const disbursement = await createDisbursement(ctx, params.id, await jsonBody(req), jejakDari(req))
  return Response.json({ ok: true, disbursement }, { status: 201 })
})
