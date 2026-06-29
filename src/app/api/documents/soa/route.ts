import React from 'react'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveDocLinks } from '@/lib/document-links'
import { SoaDocument } from '@/lib/pdf/SoaDocument'
import { SAMPLE_SOA, computeSoaTotals, type SoaData } from '@/lib/pdf/soa-data'
import { epdaTenantForSession } from '@/lib/pdf/tenant'
import type { EpdaTenant } from '@/lib/pdf/epda-data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DOC_TYPE = 'STATEMENT_OF_ACCOUNT' as const

function pdfResponse(data: SoaData, download: boolean) {
  const filename = `${(data.docNumber || 'SOA').replace(/[\\/]/g, '-')}.pdf`
  const element = React.createElement(SoaDocument, { data }) as React.ReactElement<DocumentProps>
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

function mergeData(body: Partial<SoaData>, tenant: EpdaTenant | null): SoaData {
  return {
    ...SAMPLE_SOA,
    ...body,
    tenant: tenant ?? SAMPLE_SOA.tenant,
    rows: Array.isArray(body.rows) ? body.rows : SAMPLE_SOA.rows,
    openingBalance: Number.isFinite(body.openingBalance) ? Number(body.openingBalance) : SAMPLE_SOA.openingBalance,
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
      where: { id, tenantId: session.user.tenantId, docType: DOC_TYPE },
    })
    if (!doc) return new Response('Not found', { status: 404 })
    const stored = (doc.lineItems ?? {}) as Partial<SoaData>
    if (asJson) return Response.json(stored)
    return pdfResponse(mergeData(stored, await epdaTenantForSession(session.user.tenantId)), download)
  }

  const tenant = await epdaTenantForSession(session?.user?.tenantId)
  return pdfResponse(mergeData(SAMPLE_SOA, tenant), download)
}

export async function POST(req: Request) {
  const url = new URL(req.url)
  const save = url.searchParams.get('save') === '1'
  const download = url.searchParams.get('download') === '1'
  const body = (await req.json().catch(() => ({}))) as Partial<SoaData>
  const session = await getServerSession(authOptions)
  const tenant = await epdaTenantForSession(session?.user?.tenantId)
  const data = mergeData(body, tenant)

  if (save) {
    if (!session?.user) return new Response('Unauthorized', { status: 401 })
    const totals = computeSoaTotals(data)
    const { tenant: _omit, ...payload } = data
    const fields = {
      docNumber: data.docNumber || 'SOA',
      port: data.toName || null,
      currency: data.currency || 'IDR',
      lineItems: payload as object,
      subtotals: { billed: totals.billed, paid: totals.paid } as object,
      grandTotal: totals.outstanding,
    }

    const existingId = url.searchParams.get('id')
    if (existingId) {
      const upd = await prisma.maritimeDocument.updateMany({
        where: { id: existingId, tenantId: session.user.tenantId, docType: DOC_TYPE },
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
      data: { tenantId: session.user.tenantId, docType: DOC_TYPE, status: 'DRAFT', ...fields, ...links },
    })
    return Response.json({ ok: true, id: doc.id })
  }

  return pdfResponse(data, download)
}
