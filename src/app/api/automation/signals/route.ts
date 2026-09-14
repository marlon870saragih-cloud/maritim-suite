import { withTenant } from '@/services/http'
import { listSinyal } from '@/services/automation/monitoring.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/automation/signals?voyageId=&state=OPEN|ACKNOWLEDGED|DISMISSED|EXPIRED&severity=&take=
export const GET = withTenant(async (ctx, req) => Response.json(await listSinyal(ctx, new URL(req.url).searchParams)))
