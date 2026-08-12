import { withTenant } from '@/services/http'
import { markRead } from '@/services/notification.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export const POST = withTenant(async (ctx, _req, { params }: Ctx) => {
  await markRead(ctx, params.id)
  return Response.json({ ok: true })
})
