// Transisi status tugas (K91/K98/K99).
//
// Bentuk balasannya sengaja sama dengan endpoint status Disbursement/Invoice:
// transisi tak sah → 409, alasan wajib yang kosong → 400, pelaku tak berhak →
// 403. Yang menentukan ketiganya adalah task.service.ts (yang memanggil mesin
// murni task-status.ts); berkas ini tidak tahu satu pun aturannya.

import { withTenant, jsonBody, jejakDari } from '@/services/http'
import { changeTaskStatus } from '@/services/ops/task.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// POST /api/tasks/[id]/status  { status: 'IN_PROGRESS', blockedReason?: '...' }
export const POST = withTenant(async (ctx, req, { params }: Ctx) => {
  const body = await jsonBody(req)
  const tugas = await changeTaskStatus(ctx, params.id, body.status, {
    blockedReason: body.blockedReason,
    jejak: jejakDari(req),
  })
  return Response.json({ ok: true, tugas })
})
