import { withTenant } from '@/services/http'
import { kesehatanAutomation } from '@/services/automation/monitoring.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/automation/health
export const GET = withTenant(async (ctx) => Response.json(await kesehatanAutomation(ctx)))
