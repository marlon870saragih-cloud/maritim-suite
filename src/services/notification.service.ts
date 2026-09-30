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
    // --- Fase 8c (K156) — kuota paket mendekati/habis ---
    | 'QUOTA_WARNING'
    // --- Fase 8f (K169) — pelanggan mengonfirmasi pembayaran lewat portal ---
    | 'PORTAL_PAYMENT_CONFIRMED'
    // --- Fase 8g (K173) — vendor mengonfirmasi pekerjaan selesai lewat portal ---
    | 'VENDOR_WORK_CONFIRMED'
    // --- Fase 8k (K186) — bundel ekspor mandiri siap (atau gagal) ---
    | 'EXPORT_READY'
    // --- PRD-002 Step 5B — sinyal WARNING/ERROR Automation Hub (internal saja) ---
    | 'AUTOMATION_SIGNAL'
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
    // --- Fase 8g (K172) ---
    | 'VENDOR_INVOICE_SUBMISSION'
    // --- PRD-004 Step 3 (entitas lampiran/komentar intake) ---
    | 'VESSEL_CALL_INTAKE'
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
 * Hasil satu panggilan notify() (PRD-002 Step 3).
 *
 * - `DIBUAT`   — baris baru lahir.
 * - `DUPLIKAT` — `dedupeKey` sudah dipakai di tenant ini (P2002). Hasil NORMAL
 *   job yang dijalankan ulang atau dua jalan yang tumpang-tindih (K101) —
 *   bukan galat, jadi tidak dicatat ke log galat.
 * - `GAGAL`    — penulisan gagal karena sebab lain; dicatat ke log server.
 *
 * Pemanggil peristiwa (finance/portal/komentar) boleh terus mengabaikannya.
 * Job pengingat MEMAKAINYA untuk menghitung `dibuat`/`dilewati`/`gagal` secara
 * eksak — membaca ulang database sesudah menulis tidak bisa membedakan "baris
 * ini lahir oleh jalan saya" dari "lahir oleh jalan lain di detik yang sama".
 */
export type HasilNotify = 'DIBUAT' | 'DUPLIKAT' | 'GAGAL'

/** Kode galat Prisma tanpa mengimpor `@prisma/client` ke jalur ini. */
function kodeGalat(e: unknown): string | null {
  return e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : null
}

/**
 * Dipanggil dari service lain (disbursement/invoice) di titik peristiwa
 * terjadi. SENGAJA menelan kegagalannya sendiri (log saja, tak melempar) —
 * beda dari catatAudit() yang wajib melempar (K42 butuh jejak lengkap untuk
 * ronde approval). Notifikasi murni kenyamanan UX; gagal menulisnya tak
 * boleh membatalkan transaksi keuangan yang memicunya.
 */
export async function notify(ctx: TenantContext, data: NewNotification): Promise<HasilNotify> {
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
    return 'DIBUAT'
  } catch (e) {
    // Tabrakan kunci idempotensi adalah hasil normal job yang dijalankan ulang
    // atau dua jalan yang tumpang-tindih (K101) — bukan galat untuk dicatat.
    if (data.dedupeKey && kodeGalat(e) === 'P2002') return 'DUPLIKAT'
    console.error('[notification] gagal menulis:', e)
    return 'GAGAL'
  }
}
