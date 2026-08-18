// Jembatan HTTP → service. Satu-satunya tempat yang tahu soal Request/Response.
//
// Tugasnya tiga: ambil konteks tenant, jalankan service, terjemahkan kesalahan
// jadi status + JSON yang seragam. Route jadi tipis dan tidak lagi mengulang
// blok `getServerSession` + `if (!session) 401` di setiap berkas.

import { Prisma } from '@prisma/client'
import { requireTenant, type TenantContext } from './context'
import { ServiceError, conflict, notFound } from './errors'

export type ApiError = { error: { code: string; message: string; details?: unknown } }

/** Diekspor untuk dipakai ulang services/portal/http.ts (K144) — satu-satunya
 * bagian yang dipakai bersama; route & konteksnya sendiri tetap terpisah total. */
export function toResponse(e: unknown): Response {
  const err = normalize(e)
  if (!(err instanceof ServiceError)) {
    // Kesalahan tak terduga: catat lengkap di server, balas seadanya ke klien
    // supaya detail internal (nama tabel, SQL) tidak bocor.
    console.error('[api] kesalahan tak tertangani:', e)
    return Response.json(
      { error: { code: 'INTERNAL', message: 'Terjadi kesalahan di server.' } } satisfies ApiError,
      { status: 500 },
    )
  }
  return Response.json(
    { error: { code: err.code, message: err.message, details: err.details } } satisfies ApiError,
    { status: err.status },
  )
}

/** Ubah kesalahan Prisma yang sering muncul jadi ServiceError yang enak dibaca. */
function normalize(e: unknown): unknown {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === 'P2002') return conflict('Data dengan kunci yang sama sudah ada.')
    if (e.code === 'P2003') return conflict('Data ini masih dipakai di tempat lain — tidak bisa dihapus.')
    if (e.code === 'P2025') return notFound()
  }
  return e
}

/**
 * Bungkus handler route yang butuh login.
 *
 *   export const GET = withTenant(async (ctx) => Response.json(await listPorts(ctx)))
 *
 * `extra` meneruskan argumen kedua dari Next (mis. `{ params }`).
 */
export function withTenant<A extends unknown[]>(
  handler: (ctx: TenantContext, req: Request, ...extra: A) => Promise<Response>,
) {
  return async (req: Request, ...extra: A): Promise<Response> => {
    try {
      const ctx = await requireTenant()
      return await handler(ctx, req, ...extra)
    } catch (e) {
      return toResponse(e)
    }
  }
}

/**
 * Data jejak audit yang hanya lapisan HTTP bisa tahu (K42). Service menerimanya
 * sebagai argumen eksplisit — ia tidak pernah membaca Request sendiri.
 */
export function jejakDari(req: Request): { ipAddress: string | null } {
  const maju = req.headers.get('x-forwarded-for')
  return {
    ipAddress: maju?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null,
  }
}

/** Baca body JSON; body kosong / rusak → objek kosong (bukan lemparan). */
export async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  const b = await req.json().catch(() => ({}))
  return b && typeof b === 'object' ? (b as Record<string, unknown>) : {}
}
