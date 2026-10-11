// Evaluator freshness D6 — WA-2a Step 2F (F3). MURNI: tanpa DB, jaringan, process.env, impor WA-1.
//
// Pemanggil (service) membaca bukti dari DB di dalam transaksinya (tenant-scoped, terkunci) lalu
// menyerahkan keputusan ke sini. Bukti hilang / tidak sah / kedaluwarsa → GAGAL_TERTUTUP (tidak pernah lolos
// karena data kosong).
//   D6-A (SCHEDULE_CHANGE): setiap medan ETA/ETD yang BERUBAH wajib punya konfirmasi staf yang
//     belum diinvalidasi, nilainya = nilai baru = nilai voyage terkini, dicatat PADA/SESUDAH AuditLog
//     perubahan, tidak di masa depan, dan umurnya ≤ 12 jam (batas tepat 12 jam = lolos).
//   D6-B (EOSP/ALL_FAST/SAILED): VoyageEvent MANUAL yang aktif, kode = keluarga, tidak di masa depan,
//     umur ≤ 24 jam sejak kejadian (batas tepat = lolos), tanpa peristiwa aktif lain dengan kode, voyage,
//     dan port call yang sama (port call null = null).

import {
  ATURAN_FRESHNESS_D6,
  KELUARGA_PESAN_KLIEN,
  SUMBER_PERISTIWA_SAH,
  type KodeAlasanWa2f3,
} from './wa2-policy'

const MS_PER_JAM = 3_600_000
type KeluargaKlien = (typeof KELUARGA_PESAN_KLIEN)[number]

export type BuktiFreshness =
  | { konfirmasi: { medan: 'eta' | 'etd'; id: string; confirmedAt: string; confirmedByUserId: string }[] }
  | { eventId: string; occurredAt: string; recordedByUserId: string }

export type VerdictFreshnessD6 = {
  versi: 2
  keluarga: string
  aturan: 'D6A_KONFIRMASI_STAF' | 'D6B_MANUAL' | null
  maksJam: number | null
  status: 'LOLOS' | 'GAGAL_TERTUTUP'
  alasan: KodeAlasanWa2f3 | 'FRESHNESS_RULE_MISSING' | null
  dievaluasiPada: string
  bukti: BuktiFreshness | null
}

const tanggalSah = (d: unknown): d is Date => d instanceof Date && !Number.isNaN(d.getTime())

function verdict(keluarga: string, sekarang: Date, hasil: { status: 'LOLOS'; bukti: BuktiFreshness } | { status: 'GAGAL_TERTUTUP'; alasan: VerdictFreshnessD6['alasan'] }): VerdictFreshnessD6 {
  const k = (KELUARGA_PESAN_KLIEN as readonly string[]).includes(keluarga) ? ATURAN_FRESHNESS_D6[keluarga as KeluargaKlien] : null
  return {
    versi: 2,
    keluarga,
    aturan: k?.aturan ?? null,
    maksJam: k?.maksJam ?? null,
    status: hasil.status,
    alasan: hasil.status === 'LOLOS' ? null : hasil.alasan,
    dievaluasiPada: tanggalSah(sekarang) ? sekarang.toISOString() : '',
    bukti: hasil.status === 'LOLOS' ? hasil.bukti : null,
  }
}
const gagal = (keluarga: string, sekarang: Date, alasan: VerdictFreshnessD6['alasan']) => verdict(keluarga, sekarang, { status: 'GAGAL_TERTUTUP', alasan })

// ================================================================ D6-A jadwal

export type KonfirmasiJadwalBukti = {
  id: string
  field: string
  /** Kunci tanggal K-1 `YYYY-MM-DD` dari confirmedValue. */
  nilai: string | null
  confirmedAt: Date
  confirmedByUserId: string
  invalidatedAt: Date | null
}

export type InputFreshnessJadwal = {
  /** Medan yang BERUBAH saja (hasil revalidasi sumber), nilai baru = kunci tanggal K-1. */
  perubahan: readonly { medan: 'eta' | 'etd'; baru: string }[]
  /** Nilai voyage terkini (kunci tanggal K-1). */
  nilaiVoyageKini: { eta: string | null; etd: string | null }
  /** AuditLog.createdAt perubahan sumber. */
  sumberDicatatPada: Date
  konfirmasi: readonly KonfirmasiJadwalBukti[]
  sekarang: Date
}

export function nilaiFreshnessJadwal(i: InputFreshnessJadwal): VerdictFreshnessD6 {
  const K = 'SCHEDULE_CHANGE'
  const sekarang = i?.sekarang
  if (!tanggalSah(sekarang) || !tanggalSah(i.sumberDicatatPada) || !Array.isArray(i.perubahan) || i.perubahan.length === 0 || !Array.isArray(i.konfirmasi)) {
    return gagal(K, sekarang, 'FRESHNESS_EVIDENCE_MISSING')
  }
  const maksMs = ATURAN_FRESHNESS_D6.SCHEDULE_CHANGE.maksJam * MS_PER_JAM
  const dipakai: { medan: 'eta' | 'etd'; id: string; confirmedAt: string; confirmedByUserId: string }[] = []
  for (const p of i.perubahan as readonly { medan: 'eta' | 'etd'; baru: string }[]) {
    if ((p?.medan !== 'eta' && p?.medan !== 'etd') || typeof p.baru !== 'string') return gagal(K, sekarang, 'FRESHNESS_EVIDENCE_MISSING')
    if (i.nilaiVoyageKini?.[p.medan] !== p.baru) return gagal(K, sekarang, 'SOURCE_CHANGED')
    const medan = i.konfirmasi.filter((c) => c?.field === p.medan && tanggalSah(c.confirmedAt))
    if (medan.length === 0) return gagal(K, sekarang, 'CONFIRMATION_MISSING')
    const aktif = medan.filter((c) => c.invalidatedAt === null)
    if (aktif.length === 0) return gagal(K, sekarang, 'CONFIRMATION_INVALIDATED')
    const cocok = aktif.filter((c) => c.nilai === p.baru)
    if (cocok.length === 0) return gagal(K, sekarang, 'CONFIRMATION_VALUE_MISMATCH')
    const lampau = cocok.filter((c) => c.confirmedAt.getTime() <= sekarang.getTime())
    if (lampau.length === 0) return gagal(K, sekarang, 'CONFIRMATION_IN_FUTURE')
    const sesudahSumber = lampau.filter((c) => c.confirmedAt.getTime() >= i.sumberDicatatPada.getTime())
    if (sesudahSumber.length === 0) return gagal(K, sekarang, 'CONFIRMATION_BEFORE_SOURCE')
    const segar = sesudahSumber.filter((c) => sekarang.getTime() - c.confirmedAt.getTime() <= maksMs)
    if (segar.length === 0) return gagal(K, sekarang, 'CONFIRMATION_EXPIRED')
    // Deterministik: konfirmasi TERBARU, lalu id terkecil.
    const pilih = [...segar].sort((a, b) => b.confirmedAt.getTime() - a.confirmedAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0]
    dipakai.push({ medan: p.medan, id: pilih.id, confirmedAt: pilih.confirmedAt.toISOString(), confirmedByUserId: pilih.confirmedByUserId })
  }
  return verdict(K, sekarang, { status: 'LOLOS', bukti: { konfirmasi: dipakai } })
}

// ================================================================ D6-B milestone

export type PeristiwaBukti = {
  id: string
  voyageId: string
  eventCode: string
  occurredAt: Date
  source: string
  deletedAt: Date | null
  portCallId: string | null
  recordedByUserId: string
}

export type InputFreshnessMilestone = {
  keluarga: string
  peristiwa: PeristiwaBukti | null
  /** Peristiwa AKTIF lain pada voyage yang sama (tenant-scoped), untuk deteksi ganda. */
  peristiwaAktifLain: readonly { id: string; eventCode: string; portCallId: string | null }[]
  sekarang: Date
}

export function nilaiFreshnessMilestone(i: InputFreshnessMilestone): VerdictFreshnessD6 {
  const keluarga = typeof i?.keluarga === 'string' ? i.keluarga : String(i?.keluarga)
  const sekarang = i?.sekarang
  if (!(['EOSP', 'ALL_FAST', 'SAILED'] as string[]).includes(keluarga)) return gagal(keluarga, sekarang, 'FRESHNESS_RULE_MISSING')
  const p = i.peristiwa
  if (!tanggalSah(sekarang) || !p || !tanggalSah(p.occurredAt) || !Array.isArray(i.peristiwaAktifLain)) return gagal(keluarga, sekarang, 'FRESHNESS_EVIDENCE_MISSING')
  if (p.eventCode !== keluarga) return gagal(keluarga, sekarang, 'EVENT_NOT_ALLOWED')
  if (p.deletedAt !== null) return gagal(keluarga, sekarang, 'EVENT_DELETED')
  if (!(SUMBER_PERISTIWA_SAH as readonly string[]).includes(p.source)) return gagal(keluarga, sekarang, 'EVENT_SOURCE_NOT_MANUAL')
  if (p.occurredAt.getTime() > sekarang.getTime()) return gagal(keluarga, sekarang, 'EVENT_IN_FUTURE')
  if (sekarang.getTime() - p.occurredAt.getTime() > ATURAN_FRESHNESS_D6[keluarga as KeluargaKlien].maksJam * MS_PER_JAM) return gagal(keluarga, sekarang, 'EVENT_TOO_OLD')
  const pc = p.portCallId ?? null
  if (i.peristiwaAktifLain.some((x) => x.id !== p.id && x.eventCode === p.eventCode && (x.portCallId ?? null) === pc)) return gagal(keluarga, sekarang, 'EVENT_DUPLICATE')
  return verdict(keluarga, sekarang, { status: 'LOLOS', bukti: { eventId: p.id, occurredAt: p.occurredAt.toISOString(), recordedByUserId: p.recordedByUserId } })
}
