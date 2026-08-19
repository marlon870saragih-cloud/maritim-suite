// Penerapan hasil pembayaran — SATU jalur untuk KEDUA gerbang (K161/K163, Fase 8d).
//
// Berkas ini menjalankan langkah 3-7 dari daftar wajib K161. Langkah 1-2
// (verifikasi tanda tangan & merchantCode) TIDAK ada di sini dan tidak boleh
// pernah pindah ke sini: keduanya bergantung pada algoritma yang ditentukan
// PATH endpoint (K160), dan menaruhnya di fungsi bersama berarti fungsi itu
// harus MEMILIH algoritma — persis *algorithm confusion* yang K160 tolak.
//
//   1. verifikasi tanda tangan (algoritma dari PATH)   → route, gagal: 403
//   2. Duitku: merchantCode cocok?                     → route, gagal: 403
//   ┌─ mulai berkas ini ────────────────────────────────────────────────┐
//   3. cari Payment WHERE orderId AND gateway          → tak ada: DIABAIKAN
//   4. sudah PAID?                                     → ya: SUDAH_LUNAS
//   5. nominal cocok dengan Payment.amount?            → tidak: NOMINAL_TAK_COCOK
//   6. (pemetaan status gerbang → internal dilakukan pemanggil)
//   7. bila PAID: SATU transaksi { Payment, Tenant }
//   └───────────────────────────────────────────────────────────────────┘
//   8. route selalu membalas 200 untuk keadaan yang sudah ditangani
//
// ⚠️ MEMAKAI `prisma` MENTAH, BUKAN `forTenant()` — dan itu disengaja, sama
// seperti handler Midtrans yang sudah ada. Callback gerbang datang tanpa sesi:
// ia diautentikasi oleh TANDA TANGAN, bukan oleh cookie, jadi tak ada
// TenantContext yang bisa dibentuk. Pagar penggantinya adalah `orderId` — baris
// Payment itu sendiri yang menentukan tenant mana yang disentuh, dan tak ada
// satu pun query di bawah yang menerima tenantId dari luar.

import type { Payment, PaymentStatus, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { SUBSCRIPTION_DAYS } from '@/lib/billing/plans'
import type { Gerbang } from '@/lib/billing/gateway'
import { hitungAkhirLangganan } from './subscription-calc'

export type HasilTerap =
  /** Langkah 3 — pesanan tak dikenal (mis. tombol "test notification" di dasbor gerbang). */
  | { hasil: 'DIABAIKAN' }
  /** Langkah 4 — sudah lunas. Pagar KEAMANAN untuk Duitku, bukan sekadar kerapian (K161/3). */
  | { hasil: 'SUDAH_LUNAS'; payment: Payment }
  /** Langkah 5 — nominal tidak cocok dengan pesanan kita. */
  | { hasil: 'NOMINAL_TAK_COCOK'; diharapkan: number; diterima: string }
  /** Langkah 7 — status diterapkan; `aktif` true bila langganan diperpanjang. */
  | { hasil: 'DITERAPKAN'; payment: Payment; status: PaymentStatus; aktif: boolean }

/**
 * K159/2 — pencarian SELALU dengan `orderId` DAN `gateway`, tak pernah orderId
 * saja. Inilah yang menutup tabrakan ruang nama antar-gerbang.
 *
 * Kekhususan Midtrans: baris yang lahir SEBELUM Fase 8d punya `gateway = null`
 * dan sengaja TIDAK di-backfill (K159/M6). Menyaringnya dengan `gateway =
 * 'MIDTRANS'` saja akan membuat pesanan lama yang masih PENDING tak pernah bisa
 * lunas — kerusakan nyata pada uang yang sudah dibayar orang. Karena itu jalur
 * Midtrans menerima keduanya, dan jalur Duitku KETAT: tak ada baris Duitku yang
 * pernah lahir sebelum 8d, jadi tak ada yang perlu dimaafkan.
 */
function whereGerbang(gerbang: Gerbang, orderId: string): Prisma.PaymentWhereInput {
  if (gerbang === 'DUITKU') return { orderId, gateway: 'DUITKU' }
  return { orderId, OR: [{ gateway: 'MIDTRANS' }, { gateway: null }] }
}

export async function terapkanHasilPembayaran(input: {
  gerbang: Gerbang
  orderId: string
  /** Sudah dipetakan pemanggil dari status gerbang (langkah 6). */
  statusBaru: PaymentStatus
  /**
   * Nominal MENTAH apa adanya dari payload gerbang. `null` hanya untuk jalur
   * yang memang tak membawa nominal (mis. periksa-status K163, yang tidak bisa
   * dipalsukan siapa pun karena kita yang memulai permintaannya).
   */
  amountMentah: string | null
  gatewayRef?: string | null
  payMethod?: string | null
  raw?: unknown
  sekarang?: Date
}): Promise<HasilTerap> {
  const sekarang = input.sekarang ?? new Date()

  // 3 — pesanan kita?
  const payment = await prisma.payment.findFirst({
    where: whereGerbang(input.gerbang, input.orderId),
  })
  if (!payment) return { hasil: 'DIABAIKAN' }

  // 4 — idempotensi. Untuk Duitku ini PAGAR KEAMANAN: tanda tangannya tak
  // memuat status, stempel waktu, maupun nonce, sehingga satu callback lunas
  // yang sah bisa diputar ulang selamanya. Tanpa baris ini, tiap pemutaran
  // ulang menambah 30 hari — langganan gratis tanpa batas (K161/2-3).
  if (payment.status === 'PAID') return { hasil: 'SUDAH_LUNAS', payment }

  // 5 — nominal WAJIB cocok, di KEDUA gerbang (K161/4). Untuk Midtrans nominal
  // ikut ditandatangani dan untuk Duitku ia BAHAN tanda tangan — tapi bersandar
  // pada properti algoritma adalah alasan yang halus, dan pemeriksaan eksplisit
  // berharga satu baris.
  if (input.statusBaru === 'PAID' && input.amountMentah !== null) {
    const diterima = Math.round(Number(input.amountMentah))
    if (!Number.isFinite(diterima) || diterima !== payment.amount) {
      return { hasil: 'NOMINAL_TAK_COCOK', diharapkan: payment.amount, diterima: input.amountMentah }
    }
  }

  const lunas = input.statusBaru === 'PAID'

  const dataPayment: Prisma.PaymentUpdateInput = {
    status: input.statusBaru,
    paidAt: lunas ? sekarang : payment.paidAt,
    // Diisi hanya bila gerbang memberi nilainya — jangan menimpa yang sudah ada
    // dengan null pada callback susulan yang lebih miskin isinya.
    ...(input.gatewayRef ? { gatewayRef: input.gatewayRef } : {}),
    ...(input.payMethod ? { payMethod: input.payMethod } : {}),
    ...(input.raw === undefined ? {} : { raw: input.raw as Prisma.InputJsonValue }),
    // Baris lama (gateway null) dicap saat pertama kali disentuh Fase 8d.
    ...(payment.gateway ? {} : { gateway: input.gerbang }),
  }

  if (!lunas) {
    const baru = await prisma.payment.update({ where: { id: payment.id }, data: dataPayment })
    return { hasil: 'DITERAPKAN', payment: baru, status: input.statusBaru, aktif: false }
  }

  // 7 — SATU transaksi: pembayaran ditandai lunas DAN langganan diperpanjang.
  // Dipisah berarti ada jendela di mana uang tercatat masuk tapi langganan
  // belum menyala (atau sebaliknya), dan jendela itu hanya terlihat saat proses
  // mati di antaranya — persis saat tak ada yang sedang memperhatikan.
  const tenant = await prisma.tenant.findUnique({
    where: { id: payment.tenantId },
    select: { subscriptionEndsAt: true },
  })
  const subscriptionEndsAt = hitungAkhirLangganan(
    sekarang,
    tenant?.subscriptionEndsAt ?? null,
    SUBSCRIPTION_DAYS,
  )

  const [baru] = await prisma.$transaction([
    prisma.payment.update({ where: { id: payment.id }, data: dataPayment }),
    prisma.tenant.update({
      where: { id: payment.tenantId },
      data: {
        plan: payment.plan,
        modulesEnabled: payment.modules,
        subscriptionEndsAt,
        // K162 — gerbang yang BERHASIL diingat sebagai bawaan berikutnya.
        preferredGateway: input.gerbang,
      },
    }),
  ])

  return { hasil: 'DITERAPKAN', payment: baru, status: 'PAID', aktif: true }
}
