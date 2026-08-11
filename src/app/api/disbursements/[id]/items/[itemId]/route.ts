import { jejakDari, jsonBody, withTenant } from '@/services/http'
import { removeItem, updateItem } from '@/services/finance/disbursement-item.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// `id` induk SELALU ikut ke service — item milik dokumen tenant lain harus jatuh
// ke NOT_FOUND, bukan tersentuh (K44).
type Ctx = { params: { id: string; itemId: string } }

export const PATCH = withTenant(async (ctx, req, { params }: Ctx) => {
  const hasil = await updateItem(
    ctx,
    params.id,
    params.itemId,
    await jsonBody(req),
    jejakDari(req),
  )
  return Response.json({ ok: true, ...hasil })
})

export const DELETE = withTenant(async (ctx, req, { params }: Ctx) => {
  const disbursement = await removeItem(ctx, params.id, params.itemId, jejakDari(req))
  return Response.json({ ok: true, disbursement })
})
