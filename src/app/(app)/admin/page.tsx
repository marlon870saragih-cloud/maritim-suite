import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isSuperadmin } from '@/lib/billing/superadmin'
import { tenantAccess } from '@/lib/billing/access'
import { PageHeader } from '@/components/shared/PageHeader'
import { AdminActivate } from '@/components/admin/AdminActivate'

export const dynamic = 'force-dynamic'

const PLAN_LABEL: Record<string, string> = {
  TRIAL: 'Trial',
  STARTER: '2 Modul',
  PRO: '3 Modul',
  FULL_SUITE: 'Semua Modul',
}

export default async function AdminPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (!isSuperadmin(session.user.email)) redirect('/settings')

  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      companyName: true,
      plan: true,
      trialEndsAt: true,
      subscriptionEndsAt: true,
      modulesEnabled: true,
    },
  })

  return (
    <div className="p-margin-page max-w-[1600px] mx-auto space-y-8">
      <PageHeader
        kicker="Admin"
        title="Kelola langganan"
        description="Aktifkan langganan tenant setelah verifikasi bukti transfer manual."
      />

      <AdminActivate tenants={tenants.map((t) => ({ id: t.id, companyName: t.companyName }))} />

      <div className="bg-card-bg border border-card-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-text-secondary font-mono text-[10px] uppercase tracking-widest border-b border-card-border">
              <th className="px-4 py-3">Perusahaan</th>
              <th className="px-4 py-3">Paket</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Modul</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => {
              const acc = tenantAccess(t)
              const label = PLAN_LABEL[t.plan] ?? t.plan
              return (
                <tr key={t.id} className="border-b border-card-border/50 text-white">
                  <td className="px-4 py-3">{t.companyName}</td>
                  <td className="px-4 py-3">{label}</td>
                  <td className="px-4 py-3">
                    {acc.locked ? (
                      <span className="text-status-danger">Berakhir</span>
                    ) : (
                      <span className="text-status-success">
                        Aktif{acc.daysLeft !== null ? ` · ${acc.daysLeft} hari` : ''}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-secondary text-xs">
                    {t.modulesEnabled.length ? t.modulesEnabled.join(', ') : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
