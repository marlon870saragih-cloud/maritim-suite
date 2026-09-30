// Buku besar eksekusi agen TAH — AgentRun + AgentModelCall (PRD-005 Step 3B).
//
// KONTRAK:
//   • mulaiRun   — WAJIB berhasil sebelum panggilan penyedia apa pun (melempar bila
//                  gagal → pemanggil TIDAK memanggil AI: tak ada biaya tanpa jejak).
//   • selesaiRun / gagalRun — BEST-EFFORT: tak pernah melempar ke alur bisnis. Gagal
//                  mencatat hanya dilog (kode saja); jalan yang tertinggal RUNNING
//                  kelak ditandai ABANDONED oleh penyapu (Step 3E) dan penyelesaian
//                  terlambat tetap sah (lateCompletion).
//   • Transisi status hanya lewat mesin murni tah-policy.ts, ditulis compare-and-set
//     pada status yang dibaca (updateMany where { id, status }).
//   • Semua akses lewat forTenant(ctx) — AgentRun/AgentModelCall ada di TENANT_MODELS.
//
// YANG TIDAK PERNAH DISIMPAN: prompt, isi pesan, dokumen, respons penyedia mentah,
// kunci/rahasia. Parameter panggilan disaring daftar izin; teks milik kita dipotong.
// AuditLog hanya memuat id/status/kode (tanpa payload — retensi D3 tetap bermakna).

import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import type { TenantContext } from '../context'
import { forTenant } from '../tenant-db'
import { catatAudit } from '../finance/audit'
import type { MetaPanggilanModel } from '@/lib/ai/perekam-panggilan'
import { AGEN_TAH } from './registry'
import {
  HASIL_RUN,
  KODE_GALAT_RUN,
  MAKS_BYTE_HASIL_RUN,
  MAKS_DETAIL_GALAT,
  MAKS_RINGKASAN_RUN,
  PEMICU_RUN,
  bacaKonfigurasiTahCore,
  jsonMuat,
  potongTeks,
  putuskanPenyelesaianRun,
  saringParameterPanggilan,
  type HasilRun,
  type KodeGalatRun,
  type PemicuRun,
} from './tah-policy'

/** Batas wajar percobaan per jalan (ulang plugin = 2). Kelebihan dibuang, bukan galat. */
export const MAKS_PANGGILAN_PER_RUN = 20

export function tahCoreAktif(): boolean {
  return bacaKonfigurasiTahCore(process.env).aktif
}

export type PeganganRun = { id: string; agentKey: string; startedAt: Date }

export async function mulaiRun(
  ctx: TenantContext,
  a: {
    agentKey: string
    runType: string
    triggerType: PemicuRun
    inputKind?: string | null
    inputHash?: string | null
    idempotencyKey?: string | null
    parentRunId?: string | null
    correlationId?: string | null
    voyageId?: string | null
  },
): Promise<PeganganRun> {
  const agen = AGEN_TAH.find((x) => x.key === a.agentKey)
  if (!agen) throw new Error(`TAH: agen tidak terdaftar (${a.agentKey})`)
  if (!agen.jenisRun.includes(a.runType)) throw new Error(`TAH: jenis run tidak sah untuk ${a.agentKey}`)
  if (!(PEMICU_RUN as readonly string[]).includes(a.triggerType)) throw new Error('TAH: pemicu run tidak sah')

  const startedAt = new Date()
  const run = await forTenant(ctx).agentRun.create({
    data: {
      tenantId: ctx.tenantId,
      agentKey: agen.key,
      agentVersion: agen.versi,
      runType: a.runType,
      triggerType: a.triggerType,
      triggeredByUserId: ctx.system ? null : ctx.userId,
      parentRunId: a.parentRunId ?? null,
      correlationId: a.correlationId ?? randomUUID(),
      idempotencyKey: a.idempotencyKey ?? null,
      status: 'RUNNING',
      startedAt,
      inputKind: a.inputKind ?? null,
      inputHash: a.inputHash ?? null,
      voyageId: a.voyageId ?? null,
    },
    select: { id: true },
  })
  await auditRun(ctx, run.id, 'CREATE', { peristiwa: 'TAH_RUN_STARTED', agentKey: agen.key, status: 'RUNNING' })
  return { id: run.id, agentKey: agen.key, startedAt }
}

const STATUS_PANGGILAN = ['OK', 'ERROR', 'TIMEOUT'] as const
const PROVIDER = ['OPENROUTER', 'FAKE'] as const
const KODE_GALAT_PANGGILAN = ['AI_TIMEOUT', 'AI_UNAVAILABLE', 'AI_BAD_RESPONSE'] as const

function barisPanggilan(ctx: TenantContext, runId: string, m: MetaPanggilanModel, seq: number) {
  const pilih = <T extends string>(v: unknown, daftar: readonly T[], bawaan: T): T =>
    typeof v === 'string' && (daftar as readonly string[]).includes(v) ? (v as T) : bawaan
  const token = (v: number | null | undefined) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null)
  return {
    tenantId: ctx.tenantId,
    agentRunId: runId,
    seq,
    provider: pilih(m.provider, PROVIDER, 'OPENROUTER'),
    requestedModel: potongTeks(m.requestedModel, 200) ?? 'UNKNOWN',
    servedModel: potongTeks(m.servedModel, 200),
    providerRequestId: potongTeks(m.providerRequestId, 200),
    promptId: potongTeks(m.promptId, 100) ?? 'UNKNOWN',
    promptVersion: potongTeks(m.promptVersion, 32) ?? 'UNKNOWN',
    promptHash: potongTeks(m.promptHash, 64) ?? 'UNKNOWN',
    schemaId: potongTeks(m.schemaId, 100),
    schemaVersion: potongTeks(m.schemaVersion, 32),
    params: saringParameterPanggilan(m.params) as Prisma.InputJsonValue,
    status: pilih(m.status, STATUS_PANGGILAN, 'ERROR'),
    errorCode: m.errorCode === null ? null : pilih(m.errorCode, KODE_GALAT_PANGGILAN, 'AI_UNAVAILABLE'),
    latencyMs: Number.isFinite(m.latencyMs) && m.latencyMs >= 0 ? Math.min(Math.round(m.latencyMs), 2_147_483_647) : 0,
    inputTokens: token(m.pemakaian?.inputTokens),
    outputTokens: token(m.pemakaian?.outputTokens),
    cachedInputTokens: token(m.pemakaian?.cachedInputTokens),
    reasoningTokens: token(m.pemakaian?.reasoningTokens),
    // Biaya sengaja tidak diisi sampai spike verifikasi penyedia memastikan maknanya.
    costAmount: null,
    costCurrency: null,
    costSource: null,
  }
}

/** Simpan percobaan panggilan (seq 1..N). Melempar — pemanggil internal menangkapnya. */
export async function catatPanggilanModel(ctx: TenantContext, runId: string, panggilan: readonly MetaPanggilanModel[]): Promise<number> {
  const daftar = panggilan.slice(0, MAKS_PANGGILAN_PER_RUN)
  if (daftar.length === 0) return 0
  const r = await forTenant(ctx).agentModelCall.createMany({
    data: daftar.map((m, i) => barisPanggilan(ctx, runId, m, i + 1)),
    skipDuplicates: true,
  })
  return r.count
}

type Penyelesaian =
  | {
      status: 'SUCCEEDED'
      outcome: HasilRun
      subjectType?: string | null
      subjectId?: string | null
      voyageId?: string | null
      outputHash?: string | null
      resultSummary?: string | null
      result?: unknown
    }
  | { status: 'FAILED'; errorCode: KodeGalatRun; errorDetail?: string | null; outputHash?: string | null }

async function tutupRun(ctx: TenantContext, run: PeganganRun, p: Penyelesaian, panggilan: readonly MetaPanggilanModel[]): Promise<boolean> {
  let lengkap = true
  // 1) percobaan panggilan — terpisah dari status: kegagalan satu tak menahan yang lain.
  try {
    await catatPanggilanModel(ctx, run.id, panggilan)
  } catch (e) {
    lengkap = false
    console.error('[tah] panggilan model tak tercatat', { runId: run.id, kode: kodeGalat(e) })
  }
  // 2) status jalan — compare-and-set lewat mesin murni.
  try {
    const db = forTenant(ctx)
    const kini = await db.agentRun.findFirst({ where: { id: run.id }, select: { status: true, startedAt: true } })
    if (!kini) return false
    const putusan = putuskanPenyelesaianRun(kini.status, p.status)
    if (!putusan.boleh) {
      console.error('[tah] transisi run ditolak', { runId: run.id, dari: kini.status, ke: p.status })
      return false
    }
    const selesai = new Date()
    const dasar = {
      status: p.status,
      lateCompletion: putusan.terlambat,
      finishedAt: selesai,
      durationMs: Math.max(0, selesai.getTime() - kini.startedAt.getTime()),
      outputHash: p.outputHash ?? null,
    }
    const data: Prisma.AgentRunUncheckedUpdateManyInput =
      p.status === 'SUCCEEDED'
        ? {
            ...dasar,
            outcome: (HASIL_RUN as readonly string[]).includes(p.outcome) ? p.outcome : null,
            subjectType: p.subjectType ?? null,
            subjectId: p.subjectId ?? null,
            voyageId: p.voyageId ?? undefined,
            resultSummary: potongTeks(p.resultSummary, MAKS_RINGKASAN_RUN),
            // Hasil di atas batas ukuran tak disimpan (ringkasan teks tetap ada).
            result: p.result !== undefined && jsonMuat(p.result, MAKS_BYTE_HASIL_RUN) ? (p.result as Prisma.InputJsonValue) : undefined,
          }
        : {
            ...dasar,
            errorCode: (KODE_GALAT_RUN as readonly string[]).includes(p.errorCode) ? p.errorCode : 'INTERNAL',
            errorDetail: potongTeks(p.errorDetail, MAKS_DETAIL_GALAT),
          }
    const n = await db.agentRun.updateMany({ where: { id: run.id, status: kini.status }, data })
    if (n.count === 0) return false
    await auditRun(ctx, run.id, 'UPDATE', {
      peristiwa: putusan.terlambat ? 'TAH_RUN_LATE_COMPLETION' : p.status === 'SUCCEEDED' ? 'TAH_RUN_SUCCEEDED' : 'TAH_RUN_FAILED',
      agentKey: run.agentKey,
      status: p.status,
      ...(p.status === 'SUCCEEDED' ? { outcome: p.outcome } : { errorCode: p.errorCode }),
      panggilan: Math.min(panggilan.length, MAKS_PANGGILAN_PER_RUN),
      panggilanTercatat: lengkap,
    })
    return lengkap
  } catch (e) {
    console.error('[tah] status run tak tercatat', { runId: run.id, kode: kodeGalat(e) })
    return false
  }
}

/** Tutup jalan sebagai SUCCEEDED. Tak pernah melempar. */
export function selesaiRun(
  ctx: TenantContext,
  run: PeganganRun,
  a: Omit<Extract<Penyelesaian, { status: 'SUCCEEDED' }>, 'status'>,
  panggilan: readonly MetaPanggilanModel[],
): Promise<boolean> {
  return tutupRun(ctx, run, { status: 'SUCCEEDED', ...a }, panggilan)
}

/** Tutup jalan sebagai FAILED dengan kode tetap. Tak pernah melempar. */
export function gagalRun(
  ctx: TenantContext,
  run: PeganganRun,
  errorCode: KodeGalatRun,
  panggilan: readonly MetaPanggilanModel[],
  errorDetail?: string | null,
): Promise<boolean> {
  return tutupRun(ctx, run, { status: 'FAILED', errorCode, errorDetail }, panggilan)
}

async function auditRun(ctx: TenantContext, runId: string, action: 'CREATE' | 'UPDATE', nilai: Record<string, unknown>): Promise<void> {
  try {
    await catatAudit(ctx, { tableName: 'AgentRun', recordId: runId, action, newValue: nilai })
  } catch (e) {
    // Audit jalan best-effort: baris AgentRun itu sendiri adalah buku besarnya.
    console.error('[tah] audit run tak tercatat', { runId, kode: kodeGalat(e) })
  }
}

function kodeGalat(e: unknown): string {
  if (e && typeof e === 'object' && 'code' in e && typeof (e as { code: unknown }).code === 'string') return (e as { code: string }).code
  return e instanceof Error ? e.name : 'Error'
}
