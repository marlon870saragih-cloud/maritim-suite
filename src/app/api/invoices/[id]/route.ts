import { jejakDari, jsonBody, withTenant } from '@/services/http'
import { getInvoiceDetail, removeInvoice, updateInvoice } from '@/services/finance/invoice.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export const GET = withTenant(async (ctx, _req, { params }: Ctx) =>
  Response.json(await getInvoiceDetail(ctx, params.id)),
)

export const PATCH = withTenant(async (ctx, req, { params }: Ctx) => {
  const invoice = await updateInvoice(ctx, params.id, await jsonBody(req), jejakDari(req))
  return Response.json({ ok: true, invoice })
})

export const DELETE = withTenant(async (ctx, req, { params }: Ctx) => {
  await removeInvoice(ctx, params.id, jejakDari(req))
  return Response.json({ ok: true })
})
