import React from 'react'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { getServerSession } from 'next-auth'
import type { DocType } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveDocLinks } from '@/lib/document-links'
import { NoteDocument } from '@/lib/pdf/NoteDocument'
import { SAMPLE_DEBIT, SAMPLE_CREDIT, computeNoteTotals, type NoteData, type NoteKind } from '@/lib/pdf/note-data'
import { epdaTenantForSession } from '@/lib/pdf/tenant'
import type { EpdaTenant } from '@/lib/pdf/epda-data'

/**
 * Factory handler untuk Nota Debit & Kredit — struktur identik, beda kind/docType/contoh.
 * Dipakai route /api/documents/{debit-note,credit-note}.
 */
export function makeNoteHandlers(opts: { kind: NoteKind; docType: DocType }) {
  const { kind, docType } = opts
  const sample = kind === 'debit' ? SAMPLE_DEBIT : SAMPLE_CREDIT
  const fallbackNo = kind === 'debit' ? 'DEBIT-NOTE' : 'CREDIT-NOTE'

  function pdfResponse(data: NoteData, download: boolean) {
    const filename = `${(data.docNumber || fallbackNo).replace(/[\\/]/g, '-')}.pdf`
    const element = React.createElement(NoteDocument, { data }) as React.ReactElement<DocumentProps>
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

  function mergeData(body: Partial<NoteData>, tenant: EpdaTenant | null): NoteData {
    return {
      ...sample,
      ...body,
      kind, // dipaksa sesuai route
      tenant: tenant ?? sample.tenant,
      lines: Array.isArray(body.lines) && body.lines.length ? body.lines : sample.lines,
      vatPct: Number.isFinite(body.vatPct) ? Number(body.vatPct) : sample.vatPct,
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
      const stored = (doc.lineItems ?? {}) as Partial<NoteData>
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
    const body = (await req.json().catch(() => ({}))) as Partial<NoteData>
    const session = await getServerSession(authOptions)
    const tenant = await epdaTenantForSession(session?.user?.tenantId)
    const data = mergeData(body, tenant)

    if (save) {
      if (!session?.user) return new Response('Unauthorized', { status: 401 })
      const totals = computeNoteTotals(data)
      const { tenant: _omit, ...payload } = data
      const fields = {
        docNumber: data.docNumber || fallbackNo,
        port: data.refDoc || null,
        currency: data.currency || 'IDR',
        lineItems: payload as object,
        subtotals: { subtotal: totals.subtotal, vat: totals.vat } as object,
        grandTotal: totals.total,
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
