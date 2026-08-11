import { jejakDari, jsonBody, withTenant } from '@/services/http'
import { addItem, addItemsFromTemplate } from '@/services/finance/disbursement-item.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

/**
 * Dua pintu penambahan (§12/2, K28): satu jasa, atau seluruh baris sebuah
 * ServiceTemplate lewat `?template=<id>`.
 */
export const POST = withTenant(async (ctx, req, { params }: Ctx) => {
  const templateId = new URL(req.url).searchParams.get('template')
  const jejak = jejakDari(req)

  const hasil = templateId
    ? await addItemsFromTemplate(ctx, params.id, templateId, jejak)
    : await addItem(ctx, params.id, await jsonBody(req), jejak)

  return Response.json({ ok: true, ...hasil }, { status: 201 })
})
