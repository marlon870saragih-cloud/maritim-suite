// Riwayat email (K136-K137, Fase 7h) — daftar & catat draft otomatis.

import { withTenant, jsonBody } from '@/services/http'
import { createEmailLog, listEmailLogs } from '@/services/ops/email-log.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/email-logs?entityType=DISBURSEMENT&entityId=...
export const GET = withTenant(async (ctx, req) => {
  const url = new URL(req.url)
  const rows = await listEmailLogs(ctx, url.searchParams.get('entityType'), url.searchParams.get('entityId'))
  return Response.json(rows)
})

// POST /api/email-logs { entityType, entityId, template?, toAddress?, ccAddress?, subject, bodySnapshot? }
export const POST = withTenant(async (ctx, req) => {
  const log = await createEmailLog(ctx, await jsonBody(req))
  return Response.json({ ok: true, log }, { status: 201 })
})
