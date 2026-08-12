// FDA dari EPDA + variance (K45-K46, §9 docs/FASE-3-EPDA-ENGINE.md).
//
// buatFdaDariEpda() menyalin baris relevan (ad-hoc + serviceCatalog.usedInActual)
// dari sebuah EPDA/FPDA disetujui ke FDA baru — rumpun TERPISAH (rootId sendiri),
// bukan revisi EPDA (K45). variancePasangan() membandingkan FDA vs EPDA asalnya
// lewat rantai sourceItemId (K40), murni, tak pernah disimpan (K46).

import type { Disbursement, DisbursementItem, DisbursementStatus, Prisma } from '@prisma/client'
import type { TenantContext } from '../context'
import { requireRole } from '../context'
import { conflict, validation } from '../errors'
import { forTenant } from '../tenant-db'
import { pastikanLanggananAktif } from '../subscription'
import { kursSnapshot, tanggalJasa } from './autofill.service'
import {
  getDisbursement,
  getDisbursementDetail,
  hitungUlang,
  muatVoyage,
  type DisbursementDetail,
  type DisbursementWithItems,
} from './disbursement.service'
import { nextDisbursementNumber } from './disbursement-number'
import { catatAudit, type Jejak } from './audit'
import { hitungVariance, type HasilVariance, type HeaderVariance, type ItemVariance } from './variance'

/** K45: sumber boleh EPDA maupun FPDA — diperlakukan identik sampai P3 dijawab. */
const KIND_SUMBER: readonly string[] = ['EPDA', 'FPDA']
const STATUS_SUMBER: readonly DisbursementStatus[] = ['APPROVED', 'SENT', 'CLOSED']

function itemVariance(it: DisbursementItem): ItemVariance {
  return {
    id: it.id,
    sourceItemId: it.sourceItemId,
    description: it.description,
    sectionLetter: it.sectionLetter,
    amountBase: it.amountBase,
  }
}

function headerVariance(d: Disbursement): HeaderVariance {
  return {
    subtotal: d.subtotal,
    agencyAmount: d.agencyAmount,
    taxAmount: d.taxAmount,
    grandTotal: d.grandTotal,
  }
}

/**
 * EPDA/FPDA asal sebuah FDA — dibaca dari rantai `sourceItemId` (K40), BUKAN
 * kolom tersendiri: sengaja tak ada di skema (§13, "Sengaja tidak diadakan").
 * `null` bila FDA ini tak punya satu pun baris bertaut (semuanya "TAK
 * DIANGGARKAN" — baris ad-hoc yang ditambahkan sendiri sesudah FDA dibuat).
 */
async function epdaAsalDariFda(ctx: TenantContext, fda: DisbursementWithItems): Promise<string | null> {
  const sourceItemId = fda.items.find((it) => it.sourceItemId !== null)?.sourceItemId
  if (!sourceItemId) return null
  const sumber = await forTenant(ctx).disbursementItem.findFirst({
    where: { id: sourceItemId },
    select: { disbursementId: true },
  })
  return sumber?.disbursementId ?? null
}

/**
 * Buat FDA dari satu dokumen EPDA/FPDA (K45). `sourceId` sudah EKSPLISIT dari
 * pemanggil (tombol per-baris di daftar dokumen, §12/K49) — "operator memilih
 * EPDA mana" (K45) terjadi di UI lewat baris mana yang diklik, bukan lewat
 * pencarian otomatis di sini.
 */
export async function buatFdaDariEpda(
  ctx: TenantContext,
  sourceId: string,
  jejak: Jejak = {},
): Promise<DisbursementDetail> {
  requireRole(ctx, 'ADMIN', 'OPERATOR')
  await pastikanLanggananAktif(ctx)

  const sumber = await getDisbursement(ctx, sourceId) // K44 aturan 1

  if (!KIND_SUMBER.includes(sumber.kind)) {
    throw conflict(`FDA hanya bisa dibuat dari dokumen EPDA/FPDA (dokumen ini: ${sumber.kind}).`)
  }
  if (sumber.supersededBy !== null) {
    throw conflict('Dokumen ini sudah disalip versi lebih baru — buat FDA dari versi terbaru.')
  }
  if (!STATUS_SUMBER.includes(sumber.status)) {
    throw conflict('Belum ada EPDA yang disetujui pada voyage ini.')
  }

  const voyage = await muatVoyage(ctx, sumber.voyageId)
  const db = forTenant(ctx)

  // getDisbursement() tak menyertakan relasi `service` pada item — diambil
  // ulang khusus di sini untuk memeriksa usedInActual (K45).
  const itemsWithService = await db.disbursementItem.findMany({
    where: { disbursementId: sumber.id },
    include: { service: true },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  })

  // K45: item ad-hoc (serviceId null) SELALU ikut; item katalog ikut kecuali
  // jasanya ditandai usedInActual = false (mis. contingency khusus estimasi).
  const dipilih = itemsWithService.filter((it) => it.serviceId === null || it.service?.usedInActual !== false)
  if (dipilih.length === 0) {
    throw validation('Tidak ada baris yang relevan untuk FDA — semua baris di dokumen ini hanya untuk estimasi.')
  }

  const docNumber = await nextDisbursementNumber(ctx, 'FDA')
  const tglFda = tanggalJasa('FDA', voyage, sumber.issuedAt)

  // K29 — kurs dijepret ULANG per tanggalJasa(FDA): uang aktual, kurs saat
  // kunjungan/penyelesaian, beda dari revise() yang menyalin kurs apa adanya.
  const itemsData: Prisma.DisbursementItemUncheckedCreateWithoutDisbursementInput[] = []
  for (const it of dipilih) {
    const exchangeRate = await kursSnapshot(ctx, it.currency, sumber.baseCurrency, tglFda)
    itemsData.push({
      serviceId: it.serviceId,
      sourceItemId: it.id, // K40/K45 — tautan variance ke baris EPDA asalnya
      vendorId: it.vendorId,
      category: it.category,
      sectionLetter: it.sectionLetter,
      description: it.description,
      basis: it.basis,
      quantity: it.quantity,
      unit: it.unit,
      unitPrice: it.unitPrice,
      minCharge: it.minCharge,
      calcMethod: it.calcMethod,
      currency: it.currency,
      exchangeRate,
      taxable: it.taxable,
      taxPct: it.taxPct,
      displayOrder: it.displayOrder,
      // vendorInvoiceNo/actualReceiptRef sengaja KOSONG — justru yang harus diisi manusia (K45).
    })
  }

  const baru = await db.$transaction(async (tx) => {
    const dibuat = await tx.disbursement.create({
      data: {
        tenantId: ctx.tenantId,
        voyageId: sumber.voyageId,
        kind: 'FDA',
        docNumber,
        status: 'DRAFT',
        baseCurrency: sumber.baseCurrency,
        agencyPct: sumber.agencyPct,
        advanceReceived: sumber.advanceReceived,
        items: { create: itemsData },
      },
      include: { items: { orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }] } },
    })
    // K45: rootId = dirinya sendiri — rumpun FDA TERPISAH dari rumpun EPDA. FDA
    // bukan revisi EPDA; menyatukan rumpunnya akan merusak invarian K37.
    await tx.disbursement.updateMany({
      where: { id: dibuat.id, tenantId: ctx.tenantId },
      data: { rootId: dibuat.id },
    })
    return dibuat
  })

  await catatAudit(
    ctx,
    {
      tableName: 'Disbursement',
      recordId: baru.id,
      action: 'CREATE',
      newValue: { docNumber, kind: 'FDA', sourceId: sumber.id, itemCount: itemsData.length },
    },
    jejak,
  )

  await hitungUlang(ctx, baru.id)
  return getDisbursementDetail(ctx, baru.id)
}

export type HasilVarianceDokumen = HasilVariance & { epdaId: string; fdaId: string }

/** Variance FDA `fdaId` vs EPDA asalnya (K46), ditemukan lewat rantai `sourceItemId`. */
export async function variancePasangan(ctx: TenantContext, fdaId: string): Promise<HasilVarianceDokumen> {
  const fda = await getDisbursement(ctx, fdaId) // K44 aturan 1
  if (fda.kind !== 'FDA') {
    throw validation('Variance hanya bisa dilihat dari dokumen FDA.')
  }

  const epdaId = await epdaAsalDariFda(ctx, fda)
  if (!epdaId) {
    throw validation('Dokumen FDA ini tidak tertaut ke EPDA manapun — tidak ada padanan untuk dibandingkan.')
  }
  const epda = await getDisbursement(ctx, epdaId)

  const hasil = hitungVariance(
    epda.items.map(itemVariance),
    fda.items.map(itemVariance),
    headerVariance(epda),
    headerVariance(fda),
  )
  return { ...hasil, epdaId: epda.id, fdaId: fda.id }
}
