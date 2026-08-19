// PDF Invoice via portal (K167). Kop dokumen tetap kop AGENSI (tenant) —
// beda dari kuitansi langganan (K164/Fase 8e) yang sengaja memakai identitas
// PENJUAL. Di sini pelanggan mengunduh SALINAN persis PDF yang sama dengan
// yang agensi hasilkan secara internal untuk tagihannya sendiri.

import React from 'react'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { withPortal } from '@/services/portal/http'
import { systemContext } from '@/services/context'
import { notFound } from '@/services/errors'
import { invoiceToInvoiceData } from '@/lib/pdf/invoice-v2-data'
import { InvoiceDocument } from '@/lib/pdf/InvoiceDocument'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export const GET = withPortal(async (pctx, req, { params }: Ctx) => {
  // Kepemilikan dibuktikan LEBIH DULU lewat pctx.db (portal-guard+RLS) —
  // baru sesudah itu jalur internal (systemContext) dipakai untuk merender
  // PDF yang sama persis dengan yang dipakai staf.
  const milik = await pctx.db.invoice.findFirst({ where: { id: params.id }, select: { id: true } })
  if (!milik) throw notFound('Invoice')

  const download = new URL(req.url).searchParams.get('download') === '1'
  const data = await invoiceToInvoiceData(systemContext(pctx.tenantId), params.id)

  const element = React.createElement(InvoiceDocument, { data }) as React.ReactElement<DocumentProps>
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
