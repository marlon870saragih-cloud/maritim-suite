import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getBillingPlan, resolveModules } from '@/lib/billing/plans'
import { snap, midtransConfigured } from '@/lib/billing/midtrans'
import { buatOrderId } from '@/lib/billing/gateway'
import { addonById, totalHargaAddon } from '@/services/saas/commercial-policy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/billing/checkout
// Body: { planId: 'm1'|'m2'|'all', modules?: string[], addons?: string[] }
// Membuat transaksi Snap Midtrans. Harga diambil DARI SERVER (lib/billing/plans
// + commercial-policy.ts), browser hanya mengirim pilihan.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  // Fase 8e / K155 — checkout adalah komitmen finansial atas nama tenant,
  // pola sama dengan mengundang rekan kerja / menyalakan go-live: ADMIN saja.
  // FINANCE (yang mengurus tagihan PELANGGAN tenant, bukan langganan tenant
  // sendiri ke Maritime Suite) sengaja TIDAK termasuk — lihat catatan §1.3.
  if (session.user.role !== 'ADMIN') return new Response('Forbidden', { status: 403 })

  if (!midtransConfigured()) {
    return new Response('Pembayaran belum dikonfigurasi (Midtrans key kosong).', { status: 503 })
  }

  const body = (await req.json().catch(() => ({}))) as { planId?: string; modules?: string[]; addons?: unknown[] }

  const plan = getBillingPlan(String(body.planId ?? ''))
  if (!plan) return new Response('Paket tidak dikenal.', { status: 400 })

  const modules = resolveModules(plan, body.modules)
  if (!modules) {
    return new Response(`Pilih tepat ${plan.choiceCount} modul pilihan untuk paket ini.`, { status: 400 })
  }

  // K165 — add-on: baris TAMBAHAN pada pesanan yang sama. Add-on tak dikenal
  // ATAU belum dijual → tolak SELURUH permintaan (bukan mengabaikan sebagian
  // diam-diam, lihat catatan totalHargaAddon()).
  const addonIds = Array.isArray(body.addons) ? Array.from(new Set(body.addons.map(String))) : []
  const totalAddon = addonIds.length ? totalHargaAddon(addonIds) : 0
  if (totalAddon === null) {
    return new Response('Salah satu add-on tidak dikenal atau belum dijual.', { status: 400 })
  }
  const grossAmount = plan.priceIDR + totalAddon

  const tenantId = session.user.tenantId
  // Fase 8d / K159 — awalan gerbang (`SUB-MT-`) kini WAJIB. Bentuk lainnya sama
  // persis dengan sebelumnya; baris lama ber-`SUB-<planId>-…` tetap sah dan
  // tetap dilayani handler ini (lihat billing-activation.ts).
  const orderId = buatOrderId('MIDTRANS', plan.id, Date.now(), Math.random().toString(36).slice(2, 6))

  // Catat transaksi PENDING lebih dulu (sumber kebenaran; webhook mencocokkan
  // orderId DAN gateway — K159/2).
  await prisma.payment.create({
    data: {
      orderId,
      tenantId,
      planId: plan.id,
      plan: plan.plan,
      amount: grossAmount,
      modules,
      addons: addonIds,
      status: 'PENDING',
      gateway: 'MIDTRANS',
    },
  })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const companyName = session.user.tenant?.companyName ?? session.user.name ?? 'Pelanggan'

  try {
    const tx = await snap.createTransaction({
      transaction_details: {
        order_id: orderId,
        gross_amount: grossAmount, // integer IDR, tanpa desimal
      },
      item_details: [
        {
          id: plan.id,
          price: plan.priceIDR,
          quantity: 1,
          name: `Langganan ${plan.labelId} — 30 hari`.slice(0, 50),
        },
        ...addonIds.map((id) => {
          const a = addonById(id)
          return { id, price: a?.priceIDR ?? 0, quantity: 1, name: `Add-on: ${a?.labelId ?? id}`.slice(0, 50) }
        }),
      ],
      customer_details: {
        first_name: companyName.slice(0, 50),
        email: session.user.email ?? undefined,
      },
      callbacks: {
        finish: `${appUrl}/settings/billing?billing=finish`,
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
