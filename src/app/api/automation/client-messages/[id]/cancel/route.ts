import { jsonBodyKetat, withTenant } from '@/services/http'
import { gerbangWa2 } from '@/services/whatsapp/wa2-gate'
import { batalkanPesanKlien } from '@/services/whatsapp/wa-message-approval.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// POST /api/automation/client-messages/[id]/cancel { alasan } — APPROVED masih dapat dibatalkan
export const POST = withTenant(async (ctx, req, { params }: Ctx) => {
  gerbangWa2(ctx) // gerbang SEBELUM body dibaca (CSRF/content-type/ukuran diperiksa sesudahnya)
  const b = await jsonBodyKetat(req)
  const h = await batalkanPesanKlien(ctx, { messageId: params.id, alasan: b.alasan })
  return Response.json({ ok: true, ...h })
})
