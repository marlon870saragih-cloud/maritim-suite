// Sambungan Vessel Call Intake ↔ buku besar TAH (PRD-005 Step 3B).
//
// Dipakai HANYA oleh submitIntake. Persetujuan intake (approve/reject/link/retry/update)
// TIDAK disentuh — keputusan owner D6/Q2.
//
// TAH Core MATI (TAH_CORE_ENABLED ≠ "true") → mulaiLedgerIntake mengembalikan null:
// nol baris AgentRun/AgentModelCall. Bila TAH_INTAKE_MODEL juga tak diset,
// jalankanEkstraksi memanggil fungsi ekstraksi APA ADANYA (tanpa konteks sama sekali)
// — perilaku lama persis.
//
// TAH Core AKTIF → satu AgentRun dibuat TEPAT SEBELUM ekstraksi (setelah langganan,
// hash, kuota, dan batas laju — urutan biaya dikunci check-intake-policy), setiap
// percobaan panggilan dicatat lewat konteks perekam, lalu jalan ditutup sesuai hasil.
// Gagal membuat jalan → melempar SEBELUM AI dipanggil (tak ada biaya tanpa jejak).

import { createHash } from 'node:crypto'
import type { TenantContext } from '../context'
import { jalankanDenganKonteks, type MetaPanggilanModel } from '@/lib/ai/perekam-panggilan'
import { gagalRun, mulaiRun, selesaiRun, tahCoreAktif, type PeganganRun } from '../tah/agent-run.service'
import { ringkasHasilIntake, teksRingkasanIntake } from '../tah/ringkasan-intake'
import type { KodeGalatRun } from '../tah/tah-policy'
import { modelIntake } from './intake-access'
import type { Proposal } from './intake-policy'
import { jsonKanonik } from './intake-policy'

export type LedgerIntake = { run: PeganganRun; panggilan: MetaPanggilanModel[] }

/** null bila TAH Core mati. Melempar bila TAH Core aktif tapi jalan tak bisa dibuat. */
export async function mulaiLedgerIntake(ctx: TenantContext, a: { kind: string; hash: string }): Promise<LedgerIntake | null> {
  if (!tahCoreAktif()) return null
  const run = await mulaiRun(ctx, { agentKey: 'INTAKE', runType: 'EXTRACT', triggerType: 'HUMAN', inputKind: a.kind, inputHash: a.hash })
  return { run, panggilan: [] }
}

/** Jalankan ekstraksi di dalam konteks model (+ perekam bila ada ledger). */
export function jalankanEkstraksi<T>(ledger: LedgerIntake | null, fn: () => Promise<T>): Promise<T> {
  const m = modelIntake()
  // requireIntake sudah menolak model tak terverifikasi; ini hanya penjaga kedua.
  const model = m.aktif && m.mode === 'EXPLICIT' ? m.model : null
  const kemampuan = m.aktif && m.mode === 'EXPLICIT' ? m.kemampuan : null
  if (!ledger && model === null) return fn()
  return jalankanDenganKonteks(
    { model, kemampuan, catat: ledger ? (p) => void ledger.panggilan.push(p) : undefined },
    fn,
  )
}

export function hashKeluaran(mentah: unknown): string | null {
  try {
    return createHash('sha256').update(jsonKanonik(mentah)).digest('hex')
  } catch {
    return null
  }
}

export async function gagalLedgerIntake(ctx: TenantContext, ledger: LedgerIntake | null, kode: KodeGalatRun): Promise<void> {
  if (!ledger) return
  await gagalRun(ctx, ledger.run, kode, [...ledger.panggilan], null).catch(() => false)
}

export async function selesaiLedgerIntake(
  ctx: TenantContext,
  ledger: LedgerIntake | null,
  a: {
    intakeId: string
    duplikatBalapan: boolean
    classification: string
    proposal: Proposal
    duplicateLevel: string
    outputHash: string | null
  },
): Promise<void> {
  if (!ledger) return
  const ringkasan = ringkasHasilIntake({ classification: a.classification, proposal: a.proposal, duplicateLevel: a.duplicateLevel })
  await selesaiRun(
    ctx,
    ledger.run,
    {
      outcome: a.duplikatBalapan ? 'DUPLICATE_DISCARDED' : 'PROPOSAL_CREATED',
      subjectType: 'VesselCallIntake',
      subjectId: a.intakeId,
      outputHash: a.outputHash,
      resultSummary: teksRingkasanIntake(ringkasan),
      result: ringkasan,
    },
    [...ledger.panggilan],
  ).catch(() => false)
}
