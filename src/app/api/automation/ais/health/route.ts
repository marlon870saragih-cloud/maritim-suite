import { withTenant } from '@/services/http'
import { kesehatanAis } from '@/services/ais/read.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/automation/ais/health — kesehatan pengambilan posisi AIS (PRD-003 Step 4).
export const GET = withTenant(async (ctx) => Response.json(await kesehatanAis(ctx)))
