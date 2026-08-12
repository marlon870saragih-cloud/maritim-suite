import { withTenant } from '@/services/http'
import { listAuditLog } from '@/services/audit-log.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withTenant(async (ctx, req) => {
  const url = new URL(req.url)
  const tableName = url.searchParams.get('tableName') || undefined
  const action = url.searchParams.get('action') || undefined
  const rows = await listAuditLog(ctx, { tableName, action })
  return Response.json(rows)
})
