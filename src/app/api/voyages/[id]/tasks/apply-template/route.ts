// K95 pintu 2 — "Terapkan checklist" untuk voyage yang sudah ada.
//
// Dipakai untuk: voyage lama yang lahir sebelum templatenya dibuat, template
// baru, dan voyage yang pelabuhannya baru diisi belakangan.
//
// IDEMPOTEN. Menekan tombolnya dua kali tidak menghasilkan tugas ganda — yang
// menahannya @@unique([voyageId, sourceTemplateItemId]) di database, bukan
// pemeriksaan di aplikasi. Balasannya selalu menyebut "N dibuat, M sudah ada".

import { withTenant, jsonBody, jejakDari } from '@/services/http'
import { terapkanChecklistManual } from '@/services/ops/task-template.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// POST /api/voyages/[id]/tasks/apply-template  { templateId?: 'cuid' }
// Tanpa templateId → template dipilih otomatis dengan skor K93 (port +4,
// agencyType +2, vesselType +1), sama persis dengan pintu otomatis.
export const POST = withTenant(async (ctx, req, { params }: Ctx) => {
  const hasil = await terapkanChecklistManual(ctx, params.id, await jsonBody(req), jejakDari(req))
  return Response.json({ ok: true, ...hasil })
})
