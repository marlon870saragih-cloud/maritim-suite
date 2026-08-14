// Fase 6g / K78–K79 — Email draft.
//
//   POST { templat, entityId, itemId?, bahasa? }
//        → { ok, templat, subject, body, to, toName, ditolak }
//
// entityId = id Disbursement untuk EPDA_INTRO/FDA_SETTLEMENT/VENDOR_RFQ,
// atau id Invoice untuk INVOICE_REMINDER. VENDOR_RFQ tambahan butuh `itemId`
// (baris DisbursementItem yang ber-vendor).
//
// Orkestrasi sama pola dengan context/ask (6f):
//
//   rakitDataEmail()  →  promptEmailDraft()  →  chatCompletion()  →  periksaNarasi()
//
// K78 — TIDAK ADA pengiriman di sini maupun di mana pun; balasannya cuma teks
// untuk disunting & disalin di dialog (EmailDraftDialog.tsx).

import { jsonBody, withTenant } from '@/services/http'
import { validation } from '@/services/errors'
import { str, wajib } from '@/services/input'
import { rakitDataEmail, TEMPLAT_EMAIL, type TemplatEmail } from '@/services/ai/email-draft.service'
import { periksaNarasi } from '@/services/ai/narasi-guard'
import { promptEmailDraft } from '@/lib/ai/email-draft'
import { chatCompletion, firstToolArguments } from '@/lib/ai/openrouter'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BAHASA = ['id', 'en'] as const

export const POST = withTenant(async (ctx, req) => {
  const body = await jsonBody(req)

  const templatMentah = wajib(str(body.templat), 'Templat')
  if (!TEMPLAT_EMAIL.includes(templatMentah as TemplatEmail)) {
    throw validation(`Templat email tidak dikenal: ${templatMentah}.`)
  }
  const templat = templatMentah as TemplatEmail
  const entityId = wajib(str(body.entityId), 'id entitas')
  const itemId = str(body.itemId) || undefined
  const bahasaMentah = str(body.bahasa) || 'id'
  const bahasa = (BAHASA as readonly string[]).includes(bahasaMentah) ? (bahasaMentah as 'id' | 'en') : 'id'

  const data = await rakitDataEmail(ctx, templat, entityId, { itemId })

  const { messages, tools, toolChoice } = promptEmailDraft(data, bahasa)
  const resp = await chatCompletion({ messages, tools, toolChoice, temperature: 0.2 })

  const argumen = firstToolArguments(resp)
  if (!argumen) throw new Error('Model tidak mengembalikan draf email.')

  let terurai: unknown
  try {
    terurai = JSON.parse(argumen)
  } catch {
    throw new Error('Draf dari model bukan JSON yang sah.')
  }
  const { subject, body: isi } = terurai as { subject?: unknown; body?: unknown }
  const subjectStr = typeof subject === 'string' ? subject : ''
  const bodyStr = typeof isi === 'string' ? isi : ''
  if (!subjectStr || !bodyStr) throw new Error('Draf dari model tidak lengkap (subject/body kosong).')

  // K67 — subject+body diperiksa sekaligus terhadap payload yang PERSIS dikirim.
  const periksa = periksaNarasi(`${subjectStr}\n${bodyStr}`, data.payload)

  return Response.json({
    ok: true,
    templat,
    subject: subjectStr,
    body: bodyStr,
    to: data.to,
    toName: data.toName,
    ditolak: !periksa.diterima,
    angkaTakDikenal: periksa.angkaTakDikenal,
  })
})
