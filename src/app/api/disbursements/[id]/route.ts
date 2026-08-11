import { jejakDari, jsonBody, withTenant } from '@/services/http'
import {
  getDisbursementDetail,
  removeDisbursement,
  updateDisbursement,
} from '@/services/finance/disbursement.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export const GET = withTenant(async (ctx, _req, { params }: Ctx) =>
  Response.json(await getDisbursementDetail(ctx, params.id)),
)

export const PATCH = withTenant(async (ctx, req, { params }: Ctx) => {
  const disbursement = await updateDisbursement(ctx, params.id, await jsonBody(req), jejakDari(req))
  return Response.json({ ok: true, disbursement })
})

export const DELETE = withTenant(async (ctx, req, { params }: Ctx) => {
  await removeDisbursement(ctx, params.id, jejakDari(req))
  return Response.json({ ok: true })
})
