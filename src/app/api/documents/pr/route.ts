import { makeProcurementHandlers } from '@/lib/pdf/procurement-handlers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const handlers = makeProcurementHandlers({ kind: 'pr', docType: 'PURCHASE_REQUISITION' })
export const GET = handlers.GET
export const POST = handlers.POST
