import { jsonBodyKetat, withTenant } from '@/services/http'
import { gerbang, tandaiDipratinjau } from '@/services/communication/communication.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// POST /api/automation/communications/messages/[id]/preview { snapshotFingerprint }
export const POST = withTenant(async (ctx, req, { params }: Ctx) => {
  gerbang(ctx) // otorisasi SEBELUM body dibaca: pemanggil tak berhak tak pernah melihat galat validasi
  const b = await jsonBodyKetat(req)
  const h = await tandaiDipratinjau(ctx, { messageId: params.id, snapshotFingerprint: b.snapshotFingerprint })
  return Response.json({ ok: true, ...h })
})
