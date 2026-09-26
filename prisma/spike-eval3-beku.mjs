// PRD-005 E5 Step 13 — pembekuan Eval-3 HELD-OUT (hash kanonik GT + SHA berkas fixture + ikatan Prompt v3).
//
// Modul MURNI: tanpa jaringan, tanpa AI. Runner Eval-3 kelak WAJIB memanggil verifikasiBekuEval3()
// DAN verifikasiIkatanPromptEval3() (dengan identitas prompt yang sesungguhnya) sebelum panggilan apa
// pun, dan menolak run bila ada galat. Koreksi GT apa pun = versi GT BARU + persetujuan OWNER.
// Perubahan isi Prompt v3 / skema v3 membatalkan eksekusi Eval-3 sampai owner meninjau ulang.

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as F from './fixtures/spike-intake/eval3-cases.mjs'

const AKAR = fileURLToPath(new URL('..', import.meta.url))
export const BERKAS_FIXTURE_EVAL3 = join(AKAR, 'prisma/fixtures/spike-intake/eval3-cases.mjs')

// ------------------------------------------------------------------ nilai BEKU (gt-1; dikunci sebelum run apa pun)
export const VERSI_GT_EVAL3 = 'prd005-e5-eval3/gt-1'
export const HASH_GT_BEKU_EVAL3 = '0bdebc4f4981dc0a880393767202c0edfc9e677c67590ee7bb26876cf90e33c3'
export const SHA_BERKAS_BEKU_EVAL3 = 'c6098c1a06a9cc771e202b15c65fd38d351a89a258f03985002ef4a3450853d1'
export const ID_KASUS_EVAL3 = Object.freeze(Array.from({ length: 36 }, (_, i) => `H${String(i + 1).padStart(2, '0')}`))

const kanon = (v) => JSON.stringify(v, (k, x) => (typeof x === 'function' ? x.toString() : x))

/** Hash kanonik seluruh spesifikasi Eval-3 (termasuk sumber `teks`, gerbang, rencana, ikatan prompt). */
export function hitungHashGtEval3(mod = F) {
  const spec = {
    versi: mod.EVAL3_VERSI,
    pola: String(mod.POLA_SENTINEL_EVAL3),
    ikatan: mod.IKATAN_PROMPT_EVAL3,
    kategori: mod.KATEGORI_EVAL3,
    keputusan: mod.KEPUTUSAN_EVAL3,
    gerbang: mod.GERBANG_EVAL3,
    rencana: mod.RENCANA_EVAL3,
    harapan: mod.HARAPAN_EVAL3,
    kasus: mod.KASUS_EVAL3.map((k) => ({
      id: k.id,
      kind: k.kind,
      sentinel: k.sentinel,
      kategori: k.kategori,
      polaritas: k.polaritas,
      adversarial: k.adversarial,
      niatKeagenan: k.niatKeagenan,
      sentinelLokasi: k.sentinelLokasi,
      mekanisme: k.mekanisme,
      tanggal: k.tanggal,
      teks: k.teks,
      gt: k.gt,
      kapalDikecualikan: k.kapalDikecualikan ?? [],
      kapalBukti: k.kapalBukti ?? null,
      harapanValidator: k.harapanValidator ?? [],
    })),
  }
  return createHash('sha256').update(kanon(spec)).digest('hex')
}

export const shaBerkas = (isi) => createHash('sha256').update(isi).digest('hex')

/** Galat integritas (kosong = lulus). `mod`/`isiBerkas` bisa disuntik untuk uji mutasi. */
export function verifikasiBekuEval3({ mod = F, isiBerkas } = {}) {
  const galat = []
  let isi = isiBerkas
  try {
    isi = isi ?? readFileSync(BERKAS_FIXTURE_EVAL3)
  } catch {
    return ['FIXTURE_TIDAK_TERBACA']
  }
  if (shaBerkas(isi) !== SHA_BERKAS_BEKU_EVAL3) galat.push('SHA_BERKAS_BERBEDA')
  let h
  try {
    h = hitungHashGtEval3(mod)
  } catch {
    return [...galat, 'FIXTURE_TIDAK_TERURAI']
  }
  if (h !== HASH_GT_BEKU_EVAL3) galat.push('HASH_GT_BERBEDA')
  if (mod.EVAL3_VERSI !== VERSI_GT_EVAL3) galat.push('VERSI_GT_BERBEDA')
  const ids = (mod.KASUS_EVAL3 ?? []).map((k) => k.id)
  if (ids.length !== 36) galat.push('JUMLAH_KASUS_BUKAN_36')
  if (JSON.stringify(ids) !== JSON.stringify(ID_KASUS_EVAL3)) galat.push('HIMPUNAN_KASUS_BERBEDA')
  return galat
}

/**
 * Ikatan Prompt v3: identitas prompt yang SESUNGGUHNYA (dari vessel-call-extract.ts, dimuat pemanggil)
 * wajib sama persis dengan ikatan beku. Modul ini tidak memuat kode TypeScript sendiri (tetap murni).
 */
export function verifikasiIkatanPromptEval3(aktual, mod = F) {
  const b = mod.IKATAN_PROMPT_EVAL3
  const galat = []
  if (!aktual || typeof aktual !== 'object') return ['IDENTITAS_PROMPT_TIDAK_ADA']
  if (aktual.idPrompt !== b.idPrompt) galat.push('ID_PROMPT_BERBEDA')
  if (aktual.versiPrompt !== b.versiPrompt) galat.push('VERSI_PROMPT_BERBEDA')
  if (aktual.versiSkema !== b.versiSkema) galat.push('VERSI_SKEMA_BERBEDA')
  if (aktual.hashPrompt !== b.hashPrompt) galat.push('HASH_PROMPT_BERBEDA')
  return galat
}
