import React from 'react'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveDocLinks } from '@/lib/document-links'
import { InvoiceDocument } from '@/lib/pdf/InvoiceDocument'
import { SAMPLE_INVOICE, computeInvoiceTotals, type InvoiceData } from '@/lib/pdf/invoice-data'
import { epdaTenantForSession } from '@/lib/pdf/tenant'
import type { EpdaTenant } from '@/lib/pdf/epda-data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function pdfResponse(data: InvoiceData, download: boolean) {
  const filename = `${(data.docNumber || 'INVOICE').replace(/[\\/]/g, '-')}.pdf`
  const element = React.createElement(InvoiceDocument, { data }) as React.ReactElement<DocumentProps>
  return renderToBuffer(element).then(
    (buffer) =>
      new Response(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
          'Cache-Control': 'no-store',
        },
      }),
  )
}

function mergeData(body: Partial<InvoiceData>, tenant: EpdaTenant | null): InvoiceData {
  return {
    ...SAMPLE_INVOICE,
    ...body,
    tenant: tenant ?? SAMPLE_INVOICE.tenant,
    lines: Array.isArray(body.lines) && body.lines.length ? body.lines : SAMPLE_INVOICE.lines,
    agencyPct: Number.isFinite(body.agencyPct) ? Number(body.agencyPct) : SAMPLE_INVOICE.agencyPct,
    vatPct: Number.isFinite(body.vatPct) ? Number(body.vatPct) : SAMPLE_INVOICE.vatPct,
    paymentTerms: body.paymentTerms || SAMPLE_INVOICE.paymentTerms,
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  const download = url.searchParams.get('download') === '1'
  const asJson = url.searchParams.get('json') === '1'
  const session = await getServerSession(authOptions)

  if (id) {
    if (!session?.user) return new Response('Unauthorized', { status: 401 })
    const doc = await prisma.maritimeDocument.findFirst({
      where: { id, tenantId: session.user.tenantId, docType: 'INVOICE' },
    })
    if (!doc) return new Response('Not found', { status: 404 })
    const stored = (doc.lineItems ?? {}) as Partial<InvoiceData>
    if (asJson) return Response.json(stored)
    return pdfResponse(mergeData(stored, await epdaTenantForSession(session.user.tenantId)), download)
  }

  const tenant = await epdaTenantForSession(session?.user?.tenantId)
  return pdfResponse(mergeData(SAMPLE_INVOICE, tenant), download)
}

export async function POST(req: Request) {
  const url = new URL(req.url)
  const save = url.searchParams.get('save') === '1'
  const download = url.searchParams.get('download') === '1'
  const body = (await req.json().catch(() => ({}))) as Partial<InvoiceData>
  const session = await getServerSession(authOptions)
  const tenant = await epdaTenantForSession(session?.user?.tenantId)
  const data = mergeData(body, tenant)

  if (save) {
    if (!session?.user) return new Response('Unauthorized', { status: 401 })
    const totals = computeInvoiceTotals(data)
    const { tenant: _omit, ...payload } = data
    const fields = {
      docNumber: data.docNumber || 'INVOICE',
      port: data.portCall || null,
      currency: data.currency || 'IDR',
      lineItems: payload as object,
      subtotals: { subtotal: totals.subtotal, agency: totals.agency, dpp: totals.dpp, vat: totals.vat, exemptTotal: totals.exemptTotal } as object,
      grandTotal: totals.totalDue,
      agencyPct: data.agencyPct,
      agencyAmt: totals.agency,
    }

    const id = url.searchParams.get('id')
    if (id) {
      const upd = await prisma.maritimeDocument.updateMany({
        where: { id, tenantId: session.user.tenantId, docType: 'INVOICE' },
        data: fields,
      })
      if (upd.count === 0) return new Response('Not found', { status: 404 })
      return Response.json({ ok: true, id })
    }

    const links = await resolveDocLinks({
      portCallId: url.searchParams.get('portcall'),
      fromId: url.searchParams.get('from'),
      tenantId: session.user.tenantId,
    })
    const doc = await prisma.maritimeDocument.create({
      data: { tenantId: session.user.tenantId, docType: 'INVOICE', status: 'DRAFT', ...fields, ...links },
    })
    return Response.json({ ok: true, id: doc.id })
  }

  return pdfResponse(data, download)
}
