import type { Metadata } from 'next'
import { DM_Serif_Display, Inter, JetBrains_Mono, Poppins, Open_Sans } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers'

/**
 * WAJIB ADA — pasangan dari CSP ber-nonce di `src/middleware.ts` (K185).
 *
 * Middleware membuat nonce BARU tiap permintaan dan mengirimkannya di header
 * `Content-Security-Policy`. Next menempelkan nonce itu ke tag <script> miliknya
 * HANYA saat halaman dirender per-permintaan. Halaman yang di-prerender saat
 * build lalu disajikan dari Full Route Cache membawa HTML LAMA tanpa nonce,
 * sementara headernya nonce baru — dan karena `script-src` memakai
 * 'strict-dynamic' (yang membuat 'self' DIABAIKAN), SELURUH script di halaman
 * itu diblokir peramban. Akibatnya React tak pernah hidup dan semua tombol mati.
 *
 * Ini benar-benar terjadi di produksi (20 Ags 2026): `/`, `/login`, `/register`,
 * `/portal/login` ter-prerender (`x-nextjs-cache: HIT`, 0 dari 20 script
 * bernonce) sehingga halaman masuk lumpuh total. Halaman lain selamat hanya
 * karena kebetulan sudah dinamis (membaca sesi/cookie).
 *
 * Komentar di middleware sempat MENGKLAIM seluruh halaman "sudah dinamis karena
 * butuh sesi" — klaim itu SALAH untuk keempat halaman publik di atas.
 * Deklarasi ini membuatnya benar secara eksplisit, bukan kebetulan.
 *
 * Diletakkan di layout ROOT (bukan per halaman) karena keempat halaman itu
 * `'use client'`, sedangkan Next melarang route segment config diekspor dari
 * komponen klien.
 */
export const dynamic = 'force-dynamic'

const dmSerifDisplay = DM_Serif_Display({
  subsets: ['latin'],
  weight: ['400'],
  style: ['normal', 'italic'],
  variable: '--font-display',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500'],
})

// Font brand TSM (dipakai landing + halaman auth, mengikuti website perusahaan).
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-poppins',
})

const openSans = Open_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-opensans',
})

export const metadata: Metadata = {
  title: 'Maritime Suite — PT Tribuana Solusi Maritim',
  description: 'Manajemen dokumen & keuangan agen pelayaran Indonesia',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="id"
      className={`dark ${dmSerifDisplay.variable} ${inter.variable} ${jetbrainsMono.variable} ${poppins.variable} ${openSans.variable}`}
    >
      <body className="bg-background text-text-primary font-body antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
