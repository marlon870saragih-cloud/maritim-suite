// Kuitansi langganan — SubscriptionInvoice + Item (K164, Fase 8e).
//
// Pola meniru port.service.ts (⭐ MODUL RUJUKAN) untuk pembacaan; penerbitannya
// sendiri sengaja TIDAK lewat `withTenant()` biasa — ia lahir dari webhook
// gerbang pembayaran, jalur yang sama tanpa-sesi dengan `billing-activation.ts`
// (lihat catatan "prisma mentah" di sana). `siapkanKuitansiLangganan()` di
// bawah HANYA MENYIAPKAN operasi Prisma-nya (satu query async untuk nomor,
// lalu `create()` yang TIDAK di-`await`) — pemanggil (billing-activation.ts)
// yang menaruh hasilnya ke `$transaction` yang sama dengan `Payment`/`Tenant`.
// Itulah yang membuat §17/8e butir 1-2 benar: SATU pembayaran lunas = SATU
// kuitansi, dan pemutaran ulang (idempotensi K161) tidak pernah melahirkan
// kuitansi kedua — jalur itu sudah berhenti di "sudah PAID?" SEBELUM fungsi
// ini sempat dipanggil sama sekali.

import type { Prisma, SubscriptionInvoice } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { formatDocNumber, monthWindow } from '@/lib/doc-number'
import { getBillingPlan, SUBSCRIPTION_DAYS } from '@/lib/billing/plans'
import { addonById, totalHargaAddon } from './commercial-policy'
import type { TenantContext } from '../context'
import { requireRole } from '../context'
import { forTenant } from '../tenant-db'
import { notFound } from '../errors'

/** K155 — siapa boleh membuka halaman Billing sama sekali (lihat /settings/billing/page.tsx). */
const PERAN_LIHAT_BILLING = ['ADMIN', 'FINANCE'] as const

const DOCTYPE = 'SUBSCRIPTION_INVOICE'

function ekorAngka(invoiceNumber: string): number {
  const ekor = invoiceNumber.slice(invoiceNumber.lastIndexOf('/') + 1)
  const n = Number(ekor)
  return Number.isFinite(n) ? n : 0
}

/**
 * Nomor berikutnya, PER TENANT PER BULAN — pola identik `nextInvoiceNumber`/
 * `nextVoyageNumber` (K32). `@@unique([tenantId, invoiceNumber])` di skema
 * yang menjamin tabrakan (dua webhook nyaris bersamaan) berakhir sebagai
 * P2002, bukan duplikat senyap — risiko yang sama diterima sadar di seluruh
 * penomoran dokumen aplikasi ini (satu operator/webhook sekaligus).
 *
 * ⚠️ Query MENTAH (`prisma.subscriptionInvoice`, bukan `forTenant()`): berkas
 * ini dipanggil dari `billing-activation.ts`, yang tidak punya `TenantContext`
 * sama sekali (webhook diautentikasi tanda tangan, bukan sesi).
 */
/**
 * K164 — nomor kuitansi berikutnya, diselesaikan SEBELUM transaksi dibuka.
 *
 * ⚠️ Diekspor TERPISAH dari `buatOperasiKuitansi()` di bawah (bukan digabung
 * jadi satu fungsi `async` yang me-`return prisma.subscriptionInvoice.create(
 * ...)`), dan itu bukan gaya — TypeScript membongkar thenable BERLAPIS lewat
 * `Awaited<T>` secara REKURSIF. `create()` sendiri mengembalikan
 * `PrismaPromise` (yang JUGA thenable). Kalau digabung, `await
 * buatSatuFungsi()` di pemanggil tidak berhenti di `PrismaPromise` — ia
 * dibongkar sekali lagi sampai ke barisnya yang sudah jadi, MENJALANKAN
 * operasinya SAAT ITU JUGA alih-alih menyerahkan `PrismaPromise` yang belum
 * dieksekusi untuk ditaruh ke `$transaction([...])`. (Ditemukan lewat error
 * `tsc` sungguhan: elemen array `$transaction` yang seharusnya `PrismaPromise`
 * malah bertipe baris `SubscriptionInvoice` biasa.) Memisah "yang memang
 * boleh di-`await`" (nomor, string biasa) dari "yang harus TETAP
 * `PrismaPromise` belum-jalan" (operasi `create`) menghindarinya sepenuhnya.
 */
export async function nomorKuitansiBerikutnya(tenantId: string): Promise<string> {
  const { year, mm } = monthWindow()
  const contoh = formatDocNumber(DOCTYPE, year, mm, 1)
  const prefix = contoh.slice(0, contoh.lastIndexOf('/') + 1)

  const terakhir = await prisma.subscriptionInvoice.findFirst({
    where: { tenantId, invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: 'desc' },
    select: { invoiceNumber: true },
  })
  return formatDocNumber(DOCTYPE, year, mm, (terakhir ? ekorAngka(terakhir.invoiceNumber) : 0) + 1)
}

/**
 * K164 — bentuk (belum menjalankan) operasi `create` untuk SATU kuitansi dari
 * SATU pembayaran lunas. Pemanggil menaruh nilai kembaliannya langsung ke
 * dalam `$transaction([...])` bersama `Payment`/`Tenant` (K164: "di dalam
 * transaksi yang sama dengan perpanjangan langganan") — SENGAJA tidak
 * di-`await` di sini maupun di pemanggil.
 *
 * Baris `SubscriptionInvoiceItem`: satu untuk paket (harga = `Payment.amount`
 * DIKURANGI total add-on — sisanya murni harga paket, K165 "baris TAMBAHAN
 * pada pesanan yang sama", bukan digabung jadi satu angka buram), lalu satu
 * baris per add-on yang tercatat di `Payment.addons`.
 *
 * ⚠️ P64 (19 Ags 2026, keputusan Marlon): TANPA PPN. `taxAmount` tetap `0`
 * sampai kebijakan berubah — kolomnya sudah ada (K164 menyiapkannya) supaya
 * mengubah kebijakan nanti adalah satu angka di sini, bukan migration baru.
 */
export function buatOperasiKuitansi(
  payment: { id: string; tenantId: string; planId: string; amount: number; addons: string[] },
  invoiceNumber: string,
): Prisma.PrismaPromise<SubscriptionInvoice> {
  const plan = getBillingPlan(payment.planId)

  const totalAddon = totalHargaAddon(payment.addons) ?? 0
  const items: Prisma.SubscriptionInvoiceItemCreateWithoutSubscriptionInvoiceInput[] = [
    {
      description: `Langganan ${plan?.labelId ?? payment.planId} — ${SUBSCRIPTION_DAYS} hari`,
      amount: payment.amount - totalAddon,
    },
    ...payment.addons.map((id) => {
      const a = addonById(id)
      return { description: `Add-on: ${a?.labelId ?? id}`, amount: a?.priceIDR ?? 0 }
    }),
  ]
  const subtotal = items.reduce((s, i) => s + i.amount, 0)
  const taxAmount = 0 // P64 — tanpa PPN, lihat catatan di atas.

  return prisma.subscriptionInvoice.create({
    data: {
      tenant: { connect: { id: payment.tenantId } },
      payment: { connect: { id: payment.id } },
      invoiceNumber,
      currency: 'IDR',
      subtotal,
      taxAmount,
      grandTotal: subtotal + taxAmount,
      items: { create: items },
    },
  })
}

// ------------------------------------------------------------------ pembacaan

export type SubscriptionInvoiceRow = SubscriptionInvoice

/** Riwayat kuitansi tenant ini, terbaru dulu. ADMIN & FINANCE saja (K155) — OPERATOR dkk. 403 di sini juga, bukan cuma di halaman. */
export async function listSubscriptionInvoices(ctx: TenantContext): Promise<SubscriptionInvoiceRow[]> {
  requireRole(ctx, ...PERAN_LIHAT_BILLING)
  return forTenant(ctx).subscriptionInvoice.findMany({ orderBy: { issuedAt: 'desc' } })
}

export type SubscriptionInvoiceDetail = SubscriptionInvoice & {
  items: { id: string; description: string; amount: number }[]
  payment: { gateway: string | null; gatewayRef: string | null; payMethod: string | null; paidAt: Date | null } | null
}

/** Satu kuitansi + baris + ringkasan pembayarannya. ADMIN & FINANCE saja (K155); kepemilikan terjamin `forTenant()` (K44). */
export async function getSubscriptionInvoiceDetail(
  ctx: TenantContext,
  id: string,
): Promise<SubscriptionInvoiceDetail> {
  requireRole(ctx, ...PERAN_LIHAT_BILLING)
  const inv = await forTenant(ctx).subscriptionInvoice.findFirst({
    where: { id },
    include: {
      items: { select: { id: true, description: true, amount: true } },
      payment: { select: { gateway: true, gatewayRef: true, payMethod: true, paidAt: true } },
    },
  })
  if (!inv) throw notFound('Kuitansi langganan')
  return inv
}
