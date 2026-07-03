import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getBillingPlan, resolveModules, SUBSCRIPTION_DAYS } from '@/lib/billing/plans'
import { isSuperadmin } from '@/lib/billing/superadmin'
import type { Prisma } from '@prisma/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/admin/activate  (super-admin only)
// Body: { tenantId, planId, modules?, days? }
// Aktivasi langganan MANUAL setelah verifikasi bukti transfer bank.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !isSuperadmin(session.user.email)) {
    return new Response('Forbidden', { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    tenantId?: string
    planId?: string
    modules?: string[]
    days?: number
  }

  const tenant = body.tenantId
    ? await prisma.tenant.findUnique({ where: { id: body.tenantId } })
    : null
  if (!tenant) return new Response('Tenant tidak ditemukan.', { status: 404 })

  const plan = getBillingPlan(String(body.planId ?? ''))
  if (!plan) return new Response('Paket tidak dikenal.', { status: 400 })

  const modules = resolveModules(plan, body.modules)
  if (!modules) return new Response(`Pilih tepat ${plan.choiceCount} modul pilihan.`, { status: 400 })

  const days = Number.isFinite(body.days) && (body.days as number) > 0 ? Math.floor(body.days as number) : SUBSCRIPTION_DAYS

  // Perpanjangan menumpuk sisa langganan aktif.
  const base = Math.max(Date.now(), tenant.subscriptionEndsAt?.getTime() ?? 0)
  const subscriptionEndsAt = new Date(base + days * 24 * 60 * 60 * 1000)

  const orderId = `MANUAL-${tenant.id.slice(-6)}-${Date.now()}`
  await prisma.payment.create({
    data: {
      orderId,
      tenantId: tenant.id,
      planId: plan.id,
      plan: plan.plan,
      amount: plan.priceIDR,
      modules,
      status: 'PAID',
      paidAt: new Date(),
      raw: { method: 'manual_transfer', activatedBy: session.user.email, days } as Prisma.InputJsonValue,
    },
  })

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { plan: plan.plan, modulesEnabled: modules, subscriptionEndsAt },
  })

  return Response.json({ ok: true, plan: plan.plan, modules, subscriptionEndsAt })
}
