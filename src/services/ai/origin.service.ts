// Lapisan DB untuk provenance (Fase 6a · K55–K59).
// Pola meniru port.service.ts (⭐ MODUL RUJUKAN) — lihat docs/POLA-SERVICE-LAYER.md.
//
// Semua ARTI provenance hidup di provenance.ts (murni). Berkas ini hanya
// menyambungkannya ke database: membaca `Tenant.goLiveAt`, menulis cap saat
// baris dibuat, melabeli ulang, dan menghitung.
//
// Yang SENGAJA tidak ada di sini: fungsi yang membuat Voyage/Disbursement.
// Stempel dipasang di `createVoyage()`/`createDisbursement()` yang sudah ada
// sebagai satu baris tambahan — membuat jalur pembuatan kedua berarti membuat
// tempat kedua yang bisa lupa mencap.

import type { TenantContext } from '../context'
import { requireRole } from '../context'
import { notFound, validation } from '../errors'
import { forTenant } from '../tenant-db'
import { catatAudit, type Jejak } from '../finance/audit'
import {
  ASAL_DATA,
  asalEfektif,
  asalUntukBarisBaru,
  bacaAsal,
  rangkumAsal,
  type AsalData,
  type HitunganAsal,
} from './provenance'

/** Model yang punya kolom `dataOrigin` (K55). Sengaja hanya dua. */
export const MODEL_BERASAL = ['Voyage', 'Disbursement'] as const
export type ModelBerasal = (typeof MODEL_BERASAL)[number]

// ------------------------------------------------------------------- stempel

/**
 * Cap untuk baris yang SEDANG dibuat (K56). Dipanggil dari `createVoyage()` &
 * `createDisbursement()` tepat sebelum `create()`.
 *
 * `sekarang` diterima sebagai argumen supaya modul murni tetap yang memutuskan
 * dan pemanggil bisa memakai satu titik waktu untuk beberapa baris sekaligus.
 *
 * Kegagalan membaca tenant TIDAK dianggap fatal-diam: tenant yang tak terbaca
 * berarti `goLiveAt` tak diketahui, dan yang benar untuk "tak diketahui" adalah
 * 'UJI' — arah pesimis yang sama dengan K57.
 */
export async function stempelAsal(ctx: TenantContext, sekarang: Date = new Date()): Promise<AsalData> {
  const tenant = await forTenant(ctx).tenant.findFirst({
    where: { id: ctx.tenantId },
    select: { goLiveAt: true },
  })
  return asalUntukBarisBaru(tenant?.goLiveAt ?? null, sekarang)
}

// -------------------------------------------------------------------- go-live

export type StatusGoLive = { goLiveAt: Date | null; sudahGoLive: boolean }

export async function getGoLive(ctx: TenantContext): Promise<StatusGoLive> {
  const tenant = await forTenant(ctx).tenant.findFirst({
    where: { id: ctx.tenantId },
    select: { goLiveAt: true },
  })
  if (!tenant) throw notFound('Tenant')
  return { goLiveAt: tenant.goLiveAt, sudahGoLive: tenant.goLiveAt !== null }
}

/**
 * ADMIN menyatakan tenant ini mulai dipakai untuk pekerjaan sungguhan.
 *
 * Dua sifat yang disengaja:
 *   1. Baris LAMA tidak disentuh. Menyalakan go-live tidak boleh mengubah
 *      asal-usul dokumen yang sudah ada (K56) — itu justru alasan kolom
 *      `dataOrigin` ada.
 *   2. Bisa dimatikan lagi (`goLiveAt = null`), mis. bila ditekan keliru saat
 *      demo. Yang terlanjur tercap 'NYATA' tetap 'NYATA' dan harus dilabeli
 *      ulang satu per satu lewat `labelUlangAsal()` — sengaja tidak ada
 *      pembatalan massal, karena itu persis operasi yang bisa menghapus
 *      pembeda antara data nyata dan latihan dalam sekali klik.
 */
export async function setGoLive(
  ctx: TenantContext,
  goLiveAt: Date | null,
  jejak: Jejak = {},
): Promise<StatusGoLive> {
  requireRole(ctx, 'ADMIN')
  const sebelum = await getGoLive(ctx)

  const hasil = await forTenant(ctx).tenant.updateMany({
    where: { id: ctx.tenantId },
    data: { goLiveAt },
  })
  if (hasil.count === 0) throw notFound('Tenant')

  await catatAudit(
    ctx,
    {
      tableName: 'Tenant',
      recordId: ctx.tenantId,
      action: 'UPDATE',
      oldValue: { goLiveAt: sebelum.goLiveAt },
      newValue: { goLiveAt },
    },
    jejak,
  )

  return { goLiveAt, sudahGoLive: goLiveAt !== null }
}

// -------------------------------------------------------------- label ulang

export type HasilLabelUlang = {
  model: ModelBerasal
  id: string
  nomor: string
  asalLama: AsalData
  asalBaru: AsalData
  /** Asal efektif dokumen sesudah pelabelan (K58) — null untuk Voyage. */
  asalEfektif: AsalData | null
}

/**
 * ADMIN melabeli ulang satu voyage/disbursement (K56).
 *
 * Hanya ADMIN: kolom ini menentukan apakah sebuah angka boleh dipercaya sebagai
 * histori operasional. Peran lain yang bisa mengubahnya berarti confidence Fase
 * 6 bisa dinaikkan oleh siapa saja yang merasa datanya "cukup nyata".
 *
 * Setiap pelabelan menulis satu baris AuditLog berisi asal lama & baru — tanpa
 * itu, pertanyaan "kenapa prediksi ini tiba-tiba yakin?" tidak punya jawaban.
 */
export async function labelUlangAsal(
  ctx: TenantContext,
  model: ModelBerasal,
  id: string,
  asalBaru: unknown,
  jejak: Jejak = {},
): Promise<HasilLabelUlang> {
  requireRole(ctx, 'ADMIN')

  const nilai = String(asalBaru ?? '').trim().toUpperCase()
  if (!(ASAL_DATA as readonly string[]).includes(nilai)) {
    throw validation(`Asal data tidak sah. Pilihan: ${ASAL_DATA.join(', ')}.`)
  }
  const baru = nilai as AsalData
  const db = forTenant(ctx)

  if (model === 'Voyage') {
    const voyage = await db.voyage.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, voyageNumber: true, dataOrigin: true },
    })
    if (!voyage) throw notFound('Voyage')

    const lama = bacaAsal(voyage.dataOrigin)
    const hasil = await db.voyage.updateMany({ where: { id }, data: { dataOrigin: baru } })
    if (hasil.count === 0) throw notFound('Voyage')

    await catatAudit(
      ctx,
      {
        tableName: 'Voyage',
        recordId: id,
        action: 'UPDATE',
        oldValue: { dataOrigin: lama },
        newValue: { dataOrigin: baru },
      },
      jejak,
    )

    return { model, id, nomor: voyage.voyageNumber, asalLama: lama, asalBaru: baru, asalEfektif: null }
  }

  // K65 dalam bentuk kecilnya: dokumen dibaca lewat model bertenant, dan asal
  // voyage-nya diambil lewat relasi induk — bukan query terpisah yang bisa lupa
  // dipagari.
  const disb = await db.disbursement.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, docNumber: true, dataOrigin: true, voyage: { select: { dataOrigin: true } } },
  })
  if (!disb) throw notFound('Disbursement')

  const lama = bacaAsal(disb.dataOrigin)
  const hasil = await db.disbursement.updateMany({ where: { id }, data: { dataOrigin: baru } })
  if (hasil.count === 0) throw notFound('Disbursement')

  await catatAudit(
    ctx,
    {
      tableName: 'Disbursement',
      recordId: id,
      action: 'UPDATE',
      oldValue: { dataOrigin: lama },
      newValue: { dataOrigin: baru },
    },
    jejak,
  )

  // asalEfektif dihitung modul murni — tidak ada `min` kedua di lapisan DB.
  return {
    model,
    id,
    nomor: disb.docNumber,
    asalLama: lama,
    asalBaru: baru,
    asalEfektif: asalEfektif(disb.voyage?.dataOrigin ?? null, baru),
  }
}

// ---------------------------------------------------------------- hitungan

export type RingkasanProvenance = {
  goLiveAt: Date | null
  sudahGoLive: boolean
  /** Hitungan per model. Baris soft-deleted IKUT dihitung — lihat catatan. */
  perModel: { model: ModelBerasal; hitungan: HitunganAsal; total: number }[]
  /** Berapa baris yang masih `dataOrigin = NULL` (definition of done 6a: 0). */
  belumBercap: number
}

/**
 * Hitungan untuk kartu Settings › Data & AI.
 *
 * Baris soft-deleted (`deletedAt`) SENGAJA ikut dihitung: kartu ini menjawab
 * "apa isi database ini" — pertanyaan audit, bukan pertanyaan operasional. Dua
 * EPDA yang dibatalkan tetap ada barisnya, tetap punya asal, dan angkanya harus
 * cocok persis dengan `SELECT dataOrigin, count(*)` langsung ke DB (cara
 * verifikasi 6a butir 6). Menyaring diam-diam di sini akan membuat kartu dan
 * query manual berbeda, dan yang akan dicurigai justru datanya.
 */
export async function ringkasanProvenance(ctx: TenantContext): Promise<RingkasanProvenance> {
  const db = forTenant(ctx)

  const [tenant, voyages, disbursements] = await Promise.all([
    db.tenant.findFirst({ where: { id: ctx.tenantId }, select: { goLiveAt: true } }),
    db.voyage.findMany({ select: { dataOrigin: true } }),
    db.disbursement.findMany({ select: { dataOrigin: true } }),
  ])
  if (!tenant) throw notFound('Tenant')

  const belumBercap =
    voyages.filter((v) => v.dataOrigin === null).length +
    disbursements.filter((d) => d.dataOrigin === null).length

  return {
    goLiveAt: tenant.goLiveAt,
    sudahGoLive: tenant.goLiveAt !== null,
    perModel: [
      {
        model: 'Voyage',
        hitungan: rangkumAsal(voyages.map((v) => v.dataOrigin)),
        total: voyages.length,
      },
      {
        model: 'Disbursement',
        hitungan: rangkumAsal(disbursements.map((d) => d.dataOrigin)),
        total: disbursements.length,
      },
    ],
    belumBercap,
  }
}
