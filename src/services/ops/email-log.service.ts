// EmailLog (K136-K138, Fase 7h) — riwayat korespondensi yang DIAKUI MANUSIA,
// bukan hasil pengiriman. TIDAK ADA mailer di repo ini (K78, P10 masih
// terbuka): `createEmailLog()` dipanggil OTOMATIS oleh EmailDraftDialog.tsx
// saat operator menekan Salin/Buka-di-email (K137) — bukan tombol "kirim".
//
// Pola sama attachment.service.ts/comment.service.ts: entitas polimorfik
// (K84/K85), kepemilikan dibuktikan lewat pastikanEntitasMilikTenant()
// SEBELUM satu baris pun ditulis/dibaca.

import type { EmailLog } from '@prisma/client'
import type { TenantContext } from '../context'
import { requireRole } from '../context'
import { forTenant } from '../tenant-db'
import { notFound, validation } from '../errors'
import { str, wajib } from '../input'
import { pastikanEntitasMilikTenant } from './ownership.service'

/** Sejalan CommentPanel (7a/7f) — VIEWER/DIREKTUR peran baca, tak mencatat email. */
const PERAN_CATAT_EMAIL = ['ADMIN', 'OPERATOR', 'MANAJER_OPERASI', 'PENYUSUN_BIAYA', 'FINANCE'] as const

const KOLOM_AMAN = {
  id: true,
  entityType: true,
  entityId: true,
  template: true,
  toAddress: true,
  ccAddress: true,
  subject: true,
  status: true,
  sentAt: true,
  recordedByUserId: true,
  createdAt: true,
} as const

export type EmailLogRow = { [K in keyof typeof KOLOM_AMAN]: EmailLog[K & keyof EmailLog] }

/** Daftar riwayat satu entitas. Kepemilikan entitas dibuktikan dulu (K85). */
export async function listEmailLogs(
  ctx: TenantContext,
  entityType: unknown,
  entityId: unknown,
): Promise<EmailLogRow[]> {
  const terbukti = await pastikanEntitasMilikTenant(ctx, entityType, entityId)
  return forTenant(ctx).emailLog.findMany({
    where: { entityType: terbukti.entityType, entityId: terbukti.entityId, deletedAt: null },
    select: KOLOM_AMAN,
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * K137 — dipanggil OTOMATIS oleh EmailDraftDialog.tsx saat Salin/Buka-di-email
 * ditekan, TANPA dialog tambahan. `bodySnapshot` disimpan APA ADANYA (K138,
 * semangat snapshot K5): enam bulan kemudian pertanyaannya "apa persisnya
 * yang kita sampaikan", dan templat yang sudah berubah tak bisa menjawabnya.
 */
export async function createEmailLog(
  ctx: TenantContext,
  body: Record<string, unknown>,
): Promise<EmailLogRow> {
  requireRole(ctx, ...PERAN_CATAT_EMAIL)

  const terbukti = await pastikanEntitasMilikTenant(ctx, body.entityType, body.entityId)
  const subject = wajib(str(body.subject), 'Subjek')

  const row = await forTenant(ctx).emailLog.create({
    data: {
      tenantId: ctx.tenantId,
      entityType: terbukti.entityType,
      entityId: terbukti.entityId,
      template: str(body.template),
      toAddress: str(body.toAddress),
      ccAddress: str(body.ccAddress),
      subject,
      bodySnapshot: str(body.bodySnapshot),
      status: 'DRAFTED',
      recordedByUserId: ctx.userId,
    },
    select: KOLOM_AMAN,
  })
  return row
}

const STATUS_LANJUT: Readonly<Record<string, readonly string[]>> = {
  DRAFTED: ['SENT_MANUAL'],
  SENT_MANUAL: ['NO_RESPONSE', 'REPLIED'],
}

/**
 * "Tandai terkirim" dan penanda balasan (K138/P43) — SEMUANYA ditandai
 * TANGAN, sistem tidak pernah tahu status pengiriman sesungguhnya (K136).
 * `sentAt` HANYA diisi saat masuk ke SENT_MANUAL — transisi berikutnya
 * (NO_RESPONSE/REPLIED) tak menyentuhnya lagi (waktu kirim tak boleh bergeser
 * karena seseorang menandai balasan belakangan).
 */
export async function updateEmailLogStatus(
  ctx: TenantContext,
  id: string,
  tujuan: unknown,
): Promise<EmailLogRow> {
  requireRole(ctx, ...PERAN_CATAT_EMAIL)

  const ke = str(tujuan)
  if (!ke) throw validation('Status tujuan wajib diisi.')

  const row = await forTenant(ctx).emailLog.findFirst({ where: { id, deletedAt: null } })
  if (!row) throw notFound('Riwayat email')
  await pastikanEntitasMilikTenant(ctx, row.entityType, row.entityId)

  const boleh = STATUS_LANJUT[row.status] ?? []
  if (!boleh.includes(ke)) {
    throw validation(`Transisi ${row.status} → ${ke} tidak diizinkan. Yang tersedia: ${boleh.join(', ') || '(tidak ada)'}.`)
  }

  const hasil = await forTenant(ctx).emailLog.updateMany({
    where: { id, deletedAt: null },
    data: { status: ke, ...(ke === 'SENT_MANUAL' ? { sentAt: new Date() } : {}) },
  })
  if (hasil.count === 0) throw notFound('Riwayat email')

  const segar = await forTenant(ctx).emailLog.findFirst({ where: { id }, select: KOLOM_AMAN })
  if (!segar) throw notFound('Riwayat email')
  return segar
}
