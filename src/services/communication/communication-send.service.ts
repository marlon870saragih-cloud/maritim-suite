// Komunikasi klien WA-1 — layanan FAKE SEND + retry manual (Step 2E).
//
// CommunicationMessage APPROVED (atau FAKE_FAILED untuk retry manual) → gerbang SG-01..SG-09 →
// revalidasi sumber #2 → klaim attempt → penyedia FAKE (murni, tanpa egress) → FAKE_SENT /
// FAKE_FAILED + eksekusi approval + audit. Tanpa Cancel, API, UI, History, atau WhatsApp nyata.
//
// Keputusan owner Step 2E:
//   • SATU transaksi database per percobaan, isolasi REPEATABLE READ (K2): semua bacaan gerbang
//     dan revalidasi melihat SATU snapshot; penulisan bersamaan pada baris yang sama → 40001/
//     P2034 → transaksi diulang utuh (denganUlang). Aman karena penyedia FAKE fungsi murni
//     (comm-fake-provider.ts): mengulang tak menimbulkan efek di luar database. QUEUED_FAKE dan
//     eksekusi RUNNING tak pernah ter-commit sendiri — keduanya hanya terlihat di audit.
//   • K1: approval basi (snapshot/sumber/template/penerima bergeser) → pesan NEEDS_REVIEW
//     (PRD §12.2/AC-11; APPROVED|FAKE_FAILED → NEEDS_REVIEW sah di mesin status) + eksekusi
//     approval CANCELLED. NEEDS_REVIEW tak terminal (activeKey dipertahankan) — revisi baru
//     dari Prepare (2C) menggantikannya; approval lama tak pernah dipakai ulang.
//   • K3: requestKey dari pemanggil; yang disimpan = sidik (tenant, pesan, snapshot, requestKey).
//     Replay kunci sama → hasil attempt yang ada; tak bisa di-replay lintas pesan/tenant/snapshot.
//   • PULIH (zona waktu, pelabuhan, waktu masa depan, data wajib): ditolak TANPA perubahan
//     state; hanya audit penolakan. KERAS (sumber hapus/superseded/hilang): candidate & pesan
//     BLOCKED + eksekusi CANCELLED (blokirCandidate 2C).
//   • Eksekusi approval HANYA lewat transisi beku tah-policy.ts: NOT_STARTED|FAILED → RUNNING →
//     SUCCEEDED|FAILED, dan NOT_STARTED|FAILED → CANCELLED. Keputusan approval (status) tak disentuh.
//   • Urutan tulis baris seragam: candidate → approval → pesan → attempt (mencegah deadlock). Klaim
//     mengunci baris candidate (kunciCandidate) — sama dengan revisi Prepare 2C — sehingga Send dan
//     pembuatan revisi baru atas pesan logis yang sama saling berurutan (review PR #10, temuan 1).
//   • Retry manual dibatasi MAKS_PERCOBAAN_EKSEKUSI lewat bolehUlangiEksekusi beku (temuan 2).
//
// SG-05 / tenant uji (didokumentasikan, bukan diterima diam-diam): fixture penerima adalah
// konstanta kode (keputusan Q3, OD-2A-05) tanpa relasi tenant. Pembatasnya: gerbang WA hanya
// non-produksi + flag, tenant WAJIB di allowlist Automation (requireAutomation), dan semua
// kunci (logicalMessageKey, idempotencyKey, successKey) memuat tenantId. Relasi fixture↔tenant
// di database TIDAK ada di WA-1; menutupnya butuh keputusan owner (fixture per tenant).

import { Prisma } from '@prisma/client'
import type { TenantContext } from '../context'
import { notFound, validation } from '../errors'
import { forTenant } from '../tenant-db'
import type { DefinisiApprovalWaFake } from '../tah/registry'
import { MAKS_PERCOBAAN_EKSEKUSI, bolehUlangiEksekusi, transisiEksekusiSah } from '../tah/tah-policy'
import {
  KODE_ALASAN,
  PENYEDIA_KOMUNIKASI,
  bolehMintaSend,
  gerbangApprovalSend,
  periksaModeFake,
  transisiPesanSah,
  type FaktaKanonikJadwal,
  type FaktaKanonikMilestone,
  type KodeAlasan,
} from './comm-policy'
import { BAHASA_PESAN, GalatTemplate, renderPesan, type BahasaPesan, type PesanTerender } from './comm-template'
import { pilihPenerimaFixture } from './comm-fixture'
import { dasarReceiptFake, kunciIdempotensiSend } from './comm-hash'
import { kirimLewatPenyediaFake } from './comm-fake-provider'
import {
  KonflikKonkurensi,
  PILIH_CANDIDATE,
  auditKomunikasi,
  bisaDiulang,
  blokirCandidate,
  kunciCandidate,
  denganUlang,
  gerbang,
  hentikanApprovalTertaut,
  revalidasiCandidate,
  tolakDari,
  type CandidateBaris,
  type Penolakan,
  type Tx,
} from './communication.service'
import {
  PILIH_APPROVAL,
  PILIH_PESAN,
  cekKebijakanApproval,
  jenisWa,
  pesanTerkiniUtuh,
  selaraskanBlokir,
  type ApprovalBaris,
  type PesanBaris,
} from './communication-approval.service'

const TABEL_PESAN = 'CommunicationMessage'
const TABEL_APPROVAL = 'TahApprovalRequest'
const TABEL_ATTEMPT = 'CommunicationAttempt'

/** K3 — requestKey buram dari pemanggil (mis. UUID per klik); bukan rahasia, bukan data klien. */
const POLA_REQUEST_KEY = /^[A-Za-z0-9._:-]{8,128}$/

// ================================================================ hasil bertipe

type Simulasi = { provider: 'FAKE'; simulation: true; externalDelivery: false }
const SIMULASI: Simulasi = { provider: 'FAKE', simulation: true, externalDelivery: false }

export type HasilKirimFake =
  | ({ hasil: 'FAKE_SENT'; messageId: string; attemptId: string; attemptNo: number; receipt: string; ulangan: boolean } & Simulasi)
  | ({ hasil: 'FAKE_FAILED'; messageId: string; attemptId: string; attemptNo: number; alasan: 'FAKE_SIMULATED_FAILURE'; ulangan: boolean } & Simulasi)
  | ({ hasil: 'DIBLOKIR'; messageId: string; candidateId: string } & Penolakan)
  | ({ hasil: 'PERLU_TINJAUAN'; messageId: string } & Penolakan)
  | ({ hasil: 'DITOLAK_PULIH'; messageId: string; candidateId: string } & Penolakan)
  | ({ hasil: 'DITOLAK'; messageId: string; state: string } & Penolakan)
  /** Retry manual ditolak kebijakan beku: percobaan ≥ MAKS_PERCOBAAN_EKSEKUSI (5). Tanpa perubahan state. */
  | { hasil: 'PERCOBAAN_HABIS'; messageId: string; kode: 'EXECUTION_ATTEMPTS_EXHAUSTED'; percobaan: number; maks: number }

/** SG-09 — audit Send gagal ditulis → seluruh transaksi batal; tak pernah ada klaim sukses. */
export class GalatAuditKirim extends Error {
  readonly code = 'AUDIT_PERSIST_FAILED' as const
  constructor() {
    super('AUDIT_PERSIST_FAILED')
    this.name = 'GalatAuditKirim'
  }
}

type PesanKirim = PesanBaris & { successKey: string | null; reasonCode: string | null }
const PILIH_PESAN_KIRIM = { ...PILIH_PESAN, successKey: true, reasonCode: true } as const

type AttemptBaris = { id: string; messageId: string; attemptNo: number; state: string; receipt: string | null }
const PILIH_ATTEMPT = { id: true, messageId: true, attemptNo: true, state: true, receipt: true } as const

// ================================================================ pembantu

const idSah = (v: unknown, nama: string): string => {
  if (typeof v !== 'string' || v.trim() === '' || v.length > 64) throw validation(`${nama} tidak sah.`)
  return v
}

function requestKeySah(v: unknown): string {
  if (typeof v !== 'string' || !POLA_REQUEST_KEY.test(v)) throw validation('requestKey tidak sah (8–128 karakter A-Z a-z 0-9 . _ : -).')
  return v
}

/** Galat audit Send → GalatAuditKirim; konflik konkurensi tetap diteruskan apa adanya supaya diulang. */
async function audit(ctx: TenantContext, tx: Tx, entri: Parameters<typeof auditKomunikasi>[2]): Promise<void> {
  try {
    await auditKomunikasi(ctx, tx, entri)
  } catch (e) {
    if (bisaDiulang(e)) throw e
    throw new GalatAuditKirim()
  }
}

function hasilDariAttempt(messageId: string, at: AttemptBaris, ulangan: boolean): HasilKirimFake {
  if (at.state === 'FAKE_SENT' && at.receipt) {
    return { hasil: 'FAKE_SENT', messageId, attemptId: at.id, attemptNo: at.attemptNo, receipt: at.receipt, ulangan, ...SIMULASI }
  }
  if (at.state === 'FAKE_FAILED') {
    return { hasil: 'FAKE_FAILED', messageId, attemptId: at.id, attemptNo: at.attemptNo, alasan: 'FAKE_SIMULATED_FAILURE', ulangan, ...SIMULASI }
  }
  throw new Error('[komunikasi] attempt tersimpan dalam state antara.')
}

/** State yang tak boleh Send → kode alasan (AC-16: tanpa approval pesan → APPROVAL_REQUIRED). */
function alasanStateTakBisaKirim(m: PesanKirim): KodeAlasan {
  if (m.state === 'NEEDS_REVIEW') return 'APPROVAL_STALE'
  if ((m.state === 'BLOCKED' || m.state === 'CANCELED') && (KODE_ALASAN as readonly string[]).includes(m.reasonCode ?? '')) {
    return m.reasonCode as KodeAlasan
  }
  return 'APPROVAL_REQUIRED'
}

function renderUlang(fakta: FaktaKanonikJadwal | FaktaKanonikMilestone, bahasa: BahasaPesan): PesanTerender {
  return renderPesan(
    fakta.keluarga === 'SCHEDULE_CHANGE'
      ? { keluarga: fakta.keluarga, bahasa, vesselName: fakta.vesselName, voyageNumber: fakta.voyageNumber, portName: fakta.portName, perubahan: fakta.perubahan }
      : { keluarga: fakta.keluarga, bahasa, vesselName: fakta.vesselName, voyageNumber: fakta.voyageNumber, portName: fakta.portName, eventLocalTime: fakta.eventLocalTime },
  )
}

/** Template aktif saat ini atas fakta terkini HARUS menghasilkan snapshot yang sama persis (§12.2). */
function templateMasihSama(m: PesanKirim, fakta: FaktaKanonikJadwal | FaktaKanonikMilestone): boolean {
  if (!(BAHASA_PESAN as readonly string[]).includes(m.language)) return false
  try {
    const r = renderUlang(fakta, m.language as BahasaPesan)
    return r.templateId === m.templateId && r.templateVersion === m.templateVersion && r.body === m.body
  } catch (e) {
    if (e instanceof GalatTemplate) return false
    throw e
  }
}

async function auditTolakKirim(ctx: TenantContext, tx: Tx, m: PesanKirim, tolak: Penolakan, konteks: Record<string, unknown> = {}) {
  await audit(ctx, tx, {
    tableName: TABEL_PESAN,
    recordId: m.id,
    action: 'UPDATE',
    newValue: { peristiwa: 'WA1_SEND_DITOLAK', alasan: tolak.alasan, medan: tolak.medan ?? null, state: m.state, candidateId: m.candidateId, ...konteks },
  })
}

/**
 * K1 — approval basi: pesan APPROVED|FAKE_FAILED → NEEDS_REVIEW (activeKey tetap; tak terminal),
 * eksekusi approval → CANCELLED (transisi beku). Urutan tulis: approval → pesan.
 */
async function perluTinjauan(ctx: TenantContext, tx: Tx, m: PesanKirim, tolak: Penolakan): Promise<HasilKirimFake> {
  if (!transisiPesanSah(m.state, 'NEEDS_REVIEW')) throw new KonflikKonkurensi()
  await hentikanApprovalTertaut(ctx, tx, m.approvalRequestId, 'CANCELLED', 'APPROVAL_STALE')
  const n = await tx.communicationMessage.updateMany({
    where: { id: m.id, state: m.state, version: m.version },
    data: { state: 'NEEDS_REVIEW', reasonCode: tolak.alasan, version: { increment: 1 } },
  })
  if (n.count === 0) throw new KonflikKonkurensi()
  await audit(ctx, tx, {
    tableName: TABEL_PESAN,
    recordId: m.id,
    action: 'UPDATE',
    oldValue: { state: m.state },
    newValue: { peristiwa: 'WA1_PESAN_PERLU_TINJAUAN', state: 'NEEDS_REVIEW', reasonCode: tolak.alasan, medan: tolak.medan ?? null, approvalRequestId: m.approvalRequestId },
  })
  return { hasil: 'PERLU_TINJAUAN', messageId: m.id, ...tolak }
}

// ================================================================ API service

/**
 * FAKE Send / retry manual satu revisi pesan. Pemanggil HANYA menyebut messageId + requestKey;
 * tenant, approval, penerima, skenario, dan kunci idempotensi diturunkan server.
 */
export async function kirimFake(ctx: TenantContext, input: { messageId: unknown; requestKey: unknown }): Promise<HasilKirimFake> {
  gerbang(ctx)
  const jenis = jenisWa()
  const messageId = idSah(input?.messageId, 'messageId')
  const requestKey = requestKeySah(input?.requestKey)
  return denganUlang(() =>
    forTenant(ctx).$transaction((tx) => kirimDalamTx(ctx, tx, jenis, messageId, requestKey), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    }),
  )
}

async function kirimDalamTx(ctx: TenantContext, tx: Tx, jenis: DefinisiApprovalWaFake, messageId: string, requestKey: string): Promise<HasilKirimFake> {
  const m = (await tx.communicationMessage.findFirst({ where: { id: messageId }, select: PILIH_PESAN_KIRIM })) as PesanKirim | null
  if (!m) throw notFound('Pesan')
  const idempotencyKey = kunciIdempotensiSend({ tenantId: ctx.tenantId, messageId: m.id, snapshotFingerprint: m.snapshotFingerprint, requestKey })

  // SG-08 — replay kunci sama → hasil yang ada, tanpa efek baru (dicatat sebagai duplikat).
  const ada = (await tx.communicationAttempt.findFirst({ where: { idempotencyKey }, select: PILIH_ATTEMPT })) as AttemptBaris | null
  if (ada) {
    if (ada.messageId !== m.id) throw new Error('[komunikasi] kunci idempotensi menunjuk pesan lain.')
    const hasil = hasilDariAttempt(m.id, ada, true)
    await audit(ctx, tx, {
      tableName: TABEL_ATTEMPT,
      recordId: ada.id,
      action: 'UPDATE',
      newValue: { peristiwa: 'WA1_SEND_DUPLIKAT', messageId: m.id, attemptNo: ada.attemptNo, state: ada.state },
    })
    return hasil
  }

  const tolakTetap = async (tolak: Penolakan, konteks: Record<string, unknown> = {}): Promise<HasilKirimFake> => {
    await auditTolakKirim(ctx, tx, m, tolak, konteks)
    return { hasil: 'DITOLAK', messageId: m.id, state: m.state, ...tolak }
  }

  // SG-08 — satu sukses per pesan logis (state + successKey unik DB).
  if (m.state === 'FAKE_SENT' || m.successKey !== null) return tolakTetap({ alasan: 'ALREADY_FAKE_SENT' })
  const sukses = await tx.communicationMessage.findFirst({ where: { successKey: m.logicalMessageKey }, select: { id: true } })
  if (sukses) return tolakTetap({ alasan: 'ALREADY_FAKE_SENT' }, { messageIdSukses: sukses.id })
  if (m.state === 'QUEUED_FAKE') throw new Error('[komunikasi] pesan tersimpan dalam state antara QUEUED_FAKE.')
  if (!bolehMintaSend(m.state)) return tolakTetap({ alasan: alasanStateTakBisaKirim(m), medan: 'state' })

  // SG-01 — mode snapshot INTERNAL_FAKE_TEST + penyedia FAKE; tanpa fallback live.
  const mode = periksaModeFake({ mode: m.mode, penyedia: PENYEDIA_KOMUNIKASI })
  if (!mode.ok) return tolakTetap(tolakDari(mode), { mode: m.mode })

  const c = (await tx.communicationCandidate.findFirst({ where: { id: m.candidateId }, select: PILIH_CANDIDATE })) as CandidateBaris | null
  if (!c) throw new Error('[komunikasi] candidate pesan tidak terbaca di tenant ini.')
  if (c.state !== 'ACTIVE') {
    const tolak = await selaraskanBlokir(ctx, tx, m, c)
    await auditTolakKirim(ctx, tx, m, tolak)
    return { hasil: 'DIBLOKIR', messageId: m.id, candidateId: c.id, ...tolak }
  }

  // SG-07 (bagian 1) — approval ada, sesuai kebijakan WA, keputusan APPROVED, eksekusi konsisten.
  const a = m.approvalRequestId
    ? ((await tx.tahApprovalRequest.findFirst({ where: { id: m.approvalRequestId }, select: { ...PILIH_APPROVAL, executionAttempts: true } })) as (ApprovalBaris & { executionAttempts: number }) | null)
    : null
  if (!a) return tolakTetap({ alasan: 'APPROVAL_REQUIRED', medan: 'approvalRequestId' })
  cekKebijakanApproval(a, jenis)
  if (a.status !== 'APPROVED') return tolakTetap({ alasan: 'APPROVAL_REQUIRED', medan: 'approval.status' }, { approvalStatus: a.status })
  const eksekusiHarap = m.state === 'APPROVED' ? 'NOT_STARTED' : 'FAILED'
  if (a.executionStatus !== eksekusiHarap) throw new Error('[komunikasi] status eksekusi approval tidak konsisten dengan pesan.')

  // SG-03 / SG-04 — revalidasi sumber #2 (gerbang final, satu snapshot REPEATABLE READ).
  const rv = await revalidasiCandidate(tx, ctx, c)
  if (!rv.ok) {
    if (rv.sifat === 'KERAS') {
      await blokirCandidate(ctx, tx, c, rv.tolak)
      await auditTolakKirim(ctx, tx, m, rv.tolak, { state: 'BLOCKED', stateSebelum: m.state })
      return { hasil: 'DIBLOKIR', messageId: m.id, candidateId: c.id, ...rv.tolak }
    }
    await auditTolakKirim(ctx, tx, m, rv.tolak)
    return { hasil: 'DITOLAK_PULIH', messageId: m.id, candidateId: c.id, ...rv.tolak }
  }

  // SG-07 (bagian 2) + §12.2 — approval masih mengikat snapshot, sumber, template, dan penerima persis.
  if (a.subjectId !== m.id) return perluTinjauan(ctx, tx, m, { alasan: 'APPROVAL_STALE', medan: 'subject' })
  const ga = gerbangApprovalSend({ approval: { status: a.status, proposalHash: a.proposalHash }, snapshotFingerprint: m.snapshotFingerprint })
  if (!ga.ok) return perluTinjauan(ctx, tx, m, { alasan: ga.alasan, medan: 'proposalHash' })
  const tidakUtuh = pesanTerkiniUtuh(ctx, m, c)
  if (tidakUtuh) return perluTinjauan(ctx, tx, m, tidakUtuh)
  if (rv.sourceFingerprint !== m.sourceFingerprint || rv.sourceFingerprint !== a.basisFingerprint) {
    return perluTinjauan(ctx, tx, m, { alasan: 'APPROVAL_STALE', medan: 'sourceFingerprint' })
  }
  if (!templateMasihSama(m, rv.fakta)) return perluTinjauan(ctx, tx, m, { alasan: 'APPROVAL_STALE', medan: 'template' })

  // SG-05 — penerima fixture TEST_FIXTURE aktif dengan bukti izin uji; pengenal = snapshot.
  const f = pilihPenerimaFixture(m.recipientFixtureId)
  if (!f.ok) return perluTinjauan(ctx, tx, m, tolakDari(f))
  if (f.nilai.pengenal !== m.recipientIdentifier) return perluTinjauan(ctx, tx, m, { alasan: 'CONTACT_INELIGIBLE', medan: 'recipientIdentifier' })
  const fixture = f.nilai

  // Batas percobaan (schema CommunicationAttempt: ≤ MAKS_PERCOBAAN_EKSEKUSI, ditegakkan service) —
  // keputusan diserahkan ke bolehUlangiEksekusi BEKU. Dihitung dari executionAttempts approval dan
  // nomor attempt tertinggi (yang lebih besar — gagal tertutup). Atomik: klaim di bawah memakai
  // guard version approval + unique (messageId, attemptNo); retry bersamaan yang kalah diulang lalu
  // melihat hitungan baru. Replay kunci lama sudah dijawab di atas sebelum sampai sini.
  const maks = await tx.communicationAttempt.aggregate({ where: { messageId: m.id }, _max: { attemptNo: true } })
  const percobaan = Math.max(a.executionAttempts, maks._max.attemptNo ?? 0)
  if (m.state === 'FAKE_FAILED') {
    const u = bolehUlangiEksekusi(a.executionStatus, percobaan)
    if (!u.boleh) {
      if (u.kode !== 'EXECUTION_ATTEMPTS_EXHAUSTED') throw new Error('[komunikasi] status eksekusi approval tidak konsisten dengan retry.')
      await audit(ctx, tx, {
        tableName: TABEL_PESAN,
        recordId: m.id,
        action: 'UPDATE',
        newValue: { peristiwa: 'WA1_SEND_DITOLAK', kode: u.kode, percobaan, maks: MAKS_PERCOBAAN_EKSEKUSI, state: m.state, candidateId: m.candidateId, approvalRequestId: a.id },
      })
      return { hasil: 'PERCOBAAN_HABIS', messageId: m.id, kode: u.kode, percobaan, maks: MAKS_PERCOBAAN_EKSEKUSI }
    }
  } else if (percobaan !== 0) {
    throw new Error('[komunikasi] pesan APPROVED sudah memiliki attempt.')
  }

  // Klaim: kunci candidate → approval RUNNING → pesan QUEUED_FAKE → attempt QUEUED_FAKE (urutan tulis seragam).
  if (
    !transisiEksekusiSah(a.executionStatus, 'RUNNING', 'APPROVED') ||
    !transisiEksekusiSah('RUNNING', 'SUCCEEDED', 'APPROVED') ||
    !transisiEksekusiSah('RUNNING', 'FAILED', 'APPROVED') ||
    !transisiPesanSah(m.state, 'QUEUED_FAKE') ||
    !transisiPesanSah('QUEUED_FAKE', 'FAKE_SENT') ||
    !transisiPesanSah('QUEUED_FAKE', 'FAKE_FAILED')
  ) {
    throw new Error('[komunikasi] transisi kirim tidak sah.')
  }
  await kunciCandidate(tx, c)
  const sekarang = new Date()
  const na = await tx.tahApprovalRequest.updateMany({
    where: { id: a.id, status: 'APPROVED', executionStatus: a.executionStatus, version: a.version },
    data: { executionStatus: 'RUNNING', executionAttempts: { increment: 1 }, executionClaimedAt: sekarang, executionErrorCode: null, version: { increment: 1 } },
  })
  if (na.count === 0) throw new KonflikKonkurensi()
  const nm = await tx.communicationMessage.updateMany({
    where: { id: m.id, state: m.state, version: m.version, activeKey: m.logicalMessageKey, successKey: null },
    data: { state: 'QUEUED_FAKE', reasonCode: null, version: { increment: 1 } },
  })
  if (nm.count === 0) throw new KonflikKonkurensi()
  const attemptNo = (maks._max.attemptNo ?? 0) + 1
  const at = await tx.communicationAttempt.create({
    data: {
      tenantId: ctx.tenantId,
      messageId: m.id,
      attemptNo,
      idempotencyKey,
      provider: PENYEDIA_KOMUNIKASI,
      scenario: fixture.skenario,
      state: 'QUEUED_FAKE',
      simulation: true,
      externalDelivery: false,
      requestedByUserId: ctx.userId,
    },
    select: { id: true },
  })
  const jejak = { messageId: m.id, candidateId: c.id, voyageId: c.voyageId, sourceType: c.sourceType, sourceRef: c.sourceRef, snapshotFingerprint: m.snapshotFingerprint, approvalRequestId: a.id, attemptId: at.id, attemptNo }
  await audit(ctx, tx, {
    tableName: TABEL_APPROVAL,
    recordId: a.id,
    action: 'UPDATE',
    oldValue: { executionStatus: a.executionStatus },
    newValue: { peristiwa: 'WA1_EKSEKUSI_DIMULAI', executionStatus: 'RUNNING', ...jejak },
  })
  await audit(ctx, tx, {
    tableName: TABEL_PESAN,
    recordId: m.id,
    action: 'UPDATE',
    oldValue: { state: m.state },
    newValue: { peristiwa: m.state === 'FAKE_FAILED' ? 'WA1_SEND_RETRY_MANUAL' : 'WA1_SEND_DIKLAIM', state: 'QUEUED_FAKE', ...jejak },
  })
  await audit(ctx, tx, {
    tableName: TABEL_ATTEMPT,
    recordId: at.id,
    action: 'CREATE',
    newValue: { peristiwa: 'WA1_ATTEMPT_DIKLAIM', state: 'QUEUED_FAKE', scenario: fixture.skenario, ...SIMULASI, ...jejak },
  })

  // Penyedia FAKE — murni; tanpa egress.
  const h = kirimLewatPenyediaFake({ skenario: fixture.skenario, attemptNo, dasarReceipt: dasarReceiptFake({ idempotencyKey, attemptNo }) })

  if (h.diterima) {
    const n1 = await tx.tahApprovalRequest.updateMany({
      where: { id: a.id, status: 'APPROVED', executionStatus: 'RUNNING', version: a.version + 1 },
      data: { executionStatus: 'SUCCEEDED', executedAt: sekarang, resultRef: { messageId: m.id, attemptId: at.id }, finalizedAt: sekarang, version: { increment: 1 } },
    })
    const n2 = await tx.communicationMessage.updateMany({
      where: { id: m.id, state: 'QUEUED_FAKE', version: m.version + 1 },
      data: { state: 'FAKE_SENT', successKey: m.logicalMessageKey, activeKey: null, fakeReceipt: h.receipt, version: { increment: 1 } },
    })
    const n3 = await tx.communicationAttempt.updateMany({ where: { id: at.id, state: 'QUEUED_FAKE' }, data: { state: 'FAKE_SENT', receipt: h.receipt, finishedAt: sekarang } })
    if (n1.count === 0 || n2.count === 0 || n3.count === 0) throw new KonflikKonkurensi()
    await audit(ctx, tx, {
      tableName: TABEL_APPROVAL,
      recordId: a.id,
      action: 'UPDATE',
      oldValue: { executionStatus: 'RUNNING' },
      newValue: { peristiwa: 'WA1_EKSEKUSI_SELESAI', executionStatus: 'SUCCEEDED', ...jejak },
    })
    await audit(ctx, tx, {
      tableName: TABEL_PESAN,
      recordId: m.id,
      action: 'UPDATE',
      oldValue: { state: 'QUEUED_FAKE' },
      newValue: { peristiwa: 'WA1_PESAN_FAKE_SENT', state: 'FAKE_SENT', receipt: h.receipt, ...SIMULASI, ...jejak },
    })
    await audit(ctx, tx, {
      tableName: TABEL_ATTEMPT,
      recordId: at.id,
      action: 'UPDATE',
      oldValue: { state: 'QUEUED_FAKE' },
      newValue: { peristiwa: 'WA1_ATTEMPT_FAKE_SENT', state: 'FAKE_SENT', receipt: h.receipt, ...SIMULASI, ...jejak },
    })
    return { hasil: 'FAKE_SENT', messageId: m.id, attemptId: at.id, attemptNo, receipt: h.receipt, ulangan: false, ...SIMULASI }
  }

  const n1 = await tx.tahApprovalRequest.updateMany({
    where: { id: a.id, status: 'APPROVED', executionStatus: 'RUNNING', version: a.version + 1 },
    data: { executionStatus: 'FAILED', executionErrorCode: h.alasan, version: { increment: 1 } },
  })
  const n2 = await tx.communicationMessage.updateMany({
    where: { id: m.id, state: 'QUEUED_FAKE', version: m.version + 1 },
    data: { state: 'FAKE_FAILED', reasonCode: h.alasan, version: { increment: 1 } },
  })
  const n3 = await tx.communicationAttempt.updateMany({ where: { id: at.id, state: 'QUEUED_FAKE' }, data: { state: 'FAKE_FAILED', reasonCode: h.alasan, finishedAt: sekarang } })
  if (n1.count === 0 || n2.count === 0 || n3.count === 0) throw new KonflikKonkurensi()
  await audit(ctx, tx, {
    tableName: TABEL_APPROVAL,
    recordId: a.id,
    action: 'UPDATE',
    oldValue: { executionStatus: 'RUNNING' },
    newValue: { peristiwa: 'WA1_EKSEKUSI_GAGAL', executionStatus: 'FAILED', alasan: h.alasan, ...jejak },
  })
  await audit(ctx, tx, {
    tableName: TABEL_PESAN,
    recordId: m.id,
    action: 'UPDATE',
    oldValue: { state: 'QUEUED_FAKE' },
    newValue: { peristiwa: 'WA1_PESAN_FAKE_FAILED', state: 'FAKE_FAILED', reasonCode: h.alasan, ...SIMULASI, ...jejak },
  })
  await audit(ctx, tx, {
    tableName: TABEL_ATTEMPT,
    recordId: at.id,
    action: 'UPDATE',
    oldValue: { state: 'QUEUED_FAKE' },
    newValue: { peristiwa: 'WA1_ATTEMPT_FAKE_FAILED', state: 'FAKE_FAILED', reasonCode: h.alasan, ...SIMULASI, ...jejak },
  })
  return { hasil: 'FAKE_FAILED', messageId: m.id, attemptId: at.id, attemptNo, alasan: 'FAKE_SIMULATED_FAILURE', ulangan: false, ...SIMULASI }
}
