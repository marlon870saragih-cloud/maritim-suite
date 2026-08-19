// K122/K172/1 (Fase 8g) — VendorInvoiceSubmission voyage ini yang belum
// dipakai, untuk tab "Tagihan Vendor" di dialog "Ambil dari PO/WO" builder
// FDA. Cetakan persis /api/voyages/[id]/procurement-sources (Fase 7i).

import { withTenant } from '@/services/http'
import { listSubmissionsUntukDiambil } from '@/services/ops/vendor-submission.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export const GET = withTenant(async (ctx, _req, { params }: Ctx) => {
  return Response.json(await listSubmissionsUntukDiambil(ctx, params.id))
})
