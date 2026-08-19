// Lewati semua langkah onboarding (K152) — ADMIN saja.

import { withTenant } from '@/services/http'
import { skipOnboarding } from '@/services/saas/onboarding.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/onboarding/skip
export const POST = withTenant(async (ctx) => {
  return Response.json(await skipOnboarding(ctx))
})
