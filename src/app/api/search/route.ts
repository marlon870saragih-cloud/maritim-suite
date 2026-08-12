import { withTenant } from '@/services/http'
import { globalSearch } from '@/services/search.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withTenant(async (ctx, req) => {
  const q = new URL(req.url).searchParams.get('q') ?? ''
  const results = await globalSearch(ctx, q)
  return Response.json({ results })
})
