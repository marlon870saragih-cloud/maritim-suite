// Resolver otorisasi WA-2a (Step 2E) — SATU-SATUNYA pintu: kontak → pihak → voyage + kategori.
//
// Aturan (desain rev2 §4.1; keputusan owner E-2, E-5, aturan akses customer/principal):
//   1. Kontak: tenant konteks, ACTIVE, VERIFIED dengan kedaluwarsa di masa depan. Selain itu TOLAK.
//   2. CUSTOMER: Customer aktif & tidak terhapus → voyage customerId = pihak, tenant sama, tidak
//      terhapus, dataOrigin NYATA, bukan CANCELLED (CLOSED tetap terlihat — aturan portal).
//   3. PRINCIPAL: DEFAULT DENY. Hanya grant ACTIVE milik kontak ini & principal ini dengan validUntil
//      di masa depan; per voyage cakupan: Voyage.principalId SAAT INI = principal, tenant sama,
//      tidak terhapus, NYATA, bukan CLOSED/CANCELLED. Kategori dihitung PER VOYAGE.
//   4. Tidak ada akses berdasarkan kapal, nomor telepon, consent, atau isi pesan. Tidak ada cache.
//   5. Mengembalikan ID voyage & kategori SAJA — fakta operasional lewat wa-voyage-view.ts.
//
// PROTOKOL KUNCI (wajib untuk semua pemakai): dijalankan DI DALAM transaksi pemanggil; resolver
// mengunci FOR SHARE kontak → pihak → grant + voyage yang menjadi dasar keputusan, sehingga
// pencabutan/perubahan bersamaan MENUNGGU sampai transaksi pemakai selesai (tidak ada keputusan
// berdasarkan data yang berubah di tengah pemeriksaan). Perubahan yang sudah commit SEBELUM
// pemeriksaan selalu terlihat (READ COMMITTED: tiap pernyataan memakai snapshot baru).

import { Prisma } from '@prisma/client'
import { kunciKontak, type TxMentah } from './wa-lock'
import { statusVerifikasiEfektif } from './wa-contact.service'
import { ASAL_DATA_SAH, KATEGORI_DATA_GRANT } from './wa2-policy'

export type AksesVoyage = { voyageId: string; kategori: string[] }
export type HasilAkses =
  | { izin: 'TOLAK'; alasan: 'CONTACT_INELIGIBLE' | 'PARTY_NOT_ELIGIBLE' }
  | { izin: 'IZIN'; partyType: 'CUSTOMER' | 'PRINCIPAL'; akses: AksesVoyage[] }

const urut = (a: string[]) => Array.from(new Set(a)).sort()

export async function resolusiAkses(tx: TxMentah, tenantId: string, contactId: string, sekarang: Date): Promise<HasilAkses> {
  const k = await kunciKontak(tx, tenantId, contactId, 'SHARE')
  if (!k || k.status !== 'ACTIVE' || statusVerifikasiEfektif(k, sekarang) !== 'VERIFIED') return { izin: 'TOLAK', alasan: 'CONTACT_INELIGIBLE' }

  if (k.partyType === 'CUSTOMER' && k.customerId) {
    const c = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT "id" FROM "Customer"
      WHERE "id" = ${k.customerId} AND "tenantId" = ${tenantId} AND "isActive" = true AND "deletedAt" IS NULL
      FOR SHARE`)
    if (!c[0]) return { izin: 'TOLAK', alasan: 'PARTY_NOT_ELIGIBLE' }
    const v = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT "id" FROM "Voyage"
      WHERE "tenantId" = ${tenantId} AND "customerId" = ${k.customerId} AND "deletedAt" IS NULL
        AND "dataOrigin" = ${ASAL_DATA_SAH} AND "status" <> 'CANCELLED'
      ORDER BY "id" FOR SHARE`)
    return { izin: 'IZIN', partyType: 'CUSTOMER', akses: v.map((r) => ({ voyageId: r.id, kategori: [...KATEGORI_DATA_GRANT] })) }
  }

  if (k.partyType === 'PRINCIPAL' && k.principalId) {
    const p = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT "id" FROM "Principal" WHERE "id" = ${k.principalId} AND "tenantId" = ${tenantId} FOR SHARE`)
    if (!p[0]) return { izin: 'TOLAK', alasan: 'PARTY_NOT_ELIGIBLE' }
    const baris = await tx.$queryRaw<{ voyageId: string; dataCategories: string[] }[]>(Prisma.sql`
      SELECT v."id" AS "voyageId", g."dataCategories"
      FROM "WaPrincipalAccessGrant" g
      JOIN "WaPrincipalAccessGrantVoyage" gv ON gv."grantId" = g."id" AND gv."tenantId" = g."tenantId"
      JOIN "Voyage" v ON v."id" = gv."voyageId"
      WHERE g."tenantId" = ${tenantId} AND g."contactId" = ${k.id} AND g."principalId" = ${k.principalId}
        AND g."status" = 'ACTIVE' AND g."validUntil" IS NOT NULL AND g."validUntil" > ${sekarang}
        AND v."tenantId" = ${tenantId} AND v."principalId" = ${k.principalId} AND v."deletedAt" IS NULL
        AND v."dataOrigin" = ${ASAL_DATA_SAH} AND v."status" NOT IN ('CLOSED', 'CANCELLED')
      ORDER BY v."id", g."id"
      FOR SHARE OF g, v`)
    const per = new Map<string, string[]>()
    for (const b of baris) per.set(b.voyageId, [...(per.get(b.voyageId) ?? []), ...b.dataCategories])
    return { izin: 'IZIN', partyType: 'PRINCIPAL', akses: Array.from(per.entries()).map(([voyageId, kategori]) => ({ voyageId, kategori: urut(kategori) })) }
  }

  return { izin: 'TOLAK', alasan: 'PARTY_NOT_ELIGIBLE' }
}
