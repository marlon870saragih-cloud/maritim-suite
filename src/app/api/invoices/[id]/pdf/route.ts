import React from 'react'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { withTenant } from '@/services/http'
import { invoiceToInvoiceData } from '@/lib/pdf/invoice-v2-data'
import { InvoiceDocument } from '@/lib/pdf/InvoiceDocument'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// GET (?download=1) — Fase 4b. Pakai ulang mesin PDF Invoice lama; sumber
// datanya Invoice v2 lewat invoice-v2-data.ts. Tak pernah menulis apa pun.
export const GET = withTenant(async (ctx, req, { params }: Ctx) => {
  const download = new URL(req.url).searchParams.get('download') === '1'
  const data = await invoiceToInvoiceData(ctx, params.id)

  const element = React.createElement(InvoiceDocument, { data }) as React.ReactElement<DocumentProps>
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
