import React from 'react'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { getServerSession } from 'next-auth'
import type { DocType } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveDocLinks } from '@/lib/document-links'
import { DisbursementDocument } from '@/lib/pdf/EpdaDocument'
import { computeTotals, type EpdaData, type EpdaTenant } from '@/lib/pdf/epda-data'
import { epdaTenantForSession } from '@/lib/pdf/tenant'

type Variant = 'EPDA' | 'FPDA'

/**
 * Factory handler untuk dokumen disbursement (EPDA & FPDA) — struktur identik,
 * beda variant/docType/data contoh. Dipakai oleh route /api/documents/{epda,fpda}.
 */
export function makeDisbursementHandlers(opts: { variant: Variant; docType: DocType; sample: EpdaData }) {
  const { variant, docType, sample } = opts

  function pdfResponse(data: EpdaData, download: boolean) {
    const filename = `${(data.docNumber || variant).replace(/[\\/]/g, '-')}.pdf`
    const element = React.createElement(DisbursementDocument, { data, variant }) as React.ReactElement<DocumentProps>
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

  function mergeData(body: Partial<EpdaData>, tenant: EpdaTenant | null): EpdaData {
    return {
      ...sample,
      ...body,
      tenant: tenant ?? sample.tenant,
      sections: Array.isArray(body.sections) && body.sections.length ? body.sections : sample.sections,
      notes: Array.isArray(body.notes) && body.notes.length ? body.notes : sample.notes,
      agencyPct: Number.isFinite(body.agencyPct) ? Number(body.agencyPct) : sample.agencyPct,
      usdRate: body.usdRate ? Number(body.usdRate) : sample.usdRate,
      advanceReceived: body.advanceReceived != null ? Number(body.advanceReceived) : sample.advanceReceived,
    }
  }

  async function GET(req: Request) {
    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    const download = url.searchParams.get('download') === '1'
    const asJson = url.searchParams.get('json') === '1'
    const session = await getServerSession(authOptions)

    if (id) {
      if (!session?.user) return new Response('Unauthorized', { status: 401 })
      const doc = await prisma.maritimeDocument.findFirst({
        where: { id, tenantId: session.user.tenantId, docType },
      })
      if (!doc) return new Response('Not found', { status: 404 })
      const stored = (doc.lineItems ?? {}) as Partial<EpdaData>
      if (asJson) return Response.json(stored)
      return pdfResponse(mergeData(stored, await epdaTenantForSession(session.user.tenantId)), download)
    }

    const tenant = await epdaTenantForSession(session?.user?.tenantId)
    return pdfResponse(mergeData(sample, tenant), download)
  }

  async function POST(req: Request) {
    const url = new URL(req.url)
    const save = url.searchParams.get('save') === '1'
    const download = url.searchParams.get('download') === '1'
    const body = (await req.json().catch(() => ({}))) as Partial<EpdaData>
    const session = await getServerSession(authOptions)
    const tenant = await epdaTenantForSession(session?.user?.tenantId)
    const data = mergeData(body, tenant)

    if (save) {
      if (!session?.user) return new Response('Unauthorized', { status: 401 })
      const totals = computeTotals(data)
      const { tenant: _omit, ...payload } = data
      const fields = {
        docNumber: data.docNumber || variant,
        port: data.port || null,
        currency: data.currency || 'IDR',
        lineItems: payload as object,
        subtotals: { subtotal: totals.subtotal, agencyAmount: totals.agencyAmount } as object,
        grandTotal: totals.total,
        agencyPct: data.agencyPct,
        agencyAmt: totals.agencyAmount,
      }

      const id = url.searchParams.get('id')
      if (id) {
        const upd = await prisma.maritimeDocument.updateMany({
          where: { id, tenantId: session.user.tenantId, docType },
          data: fields,
        })
        if (upd.count === 0) return new Response('Not found', { status: 404 })
        return Response.json({ ok: true, id, docNumber: fields.docNumber })
      }

      const links = await resolveDocLinks({
        portCallId: url.searchParams.get('portcall'),
        fromId: url.searchParams.get('from'),
        tenantId: session.user.tenantId,
      })
      const doc = await prisma.maritimeDocument.create({
        data: { tenantId: session.user.tenantId, docType, status: 'DRAFT', ...fields, ...links },
      })
      return Response.json({ ok: true, id: doc.id, docNumber: doc.docNumber })
    }

    return pdfResponse(data, download)
  }

  return { GET, POST }
}
