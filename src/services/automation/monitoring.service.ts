// Automation Hub — layanan pemantauan voyage internal (PRD-002 Step 5B).
//
// SOURCE → MONITOR → DETECT → RECORD → DISPLAY → ACKNOWLEDGE.
//
// BATAS TULIS (dikunci uji check-automation-policy.mjs & check-automation-api.mjs):
//   BOLEH ditulis : MonitoredVoyage, MonitoringRun, MonitoringSignal,
//                   Notification (lewat notify(), hanya WARNING/ERROR, internal),
//                   AuditLog (jejak perubahan status PEMANTAUAN, tableName
//                   'MonitoredVoyage' — bukan jejak voyage).
//   HANYA dibaca  : Voyage, VoyageVessel, Vessel, VoyageEvent, AuditLog, Task, User.
// Tidak ada LLM, tidak ada panggilan jaringan, tidak ada penyedia AIS.
//
// Idempotensi: @@unique([tenantId, dedupeKey]) pada MonitoringSignal adalah
// penjaga terakhir. Dua jalan bersamaan untuk perubahan yang sama → satu baris;
// yang kalah mendapat P2002 dan dihitung `dilewati` (pola Step 3).

import { Prisma, type Role } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { tanggalBisnis, waktuBisnis } from '@/lib/business-time'
import { systemContext, type TenantContext } from '../context'
import { conflict, notFound, validation } from '../errors'
import { pilihan, str, wajib } from '../input'
import { forTenant } from '../tenant-db'
import { notify } from '../notification.service'
import { catatAudit } from '../finance/audit'
import { kunciTanggal } from '../master/voyage-dates'
import { LABEL_PERISTIWA, USUL_JANGKAR, type KodePeristiwa } from '../ops/event-codes'
import { konfigurasiAutomation, requireAutomation } from './access'
import {
  AGEN_MONITORING,
  DataSumberTidakSah,
  SEVERITY,
  STATUS_BERHENTI,
  STATUS_REVIEW,
  VERSI_AGEN,
  alasanBerhenti,
  deteksiSinyal,
  sinyalGalatMonitoring,
  type CalonSinyal,
  type FaktaVoyage,
  type JenisSinyal,
  type OpsiKebijakan,
} from './monitoring-policy'
import { statusPenyedia, type StatusPenyedia } from './provider'

/** Batas kerja per jalan per tenant (pola BATAS_NOTIFIKASI_PER_JALAN, K102). */
const BATAS_VOYAGE_PER_JALAN = 200
const BATAS_BARIS_SUMBER = 500
const BATAS_CATATAN_REVIEW = 500
const PERAN_PENERIMA: Role[] = ['ADMIN', 'MANAJER_OPERASI']
const JAM = 3_600_000

const JUDUL_SINYAL: Record<JenisSinyal, string> = {
  ETA_CHANGED: 'Perubahan ETA/ETD',
  VOYAGE_STATUS_CHANGED: 'Perubahan status voyage',
  OPERATIONAL_EVENT_RECORDED: 'Peristiwa operasional dicatat',
  ACTUAL_DATE_MISSING: 'Tanggal aktual belum lengkap',
  DATA_STALE: 'Voyage tanpa pembaruan',
  MONITORING_ERROR: 'Galat pemantauan',
}

// ================================================================= penulisan

type HasilSimpan = 'DIBUAT' | 'DUPLIKAT'

async function simpanSinyal(ctx: TenantContext, voyageId: string, runId: string, c: CalonSinyal): Promise<HasilSimpan> {
  try {
    await forTenant(ctx).monitoringSignal.create({
      data: {
        tenantId: ctx.tenantId,
        voyageId,
        runId,
        kind: c.kind,
        severity: c.severity,
        dedupeKey: c.dedupeKey,
        sourceType: c.sourceType,
        sourceRef: c.sourceRef,
        sourceAt: c.sourceAt ? new Date(c.sourceAt) : null,
        before: c.before === null ? Prisma.DbNull : c.before,
        after: c.after === null ? Prisma.DbNull : c.after,
        explanation: c.explanation,
        recommendation: c.recommendation,
      },
    })
    return 'DIBUAT'
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return 'DUPLIKAT'
    throw e
  }
}

/**
 * WARNING/ERROR → satu Notification per ADMIN/MANAJER_OPERASI aktif tenant ini.
 * Kunci dedupe notifikasi diturunkan dari kunci sinyal, jadi notifikasi hanya
 * lahir sekali per sinyal per penerima. Tidak ada email, WhatsApp, atau portal.
 */
async function kabariInternal(ctx: TenantContext, voyageId: string, c: CalonSinyal): Promise<void> {
  if (c.severity === 'INFO') return
  const penerima = await forTenant(ctx).user.findMany({
    where: { role: { in: PERAN_PENERIMA }, isActive: true },
    select: { id: true },
    orderBy: { id: 'asc' },
  })
  for (const u of penerima) {
    await notify(ctx, {
      type: 'AUTOMATION_SIGNAL',
      userId: u.id,
      title: `${c.severity === 'ERROR' ? 'Galat' : 'Perlu perhatian'}: ${JUDUL_SINYAL[c.kind]}`,
      message: c.explanation.slice(0, 300),
      entityType: 'VOYAGE',
      entityId: voyageId,
      href: '/automation/alerts',
      dedupeKey: `AH:${c.dedupeKey}:${u.id}`,
    })
  }
}

/** Hentikan pemantauan karena keadaan voyage; sinyal yang masih OPEN → EXPIRED. */
async function hentikanOtomatis(
  ctx: TenantContext,
  m: { id: string; voyageId: string },
  alasan: string,
): Promise<void> {
  const db = forTenant(ctx)
  const n = await db.monitoredVoyage.updateMany({
    where: { id: m.id, enabled: true },
    data: { enabled: false, stoppedAt: new Date(), stopReason: alasan },
  })
  await db.monitoringSignal.updateMany({
    where: { voyageId: m.voyageId, reviewState: 'OPEN' },
    data: { reviewState: 'EXPIRED' },
  })
  if (n.count > 0) {
    await catatAudit(ctx, {
      tableName: 'MonitoredVoyage',
      recordId: m.id,
      action: 'UPDATE',
      oldValue: { enabled: true },
      newValue: { enabled: false, stopReason: alasan, voyageId: m.voyageId },
    })
  }
}

// ================================================================== pembacaan

async function bacaFakta(ctx: TenantContext, m: { voyageId: string; startedAt: Date }): Promise<FaktaVoyage | null> {
  const db = forTenant(ctx)
  const v = await db.voyage.findFirst({
    where: { id: m.voyageId },
    select: {
      id: true, voyageNumber: true, status: true, deletedAt: true,
      eta: true, etd: true, ata: true, atb: true, atd: true, updatedAt: true,
    },
  })
  if (!v) return null

  const [audit, peristiwa, auditTerakhir, peristiwaTerakhir, tugasTerakhir] = await Promise.all([
    db.auditLog.findMany({
      where: { tableName: 'Voyage', recordId: v.id, createdAt: { gte: m.startedAt } },
      orderBy: { createdAt: 'asc' },
      take: BATAS_BARIS_SUMBER,
      select: { id: true, createdAt: true, oldValue: true, newValue: true },
    }),
    db.voyageEvent.findMany({
      where: { voyageId: v.id, deletedAt: null },
      orderBy: { occurredAt: 'asc' },
      take: BATAS_BARIS_SUMBER,
      select: { id: true, eventCode: true, occurredAt: true, createdAt: true },
    }),
    db.auditLog.findFirst({
      where: { tableName: 'Voyage', recordId: v.id },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    db.voyageEvent.findFirst({ where: { voyageId: v.id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    db.task.findFirst({ where: { voyageId: v.id }, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
  ])

  const aktivitas = [v.updatedAt, auditTerakhir?.createdAt, peristiwaTerakhir?.createdAt, tugasTerakhir?.updatedAt]
    .filter((d): d is Date => d instanceof Date)
    .reduce<number | null>((maks, d) => (maks === null || d.getTime() > maks ? d.getTime() : maks), null)

  return {
    voyageId: v.id,
    voyageNumber: v.voyageNumber,
    status: v.status,
    dihapus: v.deletedAt !== null,
    tanggal: {
      eta: kunciTanggal(v.eta),
      etd: kunciTanggal(v.etd),
      ata: kunciTanggal(v.ata),
      atb: kunciTanggal(v.atb),
      atd: kunciTanggal(v.atd),
    },
    audit: audit.map((a) => ({ id: a.id, pada: a.createdAt.toISOString(), lama: a.oldValue, baru: a.newValue })),
    peristiwa: peristiwa.map((p) => ({
      id: p.id,
      kode: p.eventCode,
      terjadi: p.occurredAt.toISOString(),
      dicatat: p.createdAt.toISOString(),
    })),
    aktivitasTerakhir: aktivitas === null ? null : new Date(aktivitas).toISOString(),
    mulaiPantau: m.startedAt.toISOString(),
  }
}

// ======================================================================= job

export type HasilMonitoringTenant = {
  tenant: string
  runId: string | null
  status: 'OK' | 'PARTIAL' | 'FAILED'
  voyagesChecked: number
  dihentikan: number
  /** Sinyal baru. Nama kolom mengikuti ringkasan /api/jobs/run (pola reminder). */
  dibuat: number
  /** Sinyal yang sudah ada (tabrakan dedupeKey). */
  dilewati: number
  /** Voyage di atas batas per jalan — diproses jalan berikutnya. */
  dibatasi: number
  /** Voyage yang gagal diproses. > 0 → /api/jobs/run membalas ok:false. */
  gagal: number
  galat?: string
}

export type OpsiJalanMonitoring = { sekarang?: Date }

export async function jalankanMonitoringTenant(
  tenantId: string,
  opsi: OpsiJalanMonitoring = {},
): Promise<HasilMonitoringTenant> {
  const ctx = systemContext(tenantId, 'automation:voyage-monitoring')
  requireAutomation(ctx)
  const sekarang = opsi.sekarang ?? new Date()
  const db = forTenant(ctx)

  const run = await db.monitoringRun.create({
    data: { tenantId, agent: AGEN_MONITORING, agentVersion: VERSI_AGEN, startedAt: sekarang, status: 'RUNNING' },
    select: { id: true },
  })

  const hasil: HasilMonitoringTenant = {
    tenant: tenantId, runId: run.id, status: 'OK',
    voyagesChecked: 0, dihentikan: 0, dibuat: 0, dilewati: 0, dibatasi: 0, gagal: 0,
  }

  const daftar = await db.monitoredVoyage.findMany({
    where: { enabled: true },
    orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
    take: BATAS_VOYAGE_PER_JALAN + 1,
    select: { id: true, voyageId: true, startedAt: true },
  })
  hasil.dibatasi = Math.max(0, daftar.length - BATAS_VOYAGE_PER_JALAN)

  const kebijakan: OpsiKebijakan = {
    sekarang,
    hariBisnis: tanggalBisnis(sekarang),
    petaJangkar: USUL_JANGKAR,
    labelPeristiwa: (kode) => LABEL_PERISTIWA.id[kode as KodePeristiwa] ?? kode,
    formatWaktu: (iso) => waktuBisnis(new Date(iso)),
  }

  const catat = async (voyageId: string, c: CalonSinyal) => {
    if ((await simpanSinyal(ctx, voyageId, run.id, c)) === 'DIBUAT') {
      hasil.dibuat++
      await kabariInternal(ctx, voyageId, c)
    } else {
      hasil.dilewati++
    }
  }

  // Kunci yang SUDAH ada disaring lebih dulu (pola kunciYangSudahAda di reminder-job).
  // Tiap jam voyage dicek ulang sejak awal pemantauan; create yang pasti bertabrakan
  // akan dicatat Prisma sebagai `prisma:error` di log produksi (log: ['error']) dan
  // menutupi galat sungguhan. P2002 di simpanSinyal() tetap jadi penjaga balapan
  // untuk dua jalan yang benar-benar bersamaan.
  const catatBaru = async (voyageId: string, calon: CalonSinyal[]) => {
    if (calon.length === 0) return
    const sudahAda = new Set(
      (
        await db.monitoringSignal.findMany({ where: { dedupeKey: { in: calon.map((c) => c.dedupeKey) } }, select: { dedupeKey: true } })
      ).map((r) => r.dedupeKey),
    )
    for (const c of calon) {
      if (sudahAda.has(c.dedupeKey)) hasil.dilewati++
      else await catat(voyageId, c)
    }
  }

  for (const m of daftar.slice(0, BATAS_VOYAGE_PER_JALAN)) {
    let nomor: string | null = null
    try {
      const fakta = await bacaFakta(ctx, m)
      if (!fakta) {
        await hentikanOtomatis(ctx, m, 'VOYAGE_DELETED')
        hasil.dihentikan++
        continue
      }
      nomor = fakta.voyageNumber
      const berhenti = alasanBerhenti(fakta)
      if (berhenti) {
        await hentikanOtomatis(ctx, m, berhenti)
        hasil.dihentikan++
        continue
      }
      await catatBaru(m.voyageId, deteksiSinyal(fakta, kebijakan))
      await db.monitoredVoyage.updateMany({ where: { id: m.id, enabled: true }, data: { lastCheckedAt: sekarang } })
      hasil.voyagesChecked++
    } catch (e) {
      // Satu voyage bermasalah tidak menghentikan voyage lain. Detail teknis
      // hanya ke log server; sinyal hanya membawa kode galat.
      hasil.gagal++
      const kode = e instanceof DataSumberTidakSah ? e.code : 'GALAT_INTERNAL'
      console.error(`[automation] voyage ${m.voyageId} gagal diproses: ${e instanceof Error ? e.name : 'Error'}`)
      try {
        await catatBaru(m.voyageId, [sinyalGalatMonitoring(m.voyageId, nomor, kode, sekarang)])
      } catch (e2) {
        console.error(`[automation] sinyal galat voyage ${m.voyageId} tak tersimpan: ${e2 instanceof Error ? e2.name : 'Error'}`)
      }
    }
  }

  hasil.status = hasil.gagal === 0 ? 'OK' : hasil.voyagesChecked > 0 || hasil.dihentikan > 0 ? 'PARTIAL' : 'FAILED'
  await db.monitoringRun.updateMany({
    where: { id: run.id },
    data: {
      finishedAt: new Date(),
      status: hasil.status,
      voyagesChecked: hasil.voyagesChecked,
      voyagesFailed: hasil.gagal,
      signalsCreated: hasil.dibuat,
      signalsSkipped: hasil.dilewati,
      errorCode: hasil.gagal > 0 ? 'VOYAGE_GAGAL' : null,
    },
  })
  return hasil
}

/**
 * Dipanggil POST /api/jobs/run?job=voyage-monitoring. Hanya tenant di allowlist
 * id; fitur mati → tidak ada yang diproses sama sekali.
 */
export async function jalankanMonitoringSemuaTenant(
  opsi: OpsiJalanMonitoring = {},
): Promise<HasilMonitoringTenant[] | { nonaktif: true; alasan: string | null }> {
  const k = konfigurasiAutomation()
  if (!k.aktif) return { nonaktif: true, alasan: k.alasan }

  const hasil: HasilMonitoringTenant[] = []
  for (const tenantId of Array.from(k.tenantIds).sort()) {
    const kosong: HasilMonitoringTenant = {
      tenant: tenantId, runId: null, status: 'FAILED',
      voyagesChecked: 0, dihentikan: 0, dibuat: 0, dilewati: 0, dibatasi: 0, gagal: 1,
    }
    const ada = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } })
    if (!ada) {
      hasil.push({ ...kosong, galat: 'TENANT_TIDAK_ADA' })
      continue
    }
    try {
      hasil.push(await jalankanMonitoringTenant(tenantId, opsi))
    } catch (e) {
      console.error(`[automation] tenant ${tenantId} gagal: ${e instanceof Error ? e.name : 'Error'}`)
      hasil.push({ ...kosong, galat: 'GALAT_INTERNAL' })
    }
  }
  return hasil
}

// ============================================================== API: pemantauan

export type KesehatanPemantauan = 'SEHAT' | 'TERLAMBAT' | 'BELUM_DICEK' | 'BERHENTI'

export type BarisPemantauan = {
  id: string
  voyageId: string
  voyageNumber: string
  voyageStatus: string
  kapalUtama: string | null
  kapalTerkait: { name: string; role: string | null }[]
  enabled: boolean
  startedAt: string
  stoppedAt: string | null
  stopReason: string | null
  lastCheckedAt: string | null
  kesehatan: KesehatanPemantauan
  sinyalTerbuka: number
  sinyalTerakhir: { kind: string; severity: string; detectedAt: string; explanation: string } | null
}

export type VoyageBisaDipantau = { id: string; voyageNumber: string; status: string; kapal: string | null }

export async function listPemantauan(
  ctx: TenantContext,
): Promise<{ pemantauan: BarisPemantauan[]; bisaDipantau: VoyageBisaDipantau[] }> {
  requireAutomation(ctx)
  const db = forTenant(ctx)
  const sekarang = Date.now()

  const rows = await db.monitoredVoyage.findMany({
    orderBy: [{ enabled: 'desc' }, { startedAt: 'desc' }],
    take: 200,
    include: {
      voyage: {
        select: {
          voyageNumber: true,
          status: true,
          vesselId: true,
          vessel: { select: { name: true } },
          vessels: { orderBy: { sortOrder: 'asc' }, select: { role: true, vessel: { select: { id: true, name: true } } } },
        },
      },
    },
  })
  const ids = rows.map((r) => r.voyageId)
  const sinyal = ids.length
    ? await db.monitoringSignal.findMany({
        where: { voyageId: { in: ids } },
        orderBy: { detectedAt: 'desc' },
        take: 2000,
        select: { voyageId: true, kind: true, severity: true, detectedAt: true, explanation: true, reviewState: true },
      })
    : []

  const pemantauan = rows.map((r): BarisPemantauan => {
    const milik = sinyal.filter((s) => s.voyageId === r.voyageId)
    const terakhir = milik[0]
    const kesehatan: KesehatanPemantauan = !r.enabled
      ? 'BERHENTI'
      : !r.lastCheckedAt
        ? 'BELUM_DICEK'
        : sekarang - r.lastCheckedAt.getTime() <= 2 * JAM
          ? 'SEHAT'
          : 'TERLAMBAT'
    return {
      id: r.id,
      voyageId: r.voyageId,
      voyageNumber: r.voyage.voyageNumber,
      voyageStatus: r.voyage.status,
      kapalUtama: r.voyage.vessel?.name ?? null,
      kapalTerkait: r.voyage.vessels
        .filter((vv) => vv.vessel.id !== r.voyage.vesselId)
        .map((vv) => ({ name: vv.vessel.name, role: vv.role })),
      enabled: r.enabled,
      startedAt: r.startedAt.toISOString(),
      stoppedAt: r.stoppedAt?.toISOString() ?? null,
      stopReason: r.stopReason,
      lastCheckedAt: r.lastCheckedAt?.toISOString() ?? null,
      kesehatan,
      sinyalTerbuka: milik.filter((s) => s.reviewState === 'OPEN').length,
      sinyalTerakhir: terakhir
        ? {
            kind: terakhir.kind,
            severity: terakhir.severity,
            detectedAt: terakhir.detectedAt.toISOString(),
            explanation: terakhir.explanation,
          }
        : null,
    }
  })

  const kandidat = await db.voyage.findMany({
    where: {
      deletedAt: null,
      status: { notIn: [...STATUS_BERHENTI] },
      monitoring: { none: { enabled: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: { id: true, voyageNumber: true, status: true, vessel: { select: { name: true } } },
  })

  return {
    pemantauan,
    bisaDipantau: kandidat.map((v) => ({ id: v.id, voyageNumber: v.voyageNumber, status: v.status, kapal: v.vessel?.name ?? null })),
  }
}

export async function mulaiPemantauan(ctx: TenantContext, body: Record<string, unknown>): Promise<{ id: string; voyageId: string }> {
  requireAutomation(ctx)
  const voyageId = wajib(str(body.voyageId), 'Voyage')
  const db = forTenant(ctx)

  // tenantId dari body TIDAK pernah dipakai: kepemilikan dibuktikan lewat tenant-guard.
  const voyage = await db.voyage.findFirst({ where: { id: voyageId, deletedAt: null }, select: { id: true, status: true } })
  if (!voyage) throw notFound('Voyage')
  if ((STATUS_BERHENTI as readonly string[]).includes(voyage.status)) {
    throw validation('Voyage berstatus CLOSED atau CANCELLED tidak bisa dipantau.')
  }

  const ada = await db.monitoredVoyage.findFirst({ where: { voyageId }, select: { id: true, enabled: true } })
  if (ada?.enabled) throw conflict('Voyage ini sudah dipantau.')

  const sekarang = new Date()
  let id: string
  if (ada) {
    const n = await db.monitoredVoyage.updateMany({
      where: { id: ada.id, enabled: false },
      data: { enabled: true, startedAt: sekarang, startedByUserId: ctx.userId, stoppedAt: null, stopReason: null, lastCheckedAt: null },
    })
    if (n.count === 0) throw conflict('Voyage ini sudah dipantau.')
    id = ada.id
  } else {
    try {
      const baru = await db.monitoredVoyage.create({
        data: { tenantId: ctx.tenantId, voyageId, startedAt: sekarang, startedByUserId: ctx.userId },
        select: { id: true },
      })
      id = baru.id
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw conflict('Voyage ini sudah dipantau.')
      throw e
    }
  }

  await catatAudit(ctx, {
    tableName: 'MonitoredVoyage',
    recordId: id,
    action: ada ? 'UPDATE' : 'CREATE',
    oldValue: ada ? { enabled: false } : undefined,
    newValue: { enabled: true, voyageId },
  })
  return { id, voyageId }
}

export async function hentikanPemantauan(ctx: TenantContext, id: string): Promise<void> {
  requireAutomation(ctx)
  const db = forTenant(ctx)
  const n = await db.monitoredVoyage.updateMany({
    where: { id, enabled: true },
    data: { enabled: false, stoppedAt: new Date(), stopReason: 'MANUAL' },
  })
  if (n.count === 0) {
    const ada = await db.monitoredVoyage.findFirst({ where: { id }, select: { id: true } })
    if (!ada) throw notFound('Pemantauan')
    throw conflict('Pemantauan voyage ini sudah berhenti.')
  }
  await catatAudit(ctx, {
    tableName: 'MonitoredVoyage',
    recordId: id,
    action: 'UPDATE',
    oldValue: { enabled: true },
    newValue: { enabled: false, stopReason: 'MANUAL' },
  })
}

// ================================================================= API: sinyal

export type SinyalDto = {
  id: string
  voyageId: string
  voyageNumber: string
  runId: string | null
  kind: string
  severity: string
  sourceType: string
  sourceRef: string | null
  sourceAt: string | null
  detectedAt: string
  before: unknown
  after: unknown
  explanation: string
  recommendation: string
  reviewState: string
  reviewedByName: string | null
  reviewedAt: string | null
  reviewNote: string | null
}

const PILIH_SINYAL = {
  id: true, voyageId: true, runId: true, kind: true, severity: true, sourceType: true, sourceRef: true,
  sourceAt: true, detectedAt: true, before: true, after: true, explanation: true, recommendation: true,
  reviewState: true, reviewedByName: true, reviewedAt: true, reviewNote: true,
  voyage: { select: { voyageNumber: true } },
} as const

type BarisSinyal = Prisma.MonitoringSignalGetPayload<{ select: typeof PILIH_SINYAL }>

const keDto = (s: BarisSinyal): SinyalDto => ({
  id: s.id,
  voyageId: s.voyageId,
  voyageNumber: s.voyage.voyageNumber,
  runId: s.runId,
  kind: s.kind,
  severity: s.severity,
  sourceType: s.sourceType,
  sourceRef: s.sourceRef,
  sourceAt: s.sourceAt?.toISOString() ?? null,
  detectedAt: s.detectedAt.toISOString(),
  before: s.before,
  after: s.after,
  explanation: s.explanation,
  recommendation: s.recommendation,
  reviewState: s.reviewState,
  reviewedByName: s.reviewedByName,
  reviewedAt: s.reviewedAt?.toISOString() ?? null,
  reviewNote: s.reviewNote,
})

export async function listSinyal(ctx: TenantContext, q: URLSearchParams): Promise<SinyalDto[]> {
  requireAutomation(ctx)
  const voyageId = str(q.get('voyageId'))
  const state = q.get('state') ? pilihan(q.get('state'), STATUS_REVIEW, 'Status review') : null
  const severity = q.get('severity') ? pilihan(q.get('severity'), SEVERITY, 'Severity') : null
  const takeMentah = Number(q.get('take') ?? 100)
  const take = Number.isInteger(takeMentah) && takeMentah >= 1 && takeMentah <= 200 ? takeMentah : 100

  const rows = await forTenant(ctx).monitoringSignal.findMany({
    where: {
      ...(voyageId ? { voyageId } : {}),
      ...(state ? { reviewState: state } : {}),
      ...(severity ? { severity } : {}),
    },
    orderBy: [{ detectedAt: 'desc' }, { id: 'desc' }],
    take,
    select: PILIH_SINYAL,
  })
  return rows.map(keDto)
}

export async function reviewSinyal(ctx: TenantContext, id: string, body: Record<string, unknown>): Promise<SinyalDto> {
  requireAutomation(ctx)
  const keputusan = pilihan(body.decision, ['ACKNOWLEDGE', 'DISMISS'] as const, 'Keputusan')
  const catatan = str(body.note)
  if (catatan && catatan.length > BATAS_CATATAN_REVIEW) {
    throw validation(`Catatan maksimal ${BATAS_CATATAN_REVIEW} karakter.`)
  }
  const db = forTenant(ctx)
  const pengguna = await db.user.findFirst({ where: { id: ctx.userId }, select: { name: true } })

  // Hanya OPEN yang boleh ditinjau; peninjauan tidak menyentuh data voyage apa pun.
  const n = await db.monitoringSignal.updateMany({
    where: { id, reviewState: 'OPEN' },
    data: {
      reviewState: keputusan === 'ACKNOWLEDGE' ? 'ACKNOWLEDGED' : 'DISMISSED',
      reviewedByUserId: ctx.userId,
      reviewedByName: pengguna?.name ?? null,
      reviewedAt: new Date(),
      reviewNote: catatan,
    },
  })
  if (n.count === 0) {
    const ada = await db.monitoringSignal.findFirst({ where: { id }, select: { reviewState: true } })
    if (!ada) throw notFound('Sinyal')
    throw conflict(`Sinyal sudah berstatus ${ada.reviewState}.`)
  }
  const row = await db.monitoringSignal.findFirst({ where: { id }, select: PILIH_SINYAL })
  if (!row) throw notFound('Sinyal')
  return keDto(row)
}

// =============================================================== API: kesehatan

export type KesehatanAutomation = {
  agen: string
  versi: string
  runTerakhir: {
    startedAt: string
    finishedAt: string | null
    status: string
    voyagesChecked: number
    voyagesFailed: number
    signalsCreated: number
    signalsSkipped: number
    errorCode: string | null
  } | null
  suksesTerakhirPada: string | null
  voyageDipantau: number
  sinyalTerbuka: number
  penyedia: StatusPenyedia
}

export async function kesehatanAutomation(ctx: TenantContext): Promise<KesehatanAutomation> {
  requireAutomation(ctx)
  const db = forTenant(ctx)
  const [run, ok, dipantau, terbuka] = await Promise.all([
    db.monitoringRun.findFirst({ orderBy: { startedAt: 'desc' } }),
    db.monitoringRun.findFirst({ where: { status: 'OK' }, orderBy: { startedAt: 'desc' }, select: { startedAt: true } }),
    db.monitoredVoyage.count({ where: { enabled: true } }),
    db.monitoringSignal.count({ where: { reviewState: 'OPEN' } }),
  ])
  return {
    agen: AGEN_MONITORING,
    versi: VERSI_AGEN,
    runTerakhir: run
      ? {
          startedAt: run.startedAt.toISOString(),
          finishedAt: run.finishedAt?.toISOString() ?? null,
          status: run.status,
          voyagesChecked: run.voyagesChecked,
          voyagesFailed: run.voyagesFailed,
          signalsCreated: run.signalsCreated,
          signalsSkipped: run.signalsSkipped,
          errorCode: run.errorCode,
        }
      : null,
    suksesTerakhirPada: ok?.startedAt.toISOString() ?? null,
    voyageDipantau: dipantau,
    sinyalTerbuka: terbuka,
    penyedia: statusPenyedia(),
  }
}
