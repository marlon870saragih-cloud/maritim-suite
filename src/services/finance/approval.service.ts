// Approval berjenjang (K42-K44, §8 docs/FASE-3-EPDA-ENGINE.md).
//
// ⚠️ Kebijakan (berapa level, peran mana, boleh menyetujui sendiri) BELUM
// dijawab Tribuana (P1/P2 §15) — semuanya dibaca dari approval-policy.ts, yang
// sudah dibangun murni & siap-multilevel di 3a. Berkas ini TIDAK PERNAH
// membandingkan peran langsung ("jangan pernah membandingkan peran langsung di
// service/route" — komentar approval-policy.ts); satu-satunya gerbang adalah
// `bolehMemutuskan()`.
//
// `Approval` append-only (skema: "sekali tersimpan tidak boleh diubah") — tidak
// ada update()/delete() di berkas ini, selamanya.

import type { Approval, DisbursementKind, DisbursementStatus } from '@prisma/client'
import type { TenantContext } from '../context'
import { conflict, forbidden, notFound } from '../errors'
import { pilihan, str } from '../input'
import { forTenant } from '../tenant-db'
import {
  bolehMemutuskan,
  IZINKAN_SETUJU_SENDIRI,
  KEPUTUSAN_APPROVAL,
  levelBerikutnya,
  rondeLengkap,
  STATUS_DARI_KEPUTUSAN,
  type KeputusanApproval,
  type KonteksKebijakan,
} from './approval-policy'
import { bolehTransisiUntukKind } from './disbursement-status'
import {
  getDisbursement,
  getDisbursementDetail,
  type DisbursementDetail,
  type DisbursementWithItems,
} from './disbursement.service'
import { catatAudit, type Jejak } from './audit'

export async function listApprovals(ctx: TenantContext, disbursementId: string): Promise<Approval[]> {
  await getDisbursement(ctx, disbursementId) // K44 pola: pintu masuk dipagari lewat induk
  return forTenant(ctx).approval.findMany({
    where: { entityType: 'DISBURSEMENT', entityId: disbursementId },
    orderBy: { createdAt: 'asc' },
  })
}

/**
 * Baris `Approval` SESUDAH transisi `REVISION_REQUESTED` TERAKHIR (K42) — dibaca
 * dari `AuditLog` (satu-satunya jejak transisi status, K34). Baris approval lama
 * tetap ADA (immutable) tapi tidak lagi dihitung untuk ronde sekarang. Dokumen
 * yang belum pernah kembali dari REVISION_REQUESTED memakai seluruh riwayatnya.
 */
async function rondeSekarang(ctx: TenantContext, disbursementId: string): Promise<Approval[]> {
  const db = forTenant(ctx)
  const [semua, logTransisi] = await Promise.all([
    db.approval.findMany({
      where: { entityType: 'DISBURSEMENT', entityId: disbursementId },
      orderBy: { createdAt: 'asc' },
    }),
    db.auditLog.findMany({
      where: { tableName: 'Disbursement', recordId: disbursementId, action: 'UPDATE' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, newValue: true },
    }),
  ])

  const resetTerakhir = logTransisi.find((l) => {
    const nv = l.newValue as { status?: DisbursementStatus } | null
    return nv?.status === 'REVISION_REQUESTED'
  })

  return resetTerakhir ? semua.filter((a) => a.createdAt > resetTerakhir.createdAt) : semua
}

/** Pembuat dokumen (K44/P2) — dibaca dari `AuditLog` CREATE tertua; `Disbursement` sendiri tak punya kolom pembuat. */
async function pembuatDokumen(ctx: TenantContext, disbursementId: string): Promise<string | null> {
  const log = await forTenant(ctx).auditLog.findFirst({
    where: { tableName: 'Disbursement', recordId: disbursementId, action: 'CREATE' },
    orderBy: { createdAt: 'asc' },
    select: { userId: true },
  })
  return log?.userId ?? null
}

/** Transisi status dipicu APPROVER (beda pemicu dari `setDisbursementStatus` — K34 kolom "Dipicu oleh"). */
async function terapkanStatus(
  ctx: TenantContext,
  disb: DisbursementWithItems,
  ke: DisbursementStatus,
  jejak: Jejak,
): Promise<void> {
  if (!bolehTransisiUntukKind(disb.kind, disb.status, ke)) {
    throw conflict(`Transisi ${disb.status} → ${ke} tidak diizinkan untuk ${disb.kind}.`)
  }
  const hasil = await forTenant(ctx).disbursement.updateMany({
    where: { id: disb.id },
    data: { status: ke },
  })
  if (hasil.count === 0) throw notFound('Disbursement')

  await catatAudit(
    ctx,
    {
      tableName: 'Disbursement',
      recordId: disb.id,
      action: 'UPDATE',
      oldValue: { status: disb.status },
      newValue: { status: ke },
    },
    jejak,
  )
}

/**
 * Satu keputusan approval (K42). Hanya sah pada dokumen `PENDING_REVIEW`.
 * `level` DITENTUKAN SISTEM dari `levelBerikutnya()` — pemanggil tidak memilih
 * levelnya sendiri, supaya tak ada yang bisa "melompat" ke level yang bukan
 * gilirannya.
 *
 * `APPROVED` hanya menaikkan status dokumen ke `APPROVED` bila ronde SUDAH
 * lengkap (semua level kebijakan terpenuhi, K34); kalau belum, dokumen tetap
 * `PENDING_REVIEW` menunggu level berikutnya. `REJECTED`/`REQUEST_REVISION`
 * SELALU langsung berefek, di level manapun — satu penolakan cukup untuk
 * mematikan atau mengembalikan dokumen (K42).
 */
export async function putuskanApproval(
  ctx: TenantContext,
  disbursementId: string,
  body: Record<string, unknown>,
  jejak: Jejak = {},
): Promise<DisbursementDetail> {
  const disb = await getDisbursement(ctx, disbursementId) // K44 aturan 1

  if (disb.status !== 'PENDING_REVIEW') {
    throw conflict(
      `Hanya dokumen PENDING_REVIEW yang bisa diputuskan (dokumen ini: ${disb.status}).`,
    )
  }

  const keputusan = pilihan(body.decision, KEPUTUSAN_APPROVAL, 'Keputusan') as KeputusanApproval
  const note = str(body.note)
  const kebijakanCtx: KonteksKebijakan = {
    kind: disb.kind,
    grandTotal: disb.grandTotal,
    baseCurrency: disb.baseCurrency,
  }

  const rondeIni = await rondeSekarang(ctx, disbursementId)
  const levelDisetujui = rondeIni.filter((a) => a.decision === 'APPROVED').map((a) => a.level)
  const levelTarget = levelBerikutnya(levelDisetujui, kebijakanCtx)
  if (levelTarget === null) {
    // Semestinya tak tercapai (dokumen sudah naik ke APPROVED begitu ronde
    // lengkap) — dijaga eksplisit supaya tak ada approval "nyasar" bila terjadi.
    throw conflict('Semua level approval untuk dokumen ini sudah terpenuhi.')
  }

  if (!ctx.system && !bolehMemutuskan(ctx.role, levelTarget, kebijakanCtx)) {
    throw forbidden(
      `Peran ${ctx.role} tidak berhak memutuskan level ${levelTarget} untuk dokumen ${disb.kind}.`,
    )
  }

  if (!IZINKAN_SETUJU_SENDIRI && !ctx.system) {
    const pembuat = await pembuatDokumen(ctx, disbursementId)
    if (pembuat && pembuat === ctx.userId) {
      throw forbidden('Kebijakan saat ini tidak mengizinkan menyetujui dokumen yang disusun sendiri.')
    }
  }

  const user = await forTenant(ctx).user.findFirst({ where: { id: ctx.userId }, select: { name: true } })

  await forTenant(ctx).approval.create({
    data: {
      tenantId: ctx.tenantId,
      entityType: 'DISBURSEMENT',
      entityId: disbursementId,
      level: levelTarget,
      userId: ctx.userId,
      userName: user?.name ?? null,
      userRole: ctx.role,
      decision: keputusan,
      note,
      ipAddress: jejak.ipAddress ?? null,
    },
  })

  if (keputusan === 'REJECTED' || keputusan === 'REQUEST_REVISION') {
    await terapkanStatus(ctx, disb, STATUS_DARI_KEPUTUSAN[keputusan], jejak)
  } else if (rondeLengkap([...levelDisetujui, levelTarget], kebijakanCtx)) {
    await terapkanStatus(ctx, disb, 'APPROVED', jejak)
  }
  // else: APPROVED di level ini, tapi ronde belum lengkap — dokumen tetap
  // PENDING_REVIEW menunggu level berikutnya (tak ada aksi lanjutan di sini).

  return getDisbursementDetail(ctx, disbursementId)
}

export type StatusApprovalUi = {
  approvals: Approval[]
  /** Level yang sedang menunggu keputusan; `null` bila bukan PENDING_REVIEW atau ronde sudah lengkap. */
  levelTarget: number | null
  /** Apakah PENGGUNA SAAT INI berhak memutuskan `levelTarget` sekarang (§12/6 — sumber tombol UI). */
  bolehMemutuskanSekarang: boolean
}

/**
 * Bahan untuk UI (§12/6-7): riwayat approval + apakah pengguna sekarang boleh
 * memutuskan. Dipanggil dari page.tsx (server component), BUKAN dari
 * disbursement.service.ts — mengimpornya di sana akan membuat impor melingkar
 * (approval.service.ts sudah mengimpor disbursement.service.ts).
 */
export async function statusApprovalUntukUi(
  ctx: TenantContext,
  disb: {
    id: string
    kind: DisbursementKind
    status: DisbursementStatus
    grandTotal: number
    baseCurrency: string
  },
): Promise<StatusApprovalUi> {
  const approvals = await forTenant(ctx).approval.findMany({
    where: { entityType: 'DISBURSEMENT', entityId: disb.id },
    orderBy: { createdAt: 'asc' },
  })

  if (disb.status !== 'PENDING_REVIEW') {
    return { approvals, levelTarget: null, bolehMemutuskanSekarang: false }
  }

  const kebijakanCtx: KonteksKebijakan = {
    kind: disb.kind,
    grandTotal: disb.grandTotal,
    baseCurrency: disb.baseCurrency,
  }
  const rondeIni = await rondeSekarang(ctx, disb.id)
  const levelDisetujui = rondeIni.filter((a) => a.decision === 'APPROVED').map((a) => a.level)
  const levelTarget = levelBerikutnya(levelDisetujui, kebijakanCtx)
  const bolehMemutuskanSekarang =
    levelTarget !== null && (ctx.system === true || bolehMemutuskan(ctx.role, levelTarget, kebijakanCtx))

  return { approvals, levelTarget, bolehMemutuskanSekarang }
}
