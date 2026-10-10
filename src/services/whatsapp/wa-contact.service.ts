// Service kontak WhatsApp — WA-2a Step 2C (desain historis 2a-C "kontak"; keputusan owner C-1..C-3).
//
// • Registrasi kontak milik TEPAT SATU pihak (Customer aktif / Principal) di tenant pemanggil.
// • Satu nomor AKTIF = satu kontak per tenant (DB-3, unik di DB). PIC multi-pihak → ditolak
//   CONTACT_NUMBER_IN_USE; TIDAK ada penautan/akses otomatis berdasarkan kesamaan nomor.
// • Verifikasi: satu staf berwenang + metode + bukti + masa berlaku ≤ 12 bulan (C-2, C-3).
//   Kedaluwarsa dibaca sebagai TIDAK terverifikasi (gagal tertutup), tanpa job terjadwal.
// • Cabut verifikasi / nonaktifkan: satu transaksi — grant ACTIVE dicabut, pesan tertunda ditahan.
// • TIDAK ADA fungsi di sini yang membaca/mengembalikan data voyage, kapal, ETA/ETD, atau pihak lain.
//   Verifikasi BUKAN izin akses; akses data hanya lewat resolver Step 2a-E.
// • Nomor & bukti tidak pernah masuk AuditLog/galat dalam bentuk utuh (samaran / sidik saja).

import { createHash } from 'node:crypto'
import type { TenantContext } from '../context'
import { conflict, notFound, validation } from '../errors'
import { forTenant } from '../tenant-db'
import { catatAudit } from '../finance/audit'
import { gerbangWa2 } from './wa2-gate'
import { normalisasiE164, samarkanNomor } from './wa-phone'
import { adalahUnikNomorAktif, denganUlangWa2 } from './wa-db-error'
import { cabutGrantAktif, kunciKontak, tahanPesanTertunda, type TxMentah } from './wa-lock'
import {
  ALASAN_CABUT_VERIFIKASI,
  BAHASA_KONTAK,
  JENIS_PIHAK_KONTAK,
  MAKS_BULAN_VERIFIKASI,
  METODE_VERIFIKASI_KONTAK,
} from './wa2-policy'

type Tx = Parameters<Parameters<ReturnType<typeof forTenant>['$transaction']>[0]>[0]
const TABEL = 'WaContact'

const galat = (pesan: string, code: string) => validation(pesan, { code })
export const sidikBukti = (bukti: string): string => createHash('sha256').update(bukti, 'utf8').digest('hex').slice(0, 16)

const teksSah = (v: unknown, min: number, maks: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length >= min && t.length <= maks ? t : null
}
const idSah = (v: unknown, nama: string): string => {
  if (typeof v !== 'string' || v.trim() === '' || v.length > 64) throw validation(`${nama} tidak sah.`)
  return v
}

/** Batas atas masa verifikasi: tanggal kalender + 12 bulan (C-2). */
export function batasMasaVerifikasi(sekarang: Date): Date {
  const d = new Date(sekarang.getTime())
  d.setUTCMonth(d.getUTCMonth() + MAKS_BULAN_VERIFIKASI)
  return d
}

export type StatusVerifikasiEfektif = 'VERIFIED' | 'EXPIRED' | 'UNVERIFIED'
/** Gagal tertutup: hanya VERIFIED dengan kedaluwarsa di MASA DEPAN yang dianggap terverifikasi. */
export function statusVerifikasiEfektif(k: { verificationStatus: string; verificationExpiresAt: Date | null }, sekarang: Date): StatusVerifikasiEfektif {
  if (k.verificationStatus !== 'VERIFIED') return 'UNVERIFIED'
  if (!(k.verificationExpiresAt instanceof Date) || Number.isNaN(k.verificationExpiresAt.getTime())) return 'EXPIRED'
  return k.verificationExpiresAt.getTime() > sekarang.getTime() ? 'VERIFIED' : 'EXPIRED'
}

async function pihakLayak(tx: Tx, partyType: string, partyId: string): Promise<boolean> {
  if (partyType === 'CUSTOMER') {
    const c = await tx.customer.findFirst({ where: { id: partyId, deletedAt: null }, select: { isActive: true } })
    return !!c && c.isActive === true
  }
  if (partyType === 'PRINCIPAL') return !!(await tx.principal.findFirst({ where: { id: partyId }, select: { id: true } }))
  return false
}

// ================================================================== registrasi

export type InputKontak = { partyType: unknown; partyId: unknown; nomor: unknown; displayName: unknown; language: unknown }
export type HasilBuatKontak = { hasil: 'DIBUAT' | 'SUDAH_ADA'; contactId: string; nomorTersamar: string }

export async function buatKontak(ctx: TenantContext, input: InputKontak): Promise<HasilBuatKontak> {
  gerbangWa2(ctx)
  const partyType = input?.partyType
  if (typeof partyType !== 'string' || !(JENIS_PIHAK_KONTAK as readonly string[]).includes(partyType)) throw galat('Jenis pihak tidak sah.', 'PARTY_NOT_ELIGIBLE')
  const partyId = idSah(input?.partyId, 'partyId')
  const nomor = normalisasiE164(input?.nomor)
  if (!nomor.ok) throw galat('Nomor WhatsApp tidak sah (format internasional/E.164).', 'PHONE_INVALID')
  const displayName = teksSah(input?.displayName, 1, 120)
  if (!displayName) throw validation('Nama PIC wajib (1–120 karakter).')
  const language = input?.language
  if (typeof language !== 'string' || !(BAHASA_KONTAK as readonly string[]).includes(language)) throw validation('Bahasa tidak sah (ID/EN).')

  const jalankan = () =>
    forTenant(ctx).$transaction(async (tx): Promise<HasilBuatKontak> => {
      if (!(await pihakLayak(tx, partyType, partyId))) throw galat('Pihak tidak ditemukan atau tidak aktif di tenant ini.', 'PARTY_NOT_ELIGIBLE')
      const ada = await tx.waContact.findFirst({ where: { activeE164Key: nomor.e164 }, select: { id: true, partyType: true, customerId: true, principalId: true } })
      if (ada) {
        const sama = ada.partyType === partyType && (ada.customerId ?? ada.principalId) === partyId
        if (sama) return { hasil: 'SUDAH_ADA', contactId: ada.id, nomorTersamar: samarkanNomor(nomor.e164) }
        // DB-3: PIC multi-pihak ditangani staf. Hanya JENIS pihak lain yang disebut.
        throw conflict('Nomor WhatsApp ini sudah aktif untuk pihak lain di tenant ini. Tangani manual; tidak ada penautan otomatis.', { code: 'CONTACT_NUMBER_IN_USE', jenisPihakLain: ada.partyType })
      }
      const k = await tx.waContact.create({
        data: {
          tenantId: ctx.tenantId,
          partyType,
          customerId: partyType === 'CUSTOMER' ? partyId : null,
          principalId: partyType === 'PRINCIPAL' ? partyId : null,
          e164: nomor.e164,
          activeE164Key: nomor.e164,
          displayName,
          language,
          createdByUserId: ctx.userId,
        },
        select: { id: true },
      })
      await catatAudit(ctx, { tableName: TABEL, recordId: k.id, action: 'CREATE', newValue: { peristiwa: 'WA2_KONTAK_DIBUAT', partyType, partyId, nomor: samarkanNomor(nomor.e164), verificationStatus: 'UNVERIFIED' } }, {}, tx)
      return { hasil: 'DIBUAT', contactId: k.id, nomorTersamar: samarkanNomor(nomor.e164) }
    })
  try {
    return await denganUlangWa2(jalankan)
  } catch (e) {
    // Balapan pembuatan nomor sama: ulang SEKALI — pihak sama → SUDAH_ADA, pihak lain → IN_USE.
    if (adalahUnikNomorAktif(e) || (e as { details?: { code?: string } })?.details?.code === 'CONTACT_NUMBER_IN_USE') {
      return denganUlangWa2(jalankan)
    }
    throw e
  }
}

// ================================================================== verifikasi

export type InputVerifikasi = { metode: unknown; bukti: unknown; berlakuSampai: unknown }

export async function verifikasiKontak(ctx: TenantContext, contactId: unknown, input: InputVerifikasi): Promise<{ hasil: 'TERVERIFIKASI'; contactId: string; berlakuSampai: string }> {
  gerbangWa2(ctx)
  const id = idSah(contactId, 'contactId')
  const metode = input?.metode
  if (typeof metode !== 'string' || !(METODE_VERIFIKASI_KONTAK as readonly string[]).includes(metode)) throw galat('Metode verifikasi tidak sah.', 'VERIFICATION_EVIDENCE_REQUIRED')
  const bukti = teksSah(input?.bukti, 10, 2000)
  if (!bukti) throw galat('Bukti verifikasi identitas & hubungan PIC dengan pihaknya wajib (10–2000 karakter).', 'VERIFICATION_EVIDENCE_REQUIRED')
  const berlaku = input?.berlakuSampai instanceof Date ? input.berlakuSampai : typeof input?.berlakuSampai === 'string' ? new Date(input.berlakuSampai) : null
  return denganUlangWa2(() =>
    forTenant(ctx).$transaction(async (tx) => {
      const sekarang = new Date()
      if (!berlaku || Number.isNaN(berlaku.getTime()) || berlaku.getTime() <= sekarang.getTime() || berlaku.getTime() > batasMasaVerifikasi(sekarang).getTime()) {
        throw galat(`Masa berlaku verifikasi wajib di masa depan dan maksimum ${MAKS_BULAN_VERIFIKASI} bulan.`, 'VERIFICATION_EXPIRY_INVALID')
      }
      const k = await kunciKontak(tx as unknown as TxMentah, ctx.tenantId, id, 'UPDATE')
      if (!k) throw notFound('Kontak')
      if (k.status !== 'ACTIVE') throw galat('Kontak tidak aktif; buat kontak baru.', 'CONTACT_INACTIVE')
      if (!(await pihakLayak(tx, k.partyType, (k.customerId ?? k.principalId) as string))) throw galat('Pihak kontak tidak lagi aktif.', 'PARTY_NOT_ELIGIBLE')
      const n = await tx.waContact.updateMany({
        where: { id, version: k.version, status: 'ACTIVE' },
        data: { verificationStatus: 'VERIFIED', verifiedAt: sekarang, verifiedByUserId: ctx.userId, verificationMethod: metode, verificationEvidence: bukti, verificationExpiresAt: berlaku, version: { increment: 1 } },
      })
      if (n.count !== 1) throw conflict('Kontak berubah bersamaan. Coba lagi.', { code: 'CONCURRENCY_CONFLICT' })
      await catatAudit(ctx, { tableName: TABEL, recordId: id, action: 'UPDATE', oldValue: { verificationStatus: k.verificationStatus }, newValue: { peristiwa: 'WA2_KONTAK_DIVERIFIKASI', metode, sidikBukti: sidikBukti(bukti), berlakuSampai: berlaku.toISOString() } }, {}, tx)
      return { hasil: 'TERVERIFIKASI' as const, contactId: id, berlakuSampai: berlaku.toISOString() }
    }),
  )
}

export type HasilCabut = { hasil: 'DICABUT' | 'SUDAH_TIDAK_BERLAKU'; grantDicabut: string[]; pesanDitahan: string[] }

/** C-2 — batalkan verifikasi lebih cepat. Selalu mencabut grant ACTIVE & menahan pesan tertunda. */
export async function cabutVerifikasi(ctx: TenantContext, contactId: unknown, input: { alasan: unknown; catatan: unknown }): Promise<HasilCabut> {
  gerbangWa2(ctx)
  const id = idSah(contactId, 'contactId')
  const alasan = input?.alasan
  if (typeof alasan !== 'string' || !(ALASAN_CABUT_VERIFIKASI as readonly string[]).includes(alasan)) throw validation('Alasan pencabutan verifikasi tidak sah.')
  const catatan = teksSah(input?.catatan, 5, 1000)
  if (!catatan) throw validation('Catatan pencabutan wajib (5–1000 karakter).')
  return denganUlangWa2(() =>
    forTenant(ctx).$transaction(async (tx) => {
      const k = await kunciKontak(tx as unknown as TxMentah, ctx.tenantId, id, 'UPDATE')
      if (!k) throw notFound('Kontak')
      const masihTerverifikasi = k.verificationStatus === 'VERIFIED'
      if (masihTerverifikasi) {
        const n = await tx.waContact.updateMany({
          where: { id, version: k.version },
          data: { verificationStatus: 'UNVERIFIED', verificationExpiresAt: null, version: { increment: 1 } },
        })
        if (n.count !== 1) throw conflict('Kontak berubah bersamaan. Coba lagi.', { code: 'CONCURRENCY_CONFLICT' })
      }
      const grantDicabut = await cabutGrantAktif(tx as unknown as TxMentah, ctx.tenantId, id, ctx.userId, `VERIFICATION_REVOKED:${alasan}`)
      const pesanDitahan = await tahanPesanTertunda(tx as unknown as TxMentah, ctx.tenantId, id, 'CONTACT_INELIGIBLE')
      await catatAudit(ctx, { tableName: TABEL, recordId: id, action: 'UPDATE', oldValue: { verificationStatus: k.verificationStatus }, newValue: { peristiwa: 'WA2_VERIFIKASI_DICABUT', alasan, sidikCatatan: sidikBukti(catatan), grantDicabut, pesanDitahan } }, {}, tx)
      return { hasil: masihTerverifikasi || grantDicabut.length || pesanDitahan.length ? ('DICABUT' as const) : ('SUDAH_TIDAK_BERLAKU' as const), grantDicabut, pesanDitahan }
    }),
  )
}

// ================================================================== nonaktifkan

export async function nonaktifkanKontak(ctx: TenantContext, contactId: unknown, input: { alasan: unknown }): Promise<HasilCabut> {
  gerbangWa2(ctx)
  const id = idSah(contactId, 'contactId')
  const alasan = teksSah(input?.alasan, 5, 500)
  if (!alasan) throw validation('Alasan penonaktifan wajib (5–500 karakter).')
  return denganUlangWa2(() =>
    forTenant(ctx).$transaction(async (tx) => {
      const k = await kunciKontak(tx as unknown as TxMentah, ctx.tenantId, id, 'UPDATE')
      if (!k) throw notFound('Kontak')
      if (k.status === 'INACTIVE') return { hasil: 'SUDAH_TIDAK_BERLAKU' as const, grantDicabut: [], pesanDitahan: [] }
      const n = await tx.waContact.updateMany({
        where: { id, version: k.version, status: 'ACTIVE' },
        // Verifikasi ikut gugur: kontak INACTIVE tidak pernah tercatat VERIFIED (invarian R3).
        data: { status: 'INACTIVE', activeE164Key: null, verificationStatus: 'UNVERIFIED', verificationExpiresAt: null, deactivatedAt: new Date(), deactivatedByUserId: ctx.userId, deactivationReason: alasan, version: { increment: 1 } },
      })
      if (n.count !== 1) throw conflict('Kontak berubah bersamaan. Coba lagi.', { code: 'CONCURRENCY_CONFLICT' })
      const grantDicabut = await cabutGrantAktif(tx as unknown as TxMentah, ctx.tenantId, id, ctx.userId, 'CONTACT_DEACTIVATED')
      const pesanDitahan = await tahanPesanTertunda(tx as unknown as TxMentah, ctx.tenantId, id, 'CONTACT_INELIGIBLE')
      await catatAudit(ctx, { tableName: TABEL, recordId: id, action: 'UPDATE', oldValue: { status: 'ACTIVE' }, newValue: { peristiwa: 'WA2_KONTAK_DINONAKTIFKAN', nomor: samarkanNomor(k.e164), sidikAlasan: sidikBukti(alasan), grantDicabut, pesanDitahan } }, {}, tx)
      return { hasil: 'DICABUT' as const, grantDicabut, pesanDitahan }
    }),
  )
}

// ================================================================== baca (tanpa data voyage)

export type RingkasanKontak = {
  id: string
  partyType: string
  partyId: string
  nomorTersamar: string
  displayName: string
  language: string
  status: string
  verifikasi: StatusVerifikasiEfektif
  verificationExpiresAt: string | null
}

const PILIH = { id: true, partyType: true, customerId: true, principalId: true, e164: true, displayName: true, language: true, status: true, verificationStatus: true, verificationExpiresAt: true } as const

function ringkas(k: { id: string; partyType: string; customerId: string | null; principalId: string | null; e164: string; displayName: string; language: string; status: string; verificationStatus: string; verificationExpiresAt: Date | null }, sekarang: Date): RingkasanKontak {
  return {
    id: k.id,
    partyType: k.partyType,
    partyId: (k.customerId ?? k.principalId) as string,
    nomorTersamar: samarkanNomor(k.e164),
    displayName: k.displayName,
    language: k.language,
    status: k.status,
    verifikasi: statusVerifikasiEfektif(k, sekarang),
    verificationExpiresAt: k.verificationExpiresAt?.toISOString() ?? null,
  }
}

/** Daftar kontak satu pihak — nomor SELALU tersamar. Tidak memuat data voyage/kapal. */
export async function daftarKontakPihak(ctx: TenantContext, partyType: unknown, partyId: unknown): Promise<RingkasanKontak[]> {
  gerbangWa2(ctx)
  if (typeof partyType !== 'string' || !(JENIS_PIHAK_KONTAK as readonly string[]).includes(partyType)) throw validation('Jenis pihak tidak sah.')
  const pid = idSah(partyId, 'partyId')
  const rows = await forTenant(ctx).waContact.findMany({
    where: partyType === 'CUSTOMER' ? { partyType, customerId: pid } : { partyType, principalId: pid },
    select: PILIH,
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  const sekarang = new Date()
  return rows.map((r) => ringkas(r, sekarang))
}

/** Detail satu kontak untuk staf berwenang. Nomor utuh hanya di sini (bukan log/daftar). */
export async function bacaKontak(ctx: TenantContext, contactId: unknown): Promise<RingkasanKontak & { e164: string }> {
  gerbangWa2(ctx)
  const id = idSah(contactId, 'contactId')
  const k = await forTenant(ctx).waContact.findFirst({ where: { id }, select: PILIH })
  if (!k) throw notFound('Kontak')
  return { ...ringkas(k, new Date()), e164: k.e164 }
}
