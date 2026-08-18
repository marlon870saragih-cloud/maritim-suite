// PurchaseOrder/PurchaseRequisition (K117-K120, K122-K123, Fase 7i). Pola
// meniru disbursement.service.ts — satu tabel untuk PR & PO (K3 diteruskan:
// bentuk & alurnya identik, beda hanya `kind` dan siapa penerimanya).
//
// K118 — total DIHITUNG lewat purchase-calc.ts (murni), BUKAN calc-engine.ts:
// PO adalah qty×harga+pajak, bukan tarif pelabuhan. K122 — PO/WO TIDAK PERNAH
// menulis baris Disbursement sendiri; lihat route
// disbursements/[id]/items/from-source untuk jalur "Ambil dari PO/WO" yang
// cuma mengisi FORM, operator tetap menyimpan sendiri.

import type { PurchaseOrder, PurchaseOrderItem, PurchaseKind, PurchaseStatus } from '@prisma/client'
import type { TenantContext } from '../context'
import { requireRole } from '../context'
import { forTenant } from '../tenant-db'
import { notFound, validation, conflict } from '../errors'
import { str, num, tanggal, wajib, pilihan } from '../input'
import { pastikanLanggananAktif } from '../subscription'
import { kursSnapshot } from '../finance/autofill.service'
import { bolehTransisiPo, transisiTersediaPo } from './po-status'
import { hitungTotalPembelian, type BarisPembelian } from './purchase-calc'
import { nextPurchaseNumber } from './purchase-number'

/** K123 — buat/ubah PR/PO, ajukan approval, tandai diterima. */
const PERAN_KELOLA_PEMBELIAN = ['ADMIN', 'OPERATOR', 'MANAJER_OPERASI', 'FINANCE'] as const

const KIND: readonly PurchaseKind[] = ['PR', 'PO']
const STATUS: readonly PurchaseStatus[] = [
  'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED',
]

export type PurchaseOrderDetail = PurchaseOrder & {
  items: PurchaseOrderItem[]
  vendor: { id: string; name: string } | null
  voyage: { id: string; voyageNumber: string } | null
  hitung: { subtotal: number; taxAmount: number; grandTotal: number }
}

async function desimalMataUang(ctx: TenantContext, code: string): Promise<number> {
  const c = await forTenant(ctx).currency.findFirst({ where: { code: code.toUpperCase() }, select: { decimals: true } })
  return c?.decimals ?? 2
}

async function lengkapi(ctx: TenantContext, po: PurchaseOrder & { items: PurchaseOrderItem[] }): Promise<PurchaseOrderDetail> {
  const [vendor, voyage, desimal] = await Promise.all([
    po.vendorId ? forTenant(ctx).vendor.findFirst({ where: { id: po.vendorId }, select: { id: true, name: true } }) : null,
    po.voyageId ? forTenant(ctx).voyage.findFirst({ where: { id: po.voyageId }, select: { id: true, voyageNumber: true } }) : null,
    desimalMataUang(ctx, po.currency),
  ])
  const baris: BarisPembelian[] = po.items.map((it) => ({ quantity: it.quantity, unitPrice: it.unitPrice }))
  const hitung = hitungTotalPembelian(baris, po.taxPct, desimal)
  return { ...po, vendor, voyage, hitung }
}

export async function listPurchaseOrders(
  ctx: TenantContext,
  f: { voyageId?: string | null; kind?: string | null; status?: string | null } = {},
): Promise<PurchaseOrderDetail[]> {
  const rows = await forTenant(ctx).purchaseOrder.findMany({
    where: {
      deletedAt: null,
      ...(f.voyageId ? { voyageId: f.voyageId } : {}),
      ...(f.kind ? { kind: f.kind as PurchaseKind } : {}),
      ...(f.status ? { status: f.status as PurchaseStatus } : {}),
    },
    include: { items: { orderBy: { displayOrder: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  })
  return Promise.all(rows.map((r) => lengkapi(ctx, r)))
}

export async function getPurchaseOrder(ctx: TenantContext, id: string): Promise<PurchaseOrderDetail> {
  const row = await forTenant(ctx).purchaseOrder.findFirst({
    where: { id, deletedAt: null },
    include: { items: { orderBy: { displayOrder: 'asc' } } },
  })
  if (!row) throw notFound('Purchase Order/Requisition')
  return lengkapi(ctx, row)
}

/**
 * PO WAJIB `vendorId` (K117); PR boleh tanpa (belum tahu vendornya). Kurs
 * di-snapshot SEKALI saat dibuat (K29/K30) — tak ada kurs untuk mata uang ≠
 * base → ditolak simpan, bukan diam-diam pakai 1 (`kursSnapshot()` yang
 * sama dipakai autofill Disbursement, 6c).
 */
export async function createPurchaseOrder(ctx: TenantContext, body: Record<string, unknown>): Promise<PurchaseOrderDetail> {
  requireRole(ctx, ...PERAN_KELOLA_PEMBELIAN)
  await pastikanLanggananAktif(ctx)

  const kind = pilihan(body.kind, KIND, 'Jenis (PR/PO)')
  const vendorId = str(body.vendorId)
  if (kind === 'PO' && !vendorId) throw validation('PO wajib punya vendor.')
  if (vendorId) {
    const v = await forTenant(ctx).vendor.findFirst({ where: { id: vendorId, deletedAt: null }, select: { id: true } })
    if (!v) throw notFound('Vendor')
  }

  const voyageId = str(body.voyageId)
  if (voyageId) {
    const v = await forTenant(ctx).voyage.findFirst({ where: { id: voyageId, deletedAt: null }, select: { id: true } })
    if (!v) throw notFound('Voyage')
  }

  const currency = (str(body.currency) ?? 'IDR').toUpperCase()
  const tenant = await forTenant(ctx).tenant.findFirst({ where: { id: ctx.tenantId }, select: { defaultCurrency: true } })
  const baseCurrency = tenant?.defaultCurrency ?? 'IDR'
  const exchangeRate = await kursSnapshot(ctx, currency, baseCurrency, new Date(), num(body.exchangeRate))

  const docNumber = await nextPurchaseNumber(ctx, kind)

  const po = await forTenant(ctx).purchaseOrder.create({
    data: {
      tenantId: ctx.tenantId,
      voyageId,
      vendorId,
      kind,
      docNumber,
      status: 'DRAFT',
      currency,
      exchangeRate,
      taxPct: num(body.taxPct),
      deliveryTo: str(body.deliveryTo),
      neededBy: tanggal(body.neededBy),
      terms: str(body.terms),
      notes: str(body.notes),
      createdByUserId: ctx.userId,
    },
    include: { items: true },
  })
  return lengkapi(ctx, po)
}

type PatchHeader = {
  vendorId?: string | null
  taxPct?: number | null
  deliveryTo?: string | null
  neededBy?: Date | null
  terms?: string | null
  notes?: string | null
}

/** Header hanya bisa diubah selagi DRAFT — sejalan Disbursement (aturan yang sama, alasan yang sama: dokumen yang sudah diajukan tak boleh berubah diam-diam di bawah approval yang sedang berjalan). */
export async function updatePurchaseOrder(ctx: TenantContext, id: string, body: Record<string, unknown>): Promise<PurchaseOrderDetail> {
  requireRole(ctx, ...PERAN_KELOLA_PEMBELIAN)
  const po = await getPurchaseOrder(ctx, id)
  if (po.status !== 'DRAFT') throw conflict(`Hanya dokumen DRAFT yang bisa diubah headernya (status sekarang: ${po.status}).`)

  const data: PatchHeader = {}
  if ('vendorId' in body) {
    const vendorId = str(body.vendorId)
    if (po.kind === 'PO' && !vendorId) throw validation('PO wajib punya vendor.')
    data.vendorId = vendorId
  }
  if ('taxPct' in body) data.taxPct = num(body.taxPct)
  if ('deliveryTo' in body) data.deliveryTo = str(body.deliveryTo)
  if ('neededBy' in body) data.neededBy = tanggal(body.neededBy)
  if ('terms' in body) data.terms = str(body.terms)
  if ('notes' in body) data.notes = str(body.notes)

  if (Object.keys(data).length > 0) {
    const hasil = await forTenant(ctx).purchaseOrder.updateMany({ where: { id, deletedAt: null }, data })
    if (hasil.count === 0) throw notFound('Purchase Order/Requisition')
  }
  return getPurchaseOrder(ctx, id)
}

export async function removePurchaseOrder(ctx: TenantContext, id: string): Promise<void> {
  requireRole(ctx, 'ADMIN')
  const po = await getPurchaseOrder(ctx, id)
  if (po.status !== 'DRAFT') {
    throw conflict(`Hanya dokumen DRAFT yang bisa dihapus. Dokumen ber-status ${po.status} dibatalkan lewat status CANCELLED.`)
  }
  const hasil = await forTenant(ctx).purchaseOrder.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date(), status: 'CANCELLED' },
  })
  if (hasil.count === 0) throw notFound('Purchase Order/Requisition')
}

// ------------------------------------------------------------------- items

export async function addPurchaseOrderItem(ctx: TenantContext, poId: string, body: Record<string, unknown>): Promise<PurchaseOrderDetail> {
  requireRole(ctx, ...PERAN_KELOLA_PEMBELIAN)
  const po = await getPurchaseOrder(ctx, poId)
  if (po.status !== 'DRAFT') throw conflict(`Baris hanya bisa ditambah selagi DRAFT (status sekarang: ${po.status}).`)

  const description = wajib(str(body.description), 'Deskripsi')
  const quantity = num(body.quantity) ?? 1
  const unitPrice = num(body.unitPrice) ?? 0
  if (quantity <= 0) throw validation('Kuantitas wajib lebih besar dari 0.')

  await forTenant(ctx).purchaseOrderItem.create({
    data: {
      purchaseOrderId: poId,
      description,
      quantity,
      unit: str(body.unit),
      unitPrice,
      amount: quantity * unitPrice,
      displayOrder: po.items.length,
    },
  })
  return getPurchaseOrder(ctx, poId)
}

export async function updatePurchaseOrderItem(
  ctx: TenantContext,
  poId: string,
  itemId: string,
  body: Record<string, unknown>,
): Promise<PurchaseOrderDetail> {
  requireRole(ctx, ...PERAN_KELOLA_PEMBELIAN)
  const po = await getPurchaseOrder(ctx, poId)
  const item = po.items.find((i) => i.id === itemId)
  if (!item) throw notFound('Baris PO/PR')

  // K120/§7 — receivedQty TETAP bisa diubah sesudah DRAFT (itulah yang
  // menjawab "barang mana yang sudah datang"); field lain (deskripsi/qty/
  // harga) HANYA selagi DRAFT, sama alasannya dengan header di atas.
  const data: { description?: string; quantity?: number; unit?: string | null; unitPrice?: number; amount?: number; receivedQty?: number } = {}
  if ('receivedQty' in body) {
    const receivedQty = num(body.receivedQty)
    if (receivedQty === null || receivedQty < 0) throw validation('receivedQty wajib angka ≥ 0.')
    data.receivedQty = receivedQty
  }
  const menyentuhIsi = 'description' in body || 'quantity' in body || 'unit' in body || 'unitPrice' in body
  if (menyentuhIsi) {
    if (po.status !== 'DRAFT') throw conflict(`Isi baris hanya bisa diubah selagi DRAFT (status sekarang: ${po.status}).`)
    const quantity = 'quantity' in body ? (num(body.quantity) ?? item.quantity) : item.quantity
    const unitPrice = 'unitPrice' in body ? (num(body.unitPrice) ?? item.unitPrice) : item.unitPrice
    if (quantity <= 0) throw validation('Kuantitas wajib lebih besar dari 0.')
    if ('description' in body) data.description = wajib(str(body.description), 'Deskripsi')
    data.quantity = quantity
    if ('unit' in body) data.unit = str(body.unit)
    data.unitPrice = unitPrice
    data.amount = quantity * unitPrice
  }

  if (Object.keys(data).length > 0) {
    await forTenant(ctx).purchaseOrderItem.updateMany({ where: { id: itemId, purchaseOrderId: poId }, data })
  }
  return getPurchaseOrder(ctx, poId)
}

export async function removePurchaseOrderItem(ctx: TenantContext, poId: string, itemId: string): Promise<PurchaseOrderDetail> {
  requireRole(ctx, ...PERAN_KELOLA_PEMBELIAN)
  const po = await getPurchaseOrder(ctx, poId)
  if (po.status !== 'DRAFT') throw conflict(`Baris hanya bisa dihapus selagi DRAFT (status sekarang: ${po.status}).`)
  const hasil = await forTenant(ctx).purchaseOrderItem.deleteMany({ where: { id: itemId, purchaseOrderId: poId } })
  if (hasil.count === 0) throw notFound('Baris PO/PR')
  return getPurchaseOrder(ctx, poId)
}

// ------------------------------------------------------------------ status

/**
 * ⚠️ APPROVED SENGAJA ditolak di sini (persis fix Fase 5e untuk Disbursement,
 * K34-serupa): transisi ke status disetujui HANYA lewat po-approval.service.ts
 * (putuskanPersetujuanPo), supaya tak ada jalan bagi siapa pun ber-akses
 * endpoint status generik ini untuk menyetujui dokumennya sendiri tanpa jejak
 * `Approval`.
 */
export async function setPurchaseOrderStatus(ctx: TenantContext, id: string, tujuan: unknown): Promise<PurchaseOrderDetail> {
  requireRole(ctx, ...PERAN_KELOLA_PEMBELIAN)
  const ke = pilihan(tujuan, STATUS, 'Status tujuan')
  const po = await getPurchaseOrder(ctx, id)

  if (ke === 'APPROVED') throw conflict('Transisi ke APPROVED hanya lewat proses approval, bukan endpoint status ini.')
  if (!bolehTransisiPo(po.status, ke)) {
    throw conflict(
      `Transisi ${po.status} → ${ke} tidak diizinkan. Yang tersedia: ${transisiTersediaPo(po.status).join(', ') || '(tidak ada — status terminal)'}.`,
    )
  }
  if (ke === 'PENDING_APPROVAL' && po.items.length === 0) {
    throw validation('Dokumen belum punya satu pun baris — tak ada yang bisa diajukan.')
  }

  const hasil = await forTenant(ctx).purchaseOrder.updateMany({ where: { id, deletedAt: null }, data: { status: ke } })
  if (hasil.count === 0) throw notFound('Purchase Order/Requisition')
  return getPurchaseOrder(ctx, id)
}

/**
 * PR → PO (K117 `sourceRequisitionId`). PR sumber wajib APPROVED; PO baru
 * lahir DRAFT dengan salinan baris (K5-serupa: baris disalin, bukan dirujuk
 * hidup — mengubah PR sesudahnya tak boleh mengubah PO yang sudah lahir).
 */
export async function convertRequisitionToOrder(
  ctx: TenantContext,
  prId: string,
  vendorId: unknown,
): Promise<PurchaseOrderDetail> {
  requireRole(ctx, ...PERAN_KELOLA_PEMBELIAN)
  await pastikanLanggananAktif(ctx)

  const pr = await getPurchaseOrder(ctx, prId)
  if (pr.kind !== 'PR') throw validation('Sumber konversi harus berjenis PR.')
  if (pr.status !== 'APPROVED') throw conflict(`PR harus APPROVED dulu sebelum dikonversi ke PO (status sekarang: ${pr.status}).`)
  const vendorIdSah = wajib(str(vendorId), 'Vendor')
  const v = await forTenant(ctx).vendor.findFirst({ where: { id: vendorIdSah, deletedAt: null }, select: { id: true } })
  if (!v) throw notFound('Vendor')

  const docNumber = await nextPurchaseNumber(ctx, 'PO')
  const po = await forTenant(ctx).purchaseOrder.create({
    data: {
      tenantId: ctx.tenantId,
      voyageId: pr.voyageId,
      vendorId: vendorIdSah,
      sourceRequisitionId: pr.id,
      kind: 'PO',
      docNumber,
      status: 'DRAFT',
      currency: pr.currency,
      exchangeRate: pr.exchangeRate,
      taxPct: pr.taxPct,
      deliveryTo: pr.deliveryTo,
      neededBy: pr.neededBy,
      terms: pr.terms,
      notes: pr.notes,
      createdByUserId: ctx.userId,
      items: {
        create: pr.items.map((it, i) => ({
          description: it.description,
          quantity: it.quantity,
          unit: it.unit,
          unitPrice: it.unitPrice,
          amount: it.amount,
          displayOrder: i,
        })),
      },
    },
    include: { items: true },
  })
  return lengkapi(ctx, po)
}

/**
 * K122 — PO `RECEIVED` yang belum pernah dipakai ("sourcePurchaseOrderId"
 * belum menunjuknya di baris Disbursement mana pun), untuk dialog "Ambil dari
 * PO/WO" di builder FDA. Voyage-scoped (K83): pengadaan kantor, voyageId
 * null, tidak pernah muncul (tak ada FDA untuk ditautkan).
 */
export async function listPoUntukDiambil(ctx: TenantContext, voyageId: string): Promise<PurchaseOrderDetail[]> {
  const rows = await forTenant(ctx).purchaseOrder.findMany({
    where: { deletedAt: null, voyageId, kind: 'PO', status: 'RECEIVED' },
    include: { items: { orderBy: { displayOrder: 'asc' } } },
    orderBy: { docNumber: 'asc' },
  })
  const dipakai = await forTenant(ctx).disbursementItem.findMany({
    where: { sourcePurchaseOrderId: { in: rows.map((r) => r.id) } },
    select: { sourcePurchaseOrderId: true },
  })
  const idDipakai = new Set(dipakai.map((d) => d.sourcePurchaseOrderId))
  const belumDipakai = rows.filter((r) => !idDipakai.has(r.id))
  return Promise.all(belumDipakai.map((r) => lengkapi(ctx, r)))
}
