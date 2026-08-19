// Callback Duitku — TERPISAH dari webhook Midtrans (K160, Fase 8d).
//
// ⚠️ ENDPOINT INI HANYA TAHU MD5. Ia tidak punya cabang untuk algoritma lain,
// tidak membaca "gateway" dari badan permintaan, dan tidak pernah mencoba
// verifikator kedua kalau yang pertama gagal. Algoritma ditentukan oleh PATH.
// Bentuk "satu endpoint yang mengenali gerbangnya dari isi payload" ditolak
// K160 karena ia mengambil keputusan keamanan dari data yang belum
// diautentikasi — kelas bug yang sudah meruntuhkan pustaka JWT.
//
// Badan permintaan Duitku adalah `application/x-www-form-urlencoded`, BUKAN
// JSON (beda dari Midtrans). Itu salah satu dari empat perbedaan yang membuat
// handler tunggal harus menebak.

import { verifikasiCallbackDuitku, duitkuLunas } from '@/lib/billing/duitku'
import { terapkanHasilPembayaran } from '@/services/saas/billing-activation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/billing/duitku/callback  (form-encoded, dipanggil server Duitku)
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null)
  if (!form) return new Response('Bad Request', { status: 400 })

  const n = Object.fromEntries(Array.from(form.entries()).map(([k, v]) => [k, String(v)]))

  // 1+2 — tanda tangan MD5 & merchantCode milik kita. Keduanya di dalam
  // verifikasiCallbackDuitku(); merchantCode diperiksa LEBIH DULU (K160/4),
  // sebab tanda tangan yang sah dari merchant Duitku LAIN bukan milik kita.
  if (!verifikasiCallbackDuitku(n)) {
    console.warn('[billing/duitku/callback] tanda tangan/merchant tidak sah untuk order', n.merchantOrderId)
    return new Response('Invalid signature', { status: 403 })
  }

  const orderId = String(n.merchantOrderId ?? '')

  // 6 — pemetaan status. K161/1: `resultCode` TIDAK terlindungi tanda tangan,
  // jadi ia hanya boleh jadi saklar dua nilai — tak pernah sumber nilai yang
  // disimpan. Yang bukan '00' tidak dianggap GAGAL melainkan dibiarkan PENDING:
  // Duitku mengirim callback juga untuk keadaan antara, dan menuliskan FAILED
  // dari sinyal yang tak ditandatangani berarti siapa pun yang pernah melihat
  // satu callback bisa membatalkan pesanan orang lain.
  const statusBaru = duitkuLunas(n.resultCode) ? 'PAID' : 'PENDING'

  const hasil = await terapkanHasilPembayaran({
    gerbang: 'DUITKU',
    orderId,
    statusBaru,
    // MENTAH, apa adanya dari form — sama dengan yang ditandatangani.
    amountMentah: String(n.amount ?? ''),
    gatewayRef: n.reference ?? null,
    payMethod: n.paymentCode ?? null,
    raw: n,
  })

  switch (hasil.hasil) {
    case 'DIABAIKAN':
      // 200, BUKAN 404 — tombol "test callback" di dasbor Duitku mengirim order
      // fiktif, dan galat membuat gerbang mengulang selamanya (K161 butir 3).
      return Response.json({ ok: true, ignored: true })
    case 'SUDAH_LUNAS':
      return Response.json({ ok: true })
    case 'NOMINAL_TAK_COCOK':
      console.error(
        '[billing/duitku/callback] nominal tidak cocok untuk order', orderId,
        'diharapkan', hasil.diharapkan, 'diterima', hasil.diterima,
      )
      return new Response('Amount mismatch', { status: 400 })
    default:
      return Response.json({ ok: true })
  }
}
