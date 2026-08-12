import { jejakDari, jsonBody, withTenant } from '@/services/http'
import { createInvoiceFromFda } from '@/services/finance/invoice.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// POST — buat Invoice dari dokumen FDA [id]. Lihat invoice.service.ts K47.
export const POST = withTenant(async (ctx, req, { params }: Ctx) => {
  const invoice = await createInvoiceFromFda(ctx, params.id, await jsonBody(req), jejakDari(req))
  return Response.json({ ok: true, invoice }, { status: 201 })
})
