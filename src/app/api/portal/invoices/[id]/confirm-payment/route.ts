// Konfirmasi pembayaran dari portal (K169). Multipart: referenceNumber,
// note?, file? (bukti transfer, opsional).

import { withPortal } from '@/services/portal/http'
import { validation } from '@/services/errors'
import { konfirmasiPembayaranPortal } from '@/services/portal/payment-confirmation.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UKURAN_BUKTI_MAKS_MB = 20

type Ctx = { params: { id: string } }

// POST /api/portal/invoices/[id]/confirm-payment
export const POST = withPortal(async (pctx, req, { params }: Ctx) => {
  const tipeKonten = req.headers.get('content-type') ?? ''
  if (!tipeKonten.toLowerCase().includes('multipart/form-data')) {
    throw validation('Konfirmasi harus dikirim sebagai multipart/form-data.')
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    throw validation('Isi permintaan tidak bisa dibaca.')
  }

  const file = form.get('file')
  let berkas: { fileName: string; mimeType: string | null; isi: Buffer } | null = null
  if (file instanceof File) {
    if (file.size > UKURAN_BUKTI_MAKS_MB * 1024 * 1024) {
      throw validation(`Ukuran bukti transfer melebihi batas ${UKURAN_BUKTI_MAKS_MB} MB.`)
    }
    berkas = { fileName: file.name, mimeType: file.type || null, isi: Buffer.from(await file.arrayBuffer()) }
  }

  const hasil = await konfirmasiPembayaranPortal(pctx, params.id, {
    referenceNumber: form.get('referenceNumber'),
    note: form.get('note'),
    berkas,
  })
  return Response.json(hasil, { status: 201 })
})
