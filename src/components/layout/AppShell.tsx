import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

export function AppShell({
  modulesEnabled,
  children,
}: {
  modulesEnabled: string[]
  children: ReactNode
}) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar modulesEnabled={modulesEnabled} />
      <div className="ml-[240px] min-h-screen flex flex-col">
        <TopBar />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  )
}
