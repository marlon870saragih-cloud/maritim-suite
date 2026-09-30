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
//   5. PRD-005 promosi sempit (KEPUTUSAN OWNER D-P1): entri VERIFIED boleh membawa
//      `cakupanInput` (jenis input yang terverifikasi) + `promptIntake` (identitas prompt
//      yang terikat bukti). Jenis input DI LUAR cakupan → jalur LEGACY eksplisit (model
//      bawaan + Prompt v3) — kebijakan rute per input yang tercatat di sini, BUKAN fallback
//      diam-diam. Rute ditentukan DATA peta ini, tak pernah oleh nama model di kode jalan.
//
// Berkas ini belum dipakai kode jalan mana pun di Step 3A; intake memakainya di Step 3B.

export const STATUS_MODEL = ['VERIFIED', 'PENDING_SPIKE', 'BLOCKED'] as const
export type StatusModel = (typeof STATUS_MODEL)[number]

/** Jenis input intake (= P.JenisInput di intake-policy; diduplikasi supaya berkas ini tetap tanpa impor). */
export const JENIS_INPUT_MODEL = ['TEXT', 'CSV', 'WORKBOOK', 'PDF', 'IMAGE'] as const
export type JenisInputModel = (typeof JENIS_INPUT_MODEL)[number]

/** Identitas prompt intake yang terikat bukti evaluasi (versi + sha256 system prompt & skema tool). */
export type IdentitasPromptIntake = { versi: string; hash: string }

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
  /**
   * Jenis input yang TERVERIFIKASI untuk entri ini. Tidak ada = semua jenis (entri lama).
   * Ada = hanya jenis ini yang memakai model ini; jenis lain → jalur LEGACY eksplisit.
   */
  cakupanInput?: readonly JenisInputModel[]
  /** Prompt intake yang terikat bukti (hanya bersama cakupanInput). Tidak ada = Prompt v3 legacy. */
  promptIntake?: IdentitasPromptIntake
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
    // PRD-005 (keputusan owner, pasca Eval-7 Blind-A): promosi D-P1 DICABUT — revalidasi belum selesai. Kembali
    // PENDING_SPIKE sampai fresh Blind-B lulus; cakupanInput/promptIntake tetap tercatat sebagai cakupan spike.
    status: 'PENDING_SPIKE',
    // Hanya nilai yang dibuktikan Eval-4: tool paksa (42/42). acceptsTemperature false = temperature
    // TIDAK DIKIRIM (konfigurasi yang diuji) — BUKAN bukti bahwa model menolak temperature.
    // supportsPdfNative false = PDF TIDAK diverifikasi.
    kemampuan: { acceptsTemperature: false, supportsForcedToolChoice: true, supportsPdfNative: false },
    dasar: 'SPIKE',
    cakupanInput: ['TEXT'],
    promptIntake: { versi: '4', hash: '6ed1edba38780badcff111e70f63e83d95668f15b99644f174bac1984ce65959' },
    catatan:
      'PRD-005 promosi sempit (keputusan owner D-P1): TERVERIFIKASI HANYA untuk Vessel Call Intake input TEXT dengan Prompt v4. ' +
      'Bukti: Eval-4 paket prd005-eval4/heldout-3, 2026-09-27, EVAL4_PASS — 42/42 panggilan, 40/40 held-out lulus, konsistensi POST 20/20, ' +
      '0 FATAL, 0 MAJOR, 0 muatan tak berbukti, 0 pelanggaran identitas/fallback/output tool; biaya evaluasi US$0.6141 (docs/PRD-005-EVAL4-RESULT.md). ' +
      'Transport terbukti: diminta & dilayani anthropic/claude-sonnet-5 persis, tool paksa, tanpa temperature, tanpa fallback. ' +
      'TIDAK diverifikasi: PDF (native maupun tidak), IMAGE, CSV, WORKBOOK, penerimaan temperature, fitur AI lain — jenis input itu tetap jalur LEGACY.',
  },
]

/** Bentuk slug OpenRouter: `vendor/model`, huruf kecil. */
export const POLA_SLUG_MODEL = /^[a-z0-9][a-z0-9-]{0,39}\/[a-z0-9][a-z0-9.:-]{0,79}$/

export type DetailModelDitolak = 'SLUG_TIDAK_SAH' | 'MODEL_TIDAK_DIKENAL' | 'PENDING_SPIKE' | 'BLOCKED' | 'KEMAMPUAN_TIDAK_LENGKAP'

export type ResolusiModel =
  | { aktif: true; mode: 'LEGACY'; model: null; kemampuan: null }
  | { aktif: true; mode: 'EXPLICIT'; model: string; kemampuan: KemampuanModel; cakupanInput: readonly JenisInputModel[] | null; promptIntake: IdentitasPromptIntake | null }
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
  return { aktif: true, mode: 'EXPLICIT', model: entri.slug, kemampuan: entri.kemampuan, cakupanInput: entri.cakupanInput ?? null, promptIntake: entri.promptIntake ?? null }
}

export const resolusiModelIntake = (env: Readonly<Record<string, string | undefined>>, peta: readonly EntriModel[] = PETA_KEMAMPUAN_MODEL): ResolusiModel =>
  resolusiModelAgen(env, 'TAH_INTAKE_MODEL', peta)

/** Rute satu input intake: model + prompt yang dipakai, dan alasannya (dicatat, bukan fallback diam-diam). */
export type RuteModelInput =
  | { aktif: false; alasan: 'MODEL_TIDAK_TERVERIFIKASI'; detail: DetailModelDitolak }
  | { aktif: true; rute: 'LEGACY_TANPA_SETELAN' | 'LEGACY_DI_LUAR_CAKUPAN'; model: null; kemampuan: null; promptIntake: null }
  | { aktif: true; rute: 'EXPLICIT'; model: string; kemampuan: KemampuanModel; promptIntake: IdentitasPromptIntake | null }

/**
 * Rute TAH_INTAKE_MODEL untuk SATU jenis input (keputusan owner D-P1). Setelan tak diset → LEGACY
 * (perilaku lama). Setelan tak sah → gagal tertutup (sama dengan resolusiModelIntake). Entri dengan
 * `cakupanInput` yang TIDAK memuat jenis ini → LEGACY_DI_LUAR_CAKUPAN (model bawaan + Prompt v3),
 * eksplisit & tercatat. Di dalam cakupan → EXPLICIT dengan prompt yang terikat bukti.
 */
export function ruteModelIntakeUntukInput(
  env: Readonly<Record<string, string | undefined>>,
  jenis: string,
  peta: readonly EntriModel[] = PETA_KEMAMPUAN_MODEL,
): RuteModelInput {
  const r = resolusiModelIntake(env, peta)
  if (!r.aktif) return r
  if (r.mode === 'LEGACY') return { aktif: true, rute: 'LEGACY_TANPA_SETELAN', model: null, kemampuan: null, promptIntake: null }
  if (r.cakupanInput !== null && !(r.cakupanInput as readonly string[]).includes(jenis)) {
    return { aktif: true, rute: 'LEGACY_DI_LUAR_CAKUPAN', model: null, kemampuan: null, promptIntake: null }
  }
  return { aktif: true, rute: 'EXPLICIT', model: r.model, kemampuan: r.kemampuan, promptIntake: r.promptIntake }
}

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
    if (e.cakupanInput !== undefined) {
      const c = e.cakupanInput as readonly string[]
      if (c.length === 0) galat.push(`${e.slug}: cakupanInput kosong`)
      if (new Set(c).size !== c.length) galat.push(`${e.slug}: cakupanInput ganda`)
      if (c.some((j) => !(JENIS_INPUT_MODEL as readonly string[]).includes(j))) galat.push(`${e.slug}: cakupanInput tak dikenal`)
      if (e.status !== 'VERIFIED' && e.status !== 'PENDING_SPIKE') galat.push(`${e.slug}: cakupanInput hanya untuk VERIFIED/PENDING_SPIKE`)
    }
    if (e.promptIntake !== undefined) {
      const p = e.promptIntake
      if (!p || typeof p.versi !== 'string' || p.versi === '' || !/^[0-9a-f]{64}$/.test(p.hash ?? '')) galat.push(`${e.slug}: promptIntake tidak sah`)
      if (e.cakupanInput === undefined) galat.push(`${e.slug}: promptIntake tanpa cakupanInput`)
    }
  }
  return galat
}
