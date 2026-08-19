// Pemicu ULANG manual penyemaian awal (K152/4 "Salin template contoh") — ADMIN saja.

import { withTenant } from '@/services/http'
import { seedTenantOnboardingManual } from '@/services/saas/onboarding.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/onboarding/seed
export const POST = withTenant(async (ctx) => {
  return Response.json(await seedTenantOnboardingManual(ctx))
})
