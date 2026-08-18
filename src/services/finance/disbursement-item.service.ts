// CRUD DisbursementItem — SELALU lewat induk (K44 · docs/FASE-3-EPDA-ENGINE.md §11).
//
// ⚠️ ATURAN KEAMANAN YANG MENGIKAT SELURUH BERKAS INI. `DisbursementItem` TIDAK ada
// di `TENANT_MODELS` (dan memang tidak boleh — tabel anak tak membawa tenantId,
// keputusan #4 Fase 0). Akibatnya tenant-guard **tidak menyuntikkan apa pun** dan
// **tidak melarang** `update`/`delete` pada model ini:
// `prisma.disbursementItem.update({ where: { id } })` akan BERHASIL menyentuh item
// tenant lain kalau id-nya benar. Tidak ada yang menahan selain aturan ini:
//
//   1. Setiap fungsi membuka dengan `getDisbursement(ctx, disbursementId)` —
//      dipagari, NOT_FOUND untuk tenant lain.
//   2. Setiap query item menyertakan `disbursementId` di `where`, JUGA saat `id`
//      sudah diketahui: `updateMany({ where: { id, disbursementId } })`.
//   3. Tidak ada hard-delete item pada dokumen yang pernah keluar dari DRAFT —
//      K41 (PDF versi lama selamanya terambil) bergantung pada ini.

import type { DisbursementItem, ServiceCategory, CalcMethod } from '@prisma/client'
import type { TenantContext } from '../context'
import { requireRole } from '../context'
import { notFound, validation } from '../errors'
import { bool, int, num, pilihan, str, wajib } from '../input'
import { forTenant } from '../tenant-db'
import { getServiceCatalog } from '../master/service-catalog.service'
import { getServiceTemplate } from '../master/service-template.service'
import { hitungBaris, type CalcWarning } from './calc-engine'
import {
  KODE_AGENCY_FEE,
  kursSnapshot,
  tanggalJasa,
  usulkanItem,
  type TimpaItem,
  type UsulanItem,
  type VoyageUntukAutofill,
} from './autofill.service'
import {
  basisPersenTersimpan,
  getDisbursement,
  getDisbursementDetail,
  hitungUlang,
  muatVoyage,
  pastikanBolehUbah,
  type DisbursementDetail,
  type DisbursementWithItems,
} from './disbursement.service'
import { catatAudit, type Jejak } from './audit'

const CALC_METHODS: readonly CalcMethod[] = [
  'FLAT',
  'PER_UNIT',
  'PER_GT',
  'PER_GT_PER_CALL',
  'PER_GT_PER_DAY',
  'PER_DAY',
  'PER_HOUR',
  'PER_TON',
  'PERCENTAGE',
  'TIERED',
  'MANUAL',
]

const CATEGORIES: readonly ServiceCategory[] = [
  'PORT_CHARGES',
  'MARINE_SERVICES',
  'GOVERNMENT',
  'HUSBANDRY',
  'AGENCY',
  'OTHER',
]

export type HasilTulisItem = {
  disbursement: DisbursementDetail
  items: DisbursementItem[]
  /** Warning autofill baris yang baru ditulis — hanya ada di respons, tak disimpan. */
  warnings: CalcWarning[]
}

/**
 * Warning atas baris yang baru ditulis: gabungan warning AUTOFILL (tarif/GT/etmal/
 * ton — lahir sekali saat baris dibuat) dan warning HITUNGAN (minimum mengikat,
 * kurs) yang diturunkan ulang dari dokumen. Digabung supaya pemanggil tidak perlu
 * tahu warning mana lahir di lapisan mana; dedupe agar satu sebab tak muncul dua kali.
 */
function gabungWarning(
  autofill: readonly CalcWarning[],
  detail: DisbursementDetail,
  idBaris: ReadonlySet<string>,
): CalcWarning[] {
  const hasil: CalcWarning[] = []
  const terlihat = new Set<string>()
  for (const w of [...autofill, ...detail.warnings]) {
    if (w.itemId && !idBaris.has(w.itemId)) continue
    const kunci = `${w.kode}|${w.itemId ?? ''}`
    if (terlihat.has(kunci)) continue
    terlihat.add(kunci)
    hasil.push(w)
  }
  return hasil
}

/** Timpaan operator dari body. Field yang TIDAK dikirim dibiarkan hasil autofill. */
function bacaTimpa(body: Record<string, unknown>): TimpaItem {
  return {
    quantity: 'quantity' in body ? num(body.quantity) : undefined,
    unitPrice: 'unitPrice' in body ? num(body.unitPrice) : undefined,
    minCharge: 'minCharge' in body ? num(body.minCharge) : undefined,
    currency: 'currency' in body ? str(body.currency)?.toUpperCase() : undefined,
    vendorId: 'vendorId' in body ? str(body.vendorId) : undefined,
    exchangeRate: 'exchangeRate' in body ? num(body.exchangeRate) : undefined,
    description: 'description' in body ? str(body.description) : undefined,
    unit: 'unit' in body ? str(body.unit) : undefined,
    basis: 'basis' in body ? str(body.basis) : undefined,
    calcMethod: 'calcMethod' in body ? pilihan(body.calcMethod, CALC_METHODS, 'Cara hitung') : undefined,
    taxable: 'taxable' in body ? bool(body.taxable) : undefined,
    taxPct: 'taxPct' in body ? num(body.taxPct) : undefined,
    sectionLetter: 'sectionLetter' in body ? str(body.sectionLetter)?.toUpperCase() : undefined,
    category: 'category' in body ? pilihan(body.category, CATEGORIES, 'Kategori') : undefined,
    displayOrder: 'displayOrder' in body ? int(body.displayOrder) : undefined,
  }
}

/** Vendor yang disodorkan harus benar milik tenant ini. */
async function pastikanVendorMilikTenant(ctx: TenantContext, vendorId: string | null): Promise<void> {
  if (!vendorId) return
  const v = await forTenant(ctx).vendor.findFirst({
    where: { id: vendorId, deletedAt: null },
    select: { id: true },
  })
  if (!v) throw notFound('Vendor')
}

async function desimalMataUang(ctx: TenantContext, code: string): Promise<number | null> {
  const c = await forTenant(ctx).currency.findFirst({
    where: { code: code.toUpperCase() },
    select: { decimals: true },
  })
  return c?.decimals ?? null
}

/**
 * Pemeriksaan SEBELUM menulis: `pelanggaran` mesin (FLAT berkuantitas, kuantitas
 * negatif, mata uang tak terdaftar, baris persen bukan mata uang dasar) harus
 * menggagalkan request — bukan menghasilkan baris tersimpan yang angkanya mustahil.
 *
 * Bedanya dengan `warnings`: warning tetap boleh tersimpan sebagai DRAFT dan
 * barulah memblokir submit ke review (K16-2/K27).
 */
async function pastikanBarisSah(
  ctx: TenantContext,
  usulan: Pick<
    UsulanItem,
    'calcMethod' | 'quantity' | 'unitPrice' | 'minCharge' | 'currency' | 'exchangeRate' | 'taxable' | 'taxPct'
  >,
  baseCurrency: string,
): Promise<void> {
  const decimals = await desimalMataUang(ctx, usulan.currency)
  const decimalsBase = await desimalMataUang(ctx, baseCurrency)
  const hasil = hitungBaris({
    calcMethod: usulan.calcMethod,
    quantity: usulan.quantity,
    unitPrice: usulan.unitPrice,
    minCharge: usulan.minCharge,
    decimals,
    exchangeRate: usulan.exchangeRate,
    decimalsBase: decimalsBase ?? undefined,
    taxable: usulan.taxable,
    taxPct: usulan.taxPct,
  })
  if (hasil.pelanggaran.length > 0) {
    throw validation(hasil.pelanggaran[0].pesan, { pelanggaran: hasil.pelanggaran })
  }
}

/** Nilai awal `amount` dsb; final ditulis ulang oleh `hitungUlang` (nilai server yang menang). */
function dataBaris(usulan: UsulanItem, disbursementId: string) {
  return {
    disbursementId,
    serviceId: usulan.serviceId,
    vendorId: usulan.vendorId,
    category: usulan.category,
    sectionLetter: usulan.sectionLetter,
    description: usulan.description,
    basis: usulan.basis,
    quantity: usulan.quantity,
    unit: usulan.unit,
    unitPrice: usulan.unitPrice,
    minCharge: usulan.minCharge,
    calcMethod: usulan.calcMethod,
    currency: usulan.currency,
    exchangeRate: usulan.exchangeRate,
    taxable: usulan.taxable,
    taxPct: usulan.taxPct,
    displayOrder: usulan.displayOrder,
  }
}

function displayOrderBerikutnya(disb: DisbursementWithItems): number {
  return disb.items.reduce((maks, it) => Math.max(maks, it.displayOrder), 0) + 10
}

/**
 * Satu baris ad-hoc di luar katalog (`serviceId = null`). Tak ada autofill yang
 * bisa dijalankan — semuanya datang dari operator, kecuali kurs yang tetap
 * di-snapshot lewat jalur yang sama (K29/K30).
 */
async function usulanAdHoc(
  ctx: TenantContext,
  disb: DisbursementWithItems,
  voyage: VoyageUntukAutofill,
  timpa: TimpaItem,
  displayOrder: number,
): Promise<UsulanItem> {
  const currency = (timpa.currency ?? disb.baseCurrency).toUpperCase()
  const tgl = tanggalJasa(disb.kind, voyage, disb.issuedAt)
  return {
    serviceId: null,
    vendorId: timpa.vendorId ?? null,
    category: timpa.category ?? null,
    sectionLetter: timpa.sectionLetter ?? null,
    description: wajib(timpa.description ?? null, 'Deskripsi baris'),
    basis: timpa.basis ?? null,
    quantity: timpa.quantity ?? 1,
    unit: timpa.unit ?? null,
    unitPrice: timpa.unitPrice ?? 0,
    minCharge: timpa.minCharge ?? null,
    calcMethod: timpa.calcMethod ?? 'MANUAL',
    currency,
    exchangeRate: await kursSnapshot(ctx, currency, disb.baseCurrency, tgl, timpa.exchangeRate),
    taxable: timpa.taxable ?? false,
    taxPct: timpa.taxPct ?? null,
    displayOrder: timpa.displayOrder ?? displayOrder,
    warnings: [],
  }
}

// ------------------------------------------------------------------- tambah

export async function addItem(
  ctx: TenantContext,
  disbursementId: string,
  body: Record<string, unknown>,
  jejak: Jejak = {},
): Promise<HasilTulisItem> {
  requireRole(ctx, 'ADMIN', 'OPERATOR', 'PENYUSUN_BIAYA')
  const disb = await getDisbursement(ctx, disbursementId) // K44 aturan 1
  pastikanBolehUbah(disb)

  const voyage = await muatVoyage(ctx, disb.voyageId)
  const timpa = bacaTimpa(body)
  await pastikanVendorMilikTenant(ctx, timpa.vendorId ?? null)

  const serviceId = str(body.serviceId)
  const usulan = serviceId
    ? await usulkanItem(ctx, {
        disb,
        voyage,
        service: await getServiceCatalog(ctx, serviceId),
        basisPersen: basisPersenTersimpan(disb),
        timpa,
      })
    : await usulanAdHoc(ctx, disb, voyage, timpa, displayOrderBerikutnya(disb))

  await pastikanBarisSah(ctx, usulan, disb.baseCurrency)

  // K122 (Fase 7i) — penanda opsional "baris ini lahir dari PO/WO tsb", TIDAK
  // menyentuh usulan/pastikanBarisSah sama sekali: operator sudah mengonfirmasi
  // isi baris (harga/qty dari sini tetap yang ia ketik/setujui di form, bukan
  // ditulis otomatis oleh PO/WO — K52). Dua field ini murni jejak asal-usul.
  const item = await forTenant(ctx).disbursementItem.create({
    data: {
      ...dataBaris(usulan, disbursementId),
      sourcePurchaseOrderId: str(body.sourcePurchaseOrderId),
      sourceWorkOrderId: str(body.sourceWorkOrderId),
    },
  })

  await catatAudit(
    ctx,
    {
      tableName: 'DisbursementItem',
      recordId: item.id,
      action: 'CREATE',
      newValue: {
        disbursementId,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        currency: item.currency,
        exchangeRate: item.exchangeRate,
        // Kurs yang diisi tangan ditandai eksplisit (K30).
        kursManual: timpa.exchangeRate !== null && timpa.exchangeRate !== undefined,
      },
    },
    jejak,
  )

  await hitungUlang(ctx, disbursementId)
  const detail = await getDisbursementDetail(ctx, disbursementId)
  const idBaru = new Set([item.id])
  return {
    disbursement: detail,
    items: detail.items.filter((it) => idBaru.has(it.id)),
    warnings: gabungWarning(
      usulan.warnings.map((w) => ({ ...w, itemId: item.id })),
      detail,
      idBaru,
    ),
  }
}

/**
 * K28 — template = pintu "isi sekaligus", bukan entitas yang dilacak. `templateId`
 * TIDAK disimpan di dokumen: template boleh dipakai berkali-kali dan digabung
 * dengan penambahan manual, dan menghapus template tak pernah mengubah arti
 * dokumen lama. `defaultQty` dipakai sebagai `quantity` bila terisi; kalau tidak,
 * jatuh ke usulan mesin (K16).
 */
export async function addItemsFromTemplate(
  ctx: TenantContext,
  disbursementId: string,
  templateId: string,
  jejak: Jejak = {},
): Promise<HasilTulisItem> {
  requireRole(ctx, 'ADMIN', 'OPERATOR', 'PENYUSUN_BIAYA')
  const disb = await getDisbursement(ctx, disbursementId) // K44 aturan 1
  pastikanBolehUbah(disb)

  const tpl = await getServiceTemplate(ctx, templateId)
  if (tpl.items.length === 0) throw validation(`Template "${tpl.name}" tidak punya baris jasa.`)

  const voyage = await muatVoyage(ctx, disb.voyageId)
  const db = forTenant(ctx)
  const dibuat: DisbursementItem[] = []
  const warnings: CalcWarning[] = []

  // Ditolak, bukan dilewati diam-diam: template yang memuat agency fee adalah
  // template yang perlu diperbaiki, dan agency fee ganda (K21) justru salah ke
  // arah yang menguntungkan Tribuana.
  const adaAgency = tpl.items.find(
    (it) => it.service.serviceCode.toUpperCase() === KODE_AGENCY_FEE,
  )
  if (adaAgency) {
    throw validation(
      `Template "${tpl.name}" memuat jasa ${adaAgency.service.serviceCode}. Agency fee diatur lewat field agencyPct pada header dokumen, bukan sebagai baris — keluarkan baris itu dari template.`,
    )
  }

  for (const it of tpl.items) {
    // basisPersen dibaca ulang tiap baris supaya baris PERCENTAGE di dalam template
    // memakai basis yang sudah termasuk baris sebelumnya; `hitungUlang` di akhir
    // tetap yang menentukan angka finalnya (K20, dua lintasan).
    const induk = await getDisbursement(ctx, disbursementId)
    const usulan = await usulkanItem(ctx, {
      disb,
      voyage,
      service: await getServiceCatalog(ctx, it.serviceId),
      basisPersen: basisPersenTersimpan(induk),
      timpa: { quantity: it.defaultQty, displayOrder: it.displayOrder },
    })
    await pastikanBarisSah(ctx, usulan, disb.baseCurrency)

    const item = await db.disbursementItem.create({ data: dataBaris(usulan, disbursementId) })
    dibuat.push(item)
    warnings.push(...usulan.warnings.map((w) => ({ ...w, itemId: item.id })))

    await catatAudit(
      ctx,
      {
        tableName: 'DisbursementItem',
        recordId: item.id,
        action: 'CREATE',
        newValue: {
          disbursementId,
          dariTemplate: tpl.id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        },
      },
      jejak,
    )
  }

  await hitungUlang(ctx, disbursementId)
  const detail = await getDisbursementDetail(ctx, disbursementId)
  const idBaru = new Set(dibuat.map((d) => d.id))
  return {
    disbursement: detail,
    items: detail.items.filter((it) => idBaru.has(it.id)),
    warnings: gabungWarning(warnings, detail, idBaru),
  }
}

// -------------------------------------------------------------------- ubah

export async function updateItem(
  ctx: TenantContext,
  disbursementId: string,
  itemId: string,
  body: Record<string, unknown>,
  jejak: Jejak = {},
): Promise<HasilTulisItem> {
  requireRole(ctx, 'ADMIN', 'OPERATOR', 'PENYUSUN_BIAYA')
  const disb = await getDisbursement(ctx, disbursementId) // K44 aturan 1
  pastikanBolehUbah(disb) // dokumen PENDING_REVIEW/APPROVED → CONFLICT 409 (K36)

  // K44 aturan 2 — disbursementId ikut di where walau id sudah diketahui.
  const lama = await forTenant(ctx).disbursementItem.findFirst({
    where: { id: itemId, disbursementId },
  })
  if (!lama) throw notFound('Baris biaya')

  const timpa = bacaTimpa(body)
  if ('vendorId' in body) await pastikanVendorMilikTenant(ctx, timpa.vendorId ?? null)

  const voyage = await muatVoyage(ctx, disb.voyageId)
  const tgl = tanggalJasa(disb.kind, voyage, disb.issuedAt)

  const currency = (timpa.currency ?? lama.currency).toUpperCase()
  // K29 — baris yang DIUBAH selagi masih editable di-snapshot ulang kursnya.
  // Kurs eksplisit dari payload tetap menang (override operator).
  const exchangeRate = await kursSnapshot(
    ctx,
    currency,
    disb.baseCurrency,
    tgl,
    timpa.exchangeRate ?? undefined,
  )

  const baru = {
    description: timpa.description ?? lama.description,
    basis: 'basis' in body ? timpa.basis : lama.basis,
    quantity: timpa.quantity ?? lama.quantity,
    unit: 'unit' in body ? timpa.unit : lama.unit,
    unitPrice: timpa.unitPrice ?? lama.unitPrice,
    minCharge: 'minCharge' in body ? (timpa.minCharge ?? null) : lama.minCharge,
    calcMethod: timpa.calcMethod ?? lama.calcMethod,
    currency,
    exchangeRate,
    vendorId: 'vendorId' in body ? timpa.vendorId : lama.vendorId,
    taxable: timpa.taxable ?? lama.taxable,
    taxPct: 'taxPct' in body ? (timpa.taxPct ?? null) : lama.taxPct,
    sectionLetter: 'sectionLetter' in body ? timpa.sectionLetter : lama.sectionLetter,
    category: 'category' in body ? timpa.category : lama.category,
    displayOrder: timpa.displayOrder ?? lama.displayOrder,
    vendorInvoiceNo: 'vendorInvoiceNo' in body ? str(body.vendorInvoiceNo) : lama.vendorInvoiceNo,
    actualReceiptRef: 'actualReceiptRef' in body ? str(body.actualReceiptRef) : lama.actualReceiptRef,
  }

  await pastikanBarisSah(
    ctx,
    {
      calcMethod: baru.calcMethod,
      quantity: baru.quantity,
      unitPrice: baru.unitPrice,
      minCharge: baru.minCharge,
      currency: baru.currency,
      exchangeRate: baru.exchangeRate,
      taxable: baru.taxable,
      taxPct: baru.taxPct,
    },
    disb.baseCurrency,
  )

  const hasil = await forTenant(ctx).disbursementItem.updateMany({
    where: { id: itemId, disbursementId },
    data: baru,
  })
  if (hasil.count === 0) throw notFound('Baris biaya')

  await catatAudit(
    ctx,
    {
      tableName: 'DisbursementItem',
      recordId: itemId,
      action: 'UPDATE',
      oldValue: {
        quantity: lama.quantity,
        unitPrice: lama.unitPrice,
        currency: lama.currency,
        exchangeRate: lama.exchangeRate,
      },
      newValue: {
        quantity: baru.quantity,
        unitPrice: baru.unitPrice,
        currency: baru.currency,
        exchangeRate: baru.exchangeRate,
        kursManual: timpa.exchangeRate !== null && timpa.exchangeRate !== undefined,
      },
    },
    jejak,
  )

  await hitungUlang(ctx, disbursementId)
  const detail = await getDisbursementDetail(ctx, disbursementId)
  const idUbah = new Set([itemId])
  return {
    disbursement: detail,
    items: detail.items.filter((it) => idUbah.has(it.id)),
    warnings: gabungWarning([], detail, idUbah),
  }
}

// ------------------------------------------------------------------- hapus

/**
 * Hard delete, dan HANYA selagi `bolehUbahItem(status)` (K44 aturan 3). Sesudah
 * dokumen keluar dari DRAFT, item tidak pernah dihapus — K41 (PDF versi lama
 * selamanya menghasilkan berkas yang identik) bergantung sepenuhnya pada itu.
 */
export async function removeItem(
  ctx: TenantContext,
  disbursementId: string,
  itemId: string,
  jejak: Jejak = {},
): Promise<DisbursementDetail> {
  requireRole(ctx, 'ADMIN', 'OPERATOR', 'PENYUSUN_BIAYA')
  const disb = await getDisbursement(ctx, disbursementId) // K44 aturan 1
  pastikanBolehUbah(disb)

  const lama = await forTenant(ctx).disbursementItem.findFirst({
    where: { id: itemId, disbursementId },
  })
  if (!lama) throw notFound('Baris biaya')

  const hasil = await forTenant(ctx).disbursementItem.deleteMany({
    where: { id: itemId, disbursementId },
  })
  if (hasil.count === 0) throw notFound('Baris biaya')

  await catatAudit(
    ctx,
    {
      tableName: 'DisbursementItem',
      recordId: itemId,
      action: 'DELETE',
      oldValue: {
        disbursementId,
        description: lama.description,
        amount: lama.amount,
        amountBase: lama.amountBase,
      },
    },
    jejak,
  )

  await hitungUlang(ctx, disbursementId)
  return getDisbursementDetail(ctx, disbursementId)
}
