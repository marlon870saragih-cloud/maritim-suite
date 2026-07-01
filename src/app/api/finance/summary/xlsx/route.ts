import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getFinanceSummary } from '@/lib/finance-summary'
import { buildFinanceWorkbook } from '@/lib/finance-xlsx'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return new Response('Unauthorized', { status: 401 })
  const summary = await getFinanceSummary()
  if (!summary) return new Response('No data', { status: 404 })

  const buffer = await buildFinanceWorkbook(summary)
  return new Response(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="ringkasan-keuangan-${summary.generatedAt}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
