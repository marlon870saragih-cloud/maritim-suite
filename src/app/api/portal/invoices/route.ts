// Tagihan pelanggan — proyeksi PENUH K167 (menggantikan endpoint uji 8a).

import { withPortal } from '@/services/portal/http'
import { listInvoicesPortal } from '@/services/portal/customer-view'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withPortal(async (pctx) => {
  return Response.json(await listInvoicesPortal(pctx))
})
