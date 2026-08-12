import { withTenant } from '@/services/http'
import { listNotifications, countUnread } from '@/services/notification.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withTenant(async (ctx) => {
  const [rows, unread] = await Promise.all([listNotifications(ctx), countUnread(ctx)])
  return Response.json({ rows, unread })
})
