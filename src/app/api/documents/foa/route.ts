import { makeDisbursementHandlers } from '@/lib/pdf/disbursement-handlers'
import { SAMPLE_FOA } from '@/lib/pdf/epda-data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const handlers = makeDisbursementHandlers({ variant: 'FOA', docType: 'FOA', sample: SAMPLE_FOA })
export const GET = handlers.GET
export const POST = handlers.POST
