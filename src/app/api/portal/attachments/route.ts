// Dokumen yang sengaja dibagikan (K170).

import { withPortal } from '@/services/portal/http'
import { listDocumentsPortal } from '@/services/portal/document.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withPortal(async (pctx) => {
  return Response.json(await listDocumentsPortal(pctx))
})
