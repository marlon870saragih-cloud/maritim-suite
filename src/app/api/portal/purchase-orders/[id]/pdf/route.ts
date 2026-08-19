// PDF Purchase Order via portal (K171 — baris tabel PO eksplisit menyebut
// "PDF"). Kop dokumen tetap kop AGENSI — salinan persis PDF internal.

import React from 'react'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { withPortal } from '@/services/portal/http'
import { systemContext } from '@/services/context'
import { notFound } from '@/services/errors'
import { purchaseToProcData } from '@/lib/pdf/purchase-proc-data'
import { ProcurementDocument } from '@/lib/pdf/ProcurementDocument'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export const GET = withPortal(async (pctx, req, { params }: Ctx) => {
  // Kepemilikan dibuktikan LEBIH DULU lewat pctx.db (portal-guard+RLS) —
  // baru sesudah itu jalur internal (systemContext) merender PDF yang sama
  // persis dengan yang dipakai staf.
  const milik = await pctx.db.purchaseOrder.findFirst({ where: { id: params.id, kind: 'PO' }, select: { id: true } })
  if (!milik) throw notFound('Purchase Order')

  const download = new URL(req.url).searchParams.get('download') === '1'
  const data = await purchaseToProcData(systemContext(pctx.tenantId), params.id)

  const element = React.createElement(ProcurementDocument, { data }) as React.ReactElement<DocumentProps>
  const buffer = await renderToBuffer(element)
  const filename = `${data.docNumber.replace(/[\\/]/g, '-')}.pdf`

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
})
