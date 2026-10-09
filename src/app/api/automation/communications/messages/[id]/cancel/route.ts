import { jsonBodyKetat, withTenant } from '@/services/http'
import { gerbang } from '@/services/communication/communication.service'
import { batalkanPesan } from '@/services/communication/communication-cancel.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// POST /api/automation/communications/messages/[id]/cancel { cancelNote }
export const POST = withTenant(async (ctx, req, { params }: Ctx) => {
  gerbang(ctx) // otorisasi SEBELUM body dibaca: pemanggil tak berhak tak pernah melihat galat validasi
  const b = await jsonBodyKetat(req)
  const h = await batalkanPesan(ctx, { messageId: params.id, cancelNote: b.cancelNote })
  return Response.json({ ok: true, ...h })
})
