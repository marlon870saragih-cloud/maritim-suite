// Profil pengguna portal — nama, telepon, kata sandi sendiri (K169).

import { withPortal } from '@/services/portal/http'
import { jsonBody } from '@/services/http'
import { getProfilPortal, updateProfilPortal } from '@/services/portal/profile.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withPortal(async (pctx) => {
  return Response.json(await getProfilPortal(pctx))
})

// PATCH { name?, phone?, password? }
export const PATCH = withPortal(async (pctx, req) => {
  return Response.json(await updateProfilPortal(pctx, await jsonBody(req)))
})
