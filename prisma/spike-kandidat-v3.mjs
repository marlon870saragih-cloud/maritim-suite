// PRD-005 — IDENTITAS KANDIDAT Validator V3 (SPEC:V3). BUKAN kandidat Eval-5 / pasca-Eval-5.
//
// Validator V3 = verifikasi fakta usulan model terhadap bukti sumber (docs/PRD-005-VALIDATOR-V3.md, sha beku
// SHA_SPEK_V3) + Adendum Keselamatan-1 (docs/PRD-005-VALIDATOR-V3-ADDENDUM-1.md, SHA_ADENDUM_V3). Model, Prompt v4,
// rute registri, transport, dan penilai beku TIDAK berubah; yang berubah: intake-policy.ts + leksikon v3 (baru).
// Eval-5 Z01–Z40 & Eval-6 W01–W40 = EXPOSED — REGRESSION ONLY untuk kandidat ini. Evaluasi blind berikutnya =
// dataset segar A (D5: maksimum dua dataset segar untuk V3).
//
// Berkas ini DIHASILKAN dari sha256 berkas di disk saat pembekuan; mengubah berkas kandidat membatalkan identitas.

import * as K5 from './spike-eval5-kandidat.mjs'

export const ID_KANDIDAT = 'prd005-intake-text/kandidat-validator-v3-1'
export const KANDIDAT_SEBELUMNYA = Object.freeze({ id: 'prd005-intake-text/kandidat-pasca-eval5-1', sidik: '59b6b5375da8443c4b544b7911f0501469512cc97d8ab393fb3e96be47f602fd', commitDasar: 'd097fe5b0ee3e40a9ba31b85d391ddce1d0c69f8' })
/** Validator dasar untuk uji diferensial V2→V3. */
export const COMMIT_DASAR_V2 = 'd097fe5b0ee3e40a9ba31b85d391ddce1d0c69f8'
export const MODEL_KANDIDAT = K5.MODEL_KANDIDAT
export const IKATAN_PROMPT_V4 = K5.IKATAN_PROMPT_V4
export const HARAPAN_RUTE_TEXT = K5.HARAPAN_RUTE_TEXT
export const VERSI_LEKSIKON_VALIDATOR = 'maritim-lexicon/3'
export const SHA_SPEK_V3 = 'ec19d3ac183924f479755098b12b2afb61807f9acc5fe905baebf39b0a97fb6c'
export const SHA_ADENDUM_V3 = '79f7ac5e3b93fb448c167a6a7c558db3139cb7fb809c84564f437be4c2ed645a'
/** Penilai scorer-3 (v1 oracle) — TIDAK diubah oleh V3. */
export const SHA_PENILAI_BEKU = 'a513cf676862f356cf1e242736b17bd94d0af06bc9c08718b415b602ef3bb12d'

/** Berkas kandidat — sha256 (jalur produksi TEXT + spesifikasi beku). */
export const SHA_KANDIDAT_V3 = Object.freeze({
  'src/lib/ai/vessel-call-extract.ts': '441349587e36407d8d0bf14bd4a9178edc4ad2d0b5b29bf5c2da45797337fd0a',
  'src/lib/maritim-lexicon.ts': '864e4e3bf4cb47ef6e1d112ad42b5c9efd9d402c459e2d8be465f0bbab41fb83',
  'src/lib/ai/model-capabilities.ts': '99da39fb121e18f00e05c15c6e8979432686305c7aeb16732857e04b4382c9cc',
  'src/lib/ai/openrouter.ts': 'fbef6e842ea8fcd71d802f69d4e3bd6f559f4820c9cac96f48ffdc6dffea1f41',
  'src/lib/ai/perekam-panggilan.ts': '76718f4c8c7ee723ae77152ef725519a1c8bb8c4928f0d512fa76588c8863e35',
  'src/services/intake/intake-ledger.ts': '9e67930728a9263e92c70d2fa19e44bc7bc18542b265b2a25ab16fc5ec821eef',
  'src/services/intake/intake.service.ts': 'cdfed782c66e83b175ab64d35e15c07ab2bb9ce225078de1fef24c6c71792976',
  'src/services/intake/intake-access.ts': '3a77670a2c8d58487cf681efa6c4c46bbf8a47d60f99d1288f5a3dbff0189ce0',
  'src/services/intake/intake-gate.ts': '98521d074c3aa0043ea4ce3c4c6e107313e96e5f82e4fd3ecd2a0a61b5255d9d',
  'src/services/intake/intake-hash.ts': '862d3e086c24f578bdd4a07a70664de6fff96d6831e289dcb1d5ccd69e4525d3',
  'src/lib/vessels.ts': '57afea8c9230fca4bc787c3d95243687efa96be36c7af5adb09cbcf53d1ac0f3',
  'src/lib/business-time.ts': 'd468feb621729267a82a37ea920b890a69fbbf23440e2c50f723b34841cc80eb',
  'src/services/tah/agent-run.service.ts': '902f8439f743e3271a3c9795d514bcce8460e5d839ebc8cd9b89265f7d029d4a',
  'src/services/tah/tah-policy.ts': '67a078e8066b7685a87f1b526402c74f58d3f3d6aaed16542516d7986ca7ff70',
  'src/services/tah/ringkasan-intake.ts': 'c0092a49d96237a9fbac22f59320ee4de44b922e8cb7af2bbfd227d7459c0b79',
  'src/services/intake/intake-policy.ts': 'fc2639e0f0c623d4d7bed3164a48d75449074117eac3a0f29a007a928fb4c1ec',
  'src/lib/maritim-lexicon-v3.ts': '682dc5de06311185903c6d30de0f31d82b7b27c224342960aa096f2b86a16aca',
  'src/lib/maritim-lexicon-v2.ts': 'b459c81add6823fda1541f6a170bb977f35b6bb0d77e5994774637cd8ece24a5',
  'docs/PRD-005-VALIDATOR-V3.md': 'ec19d3ac183924f479755098b12b2afb61807f9acc5fe905baebf39b0a97fb6c',
  'docs/PRD-005-VALIDATOR-V3-ADDENDUM-1.md': '79f7ac5e3b93fb448c167a6a7c558db3139cb7fb809c84564f437be4c2ed645a',
})

export const sidikKandidat = () => K5.sidikKandidat(SHA_KANDIDAT_V3)
export const verifikasiKandidat = (opsi = {}) => K5.verifikasiKandidat({ ...opsi, sha: SHA_KANDIDAT_V3 })
export const verifikasiIdentitasRute = K5.verifikasiIdentitasRute
