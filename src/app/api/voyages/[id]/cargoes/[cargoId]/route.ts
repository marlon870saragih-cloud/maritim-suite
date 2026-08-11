import { withTenant, jsonBody } from '@/services/http'
import { removeCargo, updateCargo } from '@/services/master/cargo.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string; cargoId: string } }

export const PATCH = withTenant(async (ctx, req, { params }: Ctx) => {
  const cargo = await updateCargo(ctx, params.id, params.cargoId, await jsonBody(req))
  return Response.json({ ok: true, cargo })
})

export const DELETE = withTenant(async (ctx, _req, { params }: Ctx) => {
  await removeCargo(ctx, params.id, params.cargoId)
  return Response.json({ ok: true })
})
