// Fase 6e / K71–K74 — anomali heuristik, TANPA narasi LLM.
//
//   GET /api/ai/anomalies?disbursementId=…&bahasa=id|en
//
// K72: anomali tak pernah memblokir transisi status — endpoint ini murni
// baca, tak menyentuh field apa pun di dokumen.

import { withTenant } from '@/services/http'
import { validation } from '@/services/errors'
import { pilihan, str } from '@/services/input'
import { anomaliUntukDisbursement } from '@/services/ai/anomaly.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BAHASA = ['id', 'en'] as const

export const GET = withTenant(async (ctx, req) => {
  const url = new URL(req.url)
  const disbursementId = str(url.searchParams.get('disbursementId'))
  if (!disbursementId) throw validation('disbursementId wajib diisi.')

  const bahasa = pilihan(url.searchParams.get('bahasa'), BAHASA, 'Bahasa', 'id')
  const hasil = await anomaliUntukDisbursement(ctx, disbursementId, { bahasa })
  return Response.json({ ok: true, ...hasil })
})
