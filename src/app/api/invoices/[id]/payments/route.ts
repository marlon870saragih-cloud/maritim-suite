import { jejakDari, jsonBody, withTenant } from '@/services/http'
import { recordPayment } from '@/services/finance/invoice-payment.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// POST — catat satu pembayaran atas Invoice [id]. Lihat invoice-payment.service.ts.
export const POST = withTenant(async (ctx, req, { params }: Ctx) => {
  const invoice = await recordPayment(ctx, params.id, await jsonBody(req), jejakDari(req))
  return Response.json({ ok: true, invoice }, { status: 201 })
})
