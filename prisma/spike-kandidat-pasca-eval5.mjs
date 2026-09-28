// PRD-005 — IDENTITAS KANDIDAT BARU pasca-remediasi validator (BUKAN kandidat Eval-5).
//
// Kandidat Eval-5 (spike-eval5-kandidat.mjs, sidik 5e863242…) tetap bukti historis dan TIDAK diubah. Remediasi
// terkendali yang disetujui owner (R1 WMT, R2 KL, R3 frasa "to be loaded/discharged", R4 sambungan lintas baris +
// pengecualian telepon/kontak/rekening/tambatan, R5 leksikon v2) menghasilkan kandidat BARU di bawah ini.
// Evaluasi blind berikutnya untuk kandidat ini = Eval-6 (dataset BARU; paket Eval-5 Z01–Z40 = EXPOSED — REGRESSION ONLY).
// Model, prompt, rute registri, dan perekat jalur produksi TIDAK berubah; yang berubah: validator + leksikon v2.

import * as K5 from './spike-eval5-kandidat.mjs'

export const ID_KANDIDAT = 'prd005-intake-text/kandidat-pasca-eval5-1'
export const KANDIDAT_SEBELUMNYA = Object.freeze({ id: 'prd005-eval5/kandidat', sidik: K5.sidikKandidat(), commitDasar: K5.COMMIT_DASAR_KANDIDAT })
export const MODEL_KANDIDAT = K5.MODEL_KANDIDAT
export const IKATAN_PROMPT_V4 = K5.IKATAN_PROMPT_V4
export const HARAPAN_RUTE_TEXT = K5.HARAPAN_RUTE_TEXT
export const VERSI_LEKSIKON_VALIDATOR = 'maritim-lexicon/2'

/** Berkas kandidat — sha256. Berbeda dari kandidat Eval-5 hanya pada intake-policy.ts (+ berkas baru leksikon v2). */
export const SHA_KANDIDAT = Object.freeze({
  ...K5.SHA_KANDIDAT_EVAL5,
  'src/services/intake/intake-policy.ts': '36da168ec9564a15255c340aafd9c41810321ab5c275b2a25227c854babfbb94',
  'src/lib/maritim-lexicon-v2.ts': 'b459c81add6823fda1541f6a170bb977f35b6bb0d77e5994774637cd8ece24a5',
})
/** v1 TETAP ada & byte-identik (dipakai penilai/pemeriksa historis) — ikut dicatat supaya tak bergeser diam-diam. */
export const SHA_LEKSIKON_V1_HISTORIS = '864e4e3bf4cb47ef6e1d112ad42b5c9efd9d402c459e2d8be465f0bbab41fb83'

export const sidikKandidat = () => K5.sidikKandidat(SHA_KANDIDAT)
export const verifikasiKandidat = (opsi = {}) => K5.verifikasiKandidat({ ...opsi, sha: SHA_KANDIDAT })
export const verifikasiIdentitasRute = K5.verifikasiIdentitasRute
