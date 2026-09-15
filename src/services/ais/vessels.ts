// Pembaca kapal voyage untuk AIS (PRD-003 Step 4) — HANYA MEMBACA.
//
// Pembaca toleran yang sama bentuknya dengan kapalVoyage() (voyage-vessel.service):
// kapal utama (`Voyage.vesselId`) selalu ada di hasil, meski baris VoyageVessel-nya
// belum pernah ditulis. Ditulis ulang di sini hanya karena AIS butuh medan
// verifikasi MMSI yang tak dibawa KapalRingkas.

import type { TenantDb } from '../tenant-db'
import { URUTAN_KAPAL_VOYAGE } from '../master/voyage-vessel.service'
import type { KapalCalon } from './ais-policy'

export const KOLOM_KAPAL_AIS = {
  id: true,
  name: true,
  mmsi: true,
  mmsiSource: true,
  mmsiVerifiedAt: true,
} as const

export type KapalAis = KapalCalon & { nama: string }

type VesselAis = { id: string; name: string; mmsi: string | null; mmsiSource: string | null; mmsiVerifiedAt: Date | null }

export const PILIH_VOYAGE_AIS = {
  id: true,
  status: true,
  deletedAt: true,
  vesselId: true,
  vessel: { select: KOLOM_KAPAL_AIS },
  vessels: { orderBy: URUTAN_KAPAL_VOYAGE, select: { vesselId: true, role: true, vessel: { select: KOLOM_KAPAL_AIS } } },
} as const

type VoyageAisRow = {
  vesselId: string
  vessel: VesselAis | null
  vessels: { vesselId: string; role: string | null; vessel: VesselAis | null }[]
}

const keKapal = (vesselId: string, role: string | null, isPrimary: boolean, v: VesselAis | null): KapalAis => ({
  vesselId,
  role,
  isPrimary,
  nama: v?.name ?? vesselId,
  mmsi: v?.mmsi ?? null,
  mmsiSource: v?.mmsiSource ?? null,
  mmsiVerifiedAt: v?.mmsiVerifiedAt ?? null,
})

export function kapalVoyageAis(v: VoyageAisRow): KapalAis[] {
  const hasil = v.vessels.map((r) => keKapal(r.vesselId, r.role, r.vesselId === v.vesselId, r.vessel))
  if (!hasil.some((k) => k.isPrimary)) hasil.unshift(keKapal(v.vesselId, null, true, v.vessel))
  return hasil
}

export async function bacaVoyageAis(db: TenantDb, voyageId: string) {
  return db.voyage.findFirst({ where: { id: voyageId }, select: PILIH_VOYAGE_AIS })
}
