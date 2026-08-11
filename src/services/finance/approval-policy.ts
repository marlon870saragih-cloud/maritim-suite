// Kebijakan approval — MURNI, tanpa impor nilai (K43/K44, §8).
//
// ⚠️ ISI SEMENTARA. Kebijakan approval Tribuana yang sebenarnya BELUM DIKETAHUI
// (P1 & P2 di docs/FASE-3-EPDA-ENGINE.md §15). Tak ada apa pun di schema.prisma,
// docs/, seed, maupun kode app A yang menyebut berapa level approval yang dipakai
// atau siapa yang menyetujui apa; dua kotak tanda tangan di PDF ("Operations
// Department" / "Branch Manager") BUKAN kebijakan approval.
//
// TITIK SENTUH SATU-SATUNYA untuk P1. Menjawab P1 = mengubah HANYA berkas ini,
// selama bentuk jawabannya masih (a) level berbeda per `kind` atau (b) ambang nilai:
// dua-duanya sudah muat di `kebijakanApproval()` tanpa mengubah satu pun pemanggil,
// karena yang masuk adalah KonteksKebijakan (bukan `kind` saja) dan yang keluar
// adalah daftar level (bukan satu peran).
//
// Yang TIDAK muat: (c) kebijakan berbeda per tenant — itu butuh penambahan skema
// (kolom di Tenant atau tabel ApprovalPolicy) yang SENGAJA belum dibuat sampai
// kebijakannya diketahui. Membangun tabel konfigurasi untuk aturan yang belum ada
// bentuknya adalah cara paling cepat membangun tabel yang salah.

import type { DisbursementKind, DisbursementStatus, Role } from '@prisma/client'

export type LevelApproval = { level: number; peran: readonly Role[] }

/**
 * Semua yang boleh dipertimbangkan sebuah kebijakan. `grandTotal`/`baseCurrency`
 * belum dipakai — mereka ada supaya jawaban "di atas Rp X butuh 2 level" tidak
 * memaksa mengubah tanda tangan fungsi ini beserta semua pemanggilnya.
 */
export type KonteksKebijakan = {
  kind: DisbursementKind
  grandTotal: number
  baseCurrency: string
}

/** Keputusan yang sah (K42) — divalidasi dengan `pilihan()` dari services/input.ts. */
export const KEPUTUSAN_APPROVAL = ['APPROVED', 'REJECTED', 'REQUEST_REVISION'] as const
export type KeputusanApproval = (typeof KEPUTUSAN_APPROVAL)[number]

/**
 * Status tujuan tiap keputusan (K42). `REJECTED` mematikan dokumen, sedangkan
 * `REQUEST_REVISION` mengembalikannya ke penyusun — pemisahan ini perlu supaya
 * "tolak" tidak berarti "kerjakan lagi".
 */
export const STATUS_DARI_KEPUTUSAN: Readonly<Record<KeputusanApproval, DisbursementStatus>> = {
  APPROVED: 'APPROVED',
  REJECTED: 'CANCELLED',
  REQUEST_REVISION: 'REVISION_REQUESTED',
}

/**
 * ⚠️ Interim: SATU level, peran `ADMIN` (K43). Dipilih karena paling sedikit
 * mengasumsikan dan tidak mungkin membuat dokumen lolos tanpa siapa pun melihat.
 */
export function kebijakanApproval(_k: KonteksKebijakan): readonly LevelApproval[] {
  return [{ level: 1, peran: ['ADMIN'] }]
}

/**
 * ⚠️ Kebijakan, bukan teknis — P2. Interim `true` karena keadaan sekarang tidak
 * ada approval sama sekali (EPDA app A langsung keluar), jadi mengizinkan-tapi-
 * mencatat bukan kemunduran; sedangkan memblokir bisa membuat satu orang yang
 * sedang piket mentok total dan kembali memakai Excel.
 */
export const IZINKAN_SETUJU_SENDIRI = true

export const levelYangDibutuhkan = (k: KonteksKebijakan): number => kebijakanApproval(k).length

/** Peran yang boleh memutuskan pada satu level. Jangan pernah membandingkan peran langsung di service/route. */
export function bolehMemutuskan(peran: Role, level: number, k: KonteksKebijakan): boolean {
  const l = kebijakanApproval(k).find((x) => x.level === level)
  return l ? l.peran.includes(peran) : false
}

/** Level terendah yang belum disetujui pada ronde ini; `null` = ronde sudah lengkap. */
export function levelBerikutnya(
  levelDisetujui: readonly number[],
  k: KonteksKebijakan,
): number | null {
  const sudah = new Set(levelDisetujui)
  for (const l of kebijakanApproval(k)) if (!sudah.has(l.level)) return l.level
  return null
}

/**
 * Ronde lengkap = semua level kebijakan terpenuhi (K34: syarat
 * `PENDING_REVIEW → APPROVED`). `levelDisetujui` hanya boleh berisi baris
 * `Approval` SESUDAH transisi `REVISION_REQUESTED` terakhir (K42) — penyaringan
 * itu butuh AuditLog, jadi tinggal di approval.service.ts.
 */
export const rondeLengkap = (levelDisetujui: readonly number[], k: KonteksKebijakan): boolean =>
  levelBerikutnya(levelDisetujui, k) === null
