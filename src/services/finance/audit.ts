// Jejak audit (K34, K42 · docs/FASE-3-EPDA-ENGINE.md §6/§8).
//
// Menulis ke model AuditLog yang SUDAH ADA di skema — tak ada kolom baru.
//
// `jejak` adalah argumen, bukan sesuatu yang dibaca dari HTTP: service tak tahu
// Request (aturan #5 POLA-SERVICE-LAYER.md). Route yang meneruskan ipAddress.
//
// Kegagalan menulis audit DIBIARKAN melempar. K42 memakai baris AuditLog transisi
// `REVISION_REQUESTED` untuk menghitung ronde approval — jejak yang hilang diam-diam
// akan membuat dokumen lolos dengan persetujuan atas angka yang sudah tidak ada.

import type { Prisma } from '@prisma/client'
import type { TenantContext } from '../context'
import { forTenant } from '../tenant-db'

export type AksiAudit =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'APPROVE'
  | 'EXPORT'
  /** Fase 8 / K144. Satu permintaan portal yang BERHASIL (baca atau tulis) —
   * withPortal() menulis satu baris ini per permintaan, userId `portal:<id>`. */
  | 'ACCESS'

/** Data non-HTTP yang hanya route bisa tahu. */
export type Jejak = { ipAddress?: string | null }

export type EntriAudit = {
  tableName: string
  recordId: string
  action: AksiAudit
  oldValue?: unknown
  newValue?: unknown
}

const json = (v: unknown): Prisma.InputJsonValue | undefined =>
  v === undefined ? undefined : (v as Prisma.InputJsonValue)

/**
 * Klien penulis audit. Bawaan `forTenant(ctx)`. WA-1 Step 2C (D-2C-02): pemanggil
 * boleh menyodorkan klien TRANSAKSI (`tx` dari `forTenant(ctx).$transaction`)
 * supaya mutasi bisnis + baris AuditLog jatuh/bangun BERSAMA — gagal menulis audit
 * menggagalkan seluruh transaksi. Pemanggil lama (tanpa argumen ke-4) tak berubah.
 */
export type KlienAudit = {
  auditLog: { create(args: { data: Prisma.AuditLogUncheckedCreateInput }): PromiseLike<unknown> }
}

export async function catatAudit(
  ctx: TenantContext,
  entri: EntriAudit,
  jejak: Jejak = {},
  db?: KlienAudit,
): Promise<void> {
  await (db ?? forTenant(ctx)).auditLog.create({
    data: {
      tableName: entri.tableName,
      recordId: entri.recordId,
      action: entri.action,
      oldValue: json(entri.oldValue),
      newValue: json(entri.newValue),
      userId: ctx.userId,
      ipAddress: jejak.ipAddress ?? null,
      tenantId: ctx.tenantId,
    },
  })
}
