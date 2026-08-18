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

/**
 * K86 — Fase 7 TIDAK membangun sistem notifikasi kedua. Reminder, SLA, dan
 * @sebut menulis ke tabel `Notification` yang sudah ada lewat notify() yang
 * sudah ada. Yang berubah di bawah hanyalah TIPE-nya (kolom `type` di database
 * memang sudah `String`, jadi tak ada migration untuk ini) — perubahan tipe,
 * bukan perubahan mekanisme.
 */
export type NewNotification = {
  type:
    | 'APPROVAL_PENDING'
    | 'INVOICE_OVERDUE'
    | 'INVOICE_PAID'
    // --- Fase 7 (K86) ---
    | 'TASK_DUE'
    | 'TASK_OVERDUE'
    | 'TASK_ASSIGNED'
    | 'SLA_BREACH'
    | 'MENTION'
    | 'PO_APPROVAL_PENDING'
    | 'WO_OVERDUE'
    | 'VENDOR_DOC_EXPIRING'
    | 'CREW_CHANGE_UPCOMING'
  title: string
  message?: string
  entityType?:
    | 'DISBURSEMENT'
    | 'INVOICE'
    // --- Fase 7 ---
    | 'VOYAGE'
    | 'PORT_CALL'
    | 'TASK'
    | 'VENDOR'
    | 'PURCHASE_ORDER'
    | 'WORK_ORDER'
    | 'CREW_CHANGE'
    | 'PORT_PLAYBOOK'
    | 'VESSEL'
    | 'PORT'
  entityId?: string
  href?: string
  /**
   * K101 — penerima. `undefined`/`null` = SIARAN ke semua pengguna tenant
   * (perilaku Fase 5d, dipertahankan apa adanya untuk tiga notifikasi finance).
   *
   * ⚠️ Untuk apa pun yang ditujukan ke ORANG TERTENTU (@sebut, pengingat tugas)
   * kolom ini WAJIB diisi. Alasannya ada di komentar skema `Notification`:
   * `readAt` satu nilai per baris — siaran ditandai terbaca oleh siapa pun yang
   * membacanya duluan, dan itu tidak bisa diterima untuk pesan bertarget (T5).
   */
  userId?: string | null
  /**
   * K101 — kunci idempotensi untuk penulisan yang dilakukan job tanpa manusia.
   * Unik per tenant (`@@unique([tenantId, dedupeKey])`), sehingga sapuan yang
   * sama dijalankan 1× atau 50× sehari tetap menghasilkan satu baris.
   */
  dedupeKey?: string | null
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
        // Bawaannya tetap `null` (siaran) — perilaku Fase 5d tidak berubah bagi
        // pemanggil yang tidak menyebut userId.
        userId: data.userId ?? null,
        type: data.type,
        title: data.title,
        message: data.message ?? null,
        entityType: data.entityType ?? null,
        entityId: data.entityId ?? null,
        href: data.href ?? null,
        dedupeKey: data.dedupeKey ?? null,
      },
    })
  } catch (e) {
    console.error('[notification] gagal menulis:', e)
  }
}
