// Logo tenant untuk sesi portal AUTENTIK (K181) — dipakai PortalNav.tsx
// sesudah login. Beda dari `/api/portal/branding/[slug]/logo` (publik,
// sebelum login): rute ini butuh sesi (withPortal), dan tenantId berasal
// darinya, tak pernah dari input.

import { withPortal } from '@/services/portal/http'
import { notFound } from '@/services/errors'
import { bacaLogoUntukSesi } from '@/services/portal/profile.service'
import { penyimpananLokal } from '@/services/ops/storage/local'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withPortal(async (pctx) => {
  const att = await bacaLogoUntukSesi(pctx)
  if (!att) throw notFound('Logo')
  const isi = await penyimpananLokal.baca(att.storageKey)

  const h = new Headers()
  h.set('Content-Type', att.mimeType)
  h.set('Content-Length', String(isi.length))
  h.set('Content-Security-Policy', "default-src 'none'; sandbox")
  h.set('X-Content-Type-Options', 'nosniff')
  h.set('Cache-Control', 'private, no-store')
  return new Response(new Uint8Array(isi), { status: 200, headers: h })
})
