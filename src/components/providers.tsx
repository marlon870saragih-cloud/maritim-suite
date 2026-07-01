'use client'

import type { ReactNode } from 'react'
import { SessionProvider } from 'next-auth/react'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { LangProvider } from '@/lib/i18n'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <LangProvider>
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        <Toaster theme="dark" position="top-right" richColors closeButton />
      </LangProvider>
    </SessionProvider>
  )
}
