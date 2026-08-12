import { withTenant } from '@/services/http'
import { listInvoicesByVoyage } from '@/services/finance/invoice.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export const GET = withTenant(async (ctx, _req, { params }: Ctx) =>
  Response.json(await listInvoicesByVoyage(ctx, params.id)),
)
