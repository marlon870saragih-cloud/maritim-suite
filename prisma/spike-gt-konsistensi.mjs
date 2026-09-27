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
import * as L from '../src/lib/maritim-lexicon.ts'

export const VERSI_PEMERIKSA_GT = 'prd005-e5-eval4/gt-sumber-2'

export const LEKSIKON_KOMODITAS = Object.freeze([
  'COAL', 'STEAM COAL', 'BATUBARA', 'BATU BARA', 'TIMBER', 'SAWN TIMBER', 'LOGS', 'KAYU', 'NICKEL', 'NIKEL', 'NICKEL ORE', 'NIKEL ORE',
  'IRON ORE', 'BAUXITE', 'BAUKSIT', 'CPO', 'CRUDE PALM OIL', 'PALM KERNEL', 'PALM KERNEL SHELL', 'CEMENT', 'SEMEN', 'CLINKER', 'UREA',
  'FERTILIZER', 'PUPUK', 'SAND', 'PASIR', 'SPLIT STONE', 'SPLIT BATU', 'BATU SPLIT', 'GRAVEL', 'CORN', 'JAGUNG', 'MAIZE', 'WHEAT', 'GANDUM',
  'SOYBEAN', 'KEDELAI', 'SUGAR', 'GULA', 'RICE', 'BERAS', 'SALT', 'GARAM', 'STEEL', 'BAJA', 'CONTAINERS', 'KONTAINER', 'GENERAL CARGO',
  'CAUSTIC SODA', 'CRUDE OIL', 'HSD', 'MFO', 'LNG', 'LPG',
])
/** Alias operasi dari leksikon maritim terkendali (DATA bersama; termasuk DISCH — OWNER D1). */
export const LEKSIKON_OPERASI = Object.freeze(Object.fromEntries(Object.entries(L.OPERASI_LEKSIKON).map(([k, e]) => [k, e.alias])))

const token = (s) => L.tokenLeksikon(String(s))
/** Token dokumen sesudah frasa bukan-operasi ("load port", "completion of discharge", …) dibuang. */
function tokenOperasi(src) {
  const t = token(src)
  for (const f of L.FRASA_BUKAN_OPERASI.map((x) => x.split(' '))) for (let i = 0; i + f.length <= t.length; i++) if (f.every((w, j) => t[i + j] === w)) t.splice(i, f.length, '~')
  return t
}
/** Angka yang BOLEH menjadi bukti jumlah GT: bukan tanggal/jam, bukan uang (mata uang/kata tarif di klausa), bukan sesudah label pengenal/partikular. */
function angkaBukanUang(src) {
  const hasil = new Set()
  for (const baris of String(src).split(/\r?\n/)) {
    let x = baris
    for (const p of TANGGAL_JAM) x = x.replace(p, (m) => ' '.repeat(m.length))
    const pola = /(^|[^A-Za-z0-9.,])(\d+(?:[.,]\d+)*)(?![A-Za-z0-9])/g
    for (let m = pola.exec(x); m; m = pola.exec(x)) {
      const sebelum = x.slice(0, m.index + m[1].length)
      const tSeb = token(sebelum)
      const klausa = token(sebelum.split(/[;()|\t\n]|,\s/).pop() ?? '')
      if (L.LABEL_BUKAN_JUMLAH.some((l) => { const w = l.split(' '); return w.every((v, i) => tSeb[tSeb.length - w.length + i] === v) })) continue
      if (/\$\s*$/.test(sebelum) || L.MATA_UANG.some((c) => klausa.includes(c)) || L.KATA_UANG.some((c) => klausa.includes(c.split(' ')[0]))) continue
      const n = angkaToken(m[2])
      if (n !== null) hasil.add(n)
    }
  }
  return hasil
}
const BULAN = 'JAN|FEB|MAR|APR|MAY|MEI|JUN|JUL|AUG|AGU|AGT|SEP|OCT|OKT|NOV|DEC|DES'
const TANGGAL_JAM = [
  /\b\d{1,4}[/.-]\d{1,2}[/.-]\d{2,4}\b/g,
  new RegExp(`\\b\\d{1,2}[\\s-]+(?:${BULAN})[A-Z]*\\.?[\\s-]+\\d{2,4}\\b`, 'gi'),
  new RegExp(`\\b(?:${BULAN})[A-Z]*\\.?\\s+\\d{1,2},?\\s+\\d{4}\\b`, 'gi'),
  /\b\d{1,2}:\d{2}\b/g,
]
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
  const tokOp = tokenOperasi(src)
  const operasi = Object.keys(LEKSIKON_OPERASI).filter((o) => LEKSIKON_OPERASI[o].some((w) => tokOp.includes(w)))
  const hanyaKosong = g.bentukDiterima.every((b) => b.length === 0)
  if (hanyaKosong && komoditas.length && operasi.length) temuan.push({ kasus: k.id, aturan: 'K1', tingkat: 'GAGAL', detail: { komoditas, operasi } })
  else if (hanyaKosong && operasi.length) temuan.push({ kasus: k.id, aturan: 'K4', tingkat: 'INFO', detail: { operasi } })
  const angka = angkaBukanUang(src)
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
  const tokOp = tokenOperasi(teksKasus(k))
  const operasi = Object.keys(LEKSIKON_OPERASI).filter((o) => LEKSIKON_OPERASI[o].some((w) => tokOp.includes(w)))
  return [{ name: komoditas[0], quantity: null, unit: null, operation: operasi.length === 1 ? operasi[0] : null }]
}

/** Temuan seluruh himpunan kasus + putusan (GAGAL bila ada temuan GAGAL). */
export function periksaKonsistensiGtSumber(kasus) {
  const temuan = kasus.flatMap(periksaKasus)
  return { versi: VERSI_PEMERIKSA_GT, temuan, gagal: temuan.filter((t) => t.tingkat === 'GAGAL'), lulus: !temuan.some((t) => t.tingkat === 'GAGAL') }
}
