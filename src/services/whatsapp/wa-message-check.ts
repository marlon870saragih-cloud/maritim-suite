// Pemeriksaan bersama DI DALAM transaksi untuk pesan klien WA-2a Step 2F — dipakai draft/preview (F3) dan approval
// (F4). Dipindah APA ADANYA dari wa-message.service.ts (F4) supaya setiap fungsi publik service tetap diawali
// gerbangWa2(ctx) dan logika revalidasi tidak diduplikasi. BUKAN titik masuk: semua fungsi butuh tx pemanggil yang
// sudah melewati gerbang. SQL mentah selalu menyaring "tenantId".

import { Prisma } from '@prisma/client'
import type { TenantContext } from '../context'
import { conflict, notFound } from '../errors'
import { kunciTanggal } from '../master/voyage-dates'
import { denganUlangWa2 } from './wa-db-error'
import { kunciKontak, type TxMentah } from './wa-lock'
import { statusVerifikasiEfektif } from './wa-contact.service'
import { resolusiAkses } from './wa-access-resolver'
import { bisaDiulangWa1, type CandidateBaris, type HasilRevalidasiCandidate } from './wa1-bridge'
import { nilaiFreshnessJadwal, nilaiFreshnessMilestone, type VerdictFreshnessD6 } from './wa-freshness'
import { pilihGrantUntukPesan } from './wa-message-policy'
import type { BahasaPesanKlien } from './wa-template'
import type { KodeAlasanWa2f3 } from './wa2-policy'

const MAKS_PERCOBAAN = 4

/** Pengulangan transaksi: konflik WA-2 (40001/P2034) + konflik WA-1 (KonflikKonkurensi, P2002) dari Prepare/kunci kandidat. */
export async function denganUlangPesan<T>(fn: () => Promise<T>): Promise<T> {
  for (let percobaan = 1; ; percobaan++) {
    try {
      return await denganUlangWa2(fn)
    } catch (e) {
      if (bisaDiulangWa1(e) && percobaan < MAKS_PERCOBAAN) continue
      if (bisaDiulangWa1(e)) throw conflict('Permintaan bersamaan belum terselesaikan. Coba lagi.', { code: 'CONCURRENCY_CONFLICT' })
      throw e
    }
  }
}

export type KontakLayak = { id: string; partyType: 'CUSTOMER' | 'PRINCIPAL'; partyId: string; e164: string; bahasa: BahasaPesanKlien }

export async function periksaKontak(tx: TxMentah, ctx: TenantContext, contactId: string, sekarang: Date): Promise<{ ok: true; k: KontakLayak } | { ok: false; alasan: KodeAlasanWa2f3 }> {
  const k = await kunciKontak(tx, ctx.tenantId, contactId, 'SHARE')
  if (!k) throw notFound('Kontak')
  if (k.status !== 'ACTIVE' || statusVerifikasiEfektif(k, sekarang) !== 'VERIFIED') return { ok: false, alasan: 'CONTACT_INELIGIBLE' }
  const partyId = k.partyType === 'CUSTOMER' ? k.customerId : k.principalId
  if ((k.partyType !== 'CUSTOMER' && k.partyType !== 'PRINCIPAL') || !partyId) return { ok: false, alasan: 'CONTACT_INELIGIBLE' }
  const b = await tx.$queryRaw<{ language: string }[]>(Prisma.sql`SELECT "language" FROM "WaContact" WHERE "id" = ${contactId} AND "tenantId" = ${ctx.tenantId}`)
  const bahasa = b[0]?.language
  if (bahasa !== 'ID' && bahasa !== 'EN') return { ok: false, alasan: 'LANGUAGE_INVALID' }
  return { ok: true, k: { id: k.id, partyType: k.partyType, partyId, e164: k.e164, bahasa } }
}

type HasilAksesPesan = { ok: true; grantIdSnapshot: string | null; kandidatGrant: string[] } | { ok: false; alasan: KodeAlasanWa2f3 }

/** Resolver 2E = SATU-SATUNYA sumber otorisasi; di sini hanya memilih/memeriksa grant dari hasilnya. */
export async function periksaAkses(tx: TxMentah, ctx: TenantContext, k: KontakLayak, voyageId: string, kategori: string, sekarang: Date, grantSnapshot?: string | null): Promise<HasilAksesPesan> {
  const r = await resolusiAkses(tx, ctx.tenantId, k.id, sekarang)
  if (r.izin !== 'IZIN') return { ok: false, alasan: 'ACCESS_DENIED' }
  const a = r.akses.find((x) => x.voyageId === voyageId)
  if (!a) return { ok: false, alasan: 'ACCESS_DENIED' }
  if (!a.kategori.includes(kategori)) return { ok: false, alasan: 'CATEGORY_NOT_GRANTED' }
  if (r.partyType === 'CUSTOMER') return grantSnapshot ? { ok: false, alasan: 'GRANT_NOT_ELIGIBLE' } : { ok: true, grantIdSnapshot: null, kandidatGrant: [] }
  const p = pilihGrantUntukPesan(a.grants, kategori, sekarang)
  if (!p.ok) return { ok: false, alasan: p.alasan }
  if (grantSnapshot === undefined) return { ok: true, grantIdSnapshot: p.grantId, kandidatGrant: p.kandidat }
  // Preview/approval: grant SNAPSHOT harus masih termasuk grant sah ber-kategori (bukan sembarang grant lain).
  return p.kandidat.includes(grantSnapshot ?? '') ? { ok: true, grantIdSnapshot: grantSnapshot, kandidatGrant: p.kandidat } : { ok: false, alasan: 'GRANT_NOT_ELIGIBLE' }
}

type Fakta = Extract<HasilRevalidasiCandidate, { ok: true }>['fakta']

/** Bukti freshness D6 dibaca dari DB tenant (terkunci FOR SHARE) lalu dinilai evaluator murni. */
export async function nilaiFreshnessDb(tx: TxMentah, ctx: TenantContext, c: CandidateBaris, fakta: Fakta, sekarang: Date): Promise<VerdictFreshnessD6> {
  if ('perubahan' in fakta) {
    const sumber = await tx.$queryRaw<{ createdAt: Date }[]>(Prisma.sql`
      SELECT "createdAt" FROM "AuditLog" WHERE "id" = ${c.sourceRef} AND "tenantId" = ${ctx.tenantId} AND "tableName" = 'Voyage' AND "recordId" = ${c.voyageId}`)
    const v = await tx.$queryRaw<{ eta: Date | null; etd: Date | null }[]>(Prisma.sql`
      SELECT "eta", "etd" FROM "Voyage" WHERE "id" = ${c.voyageId} AND "tenantId" = ${ctx.tenantId} AND "deletedAt" IS NULL FOR SHARE`)
    const medan = fakta.perubahan.map((p) => p.medan)
    const kf = medan.length
      ? await tx.$queryRaw<{ id: string; field: string; confirmedValue: Date; confirmedAt: Date; confirmedByUserId: string; invalidatedAt: Date | null }[]>(Prisma.sql`
          SELECT "id", "field", "confirmedValue", "confirmedAt", "confirmedByUserId", "invalidatedAt" FROM "VoyageScheduleConfirmation"
          WHERE "tenantId" = ${ctx.tenantId} AND "voyageId" = ${c.voyageId} AND "field" IN (${Prisma.join(medan)})
          ORDER BY "id" FOR SHARE`)
      : []
    return nilaiFreshnessJadwal({
      perubahan: fakta.perubahan.map((p) => ({ medan: p.medan, baru: p.baru })),
      nilaiVoyageKini: { eta: kunciTanggal(v[0]?.eta ?? null), etd: kunciTanggal(v[0]?.etd ?? null) },
      sumberDicatatPada: sumber[0]?.createdAt as Date,
      konfirmasi: kf.map((x) => ({ id: x.id, field: x.field, nilai: kunciTanggal(x.confirmedValue), confirmedAt: x.confirmedAt, confirmedByUserId: x.confirmedByUserId, invalidatedAt: x.invalidatedAt })),
      sekarang,
    })
  }
  // F4 (K1): kunci Voyage FOR SHARE SEBELUM membaca peristiwa — penulis VoyageEvent mengunci Voyage FOR NO KEY UPDATE,
  // jadi sisipan/hapus bersamaan menunggu atau sudah commit (terlihat) saat peristiwa dibaca di bawah.
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Voyage" WHERE "id" = ${c.voyageId} AND "tenantId" = ${ctx.tenantId} FOR SHARE`)
  const ev = await tx.$queryRaw<{ id: string; voyageId: string; eventCode: string; occurredAt: Date; source: string; deletedAt: Date | null; portCallId: string | null; recordedByUserId: string }[]>(Prisma.sql`
    SELECT "id", "voyageId", "eventCode", "occurredAt", "source", "deletedAt", "portCallId", "recordedByUserId" FROM "VoyageEvent"
    WHERE "id" = ${c.sourceRef} AND "tenantId" = ${ctx.tenantId} AND "voyageId" = ${c.voyageId} FOR SHARE`)
  const lain = await tx.$queryRaw<{ id: string; eventCode: string; portCallId: string | null }[]>(Prisma.sql`
    SELECT "id", "eventCode", "portCallId" FROM "VoyageEvent"
    WHERE "tenantId" = ${ctx.tenantId} AND "voyageId" = ${c.voyageId} AND "eventCode" = ${fakta.keluarga} AND "deletedAt" IS NULL AND "id" <> ${c.sourceRef}`)
  return nilaiFreshnessMilestone({ keluarga: fakta.keluarga, peristiwa: ev[0] ?? null, peristiwaAktifLain: lain, sekarang })
}

export async function asalDataVoyage(tx: TxMentah, ctx: TenantContext, voyageId: string): Promise<string | null> {
  const r = await tx.$queryRaw<{ dataOrigin: string | null }[]>(Prisma.sql`SELECT "dataOrigin" FROM "Voyage" WHERE "id" = ${voyageId} AND "tenantId" = ${ctx.tenantId}`)
  return r[0]?.dataOrigin ?? null
}
