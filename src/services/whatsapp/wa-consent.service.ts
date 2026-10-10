// Service consent proaktif — WA-2a Step 2C (desain historis 2a-D "consent"; keputusan owner K-07, C-1).
//
// • Consent HANYA mengatur pesan PROAKTIF (tujuan PROACTIVE_OPERATIONAL_UPDATE). Consent BUKAN
//   otorisasi data: tidak membuka akses voyage/kapal/ETA apa pun (itu resolver Step 2a-E).
// • Setiap perubahan = satu WaConsentEvent (append-only, ditegakkan DB) + WaConsentState
//   version+1, dalam SATU transaksi dengan baris state terkunci FOR UPDATE.
// • OPT_OUT selalu diterima dan LANGSUNG menahan pesan proaktif yang masih bisa dibatalkan
//   (DRAFT/PREVIEWED/PENDING_APPROVAL/APPROVED → NEEDS_REVIEW) dalam transaksi yang sama.
// • Re-opt-in setelah OPT_OUT wajib bukti eksplisit dari pelanggan (kanal ≠ STAFF_RECORDED).
// • Idempoten: opt-in saat sudah OPT_IN / opt-out saat sudah OPT_OUT tidak menulis event baru.
// • Di Step 2C pencatat = STAF (actorType STAFF). STOP otomatis dari pesan masuk = WA-2c.

import type { TenantContext } from '../context'
import { notFound, validation } from '../errors'
import { forTenant } from '../tenant-db'
import { catatAudit } from '../finance/audit'
import { gerbangWa2 } from './wa2-gate'
import { denganUlangWa2 } from './wa-db-error'
import { kunciConsent, kunciKontak, tahanPesanTertunda, type TxMentah } from './wa-lock'
import { sidikBukti } from './wa-contact.service'
import { KANAL_CONSENT, KANAL_REOPTIN_SAH, TUJUAN_CONSENT } from './wa2-policy'

const TABEL = 'WaConsentState'
const TUJUAN = TUJUAN_CONSENT[0]
const galat = (pesan: string, code: string) => validation(pesan, { code })

const idSah = (v: unknown): string => {
  if (typeof v !== 'string' || v.trim() === '' || v.length > 64) throw validation('contactId tidak sah.')
  return v
}
const teksSah = (v: unknown, min: number, maks: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length >= min && t.length <= maks ? t : null
}
/** Waktu kejadian consent: bawaan sekarang; tidak boleh di masa depan (toleransi 5 menit). */
function waktuSah(v: unknown, sekarang: Date): Date {
  if (v === undefined || v === null) return sekarang
  const d = v instanceof Date ? v : typeof v === 'string' ? new Date(v) : null
  if (!d || Number.isNaN(d.getTime()) || d.getTime() > sekarang.getTime() + 5 * 60_000) throw validation('Waktu kejadian consent tidak sah.')
  return d
}

export type InputConsent = { kanal: unknown; bukti: unknown; waktu?: unknown }
export type HasilConsent = {
  hasil: 'DICATAT' | 'SUDAH_OPT_IN' | 'SUDAH_OPT_OUT'
  status: 'OPT_IN' | 'OPT_OUT'
  version: number
  eventId: string | null
  pesanDitahan: string[]
}

export async function catatOptIn(ctx: TenantContext, contactId: unknown, input: InputConsent): Promise<HasilConsent> {
  gerbangWa2(ctx)
  const id = idSah(contactId)
  const kanal = input?.kanal
  if (typeof kanal !== 'string' || !(KANAL_CONSENT as readonly string[]).includes(kanal)) throw galat('Kanal consent tidak sah.', 'CONSENT_EVIDENCE_REQUIRED')
  const bukti = teksSah(input?.bukti, 10, 2000)
  if (!bukti) throw galat('Bukti opt-in wajib (10–2000 karakter).', 'CONSENT_EVIDENCE_REQUIRED')
  return denganUlangWa2(() =>
    forTenant(ctx).$transaction(async (tx) => {
      const sekarang = new Date()
      const waktu = waktuSah(input?.waktu, sekarang)
      const k = await kunciKontak(tx as unknown as TxMentah, ctx.tenantId, id, 'SHARE')
      if (!k) throw notFound('Kontak')
      if (k.status !== 'ACTIVE') throw galat('Kontak tidak aktif.', 'CONTACT_INACTIVE')
      const s = await kunciConsent(tx as unknown as TxMentah, ctx.tenantId, id, TUJUAN)
      if (s.status === 'OPT_IN') return { hasil: 'SUDAH_OPT_IN' as const, status: 'OPT_IN' as const, version: s.version, eventId: null, pesanDitahan: [] }
      if (s.status === 'OPT_OUT' && !(KANAL_REOPTIN_SAH as readonly string[]).includes(kanal)) {
        throw galat('Opt-in ulang setelah STOP wajib bukti eksplisit dari pelanggan (WhatsApp/email/formulir/kontrak), bukan catatan staf saja.', 'CONSENT_REOPTIN_EVIDENCE_REQUIRED')
      }
      const ev = await tx.waConsentEvent.create({
        data: { tenantId: ctx.tenantId, contactId: id, purpose: TUJUAN, action: 'OPT_IN', channel: kanal, evidence: bukti, actorType: 'STAFF', actorUserId: ctx.userId, occurredAt: waktu },
        select: { id: true },
      })
      const n = await tx.waConsentState.updateMany({ where: { id: s.id, version: s.version }, data: { status: 'OPT_IN', lastEventId: ev.id, version: { increment: 1 } } })
      if (n.count !== 1) throw new Error('WA2C_CONSENT_VERSION_LOST') // mustahil di bawah FOR UPDATE — gagal keras
      await catatAudit(ctx, { tableName: TABEL, recordId: s.id, action: 'UPDATE', oldValue: { status: s.status, version: s.version }, newValue: { peristiwa: 'WA2_CONSENT_OPT_IN', contactId: id, kanal, eventId: ev.id, sidikBukti: sidikBukti(bukti), reOptIn: s.status === 'OPT_OUT' } }, {}, tx)
      return { hasil: 'DICATAT' as const, status: 'OPT_IN' as const, version: s.version + 1, eventId: ev.id, pesanDitahan: [] }
    }),
  )
}

export async function catatOptOut(ctx: TenantContext, contactId: unknown, input: InputConsent): Promise<HasilConsent> {
  gerbangWa2(ctx)
  const id = idSah(contactId)
  const kanal = input?.kanal
  if (typeof kanal !== 'string' || !(KANAL_CONSENT as readonly string[]).includes(kanal)) throw galat('Kanal opt-out tidak sah.', 'CONSENT_EVIDENCE_REQUIRED')
  // Opt-out SELALU diterima; bukti boleh singkat (pelanggan tak wajib menjelaskan alasan berhenti).
  const bukti = teksSah(input?.bukti, 1, 2000) ?? 'Opt-out dicatat staf.'
  return denganUlangWa2(() =>
    forTenant(ctx).$transaction(async (tx) => {
      const sekarang = new Date()
      const waktu = waktuSah(input?.waktu, sekarang)
      // Kontak INACTIVE pun tetap boleh dicatat opt-out (lebih aman, tidak pernah ditolak).
      const k = await kunciKontak(tx as unknown as TxMentah, ctx.tenantId, id, 'SHARE')
      if (!k) throw notFound('Kontak')
      const s = await kunciConsent(tx as unknown as TxMentah, ctx.tenantId, id, TUJUAN)
      if (s.status === 'OPT_OUT') {
        // Idempoten tanpa event baru — tetap tahan pesan tertunda sebagai pertahanan berlapis.
        const pesanDitahan = await tahanPesanTertunda(tx as unknown as TxMentah, ctx.tenantId, id, 'CONSENT_NOT_GRANTED')
        return { hasil: 'SUDAH_OPT_OUT' as const, status: 'OPT_OUT' as const, version: s.version, eventId: null, pesanDitahan }
      }
      const ev = await tx.waConsentEvent.create({
        data: { tenantId: ctx.tenantId, contactId: id, purpose: TUJUAN, action: 'OPT_OUT', channel: kanal, evidence: bukti, actorType: 'STAFF', actorUserId: ctx.userId, occurredAt: waktu },
        select: { id: true },
      })
      const n = await tx.waConsentState.updateMany({ where: { id: s.id, version: s.version }, data: { status: 'OPT_OUT', lastEventId: ev.id, version: { increment: 1 } } })
      if (n.count !== 1) throw new Error('WA2C_CONSENT_VERSION_LOST')
      const pesanDitahan = await tahanPesanTertunda(tx as unknown as TxMentah, ctx.tenantId, id, 'CONSENT_NOT_GRANTED')
      await catatAudit(ctx, { tableName: TABEL, recordId: s.id, action: 'UPDATE', oldValue: { status: s.status, version: s.version }, newValue: { peristiwa: 'WA2_CONSENT_OPT_OUT', contactId: id, kanal, eventId: ev.id, sidikBukti: sidikBukti(bukti), pesanDitahan } }, {}, tx)
      return { hasil: 'DICATAT' as const, status: 'OPT_OUT' as const, version: s.version + 1, eventId: ev.id, pesanDitahan }
    }),
  )
}

export type StatusConsentKontak = { status: 'NONE' | 'OPT_IN' | 'OPT_OUT'; version: number }

/** Status consent proaktif. BUKAN keputusan akses data — hanya izin pesan proaktif. */
export async function bacaStatusConsent(ctx: TenantContext, contactId: unknown): Promise<StatusConsentKontak> {
  gerbangWa2(ctx)
  const id = idSah(contactId)
  const db = forTenant(ctx)
  if (!(await db.waContact.findFirst({ where: { id }, select: { id: true } }))) throw notFound('Kontak')
  const s = await db.waConsentState.findFirst({ where: { contactId: id, purpose: TUJUAN }, select: { status: true, version: true } })
  return { status: (s?.status ?? 'NONE') as StatusConsentKontak['status'], version: s?.version ?? 0 }
}

/** Riwayat bukti consent (append-only) untuk staf berwenang. */
export async function riwayatConsent(ctx: TenantContext, contactId: unknown) {
  gerbangWa2(ctx)
  const id = idSah(contactId)
  const db = forTenant(ctx)
  if (!(await db.waContact.findFirst({ where: { id }, select: { id: true } }))) throw notFound('Kontak')
  return db.waConsentEvent.findMany({
    where: { contactId: id, purpose: TUJUAN },
    select: { id: true, action: true, channel: true, evidence: true, actorType: true, actorUserId: true, occurredAt: true, createdAt: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: 500,
  })
}
