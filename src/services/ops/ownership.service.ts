// ⚠️ PAGAR — berkas paling sensitif keamanan di Fase 7 (K85).
//
// MASALAH YANG DIPECAHKAN, dengan contoh nyatanya:
//
//   Attachment PUNYA tenantId, jadi tenant-guard memang menyaringnya. Tapi
//   tenant-guard tidak tahu apa-apa tentang `entityId` — kolom itu cuma teks.
//   Tanpa berkas ini, operator tenant A bisa mengunggah lampiran dengan
//   entityId milik disbursement tenant B:
//
//     forTenant(ctxA).attachment.create({ data: { entityType: 'DISBURSEMENT',
//                                                  entityId: <id milik B> } })
//
//   Barisnya tersimpan rapi dengan tenantId = A, tersaring dari daftar A (karena
//   layar B yang menanyakannya per entityId), dan MUNCUL DI LAYAR TENANT B.
//   Tidak ada galat, tidak ada log, tidak ada yang gagal. Itulah kenapa
//   pemeriksaan ini wajib dan bukan anjuran: kebocorannya senyap.
//
// Empat aturan K85 yang ditegakkan di sini:
//   1. entityType di luar daftar putih → VALIDATION (owner-guard.ts).
//   2. Pemeriksaan SELALU lewat forTenant(ctx) — tidak pernah `prisma` langsung.
//   3. Baris milik tenant lain dilaporkan NOT_FOUND, bukan FORBIDDEN
//      (aturan #6 POLA-SERVICE-LAYER.md — membedakannya membocorkan keberadaan data).
//   4. Diuji lintas-tenant di prisma/check-owner-guard.mjs, lengkap dengan
//      pembuktian bahwa ujinya nyata.

import type { TenantContext } from '../context'
import { forTenant } from '../tenant-db'
import { notFound, validation } from '../errors'
import {
  OwnerGuardError,
  periksaBentukEntitas,
  type BentukEntitas,
  type EntityType,
} from './owner-guard'

export type EntitasTerbukti = {
  entityType: EntityType
  entityId: string
  /** Baris induknya — sebagian pemanggil butuh voyageId/status-nya. */
  baris: { id: string } & Record<string, unknown>
}

/**
 * Buktikan (entityType, entityId) menunjuk baris yang BENAR-BENAR milik tenant
 * di ctx. Wajib dipanggil SEBELUM setiap penulisan Attachment/Comment/EmailLog
 * yang menyebut entityId.
 *
 * Melempar:
 *   VALIDATION — entityType tak dikenal / entityId kosong
 *   NOT_FOUND  — baris tak ada, sudah dihapus, ATAU milik tenant lain (disamarkan)
 */
export async function pastikanEntitasMilikTenant(
  ctx: TenantContext,
  entityType: unknown,
  entityId: unknown,
): Promise<EntitasTerbukti> {
  let diperiksa: { entityType: EntityType; entityId: string; bentuk: BentukEntitas }
  try {
    diperiksa = periksaBentukEntitas(entityType, entityId)
  } catch (e) {
    // owner-guard.ts sengaja bebas impor, jadi ia melempar galatnya sendiri.
    // Di sinilah galat itu diterjemahkan ke bahasa service layer.
    if (e instanceof OwnerGuardError) throw validation(e.message)
    throw e
  }

  const db = forTenant(ctx)

  // Akses model lewat nama properti klien Prisma. `db` adalah klien BERPAGAR
  // (forTenant), jadi tenantId disuntikkan ke `where` oleh tenant-guard — baris
  // milik tenant lain tidak akan pernah cocok. Ini aturan 2 K85, dan alasannya
  // langsung: memakai `prisma` mentah di sini akan membuat seluruh pemeriksaan
  // ini tidak ada artinya.
  const model = (db as unknown as Record<string, { findFirst: (a: unknown) => Promise<unknown> }>)[
    diperiksa.bentuk.model
  ]

  if (!model || typeof model.findFirst !== 'function') {
    // Peta menyebut model yang tak ada di klien Prisma — salah ketik saat
    // menambah entitas. Ditolak keras, bukan diam-diam dianggap "tidak ketemu":
    // "tidak ketemu" akan terlihat seperti pagar yang bekerja padahal rusak.
    throw new Error(
      `[owner-guard] model Prisma "${diperiksa.bentuk.model}" untuk entityType ` +
        `"${diperiksa.entityType}" tidak ada. Periksa ENTITAS_DIDUKUNG di owner-guard.ts.`,
    )
  }

  const baris = (await model.findFirst({
    where: { id: diperiksa.entityId },
    select: { id: true },
  })) as ({ id: string } & Record<string, unknown>) | null

  // Aturan 3: milik tenant lain → NOT_FOUND, sama seperti tidak ada sama sekali.
  if (!baris) throw notFound('Entitas yang dituju')

  return { entityType: diperiksa.entityType, entityId: diperiksa.entityId, baris }
}
