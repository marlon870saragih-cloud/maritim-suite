import React from 'react'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { withTenant } from '@/services/http'
import { paymentToReceiptData } from '@/lib/pdf/receipt-v2-data'
import { ReceiptDocument } from '@/lib/pdf/ReceiptDocument'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string; paymentId: string } }

// GET (?download=1) — Fase 4b, kwitansi satu pembayaran Invoice. Pakai ulang
// mesin PDF Receipt lama; sumber datanya InvoicePayment v2 lewat receipt-v2-data.ts.
export const GET = withTenant(async (ctx, req, { params }: Ctx) => {
  const download = new URL(req.url).searchParams.get('download') === '1'
  const data = await paymentToReceiptData(ctx, params.id, params.paymentId)

  const element = React.createElement(ReceiptDocument, { data }) as React.ReactElement<DocumentProps>
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
