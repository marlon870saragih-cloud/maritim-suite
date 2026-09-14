import type { ReactNode } from 'react'
import { Sidebar, type ChromeUser } from './Sidebar'
import { TopBar } from './TopBar'
import { MobileNavProvider } from './MobileNav'

export function AppShell({
  modulesEnabled,
  user,
  vesselCount,
  principalCount,
  showAutomation = false,
  banner,
  children,
}: {
  modulesEnabled: string[]
  user: ChromeUser
  vesselCount: number
  principalCount: number
  /** PRD-002 Step 5B — menu Automation Hub (fitur aktif + tenant diizinkan + peran). */
  showAutomation?: boolean
  banner?: ReactNode
  children: ReactNode
}) {
  return (
    <MobileNavProvider>
      <div className="min-h-screen bg-background">
        <Sidebar
          modulesEnabled={modulesEnabled}
          user={user}
          vesselCount={vesselCount}
          principalCount={principalCount}
          showAutomation={showAutomation}
        />
        <div className="md:ml-[240px] print:ml-0 min-h-screen flex flex-col">
          <TopBar user={user} />
          {banner}
          <main className="flex-1">{children}</main>
        </div>
      </div>
    </MobileNavProvider>
  )
}
