// Kontrak penyedia posisi AIS — logika murni, TANPA impor (PRD-003 Step 4).
//
// Arsitektur tak terikat vendor: inti (poll.service, monitoring) hanya mengenal
// bentuk di berkas ini. Satu adapter = satu berkas yang memetakan respons vendor
// ke `RawObservation`. Step 4 hanya punya NONE (bawaan) dan FAKE (uji/dev) —
// adapter vendor sungguhan SENGAJA belum ada sampai API, syarat, dan kuota
// penyedia terkonfirmasi.
//
// Aturan adapter:
//   • tak pernah melempar ke poller — kegagalan dikembalikan sebagai `ok:false`
//     dengan KODE, tanpa teks/badan respons vendor;
//   • kunci API hanya dibaca di dalam `fetchLatest`, tak pernah saat impor;
//   • host HTTPS ditulis mati di berkas adapter (config memilih ID, bukan URL);
//   • `fetchImpl` & `AbortSignal` disuntikkan → uji tak pernah menyentuh jaringan.

export const AIS_ERROR = [
  'PROVIDER_UNREACHABLE',
  'PROVIDER_TIMEOUT',
  'PROVIDER_AUTH',
  'PROVIDER_RATE_LIMITED',
  'PROVIDER_CONTRACT_CHANGED',
  'PROVIDER_BAD_RESPONSE',
  'NOT_CONFIGURED',
] as const
export type AisErrorCode = (typeof AIS_ERROR)[number]

export const SUMBER_AIS = ['TERRESTRIAL', 'SATELLITE', 'UNKNOWN'] as const
export type SumberAis = (typeof SUMBER_AIS)[number]

export const STATUS_RUN_AIS = [
  'RUNNING',
  'OK',
  'PARTIAL',
  'FAILED',
  'SKIPPED_LOCKED',
  'SKIPPED_BACKOFF',
  'DISABLED_QUOTA',
] as const
export type StatusRunAis = (typeof STATUS_RUN_AIS)[number]

export type AisCapabilities = {
  latestByMmsi: true
  /** 1 = tanpa batch; poller memecah permintaan sesuai angka ini. */
  maxMmsiPerRequest: number
  track: boolean
  sourceTypes: readonly SumberAis[]
  /** Step 4 hanya menerima POLL; STREAM/WEBHOOK ditolak registry. */
  delivery: 'POLL' | 'STREAM' | 'WEBHOOK'
  rateLimit: { requests: number; perSeconds: number } | null
  /** false → adapter ditolak: waktu posisi wajib (K176/2). */
  reportsPositionTime: boolean
  minPollIntervalSec: number
}

/** Bentuk mentah hasil pemetaan vendor, SEBELUM normalisasi. */
export type RawObservation = {
  mmsi: string
  positionAt: string | null
  lat: number | null
  lon: number | null
  sog: number | null
  cog: number | null
  heading: number | null
  navStatus: number | null
  positionAccuracy: boolean | null
  sourceType: string | null
  providerRef: string | null
}

export type HasilPerMmsi = 'OK' | 'NO_DATA' | 'NOT_FOUND'

export type AisFetchResult =
  | {
      ok: true
      observations: RawObservation[]
      perMmsi: Record<string, HasilPerMmsi>
      rateLimit?: { remaining: number; resetAt: string }
    }
  | { ok: false; code: AisErrorCode; retryable: boolean; rateLimitResetAt?: string }

export type AisContext = {
  signal: AbortSignal
  fetchImpl: typeof fetch
  now: Date
}

export type AisAdapter = {
  id: string
  capabilities: AisCapabilities
  configured(env: Readonly<Record<string, string | undefined>>): boolean
  fetchLatest(mmsis: readonly string[], ctx: AisContext): Promise<AisFetchResult>
}
