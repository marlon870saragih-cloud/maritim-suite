import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getBillingPlan, resolveModules } from '@/lib/billing/plans'
import { snap, midtransConfigured } from '@/lib/billing/midtrans'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/billing/checkout
// Body: { planId: 'm1'|'m2'|'all', modules?: string[] }
// Membuat transaksi Snap Midtrans. Harga diambil DARI SERVER (lib/billing/plans),
// browser hanya mengirim planId + pilihan modul.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  if (!midtransConfigured()) {
    return new Response('Pembayaran belum dikonfigurasi (Midtrans key kosong).', { status: 503 })
  }

  const body = (await req.json().catch(() => ({}))) as { planId?: string; modules?: string[] }

  const plan = getBillingPlan(String(body.planId ?? ''))
  if (!plan) return new Response('Paket tidak dikenal.', { status: 400 })

  const modules = resolveModules(plan, body.modules)
  if (!modules) {
    return new Response(`Pilih tepat ${plan.choiceCount} modul pilihan untuk paket ini.`, { status: 400 })
  }

  const tenantId = session.user.tenantId
  const orderId = `SUB-${plan.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

  // Catat transaksi PENDING lebih dulu (sumber kebenaran; webhook mencocokkan orderId).
  await prisma.payment.create({
    data: {
      orderId,
      tenantId,
      planId: plan.id,
      plan: plan.plan,
      amount: plan.priceIDR,
      modules,
      status: 'PENDING',
    },
  })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const companyName = session.user.tenant?.companyName ?? session.user.name ?? 'Pelanggan'

  try {
    const tx = await snap.createTransaction({
      transaction_details: {
        order_id: orderId,
        gross_amount: plan.priceIDR, // integer IDR, tanpa desimal
      },
      item_details: [
        {
          id: plan.id,
          price: plan.priceIDR,
          quantity: 1,
          name: `Langganan ${plan.labelId} — 30 hari`.slice(0, 50),
        },
      ],
      customer_details: {
        first_name: companyName.slice(0, 50),
        email: session.user.email ?? undefined,
      },
      callbacks: {
        finish: `${appUrl}/settings?billing=finish`,
      },
    })

    await prisma.payment.update({
      where: { orderId },
      data: { snapToken: tx.token },
    })

    return Response.json({ token: tx.token, redirectUrl: tx.redirect_url, orderId })
  } catch (err) {
    // Tandai gagal agar tidak menggantung sebagai PENDING selamanya.
    await prisma.payment.update({ where: { orderId }, data: { status: 'FAILED' } }).catch(() => {})
    console.error('[billing/checkout] Midtrans createTransaction gagal:', err)
    return new Response('Gagal membuat transaksi pembayaran.', { status: 502 })
  }
}
