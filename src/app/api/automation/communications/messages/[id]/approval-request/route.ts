import { jsonBodyKetat, withTenant } from '@/services/http'
import { gerbang } from '@/services/communication/communication.service'
import { mintaApproval } from '@/services/communication/communication-approval.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// POST /api/automation/communications/messages/[id]/approval-request — tanpa body
export const POST = withTenant(async (ctx, req, { params }: Ctx) => {
  gerbang(ctx) // otorisasi SEBELUM body dibaca
  await jsonBodyKetat(req) // body (bila ada) tetap dibatasi & divalidasi; isinya tak dipakai
  const h = await mintaApproval(ctx, { messageId: params.id })
  return Response.json({ ok: true, ...h })
})
