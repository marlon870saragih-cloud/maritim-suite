import React from 'react'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { getServerSession } from 'next-auth'
import type { DocType } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveDocLinks } from '@/lib/document-links'
import { ReportDocument } from '@/lib/pdf/ReportDocument'
import { type ReportData } from '@/lib/pdf/report-data'
import { epdaTenantForSession } from '@/lib/pdf/tenant'
import type { EpdaTenant } from '@/lib/pdf/epda-data'

/**
 * Factory handler untuk laporan pergerakan kapal (Arrival & Departure Report) —
 * struktur identik, beda docType/data contoh. Dipakai route /api/documents/{arrival,departure}-report.
 */
export function makeReportHandlers(opts: { docType: DocType; sample: ReportData }) {
  const { docType, sample } = opts

  function pdfResponse(data: ReportData, download: boolean) {
    const filename = `${(data.docNumber || sample.kind).replace(/[\\/]/g, '-')}.pdf`
    const element = React.createElement(ReportDocument, { data }) as React.ReactElement<DocumentProps>
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

  function mergeData(body: Partial<ReportData>, tenant: EpdaTenant | null): ReportData {
    return {
      ...sample,
      ...body,
      kind: sample.kind, // jenis laporan ditentukan endpoint, bukan body
      tenant: tenant ?? sample.tenant,
      events: Array.isArray(body.events) && body.events.length ? body.events : sample.events,
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
      const stored = (doc.lineItems ?? {}) as Partial<ReportData>
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
    const body = (await req.json().catch(() => ({}))) as Partial<ReportData>
    const session = await getServerSession(authOptions)
    const tenant = await epdaTenantForSession(session?.user?.tenantId)
    const data = mergeData(body, tenant)

    if (save) {
      if (!session?.user) return new Response('Unauthorized', { status: 401 })
      const { tenant: _omit, ...payload } = data
      const fields = {
        docNumber: data.docNumber || sample.kind,
        port: data.port || null,
        currency: 'IDR',
        lineItems: payload as object,
      }
      const existingId = url.searchParams.get('id')
      if (existingId) {
        const upd = await prisma.maritimeDocument.updateMany({
          where: { id: existingId, tenantId: session.user.tenantId, docType },
          data: fields,
        })
        if (upd.count === 0) return new Response('Not found', { status: 404 })
        return Response.json({ ok: true, id: existingId })
      }
      const links = await resolveDocLinks({
        portCallId: url.searchParams.get('portcall'),
        fromId: url.searchParams.get('from'),
        tenantId: session.user.tenantId,
      })
      const doc = await prisma.maritimeDocument.create({
        data: { tenantId: session.user.tenantId, docType, status: 'DRAFT', ...fields, ...links },
      })
      return Response.json({ ok: true, id: doc.id })
    }

    return pdfResponse(data, download)
  }

  return { GET, POST }
}
