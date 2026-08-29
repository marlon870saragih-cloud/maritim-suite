// Layout Customer Portal (K143/K144/K149, Fase 8f) — SENGAJA di luar `(app)`,
// tak berbagi apa pun dengannya: sesi (`portalAuthOptions`, cookie terpisah),
// navigasi, maupun komponen (`AppShell` internal tidak pernah dipakai di sini).
//
// C1.3 — SEBELUMNYA layout ini hanya memeriksa "ada sesi portal atau tidak",
// dengan alasan bahwa pemeriksaan sesungguhnya toh terjadi di setiap panggilan
// API. Alasan itu benar soal DATA (tak ada yang bocor: API membalas 401), tapi
// pengguna yang aksesnya sudah dicabut tetap melihat dirinya "berada di dalam
// portal" — lengkap dengan navigasi dan namanya. Itu menyesatkan, dan menyalahi
// prinsip complete mediation: setiap akses ke sumber daya terlindungi harus
// diperiksa terhadap otoritas SAAT INI.
//
// Sekarang layout memakai `requirePortal()` yang SAMA PERSIS dengan yang dipakai
// seluruh route API — bukan salinan logikanya. Satu sumber kebenaran; menambah
// syarat otorisasi cukup di satu tempat dan otomatis berlaku di HTML dan API.

import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { portalAuthOptions } from '@/lib/portal-auth'
import { requirePortal } from '@/services/portal/context'
import { PortalNav } from '@/components/portal/PortalNav'
import { getLang } from '@/lib/i18n-server'

const POWERED_BY = { id: 'Ditenagai Maritime Suite', en: 'Powered by Maritime Suite' }

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(portalAuthOptions)
  // Belum masuk sama sekali → halaman masuk. Dipisah dari cabang di bawah supaya
  // orang yang belum login tidak diarahkan ke halaman "akses dicabut".
  if (!session?.user) redirect('/portal/login')

  // Sudah masuk, tapi apakah masih BERHAK sekarang? Dijawab dari database, bukan
  // dari cookie. `requirePortal()` melempar bila akses dicabut, PortalUser
  // dinonaktifkan/dihapus, atau Customer/Vendor-nya sudah tidak aktif/dihapus.
  //
  // Catatan penting soal try/catch di Next.js: `redirect()` bekerja dengan
  // MELEMPAR. Karena itu hanya `requirePortal()` yang berada di dalam `try` —
  // memasukkan `redirect()` ke dalamnya akan membuat catch menelan pengalihan
  // itu sendiri.
  try {
    await requirePortal()
  } catch {
    // `/portal/access-revoked` berada DI LUAR grup `(app)`, sehingga tidak
    // memakai layout ini — tidak ada risiko putaran pengalihan.
    redirect('/portal/access-revoked')
  }

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
