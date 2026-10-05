// TAH Core — kebijakan MURNI (PRD-005 Step 3A). TANPA impor saat jalan.
//
// Isi berkas ini adalah seluruh ATURAN TAH Core yang tak butuh DB/jaringan:
//   • gerbang TAH_CORE_ENABLED (gagal tertutup, pola gate.ts)
//   • kelas risiko tindakan (D5) + kebijakan setuju-sendiri (D9, override owner)
//   • tiga mesin status TERPISAH: AgentRun, KEPUTUSAN persetujuan, EKSEKUSI
//     (APPROVED tidak pernah berarti tindakan berhasil — keputusan owner)
//   • validasi registry (registry.ts hanya data)
//   • retensi (D3 + Q1): hasil/usulan 180 hari, metadata 24 bulan kalender
//   • pembaca metadata respons penyedia (token boleh tak ada — tak pernah memblokir)
//   • daftar izin parameter panggilan model & batas ukuran
//
// Belum ada service, route, atau wiring intake di Step 3A. Diuji langsung oleh
// Node lewat prisma/check-tah-policy.mjs.

// ================================================================== gerbang

export type AlasanTahNonaktif = 'NONAKTIF' | 'FLAG_TIDAK_SAH'

export type KonfigurasiTahCore = { aktif: boolean; alasan: AlasanTahNonaktif | null }

/**
 * TAH_CORE_ENABLED harus PERSIS "true". Kosong/"false" → mati; nilai lain
 * (mis. "TRUE", "1", "yes") → mati dengan alasan FLAG_TIDAK_SAH. Gerbang ini
 * BERLAPIS di atas requireAutomation (allowlist tenant + peran), tak menggantikannya.
 */
export function bacaKonfigurasiTahCore(env: Readonly<Record<string, string | undefined>>): KonfigurasiTahCore {
  const flag = (env.TAH_CORE_ENABLED ?? '').trim()
  if (flag === '' || flag === 'false') return { aktif: false, alasan: 'NONAKTIF' }
  if (flag !== 'true') return { aktif: false, alasan: 'FLAG_TIDAK_SAH' }
  return { aktif: true, alasan: null }
}

// ======================================================= kelas risiko (D5)

export const KELAS_RISIKO = [
  'READ_ONLY',
  'INTERNAL_ANNOTATION',
  'INTERNAL_WRITE',
  'EXTERNALLY_VISIBLE',
  'EXTERNAL_COMMUNICATION',
  'FINANCIAL',
] as const
export type KelasRisiko = (typeof KELAS_RISIKO)[number]

export const kelasRisikoSah = (v: unknown): v is KelasRisiko =>
  typeof v === 'string' && (KELAS_RISIKO as readonly string[]).includes(v)

/**
 * D9 (override owner) — bawaan setuju-sendiri per kelas. Jenis persetujuan boleh
 * LEBIH KETAT, tak pernah lebih longgar. INTERNAL_WRITE boleh setuju-sendiri
 * karena, menurut definisi kelas, tindakannya TANPA visibilitas eksternal dan
 * TANPA akibat keuangan — tindakan yang punya salah satunya WAJIB diberi kelas
 * EXTERNALLY_VISIBLE / EXTERNAL_COMMUNICATION / FINANCIAL.
 */
export const SETUJU_SENDIRI_BAWAAN: Readonly<Record<KelasRisiko, boolean>> = {
  READ_ONLY: true,
  INTERNAL_ANNOTATION: true,
  INTERNAL_WRITE: true,
  EXTERNALLY_VISIBLE: false,
  EXTERNAL_COMMUNICATION: false,
  FINANCIAL: false,
}

/** Kebijakan efektif = yang lebih ketat antara bawaan kelas dan setelan jenis. */
export function setujuSendiriEfektif(kelas: KelasRisiko, setelanJenis: boolean): boolean {
  return SETUJU_SENDIRI_BAWAAN[kelas] && setelanJenis === true
}

// ============================================================ AgentRun

export const STATUS_RUN = ['RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'ABANDONED'] as const
export type StatusRun = (typeof STATUS_RUN)[number]

export const PEMICU_RUN = ['HUMAN', 'SCHEDULE', 'RETRY'] as const
export type PemicuRun = (typeof PEMICU_RUN)[number]

export const HASIL_RUN = ['PROPOSAL_CREATED', 'NO_PROPOSAL', 'DUPLICATE_DISCARDED'] as const
export type HasilRun = (typeof HASIL_RUN)[number]

export const KODE_GALAT_RUN = [
  'AI_TIMEOUT',
  'AI_UNAVAILABLE',
  'AI_BAD_RESPONSE',
  'VALIDATION_FAILED',
  'GATE_CLOSED',
  'RUN_ABANDONED',
  'INTERNAL',
] as const
export type KodeGalatRun = (typeof KODE_GALAT_RUN)[number]

/** 15 menit ≫ batas waktu AI 60 detik: jalan RUNNING selama ini dianggap terlantar (crash). */
export const AMBANG_RUN_TERLANTAR_MENIT = 15

const TRANSISI_RUN: Readonly<Record<StatusRun, readonly StatusRun[]>> = {
  RUNNING: ['SUCCEEDED', 'FAILED', 'CANCELLED', 'ABANDONED'],
  // Penyelesaian TERLAMBAT: penyapu menandai ABANDONED, lalu jalan aslinya
  // ternyata selesai (baris intake sudah lahir) — buku besar harus jujur.
  ABANDONED: ['SUCCEEDED', 'FAILED'],
  SUCCEEDED: [],
  FAILED: [],
  CANCELLED: [],
}

export const statusRunFinal = (s: string): boolean => s === 'SUCCEEDED' || s === 'FAILED' || s === 'CANCELLED' || s === 'ABANDONED'

export function transisiRunSah(dari: string, ke: string): boolean {
  const izin = (TRANSISI_RUN as Record<string, readonly string[] | undefined>)[dari]
  return Array.isArray(izin) && izin.includes(ke)
}

/** Menyelesaikan jalan: boleh?, dan apakah tercatat sebagai penyelesaian terlambat. */
export function putuskanPenyelesaianRun(
  statusSekarang: string,
  target: 'SUCCEEDED' | 'FAILED' | 'CANCELLED',
): { boleh: boolean; terlambat: boolean } {
  if (!transisiRunSah(statusSekarang, target)) return { boleh: false, terlambat: false }
  return { boleh: true, terlambat: statusSekarang === 'ABANDONED' }
}

export function runTerlantar(status: string, startedAt: Date, sekarang: Date): boolean {
  return status === 'RUNNING' && sekarang.getTime() - startedAt.getTime() > AMBANG_RUN_TERLANTAR_MENIT * 60_000
}

// =========================================== persetujuan — mesin KEPUTUSAN

export const STATUS_KEPUTUSAN = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'REVISION_REQUESTED',
  'EXPIRED',
  'CANCELLED',
  'SUPERSEDED',
] as const
export type StatusKeputusan = (typeof STATUS_KEPUTUSAN)[number]

/** Semua selain PENDING adalah final. Suntingan PENDING→PENDING bukan transisi status. */
const TRANSISI_KEPUTUSAN: Readonly<Record<StatusKeputusan, readonly StatusKeputusan[]>> = {
  PENDING: ['APPROVED', 'REJECTED', 'REVISION_REQUESTED', 'EXPIRED', 'CANCELLED', 'SUPERSEDED'],
  APPROVED: [],
  REJECTED: [],
  REVISION_REQUESTED: [],
  EXPIRED: [],
  CANCELLED: [],
  SUPERSEDED: [],
}

export function transisiKeputusanSah(dari: string, ke: string): boolean {
  const izin = (TRANSISI_KEPUTUSAN as Record<string, readonly string[] | undefined>)[dari]
  return Array.isArray(izin) && izin.includes(ke)
}

export const keputusanFinal = (s: string): boolean => (STATUS_KEPUTUSAN as readonly string[]).includes(s) && s !== 'PENDING'

/** Panjang minimum catatan per keputusan (pola intake: tolak ≥ 3, alasan ≥ 10). */
export const MIN_CATATAN: Readonly<Record<'REJECTED' | 'REVISION_REQUESTED' | 'CANCELLED', number>> = {
  REJECTED: 3,
  REVISION_REQUESTED: 10,
  CANCELLED: 3,
}
export const MAKS_CATATAN = 1000

export const KEDALUWARSA_JAM_MIN = 1
/** 30 hari: permintaan PENDING tak pernah cukup tua untuk tersentuh retensi 180 hari. */
export const KEDALUWARSA_JAM_MAKS = 720

export function sudahKedaluwarsa(status: string, expiresAt: Date, sekarang: Date): boolean {
  return status === 'PENDING' && expiresAt.getTime() <= sekarang.getTime()
}

// ============================================ persetujuan — mesin EKSEKUSI

export const STATUS_EKSEKUSI = [
  'NOT_APPLICABLE',
  'NOT_STARTED',
  'RUNNING',
  'SUCCEEDED',
  'SUCCEEDED_WITH_WARNINGS',
  'FAILED',
  'CANCELLED',
] as const
export type StatusEksekusi = (typeof STATUS_EKSEKUSI)[number]

export const MAKS_PERCOBAAN_EKSEKUSI = 5
export const BATAS_KLAIM_EKSEKUSI_MENIT = 5

/**
 * NOT_APPLICABLE → NOT_STARTED HANYA bersamaan dengan keputusan → APPROVED
 * (lihat transisiEksekusiSah). Tak ada transisi keluar dari SUCCEEDED*,
 * CANCELLED; FAILED boleh diulang (manusia, idempoten) atau dibatalkan.
 */
const TRANSISI_EKSEKUSI: Readonly<Record<StatusEksekusi, readonly StatusEksekusi[]>> = {
  NOT_APPLICABLE: ['NOT_STARTED'],
  NOT_STARTED: ['RUNNING', 'CANCELLED'],
  RUNNING: ['SUCCEEDED', 'SUCCEEDED_WITH_WARNINGS', 'FAILED'],
  FAILED: ['RUNNING', 'CANCELLED'],
  SUCCEEDED: [],
  SUCCEEDED_WITH_WARNINGS: [],
  CANCELLED: [],
}

/**
 * `statusKeputusan` = status keputusan SETELAH transisi. Eksekusi hanya boleh
 * bergerak bila keputusannya APPROVED — inilah pemisah dua mesin.
 */
export function transisiEksekusiSah(dari: string, ke: string, statusKeputusan: string): boolean {
  if (statusKeputusan !== 'APPROVED') return false
  const izin = (TRANSISI_EKSEKUSI as Record<string, readonly string[] | undefined>)[dari]
  return Array.isArray(izin) && izin.includes(ke)
}

/** Invarian baris: status eksekusi selain NOT_APPLICABLE HANYA bila keputusannya APPROVED. */
export function invarianStatus(statusKeputusan: string, statusEksekusi: string): boolean {
  if (!(STATUS_KEPUTUSAN as readonly string[]).includes(statusKeputusan)) return false
  if (!(STATUS_EKSEKUSI as readonly string[]).includes(statusEksekusi)) return false
  if (statusKeputusan === 'APPROVED') return statusEksekusi !== 'NOT_APPLICABLE'
  return statusEksekusi === 'NOT_APPLICABLE'
}

export const eksekusiFinal = (s: string): boolean =>
  s === 'NOT_APPLICABLE' || s === 'SUCCEEDED' || s === 'SUCCEEDED_WITH_WARNINGS' || s === 'CANCELLED'

/** Apa yang ditampilkan ke manusia — tak pernah "selesai" bila eksekusinya belum/tak berhasil. */
export type LabelHasil =
  | 'MENUNGGU_KEPUTUSAN'
  | 'DITOLAK_ATAU_BERAKHIR'
  | 'DISETUJUI_MENUNGGU_EKSEKUSI'
  | 'DISETUJUI_SEDANG_DIEKSEKUSI'
  | 'DISETUJUI_BERHASIL'
  | 'DISETUJUI_BERHASIL_DENGAN_PERINGATAN'
  | 'DISETUJUI_TINDAKAN_GAGAL'
  | 'DISETUJUI_EKSEKUSI_DIBATALKAN'

export function labelHasil(statusKeputusan: string, statusEksekusi: string): LabelHasil {
  if (statusKeputusan === 'PENDING') return 'MENUNGGU_KEPUTUSAN'
  if (statusKeputusan !== 'APPROVED') return 'DITOLAK_ATAU_BERAKHIR'
  switch (statusEksekusi) {
    case 'SUCCEEDED':
      return 'DISETUJUI_BERHASIL'
    case 'SUCCEEDED_WITH_WARNINGS':
      return 'DISETUJUI_BERHASIL_DENGAN_PERINGATAN'
    case 'FAILED':
      return 'DISETUJUI_TINDAKAN_GAGAL'
    case 'RUNNING':
      return 'DISETUJUI_SEDANG_DIEKSEKUSI'
    case 'CANCELLED':
      return 'DISETUJUI_EKSEKUSI_DIBATALKAN'
    default:
      return 'DISETUJUI_MENUNGGU_EKSEKUSI'
  }
}

export function bolehUlangiEksekusi(statusEksekusi: string, percobaan: number): { boleh: boolean; kode: string | null } {
  if (statusEksekusi === 'RUNNING') return { boleh: false, kode: 'EXECUTION_IN_PROGRESS' }
  if (statusEksekusi !== 'FAILED') return { boleh: false, kode: 'EXECUTION_NOT_RETRYABLE' }
  if (percobaan >= MAKS_PERCOBAAN_EKSEKUSI) return { boleh: false, kode: 'EXECUTION_ATTEMPTS_EXHAUSTED' }
  return { boleh: true, kode: null }
}

export function klaimEksekusiBasi(statusEksekusi: string, claimedAt: Date | null, sekarang: Date): boolean {
  return (
    statusEksekusi === 'RUNNING' &&
    claimedAt !== null &&
    sekarang.getTime() - claimedAt.getTime() > BATAS_KLAIM_EKSEKUSI_MENIT * 60_000
  )
}

// ========================================= siapa boleh memutuskan (D9)

export type PemutusCalon = { userId: string; role: string; system?: boolean }

export type HasilOtorisasi =
  | { boleh: true; kode: null }
  | { boleh: false; kode: 'SYSTEM_CONTEXT_FORBIDDEN' | 'ROLE_NOT_ALLOWED' | 'SELF_APPROVAL_FORBIDDEN' }

/**
 * Urutan disengaja: konteks sistem ditolak PALING DULU (systemContext() membawa
 * peran ADMIN — tanpa pemeriksaan eksplisit ia akan lolos pagar peran).
 * "Diri sendiri" = pemicu jalan agen (originator), atau pemutus permintaan yang
 * direvisi oleh permintaan ini. Jalan terjadwal (tanpa originator) hanya
 * tunduk pada larangan konteks sistem.
 */
export function bolehMemutuskan(a: {
  pemutus: PemutusCalon
  peranWajib: readonly string[]
  kelas: KelasRisiko
  setujuSendiriJenis: boolean
  originatorUserId: string | null
  pemutusRevisiSebelumnya?: string | null
}): HasilOtorisasi {
  if (a.pemutus.system === true) return { boleh: false, kode: 'SYSTEM_CONTEXT_FORBIDDEN' }
  if (!a.peranWajib.includes(a.pemutus.role)) return { boleh: false, kode: 'ROLE_NOT_ALLOWED' }
  const diriSendiri =
    (a.originatorUserId !== null && a.originatorUserId === a.pemutus.userId) ||
    (typeof a.pemutusRevisiSebelumnya === 'string' && a.pemutusRevisiSebelumnya === a.pemutus.userId)
  if (diriSendiri && !setujuSendiriEfektif(a.kelas, a.setujuSendiriJenis)) {
    return { boleh: false, kode: 'SELF_APPROVAL_FORBIDDEN' }
  }
  return { boleh: true, kode: null }
}

// ================================================ validasi registry

export type DefinisiAgenData = {
  key: string
  versi: string
  jenisRun: readonly string[]
  prompt?: { id: string; versi: string }
  skema?: { id: string; versi: string }
  modelEnv?: string
  jenisApproval: readonly string[]
}

export type DefinisiApprovalData = {
  kind: string
  risiko: KelasRisiko
  peranWajib: readonly string[]
  setujuSendiri: boolean
  kedaluwarsaJam: number
  bisaDiedit: boolean
  hanyaNonProduksi?: boolean
}

const POLA_KUNCI = /^[A-Z][A-Z0-9_]{1,39}$/
const POLA_ENV = /^[A-Z][A-Z0-9_]{1,63}$/

/**
 * Daftar galat registry (kosong = sah). Registry tak sah → TAH Core gagal
 * tertutup (REGISTRY_TIDAK_SAH) saat service memuatnya (Step 3C).
 * `peranDiizinkan` = PERAN_AUTOMATION (disuntikkan: berkas ini tanpa impor).
 */
export function validasiRegistry(
  agen: readonly DefinisiAgenData[],
  approval: readonly DefinisiApprovalData[],
  peranDiizinkan: readonly string[],
): string[] {
  const galat: string[] = []
  const kunciAgen = new Set<string>()
  const kunciJenis = new Set<string>()

  for (const j of approval) {
    const n = `approval ${String(j?.kind)}`
    if (typeof j?.kind !== 'string' || !POLA_KUNCI.test(j.kind)) galat.push(`${n}: kind tidak sah`)
    else if (kunciJenis.has(j.kind)) galat.push(`${n}: kind ganda`)
    else kunciJenis.add(j.kind)
    if (!kelasRisikoSah(j?.risiko)) galat.push(`${n}: kelas risiko tidak dikenal`)
    if (!Array.isArray(j?.peranWajib) || j.peranWajib.length === 0) galat.push(`${n}: peranWajib kosong`)
    else if (j.peranWajib.some((p) => !peranDiizinkan.includes(p))) galat.push(`${n}: peranWajib di luar peran Automation Hub`)
    if (typeof j?.setujuSendiri !== 'boolean') galat.push(`${n}: setujuSendiri wajib boolean`)
    else if (kelasRisikoSah(j.risiko) && j.setujuSendiri && !SETUJU_SENDIRI_BAWAAN[j.risiko]) {
      galat.push(`${n}: setujuSendiri lebih longgar dari bawaan kelas ${j.risiko} (D9)`)
    }
    if (!Number.isInteger(j?.kedaluwarsaJam) || j.kedaluwarsaJam < KEDALUWARSA_JAM_MIN || j.kedaluwarsaJam > KEDALUWARSA_JAM_MAKS) {
      galat.push(`${n}: kedaluwarsaJam di luar ${KEDALUWARSA_JAM_MIN}..${KEDALUWARSA_JAM_MAKS}`)
    }
    if (typeof j?.bisaDiedit !== 'boolean') galat.push(`${n}: bisaDiedit wajib boolean`)
    if (j?.hanyaNonProduksi !== undefined && typeof j.hanyaNonProduksi !== 'boolean') galat.push(`${n}: hanyaNonProduksi wajib boolean`)
  }

  for (const a of agen) {
    const n = `agen ${String(a?.key)}`
    if (typeof a?.key !== 'string' || !POLA_KUNCI.test(a.key)) galat.push(`${n}: key tidak sah`)
    else if (kunciAgen.has(a.key)) galat.push(`${n}: key ganda`)
    else kunciAgen.add(a.key)
    if (typeof a?.versi !== 'string' || a.versi.trim() === '' || a.versi.length > 64) galat.push(`${n}: versi tidak sah`)
    if (!Array.isArray(a?.jenisRun) || a.jenisRun.length === 0 || a.jenisRun.some((r) => typeof r !== 'string' || !POLA_KUNCI.test(r))) {
      galat.push(`${n}: jenisRun tidak sah`)
    }
    for (const bagian of ['prompt', 'skema'] as const) {
      const v = a?.[bagian]
      if (v !== undefined && (typeof v?.id !== 'string' || !v.id || typeof v?.versi !== 'string' || !v.versi)) {
        galat.push(`${n}: ${bagian} wajib punya id & versi`)
      }
    }
    if (a?.modelEnv !== undefined && (typeof a.modelEnv !== 'string' || !POLA_ENV.test(a.modelEnv))) galat.push(`${n}: modelEnv tidak sah`)
    if (!Array.isArray(a?.jenisApproval)) galat.push(`${n}: jenisApproval wajib larik`)
    else for (const k of a.jenisApproval) if (!kunciJenis.has(k)) galat.push(`${n}: jenisApproval ${k} tidak terdaftar`)
  }
  return galat
}

/** Jenis non-produksi (mis. TAH_DEV_NOOP) ditolak di produksi — pola adapter FAKE. */
export function jenisBolehDiLingkungan(j: Pick<DefinisiApprovalData, 'hanyaNonProduksi'>, nodeEnv: string | undefined): boolean {
  return !(j.hanyaNonProduksi === true && nodeEnv === 'production')
}

// ================================================== retensi (D3 + Q1)

export const RETENSI_HASIL_HARI = 180
export const RETENSI_METADATA_BULAN = 24

/** Mundur N bulan kalender (UTC), tanggal dijepit ke akhir bulan tujuan (31 Mar − 1 bln = 28/29 Feb). */
export function mundurBulanUtc(t: Date, bulan: number): Date {
  const y = t.getUTCFullYear()
  const m = t.getUTCMonth() - bulan
  const tahun = y + Math.floor(m / 12)
  const bulanTujuan = ((m % 12) + 12) % 12
  const hariTerakhir = new Date(Date.UTC(tahun, bulanTujuan + 1, 0)).getUTCDate()
  return new Date(
    Date.UTC(
      tahun,
      bulanTujuan,
      Math.min(t.getUTCDate(), hariTerakhir),
      t.getUTCHours(),
      t.getUTCMinutes(),
      t.getUTCSeconds(),
      t.getUTCMilliseconds(),
    ),
  )
}

export function batasRetensiTah(sekarang: Date): { payloadSebelum: Date; metadataSebelum: Date } {
  return {
    payloadSebelum: new Date(sekarang.getTime() - RETENSI_HASIL_HARI * 86_400_000),
    metadataSebelum: mundurBulanUtc(sekarang, RETENSI_METADATA_BULAN),
  }
}

type BarisRunRetensi = { status: string; finishedAt: Date | null; createdAt: Date; resultPurgedAt: Date | null; adaHasil: boolean }

/** `result` AgentRun dikosongkan 180 hari setelah jalan SELESAI. Jalan RUNNING tak pernah disentuh. */
export function hasilRunBolehDibersihkan(r: BarisRunRetensi, sekarang: Date): boolean {
  if (!statusRunFinal(r.status) || r.finishedAt === null || r.resultPurgedAt !== null || !r.adaHasil) return false
  return r.finishedAt.getTime() < batasRetensiTah(sekarang).payloadSebelum.getTime()
}

/** Metadata AgentRun (+ AgentModelCall lewat cascade) dihapus 24 bulan setelah dibuat — hanya bila final. */
export function metadataRunBolehDihapus(r: Pick<BarisRunRetensi, 'status' | 'createdAt'>, sekarang: Date): boolean {
  return statusRunFinal(r.status) && r.createdAt.getTime() < batasRetensiTah(sekarang).metadataSebelum.getTime()
}

type BarisApprovalRetensi = {
  status: string
  executionStatus: string
  /**
   * Waktu baris menjadi final (kolom `finalizedAt`, diisi sekali). SENGAJA bukan
   * `updatedAt`: pembersihan usulan memperbarui `updatedAt` (Prisma @updatedAt) dan
   * akan menggeser batas 24 bulan. null = belum pernah final → tak pernah tersentuh.
   */
  finalizedAt: Date | null
  payloadPurgedAt: Date | null
  adaUsulan: boolean
}

/** Q1 — final = keputusan final DAN eksekusi final/tak berlaku. PENDING tak pernah tersentuh. */
export const approvalFinal = (r: Pick<BarisApprovalRetensi, 'status' | 'executionStatus'>): boolean =>
  keputusanFinal(r.status) && eksekusiFinal(r.executionStatus)

export function usulanApprovalBolehDibersihkan(r: BarisApprovalRetensi, sekarang: Date): boolean {
  if (!approvalFinal(r) || r.finalizedAt === null || r.payloadPurgedAt !== null || !r.adaUsulan) return false
  return r.finalizedAt.getTime() < batasRetensiTah(sekarang).payloadSebelum.getTime()
}

export function metadataApprovalBolehDihapus(
  r: Pick<BarisApprovalRetensi, 'status' | 'executionStatus' | 'finalizedAt'>,
  sekarang: Date,
): boolean {
  return approvalFinal(r) && r.finalizedAt !== null && r.finalizedAt.getTime() < batasRetensiTah(sekarang).metadataSebelum.getTime()
}

// ============================== metadata respons penyedia (tak pernah memblokir)

export type PemakaianToken = {
  inputTokens: number | null
  outputTokens: number | null
  cachedInputTokens: number | null
  reasoningTokens: number | null
}

/** Batas kolom Int Postgres. Di atasnya = tak masuk akal → null (bukan galat). */
const MAKS_INT = 2_147_483_647

function bilanganToken(v: unknown): number | null {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= MAKS_INT ? v : null
}

const objek = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null

/**
 * Bentuk OpenAI-compatible (`prompt_tokens`, `completion_tokens`,
 * `prompt_tokens_details.cached_tokens`, `completion_tokens_details.reasoning_tokens`).
 * BELUM diverifikasi terhadap OpenRouter (spike §17) — karena itu setiap medan
 * boleh null dan pembaca ini TIDAK PERNAH melempar. Biaya sengaja tidak dibaca.
 */
export function bacaPemakaianToken(usage: unknown): PemakaianToken {
  const u = objek(usage)
  if (!u) return { inputTokens: null, outputTokens: null, cachedInputTokens: null, reasoningTokens: null }
  return {
    inputTokens: bilanganToken(u.prompt_tokens),
    outputTokens: bilanganToken(u.completion_tokens),
    cachedInputTokens: bilanganToken(objek(u.prompt_tokens_details)?.cached_tokens),
    reasoningTokens: bilanganToken(objek(u.completion_tokens_details)?.reasoning_tokens),
  }
}

const POLA_MODEL_DILAYANI = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/
const POLA_ID_PERMINTAAN = /^[A-Za-z0-9._:-]{1,200}$/

export type MetaRespons = { servedModel: string | null; providerRequestId: string | null; pemakaian: PemakaianToken }

/** Hanya medan identitas & pemakaian yang lolos pola ketat; sisanya dibuang. */
export function bacaMetaRespons(respons: unknown): MetaRespons {
  const r = objek(respons)
  const model = typeof r?.model === 'string' && POLA_MODEL_DILAYANI.test(r.model) ? r.model : null
  const id = typeof r?.id === 'string' && POLA_ID_PERMINTAAN.test(r.id) ? r.id : null
  return { servedModel: model, providerRequestId: id, pemakaian: bacaPemakaianToken(r?.usage) }
}

// ================================================ parameter & batas ukuran

/** Daftar izin `AgentModelCall.params`. Kunci lain (kunci API, header, isi pesan) dibuang. */
export function saringParameterPanggilan(p: unknown): Record<string, string | number> {
  const o = objek(p)
  const hasil: Record<string, string | number> = {}
  if (!o) return hasil
  if (typeof o.temperature === 'number' && Number.isFinite(o.temperature) && o.temperature >= 0 && o.temperature <= 2) {
    hasil.temperature = o.temperature
  }
  if (typeof o.toolChoice === 'string' && /^[a-z_][a-z0-9_]{0,63}$/.test(o.toolChoice)) hasil.toolChoice = o.toolChoice
  if (typeof o.pdfEngine === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(o.pdfEngine)) hasil.pdfEngine = o.pdfEngine
  if (typeof o.timeoutMs === 'number' && Number.isSafeInteger(o.timeoutMs) && o.timeoutMs > 0 && o.timeoutMs <= 600_000) {
    hasil.timeoutMs = o.timeoutMs
  }
  if (typeof o.maxTokens === 'number' && Number.isSafeInteger(o.maxTokens) && o.maxTokens > 0 && o.maxTokens <= 1_000_000) {
    hasil.maxTokens = o.maxTokens
  }
  return hasil
}

export const MAKS_BYTE_HASIL_RUN = 16 * 1024
export const MAKS_BYTE_USULAN = 32 * 1024
export const MAKS_RINGKASAN_RUN = 300
export const MAKS_DETAIL_GALAT = 300

/** Ukuran UTF-8 JSON; null bila tak bisa diserialisasi (siklus, BigInt). */
export function ukuranJson(v: unknown): number | null {
  try {
    const s = JSON.stringify(v)
    return s === undefined ? null : new TextEncoder().encode(s).length
  } catch {
    return null
  }
}

export function jsonMuat(v: unknown, maksByte: number): boolean {
  const n = ukuranJson(v)
  return n !== null && n <= maksByte
}

/** Teks bebas milik KITA (ringkasan/detail galat): satu baris, tanpa karakter kontrol, dipotong. */
export function potongTeks(s: string | null | undefined, maks: number): string | null {
  if (typeof s !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const bersih = s.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (bersih === '') return null
  return bersih.length > maks ? `${bersih.slice(0, maks - 1)}…` : bersih
}
