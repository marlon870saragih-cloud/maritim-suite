import { withTenant } from '@/services/http'
import { removeAttachment } from '@/services/ops/attachment.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// DELETE /api/attachments/[id] — K110: SOFT delete. Berkas fisik tidak disentuh.
export const DELETE = withTenant(async (ctx, _req, { params }: Ctx) => {
  await removeAttachment(ctx, params.id)
  return Response.json({ ok: true })
})
