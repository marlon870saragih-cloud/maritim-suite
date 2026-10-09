import { jsonBodyKetat, withTenant } from '@/services/http'
import { gerbang, buatRevisiPesan } from '@/services/communication/communication.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// POST /api/automation/communications/candidates/[id]/revisions { recipientFixtureId, language }
export const POST = withTenant(async (ctx, req, { params }: Ctx) => {
  gerbang(ctx) // otorisasi SEBELUM body dibaca: pemanggil tak berhak tak pernah melihat galat validasi
  const b = await jsonBodyKetat(req)
  const h = await buatRevisiPesan(ctx, { candidateId: params.id, recipientFixtureId: b.recipientFixtureId, language: b.language })
  return Response.json({ ok: true, ...h })
})
