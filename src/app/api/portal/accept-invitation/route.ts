// K168 — route portal yang berjalan TANPA sesi apa pun (penerima undangan
// belum jadi siapa-siapa). Sengaja BUKAN withTenant ataupun withPortal —
// keduanya mewajibkan sesi yang belum bisa ada di sini. (Sejak 8i/K182 ada
// satu lagi jalur tanpa sesi: `GET /api/portal/branding/[slug]` — merek
// portal ber-slug yang dibaca SEBELUM login, lihat public-branding.ts.)

import { jsonBody, toResponse } from '@/services/http'
import { acceptPortalInvitation } from '@/services/portal/access.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/portal/accept-invitation { token, password, name? }
export const POST = async (req: Request): Promise<Response> => {
  try {
    const body = await jsonBody(req)
    const token = typeof body.token === 'string' ? body.token : ''
    const hasil = await acceptPortalInvitation(token, body)
    return Response.json({ ok: true, ...hasil }, { status: 201 })
  } catch (e) {
    return toResponse(e)
  }
}
