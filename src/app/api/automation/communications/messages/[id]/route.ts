import { withTenant } from '@/services/http'
import { detailPesan } from '@/services/communication/communication-read.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// GET /api/automation/communications/messages/[id]?recipient=masked|full
// Least privilege: pengenal penerima disamarkan kecuali diminta eksplisit (recipient=full).
export const GET = withTenant(async (ctx, req, { params }: Ctx) => {
  const r = new URL(req.url).searchParams.get('recipient')
  const pengenal = r === null || r === 'masked' ? 'SAMAR' : r === 'full' ? 'UTUH' : r
  const data = await detailPesan(ctx, { messageId: params.id, pengenal })
  return Response.json({ ok: true, data })
})
