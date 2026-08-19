// Settings › Merek (K180) — daftar & ubah. ADMIN-only ditegakkan di service.

import { withTenant, jsonBody } from '@/services/http'
import { getBranding, updateBranding } from '@/services/saas/branding.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withTenant(async (ctx) => {
  return Response.json(await getBranding(ctx))
})

// PATCH { brandPrimaryColor?: string|null, portalSlug?: string|null }
export const PATCH = withTenant(async (ctx, req) => {
  return Response.json(await updateBranding(ctx, await jsonBody(req)))
})
