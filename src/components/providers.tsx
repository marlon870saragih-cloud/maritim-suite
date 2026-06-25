'use client'

import type { ReactNode } from 'react'
import { SessionProvider } from 'next-auth/react'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
      <Toaster theme="dark" position="top-right" richColors closeButton />
    </SessionProvider>
  )
}
