// PRD-005 Eval-4 prep — PEMERIKSA KONSISTENSI GT ↔ TEKS SUMBER (luring, statis, murni).
//
// Audit H20: GT beku Eval-3 hanya menerima `cargoes = []` padahal sumbernya menulis "to load sawn
// timber" — ekstraksi SETIA dinilai F5 FATAL. Pemeriksa ini WAJIB dijalankan SEBELUM GT dibekukan /
// sebelum run LIVE; temuan bertingkat GAGAL memblok pembekuan. Ia TIDAK pernah mengubah fixture.
//
// Aturan (deterministik, kata utuh, daftar tetap — tanpa kemiripan/fuzzy):
//   K1 GAGAL  GT menerima HANYA muatan kosong, tetapi sumber menulis komoditas (leksikon) DAN kata operasi.
//   K2 GAGAL  GT memuat nama muatan PRESENT yang tak satu pun bentuknya (nilai/alias/sinonim) tertulis di sumber.
//   K3 GAGAL  GT memuat jumlah muatan PRESENT yang angkanya tak tertulis di sumber.
//   K4 INFO   sumber menulis kata operasi TANPA komoditas yang dikenali, GT kosong (mis. "Discharging completed").
// Batas yang diketahui: K1 hanya mengenali komoditas di LEKSIKON_KOMODITAS; perluas daftar bila fixture
// baru memakai komoditas lain (uji mutasi di check-gt-source-consistency.mjs).

import { angkaToken } from './spike-eval4-scorer.mjs'

export const VERSI_PEMERIKSA_GT = 'prd005-e5-eval4/gt-sumber-1'

export const LEKSIKON_KOMODITAS = Object.freeze([
  'COAL', 'STEAM COAL', 'BATUBARA', 'BATU BARA', 'TIMBER', 'SAWN TIMBER', 'LOGS', 'KAYU', 'NICKEL', 'NIKEL', 'NICKEL ORE', 'NIKEL ORE',
  'IRON ORE', 'BAUXITE', 'BAUKSIT', 'CPO', 'CRUDE PALM OIL', 'PALM KERNEL', 'PALM KERNEL SHELL', 'CEMENT', 'SEMEN', 'CLINKER', 'UREA',
  'FERTILIZER', 'PUPUK', 'SAND', 'PASIR', 'SPLIT STONE', 'SPLIT BATU', 'BATU SPLIT', 'GRAVEL', 'CORN', 'JAGUNG', 'MAIZE', 'WHEAT', 'GANDUM',
  'SOYBEAN', 'KEDELAI', 'SUGAR', 'GULA', 'RICE', 'BERAS', 'SALT', 'GARAM', 'STEEL', 'BAJA', 'CONTAINERS', 'KONTAINER', 'GENERAL CARGO',
  'CAUSTIC SODA', 'CRUDE OIL', 'HSD', 'MFO', 'LNG', 'LPG',
])
export const LEKSIKON_OPERASI = Object.freeze({
  LOAD: ['LOAD', 'LOADING', 'MUAT', 'MEMUAT'],
  DISCHARGE: ['DISCHARGE', 'DISCHARGING', 'UNLOAD', 'BONGKAR'],
})

const token = (s) => String(s).toUpperCase().replace(/³/g, '3').split(/[^A-Z0-9]+/).filter(Boolean)
function adaUrutan(cari, sumber) {
  if (!cari.length) return false
  for (let i = 0; i + cari.length <= sumber.length; i++) if (cari.every((t, j) => sumber[i + j] === t)) return true
  return false
}

/** Teks sumber satu kasus: `teks` (TEXT) atau semua string isi `pdf` (Eval-1 PDF sintetis: baris teks + sel tabel). */
export function teksKasus(k) {
  if (typeof k.teks === 'string') return k.teks
  const hasil = []
  const jalan = (v) => {
    if (typeof v === 'string') hasil.push(v)
    else if (Array.isArray(v)) v.forEach(jalan)
    else if (v && typeof v === 'object') for (const [kk, x] of Object.entries(v)) if (kk !== 'namaBerkas') jalan(x)
  }
  jalan(typeof k.pdf === 'object' ? k.pdf : null)
  return hasil.join('\n')
}

const bentukNama = (n) => (!n ? [] : n.status === 'PRESENT' ? [n.value, ...(n.alias ?? []), ...(n.sinonim ?? [])] : n.status === 'ACCEPTABLE' ? n.values.filter((x) => x !== null) : [])

/** Temuan satu kasus: [{ kasus, aturan, tingkat: 'GAGAL'|'INFO', detail }]. */
export function periksaKasus(k) {
  const temuan = []
  const g = k.gt?.cargoes
  if (!g?.bentukDiterima) return temuan // NOT_SCORED / tak ada GT muatan: tak ada klaim untuk diuji
  const src = teksKasus(k)
  const tok = token(src)
  const komoditas = LEKSIKON_KOMODITAS.filter((c) => adaUrutan(c.split(' '), tok))
  const operasi = Object.keys(LEKSIKON_OPERASI).filter((o) => LEKSIKON_OPERASI[o].some((w) => tok.includes(w)))
  const hanyaKosong = g.bentukDiterima.every((b) => b.length === 0)
  if (hanyaKosong && komoditas.length && operasi.length) temuan.push({ kasus: k.id, aturan: 'K1', tingkat: 'GAGAL', detail: { komoditas, operasi } })
  else if (hanyaKosong && operasi.length) temuan.push({ kasus: k.id, aturan: 'K4', tingkat: 'INFO', detail: { operasi } })
  const angka = new Set((src.match(/\d+(?:[.,]\d+)*/g) ?? []).map(angkaToken).filter((n) => n !== null))
  g.bentukDiterima.forEach((bentuk, bi) =>
    bentuk.forEach((baris, ri) => {
      const nama = bentukNama(baris.name)
      if (baris.name?.status === 'PRESENT' && !nama.some((n) => adaUrutan(token(n), tok))) temuan.push({ kasus: k.id, aturan: 'K2', tingkat: 'GAGAL', detail: { bentuk: bi, baris: ri, nama: baris.name.value } })
      if (baris.quantity?.status === 'PRESENT' && !angka.has(baris.quantity.value)) temuan.push({ kasus: k.id, aturan: 'K3', tingkat: 'GAGAL', detail: { bentuk: bi, baris: ri, jumlah: baris.quantity.value } })
    }),
  )
  return temuan
}

/**
 * R12 — muatan SETIA dari teks sumber untuk keluaran "sempurna" luring: komoditas terpanjang yang
 * dikenali + operasi bila TUNGGAL; tanpa jumlah/satuan (tak pernah menebak). [] bila tak ada komoditas.
 * Pembangkit "sempurna" lama memaksa cargoes=[] — titik buta yang menyembunyikan cacat GT H20.
 */
export function muatanSetiaDariSumber(k) {
  const tok = token(teksKasus(k))
  const komoditas = LEKSIKON_KOMODITAS.filter((c) => adaUrutan(c.split(' '), tok)).sort((a, b) => b.length - a.length)
  if (!komoditas.length) return []
  const operasi = Object.keys(LEKSIKON_OPERASI).filter((o) => LEKSIKON_OPERASI[o].some((w) => tok.includes(w)))
  return [{ name: komoditas[0], quantity: null, unit: null, operation: operasi.length === 1 ? operasi[0] : null }]
}

/** Temuan seluruh himpunan kasus + putusan (GAGAL bila ada temuan GAGAL). */
export function periksaKonsistensiGtSumber(kasus) {
  const temuan = kasus.flatMap(periksaKasus)
  return { versi: VERSI_PEMERIKSA_GT, temuan, gagal: temuan.filter((t) => t.tingkat === 'GAGAL'), lulus: !temuan.some((t) => t.tingkat === 'GAGAL') }
}
