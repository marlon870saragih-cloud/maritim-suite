// Draft & preview pesan klien WA-2a Step 2F (F3d). Approval = wa-message-approval.service.ts (F4) — tanpa Send,
// provider, API/UI, maupun LLM. Keputusan owner: D1–D3 (Solusi A), D6-A/B, D7, D8, D-GRANT, kebijakan draft F3.
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
import { gerbangWa2 } from './wa2-gate'
import { kunciConsent, type TxMentah } from './wa-lock'
import { asalDataVoyage, denganUlangPesan, nilaiFreshnessDb, periksaAkses, periksaKontak } from './wa-message-check'
import {
  jsonKanonikKomunikasi,
  klasifikasiSinyal,
  kunciCandidate,
  muatCandidateDalamTx,
  revalidasiCandidate,
  siapkanCandidateDalamTx,
  teksKunciCandidate,
  type SinyalMasuk,
} from './wa1-bridge'
import { hentikanApprovalPesan } from './wa-approval-stop'
import { kategoriWajibUntuk, syaratDataApproval, transisiPesanKlienSah } from './wa-message-policy'
import { GalatTemplateKlien, renderPesanKlien, type KeluargaTemplateKlien } from './wa-template'
import { MODE_PESAN_KLIEN, TUJUAN_CONSENT_PESAN_KLIEN, type KodeAlasanWa2f3 } from './wa2-policy'

const TABEL = 'WaClientMessage'
const tolak = (alasan: KodeAlasanWa2f3 | string, rinci: Record<string, unknown> = {}) => validation('Draft pesan klien ditolak.', { code: alasan, ...rinci })
const idSah = (v: unknown, nama: string): string => {
  if (typeof v !== 'string' || v.trim() === '' || v.length > 64) throw validation(`${nama} tidak sah.`)
  return v
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
export const verdictStabil = (v: unknown) => {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  return { versi: o.versi ?? null, keluarga: o.keluarga ?? null, aturan: o.aturan ?? null, maksJam: o.maksJam ?? null, status: o.status ?? null, bukti: o.bukti ?? null }
}

export function sidikSnapshotKlien(s: IsiSnapshot): string {
  const isi = { ...s, freshnessVerdict: verdictStabil(s.freshnessVerdict) }
  return createHash('sha256').update(`WA2_SNAPSHOT\n${jsonKanonikKomunikasi(isi)}`, 'utf8').digest('hex')
}

export const PILIH_PESAN = {
  id: true, candidateId: true, revision: true, contactId: true, recipientE164Snapshot: true, partyTypeSnapshot: true, partyIdSnapshot: true,
  grantIdSnapshot: true, consentStateVersion: true, logicalMessageKey: true, activeKey: true, language: true, templateId: true, templateVersion: true,
  body: true, fields: true, sourceFingerprint: true, snapshotFingerprint: true, freshnessVerdict: true, mode: true, state: true, version: true,
  approvalRequestId: true, createdByUserId: true, previewedByUserId: true,
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
    if (!transisiPesanKlienSah(aktif.state, 'CANCELED')) throw tolak('MESSAGE_STATE_INVALID', { state: aktif.state })
    // F4 (K3): approval tertaut revisi lama dihentikan (SUPERSEDED) di transaksi yang sama — kandidat → approval → pesan.
    await hentikanApprovalPesan(ctx, tx, aktif.id, aktif.approvalRequestId, 'SUPERSEDED', 'REVISION_SUPERSEDED')
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
