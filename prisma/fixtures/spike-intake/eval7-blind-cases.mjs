// PRD-005 Eval-7 — PEMUAT PAKET BLIND (40 kasus V01–V40). Data ditulis konteks penulis INDEPENDEN yang hanya menerima
// docs/PRD-005-EVAL7-DATASET-SPEC.md (tanpa akses ke repo, kasus Eval-1..6, validator V3, leksikon, prompt, uji V3,
// atau keluaran model). Berkas `eval7-blind-cases.json` dibekukan APA ADANYA. Penerjemahan anotasi → GT penilai memakai
// fungsi mekanis yang sama dengan Eval-5/Eval-6 (bangunKasusEval5 menerima data eksplisit) — tanpa menafsir ulang GT.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { bangunKasusEval5 } from './eval5-blind-cases.mjs'

export const VERSI_DATA_EVAL7 = 'prd005-eval7/blind-1'
export const JALUR_DATA_EVAL7 = fileURLToPath(new URL('./eval7-blind-cases.json', import.meta.url))
export const POLA_SENTINEL_EVAL7 = /XJW7[A-Z]{2}/
export const POLA_KONTAK_EVAL7 = /@uji7\.invalid|\+62-557-/i

export const bacaDataMentahEval7 = (jalur = JALUR_DATA_EVAL7) => readFileSync(jalur, 'utf8')
export const muatDataEval7 = (jalur = JALUR_DATA_EVAL7) => JSON.parse(bacaDataMentahEval7(jalur))
/** Kasus siap pakai untuk satu hari eksekusi (bentuk kasus penilai). */
export const bangunKasusEval7 = (hariIni = new Date(), data = muatDataEval7()) => bangunKasusEval5(hariIni, data)
