import { prisma } from '@/lib/prisma'
import { verifyNotificationSignature } from '@/lib/billing/midtrans'
import { SUBSCRIPTION_DAYS } from '@/lib/billing/plans'
import type { Prisma } from '@prisma/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/billing/notification
// Webhook Midtrans. Dipanggil server Midtrans (bukan browser) setiap status transaksi berubah.
// Set URL ini di dashboard Midtrans → Settings → Configuration → Payment Notification URL.
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

  const payment = await prisma.payment.findUnique({ where: { orderId } })
  // Notifikasi sah (tanda tangan valid) tapi order tak ada di DB kita — mis. tombol
  // "Test notification URL" di dashboard Midtrans. Akui dgn 200 agar Midtrans tak retry.
  if (!payment) return Response.json({ ok: true, ignored: true })

  // Idempoten: kalau sudah PAID, cukup balas 200.
  if (payment.status === 'PAID') return Response.json({ ok: true })

  // 2) Petakan status Midtrans → status internal.
  let next: 'PAID' | 'PENDING' | 'FAILED' | 'EXPIRED' = payment.status
  if (trxStatus === 'capture') {
    next = fraudStatus === 'accept' ? 'PAID' : 'PENDING'
  } else if (trxStatus === 'settlement') {
    next = 'PAID'
  } else if (trxStatus === 'pending') {
    next = 'PENDING'
  } else if (trxStatus === 'expire') {
    next = 'EXPIRED'
  } else if (trxStatus === 'cancel' || trxStatus === 'deny') {
    next = 'FAILED'
  }

  await prisma.payment.update({
    where: { orderId },
    data: {
      status: next,
      paidAt: next === 'PAID' ? new Date() : payment.paidAt,
      raw: n as Prisma.InputJsonValue,
    },
  })

  // 3) Bila lunas, aktifkan langganan tenant (bayar sekali = +30 hari).
  if (next === 'PAID') {
    const tenant = await prisma.tenant.findUnique({ where: { id: payment.tenantId } })
    // Perpanjangan: mulai dari sisa langganan yang masih aktif, bukan dipotong.
    const now = Date.now()
    const currentEnd = tenant?.subscriptionEndsAt?.getTime() ?? 0
    const base = Math.max(now, currentEnd)
    const subscriptionEndsAt = new Date(base + SUBSCRIPTION_DAYS * 24 * 60 * 60 * 1000)

    await prisma.tenant.update({
      where: { id: payment.tenantId },
      data: {
        plan: payment.plan,
        modulesEnabled: payment.modules,
        subscriptionEndsAt,
      },
    })
  }

  // Midtrans mengharap 200 OK; selain itu akan di-retry.
  return Response.json({ ok: true })
}
