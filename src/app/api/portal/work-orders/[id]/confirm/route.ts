// Konfirmasi "pekerjaan selesai" dari portal vendor (K173). JSON: note?.

import { withPortal } from '@/services/portal/http'
import { jsonBody } from '@/services/http'
import { konfirmasiSelesaiPortal } from '@/services/portal/wo-confirmation.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// POST /api/portal/work-orders/[id]/confirm
export const POST = withPortal(async (pctx, req, { params }: Ctx) => {
  const body = await jsonBody(req)
  const hasil = await konfirmasiSelesaiPortal(pctx, params.id, { note: body.note })
  return Response.json(hasil, { status: 201 })
})
