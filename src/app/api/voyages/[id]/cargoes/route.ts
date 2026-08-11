import { withTenant, jsonBody } from '@/services/http'
import { createCargo, listCargoes } from '@/services/master/cargo.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export const GET = withTenant(async (ctx, _req, { params }: Ctx) =>
  Response.json(await listCargoes(ctx, params.id)),
)

export const POST = withTenant(async (ctx, req, { params }: Ctx) => {
  const cargo = await createCargo(ctx, params.id, await jsonBody(req))
  return Response.json({ ok: true, cargo }, { status: 201 })
})
