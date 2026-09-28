// PRD-005 Eval-6 — PEMUAT PAKET BLIND FINAL (40 kasus W01–W40). Data ditulis konteks penulis INDEPENDEN yang hanya menerima
// docs/PRD-005-EVAL6-DATASET-SPEC.md (tanpa akses ke Eval-5, audit/remediasi validator, intake-policy.ts, leksikon, prompt,
// atau keluaran model). Berkas `eval6-blind-cases.json` dibekukan APA ADANYA. Penerjemahan anotasi → GT penilai memakai
// fungsi mekanis yang sama dengan Eval-5 (bangunKasusEval5 menerima data eksplisit) — tanpa menambah/menafsir ulang GT.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { bangunKasusEval5 } from './eval5-blind-cases.mjs'

export const VERSI_DATA_EVAL6 = 'prd005-eval6/blind-1'
export const JALUR_DATA_EVAL6 = fileURLToPath(new URL('./eval6-blind-cases.json', import.meta.url))
export const POLA_SENTINEL_EVAL6 = /XJW6[A-Z]{2}/
export const POLA_KONTAK_EVAL6 = /@uji6\.invalid|\+62-556-/i

export const bacaDataMentahEval6 = (jalur = JALUR_DATA_EVAL6) => readFileSync(jalur, 'utf8')
export const muatDataEval6 = (jalur = JALUR_DATA_EVAL6) => JSON.parse(bacaDataMentahEval6(jalur))
/** Kasus siap pakai untuk satu hari eksekusi (bentuk kasus penilai). */
export const bangunKasusEval6 = (hariIni = new Date(), data = muatDataEval6()) => bangunKasusEval5(hariIni, data)
