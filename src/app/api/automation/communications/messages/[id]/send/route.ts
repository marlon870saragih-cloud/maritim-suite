import { jsonBodyKetat, withTenant } from '@/services/http'
import { gerbang } from '@/services/communication/communication.service'
import { kirimFake } from '@/services/communication/communication-send.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// POST /api/automation/communications/messages/[id]/send { requestKey } — FAKE Send / retry manual.
// Tanpa WhatsApp nyata; requestKey = kunci idempotensi per klik dari klien.
export const POST = withTenant(async (ctx, req, { params }: Ctx) => {
  gerbang(ctx) // otorisasi SEBELUM body dibaca: pemanggil tak berhak tak pernah melihat galat validasi
  const b = await jsonBodyKetat(req)
  const h = await kirimFake(ctx, { messageId: params.id, requestKey: b.requestKey })
  return Response.json({ ok: true, ...h })
})
