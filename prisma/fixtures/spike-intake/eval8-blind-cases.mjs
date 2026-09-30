// PRD-005 Eval-8 (Blind-B) — PEMUAT PAKET BLIND (40 kasus B01–B40). Data ditulis konteks penulis INDEPENDEN yang hanya menerima
// docs/PRD-005-EVAL8-DATASET-SPEC.md (tanpa akses ke repo, kasus Eval-1..7, validator V3, leksikon, prompt, uji V3,
// atau keluaran model). Berkas `eval8-blind-cases.json` dibekukan APA ADANYA. Penerjemahan anotasi → GT penilai memakai
// fungsi mekanis yang sama dengan Eval-5/Eval-6 (bangunKasusEval5 menerima data eksplisit) — tanpa menafsir ulang GT.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { bangunKasusEval5 } from './eval5-blind-cases.mjs'

export const VERSI_DATA_EVAL8 = 'prd005-eval8/blind-1'
export const JALUR_DATA_EVAL8 = fileURLToPath(new URL('./eval8-blind-cases.json', import.meta.url))
export const POLA_SENTINEL_EVAL8 = /XJW8[A-Z]{2}/
export const POLA_KONTAK_EVAL8 = /@uji8\.invalid|\+62-558-/i

export const bacaDataMentahEval8 = (jalur = JALUR_DATA_EVAL8) => readFileSync(jalur, 'utf8')
export const muatDataEval8 = (jalur = JALUR_DATA_EVAL8) => JSON.parse(bacaDataMentahEval8(jalur))
/** Kasus siap pakai untuk satu hari eksekusi (bentuk kasus penilai). */
export const bangunKasusEval8 = (hariIni = new Date(), data = muatDataEval8()) => bangunKasusEval5(hariIni, data)
