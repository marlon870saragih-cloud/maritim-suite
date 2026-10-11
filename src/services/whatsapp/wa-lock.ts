// Kunci baris & efek berantai WA-2a (Step 2C) — dipakai service kontak & consent.
//
// URUTAN KUNCI TETAP (anti-deadlock, desain rev2 §6.5) — semua jalur WA-2a WAJIB mengikutinya:
//   WaContact → WaConsentState → WaPrincipalAccessGrant → WaClientMessage
// SQL mentah di sini SELALU menyaring "tenantId" secara eksplisit (guard forTenant tidak
// menjangkau $queryRaw/$executeRaw).

import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { STATUS_PESAN_DAPAT_DITAHAN } from './wa2-policy'

/** Klien transaksi minimal yang dibutuhkan (kompatibel dengan tx forTenant). */
export type TxMentah = {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>
  $executeRaw(query: Prisma.Sql): Promise<number>
}

export type BarisKontakTerkunci = {
  id: string
  tenantId: string
  partyType: string
  customerId: string | null
  principalId: string | null
  e164: string
  status: string
  verificationStatus: string
  verificationExpiresAt: Date | null
  version: number
}

/** `mode` FOR UPDATE untuk mengubah kontak; FOR SHARE untuk operasi consent (kontak tak diubah). */
export async function kunciKontak(tx: TxMentah, tenantId: string, contactId: string, mode: 'UPDATE' | 'SHARE'): Promise<BarisKontakTerkunci | null> {
  const kunci = mode === 'UPDATE' ? Prisma.sql`FOR UPDATE` : Prisma.sql`FOR SHARE`
  const baris = await tx.$queryRaw<BarisKontakTerkunci[]>(Prisma.sql`
    SELECT "id", "tenantId", "partyType", "customerId", "principalId", "e164", "status",
           "verificationStatus", "verificationExpiresAt", "version"
    FROM "WaContact" WHERE "id" = ${contactId} AND "tenantId" = ${tenantId} ${kunci}`)
  return baris[0] ?? null
}

export type BarisConsentTerkunci = { id: string; status: string; version: number; lastEventId: string | null }

/** Pastikan baris state consent ada (NONE) lalu kunci FOR UPDATE. Aman terhadap pembuatan bersamaan. */
export async function kunciConsent(tx: TxMentah, tenantId: string, contactId: string, purpose: string): Promise<BarisConsentTerkunci> {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "WaConsentState" ("id", "tenantId", "contactId", "purpose", "status", "updatedAt")
    VALUES (${`wcs_${randomUUID()}`}, ${tenantId}, ${contactId}, ${purpose}, 'NONE', now())
    ON CONFLICT ("contactId", "purpose") DO NOTHING`)
  const baris = await tx.$queryRaw<BarisConsentTerkunci[]>(Prisma.sql`
    SELECT "id", "status", "version", "lastEventId" FROM "WaConsentState"
    WHERE "contactId" = ${contactId} AND "purpose" = ${purpose} AND "tenantId" = ${tenantId} FOR UPDATE`)
  if (!baris[0]) throw new Error('WA2C_CONSENT_STATE_MISSING')
  return baris[0]
}

/** Cabut semua grant ACTIVE kontak (kontak WAJIB sudah terkunci FOR UPDATE oleh pemanggil). */
export async function cabutGrantAktif(tx: TxMentah, tenantId: string, contactId: string, userId: string, alasan: string): Promise<string[]> {
  const baris = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    UPDATE "WaPrincipalAccessGrant"
    SET "status" = 'REVOKED', "revokedAt" = now(), "revokedByUserId" = ${userId}, "revokeReason" = ${alasan},
        "version" = "version" + 1, "updatedAt" = now()
    WHERE "tenantId" = ${tenantId} AND "contactId" = ${contactId} AND "status" = 'ACTIVE'
    RETURNING "id"`)
  return baris.map((b) => b.id).sort()
}

/** Tahan pesan proaktif yang masih bisa dibatalkan → NEEDS_REVIEW (state ada di schema 2B). */
export async function tahanPesanTertunda(tx: TxMentah, tenantId: string, contactId: string, alasan: string): Promise<string[]> {
  const baris = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    UPDATE "WaClientMessage"
    SET "state" = 'NEEDS_REVIEW', "reasonCode" = ${alasan}, "version" = "version" + 1, "updatedAt" = now()
    WHERE "tenantId" = ${tenantId} AND "contactId" = ${contactId}
      AND "state" IN (${Prisma.join([...STATUS_PESAN_DAPAT_DITAHAN])})
    RETURNING "id"`)
  return baris.map((b) => b.id).sort()
}

// ===================================================================== WA-2a Step 2E

export type BarisGrantTerkunci = {
  id: string
  contactId: string
  principalId: string
  status: string
  requestedByUserId: string
  dataCategories: string[]
  validUntil: Date | null
  version: number
}

/** Kunci grant FOR UPDATE (kontak WAJIB sudah dikunci lebih dulu oleh pemanggil — urutan tetap). */
export async function kunciGrant(tx: TxMentah, tenantId: string, grantId: string): Promise<BarisGrantTerkunci | null> {
  const baris = await tx.$queryRaw<BarisGrantTerkunci[]>(Prisma.sql`
    SELECT "id", "contactId", "principalId", "status", "requestedByUserId", "dataCategories", "validUntil", "version"
    FROM "WaPrincipalAccessGrant" WHERE "id" = ${grantId} AND "tenantId" = ${tenantId} FOR UPDATE`)
  return baris[0] ?? null
}

/** Tahan pesan yang memakai grant ini sebagai dasar akses → NEEDS_REVIEW. */
export async function tahanPesanGrant(tx: TxMentah, tenantId: string, grantId: string, alasan: string): Promise<string[]> {
  const baris = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    UPDATE "WaClientMessage"
    SET "state" = 'NEEDS_REVIEW', "reasonCode" = ${alasan}, "version" = "version" + 1, "updatedAt" = now()
    WHERE "tenantId" = ${tenantId} AND "grantIdSnapshot" = ${grantId}
      AND "state" IN (${Prisma.join([...STATUS_PESAN_DAPAT_DITAHAN])})
    RETURNING "id"`)
  return baris.map((b) => b.id).sort()
}
