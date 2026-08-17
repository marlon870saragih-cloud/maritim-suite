import { withTenant, jsonBody } from '@/services/http'
import { createComment, listComments } from '@/services/ops/comment.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/comments?entityType=DISBURSEMENT&entityId=...
export const GET = withTenant(async (ctx, req) => {
  const url = new URL(req.url)
  const rows = await listComments(
    ctx,
    url.searchParams.get('entityType'),
    url.searchParams.get('entityId'),
  )
  return Response.json(rows)
})

// POST /api/comments  { entityType, entityId, body, mentionedUserIds? }
export const POST = withTenant(async (ctx, req) => {
  const comment = await createComment(ctx, await jsonBody(req))
  return Response.json({ ok: true, comment }, { status: 201 })
})
