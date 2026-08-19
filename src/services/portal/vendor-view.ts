// Proyeksi Vendor Portal (K171, Fase 8g) — cetakan customer-view.ts (K167).
// Vendor tidak pernah membaca model Prisma mentah; setiap layar dilayani
// fungsi di sini yang mengembalikan TIPE BARU, daftar putih kolom demi kolom.
//
// K148 sudah menyaring BARIS (portal-guard + RLS, dua sumbu). Berkas ini
// menutup celah yang K148 SENGAJA tidak dirancang menutup: KOLOM. Harga jual,
// skor vendor (K113/VendorRating), dan vendor lain TIDAK PERNAH ikut proyeksi
// di sini — lihat K171 di docs/FASE-8-SAAS-COMMERCIAL.md untuk daftar
// larangannya kata demi kata.
//
// ⚠️ Batasan GRANT Postgres yang sama dengan customer-view.ts berlaku di sini:
// `PurchaseOrderItem` bukan salah satu dari lima tabel yang di-GRANT ke
// `maritime_portal` (lihat catatan panjang di customer-view.ts) — baris
// itemnya diambil lewat klien INTERNAL memakai id PurchaseOrder yang SUDAH
// terbukti milik vendor ini lewat `pctx.db`.
//
// ⚠️ BEDA PENTING dari customer-view.ts (ditemukan lewat kegagalan sungguhan
// `check-vendor-portal.mjs`, bukan diduga di atas kertas): `namaKapalPelabuhanUntuk()`
// di customer-view.ts memanggil `pctx.db.voyage.findMany()` — itu SAH untuk
// pelanggan karena `MODEL_PORTAL.Voyage` punya kunci `customer`. Tapi
// `MODEL_PORTAL.Voyage` TIDAK PUNYA kunci `vendor` sama sekali (K171: vendor
// tidak pernah membaca Voyage langsung, hanya lewat PO/WO miliknya) — sesi
// VENDOR yang mencoba `pctx.db.voyage` SELALU dilempar portal-guard
// ("Voyage tidak punya kunci untuk pihak VENDOR"), fungsi customer TAK BISA
// dipakai ulang di sini. `namaKapalPelabuhanUntukVendor()` di bawah karena itu
// TIDAK PERNAH menyentuh `pctx.db.voyage` — `voyageId` yang dipakainya sudah
// terbukti aman lewat baris PO/WO (yang MEMANG di-GRANT ke vendor), jadi
// Voyage/Vessel/Port-nya langsung diambil lewat klien INTERNAL seluruhnya.

import type { PurchaseStatus, WorkOrderStatus } from '@prisma/client'
import type { PortalContext } from './context'
import { notFound, forbidden } from '../errors'
import { systemContext } from '../context'
import { forTenant } from '../tenant-db'

/** Cetakan pastikanPelanggan() di customer-view.ts — pesan galat jelas, bukan galat generik portal-guard. */
function pastikanVendor(pctx: PortalContext): void {
  if (pctx.pihak !== 'VENDOR') throw forbidden('Layar ini hanya untuk vendor.')
}

/**
 * Nama kapal/pelabuhan/nomor voyage untuk `voyageId` yang SUDAH terbukti aman
 * (berasal dari baris PO/WO yang lolos portal-guard+RLS, K147/K148) — lihat
 * catatan kepala berkas untuk alasan ini TIDAK memakai `pctx.db.voyage` sama
 * sekali, beda dari customer-view.ts.
 */
async function namaKapalPelabuhanUntukVendor(
  pctx: PortalContext,
  voyageIds: readonly string[],
): Promise<Map<string, { kapal: string | null; pelabuhan: string | null; voyageNumber: string }>> {
  const hasil = new Map<string, { kapal: string | null; pelabuhan: string | null; voyageNumber: string }>()
  const idUnik = Array.from(new Set(voyageIds)).filter(Boolean)
  if (idUnik.length === 0) return hasil

  const sysCtx = systemContext(pctx.tenantId)
  const voyages = await forTenant(sysCtx).voyage.findMany({
    where: { id: { in: idUnik } },
    select: { id: true, voyageNumber: true, vesselId: true, portId: true },
  })

  const vesselIds = Array.from(new Set(voyages.map((v) => v.vesselId).filter((x): x is string => !!x)))
  const portIds = Array.from(new Set(voyages.map((v) => v.portId).filter((x): x is string => !!x)))
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

// ------------------------------------------------------------------ tipe

export type PurchaseOrderPortal = {
  id: string
  nomor: string
  tanggal: string // ISO, issuedAt
  status: string
  mataUang: string
  total: number
  jatuhTempo: string | null // neededBy
  kirimKe: string | null // deliveryTo
  kapal: string | null
  voyage: string | null
}

export type PurchaseOrderDetailPortal = PurchaseOrderPortal & {
  baris: { uraian: string; kuantitas: number; satuan: string | null; hargaSatuan: number; jumlah: number }[]
}

export type WorkOrderPortal = {
  id: string
  nomor: string
  lingkup: string // scope
  status: string
  mataUang: string
  nilaiKesepakatan: number | null // agreedAmount — P53: ditampilkan (interim)
  jadwalMulai: string | null // plannedStart
  jadwalSelesai: string | null // plannedEnd
  kapal: string | null
  pelabuhan: string | null
  voyage: string | null
}

export type SubmissionPortal = {
  id: string
  nomorTagihan: string // invoiceNo
  tanggalTagihan: string // ISO, invoiceDate
  mataUang: string
  jumlah: number // amount — "vendor menyatakan", bukan angka tepercaya (K172/3)
  catatan: string | null
  status: string
  catatanTinjauan: string | null // reviewNote
  ditinjauPada: string | null // reviewedAt ISO
  purchaseOrder: string | null // docNumber, bila ditautkan
  workOrder: string | null // woNumber, bila ditautkan
  createdAt: string
}

export type DashboardVendorPortal = {
  poTerbuka: number
  woTerbuka: number
  tagihanMenunggu: number // SUBMITTED + UNDER_REVIEW
}

// -------------------------------------------------------------------- PO

/**
 * K171 — PO `DRAFT`/`PENDING_APPROVAL`/`APPROVED` TIDAK PERNAH tampil ke
 * vendor: dokumen yang belum resmi dikirim bisa berubah atau batal. Hanya
 * `SENT` ke atas (transisi `APPROVED → SENT`, po-status.ts) yang jadi
 * kenyataan bagi pihak luar — kalimat literal §12 K171.
 */
const STATUS_PO_TERSEMBUNYI: readonly PurchaseStatus[] = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED']

type PoBaku = {
  id: string
  docNumber: string
  issuedAt: Date
  status: string
  currency: string
  grandTotal: number
  neededBy: Date | null
  deliveryTo: string | null
  voyageId: string | null
}

function kePurchaseOrderPortal(po: PoBaku, info?: { kapal: string | null; voyageNumber: string }): PurchaseOrderPortal {
  return {
    id: po.id,
    nomor: po.docNumber,
    tanggal: po.issuedAt.toISOString(),
    status: po.status,
    mataUang: po.currency,
    total: po.grandTotal,
    jatuhTempo: po.neededBy?.toISOString() ?? null,
    kirimKe: po.deliveryTo,
    kapal: info?.kapal ?? null,
    voyage: info?.voyageNumber ?? null,
  }
}

/** K171 — "Pesanan": PurchaseOrder ber-vendorId = pihaknya, kind PO saja (bukan PR — belum ditujukan ke vendor mana pun). */
export async function listPurchaseOrdersPortal(pctx: PortalContext): Promise<PurchaseOrderPortal[]> {
  pastikanVendor(pctx)
  const rows = await pctx.db.purchaseOrder.findMany({
    where: { deletedAt: null, kind: 'PO', status: { notIn: Array.from(STATUS_PO_TERSEMBUNYI) } },
    select: {
      id: true, docNumber: true, issuedAt: true, status: true, currency: true,
      grandTotal: true, neededBy: true, deliveryTo: true, voyageId: true,
    },
    orderBy: { issuedAt: 'desc' },
  })

  const peta = await namaKapalPelabuhanUntukVendor(pctx, rows.map((r) => r.voyageId).filter((x): x is string => !!x))
  return rows.map((r) => kePurchaseOrderPortal(r, r.voyageId ? peta.get(r.voyageId) : undefined))
}

/** K171 — detail PO + baris. `PurchaseOrderItem` diambil lewat klien internal (lihat catatan kepala berkas). */
export async function getPurchaseOrderDetailPortal(pctx: PortalContext, id: string): Promise<PurchaseOrderDetailPortal> {
  pastikanVendor(pctx)
  const po = await pctx.db.purchaseOrder.findFirst({
    where: { id, deletedAt: null, kind: 'PO', status: { notIn: Array.from(STATUS_PO_TERSEMBUNYI) } },
    select: {
      id: true, docNumber: true, issuedAt: true, status: true, currency: true,
      grandTotal: true, neededBy: true, deliveryTo: true, voyageId: true,
    },
  })
  if (!po) throw notFound('Purchase Order')

  const sysCtx = systemContext(pctx.tenantId)
  const [peta, items] = await Promise.all([
    po.voyageId ? namaKapalPelabuhanUntukVendor(pctx, [po.voyageId]) : Promise.resolve(new Map()),
    forTenant(sysCtx).purchaseOrderItem.findMany({
      where: { purchaseOrderId: po.id },
      select: { description: true, quantity: true, unit: true, unitPrice: true, amount: true },
      orderBy: { displayOrder: 'asc' },
    }),
  ])

  return {
    ...kePurchaseOrderPortal(po, po.voyageId ? peta.get(po.voyageId) : undefined),
    baris: items.map((it) => ({
      uraian: it.description, kuantitas: it.quantity, satuan: it.unit, hargaSatuan: it.unitPrice, jumlah: it.amount,
    })),
  }
}

// -------------------------------------------------------------------- WO

/** K171 — hanya WO yang sudah `ISSUED` ke vendor (dokumen belum resmi = `DRAFT` sengaja disembunyikan, cetakan pola PO). */
const STATUS_WO_TERSEMBUNYI: readonly WorkOrderStatus[] = ['DRAFT']

type WoBaku = {
  id: string
  woNumber: string
  scope: string
  status: string
  currency: string
  agreedAmount: number | null
  plannedStart: Date | null
  plannedEnd: Date | null
  voyageId: string
}

function keWorkOrderPortal(wo: WoBaku, info?: { kapal: string | null; pelabuhan: string | null; voyageNumber: string }): WorkOrderPortal {
  return {
    id: wo.id,
    nomor: wo.woNumber,
    lingkup: wo.scope,
    status: wo.status,
    mataUang: wo.currency,
    nilaiKesepakatan: wo.agreedAmount,
    jadwalMulai: wo.plannedStart?.toISOString() ?? null,
    jadwalSelesai: wo.plannedEnd?.toISOString() ?? null,
    kapal: info?.kapal ?? null,
    pelabuhan: info?.pelabuhan ?? null,
    voyage: info?.voyageNumber ?? null,
  }
}

/** K171 — "Perintah kerja": WorkOrder ber-vendorId = pihaknya. TANPA VendorRating/skor. */
export async function listWorkOrdersPortal(pctx: PortalContext): Promise<WorkOrderPortal[]> {
  pastikanVendor(pctx)
  const rows = await pctx.db.workOrder.findMany({
    where: { deletedAt: null, status: { notIn: Array.from(STATUS_WO_TERSEMBUNYI) } },
    select: {
      id: true, woNumber: true, scope: true, status: true, currency: true,
      agreedAmount: true, plannedStart: true, plannedEnd: true, voyageId: true,
    },
    orderBy: [{ plannedStart: 'desc' }, { createdAt: 'desc' }],
  })

  const peta = await namaKapalPelabuhanUntukVendor(pctx, rows.map((r) => r.voyageId))
  return rows.map((r) => keWorkOrderPortal(r, peta.get(r.voyageId)))
}

/** K171 — detail WO. Tak ada model anak (scope = teks bebas), jadi tak butuh klien internal untuk baris. */
export async function getWorkOrderDetailPortal(pctx: PortalContext, id: string): Promise<WorkOrderPortal> {
  pastikanVendor(pctx)
  const wo = await pctx.db.workOrder.findFirst({
    where: { id, deletedAt: null, status: { notIn: Array.from(STATUS_WO_TERSEMBUNYI) } },
    select: {
      id: true, woNumber: true, scope: true, status: true, currency: true,
      agreedAmount: true, plannedStart: true, plannedEnd: true, voyageId: true,
    },
  })
  if (!wo) throw notFound('Work Order')

  const peta = await namaKapalPelabuhanUntukVendor(pctx, [wo.voyageId])
  return keWorkOrderPortal(wo, peta.get(wo.voyageId))
}

// ------------------------------------------------------------- tagihan saya

/** K171 — "Tagihan saya": riwayat VendorInvoiceSubmission milik pihaknya + status (K172). */
export async function listSubmissionsPortal(pctx: PortalContext): Promise<SubmissionPortal[]> {
  pastikanVendor(pctx)
  const rows = await pctx.db.vendorInvoiceSubmission.findMany({
    where: {},
    select: {
      id: true, invoiceNo: true, invoiceDate: true, currency: true, amount: true, note: true,
      status: true, reviewNote: true, reviewedAt: true, purchaseOrderId: true, workOrderId: true, createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  const poIds = Array.from(new Set(rows.map((r) => r.purchaseOrderId).filter((x): x is string => !!x)))
  const woIds = Array.from(new Set(rows.map((r) => r.workOrderId).filter((x): x is string => !!x)))
  const sysCtx = systemContext(pctx.tenantId)
  const [pos, wos] = await Promise.all([
    poIds.length ? forTenant(sysCtx).purchaseOrder.findMany({ where: { id: { in: poIds } }, select: { id: true, docNumber: true } }) : [],
    woIds.length ? forTenant(sysCtx).workOrder.findMany({ where: { id: { in: woIds } }, select: { id: true, woNumber: true } }) : [],
  ])
  const namaPo = new Map(pos.map((p) => [p.id, p.docNumber]))
  const namaWo = new Map(wos.map((w) => [w.id, w.woNumber]))

  return rows.map((r) => ({
    id: r.id,
    nomorTagihan: r.invoiceNo,
    tanggalTagihan: r.invoiceDate.toISOString(),
    mataUang: r.currency,
    jumlah: r.amount,
    catatan: r.note,
    status: r.status,
    catatanTinjauan: r.reviewNote,
    ditinjauPada: r.reviewedAt?.toISOString() ?? null,
    purchaseOrder: r.purchaseOrderId ? (namaPo.get(r.purchaseOrderId) ?? null) : null,
    workOrder: r.workOrderId ? (namaWo.get(r.workOrderId) ?? null) : null,
    createdAt: r.createdAt.toISOString(),
  }))
}

// ------------------------------------------------------------------ beranda

/** K171 — Beranda: PO/WO terbuka, tagihan menunggu. Tanpa agregat lintas-tenant (cetakan customer dashboardPortal). */
export async function dashboardVendorPortal(pctx: PortalContext): Promise<DashboardVendorPortal> {
  pastikanVendor(pctx)
  const [poTerbuka, woTerbuka, tagihanMenunggu] = await Promise.all([
    pctx.db.purchaseOrder.count({
      where: { deletedAt: null, kind: 'PO', status: { notIn: [...STATUS_PO_TERSEMBUNYI, 'CLOSED', 'CANCELLED'] } },
    }),
    pctx.db.workOrder.count({
      where: { deletedAt: null, status: { notIn: [...STATUS_WO_TERSEMBUNYI, 'VERIFIED', 'CANCELLED'] } },
    }),
    pctx.db.vendorInvoiceSubmission.count({ where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } }),
  ])

  return { poTerbuka, woTerbuka, tagihanMenunggu }
}
