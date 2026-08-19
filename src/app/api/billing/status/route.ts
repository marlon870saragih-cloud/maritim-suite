// "Periksa status pembayaran" (K163, Fase 8d).
//
// KENAPA ADA: satu webhook yang meleset (jaringan, deploy, gerbang sedang
// bermasalah) tidak boleh membuat pembayaran menggantung selamanya. Tombol ini
// menanyakan status ke gerbang, lalu menerapkannya lewat `terapkanHasilPembayaran()`
// — FUNGSI YANG SAMA dengan kedua callback, bukan salinan. Kalau ia jadi jalur
// aktivasi kedua, ia akan jadi jalur yang lupa memeriksa nominal atau lupa
// idempoten, dan itu ketahuannya saat sudah menyangkut uang.
//
// PAGAR: pemanggilnya pengguna yang login, dan `orderId` datang dari browser —
// jadi kepemilikan diperiksa EKSPLISIT terhadap `tenantId` sesi sebelum apa pun
// ditanyakan ke gerbang. Tanpa itu, siapa pun yang menebak orderId tenant lain
// bisa memicu pembaruan pada langganan orang lain.

import { getServerSession } from 'next-auth'
import type { PaymentStatus } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { snap } from '@/lib/billing/midtrans'
import { statusTransaksiDuitku, duitkuConfigured } from '@/lib/billing/duitku'
import { adalahGerbang, type Gerbang } from '@/lib/billing/gateway'
import { terapkanHasilPembayaran } from '@/services/saas/billing-activation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Status gerbang → status internal. Midtrans memakai pemetaan yang sama dengan webhook-nya. */
function statusMidtrans(trx: string, fraud: string): PaymentStatus | null {
  if (trx === 'capture') return fraud === 'accept' ? 'PAID' : 'PENDING'
  if (trx === 'settlement') return 'PAID'
  if (trx === 'pending') return 'PENDING'
  if (trx === 'expire') return 'EXPIRED'
  if (trx === 'cancel' || trx === 'deny') return 'FAILED'
  return null
}

// POST /api/billing/status  { orderId }
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  // Fase 8e / K155 — sama dengan checkout: memicu aktivasi lewat jalur yang
  // sama (terapkanHasilPembayaran), jadi risikonya identik. ADMIN saja.
  if (session.user.role !== 'ADMIN') return new Response('Forbidden', { status: 403 })

  const body = (await req.json().catch(() => ({}))) as { orderId?: string }
  const orderId = String(body.orderId ?? '').trim()
  if (!orderId) return new Response('orderId wajib diisi.', { status: 400 })

  // Kepemilikan diperiksa di sini, bukan diandaikan dari orderId.
  const payment = await prisma.payment.findFirst({
    where: { orderId, tenantId: session.user.tenantId },
    select: { id: true, gateway: true, status: true },
  })
  if (!payment) return new Response('Pesanan tidak ditemukan.', { status: 404 })

  // Sudah selesai → tak perlu menanyakan apa pun ke gerbang.
  if (payment.status === 'PAID') return Response.json({ status: 'PAID', berubah: false })

  // `gateway` null = baris sebelum Fase 8d, yang seluruhnya Midtrans (K159).
  const gerbang: Gerbang = adalahGerbang(payment.gateway) ? payment.gateway : 'MIDTRANS'

  let statusBaru: PaymentStatus | null = null
  try {
    if (gerbang === 'DUITKU') {
      if (!duitkuConfigured()) return new Response('Duitku belum dikonfigurasi.', { status: 503 })
      statusBaru = await statusTransaksiDuitku(orderId)
    } else {
      const s = (await snap.transaction.status(orderId)) as Record<string, unknown>
      statusBaru = statusMidtrans(String(s.transaction_status ?? ''), String(s.fraud_status ?? ''))
    }
  } catch (err) {
    console.error('[billing/status] gagal menanyakan status ke gerbang', gerbang, orderId, err)
    return new Response('Gagal menghubungi gerbang pembayaran.', { status: 502 })
  }

  if (!statusBaru) return Response.json({ status: payment.status, berubah: false })

  const hasil = await terapkanHasilPembayaran({
    gerbang,
    orderId,
    statusBaru,
    // `null` = lewati pencocokan nominal, dan itu SAH di sini: nominalnya tidak
    // datang dari pihak luar yang bisa memalsukannya — kita yang memulai
    // permintaan ini ke gerbang, memakai orderId milik kita sendiri.
    amountMentah: null,
  })

  if (hasil.hasil === 'DITERAPKAN') {
    return Response.json({ status: hasil.status, berubah: true, aktif: hasil.aktif })
  }
  if (hasil.hasil === 'SUDAH_LUNAS') return Response.json({ status: 'PAID', berubah: false })
  return Response.json({ status: payment.status, berubah: false })
}
