import { withTenant } from '@/services/http'
import { bandingkanDokumen } from '@/services/finance/revision.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// GET ?with=<idVersiLain> — tanpa `with`, bandingkan dengan v1 rumpun ini (K39/§12/1).
export const GET = withTenant(async (ctx, req, { params }: Ctx) => {
  const withId = new URL(req.url).searchParams.get('with')
  const hasil = await bandingkanDokumen(ctx, params.id, withId)
  return Response.json(hasil)
})
