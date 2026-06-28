import React from 'react'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ReceiptDocument } from '@/lib/pdf/ReceiptDocument'
import { SAMPLE_RECEIPT, type ReceiptData } from '@/lib/pdf/receipt-data'
import { epdaTenantForSession } from '@/lib/pdf/tenant'
import type { EpdaTenant } from '@/lib/pdf/epda-data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DOC_TYPE = 'OFFICIAL_RECEIPT' as const

function pdfResponse(data: ReceiptData, download: boolean) {
  const filename = `${(data.docNumber || 'KWITANSI').replace(/[\\/]/g, '-')}.pdf`
  const element = React.createElement(ReceiptDocument, { data }) as React.ReactElement<DocumentProps>
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

function mergeData(body: Partial<ReceiptData>, tenant: EpdaTenant | null): ReceiptData {
  return {
    ...SAMPLE_RECEIPT,
    ...body,
    tenant: tenant ?? SAMPLE_RECEIPT.tenant,
    amount: Number.isFinite(body.amount) ? Number(body.amount) : SAMPLE_RECEIPT.amount,
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
    const stored = (doc.lineItems ?? {}) as Partial<ReceiptData>
    if (asJson) return Response.json(stored)
    return pdfResponse(mergeData(stored, await epdaTenantForSession(session.user.tenantId)), download)
  }

  const tenant = await epdaTenantForSession(session?.user?.tenantId)
  return pdfResponse(mergeData(SAMPLE_RECEIPT, tenant), download)
}

export async function POST(req: Request) {
  const url = new URL(req.url)
  const save = url.searchParams.get('save') === '1'
  const download = url.searchParams.get('download') === '1'
  const body = (await req.json().catch(() => ({}))) as Partial<ReceiptData>
  const session = await getServerSession(authOptions)
  const tenant = await epdaTenantForSession(session?.user?.tenantId)
  const data = mergeData(body, tenant)

  if (save) {
    if (!session?.user) return new Response('Unauthorized', { status: 401 })
    const { tenant: _omit, ...payload } = data
    const fields = {
      docNumber: data.docNumber || 'KWITANSI',
      port: data.place || null,
      currency: data.currency || 'IDR',
      lineItems: payload as object,
      subtotals: { amount: data.amount } as object,
      grandTotal: data.amount,
    }

    const id = url.searchParams.get('id')
    if (id) {
      const upd = await prisma.maritimeDocument.updateMany({
        where: { id, tenantId: session.user.tenantId, docType: DOC_TYPE },
        data: fields,
      })
      if (upd.count === 0) return new Response('Not found', { status: 404 })
      return Response.json({ ok: true, id })
    }

    const doc = await prisma.maritimeDocument.create({
      data: { tenantId: session.user.tenantId, docType: DOC_TYPE, status: 'DRAFT', ...fields },
    })
    return Response.json({ ok: true, id: doc.id })
  }

  return pdfResponse(data, download)
}
