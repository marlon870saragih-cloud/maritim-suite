import React from 'react'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { withTenant } from '@/services/http'
import { subInvoiceToData } from '@/lib/pdf/sub-invoice-data'
import { SubInvoiceDocument } from '@/lib/pdf/SubInvoiceDocument'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// GET /api/billing/invoices/[id]/pdf (?download=1) — K164. ADMIN & FINANCE
// saja (requireRole di dalam sub-invoice.service.ts, K155); kepemilikan lewat
// forTenant() di service yang sama (K44) — id milik tenant lain → 404.
export const GET = withTenant(async (ctx, req, { params }: Ctx) => {
  const download = new URL(req.url).searchParams.get('download') === '1'
  const data = await subInvoiceToData(ctx, params.id)

  const element = React.createElement(SubInvoiceDocument, { data }) as React.ReactElement<DocumentProps>
  const buffer = await renderToBuffer(element)
  const filename = `${data.docNumber.replace(/[\\/]/g, '-')}.pdf`

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
})
