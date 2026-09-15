// Kebijakan AIS — logika murni (PRD-003 Step 4). Hanya `import type`.
//
// Memutuskan: gerbang & konfigurasi (gagal tertutup), kapal mana boleh diambil
// posisinya (D2 MMSI terverifikasi, D4 tug saja), jatuh tempo, backoff, kuota
// bulanan (D5 — tanpa nilai = TANPA panggilan), retensi (D3), dan kapan adapter
// diterima. Tidak membaca DB, tidak memanggil jaringan.

import type { AisCapabilities } from './contract'

// ------------------------------------------------------------------ konstanta

export const VERSI_AGEN_AIS = 'prd003-s4.1'

/** D3 — dikunci owner. */
export const RETENSI_OBSERVASI_HARI = 90
export const RETENSI_RUN_HARI = 180

/** D7 — bawaan pilot 6 jam; WAJIB bisa diubah lewat AIS_STALE_HOURS. */
export const BAWAAN_AMBANG_STALE_JAM = 6
export const AMBANG_STALE_JAM_MIN = 1
export const AMBANG_STALE_JAM_MAKS = 168

export const BAWAAN_INTERVAL_MENIT = 60
export const INTERVAL_MENIT_MIN = 15
export const INTERVAL_MENIT_MAKS = 1440
/** Kelonggaran jadwal: timer systemd punya RandomizedDelaySec. */
export const KELONGGARAN_JATUH_TEMPO_MS = 2 * 60_000

export const AMBANG_PROVIDER_DOWN = { gagalBeruntun: 3, jam: 3 } as const
export const BACKOFF_MAKS_JAM = 6
/** Sewa kunci > TimeoutStartSec=360 unit systemd. */
export const LEASE_DETIK = 420
export const TIMEOUT_PANGGILAN_MS = 20_000
export const ANGGARAN_JALAN_MS = 300_000
export const BATAS_KAPAL_AIS_PER_JALAN = 50

export const PANJANG_KUNCI_API_MIN = 16

/** Adapter yang dikenal registry. Vendor ditambahkan satu per satu SETELAH terkonfirmasi. */
export const ID_PENYEDIA = ['NONE', 'FAKE'] as const
export type IdPenyedia = (typeof ID_PENYEDIA)[number]

const JAM = 3_600_000
const HARI = 86_400_000
const POLA_ID_TENANT = /^[a-z0-9]{20,40}$/

// ------------------------------------------------------------------- gerbang

export type AlasanAisNonaktif =
  | 'NONAKTIF'
  | 'FLAG_TIDAK_SAH'
  | 'AUTOMATION_NONAKTIF'
  | 'ALLOWLIST_KOSONG'
  | 'ALLOWLIST_TIDAK_SAH'
  | 'ALLOWLIST_BUKAN_SUBSET'
  | 'PENYEDIA_TIDAK_DIKENAL'
  | 'PENYEDIA_DILARANG_PRODUKSI'
  | 'INTERVAL_TIDAK_SAH'
  | 'AMBANG_STALE_TIDAK_SAH'

export type KonfigurasiAis = {
  aktif: boolean
  alasan: AlasanAisNonaktif | null
  tenantIds: ReadonlySet<string>
  penyedia: IdPenyedia
  intervalMenit: number
  ambangStaleJam: number
  /** D5 — null = belum ditetapkan/tidak sah → TIDAK ADA panggilan penyedia. */
  kuotaBulanan: number | null
}

const mati = (alasan: AlasanAisNonaktif): KonfigurasiAis => ({
  aktif: false,
  alasan,
  tenantIds: new Set(),
  penyedia: 'NONE',
  intervalMenit: BAWAAN_INTERVAL_MENIT,
  ambangStaleJam: BAWAAN_AMBANG_STALE_JAM,
  kuotaBulanan: null,
})

const daftarId = (v: string | undefined) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

/**
 * Konfigurasi AIS dari env. GAGAL TERTUTUP: nilai setengah benar mematikan
 * seluruh AIS (pola gate.ts). `AIS_TENANT_IDS` WAJIB subset dari
 * `AUTOMATION_TENANT_IDS` yang aktif — AIS tak pernah lebih luas dari Automation Hub.
 */
export function bacaKonfigurasiAis(env: Readonly<Record<string, string | undefined>>): KonfigurasiAis {
  const flag = (env.AIS_ENABLED ?? '').trim()
  if (flag === '' || flag === 'false') return mati('NONAKTIF')
  if (flag !== 'true') return mati('FLAG_TIDAK_SAH')

  // Automation Hub sendiri harus aktif & sah (aturan sama dengan gate.ts).
  const flagAuto = (env.AUTOMATION_MONITORING_ENABLED ?? '').trim()
  const idAuto = daftarId(env.AUTOMATION_TENANT_IDS)
  if (flagAuto !== 'true' || idAuto.length === 0 || idAuto.some((id) => !POLA_ID_TENANT.test(id))) {
    return mati('AUTOMATION_NONAKTIF')
  }

  const ids = daftarId(env.AIS_TENANT_IDS)
  if (ids.length === 0) return mati('ALLOWLIST_KOSONG')
  if (ids.some((id) => !POLA_ID_TENANT.test(id))) return mati('ALLOWLIST_TIDAK_SAH')
  const auto = new Set(idAuto)
  if (ids.some((id) => !auto.has(id))) return mati('ALLOWLIST_BUKAN_SUBSET')

  const pRaw = (env.AIS_PROVIDER ?? '').trim()
  const penyedia = (pRaw === '' ? 'NONE' : pRaw) as IdPenyedia
  if (!(ID_PENYEDIA as readonly string[]).includes(penyedia)) return mati('PENYEDIA_TIDAK_DIKENAL')
  if (penyedia === 'FAKE' && env.NODE_ENV === 'production') return mati('PENYEDIA_DILARANG_PRODUKSI')

  const iRaw = (env.AIS_POLL_INTERVAL_MIN ?? '').trim()
  const intervalMenit = iRaw === '' ? BAWAAN_INTERVAL_MENIT : Number(iRaw)
  if (!Number.isInteger(intervalMenit) || intervalMenit < INTERVAL_MENIT_MIN || intervalMenit > INTERVAL_MENIT_MAKS) {
    return mati('INTERVAL_TIDAK_SAH')
  }

  const sRaw = (env.AIS_STALE_HOURS ?? '').trim()
  const ambangStaleJam = sRaw === '' ? BAWAAN_AMBANG_STALE_JAM : Number(sRaw)
  if (!Number.isFinite(ambangStaleJam) || ambangStaleJam < AMBANG_STALE_JAM_MIN || ambangStaleJam > AMBANG_STALE_JAM_MAKS) {
    return mati('AMBANG_STALE_TIDAK_SAH')
  }

  const kRaw = (env.AIS_MONTHLY_CALL_CAP ?? '').trim()
  const k = /^\d+$/.test(kRaw) ? Number(kRaw) : Number.NaN
  const kuotaBulanan = Number.isSafeInteger(k) && k > 0 ? k : null

  return { aktif: true, alasan: null, tenantIds: new Set(ids), penyedia, intervalMenit, ambangStaleJam, kuotaBulanan }
}

export function tenantBolehAis(k: KonfigurasiAis, tenantId: string | null | undefined): boolean {
  return k.aktif && typeof tenantId === 'string' && k.tenantIds.has(tenantId)
}

/** Adapter vendor: kunci API minimal 16 karakter, selain itu NOT_CONFIGURED (tanpa panggilan). */
export function kunciApiSah(v: string | undefined): boolean {
  return typeof v === 'string' && v.trim().length >= PANJANG_KUNCI_API_MIN
}

/** Registry hanya menerima adapter POLL yang melaporkan waktu posisi. */
export function kapabilitasDiterima(c: AisCapabilities): boolean {
  return (
    c.latestByMmsi === true &&
    c.delivery === 'POLL' &&
    c.reportsPositionTime === true &&
    Number.isInteger(c.maxMmsiPerRequest) &&
    c.maxMmsiPerRequest >= 1 &&
    Number.isFinite(c.minPollIntervalSec) &&
    c.minPollIntervalSec >= 0
  )
}

/** Interval efektif: tak pernah di bawah batas adapter maupun lantai keras. */
export function intervalEfektifMenit(k: Pick<KonfigurasiAis, 'intervalMenit'>, c: Pick<AisCapabilities, 'minPollIntervalSec'>): number {
  return Math.min(INTERVAL_MENIT_MAKS, Math.max(k.intervalMenit, INTERVAL_MENIT_MIN, Math.ceil(c.minPollIntervalSec / 60)))
}

// --------------------------------------------------------- pemilihan kapal (D2/D4)

export const SUMBER_MMSI_TERVERIFIKASI_AIS = ['COMPANY_DOCUMENT', 'PRINCIPAL_CONFIRMATION', 'OTHER_VERIFIED'] as const

export type KapalCalon = {
  vesselId: string
  role: string | null
  isPrimary: boolean
  mmsi: string | null
  mmsiSource: string | null
  mmsiVerifiedAt: Date | string | null
}

/**
 * D4 — sumber posisi satu voyage: kapal ber-peran TUG; bila tak ada TUG, kapal
 * utama KECUALI ia BARGE. BARGE tak pernah diambil posisinya.
 */
export function kapalSumberPosisi<T extends KapalCalon>(kapal: readonly T[]): T[] {
  const tug = kapal.filter((k) => k.role === 'TUG')
  if (tug.length > 0) return tug
  return kapal.filter((k) => k.isPrimary && k.role !== 'BARGE')
}

/** D2 — MMSI 9 digit, sumber terverifikasi, DAN stempel verifikasi terisi (dua pemeriksaan). */
export function mmsiTerverifikasi(k: Pick<KapalCalon, 'mmsi' | 'mmsiSource' | 'mmsiVerifiedAt'>): boolean {
  return (
    typeof k.mmsi === 'string' &&
    /^\d{9}$/.test(k.mmsi) &&
    typeof k.mmsiSource === 'string' &&
    (SUMBER_MMSI_TERVERIFIKASI_AIS as readonly string[]).includes(k.mmsiSource) &&
    k.mmsiVerifiedAt !== null &&
    k.mmsiVerifiedAt !== undefined
  )
}

export type PilihanKapal<T> = { diambil: T[]; tidakTerverifikasi: number; dibatasi: number; layak: number }

/** Gabungkan kapal sumber posisi lintas voyage (unik per vesselId), terapkan D2 & batas per jalan. */
export function pilihKapalUntukPoll<T extends KapalCalon>(
  perVoyage: readonly (readonly T[])[],
  batas: number = BATAS_KAPAL_AIS_PER_JALAN,
): PilihanKapal<T> {
  const unik = new Map<string, T>()
  for (const kapal of perVoyage) for (const k of kapalSumberPosisi(kapal)) if (!unik.has(k.vesselId)) unik.set(k.vesselId, k)
  const semua = Array.from(unik.values()).sort((a, b) => (a.vesselId < b.vesselId ? -1 : a.vesselId > b.vesselId ? 1 : 0))
  const sah = semua.filter(mmsiTerverifikasi)
  return {
    layak: semua.length,
    tidakTerverifikasi: semua.length - sah.length,
    diambil: sah.slice(0, batas),
    dibatasi: Math.max(0, sah.length - batas),
  }
}

export function pecah<T>(xs: readonly T[], ukuran: number): T[][] {
  const n = Math.max(1, Math.floor(ukuran))
  const hasil: T[][] = []
  for (let i = 0; i < xs.length; i += n) hasil.push(xs.slice(i, i + n))
  return hasil
}

// ------------------------------------------------------- jadwal, backoff, kuota

/** Jalan dianggap belum jatuh tempo bila jalan bermakna terakhir (OK/PARTIAL/FAILED) terlalu baru. */
export function sudahJatuhTempo(terakhirMulai: Date | null, sekarang: Date, intervalMenit: number): boolean {
  if (!terakhirMulai) return true
  return sekarang.getTime() - terakhirMulai.getTime() >= intervalMenit * 60_000 - KELONGGARAN_JATUH_TEMPO_MS
}

/** Backoff eksponensial: 2^(n−1) × interval, maksimal 6 jam. n = kegagalan beruntun (≥ 1). */
export function hitungBackoffMs(gagalBeruntun: number, intervalMenit: number): number {
  const n = Math.max(1, Math.floor(gagalBeruntun))
  const ms = Math.pow(2, Math.min(n - 1, 20)) * intervalMenit * 60_000
  return Math.min(ms, BACKOFF_MAKS_JAM * JAM)
}

export type KeputusanKuota = { boleh: true } | { boleh: false; kode: 'KUOTA_TIDAK_DISET' | 'KUOTA_HABIS' }

/**
 * D5 — gagal tertutup. Tanpa kuota yang sah → tak ada panggilan sama sekali,
 * berapa pun panggilan yang direncanakan (termasuk nol).
 */
export function putuskanKuota(kuotaBulanan: number | null, terpakaiBulanIni: number, rencanaPanggilan: number): KeputusanKuota {
  if (kuotaBulanan === null || !Number.isSafeInteger(kuotaBulanan) || kuotaBulanan <= 0) return { boleh: false, kode: 'KUOTA_TIDAK_DISET' }
  if (terpakaiBulanIni + Math.max(0, rencanaPanggilan) > kuotaBulanan) return { boleh: false, kode: 'KUOTA_HABIS' }
  return { boleh: true }
}

/**
 * Awal bulan bisnis WITA (UTC+8, tanpa DST) sebagai instan UTC. Asia/Makassar
 * tidak punya DST, jadi offset tetap dipakai supaya berkas ini tetap murni.
 */
export function awalBulanBisnisWita(sekarang: Date): Date {
  const OFFSET = 8 * JAM
  const lokal = new Date(sekarang.getTime() + OFFSET)
  return new Date(Date.UTC(lokal.getUTCFullYear(), lokal.getUTCMonth(), 1) - OFFSET)
}

export function batasRetensi(sekarang: Date): { observasiSebelum: Date; runSebelum: Date } {
  return {
    observasiSebelum: new Date(sekarang.getTime() - RETENSI_OBSERVASI_HARI * HARI),
    runSebelum: new Date(sekarang.getTime() - RETENSI_RUN_HARI * HARI),
  }
}

/** Provider dianggap down: ≥ 3 gagal beruntun DAN rentetan berjalan ≥ 3 jam. */
export function providerDown(
  s: { consecutiveFailures: number; outageStartedAt: Date | string | null } | null,
  sekarang: Date,
): boolean {
  if (!s || !s.outageStartedAt) return false
  const mulai = new Date(s.outageStartedAt).getTime()
  return s.consecutiveFailures >= AMBANG_PROVIDER_DOWN.gagalBeruntun && sekarang.getTime() - mulai >= AMBANG_PROVIDER_DOWN.jam * JAM
}
