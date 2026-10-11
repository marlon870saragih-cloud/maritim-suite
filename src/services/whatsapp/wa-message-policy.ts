// Kebijakan MURNI pesan klien WA-2a Step 2F (F1) — mesin status, freshness, syarat data.
//
// Tanpa DB, tanpa jaringan, tanpa process.env, tanpa impor WA-1. Dipakai service 2a-F (F3/F4).
//   • Mesin status WaClientMessage (TRANSISI_PESAN_KLIEN) — DB tidak menjaganya.
//   • Freshness: aturan D6 disetujui owner di F3 (evaluator: wa-freshness.ts). Tanpa bukti → gagal tertutup;
//     keluarga tak dikenal → gagal tertutup (tanpa aturan).
//   • Syarat data sebelum APPROVED: NYATA saja TIDAK cukup — wajib juga sumber tervalidasi ulang
//     dan freshness lolos (keputusan owner 2a-F).

import {
  ASAL_DATA_SAH,
  ATURAN_PILIH_GRANT,
  ATURAN_FRESHNESS_D6,
  KATEGORI_WAJIB_PER_KELUARGA,
  KELUARGA_PESAN_KLIEN,
  MEDAN_WAKTU_PER_KELUARGA,
  STATUS_PESAN_KLIEN,
  STATUS_PESAN_KLIEN_TERMINAL,
  TRANSISI_PESAN_KLIEN,
  type KodeAlasanWa2f,
  type KodeAlasanWa2f3,
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
  alasan: 'FRESHNESS_RULE_MISSING' | 'FRESHNESS_EVIDENCE_MISSING'
  aturan: 'D6A_KONFIRMASI_STAF' | 'D6B_MANUAL' | null
}

/**
 * Verdict freshness TANPA bukti untuk satu keluarga event — selalu GAGAL_TERTUTUP:
 *   keluarga dikenal → FRESHNESS_EVIDENCE_MISSING (aturan D6 berlaku, tetapi bukti belum dinilai);
 *   keluarga tak dikenal → FRESHNESS_RULE_MISSING (tanpa aturan).
 * Status LOLOS HANYA dari evaluator D6 dengan bukti sah (wa-freshness.ts).
 */
export function penilaianFreshness(keluarga: unknown): VerdictFreshness {
  const k = typeof keluarga === 'string' && (KELUARGA_PESAN_KLIEN as readonly string[]).includes(keluarga) ? (keluarga as KeluargaPesanKlien) : null
  return {
    versi: 1,
    keluarga: k ?? String(keluarga),
    medan: k ? MEDAN_WAKTU_PER_KELUARGA[k] : [],
    status: 'GAGAL_TERTUTUP',
    alasan: k ? 'FRESHNESS_EVIDENCE_MISSING' : 'FRESHNESS_RULE_MISSING',
    aturan: k ? ATURAN_FRESHNESS_D6[k].aturan : null,
  }
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
export function syaratDataApproval(b: BuktiData): HasilWa2f | { ok: false; alasan: KodeAlasanWa2f3 } {
  if (b?.dataOrigin !== ASAL_DATA_SAH) return tolak('DATA_ORIGIN_INSUFFICIENT')
  if (b.sumberTervalidasi !== true) return tolak('SOURCE_NOT_REVALIDATED')
  if (b.freshness?.status !== 'LOLOS') return { ok: false, alasan: 'FRESHNESS_EVIDENCE_MISSING' }
  return lolos
}

// ================================================================ akses & grant (F3, D-GRANT)

/** Kategori grant yang wajib untuk isi pesan keluarga ini (customer memiliki semua kategori). */
export function kategoriWajibUntuk(keluarga: unknown): string | null {
  return typeof keluarga === 'string' && (KELUARGA_PESAN_KLIEN as readonly string[]).includes(keluarga) ? KATEGORI_WAJIB_PER_KELUARGA[keluarga as KeluargaPesanKlien] : null
}

/** Bentuk identitas grant dari resolver akses (struktural — modul ini tidak mengimpor resolver). */
export type GrantDasarAkses = { grantId: string; kategori: readonly string[]; validUntil: string }

export type PilihanGrant =
  | { ok: true; grantId: string; kandidat: string[]; aturan: typeof ATURAN_PILIH_GRANT }
  | { ok: false; alasan: 'CATEGORY_NOT_GRANTED' | 'GRANT_NOT_ELIGIBLE'; kandidat: string[] }

/**
 * D-GRANT — pilih grant snapshot untuk pesan principal dari grant yang SUDAH diloloskan resolver (ACTIVE,
 * milik kontak & principal, cakupan voyage). Hanya grant yang memuat kategori wajib DAN validUntil > sekarang.
 * Deterministik & teraudit: masa berlaku terpanjang, lalu grantId terkecil. Tak ada yang cocok → ditolak.
 */
export function pilihGrantUntukPesan(grants: readonly GrantDasarAkses[], kategoriWajib: string, sekarang: Date): PilihanGrant {
  const semua = Array.isArray(grants) ? grants : []
  const ids = semua.map((g) => g?.grantId).filter((x): x is string => typeof x === 'string').sort()
  const berkategori = semua.filter((g) => typeof g?.grantId === 'string' && Array.isArray(g.kategori) && g.kategori.includes(kategoriWajib))
  if (berkategori.length === 0) return { ok: false, alasan: 'CATEGORY_NOT_GRANTED', kandidat: ids }
  const t = sekarang instanceof Date ? sekarang.getTime() : Number.NaN
  const berlaku = berkategori.filter((g) => {
    const v = Date.parse(g.validUntil)
    return !Number.isNaN(t) && !Number.isNaN(v) && v > t
  })
  if (berlaku.length === 0) return { ok: false, alasan: 'GRANT_NOT_ELIGIBLE', kandidat: ids }
  const urut = [...berlaku].sort((a, b) => Date.parse(b.validUntil) - Date.parse(a.validUntil) || (a.grantId < b.grantId ? -1 : a.grantId > b.grantId ? 1 : 0))
  return { ok: true, grantId: urut[0].grantId, kandidat: berlaku.map((g) => g.grantId).sort(), aturan: ATURAN_PILIH_GRANT }
}
