// PRD-005 Eval-4 — RUNNER (Sonnet 5 SAJA, Prompt v4 kandidat, scorer-3, validator produksi) — LURING.
//
// Langkah ini membangun runner TANPA panggilan LIVE. Mode live BELUM diotorisasi: frasa usulan
// FRASA_OTORISASI_EVAL4 tidak berlaku, dan kesiapanLiveEval4() (spike-eval4-identitas-model.mjs) melaporkan
// penghalang nyata (konfigurasi owner, ambang kualitas, gerbang kualitas di runner, bukti kapabilitas transport
// Sonnet 5) — jalur jaringan mustahil sampai semuanya terpenuhi dan owner membukanya secara terpisah.
//
// MEMAKAI ULANG (tidak diubah):
//   • pencegat penyedia Eval-1 (host tunggal, allowlist, batas panggilan/biaya/token, usage.cost wajib);
//   • pagar served KETAT Eval-2 + penyedia stub Eval-2;
//   • pagar SLOT & PROYEKSI biaya Eval-3 (rakitJalurPenyedia: tepat 1 percobaan/slot, model slot persis,
//     tanpa larik/rute fallback, proyeksi biaya SEBELUM setiap panggilan), akuntansi Eval-3;
//   • pagar identitas Eval-4 (opsiEkstraktorEval4 / periksaIdentitasModel / periksaBadanPermintaanEval4);
//   • ekstraktor produksi buatEkstraktorOpenRouter(PROMPT_INTAKE_V4, {modelWajib, servedWajib});
//   • validator produksi validasiEkstraksi (POST = validator atas KLON RAW) + scorer-3 (nilaiKasusV2);
//   • pemeriksa konsistensi GT ↔ sumber (gt-sumber-2) dan pembekuan Eval-1/2/3.
// BARU di Eval-4:
//   • blok REGRESI muatan (RG-H20, RG-H18) SELALU dijalankan PERTAMA — H20 selalu teramati (RAW & POST);
//   • paket HELD-OUT = masukan owner (KONFIG_OWNER_EVAL4). Owner D6: kasus Eval-3 yang sudah diperiksa BUKAN
//     held-out; kasus Eval-4 wajib baru & belum pernah dilihat model. Paket BELUM ADA → live DITOLAK;
//   • titik-simpan (checkpoint) di luar repo: jeda aman di batas slot + lanjut (resume) tanpa ulang panggilan.
//     Slot yang terputus DI TENGAH panggilan (inflight) tidak pernah dilanjutkan otomatis — biaya/panggilan
//     ambigu → tinjauan owner. Slot gagal = run BERHENTI (tak bisa dilanjutkan; tanpa ulang otomatis).
//   • TANPA gerbang lulus/gagal kualitas: ambang Eval-4 belum ditetapkan owner → putusan terbaik
//     MENUNGGU_GERBANG_OWNER (tak pernah PASS). Regresi muatan H20/H18 GAGAL → GAGAL_REGRESI_MUATAN.
//
// ── Menjalankan ─────────────────────────────────────────────────────────────────────────
//   Luring (stub deterministik dari GT; DRY_RUN / NON-LIVE; nol panggilan penyedia):
//     node prisma/spike-eval4-runner.mjs --mode offline --report /tmp/eval4-dry.json [--checkpoint /tmp/eval4.ckpt.json [--resume]]
//   Langsung: BELUM DIOTORISASI. Tanpa argumen → hanya cetak integritas & rencana.

import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as H from './spike-eval1.mjs'
import * as R1 from './spike-eval1-runner.mjs'
import * as S from './spike-eval1-scorer.mjs'
import * as B2 from './spike-eval2-beku.mjs'
import * as R2 from './spike-eval2-runner.mjs'
import * as B3 from './spike-eval3-beku.mjs'
import * as R3 from './spike-eval3-runner.mjs'
import * as E2 from './spike-eval2-penilai.mjs'
import * as S3 from './spike-eval4-scorer.mjs'
import * as G from './spike-gt-konsistensi.mjs'
import * as M from './spike-eval4-identitas-model.mjs'
import * as RG from './fixtures/spike-intake/eval4-regresi-muatan.mjs'
import * as F1 from './fixtures/spike-intake/eval1-cases.mjs'
import * as F2 from './fixtures/spike-intake/eval2-cases.mjs'
import * as F3 from './fixtures/spike-intake/eval3-cases.mjs'

const AKAR = fileURLToPath(new URL('..', import.meta.url))
const sha256 = (x) => createHash('sha256').update(x).digest('hex')

export const VERSI_RUNNER_EVAL4 = 'prd005-eval4/runner-1'
/** USULAN — belum diotorisasi. Hanya frasa ini (persis) yang kelak membuka mode live Eval-4. */
export const FRASA_OTORISASI_EVAL4 = 'PRD-005-EVAL4-LIVE'
/** Frasa run terdahulu: TIDAK PERNAH mengotorisasi Eval-4. */
export const FRASA_LAMA = Object.freeze([...R3.FRASA_LAMA, R3.FRASA_OTORISASI_EVAL3])
export const MODE = R1.MODE
export const TRANSPORT = R1.TRANSPORT
export const LABEL_DRY = R1.LABEL_DRY
export const LABEL_LIVE = R1.LABEL_LIVE
export const KUNCI_STUB = 'stub-kunci-eval4-runner-luring-000000'
export const FORMAT_CHECKPOINT = 'prd005-eval4/checkpoint-1'

export const BLOK_REGRESI = 'REGRESI_MUATAN_S5_V4'
export const BLOK_HELDOUT = 'HELDOUT_S5_V4'
/** Urutan beku blok regresi: H20 PERTAMA (kegagalan keselamatan yang diaudit), lalu H18. */
export const URUTAN_REGRESI = Object.freeze(['RG-H20', 'RG-H18'])
export const KASUS_H20 = 'RG-H20'

/**
 * Artefak beku Eval-4 (sha256 berkas). Mengubah salah satunya = identitas evaluasi baru → run DITOLAK
 * sampai owner meninjau dan pin ini diperbarui secara eksplisit.
 */
export const SHA_BEKU_EVAL4 = Object.freeze({
  'prisma/fixtures/spike-intake/eval4-regresi-muatan.mjs': '01871bf6cd2c266cb0070497a071a211c8601f92c8a8341e00890dacc6921012',
  'prisma/spike-eval4-scorer.mjs': 'a513cf676862f356cf1e242736b17bd94d0af06bc9c08718b415b602ef3bb12d',
  'src/lib/maritim-lexicon.ts': '864e4e3bf4cb47ef6e1d112ad42b5c9efd9d402c459e2d8be465f0bbab41fb83',
})
/** Identitas Prompt v4 kandidat (hash sistem + skema tool) yang diikat run Eval-4. */
export const IKATAN_PROMPT_V4 = Object.freeze({ idPrompt: 'vessel-call-extract', versiPrompt: '4', versiSkema: '4', hashPrompt: '6ed1edba38780badcff111e70f63e83d95668f15b99644f174bac1984ce65959' })

/**
 * MASUKAN OWNER Eval-4 — SENGAJA null: belum ditetapkan. Bentuk yang diharapkan (periksaKonfigOwner):
 *   { paket: { versi, kasus: [kasus TEXT baru ber-GT], hashGt }, ulangan: 1..3,
 *     batas: { maksPanggilan, biayaLunakUsd, biayaKerasUsd, tokenInput, tokenOutput }, plafonPerPanggilanUsd }
 * Selama null: mode live DITOLAK; mode luring hanya menjalankan blok regresi dengan BATAS_LURING_STUB.
 * Tidak ada angka anggaran/plafon/ambang yang ditebak di sini.
 */
export const KONFIG_OWNER_EVAL4 = null

/**
 * PROFIL TRANSPORT Eval-4 (keputusan owner): Sonnet 5, Prompt v4, tool paksa WAJIB, temperature DIHILANGKAN
 * (referensi API Anthropic: Sonnet 5 menolak temperature non-bawaan). Dipasang sebagai `kemampuan` konteks
 * panggilan Eval-4 SAJA — bentukParameter() lalu tidak mengirim temperature dan tetap memaksa tool.
 * BUKAN kemampuan terverifikasi: registri (model-capabilities.ts) tetap PENDING_SPIKE, kemampuan null,
 * dan jalur produksi tidak berubah. supportsPdfNative=false: Eval-4 hanya TEXT (PDF native belum diverifikasi).
 */
export const PROFIL_TRANSPORT_EVAL4 = Object.freeze({ acceptsTemperature: false, supportsForcedToolChoice: true, supportsPdfNative: false })
/** Bentuk permintaan beku Eval-4 yang dicek pagarBadanEval4 sebelum transport (kandidat untuk probe kapabilitas). */
export const BENTUK_TRANSPORT_EVAL4 = Object.freeze({ model: 'anthropic/claude-sonnet-5', prompt: 'v4', toolChoice: 'FUNCTION_PAKSA', temperature: 'DIHILANGKAN', fallback: 'TIDAK_ADA', servedWajib: 'anthropic/claude-sonnet-5' })
/** Nama tool paksa Prompt v4 (dicek terhadap X.PROMPT_INTAKE_V4 saat preflight). */
export const TOOL_PAKSA_EVAL4 = 'isi_intake_kunjungan'

/** Sidik identitas transport Eval-4: bentuk + profil (kunci terurut). Berubah → bukti transport tak berlaku. */
export function sidikBentukTransportEval4(bentuk = BENTUK_TRANSPORT_EVAL4, profil = PROFIL_TRANSPORT_EVAL4) {
  const urut = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]))
  return sha256(JSON.stringify({ bentuk: urut(bentuk), profil: urut(profil) }))
}
/** Harapan bukti transport = identitas beku SAAT INI (dihitung ulang, bukan disalin dari bukti). */
export const harapanTransportEval4 = () => ({ model: M.EXPECTED_MODEL_ID, served: M.EXPECTED_SERVED_MODEL_ID, sidikBentukTransport: sidikBentukTransportEval4(), hashPromptV4: IKATAN_PROMPT_V4.hashPrompt, toolPaksa: TOOL_PAKSA_EVAL4 })

/**
 * BUKTI KAPABILITAS TRANSPORT Sonnet 5 (probe LIVE tunggal, disetujui owner, 2026-09-27). Hanya menghapus
 * penghalang KAPABILITAS_TRANSPORT_S5_BELUM_DIBUKTIKAN. BUKAN verifikasi registri: Sonnet 5 tetap PENDING_SPIKE,
 * kemampuan null, dasar NONE; produksi tidak berubah; bukan evaluasi kualitas.
 */
export const BUKTI_TRANSPORT_S5_EVAL4 = Object.freeze({
  jenis: 'SONNET_5_TRANSPORT_CAPABILITY_PROVEN',
  tanggal: '2026-09-27',
  panggilanModel: 1,
  requestedModel: 'anthropic/claude-sonnet-5',
  servedModel: 'anthropic/claude-sonnet-5',
  provider: 'Claude Platform on AWS',
  providerRequestId: 'gen-1790501177-tPEVHVfeDJZFILO7BC5M',
  httpStatus: 200,
  finishReason: 'tool_calls',
  toolPaksa: 'isi_intake_kunjungan',
  toolCallTerpaksa: true,
  argumenTerurai: true,
  argumenStrukturSah: true,
  temperatureDikirim: false,
  fallbackDikirim: false,
  providerOverrideDikirim: false,
  hashPromptV4: '6ed1edba38780badcff111e70f63e83d95668f15b99644f174bac1984ce65959',
  sidikBentukTransport: '24de82fc1dfdf717a7222ad347aacf8e272cc6dac7b343b590b6e1e0f1910fd0',
  masukan: 'RG-H18 (regresi, bukan held-out)',
  pemakaian: Object.freeze({ input: 5997, output: 162, total: 6159 }),
  biayaUsd: 0.013614,
  batasBiayaProbeUsd: 0.05,
})
/** Batas KHUSUS stub luring (biaya stub, bukan uang nyata). Tak pernah dipakai transport jaringan. */
export const BATAS_LURING_STUB = Object.freeze({ maksPanggilan: 40, biayaLunakUsd: 0.9, biayaKerasUsd: 1, tokenInput: 1_000_000, tokenOutput: 100_000 })
export const PLAFON_LURING_STUB_USD = 0.02

const BATAS_WAKTU_MS = 60_000
const STOP_ALASAN = ['BATAS_PANGGILAN', 'BERHENTI_LUNAK_BIAYA', 'BATAS_TOKEN', 'PROYEKSI_BIAYA_KERAS']
const TOLAK_SLOT = ['MODEL_DIMINTA_BERBEDA', 'PERCOBAAN_ULANG', 'FALLBACK_DIMINTA', 'PANGGILAN_DI_LUAR_SLOT', 'PANGGILAN_SAAT_PROBE', 'BADAN_EVAL4_DITOLAK']
const ENV_DIKELOLA = ['OPENROUTER_API_KEY', 'TAH_INTAKE_MODEL']

// ------------------------------------------------------------------ pembekuan
export function verifikasiBekuEval4({ baca = (rel) => readFileSync(join(AKAR, rel)) } = {}) {
  const galat = []
  for (const [rel, h] of Object.entries(SHA_BEKU_EVAL4)) {
    let isi
    try {
      isi = baca(rel)
    } catch {
      galat.push(`BERKAS_BEKU_TIDAK_TERBACA:${rel}`)
      continue
    }
    if (sha256(isi) !== h) galat.push(`SHA_BERKAS_BEKU_BERBEDA:${rel}`)
  }
  if (B3.verifikasiBekuEval3().length) galat.push('EVAL3_BERUBAH')
  if (H.verifikasiBeku().length) galat.push('EVAL1_BERUBAH')
  if (B2.verifikasiBekuEval2().length) galat.push('EVAL2_BERUBAH')
  if (RG.VERSI_REGRESI_MUATAN !== 'prd005-e5-eval4/regresi-muatan-1') galat.push('VERSI_REGRESI_BERBEDA')
  if (S3.VERSI_PENILAI_V2 !== 'prd005-e5-eval4/scorer-3') galat.push('VERSI_PENILAI_BERBEDA')
  return galat
}

export function verifikasiIkatanPromptV4(aktual) {
  if (!aktual || typeof aktual !== 'object') return ['IDENTITAS_PROMPT_V4_TIDAK_ADA']
  const g = []
  if (aktual.id !== IKATAN_PROMPT_V4.idPrompt) g.push('ID_PROMPT_BERBEDA')
  if (aktual.versi !== IKATAN_PROMPT_V4.versiPrompt) g.push('VERSI_PROMPT_BERBEDA')
  if (aktual.versiSkema !== IKATAN_PROMPT_V4.versiSkema) g.push('VERSI_SKEMA_BERBEDA')
  if (aktual.hash !== IKATAN_PROMPT_V4.hashPrompt) g.push('HASH_PROMPT_BERBEDA')
  return g
}

// ------------------------------------------------------------------ paket held-out & konfigurasi owner
const kanon = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, kanon(v[k])])) : Array.isArray(v) ? v.map(kanon) : v)
/** Hash kanonik paket held-out (versi + kasus: id/kind/kategori/teks/gt). */
export function hitungHashPaket(paket) {
  return sha256(JSON.stringify(kanon({ versi: paket.versi, kasus: paket.kasus.map((k) => ({ id: k.id, kind: k.kind, kategori: k.kategori ?? null, teks: k.teks, gt: k.gt })) })))
}
const rapat = (t) => String(t).replace(/\s+/g, ' ').trim().toUpperCase()

/** Teks & id kasus yang SUDAH TERLIHAT (Eval-1/2/3 + regresi) — dasar penolakan D6. */
export function kasusTerlihat(hariIni = new Date()) {
  const semua = [...F1.bangunKasusEval1(hariIni), ...F2.bangunKasusEval2(hariIni), ...F3.bangunKasusEval3(hariIni), ...RG.KASUS_REGRESI_MUATAN]
  return { id: new Set(semua.map((k) => k.id)), teks: new Set(semua.filter((k) => typeof k.teks === 'string').map((k) => rapat(k.teks))) }
}

/** Galat paket held-out (kosong = lolos). Menolak kasus yang pernah dilihat (id, teks, atau sentinel lama). */
export function periksaPaketHeldout(paket, { terlihat } = {}) {
  if (!paket || typeof paket !== 'object') return ['PAKET_HELDOUT_TIDAK_ADA']
  const g = []
  if (typeof paket.versi !== 'string' || !paket.versi) g.push('PAKET_VERSI_TIDAK_ADA')
  if (!Array.isArray(paket.kasus) || paket.kasus.length === 0) return [...g, 'PAKET_KASUS_KOSONG']
  const ids = paket.kasus.map((k) => k?.id)
  if (new Set(ids).size !== ids.length) g.push('PAKET_ID_GANDA')
  const lihat = terlihat ?? kasusTerlihat()
  for (const k of paket.kasus) {
    for (const m of E2.masalahKasusPenilai(k)) g.push(`${k?.id}:${m}`)
    if (typeof k?.teks !== 'string' || !k.teks.trim()) g.push(`${k?.id}:TEKS_TIDAK_ADA`)
    else {
      if (lihat.teks.has(rapat(k.teks))) g.push(`${k.id}:KASUS_SUDAH_TERLIHAT_TEKS`)
      if ([F1.POLA_SENTINEL, F2.POLA_SENTINEL_EVAL2, F3.POLA_SENTINEL_EVAL3].some((p) => p.test(k.teks))) g.push(`${k.id}:SENTINEL_EVAL_LAMA`)
    }
    if (lihat.id.has(k?.id)) g.push(`${k?.id}:KASUS_SUDAH_TERLIHAT_ID`)
  }
  if (g.length) return g
  if (paket.hashGt !== hitungHashPaket(paket)) g.push('PAKET_HASH_GT_BERBEDA')
  const kons = G.periksaKonsistensiGtSumber(paket.kasus)
  if (!kons.lulus) g.push(...kons.gagal.map((t) => `${t.kasus}:GT_TIDAK_KONSISTEN_${t.aturan}`))
  return g
}

const positif = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0
export function periksaBatasEval4(batas) {
  const g = []
  for (const k of ['maksPanggilan', 'biayaLunakUsd', 'biayaKerasUsd', 'tokenInput', 'tokenOutput']) if (!positif(batas?.[k])) g.push(`BATAS_TIDAK_SAH:${k}`)
  if (positif(batas?.maksPanggilan) && !Number.isSafeInteger(batas.maksPanggilan)) g.push('BATAS_TIDAK_SAH:maksPanggilan')
  if (batas?.biayaLunakUsd > batas?.biayaKerasUsd) g.push('BATAS_LUNAK_MELEBIHI_KERAS')
  return g
}

export function periksaKonfigOwner(konfig, opsi = {}) {
  if (konfig === null || konfig === undefined) return ['KONFIG_OWNER_EVAL4_BELUM_DITETAPKAN']
  const g = [...periksaPaketHeldout(konfig.paket, opsi), ...periksaBatasEval4(konfig.batas)]
  if (!(Number.isSafeInteger(konfig.ulangan) && konfig.ulangan >= 1 && konfig.ulangan <= 3)) g.push('ULANGAN_TIDAK_SAH')
  if (!positif(konfig.plafonPerPanggilanUsd)) g.push('PLAFON_PER_PANGGILAN_TIDAK_SAH')
  else if (positif(konfig.batas?.biayaKerasUsd) && konfig.plafonPerPanggilanUsd > konfig.batas.biayaKerasUsd) g.push('PLAFON_MELEBIHI_BATAS_KERAS')
  return g
}

/** Penghalang LIVE Eval-4 untuk konfigurasi owner yang TERBEKU di repo (tanpa otorisasi; untuk CLI/laporan). */
export function penghalangLiveEval4({ konfig = KONFIG_OWNER_EVAL4, terlihat } = {}) {
  const galatKonfig = konfig === null ? null : periksaKonfigOwner(konfig, { terlihat })
  return M.kesiapanLiveEval4({ otorisasiOwnerLive: false, konfigOwner: konfig, galatKonfig, buktiTransport: BUKTI_TRANSPORT_S5_EVAL4, harapanTransport: harapanTransportEval4() }).alasan
}

// ------------------------------------------------------------------ rencana (deterministik)
/** Regresi dulu (urutan beku), lalu held-out per ulangan dalam urutan paket. Satu slot = satu panggilan. */
export function susunRencanaEval4({ regresi, heldout = [], ulangan = 1 }) {
  const r = []
  for (const k of regresi) r.push({ seq: r.length + 1, blok: BLOK_REGRESI, kasus: k.id, ulangan: 1, model: M.EXPECTED_MODEL_ID })
  for (let u = 1; u <= (heldout.length ? ulangan : 0); u++) for (const k of heldout) r.push({ seq: r.length + 1, blok: BLOK_HELDOUT, kasus: k.id, ulangan: u, model: M.EXPECTED_MODEL_ID })
  return r
}
export const sidikRencana = (rencana) => sha256(JSON.stringify(rencana))

// ------------------------------------------------------------------ prasyarat
export function periksaPrasyaratEval4(env, mode, proses = process.env) {
  const galat = []
  if (mode !== MODE.OFFLINE && mode !== MODE.LIVE) return ['MODE_TIDAK_SAH']
  const dua = (n) => [env[n], proses[n]]
  if (dua('NODE_ENV').includes('production')) galat.push('NODE_ENV=production ditolak')
  if (dua('VERCEL_ENV').includes('production')) galat.push('VERCEL_ENV=production ditolak')
  if (dua('OPENROUTER_API_KEY').some(Boolean)) galat.push('OPENROUTER_API_KEY harus KOSONG (kunci produksi tak pernah dipakai)')
  const kunciUji = env.SPIKE_OPENROUTER_API_KEY
  if (kunciUji && dua('OPENROUTER_API_KEY').includes(kunciUji)) galat.push('KUNCI_UJI_SAMA_DENGAN_KUNCI_PRODUKSI')
  if (dua('TAH_INTAKE_MODEL').some((v) => v !== undefined && v.trim() !== '')) galat.push('TAH_INTAKE_MODEL harus kosong')
  if (dua('OPENROUTER_SPK_MODEL').some((v) => v !== undefined && v.trim() !== '' && v.trim() !== H.MODEL_S45)) galat.push('OPENROUTER_SPK_MODEL harus kosong atau Sonnet 4.5')
  for (const n of ['DATABASE_URL', 'DIRECT_URL', 'SPIKE_DATABASE_URL']) if (dua(n).some(Boolean)) galat.push(`${n} harus kosong (runner Eval-4 tidak menyentuh DB)`)
  if (mode === MODE.LIVE) {
    if (FRASA_LAMA.includes(env.SPIKE_AUTHORIZED)) galat.push('SPIKE_AUTHORIZED berisi frasa run terdahulu — Eval-4 butuh frasanya sendiri')
    else if (env.SPIKE_AUTHORIZED !== FRASA_OTORISASI_EVAL4) galat.push('SPIKE_AUTHORIZED tidak sama dengan frasa otorisasi Eval-4')
    if (!kunciUji) galat.push('SPIKE_OPENROUTER_API_KEY (kunci uji khusus) tidak diset')
  }
  return galat
}

// ------------------------------------------------------------------ pagar identitas Eval-4 (terluar)
/** Galat bentuk transport Eval-4 (kosong = sesuai): tanpa temperature, tepat satu tool, tool_choice function paksa pada tool itu. */
export function periksaBentukTransportEval4(b) {
  const g = []
  if (!b || typeof b !== 'object') return ['BADAN_TIDAK_SAH']
  if (Object.prototype.hasOwnProperty.call(b, 'temperature')) g.push('TEMPERATURE_DIKIRIM')
  const nama = Array.isArray(b.tools) && b.tools.length === 1 ? b.tools[0]?.function?.name : null
  if (!nama) g.push('TOOL_TIDAK_TUNGGAL')
  if (!(b.tool_choice?.type === 'function' && typeof b.tool_choice.function?.name === 'string' && b.tool_choice.function.name === nama)) g.push('TOOL_PAKSA_TIDAK_ADA')
  return g
}

/** Badan permintaan wajib lolos periksaBadanPermintaanEval4 + bentuk transport Eval-4 SEBELUM pagar slot/transport (0 biaya bila ditolak). */
export function pagarBadanEval4(berikut, keadaan) {
  return async (url, init) => {
    let b = {}
    try {
      b = JSON.parse(String(init?.body ?? '{}'))
    } catch {}
    const g = [...M.periksaBadanPermintaanEval4(b), ...periksaBentukTransportEval4(b)]
    if (g.length) {
      keadaan.ditolak.push({ alasan: 'BADAN_EVAL4_DITOLAK', detail: g })
      keadaan.berhenti = keadaan.berhenti ?? 'BADAN_EVAL4_DITOLAK'
      throw new Error('EVAL4_BADAN_EVAL4_DITOLAK')
    }
    return berikut(url, init)
  }
}

// ------------------------------------------------------------------ titik-simpan
/** Toko checkpoint berkas (tulis atomik: berkas sementara + rename). Jalur wajib di luar repo. */
export function buatTokoCheckpointBerkas(jalur) {
  return {
    jalur,
    ada: () => existsSync(jalur),
    baca() {
      return JSON.parse(readFileSync(jalur, 'utf8'))
    },
    tulis(obj) {
      const tmp = `${jalur}.tmp-${process.pid}`
      writeFileSync(tmp, JSON.stringify(obj, null, 2))
      renameSync(tmp, jalur)
    },
  }
}

/** Toko checkpoint memori (uji). `gagalTulisKe` = nomor tulis yang dibuat gagal (simulasi disk penuh). */
export function buatTokoCheckpointMemori(awal = null, { gagalTulisKe = null } = {}) {
  let isi = awal === null ? null : structuredClone(awal)
  let n = 0
  const riwayat = []
  return {
    jalur: 'memori',
    ada: () => isi !== null,
    baca: () => structuredClone(isi),
    tulis(obj) {
      n++
      if (gagalTulisKe === n) throw new Error('stub: tulis checkpoint gagal')
      isi = structuredClone(obj)
      riwayat.push(structuredClone(obj))
    },
    riwayat,
    isi: () => structuredClone(isi),
  }
}

/** Galat resume (kosong = boleh dilanjutkan). Lanjut hanya dari jeda/putus BERSIH di batas slot. */
export function periksaResume(cp, ikatan) {
  if (!cp || typeof cp !== 'object') return ['CHECKPOINT_TIDAK_TERBACA']
  const g = []
  if (cp.format !== FORMAT_CHECKPOINT) g.push('FORMAT_CHECKPOINT_BERBEDA')
  if (JSON.stringify(cp.ikatan) !== JSON.stringify(ikatan)) g.push('IKATAN_CHECKPOINT_BERBEDA')
  if (cp.inflight !== null && cp.inflight !== undefined) g.push(`SLOT_INFLIGHT:${cp.inflight}:PANGGILAN_MUNGKIN_TERKIRIM_TINJAUAN_OWNER`)
  if (cp.status === 'SELESAI') g.push('RUN_SUDAH_SELESAI')
  else if (cp.status !== 'DIJEDA' && cp.status !== 'BERJALAN') g.push(`STATUS_TIDAK_BISA_DILANJUTKAN:${cp.status}`)
  if (!Array.isArray(cp.slot) || cp.slot.some((s) => s?.status !== 'OK')) g.push('ADA_SLOT_GAGAL_ATAU_RUSAK')
  if ((cp.akuntansi?.ditolak ?? []).length) g.push('ADA_PENOLAKAN_PAGAR')
  if (!Array.isArray(cp.akuntansi?.panggilan) || cp.akuntansi.panggilan.length !== cp.akuntansi.total) g.push('AKUNTANSI_CHECKPOINT_TIDAK_KONSISTEN')
  return g
}

// ------------------------------------------------------------------ ringkasan slot (tersanitasi)
const flagUrut = (xs) => [...new Set(xs)].sort()
const ringkasLapisan = (L) =>
  !L
    ? null
    : {
        FATAL: L.jumlah.FATAL,
        MAJOR: L.jumlah.MAJOR,
        MINOR: L.jumlah.MINOR,
        fatal: L.fatal.map((f) => `${f.kode}${f.jenis ? `/${f.jenis}` : ''}@${f.jalur}`),
        f5Unsupported: L.fatal.filter((f) => f.kode === 'F5' && f.jenis === S3.JENIS_F5.UNSUPPORTED).length,
        karanganMuatan: L.muatan?.karangan?.length ?? 0,
        konflikGt: L.konflikGt?.length ?? 0,
        halusinasiKritis: L.halusinasiKritis,
        recall: L.recall,
      }

/** Ringkasan SATU slot tanpa isi dokumen / nilai string model (hanya enum, hitungan, flag, sidik). */
export function ringkasSlot({ slot, kasus, raw, post, nilai, P }) {
  const cargoPost = post?.proposal?.cargoes ?? []
  return {
    seq: slot.seq,
    blok: slot.blok,
    kasus: kasus.id,
    ulangan: slot.ulangan,
    model: slot.model,
    status: slot.status,
    sebab: slot.sebab ?? null,
    sumber: E2.sidikSumber(kasus.teks),
    klasifikasi: {
      harap: kasus.gt.classification.values,
      raw: typeof raw?.classification === 'string' ? raw.classification.slice(0, 40) : null,
      post: post?.classification ?? null,
      benarPost: !!post && kasus.gt.classification.values.includes(post.classification),
      bolehTautkanVoyagePost: post ? P.bolehTautkanVoyage(post.classification) : null,
    },
    penilai: nilai ? { versi: nilai.versiPenilai, integritasGt: nilai.integritasGt, RAW: ringkasLapisan(nilai.RAW), POST: ringkasLapisan(nilai.POST) } : null,
    muatan: post
      ? {
          raw: Array.isArray(raw?.cargoes) ? raw.cargoes.length : 0,
          post: cargoPost.length,
          dibuangValidator: post.proposal.cargoesDropped ?? 0,
          postTidakTepercaya: cargoPost.filter((c) => !P.cargoTepercaya(c)).length,
          flagsPost: flagUrut(cargoPost.flatMap((c) => c.flags ?? [])),
        }
      : null,
    panggilan: slot.panggilan.map((p) => ({ seq: p.seq, http: p.http ?? null, httpStatus: p.httpStatus ?? null, kategoriGalat: p.kategoriGalat ?? null, requestedModel: p.requestedModel ?? null, servedModel: p.servedModel ?? null, promptTokens: p.promptTokens ?? null, completionTokens: p.completionTokens ?? null, biayaUsd: p.biayaUsd ?? null, finishReason: p.finishReason ?? null, latencyMs: p.latencyMs ?? null })),
    perekam: slot.perekam,
  }
}

// ------------------------------------------------------------------ H20 & agregat
/** Hasil regresi muatan satu slot: LULUS bila POST tanpa F5 (tak ada muatan tak berbukti yang lolos validator). */
export function hasilRegresi(r) {
  if (!r) return { hasil: 'TIDAK_DIJALANKAN' }
  if (r.status !== 'OK' || !r.penilai) return { hasil: 'TIDAK_DINILAI', status: r.status }
  const f5Post = r.penilai.POST.fatal.filter((f) => f.startsWith('F5'))
  return {
    hasil: f5Post.length === 0 ? 'LULUS' : 'GAGAL',
    RAW: { fatal: r.penilai.RAW.fatal, f5Unsupported: r.penilai.RAW.f5Unsupported, karanganMuatan: r.penilai.RAW.karanganMuatan, cargo: r.muatan.raw },
    POST: { fatal: r.penilai.POST.fatal, f5Unsupported: r.penilai.POST.f5Unsupported, karanganMuatan: r.penilai.POST.karanganMuatan, cargo: r.muatan.post, flags: r.muatan.flagsPost, tidakTepercaya: r.muatan.postTidakTepercaya },
    karanganLolosPost: f5Post.length > 0,
    ditahanValidator: r.penilai.RAW.f5Unsupported > 0 && r.penilai.POST.f5Unsupported === 0,
    klasifikasiPost: r.klasifikasi.post,
    bolehTautkanVoyagePost: r.klasifikasi.bolehTautkanVoyagePost,
    integritasGt: r.penilai.integritasGt,
  }
}

function agregatBlok(ringkas) {
  const ok = ringkas.filter((r) => r.status === 'OK' && r.penilai)
  const jumlah = (f) => ok.reduce((a, r) => a + f(r), 0)
  return {
    slot: ringkas.length,
    ok: ok.length,
    klasifikasiBenarPost: jumlah((r) => (r.klasifikasi.benarPost ? 1 : 0)),
    kasusFatalPost: jumlah((r) => (r.penilai.POST.FATAL > 0 ? 1 : 0)),
    fatalRaw: jumlah((r) => r.penilai.RAW.FATAL),
    fatalPost: jumlah((r) => r.penilai.POST.FATAL),
    f5UnsupportedRaw: jumlah((r) => r.penilai.RAW.f5Unsupported),
    f5UnsupportedPost: jumlah((r) => r.penilai.POST.f5Unsupported),
    halusinasiKritisPost: jumlah((r) => r.penilai.POST.halusinasiKritis),
    recallPost: { benar: jumlah((r) => r.penilai.POST.recall.benar), total: jumlah((r) => r.penilai.POST.recall.total) },
    kasusInconclusiveGt: ok.filter((r) => r.penilai.integritasGt === S3.INCONCLUSIVE_GT).map((r) => r.kasus),
  }
}

// ------------------------------------------------------------------ inti
/**
 * Jalankan Eval-4. Mengembalikan laporan tersanitasi (tidak menulis laporan).
 *   offline → transport stub (bawaan: jawaban sempurna dari GT); TIDAK pernah fetch nyata.
 *   live    → fetch nyata (BELUM terbuka: kesiapanLiveEval4 menolak — lihat penghalangLiveEval4) ATAU `transportUji` (uji; label DRY_RUN).
 * `checkpoint` = toko (buatTokoCheckpointBerkas/Memori) atau null; `lanjut` = resume dari toko itu.
 */
export async function jalankanRunnerEval4({
  mode,
  env = process.env,
  hariIni = new Date(),
  log = () => {},
  jawabStub = null,
  opsiStub = {},
  transportUji = null,
  konfigUji,
  validasiUji = null,
  penilaiUji = null,
  bekuUji = null,
  checkpoint = null,
  lanjut = false,
  sinyalJeda = () => false,
  terlihatUji = null,
} = {}) {
  const tolak = (verdict, galat) => ({ label: LABEL_DRY, verdict, mode: mode ?? null, galat, panggilanNyata: 0, panggilanTransport: 0 })
  if (mode !== MODE.OFFLINE && mode !== MODE.LIVE) return tolak('DITOLAK_MODE', ['MODE_WAJIB_EKSPLISIT'])
  const pakaiSeam = !!(validasiUji || penilaiUji || bekuUji || terlihatUji || konfigUji !== undefined)
  if (mode === MODE.LIVE && !transportUji && pakaiSeam) return tolak('DITOLAK_PRASYARAT', ['SEAM_UJI_DILARANG_SAAT_JARINGAN'])

  // ── PREFLIGHT (urutan tetap; galat apa pun → 0 panggilan) ──
  const integritas = bekuUji ? bekuUji() : verifikasiBekuEval4()
  if (integritas.length) return tolak('DITOLAK_INTEGRITAS', integritas)
  const require = createRequire(import.meta.url)
  const jiti = require('jiti')(fileURLToPath(import.meta.url), { alias: { '@': join(AKAR, 'src') }, interopDefault: true })
  const muat = (rel) => jiti(join(AKAR, rel))
  const X = muat('src/lib/ai/vessel-call-extract.ts')
  const galatPrompt = verifikasiIkatanPromptV4(X.PROMPT_INTAKE_V4)
  if (X.PROMPT_INTAKE_V4.tool?.function?.name !== TOOL_PAKSA_EVAL4) galatPrompt.push('TOOL_PAKSA_BERBEDA')
  if (galatPrompt.length) return tolak('DITOLAK_IKATAN_PROMPT', galatPrompt)
  if (X.VERSI_PROMPT_INTAKE !== '3') return tolak('DITOLAK_IKATAN_PROMPT', ['PROMPT_PRODUKSI_BUKAN_V3'])
  let opsiIdentitas
  try {
    opsiIdentitas = M.opsiEkstraktorEval4()
  } catch (e) {
    return tolak('DITOLAK_IDENTITAS_MODEL', [String(e?.message ?? e)])
  }
  if (opsiIdentitas.modelWajib !== M.EXPECTED_MODEL_ID || opsiIdentitas.servedWajib !== M.EXPECTED_SERVED_MODEL_ID) return tolak('DITOLAK_IDENTITAS_MODEL', ['OPSI_IDENTITAS_BERBEDA'])

  const P = muat('src/services/intake/intake-policy.ts')
  const V = muat('src/lib/vessels.ts')
  const MC = muat('src/lib/ai/model-capabilities.ts')
  const NORM_VALIDASI = { imo: V.normalisasiImo, imoSah: V.imoCheckDigitSah, mmsi: V.normalisasiMmsi, mmsiSah: V.mmsiSah, callSign: V.normalisasiCallSign }
  const NORM_SKOR = { namaKapal: P.normalisasiNamaKapal, namaPort: P.normalisasiNamaPort, namaPihak: P.normalisasiNamaPihak, unlocode: P.normalisasiUnlocode, imo: V.normalisasiImo, mmsi: V.normalisasiMmsi, callSign: V.normalisasiCallSign }

  const konfig = konfigUji !== undefined ? konfigUji : KONFIG_OWNER_EVAL4
  if (mode === MODE.LIVE || konfig !== null) {
    const galatKonfig = periksaKonfigOwner(konfig, { terlihat: terlihatUji ?? kasusTerlihat(hariIni) })
    if (galatKonfig.length) return tolak('DITOLAK_KONFIG_OWNER', galatKonfig)
  }
  const petaRg = new Map(RG.KASUS_REGRESI_MUATAN.map((k) => [k.id, k]))
  const tambahNormal = (k) => ({ ...k, teksNormal: P.normalisasiTeksSumber(k.teks) })
  const regresi = H.bekukanDalam(URUTAN_REGRESI.map((id) => tambahNormal(petaRg.get(id))))
  const heldout = H.bekukanDalam((konfig?.paket?.kasus ?? []).map(tambahNormal))
  const kasus = [...regresi, ...heldout]
  const galatKasus = []
  for (const k of kasus) for (const m of E2.masalahKasusPenilai(k)) galatKasus.push(`${k.id}:${m}`)
  const kons = G.periksaKonsistensiGtSumber(regresi)
  if (!kons.lulus) galatKasus.push(...kons.gagal.map((t) => `${t.kasus}:GT_TIDAK_KONSISTEN_${t.aturan}`))
  if (galatKasus.length) return tolak('DITOLAK_KASUS', galatKasus)
  const petaKasus = new Map(kasus.map((k) => [k.id, k]))

  const rencana = susunRencanaEval4({ regresi, heldout, ulangan: konfig?.ulangan ?? 1 })
  const batas = konfig?.batas ?? BATAS_LURING_STUB
  const plafonUsd = konfig?.plafonPerPanggilanUsd ?? PLAFON_LURING_STUB_USD
  const galatBatas = periksaBatasEval4(batas)
  if (galatBatas.length) return tolak('DITOLAK_BATAS', galatBatas)
  if (rencana.length > batas.maksPanggilan) return tolak('DITOLAK_BATAS', ['RENCANA_MELEBIHI_BATAS_PANGGILAN'])
  const pra = periksaPrasyaratEval4(env, mode)
  if (pra.length) return tolak('DITOLAK_PRASYARAT', pra)

  let transport
  let fetchTransport
  if (mode === MODE.OFFLINE) {
    if (transportUji) return tolak('DITOLAK_PRASYARAT', ['MODE_OFFLINE_TIDAK_MENERIMA_TRANSPORT'])
    transport = TRANSPORT.STUB
  } else {
    if (jawabStub) return tolak('DITOLAK_PRASYARAT', ['MODE_LIVE_TIDAK_MENERIMA_STUB'])
    transport = typeof transportUji === 'function' ? TRANSPORT.TEST_DOUBLE : TRANSPORT.NETWORK
    fetchTransport = transportUji ?? globalThis.fetch
  }
  if (transport === TRANSPORT.NETWORK) {
    const siap = M.kesiapanLiveEval4({ otorisasiOwnerLive: env.SPIKE_AUTHORIZED === FRASA_OTORISASI_EVAL4, dilayani: M.EXPECTED_SERVED_MODEL_ID, konfigOwner: konfig, galatKonfig: periksaKonfigOwner(konfig, { terlihat: kasusTerlihat(hariIni) }), buktiTransport: BUKTI_TRANSPORT_S5_EVAL4, harapanTransport: harapanTransportEval4() })
    if (!siap.siap) return tolak('DITOLAK_KESIAPAN_LIVE', siap.alasan)
    if (!checkpoint) return tolak('DITOLAK_PRASYARAT', ['CHECKPOINT_WAJIB_UNTUK_JARINGAN'])
  }
  const label = transport === TRANSPORT.NETWORK ? LABEL_LIVE : LABEL_DRY
  const hariIso = new Date(hariIni).toISOString().slice(0, 10)
  if (transport === TRANSPORT.STUB) fetchTransport = R2.buatPenyediaStubEval2(kasus, jawabStub ?? ((k) => R3.jawabanSempurnaEval3(k)), opsiStub).fn

  // ── Titik-simpan: ikatan & resume ──
  const ikatan = {
    format: FORMAT_CHECKPOINT,
    runner: VERSI_RUNNER_EVAL4,
    mode,
    transport,
    modelDiminta: M.EXPECTED_MODEL_ID,
    modelDilayani: M.EXPECTED_SERVED_MODEL_ID,
    prompt: IKATAN_PROMPT_V4,
    penilai: S3.VERSI_PENILAI_V2,
    regresi: RG.VERSI_REGRESI_MUATAN,
    shaBeku: SHA_BEKU_EVAL4,
    paket: konfig ? { versi: konfig.paket.versi, hashGt: konfig.paket.hashGt } : null,
    ulangan: konfig?.ulangan ?? 1,
    batas,
    plafonUsd,
    sidikRencana: sidikRencana(rencana),
    bentukTransport: BENTUK_TRANSPORT_EVAL4,
    profilTransport: PROFIL_TRANSPORT_EVAL4,
  }
  let cp = null
  if (lanjut) {
    if (!checkpoint?.ada()) return tolak('DITOLAK_RESUME', ['CHECKPOINT_TIDAK_ADA'])
    try {
      cp = checkpoint.baca()
    } catch {
      return tolak('DITOLAK_RESUME', ['CHECKPOINT_TIDAK_TERBACA'])
    }
    const gr = periksaResume(cp, ikatan)
    if (gr.length) return tolak('DITOLAK_RESUME', gr)
  } else if (checkpoint?.ada()) return tolak('DITOLAK_PRASYARAT', ['CHECKPOINT_SUDAH_ADA_PAKAI_RESUME_ATAU_JALUR_BARU'])

  const pindai = (t) => {
    const temuan = R3.pindaiLaporanEval3(t, { kunci: env.SPIKE_OPENROUTER_API_KEY, kasus })
    if (t.includes(FRASA_OTORISASI_EVAL4)) temuan.push('FRASA_OTORISASI')
    return [...new Set(temuan)]
  }
  const snapshot = Object.fromEntries(ENV_DIKELOLA.map((n) => [n, process.env[n]]))
  const fetchSebelum = globalThis.fetch
  let jaringanTerblokir = 0
  const { jalur, keadaan, slotAktif } = R3.rakitJalurPenyedia(fetchTransport, batas, { plafonUsd })
  const jalurEval4 = pagarBadanEval4(jalur, keadaan)
  const selesaiSebelumnya = new Map()
  if (cp) {
    // Akumulasi run lintas-resume: batas panggilan/biaya/token berlaku untuk SELURUH run, bukan per sesi.
    keadaan.total = cp.akuntansi.total
    keadaan.biaya = cp.akuntansi.biaya
    keadaan.token = { ...cp.akuntansi.token }
    keadaan.panggilan.push(...cp.akuntansi.panggilan)
    for (const s of cp.slot) selesaiSebelumnya.set(s.seq, s)
  }
  const ringkas = []
  let dijeda = false
  let galatFatal = null
  const simpan = (status, inflight) => {
    if (!checkpoint) return
    // Slot sesi terdahulu SELALU ikut (tak pernah hilang saat sesi lanjutan menulis ulang checkpoint).
    const gabungan = new Map([...selesaiSebelumnya].map(([seq, s]) => [seq, s]))
    for (const r of ringkas) if (!r.dariCheckpoint) gabungan.set(r.seq, r)
    const obj = {
      format: FORMAT_CHECKPOINT,
      ikatan,
      status,
      inflight,
      diperbarui: new Date().toISOString(),
      sesi: (cp?.sesi ?? 0) + 1,
      slot: [...gabungan.values()].sort((a, b) => a.seq - b.seq).filter((r) => r.status === 'OK' || status !== 'DIJEDA'),
      akuntansi: { total: keadaan.total, biaya: keadaan.biaya, token: { ...keadaan.token }, panggilan: keadaan.panggilan, ditolak: keadaan.ditolak },
    }
    const temuan = pindai(JSON.stringify(obj))
    if (temuan.length) throw new Error(`EVAL4_CHECKPOINT_DITAHAN_PRIVASI:${temuan.join('+')}`)
    checkpoint.tulis(obj)
  }
  const berhentiKeras = () => !!keadaan.berhenti || keadaan.ditolak.some((d) => STOP_ALASAN.includes(d.alasan))
  const validasiAsli = validasiUji ?? P.validasiEkstraksi
  const validasi = (raw, k) => validasiAsli(raw, { inputKind: 'TEXT', sourceText: k.teksNormal, hariIni: hariIso, norm: NORM_VALIDASI })
  const penilai = penilaiUji ?? S3.nilaiKasusV2
  try {
    globalThis.fetch = (url, init) => {
      if (String(url) !== H.URL_OPENROUTER) {
        jaringanTerblokir++
        return Promise.reject(new Error('EVAL4_JARINGAN_DIBLOKIR'))
      }
      return jalurEval4(url, init)
    }
    process.env.OPENROUTER_API_KEY = transport === TRANSPORT.STUB ? KUNCI_STUB : env.SPIKE_OPENROUTER_API_KEY
    delete process.env.TAH_INTAKE_MODEL
    const PR = muat('src/lib/ai/perekam-panggilan.ts')
    const ekstraktor = X.buatEkstraktorOpenRouter(X.PROMPT_INTAKE_V4, opsiIdentitas)
    const ekstrak = (k, catat) => PR.jalankanDenganKonteks({ model: M.EXPECTED_MODEL_ID, kemampuan: PROFIL_TRANSPORT_EVAL4, catat }, () => X.ekstrakDenganBatasWaktu(ekstraktor, { kind: 'TEXT', text: k.teksNormal }, BATAS_WAKTU_MS))
    simpan('BERJALAN', null)

    for (const r of rencana) {
      const k = petaKasus.get(r.kasus)
      if (selesaiSebelumnya.has(r.seq)) {
        ringkas.push({ ...selesaiSebelumnya.get(r.seq), dariCheckpoint: true })
        continue
      }
      const slot = { seq: r.seq, blok: r.blok, ulangan: r.ulangan, model: r.model, status: null, panggilan: [], perekam: [] }
      if (dijeda || berhentiKeras()) {
        slot.status = 'TIDAK_DIJALANKAN'
        slot.sebab = dijeda ? 'DIJEDA' : keadaan.berhenti ?? 'BATAS'
        ringkas.push(ringkasSlot({ slot, kasus: k, raw: null, post: null, nilai: null, P }))
        continue
      }
      if (sinyalJeda()) {
        dijeda = true
        slot.status = 'TIDAK_DIJALANKAN'
        slot.sebab = 'DIJEDA'
        ringkas.push(ringkasSlot({ slot, kasus: k, raw: null, post: null, nilai: null, P }))
        continue
      }
      simpan('BERJALAN', r.seq)
      const idx = keadaan.panggilan.length
      const idxDitolak = keadaan.ditolak.length
      slotAktif.model = r.model
      slotAktif.percobaan = 0
      let raw = null
      let post = null
      let nilai = null
      let galatEkstrak = null
      try {
        raw = await ekstrak(k, (m) => slot.perekam.push({ status: m.status, errorCode: m.errorCode, requestedModel: m.requestedModel, servedModel: m.servedModel, providerRequestId: m.providerRequestId, promptVersion: m.promptVersion, schemaVersion: m.schemaVersion, promptHashCocok: m.promptHash === IKATAN_PROMPT_V4.hashPrompt }))
      } catch (e) {
        galatEkstrak = typeof e?.kode === 'string' ? e.kode : 'ERROR'
      } finally {
        slotAktif.model = null
      }
      slot.panggilan = keadaan.panggilan.slice(idx)
      const ditolakSlot = keadaan.ditolak.slice(idxDitolak)
      const infra = slot.panggilan.find((p) => p.http !== 'SUKSES')
      const berhenti = (sebab) => {
        keadaan.berhenti = keadaan.berhenti ?? sebab
      }
      if (ditolakSlot.length) {
        slot.status = TOLAK_SLOT.includes(ditolakSlot[0].alasan) ? `GAGAL:${ditolakSlot[0].alasan}` : `DIHENTIKAN:${ditolakSlot[0].alasan}`
        berhenti(ditolakSlot[0].alasan)
      } else if (slot.panggilan.length === 0) {
        slot.status = `GAGAL:TANPA_PANGGILAN_PENYEDIA:${galatEkstrak ?? 'ERROR'}`
        berhenti('TANPA_PANGGILAN_PENYEDIA')
      } else if (slot.panggilan.length > 1) {
        slot.status = 'GAGAL:PERCOBAAN_ULANG'
        berhenti('PERCOBAAN_ULANG')
      } else if (infra) {
        slot.status = `GAGAL:TRANSPORT_${infra.http}${infra.httpStatus ? `_${infra.httpStatus}` : ''}`
        berhenti('GAGAL_TRANSPORT')
      } else if (slot.panggilan.some((p) => !p.servedModel)) {
        slot.status = `GAGAL:${M.INCONCLUSIVE_MODEL_IDENTITY}:SERVED_TIDAK_DILAPORKAN`
        berhenti('SERVED_MODEL_TIDAK_DILAPORKAN')
      } else if (slot.panggilan.some((p) => !M.periksaIdentitasModel({ diminta: p.requestedModel, dilayani: p.servedModel }).ok)) {
        const alasan = slot.panggilan.map((p) => M.periksaIdentitasModel({ diminta: p.requestedModel, dilayani: p.servedModel })).find((x) => !x.ok).alasan
        slot.status = `GAGAL:${M.INCONCLUSIVE_MODEL_IDENTITY}:${alasan}`
        berhenti('SERVED_MODEL_BERBEDA')
      } else if (keadaan.berhenti) slot.status = `GAGAL:${keadaan.berhenti}`
      else if (galatEkstrak) {
        slot.status = `GAGAL:${galatEkstrak}`
        berhenti(`EKSTRAKSI_${galatEkstrak}`)
      }
      if (!slot.status && slot.perekam.some((m) => m.status !== 'OK' || !m.promptHashCocok || m.promptVersion !== '4')) {
        slot.status = 'GAGAL:PEREKAM_TIDAK_KONSISTEN'
        berhenti('PEREKAM_TIDAK_KONSISTEN')
      }
      if (slot.status) raw = null
      if (!slot.status) {
        const masalah = S.masalahArgumen(raw)
        if (masalah.length) {
          slot.status = `GAGAL:ARGUMEN_TIDAK_SAH:${masalah.join('+')}`
          berhenti('ARGUMEN_TIDAK_SAH')
          raw = null
        }
      }
      // POST: validator produksi atas KLON RAW (RAW tak pernah ditimpa).
      if (!slot.status) {
        try {
          post = validasi(structuredClone(raw), k)
        } catch {
          slot.status = 'GAGAL:VALIDATOR_ERROR'
          berhenti('VALIDATOR_ERROR')
        }
      }
      if (!slot.status) {
        try {
          nilai = penilai(k, raw, post, NORM_SKOR)
          if (nilai.ekstraktorGagal) {
            slot.status = `GAGAL:${(nilai.argumenTidakSah ?? []).join('+') || 'EKSTRAKTOR_GAGAL'}`
            berhenti('EKSTRAKTOR_GAGAL')
            nilai = null
          } else slot.status = 'OK'
        } catch {
          slot.status = 'GAGAL:PENILAI_ERROR'
          berhenti('PENILAI_ERROR')
          nilai = null
        }
      }
      const rk = ringkasSlot({ slot, kasus: k, raw, post, nilai, P })
      ringkas.push(rk)
      simpan(slot.status === 'OK' ? 'BERJALAN' : 'BERHENTI', null)
      log(`  ${String(r.seq).padStart(3)} ${r.blok.padEnd(20)} ${r.kasus} u${r.ulangan} → ${slot.status}; FATAL RAW/POST=${rk.penilai?.RAW.FATAL ?? '-'}/${rk.penilai?.POST.FATAL ?? '-'}`)
    }
    const semuaOk = ringkas.length === rencana.length && ringkas.every((r) => r.status === 'OK')
    simpan(semuaOk ? 'SELESAI' : dijeda && !keadaan.berhenti ? 'DIJEDA' : 'BERHENTI', null)
  } catch (e) {
    galatFatal = e?.message?.startsWith('EVAL4_') ? e.message.split(':')[0] : `${e?.name ?? 'Error'}`
  } finally {
    globalThis.fetch = fetchSebelum
    for (const n of ENV_DIKELOLA) {
      if (snapshot[n] === undefined) delete process.env[n]
      else process.env[n] = snapshot[n]
    }
  }

  // ── Agregat, H20, putusan & laporan (HANYA ringkasan tersanitasi; RAW/POST tak pernah ditulis) ──
  const perSeq = new Map(ringkas.map((r) => [r.seq, r]))
  const regresiHasil = Object.fromEntries(rencana.filter((r) => r.blok === BLOK_REGRESI).map((r) => [r.kasus, { seq: r.seq, ...hasilRegresi(perSeq.get(r.seq)) }]))
  const h20 = { kasus: KASUS_H20, asal: 'Eval-3 H20 (regresi, bukan held-out)', kriteria: 'LULUS = POST tanpa F5 (tak ada muatan tak berbukti yang lolos validator); RAW ditampilkan terpisah', ...regresiHasil[KASUS_H20] }
  const blokRegresi = ringkas.filter((r) => r.blok === BLOK_REGRESI)
  const blokHeldout = ringkas.filter((r) => r.blok === BLOK_HELDOUT)
  const regresiGagal = Object.values(regresiHasil).some((x) => x.hasil === 'GAGAL')
  const regresiLengkap = Object.values(regresiHasil).every((x) => x.hasil === 'LULUS' || x.hasil === 'GAGAL')
  const integritasGt = S3.integritasGtRun(ringkas.filter((r) => r.penilai).map((r) => ({ id: r.kasus, integritasGt: r.penilai.integritasGt })))
  const lengkap = !galatFatal && ringkas.length === rencana.length && ringkas.every((r) => r.status === 'OK')
  const pelanggaranPagar = keadaan.ditolak.filter((d) => ['HOST_TIDAK_DIIZINKAN', 'MODEL_TIDAK_DIIZINKAN', ...TOLAK_SLOT].includes(d.alasan)).map((d) => d.alasan)
  if (jaringanTerblokir) pelanggaranPagar.push('PERCOBAAN_JARINGAN_LAIN')
  const verdict = galatFatal
    ? 'GAGAL_RUNNER'
    : regresiGagal
      ? 'GAGAL_REGRESI_MUATAN'
      : dijeda && !keadaan.berhenti
        ? 'DIJEDA'
        : !lengkap || !regresiLengkap
          ? 'INCONCLUSIVE_BERHENTI'
          : integritasGt.status === S3.INCONCLUSIVE_GT
            ? S3.INCONCLUSIVE_GT
            : heldout.length === 0
              ? 'REGRESI_SAJA_TANPA_HELDOUT'
              : 'MENUNGGU_GERBANG_OWNER'
  const laporan = {
    label,
    evaluasi: 'PRD-005 Eval-4 (Sonnet 5 saja, Prompt v4 kandidat)',
    runner: VERSI_RUNNER_EVAL4,
    penilai: S3.VERSI_PENILAI_V2,
    pemeriksaGt: G.VERSI_PEMERIKSA_GT,
    regresi: RG.VERSI_REGRESI_MUATAN,
    shaBeku: SHA_BEKU_EVAL4,
    ikatanPrompt: IKATAN_PROMPT_V4,
    bentukTransport: (() => {
      const g = M.periksaBuktiTransport(BUKTI_TRANSPORT_S5_EVAL4, harapanTransportEval4())
      return { ...BENTUK_TRANSPORT_EVAL4, sidik: sidikBentukTransportEval4(), buktiKapabilitas: g.length ? `TIDAK_BERLAKU:${g.join('+')}` : `TERBUKTI:${BUKTI_TRANSPORT_S5_EVAL4.providerRequestId}` }
    })(),
    identitasModel: { diminta: M.EXPECTED_MODEL_ID, dilayaniWajib: M.EXPECTED_SERVED_MODEL_ID, cakupanBukti: 'OpenRouter saja; ID model internal upstream tidak diverifikasi mandiri' },
    registri: { statusSonnet5: MC.cariEntriModel(M.EXPECTED_MODEL_ID)?.status ?? null, gerbangProduksiTertutup: MC.resolusiModelIntake({ TAH_INTAKE_MODEL: M.EXPECTED_MODEL_ID }).aktif === false },
    paketHeldout: konfig ? { versi: konfig.paket.versi, hashGt: konfig.paket.hashGt, kasus: heldout.length } : null,
    mode,
    transport,
    tanggalEksekusi: hariIso,
    catatanModel: 'anthropic/claude-sonnet-5 TETAP PENDING_SPIKE — laporan ini bukan aktivasi/promosi; Prompt v4 tetap kandidat.',
    panggilanNyata: transport === TRANSPORT.NETWORK ? keadaan.total : 0,
    panggilanTransport: keadaan.total,
    kunciTerpakai: transport === TRANSPORT.STUB ? 'stub' : 'SPIKE_OPENROUTER_API_KEY (nilai tidak dicatat)',
    rencana: { direncanakan: rencana.length, regresi: rencana.filter((r) => r.blok === BLOK_REGRESI).length, heldout: rencana.filter((r) => r.blok === BLOK_HELDOUT).length, ulangan: konfig?.ulangan ?? 1, sidik: ikatan.sidikRencana },
    batas,
    plafonPerPanggilanUsd: plafonUsd,
    sumberBatas: konfig ? 'KONFIG_OWNER' : 'BATAS_LURING_STUB',
    akuntansi: R3.ringkasAkuntansi(keadaan, ringkas),
    checkpoint: checkpoint ? { jalur: checkpoint.jalur === 'memori' ? 'memori' : '[di luar repo]', dilanjutkan: !!cp, sesi: (cp?.sesi ?? 0) + 1, slotDariCheckpoint: ringkas.filter((r) => r.dariCheckpoint).length } : null,
    berhenti: keadaan.berhenti,
    dijeda,
    ditolakPencegat: keadaan.ditolak,
    jaringanTerblokir,
    operasional: { lengkap, pelanggaranPagar, tanpaUlang: !ringkas.some((r) => (r.panggilan?.length ?? 0) > 1) && !keadaan.ditolak.some((d) => d.alasan === 'PERCOBAAN_ULANG') },
    verdict,
    h20,
    regresiMuatan: regresiHasil,
    integritasGt,
    agregat: { [BLOK_REGRESI]: agregatBlok(blokRegresi), [BLOK_HELDOUT]: agregatBlok(blokHeldout) },
    gerbang: { status: 'BELUM_DITETAPKAN_OWNER', catatan: 'Ambang lulus/gagal Eval-4 belum ditetapkan; runner tak pernah memberi PASS.' },
    galat: [galatFatal].filter(Boolean),
    slot: ringkas,
  }
  const temuan = pindai(JSON.stringify(laporan))
  laporan.privasi = { temuan, lulus: temuan.length === 0 }
  if (!bekuUji && verifikasiBekuEval4().length) {
    laporan.integritasAkhir = 'BERUBAH_SELAMA_RUN'
    laporan.verdict = 'DITOLAK_INTEGRITAS'
  }
  return laporan
}

/** Tulis laporan HANYA bila pemindai privasi lulus (jalur di luar repo). */
export function tulisLaporanAman(jalur, laporan) {
  const g = R1.periksaJalurLaporan(jalur)
  if (g.length) throw new Error(`EVAL4_${g[0]}`)
  if (!laporan?.privasi?.lulus) return { jalur: H.tulisLaporan(jalur, { label: laporan?.label ?? LABEL_DRY, verdict: 'LAPORAN_DITAHAN_PRIVASI', temuan: laporan?.privasi?.temuan ?? ['TIDAK_DIPINDAI'] }), ditahan: true }
  return { jalur: H.tulisLaporan(jalur, laporan), ditahan: false }
}

// ------------------------------------------------------------------ CLI
/** Urai argv Eval-4: argumen Eval-1 (--mode, --report) + --checkpoint <jalur> + --resume. */
export function uraiArgumenEval4(argv = []) {
  const sisa = []
  const galat = []
  let checkpoint = null
  let resume = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--resume') resume = true
    else if (a === '--checkpoint' || a.startsWith('--checkpoint=')) {
      const v = a.includes('=') ? a.slice(a.indexOf('=') + 1) : argv[++i]
      if (!v || v.startsWith('--')) galat.push('CHECKPOINT_TANPA_NILAI')
      else checkpoint = v
    } else sisa.push(a)
  }
  const dasar = R1.uraiArgumen(sisa)
  galat.push(...dasar.galat)
  if (resume && !checkpoint) galat.push('RESUME_BUTUH_CHECKPOINT')
  if (checkpoint) {
    const gj = R1.periksaJalurLaporan(checkpoint).map((x) => x.replace(/^REPORT/, 'CHECKPOINT'))
    galat.push(...gj)
    if (!gj.length && dasar.laporan && resolve(dasar.laporan) === resolve(checkpoint)) galat.push('CHECKPOINT_SAMA_DENGAN_REPORT')
  }
  return { ...dasar, checkpoint, resume, galat }
}

export async function cli(argv = process.argv.slice(2), env = process.env, cetak = console.log) {
  if (argv.length === 0) {
    const integritas = verifikasiBekuEval4()
    const rencana = susunRencanaEval4({ regresi: URUTAN_REGRESI.map((id) => ({ id })) })
    cetak('PRD-005 Eval-4 runner. Tidak ada mode bawaan; tidak ada panggilan. Mode live BELUM diotorisasi.')
    cetak(`integritas beku  : ${integritas.length ? 'GAGAL ' + integritas.join(',') : 'OK'}`)
    cetak(`konfigurasi owner: ${KONFIG_OWNER_EVAL4 === null ? 'BELUM DITETAPKAN (paket held-out, ulangan, batas, plafon)' : 'ADA'}`)
    cetak(`penghalang LIVE  : ${penghalangLiveEval4().join(', ')}`)
    cetak(`rencana luring   : ${rencana.length} slot regresi (${URUTAN_REGRESI.join(', ')}); held-out 0`)
    cetak('pakai            : --mode offline|live --report <jalur absolut di luar repo> [--checkpoint <jalur> [--resume]]')
    return 2
  }
  const a = uraiArgumenEval4(argv)
  const galat = [...a.galat, ...(a.laporan !== null ? R1.periksaJalurLaporan(a.laporan) : [])]
  if (!a.galat.length && a.mode) galat.push(...periksaPrasyaratEval4(env, a.mode))
  if (galat.length) {
    cetak(`DITOLAK (0 panggilan): ${galat.join(' | ')}`)
    return 3
  }
  let jeda = false
  const onSigint = () => {
    jeda = true
    cetak('SIGINT: jeda di batas slot berikutnya (slot yang sedang berjalan diselesaikan dulu).')
  }
  process.on('SIGINT', onSigint)
  try {
    cetak(`Eval-4 runner — mode ${a.mode.toUpperCase()} — ${a.mode === MODE.LIVE ? LABEL_LIVE + ' (panggilan penyedia NYATA)' : LABEL_DRY}`)
    const laporan = await jalankanRunnerEval4({ mode: a.mode, env, log: cetak, checkpoint: a.checkpoint ? buatTokoCheckpointBerkas(resolve(a.checkpoint)) : null, lanjut: a.resume, sinyalJeda: () => jeda })
    if (String(laporan.verdict).startsWith('DITOLAK')) {
      cetak(`DITOLAK (0 panggilan): ${laporan.galat?.join(' | ')}`)
      return 3
    }
    const { jalur, ditahan } = tulisLaporanAman(a.laporan, laporan)
    cetak(`label=${laporan.label} transport=${laporan.transport} panggilanNyata=${laporan.panggilanNyata} panggilanTransport=${laporan.panggilanTransport} biaya=US$${laporan.akuntansi.biayaUsd}`)
    cetak(`verdict=${laporan.verdict} H20=${laporan.h20.hasil} privasi=${laporan.privasi.lulus ? 'LULUS' : 'GAGAL'}`)
    cetak(`laporan${ditahan ? ' DITAHAN (privasi)' : ''}: ${jalur}`)
    return ditahan ? 4 : 0
  } finally {
    process.off('SIGINT', onSigint)
  }
}

const diCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (diCli) process.exit(await cli())
