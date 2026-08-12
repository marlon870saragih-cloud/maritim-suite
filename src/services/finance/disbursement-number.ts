// Penomoran Disbursement (K32, docs/FASE-3-EPDA-ENGINE.md §5).
//
// Mekanisme PARALEL di service layer, sengaja TIDAK dipasang ke extension Prisma
// yang menomori MaritimeDocument. Alasannya (K32): extension itu berkunci pada
// `docType` + menghitung urutan dengan `count()`, sementara Disbursement memakai
// `kind` dan butuh sufiks revisi — menaruhnya di sana berarti memasukkan logika
// revisi ke dalam ORM.
//
// Yang TETAP dipakai ulang: `formatDocNumber()` + `monthWindow()`. Formatnya satu;
// tak boleh ada string format kedua di repo. Prefix pun tidak ditulis ulang di
// sini — ia DIBACA dari hasil formatDocNumber (lihat prefixBulan).

import type { DisbursementKind } from '@prisma/client'
import { formatDocNumber, monthWindow } from '@/lib/doc-number'
import type { TenantContext } from '../context'
import { forTenant } from '../tenant-db'

/**
 * Bagian nomor sebelum angka urut, mis. `EPDA/2026/08/`.
 *
 * ⚠️ `formatDocNumber` memetakan `FPDA → 'FDA'` (peta lama app A), jadi FPDA dan
 * FDA berbagi satu seri nomor. Itu DIBIARKAN: P3 di §15 belum menjawab apa
 * bedanya FPDA dan FDA, dan berbagi seri justru mencegah dua dokumen berbeda
 * kind mendapat nomor identik (`@@unique([tenantId, docNumber])`). Begitu P3
 * dijawab, yang berubah cuma peta di lib/doc-number.ts.
 */
function prefixBulan(kind: DisbursementKind, year: number, mm: string): string {
  const contoh = formatDocNumber(kind, year, mm, 1)
  return contoh.slice(0, contoh.lastIndexOf('/') + 1)
}

/** Angka urut dari ekor nomor; sufiks revisi `-R{n}` (K38) diabaikan. */
function urutanDari(docNumber: string): number {
  const ekor = docNumber.slice(docNumber.lastIndexOf('/') + 1).replace(/-R\d+$/, '')
  const n = Number(ekor)
  return Number.isFinite(n) ? n : 0
}

/**
 * Nomor berikutnya: `EPDA/YYYY/MM/NNNN`, berurutan per tenant per bulan.
 *
 * Urutannya dibaca dari nomor TERBESAR yang sudah ada (pola `nextVoyageNumber()`
 * di voyage.service.ts), bukan dari `count()`: `count()` salah begitu ada nomor
 * yang dibatalkan atau revisi yang lahir di bulan lain.
 *
 * `deletedAt` sengaja TIDAK disaring — nomor yang sudah terbit tidak pernah
 * didaur ulang. Untuk dokumen keuangan, nomor berlubang jauh lebih baik daripada
 * nomor kembar (K32).
 *
 * Risiko tabrakan pada operasi bersamaan diterima secara sadar, konsisten dengan
 * `nextVoyageNumber()`: `@@unique([tenantId, docNumber])` menjadikannya kegagalan
 * keras yang terlihat (P2002 → CONFLICT), bukan data rusak yang senyap.
 */
export async function nextDisbursementNumber(
  ctx: TenantContext,
  kind: DisbursementKind,
): Promise<string> {
  const { year, mm } = monthWindow()
  const prefix = prefixBulan(kind, year, mm)

  const terakhir = await forTenant(ctx).disbursement.findFirst({
    where: { docNumber: { startsWith: prefix } },
    orderBy: { docNumber: 'desc' },
    select: { docNumber: true },
  })

  return formatDocNumber(kind, year, mm, (terakhir ? urutanDari(terakhir.docNumber) : 0) + 1)
}

/**
 * Nomor revisi (K38): nomor induk dipertahankan, sufiks `-R{n}` ditambahkan.
 * `EPDA/2026/06/0142` (v1) → `…/0142-R1` (v2) → `…/0142-R2` (v3).
 *
 * Dasar nomor diambil dengan membuang sufiks revisi APA PUN yang sudah ada di
 * `docNumberSumber` — merevisi v2 (yang docNumber-nya sudah `-R1`) tidak boleh
 * menumpuk jadi `-R1-R2`. Aman dipanggil dengan docNumber versi mana pun dalam
 * rumpun yang sama, bukan cuma v1.
 */
export function nomorRevisi(docNumberSumber: string, versionBaru: number): string {
  const dasar = docNumberSumber.replace(/-R\d+$/, '')
  return `${dasar}-R${versionBaru - 1}`
}
