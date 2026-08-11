import type { VoyageStatus } from '@prisma/client'
import { withTenant, jsonBody } from '@/services/http'
import { createVoyage, listVoyages } from '@/services/master/voyage.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/voyages?status=PLANNED&vesselId=xxx&cari=VYG-2026
export const GET = withTenant(async (ctx, req) => {
  const url = new URL(req.url)
  const voyages = await listVoyages(ctx, {
    status: url.searchParams.get('status') as VoyageStatus | null,
    vesselId: url.searchParams.get('vesselId'),
    cari: url.searchParams.get('cari'),
  })
  return Response.json(voyages)
})

// POST /api/voyages → buat voyage baru, nomor VYG-YYYY-NNNNNN diterbitkan otomatis.
export const POST = withTenant(async (ctx, req) => {
  const voyage = await createVoyage(ctx, await jsonBody(req))
  return Response.json({ ok: true, voyage }, { status: 201 })
})
