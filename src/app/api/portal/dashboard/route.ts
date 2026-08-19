// Ringkasan beranda portal (K167/K171) — bercabang menurut pihak sesi ini.

import { withPortal } from '@/services/portal/http'
import { dashboardPortal } from '@/services/portal/customer-view'
import { dashboardVendorPortal } from '@/services/portal/vendor-view'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withPortal(async (pctx) => {
  const data = pctx.pihak === 'VENDOR' ? await dashboardVendorPortal(pctx) : await dashboardPortal(pctx)
  return Response.json(data)
})
