import { withTenant } from '@/services/http'
import { kandidatKontakPesanKlien } from '@/services/whatsapp/wa-message-read.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/automation/client-messages/candidates/contacts?signalId — kontak + kelayakan (petunjuk; draft menilai ulang)
export const GET = withTenant(async (ctx, req) => {
  const data = await kandidatKontakPesanKlien(ctx, { signalId: new URL(req.url).searchParams.get('signalId') ?? undefined })
  return Response.json({ ok: true, data })
})
