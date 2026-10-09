// Jembatan HTTP → service. Satu-satunya tempat yang tahu soal Request/Response.
//
// Tugasnya tiga: ambil konteks tenant, jalankan service, terjemahkan kesalahan
// jadi status + JSON yang seragam. Route jadi tipis dan tidak lagi mengulang
// blok `getServerSession` + `if (!session) 401` di setiap berkas.

import { Prisma } from '@prisma/client'
import { requireTenant, type TenantContext } from './context'
import { ServiceError, conflict, forbidden, notFound, validation } from './errors'

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

/** Batas bawaan body JSON route yang memakai jsonBodyKetat (WA-1 Step 2H). */
export const MAKS_BYTE_BODY = 16_384

/**
 * Pagar CSRF (WA-1 Step 2H) untuk permintaan yang MENGUBAH data. Gagal tertutup:
 *   • `Sec-Fetch-Site`, bila dikirim peramban, wajib `same-origin` — `same-site` (subdomain lain di
 *     domain yang sama) dan `cross-site` ditolak;
 *   • header `Origin` WAJIB ada dan SAMA PERSIS dengan origin aplikasi (dari NEXTAUTH_URL).
 *     Origin hilang / `null` / subdomain lain → ditolak. Peramban selalu mengirim Origin pada POST
 *     fetch, jadi UI sendiri tak terpengaruh;
 *   • origin aplikasi tak terkonfigurasi / tak sah → semua ditolak.
 * Tidak bergantung pada SameSite cookie maupun Content-Type saja.
 */
export function pastikanAsalSah(req: Request): void {
  let asalAplikasi: string
  try {
    asalAplikasi = new URL(process.env.NEXTAUTH_URL ?? '').origin
  } catch {
    throw forbidden('Asal permintaan tidak dapat diverifikasi.')
  }
  const situs = req.headers.get('sec-fetch-site')
  if (situs !== null && situs !== 'same-origin') throw forbidden('Asal permintaan tidak sah.')
  const asal = req.headers.get('origin')
  if (!asal || asal === 'null' || asal !== asalAplikasi) throw forbidden('Asal permintaan tidak sah.')
}

/**
 * Baca body JSON secara KETAT (WA-1 Step 2H) untuk route yang MENGUBAH data — berbeda dari jsonBody
 * yang memaafkan:
 *   • pagar CSRF lebih dulu (pastikanAsalSah: Sec-Fetch-Site + Origin);
 *   • `Content-Type: application/json` WAJIB, termasuk untuk body kosong (formulir HTML tak bisa
 *     mengirimnya tanpa preflight CORS);
 *   • ukuran dibatasi `maksByte` — dihitung saat membaca aliran, jadi tetap berlaku tanpa
 *     Content-Length (chunked); melebihi → VALIDATION, sisa aliran tak dibaca;
 *   • JSON sah dan berupa objek (bukan array / null / primitif); body kosong → objek kosong.
 */
export async function jsonBodyKetat(req: Request, maksByte = MAKS_BYTE_BODY): Promise<Record<string, unknown>> {
  pastikanAsalSah(req)
  if (!/^application\/json\b/i.test((req.headers.get('content-type') ?? '').trim())) {
    throw validation('Content-Type harus application/json.')
  }
  const panjang = Number(req.headers.get('content-length') ?? '')
  if (Number.isFinite(panjang) && panjang > maksByte) throw validation(`Body terlalu besar (maks ${maksByte} byte).`)
  const potongan: Uint8Array[] = []
  let total = 0
  if (req.body) {
    const pembaca = req.body.getReader()
    for (;;) {
      const { done, value } = await pembaca.read()
      if (done) break
      total += value.byteLength
      if (total > maksByte) {
        await pembaca.cancel().catch(() => undefined)
        throw validation(`Body terlalu besar (maks ${maksByte} byte).`)
      }
      potongan.push(value)
    }
  }
  const teks = Buffer.concat(potongan).toString('utf8')
  if (teks.trim() === '') return {}
  let nilai: unknown
  try {
    nilai = JSON.parse(teks)
  } catch {
    throw validation('Body bukan JSON yang sah.')
  }
  if (nilai === null || typeof nilai !== 'object' || Array.isArray(nilai)) throw validation('Body harus objek JSON.')
  return nilai as Record<string, unknown>
}
