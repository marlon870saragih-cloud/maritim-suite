// Halaman "akses portal tidak aktif" (C1.3).
//
// SENGAJA berada di luar grup `(app)` supaya TIDAK memakai PortalLayout — kalau
// ia ikut layout itu, pengalihan dari layout ke halaman ini akan berputar tanpa
// henti.
//
// Aturan isi halaman ini: TIDAK BOLEH memuat data pelanggan, id apa pun, atau
// detail teknis. Pengguna yang sampai di sini justru adalah pihak yang haknya
// sudah dicabut — semakin sedikit yang diceritakan, semakin baik. Yang perlu ia
// tahu hanya: aksesnya tidak aktif, dan kepada siapa harus bertanya.

import type { Metadata } from 'next'
import { getLang } from '@/lib/i18n-server'
import { PortalSignOutButton } from '@/components/portal/PortalSignOutButton'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Akses Portal Tidak Aktif',
  robots: { index: false, follow: false },
}

const T = {
  id: {
    judul: 'Akses portal tidak aktif',
    p1: 'Akun Anda saat ini tidak memiliki akses aktif ke portal ini.',
    p2: 'Ini bisa terjadi karena akses telah dicabut, akun dinonaktifkan, atau kerja sama dengan pihak yang Anda wakili sudah berakhir.',
    p3: 'Bila Anda merasa ini keliru, silakan hubungi keagenan Anda.',
    keluar: 'Keluar',
  },
  en: {
    judul: 'Portal access is not active',
    p1: 'Your account currently has no active access to this portal.',
    p2: 'This can happen when access has been revoked, the account was deactivated, or the relationship with the party you represent has ended.',
    p3: 'If you believe this is a mistake, please contact your agency.',
    keluar: 'Sign out',
  },
} as const

export default function AccessRevokedPage() {
  const t = T[getLang()]

  return (
    <div className="min-h-screen bg-background text-text-primary flex items-center justify-center p-6">
      <main className="w-full max-w-[440px] border border-card-border rounded-lg p-7 bg-card">
        <h1 className="font-semibold text-lg mb-3">{t.judul}</h1>
        <p className="text-sm text-text-secondary mb-2">{t.p1}</p>
        <p className="text-sm text-text-secondary mb-2">{t.p2}</p>
        <p className="text-sm text-text-secondary mb-6">{t.p3}</p>
        <PortalSignOutButton label={t.keluar} />
      </main>
    </div>
  )
}
