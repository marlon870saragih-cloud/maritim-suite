// Kunjungan kapal pelanggan (K167).

import { withPortal } from '@/services/portal/http'
import { listVoyagesPortal } from '@/services/portal/customer-view'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withPortal(async (pctx) => {
  return Response.json(await listVoyagesPortal(pctx))
})
