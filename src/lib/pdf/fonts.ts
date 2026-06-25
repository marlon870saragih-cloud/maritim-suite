import path from 'path'
import { Font } from '@react-pdf/renderer'

// Daftarkan font sekali (idemponten). Spectral = serif judul/total, Inter = teks & data.
// File font lokal (server-side) — Spectral .ttf, Inter .woff (fontkit mendukung WOFF).
let registered = false

export function registerPdfFonts() {
  if (registered) return
  const dir = path.join(process.cwd(), 'src', 'lib', 'pdf', 'fonts')
  const f = (file: string) => path.join(dir, file)

  Font.register({
    family: 'Spectral',
    fonts: [
      { src: f('Spectral-Regular.ttf'), fontWeight: 400 },
      { src: f('Spectral-Medium.ttf'), fontWeight: 500 },
      { src: f('Spectral-SemiBold.ttf'), fontWeight: 600 },
      { src: f('Spectral-Bold.ttf'), fontWeight: 700 },
    ],
  })

  Font.register({
    family: 'Inter',
    fonts: [
      { src: f('Inter-Regular.woff'), fontWeight: 400 },
      { src: f('Inter-Medium.woff'), fontWeight: 500 },
      { src: f('Inter-SemiBold.woff'), fontWeight: 600 },
      { src: f('Inter-Bold.woff'), fontWeight: 700 },
    ],
  })

  // Jangan pisah kata dengan tanda hubung di PDF.
  Font.registerHyphenationCallback((word) => [word])

  registered = true
}
