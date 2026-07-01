'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'

/**
 * State drawer sidebar untuk mobile — dibagi antara TopBar (tombol hamburger),
 * Sidebar (geser masuk/keluar), dan overlay. Auto-tutup saat pindah halaman,
 * dan kunci scroll body selama terbuka. Di desktop (md+) sidebar selalu tampil.
 */
const MobileNavCtx = createContext<{ open: boolean; setOpen: (b: boolean) => void }>({
  open: false,
  setOpen: () => {},
})

export function MobileNavProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Tutup drawer setiap kali rute berubah (klik menu → pindah → tertutup).
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  // Kunci scroll body saat drawer terbuka di mobile.
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prev
      }
    }
  }, [open])

  return <MobileNavCtx.Provider value={{ open, setOpen }}>{children}</MobileNavCtx.Provider>
}

export const useMobileNav = () => useContext(MobileNavCtx)
