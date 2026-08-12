// Mesin status Disbursement — MURNI, tanpa impor nilai (K34–K36, §6).
//
// Tabel di sini adalah SATU-SATUNYA sumber kebenaran transisi status: service
// layer memakainya untuk menolak, dan UI memakainya untuk memutuskan tombol apa
// yang muncul (§12/6 — jangan hard-code daftar tombol di komponen).
//
// Apa pun yang tidak tercantum = ditolak.

import type { DisbursementKind, DisbursementStatus } from '@prisma/client'

/**
 * Graf transisi K34. `Record` lengkap secara sengaja: menambah anggota
 * `DisbursementStatus` di schema.prisma akan membuat tsc gagal di sini.
 *
 * Catatan yang paling mudah salah dibaca: `REVISED` berarti "sudah disalip versi
 * lebih baru", bukan "sudah direvisi dan ini yang terbaru" — karena itu ia
 * terminal, hanya versi penerusnya yang hidup.
 */
export const TRANSISI: Readonly<Record<DisbursementStatus, readonly DisbursementStatus[]>> = {
  DRAFT: ['PENDING_REVIEW', 'CANCELLED'],
  PENDING_REVIEW: ['APPROVED', 'REVISION_REQUESTED', 'DRAFT', 'CANCELLED'],
  REVISION_REQUESTED: ['PENDING_REVIEW', 'CANCELLED'],
  // Tidak ada jalan mundur ke DRAFT: dokumen yang sudah disetujui tak pernah
  // jadi draft lagi (K34). Jalurnya REVISION_REQUESTED, atau versi baru.
  APPROVED: ['SENT', 'REVISION_REQUESTED', 'CANCELLED'],
  SENT: ['REVISED', 'FINAL', 'CLOSED'],
  FINAL: ['CLOSED'],
  REVISED: [],
  CLOSED: [],
  CANCELLED: [],
}

export const STATUS_TERMINAL: ReadonlySet<DisbursementStatus> = new Set<DisbursementStatus>([
  'REVISED',
  'CLOSED',
  'CANCELLED',
])

/**
 * Status yang mengizinkan item ditambah/diubah/dihapus — dan sekaligus header
 * ringan (`notes`, `validUntil`, `revisionNote`) serta `agencyPct` (K36).
 *
 * `baseCurrency` lebih ketat lagi: `DRAFT` DAN belum ada item (K31) — itu
 * pemeriksaan yang butuh DB, jadi tinggal di service.
 */
export const BOLEH_UBAH_ITEM: ReadonlySet<DisbursementStatus> = new Set<DisbursementStatus>([
  'DRAFT',
  'REVISION_REQUESTED',
])

/**
 * K37: hanya dokumen yang sudah keluar ke principal (`SENT`) yang boleh
 * direvisi — lahir versi baru. Koreksi SEBELUM terkirim jalan lewat lingkaran
 * `PENDING_REVIEW ↔ REVISION_REQUESTED` pada versi yang sama (K34), bukan lewat
 * `revise()`. Satu sumber dipakai baik oleh `revision.service.ts` (menolak)
 * maupun UI (menampilkan tombol "Buat Revisi").
 */
export const STATUS_BOLEH_REVISI: ReadonlySet<DisbursementStatus> = new Set<DisbursementStatus>([
  'SENT',
])

export const bolehRevisi = (status: DisbursementStatus): boolean => STATUS_BOLEH_REVISI.has(status)

/** K35: sebuah estimasi tak pernah menjadi "final"; ia digantikan oleh FDA. */
const STATUS_KHUSUS_FDA: ReadonlySet<DisbursementStatus> = new Set<DisbursementStatus>(['FINAL'])

export const statusDipakaiOleh = (kind: DisbursementKind, status: DisbursementStatus): boolean =>
  kind === 'FDA' || !STATUS_KHUSUS_FDA.has(status)

export const bolehUbahItem = (status: DisbursementStatus): boolean => BOLEH_UBAH_ITEM.has(status)

/** Transisi sah menurut graf saja, tanpa memandang `kind`. */
export const bolehTransisi = (dari: DisbursementStatus, ke: DisbursementStatus): boolean =>
  TRANSISI[dari].includes(ke)

/** Transisi sah menurut graf DAN subset status untuk `kind` itu (K34 + K35). */
export const bolehTransisiUntukKind = (
  kind: DisbursementKind,
  dari: DisbursementStatus,
  ke: DisbursementStatus,
): boolean => bolehTransisi(dari, ke) && statusDipakaiOleh(kind, ke)

/** Daftar tujuan yang boleh muncul sebagai tombol (§12/6). */
export const transisiTersedia = (
  kind: DisbursementKind,
  dari: DisbursementStatus,
): readonly DisbursementStatus[] => TRANSISI[dari].filter((ke) => statusDipakaiOleh(kind, ke))

/**
 * Transisi yang syaratnya "sama dengan submit" (K34): ≥1 item, nol warning
 * pemblokir, `grandTotal > 0`. Syaratnya sendiri butuh DB — yang murni di sini
 * cuma pengetahuan transisi MANA yang harus diperiksa, supaya service tidak
 * mendaftarnya ulang (dan lupa satu).
 */
export const butuhSyaratSubmit = (dari: DisbursementStatus, ke: DisbursementStatus): boolean =>
  ke === 'PENDING_REVIEW' && (dari === 'DRAFT' || dari === 'REVISION_REQUESTED')
