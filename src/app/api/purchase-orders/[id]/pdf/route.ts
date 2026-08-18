import React from 'react'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { withTenant } from '@/services/http'
import { purchaseToProcData } from '@/lib/pdf/purchase-proc-data'
import { ProcurementDocument } from '@/lib/pdf/ProcurementDocument'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// GET (?download=1) — K119: mesin PDF LAMA dipakai ulang, hanya sumber datanya baru (v2, K48-style).
export const GET = withTenant(async (ctx, req, { params }: Ctx) => {
  const download = new URL(req.url).searchParams.get('download') === '1'
  const data = await purchaseToProcData(ctx, params.id)

  const element = React.createElement(ProcurementDocument, { data }) as React.ReactElement<DocumentProps>
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
