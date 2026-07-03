import type { ReactNode } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AppShell } from '@/components/layout/AppShell'
import { tenantAccess } from '@/lib/billing/access'

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrator',
  OPERATOR: 'Operator',
  FINANCE: 'Finance',
  VIEWER: 'Viewer',
}
const PLAN_LABEL: Record<string, string> = {
  TRIAL: 'Trial',
  STARTER: '2 Modul',
  PRO: '3 Modul',
  FULL_SUITE: 'Semua Modul',
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
  return parts.map((w) => w[0]?.toUpperCase() ?? '').join('') || 'U'
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  // Tenant dibaca SEGAR dari DB (sesi JWT bisa basi setelah pembayaran/perpanjangan).
  const [tenant, vesselCount, principalCount] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: session.user.tenantId } }),
    prisma.vessel.count({ where: { tenantId: session.user.tenantId } }),
    prisma.principal.count({ where: { tenantId: session.user.tenantId } }),
  ])

  const modules =
    tenant?.modulesEnabled && tenant.modulesEnabled.length > 0
      ? tenant.modulesEnabled
      : ['finance', 'dokumen', 'portcall']

  const plan = tenant?.plan ?? 'TRIAL'
  const access = tenantAccess(tenant)
  const trialDaysLeft =
    plan === 'TRIAL' && access.daysLeft !== null ? Math.max(0, access.daysLeft) : null

  const name = session.user.name ?? 'Pengguna'
  const user = {
    name,
    initials: initialsOf(name),
    roleLabel: ROLE_LABEL[session.user.role] ?? session.user.role ?? 'Pengguna',
    planLabel: PLAN_LABEL[plan] ?? plan,
    trialDaysLeft,
    // Nama perusahaan SELALU dari tenant terdaftar (DB) — terkunci, tak bisa
    // diubah per-form, agar identitas dokumen tak bisa dimanipulasi.
    companyName: tenant?.companyName ?? 'Maritime Suite',
  }

  const lockedBanner = access.locked ? (
    <div className="bg-status-danger/12 border-b border-status-danger/30 px-margin-page py-2.5">
      <div className="max-w-[1600px] mx-auto flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-status-danger">
          {access.kind === 'trial'
            ? 'Masa uji coba telah berakhir. Mode baca-saja: dokumen lama tetap bisa dibuka & diunduh, tapi pembuatan dokumen baru dinonaktifkan.'
            : 'Langganan telah berakhir. Mode baca-saja: dokumen lama tetap bisa dibuka & diunduh, tapi pembuatan dokumen baru dinonaktifkan.'}
        </p>
        <Link
          href="/settings"
          className="text-sm font-medium text-white bg-status-danger/80 hover:bg-status-danger px-4 py-1.5 rounded-md transition-colors whitespace-nowrap"
        >
          Perpanjang sekarang
        </Link>
      </div>
    </div>
  ) : null

  return (
    <AppShell
      modulesEnabled={modules}
      user={user}
      vesselCount={vesselCount}
      principalCount={principalCount}
      banner={lockedBanner}
    >
      {children}
    </AppShell>
  )
}
