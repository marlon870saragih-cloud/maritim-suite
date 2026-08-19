// Bagikan/tarik satu lampiran dari Customer Portal (K170, Fase 8f).

import { withTenant, jsonBody } from '@/services/http'
import { shareAttachmentToPortal } from '@/services/ops/attachment.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// PATCH /api/attachments/[id]/share { share: boolean }
export const PATCH = withTenant(async (ctx, req, { params }: Ctx) => {
  const body = await jsonBody(req)
  return Response.json(await shareAttachmentToPortal(ctx, params.id, body.share === true))
})
