import { makeNoteHandlers } from '@/lib/pdf/note-handlers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const handlers = makeNoteHandlers({ kind: 'credit', docType: 'CREDIT_NOTE' })
export const GET = handlers.GET
export const POST = handlers.POST
