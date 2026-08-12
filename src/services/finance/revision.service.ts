// Revisi / versioning + bandingkan (K37-K41, §7 docs/FASE-3-EPDA-ENGINE.md).
//
// revise() menyalin dokumen SENT ke versi baru DRAFT lewat SATU transaksi;
// dokumen lama tak pernah disentuh isinya (K37) — hanya statusnya berubah jadi
// REVISED + supersededBy. rumpun()/bandingkanDokumen() membaca semua versi satu
// keluarga untuk layar bandingkan (K39), memakai compare.ts yang MURNI supaya
// diffnya tak pernah tersimpan dan tak pernah berbohong.

import type { Disbursement, DisbursementItem } from '@prisma/client'
import type { TenantContext } from '../context'
import { requireRole } from '../context'
import { conflict, notFound, validation } from '../errors'
import { bool, str, wajib } from '../input'
import { forTenant } from '../tenant-db'
import { getServiceCatalog } from '../master/service-catalog.service'
import { STATUS_BOLEH_REVISI } from './disbursement-status'
import { usulkanItem } from './autofill.service'
import {
  getDisbursement,
  getDisbursementDetail,
  hitungUlang,
  muatVoyage,
  type DisbursementDetail,
  type DisbursementWithItems,
} from './disbursement.service'
import { nomorRevisi } from './disbursement-number'
import { catatAudit, type Jejak } from './audit'
import { bandingkanVersi, type HasilBanding, type HeaderBanding, type ItemBanding } from './compare'

function itemBanding(it: DisbursementItem): ItemBanding {
  return {
    id: it.id,
    sourceItemId: it.sourceItemId,
    description: it.description,
    quantity: it.quantity,
    unitPrice: it.unitPrice,
    currency: it.currency,
    exchangeRate: it.exchangeRate,
    amount: it.amount,
    amountBase: it.amountBase,
    vendorId: it.vendorId,
  }
}

function headerBanding(d: Disbursement): HeaderBanding {
  return {
    agencyPct: d.agencyPct,
    subtotal: d.subtotal,
    agencyAmount: d.agencyAmount,
    taxAmount: d.taxAmount,
    grandTotal: d.grandTotal,
  }
}

/**
 * Semua versi satu rumpun, terurut `version` menaik. Dibaca dari `rootId`
 * SUMBER (bukan `id` yang diminta apa adanya) supaya meminta dari versi mana
 * pun dalam rumpun yang sama menghasilkan daftar yang sama.
 */
export async function rumpun(ctx: TenantContext, id: string): Promise<DisbursementWithItems[]> {
  const acuan = await getDisbursement(ctx, id) // K44 pola: pintu masuk dipagari
  const rootId = acuan.rootId ?? acuan.id
  return forTenant(ctx).disbursement.findMany({
    where: { rootId, deletedAt: null },
    orderBy: { version: 'asc' },
    include: { items: { orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }] } },
  })
}

export type HasilBandingDokumen = HasilBanding & {
  idLama: string
  idBaru: string
  versiLama: number
  versiBaru: number
}

/**
 * Bandingkan versi `id` dengan versi `withId` (K39). Bila `withId` tak
 * disertakan, bandingkan dengan v1 rumpun ini — V1 selalu punya `id === rootId`
 * (K37 invarian), jadi tak perlu query tambahan untuk menebak id-nya. Ini yang
 * dipakai tautan "bandingkan dengan v1" di builder (§12/1).
 *
 * Argumen `id`/`withId` boleh tertukar urutan — lama/baru ditentukan dari
 * `version`, bukan urutan pemanggilan, supaya hasilnya selalu berarti sama.
 */
export async function bandingkanDokumen(
  ctx: TenantContext,
  id: string,
  withId?: string | null,
): Promise<HasilBandingDokumen> {
  const a = await getDisbursement(ctx, id)
  const targetId = withId ?? a.rootId ?? a.id
  if (targetId === a.id) {
    throw validation('Dokumen ini adalah v1 — tidak ada versi sebelumnya untuk dibandingkan.')
  }
  const b = await getDisbursement(ctx, targetId)
  if ((a.rootId ?? a.id) !== (b.rootId ?? b.id)) {
    throw validation('Kedua dokumen bukan bagian dari rumpun revisi yang sama.')
  }

  const [lama, baru] = a.version <= b.version ? [a, b] : [b, a]
  const hasil = bandingkanVersi(
    lama.items.map(itemBanding),
    baru.items.map(itemBanding),
    headerBanding(lama),
    headerBanding(baru),
  )
  return { ...hasil, idLama: lama.id, idBaru: baru.id, versiLama: lama.version, versiBaru: baru.version }
}

/**
 * Refresh tarif+kurs dari katalog/tarif HIDUP, menggantikan nilai hasil salin
 * (opsi "segarkan tarif & kurs", mati bawaan — K37). Sengaja HANYA menyentuh
 * `unitPrice`/`minCharge`/`currency`/`exchangeRate`: `quantity`, deskripsi,
 * vendor, dll tetap hasil salinan — operator yang mengeditnya di versi lama,
 * bukan sesuatu yang boleh mesin timpa diam-diam saat menyegarkan tarif.
 *
 * ⚠️ Penyimpangan yang disadari dari dokumen desain: pratinjau-sebelum-simpan
 * yang disebut §7/K37 BELUM dibangun — sakelar ini langsung berefek saat
 * `revise()` disimpan. Diterima karena risiko utamanya (perubahan diam-diam)
 * sudah ditutup oleh sakelar yang mati bawaan; pratinjau interaktif adalah
 * penambahan UI terpisah, tidak memblokir P mana pun di §15. Ditulis di sini
 * (bukan disembunyikan) sesuai aturan §6b roadmap.
 */
async function segarkanTarifKurs(
  ctx: TenantContext,
  disbBaru: DisbursementWithItems,
  voyage: Awaited<ReturnType<typeof muatVoyage>>,
): Promise<void> {
  const db = forTenant(ctx)
  for (const it of disbBaru.items) {
    if (!it.serviceId || it.calcMethod === 'MANUAL') continue
    const usulan = await usulkanItem(ctx, {
      disb: disbBaru,
      voyage,
      service: await getServiceCatalog(ctx, it.serviceId),
      basisPersen: 0, // tak dipakai — quantity hasil usulan diabaikan (lihat komentar berkas)
      timpa: { quantity: it.quantity },
    })
    // K44 aturan 2 — disbursementId ikut di where walau id sudah diketahui.
    await db.disbursementItem.updateMany({
      where: { id: it.id, disbursementId: disbBaru.id },
      data: {
        unitPrice: usulan.unitPrice,
        minCharge: usulan.minCharge,
        currency: usulan.currency,
        exchangeRate: usulan.exchangeRate,
      },
    })
  }
}

/**
 * Buat versi baru dari dokumen `SENT` (K37). Satu transaksi: dokumen baru +
 * seluruh itemnya tersalin, dokumen lama ditandai `REVISED`. Item lama TIDAK
 * disentuh, tidak disalin-pindah, tidak di-soft-delete (K41 bergantung ini —
 * PDF versi lama harus selamanya terambil identik).
 */
export async function revise(
  ctx: TenantContext,
  id: string,
  body: Record<string, unknown>,
  jejak: Jejak = {},
): Promise<DisbursementDetail> {
  requireRole(ctx, 'ADMIN', 'OPERATOR', 'PENYUSUN_BIAYA')
  const sumber = await getDisbursement(ctx, id) // K44 aturan 1

  if (!STATUS_BOLEH_REVISI.has(sumber.status)) {
    throw conflict(
      `Hanya dokumen ber-status SENT yang bisa direvisi (dokumen ini: ${sumber.status}). ` +
        'Koreksi sebelum terkirim jalan lewat Ajukan Review / Minta Revisi pada versi yang sama.',
    )
  }

  const revisionNote = wajib(str(body.revisionNote), 'Alasan revisi')
  const segarkan = bool(body.segarkanTarifKurs, false)

  const rootId = sumber.rootId ?? sumber.id
  const versionBaru = sumber.version + 1
  const docNumber = nomorRevisi(sumber.docNumber, versionBaru)

  const db = forTenant(ctx)

  const baru = await db.$transaction(async (tx) => {
    const dibuat = await tx.disbursement.create({
      data: {
        tenantId: ctx.tenantId,
        voyageId: sumber.voyageId,
        kind: sumber.kind,
        docNumber,
        rootId,
        version: versionBaru,
        revisionNote,
        status: 'DRAFT',
        supersededBy: null,
        baseCurrency: sumber.baseCurrency,
        agencyPct: sumber.agencyPct,
        advanceReceived: sumber.advanceReceived,
        notes: sumber.notes,
        validUntil: sumber.validUntil,
        items: {
          // K37 langkah 3 — disalin apa adanya; sourceItemId menunjuk baris lama (K40).
          create: sumber.items.map((it) => ({
            serviceId: it.serviceId,
            sourceItemId: it.id,
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
            exchangeRate: it.exchangeRate,
            taxable: it.taxable,
            taxPct: it.taxPct,
            displayOrder: it.displayOrder,
            // vendorInvoiceNo/actualReceiptRef sengaja TAK disalin — kolom
            // khusus FDA (K45); salinan EPDA→EPDA/FPDA→FPDA tak pernah mengisinya.
          })),
        },
      },
      include: { items: { orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }] } },
    })

    const disalip = await tx.disbursement.updateMany({
      where: { id: sumber.id, tenantId: ctx.tenantId },
      data: { status: 'REVISED', supersededBy: dibuat.id },
    })
    if (disalip.count === 0) throw notFound('Disbursement')

    return dibuat
  })

  await catatAudit(
    ctx,
    {
      tableName: 'Disbursement',
      recordId: baru.id,
      action: 'CREATE',
      newValue: { docNumber, version: versionBaru, rootId, sourceId: sumber.id, revisionNote, segarkan },
    },
    jejak,
  )
  await catatAudit(
    ctx,
    {
      tableName: 'Disbursement',
      recordId: sumber.id,
      action: 'UPDATE',
      oldValue: { status: sumber.status },
      newValue: { status: 'REVISED', supersededBy: baru.id },
    },
    jejak,
  )

  if (segarkan) {
    const voyage = await muatVoyage(ctx, sumber.voyageId)
    await segarkanTarifKurs(ctx, baru, voyage)
  }

  // Nilai server yang menang (K11): recompute dari kolom tersimpan, sama
  // seperti dokumen baru mana pun. Karena semua kolom disalin identik (kecuali
  // bila disegarkan), hasilnya deterministik sama dengan dokumen sumber.
  await hitungUlang(ctx, baru.id)
  return getDisbursementDetail(ctx, baru.id)
}
