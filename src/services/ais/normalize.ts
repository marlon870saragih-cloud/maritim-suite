// Normalisasi observasi AIS — logika murni (PRD-003 Step 4).
//
// Hanya `import type` (dihapus saat strip-types) → Node bisa memuat berkas ini
// langsung di prisma/check-ais-contract.mjs. Semua adapter melewati aturan yang
// SAMA di sini; keanehan vendor tak pernah bocor ke inti.

import type { RawObservation, SumberAis } from './contract'

export type AlasanTolak = 'REJECTED_MISMATCH' | 'REJECTED_INVALID' | 'REJECTED_STALE'

export type ObservasiNormal = {
  mmsi: string
  providerRef: string | null
  positionAt: Date
  fetchedAt: Date
  lat: number
  lon: number
  sogKnots: number | null
  cogDeg: number | null
  headingDeg: number | null
  navStatus: number | null
  positionAccuracy: boolean | null
  sourceType: SumberAis
  ageSecAtFetch: number
}

export type HasilNormalisasi = { ok: true; obs: ObservasiNormal } | { ok: false; alasan: AlasanTolak }

const MENIT = 60_000
const HARI = 86_400_000
/** Toleransi jam kapal/penyedia yang sedikit di depan jam kita. */
export const TOLERANSI_MASA_DEPAN_MS = 5 * MENIT
/** Posisi lebih tua dari ini dianggap tak masuk akal (bukan sekadar basi). */
export const BATAS_POSISI_TUA_MS = 30 * HARI
/** Kecepatan di atas ini mustahil untuk armada pilot (tug) → data rusak. */
export const SOG_MAKS_KNOT = 60

const SUMBER: readonly string[] = ['TERRESTRIAL', 'SATELLITE', 'UNKNOWN']

const angka = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const tolak = (alasan: AlasanTolak): HasilNormalisasi => ({ ok: false, alasan })

export function normalisasiObservasi(raw: RawObservation, mmsiDiminta: string, fetchedAt: Date): HasilNormalisasi {
  if (typeof raw?.mmsi !== 'string' || raw.mmsi.trim() !== mmsiDiminta) return tolak('REJECTED_MISMATCH')

  const t = typeof raw.positionAt === 'string' ? Date.parse(raw.positionAt) : Number.NaN
  if (!Number.isFinite(t)) return tolak('REJECTED_INVALID')
  if (t > fetchedAt.getTime() + TOLERANSI_MASA_DEPAN_MS) return tolak('REJECTED_INVALID')
  if (t < fetchedAt.getTime() - BATAS_POSISI_TUA_MS) return tolak('REJECTED_STALE')

  const lat = angka(raw.lat)
  const lon = angka(raw.lon)
  // 91/181 = "tidak tersedia" menurut AIS; di luar rentang juga tertolak di sini.
  if (lat === null || lon === null || lat < -90 || lat > 90 || lon < -180 || lon > 180) return tolak('REJECTED_INVALID')
  if (lat === 0 && lon === 0) return tolak('REJECTED_INVALID')

  let sog = angka(raw.sog)
  if (sog !== null && Math.abs(sog - 102.3) < 1e-9) sog = null
  if (sog !== null && (sog < 0 || sog > SOG_MAKS_KNOT)) return tolak('REJECTED_INVALID')

  let cog = angka(raw.cog)
  if (cog === 360) cog = null
  if (cog !== null && (cog < 0 || cog >= 360)) return tolak('REJECTED_INVALID')

  let heading = angka(raw.heading)
  if (heading === 511) heading = null
  if (heading !== null && (!Number.isInteger(heading) || heading < 0 || heading > 359)) return tolak('REJECTED_INVALID')

  const nav = angka(raw.navStatus)
  const navStatus = nav !== null && Number.isInteger(nav) && nav >= 0 && nav <= 15 ? nav : null

  const sourceType = (typeof raw.sourceType === 'string' && SUMBER.includes(raw.sourceType) ? raw.sourceType : 'UNKNOWN') as SumberAis

  return {
    ok: true,
    obs: {
      mmsi: mmsiDiminta,
      providerRef: typeof raw.providerRef === 'string' && raw.providerRef.length <= 200 ? raw.providerRef : null,
      positionAt: new Date(t),
      fetchedAt,
      lat,
      lon,
      sogKnots: sog,
      cogDeg: cog,
      headingDeg: heading,
      navStatus,
      positionAccuracy: typeof raw.positionAccuracy === 'boolean' ? raw.positionAccuracy : null,
      sourceType,
      ageSecAtFetch: Math.max(0, Math.round((fetchedAt.getTime() - t) / 1000)),
    },
  }
}

/** Teks kanonik medan ternormalisasi — masukan sha256 (payloadHash). Bukan payload mentah. */
export function kanonikObservasi(o: ObservasiNormal): string {
  return JSON.stringify([
    o.mmsi, o.positionAt.toISOString(), o.lat, o.lon, o.sogKnots, o.cogDeg, o.headingDeg,
    o.navStatus, o.positionAccuracy, o.sourceType, o.providerRef,
  ])
}
