// Riwayat kuitansi langganan (K164, Fase 8e).

import { withTenant } from '@/services/http'
import { listSubscriptionInvoices } from '@/services/saas/sub-invoice.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/billing/invoices — ADMIN & FINANCE saja (requireRole di dalam service, K155).
export const GET = withTenant(async (ctx) => {
  return Response.json(await listSubscriptionInvoices(ctx))
})
