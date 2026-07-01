import React from 'react'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { getServerSession } from 'next-auth'
import type { DocType } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveDocLinks } from '@/lib/document-links'
import { SimpleDocument } from '@/lib/pdf/SimpleDocument'
import { getSimpleSchema, mergeSimple, type SimpleData, type SimpleSchema } from '@/lib/pdf/simple-docs'
import { epdaTenantForSession } from '@/lib/pdf/tenant'
import type { EpdaTenant } from '@/lib/pdf/epda-data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function pdfResponse(schema: SimpleSchema, data: SimpleData, tenant: EpdaTenant | null, download: boolean) {
  const filename = `${(data.docNumber || schema.prefix).replace(/[\\/]/g, '-')}.pdf`
  const render = { ...data, tenant: tenant ?? ({ companyName: 'Company' } as EpdaTenant), docType: schema.docType }
  const element = React.createElement(SimpleDocument, { data: render }) as React.ReactElement<DocumentProps>
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

export async function GET(req: Request, { params }: { params: { type: string } }) {
  const schema = getSimpleSchema(params.type)
  if (!schema) return new Response('Unknown document type', { status: 404 })

  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  const download = url.searchParams.get('download') === '1'
  const asJson = url.searchParams.get('json') === '1'
  const session = await getServerSession(authOptions)

  if (id) {
    if (!session?.user) return new Response('Unauthorized', { status: 401 })
    const doc = await prisma.maritimeDocument.findFirst({
      where: { id, tenantId: session.user.tenantId, docType: schema.docType as DocType },
    })
    if (!doc) return new Response('Not found', { status: 404 })
    const stored = (doc.lineItems ?? {}) as Partial<SimpleData>
    if (asJson) return Response.json(stored)
    return pdfResponse(schema, mergeSimple(schema, stored), await epdaTenantForSession(session.user.tenantId), download)
  }

  const tenant = await epdaTenantForSession(session?.user?.tenantId)
  return pdfResponse(schema, mergeSimple(schema, {}), tenant, download)
}

export async function POST(req: Request, { params }: { params: { type: string } }) {
  const schema = getSimpleSchema(params.type)
  if (!schema) return new Response('Unknown document type', { status: 404 })

  const url = new URL(req.url)
  const save = url.searchParams.get('save') === '1'
  const download = url.searchParams.get('download') === '1'
  const body = (await req.json().catch(() => ({}))) as Partial<SimpleData>
  const session = await getServerSession(authOptions)
  const tenant = await epdaTenantForSession(session?.user?.tenantId)
  const data = mergeSimple(schema, body)

  if (save) {
    if (!session?.user) return new Response('Unauthorized', { status: 401 })
    const fields = {
      docNumber: data.docNumber || schema.prefix,
      port: data.fields.port || null,
      currency: 'IDR',
      lineItems: data as object,
    }
    const existingId = url.searchParams.get('id')
    if (existingId) {
      const upd = await prisma.maritimeDocument.updateMany({
        where: { id: existingId, tenantId: session.user.tenantId, docType: schema.docType as DocType },
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
      data: { tenantId: session.user.tenantId, docType: schema.docType as DocType, status: 'DRAFT', ...fields, ...links },
    })
    return Response.json({ ok: true, id: doc.id })
  }

  return pdfResponse(schema, data, tenant, download)
}
