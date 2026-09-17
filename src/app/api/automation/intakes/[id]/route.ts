import { jejakDari, jsonBody, withTenant } from '@/services/http'
import { getIntake, updateIntake } from '@/services/intake/intake.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// GET /api/automation/intakes/[id] → detail tinjauan (kontak dihapus pada status akhir)
export const GET = withTenant(async (ctx, _req, { params }: Ctx) => {
  const intake = await getIntake(ctx, params.id)
  return Response.json({ intake })
})

// PATCH /api/automation/intakes/[id] { version, fields?, vessels?, select?, confirm?, leaveEmpty?, … }
export const PATCH = withTenant(async (ctx, req, { params }: Ctx) => {
  const intake = await updateIntake(ctx, params.id, await jsonBody(req), jejakDari(req))
  return Response.json({ ok: true, intake })
})
