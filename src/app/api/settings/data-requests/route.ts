// Permintaan hak subjek data UU PDP (K187, Fase 8k).
//
// POST mengembalikan permintaan BESERTA `jejakSubjek` — peta "di mana saja
// data ini muncul" (K187/1). Tak satu baris pun dihapus oleh endpoint ini,
// apa pun `jenis`-nya; penghapusan tidak pernah otomatis.

import { jejakDari, jsonBody, withTenant } from '@/services/http'
import { createDataRequest, listDataRequests } from '@/services/saas/data-request.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/settings/data-requests
export const GET = withTenant(async (ctx) => {
  return Response.json(await listDataRequests(ctx))
})

// POST /api/settings/data-requests { jenis, subjek, uraian, konteks? }
export const POST = withTenant(async (ctx, req) => {
  const body = await jsonBody(req)
  const hasil = await createDataRequest(ctx, body, jejakDari(req))
  return Response.json({ ok: true, ...hasil }, { status: 201 })
})
