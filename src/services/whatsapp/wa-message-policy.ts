// Kebijakan MURNI pesan klien WA-2a Step 2F (F1) — mesin status, freshness, syarat data.
//
// Tanpa DB, tanpa jaringan, tanpa process.env, tanpa impor WA-1. Dipakai service 2a-F (F3/F4).
//   • Mesin status WaClientMessage (TRANSISI_PESAN_KLIEN) — DB tidak menjaganya.
//   • Freshness: belum ada aturan disetujui owner → SEMUA keluarga gagal tertutup.
//   • Syarat data sebelum APPROVED: NYATA saja TIDAK cukup — wajib juga sumber tervalidasi ulang
//     dan freshness lolos (keputusan owner 2a-F).

import {
  ASAL_DATA_SAH,
  ATURAN_FRESHNESS_DISETUJUI,
  KELUARGA_PESAN_KLIEN,
  MEDAN_WAKTU_PER_KELUARGA,
  STATUS_PESAN_KLIEN,
  STATUS_PESAN_KLIEN_TERMINAL,
  TRANSISI_PESAN_KLIEN,
  type KodeAlasanWa2f,
} from './wa2-policy'

export type HasilWa2f = { ok: true } | { ok: false; alasan: KodeAlasanWa2f }
const lolos: HasilWa2f = { ok: true }
const tolak = (alasan: KodeAlasanWa2f): HasilWa2f => ({ ok: false, alasan })

export type StatusPesanKlien = (typeof STATUS_PESAN_KLIEN)[number]
export type KeluargaPesanKlien = (typeof KELUARGA_PESAN_KLIEN)[number]

export const statusPesanKlienSah = (s: unknown): s is StatusPesanKlien =>
  typeof s === 'string' && (STATUS_PESAN_KLIEN as readonly string[]).includes(s)

export const pesanKlienTerminal = (s: unknown): boolean =>
  typeof s === 'string' && (STATUS_PESAN_KLIEN_TERMINAL as readonly string[]).includes(s)

export function transisiPesanKlienSah(dari: unknown, ke: unknown): boolean {
  if (!statusPesanKlienSah(dari) || !statusPesanKlienSah(ke)) return false
  return TRANSISI_PESAN_KLIEN[dari].includes(ke)
}

/** Sama dengan transisiPesanKlienSah, tetapi dengan kode alasan (untuk service & audit). */
export function periksaTransisiPesanKlien(dari: unknown, ke: unknown): HasilWa2f {
  if (!statusPesanKlienSah(dari) || !statusPesanKlienSah(ke)) return tolak('MESSAGE_STATE_INVALID')
  return TRANSISI_PESAN_KLIEN[dari].includes(ke) ? lolos : tolak('MESSAGE_TRANSITION_FORBIDDEN')
}

// ================================================================ freshness

export type VerdictFreshness = {
  versi: 1
  keluarga: string
  medan: readonly string[]
  status: 'GAGAL_TERTUTUP'
  alasan: 'FRESHNESS_RULE_MISSING'
  aturan: null
}

/**
 * Verdict freshness untuk satu keluarga event. Belum ada aturan yang disetujui
 * (ATURAN_FRESHNESS_DISETUJUI kosong) → selalu GAGAL_TERTUTUP. Keluarga tak dikenal pun
 * gagal tertutup. Tak ada ambang bawaan; status lolos baru ada setelah owner menyetujui aturan.
 */
export function penilaianFreshness(keluarga: unknown): VerdictFreshness {
  const k = typeof keluarga === 'string' && (KELUARGA_PESAN_KLIEN as readonly string[]).includes(keluarga) ? (keluarga as KeluargaPesanKlien) : null
  const aturan = k ? (ATURAN_FRESHNESS_DISETUJUI as Readonly<Record<string, unknown>>)[k] : undefined
  if (aturan !== undefined) throw new Error('[wa2f] aturan freshness terdaftar tetapi evaluatornya belum disetujui.')
  return { versi: 1, keluarga: k ?? String(keluarga), medan: k ? MEDAN_WAKTU_PER_KELUARGA[k] : [], status: 'GAGAL_TERTUTUP', alasan: 'FRESHNESS_RULE_MISSING', aturan: null }
}

// ================================================================ syarat data

export type BuktiData = {
  dataOrigin: unknown
  /** Revalidasi sumber (di dalam transaksi keputusan) berhasil. */
  sumberTervalidasi: unknown
  freshness: { status: unknown } | null | undefined
}

/**
 * Syarat data sebelum pesan boleh APPROVED. `dataOrigin = NYATA` hanya syarat perlu:
 * tanpa revalidasi sumber DAN freshness yang lolos, hasilnya selalu ditolak.
 */
export function syaratDataApproval(b: BuktiData): HasilWa2f {
  if (b?.dataOrigin !== ASAL_DATA_SAH) return tolak('DATA_ORIGIN_INSUFFICIENT')
  if (b.sumberTervalidasi !== true) return tolak('SOURCE_NOT_REVALIDATED')
  if (b.freshness?.status !== 'LOLOS') return tolak('FRESHNESS_RULE_MISSING')
  return lolos
}
