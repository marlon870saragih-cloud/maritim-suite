// Detail Pesanan (PO) vendor (K171).

import { withPortal } from '@/services/portal/http'
import { getPurchaseOrderDetailPortal } from '@/services/portal/vendor-view'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export const GET = withPortal(async (pctx, _req, { params }: Ctx) => {
  return Response.json(await getPurchaseOrderDetailPortal(pctx, params.id))
})
