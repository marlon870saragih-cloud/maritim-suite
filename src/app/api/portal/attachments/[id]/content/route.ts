// Unduh SATU dokumen yang dibagikan ke portal (K170/3).
//
// ⚠️ Route TERPISAH dari `/api/attachments/[id]/content` (K108) — route
// internal itu TIDAK PERNAH menerima sesi portal (dipagari `withTenant`, yang
// menolak cookie portal — dibuktikan struktural di check-portal-guard.mjs
// K150). Header keamanan di bawah menyalin pola `headerAman()` di route
// internal apa adanya — sengaja tak diimpor lintas-route (Next.js route
// module bukan tempat yang lazim diimpor modul lain); duplikasi kecil di sini
// murah dan tak menyentuh keputusan keamanan apa pun, hanya nama header.

import { withPortal } from '@/services/portal/http'
import { getSharedAttachmentContent } from '@/services/portal/document.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

const WAJIB_UNDUH = new Set(['text/html', 'image/svg+xml', 'application/xhtml+xml', 'text/xml'])

function headerAman(mime: string, fileName: string, ukuran: number): Headers {
  const h = new Headers()
  h.set('Content-Type', mime)
  h.set('Content-Length', String(ukuran))
  const disposisi = WAJIB_UNDUH.has(mime) ? 'attachment' : 'inline'
  const asciiAman = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_')
  h.set('Content-Disposition', `${disposisi}; filename="${asciiAman}"; filename*=UTF-8''${encodeURIComponent(fileName)}`)
  h.set('Content-Security-Policy', "default-src 'none'; sandbox")
  h.set('X-Content-Type-Options', 'nosniff')
  h.set('X-Frame-Options', 'DENY')
  h.set('Referrer-Policy', 'no-referrer')
  h.set('Cache-Control', 'private, no-store')
  return h
}

// GET /api/portal/attachments/[id]/content
export const GET = withPortal(async (pctx, _req, { params }: Ctx) => {
  const { fileName, mimeType, isi } = await getSharedAttachmentContent(pctx, params.id)
  return new Response(new Uint8Array(isi), { status: 200, headers: headerAman(mimeType, fileName, isi.length) })
})
