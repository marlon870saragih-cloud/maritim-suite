import { withTenant } from '@/services/http'
import { riwayatPesanKlien } from '@/services/whatsapp/wa-message-read.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// GET /api/automation/client-messages/[id]/history?take&cursor — riwayat audit pesan & approval tertaut (allowlist)
export const GET = withTenant(async (ctx, req, { params }: Ctx) => {
  const q = new URL(req.url).searchParams
  const take = q.get('take')
  const data = await riwayatPesanKlien(ctx, {
    messageId: params.id,
    take: take === null ? undefined : /^\d{1,3}$/.test(take) ? Number(take) : take,
    cursor: q.get('cursor') ?? undefined,
  })
  return Response.json({ ok: true, data })
})
