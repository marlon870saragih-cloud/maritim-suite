import crypto from 'crypto'
import midtransClient from 'midtrans-client'

// Mode ditentukan eksplisit lewat env — JANGAN tebak dari prefix key,
// karena key Sandbox Midtrans modern tidak berawalan "SB-".
export const midtransIsProduction = process.env.MIDTRANS_IS_PRODUCTION === 'true'

const serverKey = process.env.MIDTRANS_SERVER_KEY ?? ''
const clientKey = process.env.MIDTRANS_CLIENT_KEY ?? ''

export function midtransConfigured(): boolean {
  return serverKey.length > 0 && clientKey.length > 0
}

export const snap = new midtransClient.Snap({
  isProduction: midtransIsProduction,
  serverKey,
  clientKey,
})

// Verifikasi tanda tangan notifikasi (webhook) Midtrans.
// signature_key = sha512(order_id + status_code + gross_amount + serverKey).
// PENTING: pakai gross_amount MENTAH dari payload (string, mis. "250000.00"),
// bukan angka kita, agar hash cocok.
export function verifyNotificationSignature(n: {
  order_id?: unknown
  status_code?: unknown
  gross_amount?: unknown
  signature_key?: unknown
}): boolean {
  const orderId = String(n.order_id ?? '')
  const statusCode = String(n.status_code ?? '')
  const grossAmount = String(n.gross_amount ?? '')
  const signature = String(n.signature_key ?? '')
  if (!orderId || !statusCode || !grossAmount || !signature) return false

  const expected = crypto
    .createHash('sha512')
    .update(orderId + statusCode + grossAmount + serverKey)
    .digest('hex')

  // Bandingkan konstan-waktu untuk cegah timing attack.
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
