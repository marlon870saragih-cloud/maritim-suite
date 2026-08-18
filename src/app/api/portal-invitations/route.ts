// Undangan portal (K166/K168) — sisi INTERNAL, sesi staf biasa (withTenant).

import { withTenant, jsonBody } from '@/services/http'
import { inviteToPortal, listPortalInvitations } from '@/services/portal/invitation.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/portal-invitations?customerId=&vendorId=
export const GET = withTenant(async (ctx, req) => {
  const q = new URL(req.url).searchParams
  return Response.json(
    await listPortalInvitations(ctx, { customerId: q.get('customerId'), vendorId: q.get('vendorId') }),
  )
})

// POST /api/portal-invitations { pihak, email, customerId? | vendorId? }
export const POST = withTenant(async (ctx, req) => {
  const hasil = await inviteToPortal(ctx, await jsonBody(req))
  return Response.json({ ok: true, ...hasil }, { status: 201 })
})
