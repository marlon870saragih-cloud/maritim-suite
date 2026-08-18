// Skor vendor (K113, Fase 7j) — dihitung saat diminta, tak pernah disimpan.
import { withTenant } from '@/services/http'
import { skorVendor } from '@/services/ops/vendor-score.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export const GET = withTenant(async (ctx, _req, { params }: Ctx) => Response.json(await skorVendor(ctx, params.id)))
