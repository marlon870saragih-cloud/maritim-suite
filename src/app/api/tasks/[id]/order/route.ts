// Pindah urutan kartu dalam kolom papan (K92).
//
// `indeksTujuan` adalah posisi akhir yang diinginkan DI ANTARA kartu lain di
// kolom yang sama: 0 = paling atas. Memindah kartu ke KOLOM lain adalah
// perubahan STATUS, jadi ia lewat /status — bukan lewat sini. UI drag-and-drop
// yang menyeret kartu ke kolom lain memanggil keduanya, berurutan.

import { withTenant, jsonBody } from '@/services/http'
import { moveTaskOrder } from '@/services/ops/task.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// POST /api/tasks/[id]/order  { indeksTujuan: 2 }
export const POST = withTenant(async (ctx, req, { params }: Ctx) => {
  const body = await jsonBody(req)
  return Response.json({ ok: true, ...(await moveTaskOrder(ctx, params.id, body.indeksTujuan)) })
})
