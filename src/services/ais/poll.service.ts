// Job `ais-position-poll` — pengambilan posisi AIS terjadwal (PRD-003 Step 4).
//
// BATAS TULIS (dikunci prisma/check-ais-contract.mjs):
//   BOLEH ditulis : AisObservation, AisPollRun, AisProviderState.
//   HANYA dibaca  : MonitoredVoyage, Voyage, VoyageVessel, Vessel.
// Tidak pernah menulis Voyage/Vessel/VoyageEvent/Task (K176, K178), tidak pernah
// menyimpan respons mentah vendor, tidak pernah mencatat kunci/URL/badan respons.
//
// Urutan keputusan per tenant (desain Step 3 §7):
//   gerbang → penyedia NONE → jatuh tempo → backoff → pilih kapal (D2/D4) →
//   KUOTA (D5, gagal tertutup) → adapter terkonfigurasi → kunci sewa → panggil →
//   normalisasi → simpan (idempoten) → kesehatan penyedia → retensi (D3).
// TIDAK ADA panggilan penyedia sebelum kuota dan kunci sewa lolos.

import crypto from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { systemContext } from '../context'
import { forTenant } from '../tenant-db'
import { requireAutomation } from '../automation/access'
import type { AisAdapter, AisErrorCode, AisFetchResult } from './contract'
import { kanonikObservasi, normalisasiObservasi, type ObservasiNormal } from './normalize'
import {
  ANGGARAN_JALAN_MS,
  LEASE_DETIK,
  TIMEOUT_PANGGILAN_MS,
  VERSI_AGEN_AIS,
  awalBulanBisnisWita,
  batasRetensi,
  bacaKonfigurasiAis,
  hitungBackoffMs,
  intervalEfektifMenit,
  pecah,
  pilihKapalUntukPoll,
  putuskanKuota,
  sudahJatuhTempo,
  tenantBolehAis,
} from './ais-policy'
import { adapterUntuk } from './registry'
import { PILIH_VOYAGE_AIS, kapalVoyageAis, type KapalAis } from './vessels'

const BATAS_VOYAGE_PER_JALAN = 200
const STATUS_VOYAGE_BERHENTI = ['CLOSED', 'CANCELLED']

export type HasilPollAisTenant = {
  tenant: string
  runId: string | null
  status: string
  /** Observasi baru yang tersimpan. Nama medan mengikuti ringkasan /api/jobs/run. */
  dibuat: number
  /** Posisi yang sudah ada (duplikat). */
  dilewati: number
  /** Kapal di atas batas per jalan. */
  dibatasi: number
  /** 1 bila jalan FAILED/PARTIAL/salah konfigurasi → /api/jobs/run membalas ok:false. */
  gagal: number
  panggilan: number
  galat?: string
}

export type OpsiPollAis = {
  sekarang?: Date
  env?: Readonly<Record<string, string | undefined>>
  /** Hanya untuk uji — produksi selalu lewat registry. */
  adapter?: AisAdapter
  fetchImpl?: typeof fetch
}

const hasil = (tenant: string, status: string, ubah: Partial<HasilPollAisTenant> = {}): HasilPollAisTenant => ({
  tenant, runId: null, status, dibuat: 0, dilewati: 0, dibatasi: 0, gagal: 0, panggilan: 0, ...ubah,
})

const tidur = (ms: number) => new Promise((r) => setTimeout(r, ms))

function catatLog(ringkasan: Record<string, unknown>): void {
  console.log(`[ais-poll] ${JSON.stringify({ pada: new Date().toISOString(), ...ringkasan })}`)
}

export async function jalankanPollAisTenant(tenantId: string, opsi: OpsiPollAis = {}): Promise<HasilPollAisTenant> {
  const env = opsi.env ?? process.env
  const k = bacaKonfigurasiAis(env)
  const ctx = systemContext(tenantId, 'ais:position-poll')
  if (!tenantBolehAis(k, tenantId)) return hasil(tenantId, 'NONAKTIF', { galat: k.alasan ?? 'TENANT_TIDAK_DIIZINKAN' })
  requireAutomation(ctx)

  const adapter = opsi.adapter ?? adapterUntuk(k.penyedia)
  if (!adapter) return hasil(tenantId, 'NONAKTIF', { gagal: 1, galat: 'PENYEDIA_TIDAK_DIKENAL' })
  if (adapter.id === 'NONE') return hasil(tenantId, 'TANPA_PENYEDIA')

  const sekarang = opsi.sekarang ?? new Date()
  const db = forTenant(ctx)
  const provider = adapter.id
  const interval = intervalEfektifMenit(k, adapter.capabilities)

  // --- jatuh tempo: tanpa baris run (menghindari derau tiap jam bila interval > 60).
  const terakhir = await db.aisPollRun.findFirst({
    where: { provider, status: { in: ['OK', 'PARTIAL', 'FAILED'] } },
    orderBy: { startedAt: 'desc' },
    select: { startedAt: true },
  })
  if (!sudahJatuhTempo(terakhir?.startedAt ?? null, sekarang, interval)) return hasil(tenantId, 'SKIPPED_NOT_DUE')

  // --- keadaan penyedia (satu baris per tenant+penyedia; createMany = tanpa log P2002).
  await db.aisProviderState.createMany({ data: [{ tenantId, provider }], skipDuplicates: true })
  const state = await db.aisProviderState.findFirst({ where: { provider } })
  if (!state) throw new Error('AIS_PROVIDER_STATE_HILANG')

  const runSelesai = async (status: string, errorCode: string | null, ubah: Record<string, number> = {}) => {
    const r = await db.aisPollRun.create({
      data: { tenantId, provider, agentVersion: VERSI_AGEN_AIS, startedAt: sekarang, finishedAt: new Date(), status, errorCode, ...ubah },
      select: { id: true },
    })
    return r.id
  }

  if (state.backoffUntil && state.backoffUntil.getTime() > sekarang.getTime()) {
    const runId = await runSelesai('SKIPPED_BACKOFF', state.lastErrorCode)
    catatLog({ tenant: tenantId, runId, status: 'SKIPPED_BACKOFF' })
    return hasil(tenantId, 'SKIPPED_BACKOFF', { runId })
  }

  // --- pilih kapal (D4 tug, D2 MMSI terverifikasi).
  const dipantau = await db.monitoredVoyage.findMany({
    where: { enabled: true },
    orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
    take: BATAS_VOYAGE_PER_JALAN,
    select: { voyage: { select: PILIH_VOYAGE_AIS } },
  })
  const perVoyage = dipantau
    .map((m) => m.voyage)
    .filter((v) => v.deletedAt === null && !STATUS_VOYAGE_BERHENTI.includes(v.status))
    .map((v) => kapalVoyageAis(v))
  const pilih = pilihKapalUntukPoll<KapalAis>(perVoyage)
  const potongan = pecah(pilih.diambil, adapter.capabilities.maxMmsiPerRequest)
  const hitungDasar = {
    vesselsEligible: pilih.layak,
    vesselsSkippedUnverified: pilih.tidakTerverifikasi,
    vesselsCapped: pilih.dibatasi,
  }

  // --- kunci sewa DULU: satu UPDATE atomik; jalan bersamaan lain mendapat count 0.
  // Semua keputusan yang bergantung pada jalan lain (jatuh tempo, kuota) DIULANG di
  // dalam kunci — tanpa itu, jalan kedua yang lolos cek jatuh tempo sebelum jalan
  // pertama tercatat akan mengambil kunci yang baru dilepas dan memanggil penyedia
  // lagi (ditemukan uji konkurensi check-ais-poll-api.mjs [E]).
  const token = `lease:${crypto.randomUUID()}`
  const kunci = await db.aisProviderState.updateMany({
    where: { provider, OR: [{ lockedUntil: null }, { lockedUntil: { lt: sekarang } }] },
    data: { lockedUntil: new Date(sekarang.getTime() + LEASE_DETIK * 1000), lockedBy: token },
  })
  if (kunci.count === 0) {
    const runId = await runSelesai('SKIPPED_LOCKED', null, hitungDasar)
    catatLog({ tenant: tenantId, runId, status: 'SKIPPED_LOCKED' })
    return hasil(tenantId, 'SKIPPED_LOCKED', { runId })
  }
  const lepasKunci = (runId?: string) =>
    db.aisProviderState.updateMany({
      where: { provider, lockedBy: { in: runId ? [token, runId] : [token] } },
      data: { lockedUntil: null, lockedBy: null },
    })

  let run: { id: string }
  try {
    const terakhirDalamKunci = await db.aisPollRun.findFirst({
      where: { provider, status: { in: ['OK', 'PARTIAL', 'FAILED'] } },
      orderBy: { startedAt: 'desc' },
      select: { startedAt: true },
    })
    if (!sudahJatuhTempo(terakhirDalamKunci?.startedAt ?? null, sekarang, interval)) {
      await lepasKunci()
      return hasil(tenantId, 'SKIPPED_NOT_DUE')
    }

    // --- D5: kuota bulanan, dihitung berurutan di dalam kunci. Tanpa nilai sah →
    // TIDAK ADA panggilan (gagal tertutup).
    const terpakai = await db.aisPollRun.aggregate({
      where: { startedAt: { gte: awalBulanBisnisWita(sekarang) } },
      _sum: { providerCalls: true },
    })
    const kuota = putuskanKuota(k.kuotaBulanan, terpakai._sum.providerCalls ?? 0, potongan.length)
    if (!kuota.boleh) {
      const runId = await runSelesai('DISABLED_QUOTA', kuota.kode, hitungDasar)
      await lepasKunci()
      catatLog({ tenant: tenantId, runId, status: 'DISABLED_QUOTA', errorCode: kuota.kode })
      // gagal=1 untuk KEDUA kode: kuota belum ditetapkan = salah konfigurasi; kuota habis =
      // posisi berhenti diperbarui. Keduanya harus terlihat (unit systemd gagal), bukan diam.
      return hasil(tenantId, 'DISABLED_QUOTA', { runId, dibatasi: pilih.dibatasi, gagal: 1, galat: kuota.kode })
    }

    if (!adapter.configured(env)) {
      const runId = await runSelesai('FAILED', 'NOT_CONFIGURED', hitungDasar)
      await lepasKunci()
      catatLog({ tenant: tenantId, runId, status: 'FAILED', errorCode: 'NOT_CONFIGURED' })
      return hasil(tenantId, 'FAILED', { runId, gagal: 1, galat: 'NOT_CONFIGURED' })
    }

    run = await db.aisPollRun.create({
      data: { tenantId, provider, agentVersion: VERSI_AGEN_AIS, startedAt: sekarang, status: 'RUNNING', ...hitungDasar },
      select: { id: true },
    })
    await db.aisProviderState.updateMany({ where: { provider, lockedBy: token }, data: { lockedBy: run.id } })
  } catch (e) {
    await lepasKunci()
    throw e
  }

  const n = {
    vesselsRequested: pilih.diambil.length,
    providerCalls: 0,
    observationsAccepted: 0,
    duplicates: 0,
    rejectedInvalid: 0,
    rejectedStale: 0,
    rejectedMismatch: 0,
    noData: 0,
  }
  let status = 'OK'
  let errorCode: string | null = null

  try {
    const fetchImpl = opsi.fetchImpl ?? globalThis.fetch
    const panggil = async (mmsis: string[]): Promise<AisFetchResult> => {
      for (let percobaan = 1; ; percobaan++) {
        n.providerCalls++
        let r: AisFetchResult
        try {
          r = await adapter.fetchLatest(mmsis, { signal: AbortSignal.timeout(TIMEOUT_PANGGILAN_MS), fetchImpl, now: sekarang })
        } catch {
          // Adapter tak boleh melempar; bila tetap terjadi, detailnya TIDAK diteruskan.
          r = { ok: false, code: 'PROVIDER_BAD_RESPONSE', retryable: false }
        }
        if (r.ok || !r.retryable || percobaan >= 2) return r
        await tidur(250 + crypto.randomInt(500))
      }
    }

    const mulaiMs = Date.now()
    let potonganGagal = 0
    let kodeGagal: AisErrorCode | null = null
    let resetRateLimit: string | null = null
    let anggaranHabis = false

    for (const bagian of potongan) {
      if (Date.now() - mulaiMs > ANGGARAN_JALAN_MS) {
        anggaranHabis = true
        break
      }
      const mmsis = bagian.map((kp) => kp.mmsi as string)
      const kapalPerMmsi = new Map(bagian.map((kp) => [kp.mmsi as string, kp]))
      const r = await panggil(mmsis)
      if (!r.ok) {
        potonganGagal++
        kodeGagal = r.code
        if (r.code === 'PROVIDER_RATE_LIMITED') {
          resetRateLimit = r.rateLimitResetAt ?? null
          break
        }
        continue
      }

      for (const m of mmsis) if (r.perMmsi[m] === 'NO_DATA' || r.perMmsi[m] === 'NOT_FOUND') n.noData++

      const diterima: { kapal: KapalAis; obs: ObservasiNormal }[] = []
      for (const raw of r.observations) {
        const kapal = typeof raw?.mmsi === 'string' ? kapalPerMmsi.get(raw.mmsi.trim()) : undefined
        if (!kapal) {
          n.rejectedMismatch++
          continue
        }
        const h = normalisasiObservasi(raw, kapal.mmsi as string, sekarang)
        if (!h.ok) {
          if (h.alasan === 'REJECTED_MISMATCH') n.rejectedMismatch++
          else if (h.alasan === 'REJECTED_STALE') n.rejectedStale++
          else n.rejectedInvalid++
          continue
        }
        diterima.push({ kapal, obs: h.obs })
      }

      if (diterima.length > 0) {
        // ON CONFLICT DO NOTHING: posisi yang sama tersimpan sekali, tanpa P2002 di log.
        const tulis = await db.aisObservation.createMany({
          skipDuplicates: true,
          data: diterima.map(({ kapal, obs }) => ({
            tenantId,
            vesselId: kapal.vesselId,
            runId: run.id,
            provider,
            mmsi: obs.mmsi,
            providerRef: obs.providerRef,
            positionAt: obs.positionAt,
            fetchedAt: obs.fetchedAt,
            lat: obs.lat,
            lon: obs.lon,
            sogKnots: obs.sogKnots,
            cogDeg: obs.cogDeg,
            headingDeg: obs.headingDeg,
            navStatus: obs.navStatus,
            positionAccuracy: obs.positionAccuracy,
            sourceType: obs.sourceType,
            ageSecAtFetch: obs.ageSecAtFetch,
            payloadHash: crypto.createHash('sha256').update(kanonikObservasi(obs)).digest('hex'),
          })),
        })
        n.observationsAccepted += tulis.count
        n.duplicates += diterima.length - tulis.count
      }
    }

    const dicoba = potongan.length
    if (dicoba > 0 && potonganGagal === dicoba) status = 'FAILED'
    else if (potonganGagal > 0 || n.rejectedMismatch > 0 || anggaranHabis) status = 'PARTIAL'
    errorCode = kodeGagal ?? (n.rejectedMismatch > 0 ? 'MMSI_MISMATCH' : anggaranHabis ? 'ANGGARAN_WAKTU_HABIS' : null)

    // --- kesehatan penyedia: hanya bila memang ada panggilan.
    if (n.providerCalls > 0) {
      if (potonganGagal > 0) {
        const gagalBeruntun = state.consecutiveFailures + 1
        await db.aisProviderState.updateMany({
          where: { id: state.id },
          data: {
            lastAttemptAt: sekarang,
            consecutiveFailures: gagalBeruntun,
            outageStartedAt: state.outageStartedAt ?? sekarang,
            lastErrorCode: kodeGagal,
            rateLimitResetAt: resetRateLimit ? new Date(resetRateLimit) : null,
            backoffUntil: resetRateLimit ? new Date(resetRateLimit) : new Date(sekarang.getTime() + hitungBackoffMs(gagalBeruntun, interval)),
          },
        })
      } else {
        await db.aisProviderState.updateMany({
          where: { id: state.id },
          data: { lastAttemptAt: sekarang, lastSuccessAt: sekarang, consecutiveFailures: 0, outageStartedAt: null, lastErrorCode: null, backoffUntil: null, rateLimitResetAt: null },
        })
      }
    }
  } catch (e) {
    status = 'FAILED'
    errorCode = 'GALAT_INTERNAL'
    console.error(`[ais-poll] tenant ${tenantId} gagal: ${e instanceof Error ? e.name : 'Error'}`)
  } finally {
    await db.aisPollRun.updateMany({ where: { id: run.id }, data: { ...n, status, errorCode, finishedAt: new Date() } })
    await lepasKunci(run.id)
  }

  // --- D3: retensi. Kegagalan penyapuan tak menggagalkan jalan (dicoba lagi berikutnya).
  try {
    const batas = batasRetensi(sekarang)
    await db.aisObservation.deleteMany({ where: { fetchedAt: { lt: batas.observasiSebelum } } })
    await db.aisPollRun.deleteMany({ where: { startedAt: { lt: batas.runSebelum } } })
  } catch (e) {
    console.error(`[ais-poll] retensi tenant ${tenantId} gagal: ${e instanceof Error ? e.name : 'Error'}`)
  }

  catatLog({
    tenant: tenantId, runId: run.id, status, errorCode, panggilan: n.providerCalls, diterima: n.observationsAccepted,
    duplikat: n.duplicates, ditolak: n.rejectedInvalid + n.rejectedStale + n.rejectedMismatch, tanpaData: n.noData,
  })
  return hasil(tenantId, status, {
    runId: run.id,
    dibuat: n.observationsAccepted,
    dilewati: n.duplicates,
    dibatasi: pilih.dibatasi,
    gagal: status === 'OK' ? 0 : 1,
    panggilan: n.providerCalls,
    ...(errorCode ? { galat: errorCode } : {}),
  })
}

/** Dipanggil POST /api/jobs/run?job=ais-position-poll. Gerbang mati → tanpa kerja sama sekali. */
export async function jalankanPollAisSemuaTenant(
  opsi: OpsiPollAis = {},
): Promise<HasilPollAisTenant[] | { nonaktif: true; alasan: string | null }> {
  const k = bacaKonfigurasiAis(opsi.env ?? process.env)
  if (!k.aktif) return { nonaktif: true, alasan: k.alasan }
  if (!opsi.adapter && k.penyedia === 'NONE') return { nonaktif: true, alasan: 'PENYEDIA_TIDAK_ADA' }

  const semua: HasilPollAisTenant[] = []
  for (const tenantId of Array.from(k.tenantIds).sort()) {
    const ada = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } })
    if (!ada) {
      semua.push(hasil(tenantId, 'FAILED', { gagal: 1, galat: 'TENANT_TIDAK_ADA' }))
      continue
    }
    try {
      semua.push(await jalankanPollAisTenant(tenantId, opsi))
    } catch (e) {
      console.error(`[ais-poll] tenant ${tenantId} gagal: ${e instanceof Error ? e.name : 'Error'}`)
      semua.push(hasil(tenantId, 'FAILED', { gagal: 1, galat: 'GALAT_INTERNAL' }))
    }
  }
  return semua
}
