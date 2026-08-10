// Klien Prisma yang terkunci pada satu tenant.
//
// MASALAH YANG DIPECAHKAN
// Pola lama mengulang `where: { tenantId: session.user.tenantId }` di puluhan
// route. Satu kali lupa = data tenant lain bocor, dan tidak ada yang menahan.
// Isolasi seperti itu bergantung pada ingatan penulis kode.
//
// CARA KERJA
// forTenant(ctx) mengembalikan klien Prisma yang menyuntikkan tenantId secara
// OTOMATIS ke setiap query pada model bertenant. Lupa menulis tenantId tidak
// lagi berbahaya. Aturannya sendiri ada di tenant-guard.ts (logika murni,
// teruji); berkas ini hanya memasangnya ke klien Prisma aplikasi.
//
// Lihat docs/FASE-0-SKEMA-v2.md §6c untuk alasan memilih ini ketimbang Postgres RLS.

import { prisma } from '@/lib/prisma'
import type { TenantContext } from './context'
import { tenantGuardExtension } from './tenant-guard'

export { TENANT_MODELS } from './tenant-guard'

/**
 * Klien Prisma yang terkunci pada tenant di `ctx`.
 *
 * Dibangun di atas `prisma` dari lib/prisma.ts (bukan PrismaClient mentah), jadi
 * extension yang sudah ada — penomoran dokumen otomatis & gating langganan —
 * tetap berlaku.
 */
export function forTenant(ctx: TenantContext) {
  return prisma.$extends(tenantGuardExtension(ctx.tenantId))
}

export type TenantDb = ReturnType<typeof forTenant>
