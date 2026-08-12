import { withTenant } from '@/services/http'
import { markAllRead } from '@/services/notification.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = withTenant(async (ctx) => {
  await markAllRead(ctx)
  return Response.json({ ok: true })
})
