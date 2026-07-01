import React from 'react'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { FinanceSummaryDocument } from '@/lib/pdf/FinanceSummaryDocument'
import { getFinanceSummary } from '@/lib/finance-summary'
import { epdaTenantForSession } from '@/lib/pdf/tenant'
import { SAMPLE_EPDA } from '@/lib/pdf/epda-data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  const [tenant, summary] = await Promise.all([
    epdaTenantForSession(session.user.tenantId),
    getFinanceSummary(),
  ])
  if (!summary) return new Response('No data', { status: 404 })

  const download = new URL(req.url).searchParams.get('download') === '1'
  const element = React.createElement(FinanceSummaryDocument, {
    tenant: tenant ?? SAMPLE_EPDA.tenant,
    summary,
  }) as React.ReactElement<DocumentProps>
  const buffer = await renderToBuffer(element)

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="ringkasan-keuangan-${summary.generatedAt}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
