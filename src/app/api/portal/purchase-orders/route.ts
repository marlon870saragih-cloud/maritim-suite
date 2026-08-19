// Pesanan (PO) vendor (K171).

import { withPortal } from '@/services/portal/http'
import { listPurchaseOrdersPortal } from '@/services/portal/vendor-view'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withPortal(async (pctx) => {
  return Response.json(await listPurchaseOrdersPortal(pctx))
})
