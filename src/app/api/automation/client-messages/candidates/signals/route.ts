import { withTenant } from '@/services/http'
import { kandidatSinyalPesanKlien } from '@/services/whatsapp/wa-message-read.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/automation/client-messages/candidates/signals?voyageId&take — sinyal yang dapat menjadi pesan klien (petunjuk)
export const GET = withTenant(async (ctx, req) => {
  const q = new URL(req.url).searchParams
  const take = q.get('take')
  const data = await kandidatSinyalPesanKlien(ctx, {
    voyageId: q.get('voyageId') ?? undefined,
    take: take === null ? undefined : /^\d{1,3}$/.test(take) ? Number(take) : take,
  })
  return Response.json({ ok: true, data })
})
