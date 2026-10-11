// Pembaca fakta voyage terbatas (Step 2E, keputusan owner E-1) — TERPISAH dari resolver.
//
// Setiap pembacaan memanggil ulang resolver di transaksi yang SAMA (tanpa cache), lalu hanya
// mengembalikan kolom allowlist untuk kategori yang diizinkan PER VOYAGE. Tidak ada biaya,
// invoice, catatan, pihak lain, AIS, maupun dokumen. Tanpa freshness (Step 2a-F).
// Hanya data dataOrigin NYATA (E-2) — sudah dijamin resolver dan diperiksa ulang di sini.

import { Prisma } from '@prisma/client'
import type { TenantContext } from '../context'
import { notFound, validation } from '../errors'
import { forTenant } from '../tenant-db'
import { gerbangWa2 } from './wa2-gate'
import { resolusiAkses } from './wa-access-resolver'
import type { TxMentah } from './wa-lock'
import { ASAL_DATA_SAH, MILESTONE_TERBACA } from './wa2-policy'

export type FaktaVoyage = {
  voyageId: string
  voyageNumber: string
  namaKapal: string
  namaPelabuhan: string | null
  zonaWaktu: string | null
  status?: string
  eta?: string | null
  etb?: string | null
  etd?: string | null
  ata?: string | null
  atb?: string | null
  atd?: string | null
  milestoneTerakhir?: { eventCode: string; occurredAt: string } | null
}

const iso = (d: Date | null) => (d ? d.toISOString() : null)

/** Inti — WAJIB dipanggil di dalam transaksi pemakai (resolver mengunci FOR SHARE). */
export async function bacaFaktaDalamTx(tx: TxMentah, tenantId: string, contactId: string, voyageId: string, sekarang: Date): Promise<FaktaVoyage | null> {
  const r = await resolusiAkses(tx, tenantId, contactId, sekarang)
  if (r.izin !== 'IZIN') return null
  const a = r.akses.find((x) => x.voyageId === voyageId)
  if (!a || a.kategori.length === 0) return null
  const rows = await tx.$queryRaw<
    { id: string; voyageNumber: string; status: string; eta: Date | null; etb: Date | null; etd: Date | null; ata: Date | null; atb: Date | null; atd: Date | null; namaKapal: string; namaPelabuhan: string | null; zonaWaktu: string | null }[]
  >(Prisma.sql`
    SELECT v."id", v."voyageNumber", v."status"::text AS "status", v."eta", v."etb", v."etd", v."ata", v."atb", v."atd",
           ves."name" AS "namaKapal", p."name" AS "namaPelabuhan", p."timezone" AS "zonaWaktu"
    FROM "Voyage" v JOIN "Vessel" ves ON ves."id" = v."vesselId" LEFT JOIN "Port" p ON p."id" = v."portId"
    WHERE v."id" = ${voyageId} AND v."tenantId" = ${tenantId} AND v."deletedAt" IS NULL AND v."dataOrigin" = ${ASAL_DATA_SAH}`)
  const v = rows[0]
  if (!v) return null
  const hasil: FaktaVoyage = { voyageId: v.id, voyageNumber: v.voyageNumber, namaKapal: v.namaKapal, namaPelabuhan: v.namaPelabuhan, zonaWaktu: v.zonaWaktu }
  const boleh = new Set(a.kategori)
  if (boleh.has('STATUS')) hasil.status = v.status
  if (boleh.has('SCHEDULE_ESTIMATE')) Object.assign(hasil, { eta: iso(v.eta), etb: iso(v.etb), etd: iso(v.etd) })
  if (boleh.has('SCHEDULE_ACTUAL')) Object.assign(hasil, { ata: iso(v.ata), atb: iso(v.atb), atd: iso(v.atd) })
  if (boleh.has('MILESTONE')) {
    const m = await tx.$queryRaw<{ eventCode: string; occurredAt: Date }[]>(Prisma.sql`
      SELECT "eventCode", "occurredAt" FROM "VoyageEvent"
      WHERE "voyageId" = ${voyageId} AND "tenantId" = ${tenantId} AND "deletedAt" IS NULL
        AND "eventCode" IN (${Prisma.join([...MILESTONE_TERBACA])}) AND "occurredAt" <= ${sekarang}
      ORDER BY "occurredAt" DESC, "id" DESC LIMIT 1`)
    hasil.milestoneTerakhir = m[0] ? { eventCode: m[0].eventCode, occurredAt: m[0].occurredAt.toISOString() } : null
  }
  return hasil
}

const idSah = (v: unknown, nama: string): string => {
  if (typeof v !== 'string' || v.trim() === '' || v.length > 64) throw validation(`${nama} tidak sah.`)
  return v
}

/** Pembaca untuk staf/uji: hasil sama dengan yang kelak dipakai 2a-F/WA-2c. Ditolak → NOT_FOUND. */
export async function bacaVoyageTerotorisasi(ctx: TenantContext, contactId: unknown, voyageId: unknown): Promise<FaktaVoyage> {
  gerbangWa2(ctx)
  const c = idSah(contactId, 'contactId')
  const v = idSah(voyageId, 'voyageId')
  const hasil = await forTenant(ctx).$transaction((tx) => bacaFaktaDalamTx(tx as unknown as TxMentah, ctx.tenantId, c, v, new Date()))
  if (!hasil) throw notFound('Voyage') // tak membedakan "tidak ada" vs "tak berhak" (tanpa kebocoran keberadaan)
  return hasil
}

/** Daftar akses kontak (ID & kategori saja) untuk staf berwenang. */
export async function cekAksesKontak(ctx: TenantContext, contactId: unknown) {
  gerbangWa2(ctx)
  const c = idSah(contactId, 'contactId')
  return forTenant(ctx).$transaction((tx) => resolusiAkses(tx as unknown as TxMentah, ctx.tenantId, c, new Date()))
}
