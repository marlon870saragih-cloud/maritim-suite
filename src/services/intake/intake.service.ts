// Vessel Call Intake — orkestrasi (PRD-004 Step 3).
//
//   AI extracts → System verifies → Human approves → createVoyage() writes → Audit records
//
// BATAS TULIS (§18): berkas ini hanya menulis VesselCallIntake, AuditLog
// (catatAudit), Attachment (uploadAttachment, opt-in D4) dan UsageEvent. Voyage
// TIDAK PERNAH ditulis langsung — hanya lewat createVoyage(), setVoyageVessels(),
// createCargo() dengan konteks APPROVER yang sesungguhnya (requireRole tetap berlaku).
// Master (kapal/principal/customer) tidak pernah dibuat di sini (D2): peninjau
// membuatnya lewat endpoint master yang ada, lalu mengaitkannya.
//
// KONKURENSI: setiap perubahan = compare-and-set pada (status, version). Satu klaim
// NEEDS_REVIEW → CREATING yang menang; unique (tenantId, sourceIntakeId) pada Voyage
// menjamin di level DB bahwa satu intake tak pernah menghasilkan dua voyage.

import type { Prisma, VesselCallIntake } from '@prisma/client'
import { Prisma as PrismaNS } from '@prisma/client'
import type { TenantContext } from '../context'
import { ServiceError, conflict, notFound, rateLimited, upstream, validation } from '../errors'
import { forTenant } from '../tenant-db'
import { catatAudit, type Jejak } from '../finance/audit'
import { pastikanLanggananAktif } from '../subscription'
import { pastikanKuota } from '../saas/quota.service'
import { catatPemakaian } from '../saas/usage.service'
import { catatPanggilanAi, cekBolehPanggilAi } from '../security/rate-limit'
import { uploadAttachment } from '../ops/attachment.service'
import { createVoyage } from '../master/voyage.service'
import { setVoyageVessels } from '../master/voyage-vessel.service'
import { createCargo } from '../master/cargo.service'
import { kunciTanggal } from '../master/voyage-dates'
import { tanggalBisnis } from '@/lib/business-time'
import { imoCheckDigitSah, mmsiSah, normalisasiCallSign, normalisasiImo, normalisasiMmsi } from '@/lib/vessels'
import {
  GalatEkstraksi,
  VERSI_PENGEKSTRAK_INTAKE,
  ekstrakDenganBatasWaktu,
  ekstrakLewatOpenRouter,
  teksWorkbook,
  type MasukanEkstraksi,
  type PengekstrakIntake,
} from '@/lib/ai/vessel-call-extract'
import { ekstrakPalsu } from './fake-extractor'
import { requireIntake } from './intake-access'
import type { KonfigurasiIntake } from './intake-gate'
import { hashInput } from './intake-hash'
import * as P from './intake-policy'

// ----------------------------------------------------------------- konstanta & util

export const MAKS_BYTE_BERKAS = 10 * 1024 * 1024
export const MAKS_KARAKTER_TEMPEL = 50_000

/** Normalisasi identitas kapal — fungsi YANG SAMA dengan route /api/vessels. */
const NORM: P.NormalisasiKapal = {
  imo: normalisasiImo,
  imoSah: imoCheckDigitSah,
  mmsi: normalisasiMmsi,
  mmsiSah,
  callSign: normalisasiCallSign,
}

const IMAGE_MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
const MIME_INPUT: Record<string, string> = {
  PDF: 'application/pdf',
  WORKBOOK: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  CSV: 'text/csv',
}

/** Pola api/ai/vessel-import: ekstensi menentukan, mime browser hanya cadangan. */
function klasifikasiBerkas(nama: string, mime: string): P.JenisInput | 'XLS_LAMA' | null {
  const ext = nama.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ''
  if (ext === 'pdf' || mime === 'application/pdf') return 'PDF'
  if (ext === 'xlsx' || ext === 'xlsm') return 'WORKBOOK'
  if (ext === 'csv') return 'CSV'
  if (ext === 'xls') return 'XLS_LAMA'
  if (mime.includes('spreadsheetml')) return 'WORKBOOK'
  if (mime === 'text/csv') return 'CSV'
  if (ext in IMAGE_MIME || mime.startsWith('image/')) return 'IMAGE'
  return null
}

function mimeGambar(nama: string, mime: string): string {
  if (/^image\/(jpeg|png|webp)$/.test(mime)) return mime
  const ext = nama.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ''
  return IMAGE_MIME[ext] ?? 'image/jpeg'
}

function pengekstrakUntuk(k: KonfigurasiIntake): PengekstrakIntake {
  return k.pengekstrak === 'FAKE' ? ekstrakPalsu : ekstrakLewatOpenRouter
}

const json = (v: unknown) => v as Prisma.InputJsonValue
const salin = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

const teksOpsional = (v: unknown, maks = P.MAKS_PANJANG_NILAI): string | null => {
  if (v === null || v === undefined) return null
  if (typeof v !== 'string' && typeof v !== 'number') throw validation('Nilai field harus teks.')
  const t = String(v).replace(/\s+/g, ' ').trim()
  return t === '' ? null : t.slice(0, maks)
}

function versiDari(body: Record<string, unknown>): number {
  const v = Number(body.version)
  if (!Number.isInteger(v) || v < 1) throw validation('Versi intake (version) wajib disertakan.')
  return v
}

const galatVersi = () =>
  new ServiceError('CONFLICT', 'Intake sudah diubah orang lain atau data master berubah. Muat ulang lalu tinjau kembali.', {
    code: 'VERSION_CONFLICT',
  })

// ----------------------------------------------------------------- baca & bentuk

type BarisIntake = VesselCallIntake

async function bacaBaris(ctx: TenantContext, id: string): Promise<BarisIntake> {
  const row = await forTenant(ctx).vesselCallIntake.findFirst({ where: { id } })
  if (!row) throw notFound('Intake')
  return row
}

function uraikan(row: BarisIntake): { p: P.Proposal; m: P.Matches } {
  const p = row.proposal as unknown
  const m = row.matches as unknown
  if (!P.proposalSah(p) || !P.matchesSah(m, p.vessels.length)) {
    console.error('[intake] bentuk JSON tersimpan tidak sah', { intakeId: row.id })
    throw conflict('Data intake tidak utuh — intake ini tidak bisa diproses. Tolak lalu kirim ulang permintaannya.', { code: 'INTAKE_CORRUPT' })
  }
  return { p, m }
}

async function muatMaster(ctx: TenantContext): Promise<P.MasterTenant> {
  const db = forTenant(ctx)
  const [vessels, principals, customers, ports] = await Promise.all([
    // orderBy WAJIB: urutan kandidat ikut dibandingkan saat approve (master berubah → 409).
    db.vessel.findMany({ select: { id: true, name: true, imoNumber: true, mmsi: true, mmsiVerifiedAt: true, callSign: true }, orderBy: { id: 'asc' }, take: 5000 }),
    db.principal.findMany({ select: { id: true, name: true }, orderBy: { id: 'asc' }, take: 5000 }),
    db.customer.findMany({ where: { deletedAt: null }, select: { id: true, name: true, isActive: true }, orderBy: { id: 'asc' }, take: 5000 }),
    db.port.findMany({ where: { deletedAt: null }, select: { id: true, name: true, unlocode: true }, orderBy: { id: 'asc' }, take: 5000 }),
  ])
  return { vessels, principals, customers, ports }
}

async function hitungDuplikat(
  ctx: TenantContext,
  p: P.Proposal,
  m: P.Matches,
  kecualiIntakeId: string | null,
): Promise<P.HasilDuplikat> {
  const vesselIds = P.kapalTerpilih(p, m)
  if (vesselIds.length === 0) return { level: 'NO_DUPLICATE', candidates: [] }
  const portId = P.idTerpakai(m.port) ?? m.port.selectedId
  const db = forTenant(ctx)
  const [voyages, intakes] = await Promise.all([
    db.voyage.findMany({
      where: {
        deletedAt: null,
        status: { notIn: [...P.STATUS_VOYAGE_DIABAIKAN] },
        OR: [{ vesselId: { in: vesselIds } }, { vessels: { some: { vesselId: { in: vesselIds } } } }],
      },
      select: {
        id: true,
        voyageNumber: true,
        status: true,
        portId: true,
        eta: true,
        vesselId: true,
        port: { select: { name: true } },
        vessel: { select: { name: true } },
        vessels: { select: { vesselId: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    db.vesselCallIntake.findMany({
      where: { status: { in: ['NEEDS_REVIEW', 'CREATING'] }, ...(kecualiIntakeId ? { id: { not: kecualiIntakeId } } : {}) },
      select: { id: true, proposal: true, matches: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
  ])
  const intakeLain: P.KandidatIntakeLain[] = []
  for (const it of intakes) {
    const ip = it.proposal as unknown
    const im = it.matches as unknown
    if (!P.proposalSah(ip) || !P.matchesSah(im, ip.vessels.length)) continue
    intakeLain.push({
      id: it.id,
      portId: P.idTerpakai(im.port) ?? im.port.selectedId,
      eta: ip.eta.value,
      vesselIds: P.kapalTerpilih(ip, im),
    })
  }
  return P.nilaiDuplikat(
    { vesselIds, portId, eta: p.eta.value },
    voyages.map((v) => ({
      id: v.id,
      voyageNumber: v.voyageNumber,
      status: v.status,
      portId: v.portId,
      portName: v.port?.name ?? null,
      eta: kunciTanggal(v.eta),
      vesselIds: [v.vesselId, ...v.vessels.map((x) => x.vesselId)],
      vesselName: v.vessel?.name ?? null,
    })),
    intakeLain,
  )
}

async function jumlahAksesPortal(ctx: TenantContext, customerId: string | null): Promise<number> {
  if (!customerId) return 0
  return forTenant(ctx).portalAccess.count({
    where: { customerId, revokedAt: null, portalUser: { isActive: true } },
  })
}

const SYARAT_KEPUTUSAN: readonly P.SyaratApproval[] = [
  'DUPLICATE_DECISION_REQUIRED',
  'DUPLICATE_REVIEW_CONFIRMATION_REQUIRED',
  'DUPLICATE_REASON_REQUIRED',
  'PORTAL_ACK_REQUIRED',
]

export type IntakeDto = {
  id: string
  status: string
  classification: string
  version: number
  inputKind: string
  inputHashShort: string
  sourceFileName: string | null
  sourceSizeBytes: number | null
  attachmentId: string | null
  extractorVersion: string
  proposal: P.Proposal
  matches: P.Matches
  duplicateLevel: string
  duplicateCandidates: P.KandidatDuplikat[]
  duplicateDecision: string | null
  decisionReason: string | null
  portalExposureAck: boolean
  postCreateWarnings: string[]
  errorCode: string | null
  submittedByUserId: string
  reviewedByUserId: string | null
  reviewedAt: Date | null
  claimedAt: Date | null
  voyageId: string | null
  voyageNumber: string | null
  createdAt: Date
  updatedAt: Date
  /** Nama master yang dirujuk id terpilih/kandidat — untuk tampilan saja. */
  names: Record<string, string>
  review: {
    /** Syarat data yang belum terpenuhi (dihitung server). */
    conditions: P.SyaratApproval[]
    /** Keputusan yang wajib diberikan saat approve. */
    decisionsNeeded: P.SyaratApproval[]
    primaryVesselIndex: number
    unconfirmedFields: string[]
    portalActiveAccessCount: number
    minReasonLength: number
  } | null
}

async function keDto(ctx: TenantContext, row: BarisIntake): Promise<IntakeDto> {
  const { p, m } = uraikan(row)
  const terminal = P.statusTerminal(row.status)
  const proposal = terminal ? P.tanpaKontak(p) : p
  const db = forTenant(ctx)

  const idKapal = Array.from(new Set(m.vessels.flatMap((h) => [h.selectedId, ...h.candidates.map((c) => c.id)]).filter((x): x is string => !!x)))
  const idPengguna = [row.submittedByUserId, row.reviewedByUserId].filter((x): x is string => !!x)
  const [kapal, principal, customer, port, voyage, pengguna] = await Promise.all([
    idKapal.length ? db.vessel.findMany({ where: { id: { in: idKapal } }, select: { id: true, name: true } }) : [],
    m.principal.selectedId ? db.principal.findMany({ where: { id: m.principal.selectedId }, select: { id: true, name: true } }) : [],
    m.customer.selectedId ? db.customer.findMany({ where: { id: m.customer.selectedId }, select: { id: true, name: true } }) : [],
    m.port.selectedId ? db.port.findMany({ where: { id: m.port.selectedId }, select: { id: true, name: true } }) : [],
    row.voyageId ? db.voyage.findFirst({ where: { id: row.voyageId }, select: { voyageNumber: true } }) : null,
    db.user.findMany({ where: { id: { in: idPengguna } }, select: { id: true, name: true } }),
  ])
  const names: Record<string, string> = {}
  for (const x of [...kapal, ...principal, ...customer, ...port, ...pengguna]) names[x.id] = x.name

  let review: IntakeDto['review'] = null
  if (row.status === 'NEEDS_REVIEW' || row.status === 'FAILED') {
    const portal = await jumlahAksesPortal(ctx, P.idTerpakai(m.customer))
    const semua = P.syaratApproval({
      status: row.status,
      classification: row.classification,
      proposal: p,
      matches: m,
      duplicateLevel: row.duplicateLevel,
      keputusan: {
        duplicateDecision: row.status === 'FAILED' ? row.duplicateDecision : null,
        decisionReason: row.status === 'FAILED' ? row.decisionReason : null,
        duplicateConfirmed: row.status === 'FAILED',
        portalExposureAck: row.status === 'FAILED' ? row.portalExposureAck : false,
      },
      portalAccessCount: portal,
      statusDiharapkan: row.status as P.StatusIntake,
    })
    review = {
      conditions: semua.filter((s) => !SYARAT_KEPUTUSAN.includes(s)),
      decisionsNeeded: semua.filter((s) => SYARAT_KEPUTUSAN.includes(s)),
      primaryVesselIndex: P.indeksKapalUtama(p),
      unconfirmedFields: P.fieldBelumDikonfirmasi(p),
      portalActiveAccessCount: portal,
      minReasonLength: P.MIN_PANJANG_ALASAN,
    }
  }

  return {
    id: row.id,
    status: row.status,
    classification: row.classification,
    version: row.version,
    inputKind: row.inputKind,
    inputHashShort: row.inputHash.slice(0, 12),
    sourceFileName: row.sourceFileName,
    sourceSizeBytes: row.sourceSizeBytes,
    attachmentId: row.attachmentId,
    extractorVersion: row.extractorVersion,
    proposal,
    matches: m,
    duplicateLevel: row.duplicateLevel,
    duplicateCandidates: (row.duplicateCandidates as unknown as P.KandidatDuplikat[]) ?? [],
    duplicateDecision: row.duplicateDecision,
    decisionReason: row.decisionReason,
    portalExposureAck: row.portalExposureAck,
    postCreateWarnings: Array.isArray(row.postCreateWarnings) ? (row.postCreateWarnings as string[]) : [],
    errorCode: row.errorCode,
    submittedByUserId: row.submittedByUserId,
    reviewedByUserId: row.reviewedByUserId,
    reviewedAt: row.reviewedAt,
    claimedAt: row.claimedAt,
    voyageId: row.voyageId,
    voyageNumber: voyage?.voyageNumber ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    names,
    review,
  }
}

/** Ringkasan audit tanpa PII kontak & tanpa isi dokumen (§29). */
function ringkasAudit(row: { status: string; classification: string; duplicateLevel: string; voyageId?: string | null; errorCode?: string | null }) {
  return {
    status: row.status,
    classification: row.classification,
    duplicateLevel: row.duplicateLevel,
    voyageId: row.voyageId ?? null,
    errorCode: row.errorCode ?? null,
  }
}

// ----------------------------------------------------------------- rekonsiliasi

async function rekonsiliasi(ctx: TenantContext, row: BarisIntake, jejak: Jejak = {}): Promise<BarisIntake> {
  if (row.status !== 'CREATING') return row
  const db = forTenant(ctx)
  const voyage = await db.voyage.findFirst({ where: { sourceIntakeId: row.id }, select: { id: true } })
  const keputusan = P.keputusanRekonsiliasi(row, !!voyage, new Date())
  if (!keputusan) return row
  if (keputusan === 'COMPLETED' && voyage) {
    const { p } = uraikan(row)
    await selesaikan(ctx, row.id, p, voyage.id, ['RECONCILED'], jejak)
  } else {
    const n = await db.vesselCallIntake.updateMany({
      where: { id: row.id, status: 'CREATING' },
      data: { status: 'FAILED', errorCode: 'CREATING_INTERRUPTED', version: { increment: 1 } },
    })
    if (n.count > 0) {
      await catatAudit(
        ctx,
        { tableName: 'VesselCallIntake', recordId: row.id, action: 'UPDATE', oldValue: { status: 'CREATING' }, newValue: { status: 'FAILED', errorCode: 'CREATING_INTERRUPTED' } },
        jejak,
      )
    }
  }
  return bacaBaris(ctx, row.id)
}

// ----------------------------------------------------------------- submit

export type MasukanSubmit = {
  text?: string | null
  file?: { name: string; type: string; bytes: Buffer } | null
  saveOriginal?: boolean
  confirmReprocess?: boolean
}

export type HasilSubmit = { intake: IntakeDto; reused: boolean; warnings: string[] }

/**
 * §24 — urutan disengaja, semua pemeriksaan biaya SEBELUM AI:
 * gerbang → validasi berkas → langganan → hash (intake aktif? kembalikan tanpa AI)
 * → kuota AI → rate-limit → ekstraksi (batas waktu) → validasi → matching → duplikat → simpan.
 * Gagal di mana pun sebelum simpan → tidak ada baris, master, maupun voyage.
 */
export async function submitIntake(
  ctx: TenantContext,
  masukan: MasukanSubmit,
  jejak: Jejak = {},
  pengekstrakUji?: PengekstrakIntake,
): Promise<HasilSubmit> {
  const k = requireIntake(ctx)
  const db = forTenant(ctx)

  const text = typeof masukan.text === 'string' ? masukan.text : null
  const file = masukan.file ?? null
  if ((text && text.trim() && file) || (!file && !(text && text.trim()))) {
    throw validation('Tempel teks permintaan ATAU unggah satu berkas.')
  }

  let kind: P.JenisInput
  let hash: string
  let teksNormal: string | null = null
  if (file) {
    if (file.bytes.length === 0) throw validation('Berkas kosong.')
    if (file.bytes.length > MAKS_BYTE_BERKAS) throw validation('Berkas terlalu besar (maksimal 10 MB).')
    const jenis = klasifikasiBerkas(file.name, file.type)
    if (jenis === 'XLS_LAMA') throw validation('Format .xls lama belum didukung — simpan ulang sebagai .xlsx.')
    if (!jenis || jenis === 'TEXT') throw validation('Hanya PDF, Excel (.xlsx/.xlsm), CSV, atau gambar (JPG/PNG/WEBP).')
    kind = jenis
    hash = hashInput(kind, file.bytes)
  } else {
    teksNormal = P.normalisasiTeksSumber(text ?? '')
    if (teksNormal.length > MAKS_KARAKTER_TEMPEL) throw validation(`Teks terlalu panjang (maksimal ${MAKS_KARAKTER_TEMPEL} karakter).`)
    kind = 'TEXT'
    hash = hashInput(kind, teksNormal)
  }

  await pastikanLanggananAktif(ctx)

  // §20 — input yang sama dan masih aktif: kembalikan tanpa memanggil AI.
  const aktif = await db.vesselCallIntake.findFirst({ where: { activeHashKey: hash } })
  if (aktif) return { intake: await keDto(ctx, await rekonsiliasi(ctx, aktif, jejak)), reused: true, warnings: [] }
  if (!masukan.confirmReprocess) {
    const lama = await db.vesselCallIntake.findFirst({
      where: { inputHash: hash },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true },
    })
    if (lama) {
      throw new ServiceError(
        'CONFLICT',
        `Permintaan yang sama sudah pernah diproses (${lama.status}). Centang "proses ulang" bila memang perlu diproses lagi.`,
        { code: 'ALREADY_PROCESSED', intakeId: lama.id, status: lama.status },
      )
    }
  }

  await pastikanKuota(ctx, 'PANGGILAN_AI')
  if ((await cekBolehPanggilAi(ctx.userId)).diblokir) {
    throw rateLimited('Terlalu banyak panggilan AI dalam waktu singkat. Tunggu beberapa menit lalu coba lagi.')
  }
  await catatPanggilanAi(ctx.userId)

  // Masukan ekstraksi + teks sumber untuk uji "nilai ada di sumber".
  let ekstrak: MasukanEkstraksi
  let teksSumber: string | null = null
  if (!file) {
    teksSumber = teksNormal
    ekstrak = { kind: 'TEXT', text: teksNormal ?? '' }
  } else if (kind === 'WORKBOOK') {
    let lembar = ''
    try {
      const ab = file.bytes.buffer.slice(file.bytes.byteOffset, file.bytes.byteOffset + file.bytes.byteLength) as ArrayBuffer
      lembar = await teksWorkbook(ab)
    } catch {
      throw validation('Berkas Excel tidak bisa dibaca.')
    }
    if (!lembar.trim()) throw validation('Berkas Excel kosong / tidak ada data yang bisa dibaca.')
    teksSumber = lembar
    ekstrak = { kind: 'WORKBOOK', text: lembar }
  } else if (kind === 'CSV') {
    teksSumber = file.bytes.toString('utf8')
    ekstrak = { kind: 'CSV', text: teksSumber }
  } else if (kind === 'PDF') {
    ekstrak = { kind: 'PDF', bytes: file.bytes, filename: file.name }
  } else {
    ekstrak = { kind: 'IMAGE', bytes: file.bytes, mimeType: mimeGambar(file.name, file.type) }
  }

  let mentah: unknown
  try {
    mentah = await ekstrakDenganBatasWaktu(pengekstrakUji ?? pengekstrakUntuk(k), ekstrak, k.batasWaktuMs)
  } catch (e) {
    const kode = e instanceof GalatEkstraksi ? e.kode : 'AI_UNAVAILABLE'
    // Log hanya kode — tanpa pesan penyedia, tanpa isi dokumen (§23).
    console.error('[intake] ekstraksi gagal', { kode, kind })
    throw upstream('Pembacaan AI gagal. Tidak ada data yang dibuat — coba lagi nanti.', { code: kode })
  }

  const { classification, proposal } = P.validasiEkstraksi(mentah, {
    inputKind: kind,
    sourceText: teksSumber,
    hariIni: tanggalBisnis(new Date()),
    norm: NORM,
  })
  const master = await muatMaster(ctx)
  const matches = P.cocokkanSemua(proposal, master, NORM, null, new Set(), { konfirmasiSemua: P.inputVisual(kind) })
  const dup = await hitungDuplikat(ctx, proposal, matches, null)

  const dibuat = await db.vesselCallIntake.createManyAndReturn({
    data: [
      {
        tenantId: ctx.tenantId,
        status: 'NEEDS_REVIEW',
        classification,
        inputKind: kind,
        inputHash: hash,
        activeHashKey: hash,
        sourceFileName: file ? file.name.slice(0, 200) : null,
        sourceSizeBytes: file ? file.bytes.length : Buffer.byteLength(teksNormal ?? '', 'utf8'),
        extractorVersion: VERSI_PENGEKSTRAK_INTAKE,
        proposal: json(proposal),
        matches: json(matches),
        duplicateLevel: dup.level,
        duplicateCandidates: json(dup.candidates),
        submittedByUserId: ctx.userId,
      },
    ],
    skipDuplicates: true,
  })
  if (dibuat.length === 0) {
    // Balapan dua submit identik: yang lain menang — kembalikan miliknya.
    const menang = await db.vesselCallIntake.findFirst({ where: { activeHashKey: hash } })
    if (!menang) throw conflict('Permintaan yang sama sedang diproses. Muat ulang daftar intake.')
    return { intake: await keDto(ctx, menang), reused: true, warnings: [] }
  }
  let intake = dibuat[0]

  // Fase 8j / K183 — sesudah ekstraksi berhasil tersimpan.
  await catatPemakaian(ctx, 'INTAKE_EXTRACTED', { kind, classification })

  const warnings: string[] = []
  if (masukan.saveOriginal === true) {
    try {
      const isi = file ? file.bytes : Buffer.from(teksNormal ?? '', 'utf8')
      const hasil = await uploadAttachment(ctx, {
        entityType: 'VESSEL_CALL_INTAKE',
        entityId: intake.id,
        fileName: file ? file.name : `permintaan-${intake.id}.txt`,
        mimeType: file ? (kind === 'IMAGE' ? mimeGambar(file.name, file.type) : MIME_INPUT[kind] ?? file.type) : 'text/plain',
        isi,
        kind: 'GENERAL',
        note: 'Dokumen asli Vessel Call Intake (disimpan atas pilihan peninjau).',
        sensitive: true,
      })
      await db.vesselCallIntake.updateMany({ where: { id: intake.id }, data: { attachmentId: hasil.attachment.id } })
      intake = { ...intake, attachmentId: hasil.attachment.id }
    } catch (e) {
      console.error('[intake] dokumen asli tidak tersimpan', { intakeId: intake.id, kode: e instanceof ServiceError ? e.code : 'ERROR' })
      warnings.push('ORIGINAL_NOT_SAVED')
    }
  }

  await catatAudit(
    ctx,
    {
      tableName: 'VesselCallIntake',
      recordId: intake.id,
      action: 'CREATE',
      newValue: {
        inputKind: kind,
        inputHash: hash.slice(0, 12),
        classification,
        classificationReason: proposal.classificationReason,
        duplicateLevel: dup.level,
        saveOriginal: masukan.saveOriginal === true,
        attachmentId: intake.attachmentId,
        reprocess: masukan.confirmReprocess === true,
      },
    },
    jejak,
  )

  return { intake: await keDto(ctx, intake), reused: false, warnings }
}

// ----------------------------------------------------------------- daftar & detail

export type IntakeRingkas = {
  id: string
  status: string
  classification: string
  duplicateLevel: string
  inputKind: string
  sourceFileName: string | null
  vesselName: string | null
  /** Step 4F — "Tug + Tongkang" bila ada pasangan. */
  vesselCount: number
  eta: string | null
  portName: string | null
  voyageId: string | null
  voyageNumber: string | null
  errorCode: string | null
  createdAt: Date
}

export async function listIntakes(ctx: TenantContext, q: URLSearchParams): Promise<IntakeRingkas[]> {
  requireIntake(ctx)
  const status = q.get('status')
  if (status && !(P.STATUS_INTAKE as readonly string[]).includes(status)) throw validation('Status tidak dikenal.')
  const db = forTenant(ctx)
  const rows = await db.vesselCallIntake.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true, status: true, classification: true, duplicateLevel: true, inputKind: true,
      sourceFileName: true, proposal: true, matches: true, voyageId: true, errorCode: true, createdAt: true,
    },
  })
  const voyageIds = rows.map((r) => r.voyageId).filter((x): x is string => !!x)
  // Step 4F — tampilkan nama MASTER (kapal/pelabuhan terpilih), bukan hanya teks/kode dari dokumen.
  const idKapal = new Set<string>()
  const idPort = new Set<string>()
  for (const r of rows) {
    const p = r.proposal as unknown
    const m = r.matches as unknown
    if (!P.proposalSah(p) || !P.matchesSah(m, p.vessels.length)) continue
    const i = P.indeksKapalUtama(p)
    if (i >= 0 && m.vessels[i].selectedId) idKapal.add(m.vessels[i].selectedId!)
    if (m.port.selectedId) idPort.add(m.port.selectedId)
  }
  const [voyages, kapalMaster, portMaster] = await Promise.all([
    voyageIds.length ? db.voyage.findMany({ where: { id: { in: voyageIds } }, select: { id: true, voyageNumber: true } }) : [],
    idKapal.size ? db.vessel.findMany({ where: { id: { in: Array.from(idKapal) } }, select: { id: true, name: true } }) : [],
    idPort.size ? db.port.findMany({ where: { id: { in: Array.from(idPort) } }, select: { id: true, name: true } }) : [],
  ])
  const namaKapal = new Map(kapalMaster.map((x) => [x.id, x.name]))
  const namaPort = new Map(portMaster.map((x) => [x.id, x.name]))
  return rows.map((r) => {
    const p = r.proposal as unknown
    const m = r.matches as unknown
    const sah = P.proposalSah(p)
    const mSah = sah && P.matchesSah(m, p.vessels.length)
    const utama = sah ? P.indeksKapalUtama(p) : -1
    const idK = mSah && utama >= 0 ? m.vessels[utama].selectedId : null
    const idP = mSah ? m.port.selectedId : null
    return {
      id: r.id,
      status: r.status,
      classification: r.classification,
      duplicateLevel: r.duplicateLevel,
      inputKind: r.inputKind,
      sourceFileName: r.sourceFileName,
      vesselName: (idK && namaKapal.get(idK)) || (sah && utama >= 0 ? p.vessels[utama].name.value ?? p.vessels[utama].imo.value ?? p.vessels[utama].mmsi.value : null),
      vesselCount: sah ? p.vessels.filter((v) => !v.excluded).length : 0,
      eta: sah ? p.eta.value : null,
      portName: (idP && namaPort.get(idP)) || (sah ? p.portName.value ?? p.portUnlocode.value : null),
      voyageId: r.voyageId,
      voyageNumber: voyages.find((v) => v.id === r.voyageId)?.voyageNumber ?? null,
      errorCode: r.errorCode,
      createdAt: r.createdAt,
    }
  })
}

export async function getIntake(ctx: TenantContext, id: string): Promise<IntakeDto> {
  requireIntake(ctx)
  const row = await rekonsiliasi(ctx, await bacaBaris(ctx, id))
  return keDto(ctx, row)
}

// ----------------------------------------------------------------- tinjauan (PATCH)

const ENTITAS_PILIH = ['vessel', 'principal', 'customer', 'port'] as const
type EntitasPilih = (typeof ENTITAS_PILIH)[number]

function indeksKapal(p: P.Proposal, v: unknown): number {
  const i = Number(v)
  if (!Number.isInteger(i) || i < 0 || i >= p.vessels.length) throw validation('Indeks kapal tidak sah.')
  return i
}

function hasilEntitas(m: P.Matches, e: EntitasPilih, i: number): P.HasilCocok {
  return e === 'vessel' ? m.vessels[i] : m[e]
}
function setEntitas(m: P.Matches, e: EntitasPilih, i: number, h: P.HasilCocok): void {
  if (e === 'vessel') m.vessels[i] = h
  else m[e] = h
}
const kunciEntitas = (e: EntitasPilih, i: number) => (e === 'vessel' ? `vessel:${i}` : e)

function kapalKosong(): P.KapalUsulan {
  return {
    name: P.fieldKosong(),
    imo: P.fieldKosong(),
    mmsi: P.fieldKosong(),
    callSign: P.fieldKosong(),
    vesselType: P.fieldKosong(),
    role: P.fieldKosong<'TUG' | 'BARGE'>(),
    excluded: false,
  }
}

async function pastikanMasterAda(ctx: TenantContext, e: EntitasPilih, id: string): Promise<void> {
  const db = forTenant(ctx)
  const ada =
    e === 'vessel'
      ? await db.vessel.findFirst({ where: { id }, select: { id: true } })
      : e === 'principal'
        ? await db.principal.findFirst({ where: { id }, select: { id: true } })
        : e === 'customer'
          ? await db.customer.findFirst({ where: { id, deletedAt: null, isActive: true }, select: { id: true } })
          : await db.port.findFirst({ where: { id, deletedAt: null }, select: { id: true } })
  if (!ada) throw notFound(e === 'vessel' ? 'Kapal' : e === 'principal' ? 'Principal' : e === 'customer' ? 'Customer' : 'Pelabuhan')
}

/**
 * §13 — penyuntingan peninjau. TIDAK memanggil AI. Pencocokan & duplikat dihitung
 * ulang deterministik; `version` naik (CAS).
 *
 * Body (semua opsional kecuali version):
 *   fields        { principalName, customerName, portName, portUnlocode, jetty, eta, etb, etc, etd, agencyType, clientReference }
 *   vessels       [{ index, name?, imo?, mmsi?, callSign?, vesselType?, role?, excluded? }]
 *   addVessel     true
 *   select        { entity, index?, id|null, created? }   — pilih kandidat / kaitkan master baru / batalkan pilihan
 *   confirm       { entity, index? }                        — konfirmasi kecocokan yang butuh konfirmasi
 *   leaveEmpty    { entity: principal|customer, value }
 *   confirmSourceFields  true                                — nilai dari PDF/gambar sudah dicek terhadap dokumen
 *   classification NEW_NOMINATION|NEW_APPOINTMENT            — hanya dari INSUFFICIENT_INFORMATION & syarat minimum terpenuhi
 *   cargoes       [{ name, quantity?, unit?, operation? }]
 */
export async function updateIntake(
  ctx: TenantContext,
  id: string,
  body: Record<string, unknown>,
  jejak: Jejak = {},
): Promise<IntakeDto> {
  requireIntake(ctx)
  const row = await rekonsiliasi(ctx, await bacaBaris(ctx, id), jejak)
  if (row.status !== 'NEEDS_REVIEW') throw conflict('Intake ini tidak lagi dalam tinjauan.', { code: 'NOT_IN_REVIEW' })
  const version = versiDari(body)
  if (version !== row.version) throw galatVersi()

  const asal = uraikan(row)
  const p = salin(asal.p)
  const m = salin(asal.m)
  let classification = row.classification
  const berubah = new Set<string>()
  const perubahan: Array<{ field: string; lama: unknown; baru: unknown }> = []
  const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

  if (body.fields !== undefined) {
    if (!isObj(body.fields)) throw validation('fields harus objek.')
    for (const [kunci, mentah] of Object.entries(body.fields)) {
      if (!(P.FIELD_BISA_DIEDIT as readonly string[]).includes(kunci)) throw validation(`Field "${kunci}" tidak bisa diubah.`)
      const f = kunci as P.FieldBisaDiedit
      let nilai = teksOpsional(mentah)
      if (nilai && P.FIELD_TANGGAL.includes(f)) {
        const t = P.tanggalSah(nilai)
        if (!t) throw validation(`${f.toUpperCase()} harus berformat YYYY-MM-DD (tahun 4 digit).`, { code: 'DATE_INVALID', field: f.toUpperCase() })
        if (!P.dalamRentangTanggal(t, tanggalBisnis(new Date()))) {
          throw validation(`${f.toUpperCase()} di luar rentang yang diterima (−${P.TANGGAL_MUNDUR_HARI} s/d +${P.TANGGAL_MAJU_HARI} hari).`, { code: 'DATE_OUTSIDE_WINDOW', field: f.toUpperCase(), mundur: P.TANGGAL_MUNDUR_HARI, maju: P.TANGGAL_MAJU_HARI })
        }
        nilai = t
      }
      if (nilai && f === 'portUnlocode') {
        const u = P.normalisasiUnlocode(nilai)
        if (!u) throw validation('UN/LOCODE harus 5 karakter (mis. IDSRI).')
        nilai = u
      }
      if (nilai && f === 'agencyType') {
        nilai = nilai.toUpperCase()
        if (!(P.JENIS_KEAGENAN as readonly string[]).includes(nilai)) throw validation(`Jenis keagenan: ${P.JENIS_KEAGENAN.join(', ')}.`)
      }
      if (p[f].value === nilai) continue
      perubahan.push({ field: f, lama: p[f].value, baru: nilai })
      p[f] = P.fieldDiedit(p[f], nilai)
      const kc = P.kunciCocokUntukField(f)
      if (kc) berubah.add(kc)
    }
  }

  if (body.addVessel === true) {
    if (p.vessels.length >= P.MAKS_KAPAL_INTAKE) throw validation(`Maksimal ${P.MAKS_KAPAL_INTAKE} kapal per intake.`)
    p.vessels.push(kapalKosong())
    m.vessels.push(P.cocokKosong())
    perubahan.push({ field: `vessels.${p.vessels.length - 1}`, lama: null, baru: 'ADDED' })
  }

  if (body.vessels !== undefined) {
    if (!Array.isArray(body.vessels)) throw validation('vessels harus larik.')
    for (const ubah of body.vessels) {
      if (!isObj(ubah)) throw validation('Isi vessels tidak sah.')
      const i = indeksKapal(p, ubah.index)
      const kv = p.vessels[i]
      const setel = (k: 'name' | 'imo' | 'mmsi' | 'callSign' | 'vesselType', nilai: string | null, identitas: boolean) => {
        if (kv[k].value === nilai) return
        perubahan.push({ field: `vessels.${i}.${k}`, lama: kv[k].value, baru: nilai })
        kv[k] = P.fieldDiedit(kv[k], nilai)
        if (identitas) berubah.add(`vessel:${i}`)
      }
      if ('name' in ubah) setel('name', teksOpsional(ubah.name), true)
      if ('imo' in ubah) {
        const imo = normalisasiImo(teksOpsional(ubah.imo, 40))
        if (imo && !/^\d{7}$/.test(imo)) throw validation('IMO harus 7 digit.')
        setel('imo', imo, true)
      }
      if ('mmsi' in ubah) {
        const mm = normalisasiMmsi(teksOpsional(ubah.mmsi, 40))
        if (mm && !mmsiSah(mm)) throw validation('MMSI harus 9 digit.')
        setel('mmsi', mm, true)
      }
      if ('callSign' in ubah) setel('callSign', normalisasiCallSign(teksOpsional(ubah.callSign, 40)), true)
      if ('vesselType' in ubah) setel('vesselType', teksOpsional(ubah.vesselType, 80), false)
      if ('role' in ubah) {
        const r = teksOpsional(ubah.role, 10)?.toUpperCase() ?? null
        if (r && !(P.PERAN_KAPAL as readonly string[]).includes(r)) throw validation('Peran kapal: TUG, BARGE, atau kosong.')
        if (kv.role.value !== r) {
          perubahan.push({ field: `vessels.${i}.role`, lama: kv.role.value, baru: r })
          kv.role = P.fieldDiedit(kv.role, r as 'TUG' | 'BARGE' | null)
        }
      }
      if ('excluded' in ubah) {
        const ex = ubah.excluded === true
        if (kv.excluded !== ex) {
          perubahan.push({ field: `vessels.${i}.excluded`, lama: kv.excluded, baru: ex })
          kv.excluded = ex
        }
      }
    }
  }

  const masterDibuat: Array<{ entity: string; id: string }> = []
  const pilihan: Array<{ entity: string; index: number | null; id: string | null; basis: string }> = []
  if (body.select !== undefined) {
    if (!isObj(body.select)) throw validation('select harus objek.')
    const e = body.select.entity as EntitasPilih
    if (!(ENTITAS_PILIH as readonly string[]).includes(e)) throw validation('Entitas pilihan tidak dikenal.')
    const i = e === 'vessel' ? indeksKapal(p, body.select.index) : 0
    const idPilih = teksOpsional(body.select.id, 40)
    const dibuatManusia = body.select.created === true
    if (dibuatManusia && e === 'port') throw validation('Pelabuhan tidak dibuat lewat intake — pilih dari master pelabuhan.')
    const lama = hasilEntitas(m, e, i)
    if (idPilih) {
      await pastikanMasterAda(ctx, e, idPilih)
      setEntitas(m, e, i, {
        ...P.cocokKosong('MATCHED'),
        basis: dibuatManusia ? 'CREATED_BY_REVIEWER' : 'SELECTED_BY_REVIEWER',
        selectedId: idPilih,
        candidates: lama.candidates,
        confirmed: true,
      })
      if (dibuatManusia) masterDibuat.push({ entity: e, id: idPilih })
    } else {
      setEntitas(m, e, i, P.cocokKosong())
      berubah.add(kunciEntitas(e, i))
    }
    pilihan.push({ entity: e, index: e === 'vessel' ? i : null, id: idPilih, basis: dibuatManusia ? 'CREATED_BY_REVIEWER' : 'SELECTED_BY_REVIEWER' })
  }

  if (body.confirm !== undefined) {
    if (!isObj(body.confirm)) throw validation('confirm harus objek.')
    const e = body.confirm.entity as EntitasPilih
    if (!(ENTITAS_PILIH as readonly string[]).includes(e)) throw validation('Entitas konfirmasi tidak dikenal.')
    const i = e === 'vessel' ? indeksKapal(p, body.confirm.index) : 0
    const h = hasilEntitas(m, e, i)
    if (h.status !== 'MATCHED' || !h.selectedId) throw validation('Tidak ada kecocokan yang bisa dikonfirmasi.', { code: 'NOTHING_TO_CONFIRM' })
    setEntitas(m, e, i, { ...h, confirmed: true })
    pilihan.push({ entity: e, index: e === 'vessel' ? i : null, id: h.selectedId, basis: `CONFIRMED_${h.basis}` })
  }

  if (body.leaveEmpty !== undefined) {
    if (!isObj(body.leaveEmpty)) throw validation('leaveEmpty harus objek.')
    const e = body.leaveEmpty.entity
    if (e !== 'principal' && e !== 'customer') throw validation('Hanya principal/customer yang boleh dibiarkan kosong.')
    if (body.leaveEmpty.value === true) {
      m[e] = { ...P.cocokKosong(m[e].status), candidates: m[e].candidates, leftEmpty: true }
    } else {
      m[e] = P.cocokKosong()
      berubah.add(e)
    }
    pilihan.push({ entity: e, index: null, id: null, basis: body.leaveEmpty.value === true ? 'LEFT_EMPTY' : 'UNSET_LEFT_EMPTY' })
  }

  let sumberDikonfirmasi = false
  if (body.confirmSourceFields === true) {
    const tandai = <T>(f: P.FieldUsulan<T>) => (f.flags.includes('UNVERIFIED_SOURCE') ? { ...f, confirmed: true } : f)
    p.vessels = p.vessels.map((v) => ({ ...v, name: tandai(v.name), imo: tandai(v.imo), mmsi: tandai(v.mmsi), callSign: tandai(v.callSign) }))
    for (const kf of ['principalName', 'customerName', 'portName', 'portUnlocode'] as const) p[kf] = tandai(p[kf])
    sumberDikonfirmasi = true
  }

  if (body.cargoes !== undefined) {
    if (!Array.isArray(body.cargoes) || body.cargoes.length > P.MAKS_CARGO_INTAKE) throw validation(`cargoes harus larik (maks ${P.MAKS_CARGO_INTAKE}).`)
    p.cargoes = body.cargoes.map((c) => {
      if (!isObj(c)) throw validation('Isi cargoes tidak sah.')
      const name = teksOpsional(c.name)
      if (!name) throw validation('Nama muatan wajib diisi.')
      const q = c.quantity === null || c.quantity === undefined || c.quantity === '' ? null : Number(c.quantity)
      if (q !== null && (!Number.isFinite(q) || q < 0)) throw validation('Jumlah muatan harus angka ≥ 0.')
      const op = teksOpsional(c.operation, 10)?.toUpperCase() ?? null
      if (op && !(P.OPERASI_CARGO as readonly string[]).includes(op)) throw validation('Operasi muatan: LOAD atau DISCHARGE.')
      // Jejak asal dipertahankan untuk baris yang isinya tidak berubah; hanya baris
      // baru atau yang benar-benar diubah peninjau yang dicap USER_EDITED (§9).
      const baru = { name, quantity: q, unit: teksOpsional(c.unit, 20), operation: op as 'LOAD' | 'DISCHARGE' | null }
      const sama = asal.p.cargoes.find(
        (a) => a.name === baru.name && a.quantity === baru.quantity && a.unit === baru.unit && a.operation === baru.operation,
      )
      return { ...baru, source: sama ? sama.source : ('USER_EDITED' as const) }
    })
    perubahan.push({ field: 'cargoes', lama: asal.p.cargoes.length, baru: p.cargoes.length })
  }

  if (body.classification !== undefined) {
    const c = String(body.classification)
    if (row.classification !== 'INSUFFICIENT_INFORMATION' || !(P.KLASIFIKASI_PILOT as readonly string[]).includes(c)) {
      throw validation('Klasifikasi hanya bisa ditetapkan NEW_NOMINATION/NEW_APPOINTMENT untuk intake yang informasinya tadinya belum lengkap.')
    }
    if (!P.syaratMinimumTerpenuhi(p)) throw validation('Lengkapi identitas kapal dan pelabuhan/ETA lebih dulu.', { code: 'MINIMUM_NOT_MET' })
    if (c !== classification) {
      perubahan.push({ field: 'classification', lama: classification, baru: c })
      classification = c
    }
  }

  const master = await muatMaster(ctx)
  const mBaru = P.cocokkanSemua(p, master, NORM, m, berubah, { konfirmasiSemua: P.inputVisual(row.inputKind) })
  const dup = await hitungDuplikat(ctx, p, mBaru, row.id)

  const n = await forTenant(ctx).vesselCallIntake.updateMany({
    where: { id: row.id, status: 'NEEDS_REVIEW', version: row.version },
    data: {
      proposal: json(p),
      matches: json(mBaru),
      classification,
      duplicateLevel: dup.level,
      duplicateCandidates: json(dup.candidates),
      reviewedByUserId: ctx.userId,
      reviewedAt: new Date(),
      version: { increment: 1 },
    },
  })
  if (n.count === 0) throw galatVersi()

  await catatAudit(
    ctx,
    {
      tableName: 'VesselCallIntake',
      recordId: row.id,
      action: 'UPDATE',
      oldValue: { version: row.version, duplicateLevel: row.duplicateLevel },
      newValue: {
        peristiwa: 'TINJAU',
        perubahan,
        pilihan,
        masterDibuatPeninjau: masterDibuat,
        sumberDikonfirmasi,
        duplicateLevel: dup.level,
      },
    },
    jejak,
  )
  return keDto(ctx, await bacaBaris(ctx, row.id))
}

// ----------------------------------------------------------------- approve / retry

function kodeGagalBuat(e: unknown): string {
  if (e instanceof ServiceError) {
    if (e.code === 'FORBIDDEN') return 'CREATE_FORBIDDEN'
    if (e.code === 'NOT_FOUND') return 'MASTER_NOT_FOUND'
    if (e.code === 'VALIDATION') return 'VALIDATION'
    if (e.code === 'CONFLICT') return 'CONFLICT'
    return 'CREATE_FAILED'
  }
  if (e instanceof PrismaNS.PrismaClientKnownRequestError && e.code === 'P2002') return 'VOYAGE_NUMBER_COLLISION'
  return 'CREATE_FAILED'
}

/** Field yang diubah manusia (untuk jejak approval). */
function fieldDieditManusia(p: P.Proposal): string[] {
  const hasil: string[] = []
  const cek = (path: string, f: P.FieldUsulan<unknown>) => {
    if (f.source === 'USER_EDITED' || (f.source === 'EMPTY' && f.confirmed)) hasil.push(path)
  }
  p.vessels.forEach((v, i) => {
    for (const k of ['name', 'imo', 'mmsi', 'callSign', 'vesselType', 'role'] as const) cek(`vessels.${i}.${k}`, v[k])
  })
  for (const k of P.FIELD_BISA_DIEDIT) cek(k, p[k])
  return hasil
}

type PraApproval = { p: P.Proposal; m: P.Matches; dup: P.HasilDuplikat; portal: number }

/**
 * Hitung ulang kecocokan & duplikat SAAT approve/retry. Bila hasilnya lebih berisiko
 * daripada yang dilihat peninjau (level duplikat naik, atau master berubah), simpan
 * hasil baru (versi naik) dan tolak 409 — peninjau wajib melihat ulang.
 */
async function siapkanApproval(ctx: TenantContext, row: BarisIntake): Promise<PraApproval> {
  const { p, m } = uraikan(row)
  const master = await muatMaster(ctx)
  const m2 = P.cocokkanSemua(p, master, NORM, m, new Set(), { konfirmasiSemua: P.inputVisual(row.inputKind) })
  const dup = await hitungDuplikat(ctx, p, m2, row.id)
  const levelNaik = P.peringkatDuplikat(dup.level) > P.peringkatDuplikat(row.duplicateLevel)
  const masterBerubah = P.jsonKanonik(m2) !== P.jsonKanonik(m)
  if (levelNaik || masterBerubah) {
    await forTenant(ctx).vesselCallIntake.updateMany({
      where: { id: row.id, status: row.status, version: row.version },
      data: {
        matches: json(m2),
        duplicateLevel: dup.level,
        duplicateCandidates: json(dup.candidates),
        version: { increment: 1 },
      },
    })
    throw new ServiceError(
      'CONFLICT',
      levelNaik
        ? 'Sejak ditinjau, muncul voyage/intake yang mungkin sama. Tinjau ulang peringatan duplikat sebelum menyetujui.'
        : 'Data master berubah sejak ditinjau. Tinjau ulang kecocokan sebelum menyetujui.',
      { code: levelNaik ? 'DUPLICATE_LEVEL_INCREASED' : 'MASTER_CHANGED', duplicateLevel: dup.level },
    )
  }
  const portal = await jumlahAksesPortal(ctx, P.idTerpakai(m2.customer))
  return { p, m: m2, dup, portal }
}

/**
 * §15 — approve. Keputusan duplikat & ack portal diberikan DI SINI (bukan di PATCH),
 * dicek ulang terhadap duplikat yang baru dihitung. Klaim atomik NEEDS_REVIEW→CREATING.
 */
export async function approveIntake(
  ctx: TenantContext,
  id: string,
  body: Record<string, unknown>,
  jejak: Jejak = {},
): Promise<IntakeDto> {
  requireIntake(ctx)
  const row = await rekonsiliasi(ctx, await bacaBaris(ctx, id), jejak)
  if (row.status === 'FAILED') throw conflict('Pembuatan voyage sebelumnya gagal — gunakan "Coba lagi" atau tolak intake ini.', { code: 'PREVIOUS_CREATE_FAILED' })
  if (row.status !== 'NEEDS_REVIEW') throw conflict('Intake ini sudah diproses.', { code: 'INTAKE_ALREADY_PROCESSED' })
  const version = versiDari(body)
  if (version !== row.version) throw galatVersi()

  const keputusan: P.KeputusanApproval = {
    duplicateDecision: teksOpsional(body.duplicateDecision, 30),
    decisionReason: teksOpsional(body.decisionReason, 1000),
    duplicateConfirmed: body.duplicateConfirmed === true,
    portalExposureAck: body.portalExposureAck === true,
  }
  if (keputusan.duplicateDecision === 'LINK_EXISTING') throw validation('Untuk menautkan voyage yang sudah ada, gunakan tindakan "Tautkan".')
  if (keputusan.duplicateDecision && !(P.KEPUTUSAN_DUPLIKAT as readonly string[]).includes(keputusan.duplicateDecision)) {
    throw validation('Keputusan duplikat tidak dikenal.')
  }

  const pra = await siapkanApproval(ctx, row)
  const syarat = P.syaratApproval({
    status: row.status,
    classification: row.classification,
    proposal: pra.p,
    matches: pra.m,
    duplicateLevel: pra.dup.level,
    keputusan,
    portalAccessCount: pra.portal,
  })
  if (syarat.length > 0) throw validation('Syarat persetujuan belum terpenuhi.', { code: 'APPROVAL_CONDITIONS', conditions: syarat })

  const sekarang = new Date()
  const denganDuplikat = pra.dup.level !== 'NO_DUPLICATE'
  const klaim = await forTenant(ctx).vesselCallIntake.updateMany({
    where: { id: row.id, status: 'NEEDS_REVIEW', version: row.version },
    data: {
      status: 'CREATING',
      claimedAt: sekarang,
      reviewedByUserId: ctx.userId,
      reviewedAt: sekarang,
      duplicateLevel: pra.dup.level,
      duplicateCandidates: json(pra.dup.candidates),
      duplicateDecision: denganDuplikat ? keputusan.duplicateDecision : null,
      decisionReason: denganDuplikat ? keputusan.decisionReason : null,
      portalExposureAck: pra.portal > 0 && keputusan.portalExposureAck,
      errorCode: null,
      version: { increment: 1 },
    },
  })
  if (klaim.count === 0) {
    throw new ServiceError('CONFLICT', 'Intake ini sedang atau sudah diproses peninjau lain.', { code: 'ALREADY_CLAIMED' })
  }

  // Jejak keputusan approval WAJIB tertulis (pola finance/audit.ts). Gagal → FAILED, bukan voyage tanpa jejak.
  try {
    await catatAudit(
      ctx,
      {
        tableName: 'VesselCallIntake',
        recordId: row.id,
        action: 'APPROVE',
        oldValue: { status: 'NEEDS_REVIEW', version: row.version },
        newValue: {
          status: 'CREATING',
          classification: row.classification,
          duplicateLevel: pra.dup.level,
          duplicateDecision: denganDuplikat ? keputusan.duplicateDecision : null,
          decisionReason: denganDuplikat ? keputusan.decisionReason : null,
          duplicateCandidateIds: pra.dup.candidates.map((c) => c.id),
          portalExposureAck: pra.portal > 0 && keputusan.portalExposureAck,
          portalActiveAccessCount: pra.portal,
          fieldDiedit: fieldDieditManusia(pra.p),
          masterDibuatPeninjau: [...pra.m.vessels, pra.m.principal, pra.m.customer]
            .filter((h) => h.basis === 'CREATED_BY_REVIEWER')
            .map((h) => h.selectedId),
          vesselIds: P.kapalTerpilih(pra.p, pra.m),
          portId: P.idTerpakai(pra.m.port),
          principalId: P.idTerpakai(pra.m.principal),
          customerId: P.idTerpakai(pra.m.customer),
          eta: pra.p.eta.value,
        },
      },
      jejak,
    )
  } catch (e) {
    await forTenant(ctx).vesselCallIntake.updateMany({
      where: { id: row.id, status: 'CREATING' },
      data: { status: 'FAILED', errorCode: 'AUDIT_FAILED', version: { increment: 1 } },
    })
    throw e
  }

  return jalankanPembuatan(ctx, row.id, pra.p, pra.m, jejak)
}

async function jalankanPembuatan(
  ctx: TenantContext,
  intakeId: string,
  p: P.Proposal,
  m: P.Matches,
  jejak: Jejak,
): Promise<IntakeDto> {
  const db = forTenant(ctx)
  const utama = P.indeksKapalUtama(p)
  const vesselId = P.idTerpakai(m.vessels[utama])
  const body: Record<string, unknown> = {
    vesselId,
    principalId: P.idTerpakai(m.principal),
    customerId: P.idTerpakai(m.customer),
    portId: P.idTerpakai(m.port),
    agencyType: p.agencyType.value,
    status: 'PLANNED',
    eta: p.eta.value,
    etb: p.etb.value,
    etc: p.etc.value,
    etd: p.etd.value,
    notes: P.catatanVoyage(p),
  }

  let voyageId: string
  try {
    // SATU-SATUNYA jalur pembuatan voyage — dengan konteks approver yang sesungguhnya.
    const voyage = await createVoyage(ctx, body, { sourceIntakeId: intakeId })
    voyageId = voyage.id
  } catch (e) {
    const ada = await db.voyage.findFirst({ where: { sourceIntakeId: intakeId }, select: { id: true } })
    if (ada) return selesaikan(ctx, intakeId, p, ada.id, ['RECONCILED_AFTER_ERROR'], jejak)
    const kode = kodeGagalBuat(e)
    console.error('[intake] createVoyage gagal', { intakeId, kode })
    await db.vesselCallIntake.updateMany({
      where: { id: intakeId, status: 'CREATING' },
      data: { status: 'FAILED', errorCode: kode, version: { increment: 1 } },
    })
    await catatAudit(
      ctx,
      { tableName: 'VesselCallIntake', recordId: intakeId, action: 'UPDATE', oldValue: { status: 'CREATING' }, newValue: { status: 'FAILED', errorCode: kode } },
      jejak,
    )
    // Step 4F — pesan utama untuk manusia; kode mesin hanya di `details` (layar menerjemahkannya).
    const pesan = e instanceof ServiceError && e.code !== 'CONFLICT' ? ` ${e.message}` : ''
    throw new ServiceError('CONFLICT', `Voyage belum dibuat.${pesan}`, { code: 'CREATE_FAILED', errorCode: kode })
  }

  const peringatan: string[] = []
  try {
    await catatAudit(
      ctx,
      { tableName: 'Voyage', recordId: voyageId, action: 'CREATE', newValue: { peristiwa: 'DIBUAT_DARI_INTAKE', intakeId } },
      jejak,
    )
  } catch {
    console.error('[intake] audit pembuatan voyage gagal', { intakeId })
    peringatan.push('VOYAGE_AUDIT_FAILED')
  }

  // Best-effort (§19): kegagalan TIDAK membatalkan voyage yang sudah lahir.
  const aktif = p.vessels.map((v, i) => ({ v, i })).filter((x) => !x.v.excluded)
  if (aktif.length > 1 || p.vessels[utama].role.value) {
    const daftar = [
      { vesselId, role: p.vessels[utama].role.value },
      ...aktif.filter((x) => x.i !== utama).map((x) => ({ vesselId: P.idTerpakai(m.vessels[x.i]), role: x.v.role.value })),
    ]
    try {
      await setVoyageVessels(ctx, voyageId, { vessels: daftar }, jejak)
    } catch (e) {
      console.error('[intake] kapal tambahan gagal dipasang', { intakeId, kode: e instanceof ServiceError ? e.code : 'ERROR' })
      peringatan.push('VESSELS_NOT_ATTACHED')
    }
  }
  let cargoGagal = 0
  for (const c of p.cargoes) {
    try {
      await createCargo(ctx, voyageId, { cargoName: c.name, quantity: c.quantity, unit: c.unit, operation: c.operation })
    } catch {
      cargoGagal++
    }
  }
  if (cargoGagal > 0) peringatan.push('CARGO_NOT_CREATED')

  return selesaikan(ctx, intakeId, p, voyageId, peringatan, jejak)
}

async function selesaikan(
  ctx: TenantContext,
  intakeId: string,
  p: P.Proposal,
  voyageId: string,
  peringatan: string[],
  jejak: Jejak,
): Promise<IntakeDto> {
  const db = forTenant(ctx)
  const n = await db.vesselCallIntake.updateMany({
    where: { id: intakeId, status: { in: ['CREATING', 'FAILED'] } },
    data: {
      status: 'COMPLETED',
      voyageId,
      activeHashKey: null,
      proposal: json(P.tanpaKontak(p)),
      postCreateWarnings: json(peringatan),
      errorCode: null,
      version: { increment: 1 },
    },
  })
  if (n.count > 0) {
    await catatAudit(
      ctx,
      {
        tableName: 'VesselCallIntake',
        recordId: intakeId,
        action: 'UPDATE',
        newValue: { status: 'COMPLETED', voyageId, postCreateWarnings: peringatan },
      },
      jejak,
    )
  }
  return keDto(ctx, await bacaBaris(ctx, intakeId))
}

/** §21 — coba lagi dari FAILED oleh approver; syarat & duplikat dihitung ulang. */
export async function retryIntake(
  ctx: TenantContext,
  id: string,
  body: Record<string, unknown>,
  jejak: Jejak = {},
): Promise<IntakeDto> {
  requireIntake(ctx)
  const row = await rekonsiliasi(ctx, await bacaBaris(ctx, id), jejak)
  if (row.status !== 'FAILED') throw conflict('Hanya intake yang gagal yang bisa dicoba lagi.', { code: 'RETRY_NOT_FAILED' })
  const version = versiDari(body)
  if (version !== row.version) throw galatVersi()

  const db = forTenant(ctx)
  const ada = await db.voyage.findFirst({ where: { sourceIntakeId: row.id }, select: { id: true } })
  if (ada) return selesaikan(ctx, row.id, uraikan(row).p, ada.id, ['RECONCILED'], jejak)

  const pra = await siapkanApproval(ctx, row)
  const syarat = P.syaratApproval({
    status: row.status,
    classification: row.classification,
    proposal: pra.p,
    matches: pra.m,
    duplicateLevel: pra.dup.level,
    keputusan: {
      duplicateDecision: row.duplicateDecision,
      decisionReason: row.decisionReason,
      duplicateConfirmed: true,
      portalExposureAck: row.portalExposureAck,
    },
    portalAccessCount: pra.portal,
    statusDiharapkan: 'FAILED',
  })
  if (syarat.length > 0) throw validation('Syarat persetujuan tidak lagi terpenuhi — tolak intake ini lalu kirim ulang.', { code: 'APPROVAL_CONDITIONS', conditions: syarat })

  const klaim = await db.vesselCallIntake.updateMany({
    where: { id: row.id, status: 'FAILED', version: row.version },
    data: { status: 'CREATING', claimedAt: new Date(), errorCode: null, reviewedByUserId: ctx.userId, reviewedAt: new Date(), version: { increment: 1 } },
  })
  if (klaim.count === 0) throw new ServiceError('CONFLICT', 'Intake ini sedang diproses peninjau lain.', { code: 'ALREADY_CLAIMED' })
  await catatAudit(
    ctx,
    { tableName: 'VesselCallIntake', recordId: row.id, action: 'UPDATE', oldValue: { status: 'FAILED', errorCode: row.errorCode }, newValue: { peristiwa: 'COBA_LAGI', status: 'CREATING' } },
    jejak,
  )
  return jalankanPembuatan(ctx, row.id, pra.p, pra.m, jejak)
}

// ----------------------------------------------------------------- reject / link

export async function rejectIntake(
  ctx: TenantContext,
  id: string,
  body: Record<string, unknown>,
  jejak: Jejak = {},
): Promise<IntakeDto> {
  requireIntake(ctx)
  const row = await rekonsiliasi(ctx, await bacaBaris(ctx, id), jejak)
  if (row.status !== 'NEEDS_REVIEW' && row.status !== 'FAILED') throw conflict('Intake ini sudah diproses.', { code: 'INTAKE_ALREADY_PROCESSED' })
  const version = versiDari(body)
  if (version !== row.version) throw galatVersi()
  const alasan = teksOpsional(body.reason, 1000)
  if (!alasan || alasan.length < P.MIN_PANJANG_ALASAN_TOLAK) throw validation('Alasan penolakan wajib diisi.')
  const { p } = uraikan(row)

  const n = await forTenant(ctx).vesselCallIntake.updateMany({
    where: { id: row.id, status: row.status, version: row.version },
    data: {
      status: 'REJECTED',
      activeHashKey: null,
      decisionReason: alasan,
      proposal: json(P.tanpaKontak(p)),
      reviewedByUserId: ctx.userId,
      reviewedAt: new Date(),
      version: { increment: 1 },
    },
  })
  if (n.count === 0) throw galatVersi()
  await catatAudit(
    ctx,
    { tableName: 'VesselCallIntake', recordId: row.id, action: 'UPDATE', oldValue: ringkasAudit(row), newValue: { status: 'REJECTED', alasan } },
    jejak,
  )
  return keDto(ctx, await bacaBaris(ctx, row.id))
}

/** §11 — tautkan ke voyage yang SUDAH ADA (harus kandidat duplikat yang dihitung ulang). Tidak membuat voyage. */
export async function linkExistingIntake(
  ctx: TenantContext,
  id: string,
  body: Record<string, unknown>,
  jejak: Jejak = {},
): Promise<IntakeDto> {
  requireIntake(ctx)
  const row = await rekonsiliasi(ctx, await bacaBaris(ctx, id), jejak)
  if (row.status !== 'NEEDS_REVIEW') throw conflict('Intake ini sudah diproses.', { code: 'INTAKE_ALREADY_PROCESSED' })
  const version = versiDari(body)
  if (version !== row.version) throw galatVersi()
  const voyageId = teksOpsional(body.voyageId, 40)
  if (!voyageId) throw validation('Pilih voyage yang akan ditautkan.')

  const { p, m } = uraikan(row)
  const dup = await hitungDuplikat(ctx, p, m, row.id)
  const kandidat = dup.candidates.find((c) => c.type === 'VOYAGE' && c.id === voyageId)
  // Kandidat berasal dari query berpagar tenant → voyage tenant lain mustahil lolos.
  if (!kandidat) throw validation('Voyage tersebut bukan kandidat duplikat intake ini.', { code: 'NOT_DUPLICATE_CANDIDATE' })

  const alasan = teksOpsional(body.reason, 1000)
  const n = await forTenant(ctx).vesselCallIntake.updateMany({
    where: { id: row.id, status: 'NEEDS_REVIEW', version: row.version },
    data: {
      status: 'LINKED_EXISTING',
      voyageId,
      activeHashKey: null,
      duplicateDecision: 'LINK_EXISTING',
      decisionReason: alasan,
      duplicateLevel: dup.level,
      duplicateCandidates: json(dup.candidates),
      proposal: json(P.tanpaKontak(p)),
      reviewedByUserId: ctx.userId,
      reviewedAt: new Date(),
      version: { increment: 1 },
    },
  })
  if (n.count === 0) throw galatVersi()
  await catatAudit(
    ctx,
    {
      tableName: 'VesselCallIntake',
      recordId: row.id,
      action: 'UPDATE',
      oldValue: ringkasAudit(row),
      newValue: { status: 'LINKED_EXISTING', voyageId, duplicateLevel: dup.level, candidateLevel: kandidat.level, alasan },
    },
    jejak,
  )
  return keDto(ctx, await bacaBaris(ctx, row.id))
}
