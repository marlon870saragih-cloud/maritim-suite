import { makeDisbursementHandlers } from '@/lib/pdf/disbursement-handlers'
import { SAMPLE_FPDA } from '@/lib/pdf/epda-data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const handlers = makeDisbursementHandlers({ variant: 'FPDA', docType: 'FPDA', sample: SAMPLE_FPDA })
export const GET = handlers.GET
export const POST = handlers.POST
