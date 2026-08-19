// Tagihan vendor (K172) — GET riwayat, POST kirim baru. Satu-satunya tulisan
// yang membuat baris baru di seluruh Fase 8; multipart wajib (berkas tagihan
// tak opsional, beda dari konfirmasi pembayaran K169).

import { withPortal } from '@/services/portal/http'
import { validation } from '@/services/errors'
import { listSubmissionsPortal } from '@/services/portal/vendor-view'
import { buatUsulanTagihan } from '@/services/portal/vendor-submission.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UKURAN_BERKAS_MAKS_MB = 20

export const GET = withPortal(async (pctx) => {
  return Response.json(await listSubmissionsPortal(pctx))
})

// POST /api/portal/submissions
export const POST = withPortal(async (pctx, req) => {
  const tipeKonten = req.headers.get('content-type') ?? ''
  if (!tipeKonten.toLowerCase().includes('multipart/form-data')) {
    throw validation('Tagihan harus dikirim sebagai multipart/form-data.')
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    throw validation('Isi permintaan tidak bisa dibaca.')
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    throw validation('Berkas tagihan wajib dilampirkan (K172/2).')
  }
  if (file.size > UKURAN_BERKAS_MAKS_MB * 1024 * 1024) {
    throw validation(`Ukuran berkas melebihi batas ${UKURAN_BERKAS_MAKS_MB} MB.`)
  }
  const berkas = { fileName: file.name, mimeType: file.type || null, isi: Buffer.from(await file.arrayBuffer()) }

  const hasil = await buatUsulanTagihan(
    pctx,
    {
      invoiceNo: form.get('invoiceNo'),
      invoiceDate: form.get('invoiceDate'),
      currency: form.get('currency'),
      amount: form.get('amount'),
      note: form.get('note'),
      purchaseOrderId: form.get('purchaseOrderId'),
      workOrderId: form.get('workOrderId'),
    },
    berkas,
  )
  return Response.json(hasil, { status: 201 })
})
