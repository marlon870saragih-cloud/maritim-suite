import { jejakDari, jsonBody, withTenant } from '@/services/http'
import { setInvoiceStatus } from '@/services/finance/invoice.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export const POST = withTenant(async (ctx, req, { params }: Ctx) => {
  const body = await jsonBody(req)
  const invoice = await setInvoiceStatus(ctx, params.id, body.status, jejakDari(req))
  return Response.json({ ok: true, invoice })
})
