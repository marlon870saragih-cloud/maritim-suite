// Checkout lewat Duitku — kembaran `billing/checkout` (K158/K162, Fase 8d).
//
// ⚠️ SATU SUMBER HARGA. Route ini membaca `lib/billing/plans.ts` yang SAMA
// dengan jalur Midtrans. Tidak ada tabel harga kedua, dalam bentuk apa pun —
// K158 mengangkatnya dari pengalaman Salindia, yang menulis komentar
// "supaya kedua gerbang tak pernah beda harga" di kodenya sendiri.
//
// Browser hanya mengirim `planId` + pilihan modul; nominalnya dihitung di sini.
//
// K162 — satu pesanan = satu gerbang. Route ini SELALU membuat baris `Payment`
// BARU ber-`orderId` baru. Tidak ada jalur yang "memindahkan" pesanan Midtrans
// ke Duitku: itu cara termurah membuat dua callback sah untuk satu langganan.

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getBillingPlan, resolveModules } from '@/lib/billing/plans'
import { buatInvoiceDuitku, duitkuConfigured } from '@/lib/billing/duitku'
import { buatOrderId } from '@/lib/billing/gateway'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/billing/duitku/create  { planId, modules? }
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  if (!duitkuConfigured()) {
    return new Response('Pembayaran Duitku belum dikonfigurasi.', { status: 503 })
  }

  const body = (await req.json().catch(() => ({}))) as { planId?: string; modules?: string[] }

  const plan = getBillingPlan(String(body.planId ?? ''))
  if (!plan) return new Response('Paket tidak dikenal.', { status: 400 })

  const modules = resolveModules(plan, body.modules)
  if (!modules) {
    return new Response(`Pilih tepat ${plan.choiceCount} modul pilihan untuk paket ini.`, { status: 400 })
  }

  const tenantId = session.user.tenantId
  // K159 — awalan `SUB-DK-` WAJIB. Ruang nama `merchantOrderId` benar-benar
  // dibagi: akun merchant Duitku kami dipakai juga oleh produk lain (Salindia).
  const orderId = buatOrderId('DUITKU', plan.id, Date.now(), Math.random().toString(36).slice(2, 6))

  const pesanan = await prisma.payment.create({
    data: {
      orderId,
      tenantId,
      planId: plan.id,
      plan: plan.plan,
      amount: plan.priceIDR,
      modules,
      status: 'PENDING',
      gateway: 'DUITKU',
    },
    select: { id: true },
  })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const companyName = session.user.tenant?.companyName ?? session.user.name ?? 'Pelanggan'

  try {
    const inv = await buatInvoiceDuitku({
      orderId,
      amount: plan.priceIDR,
      productDetails: `Langganan ${plan.labelId} — 30 hari`,
      email: session.user.email ?? 'billing@maritime-suite.local',
      customerName: companyName,
      // Dikirim PER TRANSAKSI: inilah yang membuat callback selalu pulang ke
      // aplikasi ini, meski merchantnya dipakai bersama produk lain.
      callbackUrl: `${appUrl}/api/billing/duitku/callback`,
      // returnUrl hanya untuk kenyamanan pembeli. Aktivasi TIDAK PERNAH datang
      // dari sini — hanya dari callback server-ke-server (K158/3).
      returnUrl: `${appUrl}/settings?billing=finish`,
    })

    await prisma.payment.update({ where: { id: pesanan.id }, data: { gatewayRef: inv.reference } })

    return Response.json({ paymentUrl: inv.paymentUrl, reference: inv.reference, orderId })
  } catch (err) {
    // Tandai gagal agar tidak menggantung PENDING selamanya (perilaku sama
    // dengan jalur Midtrans). Layar lalu menawarkan gerbang satunya (K163).
    await prisma.payment.update({ where: { id: pesanan.id }, data: { status: 'FAILED' } }).catch(() => {})
    console.error('[billing/duitku/create] createInvoice gagal:', err)
    return new Response('Gagal membuat transaksi pembayaran.', { status: 502 })
  }
}
