// Papan & daftar tugas LINTAS-voyage (K91). Route tipis, semua logika di service.
//
// Kolom papan adalah kelima status (K91: Kanban tidak punya tabel), dan
// PENYARINGnya tinggal di URL — bukan di database. Itu sebabnya berkas ini
// membaca banyak query param dan tidak menyimpan satu pun preferensi.

import { withTenant, jsonBody, jejakDari } from '@/services/http'
import { createTask, listTasks } from '@/services/ops/task.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/tasks?voyageId=&status=TODO,IN_PROGRESS&assignee=me&due=24j&category=&cari=&semua=1
export const GET = withTenant(async (ctx, req) => {
  const q = new URL(req.url).searchParams
  return Response.json(
    await listTasks(ctx, {
      voyageId: q.get('voyageId'),
      status: q.get('status'),
      assignee: q.get('assignee'),
      due: q.get('due'),
      category: q.get('category'),
      cari: q.get('cari'),
      termasukSelesai: q.get('semua') === '1',
      batas: q.get('batas') ? Number(q.get('batas')) : null,
    }),
  )
})

// POST /api/tasks — tugas kantor tanpa voyage (K83) maupun tugas ber-voyageId di body.
export const POST = withTenant(async (ctx, req) => {
  const tugas = await createTask(ctx, await jsonBody(req), { jejak: jejakDari(req) })
  return Response.json({ ok: true, tugas }, { status: 201 })
})
