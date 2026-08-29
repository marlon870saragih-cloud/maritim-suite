'use client'

// Tombol keluar untuk halaman /portal/access-revoked (C1.3).
//
// Alur keluarnya SAMA PERSIS dengan PortalNav (ambil csrfToken lalu POST ke
// endpoint signout portal) — sengaja tidak memakai `signOut()` dari
// 'next-auth/react', karena halaman ini berada di luar `SessionProvider`
// milik portal.

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function PortalSignOutButton({ label }: { label: string }) {
  const router = useRouter()
  const [keluar, setKeluar] = useState(false)

  async function signOutPortal() {
    setKeluar(true)
    try {
      const { csrfToken } = await (await fetch('/api/portal/auth/csrf')).json()
      await fetch('/api/portal/auth/signout', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ csrfToken }).toString(),
      })
    } finally {
      router.push('/portal/login')
      router.refresh()
    }
  }

  return (
    <button
      type="button"
      onClick={signOutPortal}
      disabled={keluar}
      className="w-full rounded-md border border-card-border py-2 text-sm font-medium hover:bg-background disabled:opacity-60"
    >
      {label}
    </button>
  )
}
