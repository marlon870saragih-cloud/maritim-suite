// Checklist go-live / K185 — header keamanan terpusat (CSP, HSTS, dan
// sejenisnya) untuk SETIAP HALAMAN yang dirender (bukan API — lihat catatan
// `matcher` di bawah).
//
// ---------------------------------------------------------------------------
// KENAPA NONCE, BUKAN 'unsafe-inline' UNTUK SCRIPT
//
// `script-src` adalah satu-satunya arah yang benar-benar berbahaya kalau
// longgar — XSS lewat script yang bisa dieksekusi. Next.js sendiri
// mendukung CSP ber-nonce apa adanya (lihat "How nonces work" di
// docs.nextjs.org/app/guides/content-security-policy): nonce dibuat di sini,
// diteruskan lewat header `x-nonce`, dan Next OTOMATIS menempelkannya ke
// bundel React/Next miliknya sendiri saat merender. Yang harus MANUAL
// hanyalah `<Script>` pihak ketiga (Midtrans Snap.js) — nonce-nya diteruskan
// eksplisit lewat prop `nonce` di halaman billing.
//
// Konsekuensinya: SELURUH halaman WAJIB dirender DINAMIS (nonce beda tiap
// permintaan → tak boleh di-cache statis/ISR).
//
// ⚠️ Dulu di sini tertulis bahwa hal itu "otomatis terpenuhi karena setiap
// halaman sudah butuh sesi". KLAIM ITU SALAH dan sempat melumpuhkan produksi
// (20 Ags 2026): `/`, `/login`, `/register`, dan `/portal/login` tidak membaca
// sesi, jadi Next MEM-PRERENDER-nya saat build dan menyajikannya dari Full
// Route Cache — HTML lama tanpa nonce + header nonce baru = seluruh script
// diblokir 'strict-dynamic' (yang membuat 'self' diabaikan), React tak pernah
// hidup, semua tombol mati. Penegakannya kini EKSPLISIT lewat
// `export const dynamic = 'force-dynamic'` di `src/app/layout.tsx` — jangan
// dihapus tanpa mengganti mekanisme nonce ini lebih dulu.
//
// Cara memverifikasi (header saja TIDAK CUKUP — itu kesalahan uji sebelumnya):
// bandingkan nonce di header `Content-Security-Policy` dengan atribut
// `nonce="..."` pada tag <script> di HTML. Kalau jumlah script bernonce 0,
// halaman itu lumpuh meski headernya terlihat benar.
//
// ---------------------------------------------------------------------------
// KENAPA `style-src` TETAP 'unsafe-inline', SENGAJA TAK IKUT DIPERKETAT
//
// Nonce TIDAK BISA menutupi atribut `style="..."` di elemen HTML biasa
// (beda dari elemen `<style>` — nonce hanya berlaku pada ELEMEN, bukan
// ATRIBUT). App ini memakai prop React `style={{...}}` di 17 berkas (warna
// aksen tenant K180, kartu status backup K186, dll — styling yang MEMANG
// harus dihitung saat render, bukan kelas Tailwind statis). Menggabungkan
// nonce DAN 'unsafe-inline' di direktif yang sama membuat browser modern
// MENGABAIKAN 'unsafe-inline' (CSP lebih baru: kalau ada nonce/hash, browser
// yang mengerti keduanya membuang fallback unsafe-inline) — jadi nonce+
// unsafe-inline bersamaan di sini justru akan MEMATIKAN seluruh styling
// dinamis itu, bukan memperketatnya. Trade-off yang diterima sadar: XSS
// lewat CSS jauh lebih terbatas (tak bisa mengeksekusi kode) dibanding lewat
// script — mengetatkan script-src memberi manfaat keamanan terbesar dengan
// biaya arsitektur terkecil.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const IS_PROD = process.env.NODE_ENV === 'production'

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')

  const csp = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${IS_PROD ? '' : " 'unsafe-eval'"};
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data:;
    font-src 'self';
    connect-src 'self' https://api.midtrans.com https://api.sandbox.midtrans.com;
    frame-src 'self' https://app.midtrans.com https://app.sandbox.midtrans.com;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    ${IS_PROD ? 'upgrade-insecure-requests;' : ''}
  `
    .replace(/\s{2,}/g, ' ')
    .trim()

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })

  response.headers.set('Content-Security-Policy', csp)
  // Cadangan untuk peramban lama yang tak paham `frame-ancestors` (CSP2+).
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  // App ini tak pernah butuh kamera/mikrofon/lokasi/pembayaran browser API —
  // dimatikan tegas alih-alih dibiarkan bawaan peramban (biasanya terbuka).
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  )
  if (IS_PROD) {
    // Hanya berarti di atas HTTPS sungguhan — peramban mengabaikannya kalau
    // koneksi memang masih HTTP, jadi aman dikirim juga sebelum deploy siap.
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Semua path KECUALI:
     * - api          → route API sudah punya kontraknya sendiri (JSON tak
     *                   merender apa pun; beberapa rute unduhan bahkan sudah
     *                   memasang CSP-nya SENDIRI yang lebih ketat —
     *                   `default-src 'none'; sandbox`, K108 — dan middleware
     *                   di sini sengaja tak menimpanya).
     * - _next/static, _next/image, favicon.ico → aset, bukan dokumen.
     */
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
