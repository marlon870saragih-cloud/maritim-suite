// Merek portal ber-slug (K182) — PUBLIK, dibaca SEBELUM login. Lihat catatan
// panjang di public-branding.ts untuk alasan tanpa withPortal()/withTenant().

import { toResponse } from '@/services/http'
import { brandingPublikUntukSlug } from '@/services/portal/public-branding'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { slug: string } }

// GET /api/portal/branding/[slug] — slug tak ketemu → 404 rapi (K182/8).
export const GET = async (_req: Request, { params }: Ctx): Promise<Response> => {
  try {
    const data = await brandingPublikUntukSlug(params.slug)
    // Merek publik boleh di-cache singkat — bukan data pribadi, dan cache
    // basi paling buruk menampilkan logo/warna lama sebentar (K181, alasan
    // yang sama dipakai untuk logo).
    return Response.json(data, { headers: { 'Cache-Control': 'public, max-age=300' } })
  } catch (e) {
    return toResponse(e)
  }
}
