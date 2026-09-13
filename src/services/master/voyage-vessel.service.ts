// Kapal-kapal satu voyage (tug + barge, dst) — PRD-002 Step 2.
// Pola meniru cargo.service.ts: VoyageVessel adalah model ANAK tanpa tenantId (K44),
// jadi SETIAP akses dibuka dengan membuktikan voyage induknya milik tenant ini.
//
// ⚠️ Berkas ini dan voyage.service.ts adalah SATU-SATUNYA tempat yang boleh
//    memakai `voyageVessel` sebagai model akar (dikunci prisma/check-voyage-vessels.mjs).
//
// INVARIAN TUNGGAL — `Voyage.vesselId` adalah satu-satunya penentu kapal utama:
//   - tabel VoyageVessel tidak punya peran "PRIMARY", jadi dua sumber kebenaran
//     untuk kapal utama tidak mungkin terjadi;
//   - kapal utama selalu ikut menjadi salah satu baris (createVoyage menulisnya,
//     updateVoyage memanggil sinkronkanKapalUtama, PUT menolak daftar tanpanya);
//   - pembaca TOLERAN: voyage lama/skrip yang belum punya baris tetap tampil
//     dengan kapal utamanya (kapalVoyage()).

import type { Prisma, Vessel } from '@prisma/client'
import type { TenantContext } from '../context'
import { requireRole } from '../context'
import { forTenant } from '../tenant-db'
import { notFound, validation } from '../errors'
import { catatAudit, type Jejak } from '../finance/audit'
import { bacaDaftarKapalVoyage } from '@/lib/vessels'

export const KOLOM_KAPAL_VOYAGE = {
  id: true,
  name: true,
  imoNumber: true,
  mmsi: true,
  callSign: true,
  vesselType: true,
} as const

export const URUTAN_KAPAL_VOYAGE: Prisma.VoyageVesselOrderByWithRelationInput[] = [
  { sortOrder: 'asc' },
  { createdAt: 'asc' },
  { id: 'asc' },
]

type KapalRingkas = Pick<Vessel, 'id' | 'name' | 'imoNumber' | 'mmsi' | 'callSign' | 'vesselType'>

export type KapalVoyageRow = {
  /** null = baris sintetis dari `Voyage.vesselId` (voyage lama tanpa baris VoyageVessel). */
  id: string | null
  vesselId: string
  role: string | null
  sortOrder: number
  isPrimary: boolean
  vessel: KapalRingkas | null
}

type BarisMentah = { id: string; vesselId: string; role: string | null; sortOrder: number; vessel: KapalRingkas | null }

/** Pembaca toleran: kapal utama selalu ada di hasil, meski barisnya belum pernah ditulis. */
export function kapalVoyage(
  voyage: { vesselId: string; vessel?: KapalRingkas | null },
  rows: readonly BarisMentah[],
): KapalVoyageRow[] {
  const hasil: KapalVoyageRow[] = rows.map((r) => ({
    id: r.id,
    vesselId: r.vesselId,
    role: r.role,
    sortOrder: r.sortOrder,
    isPrimary: r.vesselId === voyage.vesselId,
    vessel: r.vessel,
  }))
  if (!hasil.some((r) => r.isPrimary)) {
    hasil.unshift({
      id: null,
      vesselId: voyage.vesselId,
      role: null,
      sortOrder: -1,
      isPrimary: true,
      vessel: voyage.vessel ?? null,
    })
  }
  return hasil
}

export async function listVoyageVessels(ctx: TenantContext, voyageId: string): Promise<KapalVoyageRow[]> {
  const voyage = await forTenant(ctx).voyage.findFirst({
    where: { id: voyageId, deletedAt: null },
    select: {
      vesselId: true,
      vessel: { select: KOLOM_KAPAL_VOYAGE },
      vessels: {
        orderBy: URUTAN_KAPAL_VOYAGE,
        select: { id: true, vesselId: true, role: true, sortOrder: true, vessel: { select: KOLOM_KAPAL_VOYAGE } },
      },
    },
  })
  if (!voyage) throw notFound('Voyage')
  return kapalVoyage(voyage, voyage.vessels)
}

/**
 * Ganti SELURUH daftar kapal voyage (urutan larik = urutan tampil). Kapal utama
 * (`Voyage.vesselId`) wajib tetap ada — mengganti kapal utama dilakukan lewat
 * Particulars (PATCH /api/voyages/:id), bukan di sini.
 */
export async function setVoyageVessels(
  ctx: TenantContext,
  voyageId: string,
  body: Record<string, unknown>,
  jejak: Jejak = {},
): Promise<KapalVoyageRow[]> {
  // Sama dengan pagar penulisan voyage (createVoyage/updateVoyage).
  requireRole(ctx, 'ADMIN', 'OPERATOR')
  const db = forTenant(ctx)

  const voyage = await db.voyage.findFirst({
    where: { id: voyageId, deletedAt: null },
    select: {
      id: true,
      vesselId: true,
      vessels: { orderBy: URUTAN_KAPAL_VOYAGE, select: { vesselId: true, role: true } },
    },
  })
  if (!voyage) throw notFound('Voyage')

  const { items, errors } = bacaDaftarKapalVoyage(body.vessels)
  if (errors.length) throw validation(errors.join(' '))
  if (!items.some((i) => i.vesselId === voyage.vesselId)) {
    throw validation('Kapal utama voyage wajib tetap ada di daftar. Ganti kapal utama lewat Particulars.')
  }

  // Semua kapal wajib milik tenant ini (vessel.findMany berpagar tenant-guard).
  const ids = items.map((i) => i.vesselId)
  const milik = await db.vessel.findMany({ where: { id: { in: ids } }, select: { id: true } })
  if (milik.length !== ids.length) throw notFound('Kapal')

  await db.$transaction([
    db.voyageVessel.deleteMany({ where: { voyageId: voyage.id } }),
    db.voyageVessel.createMany({
      data: items.map((it, i) => ({ voyageId: voyage.id, vesselId: it.vesselId, role: it.role, sortOrder: i })),
    }),
  ])

  const sebelum = voyage.vessels.map((v) => ({ vesselId: v.vesselId, role: v.role }))
  const sesudah = items.map((v) => ({ vesselId: v.vesselId, role: v.role }))
  if (JSON.stringify(sebelum) !== JSON.stringify(sesudah)) {
    await catatAudit(
      ctx,
      {
        tableName: 'Voyage',
        recordId: voyage.id,
        action: 'UPDATE',
        oldValue: { peristiwa: 'UBAH_KAPAL_VOYAGE', kapal: sebelum },
        newValue: { peristiwa: 'UBAH_KAPAL_VOYAGE', kapal: sesudah },
      },
      jejak,
    )
  }

  return listVoyageVessels(ctx, voyage.id)
}

/**
 * Dipanggil updateVoyage SESUDAH particulars tersimpan. Menjaga invarian "kapal
 * utama selalu punya baris":
 *   - kapal utama baru sudah ada di daftar (mis. barge dinaikkan jadi utama) → tak ada yang diubah;
 *   - kapal utama lama punya baris → baris itu DIGANTI kapalnya (koreksi salah pilih; peran & urutan tetap);
 *   - belum ada baris sama sekali (voyage lama) → baris kapal utama dibuat — menyembuhkan voyage lama saat disunting.
 * Pemanggil memastikan voyage milik tenant (updateMany berpagar sudah berhasil).
 */
export async function sinkronkanKapalUtama(
  ctx: TenantContext,
  voyageId: string,
  kapalUtamaLama: string,
  kapalUtamaBaru: string,
): Promise<void> {
  const db = forTenant(ctx)
  const rows = await db.voyageVessel.findMany({ where: { voyageId }, select: { id: true, vesselId: true } })
  if (rows.some((r) => r.vesselId === kapalUtamaBaru)) return

  const barisLama = rows.find((r) => r.vesselId === kapalUtamaLama)
  if (barisLama) {
    await db.voyageVessel.updateMany({ where: { id: barisLama.id, voyageId }, data: { vesselId: kapalUtamaBaru } })
    return
  }
  await db.voyageVessel.createMany({
    data: [{ voyageId, vesselId: kapalUtamaBaru, sortOrder: 0 }],
    skipDuplicates: true,
  })
}
