// Komunikasi klien WA-1 — layanan Prepare / Candidate / Pratinjau (Step 2C).
//
// MonitoringSignal → candidate → revalidasi sumber #1 → render deterministik →
// revisi CommunicationMessage immutable → pratinjau. BERHENTI sebelum approval:
// tak ada approval, tak ada Send, tak ada CommunicationAttempt, tak ada jaringan.
//
// Aturan keras (audit 2C-0 + keputusan owner D-2C-01..06):
//   • Pemanggil hanya menyodorkan PENGENAL (signalId / candidateId / messageId,
//     id fixture, bahasa). Tenant HANYA dari ctx; seluruh fakta dibaca ulang di
//     server lewat forTenant(ctx). Id milik tenant lain → NOT_FOUND (tanpa bocor).
//   • Induk SELALU dimuat lewat klien tenant DI DALAM transaksi yang menulis anak
//     (D-2B-06: DB sengaja tanpa FK komposit).
//   • Mutasi + AuditLog dalam SATU transaksi (catatAudit dengan tx, D-2C-02):
//     audit gagal → mutasi batal.
//   • Hasil bisnis (BLOCKED, ditolak-bisa-pulih, idempoten) = union bertipe;
//     exception hanya untuk otorisasi, NOT_FOUND, infrastruktur, dan konflik
//     konkurensi yang tak terselesaikan setelah MAKS_PERCOBAAN_TX (D-2C-06).
//
// BATAS JUJUR (READ COMMITTED): revalidasi #1 bukan gerbang pengiriman terakhir.
// Sumber yang dihapus/diubah SESUDAH revalidasi di sini bisa meninggalkan revisi
// DRAFT — dapat diterima karena Step 2C tak punya jalur Send; Send (2E) WAJIB
// merevalidasi lagi. Urutan AuditLog (Q5) pun bukan urutan commit yang ketat
// (createdAt diisi jam proses aplikasi, presisi ms; D-2C-03) — aturan Q5 sengaja
// konservatif (waktu sama = menyalip) dan 2E tetap gerbang final.

import { Prisma } from '@prisma/client'
import type { TenantContext } from '../context'
import { conflict, forbidden, notFound, validation } from '../errors'
import { forTenant, type TenantDb } from '../tenant-db'
import { catatAudit, type EntriAudit } from '../finance/audit'
import { requireAutomation } from '../automation/access'
import { kunciTanggal } from '../master/voyage-dates'
import {
  MEDAN_JADWAL,
  MODE_KOMUNIKASI,
  bacaKonfigurasiKomunikasi,
  kelayakanGrupSinyal,
  kelompokkanSinyal,
  klasifikasiSinyal,
  nilaiSumberJadwal,
  nilaiSumberMilestone,
  sifatAlasanPrepare,
  teksKunciCandidate,
  teksKunciPesanLogis,
  transisiPesanSah,
  type FaktaKanonikJadwal,
  type FaktaKanonikMilestone,
  type FaktaPort,
  type FaktaVoyage,
  type Hasil,
  type KeluargaEvent,
  type KodeAlasan,
  type KunciCandidate,
  type SinyalMasuk,
} from './comm-policy'
import { BAHASA_PESAN, GalatTemplate, renderPesan, type BahasaPesan } from './comm-template'
import { pilihPenerimaFixture } from './comm-fixture'
import { sidikSnapshot, sidikSumber } from './comm-hash'

type Tx = Parameters<Parameters<TenantDb['$transaction']>[0]>[0]

/** Transaksi baru per percobaan; P2002/konflik versi → ulang, lalu CONFLICT. */
export const MAKS_PERCOBAAN_TX = 3

const TABEL_CANDIDATE = 'CommunicationCandidate'
const TABEL_PESAN = 'CommunicationMessage'
const TABEL_SINYAL = 'MonitoringSignal'

/** Jenis sinyal anggota grup per sourceType — ACTUAL_DATE_MISSING (sourceRef = VoyageEvent.id juga) SENGAJA dikecualikan. */
const JENIS_ANGGOTA: Readonly<Record<KunciCandidate['sourceType'], string>> = {
  AUDIT_LOG: 'ETA_CHANGED',
  VOYAGE_EVENT: 'OPERATIONAL_EVENT_RECORDED',
}

// ================================================================ hasil bertipe

type Penolakan = { alasan: KodeAlasan; medan?: string }

export type HasilSiapkanCandidate =
  | { hasil: 'SIAP'; candidateId: string; keluarga: KeluargaEvent; dibuatBaru: boolean }
  | ({ hasil: 'DIBLOKIR'; candidateId: string } & Penolakan)
  | ({ hasil: 'DITOLAK_PULIH'; candidateId: string } & Penolakan)
  | ({ hasil: 'DITOLAK'; candidateId: null } & Penolakan)

export type HasilBuatRevisi =
  | { hasil: 'REVISI_DIBUAT'; messageId: string; revision: number; snapshotFingerprint: string; digantikanId: string | null }
  | { hasil: 'REVISI_SAMA'; messageId: string; revision: number; snapshotFingerprint: string }
  | ({ hasil: 'DIBLOKIR'; candidateId: string } & Penolakan)
  | ({ hasil: 'DITOLAK_PULIH'; candidateId: string } & Penolakan)
  | ({ hasil: 'DITOLAK'; candidateId: string } & Penolakan)

export type HasilTandaiDipratinjau =
  | { hasil: 'DIPRATINJAU'; messageId: string }
  | { hasil: 'SUDAH_DIPRATINJAU'; messageId: string }
  | { hasil: 'DITOLAK'; messageId: string; alasan: 'PREVIEW_REQUIRED'; state: string }

// ================================================================= gerbang

/** Urutan disengaja: pagar Automation (tenant → NOT_FOUND, peran → FORBIDDEN) lalu gerbang WA. */
function gerbang(ctx: TenantContext): void {
  requireAutomation(ctx)
  if (ctx.system) throw forbidden('Komunikasi klien hanya dapat disiapkan oleh pengguna, bukan proses sistem.')
  const k = bacaKonfigurasiKomunikasi(process.env)
  if (!k.aktif) throw forbidden(`Komunikasi WA-1 tidak aktif (${k.alasan}).`)
}

const idSah = (v: unknown, nama: string): string => {
  if (typeof v !== 'string' || v.trim() === '' || v.length > 64) throw validation(`${nama} tidak sah.`)
  return v
}

class KonflikKonkurensi extends Error {
  constructor() {
    super('KONFLIK_KONKURENSI')
    this.name = 'KonflikKonkurensi'
  }
}

const bisaDiulang = (e: unknown): boolean =>
  e instanceof KonflikKonkurensi ||
  (e instanceof Prisma.PrismaClientKnownRequestError && (e.code === 'P2002' || e.code === 'P2034'))

async function denganUlang<T>(fn: () => Promise<T>): Promise<T> {
  for (let percobaan = 1; ; percobaan++) {
    try {
      return await fn()
    } catch (e) {
      if (!bisaDiulang(e)) throw e
      if (percobaan >= MAKS_PERCOBAAN_TX) {
        throw conflict('Permintaan bersamaan belum terselesaikan. Coba lagi.', { code: 'CONCURRENCY_CONFLICT' })
      }
    }
  }
}

const audit = (ctx: TenantContext, tx: Tx, entri: EntriAudit) => catatAudit(ctx, entri, {}, tx)

// =========================================================== pembaca fakta

const PILIH_SINYAL = {
  id: true, tenantId: true, voyageId: true, kind: true, sourceType: true, sourceRef: true, reviewState: true, after: true,
} as const

type VoyageMentah = {
  id: string
  voyageNumber: string
  vesselId: string
  portId: string | null
  deletedAt: Date | null
  eta: Date | null
  etd: Date | null
}

const PILIH_VOYAGE = { id: true, voyageNumber: true, vesselId: true, portId: true, deletedAt: true, eta: true, etd: true } as const

const keFaktaVoyage = (v: VoyageMentah): FaktaVoyage => ({
  id: v.id,
  voyageNumber: v.voyageNumber,
  deletedAt: v.deletedAt ? v.deletedAt.toISOString() : null,
  portId: v.portId,
  eta: kunciTanggal(v.eta),
  etd: kunciTanggal(v.etd),
})

async function bacaKapalPort(tx: Tx, v: VoyageMentah): Promise<{ kapal: { name: string } | null; port: FaktaPort | null }> {
  const [kapal, port] = await Promise.all([
    tx.vessel.findFirst({ where: { id: v.vesselId }, select: { name: true } }),
    v.portId ? tx.port.findFirst({ where: { id: v.portId }, select: { id: true, name: true, timezone: true, deletedAt: true } }) : null,
  ])
  return {
    kapal,
    port: port ? { id: port.id, name: port.name, timezone: port.timezone, deletedAt: port.deletedAt ? port.deletedAt.toISOString() : null } : null,
  }
}

const PILIH_AUDIT = { id: true, tableName: true, recordId: true, createdAt: true, oldValue: true, newValue: true } as const

const barisAudit = (a: { id: string; tableName: string; recordId: string; createdAt: Date; oldValue: unknown; newValue: unknown }) => ({
  id: a.id,
  tableName: a.tableName,
  recordId: a.recordId,
  createdAt: a.createdAt.toISOString(),
  oldValue: a.oldValue,
  newValue: a.newValue,
})

/** Medan jadwal mentah AuditLog (∩ {eta, etd}, urutan kanonik eta → etd) — dasar includedFields. */
function medanJadwalMentah(newValue: unknown): string[] {
  const o = newValue && typeof newValue === 'object' && !Array.isArray(newValue) ? (newValue as Record<string, unknown>) : null
  const medan = Array.isArray(o?.medan) ? (o?.medan as unknown[]) : []
  return MEDAN_JADWAL.filter((m) => medan.includes(m))
}

type HasilRevalidasi = { hasil: Hasil<FaktaKanonikJadwal | FaktaKanonikMilestone>; includedFields: string[] }

/**
 * Revalidasi sumber #1 — membaca fakta tenant-scoped lalu menyerahkan keputusan ke
 * kebijakan murni Step 2A (kontrak fakta tak diubah).
 * Jadwal: AuditLog sumber (milik voyage ini), nilai ETA/ETD kini, SEMUA UBAH_TANGGAL
 * voyage ini dengan createdAt ≥ sumber (Q5; waktu sama = menyalip), kapal, pelabuhan.
 * Milestone: VoyageEvent TERMASUK yang sudah dihapus (beda SOURCE_DELETED vs
 * NOT_FOUND), port call bila ada, kapal, pelabuhan, jam server.
 */
async function revalidasiSumber(tx: Tx, kunci: KunciCandidate, keluarga: KeluargaEvent, v: VoyageMentah): Promise<HasilRevalidasi> {
  const { kapal, port } = await bacaKapalPort(tx, v)
  const voyage = keFaktaVoyage(v)
  if (kunci.sourceType === 'AUDIT_LOG') {
    const sumber = await tx.auditLog.findFirst({ where: { id: kunci.sourceRef, tableName: 'Voyage', recordId: v.id }, select: PILIH_AUDIT })
    const sesudah = sumber
      ? await tx.auditLog.findMany({
          where: {
            tableName: 'Voyage',
            recordId: v.id,
            createdAt: { gte: sumber.createdAt },
            NOT: { id: sumber.id },
            newValue: { path: ['peristiwa'], equals: 'UBAH_TANGGAL' },
          },
          select: PILIH_AUDIT,
        })
      : []
    return {
      hasil: nilaiSumberJadwal({ audit: sumber ? barisAudit(sumber) : null, voyage, kapal, port, auditSesudah: sesudah.map(barisAudit) }),
      includedFields: sumber ? medanJadwalMentah(sumber.newValue) : [],
    }
  }
  const p = await tx.voyageEvent.findFirst({
    where: { id: kunci.sourceRef },
    select: { id: true, voyageId: true, eventCode: true, occurredAt: true, deletedAt: true, portCallId: true },
  })
  const portCall = p?.portCallId ? await tx.portCall.findFirst({ where: { id: p.portCallId }, select: { id: true, portRefId: true } }) : null
  return {
    hasil: nilaiSumberMilestone(
      {
        keluarga,
        peristiwa: p
          ? { id: p.id, voyageId: p.voyageId, eventCode: p.eventCode, occurredAt: p.occurredAt.toISOString(), deletedAt: p.deletedAt ? p.deletedAt.toISOString() : null, portCallId: p.portCallId }
          : null,
        voyage,
        kapal,
        port,
        portCall,
      },
      { sekarang: new Date() },
    ),
    includedFields: [],
  }
}

type Grup = { kunci: KunciCandidate; keluarga: KeluargaEvent; signalIds: string[]; reviewStates: string[] }

/**
 * Sinyal anggota grup candidate: kunci sumber sama + jenis yang benar. Bentuk grup
 * diverifikasi ulang dengan kelompokkanSinyal (2A); menyimpang → galat (gagal tertutup).
 */
async function bacaGrup(tx: Tx, kunci: KunciCandidate, keluarga: KeluargaEvent): Promise<Grup> {
  const anggota = await tx.monitoringSignal.findMany({
    where: { voyageId: kunci.voyageId, sourceType: kunci.sourceType, sourceRef: kunci.sourceRef, kind: JENIS_ANGGOTA[kunci.sourceType] },
    select: PILIH_SINYAL,
  })
  const g = kelompokkanSinyal(anggota as SinyalMasuk[])
  const teks = teksKunciCandidate(kunci)
  if (g.ditolak.length > 0 || g.grup.length > 1 || (g.grup.length === 1 && (g.grup[0].teksKunci !== teks || g.grup[0].keluarga !== keluarga))) {
    throw new Error('[komunikasi] grup sinyal tidak konsisten dengan kunci candidate.')
  }
  return { kunci, keluarga, signalIds: g.grup[0]?.sinyalIds ?? [], reviewStates: g.grup[0]?.reviewStates ?? [] }
}

type CandidateBaris = {
  id: string
  voyageId: string
  family: string
  sourceType: string
  sourceRef: string
  signalIds: string[]
  includedFields: string[]
  state: string
  blockReason: string | null
  version: number
}

const PILIH_CANDIDATE = {
  id: true, voyageId: true, family: true, sourceType: true, sourceRef: true, signalIds: true, includedFields: true, state: true, blockReason: true, version: true,
} as const

// ===================================================== mutasi candidate (+audit)

async function buatCandidate(
  ctx: TenantContext,
  tx: Tx,
  g: Grup,
  includedFields: string[],
  blok: Penolakan | null,
): Promise<CandidateBaris> {
  const c = await tx.communicationCandidate.create({
    data: {
      tenantId: ctx.tenantId,
      voyageId: g.kunci.voyageId,
      family: g.keluarga,
      sourceType: g.kunci.sourceType,
      sourceRef: g.kunci.sourceRef,
      signalIds: g.signalIds,
      includedFields,
      state: blok ? 'BLOCKED' : 'ACTIVE',
      blockReason: blok ? blok.alasan : null,
      blockedAt: blok ? new Date() : null,
      createdByUserId: ctx.userId,
    },
    select: PILIH_CANDIDATE,
  })
  await audit(ctx, tx, {
    tableName: TABEL_CANDIDATE,
    recordId: c.id,
    action: 'CREATE',
    newValue: {
      peristiwa: 'WA1_CANDIDATE_DIBUAT',
      voyageId: c.voyageId,
      family: c.family,
      sourceType: c.sourceType,
      sourceRef: c.sourceRef,
      signalIds: c.signalIds,
      includedFields: c.includedFields,
      state: c.state,
    },
  })
  if (blok) await auditBlokir(ctx, tx, c.id, blok, [])
  return c
}

async function auditBlokir(ctx: TenantContext, tx: Tx, candidateId: string, blok: Penolakan, revisiDiblokir: string[]) {
  await audit(ctx, tx, {
    tableName: TABEL_CANDIDATE,
    recordId: candidateId,
    action: 'UPDATE',
    oldValue: { state: 'ACTIVE' },
    newValue: { peristiwa: 'WA1_CANDIDATE_DIBLOKIR', state: 'BLOCKED', alasan: blok.alasan, medan: blok.medan ?? null, revisiDiblokir },
  })
}

/** Hard block: candidate ACTIVE → BLOCKED + setiap revisi aktif → BLOCKED (activeKey dilepas) + audit — satu transaksi. */
async function blokirCandidate(ctx: TenantContext, tx: Tx, c: CandidateBaris, blok: Penolakan): Promise<void> {
  const n = await tx.communicationCandidate.updateMany({
    where: { id: c.id, state: 'ACTIVE', version: c.version },
    data: { state: 'BLOCKED', blockReason: blok.alasan, blockedAt: new Date(), version: { increment: 1 } },
  })
  if (n.count === 0) throw new KonflikKonkurensi()
  const aktif = await tx.communicationMessage.findMany({
    where: { candidateId: c.id, activeKey: { not: null } },
    select: { id: true, state: true, version: true },
  })
  for (const m of aktif) {
    if (!transisiPesanSah(m.state, 'BLOCKED')) throw new KonflikKonkurensi()
    const u = await tx.communicationMessage.updateMany({
      where: { id: m.id, version: m.version, activeKey: { not: null } },
      data: { state: 'BLOCKED', reasonCode: blok.alasan, activeKey: null, version: { increment: 1 } },
    })
    if (u.count === 0) throw new KonflikKonkurensi()
  }
  await auditBlokir(ctx, tx, c.id, blok, aktif.map((m) => m.id))
}

async function auditTolakPrepare(ctx: TenantContext, tx: Tx, tabel: string, recordId: string, tolak: Penolakan, konteks: Record<string, unknown> = {}) {
  await audit(ctx, tx, {
    tableName: tabel,
    recordId,
    action: 'UPDATE',
    newValue: { peristiwa: 'WA1_PREPARE_DITOLAK', alasan: tolak.alasan, medan: tolak.medan ?? null, ...konteks },
  })
}

const tolakDari = (h: { alasan: KodeAlasan; medan?: string }): Penolakan => (h.medan === undefined ? { alasan: h.alasan } : { alasan: h.alasan, medan: h.medan })

// ================================================================ API service

/**
 * Siapkan Update Klien dari satu MonitoringSignal: bentuk/buka candidate (idempoten,
 * ETA+ETD satu AuditLog → satu candidate), periksa kelayakan grup sinyal (P-08/Q4),
 * revalidasi sumber #1, lalu putuskan SIAP / DIBLOKIR (keras) / DITOLAK_PULIH.
 * Sinyal di luar pilot → DITOLAK tanpa candidate (D-2C-04).
 */
export async function siapkanCandidate(ctx: TenantContext, input: { signalId: unknown }): Promise<HasilSiapkanCandidate> {
  gerbang(ctx)
  const signalId = idSah(input?.signalId, 'signalId')
  return denganUlang(() => forTenant(ctx).$transaction((tx) => siapkanDalamTx(ctx, tx, signalId)))
}

async function siapkanDalamTx(ctx: TenantContext, tx: Tx, signalId: string): Promise<HasilSiapkanCandidate> {
  const s = await tx.monitoringSignal.findFirst({ where: { id: signalId }, select: PILIH_SINYAL })
  if (!s) throw notFound('Sinyal')
  const k = klasifikasiSinyal(s as SinyalMasuk)
  if (!k.ok) {
    const tolak = tolakDari(k)
    await auditTolakPrepare(ctx, tx, TABEL_SINYAL, s.id, tolak, { kind: s.kind })
    return { hasil: 'DITOLAK', candidateId: null, ...tolak }
  }
  const v = await tx.voyage.findFirst({ where: { id: s.voyageId }, select: PILIH_VOYAGE })
  if (!v) throw notFound('Sinyal')
  const { kunci, keluarga } = k.nilai

  const ada = await tx.communicationCandidate.findFirst({
    where: { voyageId: kunci.voyageId, sourceType: kunci.sourceType, sourceRef: kunci.sourceRef },
    select: PILIH_CANDIDATE,
  })
  if (ada && ada.family !== keluarga) throw new Error('[komunikasi] family candidate tersimpan tak cocok dengan sinyal.')
  if (ada?.state === 'BLOCKED') {
    return { hasil: 'DIBLOKIR', candidateId: ada.id, alasan: (ada.blockReason ?? 'SOURCE_NOT_FOUND') as KodeAlasan }
  }

  const g = await bacaGrup(tx, kunci, keluarga)
  const layak = kelayakanGrupSinyal(g.reviewStates)
  const r = layak.ok ? await revalidasiSumber(tx, kunci, keluarga, v) : null
  const includedFields = r?.includedFields ?? (kunci.sourceType === 'AUDIT_LOG'
    ? medanJadwalMentah((await tx.auditLog.findFirst({ where: { id: kunci.sourceRef, tableName: 'Voyage', recordId: v.id }, select: { newValue: true } }))?.newValue)
    : [])
  const gagal = !layak.ok ? tolakDari(layak) : r && !r.hasil.ok ? tolakDari(r.hasil) : null

  if (gagal && sifatAlasanPrepare(gagal.alasan) !== 'PULIH') {
    if (ada) {
      await blokirCandidate(ctx, tx, ada, gagal)
      return { hasil: 'DIBLOKIR', candidateId: ada.id, ...gagal }
    }
    const c = await buatCandidate(ctx, tx, g, includedFields, gagal)
    return { hasil: 'DIBLOKIR', candidateId: c.id, ...gagal }
  }

  let c: CandidateBaris
  let dibuatBaru = false
  if (ada) {
    c = ada
    const gabung = Array.from(new Set([...ada.signalIds, ...g.signalIds])).sort()
    if (gabung.join() !== ada.signalIds.join()) {
      const n = await tx.communicationCandidate.updateMany({
        where: { id: ada.id, state: 'ACTIVE', version: ada.version },
        data: { signalIds: gabung, version: { increment: 1 } },
      })
      if (n.count === 0) throw new KonflikKonkurensi()
    }
  } else {
    c = await buatCandidate(ctx, tx, g, includedFields, null)
    dibuatBaru = true
  }
  if (gagal) {
    await auditTolakPrepare(ctx, tx, TABEL_CANDIDATE, c.id, gagal, { signalId: s.id })
    return { hasil: 'DITOLAK_PULIH', candidateId: c.id, ...gagal }
  }
  return { hasil: 'SIAP', candidateId: c.id, keluarga, dibuatBaru }
}

/**
 * Buat revisi pesan (snapshot immutable) untuk candidate ACTIVE: revalidasi #1
 * ulang, render deterministik, sidik sumber & snapshot. Revisi aktif identik →
 * dikembalikan apa adanya; berbeda → revisi lama CANCELED/REVISED + revisi baru
 * DRAFT dalam SATU transaksi (maksimal satu revisi aktif — dijamin activeKey unik).
 */
export async function buatRevisiPesan(
  ctx: TenantContext,
  input: { candidateId: unknown; recipientFixtureId: unknown; language: unknown },
): Promise<HasilBuatRevisi> {
  gerbang(ctx)
  const candidateId = idSah(input?.candidateId, 'candidateId')
  const fixtureId = idSah(input?.recipientFixtureId, 'recipientFixtureId')
  if (!(BAHASA_PESAN as readonly unknown[]).includes(input?.language)) throw validation('Bahasa harus ID atau EN.')
  const bahasa = input.language as BahasaPesan
  return denganUlang(() => forTenant(ctx).$transaction((tx) => revisiDalamTx(ctx, tx, candidateId, fixtureId, bahasa)))
}

async function revisiDalamTx(ctx: TenantContext, tx: Tx, candidateId: string, fixtureId: string, bahasa: BahasaPesan): Promise<HasilBuatRevisi> {
  const c = await tx.communicationCandidate.findFirst({ where: { id: candidateId }, select: PILIH_CANDIDATE })
  if (!c) throw notFound('Kandidat komunikasi')
  if (c.state === 'BLOCKED') return { hasil: 'DIBLOKIR', candidateId: c.id, alasan: (c.blockReason ?? 'SOURCE_NOT_FOUND') as KodeAlasan }

  const fixture = pilihPenerimaFixture(fixtureId)
  if (!fixture.ok) {
    const tolak = tolakDari(fixture)
    await auditTolakPrepare(ctx, tx, TABEL_CANDIDATE, c.id, tolak, { recipientFixtureId: fixtureId })
    return { hasil: 'DITOLAK', candidateId: c.id, ...tolak }
  }

  const v = await tx.voyage.findFirst({ where: { id: c.voyageId }, select: PILIH_VOYAGE })
  if (!v) throw new Error('[komunikasi] voyage candidate tidak terbaca di tenant ini.')
  if (c.sourceType !== 'AUDIT_LOG' && c.sourceType !== 'VOYAGE_EVENT') throw new Error('[komunikasi] sourceType candidate tidak sah.')
  const kunci: KunciCandidate = { tenantId: ctx.tenantId, voyageId: c.voyageId, sourceType: c.sourceType, sourceRef: c.sourceRef }
  const keluarga = c.family as KeluargaEvent

  const g = await bacaGrup(tx, kunci, keluarga)
  const layak = kelayakanGrupSinyal(g.reviewStates)
  const r = layak.ok ? await revalidasiSumber(tx, kunci, keluarga, v) : null
  const gagal = !layak.ok ? tolakDari(layak) : r && !r.hasil.ok ? tolakDari(r.hasil) : null
  if (gagal) {
    if (sifatAlasanPrepare(gagal.alasan) !== 'PULIH') {
      await blokirCandidate(ctx, tx, c, gagal)
      return { hasil: 'DIBLOKIR', candidateId: c.id, ...gagal }
    }
    await auditTolakPrepare(ctx, tx, TABEL_CANDIDATE, c.id, gagal, { recipientFixtureId: fixture.nilai.id, language: bahasa })
    return { hasil: 'DITOLAK_PULIH', candidateId: c.id, ...gagal }
  }
  if (!r || !r.hasil.ok) throw new Error('[komunikasi] revalidasi tanpa hasil.')
  const fakta = r.hasil.nilai

  let render
  try {
    render = renderPesan(
      fakta.keluarga === 'SCHEDULE_CHANGE'
        ? { keluarga: fakta.keluarga, bahasa, vesselName: fakta.vesselName, voyageNumber: fakta.voyageNumber, portName: fakta.portName, perubahan: fakta.perubahan }
        : { keluarga: fakta.keluarga, bahasa, vesselName: fakta.vesselName, voyageNumber: fakta.voyageNumber, portName: fakta.portName, eventLocalTime: fakta.eventLocalTime },
    )
  } catch (e) {
    // OD-2A-04: data sumber berpola token / kosong → ditolak (bisa pulih setelah data diperbaiki).
    if (e instanceof GalatTemplate && e.code === 'TEMPLATE_DATA_INVALID') {
      const tolak: Penolakan = { alasan: 'REQUIRED_DATA_MISSING', medan: 'template.data' }
      await auditTolakPrepare(ctx, tx, TABEL_CANDIDATE, c.id, tolak, { recipientFixtureId: fixture.nilai.id, language: bahasa })
      return { hasil: 'DITOLAK_PULIH', candidateId: c.id, ...tolak }
    }
    throw e
  }

  const logicalMessageKey = teksKunciPesanLogis(kunci, fixture.nilai.pengenal)
  const sourceFingerprint = sidikSumber(kunci, fakta)
  const snapshotFingerprint = sidikSnapshot({
    sourceFingerprint,
    teksKunciCandidate: teksKunciCandidate(kunci),
    logicalMessageKey,
    recipientFixtureId: fixture.nilai.id,
    recipientIdentifier: fixture.nilai.pengenal,
    language: render.bahasa,
    templateId: render.templateId,
    templateVersion: render.templateVersion,
    body: render.body,
    mode: MODE_KOMUNIKASI,
  })

  const sukses = await tx.communicationMessage.findFirst({ where: { successKey: logicalMessageKey }, select: { id: true } })
  if (sukses) {
    const tolak: Penolakan = { alasan: 'ALREADY_FAKE_SENT' }
    await auditTolakPrepare(ctx, tx, TABEL_CANDIDATE, c.id, tolak, { messageId: sukses.id })
    return { hasil: 'DITOLAK', candidateId: c.id, ...tolak }
  }

  const aktif = await tx.communicationMessage.findFirst({
    where: { activeKey: logicalMessageKey },
    select: { id: true, candidateId: true, revision: true, state: true, version: true, snapshotFingerprint: true },
  })
  if (aktif && aktif.candidateId !== c.id) throw new Error('[komunikasi] revisi aktif milik candidate lain.')
  if (aktif && aktif.snapshotFingerprint === snapshotFingerprint && (aktif.state === 'DRAFT' || aktif.state === 'PREVIEWED')) {
    return { hasil: 'REVISI_SAMA', messageId: aktif.id, revision: aktif.revision, snapshotFingerprint }
  }
  if (aktif) {
    if (!transisiPesanSah(aktif.state, 'CANCELED')) throw new KonflikKonkurensi()
    const n = await tx.communicationMessage.updateMany({
      where: { id: aktif.id, version: aktif.version, activeKey: logicalMessageKey },
      data: { state: 'CANCELED', reasonCode: 'REVISED', activeKey: null, version: { increment: 1 } },
    })
    if (n.count === 0) throw new KonflikKonkurensi()
  }

  const maks = await tx.communicationMessage.aggregate({ where: { candidateId: c.id }, _max: { revision: true } })
  const revision = (maks._max.revision ?? 0) + 1
  const baru = await tx.communicationMessage.create({
    data: {
      tenantId: ctx.tenantId,
      candidateId: c.id,
      revision,
      logicalMessageKey,
      activeKey: logicalMessageKey,
      recipientFixtureId: fixture.nilai.id,
      recipientIdentifier: fixture.nilai.pengenal,
      language: render.bahasa,
      templateId: render.templateId,
      templateVersion: render.templateVersion,
      body: render.body,
      fields: fakta as unknown as Prisma.InputJsonValue,
      sourceFingerprint,
      snapshotFingerprint,
      mode: MODE_KOMUNIKASI,
      state: 'DRAFT',
      createdByUserId: ctx.userId,
    },
    select: { id: true },
  })
  if (aktif) {
    await audit(ctx, tx, {
      tableName: TABEL_PESAN,
      recordId: aktif.id,
      action: 'UPDATE',
      oldValue: { state: aktif.state, revision: aktif.revision },
      newValue: { peristiwa: 'WA1_REVISI_DIGANTIKAN', state: 'CANCELED', reasonCode: 'REVISED', digantikanOleh: baru.id },
    })
  }
  await audit(ctx, tx, {
    tableName: TABEL_PESAN,
    recordId: baru.id,
    action: 'CREATE',
    newValue: {
      peristiwa: 'WA1_REVISI_DIBUAT',
      candidateId: c.id,
      revision,
      state: 'DRAFT',
      recipientFixtureId: fixture.nilai.id,
      language: render.bahasa,
      templateId: render.templateId,
      templateVersion: render.templateVersion,
      sourceFingerprint,
      snapshotFingerprint,
      menggantikan: aktif?.id ?? null,
    },
  })
  return { hasil: 'REVISI_DIBUAT', messageId: baru.id, revision, snapshotFingerprint, digantikanId: aktif?.id ?? null }
}

/**
 * Tandai revisi DRAFT sudah dipratinjau. Sidik yang disodorkan WAJIB sama dengan
 * snapshot tersimpan — pratinjau atas isi lain tak pernah dicatat (SG-06).
 */
export async function tandaiDipratinjau(ctx: TenantContext, input: { messageId: unknown; snapshotFingerprint: unknown }): Promise<HasilTandaiDipratinjau> {
  gerbang(ctx)
  const messageId = idSah(input?.messageId, 'messageId')
  const sidik = input?.snapshotFingerprint
  if (typeof sidik !== 'string' || !/^[0-9a-f]{64}$/.test(sidik)) throw validation('snapshotFingerprint tidak sah.')
  return denganUlang(() =>
    forTenant(ctx).$transaction(async (tx): Promise<HasilTandaiDipratinjau> => {
      const m = await tx.communicationMessage.findFirst({
        where: { id: messageId },
        select: { id: true, state: true, version: true, snapshotFingerprint: true },
      })
      if (!m) throw notFound('Pesan')
      if (m.state === 'PREVIEWED' && m.snapshotFingerprint === sidik) return { hasil: 'SUDAH_DIPRATINJAU', messageId: m.id }
      if (m.state !== 'DRAFT' || m.snapshotFingerprint !== sidik) {
        await audit(ctx, tx, {
          tableName: TABEL_PESAN,
          recordId: m.id,
          action: 'UPDATE',
          newValue: { peristiwa: 'WA1_PRATINJAU_DITOLAK', alasan: 'PREVIEW_REQUIRED', state: m.state, sidikCocok: m.snapshotFingerprint === sidik },
        })
        return { hasil: 'DITOLAK', messageId: m.id, alasan: 'PREVIEW_REQUIRED', state: m.state }
      }
      const n = await tx.communicationMessage.updateMany({
        where: { id: m.id, state: 'DRAFT', version: m.version, snapshotFingerprint: sidik },
        data: { state: 'PREVIEWED', previewedAt: new Date(), previewedByUserId: ctx.userId, version: { increment: 1 } },
      })
      if (n.count === 0) throw new KonflikKonkurensi()
      await audit(ctx, tx, {
        tableName: TABEL_PESAN,
        recordId: m.id,
        action: 'UPDATE',
        oldValue: { state: 'DRAFT' },
        newValue: { peristiwa: 'WA1_DIPRATINJAU', state: 'PREVIEWED', snapshotFingerprint: sidik },
      })
      return { hasil: 'DIPRATINJAU', messageId: m.id }
    }),
  )
}
