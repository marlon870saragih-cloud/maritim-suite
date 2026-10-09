// Komunikasi klien WA-1 — layanan BACA & Communication History (Step 2G, PRD §8 butir 8 / §14 / AC-17).
//
// Daftar & detail CommunicationCandidate, detail CommunicationMessage (+ approval & attempt), dan
// rantai lengkap signal → candidate → snapshot → approval → attempt → hasil beserta jejak AuditLog
// (termasuk alasan Cancel 2F). Tanpa API, UI, penyedia, atau jaringan.
//
// Aturan keras Step 2G:
//   • READ-ONLY: berkas ini tak pernah menulis — tanpa create/update/delete/upsert, tanpa raw SQL,
//     tanpa audit. Membaca riwayat tak mengubah status maupun jejak audit.
//   • Gerbang sama dengan semua jalur WA-1 (gerbang(): tenant di allowlist Automation → selain itu
//     NOT_FOUND; peran ADMIN/MANAJER_OPERASI → selain itu FORBIDDEN; bukan konteks sistem; flag WA
//     aktif; bukan produksi).
//   • Tenant HANYA dari ctx; semua bacaan lewat forTenant(ctx). Id milik tenant lain → NOT_FOUND,
//     tanpa membedakan "tidak ada" dari "milik tenant lain".
//   • Pengenal penerima disamarkan di DAFTAR (samarkanPengenal); DETAIL untuk pengguna berwenang
//     menampilkan utuh (PRD §8 butir 3). logicalMessageKey (memuat pengenal) tak pernah ada di daftar.
//   • Isi usulan approval (proposal) dan ipAddress audit TIDAK dikembalikan; kunci idempotensi attempt
//     juga tidak (internal).
//   • Setiap pembacaan berjalan dalam SATU transaksi REPEATABLE READ supaya rantai konsisten
//     (bukan campuran sebelum/sesudah transisi yang sedang berlangsung).
//
// SG-05 tetap OPEN: penerima masih fixture konstanta kode; layanan ini hanya menampilkan snapshot.

import { Prisma } from '@prisma/client'
import type { TenantContext } from '../context'
import { notFound, validation } from '../errors'
import { forTenant } from '../tenant-db'
import { STATUS_CANDIDATE, samarkanPengenal } from './comm-policy'
import { gerbang, type Tx } from './communication.service'

const TABEL_CANDIDATE = 'CommunicationCandidate'
const TABEL_PESAN = 'CommunicationMessage'
const TABEL_APPROVAL = 'TahApprovalRequest'
const TABEL_ATTEMPT = 'CommunicationAttempt'
const SUBJEK_PESAN = 'CommunicationMessage'

const TAKE_BAWAAN = 20
const TAKE_MAKS = 100

// ================================================================ bentuk hasil

export type RingkasPesanDaftar = {
  id: string
  revision: number
  state: string
  reasonCode: string | null
  language: string
  templateId: string
  /** Disamarkan (daftar). */
  penerima: string
  updatedAt: string
}

export type RingkasCandidate = {
  id: string
  voyageId: string
  voyageNumber: string | null
  family: string
  sourceType: string
  sourceRef: string
  state: string
  blockReason: string | null
  createdAt: string
  updatedAt: string
  jumlahRevisi: number
  pesanTerakhir: RingkasPesanDaftar | null
}

export type HasilDaftarCandidate = { items: RingkasCandidate[]; nextCursor: string | null }

export type RingkasSinyal = {
  id: string
  kind: string
  severity: string
  sourceType: string
  sourceRef: string | null
  reviewState: string
  detectedAt: string
  explanation: string
}

export type RingkasApproval = {
  id: string
  kind: string
  status: string
  executionStatus: string
  executionAttempts: number
  executionErrorCode: string | null
  originatorUserId: string | null
  decidedByUserId: string | null
  decidedAt: string | null
  decisionNote: string | null
  createdAt: string
  executedAt: string | null
  finalizedAt: string | null
}

export type RingkasAttempt = {
  id: string
  attemptNo: number
  state: string
  reasonCode: string | null
  provider: string
  scenario: string
  receipt: string | null
  simulation: boolean
  externalDelivery: boolean
  requestedByUserId: string
  claimedAt: string
  finishedAt: string | null
}

export type Pembatalan = { catatan: string | null; olehUserId: string | null; pada: string; stateSebelum: string | null }

export type DetailPesan = {
  id: string
  candidateId: string
  revision: number
  state: string
  reasonCode: string | null
  /** Utuh — hanya untuk pengguna berwenang (detail). */
  recipientFixtureId: string
  recipientIdentifier: string
  language: string
  templateId: string
  templateVersion: number
  body: string
  mode: string
  sourceFingerprint: string
  snapshotFingerprint: string
  createdByUserId: string
  createdAt: string
  previewedAt: string | null
  previewedByUserId: string | null
  approvedAt: string | null
  approvedByUserId: string | null
  fakeReceipt: string | null
  /** Label simulasi eksplisit: WA-1 tak pernah mengirim ke luar. */
  simulasi: { provider: 'FAKE'; simulation: true; externalDelivery: false }
  approval: RingkasApproval | null
  attempts: RingkasAttempt[]
  /** Hanya bila pesan dibatalkan pengguna (CANCELED_BY_USER, Step 2F): alasan dari AuditLog. */
  pembatalan: Pembatalan | null
}

export type DetailCandidate = Omit<RingkasCandidate, 'pesanTerakhir' | 'jumlahRevisi'> & {
  signalIds: string[]
  includedFields: string[]
  createdByUserId: string
  sinyal: RingkasSinyal[]
  revisi: Array<Omit<RingkasPesanDaftar, 'penerima'> & { recipientFixtureId: string; recipientIdentifier: string; approvalRequestId: string | null }>
}

export type EntriJejak = {
  id: string
  waktu: string
  tabel: string
  recordId: string
  aksi: string
  peristiwa: string | null
  userId: string | null
  oldValue: Prisma.JsonValue
  newValue: Prisma.JsonValue
}

export type RiwayatKomunikasi = {
  candidate: DetailCandidate
  pesan: DetailPesan[]
  jejakAudit: EntriJejak[]
}

// ================================================================ pembantu

const idSah = (v: unknown, nama: string): string => {
  if (typeof v !== 'string' || v.trim() === '' || v.length > 64) throw validation(`${nama} tidak sah.`)
  return v
}
const iso = (d: Date | null): string | null => (d ? d.toISOString() : null)

function takeSah(v: unknown): number {
  if (v === undefined || v === null) return TAKE_BAWAAN
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > TAKE_MAKS) throw validation(`take harus bilangan bulat 1–${TAKE_MAKS}.`)
  return v
}

/**
 * Step 2H (least privilege) — mode pengenal penerima untuk fungsi DETAIL. Bawaan 'UTUH' menjaga kontrak
 * 2G; lapisan API memakai 'SAMAR' kecuali pemanggil berwenang meminta pengenal utuh secara eksplisit.
 */
export type ModePengenal = 'UTUH' | 'SAMAR'
function modePengenalSah(v: unknown): ModePengenal {
  if (v === undefined || v === null) return 'UTUH'
  if (v !== 'UTUH' && v !== 'SAMAR') throw validation('pengenal harus UTUH atau SAMAR.')
  return v
}
const pengenalMenurut = (mode: ModePengenal, v: string): string => (mode === 'SAMAR' ? samarkanPengenal(v) : v)

/** Satu transaksi REPEATABLE READ per pembacaan — rantai konsisten, tanpa tulisan apa pun. */
const baca = <T>(ctx: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T> =>
  forTenant(ctx).$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })

const PILIH_CANDIDATE_BACA = {
  id: true, voyageId: true, family: true, sourceType: true, sourceRef: true, signalIds: true, includedFields: true,
  state: true, blockReason: true, createdByUserId: true, createdAt: true, updatedAt: true,
} as const

const PILIH_PESAN_BACA = {
  id: true, candidateId: true, revision: true, state: true, reasonCode: true, recipientFixtureId: true, recipientIdentifier: true,
  language: true, templateId: true, templateVersion: true, body: true, mode: true, sourceFingerprint: true, snapshotFingerprint: true,
  createdByUserId: true, createdAt: true, updatedAt: true, previewedAt: true, previewedByUserId: true, approvedAt: true,
  approvedByUserId: true, fakeReceipt: true, approvalRequestId: true,
} as const

const PILIH_APPROVAL_BACA = {
  id: true, kind: true, status: true, executionStatus: true, executionAttempts: true, executionErrorCode: true, originatorUserId: true,
  decidedByUserId: true, decidedAt: true, decisionNote: true, createdAt: true, executedAt: true, finalizedAt: true, subjectId: true,
} as const

const PILIH_ATTEMPT_BACA = {
  id: true, messageId: true, attemptNo: true, state: true, reasonCode: true, provider: true, scenario: true, receipt: true,
  simulation: true, externalDelivery: true, requestedByUserId: true, claimedAt: true, finishedAt: true,
} as const

type CandidateBaca = Prisma.CommunicationCandidateGetPayload<{ select: typeof PILIH_CANDIDATE_BACA }>
type PesanBaca = Prisma.CommunicationMessageGetPayload<{ select: typeof PILIH_PESAN_BACA }>
type ApprovalBaca = Prisma.TahApprovalRequestGetPayload<{ select: typeof PILIH_APPROVAL_BACA }>
type AttemptBaca = Prisma.CommunicationAttemptGetPayload<{ select: typeof PILIH_ATTEMPT_BACA }>

const keRingkasApproval = (a: ApprovalBaca): RingkasApproval => ({
  id: a.id,
  kind: a.kind,
  status: a.status,
  executionStatus: a.executionStatus,
  executionAttempts: a.executionAttempts,
  executionErrorCode: a.executionErrorCode,
  originatorUserId: a.originatorUserId,
  decidedByUserId: a.decidedByUserId,
  decidedAt: iso(a.decidedAt),
  decisionNote: a.decisionNote,
  createdAt: a.createdAt.toISOString(),
  executedAt: iso(a.executedAt),
  finalizedAt: iso(a.finalizedAt),
})

const keRingkasAttempt = (x: AttemptBaca): RingkasAttempt => ({
  id: x.id,
  attemptNo: x.attemptNo,
  state: x.state,
  reasonCode: x.reasonCode,
  provider: x.provider,
  scenario: x.scenario,
  receipt: x.receipt,
  simulation: x.simulation,
  externalDelivery: x.externalDelivery,
  requestedByUserId: x.requestedByUserId,
  claimedAt: x.claimedAt.toISOString(),
  finishedAt: iso(x.finishedAt),
})

const keRingkasDaftar = (m: PesanBaca): RingkasPesanDaftar => ({
  id: m.id,
  revision: m.revision,
  state: m.state,
  reasonCode: m.reasonCode,
  language: m.language,
  templateId: m.templateId,
  penerima: samarkanPengenal(m.recipientIdentifier),
  updatedAt: m.updatedAt.toISOString(),
})

const objek = (v: Prisma.JsonValue): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null

async function nomorVoyage(tx: Tx, voyageIds: string[]): Promise<Map<string, string>> {
  if (voyageIds.length === 0) return new Map()
  const vs = await tx.voyage.findMany({ where: { id: { in: Array.from(new Set(voyageIds)) } }, select: { id: true, voyageNumber: true } })
  return new Map(vs.map((v) => [v.id, v.voyageNumber]))
}

/** Alasan Cancel (2F) — entri audit WA1_PESAN_DIBATALKAN_PENGGUNA terakhir milik pesan ini (tenant ctx). */
async function bacaPembatalan(tx: Tx, messageIds: string[]): Promise<Map<string, Pembatalan>> {
  if (messageIds.length === 0) return new Map()
  const rows = await tx.auditLog.findMany({
    where: { tableName: TABEL_PESAN, recordId: { in: messageIds }, newValue: { path: ['peristiwa'], equals: 'WA1_PESAN_DIBATALKAN_PENGGUNA' } },
    select: { recordId: true, userId: true, createdAt: true, newValue: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  const hasil = new Map<string, Pembatalan>()
  for (const r of rows) {
    const nv = objek(r.newValue)
    hasil.set(r.recordId, {
      catatan: typeof nv?.catatan === 'string' ? nv.catatan : null,
      olehUserId: r.userId,
      pada: r.createdAt.toISOString(),
      stateSebelum: typeof nv?.stateSebelum === 'string' ? nv.stateSebelum : null,
    })
  }
  return hasil
}

async function rakitDetailPesan(tx: Tx, pesan: PesanBaca[], mode: ModePengenal): Promise<DetailPesan[]> {
  if (pesan.length === 0) return []
  const ids = pesan.map((m) => m.id)
  const approvalIds = pesan.map((m) => m.approvalRequestId).filter((x): x is string => x !== null)
  const [approvals, attempts, batal] = await Promise.all([
    approvalIds.length
      ? tx.tahApprovalRequest.findMany({ where: { id: { in: approvalIds }, subjectType: SUBJEK_PESAN }, select: PILIH_APPROVAL_BACA })
      : Promise.resolve([] as ApprovalBaca[]),
    tx.communicationAttempt.findMany({ where: { messageId: { in: ids } }, select: PILIH_ATTEMPT_BACA, orderBy: [{ messageId: 'asc' }, { attemptNo: 'asc' }] }),
    bacaPembatalan(tx, ids),
  ])
  const aMap = new Map(approvals.map((a) => [a.id, a]))
  return pesan.map((m) => {
    const a = m.approvalRequestId ? aMap.get(m.approvalRequestId) : undefined
    return {
      id: m.id,
      candidateId: m.candidateId,
      revision: m.revision,
      state: m.state,
      reasonCode: m.reasonCode,
      recipientFixtureId: m.recipientFixtureId,
      recipientIdentifier: pengenalMenurut(mode, m.recipientIdentifier),
      language: m.language,
      templateId: m.templateId,
      templateVersion: m.templateVersion,
      body: m.body,
      mode: m.mode,
      sourceFingerprint: m.sourceFingerprint,
      snapshotFingerprint: m.snapshotFingerprint,
      createdByUserId: m.createdByUserId,
      createdAt: m.createdAt.toISOString(),
      previewedAt: iso(m.previewedAt),
      previewedByUserId: m.previewedByUserId,
      approvedAt: iso(m.approvedAt),
      approvedByUserId: m.approvedByUserId,
      fakeReceipt: m.fakeReceipt,
      simulasi: { provider: 'FAKE', simulation: true, externalDelivery: false },
      // Approval yang subjeknya bukan pesan ini tak ditampilkan sebagai miliknya (gagal tertutup).
      approval: a && a.subjectId === m.id ? keRingkasApproval(a) : null,
      attempts: attempts.filter((x) => x.messageId === m.id).map(keRingkasAttempt),
      pembatalan: m.reasonCode === 'CANCELED_BY_USER' ? batal.get(m.id) ?? null : null,
    }
  })
}

async function rakitDetailCandidate(tx: Tx, c: CandidateBaca, pesan: PesanBaca[], mode: ModePengenal): Promise<DetailCandidate> {
  const [voyage, sinyal] = await Promise.all([
    nomorVoyage(tx, [c.voyageId]),
    c.signalIds.length
      ? tx.monitoringSignal.findMany({
          where: { id: { in: c.signalIds } },
          select: { id: true, kind: true, severity: true, sourceType: true, sourceRef: true, reviewState: true, detectedAt: true, explanation: true },
          orderBy: [{ detectedAt: 'asc' }, { id: 'asc' }],
        })
      : Promise.resolve([]),
  ])
  return {
    id: c.id,
    voyageId: c.voyageId,
    voyageNumber: voyage.get(c.voyageId) ?? null,
    family: c.family,
    sourceType: c.sourceType,
    sourceRef: c.sourceRef,
    state: c.state,
    blockReason: c.blockReason,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    signalIds: c.signalIds,
    includedFields: c.includedFields,
    createdByUserId: c.createdByUserId,
    sinyal: sinyal.map((s) => ({
      id: s.id,
      kind: s.kind,
      severity: s.severity,
      sourceType: s.sourceType,
      sourceRef: s.sourceRef,
      reviewState: s.reviewState,
      detectedAt: s.detectedAt.toISOString(),
      explanation: s.explanation,
    })),
    revisi: pesan.map((m) => ({
      id: m.id,
      revision: m.revision,
      state: m.state,
      reasonCode: m.reasonCode,
      language: m.language,
      templateId: m.templateId,
      updatedAt: m.updatedAt.toISOString(),
      recipientFixtureId: m.recipientFixtureId,
      recipientIdentifier: pengenalMenurut(mode, m.recipientIdentifier),
      approvalRequestId: m.approvalRequestId,
    })),
  }
}

// ================================================================ API service

/**
 * Daftar candidate tenant (terbaru dulu), opsional per voyage / state. Pengenal penerima disamarkan.
 * Paginasi keyset: `cursor` = id candidate terakhir halaman sebelumnya (harus milik tenant ini).
 */
export async function daftarCandidate(
  ctx: TenantContext,
  input: { voyageId?: unknown; state?: unknown; take?: unknown; cursor?: unknown } = {},
): Promise<HasilDaftarCandidate> {
  gerbang(ctx)
  const voyageId = input.voyageId === undefined || input.voyageId === null ? null : idSah(input.voyageId, 'voyageId')
  if (input.state !== undefined && input.state !== null && !(STATUS_CANDIDATE as readonly unknown[]).includes(input.state)) {
    throw validation(`state harus salah satu dari ${STATUS_CANDIDATE.join(', ')}.`)
  }
  const state = (input.state ?? null) as string | null
  const take = takeSah(input.take)
  const cursorId = input.cursor === undefined || input.cursor === null ? null : idSah(input.cursor, 'cursor')

  return baca(ctx, async (tx) => {
    let setelah: Prisma.CommunicationCandidateWhereInput = {}
    if (cursorId) {
      const k = await tx.communicationCandidate.findFirst({ where: { id: cursorId }, select: { id: true, createdAt: true } })
      if (!k) throw notFound('Kursor kandidat komunikasi')
      setelah = { OR: [{ createdAt: { lt: k.createdAt } }, { createdAt: k.createdAt, id: { lt: k.id } }] }
    }
    const rows = await tx.communicationCandidate.findMany({
      where: { ...(voyageId ? { voyageId } : {}), ...(state ? { state } : {}), ...setelah },
      select: PILIH_CANDIDATE_BACA,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
    })
    const halaman = rows.slice(0, take)
    const ids = halaman.map((c) => c.id)
    const [voyage, pesan] = await Promise.all([
      nomorVoyage(tx, halaman.map((c) => c.voyageId)),
      ids.length
        ? tx.communicationMessage.findMany({ where: { candidateId: { in: ids } }, select: PILIH_PESAN_BACA, orderBy: [{ candidateId: 'asc' }, { revision: 'asc' }] })
        : Promise.resolve([] as PesanBaca[]),
    ])
    const items: RingkasCandidate[] = halaman.map((c) => {
      const milik = pesan.filter((m) => m.candidateId === c.id)
      const terakhir = milik.at(-1)
      return {
        id: c.id,
        voyageId: c.voyageId,
        voyageNumber: voyage.get(c.voyageId) ?? null,
        family: c.family,
        sourceType: c.sourceType,
        sourceRef: c.sourceRef,
        state: c.state,
        blockReason: c.blockReason,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        jumlahRevisi: milik.length,
        pesanTerakhir: terakhir ? keRingkasDaftar(terakhir) : null,
      }
    })
    return { items, nextCursor: rows.length > take ? halaman.at(-1)!.id : null }
  })
}

/** Detail satu candidate: sinyal asal + semua revisi pesan (pengenal utuh). Milik tenant lain → NOT_FOUND. */
export async function detailCandidate(ctx: TenantContext, input: { candidateId: unknown; pengenal?: unknown }): Promise<DetailCandidate> {
  gerbang(ctx)
  const candidateId = idSah(input?.candidateId, 'candidateId')
  const mode = modePengenalSah(input?.pengenal)
  return baca(ctx, async (tx) => {
    const c = await tx.communicationCandidate.findFirst({ where: { id: candidateId }, select: PILIH_CANDIDATE_BACA })
    if (!c) throw notFound('Kandidat komunikasi')
    const pesan = await tx.communicationMessage.findMany({ where: { candidateId: c.id }, select: PILIH_PESAN_BACA, orderBy: { revision: 'asc' } })
    return rakitDetailCandidate(tx, c, pesan, mode)
  })
}

/** Detail satu revisi pesan + approval + attempt + alasan Cancel. Milik tenant lain → NOT_FOUND. */
export async function detailPesan(ctx: TenantContext, input: { messageId: unknown; pengenal?: unknown }): Promise<DetailPesan> {
  gerbang(ctx)
  const messageId = idSah(input?.messageId, 'messageId')
  const mode = modePengenalSah(input?.pengenal)
  return baca(ctx, async (tx) => {
    const m = await tx.communicationMessage.findFirst({ where: { id: messageId }, select: PILIH_PESAN_BACA })
    if (!m) throw notFound('Pesan')
    const [d] = await rakitDetailPesan(tx, [m], mode)
    return d
  })
}

/**
 * Communication History (AC-17): rantai signal → candidate → snapshot (revisi) → approval → attempt →
 * hasil, plus jejak AuditLog semua baris di rantai itu (urut waktu, append-only, tak ditimpa).
 */
export async function riwayatKomunikasi(ctx: TenantContext, input: { candidateId: unknown; pengenal?: unknown }): Promise<RiwayatKomunikasi> {
  gerbang(ctx)
  const candidateId = idSah(input?.candidateId, 'candidateId')
  const mode = modePengenalSah(input?.pengenal)
  return baca(ctx, async (tx) => {
    const c = await tx.communicationCandidate.findFirst({ where: { id: candidateId }, select: PILIH_CANDIDATE_BACA })
    if (!c) throw notFound('Kandidat komunikasi')
    const pesan = await tx.communicationMessage.findMany({ where: { candidateId: c.id }, select: PILIH_PESAN_BACA, orderBy: { revision: 'asc' } })
    const [candidate, detail] = await Promise.all([rakitDetailCandidate(tx, c, pesan, mode), rakitDetailPesan(tx, pesan, mode)])
    const messageIds = pesan.map((m) => m.id)
    const approvalIds = detail.map((d) => d.approval?.id).filter((x): x is string => typeof x === 'string')
    const attemptIds = detail.flatMap((d) => d.attempts.map((a) => a.id))
    const jejak = await tx.auditLog.findMany({
      where: {
        OR: [
          { tableName: TABEL_CANDIDATE, recordId: c.id },
          ...(messageIds.length ? [{ tableName: TABEL_PESAN, recordId: { in: messageIds } }] : []),
          ...(approvalIds.length ? [{ tableName: TABEL_APPROVAL, recordId: { in: approvalIds } }] : []),
          ...(attemptIds.length ? [{ tableName: TABEL_ATTEMPT, recordId: { in: attemptIds } }] : []),
        ],
      },
      select: { id: true, createdAt: true, tableName: true, recordId: true, action: true, userId: true, oldValue: true, newValue: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })
    return {
      candidate,
      pesan: detail,
      jejakAudit: jejak.map((j) => {
        const nv = objek(j.newValue)
        return {
          id: j.id,
          waktu: j.createdAt.toISOString(),
          tabel: j.tableName,
          recordId: j.recordId,
          aksi: j.action,
          peristiwa: typeof nv?.peristiwa === 'string' ? nv.peristiwa : null,
          userId: j.userId,
          oldValue: j.oldValue,
          newValue: j.newValue,
        }
      }),
    }
  })
}
