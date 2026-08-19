// Layout Customer Portal (K143/K144/K149, Fase 8f) — SENGAJA di luar `(app)`,
// tak berbagi apa pun dengannya: sesi (`portalAuthOptions`, cookie terpisah),
// navigasi, maupun komponen (`AppShell` internal tidak pernah dipakai di sini).
//
// Pemeriksaan di sini HANYA "ada sesi portal atau tidak" (cepat, tanpa query
// DB) — pemeriksaan yang SESUNGGUHNYA (PortalAccess masih aktif? revokedAt?)
// terjadi di SETIAP panggilan API lewat `requirePortal()` (K168: dibaca ulang
// tiap permintaan, bukan dipercaya dari token). Kalau akses baru saja dicabut,
// halaman ini masih bisa dibuka, tapi setiap panggilan datanya akan 401 —
// itu sudah cukup, dan itu justru desain yang benar (K168).

import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { portalAuthOptions } from '@/lib/portal-auth'
import { PortalNav } from '@/components/portal/PortalNav'
import { getLang } from '@/lib/i18n-server'

const POWERED_BY = { id: 'Ditenagai Maritime Suite', en: 'Powered by Maritime Suite' }

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(portalAuthOptions)
  if (!session?.user) redirect('/portal/login')
  const lang = getLang()

  return (
    <div className="min-h-screen bg-background text-text-primary flex flex-col">
      <PortalNav name={session.user.name ?? ''} />
      <main className="max-w-[1000px] mx-auto p-margin-page flex-1 w-full">{children}</main>
      {/* K179 lapis 1 — Maritime Suite tetap terlihat sebagai produk, meski merek tenant dipakai di nav. */}
      <footer className="border-t border-card-border py-3 text-center text-[10px] text-text-secondary/60">
        {POWERED_BY[lang]}
      </footer>
    </div>
  )
}
