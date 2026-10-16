import { jsonBodyKetat, withTenant } from '@/services/http'
import { gerbangWa2 } from '@/services/whatsapp/wa2-gate'
import { pratinjauPesanKlien } from '@/services/whatsapp/wa-message.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// POST /api/automation/client-messages/[id]/preview { snapshotFingerprint }
export const POST = withTenant(async (ctx, req, { params }: Ctx) => {
  gerbangWa2(ctx) // gerbang SEBELUM body dibaca (CSRF/content-type/ukuran diperiksa sesudahnya)
  const b = await jsonBodyKetat(req)
  const h = await pratinjauPesanKlien(ctx, { messageId: params.id, snapshotFingerprint: b.snapshotFingerprint })
  return Response.json({ ok: true, ...h })
})
