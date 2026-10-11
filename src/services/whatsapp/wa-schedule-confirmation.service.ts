// Konfirmasi jadwal ETA/ETD oleh staf — WA-2a Step 2F (F3c), keputusan owner D6-A.
//
// • Hanya ADMIN / MANAJER_OPERASI (gerbangWa2 + pemeriksaan peran eksplisit), hanya ETA/ETD (K-3: tanpa ETB).
// • TIDAK ADA konfirmasi palsu: nilai yang dikonfirmasi WAJIB sama dengan nilai voyage TERKINI (kunci tanggal
//   K-1), voyage milik tenant, tidak terhapus, data NYATA.
// • Idempoten & bebas duplikasi: baris Voyage dikunci FOR UPDATE (bukan FOR SHARE) sehingga dua permintaan
//   identik bersamaan DISERIALKAN; yang kedua melihat hasil yang pertama (READ COMMITTED) → SUDAH_ADA.
//   Permintaan identik = voyage, medan, nilai, jenis sumber, catatan, dan pencatat sama, konfirmasi masih
//   aktif & masih dalam masa berlaku 12 jam.
// • Invalidasi: sekali (dijaga trigger), alasan wajib; berulang → SUDAH_DIINVALIDASI.
// • Urutan kunci: Voyage → VoyageScheduleConfirmation. Audit atomik (catatAudit dengan tx); tanpa teks catatan
//   mentah di audit (sidik saja).

import { Prisma } from '@prisma/client'
import type { TenantContext } from '../context'
import { forbidden, notFound, validation } from '../errors'
import { forTenant } from '../tenant-db'
import { catatAudit } from '../finance/audit'
import { kunciTanggal } from '../master/voyage-dates'
import { gerbangWa2 } from './wa2-gate'
import { denganUlangWa2 } from './wa-db-error'
import { sidikBukti } from './wa-contact.service'
import type { TxMentah } from './wa-lock'
import {
  ASAL_DATA_SAH,
  FIELD_KONFIRMASI_JADWAL_WA2,
  MAKS_JAM_KONFIRMASI_JADWAL,
  PERAN_PENCATAT_KONFIRMASI_JADWAL,
  SUMBER_KONFIRMASI_JADWAL,
} from './wa2-policy'

const TABEL = 'VoyageScheduleConfirmation'
const MS_PER_JAM = 3_600_000
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
const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/
const kunciTanggalSah = (v: unknown): v is string => typeof v === 'string' && POLA_TANGGAL.test(v) && kunciTanggal(`${v}T00:00:00.000Z`) === v

function pastikanPencatat(ctx: TenantContext): void {
  gerbangWa2(ctx)
  if (!(PERAN_PENCATAT_KONFIRMASI_JADWAL as readonly string[]).includes(ctx.role)) throw forbidden('Konfirmasi jadwal hanya oleh ADMIN atau MANAJER_OPERASI.')
}

type VoyageTerkunci = { id: string; eta: Date | null; etd: Date | null; deletedAt: Date | null; dataOrigin: string | null }

async function kunciVoyage(tx: TxMentah, tenantId: string, voyageId: string, mode: 'UPDATE' | 'SHARE'): Promise<VoyageTerkunci | null> {
  const kunci = mode === 'UPDATE' ? Prisma.sql`FOR UPDATE` : Prisma.sql`FOR SHARE`
  const r = await tx.$queryRaw<VoyageTerkunci[]>(Prisma.sql`
    SELECT "id", "eta", "etd", "deletedAt", "dataOrigin" FROM "Voyage"
    WHERE "id" = ${voyageId} AND "tenantId" = ${tenantId} ${kunci}`)
  return r[0] ?? null
}

export type InputKonfirmasiJadwal = { field: unknown; nilai: unknown; sourceKind: unknown; sourceNote: unknown }
export type HasilKonfirmasiJadwal = { hasil: 'DICATAT' | 'SUDAH_ADA'; confirmationId: string }

export async function catatKonfirmasiJadwal(ctx: TenantContext, voyageId: unknown, input: InputKonfirmasiJadwal): Promise<HasilKonfirmasiJadwal> {
  pastikanPencatat(ctx)
  const vid = idSah(voyageId, 'voyageId')
  const field = input?.field
  if (!(FIELD_KONFIRMASI_JADWAL_WA2 as readonly unknown[]).includes(field)) throw galat('Konfirmasi hanya untuk ETA atau ETD.', 'CONFIRMATION_FIELD_INVALID')
  const nilai = input?.nilai
  if (!kunciTanggalSah(nilai)) throw galat('Nilai konfirmasi wajib tanggal YYYY-MM-DD yang sah.', 'CONFIRMATION_VALUE_INVALID')
  const sourceKind = input?.sourceKind
  if (!(SUMBER_KONFIRMASI_JADWAL as readonly unknown[]).includes(sourceKind)) throw galat('Jenis sumber konfirmasi tidak sah.', 'CONFIRMATION_SOURCE_INVALID')
  const sourceNote = teksSah(input?.sourceNote, 5, 500)
  if (!sourceNote) throw galat('Catatan sumber konfirmasi wajib (5–500 karakter).', 'CONFIRMATION_SOURCE_INVALID')
  const medan = field as (typeof FIELD_KONFIRMASI_JADWAL_WA2)[number]

  return denganUlangWa2(() =>
    forTenant(ctx).$transaction(async (tx) => {
      const t = tx as unknown as TxMentah
      const v = await kunciVoyage(t, ctx.tenantId, vid, 'UPDATE')
      // Jam diambil SESUDAH kunci didapat: permintaan yang menunggu harus melihat konfirmasi pemegang kunci.
      const sekarang = new Date()
      if (!v || v.deletedAt !== null) throw notFound('Voyage')
      if (v.dataOrigin !== ASAL_DATA_SAH) throw galat('Voyage bukan data operasional nyata.', 'VOYAGE_NOT_ELIGIBLE')
      if (kunciTanggal(v[medan]) !== nilai) throw galat('Nilai konfirmasi berbeda dengan jadwal voyage terkini.', 'CONFIRMATION_VALUE_NOT_CURRENT')

      const sidik = sidikBukti(sourceNote)
      const batasSegar = new Date(sekarang.getTime() - MAKS_JAM_KONFIRMASI_JADWAL * MS_PER_JAM)
      const kembar = await tx.voyageScheduleConfirmation.findMany({
        where: { voyageId: vid, field: medan, sourceKind: sourceKind as string, confirmedByUserId: ctx.userId, invalidatedAt: null, confirmedAt: { gte: batasSegar, lte: sekarang } },
        select: { id: true, confirmedValue: true, sourceNote: true },
        orderBy: [{ confirmedAt: 'desc' }, { id: 'asc' }],
      })
      const sama = kembar.find((k) => kunciTanggal(k.confirmedValue) === nilai && sidikBukti(k.sourceNote) === sidik)
      if (sama) return { hasil: 'SUDAH_ADA' as const, confirmationId: sama.id }

      const c = await tx.voyageScheduleConfirmation.create({
        data: { tenantId: ctx.tenantId, voyageId: vid, field: medan, confirmedValue: new Date(`${nilai}T00:00:00.000Z`), confirmedAt: sekarang, confirmedByUserId: ctx.userId, sourceKind: sourceKind as string, sourceNote },
        select: { id: true },
      })
      await catatAudit(ctx, { tableName: TABEL, recordId: c.id, action: 'CREATE', newValue: { peristiwa: 'WA2_JADWAL_DIKONFIRMASI', voyageId: vid, field: medan, nilai, sourceKind, sidikCatatan: sidik } }, {}, tx)
      return { hasil: 'DICATAT' as const, confirmationId: c.id }
    }),
  )
}

export type HasilInvalidasiKonfirmasi = { hasil: 'DIINVALIDASI' | 'SUDAH_DIINVALIDASI'; confirmationId: string }

export async function invalidasiKonfirmasiJadwal(ctx: TenantContext, confirmationId: unknown, input: { alasan: unknown }): Promise<HasilInvalidasiKonfirmasi> {
  pastikanPencatat(ctx)
  const id = idSah(confirmationId, 'confirmationId')
  const alasan = teksSah(input?.alasan, 5, 500)
  if (!alasan) throw validation('Alasan invalidasi wajib (5–500 karakter).')
  return denganUlangWa2(() =>
    forTenant(ctx).$transaction(async (tx) => {
      const t = tx as unknown as TxMentah
      const awal = await tx.voyageScheduleConfirmation.findFirst({ where: { id }, select: { voyageId: true } })
      if (!awal) throw notFound('Konfirmasi jadwal')
      await kunciVoyage(t, ctx.tenantId, awal.voyageId, 'SHARE')
      const r = await t.$queryRaw<{ id: string; invalidatedAt: Date | null }[]>(Prisma.sql`
        SELECT "id", "invalidatedAt" FROM "VoyageScheduleConfirmation" WHERE "id" = ${id} AND "tenantId" = ${ctx.tenantId} FOR UPDATE`)
      if (!r[0]) throw notFound('Konfirmasi jadwal')
      if (r[0].invalidatedAt !== null) return { hasil: 'SUDAH_DIINVALIDASI' as const, confirmationId: id }
      const n = await tx.voyageScheduleConfirmation.updateMany({ where: { id, invalidatedAt: null }, data: { invalidatedAt: new Date(), invalidatedByUserId: ctx.userId, invalidatedReason: alasan } })
      if (n.count !== 1) throw galat('Konfirmasi berubah bersamaan. Coba lagi.', 'CONCURRENCY_CONFLICT')
      await catatAudit(ctx, { tableName: TABEL, recordId: id, action: 'UPDATE', oldValue: { invalidatedAt: null }, newValue: { peristiwa: 'WA2_KONFIRMASI_JADWAL_DIINVALIDASI', sidikAlasan: sidikBukti(alasan) } }, {}, tx)
      return { hasil: 'DIINVALIDASI' as const, confirmationId: id }
    }),
  )
}
