// PRD-005 E5 Step 4 — pembekuan Eval-2 TARGETED (hash kanonik GT + SHA berkas fixture).
//
// Modul MURNI: tanpa jaringan, tanpa AI. Runner Eval-2 kelak WAJIB memanggil verifikasiBekuEval2()
// sebelum panggilan apa pun dan menolak run bila ada galat (pola Eval-1 spike-eval1.mjs).
// Koreksi GT apa pun = versi GT BARU + persetujuan OWNER + nilai beku baru di sini.
//
// Beda dengan Eval-1: hash kanonik Eval-2 ikut mencakup SUMBER fungsi `teks` (dokumen), keputusan,
// kategori, gerbang pra-registrasi, rencana, kapalDikecualikan, dan harapanValidator — bukan
// hanya GT. SHA berkas tetap menjaga setiap byte (termasuk komentar).

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as F from './fixtures/spike-intake/eval2-cases.mjs'

const AKAR = fileURLToPath(new URL('..', import.meta.url))
export const BERKAS_FIXTURE_EVAL2 = join(AKAR, 'prisma/fixtures/spike-intake/eval2-cases.mjs')

// ------------------------------------------------------------------ nilai BEKU (gt-1; dikunci setelah review owner)
export const VERSI_GT_EVAL2 = 'prd005-e5-eval2/gt-1'
export const HASH_GT_BEKU_EVAL2 = '59365c755fb8e42d0413ce832bcf509ce9106b7223b8dc0a7840de409af93dd6'
export const SHA_BERKAS_BEKU_EVAL2 = 'd925e920f85ff02ba9d43d7336e96bbbd3c029b422a47c853a32eeae50d828fa'
export const ID_KASUS_EVAL2 = Object.freeze(Array.from({ length: 26 }, (_, i) => `T${String(i + 1).padStart(2, '0')}`))

const kanon = (v) => JSON.stringify(v, (k, x) => (typeof x === 'function' ? x.toString() : x))

/** Hash kanonik seluruh spesifikasi Eval-2. `mod` bisa disuntik untuk uji mutasi. */
export function hitungHashGtEval2(mod = F) {
  const spec = {
    versi: mod.EVAL2_VERSI,
    pola: String(mod.POLA_SENTINEL_EVAL2),
    kategori: mod.KATEGORI_EVAL2,
    keputusan: mod.KEPUTUSAN_EVAL2,
    gerbang: mod.GERBANG_EVAL2,
    rencana: mod.RENCANA_EVAL2,
    kasus: mod.KASUS_EVAL2.map((k) => ({
      id: k.id,
      kind: k.kind,
      sentinel: k.sentinel,
      kategori: k.kategori,
      polaritas: k.polaritas,
      adversarial: k.adversarial,
      sentinelLokasi: k.sentinelLokasi,
      mekanisme: k.mekanisme,
      tanggal: k.tanggal,
      teks: k.teks,
      gt: k.gt,
      kapalDikecualikan: k.kapalDikecualikan ?? [],
      harapanValidator: k.harapanValidator ?? [],
    })),
  }
  return createHash('sha256').update(kanon(spec)).digest('hex')
}

export const shaBerkas = (isi) => createHash('sha256').update(isi).digest('hex')

/** Galat integritas (kosong = lulus). `mod`/`isiBerkas` bisa disuntik untuk uji mutasi. */
export function verifikasiBekuEval2({ mod = F, isiBerkas } = {}) {
  const galat = []
  let isi = isiBerkas
  try {
    isi = isi ?? readFileSync(BERKAS_FIXTURE_EVAL2)
  } catch {
    return ['FIXTURE_TIDAK_TERBACA']
  }
  if (shaBerkas(isi) !== SHA_BERKAS_BEKU_EVAL2) galat.push('SHA_BERKAS_BERBEDA')
  let h
  try {
    h = hitungHashGtEval2(mod)
  } catch {
    return [...galat, 'FIXTURE_TIDAK_TERURAI']
  }
  if (h !== HASH_GT_BEKU_EVAL2) galat.push('HASH_GT_BERBEDA')
  if (mod.EVAL2_VERSI !== VERSI_GT_EVAL2) galat.push('VERSI_GT_BERBEDA')
  const ids = (mod.KASUS_EVAL2 ?? []).map((k) => k.id)
  if (ids.length !== 26) galat.push('JUMLAH_KASUS_BUKAN_26')
  if (JSON.stringify(ids) !== JSON.stringify(ID_KASUS_EVAL2)) galat.push('HIMPUNAN_KASUS_BERBEDA')
  return galat
}
