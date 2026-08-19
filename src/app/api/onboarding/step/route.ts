// Tandai satu langkah onboarding selesai (K152) — ADMIN saja.

import { withTenant, jsonBody } from '@/services/http'
import { completeStep } from '@/services/saas/onboarding.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/onboarding/step { langkah }
export const POST = withTenant(async (ctx, req) => {
  const body = await jsonBody(req)
  return Response.json(await completeStep(ctx, body.langkah))
})
