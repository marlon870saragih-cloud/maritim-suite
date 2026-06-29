import { makeReportHandlers } from '@/lib/pdf/report-handlers'
import { SAMPLE_ARRIVAL } from '@/lib/pdf/report-data'

// react-pdf butuh runtime Node (fontkit/fs), bukan edge.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const handlers = makeReportHandlers({ docType: 'ARRIVAL_REPORT', sample: SAMPLE_ARRIVAL })
export const GET = handlers.GET
export const POST = handlers.POST
