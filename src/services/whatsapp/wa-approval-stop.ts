// Penghenti approval tertaut pesan klien — WA-2a Step 2F (F4, keputusan owner K3/K6).
//
// Dipakai jalur HOLD 2C/2E (kontak, consent, grant), pembatalan, dan penggantian revisi supaya tidak pernah ada
// TahApprovalRequest aktif (PENDING, atau APPROVED dengan eksekusi NOT_STARTED/FAILED) untuk pesan yang sudah
// tidak menunggu/berlaku. Penghentian = hentikanApprovalTertaut WA-1 APA ADANYA (lewat wa1-bridge; perilaku WA-1
// tidak berubah) + audit WA2_* pada tabel WaClientMessage.
//
// Urutan kunci: pemanggil SUDAH memegang kunci kontak/consent/grant (atau kandidat); di sini baris approval
// dikunci FOR UPDATE SEBELUM baris pesan diubah pemanggil → WaContact → WaConsentState → grant → [kandidat] →
// TahApprovalRequest → WaClientMessage (sama dengan jalur permintaan & keputusan approval).
// SQL mentah selalu menyaring "tenantId" (guard forTenant tidak menjangkau $queryRaw).

import { Prisma } from '@prisma/client'
import type { TenantContext } from '../context'
import { catatAudit } from '../finance/audit'
import { hentikanApprovalTertaut, type TxWa1 } from './wa1-bridge'
import type { TxMentah } from './wa-lock'
import { SUBJEK_APPROVAL_PESAN_KLIEN } from './wa2-policy'

export type BarisApprovalTerkunci = { id: string; status: string; executionStatus: string; version: number; subjectType: string | null; subjectId: string | null }

/** Kunci baris approval FOR UPDATE (tenant eksplisit). Tidak ada → null. */
export async function kunciApprovalPesan(tx: TxMentah, tenantId: string, approvalRequestId: string): Promise<BarisApprovalTerkunci | null> {
  const r = await tx.$queryRaw<BarisApprovalTerkunci[]>(Prisma.sql`
    SELECT "id", "status", "executionStatus", "version", "subjectType", "subjectId" FROM "TahApprovalRequest"
    WHERE "id" = ${approvalRequestId} AND "tenantId" = ${tenantId} FOR UPDATE`)
  return r[0] ?? null
}

export const approvalMasihAktif = (a: { status: string; executionStatus: string }): boolean =>
  a.status === 'PENDING' || (a.status === 'APPROVED' && (a.executionStatus === 'NOT_STARTED' || a.executionStatus === 'FAILED'))

/**
 * Hentikan approval yang ditautkan ke pesan klien `messageId`. Hanya approval bersubjek WaClientMessage = pesan
 * itu yang disentuh (gagal tertutup bila subjek tak cocok). Mengembalikan true bila ada yang dihentikan.
 */
export async function hentikanApprovalPesan(
  ctx: TenantContext,
  tx: TxWa1,
  messageId: string,
  approvalRequestId: string | null,
  mode: 'CANCELLED' | 'SUPERSEDED',
  alasan: string,
): Promise<boolean> {
  if (!approvalRequestId) return false
  const a = await kunciApprovalPesan(tx as unknown as TxMentah, ctx.tenantId, approvalRequestId)
  if (!a) return false
  if (a.subjectType !== SUBJEK_APPROVAL_PESAN_KLIEN || a.subjectId !== messageId) throw new Error('[wa2f4] approval tertaut bukan milik pesan ini.')
  if (!approvalMasihAktif(a)) return false
  await hentikanApprovalTertaut(ctx, tx, a.id, mode, alasan)
  await catatAudit(ctx, { tableName: SUBJEK_APPROVAL_PESAN_KLIEN, recordId: messageId, action: 'UPDATE', oldValue: { approvalStatus: a.status, executionStatus: a.executionStatus }, newValue: { peristiwa: 'WA2_APPROVAL_DIHENTIKAN', approvalRequestId: a.id, mode, alasan } }, {}, tx)
  return true
}

/**
 * K3 — dipanggil jalur hold SEBELUM tahanPesanTertunda/tahanPesanGrant: approval aktif milik pesan yang akan
 * ditahan dihentikan (CANCELLED) di transaksi yang sama. Pilihan pesan = kriteria hold yang sama.
 */
export async function hentikanApprovalPesanDitahan(ctx: TenantContext, tx: TxWa1, kunci: { contactId: string } | { grantId: string }, alasan: string): Promise<string[]> {
  const t = tx as unknown as TxMentah
  const saring = 'contactId' in kunci ? Prisma.sql`"contactId" = ${kunci.contactId}` : Prisma.sql`"grantIdSnapshot" = ${kunci.grantId}`
  const pesan = await t.$queryRaw<{ id: string; approvalRequestId: string }[]>(Prisma.sql`
    SELECT "id", "approvalRequestId" FROM "WaClientMessage"
    WHERE "tenantId" = ${ctx.tenantId} AND ${saring} AND "approvalRequestId" IS NOT NULL
      AND "state" IN ('PENDING_APPROVAL', 'APPROVED')
    ORDER BY "approvalRequestId"`)
  const dihentikan: string[] = []
  for (const p of pesan) if (await hentikanApprovalPesan(ctx, tx, p.id, p.approvalRequestId, 'CANCELLED', alasan)) dihentikan.push(p.approvalRequestId)
  return dihentikan
}
