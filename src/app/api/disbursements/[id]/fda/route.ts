import { jejakDari, withTenant } from '@/services/http'
import { buatFdaDariEpda } from '@/services/finance/fda.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// POST — buat FDA dari dokumen [id] (EPDA/FPDA sumber). Lihat fda.service.ts K45.
export const POST = withTenant(async (ctx, req, { params }: Ctx) => {
  const disbursement = await buatFdaDariEpda(ctx, params.id, jejakDari(req))
  return Response.json({ ok: true, disbursement })
})
