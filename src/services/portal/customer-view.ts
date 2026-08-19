// Proyeksi Customer Portal (K167, Fase 8f) — pelanggan tidak pernah membaca
// model Prisma mentah. `Response.json(baris)` atas model Prisma DILARANG di
// seluruh `/api/portal/**` (K167); setiap layar dilayani fungsi di sini yang
// mengembalikan TIPE BARU, daftar putih kolom demi kolom.
//
// K148 sudah menyaring BARIS lewat `pctx.db` (dua lapis: portal-guard +
// RLS). Berkas ini menutup celah yang K148 SENGAJA tidak dirancang menutup:
// KOLOM. `Disbursement` memuat margin, `Voyage.notes` memuat catatan internal,
// FDA/EPDA memuat vendor & harga beli — semuanya TIDAK PERNAH ikut proyeksi
// di sini, meski baris induknya sudah terbukti milik pihak yang benar.
//
// ⚠️ BATASAN NYATA (ditemukan lewat kegagalan sungguhan, bukan diduga di
// atas kertas): `pctx.db` HANYA bisa menyentuh LIMA tabel yang benar-benar
// diberi `GRANT SELECT` ke peran Postgres `maritime_portal` di migrasi 8a
// (`Invoice`, `Voyage`, `PurchaseOrder`, `WorkOrder`, `VendorInvoiceSubmission`
// — lihat `20260818163500_fase8a_portal_rls/migration.sql`). Ini BUKAN cuma
// soal portal-guard.ts (lapis aplikasi); ini `permission denied` di level
// PostgreSQL itu sendiri — muncul bahkan untuk relasi NESTED yang portal-guard
// sama sekali tak sempat ikut memutuskan. `Vessel`/`Port` TIDAK ADA di daftar
// itu, jadi `voyage: { select: { vessel: {...} } }` gagal keras dengan
// "permission denied for table Vessel" — persis begitu ditemukan saat
// `check-customer-portal.mjs` benar-benar dijalankan lewat HTTP.
//
// Perbaikannya BUKAN memperluas GRANT (itu perubahan K147 yang lebih besar,
// di luar cakupan siapa boleh membaca APA yang sudah diputuskan K150/39
// pemeriksaan) — melainkan pola yang SAMA dengan document.service.ts: baca
// id yang TERBUKTI milik pihak ini lewat `pctx.db` (Invoice/Voyage, granted),
// lalu ambil NAMA kapal/pelabuhannya lewat klien INTERNAL (`systemContext`,
// pola K144/4). Aman karena id yang dipakai untuk query kedua adalah id yang
// SUDAH difilter portal-guard+RLS di query pertama — tak pernah dari input.

import type { InvoiceStatus, VoyageStatus } from '@prisma/client'
import type { PortalContext } from './context'
import { notFound, forbidden } from '../errors'
import { systemContext } from '../context'
import { forTenant } from '../tenant-db'

/**
 * Setiap fungsi di berkas ini dipanggil hanya dari route `/api/portal/{invoices,
 * voyages,dashboard}` yang memang untuk pelanggan — tapi portal-guard SENDIRI
 * sudah akan menolak (Invoice/Voyage di MODEL_PORTAL hanya punya kunci
 * `customer`, bukan `vendor`) bila sesi ini kebetulan VENDOR. Pemeriksaan
 * eksplisit di sini bukan pagar KEDUA yang berarti — ia hanya membuat pesan
 * galatnya jelas ("bukan pelanggan"), bukan galat generik portal-guard.
 */
function pastikanPelanggan(pctx: PortalContext): void {
  if (pctx.pihak !== 'CUSTOMER') throw forbidden('Layar ini hanya untuk pelanggan.')
}

// ------------------------------------------------------------------ tipe

export type InvoicePortal = {
  id: string
  nomor: string
  tanggal: string // ISO
  jatuhTempo: string | null
  mataUang: string
  total: number
  sudahDibayar: number
  sisa: number
  status: string
  kapal: string | null
  voyage: string | null // nomor voyage saja
}

export type InvoiceDetailPortal = InvoicePortal & {
  baris: { uraian: string; jumlah: number }[]
  pembayaran: { tanggal: string; jumlah: number; mataUang: string; rujukan: string | null }[]
}

export type VoyagePortal = {
  id: string
  nomor: string
  kapal: string | null
  pelabuhan: string | null
  status: string
  eta: string | null
  etb: string | null
  etd: string | null
  ata: string | null
}

export type DashboardPortal = {
  tagihanTerbuka: number
  totalOutstanding: number
  mataUangUtama: string | null
  kunjunganBerjalan: number
}

// ---------------------------------------------------------- nama kapal/pelabuhan

/**
 * Nama kapal & pelabuhan untuk sekumpulan `voyageId` yang SUDAH terbukti milik
 * pihak ini. Dua langkah: `Voyage.vesselId`/`portId` (Voyage tergrant, K147)
 * lewat `pctx.db`, lalu `Vessel.name`/`Port.name` (TIDAK tergrant) lewat klien
 * internal — lihat catatan kepala berkas.
 */
async function namaKapalPelabuhanUntuk(
  pctx: PortalContext,
  voyageIds: readonly string[],
): Promise<Map<string, { kapal: string | null; pelabuhan: string | null; voyageNumber: string }>> {
  const hasil = new Map<string, { kapal: string | null; pelabuhan: string | null; voyageNumber: string }>()
  const idUnik = Array.from(new Set(voyageIds)).filter(Boolean)
  if (idUnik.length === 0) return hasil

  const voyages = await pctx.db.voyage.findMany({
    where: { id: { in: idUnik } },
    select: { id: true, voyageNumber: true, vesselId: true, portId: true },
  })

  const vesselIds = Array.from(new Set(voyages.map((v) => v.vesselId).filter((x): x is string => !!x)))
  const portIds = Array.from(new Set(voyages.map((v) => v.portId).filter((x): x is string => !!x)))

  const sysCtx = systemContext(pctx.tenantId)
  const [vessels, ports] = await Promise.all([
    vesselIds.length ? forTenant(sysCtx).vessel.findMany({ where: { id: { in: vesselIds } }, select: { id: true, name: true } }) : [],
    portIds.length ? forTenant(sysCtx).port.findMany({ where: { id: { in: portIds } }, select: { id: true, name: true } }) : [],
  ])
  const namaVessel = new Map(vessels.map((v) => [v.id, v.name]))
  const namaPort = new Map(ports.map((p) => [p.id, p.name]))

  for (const v of voyages) {
    hasil.set(v.id, {
      voyageNumber: v.voyageNumber,
      kapal: v.vesselId ? (namaVessel.get(v.vesselId) ?? null) : null,
      pelabuhan: v.portId ? (namaPort.get(v.portId) ?? null) : null,
    })
  }
  return hasil
}

// ------------------------------------------------------------------ tagihan

/**
 * Status yang TIDAK PERNAH tampil ke pelanggan: `DRAFT` belum resmi diterbitkan
 * (bukan komitmen tagihan yang boleh dilihat pihak luar), `CANCELLED` sudah
 * dibatalkan dan bukan urusan pelanggan lagi. Keputusan produk yang sadar,
 * bukan bawaan Prisma — sejalan K167 "daftar putih, bukan daftar hitam": yang
 * tidak disebut boleh tampil di sini justru DRAFT/CANCELLED yang disaring.
 */
const STATUS_TERSEMBUNYI: readonly InvoiceStatus[] = ['DRAFT', 'CANCELLED']

type InvoiceBaku = {
  id: string
  invoiceNumber: string
  invoiceDate: Date
  dueDate: Date | null
  currency: string
  grandTotal: number
  amountPaid: number
  status: string
  voyageId: string | null
}

function keInvoicePortal(
  inv: InvoiceBaku,
  info?: { kapal: string | null; voyageNumber: string },
): InvoicePortal {
  return {
    id: inv.id,
    nomor: inv.invoiceNumber,
    tanggal: inv.invoiceDate.toISOString(),
    jatuhTempo: inv.dueDate?.toISOString() ?? null,
    mataUang: inv.currency,
    total: inv.grandTotal,
    sudahDibayar: inv.amountPaid,
    sisa: Math.max(0, inv.grandTotal - inv.amountPaid),
    status: inv.status,
    kapal: info?.kapal ?? null,
    voyage: info?.voyageNumber ?? null,
  }
}

/** K167 — "Tagihan saya": daftar Invoice ber-customerId = pihaknya. */
export async function listInvoicesPortal(pctx: PortalContext): Promise<InvoicePortal[]> {
  pastikanPelanggan(pctx)
  const rows = await pctx.db.invoice.findMany({
    where: { deletedAt: null, status: { notIn: Array.from(STATUS_TERSEMBUNYI) } },
    select: {
      id: true, invoiceNumber: true, invoiceDate: true, dueDate: true, currency: true,
      grandTotal: true, amountPaid: true, status: true, voyageId: true,
    },
    orderBy: { invoiceDate: 'desc' },
  })

  const peta = await namaKapalPelabuhanUntuk(pctx, rows.map((r) => r.voyageId).filter((x): x is string => !!x))
  return rows.map((r) => keInvoicePortal(r, r.voyageId ? peta.get(r.voyageId) : undefined))
}

/**
 * K167 — "Detail tagihan": baris tagihan + pembayaran yang sudah tercatat.
 *
 * ⚠️ `InvoiceItem`/`InvoicePayment` TIDAK BISA diambil lewat `include` dari
 * `pctx.db.invoice`, meski keduanya model ANAK Invoice (K44). Alasannya sama
 * dengan Vessel/Port di atas, dan sama-sama baru ketahuan lewat kegagalan
 * sungguhan (bukan diduga di atas kertas): GRANT Postgres untuk peran
 * `maritime_portal` berlaku PER TABEL, bukan mengikuti hubungan induk-anak —
 * migrasi 8a hanya memberi `GRANT SELECT` pada LIMA tabel (Invoice, Voyage,
 * PurchaseOrder, WorkOrder, VendorInvoiceSubmission). `InvoiceItem` dan
 * `InvoicePayment` tidak termasuk, jadi `include`/nested `select` ke keduanya
 * gagal "permission denied for table InvoiceItem" — persis pola yang sama
 * dengan Vessel, ditemukan lagi lewat `check-customer-portal.mjs`.
 *
 * Perbaikannya IDENTIK: `pctx.db` hanya mengambil `id` Invoice yang TERBUKTI
 * milik pihak ini, lalu `InvoiceItem`/`InvoicePayment`-nya diambil lewat klien
 * INTERNAL memakai id yang sudah terbukti itu — bukan dari input pemanggil.
 */
export async function getInvoiceDetailPortal(pctx: PortalContext, id: string): Promise<InvoiceDetailPortal> {
  pastikanPelanggan(pctx)
  const inv = await pctx.db.invoice.findFirst({
    where: { id, deletedAt: null, status: { notIn: Array.from(STATUS_TERSEMBUNYI) } },
    select: {
      id: true, invoiceNumber: true, invoiceDate: true, dueDate: true, currency: true,
      grandTotal: true, amountPaid: true, status: true, voyageId: true,
    },
  })
  if (!inv) throw notFound('Invoice')

  const sysCtx = systemContext(pctx.tenantId)
  const [peta, items, payments] = await Promise.all([
    inv.voyageId ? namaKapalPelabuhanUntuk(pctx, [inv.voyageId]) : Promise.resolve(new Map()),
    forTenant(sysCtx).invoiceItem.findMany({
      where: { invoiceId: inv.id },
      select: { description: true, amount: true },
      orderBy: { displayOrder: 'asc' },
    }),
    forTenant(sysCtx).invoicePayment.findMany({
      where: { invoiceId: inv.id },
      select: { paymentDate: true, amount: true, currency: true, referenceNumber: true },
      orderBy: { paymentDate: 'desc' },
    }),
  ])

  return {
    ...keInvoicePortal(inv, inv.voyageId ? peta.get(inv.voyageId) : undefined),
    baris: items.map((it) => ({ uraian: it.description, jumlah: it.amount })),
    pembayaran: payments.map((p) => ({
      tanggal: p.paymentDate.toISOString(),
      jumlah: p.amount,
      mataUang: p.currency,
      rujukan: p.referenceNumber,
    })),
  }
}

// ------------------------------------------------------------------ kunjungan

/** K167 — "Kunjungan kapal": Voyage ber-customerId = pihaknya. TANPA notes/biaya/tugas/komentar internal. */
export async function listVoyagesPortal(pctx: PortalContext): Promise<VoyagePortal[]> {
  pastikanPelanggan(pctx)
  const rows = await pctx.db.voyage.findMany({
    where: { deletedAt: null },
    select: {
      id: true, voyageNumber: true, status: true, eta: true, etb: true, etd: true, ata: true,
      vesselId: true, portId: true,
    },
    orderBy: [{ eta: 'desc' }, { createdAt: 'desc' }],
  })

  const sysCtx = systemContext(pctx.tenantId)
  const vesselIds = Array.from(new Set(rows.map((v) => v.vesselId).filter((x): x is string => !!x)))
  const portIds = Array.from(new Set(rows.map((v) => v.portId).filter((x): x is string => !!x)))
  const [vessels, ports] = await Promise.all([
    vesselIds.length ? forTenant(sysCtx).vessel.findMany({ where: { id: { in: vesselIds } }, select: { id: true, name: true } }) : [],
    portIds.length ? forTenant(sysCtx).port.findMany({ where: { id: { in: portIds } }, select: { id: true, name: true } }) : [],
  ])
  const namaVessel = new Map(vessels.map((v) => [v.id, v.name]))
  const namaPort = new Map(ports.map((p) => [p.id, p.name]))

  return rows.map((v) => ({
    id: v.id,
    nomor: v.voyageNumber,
    kapal: v.vesselId ? (namaVessel.get(v.vesselId) ?? null) : null,
    pelabuhan: v.portId ? (namaPort.get(v.portId) ?? null) : null,
    status: v.status,
    eta: v.eta?.toISOString() ?? null,
    etb: v.etb?.toISOString() ?? null,
    etd: v.etd?.toISOString() ?? null,
    ata: v.ata?.toISOString() ?? null,
  }))
}

/** K167 — Beranda: berapa tagihan terbuka, total outstanding, kunjungan berjalan. Tanpa agregat lintas-tenant (K167 catatan 4). */
export async function dashboardPortal(pctx: PortalContext): Promise<DashboardPortal> {
  pastikanPelanggan(pctx)
  const KEADAAN_TERBUKA: InvoiceStatus[] = ['ISSUED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE']
  const STATUS_BERJALAN: VoyageStatus[] = ['CONFIRMED', 'ARRIVED', 'BERTHED', 'WORKING']

  const [terbuka, berjalan] = await Promise.all([
    pctx.db.invoice.findMany({
      where: { deletedAt: null, status: { in: KEADAAN_TERBUKA } },
      select: { grandTotal: true, amountPaid: true, currency: true },
    }),
    pctx.db.voyage.count({ where: { deletedAt: null, status: { in: STATUS_BERJALAN } } }),
  ])

  const totalOutstanding = terbuka.reduce((s, i) => s + Math.max(0, i.grandTotal - i.amountPaid), 0)
  const mataUangUtama = terbuka[0]?.currency ?? null

  return {
    tagihanTerbuka: terbuka.length,
    totalOutstanding,
    mataUangUtama,
    kunjunganBerjalan: berjalan,
  }
}
