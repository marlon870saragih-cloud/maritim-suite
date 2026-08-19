// Ringkasan beranda portal (K167).

import { withPortal } from '@/services/portal/http'
import { dashboardPortal } from '@/services/portal/customer-view'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withPortal(async (pctx) => {
  return Response.json(await dashboardPortal(pctx))
})
