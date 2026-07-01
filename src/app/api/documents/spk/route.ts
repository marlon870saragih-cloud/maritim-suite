import React from 'react'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveDocLinks } from '@/lib/document-links'
import { SpkDocument } from '@/lib/pdf/SpkDocument'
import { SAMPLE_SPK, type SpkData } from '@/lib/pdf/spk-data'
import { epdaTenantForSession } from '@/lib/pdf/tenant'
import type { EpdaTenant } from '@/lib/pdf/epda-data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FALLBACK_NO = 'SPK'

function pdfResponse(data: SpkData, download: boolean) {
  const filename = `${(data.docNumber || FALLBACK_NO).replace(/[\\/]/g, '-')}.pdf`
  const element = React.createElement(SpkDocument, { data }) as React.ReactElement<DocumentProps>
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

// Gabung sample + input; identitas & penanda tangan default diturunkan dari Tenant (DB).
function mergeData(body: Partial<SpkData>, tenant: EpdaTenant | null): SpkData {
  const t = tenant ?? SAMPLE_SPK.tenant
  return {
    ...SAMPLE_SPK,
    ...body,
    tenant: t,
    scopeItems:
      Array.isArray(body.scopeItems) && body.scopeItems.length ? body.scopeItems : SAMPLE_SPK.scopeItems,
    terms: Array.isArray(body.terms) && body.terms.length ? body.terms : SAMPLE_SPK.terms,
    // Penanda tangan: pakai input bila diisi, kalau kosong ambil dari profil perusahaan.
    approvedByName: body.approvedByName?.trim() || t.signerName || SAMPLE_SPK.approvedByName,
    approvedByTitle: body.approvedByTitle?.trim() || t.signerTitle || SAMPLE_SPK.approvedByTitle,
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
      where: { id, tenantId: session.user.tenantId, docType: 'SPK' },
    })
    if (!doc) return new Response('Not found', { status: 404 })
    const stored = (doc.lineItems ?? {}) as Partial<SpkData>
    if (asJson) return Response.json(stored)
    return pdfResponse(mergeData(stored, await epdaTenantForSession(session.user.tenantId)), download)
  }

  const tenant = await epdaTenantForSession(session?.user?.tenantId)
  return pdfResponse(mergeData(SAMPLE_SPK, tenant), download)
}

export async function POST(req: Request) {
  const url = new URL(req.url)
  const save = url.searchParams.get('save') === '1'
  const download = url.searchParams.get('download') === '1'
  const body = (await req.json().catch(() => ({}))) as Partial<SpkData>
  const session = await getServerSession(authOptions)
  const tenant = await epdaTenantForSession(session?.user?.tenantId)
  const data = mergeData(body, tenant)

  if (save) {
    if (!session?.user) return new Response('Unauthorized', { status: 401 })
    const { tenant: _omit, ...payload } = data
    const fields = {
      docNumber: data.docNumber || FALLBACK_NO,
      port: data.loadPort || null,
      currency: 'IDR',
      lineItems: payload as object,
      // SPK bukan dokumen uang — tak ada subtotal/total.
      subtotals: undefined,
      grandTotal: null,
    }

    const existingId = url.searchParams.get('id')
    if (existingId) {
      const upd = await prisma.maritimeDocument.updateMany({
        where: { id: existingId, tenantId: session.user.tenantId, docType: 'SPK' },
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
      data: { tenantId: session.user.tenantId, docType: 'SPK', status: 'DRAFT', ...fields, ...links },
    })
    return Response.json({ ok: true, id: doc.id })
  }

  return pdfResponse(data, download)
}
