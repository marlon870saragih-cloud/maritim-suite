// Tandai status riwayat email (K138/P43) — SEMUA ditandai tangan (K136).

import { withTenant, jsonBody } from '@/services/http'
import { updateEmailLogStatus } from '@/services/ops/email-log.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// PATCH /api/email-logs/[id] { status: 'SENT_MANUAL' | 'NO_RESPONSE' | 'REPLIED' }
export const PATCH = withTenant(async (ctx, req, { params }: Ctx) => {
  const body = await jsonBody(req)
  const log = await updateEmailLogStatus(ctx, params.id, body.status)
  return Response.json({ ok: true, log })
})
