import { jsonBodyKetat, withTenant } from '@/services/http'
import { gerbang } from '@/services/communication/communication.service'
import { setujuiPesan } from '@/services/communication/communication-approval.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// POST /api/automation/communications/approvals/[id]/approve { decisionNote? }
export const POST = withTenant(async (ctx, req, { params }: Ctx) => {
  gerbang(ctx) // otorisasi SEBELUM body dibaca: pemanggil tak berhak tak pernah melihat galat validasi
  const b = await jsonBodyKetat(req)
  const h = await setujuiPesan(ctx, { approvalRequestId: params.id, decisionNote: b.decisionNote })
  return Response.json({ ok: true, ...h })
})
