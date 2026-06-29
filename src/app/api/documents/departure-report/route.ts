import { makeReportHandlers } from '@/lib/pdf/report-handlers'
import { SAMPLE_DEPARTURE } from '@/lib/pdf/report-data'

// react-pdf butuh runtime Node (fontkit/fs), bukan edge.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const handlers = makeReportHandlers({ docType: 'DEPARTURE_REPORT', sample: SAMPLE_DEPARTURE })
export const GET = handlers.GET
export const POST = handlers.POST
