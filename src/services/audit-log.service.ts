// Audit Log (Fase 5) — baca saja. Penulisannya sudah ada sejak Fase 3
// (finance/audit.ts, catatAudit()); berkas ini yang PERTAMA membacanya untuk
// ditampilkan ke pengguna. ADMIN + DIREKTUR saja (Fase 5e — Direktur "lihat-saja
// semua"): jejak audit termasuk isi dokumen (oldValue/newValue), bukan konsumsi
// operator biasa.

import type { TenantContext } from './context'
import { requireRole } from './context'
import { forTenant } from './tenant-db'

export type AuditLogRow = {
  id: string
  tableName: string
  recordId: string
  action: string
  oldValue: unknown
  newValue: unknown
  userId: string | null
  userName: string | null
  ipAddress: string | null
  createdAt: Date
}

const TAKE_DEFAULT = 200

export async function listAuditLog(
  ctx: TenantContext,
  opts: { tableName?: string; action?: string; take?: number } = {},
): Promise<AuditLogRow[]> {
  requireRole(ctx, 'ADMIN', 'DIREKTUR')
  const db = forTenant(ctx)

  const rows = await db.auditLog.findMany({
    where: {
      ...(opts.tableName ? { tableName: opts.tableName } : {}),
      ...(opts.action ? { action: opts.action } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: opts.take ?? TAKE_DEFAULT,
  })

  const userIds = Array.from(new Set(rows.map((r) => r.userId).filter((x): x is string => !!x)))
  const users = userIds.length
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : []
  const nameMap = new Map(users.map((u) => [u.id, u.name]))

  return rows.map((r) => ({
    id: r.id,
    tableName: r.tableName,
    recordId: r.recordId,
    action: r.action,
    oldValue: r.oldValue,
    newValue: r.newValue,
    userId: r.userId,
    userName: r.userId ? (nameMap.get(r.userId) ?? null) : null,
    ipAddress: r.ipAddress,
    createdAt: r.createdAt,
  }))
}

/** Nilai `tableName`/`action` unik yang pernah tercatat — untuk dropdown filter. */
export async function listAuditLogFacets(ctx: TenantContext): Promise<{ tables: string[]; actions: string[] }> {
  requireRole(ctx, 'ADMIN', 'DIREKTUR')
  const db = forTenant(ctx)
  const [tables, actions] = await Promise.all([
    db.auditLog.findMany({ distinct: ['tableName'], select: { tableName: true }, orderBy: { tableName: 'asc' } }),
    db.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
  ])
  return { tables: tables.map((t) => t.tableName), actions: actions.map((a) => a.action) }
}
