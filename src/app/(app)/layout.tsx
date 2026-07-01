import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AppShell } from '@/components/layout/AppShell'

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrator',
  OPERATOR: 'Operator',
  FINANCE: 'Finance',
  VIEWER: 'Viewer',
}
const PLAN_LABEL: Record<string, string> = {
  TRIAL: 'Trial',
  STARTER: 'Starter',
  PRO: 'Pro',
  FULL_SUITE: 'Full Suite',
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
  return parts.map((w) => w[0]?.toUpperCase() ?? '').join('') || 'U'
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  const tenant = session.user.tenant
  const modules =
    tenant?.modulesEnabled && tenant.modulesEnabled.length > 0
      ? tenant.modulesEnabled
      : ['finance', 'dokumen', 'portcall']

  const [vesselCount, principalCount] = await Promise.all([
    prisma.vessel.count({ where: { tenantId: session.user.tenantId } }),
    prisma.principal.count({ where: { tenantId: session.user.tenantId } }),
  ])

  const plan = tenant?.plan ?? 'TRIAL'
  let trialDaysLeft: number | null = null
  if (plan === 'TRIAL' && tenant?.trialEndsAt) {
    const end = new Date(tenant.trialEndsAt).getTime()
    if (!Number.isNaN(end)) trialDaysLeft = Math.max(0, Math.ceil((end - Date.now()) / 86_400_000))
  }

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

  return (
    <AppShell
      modulesEnabled={modules}
      user={user}
      vesselCount={vesselCount}
      principalCount={principalCount}
    >
      {children}
    </AppShell>
  )
}
