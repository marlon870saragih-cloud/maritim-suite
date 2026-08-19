// Berkas logo publik (K181/K182) — dipakai halaman masuk portal ber-slug
// SEBELUM login. Satu-satunya lampiran di seluruh aplikasi yang boleh
// disajikan publik & di-cache (K181, disebutkan eksplisit di dokumen desain):
// ia memang tampil di halaman yang belum terautentikasi.

import { toResponse } from '@/services/http'
import { notFound } from '@/services/errors'
import { logoPublikUntukSlug } from '@/services/portal/public-branding'
import { penyimpananLokal } from '@/services/ops/storage/local'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { slug: string } }

// GET /api/portal/branding/[slug]/logo
export const GET = async (_req: Request, { params }: Ctx): Promise<Response> => {
  try {
    const att = await logoPublikUntukSlug(params.slug)
    if (!att) throw notFound('Logo')
    const isi = await penyimpananLokal.baca(att.storageKey)

    const h = new Headers()
    h.set('Content-Type', att.mimeType)
    h.set('Content-Length', String(isi.length))
    h.set('Content-Security-Policy', "default-src 'none'; sandbox")
    h.set('X-Content-Type-Options', 'nosniff')
    // Publik & bisa di-cache lama — K181 eksplisit mengizinkan ini untuk logo
    // saja, berbeda dari seluruh lampiran lain di aplikasi (private, no-store).
    h.set('Cache-Control', 'public, max-age=86400')
    return new Response(new Uint8Array(isi), { status: 200, headers: h })
  } catch (e) {
    return toResponse(e)
  }
}
