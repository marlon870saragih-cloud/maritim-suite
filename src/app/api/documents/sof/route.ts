import React from 'react'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { SofDocument } from '@/lib/pdf/SofDocument'
import { SAMPLE_SOF, type SofData } from '@/lib/pdf/sof-data'
import { epdaTenantForSession } from '@/lib/pdf/tenant'
import type { EpdaTenant } from '@/lib/pdf/epda-data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DOC_TYPE = 'SOF' as const

function pdfResponse(data: SofData, download: boolean) {
  const filename = `${(data.docNumber || 'SOF').replace(/[\\/]/g, '-')}.pdf`
  const element = React.createElement(SofDocument, { data }) as React.ReactElement<DocumentProps>
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

function mergeData(body: Partial<SofData>, tenant: EpdaTenant | null): SofData {
  return {
    ...SAMPLE_SOF,
    ...body,
    tenant: tenant ?? SAMPLE_SOF.tenant,
    events: Array.isArray(body.events) ? body.events : SAMPLE_SOF.events,
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
    const stored = (doc.lineItems ?? {}) as Partial<SofData>
    if (asJson) return Response.json(stored)
    return pdfResponse(mergeData(stored, await epdaTenantForSession(session.user.tenantId)), download)
  }

  const tenant = await epdaTenantForSession(session?.user?.tenantId)
  return pdfResponse(mergeData(SAMPLE_SOF, tenant), download)
}

export async function POST(req: Request) {
  const url = new URL(req.url)
  const save = url.searchParams.get('save') === '1'
  const download = url.searchParams.get('download') === '1'
  const body = (await req.json().catch(() => ({}))) as Partial<SofData>
  const session = await getServerSession(authOptions)
  const tenant = await epdaTenantForSession(session?.user?.tenantId)
  const data = mergeData(body, tenant)

  if (save) {
    if (!session?.user) return new Response('Unauthorized', { status: 401 })
    const { tenant: _omit, ...payload } = data
    const fields = {
      docNumber: data.docNumber || 'SOF',
      port: data.port || null,
      currency: 'IDR',
      lineItems: payload as object,
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
    const doc = await prisma.maritimeDocument.create({
      data: { tenantId: session.user.tenantId, docType: DOC_TYPE, status: 'DRAFT', ...fields },
    })
    return Response.json({ ok: true, id: doc.id })
  }

  return pdfResponse(data, download)
}
