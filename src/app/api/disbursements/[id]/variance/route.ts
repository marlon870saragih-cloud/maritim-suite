import { withTenant } from '@/services/http'
import { variancePasangan } from '@/services/finance/fda.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// GET — variance dokumen FDA [id] vs EPDA asalnya (K46).
export const GET = withTenant(async (ctx, _req, { params }: Ctx) =>
  Response.json(await variancePasangan(ctx, params.id)),
)
