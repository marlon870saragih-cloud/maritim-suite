import { withTenant, jsonBody } from '@/services/http'
import { statusApprovalPoUntukUi, putuskanApprovalPo } from '@/services/ops/po-approval.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export const GET = withTenant(async (ctx, _req, { params }: Ctx) => Response.json(await statusApprovalPoUntukUi(ctx, params.id)))

// POST /api/purchase-orders/[id]/approvals { decision: 'APPROVED'|'REJECTED'|'REQUEST_REVISION', note? }
export const POST = withTenant(async (ctx, req, { params }: Ctx) => {
  const po = await putuskanApprovalPo(ctx, params.id, await jsonBody(req))
  return Response.json({ ok: true, po })
})
