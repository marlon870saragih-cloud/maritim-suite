// Komunikasi klien WA-1 — layanan APPROVAL (Step 2D).
//
// CommunicationMessage PREVIEWED → TahApprovalRequest PENDING → keputusan manusia
// (APPROVED / REJECTED) → pesan APPROVED / CANCELED / BLOCKED. BERHENTI sebelum Send:
// tak ada CommunicationAttempt, provider, WhatsApp, atau jaringan. APPROVED pun tak
// menimbulkan efek samping apa pun di Step 2D.
//
// Memakai ulang TahApprovalRequest + kebijakan TAH (tanpa kerangka approval kedua):
//   • definisi `JENIS_APPROVAL_WA_FAKE` (registry.ts, tipe literal TERTUTUP — keputusan R1):
//     INTERNAL_WRITE, non-produksi, tanpa TTL produk → expiresAt NULL (Q8/D-2D-01). tah-policy.ts
//     (BEKU, kandidat Validator V3) tak diubah; setiap invarian definisi diperiksa ulang saat jalan.
//     Satu-satunya jalur pembuat TahApprovalRequest di aplikasi = berkas ini, dengan kind &
//     expiresAt yang diturunkan dari definisi itu — tak ada jalur NULL-TTL umum.
//   • subjectType 'CommunicationMessage', subjectId = message.id, proposalHash =
//     snapshotFingerprint (TANPA hash alternatif), basisFingerprint = sourceFingerprint.
//   • satu approval per pesan immutable: idempotencyKey `WA1:<messageId>` + unique DB (D-2D-07).
//   • bolehMemutuskan() TAH untuk peran & setuju-sendiri — tak dilonggarkan.
//   • revalidasi penuh sinyal + sumber saat MEMINTA dan saat MENYETUJUI (D-2D-08), gagal tertutup.
//   • setiap pasangan mutasi approval + pesan + audit dalam SATU transaksi (catatAudit tx, D-2C-02).
//
// Urutan kunci baris SERAGAM di semua jalur: candidate → approval → pesan (mencegah deadlock).
//
// Urutan disengaja (sedikit berbeda dari daftar owner): otorisasi pemutus (bolehMemutuskan)
// diperiksa SEBELUM revalidasi sumber, supaya pemanggil tak berhak tak pernah memicu mutasi
// apa pun (hard block / pembatalan) — gagal tertutup tanpa efek samping.

import type { Prisma } from '@prisma/client'
import type { TenantContext } from '../context'
import { forbidden, notFound, validation } from '../errors'
import { forTenant } from '../tenant-db'
import { PERAN_AUTOMATION } from '../automation/gate'
import { AGEN_TAH, JENIS_APPROVAL_TAH, JENIS_APPROVAL_WA_FAKE, type DefinisiApprovalWaFake } from '../tah/registry'
import {
  MAKS_BYTE_USULAN,
  MAKS_CATATAN,
  MIN_CATATAN,
  bolehMemutuskan,
  jenisBolehDiLingkungan,
  jsonMuat,
  kelasRisikoSah,
  setujuSendiriEfektif,
  sudahKedaluwarsa,
  transisiEksekusiSah,
  transisiKeputusanSah,
  validasiRegistry,
} from '../tah/tah-policy'
import { KEBIJAKAN_APPROVAL_WA1, teksKunciCandidate, teksKunciPesanLogis, transisiPesanSah, type KodeAlasan, type KunciCandidate } from './comm-policy'
import { sidikSnapshot } from './comm-hash'
import {
  PILIH_CANDIDATE,
  KonflikKonkurensi,
  auditKomunikasi as audit,
  blokirCandidate,
  denganUlang,
  gerbang,
  hentikanApprovalTertaut,
  revalidasiCandidate,
  type CandidateBaris,
  type Penolakan,
  type Tx,
} from './communication.service'

export const SUBJEK_APPROVAL = 'CommunicationMessage'
const TABEL_APPROVAL = 'TahApprovalRequest'
const TABEL_PESAN = 'CommunicationMessage'
const kunciIdempotensi = (messageId: string) => `WA1:${messageId}`

// ================================================================ hasil bertipe

export type HasilMintaApproval =
  | { hasil: 'APPROVAL_DIMINTA'; approvalRequestId: string; messageId: string; dibuatBaru: boolean }
  | ({ hasil: 'DIBLOKIR'; candidateId: string } & Penolakan)
  | ({ hasil: 'DITOLAK_PULIH'; candidateId: string } & Penolakan)
  | ({ hasil: 'DITOLAK'; messageId: string; state: string } & Penolakan)

export type HasilKeputusan =
  | { hasil: 'DISETUJUI'; approvalRequestId: string; messageId: string }
  | { hasil: 'DITOLAK_PEMUTUS'; approvalRequestId: string; messageId: string }
  | { hasil: 'SUDAH_DIPUTUSKAN'; approvalRequestId: string; status: string }
  | ({ hasil: 'DIBLOKIR'; approvalRequestId: string; candidateId: string } & Penolakan)
  | ({ hasil: 'DITOLAK_PULIH'; approvalRequestId: string; candidateId: string } & Penolakan)
  | ({ hasil: 'DITOLAK'; approvalRequestId: string } & Penolakan)

// ================================================================ kebijakan jenis

/**
 * Definisi approval WA-1 (R1). Gagal tertutup bila SATU invarian menyimpang dari keputusan owner —
 * meski tipe literalnya sudah mencegah, nilai saat jalan tetap diperiksa (mis. objek dimutasi):
 * kind, kelas INTERNAL_WRITE (sah & boleh setuju-sendiri menurut kebijakan TAH yang beku), peran
 * PERSIS ADMIN+MANAJER_OPERASI (⊆ peran Automation), setuju-sendiri, non-produksi, tak bisa
 * disunting, tanpa TTL, dan kind tak bertabrakan dengan registry TAH lama (yang juga tetap
 * divalidasi validasiRegistry beku). Lingkungan produksi ditolak (kunci kedua di samping gerbang WA).
 */
function jenisWa(): DefinisiApprovalWaFake {
  const galat = validasiRegistry(AGEN_TAH, JENIS_APPROVAL_TAH, PERAN_AUTOMATION)
  if (galat.length > 0) throw new Error(`[komunikasi] registry TAH tidak sah: ${galat.join('; ')}`)
  const j = JENIS_APPROVAL_WA_FAKE
  const peran = [...j.peranWajib]
  const sah =
    Object.isFrozen(j) &&
    j.kind === KEBIJAKAN_APPROVAL_WA1.kind &&
    j.risiko === 'INTERNAL_WRITE' &&
    kelasRisikoSah(j.risiko) &&
    setujuSendiriEfektif(j.risiko, j.setujuSendiri) === true &&
    j.setujuSendiri === true &&
    peran.join() === 'ADMIN,MANAJER_OPERASI' &&
    peran.every((r) => (PERAN_AUTOMATION as readonly string[]).includes(r)) &&
    j.hanyaNonProduksi === KEBIJAKAN_APPROVAL_WA1.hanyaNonProduksi &&
    j.hanyaNonProduksi === true &&
    j.bisaDiedit === false &&
    j.kedaluwarsaJam === KEBIJAKAN_APPROVAL_WA1.ttlProdukJam &&
    j.kedaluwarsaJam === null &&
    !JENIS_APPROVAL_TAH.some((k) => k.kind === j.kind)
  if (!sah) throw new Error('[komunikasi] definisi WA_INTERNAL_FAKE_TEST menyimpang dari keputusan owner (R1/Q8).')
  if (!jenisBolehDiLingkungan(j, process.env.NODE_ENV)) throw forbidden('Approval WA-1 tidak diizinkan di produksi (ENV_NOT_ALLOWED).')
  return j
}

const samaHimpunan = (a: readonly string[], b: readonly string[]) => [...a].sort().join() === [...b].sort().join()

type ApprovalBaris = {
  id: string
  kind: string
  actionRisk: string
  subjectType: string | null
  subjectId: string | null
  proposalHash: string
  basisFingerprint: string
  status: string
  executionStatus: string
  version: number
  originatorUserId: string | null
  requiredRoles: string[]
  expiresAt: Date | null
}

const PILIH_APPROVAL = {
  id: true, kind: true, actionRisk: true, subjectType: true, subjectId: true, proposalHash: true, basisFingerprint: true,
  status: true, executionStatus: true, version: true, originatorUserId: true, requiredRoles: true, expiresAt: true,
} as const

/** Baris approval harus PERSIS turunan definisi WA; menyimpang (mis. disunting langsung di DB) → FORBIDDEN. */
function cekKebijakanApproval(a: ApprovalBaris, j: DefinisiApprovalWaFake): void {
  if (a.kind !== j.kind) throw forbidden('Approval ini bukan approval WA-1.')
  if (a.actionRisk !== j.risiko || !samaHimpunan(a.requiredRoles, j.peranWajib) || a.subjectType !== SUBJEK_APPROVAL || !a.subjectId || a.expiresAt !== null) {
    throw forbidden('Kebijakan approval tidak cocok dengan registry (POLICY_MISMATCH).')
  }
}

function otorisasiPemutus(ctx: TenantContext, a: ApprovalBaris, j: DefinisiApprovalWaFake): void {
  const h = bolehMemutuskan({
    pemutus: { userId: ctx.userId, role: ctx.role, system: ctx.system },
    peranWajib: j.peranWajib,
    kelas: j.risiko,
    setujuSendiriJenis: j.setujuSendiri,
    originatorUserId: a.originatorUserId,
  })
  if (!h.boleh) throw forbidden(`Tidak berhak memutuskan approval ini (${h.kode}).`)
}

// ================================================================ pesan

const PILIH_PESAN = {
  id: true, candidateId: true, revision: true, state: true, version: true, activeKey: true, logicalMessageKey: true, approvalRequestId: true,
  recipientFixtureId: true, recipientIdentifier: true, language: true, templateId: true, templateVersion: true, body: true, fields: true,
  sourceFingerprint: true, snapshotFingerprint: true, mode: true,
} as const

type PesanBaris = {
  id: string
  candidateId: string
  revision: number
  state: string
  version: number
  activeKey: string | null
  logicalMessageKey: string
  approvalRequestId: string | null
  recipientFixtureId: string
  recipientIdentifier: string
  language: string
  templateId: string
  templateVersion: number
  body: string
  fields: Prisma.JsonValue
  sourceFingerprint: string
  snapshotFingerprint: string
  mode: string
}

const kunciDari = (ctx: TenantContext, c: CandidateBaris): KunciCandidate => ({
  tenantId: ctx.tenantId,
  voyageId: c.voyageId,
  sourceType: c.sourceType as KunciCandidate['sourceType'],
  sourceRef: c.sourceRef,
})

/** Pesan masih revisi aktif yang sah DAN snapshot tersimpan utuh (sidik dihitung ulang dari kolom). */
function pesanTerkiniUtuh(ctx: TenantContext, m: PesanBaris, c: CandidateBaris): Penolakan | null {
  const kunci = kunciDari(ctx, c)
  if (m.activeKey === null || m.activeKey !== m.logicalMessageKey) return { alasan: 'APPROVAL_STALE', medan: 'activeKey' }
  if (teksKunciPesanLogis(kunci, m.recipientIdentifier) !== m.logicalMessageKey) return { alasan: 'APPROVAL_STALE', medan: 'logicalMessageKey' }
  const sidik = sidikSnapshot({
    sourceFingerprint: m.sourceFingerprint,
    teksKunciCandidate: teksKunciCandidate(kunci),
    logicalMessageKey: m.logicalMessageKey,
    recipientFixtureId: m.recipientFixtureId,
    recipientIdentifier: m.recipientIdentifier,
    language: m.language,
    templateId: m.templateId,
    templateVersion: m.templateVersion,
    body: m.body,
    mode: m.mode,
  })
  if (sidik !== m.snapshotFingerprint) return { alasan: 'APPROVAL_STALE', medan: 'snapshotFingerprint' }
  return null
}

async function auditTolakSistem(ctx: TenantContext, tx: Tx, tabel: string, recordId: string, tolak: Penolakan, konteks: Record<string, unknown> = {}) {
  await audit(ctx, tx, {
    tableName: tabel,
    recordId,
    action: 'UPDATE',
    newValue: { peristiwa: 'WA1_APPROVAL_DITOLAK_SISTEM', alasan: tolak.alasan, medan: tolak.medan ?? null, ...konteks },
  })
}

/**
 * D-2D-04 — sumber/snapshot bergeser: pesan → CANCELED (APPROVAL_STALE, activeKey dilepas) dan
 * approval tertaut dihentikan (PENDING → CANCELLED). Tak pernah menghidupkan kembali apa pun.
 */
async function batalkanBasi(ctx: TenantContext, tx: Tx, m: PesanBaris, tolak: Penolakan): Promise<void> {
  if (!transisiPesanSah(m.state, 'CANCELED')) throw new KonflikKonkurensi()
  // Urutan kunci baris: approval → pesan (seragam di semua jalur; mencegah deadlock).
  await hentikanApprovalTertaut(ctx, tx, m.approvalRequestId, 'CANCELLED', 'APPROVAL_STALE')
  const n = await tx.communicationMessage.updateMany({
    where: { id: m.id, version: m.version, state: m.state },
    data: { state: 'CANCELED', reasonCode: 'APPROVAL_STALE', activeKey: null, version: { increment: 1 } },
  })
  if (n.count === 0) throw new KonflikKonkurensi()
  await audit(ctx, tx, {
    tableName: TABEL_PESAN,
    recordId: m.id,
    action: 'UPDATE',
    oldValue: { state: m.state },
    newValue: { peristiwa: 'WA1_PESAN_BASI', state: 'CANCELED', reasonCode: 'APPROVAL_STALE', medan: tolak.medan ?? null },
  })
}

/** Candidate sudah BLOCKED tapi pesan masih aktif (tak konsisten) → pesan BLOCKED + approval dihentikan. */
async function selaraskanBlokir(ctx: TenantContext, tx: Tx, m: PesanBaris, c: CandidateBaris): Promise<Penolakan> {
  const alasan = (c.blockReason ?? 'SOURCE_NOT_FOUND') as KodeAlasan
  await hentikanApprovalTertaut(ctx, tx, m.approvalRequestId, 'CANCELLED', alasan)
  if (m.activeKey !== null && transisiPesanSah(m.state, 'BLOCKED')) {
    const n = await tx.communicationMessage.updateMany({
      where: { id: m.id, version: m.version, state: m.state },
      data: { state: 'BLOCKED', reasonCode: alasan, activeKey: null, version: { increment: 1 } },
    })
    if (n.count === 0) throw new KonflikKonkurensi()
  }
  await auditTolakSistem(ctx, tx, TABEL_PESAN, m.id, { alasan }, { candidateId: c.id })
  return { alasan }
}

const idSah = (v: unknown, nama: string): string => {
  if (typeof v !== 'string' || v.trim() === '' || v.length > 64) throw validation(`${nama} tidak sah.`)
  return v
}

// ================================================================ API service

/**
 * Minta approval untuk revisi PREVIEWED. Pemanggil HANYA menyebut messageId; tenant, hash,
 * sidik, peran, risiko, kedaluwarsa, dan usulan diturunkan server. Replay → approval yang sama.
 */
export async function mintaApproval(ctx: TenantContext, input: { messageId: unknown }): Promise<HasilMintaApproval> {
  gerbang(ctx)
  const jenis = jenisWa()
  const messageId = idSah(input?.messageId, 'messageId')
  return denganUlang(() => forTenant(ctx).$transaction((tx) => mintaDalamTx(ctx, tx, jenis, messageId)))
}

async function mintaDalamTx(ctx: TenantContext, tx: Tx, jenis: DefinisiApprovalWaFake, messageId: string): Promise<HasilMintaApproval> {
  const m = (await tx.communicationMessage.findFirst({ where: { id: messageId }, select: PILIH_PESAN })) as PesanBaris | null
  if (!m) throw notFound('Pesan')

  if (m.approvalRequestId) {
    const a = await tx.tahApprovalRequest.findFirst({ where: { id: m.approvalRequestId }, select: { id: true, status: true, subjectType: true, subjectId: true } })
    if (a && a.status === 'PENDING' && a.subjectType === SUBJEK_APPROVAL && a.subjectId === m.id && m.state === 'PREVIEWED') {
      return { hasil: 'APPROVAL_DIMINTA', approvalRequestId: a.id, messageId: m.id, dibuatBaru: false }
    }
    const tolak: Penolakan = { alasan: 'APPROVAL_STALE', medan: 'approvalRequestId' }
    await auditTolakSistem(ctx, tx, TABEL_PESAN, m.id, tolak)
    return { hasil: 'DITOLAK', messageId: m.id, state: m.state, ...tolak }
  }
  if (m.state !== 'PREVIEWED') {
    const tolak: Penolakan = { alasan: 'PREVIEW_REQUIRED', medan: 'state' }
    await auditTolakSistem(ctx, tx, TABEL_PESAN, m.id, tolak, { state: m.state })
    return { hasil: 'DITOLAK', messageId: m.id, state: m.state, ...tolak }
  }

  const c = (await tx.communicationCandidate.findFirst({ where: { id: m.candidateId }, select: PILIH_CANDIDATE })) as CandidateBaris | null
  if (!c) throw new Error('[komunikasi] candidate pesan tidak terbaca di tenant ini.')
  if (c.state !== 'ACTIVE') {
    const tolak = await selaraskanBlokir(ctx, tx, m, c)
    return { hasil: 'DIBLOKIR', candidateId: c.id, ...tolak }
  }
  const tidakUtuh = pesanTerkiniUtuh(ctx, m, c)
  if (tidakUtuh) {
    await auditTolakSistem(ctx, tx, TABEL_PESAN, m.id, tidakUtuh)
    return { hasil: 'DITOLAK', messageId: m.id, state: m.state, ...tidakUtuh }
  }

  const rv = await revalidasiCandidate(tx, ctx, c)
  if (!rv.ok) {
    if (rv.sifat === 'KERAS') {
      await blokirCandidate(ctx, tx, c, rv.tolak)
      return { hasil: 'DIBLOKIR', candidateId: c.id, ...rv.tolak }
    }
    await auditTolakSistem(ctx, tx, TABEL_PESAN, m.id, rv.tolak)
    return { hasil: 'DITOLAK_PULIH', candidateId: c.id, ...rv.tolak }
  }
  if (rv.sourceFingerprint !== m.sourceFingerprint) {
    const tolak: Penolakan = { alasan: 'APPROVAL_STALE', medan: 'sourceFingerprint' }
    await batalkanBasi(ctx, tx, m, tolak)
    return { hasil: 'DITOLAK', messageId: m.id, state: 'CANCELED', ...tolak }
  }

  const kunci = kunciIdempotensi(m.id)
  const ada = await tx.tahApprovalRequest.findFirst({ where: { idempotencyKey: kunci }, select: { id: true, status: true } })
  if (ada && ada.status !== 'PENDING') {
    const tolak: Penolakan = { alasan: 'APPROVAL_STALE', medan: 'idempotencyKey' }
    await auditTolakSistem(ctx, tx, TABEL_PESAN, m.id, tolak, { approvalRequestId: ada.id })
    return { hasil: 'DITOLAK', messageId: m.id, state: m.state, ...tolak }
  }
  const proposal = {
    v: 1,
    messageId: m.id,
    candidateId: c.id,
    revision: m.revision,
    family: c.family,
    sourceType: c.sourceType,
    sourceRef: c.sourceRef,
    voyageId: c.voyageId,
    logicalMessageKey: m.logicalMessageKey,
    recipientFixtureId: m.recipientFixtureId,
    recipientIdentifier: m.recipientIdentifier,
    language: m.language,
    templateId: m.templateId,
    templateVersion: m.templateVersion,
    body: m.body,
    fields: m.fields,
    sourceFingerprint: m.sourceFingerprint,
    snapshotFingerprint: m.snapshotFingerprint,
    mode: m.mode,
  }
  if (!jsonMuat(proposal, MAKS_BYTE_USULAN)) throw new Error('[komunikasi] usulan approval melebihi batas ukuran.')

  const a =
    ada ??
    (await tx.tahApprovalRequest.create({
      data: {
        tenantId: ctx.tenantId,
        kind: jenis.kind,
        actionRisk: jenis.risiko,
        subjectType: SUBJEK_APPROVAL,
        subjectId: m.id,
        voyageId: c.voyageId,
        title: `WA-1 SIMULASI — ${c.family} — ${rv.fakta.voyageNumber} (rev ${m.revision})`,
        reason: 'Persetujuan update klien SIMULASI (INTERNAL_FAKE_TEST) atas snapshot pesan immutable.',
        impactSummary: 'Tidak ada pesan WhatsApp yang dikirim: simulasi FAKE tanpa egress (WA-1).',
        risks: [{ code: 'INTERNAL_FAKE_TEST', severity: 'INFO' }],
        proposal: proposal as unknown as Prisma.InputJsonValue,
        proposalHash: m.snapshotFingerprint,
        humanEditedFields: [],
        basisFingerprint: m.sourceFingerprint,
        status: 'PENDING',
        originatorUserId: ctx.userId,
        requestedBy: ctx.userId,
        requiredRoles: [...jenis.peranWajib],
        // Q8: diturunkan HANYA dari definisi WA (literal null) — pemanggil tak pernah memilih kedaluwarsa.
        expiresAt: jenis.kedaluwarsaJam,
        idempotencyKey: kunci,
      },
      select: { id: true, status: true },
    }))

  const n = await tx.communicationMessage.updateMany({
    where: { id: m.id, state: 'PREVIEWED', approvalRequestId: null, version: m.version, activeKey: { not: null } },
    data: { approvalRequestId: a.id, version: { increment: 1 } },
  })
  if (n.count === 0) throw new KonflikKonkurensi()
  if (!ada) {
    await audit(ctx, tx, {
      tableName: TABEL_APPROVAL,
      recordId: a.id,
      action: 'CREATE',
      newValue: { peristiwa: 'WA1_APPROVAL_DIMINTA', kind: jenis.kind, messageId: m.id, proposalHash: m.snapshotFingerprint, basisFingerprint: m.sourceFingerprint, expiresAt: null },
    })
  }
  await audit(ctx, tx, {
    tableName: TABEL_PESAN,
    recordId: m.id,
    action: 'UPDATE',
    newValue: { peristiwa: 'WA1_APPROVAL_DITAUTKAN', approvalRequestId: a.id, state: 'PREVIEWED' },
  })
  return { hasil: 'APPROVAL_DIMINTA', approvalRequestId: a.id, messageId: m.id, dibuatBaru: !ada }
}

/** Muat & periksa approval + pesan untuk keputusan; mengembalikan hasil akhir bila tak bisa diputuskan. */
async function siapkanKeputusan(
  ctx: TenantContext,
  tx: Tx,
  jenis: DefinisiApprovalWaFake,
  approvalRequestId: string,
  revalidasi: boolean,
): Promise<{ selesai: HasilKeputusan } | { a: ApprovalBaris; m: PesanBaris }> {
  const a = (await tx.tahApprovalRequest.findFirst({ where: { id: approvalRequestId }, select: PILIH_APPROVAL })) as ApprovalBaris | null
  if (!a) throw notFound('Approval')
  cekKebijakanApproval(a, jenis)
  otorisasiPemutus(ctx, a, jenis)
  if (a.status !== 'PENDING') return { selesai: { hasil: 'SUDAH_DIPUTUSKAN', approvalRequestId: a.id, status: a.status } }
  if (a.expiresAt !== null && sudahKedaluwarsa(a.status, a.expiresAt, new Date())) {
    await hentikanApprovalTertaut(ctx, tx, a.id, 'CANCELLED', 'APPROVAL_STALE')
    return { selesai: { hasil: 'DITOLAK', approvalRequestId: a.id, alasan: 'APPROVAL_STALE', medan: 'expiresAt' } }
  }

  const m = (await tx.communicationMessage.findFirst({ where: { id: a.subjectId as string }, select: PILIH_PESAN })) as PesanBaris | null
  if (!m || m.approvalRequestId !== a.id || m.state !== 'PREVIEWED') {
    // Subjek tak lagi menunggu approval ini (diganti/diblokir/dibatalkan) → approval dihentikan; TAK pernah menghidupkan pesan.
    await hentikanApprovalTertaut(ctx, tx, a.id, 'CANCELLED', 'APPROVAL_STALE')
    return { selesai: { hasil: 'DITOLAK', approvalRequestId: a.id, alasan: 'APPROVAL_STALE', medan: 'subject' } }
  }
  const c = (await tx.communicationCandidate.findFirst({ where: { id: m.candidateId }, select: PILIH_CANDIDATE })) as CandidateBaris | null
  if (!c) throw new Error('[komunikasi] candidate pesan tidak terbaca di tenant ini.')
  if (c.state !== 'ACTIVE') {
    const tolak = await selaraskanBlokir(ctx, tx, m, c)
    return { selesai: { hasil: 'DIBLOKIR', approvalRequestId: a.id, candidateId: c.id, ...tolak } }
  }
  const tidakUtuh = a.proposalHash !== m.snapshotFingerprint ? { alasan: 'APPROVAL_STALE' as const, medan: 'proposalHash' } : pesanTerkiniUtuh(ctx, m, c)
  if (tidakUtuh) {
    await batalkanBasi(ctx, tx, m, tidakUtuh)
    return { selesai: { hasil: 'DITOLAK', approvalRequestId: a.id, ...tidakUtuh } }
  }
  if (revalidasi) {
    const rv = await revalidasiCandidate(tx, ctx, c)
    if (!rv.ok) {
      if (rv.sifat === 'KERAS') {
        await blokirCandidate(ctx, tx, c, rv.tolak)
        return { selesai: { hasil: 'DIBLOKIR', approvalRequestId: a.id, candidateId: c.id, ...rv.tolak } }
      }
      await auditTolakSistem(ctx, tx, TABEL_APPROVAL, a.id, rv.tolak, { messageId: m.id })
      return { selesai: { hasil: 'DITOLAK_PULIH', approvalRequestId: a.id, candidateId: c.id, ...rv.tolak } }
    }
    if (rv.sourceFingerprint !== m.sourceFingerprint || rv.sourceFingerprint !== a.basisFingerprint) {
      const tolak: Penolakan = { alasan: 'APPROVAL_STALE', medan: 'sourceFingerprint' }
      await batalkanBasi(ctx, tx, m, tolak)
      return { selesai: { hasil: 'DITOLAK', approvalRequestId: a.id, ...tolak } }
    }
  }
  return { a, m }
}

/**
 * Setujui approval WA-1 (manusia). Revalidasi penuh ulang (D-2D-08); berhasil → approval APPROVED
 * (eksekusi NOT_STARTED, invarian TAH) + pesan APPROVED (approvedBy/At disalin, D-2B-07). Tanpa Send.
 */
export async function setujuiPesan(ctx: TenantContext, input: { approvalRequestId: unknown; decisionNote?: unknown }): Promise<HasilKeputusan> {
  gerbang(ctx)
  const jenis = jenisWa()
  const approvalRequestId = idSah(input?.approvalRequestId, 'approvalRequestId')
  const catatan = input?.decisionNote
  if (catatan !== undefined && catatan !== null && (typeof catatan !== 'string' || catatan.length > MAKS_CATATAN)) {
    throw validation(`Catatan maksimal ${MAKS_CATATAN} karakter.`)
  }
  const note = typeof catatan === 'string' && catatan.trim() !== '' ? catatan.trim() : null
  return denganUlang(() =>
    forTenant(ctx).$transaction(async (tx): Promise<HasilKeputusan> => {
      const s = await siapkanKeputusan(ctx, tx, jenis, approvalRequestId, true)
      if ('selesai' in s) return s.selesai
      const { a, m } = s
      if (!transisiKeputusanSah('PENDING', 'APPROVED') || !transisiEksekusiSah('NOT_APPLICABLE', 'NOT_STARTED', 'APPROVED') || !transisiPesanSah('PREVIEWED', 'APPROVED')) {
        throw new Error('[komunikasi] transisi approval tidak sah.')
      }
      const sekarang = new Date()
      const na = await tx.tahApprovalRequest.updateMany({
        where: { id: a.id, status: 'PENDING', version: a.version },
        data: { status: 'APPROVED', executionStatus: 'NOT_STARTED', decidedByUserId: ctx.userId, decidedAt: sekarang, decisionNote: note, version: { increment: 1 } },
      })
      if (na.count === 0) throw new KonflikKonkurensi()
      const nm = await tx.communicationMessage.updateMany({
        where: { id: m.id, state: 'PREVIEWED', version: m.version, approvalRequestId: a.id, activeKey: { not: null } },
        data: { state: 'APPROVED', approvedByUserId: ctx.userId, approvedAt: sekarang, version: { increment: 1 } },
      })
      if (nm.count === 0) throw new KonflikKonkurensi()
      await audit(ctx, tx, {
        tableName: TABEL_APPROVAL,
        recordId: a.id,
        action: 'APPROVE',
        oldValue: { status: 'PENDING', executionStatus: 'NOT_APPLICABLE' },
        newValue: { peristiwa: 'WA1_APPROVAL_DISETUJUI', status: 'APPROVED', executionStatus: 'NOT_STARTED', messageId: m.id, proposalHash: a.proposalHash },
      })
      await audit(ctx, tx, {
        tableName: TABEL_PESAN,
        recordId: m.id,
        action: 'UPDATE',
        oldValue: { state: 'PREVIEWED' },
        newValue: { peristiwa: 'WA1_PESAN_DISETUJUI', state: 'APPROVED', approvalRequestId: a.id },
      })
      return { hasil: 'DISETUJUI', approvalRequestId: a.id, messageId: m.id }
    }),
  )
}

/**
 * Tolak approval WA-1 (manusia, catatan ≥ MIN_CATATAN.REJECTED). Approval → REJECTED; pesan →
 * CANCELED (APPROVAL_REJECTED, activeKey dilepas) — revisi baru boleh disiapkan kemudian (D-2D-03).
 * Menolak selalu aman, jadi tanpa revalidasi sumber; subjek yang sudah tak menunggu → approval dihentikan.
 */
export async function tolakPesan(ctx: TenantContext, input: { approvalRequestId: unknown; decisionNote: unknown }): Promise<HasilKeputusan> {
  gerbang(ctx)
  const jenis = jenisWa()
  const approvalRequestId = idSah(input?.approvalRequestId, 'approvalRequestId')
  const catatan = typeof input?.decisionNote === 'string' ? input.decisionNote.trim() : ''
  if (catatan.length < MIN_CATATAN.REJECTED || catatan.length > MAKS_CATATAN) {
    throw validation(`Catatan penolakan wajib ${MIN_CATATAN.REJECTED}–${MAKS_CATATAN} karakter.`)
  }
  return denganUlang(() =>
    forTenant(ctx).$transaction(async (tx): Promise<HasilKeputusan> => {
      const s = await siapkanKeputusan(ctx, tx, jenis, approvalRequestId, false)
      if ('selesai' in s) return s.selesai
      const { a, m } = s
      if (!transisiKeputusanSah('PENDING', 'REJECTED') || !transisiPesanSah('PREVIEWED', 'CANCELED')) throw new Error('[komunikasi] transisi penolakan tidak sah.')
      const sekarang = new Date()
      const na = await tx.tahApprovalRequest.updateMany({
        where: { id: a.id, status: 'PENDING', version: a.version },
        data: { status: 'REJECTED', decidedByUserId: ctx.userId, decidedAt: sekarang, decisionNote: catatan, finalizedAt: sekarang, version: { increment: 1 } },
      })
      if (na.count === 0) throw new KonflikKonkurensi()
      const nm = await tx.communicationMessage.updateMany({
        where: { id: m.id, state: 'PREVIEWED', version: m.version, approvalRequestId: a.id },
        data: { state: 'CANCELED', reasonCode: 'APPROVAL_REJECTED', activeKey: null, version: { increment: 1 } },
      })
      if (nm.count === 0) throw new KonflikKonkurensi()
      await audit(ctx, tx, {
        tableName: TABEL_APPROVAL,
        recordId: a.id,
        action: 'UPDATE',
        oldValue: { status: 'PENDING' },
        newValue: { peristiwa: 'WA1_APPROVAL_DITOLAK_PEMUTUS', status: 'REJECTED', messageId: m.id },
      })
      await audit(ctx, tx, {
        tableName: TABEL_PESAN,
        recordId: m.id,
        action: 'UPDATE',
        oldValue: { state: 'PREVIEWED' },
        newValue: { peristiwa: 'WA1_PESAN_DIBATALKAN', state: 'CANCELED', reasonCode: 'APPROVAL_REJECTED', approvalRequestId: a.id },
      })
      return { hasil: 'DITOLAK_PEMUTUS', approvalRequestId: a.id, messageId: m.id }
    }),
  )
}
