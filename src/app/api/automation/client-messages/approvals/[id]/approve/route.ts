import { jsonBodyKetat, withTenant } from '@/services/http'
import { gerbangWa2 } from '@/services/whatsapp/wa2-gate'
import { setujuiPesanKlien } from '@/services/whatsapp/wa-message-approval.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// POST /api/automation/client-messages/approvals/[id]/approve { proposalHash, decisionNote? } — maker-checker ditegakkan service
export const POST = withTenant(async (ctx, req, { params }: Ctx) => {
  gerbangWa2(ctx) // gerbang SEBELUM body dibaca (CSRF/content-type/ukuran diperiksa sesudahnya)
  const b = await jsonBodyKetat(req)
  const h = await setujuiPesanKlien(ctx, { approvalRequestId: params.id, proposalHash: b.proposalHash, decisionNote: b.decisionNote })
  return Response.json({ ok: true, ...h })
})
