import { withTenant } from '@/services/http'
import { posisiAisVoyage } from '@/services/ais/read.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// GET /api/automation/ais/voyages/[id] — posisi AIS terakhir kapal voyage (hanya baca, PRD-003 Step 4).
export const GET = withTenant(async (ctx, _req, { params }: Ctx) => Response.json(await posisiAisVoyage(ctx, params.id)))
