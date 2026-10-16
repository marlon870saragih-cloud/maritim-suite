// Approval eksternal pesan klien — WA-2a Step 2F (F4). Berhenti di APPROVED: TANPA Send, provider, API/UI, LLM.
//
// Keputusan owner F4 (K1–K11):
//   • SATU mekanisme approval: TahApprovalRequest + definisi beku CLIENT_WA_UPDATE (wa-approval-def.ts) — kind,
//     kelas risiko, peran, subjek, dan kedaluwarsa (TEPAT 2 jam) hanya dari definisi, tak pernah dari input.
//   • Peminta: ADMIN / MANAJER_OPERASI (K4). Checker ≠ pembuat draft, ≠ peminta, ≠ pencatat bukti konfirmasi
//     ETA/ETD atau milestone (K5) — berlaku untuk SETUJU dan TOLAK. Peminta yang ingin mundur = pembatalan.
//   • Revalidasi penuh di dalam transaksi sebelum APPROVED: kontak ACTIVE+VERIFIED, consent OPT_IN dengan versi
//     snapshot, tenant (forTenant + SQL ber-tenant), resolver akses voyage + kategori, grant snapshot, kandidat,
//     sidik snapshot, sumber (sourceFingerprint), freshness D6 (termasuk milestone ganda), dan K7: bukti hasil
//     evaluasi ulang HARUS sama dengan bukti snapshot yang dilihat checker → selain itu EVIDENCE_CHANGED.
//   • K2: bukti hilang/invalid/kedaluwarsa atau bukti berubah → NEEDS_REVIEW; sumber berubah/terhapus/tidak sah
//     atau milestone ganda → BLOCKED. Approval tertaut SELALU dihentikan di transaksi yang sama.
//   • K11: EXPIRED terminal (approval & pesan); pemulihan = revisi baru.
//   • proposalHash = sidik snapshot pesan; basisFingerprint = sidik sumber; checker wajib menyodorkan proposalHash
//     yang ia lihat. Idempotensi permintaan: kunci `WA2:<messageId>` (unik per tenant).
//
// Urutan kunci (sama dengan draft/preview & jalur hold): WaContact (SHARE) → WaConsentState (UPDATE) →
// grant/Voyage (FOR SHARE, resolver) → bukti (Voyage/konfirmasi/peristiwa FOR SHARE) → CommunicationCandidate →
// TahApprovalRequest (FOR UPDATE) → WaClientMessage. Baris dibaca ulang SESUDAH kunci approval sebelum ditulis.
// Audit atomik (catatAudit dengan tx); tanpa nomor utuh di audit/usulan (samaran saja).

import type { Prisma } from '@prisma/client'
import type { TenantContext } from '../context'
import { ServiceError, conflict, notFound, validation } from '../errors'
import { forTenant } from '../tenant-db'
import { catatAudit } from '../finance/audit'
import { MAKS_BYTE_USULAN, MAKS_CATATAN, MIN_CATATAN, jsonMuat, transisiEksekusiSah, transisiKeputusanSah } from '../tah/tah-policy'
import { gerbangWa2 } from './wa2-gate'
import { kunciConsent, type TxMentah } from './wa-lock'
import { samarkanNomor } from './wa-phone'
import { sidikBukti } from './wa-contact.service'
import { jsonKanonikKomunikasi, kunciCandidate, muatCandidateDalamTx, revalidasiCandidate, type CandidateBaris, type TxWa1 } from './wa1-bridge'
import {
  approvalWaKlienKedaluwarsa,
  cekBarisApprovalWaKlien,
  jenisWaKlien,
  otorisasiCheckerBuktiWaKlien,
  pencatatBuktiFreshness,
  turunanApprovalWaKlien,
  type DefinisiApprovalWaKlien,
} from './wa-approval-def'
import { PILIH_PESAN, sidikSnapshotKlien, verdictStabil } from './wa-message.service'
import { asalDataVoyage, denganUlangPesan, nilaiFreshnessDb, periksaAkses, periksaKontak } from './wa-message-check'
import { kategoriWajibUntuk, syaratDataApproval, transisiPesanKlienSah } from './wa-message-policy'
import { hentikanApprovalPesan, kunciApprovalPesan } from './wa-approval-stop'
import {
  ALASAN_FRESHNESS_BLOCKED,
  AWALAN_IDEMPOTENSI_APPROVAL_PESAN_KLIEN,
  PERAN_PEMINTA_APPROVAL_PESAN_KLIEN,
  SUBJEK_APPROVAL_PESAN_KLIEN,
  TUJUAN_CONSENT_PESAN_KLIEN,
} from './wa2-policy'

const TABEL_PESAN = SUBJEK_APPROVAL_PESAN_KLIEN
const TABEL_APPROVAL = 'TahApprovalRequest'
const POLA_SIDIK = /^[0-9a-f]{64}$/

const idSah = (v: unknown, nama: string): string => {
  if (typeof v !== 'string' || v.trim() === '' || v.length > 64) throw validation(`${nama} tidak sah.`)
  return v
}
const sidikSah = (v: unknown, nama: string): string => {
  if (typeof v !== 'string' || !POLA_SIDIK.test(v)) throw validation(`${nama} tidak sah.`)
  return v
}
const terlarang = (pesan: string, code: string) => new ServiceError('FORBIDDEN', pesan, { code })
const bentrok = () => conflict('Data berubah bersamaan. Coba lagi.', { code: 'CONCURRENCY_CONFLICT' })

/** Definisi terperiksa. NODE_ENV dibaca di sini SAJA (gerbangWa2 sudah menolak produksi — ini lapis kedua). */
function jenis(): DefinisiApprovalWaKlien {
  const j = jenisWaKlien(process.env.NODE_ENV)
  if (!j.ok) throw terlarang('Approval pesan klien tidak diizinkan di lingkungan ini.', j.alasan)
  return j.nilai
}

type Tx = TxWa1
type Pesan = Prisma.WaClientMessageGetPayload<{ select: typeof PILIH_PESAN }>

const PILIH_APPROVAL = {
  id: true, kind: true, actionRisk: true, requiredRoles: true, subjectType: true, subjectId: true, expiresAt: true, status: true,
  executionStatus: true, version: true, originatorUserId: true, proposalHash: true, basisFingerprint: true,
} as const
type Approval = Prisma.TahApprovalRequestGetPayload<{ select: typeof PILIH_APPROVAL }>

const sidikDariKolom = (m: Pesan): string =>
  sidikSnapshotKlien({
    candidateId: m.candidateId, logicalMessageKey: m.logicalMessageKey, contactId: m.contactId, recipientE164Snapshot: m.recipientE164Snapshot,
    partyTypeSnapshot: m.partyTypeSnapshot, partyIdSnapshot: m.partyIdSnapshot, grantIdSnapshot: m.grantIdSnapshot, consentStateVersion: m.consentStateVersion,
    language: m.language, templateId: m.templateId, templateVersion: m.templateVersion, body: m.body, fields: m.fields, sourceFingerprint: m.sourceFingerprint,
    freshnessVerdict: m.freshnessVerdict, mode: m.mode,
  })

// ================================================================ revalidasi bersama (permintaan & keputusan)

type HasilRevalidasi =
  | { ok: true; c: CandidateBaris; pencatat: string[] }
  | { ok: false; ke: 'NEEDS_REVIEW' | 'BLOCKED'; alasan: string }

const tahan = (alasan: string): HasilRevalidasi => ({ ok: false, ke: 'NEEDS_REVIEW', alasan })
const blokir = (alasan: string): HasilRevalidasi => ({ ok: false, ke: 'BLOCKED', alasan })

async function revalidasiPesan(ctx: TenantContext, tx: Tx, m: Pesan, sekarang: Date): Promise<HasilRevalidasi> {
  const t = tx as unknown as TxMentah
  if (sidikDariKolom(m) !== m.snapshotFingerprint || m.activeKey !== m.logicalMessageKey) return blokir('SNAPSHOT_MISMATCH')
  const pk = await periksaKontak(t, ctx, m.contactId, sekarang)
  if (!pk.ok) return tahan(pk.alasan)
  if (pk.k.e164 !== m.recipientE164Snapshot || pk.k.partyType !== m.partyTypeSnapshot || pk.k.partyId !== m.partyIdSnapshot || pk.k.bahasa !== m.language) return tahan('CONTACT_INELIGIBLE')
  const consent = await kunciConsent(t, ctx.tenantId, m.contactId, TUJUAN_CONSENT_PESAN_KLIEN)
  if (consent.status !== 'OPT_IN') return tahan('CONSENT_NOT_GRANTED')
  if (consent.version !== m.consentStateVersion) return tahan('CONSENT_CHANGED')
  const kategori = kategoriWajibUntuk(((m.fields ?? {}) as { keluarga?: string }).keluarga)
  const c = await muatCandidateDalamTx(tx, m.candidateId)
  if (!c || !kategori) return blokir('SOURCE_INVALID')
  const akses = await periksaAkses(t, ctx, pk.k, c.voyageId, kategori, sekarang, m.grantIdSnapshot)
  if (!akses.ok) return tahan(akses.alasan)
  if (c.state !== 'ACTIVE') return blokir('CANDIDATE_BLOCKED')
  const rv = await revalidasiCandidate(tx, ctx, c)
  if (!rv.ok) return blokir('SOURCE_INVALID')
  if (rv.sourceFingerprint !== m.sourceFingerprint) return blokir('SOURCE_CHANGED')
  const freshness = await nilaiFreshnessDb(t, ctx, c, rv.fakta, sekarang)
  if (freshness.status !== 'LOLOS') {
    const a = freshness.alasan ?? 'FRESHNESS_EVIDENCE_MISSING'
    return (ALASAN_FRESHNESS_BLOCKED as readonly string[]).includes(a) ? blokir(a) : tahan(a)
  }
  const data = syaratDataApproval({ dataOrigin: await asalDataVoyage(t, ctx, c.voyageId), sumberTervalidasi: true, freshness })
  if (!data.ok) return blokir(data.alasan)
  // K7 — bukti yang dinilai SEKARANG harus persis bukti snapshot (yang dilihat peminta & checker).
  if (jsonKanonikKomunikasi(verdictStabil(freshness)) !== jsonKanonikKomunikasi(verdictStabil(m.freshnessVerdict))) return tahan('EVIDENCE_CHANGED')
  const pencatat = pencatatBuktiFreshness(freshness.bukti)
  if (!pencatat) return tahan('FRESHNESS_EVIDENCE_MISSING')
  return { ok: true, c, pencatat }
}

/** Pesan → NEEDS_REVIEW/BLOCKED (+ hentikan approval tertaut lebih dulu). BLOCKED melepas activeKey (terminal). */
async function tahanPesan(ctx: TenantContext, tx: Tx, m: Pesan, approvalId: string | null, ke: 'NEEDS_REVIEW' | 'BLOCKED', alasan: string, sekarang: Date): Promise<void> {
  if (!transisiPesanKlienSah(m.state, ke)) throw conflict('Transisi pesan tidak sah.', { code: 'MESSAGE_TRANSITION_FORBIDDEN' })
  await hentikanApprovalPesan(ctx, tx, m.id, approvalId, 'CANCELLED', alasan)
  const n = await tx.waClientMessage.updateMany({
    where: { id: m.id, state: m.state, version: m.version },
    data: ke === 'BLOCKED' ? { state: ke, reasonCode: alasan, activeKey: null, finalizedAt: sekarang, version: { increment: 1 } } : { state: ke, reasonCode: alasan, version: { increment: 1 } },
  })
  if (n.count !== 1) throw bentrok()
  await catatAudit(ctx, { tableName: TABEL_PESAN, recordId: m.id, action: 'UPDATE', oldValue: { state: m.state }, newValue: { peristiwa: 'WA2_APPROVAL_REVALIDASI_GAGAL', state: ke, alasan, approvalRequestId: approvalId } }, {}, tx)
}

// ================================================================ permintaan approval

export type HasilMintaApprovalPesanKlien =
  | { hasil: 'APPROVAL_DIMINTA'; messageId: string; approvalRequestId: string; expiresAt: string }
  | { hasil: 'SUDAH_ADA'; messageId: string; approvalRequestId: string }
  | { hasil: 'DITOLAK'; messageId: string; alasan: string }
  | { hasil: 'DITAHAN' | 'DIBLOKIR'; messageId: string; alasan: string }

export async function mintaApprovalPesanKlien(ctx: TenantContext, input: { messageId: unknown; snapshotFingerprint: unknown }): Promise<HasilMintaApprovalPesanKlien> {
  gerbangWa2(ctx)
  if (!(PERAN_PEMINTA_APPROVAL_PESAN_KLIEN as readonly string[]).includes(ctx.role)) throw terlarang('Permintaan approval hanya oleh ADMIN atau MANAJER_OPERASI.', 'ROLE_NOT_ALLOWED')
  const j = jenis()
  const mid = idSah(input?.messageId, 'messageId')
  const sodoran = sidikSah(input?.snapshotFingerprint, 'snapshotFingerprint')
  return denganUlangPesan(() =>
    forTenant(ctx).$transaction(async (tx): Promise<HasilMintaApprovalPesanKlien> => {
      const m = await tx.waClientMessage.findFirst({ where: { id: mid }, select: PILIH_PESAN })
      if (!m) throw notFound('Pesan klien')
      if (sodoran !== m.snapshotFingerprint) return { hasil: 'DITOLAK', messageId: m.id, alasan: 'SNAPSHOT_MISMATCH' }
      if (m.state === 'PENDING_APPROVAL' && m.approvalRequestId) {
        const ada = await tx.tahApprovalRequest.findFirst({ where: { id: m.approvalRequestId }, select: { id: true, status: true } })
        if (ada?.status === 'PENDING') return { hasil: 'SUDAH_ADA', messageId: m.id, approvalRequestId: ada.id }
      }
      if (m.state !== 'PREVIEWED' || m.approvalRequestId !== null) return { hasil: 'DITOLAK', messageId: m.id, alasan: 'MESSAGE_STATE_INVALID' }
      const kunciIdem = `${AWALAN_IDEMPOTENSI_APPROVAL_PESAN_KLIEN}${m.id}`
      if (await tx.tahApprovalRequest.findFirst({ where: { idempotencyKey: kunciIdem }, select: { id: true } })) return { hasil: 'DITOLAK', messageId: m.id, alasan: 'APPROVAL_ALREADY_EXISTS' }

      const sekarang = new Date()
      const rv = await revalidasiPesan(ctx, tx, m, sekarang)
      if (!rv.ok) {
        await tahanPesan(ctx, tx, m, null, rv.ke, rv.alasan, sekarang)
        return { hasil: rv.ke === 'BLOCKED' ? 'DIBLOKIR' : 'DITAHAN', messageId: m.id, alasan: rv.alasan }
      }
      await kunciCandidate(tx, rv.c)
      if (!transisiPesanKlienSah('PREVIEWED', 'PENDING_APPROVAL')) throw new Error('[wa2f4] transisi permintaan tidak sah.')
      const turunan = turunanApprovalWaKlien(j, new Date())
      const fields = (m.fields ?? {}) as { keluarga?: string }
      const proposal = {
        v: 1,
        messageId: m.id,
        candidateId: m.candidateId,
        revision: m.revision,
        voyageId: rv.c.voyageId,
        family: fields.keluarga ?? null,
        contactId: m.contactId,
        recipientMasked: samarkanNomor(m.recipientE164Snapshot),
        partyType: m.partyTypeSnapshot,
        grantIdSnapshot: m.grantIdSnapshot,
        consentStateVersion: m.consentStateVersion,
        language: m.language,
        templateId: m.templateId,
        templateVersion: m.templateVersion,
        body: m.body,
        fields: m.fields,
        freshness: verdictStabil(m.freshnessVerdict),
        sourceFingerprint: m.sourceFingerprint,
        snapshotFingerprint: m.snapshotFingerprint,
        mode: m.mode,
      }
      if (!jsonMuat(proposal, MAKS_BYTE_USULAN)) throw new Error('[wa2f4] usulan approval melebihi batas ukuran.')
      const a = await tx.tahApprovalRequest.create({
        data: {
          tenantId: ctx.tenantId,
          kind: turunan.kind,
          actionRisk: turunan.actionRisk,
          subjectType: turunan.subjectType,
          subjectId: m.id,
          voyageId: rv.c.voyageId,
          title: `WA-2 pesan klien — ${fields.keluarga ?? '?'} (rev ${m.revision})`,
          reason: 'Persetujuan pesan WhatsApp klien atas snapshot immutable (maker-checker).',
          impactSummary: 'Belum ada pesan yang dikirim: WA-2a berhenti di APPROVED; jalur kirim wajib revalidasi final.',
          risks: [{ code: turunan.actionRisk, severity: 'HIGH' }],
          proposal: proposal as unknown as Prisma.InputJsonValue,
          proposalHash: m.snapshotFingerprint,
          humanEditedFields: [],
          basisFingerprint: m.sourceFingerprint,
          status: 'PENDING',
          originatorUserId: ctx.userId,
          requestedBy: ctx.userId,
          requiredRoles: turunan.requiredRoles,
          expiresAt: turunan.expiresAt,
          idempotencyKey: kunciIdem,
        },
        select: { id: true, expiresAt: true },
      })
      const n = await tx.waClientMessage.updateMany({
        where: { id: m.id, state: 'PREVIEWED', version: m.version, approvalRequestId: null, activeKey: m.logicalMessageKey },
        data: { state: 'PENDING_APPROVAL', approvalRequestId: a.id, version: { increment: 1 } },
      })
      if (n.count !== 1) throw bentrok()
      await catatAudit(ctx, { tableName: TABEL_APPROVAL, recordId: a.id, action: 'CREATE', newValue: { peristiwa: 'WA2_APPROVAL_DIMINTA', kind: turunan.kind, messageId: m.id, proposalHash: m.snapshotFingerprint, basisFingerprint: m.sourceFingerprint, expiresAt: turunan.expiresAt.toISOString() } }, {}, tx)
      await catatAudit(ctx, { tableName: TABEL_PESAN, recordId: m.id, action: 'UPDATE', oldValue: { state: 'PREVIEWED' }, newValue: { peristiwa: 'WA2_APPROVAL_DITAUTKAN', state: 'PENDING_APPROVAL', approvalRequestId: a.id } }, {}, tx)
      return { hasil: 'APPROVAL_DIMINTA', messageId: m.id, approvalRequestId: a.id, expiresAt: (a.expiresAt as Date).toISOString() }
    }),
  )
}

// ================================================================ keputusan

export type HasilKeputusanPesanKlien =
  | { hasil: 'DISETUJUI'; approvalRequestId: string; messageId: string }
  | { hasil: 'DITOLAK_PEMUTUS'; approvalRequestId: string; messageId: string }
  | { hasil: 'SUDAH_DIPUTUSKAN'; approvalRequestId: string; status: string }
  | { hasil: 'KEDALUWARSA'; approvalRequestId: string; messageId: string }
  | { hasil: 'DITOLAK'; approvalRequestId: string; alasan: string }
  | { hasil: 'DITAHAN' | 'DIBLOKIR'; approvalRequestId: string; messageId: string; alasan: string }

type Siap = { a: Approval; m: Pesan; pencatatSnapshot: string[] }

/** Muat & otorisasi (tanpa mutasi) — kebijakan baris, maker-checker atas bukti snapshot, status, proposalHash. */
async function siapkanKeputusan(ctx: TenantContext, tx: Tx, j: DefinisiApprovalWaKlien, aid: string, sodoran: string): Promise<{ selesai: HasilKeputusanPesanKlien } | Siap> {
  const a = await tx.tahApprovalRequest.findFirst({ where: { id: aid }, select: PILIH_APPROVAL })
  if (!a) throw notFound('Approval')
  const baris = cekBarisApprovalWaKlien(a, j)
  if (!baris.ok) throw terlarang('Approval ini bukan approval pesan klien WA-2.', baris.alasan)
  const m = await tx.waClientMessage.findFirst({ where: { id: a.subjectId as string }, select: PILIH_PESAN })
  if (!m) throw terlarang('Subjek approval tidak ditemukan.', 'APPROVAL_POLICY_MISMATCH')
  const pencatatSnapshot = pencatatBuktiFreshness(verdictStabil(m.freshnessVerdict).bukti) ?? []
  const oto = otorisasiCheckerBuktiWaKlien(
    { pemutus: { userId: ctx.userId, role: ctx.role, system: ctx.system === true }, peminta: a.originatorUserId, pembuatDraft: m.createdByUserId, pencatatBukti: pencatatSnapshot },
    j,
  )
  if (!oto.ok) throw terlarang(`Tidak berhak memutuskan approval ini (${oto.alasan}).`, oto.alasan)
  if (a.status !== 'PENDING') return { selesai: { hasil: 'SUDAH_DIPUTUSKAN', approvalRequestId: a.id, status: a.status } }
  if (sodoran !== a.proposalHash) return { selesai: { hasil: 'DITOLAK', approvalRequestId: a.id, alasan: 'PROPOSAL_HASH_MISMATCH' } }
  return { a, m, pencatatSnapshot }
}

/** Kunci approval & baca ulang pesan; menyimpang dari yang dibaca sebelum kunci → hasil akhir (tanpa mutasi). */
async function kunciUlang(ctx: TenantContext, tx: Tx, s: Siap): Promise<{ ok: true } | { ok: false; selesai: HasilKeputusanPesanKlien }> {
  const la = await kunciApprovalPesan(tx as unknown as TxMentah, ctx.tenantId, s.a.id)
  if (!la) throw notFound('Approval')
  if (la.status !== 'PENDING') return { ok: false, selesai: { hasil: 'SUDAH_DIPUTUSKAN', approvalRequestId: s.a.id, status: la.status } }
  const lm = await tx.waClientMessage.findFirst({ where: { id: s.m.id }, select: { state: true, version: true } })
  if (la.version !== s.a.version || !lm || lm.state !== s.m.state || lm.version !== s.m.version) throw bentrok()
  return { ok: true }
}

/** K11 — approval & pesan → EXPIRED (terminal). Commit (hasil dikembalikan, bukan dilempar). */
async function kedaluwarsakan(ctx: TenantContext, tx: Tx, s: Siap, sekarang: Date): Promise<HasilKeputusanPesanKlien> {
  const k = await kunciUlang(ctx, tx, s)
  if (!k.ok) return k.selesai
  if (!transisiKeputusanSah('PENDING', 'EXPIRED')) throw new Error('[wa2f4] transisi kedaluwarsa tidak sah.')
  const na = await tx.tahApprovalRequest.updateMany({ where: { id: s.a.id, status: 'PENDING', version: s.a.version }, data: { status: 'EXPIRED', decidedAt: sekarang, finalizedAt: sekarang, version: { increment: 1 } } })
  if (na.count !== 1) throw bentrok()
  await catatAudit(ctx, { tableName: TABEL_APPROVAL, recordId: s.a.id, action: 'UPDATE', oldValue: { status: 'PENDING' }, newValue: { peristiwa: 'WA2_APPROVAL_KEDALUWARSA', status: 'EXPIRED', messageId: s.m.id } }, {}, tx)
  if (s.m.state === 'PENDING_APPROVAL' && s.m.approvalRequestId === s.a.id && transisiPesanKlienSah('PENDING_APPROVAL', 'EXPIRED')) {
    const nm = await tx.waClientMessage.updateMany({
      where: { id: s.m.id, state: 'PENDING_APPROVAL', version: s.m.version, approvalRequestId: s.a.id },
      data: { state: 'EXPIRED', reasonCode: 'APPROVAL_EXPIRED', activeKey: null, finalizedAt: sekarang, version: { increment: 1 } },
    })
    if (nm.count !== 1) throw bentrok()
    await catatAudit(ctx, { tableName: TABEL_PESAN, recordId: s.m.id, action: 'UPDATE', oldValue: { state: 'PENDING_APPROVAL' }, newValue: { peristiwa: 'WA2_PESAN_KEDALUWARSA', state: 'EXPIRED', approvalRequestId: s.a.id } }, {}, tx)
  }
  return { hasil: 'KEDALUWARSA', approvalRequestId: s.a.id, messageId: s.m.id }
}

/** Pemeriksaan bersama sebelum keputusan apa pun: kedaluwarsa, tautan subjek, dan keutuhan baris. */
async function periksaSebelumPutus(ctx: TenantContext, tx: Tx, s: Siap, sekarang: Date): Promise<HasilKeputusanPesanKlien | null> {
  if (approvalWaKlienKedaluwarsa({ status: s.a.status, expiresAt: s.a.expiresAt as Date }, sekarang)) return kedaluwarsakan(ctx, tx, s, sekarang)
  if (s.m.approvalRequestId !== s.a.id || s.m.state !== 'PENDING_APPROVAL') {
    // Subjek tak lagi menunggu approval ini → approval dihentikan; pesan TIDAK pernah dihidupkan kembali.
    const k = await kunciUlang(ctx, tx, s)
    if (!k.ok) return k.selesai
    await hentikanApprovalPesan(ctx, tx, s.m.id, s.a.id, 'CANCELLED', 'APPROVAL_LINK_MISMATCH')
    return { hasil: 'DITOLAK', approvalRequestId: s.a.id, alasan: 'APPROVAL_LINK_MISMATCH' }
  }
  if (s.a.proposalHash !== s.m.snapshotFingerprint || s.a.basisFingerprint !== s.m.sourceFingerprint) {
    const k = await kunciUlang(ctx, tx, s)
    if (!k.ok) return k.selesai
    await tahanPesan(ctx, tx, s.m, s.a.id, 'BLOCKED', 'SNAPSHOT_MISMATCH', sekarang)
    return { hasil: 'DIBLOKIR', approvalRequestId: s.a.id, messageId: s.m.id, alasan: 'SNAPSHOT_MISMATCH' }
  }
  return null
}

const catatanSah = (v: unknown, min: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length >= min && t.length <= MAKS_CATATAN ? t : null
}

/**
 * Setujui (checker). Revalidasi penuh + K7 + maker-checker atas bukti evaluasi ulang; berhasil → approval
 * APPROVED (eksekusi NOT_STARTED) + pesan APPROVED. TANPA Send.
 */
export async function setujuiPesanKlien(ctx: TenantContext, input: { approvalRequestId: unknown; proposalHash: unknown; decisionNote?: unknown }): Promise<HasilKeputusanPesanKlien> {
  gerbangWa2(ctx)
  const j = jenis()
  const aid = idSah(input?.approvalRequestId, 'approvalRequestId')
  const sodoran = sidikSah(input?.proposalHash, 'proposalHash')
  const catatan = input?.decisionNote
  if (catatan !== undefined && catatan !== null && (typeof catatan !== 'string' || catatan.length > MAKS_CATATAN)) throw validation(`Catatan maksimal ${MAKS_CATATAN} karakter.`, { code: 'DECISION_NOTE_INVALID' })
  const note = typeof catatan === 'string' && catatan.trim() !== '' ? catatan.trim() : null
  return denganUlangPesan(() =>
    forTenant(ctx).$transaction(async (tx): Promise<HasilKeputusanPesanKlien> => {
      const s = await siapkanKeputusan(ctx, tx, j, aid, sodoran)
      if ('selesai' in s) return s.selesai
      const sekarang = new Date()
      const awal = await periksaSebelumPutus(ctx, tx, s, sekarang)
      if (awal) return awal

      const rv = await revalidasiPesan(ctx, tx, s.m, sekarang)
      if (!rv.ok) {
        const k = await kunciUlang(ctx, tx, s)
        if (!k.ok) return k.selesai
        await tahanPesan(ctx, tx, s.m, s.a.id, rv.ke, rv.alasan, sekarang)
        return { hasil: rv.ke === 'BLOCKED' ? 'DIBLOKIR' : 'DITAHAN', approvalRequestId: s.a.id, messageId: s.m.id, alasan: rv.alasan }
      }
      await kunciCandidate(tx, rv.c)
      const k = await kunciUlang(ctx, tx, s)
      if (!k.ok) return k.selesai
      // Jam keputusan diambil SESUDAH seluruh kunci didapat (penantian kunci bisa lama). SEMUA syarat berbasis waktu
      // dinilai ulang dengan jam ini: TTL approval, lalu revalidasi penuh (konfirmasi ≤ 12 jam, milestone ≤ 24 jam,
      // verifikasi kontak, grant snapshot, K7). Semua baris sudah terkunci → tidak ada penantian baru setelah titik ini.
      const akhir = new Date()
      if (approvalWaKlienKedaluwarsa({ status: 'PENDING', expiresAt: s.a.expiresAt as Date }, akhir)) return kedaluwarsakan(ctx, tx, s, akhir)
      const rvAkhir = await revalidasiPesan(ctx, tx, s.m, akhir)
      if (!rvAkhir.ok) {
        await tahanPesan(ctx, tx, s.m, s.a.id, rvAkhir.ke, rvAkhir.alasan, akhir)
        return { hasil: rvAkhir.ke === 'BLOCKED' ? 'DIBLOKIR' : 'DITAHAN', approvalRequestId: s.a.id, messageId: s.m.id, alasan: rvAkhir.alasan }
      }
      // K5 pada bukti hasil evaluasi ulang (∪ snapshot) — K7 menjamin semuanya sama; tetap diperiksa (gagal tertutup).
      const oto = otorisasiCheckerBuktiWaKlien(
        { pemutus: { userId: ctx.userId, role: ctx.role, system: ctx.system === true }, peminta: s.a.originatorUserId, pembuatDraft: s.m.createdByUserId, pencatatBukti: Array.from(new Set([...s.pencatatSnapshot, ...rv.pencatat, ...rvAkhir.pencatat])) },
        j,
      )
      if (!oto.ok) throw terlarang(`Tidak berhak memutuskan approval ini (${oto.alasan}).`, oto.alasan)
      if (!transisiKeputusanSah('PENDING', 'APPROVED') || !transisiEksekusiSah('NOT_APPLICABLE', 'NOT_STARTED', 'APPROVED') || !transisiPesanKlienSah('PENDING_APPROVAL', 'APPROVED')) {
        throw new Error('[wa2f4] transisi persetujuan tidak sah.')
      }
      const na = await tx.tahApprovalRequest.updateMany({
        where: { id: s.a.id, status: 'PENDING', version: s.a.version },
        data: { status: 'APPROVED', executionStatus: 'NOT_STARTED', decidedByUserId: ctx.userId, decidedAt: akhir, decisionNote: note, version: { increment: 1 } },
      })
      if (na.count !== 1) throw bentrok()
      const nm = await tx.waClientMessage.updateMany({
        where: { id: s.m.id, state: 'PENDING_APPROVAL', version: s.m.version, approvalRequestId: s.a.id, activeKey: s.m.logicalMessageKey },
        data: { state: 'APPROVED', approvedByUserId: ctx.userId, approvedAt: akhir, version: { increment: 1 } },
      })
      if (nm.count !== 1) throw bentrok()
      await catatAudit(ctx, { tableName: TABEL_APPROVAL, recordId: s.a.id, action: 'APPROVE', oldValue: { status: 'PENDING', executionStatus: 'NOT_APPLICABLE' }, newValue: { peristiwa: 'WA2_APPROVAL_DISETUJUI', status: 'APPROVED', executionStatus: 'NOT_STARTED', messageId: s.m.id, proposalHash: s.a.proposalHash } }, {}, tx)
      await catatAudit(ctx, { tableName: TABEL_PESAN, recordId: s.m.id, action: 'UPDATE', oldValue: { state: 'PENDING_APPROVAL' }, newValue: { peristiwa: 'WA2_PESAN_DISETUJUI', state: 'APPROVED', approvalRequestId: s.a.id, pencatatBukti: rvAkhir.pencatat.length, dinilaiPada: akhir.toISOString() } }, {}, tx)
      return { hasil: 'DISETUJUI', approvalRequestId: s.a.id, messageId: s.m.id }
    }),
  )
}

/** Tolak (checker; maker-checker sama dengan setujui). Approval REJECTED; pesan REJECTED (terminal, activeKey dilepas). */
export async function tolakPesanKlien(ctx: TenantContext, input: { approvalRequestId: unknown; proposalHash: unknown; decisionNote: unknown }): Promise<HasilKeputusanPesanKlien> {
  gerbangWa2(ctx)
  const j = jenis()
  const aid = idSah(input?.approvalRequestId, 'approvalRequestId')
  const sodoran = sidikSah(input?.proposalHash, 'proposalHash')
  const catatan = catatanSah(input?.decisionNote, MIN_CATATAN.REJECTED)
  if (!catatan) throw validation(`Catatan penolakan wajib ${MIN_CATATAN.REJECTED}–${MAKS_CATATAN} karakter.`, { code: 'DECISION_NOTE_INVALID' })
  return denganUlangPesan(() =>
    forTenant(ctx).$transaction(async (tx): Promise<HasilKeputusanPesanKlien> => {
      const s = await siapkanKeputusan(ctx, tx, j, aid, sodoran)
      if ('selesai' in s) return s.selesai
      const sekarang = new Date()
      const awal = await periksaSebelumPutus(ctx, tx, s, sekarang)
      if (awal) return awal
      const k = await kunciUlang(ctx, tx, s)
      if (!k.ok) return k.selesai
      // Jam keputusan diambil SESUDAH kunci approval (penantian bisa melewati TTL): TTL diperiksa ulang dengan jam ini
      // dan jam ini pula yang dipakai untuk semua timestamp penolakan.
      const akhir = new Date()
      if (approvalWaKlienKedaluwarsa({ status: 'PENDING', expiresAt: s.a.expiresAt as Date }, akhir)) return kedaluwarsakan(ctx, tx, s, akhir)
      if (!transisiKeputusanSah('PENDING', 'REJECTED') || !transisiPesanKlienSah('PENDING_APPROVAL', 'REJECTED')) throw new Error('[wa2f4] transisi penolakan tidak sah.')
      const na = await tx.tahApprovalRequest.updateMany({
        where: { id: s.a.id, status: 'PENDING', version: s.a.version },
        data: { status: 'REJECTED', decidedByUserId: ctx.userId, decidedAt: akhir, decisionNote: catatan, finalizedAt: akhir, version: { increment: 1 } },
      })
      if (na.count !== 1) throw bentrok()
      const nm = await tx.waClientMessage.updateMany({
        where: { id: s.m.id, state: 'PENDING_APPROVAL', version: s.m.version, approvalRequestId: s.a.id },
        data: { state: 'REJECTED', reasonCode: 'APPROVAL_REJECTED', activeKey: null, finalizedAt: akhir, version: { increment: 1 } },
      })
      if (nm.count !== 1) throw bentrok()
      await catatAudit(ctx, { tableName: TABEL_APPROVAL, recordId: s.a.id, action: 'UPDATE', oldValue: { status: 'PENDING' }, newValue: { peristiwa: 'WA2_APPROVAL_DITOLAK_PEMUTUS', status: 'REJECTED', messageId: s.m.id, sidikCatatan: sidikBukti(catatan) } }, {}, tx)
      await catatAudit(ctx, { tableName: TABEL_PESAN, recordId: s.m.id, action: 'UPDATE', oldValue: { state: 'PENDING_APPROVAL' }, newValue: { peristiwa: 'WA2_PESAN_DITOLAK', state: 'REJECTED', approvalRequestId: s.a.id } }, {}, tx)
      return { hasil: 'DITOLAK_PEMUTUS', approvalRequestId: s.a.id, messageId: s.m.id }
    }),
  )
}

// ================================================================ pembatalan (K6)

export type HasilBatalPesanKlien =
  | { hasil: 'DIBATALKAN'; messageId: string; approvalDihentikan: boolean }
  | { hasil: 'SUDAH_DIBATALKAN'; messageId: string }
  | { hasil: 'DITOLAK'; messageId: string; alasan: string }

/** Batalkan pesan non-terminal (ADMIN/MANAJER_OPERASI). Approval tertaut yang masih aktif dihentikan dulu, atomik. */
export async function batalkanPesanKlien(ctx: TenantContext, input: { messageId: unknown; alasan: unknown }): Promise<HasilBatalPesanKlien> {
  gerbangWa2(ctx)
  const mid = idSah(input?.messageId, 'messageId')
  const alasan = catatanSah(input?.alasan, MIN_CATATAN.CANCELLED)
  if (!alasan) throw validation(`Alasan pembatalan wajib ${MIN_CATATAN.CANCELLED}–${MAKS_CATATAN} karakter.`, { code: 'DECISION_NOTE_INVALID' })
  return denganUlangPesan(() =>
    forTenant(ctx).$transaction(async (tx): Promise<HasilBatalPesanKlien> => {
      const awal = await tx.waClientMessage.findFirst({ where: { id: mid }, select: { id: true, approvalRequestId: true } })
      if (!awal) throw notFound('Pesan klien')
      // approvalRequestId hanya diisi sekali (PREVIEWED → PENDING_APPROVAL): kunci approval DULU, lalu baca ulang pesan.
      if (awal.approvalRequestId) await kunciApprovalPesan(tx as unknown as TxMentah, ctx.tenantId, awal.approvalRequestId)
      const m = await tx.waClientMessage.findFirst({ where: { id: mid }, select: PILIH_PESAN })
      if (!m) throw notFound('Pesan klien')
      if (m.state === 'CANCELED') return { hasil: 'SUDAH_DIBATALKAN', messageId: m.id }
      if (!transisiPesanKlienSah(m.state, 'CANCELED')) return { hasil: 'DITOLAK', messageId: m.id, alasan: 'MESSAGE_STATE_INVALID' }
      const sekarang = new Date()
      const dihentikan = await hentikanApprovalPesan(ctx, tx, m.id, m.approvalRequestId, 'CANCELLED', 'MESSAGE_CANCELED_BY_STAFF')
      const n = await tx.waClientMessage.updateMany({
        where: { id: m.id, state: m.state, version: m.version },
        data: { state: 'CANCELED', reasonCode: 'MESSAGE_CANCELED_BY_STAFF', activeKey: null, finalizedAt: sekarang, version: { increment: 1 } },
      })
      if (n.count !== 1) throw bentrok()
      await catatAudit(ctx, { tableName: TABEL_PESAN, recordId: m.id, action: 'UPDATE', oldValue: { state: m.state }, newValue: { peristiwa: 'WA2_PESAN_DIBATALKAN', state: 'CANCELED', approvalRequestId: m.approvalRequestId, approvalDihentikan: dihentikan, sidikAlasan: sidikBukti(alasan) } }, {}, tx)
      return { hasil: 'DIBATALKAN', messageId: m.id, approvalDihentikan: dihentikan }
    }),
  )
}
