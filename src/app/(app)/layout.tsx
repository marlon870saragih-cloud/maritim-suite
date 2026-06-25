import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { AppShell } from '@/components/layout/AppShell'

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  const modules =
    session.user.tenant?.modulesEnabled && session.user.tenant.modulesEnabled.length > 0
      ? session.user.tenant.modulesEnabled
      : ['finance', 'dokumen', 'portcall']

  return <AppShell modulesEnabled={modules}>{children}</AppShell>
}
