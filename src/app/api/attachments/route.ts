// Attachment Center — daftar & unggah (K106–K109).
//
// Pola mengikuti api/ports/route.ts: route tipis, semua logika di service.
// Bedanya satu: POST menerima multipart/form-data, bukan JSON — jadi berkas ini
// yang mengurai FormData, dan service tetap menerima Buffer + metadata polos.

import { withTenant } from '@/services/http'
import { validation } from '@/services/errors'
import { listAttachments, uploadAttachment, BATAS_UKURAN_MB } from '@/services/ops/attachment.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/attachments?entityType=DISBURSEMENT&entityId=...
export const GET = withTenant(async (ctx, req) => {
  const url = new URL(req.url)
  const rows = await listAttachments(
    ctx,
    url.searchParams.get('entityType'),
    url.searchParams.get('entityId'),
  )
  return Response.json(rows)
})

// POST /api/attachments  (multipart: entityType, entityId, file, kind?, note?, sensitive?, expiresAt?)
export const POST = withTenant(async (ctx, req) => {
  const tipeKonten = req.headers.get('content-type') ?? ''
  if (!tipeKonten.toLowerCase().includes('multipart/form-data')) {
    throw validation('Unggahan harus dikirim sebagai multipart/form-data.')
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    // Body rusak / terpotong. Dilaporkan 400, bukan 500: yang salah kirimannya,
    // bukan servernya.
    throw validation('Isi unggahan tidak bisa dibaca.')
  }

  const file = form.get('file')
  if (!(file instanceof File)) throw validation('Field "file" wajib ada dan harus berupa berkas.')

  // Batas ukuran diperiksa DUA kali: di sini sebelum berkas dimuat ke memori,
  // dan lagi di service (yang jadi satu-satunya sumber kebenaran aturannya).
  // Pemeriksaan awal ini murni supaya berkas 500 MB tidak dibaca dulu baru
  // ditolak — tanpa dia, penolakan tetap benar tapi mahal.
  if (file.size > BATAS_UKURAN_MB * 1024 * 1024) {
    throw validation(
      `Ukuran berkas ${(file.size / 1024 / 1024).toFixed(1)} MB melebihi batas ${BATAS_UKURAN_MB} MB per berkas.`,
    )
  }

  const isi = Buffer.from(await file.arrayBuffer())

  const hasil = await uploadAttachment(ctx, {
    entityType: form.get('entityType'),
    entityId: form.get('entityId'),
    fileName: file.name,
    mimeType: file.type || null,
    isi,
    kind: form.get('kind'),
    note: form.get('note'),
    sensitive: form.get('sensitive'),
    expiresAt: form.get('expiresAt'),
  })

  return Response.json({ ok: true, ...hasil }, { status: 201 })
})
