// Unduhan bundel ekspor (K186) — ADMIN saja (dijaga di service, termasuk
// menutup DIREKTUR).
//
// K108 berlaku penuh: SELALU sebagai unduhan, tak pernah inline. Bundel ini
// `sensitive` dan memuat seluruh data perusahaan — header di bawah adalah
// yang mencegah peramban menebak-nebak tipenya dan membukanya sendiri.

import { jejakDari, withTenant } from '@/services/http'
import { bacaBerkasEkspor } from '@/services/saas/export.service'
import { penyimpananLokal } from '@/services/ops/storage/local'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export const GET = withTenant(async (ctx, req, { params }: Ctx) => {
  const { row, isi } = await bacaBerkasEkspor(ctx, params.id, penyimpananLokal, jejakDari(req))

  const h = new Headers()
  h.set('Content-Type', row.mimeType)
  h.set('Content-Length', String(isi.length))
  h.set('Content-Disposition', `attachment; filename="${row.fileName}"`)
  h.set('Content-Security-Policy', "default-src 'none'; sandbox")
  h.set('X-Content-Type-Options', 'nosniff')
  h.set('Cache-Control', 'private, no-store')
  return new Response(new Uint8Array(isi), { status: 200, headers: h })
})
