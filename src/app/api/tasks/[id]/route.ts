// Satu tugas: baca, sunting isi, hapus (soft).
//
// PATCH di sini TIDAK mengubah status maupun urutan papan — keduanya punya
// endpoint sendiri karena keduanya lewat mesin murni (K91/K92), bukan lewat
// penulisan kolom biasa. Mengirim `status` ke PATCH ditolak 400 dengan petunjuk
// endpoint yang benar, bukan diam-diam diabaikan.
//
// Sama seperti PATCH /api/voyages/[id] yang sudah ada, body dianggap LENGKAP:
// field yang tidak dikirim ikut dikosongkan. Itu konvensi yang sudah berlaku di
// modul ini sejak Fase 2, bukan penyimpangan baru.

import { withTenant, jsonBody, jejakDari } from '@/services/http'
import { getTask, removeTask, updateTask } from '@/services/ops/task.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export const GET = withTenant(async (ctx, _req, { params }: Ctx) =>
  Response.json(await getTask(ctx, params.id)),
)

export const PATCH = withTenant(async (ctx, req, { params }: Ctx) => {
  const tugas = await updateTask(ctx, params.id, await jsonBody(req))
  return Response.json({ ok: true, tugas })
})

export const DELETE = withTenant(async (ctx, req, { params }: Ctx) => {
  await removeTask(ctx, params.id, jejakDari(req))
  return Response.json({ ok: true })
})
