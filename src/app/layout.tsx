import type { Metadata } from 'next'
import { DM_Serif_Display, Inter, JetBrains_Mono, Poppins, Open_Sans } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers'

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
