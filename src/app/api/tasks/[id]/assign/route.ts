// Penugasan (K97: satu penanggung jawab, K98: siapa boleh menunjuk siapa).
//
// Dipisah dari PATCH karena pagar perannya berbeda: OPERATOR boleh MENGAMBIL
// tugas (menugaskan ke diri sendiri) tanpa boleh membebankannya ke orang lain,
// dan pemisahan itu jadi tidak terbaca kalau bersembunyi di dalam PATCH umum.

import { withTenant, jsonBody, jejakDari } from '@/services/http'
import { assignTask } from '@/services/ops/task.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// POST /api/tasks/[id]/assign  { assigneeUserId: 'cuid' | null }
export const POST = withTenant(async (ctx, req, { params }: Ctx) => {
  const body = await jsonBody(req)
  const tugas = await assignTask(ctx, params.id, body.assigneeUserId, jejakDari(req))
  return Response.json({ ok: true, tugas })
})
