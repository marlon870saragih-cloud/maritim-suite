'use client'

// Navigasi portal (pelanggan & vendor, Fase 8f/8g). ⚠️ TIDAK memakai
// `useSession()`/`signOut()` dari 'next-auth/react' — `SessionProvider`
// bawaan app (components/providers.tsx) menargetkan `/api/auth/*` INTERNAL,
// bukan `/api/portal/auth/*`. Keduanya kebetulan sama-sama NextAuth tapi
// sesinya terpisah total (K144/3); memakai helper bawaan di sini akan diam-
// diam membaca/menulis sesi yang salah.
//
// `pihak` TIDAK ada di sesi (K168 — lihat catatan lib/portal-auth.ts): sesi
// hanya menyimpan portalUserId, `pihak` selalu dibaca ulang dari DB tiap
// permintaan supaya pencabutan akses berlaku seketika. Nav ini memakai
// endpoint yang SUDAH ADA (`/api/portal/profile`) untuk tahu pihak mana yang
// login — bukan endpoint baru — dan endpoint itu sendiri sudah melewati
// pemeriksaan requirePortal() yang sesungguhnya.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { FileText, Home, Ship, FolderOpen, User, LogOut, Loader2, Package, Wrench, Receipt } from 'lucide-react'
import { useT, type Lang, useLang, LangToggle } from '@/lib/i18n'

const NAV_CUSTOMER = [
  { href: '/portal', labelId: 'Beranda', labelEn: 'Home', icon: Home },
  { href: '/portal/invoices', labelId: 'Tagihan', labelEn: 'Invoices', icon: FileText },
  { href: '/portal/voyages', labelId: 'Kunjungan Kapal', labelEn: 'Vessel Visits', icon: Ship },
  { href: '/portal/documents', labelId: 'Dokumen', labelEn: 'Documents', icon: FolderOpen },
  { href: '/portal/profile', labelId: 'Profil', labelEn: 'Profile', icon: User },
] as const

const NAV_VENDOR = [
  { href: '/portal', labelId: 'Beranda', labelEn: 'Home', icon: Home },
  { href: '/portal/purchase-orders', labelId: 'Pesanan', labelEn: 'Purchase Orders', icon: Package },
  { href: '/portal/work-orders', labelId: 'Perintah Kerja', labelEn: 'Work Orders', icon: Wrench },
  { href: '/portal/submissions', labelId: 'Tagihan Saya', labelEn: 'My Invoices', icon: Receipt },
  { href: '/portal/profile', labelId: 'Profil', labelEn: 'Profile', icon: User },
] as const

const T: Record<Lang, Record<string, string>> = {
  id: { signOut: 'Keluar', brandCustomer: 'Portal Pelanggan', brandVendor: 'Portal Vendor' },
  en: { signOut: 'Sign out', brandCustomer: 'Customer Portal', brandVendor: 'Vendor Portal' },
}

export function PortalNav({ name }: { name: string }) {
  const t = useT(T)
  const { lang } = useLang()
  const pathname = usePathname()
  const router = useRouter()
  const [keluar, setKeluar] = useState(false)
  const [pihak, setPihak] = useState<'CUSTOMER' | 'VENDOR' | null>(null)

  useEffect(() => {
    let hidup = true
    fetch('/api/portal/profile')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { pihak?: 'CUSTOMER' | 'VENDOR' } | null) => hidup && d?.pihak && setPihak(d.pihak))
    return () => {
      hidup = false
    }
  }, [])

  const NAV = pihak === 'VENDOR' ? NAV_VENDOR : NAV_CUSTOMER
  const brand = pihak === 'VENDOR' ? t.brandVendor : t.brandCustomer

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
    <header className="border-b border-card-border bg-card-bg">
      <div className="max-w-[1000px] mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-6 flex-wrap">
          <div>
            <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest">{brand}</p>
            <p className="text-white font-display text-sm">{name}</p>
          </div>
          <nav className="flex items-center gap-1 flex-wrap">
            {NAV.map((n) => {
              const Icon = n.icon
              const aktif = pathname === n.href
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                    aktif ? 'bg-accent-blue/15 text-accent-blue' : 'text-text-secondary hover:text-white'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {lang === 'id' ? n.labelId : n.labelEn}
                </Link>
              )
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <LangToggle tone="ink" />
          <button
            type="button"
            onClick={signOutPortal}
            disabled={keluar}
            className="inline-flex items-center gap-1.5 rounded-md border border-card-border px-2.5 py-1.5 text-xs
                       text-text-secondary hover:text-white hover:border-status-danger/50 transition-colors disabled:opacity-40"
          >
            {keluar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
            {t.signOut}
          </button>
        </div>
      </div>
    </header>
  )
}
