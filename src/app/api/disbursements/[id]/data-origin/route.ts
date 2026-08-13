// Fase 6a / K56 — ADMIN melabeli ulang asal data sebuah Disbursement.
// Respons ikut membawa `asalEfektif` (K58): dokumen 'NYATA' di atas voyage 'UJI'
// tetap dihitung 'UJI', dan itu harus terlihat di tempat pelabelan dilakukan —
// bukan jadi kejutan nanti saat prediksinya tak kunjung naik.

import { jejakDari, jsonBody, withTenant } from '@/services/http'
import { labelUlangAsal } from '@/services/ai/origin.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// PATCH /api/disbursements/[id]/data-origin  body: { dataOrigin: 'SEED'|'UJI'|'NYATA' }
export const PATCH = withTenant(async (ctx, req, { params }: Ctx) => {
  const body = await jsonBody(req)
  const hasil = await labelUlangAsal(ctx, 'Disbursement', params.id, body.dataOrigin, jejakDari(req))
  return Response.json({ ok: true, ...hasil })
})
