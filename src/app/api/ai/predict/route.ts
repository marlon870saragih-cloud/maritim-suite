// Fase 6c / K60–K65 — prediksi biaya ber-grounding, TANPA narasi LLM.
//
// Dua bentuk permintaan, dibedakan dari field yang ADA (bukan dari sebuah field
// "mode" yang bisa berbeda dari isinya):
//
//   POST { disbursementId }                         → prediksi seluruh baris dokumen
//   POST { voyageId, serviceIds[], kind? }          → prediksi untuk voyage tanpa dokumen
//
// Mengirim keduanya sekaligus DITOLAK, bukan dipilih diam-diam salah satu:
// dua sumber kebenaran dalam satu request selalu berarti pemanggil sedang salah
// paham, dan menebak untuknya menyembunyikan salah paham itu sampai angkanya
// dipakai orang.
//
// Endpoint ini TIDAK memanggil model bahasa sama sekali (K54: angka prediksi
// tidak berbiaya token, jadi ia boleh tampil otomatis saat halaman dibuka).
// Narasi "Jelaskan" adalah endpoint terpisah `/api/ai/explain` (K67).

import { jsonBody, withTenant } from '@/services/http'
import { validation } from '@/services/errors'
import { pilihan, str } from '@/services/input'
import {
  prediksiUntukDisbursement,
  prediksiUntukVoyage,
} from '@/services/ai/prediction.service'
import type { DisbursementKind } from '@prisma/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const KINDS: readonly DisbursementKind[] = ['EPDA', 'FPDA', 'FDA']
const BAHASA = ['id', 'en'] as const

export const POST = withTenant(async (ctx, req) => {
  const body = await jsonBody(req)

  const disbursementId = str(body.disbursementId)
  const voyageId = str(body.voyageId)
  const bahasa = pilihan(body.bahasa, BAHASA, 'Bahasa', 'id')

  if (disbursementId && voyageId) {
    throw validation('Kirim salah satu saja: disbursementId ATAU voyageId + serviceIds.')
  }

  if (disbursementId) {
    const prediksi = await prediksiUntukDisbursement(ctx, disbursementId, { bahasa })
    return Response.json({ ok: true, prediksi })
  }

  if (voyageId) {
    const serviceIds = Array.isArray(body.serviceIds)
      ? body.serviceIds.filter((s): s is string => typeof s === 'string' && s.trim() !== '')
      : []
    if (serviceIds.length === 0) {
      throw validation('serviceIds wajib diisi minimal satu jasa saat memakai voyageId.')
    }
    const prediksi = await prediksiUntukVoyage(ctx, voyageId, serviceIds, {
      kind: pilihan(body.kind, KINDS, 'Jenis dokumen', 'EPDA'),
      bahasa,
    })
    return Response.json({ ok: true, prediksi })
  }

  throw validation('Kirim disbursementId, atau voyageId + serviceIds.')
})
