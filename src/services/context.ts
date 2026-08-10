// Konteks tenant — satu-satunya pintu masuk identitas pemanggil ke service layer.
//
// Service tidak pernah memanggil getServerSession sendiri. Ia MENERIMA TenantContext
// sebagai argumen pertama. Akibatnya service bisa diuji tanpa HTTP, dan skrip CLI
// (backfill, seed, job terjadwal) bisa memakai service yang sama lewat systemContext().

import { getServerSession } from 'next-auth'
import type { Role } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { forbidden, unauthorized } from './errors'

export type TenantContext = {
  tenantId: string
  userId: string
  role: Role
  /** true bila konteks dibuat oleh proses internal (skrip/job), bukan pengguna. */
  system?: boolean
}

/** Ambil konteks dari sesi NextAuth. Melempar UNAUTHORIZED bila belum login. */
export async function requireTenant(): Promise<TenantContext> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.tenantId) throw unauthorized()
  return {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    role: session.user.role,
  }
}

/**
 * Konteks untuk proses internal (skrip backfill/seed, job terjadwal).
 * tenantId tetap WAJIB — tidak ada mode "lihat semua tenant". Kalau sebuah skrip
 * perlu memproses banyak tenant, ia membuat satu konteks per tenant dan
 * mengulang. Ini menjaga agar tidak pernah ada jalur kode yang bisa
 * mengembalikan data lintas-tenant.
 */
export function systemContext(tenantId: string, userId = 'system'): TenantContext {
  return { tenantId, userId, role: 'ADMIN', system: true }
}

/** Pagar peran. Konteks system melewatinya (skrip internal sudah tepercaya). */
export function requireRole(ctx: TenantContext, ...roles: Role[]): void {
  if (ctx.system) return
  if (!roles.includes(ctx.role)) {
    throw forbidden(`Tindakan ini hanya untuk peran: ${roles.join(', ')}.`)
  }
}
