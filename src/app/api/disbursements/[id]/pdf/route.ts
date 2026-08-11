import React from 'react'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { withTenant } from '@/services/http'
import { disbursementToEpdaData } from '@/lib/pdf/disbursement-epda-data'
import { DisbursementDocument } from '@/lib/pdf/EpdaDocument'

// react-pdf butuh runtime Node (fontkit/fs), bukan edge — sama seperti api/documents/{epda,fpda}.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// GET (?download=1) — Fase 3d/K48. Pakai ulang mesin PDF lama; hanya sumber datanya
// yang baru (Disbursement v2 lewat disbursement-epda-data.ts). Tak pernah menulis apa
// pun (K41: tak ada blob PDF disimpan, selalu dirender ulang saat diminta).
export const GET = withTenant(async (ctx, req, { params }: Ctx) => {
  const download = new URL(req.url).searchParams.get('download') === '1'
  const { data, variant } = await disbursementToEpdaData(ctx, params.id)

  const element = React.createElement(DisbursementDocument, { data, variant }) as React.ReactElement<DocumentProps>
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
