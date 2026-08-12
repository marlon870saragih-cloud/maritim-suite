// Notification Center (Fase 5d). Baca: siaran (`userId=null`) + milik
// pengguna sendiri. `readAt` satu nilai per baris (lihat catatan skema) —
// markRead/markAllRead menandai untuk SEMUA pengguna tenant sekaligus, bukan
// per-pengguna. Simplifikasi sadar untuk skala tim kecil ship agency.

import type { TenantContext } from './context'
import { forTenant } from './tenant-db'

export type NotificationRow = {
  id: string
  type: string
  title: string
  message: string | null
  entityType: string | null
  entityId: string | null
  href: string | null
  readAt: Date | null
  createdAt: Date
}

const VISIBLE_TO = (ctx: TenantContext) => ({ OR: [{ userId: null }, { userId: ctx.userId }] })

export async function listNotifications(ctx: TenantContext, take = 30): Promise<NotificationRow[]> {
  return forTenant(ctx).notification.findMany({
    where: VISIBLE_TO(ctx),
    orderBy: { createdAt: 'desc' },
    take,
  })
}

export async function countUnread(ctx: TenantContext): Promise<number> {
  return forTenant(ctx).notification.count({ where: { ...VISIBLE_TO(ctx), readAt: null } })
}

export async function markRead(ctx: TenantContext, id: string): Promise<void> {
  await forTenant(ctx).notification.updateMany({ where: { id, ...VISIBLE_TO(ctx) }, data: { readAt: new Date() } })
}

export async function markAllRead(ctx: TenantContext): Promise<void> {
  await forTenant(ctx).notification.updateMany({
    where: { ...VISIBLE_TO(ctx), readAt: null },
    data: { readAt: new Date() },
  })
}

export type NewNotification = {
  type: 'APPROVAL_PENDING' | 'INVOICE_OVERDUE' | 'INVOICE_PAID'
  title: string
  message?: string
  entityType?: 'DISBURSEMENT' | 'INVOICE'
  entityId?: string
  href?: string
}

/**
 * Dipanggil dari service lain (disbursement/invoice) di titik peristiwa
 * terjadi. SENGAJA menelan kegagalannya sendiri (log saja, tak melempar) —
 * beda dari catatAudit() yang wajib melempar (K42 butuh jejak lengkap untuk
 * ronde approval). Notifikasi murni kenyamanan UX; gagal menulisnya tak
 * boleh membatalkan transaksi keuangan yang memicunya.
 */
export async function notify(ctx: TenantContext, data: NewNotification): Promise<void> {
  try {
    await forTenant(ctx).notification.create({
      data: {
        tenantId: ctx.tenantId,
        userId: null,
        type: data.type,
        title: data.title,
        message: data.message ?? null,
        entityType: data.entityType ?? null,
        entityId: data.entityId ?? null,
        href: data.href ?? null,
      },
    })
  } catch (e) {
    console.error('[notification] gagal menulis:', e)
  }
}
