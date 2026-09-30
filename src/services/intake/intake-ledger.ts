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
import { ruteModelIntakeUntukInput } from '@/lib/ai/model-capabilities'
import { GalatEkstraksi } from '@/lib/ai/vessel-call-extract'
import type { Proposal } from './intake-policy'
import { jsonKanonik } from './intake-policy'

export type LedgerIntake = { run: PeganganRun; panggilan: MetaPanggilanModel[] }

/** null bila TAH Core mati. Melempar bila TAH Core aktif tapi jalan tak bisa dibuat. */
export async function mulaiLedgerIntake(ctx: TenantContext, a: { kind: string; hash: string }): Promise<LedgerIntake | null> {
  if (!tahCoreAktif()) return null
  const run = await mulaiRun(ctx, { agentKey: 'INTAKE', runType: 'EXTRACT', triggerType: 'HUMAN', inputKind: a.kind, inputHash: a.hash })
  return { run, panggilan: [] }
}

/**
 * Jalankan ekstraksi di dalam konteks model (+ perekam bila ada ledger), dengan rute PER JENIS
 * INPUT (PRD-005 D-P1): di dalam cakupan terverifikasi → model + prompt terikat bukti; di luar
 * cakupan → jalur LEGACY eksplisit (model bawaan + Prompt v3). Model & prompt yang BENAR-BENAR
 * dipakai tercatat di AgentModelCall lewat perekam.
 */
export function jalankanEkstraksi<T>(ledger: LedgerIntake | null, jenisInput: string, fn: () => Promise<T>): Promise<T> {
  const r = ruteModelIntakeUntukInput(process.env, jenisInput)
  // requireIntake sudah menolak model tak terverifikasi; ini penjaga kedua — gagal tertutup, tanpa panggilan.
  if (!r.aktif) return Promise.reject(new GalatEkstraksi('AI_UNAVAILABLE'))
  const model = r.rute === 'EXPLICIT' ? r.model : null
  const kemampuan = r.rute === 'EXPLICIT' ? r.kemampuan : null
  const promptIntake = r.rute === 'EXPLICIT' ? r.promptIntake : null
  if (!ledger && model === null) return fn()
  return jalankanDenganKonteks(
    { model, kemampuan, promptIntake, catat: ledger ? (p) => void ledger.panggilan.push(p) : undefined },
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
