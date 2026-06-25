import { makeDisbursementHandlers } from '@/lib/pdf/disbursement-handlers'
import { SAMPLE_EPDA } from '@/lib/pdf/epda-data'

// react-pdf butuh runtime Node (fontkit/fs), bukan edge.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const handlers = makeDisbursementHandlers({ variant: 'EPDA', docType: 'EPDA', sample: SAMPLE_EPDA })
export const GET = handlers.GET
export const POST = handlers.POST
