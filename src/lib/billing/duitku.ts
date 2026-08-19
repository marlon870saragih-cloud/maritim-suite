// Klien Duitku Pop — KEMBARAN `midtrans.ts` (K158/K160, Fase 8d).
//
// Bentuknya sengaja dibuat sepadan dengan midtrans.ts: satu penanda konfigurasi
// (`duitkuConfigured()`), satu fungsi membuat transaksi, satu verifikator tanda
// tangan. Yang TIDAK dilakukan: menggeneralisasi keduanya jadi satu antarmuka
// "Gateway" — dua gerbang dengan dua algoritma tanda tangan yang dipaksa lewat
// satu abstraksi adalah persis bentuk yang K160 tolak (*algorithm confusion*).
//
// Acuan pola: `backend/app/duitku.py` di repo Salindia — implementasi yang sudah
// berjalan di PRODUKSI dengan merchant yang SAMA. Yang diambil adalah rumus &
// urutan pemeriksaannya, bukan kodenya (stack berbeda: FastAPI/Python vs
// Next.js/TypeScript).
//
// Tanda tangan (dokumentasi Duitku):
//   createInvoice (header) : SHA256( merchantCode + timestamp_ms + apiKey )
//   callback               : MD5   ( merchantCode + amount + merchantOrderId + apiKey )
//   transactionStatus      : MD5   ( merchantCode + merchantOrderId + apiKey )

import crypto from 'crypto'

const merchantCode = process.env.DUITKU_MERCHANT_CODE ?? ''
const apiKey = process.env.DUITKU_API_KEY ?? ''

/**
 * Mode ditentukan EKSPLISIT lewat env, tidak pernah ditebak dari bentuk kunci —
 * pelajaran yang sudah dibayar di midtrans.ts ("key Sandbox Midtrans modern
 * tidak berawalan SB-"). Apa pun selain 'production' dianggap sandbox: arah
 * yang salah di sini berarti transaksi uji jadi uang sungguhan.
 */
export const duitkuIsProduction = (process.env.DUITKU_ENV ?? '').toLowerCase() === 'production'

const API_BASE = duitkuIsProduction
  ? 'https://api-prod.duitku.com/api/merchant'
  : 'https://api-sandbox.duitku.com/api/merchant'

/** Kembaran `midtransConfigured()` (K163): gerbang tanpa kredensial TIDAK muncul di layar. */
export function duitkuConfigured(): boolean {
  return merchantCode.length > 0 && apiKey.length > 0
}

/** Diekspor untuk layar & log rekonsiliasi. BUKAN rahasia — apiKey tak pernah keluar dari berkas ini. */
export function duitkuMerchantCode(): string {
  return merchantCode
}

const sha256 = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest('hex')
const md5 = (s: string) => crypto.createHash('md5').update(s, 'utf8').digest('hex')

/** Bandingkan konstan-waktu. Panjang diperiksa DULU — timingSafeEqual melempar bila beda panjang. */
function samaKonstanWaktu(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8')
  const y = Buffer.from(b, 'utf8')
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

// --------------------------------------------------------------- createInvoice

export type HasilInvoiceDuitku = { reference: string; paymentUrl: string }

/**
 * Buat transaksi di Duitku Pop. Melempar `Error` bila Duitku menolak atau
 * jaringan gagal — pemanggil menerjemahkannya jadi 502 yang ramah (pola sama
 * dengan `snap.createTransaction` di route checkout yang sudah ada).
 *
 * `callbackUrl` dikirim PER TRANSAKSI, tidak diatur di dasbor. Ini yang membuat
 * satu akun merchant bisa dipakai dua produk sekaligus (kami berbagi merchant
 * dengan Salindia): callback selalu pulang ke aplikasi yang menerbitkannya.
 */
export async function buatInvoiceDuitku(input: {
  orderId: string
  amount: number
  productDetails: string
  email: string
  callbackUrl: string
  returnUrl: string
  customerName?: string
  /** Menit. Duitku menutup invoice sesudah ini. */
  expiryPeriod?: number
}): Promise<HasilInvoiceDuitku> {
  if (!duitkuConfigured()) throw new Error('Duitku belum dikonfigurasi (merchant code / API key kosong).')

  const ts = String(Date.now())
  const res = await fetch(`${API_BASE}/createInvoice`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-duitku-signature': sha256(merchantCode + ts + apiKey),
      'x-duitku-timestamp': ts,
      'x-duitku-merchantcode': merchantCode,
    },
    body: JSON.stringify({
      paymentAmount: input.amount,
      merchantOrderId: input.orderId,
      productDetails: input.productDetails.slice(0, 255),
      email: input.email,
      customerVaName: (input.customerName || input.email.split('@')[0] || 'Pelanggan').slice(0, 20),
      callbackUrl: input.callbackUrl,
      returnUrl: input.returnUrl,
      expiryPeriod: input.expiryPeriod ?? 60,
    }),
    signal: AbortSignal.timeout(20_000),
  })

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (String(data.statusCode ?? '') !== '00' || !data.paymentUrl) {
    throw new Error(`Duitku menolak: ${String(data.statusMessage ?? JSON.stringify(data)).slice(0, 200)}`)
  }
  return { reference: String(data.reference ?? ''), paymentUrl: String(data.paymentUrl) }
}

// -------------------------------------------------------------------- callback

/**
 * K160 — verifikasi callback Duitku. Dipakai HANYA oleh
 * `/api/billing/duitku/callback`; endpoint itu tidak mengenal algoritma lain,
 * dan endpoint Midtrans tidak mengenal yang ini.
 *
 * ⚠️ `amount` WAJIB berupa STRING MENTAH apa adanya dari badan permintaan,
 * bukan angka hasil parsing kita. Duitku menandatangani teks yang ia kirim;
 * "250000" dan "250000.00" menghasilkan MD5 yang berbeda, dan menormalkannya
 * lebih dulu akan membuat tanda tangan yang sah ditolak. Pelajaran yang sama
 * sudah tertulis di `verifyNotificationSignature()` untuk `gross_amount`.
 *
 * Pagar PERTAMA adalah `merchantCode`, sebelum tanda tangan diperiksa (K160/4):
 * tanpa itu, callback bertanda tangan sah dari merchant Duitku LAIN tetap
 * diproses sebagai milik kita. Perbandingannya biasa saja, bukan konstan-waktu —
 * merchantCode bukan rahasia (ia dikirim di setiap permintaan dan tampil di
 * dasbor); yang rahasia hanya `apiKey`, dan itu tak pernah dibandingkan
 * langsung, hanya dipakai sebagai bahan hash.
 */
export function verifikasiCallbackDuitku(n: {
  merchantCode?: unknown
  amount?: unknown
  merchantOrderId?: unknown
  signature?: unknown
}): boolean {
  if (!duitkuConfigured()) return false

  const kode = String(n.merchantCode ?? '')
  if (kode !== merchantCode) return false

  const amount = String(n.amount ?? '')
  const orderId = String(n.merchantOrderId ?? '')
  const signature = String(n.signature ?? '').toLowerCase()
  if (!amount || !orderId || !signature) return false

  return samaKonstanWaktu(md5(merchantCode + amount + orderId + apiKey), signature)
}

/** K161/1 — `resultCode` hanya saklar dua nilai; ia TIDAK terlindungi tanda tangan. */
export function duitkuLunas(resultCode: unknown): boolean {
  return String(resultCode ?? '') === '00'
}

// ------------------------------------------------------------ transactionStatus

export type StatusDuitku = 'PAID' | 'PENDING' | 'FAILED'

/**
 * K163 — dipakai tombol "Periksa status pembayaran", supaya satu webhook yang
 * meleset tidak membuat pembayaran menggantung selamanya.
 *
 * Duitku: statusCode '00' = sukses, '01' = diproses, '02' = batal/gagal.
 */
export async function statusTransaksiDuitku(orderId: string): Promise<StatusDuitku> {
  if (!duitkuConfigured()) throw new Error('Duitku belum dikonfigurasi.')

  const res = await fetch(`${API_BASE}/transactionStatus`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchantCode,
      merchantOrderId: orderId,
      signature: md5(merchantCode + orderId + apiKey),
    }),
    signal: AbortSignal.timeout(20_000),
  })

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  const kode = String(data.statusCode ?? '')
  if (kode === '00') return 'PAID'
  if (kode === '01') return 'PENDING'
  return 'FAILED'
}
