// Draft & preview pesan klien WA-2a Step 2F (F3d). Berhenti SEBELUM approval (F4) — tanpa Send, provider,
// API/UI, maupun LLM. Keputusan owner: D1–D3 (Solusi A), D6-A/B, D7, D8, D-GRANT, kebijakan draft F3.
//
// Draft (satu transaksi, urutan kunci WaContact → WaConsentState → grant/Voyage (resolver) → bukti freshness →
// CommunicationCandidate (Prepare WA-1 via adapter) → WaClientMessage):
//   1. gerbang WA-2; sinyal milik tenant; keluarga pilot (klasifikasi murni WA-1)       — SEBELUM Prepare
//   2. kontak ACTIVE + VERIFIED; bahasa = WaContact.language                            — SEBELUM Prepare
//   3. consent OPT_IN (kunci FOR UPDATE; versi disnapshot)                                — SEBELUM Prepare
//   4. resolver 2E: voyage sinyal ∈ akses + kategori wajib; principal → grant snapshot dipilih
//      deterministik (pilihGrantUntukPesan) dari grant yang diloloskan resolver               — SEBELUM Prepare
//   5. Prepare WA-1 + revalidasi sumber; freshness D6 dari bukti DB terkunci; NYATA + sumber + freshness
//      (D8). Gagal → transaksi DIBATALKAN UTUH: tulisan Prepare pada kandidat ikut batal — jalur WA-2 tidak
//      pernah meninggalkan efek pada kandidat bersama bila draft ditolak, dan tidak pernah memblokirnya.
//   6. render template F2; snapshot immutable + sidik (domain WA2_SNAPSHOT); revisi identik → SUDAH_ADA;
//      revisi lain → yang lama CANCELED (REVISION_SUPERSEDED) + yang baru DRAFT, atomik; audit di tx yang sama.
// Preview: sidik sodoran = sidik tersimpan = sidik dihitung ulang dari kolom; kontak/consent (versi sama)/akses/
// grant snapshot/kandidat/sumber/freshness diperiksa ULANG. Akses/consent berubah → NEEDS_REVIEW; sumber/kandidat
// berubah → BLOCKED (pesan saja, kandidat tidak disentuh); freshness tak lolos → ditolak tanpa ubah state.

import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import type { TenantContext } from '../context'
import { conflict, notFound, validation } from '../errors'
import { forTenant } from '../tenant-db'
import { catatAudit } from '../finance/audit'
import { kunciTanggal } from '../master/voyage-dates'
import { gerbangWa2 } from './wa2-gate'
import { denganUlangWa2 } from './wa-db-error'
import { kunciConsent, kunciKontak, type TxMentah } from './wa-lock'
import { statusVerifikasiEfektif } from './wa-contact.service'
import { resolusiAkses } from './wa-access-resolver'
import {
  bisaDiulangWa1,
  jsonKanonikKomunikasi,
  klasifikasiSinyal,
  kunciCandidate,
  muatCandidateDalamTx,
  revalidasiCandidate,
  siapkanCandidateDalamTx,
  teksKunciCandidate,
  type CandidateBaris,
  type HasilRevalidasiCandidate,
  type SinyalMasuk,
} from './wa1-bridge'
import { nilaiFreshnessJadwal, nilaiFreshnessMilestone, type VerdictFreshnessD6 } from './wa-freshness'
import { kategoriWajibUntuk, pilihGrantUntukPesan, syaratDataApproval, transisiPesanKlienSah } from './wa-message-policy'
import { GalatTemplateKlien, renderPesanKlien, type BahasaPesanKlien, type KeluargaTemplateKlien } from './wa-template'
import { MODE_PESAN_KLIEN, TUJUAN_CONSENT_PESAN_KLIEN, type KodeAlasanWa2f3 } from './wa2-policy'

const TABEL = 'WaClientMessage'
const MAKS_PERCOBAAN = 4
const tolak = (alasan: KodeAlasanWa2f3 | string, rinci: Record<string, unknown> = {}) => validation('Draft pesan klien ditolak.', { code: alasan, ...rinci })
const idSah = (v: unknown, nama: string): string => {
  if (typeof v !== 'string' || v.trim() === '' || v.length > 64) throw validation(`${nama} tidak sah.`)
  return v
}

/** Pengulangan transaksi: konflik WA-2 (40001/P2034) + konflik WA-1 (KonflikKonkurensi, P2002) dari Prepare/kunci kandidat. */
async function denganUlangPesan<T>(fn: () => Promise<T>): Promise<T> {
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

// ================================================================ pemeriksaan bersama (draft & preview)

type KontakLayak = { id: string; partyType: 'CUSTOMER' | 'PRINCIPAL'; partyId: string; e164: string; bahasa: BahasaPesanKlien }

async function periksaKontak(tx: TxMentah, ctx: TenantContext, contactId: string, sekarang: Date): Promise<{ ok: true; k: KontakLayak } | { ok: false; alasan: KodeAlasanWa2f3 }> {
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
async function periksaAkses(tx: TxMentah, ctx: TenantContext, k: KontakLayak, voyageId: string, kategori: string, sekarang: Date, grantSnapshot?: string | null): Promise<HasilAksesPesan> {
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
async function nilaiFreshnessDb(tx: TxMentah, ctx: TenantContext, c: CandidateBaris, fakta: Fakta, sekarang: Date): Promise<VerdictFreshnessD6> {
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
  const ev = await tx.$queryRaw<{ id: string; voyageId: string; eventCode: string; occurredAt: Date; source: string; deletedAt: Date | null; portCallId: string | null; recordedByUserId: string }[]>(Prisma.sql`
    SELECT "id", "voyageId", "eventCode", "occurredAt", "source", "deletedAt", "portCallId", "recordedByUserId" FROM "VoyageEvent"
    WHERE "id" = ${c.sourceRef} AND "tenantId" = ${ctx.tenantId} AND "voyageId" = ${c.voyageId} FOR SHARE`)
  const lain = await tx.$queryRaw<{ id: string; eventCode: string; portCallId: string | null }[]>(Prisma.sql`
    SELECT "id", "eventCode", "portCallId" FROM "VoyageEvent"
    WHERE "tenantId" = ${ctx.tenantId} AND "voyageId" = ${c.voyageId} AND "eventCode" = ${fakta.keluarga} AND "deletedAt" IS NULL AND "id" <> ${c.sourceRef}`)
  return nilaiFreshnessMilestone({ keluarga: fakta.keluarga, peristiwa: ev[0] ?? null, peristiwaAktifLain: lain, sekarang })
}

async function asalDataVoyage(tx: TxMentah, ctx: TenantContext, voyageId: string): Promise<string | null> {
  const r = await tx.$queryRaw<{ dataOrigin: string | null }[]>(Prisma.sql`SELECT "dataOrigin" FROM "Voyage" WHERE "id" = ${voyageId} AND "tenantId" = ${ctx.tenantId}`)
  return r[0]?.dataOrigin ?? null
}

// ================================================================ snapshot

type IsiSnapshot = {
  candidateId: string
  logicalMessageKey: string
  contactId: string
  recipientE164Snapshot: string
  partyTypeSnapshot: string
  partyIdSnapshot: string
  grantIdSnapshot: string | null
  consentStateVersion: number
  language: string
  templateId: string
  templateVersion: number
  body: string
  fields: unknown
  sourceFingerprint: string
  freshnessVerdict: unknown
  mode: string
}

/** Bagian verdict yang stabil (tanpa jam evaluasi) — dasar sidik & idempotensi revisi identik. */
const verdictStabil = (v: unknown) => {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  return { versi: o.versi ?? null, keluarga: o.keluarga ?? null, aturan: o.aturan ?? null, maksJam: o.maksJam ?? null, status: o.status ?? null, bukti: o.bukti ?? null }
}

export function sidikSnapshotKlien(s: IsiSnapshot): string {
  const isi = { ...s, freshnessVerdict: verdictStabil(s.freshnessVerdict) }
  return createHash('sha256').update(`WA2_SNAPSHOT\n${jsonKanonikKomunikasi(isi)}`, 'utf8').digest('hex')
}

const PILIH_PESAN = {
  id: true, candidateId: true, revision: true, contactId: true, recipientE164Snapshot: true, partyTypeSnapshot: true, partyIdSnapshot: true,
  grantIdSnapshot: true, consentStateVersion: true, logicalMessageKey: true, activeKey: true, language: true, templateId: true, templateVersion: true,
  body: true, fields: true, sourceFingerprint: true, snapshotFingerprint: true, freshnessVerdict: true, mode: true, state: true, version: true,
  approvalRequestId: true, createdByUserId: true,
} as const

// ================================================================ draft

export type HasilDraftPesanKlien =
  | { hasil: 'DRAFT_DIBUAT'; messageId: string; candidateId: string; revision: number; snapshotFingerprint: string; revisiDigantikan: string | null }
  | { hasil: 'SUDAH_ADA'; messageId: string; candidateId: string; revision: number; snapshotFingerprint: string }

export async function buatDraftPesanKlien(ctx: TenantContext, input: { signalId: unknown; contactId: unknown }): Promise<HasilDraftPesanKlien> {
  gerbangWa2(ctx)
  const sid = idSah(input?.signalId, 'signalId')
  const cid = idSah(input?.contactId, 'contactId')
  return denganUlangPesan(() => forTenant(ctx).$transaction((tx) => draftDalamTx(ctx, tx, sid, cid)))
}

type TxTenant = Parameters<Parameters<ReturnType<typeof forTenant>['$transaction']>[0]>[0]

async function draftDalamTx(ctx: TenantContext, tx: TxTenant, sid: string, cid: string): Promise<HasilDraftPesanKlien> {
  const t = tx as unknown as TxMentah
  const sekarang = new Date()
  // 1. sinyal & keluarga — tanpa efek samping.
  const s = await tx.monitoringSignal.findFirst({ where: { id: sid }, select: { id: true, tenantId: true, voyageId: true, kind: true, sourceType: true, sourceRef: true, reviewState: true, after: true } })
  if (!s) throw notFound('Sinyal')
  const kls = klasifikasiSinyal(s as SinyalMasuk)
  if (!kls.ok) throw tolak('EVENT_NOT_ALLOWED', { sumber: kls.alasan })
  const keluarga = kls.nilai.keluarga as KeluargaTemplateKlien
  const kategori = kategoriWajibUntuk(keluarga)
  if (!kategori) throw tolak('EVENT_NOT_ALLOWED')
  // 2–4. kontak, consent, akses & grant — SEBELUM Prepare menyentuh kandidat.
  const pk = await periksaKontak(t, ctx, cid, sekarang)
  if (!pk.ok) throw tolak(pk.alasan)
  const consent = await kunciConsent(t, ctx.tenantId, cid, TUJUAN_CONSENT_PESAN_KLIEN)
  if (consent.status !== 'OPT_IN') throw tolak('CONSENT_NOT_GRANTED')
  const akses = await periksaAkses(t, ctx, pk.k, s.voyageId, kategori, sekarang)
  if (!akses.ok) throw tolak(akses.alasan)
  // 5. Prepare WA-1 (adapter) + revalidasi sumber + freshness D6 + syarat data D8. Gagal → rollback utuh.
  const p = await siapkanCandidateDalamTx(ctx, tx, sid)
  if (p.hasil !== 'SIAP') throw tolak('SOURCE_INVALID', { sumber: p.alasan })
  const c = await muatCandidateDalamTx(tx, p.candidateId)
  if (!c || c.voyageId !== s.voyageId || c.family !== keluarga) throw tolak('SOURCE_INVALID')
  if (c.state !== 'ACTIVE') throw tolak('CANDIDATE_BLOCKED')
  const rv = await revalidasiCandidate(tx, ctx, c)
  if (!rv.ok) throw tolak('SOURCE_INVALID', { sumber: rv.tolak.alasan })
  const freshness = await nilaiFreshnessDb(t, ctx, c, rv.fakta, sekarang)
  if (freshness.status !== 'LOLOS') throw tolak(freshness.alasan ?? 'FRESHNESS_EVIDENCE_MISSING')
  const data = syaratDataApproval({ dataOrigin: await asalDataVoyage(t, ctx, c.voyageId), sumberTervalidasi: true, freshness })
  if (!data.ok) throw tolak(data.alasan)
  // 6. render & snapshot.
  let pesan
  try {
    pesan = renderPesanKlien(
      'perubahan' in rv.fakta
        ? { keluarga, bahasa: pk.k.bahasa, vesselName: rv.fakta.vesselName, voyageNumber: rv.fakta.voyageNumber, portName: rv.fakta.portName, perubahan: rv.fakta.perubahan.map((x) => ({ medan: x.medan, lama: x.lama, baru: x.baru })) }
        : { keluarga, bahasa: pk.k.bahasa, vesselName: rv.fakta.vesselName, voyageNumber: rv.fakta.voyageNumber, portName: rv.fakta.portName, eventLocalTime: rv.fakta.eventLocalTime },
    )
  } catch (e) {
    if (e instanceof GalatTemplateKlien) throw tolak('TEMPLATE_DATA_INVALID', { template: e.code })
    throw e
  }
  const logicalMessageKey = `wa2|${teksKunciCandidate(rv.kunci)}|kontak:${cid}`
  const fields = {
    keluarga,
    kategoriWajib: kategori,
    vesselName: rv.fakta.vesselName,
    voyageNumber: rv.fakta.voyageNumber,
    portName: rv.fakta.portName,
    ...('perubahan' in rv.fakta ? { perubahan: rv.fakta.perubahan } : { occurredAt: rv.fakta.occurredAt, timezone: rv.fakta.timezone, eventLocalTime: rv.fakta.eventLocalTime }),
    grant: { dipilih: akses.grantIdSnapshot, kandidat: akses.kandidatGrant, aturan: akses.grantIdSnapshot ? 'VALID_UNTIL_TERLAMA_LALU_ID_TERKECIL' : null },
  }
  const snap: IsiSnapshot = {
    candidateId: c.id,
    logicalMessageKey,
    contactId: cid,
    recipientE164Snapshot: pk.k.e164,
    partyTypeSnapshot: pk.k.partyType,
    partyIdSnapshot: pk.k.partyId,
    grantIdSnapshot: akses.grantIdSnapshot,
    consentStateVersion: consent.version,
    language: pk.k.bahasa,
    templateId: pesan.templateId,
    templateVersion: pesan.templateVersion,
    body: pesan.body,
    fields,
    sourceFingerprint: rv.sourceFingerprint,
    freshnessVerdict: freshness,
    mode: MODE_PESAN_KLIEN,
  }
  const sidik = sidikSnapshotKlien(snap)
  // Kunci kandidat → serialisasi revisi lintas kontak pada kandidat yang sama.
  await kunciCandidate(tx, c)
  const aktif = await tx.waClientMessage.findFirst({ where: { activeKey: logicalMessageKey }, select: { id: true, state: true, version: true, revision: true, snapshotFingerprint: true, approvalRequestId: true } })
  if (aktif && aktif.snapshotFingerprint === sidik) return { hasil: 'SUDAH_ADA', messageId: aktif.id, candidateId: c.id, revision: aktif.revision, snapshotFingerprint: sidik }
  let digantikan: string | null = null
  if (aktif) {
    // F3 tidak membuat approval; revisi aktif ber-approval (F4) tak boleh diganti diam-diam di sini.
    if (aktif.approvalRequestId !== null || !transisiPesanKlienSah(aktif.state, 'CANCELED')) throw tolak('MESSAGE_STATE_INVALID', { state: aktif.state })
    const n = await tx.waClientMessage.updateMany({
      where: { id: aktif.id, version: aktif.version, activeKey: logicalMessageKey },
      data: { state: 'CANCELED', reasonCode: 'REVISION_SUPERSEDED', activeKey: null, finalizedAt: sekarang, version: { increment: 1 } },
    })
    if (n.count !== 1) throw conflict('Revisi berubah bersamaan. Coba lagi.', { code: 'CONCURRENCY_CONFLICT' })
    await catatAudit(ctx, { tableName: TABEL, recordId: aktif.id, action: 'UPDATE', oldValue: { state: aktif.state }, newValue: { peristiwa: 'WA2_REVISI_DIGANTIKAN', state: 'CANCELED', alasan: 'REVISION_SUPERSEDED' } }, {}, tx)
    digantikan = aktif.id
  }
  const maks = await tx.waClientMessage.aggregate({ where: { candidateId: c.id }, _max: { revision: true } })
  const revision = (maks._max.revision ?? 0) + 1
  const m = await tx.waClientMessage.create({
    data: {
      tenantId: ctx.tenantId,
      candidateId: c.id,
      revision,
      contactId: cid,
      recipientE164Snapshot: snap.recipientE164Snapshot,
      partyTypeSnapshot: snap.partyTypeSnapshot,
      partyIdSnapshot: snap.partyIdSnapshot,
      grantIdSnapshot: snap.grantIdSnapshot,
      consentStateVersion: snap.consentStateVersion,
      logicalMessageKey,
      activeKey: logicalMessageKey,
      language: snap.language,
      templateId: snap.templateId,
      templateVersion: snap.templateVersion,
      body: snap.body,
      fields: fields as unknown as Prisma.InputJsonValue,
      sourceFingerprint: snap.sourceFingerprint,
      snapshotFingerprint: sidik,
      freshnessVerdict: freshness as unknown as Prisma.InputJsonValue,
      mode: MODE_PESAN_KLIEN,
      state: 'DRAFT',
      createdByUserId: ctx.userId,
    },
    select: { id: true },
  })
  // Dicatat pada tabel WA-2 (bukan tabel kandidat WA-1): riwayat kandidat WA-1 membaca AuditLog bertabel kandidat.
  await catatAudit(ctx, { tableName: TABEL, recordId: m.id, action: 'CREATE', newValue: { peristiwa: 'WA2_CANDIDATE_DIPAKAI', candidateId: c.id, signalId: sid, dibuatBaru: p.dibuatBaru } }, {}, tx)
  await catatAudit(ctx, {
    tableName: TABEL,
    recordId: m.id,
    action: 'CREATE',
    newValue: {
      peristiwa: 'WA2_DRAFT_DIBUAT', candidateId: c.id, revision, contactId: cid, partyType: snap.partyTypeSnapshot, grantIdSnapshot: snap.grantIdSnapshot,
      kandidatGrant: akses.kandidatGrant, consentStateVersion: snap.consentStateVersion, templateId: snap.templateId, snapshotFingerprint: sidik,
      freshness: { aturan: freshness.aturan, bukti: freshness.bukti }, revisiDigantikan: digantikan,
    },
  }, {}, tx)
  return { hasil: 'DRAFT_DIBUAT', messageId: m.id, candidateId: c.id, revision, snapshotFingerprint: sidik, revisiDigantikan: digantikan }
}

// ================================================================ preview

export type HasilPratinjauPesanKlien =
  | { hasil: 'DIPRATINJAU'; messageId: string }
  | { hasil: 'DITOLAK'; messageId: string; alasan: string }
  | { hasil: 'DITAHAN' | 'DIBLOKIR'; messageId: string; alasan: string }

export async function pratinjauPesanKlien(ctx: TenantContext, input: { messageId: unknown; snapshotFingerprint: unknown }): Promise<HasilPratinjauPesanKlien> {
  gerbangWa2(ctx)
  const mid = idSah(input?.messageId, 'messageId')
  const sodoran = input?.snapshotFingerprint
  if (typeof sodoran !== 'string' || !/^[0-9a-f]{64}$/.test(sodoran)) throw validation('snapshotFingerprint tidak sah.')
  return denganUlangPesan(() =>
    forTenant(ctx).$transaction(async (tx): Promise<HasilPratinjauPesanKlien> => {
      const t = tx as unknown as TxMentah
      const sekarang = new Date()
      const m = await tx.waClientMessage.findFirst({ where: { id: mid }, select: PILIH_PESAN })
      if (!m) throw notFound('Pesan klien')
      if (m.state !== 'DRAFT') return { hasil: 'DITOLAK', messageId: m.id, alasan: 'MESSAGE_STATE_INVALID' }
      if (sodoran !== m.snapshotFingerprint) return { hasil: 'DITOLAK', messageId: m.id, alasan: 'SNAPSHOT_MISMATCH' }

      const ubah = async (ke: 'NEEDS_REVIEW' | 'BLOCKED', alasan: string): Promise<HasilPratinjauPesanKlien> => {
        if (!transisiPesanKlienSah(m.state, ke)) throw conflict('Transisi pesan tidak sah.', { code: 'MESSAGE_TRANSITION_FORBIDDEN' })
        const n = await tx.waClientMessage.updateMany({
          where: { id: m.id, state: 'DRAFT', version: m.version },
          data: ke === 'BLOCKED' ? { state: ke, reasonCode: alasan, activeKey: null, finalizedAt: sekarang, version: { increment: 1 } } : { state: ke, reasonCode: alasan, version: { increment: 1 } },
        })
        if (n.count !== 1) throw conflict('Pesan berubah bersamaan. Coba lagi.', { code: 'CONCURRENCY_CONFLICT' })
        await catatAudit(ctx, { tableName: TABEL, recordId: m.id, action: 'UPDATE', oldValue: { state: 'DRAFT' }, newValue: { peristiwa: 'WA2_PRATINJAU_DITOLAK', state: ke, alasan } }, {}, tx)
        return { hasil: ke === 'BLOCKED' ? 'DIBLOKIR' : 'DITAHAN', messageId: m.id, alasan }
      }

      const ulang = sidikSnapshotKlien({
        candidateId: m.candidateId, logicalMessageKey: m.logicalMessageKey, contactId: m.contactId, recipientE164Snapshot: m.recipientE164Snapshot,
        partyTypeSnapshot: m.partyTypeSnapshot, partyIdSnapshot: m.partyIdSnapshot, grantIdSnapshot: m.grantIdSnapshot, consentStateVersion: m.consentStateVersion,
        language: m.language, templateId: m.templateId, templateVersion: m.templateVersion, body: m.body, fields: m.fields, sourceFingerprint: m.sourceFingerprint,
        freshnessVerdict: m.freshnessVerdict, mode: m.mode,
      })
      if (ulang !== m.snapshotFingerprint || m.activeKey !== m.logicalMessageKey) return ubah('BLOCKED', 'SNAPSHOT_MISMATCH')

      const pk = await periksaKontak(t, ctx, m.contactId, sekarang)
      if (!pk.ok) return ubah('NEEDS_REVIEW', pk.alasan)
      if (pk.k.e164 !== m.recipientE164Snapshot || pk.k.partyId !== m.partyIdSnapshot || pk.k.bahasa !== m.language) return ubah('NEEDS_REVIEW', 'CONTACT_INELIGIBLE')
      const consent = await kunciConsent(t, ctx.tenantId, m.contactId, TUJUAN_CONSENT_PESAN_KLIEN)
      if (consent.status !== 'OPT_IN') return ubah('NEEDS_REVIEW', 'CONSENT_NOT_GRANTED')
      if (consent.version !== m.consentStateVersion) return ubah('NEEDS_REVIEW', 'CONSENT_CHANGED')
      const fields = (m.fields ?? {}) as { keluarga?: string }
      const kategori = kategoriWajibUntuk(fields.keluarga)
      const c = await muatCandidateDalamTx(tx, m.candidateId)
      if (!c || !kategori) return ubah('BLOCKED', 'SOURCE_INVALID')
      const akses = await periksaAkses(t, ctx, pk.k, c.voyageId, kategori, sekarang, m.grantIdSnapshot)
      if (!akses.ok) return ubah('NEEDS_REVIEW', akses.alasan)
      if (c.state !== 'ACTIVE') return ubah('BLOCKED', 'CANDIDATE_BLOCKED')
      const rv = await revalidasiCandidate(tx, ctx, c)
      if (!rv.ok) return ubah('BLOCKED', 'SOURCE_INVALID')
      if (rv.sourceFingerprint !== m.sourceFingerprint) return ubah('BLOCKED', 'SOURCE_CHANGED')
      const freshness = await nilaiFreshnessDb(t, ctx, c, rv.fakta, sekarang)
      if (freshness.status !== 'LOLOS') return { hasil: 'DITOLAK', messageId: m.id, alasan: freshness.alasan ?? 'FRESHNESS_EVIDENCE_MISSING' }
      const data = syaratDataApproval({ dataOrigin: await asalDataVoyage(t, ctx, c.voyageId), sumberTervalidasi: true, freshness })
      if (!data.ok) return { hasil: 'DITOLAK', messageId: m.id, alasan: data.alasan }

      if (!transisiPesanKlienSah('DRAFT', 'PREVIEWED')) throw conflict('Transisi pesan tidak sah.', { code: 'MESSAGE_TRANSITION_FORBIDDEN' })
      const n = await tx.waClientMessage.updateMany({
        where: { id: m.id, state: 'DRAFT', version: m.version, activeKey: m.logicalMessageKey },
        data: { state: 'PREVIEWED', previewedAt: sekarang, previewedByUserId: ctx.userId, version: { increment: 1 } },
      })
      if (n.count !== 1) throw conflict('Pesan berubah bersamaan. Coba lagi.', { code: 'CONCURRENCY_CONFLICT' })
      await catatAudit(ctx, { tableName: TABEL, recordId: m.id, action: 'UPDATE', oldValue: { state: 'DRAFT' }, newValue: { peristiwa: 'WA2_DIPRATINJAU', snapshotFingerprint: m.snapshotFingerprint, freshness: { aturan: freshness.aturan, bukti: freshness.bukti } } }, {}, tx)
      return { hasil: 'DIPRATINJAU', messageId: m.id }
    }),
  )
}
