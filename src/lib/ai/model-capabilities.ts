// Peta kemampuan model + resolusi setelan model agen TAH — MURNI, TANPA impor
// (PRD-005 Step 3A, keputusan owner D7 & Q4).
//
// ATURAN:
//   1. Nama model HANYA dibaca di sini dan di pembentuk parameter klien. Aturan
//      bisnis (validasi, pencocokan, duplikat, persetujuan) TIDAK PERNAH bercabang
//      pada nama model — dikunci prisma/check-tah-policy.mjs.
//   2. Setelan agen (mis. TAH_INTAKE_MODEL) TIDAK DISET → perilaku lama persis:
//      model bawaan klien (OPENROUTER_SPK_MODEL / bawaan openrouter.ts) dengan
//      parameter lama. Tidak ada perubahan perilaku saat deploy.
//   3. Setelan agen DISET → WAJIB menunjuk entri VERIFIED di peta ini. Slug tak
//      sah, model tak dikenal, PENDING_SPIKE, atau BLOCKED → agen GAGAL TERTUTUP
//      dengan MODEL_TIDAK_TERVERIFIKASI. TIDAK PERNAH diam-diam jatuh ke
//      OPENROUTER_SPK_MODEL (Q4 — aturan keselamatan konfigurasi).
//   4. Nilai kosong/spasi saja dianggap TIDAK DISET (konvensi env repo ini:
//      kosong = bawaan), supaya placeholder kosong di .env tak mematikan fitur.
//
// Berkas ini belum dipakai kode jalan mana pun di Step 3A; intake memakainya di Step 3B.

export const STATUS_MODEL = ['VERIFIED', 'PENDING_SPIKE', 'BLOCKED'] as const
export type StatusModel = (typeof STATUS_MODEL)[number]

export type KemampuanModel = {
  /** false → parameter `temperature` tak boleh dikirim. */
  acceptsTemperature: boolean
  /** false → tool_choice paksa (type function) tak boleh dikirim. */
  supportsForcedToolChoice: boolean
  /** false → plugin file-parser engine native untuk PDF tak dipakai. */
  supportsPdfNative: boolean
}

export type EntriModel = {
  slug: string
  status: StatusModel
  /** null = belum diketahui (belum diverifikasi). Wajib terisi bila VERIFIED. */
  kemampuan: KemampuanModel | null
  /**
   * Dasar status: LEGACY_IN_USE = model yang sudah dipakai fitur AI berjalan
   * sebelum TAH (BELUM diverifikasi mandiri oleh spike TAH); SPIKE = hasil spike
   * verifikasi penyedia yang disetujui owner; NONE = belum ada bukti.
   */
  dasar: 'LEGACY_IN_USE' | 'SPIKE' | 'NONE'
  catatan: string
}

export const PETA_KEMAMPUAN_MODEL: readonly EntriModel[] = [
  {
    slug: 'anthropic/claude-sonnet-4.5',
    status: 'VERIFIED',
    kemampuan: { acceptsTemperature: true, supportsForcedToolChoice: true, supportsPdfNative: true },
    dasar: 'LEGACY_IN_USE',
    catatan:
      'Bawaan openrouter.ts (SPK_MODEL) yang dipakai fitur AI yang sudah berjalan, termasuk ekstraksi intake dengan temperature 0 + tool paksa + plugin PDF native. Belum diverifikasi mandiri oleh spike TAH.',
  },
  {
    slug: 'anthropic/claude-sonnet-5',
    status: 'PENDING_SPIKE',
    kemampuan: null,
    dasar: 'NONE',
    catatan:
      'Model utama TAH yang dituju owner. DILARANG dipakai sampai spike verifikasi penyedia (PRD-005 Step 2 §17) memastikan slug, penanganan temperature, tool paksa, PDF native, dan medan pemakaian.',
  },
]

/** Bentuk slug OpenRouter: `vendor/model`, huruf kecil. */
export const POLA_SLUG_MODEL = /^[a-z0-9][a-z0-9-]{0,39}\/[a-z0-9][a-z0-9.:-]{0,79}$/

export type DetailModelDitolak = 'SLUG_TIDAK_SAH' | 'MODEL_TIDAK_DIKENAL' | 'PENDING_SPIKE' | 'BLOCKED' | 'KEMAMPUAN_TIDAK_LENGKAP'

export type ResolusiModel =
  | { aktif: true; mode: 'LEGACY'; model: null; kemampuan: null }
  | { aktif: true; mode: 'EXPLICIT'; model: string; kemampuan: KemampuanModel }
  | { aktif: false; alasan: 'MODEL_TIDAK_TERVERIFIKASI'; detail: DetailModelDitolak }

export function cariEntriModel(slug: string, peta: readonly EntriModel[] = PETA_KEMAMPUAN_MODEL): EntriModel | null {
  return peta.find((e) => e.slug === slug) ?? null
}

/** Resolusi setelan model satu agen (`namaEnv`, mis. TAH_INTAKE_MODEL). */
export function resolusiModelAgen(
  env: Readonly<Record<string, string | undefined>>,
  namaEnv: string,
  peta: readonly EntriModel[] = PETA_KEMAMPUAN_MODEL,
): ResolusiModel {
  const mentah = env[namaEnv]
  if (mentah === undefined || mentah.trim() === '') return { aktif: true, mode: 'LEGACY', model: null, kemampuan: null }
  const slug = mentah.trim()
  const tolak = (detail: DetailModelDitolak): ResolusiModel => ({ aktif: false, alasan: 'MODEL_TIDAK_TERVERIFIKASI', detail })
  if (!POLA_SLUG_MODEL.test(slug)) return tolak('SLUG_TIDAK_SAH')
  const entri = cariEntriModel(slug, peta)
  if (!entri) return tolak('MODEL_TIDAK_DIKENAL')
  if (entri.status === 'PENDING_SPIKE') return tolak('PENDING_SPIKE')
  if (entri.status !== 'VERIFIED') return tolak('BLOCKED')
  if (!entri.kemampuan) return tolak('KEMAMPUAN_TIDAK_LENGKAP')
  return { aktif: true, mode: 'EXPLICIT', model: entri.slug, kemampuan: entri.kemampuan }
}

export const resolusiModelIntake = (env: Readonly<Record<string, string | undefined>>): ResolusiModel =>
  resolusiModelAgen(env, 'TAH_INTAKE_MODEL')

export type PermintaanParameter = { temperature?: number; paksaTool?: string; pdfNative?: boolean }

export type ParameterTerbentuk =
  | { ok: true; temperature?: number; paksaTool?: string; pdfNative: boolean }
  | { ok: false; kode: 'FORCED_TOOL_TIDAK_DIDUKUNG' }

/**
 * Sesuaikan parameter dengan kemampuan model. `kemampuan` null (mode LEGACY) →
 * dikembalikan PERSIS seperti diminta (perilaku lama). Tool paksa yang tak
 * didukung → galat (bukan diam-diam diubah: ekstraksi intake bergantung padanya).
 * PDF native yang tak didukung → dimatikan (intake sudah punya jalur ulang tanpa plugin).
 */
export function bentukParameter(kemampuan: KemampuanModel | null, minta: PermintaanParameter): ParameterTerbentuk {
  if (kemampuan === null) {
    return { ok: true, temperature: minta.temperature, paksaTool: minta.paksaTool, pdfNative: minta.pdfNative === true }
  }
  if (minta.paksaTool !== undefined && !kemampuan.supportsForcedToolChoice) return { ok: false, kode: 'FORCED_TOOL_TIDAK_DIDUKUNG' }
  return {
    ok: true,
    temperature: kemampuan.acceptsTemperature ? minta.temperature : undefined,
    paksaTool: minta.paksaTool,
    pdfNative: minta.pdfNative === true && kemampuan.supportsPdfNative,
  }
}

/** Validasi peta (dipakai uji): slug unik & sah, VERIFIED wajib punya kemampuan lengkap. */
export function validasiPetaModel(peta: readonly EntriModel[] = PETA_KEMAMPUAN_MODEL): string[] {
  const galat: string[] = []
  const lihat = new Set<string>()
  for (const e of peta) {
    if (!POLA_SLUG_MODEL.test(e.slug)) galat.push(`${e.slug}: slug tidak sah`)
    if (lihat.has(e.slug)) galat.push(`${e.slug}: ganda`)
    lihat.add(e.slug)
    if (!(STATUS_MODEL as readonly string[]).includes(e.status)) galat.push(`${e.slug}: status tidak dikenal`)
    if (e.status === 'VERIFIED') {
      const k = e.kemampuan
      if (!k || typeof k.acceptsTemperature !== 'boolean' || typeof k.supportsForcedToolChoice !== 'boolean' || typeof k.supportsPdfNative !== 'boolean') {
        galat.push(`${e.slug}: VERIFIED tanpa kemampuan lengkap`)
      }
      if (e.dasar === 'NONE') galat.push(`${e.slug}: VERIFIED tanpa dasar bukti`)
    }
  }
  return galat
}
