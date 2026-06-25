import type { ReactNode } from 'react'

// Font Poppins + Open Sans di-load di root layout (src/app/layout.tsx).
// Login memakai layout full-screen sendiri; register memakai kartu yang dipusatkan di sini.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {children}
    </div>
  )
}
