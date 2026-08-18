// Klien Prisma yang terkunci pada satu pihak, di dalam satu transaksi ber-RLS
// (K147/K148/K149).
//
// SET LOCAL hanya berlaku dalam SATU transaksi/koneksi — kalau tiap
// pemanggilan membuka koneksinya sendiri, SET LOCAL tak pernah terpasang
// saat query benar-benar berjalan. Karena itu withPortalTx() dipanggil SEKALI
// per permintaan portal (di dalam withPortal(), K149), dan `db` yang
// dihasilkannya diteruskan lewat PortalContext ke seluruh handler — bukan
// dibangun ulang di tiap pemanggilan service. Ini beda sengaja dari
// pseudocode `forPortal(pctx)` di dokumen desain (K148/K149), yang menulis
// forPortal seolah fungsi bebas yang membangun klien baru; di sini
// `forPortal` adalah accessor trivial ke `pctx.db` yang sudah dibangun.

import { portalPrisma } from '@/lib/portal-prisma'
import { portalGuardExtension, type SesiPihak } from './portal-guard'

function buildExtended(sesi: SesiPihak) {
  return portalPrisma.$extends(portalGuardExtension(sesi))
}

type ExtendedPortalClient = ReturnType<typeof buildExtended>
export type PortalDb = Parameters<Parameters<ExtendedPortalClient['$transaction']>[0]>[0]

/**
 * Jalankan `fn` di dalam SATU transaksi interaktif pada klien PORTAL, dengan
 * `SET LOCAL app.tenant_id` / `app.party_id` / `app.party_kind` terpasang
 * SEBAGAI PERINTAH PERTAMA transaksi (K147) — kebijakan RLS di database
 * membaca ketiganya lewat `current_setting(...)`.
 *
 * `set_config(name, value, is_local)` dipakai (bukan `SET LOCAL app.x = $1`
 * literal) karena ia fungsi SQL biasa yang menerima parameter terikat —
 * `SET` sendiri tidak bisa diparameterkan dengan aman lewat tagged template.
 */
export async function withPortalTx<T>(sesi: SesiPihak, fn: (db: PortalDb) => Promise<T>): Promise<T> {
  const extended = buildExtended(sesi)
  return extended.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${sesi.tenantId}, true)`
    await tx.$executeRaw`SELECT set_config('app.party_id', ${sesi.pihakId}, true)`
    await tx.$executeRaw`SELECT set_config('app.party_kind', ${sesi.pihak}, true)`
    return fn(tx)
  })
}
