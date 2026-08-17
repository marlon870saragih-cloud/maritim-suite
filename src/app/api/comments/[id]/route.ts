import { withTenant, jsonBody } from '@/services/http'
import { removeComment, updateComment } from '@/services/ops/comment.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// PATCH /api/comments/[id] — penulis sendiri saja (K128)
export const PATCH = withTenant(async (ctx, req, { params }: Ctx) => {
  const comment = await updateComment(ctx, params.id, await jsonBody(req))
  return Response.json({ ok: true, comment })
})

// DELETE /api/comments/[id] — soft delete; baris tetap tampil sebagai penanda
export const DELETE = withTenant(async (ctx, _req, { params }: Ctx) => {
  await removeComment(ctx, params.id)
  return Response.json({ ok: true })
})
