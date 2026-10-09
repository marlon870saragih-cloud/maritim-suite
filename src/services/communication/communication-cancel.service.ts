// Komunikasi klien WA-1 — layanan CANCEL oleh pengguna (Step 2F, FR-20 / AC-18).
//
// CommunicationMessage DRAFT | PREVIEWED | APPROVED | FAKE_FAILED | NEEDS_REVIEW → CANCELED
// (CANCELED_BY_USER) + approval tertaut dihentikan + audit, dalam SATU transaksi. Tanpa API, UI,
// History, CommunicationAttempt, penyedia, atau jaringan.
//
// Keputusan owner Step 2F:
//   • Pembatal = ADMIN / MANAJER_OPERASI tenant itu (gerbang Automation + WA), TIDAK harus pembuat
//     pesan. Konteks sistem ditolak (gerbang).
//   • Alasan WAJIB, panjang MIN_CATATAN.CANCELLED..MAKS_CATATAN (aturan catatan TAH beku, hanya
//     dibaca). Disimpan di AuditLog peristiwa WA1_PESAN_DIBATALKAN_PENGGUNA, transaksi yang sama
//     dengan mutasi: schema tak diubah dan CommunicationMessage tak punya kolom catatan.
//   • reasonCode CANCELED_BY_USER.
//
// Serialisasi (AC-18 — hanya satu transisi sah yang menang):
//   • kunciCandidate dipegang SEBELUM pesan dibaca ulang — kunci yang sama dengan klaim Send (2E)
//     dan revisi Prepare (2C). Send yang sedang memegang kunci membuat Cancel menunggu; sesudah Send
//     commit, bacaan ulang (READ COMMITTED) melihat FAKE_SENT / FAKE_FAILED. Send REPEATABLE READ
//     yang snapshot-nya mendahului commit Cancel gagal serialisasi saat mengunci candidate (40001)
//     → diulang utuh → melihat CANCELED → ditolak.
//   • Tulisan pesan memakai guard state + version + successKey NULL; gagal → transaksi diulang.
//   • Urutan kunci seragam candidate → approval → pesan (mencegah deadlock).
//
// Approval tertaut (hentikanApprovalTertaut, transisi tah-policy beku): PENDING → CANCELLED;
// APPROVED dengan eksekusi NOT_STARTED|FAILED → eksekusi CANCELLED. Keputusan APPROVED tak diubah.
// activeKey dilepas (CANCELED terminal): Prepare boleh menyiapkan revisi baru untuk pesan logis yang
// sama; revisi yang dibatalkan tak pernah bisa FAKE_SENT.
//
// Pembatalan yang ditolak (state terminal / tak sah) tak mengubah state apa pun dan dicatat sebagai
// WA1_CANCEL_DITOLAK (PRD §12.3: penolakan tindakan dicatat dengan reason).

import type { TenantContext } from '../context'
import { notFound, validation } from '../errors'
import { forTenant } from '../tenant-db'
import { MAKS_CATATAN, MIN_CATATAN } from '../tah/tah-policy'
import { bolehCancel, transisiPesanSah, type KodeAlasan } from './comm-policy'
import {
  KonflikKonkurensi,
  PILIH_CANDIDATE,
  auditKomunikasi as audit,
  denganUlang,
  gerbang,
  hentikanApprovalTertaut,
  kunciCandidate,
  type CandidateBaris,
  type Penolakan,
  type Tx,
} from './communication.service'
import { PILIH_PESAN, selaraskanBlokir, type PesanBaris } from './communication-approval.service'

const TABEL_PESAN = 'CommunicationMessage'
const ALASAN_BATAL: KodeAlasan = 'CANCELED_BY_USER'

// ================================================================ hasil bertipe

export type HasilBatalkanPesan =
  | { hasil: 'DIBATALKAN'; messageId: string; stateSebelum: string; approvalRequestId: string | null }
  /** State terminal / tak bisa dibatalkan — tanpa perubahan state; reasonCode pesan apa adanya. */
  | { hasil: 'DITOLAK'; messageId: string; state: string; reasonCode: string | null; kode: 'CANCEL_NOT_ALLOWED' }
  /** Candidate sudah BLOCKED: pesan diselaraskan ke BLOCKED (bukan CANCELED) — sumber yang menentukan. */
  | ({ hasil: 'DIBLOKIR'; messageId: string; candidateId: string } & Penolakan)

type PesanBatal = PesanBaris & { successKey: string | null; reasonCode: string | null }
const PILIH_PESAN_BATAL = { ...PILIH_PESAN, successKey: true, reasonCode: true } as const

// ================================================================ pembantu

const idSah = (v: unknown, nama: string): string => {
  if (typeof v !== 'string' || v.trim() === '' || v.length > 64) throw validation(`${nama} tidak sah.`)
  return v
}

function catatanSah(v: unknown): string {
  const catatan = typeof v === 'string' ? v.trim() : ''
  if (catatan.length < MIN_CATATAN.CANCELLED || catatan.length > MAKS_CATATAN) {
    throw validation(`Alasan pembatalan wajib ${MIN_CATATAN.CANCELLED}–${MAKS_CATATAN} karakter.`)
  }
  return catatan
}

// ================================================================ API service

/**
 * Batalkan satu revisi pesan sebelum klaim Send. Pemanggil HANYA menyebut messageId + alasan;
 * tenant, state, approval, dan kunci diturunkan server. Pesan tenant lain → NOT_FOUND.
 */
export async function batalkanPesan(ctx: TenantContext, input: { messageId: unknown; cancelNote: unknown }): Promise<HasilBatalkanPesan> {
  gerbang(ctx)
  const messageId = idSah(input?.messageId, 'messageId')
  const catatan = catatanSah(input?.cancelNote)
  return denganUlang(() => forTenant(ctx).$transaction((tx) => batalDalamTx(ctx, tx, messageId, catatan)))
}

async function batalDalamTx(ctx: TenantContext, tx: Tx, messageId: string, catatan: string): Promise<HasilBatalkanPesan> {
  const awal = await tx.communicationMessage.findFirst({ where: { id: messageId }, select: { id: true, candidateId: true } })
  if (!awal) throw notFound('Pesan')
  const c = (await tx.communicationCandidate.findFirst({ where: { id: awal.candidateId }, select: PILIH_CANDIDATE })) as CandidateBaris | null
  if (!c) throw new Error('[komunikasi] candidate pesan tidak terbaca di tenant ini.')

  // Kunci candidate DULU, baru baca ulang pesan — bacaan sebelum kunci tak dipakai untuk keputusan.
  if (c.state === 'ACTIVE') await kunciCandidate(tx, c)
  const m = (await tx.communicationMessage.findFirst({ where: { id: messageId }, select: PILIH_PESAN_BATAL })) as PesanBatal | null
  if (!m) throw notFound('Pesan')

  // State antara klaim Send tak pernah ter-commit (2E); kalaupun terbaca, bolehCancel menolaknya.
  if (!bolehCancel(m.state) || m.successKey !== null) {
    await audit(ctx, tx, {
      tableName: TABEL_PESAN,
      recordId: m.id,
      action: 'UPDATE',
      newValue: { peristiwa: 'WA1_CANCEL_DITOLAK', kode: 'CANCEL_NOT_ALLOWED', state: m.state, reasonCode: m.reasonCode, candidateId: m.candidateId, catatan },
    })
    return { hasil: 'DITOLAK', messageId: m.id, state: m.state, reasonCode: m.reasonCode, kode: 'CANCEL_NOT_ALLOWED' }
  }

  // Candidate BLOCKED tapi pesan masih aktif (tak konsisten) → selaraskan ke BLOCKED, sama dengan Send/approval.
  if (c.state !== 'ACTIVE') {
    const tolak = await selaraskanBlokir(ctx, tx, m, c)
    return { hasil: 'DIBLOKIR', messageId: m.id, candidateId: c.id, ...tolak }
  }

  if (!transisiPesanSah(m.state, 'CANCELED')) throw new KonflikKonkurensi()
  // Urutan kunci: candidate (sudah) → approval → pesan.
  await hentikanApprovalTertaut(ctx, tx, m.approvalRequestId, 'CANCELLED', ALASAN_BATAL)
  const n = await tx.communicationMessage.updateMany({
    where: { id: m.id, state: m.state, version: m.version, successKey: null },
    data: { state: 'CANCELED', reasonCode: ALASAN_BATAL, activeKey: null, version: { increment: 1 } },
  })
  if (n.count === 0) throw new KonflikKonkurensi()
  await audit(ctx, tx, {
    tableName: TABEL_PESAN,
    recordId: m.id,
    action: 'UPDATE',
    oldValue: { state: m.state, reasonCode: m.reasonCode },
    newValue: {
      peristiwa: 'WA1_PESAN_DIBATALKAN_PENGGUNA',
      state: 'CANCELED',
      reasonCode: ALASAN_BATAL,
      catatan,
      stateSebelum: m.state,
      candidateId: c.id,
      voyageId: c.voyageId,
      sourceType: c.sourceType,
      sourceRef: c.sourceRef,
      revision: m.revision,
      snapshotFingerprint: m.snapshotFingerprint,
      approvalRequestId: m.approvalRequestId,
    },
  })
  return { hasil: 'DIBATALKAN', messageId: m.id, stateSebelum: m.state, approvalRequestId: m.approvalRequestId }
}
