// VendorRating (K115, Fase 7j) — daftar & catat. Append-only: tak ada PATCH/DELETE.
import { withTenant, jsonBody } from '@/services/http'
import { listVendorRatings, createVendorRating } from '@/services/ops/vendor-rating.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export const GET = withTenant(async (ctx, _req, { params }: Ctx) => Response.json(await listVendorRatings(ctx, params.id)))

// POST /api/vendors/[id]/ratings { score, workOrderId?, voyageId?, note? }
export const POST = withTenant(async (ctx, req, { params }: Ctx) => {
  const rating = await createVendorRating(ctx, params.id, await jsonBody(req))
  return Response.json({ ok: true, rating }, { status: 201 })
})
