import { withPortal } from '@/services/portal/http'
import { getInvoiceDetailPortal } from '@/services/portal/customer-view'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// GET /api/portal/invoices/[id] — sumbu 1 (tenant lain) & sumbu 2 (pelanggan
// lain, tenant sama) sama-sama 404, dibuktikan pctx.db (K147/K148/K150).
export const GET = withPortal(async (pctx, _req, { params }: Ctx) => {
  return Response.json(await getInvoiceDetailPortal(pctx, params.id))
})
