// Adapter FAKE — HANYA untuk pengembangan & uji (PRD-003 Step 4). Ditolak di
// produksi (ais-policy.ts: PENYEDIA_DILARANG_PRODUKSI). TIDAK PERNAH memanggil
// jaringan: `ctx.fetchImpl` sengaja tak disentuh.
//
// Perilaku ditentukan MMSI fiksi di rentang 99xxxxxxx (awalan 99 = alat bantu
// navigasi, bukan kapal — tak mungkin bertabrakan dengan kapal sungguhan):
//
//   990000001  OK terrestrial (Samarinda)           990000006  posisi 0,0 (tidak sah)
//   990000002  OK satelit + nilai sentinel AIS      990000007  NOT_FOUND
//   990000003  MMSI balasan berbeda (mismatch)      990000008  seluruh panggilan RATE_LIMITED
//   990000004  NO_DATA                              990000009  seluruh panggilan TIMEOUT (bisa diulang)
//   990000005  posisi 8 jam lalu (basi, tetap sah)  lainnya    NOT_FOUND
//
// Waktu posisi dibulatkan ke awal jam `ctx.now` → jalan ulang dalam jam yang sama
// menghasilkan posisi IDENTIK (uji idempotensi/dedupe).

import type { AisAdapter, AisFetchResult, HasilPerMmsi, RawObservation } from '../contract'

const JAM = 3_600_000
const MENIT = 60_000

export const MMSI_FAKE = {
  OK: '990000001',
  OK_SATELIT: '990000002',
  MISMATCH: '990000003',
  NO_DATA: '990000004',
  BASI: '990000005',
  NOL_NOL: '990000006',
  NOT_FOUND: '990000007',
  RATE_LIMIT: '990000008',
  TIMEOUT: '990000009',
} as const

function obs(mmsi: string, positionAt: Date, ubah: Partial<RawObservation> = {}): RawObservation {
  return {
    mmsi,
    positionAt: positionAt.toISOString(),
    lat: -0.5021,
    lon: 117.1536,
    sog: 6.2,
    cog: 45.5,
    heading: 44,
    navStatus: 0,
    positionAccuracy: true,
    sourceType: 'TERRESTRIAL',
    providerRef: null,
    ...ubah,
  }
}

export const adapterFake: AisAdapter = {
  id: 'FAKE',
  capabilities: {
    latestByMmsi: true,
    maxMmsiPerRequest: 5,
    track: false,
    sourceTypes: ['TERRESTRIAL', 'SATELLITE', 'UNKNOWN'],
    delivery: 'POLL',
    rateLimit: null,
    reportsPositionTime: true,
    minPollIntervalSec: 0,
  },
  configured: () => true,
  async fetchLatest(mmsis, ctx): Promise<AisFetchResult> {
    if (ctx.signal.aborted) return { ok: false, code: 'PROVIDER_TIMEOUT', retryable: true }
    if (mmsis.includes(MMSI_FAKE.TIMEOUT)) return { ok: false, code: 'PROVIDER_TIMEOUT', retryable: true }
    if (mmsis.includes(MMSI_FAKE.RATE_LIMIT)) {
      return { ok: false, code: 'PROVIDER_RATE_LIMITED', retryable: false, rateLimitResetAt: new Date(ctx.now.getTime() + 30 * MENIT).toISOString() }
    }

    const jam = new Date(Math.floor(ctx.now.getTime() / JAM) * JAM)
    const observations: RawObservation[] = []
    const perMmsi: Record<string, HasilPerMmsi> = {}
    for (const m of mmsis) {
      switch (m) {
        case MMSI_FAKE.OK:
          observations.push(obs(m, new Date(jam.getTime() - 10 * MENIT)))
          perMmsi[m] = 'OK'
          break
        case MMSI_FAKE.OK_SATELIT:
          observations.push(obs(m, new Date(jam.getTime() - 20 * MENIT), { sog: 102.3, cog: 360, heading: 511, navStatus: 99, sourceType: 'SATELLITE', lat: -1.2654, lon: 116.8312 }))
          perMmsi[m] = 'OK'
          break
        case MMSI_FAKE.MISMATCH:
          observations.push(obs('990000033', new Date(jam.getTime() - 10 * MENIT)))
          perMmsi[m] = 'OK'
          break
        case MMSI_FAKE.BASI:
          observations.push(obs(m, new Date(jam.getTime() - 8 * JAM)))
          perMmsi[m] = 'OK'
          break
        case MMSI_FAKE.NOL_NOL:
          observations.push(obs(m, new Date(jam.getTime() - 10 * MENIT), { lat: 0, lon: 0 }))
          perMmsi[m] = 'OK'
          break
        case MMSI_FAKE.NO_DATA:
          perMmsi[m] = 'NO_DATA'
          break
        default:
          perMmsi[m] = 'NOT_FOUND'
      }
    }
    return { ok: true, observations, perMmsi }
  },
}
