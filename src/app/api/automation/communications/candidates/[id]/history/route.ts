import { withTenant } from '@/services/http'
import { riwayatKomunikasi } from '@/services/communication/communication-read.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// GET /api/automation/communications/candidates/[id]/history?recipient=masked|full — Communication History
export const GET = withTenant(async (ctx, req, { params }: Ctx) => {
  const r = new URL(req.url).searchParams.get('recipient')
  const pengenal = r === null || r === 'masked' ? 'SAMAR' : r === 'full' ? 'UTUH' : r
  const data = await riwayatKomunikasi(ctx, { candidateId: params.id, pengenal })
  return Response.json({ ok: true, data })
})
