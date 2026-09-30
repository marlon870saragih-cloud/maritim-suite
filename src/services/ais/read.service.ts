// Model baca AIS (PRD-003 Step 4) — HANYA MEMBACA. Dipakai UI (posisi terakhir,
// kartu kesehatan) dan voyage-monitoring (fakta AIS). Tidak pernah memanggil
// penyedia; tidak pernah menampilkan kunci atau id penyedia selain namanya.

import type { TenantContext } from '../context'
import { notFound } from '../errors'
import { forTenant } from '../tenant-db'
import { requireAutomation } from '../automation/access'
import type { FaktaAis } from '../automation/monitoring-policy'
import {
  awalBulanBisnisWita,
  bacaKonfigurasiAis,
  intervalEfektifMenit,
  kapalSumberPosisi,
  mmsiTerverifikasi,
  providerDown,
  tenantBolehAis,
  type KonfigurasiAis,
} from './ais-policy'
import { adapterUntuk } from './registry'
import { bacaVoyageAis, kapalVoyageAis } from './vessels'

function konfigurasi(): KonfigurasiAis {
  return bacaKonfigurasiAis(process.env)
}

// ============================================================ fakta monitoring

/**
 * Fakta AIS satu voyage untuk voyage-monitoring, atau null bila AIS mati untuk
 * tenant ini / tanpa penyedia. Hanya kapal SUMBER POSISI (D4) yang disertakan.
 */
export async function faktaAisUntukMonitoring(ctx: TenantContext, voyageId: string): Promise<FaktaAis | null> {
  const k = konfigurasi()
  if (!tenantBolehAis(k, ctx.tenantId) || k.penyedia === 'NONE') return null
  const db = forTenant(ctx)
  const v = await bacaVoyageAis(db, voyageId)
  if (!v) return null

  const provider = k.penyedia
  const sumber = kapalSumberPosisi(kapalVoyageAis(v))
  const [state, terakhir] = await Promise.all([
    db.aisProviderState.findFirst({
      where: { provider },
      select: { id: true, lastSuccessAt: true, consecutiveFailures: true, outageStartedAt: true },
    }),
    Promise.all(
      sumber.map((kp) =>
        db.aisObservation.findFirst({
          where: { vesselId: kp.vesselId, provider },
          orderBy: { positionAt: 'desc' },
          select: { id: true, positionAt: true, fetchedAt: true },
        }),
      ),
    ),
  ])

  return {
    provider,
    ambangStaleJam: k.ambangStaleJam,
    kapal: sumber.map((kp, i) => ({
      vesselId: kp.vesselId,
      nama: kp.nama,
      terverifikasi: mmsiTerverifikasi(kp),
      terakhir: terakhir[i]
        ? { id: terakhir[i]!.id, positionAt: terakhir[i]!.positionAt.toISOString(), fetchedAt: terakhir[i]!.fetchedAt.toISOString() }
        : null,
    })),
    state: state
      ? {
          id: state.id,
          lastSuccessAt: state.lastSuccessAt?.toISOString() ?? null,
          consecutiveFailures: state.consecutiveFailures,
          outageStartedAt: state.outageStartedAt?.toISOString() ?? null,
        }
      : null,
  }
}

// ================================================================ posisi voyage

export type PosisiKapalAis = {
  vesselId: string
  nama: string
  role: string | null
  isPrimary: boolean
  sumberPosisi: boolean
  mmsiTerverifikasi: boolean
  terakhir: {
    positionAt: string
    fetchedAt: string
    lat: number
    lon: number
    sogKnots: number | null
    cogDeg: number | null
    sourceType: string
  } | null
}

export type PosisiAisVoyage =
  | { status: 'NONAKTIF' }
  | { status: 'TANPA_PENYEDIA' }
  | { status: 'AKTIF'; penyedia: string; ambangStaleJam: number; kapal: PosisiKapalAis[] }

export async function posisiAisVoyage(ctx: TenantContext, voyageId: string): Promise<PosisiAisVoyage> {
  requireAutomation(ctx)
  const db = forTenant(ctx)
  const v = await bacaVoyageAis(db, voyageId)
  if (!v || v.deletedAt) throw notFound('Voyage')

  const k = konfigurasi()
  if (!tenantBolehAis(k, ctx.tenantId)) return { status: 'NONAKTIF' }
  if (k.penyedia === 'NONE') return { status: 'TANPA_PENYEDIA' }

  const semua = kapalVoyageAis(v)
  const sumber = new Set(kapalSumberPosisi(semua).map((kp) => kp.vesselId))
  const kapal = await Promise.all(
    semua.map(async (kp): Promise<PosisiKapalAis> => {
      const terverifikasi = mmsiTerverifikasi(kp)
      const o = sumber.has(kp.vesselId) && terverifikasi
        ? await db.aisObservation.findFirst({
            where: { vesselId: kp.vesselId, provider: k.penyedia },
            orderBy: { positionAt: 'desc' },
            select: { positionAt: true, fetchedAt: true, lat: true, lon: true, sogKnots: true, cogDeg: true, sourceType: true },
          })
        : null
      return {
        vesselId: kp.vesselId,
        nama: kp.nama,
        role: kp.role,
        isPrimary: kp.isPrimary,
        sumberPosisi: sumber.has(kp.vesselId),
        mmsiTerverifikasi: terverifikasi,
        terakhir: o
          ? { positionAt: o.positionAt.toISOString(), fetchedAt: o.fetchedAt.toISOString(), lat: o.lat, lon: o.lon, sogKnots: o.sogKnots, cogDeg: o.cogDeg, sourceType: o.sourceType }
          : null,
      }
    }),
  )
  return { status: 'AKTIF', penyedia: k.penyedia, ambangStaleJam: k.ambangStaleJam, kapal }
}

// ================================================================== kesehatan

export type KesehatanAis =
  | { aktif: false; alasan: string }
  | {
      aktif: true
      penyedia: string
      terkonfigurasi: boolean
      intervalMenit: number
      ambangStaleJam: number
      /** null = belum ditetapkan (D5) → tanpa panggilan penyedia. */
      kuotaBulanan: number | null
      panggilanBulanIni: number
      runTerakhir: {
        startedAt: string
        finishedAt: string | null
        status: string
        providerCalls: number
        observationsAccepted: number
        duplicates: number
        rejected: number
        noData: number
        vesselsRequested: number
        vesselsSkippedUnverified: number
        errorCode: string | null
      } | null
      suksesTerakhirPada: string | null
      gagalBeruntun: number
      backoffSampai: string | null
      providerDown: boolean
    }

export async function kesehatanAis(ctx: TenantContext): Promise<KesehatanAis> {
  requireAutomation(ctx)
  const k = konfigurasi()
  if (!tenantBolehAis(k, ctx.tenantId)) return { aktif: false, alasan: k.alasan ?? 'TENANT_TIDAK_DIIZINKAN' }

  const db = forTenant(ctx)
  const sekarang = new Date()
  const adapter = adapterUntuk(k.penyedia)
  const provider = k.penyedia
  const [state, run, bulanIni] = await Promise.all([
    db.aisProviderState.findFirst({ where: { provider } }),
    db.aisPollRun.findFirst({ where: { provider }, orderBy: { startedAt: 'desc' } }),
    db.aisPollRun.aggregate({ where: { startedAt: { gte: awalBulanBisnisWita(sekarang) } }, _sum: { providerCalls: true } }),
  ])

  return {
    aktif: true,
    penyedia: provider,
    terkonfigurasi: provider !== 'NONE' && !!adapter && adapter.configured(process.env),
    intervalMenit: adapter ? intervalEfektifMenit(k, adapter.capabilities) : k.intervalMenit,
    ambangStaleJam: k.ambangStaleJam,
    kuotaBulanan: k.kuotaBulanan,
    panggilanBulanIni: bulanIni._sum.providerCalls ?? 0,
    runTerakhir: run
      ? {
          startedAt: run.startedAt.toISOString(),
          finishedAt: run.finishedAt?.toISOString() ?? null,
          status: run.status,
          providerCalls: run.providerCalls,
          observationsAccepted: run.observationsAccepted,
          duplicates: run.duplicates,
          rejected: run.rejectedInvalid + run.rejectedStale + run.rejectedMismatch,
          noData: run.noData,
          vesselsRequested: run.vesselsRequested,
          vesselsSkippedUnverified: run.vesselsSkippedUnverified,
          errorCode: run.errorCode,
        }
      : null,
    suksesTerakhirPada: state?.lastSuccessAt?.toISOString() ?? null,
    gagalBeruntun: state?.consecutiveFailures ?? 0,
    backoffSampai: state?.backoffUntil && state.backoffUntil.getTime() > sekarang.getTime() ? state.backoffUntil.toISOString() : null,
    providerDown: providerDown(state, sekarang),
  }
}

/** Status penyedia untuk kartu kesehatan Automation Hub (menggantikan teks "Step 5C"). */
export function penyediaAisUntukTenant(tenantId: string): { terkonfigurasi: boolean; nama: string | null } {
  const k = konfigurasi()
  return tenantBolehAis(k, tenantId) && k.penyedia !== 'NONE'
    ? { terkonfigurasi: true, nama: k.penyedia }
    : { terkonfigurasi: false, nama: null }
}
