// Service pemberian akses principal — WA-2a Step 2E (K-05/K-05b; keputusan owner E-3, E-4, E-5).
//
// • DEFAULT DENY. Akses principal hanya lewat grant eksplisit: diajukan satu staf, diputuskan staf
//   LAIN (ADMIN/MANAJER_OPERASI) — service + CHECK DB WaGrant_maker_checker.
// • Cakupan = daftar voyage eksplisit; tiap voyage WAJIB milik principal kontak (bukan per kapal),
//   NYATA, tidak terhapus, bukan CLOSED/CANCELLED — diperiksa saat diajukan DAN saat diputuskan.
// • E-4: kontak INACTIVE / UNVERIFIED / verifikasi EXPIRED tidak pernah memperoleh grant ACTIVE.
//   Permintaan SETUJU yang tidak layak tidak mengubah state (diaudit); TOLAK eksplisit selalu bisa.
// • E-3: masa berlaku maksimum 12 bulan SEJAK PERSETUJUAN; tanpa tanggal → tepat 12 bulan.
// • Pencabutan: ACTIVE → REVOKED (alasan wajib); pesan yang memakai grant ini → NEEDS_REVIEW.
// • URUTAN KUNCI: WaContact (SHARE) → WaPrincipalAccessGrant (UPDATE) → Voyage (SHARE) → WaClientMessage.
// • Audit tanpa teks bukti (sidik saja). Tidak mengembalikan data voyage (itu wa-voyage-view.ts).

import type { TenantContext } from '../context'
import { conflict, notFound, validation } from '../errors'
import { forTenant } from '../tenant-db'
import { catatAudit } from '../finance/audit'
import { Prisma } from '@prisma/client'
import { gerbangWa2 } from './wa2-gate'
import { denganUlangWa2 } from './wa-db-error'
import { kunciGrant, kunciKontak, tahanPesanGrant, type TxMentah } from './wa-lock'
import { sidikBukti, statusVerifikasiEfektif } from './wa-contact.service'
import { ASAL_DATA_SAH, KATEGORI_DATA_GRANT, MAKS_BULAN_GRANT, MAKS_VOYAGE_PER_GRANT } from './wa2-policy'

const TABEL = 'WaPrincipalAccessGrant'
const galat = (pesan: string, code: string) => validation(pesan, { code })
const idSah = (v: unknown, nama: string): string => {
  if (typeof v !== 'string' || v.trim() === '' || v.length > 64) throw validation(`${nama} tidak sah.`)
  return v
}
const teksSah = (v: unknown, min: number, maks: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length >= min && t.length <= maks ? t : null
}
export function tambahBulan(d: Date, bulan: number): Date {
  const x = new Date(d.getTime())
  x.setUTCMonth(x.getUTCMonth() + bulan)
  return x
}

type KontakTerkunci = NonNullable<Awaited<ReturnType<typeof kunciKontak>>>
const kontakLayak = (k: KontakTerkunci, sekarang: Date) => k.status === 'ACTIVE' && k.partyType === 'PRINCIPAL' && !!k.principalId && statusVerifikasiEfektif(k, sekarang) === 'VERIFIED'

/** Voyage cakupan yang (masih) memenuhi syarat untuk principal — dikunci FOR SHARE. */
async function voyageSah(tx: TxMentah, tenantId: string, principalId: string, voyageIds: string[]): Promise<Set<string>> {
  if (voyageIds.length === 0) return new Set()
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "Voyage"
    WHERE "id" IN (${Prisma.join(voyageIds)}) AND "tenantId" = ${tenantId} AND "principalId" = ${principalId}
      AND "deletedAt" IS NULL AND "dataOrigin" = ${ASAL_DATA_SAH} AND "status" NOT IN ('CLOSED', 'CANCELLED')
    ORDER BY "id" FOR SHARE`)
  return new Set(rows.map((r) => r.id))
}

// ================================================================== ajukan

export type InputGrant = {
  voyageIds: unknown
  kategori: unknown
  buktiIdentitas: unknown
  buktiHubungan: unknown
  buktiKewenangan: unknown
  berlakuSampai?: unknown
}

export async function ajukanGrant(ctx: TenantContext, contactId: unknown, input: InputGrant): Promise<{ hasil: 'DIAJUKAN'; grantId: string }> {
  gerbangWa2(ctx)
  const cid = idSah(contactId, 'contactId')
  const ids = Array.isArray(input?.voyageIds) ? input.voyageIds : null
  if (!ids || ids.length === 0 || ids.length > MAKS_VOYAGE_PER_GRANT || !ids.every((v) => typeof v === 'string' && v.length > 0 && v.length <= 64) || new Set(ids).size !== ids.length) {
    throw galat(`Cakupan wajib berisi 1–${MAKS_VOYAGE_PER_GRANT} voyage berbeda (bukan per kapal).`, 'GRANT_SCOPE_INVALID')
  }
  const voyageIds = [...(ids as string[])].sort()
  const kat = Array.isArray(input?.kategori) ? input.kategori : null
  if (!kat || kat.length === 0 || !kat.every((c) => (KATEGORI_DATA_GRANT as readonly unknown[]).includes(c)) || new Set(kat).size !== kat.length) {
    throw galat('Kategori data tidak sah (STATUS, SCHEDULE_ESTIMATE, SCHEDULE_ACTUAL, MILESTONE).', 'GRANT_SCOPE_INVALID')
  }
  const bukti = [input?.buktiIdentitas, input?.buktiHubungan, input?.buktiKewenangan].map((b) => teksSah(b, 10, 2000))
  if (bukti.some((b) => !b)) throw galat('Bukti identitas, hubungan bisnis, dan kewenangan wajib (10–2000 karakter).', 'GRANT_EVIDENCE_REQUIRED')
  const [bIdentitas, bHubungan, bKewenangan] = bukti as string[]
  let diminta: Date | null = null
  if (input?.berlakuSampai !== undefined && input?.berlakuSampai !== null) {
    diminta = input.berlakuSampai instanceof Date ? input.berlakuSampai : typeof input.berlakuSampai === 'string' ? new Date(input.berlakuSampai) : null
    if (!diminta || Number.isNaN(diminta.getTime())) throw galat('Tanggal berakhir grant tidak sah.', 'GRANT_EXPIRY_INVALID')
  }

  return denganUlangWa2(() =>
    forTenant(ctx).$transaction(async (tx) => {
      const sekarang = new Date()
      if (diminta && (diminta.getTime() <= sekarang.getTime() || diminta.getTime() > tambahBulan(sekarang, MAKS_BULAN_GRANT).getTime())) {
        throw galat(`Tanggal berakhir grant wajib di masa depan dan maksimum ${MAKS_BULAN_GRANT} bulan.`, 'GRANT_EXPIRY_INVALID')
      }
      const k = await kunciKontak(tx as unknown as TxMentah, ctx.tenantId, cid, 'SHARE')
      if (!k) throw notFound('Kontak')
      if (k.partyType !== 'PRINCIPAL' || !k.principalId) throw galat('Grant hanya untuk kontak principal.', 'CONTACT_NOT_PRINCIPAL')
      if (!kontakLayak(k, sekarang)) throw galat('Kontak harus aktif dan terverifikasi (belum kedaluwarsa).', 'CONTACT_INELIGIBLE')
      const sah = await voyageSah(tx as unknown as TxMentah, ctx.tenantId, k.principalId, voyageIds)
      if (sah.size !== voyageIds.length) throw galat('Ada voyage yang bukan milik principal ini, tidak aktif, atau bukan data nyata.', 'VOYAGE_NOT_AUTHORIZED')
      const g = await tx.waPrincipalAccessGrant.create({
        data: {
          tenantId: ctx.tenantId,
          contactId: cid,
          principalId: k.principalId,
          dataCategories: [...(kat as string[])].sort(),
          identityEvidence: bIdentitas,
          relationshipEvidence: bHubungan,
          authorityEvidence: bKewenangan,
          requestedByUserId: ctx.userId,
          validUntil: diminta,
        },
        select: { id: true },
      })
      await tx.waPrincipalAccessGrantVoyage.createMany({ data: voyageIds.map((voyageId) => ({ tenantId: ctx.tenantId, grantId: g.id, voyageId })) })
      await catatAudit(ctx, { tableName: TABEL, recordId: g.id, action: 'CREATE', newValue: { peristiwa: 'WA2_GRANT_DIAJUKAN', contactId: cid, principalId: k.principalId, voyageIds, kategori: [...(kat as string[])].sort(), sidikBukti: [bIdentitas, bHubungan, bKewenangan].map(sidikBukti), berlakuSampaiDiminta: diminta?.toISOString() ?? null } }, {}, tx)
      return { hasil: 'DIAJUKAN' as const, grantId: g.id }
    }),
  )
}

// ================================================================== putuskan

export type HasilKeputusan =
  | { hasil: 'DISETUJUI'; grantId: string; berlakuSampai: string; voyageIds: string[] }
  | { hasil: 'DITOLAK'; grantId: string }
  | { hasil: 'TIDAK_LAYAK'; grantId: string; alasan: 'CONTACT_INELIGIBLE' | 'GRANT_SCOPE_STALE' }

export async function putuskanGrant(ctx: TenantContext, grantId: unknown, input: { keputusan: unknown; catatan: unknown }): Promise<HasilKeputusan> {
  gerbangWa2(ctx)
  const gid = idSah(grantId, 'grantId')
  const keputusan = input?.keputusan
  if (keputusan !== 'SETUJU' && keputusan !== 'TOLAK') throw validation('Keputusan harus SETUJU atau TOLAK.')
  const catatan = teksSah(input?.catatan, 5, 1000)
  if (!catatan) throw validation('Catatan keputusan wajib (5–1000 karakter).')

  return denganUlangWa2(() =>
    forTenant(ctx).$transaction(async (tx): Promise<HasilKeputusan> => {
      const t = tx as unknown as TxMentah
      const awal = await tx.waPrincipalAccessGrant.findFirst({ where: { id: gid }, select: { contactId: true } })
      if (!awal) throw notFound('Grant')
      // Urutan kunci tetap: kontak dulu, lalu grant.
      const k = await kunciKontak(t, ctx.tenantId, awal.contactId, 'SHARE')
      const g = await kunciGrant(t, ctx.tenantId, gid)
      if (!g || !k) throw notFound('Grant')
      if (g.requestedByUserId === ctx.userId) throw conflict('Pengaju tidak boleh memutuskan grant sendiri.', { code: 'GRANT_SELF_DECISION_FORBIDDEN' })
      if (g.status !== 'PENDING') throw conflict('Grant sudah diputuskan.', { code: 'GRANT_NOT_PENDING', status: g.status })
      const sekarang = new Date()

      if (keputusan === 'TOLAK') {
        await tx.waPrincipalAccessGrant.updateMany({ where: { id: gid, status: 'PENDING' }, data: { status: 'REJECTED', decidedByUserId: ctx.userId, decidedAt: sekarang, decisionNote: catatan, version: { increment: 1 } } })
        await catatAudit(ctx, { tableName: TABEL, recordId: gid, action: 'UPDATE', oldValue: { status: 'PENDING' }, newValue: { peristiwa: 'WA2_GRANT_DITOLAK', sidikCatatan: sidikBukti(catatan) } }, {}, tx)
        return { hasil: 'DITOLAK', grantId: gid }
      }

      // SETUJU — E-4: tak layak → TIDAK ada perubahan state; percobaan diaudit.
      const tolakTanpaUbah = async (alasan: 'CONTACT_INELIGIBLE' | 'GRANT_SCOPE_STALE', rinci: Record<string, unknown>): Promise<HasilKeputusan> => {
        await catatAudit(ctx, { tableName: TABEL, recordId: gid, action: 'UPDATE', oldValue: { status: 'PENDING' }, newValue: { peristiwa: 'WA2_GRANT_PERSETUJUAN_DITOLAK_SISTEM', alasan, ...rinci } }, {}, tx)
        return { hasil: 'TIDAK_LAYAK', grantId: gid, alasan }
      }
      if (!kontakLayak(k, sekarang) || k.principalId !== g.principalId || k.id !== g.contactId) {
        return tolakTanpaUbah('CONTACT_INELIGIBLE', { statusKontak: k.status, verifikasi: statusVerifikasiEfektif(k, sekarang) })
      }
      const cakupan = (await tx.waPrincipalAccessGrantVoyage.findMany({ where: { grantId: gid }, select: { voyageId: true } })).map((r) => r.voyageId).sort()
      const sah = await voyageSah(t, ctx.tenantId, g.principalId, cakupan)
      if (cakupan.length === 0 || sah.size !== cakupan.length) {
        return tolakTanpaUbah('GRANT_SCOPE_STALE', { voyageTidakSah: cakupan.filter((v) => !sah.has(v)), cakupanKosong: cakupan.length === 0 })
      }
      // E-3: maksimum 12 bulan SEJAK PERSETUJUAN; tanpa tanggal → tepat 12 bulan.
      const batas = tambahBulan(sekarang, MAKS_BULAN_GRANT)
      const berlaku = g.validUntil && g.validUntil.getTime() < batas.getTime() ? g.validUntil : batas
      if (berlaku.getTime() <= sekarang.getTime()) return tolakTanpaUbah('GRANT_SCOPE_STALE', { berlakuSampaiLewat: true })
      const n = await tx.waPrincipalAccessGrant.updateMany({
        where: { id: gid, status: 'PENDING' },
        data: { status: 'ACTIVE', decidedByUserId: ctx.userId, decidedAt: sekarang, decisionNote: catatan, validUntil: berlaku, version: { increment: 1 } },
      })
      if (n.count !== 1) throw conflict('Grant berubah bersamaan. Coba lagi.', { code: 'CONCURRENCY_CONFLICT' })
      await catatAudit(ctx, { tableName: TABEL, recordId: gid, action: 'APPROVE', oldValue: { status: 'PENDING' }, newValue: { peristiwa: 'WA2_GRANT_DISETUJUI', berlakuSampai: berlaku.toISOString(), voyageIds: cakupan, sidikCatatan: sidikBukti(catatan) } }, {}, tx)
      return { hasil: 'DISETUJUI', grantId: gid, berlakuSampai: berlaku.toISOString(), voyageIds: cakupan }
    }),
  )
}

// ================================================================== cabut

export async function cabutGrant(ctx: TenantContext, grantId: unknown, input: { alasan: unknown }): Promise<{ hasil: 'DICABUT' | 'SUDAH_DICABUT'; pesanDitahan: string[] }> {
  gerbangWa2(ctx)
  const gid = idSah(grantId, 'grantId')
  const alasan = teksSah(input?.alasan, 5, 500)
  if (!alasan) throw validation('Alasan pencabutan wajib (5–500 karakter).')
  return denganUlangWa2(() =>
    forTenant(ctx).$transaction(async (tx) => {
      const t = tx as unknown as TxMentah
      const awal = await tx.waPrincipalAccessGrant.findFirst({ where: { id: gid }, select: { contactId: true } })
      if (!awal) throw notFound('Grant')
      await kunciKontak(t, ctx.tenantId, awal.contactId, 'SHARE')
      const g = await kunciGrant(t, ctx.tenantId, gid)
      if (!g) throw notFound('Grant')
      if (g.status === 'REVOKED') return { hasil: 'SUDAH_DICABUT' as const, pesanDitahan: [] }
      if (g.status !== 'ACTIVE') throw conflict('Hanya grant ACTIVE yang dapat dicabut (PENDING → tolak).', { code: 'GRANT_NOT_ACTIVE', status: g.status })
      await tx.waPrincipalAccessGrant.updateMany({ where: { id: gid, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date(), revokedByUserId: ctx.userId, revokeReason: alasan, version: { increment: 1 } } })
      const pesanDitahan = await tahanPesanGrant(t, ctx.tenantId, gid, 'ACCESS_REVOKED')
      await catatAudit(ctx, { tableName: TABEL, recordId: gid, action: 'UPDATE', oldValue: { status: 'ACTIVE' }, newValue: { peristiwa: 'WA2_GRANT_DICABUT', sidikAlasan: sidikBukti(alasan), pesanDitahan } }, {}, tx)
      return { hasil: 'DICABUT' as const, pesanDitahan }
    }),
  )
}

// ================================================================== baca

export type StatusGrantEfektif = 'PENDING' | 'ACTIVE' | 'EXPIRED_EFEKTIF' | 'TIDAK_BERLAKU_EFEKTIF' | 'REJECTED' | 'REVOKED' | 'EXPIRED'

/** Daftar grant kontak dengan status EFEKTIF (kedaluwarsa & cakupan tak berlaku dihitung saat dibaca). */
export async function daftarGrantKontak(ctx: TenantContext, contactId: unknown) {
  gerbangWa2(ctx)
  const cid = idSah(contactId, 'contactId')
  const db = forTenant(ctx)
  if (!(await db.waContact.findFirst({ where: { id: cid }, select: { id: true } }))) throw notFound('Kontak')
  const grants = await db.waPrincipalAccessGrant.findMany({
    where: { contactId: cid },
    select: { id: true, principalId: true, status: true, dataCategories: true, validUntil: true, requestedByUserId: true, decidedByUserId: true, decidedAt: true, createdAt: true, voyages: { select: { voyageId: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  const sekarang = new Date()
  const semuaVoyage = Array.from(new Set(grants.flatMap((g) => g.voyages.map((v) => v.voyageId))))
  const masihSah = new Set(
    (await db.voyage.findMany({ where: { id: { in: semuaVoyage }, deletedAt: null, dataOrigin: ASAL_DATA_SAH, status: { notIn: ['CLOSED', 'CANCELLED'] } }, select: { id: true, principalId: true } })).map((v) => `${v.id}|${v.principalId}`),
  )
  return grants.map((g) => {
    let efektif: StatusGrantEfektif = g.status as StatusGrantEfektif
    if (g.status === 'ACTIVE') {
      if (!g.validUntil || g.validUntil.getTime() <= sekarang.getTime()) efektif = 'EXPIRED_EFEKTIF'
      else if (!g.voyages.some((v) => masihSah.has(`${v.voyageId}|${g.principalId}`))) efektif = 'TIDAK_BERLAKU_EFEKTIF'
    }
    return { id: g.id, status: g.status, statusEfektif: efektif, kategori: g.dataCategories, voyageIds: g.voyages.map((v) => v.voyageId).sort(), berlakuSampai: g.validUntil?.toISOString() ?? null, diajukanOleh: g.requestedByUserId, diputuskanOleh: g.decidedByUserId, diputuskanPada: g.decidedAt?.toISOString() ?? null }
  })
}
