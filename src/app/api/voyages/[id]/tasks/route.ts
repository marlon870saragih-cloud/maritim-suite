// Tugas satu voyage — panel "Tugas" di Voyage Workspace (7d).
//
// Sengaja memakai service yang SAMA dengan papan lintas-voyage: satu sumber
// pengurutan dan satu sumber penyaringan, supaya panel voyage dan papan global
// tidak pernah menyajikan dua urutan berbeda atas data yang sama.

import { withTenant, jsonBody, jejakDari } from '@/services/http'
import { createTask, listTasks } from '@/services/ops/task.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// GET /api/voyages/[id]/tasks?status=&assignee=&semua=1
export const GET = withTenant(async (ctx, req, { params }: Ctx) => {
  const q = new URL(req.url).searchParams
  return Response.json(
    await listTasks(ctx, {
      voyageId: params.id,
      status: q.get('status'),
      assignee: q.get('assignee'),
      due: q.get('due'),
      category: q.get('category'),
      cari: q.get('cari'),
      // Papan voyage menampilkan KELIMA kolom, termasuk DONE & CANCELLED —
      // di situlah orang melihat bahwa pekerjaan memang sudah beres.
      termasukSelesai: q.get('semua') !== '0',
    }),
  )
})

// POST /api/voyages/[id]/tasks — voyageId diambil dari URL, bukan dari body.
export const POST = withTenant(async (ctx, req, { params }: Ctx) => {
  const tugas = await createTask(ctx, await jsonBody(req), {
    voyageId: params.id,
    jejak: jejakDari(req),
  })
  return Response.json({ ok: true, tugas }, { status: 201 })
})
