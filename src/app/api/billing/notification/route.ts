// Webhook Midtrans. Dipanggil server Midtrans (bukan browser) setiap status berubah.
// URL ini sudah terdaftar di dashboard Midtrans → Settings → Configuration →
// Payment Notification URL, jadi PATH-nya TIDAK BOLEH berubah.
//
// Fase 8d / K160 — endpoint ini HANYA tahu SHA512. Gerbang kedua (Duitku) punya
// endpoint & verifikatornya SENDIRI di `duitku/callback`. Tidak ada cabang
// algoritma di sini, dan tidak boleh pernah ada.
//
// Yang berubah di 8d, semuanya kecil dan disebut eksplisit oleh desain:
//   • pencarian Payment kini ber-`orderId` DAN `gateway` (K159/2) — lewat
//     `terapkanHasilPembayaran()`, yang untuk Midtrans juga menerima baris lama
//     ber-`gateway = null`;
//   • perpanjangan langganan memakai `hitungAkhirLangganan()` yang sama dengan
//     jalur Duitku (K163), bukan aritmetika yang disalin;
//   • pencocokan nominal (K161/4) tetap ada, kini di satu tempat bersama.
// Pemetaan status Midtrans di bawah TIDAK disentuh.

import type { PaymentStatus } from '@prisma/client'
import { verifyNotificationSignature } from '@/lib/billing/midtrans'
import { terapkanHasilPembayaran } from '@/services/saas/billing-activation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/billing/notification
export async function POST(req: Request) {
  const n = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!n) return new Response('Bad Request', { status: 400 })

  // 1) Verifikasi tanda tangan — tolak notifikasi palsu.
  if (!verifyNotificationSignature(n)) {
    console.warn('[billing/notification] signature tidak valid untuk order', n.order_id)
    return new Response('Invalid signature', { status: 403 })
  }

  const orderId = String(n.order_id ?? '')
  const trxStatus = String(n.transaction_status ?? '')
  const fraudStatus = String(n.fraud_status ?? '')

  // 2) Petakan status Midtrans → status internal. Tak berubah sejak Fase 0.
  let statusBaru: PaymentStatus | null = null
  if (trxStatus === 'capture') {
    statusBaru = fraudStatus === 'accept' ? 'PAID' : 'PENDING'
  } else if (trxStatus === 'settlement') {
    statusBaru = 'PAID'
  } else if (trxStatus === 'pending') {
    statusBaru = 'PENDING'
  } else if (trxStatus === 'expire') {
    statusBaru = 'EXPIRED'
  } else if (trxStatus === 'cancel' || trxStatus === 'deny') {
    statusBaru = 'FAILED'
  }
  // Status yang tak dikenal: akui 200 supaya Midtrans berhenti mengulang, tapi
  // jangan menulis apa pun (perilaku lama: `next` tetap = status sekarang).
  if (!statusBaru) return Response.json({ ok: true })

  const hasil = await terapkanHasilPembayaran({
    gerbang: 'MIDTRANS',
    orderId,
    statusBaru,
    // MENTAH dari payload (string, mis. "250000.00") — sama dengan yang
    // ditandatangani Midtrans.
    amountMentah: String(n.gross_amount ?? ''),
    gatewayRef: typeof n.transaction_id === 'string' ? n.transaction_id : null,
    payMethod: typeof n.payment_type === 'string' ? n.payment_type : null,
    raw: n,
  })

  switch (hasil.hasil) {
    case 'DIABAIKAN':
      // Notifikasi sah tapi order tak ada di DB kita — mis. tombol "Test
      // notification URL" di dashboard. Akui 200 agar Midtrans tak retry.
      return Response.json({ ok: true, ignored: true })
    case 'NOMINAL_TAK_COCOK':
      console.error(
        '[billing/notification] nominal tidak cocok untuk order', orderId,
        'diharapkan', hasil.diharapkan, 'diterima', hasil.diterima,
      )
      return new Response('Amount mismatch', { status: 400 })
    default:
      // Midtrans mengharap 200 OK; selain itu akan di-retry.
      return Response.json({ ok: true })
  }
}
