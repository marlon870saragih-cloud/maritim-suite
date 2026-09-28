// PRD-005 Eval-5 — SIDIK KANDIDAT BEKU (Step A). Modul MURNI data + pemeriksa (tanpa jaringan, tanpa DB).
//
// Kandidat Eval-5 = jalur PRODUKSI intake TEXT pasca-promosi, persis seperti di commit dasar:
//   submitIntake → jalankanEkstraksi(ledger, 'TEXT') → ruteModelIntakeUntukInput → ekstrakIntakeProduksi
//   → buatEkstraktorOpenRouter(Prompt v4, modelWajib = servedWajib = Sonnet 5) → validasiEkstraksi
// dengan TAH_INTAKE_MODEL=anthropic/claude-sonnet-5. Semua berkas yang menentukan perilaku itu dibekukan
// sha256-nya di sini. Satu saja berbeda → preflight Eval-5 menolak dengan 0 panggilan; berubah SELAMA run →
// run BERHENTI sebelum panggilan berikutnya.

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = fileURLToPath(new URL('..', import.meta.url))
const sha256 = (x) => createHash('sha256').update(x).digest('hex')

/** Commit tempat kandidat dibekukan (dokumentasi; penegakan = SHA berkas di bawah). */
export const COMMIT_DASAR_KANDIDAT = 'a67baf4be908b3aec2b9469d5f0b402ff531f72e'
/** Commit yang dievaluasi Eval-4 (prompt/validator/leksikon identik; perekat rute produksi BARU sesudahnya). */
export const COMMIT_EVAL4 = 'ddb9632c4127af781d1b0807030f5ebaa43f1336'

export const MODEL_KANDIDAT = 'anthropic/claude-sonnet-5'
export const JENIS_INPUT_KANDIDAT = 'TEXT'

/** Berkas kandidat (perilaku jalur produksi TEXT) — sha256 isi berkas. */
export const SHA_KANDIDAT_EVAL5 = Object.freeze({
  // inti (diminta owner)
  'src/lib/ai/vessel-call-extract.ts': '441349587e36407d8d0bf14bd4a9178edc4ad2d0b5b29bf5c2da45797337fd0a',
  'src/services/intake/intake-policy.ts': '4f5b1273d9a01ceee308f201a40a7594ce6fabc2220cacc0657f139f50f2059c',
  'src/lib/maritim-lexicon.ts': '864e4e3bf4cb47ef6e1d112ad42b5c9efd9d402c459e2d8be465f0bbab41fb83',
  'src/lib/ai/model-capabilities.ts': '99da39fb121e18f00e05c15c6e8979432686305c7aeb16732857e04b4382c9cc',
  'src/lib/ai/openrouter.ts': 'fbef6e842ea8fcd71d802f69d4e3bd6f559f4820c9cac96f48ffdc6dffea1f41',
  'src/lib/ai/perekam-panggilan.ts': '76718f4c8c7ee723ae77152ef725519a1c8bb8c4928f0d512fa76588c8863e35',
  'src/services/intake/intake-ledger.ts': '9e67930728a9263e92c70d2fa19e44bc7bc18542b265b2a25ab16fc5ec821eef',
  'src/services/intake/intake.service.ts': 'cdfed782c66e83b175ab64d35e15c07ab2bb9ce225078de1fef24c6c71792976',
  // pendukung jalur yang sama (gerbang, hash masukan, normalisasi identitas, tanggal bisnis, buku besar TAH)
  'src/services/intake/intake-access.ts': '3a77670a2c8d58487cf681efa6c4c46bbf8a47d60f99d1288f5a3dbff0189ce0',
  'src/services/intake/intake-gate.ts': '98521d074c3aa0043ea4ce3c4c6e107313e96e5f82e4fd3ecd2a0a61b5255d9d',
  'src/services/intake/intake-hash.ts': '862d3e086c24f578bdd4a07a70664de6fff96d6831e289dcb1d5ccd69e4525d3',
  'src/lib/vessels.ts': '57afea8c9230fca4bc787c3d95243687efa96be36c7af5adb09cbcf53d1ac0f3',
  'src/lib/business-time.ts': 'd468feb621729267a82a37ea920b890a69fbbf23440e2c50f723b34841cc80eb',
  'src/services/tah/agent-run.service.ts': '902f8439f743e3271a3c9795d514bcce8460e5d839ebc8cd9b89265f7d029d4a',
  'src/services/tah/tah-policy.ts': '67a078e8066b7685a87f1b526402c74f58d3f3d6aaed16542516d7986ca7ff70',
  'src/services/tah/ringkasan-intake.ts': 'c0092a49d96237a9fbac22f59320ee4de44b922e8cb7af2bbfd227d7459c0b79',
})

/** Identitas Prompt v4 (hash sistem + skema tool) — sama dengan ikatan registri & Eval-4. */
export const IKATAN_PROMPT_V4 = Object.freeze({ id: 'vessel-call-extract', versi: '4', versiSkema: '4', hash: '6ed1edba38780badcff111e70f63e83d95668f15b99644f174bac1984ce65959', tool: 'isi_intake_kunjungan' })
/** Prompt legacy yang WAJIB tetap dipakai jalur di luar cakupan (bukti rute tidak tertukar). */
export const IKATAN_PROMPT_V3 = Object.freeze({ versi: '3', hash: '8e326ac496821be87d5bdf85f0eec8e46ac817a80062a4e0d1b46c3839e67eea' })

/** Harapan registri/rute untuk TAH_INTAKE_MODEL=Sonnet 5 (dihitung ulang dari kode saat preflight). */
export const HARAPAN_RUTE_TEXT = Object.freeze({
  aktif: true,
  rute: 'EXPLICIT',
  model: MODEL_KANDIDAT,
  kemampuan: Object.freeze({ acceptsTemperature: false, supportsForcedToolChoice: true, supportsPdfNative: false }),
  promptIntake: Object.freeze({ versi: '4', hash: IKATAN_PROMPT_V4.hash }),
})
export const HARAPAN_ENTRI_REGISTRI = Object.freeze({ slug: MODEL_KANDIDAT, status: 'VERIFIED', dasar: 'SPIKE', cakupanInput: Object.freeze(['TEXT']) })

/** Bentuk transport yang DIHARAPKAN dari jalur produksi (diperiksa pada SETIAP badan permintaan). */
export const BENTUK_TRANSPORT_EVAL5 = Object.freeze({ model: MODEL_KANDIDAT, temperature: 'TIDAK_DIKIRIM', tool: IKATAN_PROMPT_V4.tool, toolChoice: 'FUNCTION_PAKSA', fallback: 'TIDAK_ADA', servedWajib: MODEL_KANDIDAT })

/** Sidik gabungan kandidat (urutan kunci tetap) — dipakai laporan & checkpoint. */
export function sidikKandidat(sha = SHA_KANDIDAT_EVAL5) {
  const urut = Object.keys(sha).sort().map((k) => [k, sha[k]])
  return sha256(JSON.stringify({ berkas: urut, prompt: IKATAN_PROMPT_V4, rute: HARAPAN_RUTE_TEXT, transport: BENTUK_TRANSPORT_EVAL5 }))
}

/** Galat pembekuan kandidat (kosong = identik). `baca` bisa disuntik uji. */
export function verifikasiKandidat({ baca = (rel) => readFileSync(join(AKAR, rel)), sha = SHA_KANDIDAT_EVAL5 } = {}) {
  const galat = []
  for (const [rel, h] of Object.entries(sha)) {
    let isi
    try {
      isi = baca(rel)
    } catch {
      galat.push(`KANDIDAT_TIDAK_TERBACA:${rel}`)
      continue
    }
    if (sha256(isi) !== h) galat.push(`KANDIDAT_BERUBAH:${rel}`)
  }
  return galat
}

/** Galat identitas prompt/rute yang dimuat dari kode (X = vessel-call-extract, MC = model-capabilities). */
export function verifikasiIdentitasRute({ X, MC }) {
  const g = []
  const v4 = X?.PROMPT_INTAKE_V4
  if (!v4 || v4.id !== IKATAN_PROMPT_V4.id || v4.versi !== IKATAN_PROMPT_V4.versi || v4.versiSkema !== IKATAN_PROMPT_V4.versiSkema || v4.hash !== IKATAN_PROMPT_V4.hash) g.push('PROMPT_V4_BERBEDA')
  if (v4?.tool?.function?.name !== IKATAN_PROMPT_V4.tool) g.push('TOOL_PAKSA_BERBEDA')
  if (X?.PROMPT_INTAKE_TERDAFTAR?.['4'] !== v4) g.push('PROMPT_V4_TIDAK_TERDAFTAR')
  if (X?.VERSI_PROMPT_INTAKE !== IKATAN_PROMPT_V3.versi || X?.HASH_PROMPT_INTAKE !== IKATAN_PROMPT_V3.hash) g.push('PROMPT_LEGACY_BERBEDA')
  if (typeof X?.ekstrakIntakeProduksi !== 'function') g.push('PENGEKSTRAK_PRODUKSI_TIDAK_ADA')
  let rute = null
  try {
    rute = MC.ruteModelIntakeUntukInput({ TAH_INTAKE_MODEL: MODEL_KANDIDAT }, JENIS_INPUT_KANDIDAT)
  } catch {
    g.push('RUTE_GAGAL_DIHITUNG')
  }
  if (rute && JSON.stringify(rute) !== JSON.stringify(HARAPAN_RUTE_TEXT)) g.push('RUTE_TEXT_BERBEDA')
  try {
    const pdf = MC.ruteModelIntakeUntukInput({ TAH_INTAKE_MODEL: MODEL_KANDIDAT }, 'PDF')
    if (pdf?.rute !== 'LEGACY_DI_LUAR_CAKUPAN') g.push('RUTE_PDF_BUKAN_LEGACY')
  } catch {
    g.push('RUTE_PDF_GAGAL_DIHITUNG')
  }
  const e = MC.cariEntriModel?.(MODEL_KANDIDAT)
  if (!e || e.status !== HARAPAN_ENTRI_REGISTRI.status || e.dasar !== HARAPAN_ENTRI_REGISTRI.dasar || JSON.stringify(e.cakupanInput) !== JSON.stringify(HARAPAN_ENTRI_REGISTRI.cakupanInput)) g.push('ENTRI_REGISTRI_BERBEDA')
  return g
}
