import { withTenant } from '@/services/http'
import { hentikanPemantauan } from '@/services/automation/monitoring.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// DELETE /api/automation/monitored-voyages/[id] → hentikan pemantauan (bukan hapus baris).
export const DELETE = withTenant(async (ctx, _req, { params }: Ctx) => {
  await hentikanPemantauan(ctx, params.id)
  return Response.json({ ok: true })
})
