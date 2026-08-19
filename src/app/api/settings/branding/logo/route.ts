// Logo tenant (K181) — POST unggah, GET pratinjau berkas sendiri.
//
// ⚠️ Bukan `/api/attachments/[id]/content` — logo TIDAK terdaftar di
// ENTITAS_DIDUKUNG (K85), sengaja (lihat catatan branding.service.ts).

import { withTenant } from '@/services/http'
import { validation } from '@/services/errors'
import { unggahLogo, bacaLogoSendiri } from '@/services/saas/branding.service'
import { BATAS_UKURAN_MB } from '@/services/ops/attachment.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/settings/branding/logo — pratinjau logo milik tenant sendiri.
export const GET = withTenant(async (ctx) => {
  const { row, isi } = await bacaLogoSendiri(ctx)
  const h = new Headers()
  h.set('Content-Type', row.mimeType)
  h.set('Content-Length', String(isi.length))
  h.set('Content-Security-Policy', "default-src 'none'; sandbox")
  h.set('X-Content-Type-Options', 'nosniff')
  h.set('Cache-Control', 'private, no-store')
  return new Response(new Uint8Array(isi), { status: 200, headers: h })
})

// POST /api/settings/branding/logo (multipart: file)
export const POST = withTenant(async (ctx, req) => {
  const tipeKonten = req.headers.get('content-type') ?? ''
  if (!tipeKonten.toLowerCase().includes('multipart/form-data')) {
    throw validation('Unggahan harus dikirim sebagai multipart/form-data.')
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    throw validation('Isi unggahan tidak bisa dibaca.')
  }

  const file = form.get('file')
  if (!(file instanceof File)) throw validation('Field "file" wajib ada dan harus berupa berkas.')
  if (file.size > BATAS_UKURAN_MB * 1024 * 1024) {
    throw validation(`Ukuran berkas ${(file.size / 1024 / 1024).toFixed(1)} MB melebihi batas ${BATAS_UKURAN_MB} MB.`)
  }

  const isi = Buffer.from(await file.arrayBuffer())
  const hasil = await unggahLogo(ctx, { fileName: file.name, mimeType: file.type || null, isi })
  return Response.json({ ok: true, ...hasil }, { status: 201 })
})
