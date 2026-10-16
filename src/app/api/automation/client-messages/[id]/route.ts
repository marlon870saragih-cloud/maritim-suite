import { withTenant } from '@/services/http'
import { detailPesanKlien } from '@/services/whatsapp/wa-message-read.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// GET /api/automation/client-messages/[id] — detail snapshot (nomor tersamar, field allowlist)
export const GET = withTenant(async (ctx, _req, { params }: Ctx) => {
  const data = await detailPesanKlien(ctx, { messageId: params.id })
  return Response.json({ ok: true, data })
})
