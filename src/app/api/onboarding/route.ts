// Status onboarding (K152) — terbuka untuk SEMUA peran, tanpa pagar.

import { withTenant } from '@/services/http'
import { getOnboardingStatus } from '@/services/saas/onboarding.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/onboarding
export const GET = withTenant(async (ctx) => {
  return Response.json(await getOnboardingStatus(ctx))
})
