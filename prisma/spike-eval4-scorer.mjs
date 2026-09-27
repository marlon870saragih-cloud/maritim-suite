// PRD-005 Eval-4 — PENILAI scorer-3: koreksi penilaian MUATAN (audit H20 + audit alias maritim).
// scorer-3 = scorer-2 + bukti sumber sempit dari leksikon maritim (uang/tarif/partikular bukan jumlah;
// satuan tepat sesudah angka; operasi per baris konteks; DISCH). Nama "scorer-2" di bawah = mekanisme dasarnya.
//
// Modul MURNI (tanpa jaringan/berkas/kode produksi; normalisasi DISUNTIKKAN lewat `norm`, sama seperti
// scorer-1). scorer-1 (spike-eval1-scorer.mjs) TIDAK diubah: Eval-1/2/3 tetap dinilai dengan scorer-1
// dan SHA-nya dikunci pemeriksa lama. scorer-2 memakai ulang scorer-1 untuk SEMUA bagian kecuali muatan:
// muatan dikeluarkan dari GT sebelum scorer-1 dipanggil, lalu dinilai ulang di sini dan digabung.
//
// Dua cacat scorer-1 yang ditutup (audit H20):
//   1. Penyelarasan muatan memasangkan sisa baris MENURUT URUTAN — komoditas karangan ("coal") yang
//      dipasangkan dengan baris GT ("sawn timber") hanya MINOR. scorer-2: pasangan WAJIB nama sama
//      (nama GT/alias/sinonim); baris tanpa pasangan = KARANGAN.
//   2. Baris karangan hanya FATAL bila berisi jumlah/operasi. scorer-2: komoditas karangan = FATAL F5,
//      berapa pun isinya.
// Dan satu pemisahan kejujuran (bukan pelonggaran):
//   F5_UNSUPPORTED — nilai muatan TIDAK berbukti di teks sumber → FATAL (dihitung G1, seperti biasa).
//   F5_GT_CONFLICT — SEMUA nilai baris/field itu berbukti TUNGGAL di teks sumber, tetapi GT tidak
//                    memuatnya → BUKAN kesalahan model yang terbukti; TIDAK masuk `fatal`, dicatat di
//                    `konflikGt` dan kasusnya berstatus INCONCLUSIVE_GT. Run dengan INCONCLUSIVE_GT tidak
//                    boleh PASS (integritasGtRun) — GT wajib diperbaiki dan dibekukan ulang dulu.
// Uji bukti sumber di sini SENGAJA independen dari validator produksi (penilai menilai validator): DATA
// istilah dari lib/maritim-lexicon.ts, logika pencocokan milik penilai (lihat buktiSumber).

import * as S from './spike-eval1-scorer.mjs'
import * as L from '../src/lib/maritim-lexicon.ts'

export const VERSI_PENILAI_V2 = 'prd005-e5-eval4/scorer-3'
export const INCONCLUSIVE_GT = 'INCONCLUSIVE_GT'
export const JENIS_F5 = Object.freeze({ UNSUPPORTED: 'F5_UNSUPPORTED', GT_CONFLICT: 'F5_GT_CONFLICT' })

const FIELD_MUATAN = ['name', 'quantity', 'unit', 'operation']
const TIPE_MUATAN = { name: 'teks', quantity: 'angka', unit: 'teks', operation: 'enum' }
const KRITIS_MUATAN = ['quantity', 'operation']
const kosong = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '')

// ------------------------------------------------------------------ bukti sumber (independen)
// scorer-3: DATA istilah dari leksikon maritim terkendali (sama dengan validator), LOGIKA pencocokan
// milik penilai sendiri. Bukti sengaja SEMPIT: angka uang/tarif/partikular/pengenal/tanggal/jam bukan
// jumlah; jumlah hanya bila satuan leksikon TEPAT sesudahnya (atau label jumlah tepat sebelumnya);
// operasi hanya dari baris yang memuat nama baris itu / label muatan, sesudah frasa bukan-operasi
// dibuang; tanpa OCR (nilai hasil koreksi OCR tidak pernah dianggap "berbukti" → tak bisa melonggarkan).
const token = (s) => L.tokenLeksikon(String(s))
function adaUrutan(cari, sumber) {
  if (!cari.length) return false
  for (let i = 0; i + cari.length <= sumber.length; i++) if (cari.every((t, j) => sumber[i + j] === t)) return true
  return false
}
const diAkhir = (daftar, t) => daftar.some((d) => { const x = d.split(' '); return x.length <= t.length && x.every((w, i) => t[t.length - x.length + i] === w) })
const adaFrasa = (daftar, t) => daftar.some((d) => adaUrutan(d.split(' '), t))
/** Satu tafsiran per token: grup 3 digit sesudah satu jenis pemisah = ribuan; dua jenis → yang terakhir desimal. */
export function angkaToken(tok) {
  if (!/^\d+(?:[.,]\d+)*$/.test(tok)) return null
  const t = tok.includes('.')
  const k = tok.includes(',')
  let s
  if (t && k) {
    const d = tok.lastIndexOf('.') > tok.lastIndexOf(',') ? '.' : ','
    const parts = tok.split(d === '.' ? ',' : '.').join('').split(d)
    if (parts.length !== 2) return null
    s = parts.join('.')
  } else if (!t && !k) s = tok
  else {
    const b = tok.split(t ? '.' : ',')
    if (b.slice(1).every((x) => x.length === 3)) s = b.join('')
    else if (b.length === 2) s = b.join('.')
    else return null
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
const BULAN = 'JAN|FEB|MAR|APR|MAY|MEI|JUN|JUL|AUG|AGU|AGT|SEP|OCT|OKT|NOV|DEC|DES'
const TANGGAL_JAM = [
  /\b\d{1,4}[/.-]\d{1,2}[/.-]\d{2,4}\b/g,
  new RegExp(`\\b\\d{1,2}[\\s-]+(?:${BULAN})[A-Z]*\\.?[\\s-]+\\d{2,4}\\b`, 'gi'),
  new RegExp(`\\b(?:${BULAN})[A-Z]*\\.?\\s+\\d{1,2},?\\s+\\d{4}\\b`, 'gi'),
  /\b\d{1,2}:\d{2}\b/g,
]
const SATUAN = Object.entries(L.SATUAN_LEKSIKON).flatMap(([grup, e]) => e.alias.map((a) => ({ grup, t: a.split(' ') }))).sort((a, b) => b.t.length - a.t.length)
export const grupSatuan = (u) => { const t = token(u).join(' '); return SATUAN.find((x) => x.t.join(' ') === t)?.grup ?? null }

/** Pasangan {nilai, grup} jumlah muatan pada SATU baris (angka tanpa huruf; aturan sempit di atas). */
export function jumlahBaris(baris) {
  let x = String(baris)
  for (const p of TANGGAL_JAM) x = x.replace(p, (m) => ' '.repeat(m.length))
  const hasil = []
  const pola = /(^|[^A-Za-z0-9.,])(\d+(?:[.,]\d+)*)(?![A-Za-z0-9])/g
  for (let m = pola.exec(x); m; m = pola.exec(x)) {
    const nilai = angkaToken(m[2])
    if (nilai === null) continue
    const awal = m.index + m[1].length
    const sebelum = x.slice(0, awal)
    const sesudah = x.slice(awal + m[2].length)
    const tSeb = token(sebelum)
    if (diAkhir(L.LABEL_BUKAN_JUMLAH, tSeb)) continue
    const klausa = token(sebelum.split(/[;()|\t\n]|,\s/).pop() ?? '')
    if (/\$\s*$/.test(sebelum) || adaFrasa(L.MATA_UANG, klausa) || adaFrasa(L.KATA_UANG, klausa)) continue
    const tSes = token(sesudah)
    if (tSes.length && (L.MATA_UANG.includes(tSes[0]) || adaFrasa(L.KATA_UANG, tSes.slice(0, 2)))) continue
    const sisa = sesudah.replace(/^[ \t]*(?:\|[ \t]*)?/, '')
    const tSisa = token(sisa)
    const sat = SATUAN.find((u) => u.t.every((w, i) => tSisa[i] === w) && sisa.toUpperCase().replace(/³/g, '3').startsWith(u.t[0]))
    if (sat) {
      if (/^\s*(?:\/|per\b)/i.test(sisa.slice(sat.t.join(' ').length))) continue
      hasil.push({ nilai, grup: sat.grup })
    } else if (diAkhir(L.LABEL_JUMLAH, tSeb)) hasil.push({ nilai, grup: null })
  }
  return hasil
}
function buktiSumber(teks) {
  const frasa = L.FRASA_BUKAN_OPERASI.map((f) => f.split(' '))
  const baris = String(teks ?? '').split(/\r?\n/).map((l) => {
    const t = token(l)
    const u = [...t]
    for (const f of frasa) for (let i = 0; i + f.length <= u.length; i++) if (f.every((w, j) => u[i + j] === w)) u.splice(i, f.length, '~')
    const op = new Set(Object.values(L.OPERASI_LEKSIKON).filter((e) => e.alias.some((w) => u.includes(w))).map((e) => e.kanonik))
    return { t, label: t.length > 0 && (L.LABEL_BARIS_MUATAN.includes(t[0]) || L.LABEL_JUMLAH.includes(t[0])), op, jumlah: jumlahBaris(l) }
  })
  return { tok: baris.flatMap((x) => x.t), baris }
}
/** Baris sumber yang menjadi konteks muatan untuk sebuah nama (memuat nama itu, atau berlabel muatan). */
const barisKonteks = (nama, b) => { const t = token(nama ?? ''); return b.baris.filter((x) => x.label || (t.length && adaUrutan(t, x.t))) }
/** Nilai muatan (satu field, dalam konteks barisnya) berbukti TUNGGAL di sumber? */
function fieldBerbukti(f, v, c, b) {
  if (kosong(v)) return true
  if (f === 'name') return adaUrutan(token(v), b.tok)
  const ctx = barisKonteks(c.name, b)
  const q = kosong(c.quantity) ? null : typeof c.quantity === 'number' ? c.quantity : S.angkaDari(String(c.quantity))
  if (f === 'quantity') return q !== null && ctx.some((x) => x.jumlah.some((j) => j.nilai === q))
  if (f === 'unit') return q !== null && grupSatuan(v) !== null && ctx.some((x) => x.jumlah.some((j) => j.nilai === q && j.grup === grupSatuan(v)))
  const o = String(v).trim().toUpperCase()
  if (!(o in L.OPERASI_LEKSIKON)) return false
  const ada = new Set(ctx.flatMap((x) => [...x.op]))
  return ada.has(o) && ada.size === 1
}
const barisBerbukti = (c, b) => FIELD_MUATAN.every((f) => fieldBerbukti(f, c[f], c, b))

// ------------------------------------------------------------------ penyelarasan (nama WAJIB sama)
function diterima(node, tipe, norm) {
  if (!node) return []
  if (node.status === 'PRESENT') return [node.value, ...(node.alias ?? []), ...(node.sinonim ?? [])].map((x) => S.bentukPembanding(tipe, x, norm))
  if (node.status === 'ACCEPTABLE') return node.values.filter((x) => x !== null).map((x) => S.bentukPembanding(tipe, x, norm))
  return []
}
function selaraskan(bentuk, pred, norm) {
  const sisa = new Set(pred.map((_, i) => i))
  const pasangan = []
  const gtHilang = []
  for (const g of bentuk) {
    const nm = diterima(g.name, 'teks', norm)
    const q = diterima(g.quantity, 'angka', norm)
    const op = diterima(g.operation, 'enum', norm)
    const namaCocok = (i) => nm.includes(S.bentukPembanding('teks', pred[i].name, norm))
    // GT tanpa nama tertulis → cadangan scorer-1 (jumlah+operasi); selain itu HANYA pasangan bernama sama.
    const pilih = nm.length
      ? ([...sisa].find((i) => namaCocok(i) && q.includes(S.bentukPembanding('angka', pred[i].quantity, norm)) && op.includes(S.bentukPembanding('enum', pred[i].operation, norm))) ??
        [...sisa].find(namaCocok) ??
        null)
      : ([...sisa].find((i) => q.includes(S.bentukPembanding('angka', pred[i].quantity, norm)) && op.includes(S.bentukPembanding('enum', pred[i].operation, norm))) ?? null)
    if (pilih === null) gtHilang.push(g)
    else {
      sisa.delete(pilih)
      pasangan.push({ g, i: pilih })
    }
  }
  return { pasangan, gtHilang, predKarangan: [...sisa].sort((a, b) => a - b) }
}

const kepField = (f, hasil) => {
  if (hasil === S.HASIL.CORRECT) return null
  if (KRITIS_MUATAN.includes(f)) {
    if (hasil === S.HASIL.WRONG || hasil === S.HASIL.HALLUCINATED) return { tingkat: 'FATAL', kode: 'F5' }
    if (hasil === S.HASIL.MISSING) return { tingkat: 'MAJOR' }
  }
  return { tingkat: 'MINOR' }
}
const lebihKecil = (a, b) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]
  return false
}

/** Nilai muatan SATU lapisan (tampilan RAW/POST scorer-1) terhadap GT + bukti sumber. */
export function nilaiMuatan(gtCargoes, cargoes, sumberTeks, norm, lapisan, flagsPost = []) {
  if (!gtCargoes?.bentukDiterima) return { dinilai: false, bentuk: null, baris: [], karangan: [], hilang: [], konflikGt: [] }
  const b = buktiSumber(sumberTeks)
  let terbaik = null
  gtCargoes.bentukDiterima.forEach((bentuk, bi) => {
    const s = selaraskan(bentuk, cargoes, norm)
    const baris = []
    const konflikGt = []
    for (const { g, i } of s.pasangan)
      for (const f of FIELD_MUATAN) {
        const r = S.nilaiField(g[f], cargoes[i][f], TIPE_MUATAN[f], norm)
        if (!r) continue
        let kep = kepField(f, r.hasil)
        if (kep?.tingkat === 'FATAL' && fieldBerbukti(f, cargoes[i][f], cargoes[i], b)) {
          konflikGt.push({ jalur: `cargoes[${i}].${f}`, jenis: JENIS_F5.GT_CONFLICT })
          kep = null
        }
        const flags = flagsPost[i] ?? []
        baris.push({
          jalur: `cargoes[${i}].${f}`, generik: `cargoes.${f}`, hasil: r.hasil, kritis: KRITIS_MUATAN.includes(f), wajib: S.wajibBerisi(g[f]),
          keparahan: kep ? { ...kep, ...(kep.tingkat === 'FATAL' ? { jenis: JENIS_F5.UNSUPPORTED } : {}) } : null,
          got: r.got, atribusi: lapisan === 'POST' && flags.some((x) => /NOT_IN_SOURCE|CONTRADICTS_SOURCE|WITHOUT_QUANTITY/.test(x)) ? 'VALIDATOR' : 'MODEL', tanda: r.tanda ?? [], flags,
        })
      }
    const karangan = []
    for (const i of s.predKarangan) {
      if (barisBerbukti(cargoes[i], b)) konflikGt.push({ jalur: `cargoes[${i}]`, jenis: JENIS_F5.GT_CONFLICT })
      else karangan.push({ jalur: `cargoes[${i}]`, hasil: S.HASIL.HALLUCINATED, keparahan: { tingkat: 'FATAL', kode: 'F5', jenis: JENIS_F5.UNSUPPORTED } })
    }
    const hilang = s.gtHilang.map((g, j) => ({ jalur: `cargoGT#${j}`, hasil: S.HASIL.MISSING, keparahan: { tingkat: 'MAJOR' }, wajib: KRITIS_MUATAN.filter((f) => S.wajibBerisi(g[f])).length }))
    // Bentuk terbaik: FATAL, lalu konflik GT, lalu MAJOR, lalu MINOR — konflik GT tak pernah "menang" atas bentuk yang bersih.
    const skor = [
      baris.filter((x) => x.keparahan?.tingkat === 'FATAL').length + karangan.length,
      konflikGt.length,
      baris.filter((x) => x.keparahan?.tingkat === 'MAJOR').length + hilang.length,
      baris.filter((x) => x.keparahan?.tingkat === 'MINOR').length,
      bi,
    ]
    if (!terbaik || lebihKecil(skor, terbaik.skor)) terbaik = { bi, baris, karangan, hilang, konflikGt, skor }
  })
  return { dinilai: true, bentuk: terbaik.bi, baris: terbaik.baris, karangan: terbaik.karangan, hilang: terbaik.hilang, konflikGt: terbaik.konflikGt }
}

function gabung(lapisan, m) {
  if (!lapisan) return lapisan
  const fatal = [...lapisan.fatal]
  const tambah = (kode, jalur, sumber, jenis) => {
    if (!fatal.some((x) => x.kode === kode && x.jalur === jalur)) fatal.push({ kode, jalur, sumber, jenis })
  }
  for (const x of m.baris) if (x.keparahan?.tingkat === 'FATAL') tambah('F5', x.jalur, 'FIELD', x.keparahan.jenis)
  for (const k of m.karangan) tambah('F5', k.jalur, 'KARANGAN', k.keparahan.jenis)
  const n = (t) => m.baris.filter((x) => x.keparahan?.tingkat === t).length
  const kritisWajib = m.baris.filter((x) => x.kritis && x.wajib)
  return {
    ...lapisan,
    baris: [...lapisan.baris, ...m.baris],
    muatan: m,
    konflikGt: m.konflikGt,
    fatal,
    jumlah: { FATAL: fatal.length, MAJOR: lapisan.jumlah.MAJOR + n('MAJOR') + m.hilang.length, MINOR: lapisan.jumlah.MINOR + n('MINOR') },
    recall: {
      benar: lapisan.recall.benar + kritisWajib.filter((x) => x.hasil === S.HASIL.CORRECT).length,
      total: lapisan.recall.total + kritisWajib.length + m.hilang.reduce((a, k) => a + k.wajib, 0),
    },
    halusinasiKritis: lapisan.halusinasiKritis + m.karangan.length + m.baris.filter((x) => x.kritis && x.hasil === S.HASIL.HALLUCINATED && x.keparahan?.tingkat === 'FATAL').length,
  }
}

/**
 * Nilai SATU kasus dengan scorer-2. Antarmuka = scorer-1 nilaiKasus; tambahan: `versiPenilai`,
 * `integritasGt` ('OK' | 'INCONCLUSIVE_GT'), dan per lapisan `konflikGt`. `kasus.teks` = teks sumber.
 */
export function nilaiKasusV2(kasus, raw, post, norm) {
  const gtCargoes = kasus.gt.cargoes
  const tanpaMuatan = { ...kasus, gt: { ...kasus.gt, cargoes: gtCargoes?.bentukDiterima ? undefined : gtCargoes } }
  const dasar = S.nilaiKasus(tanpaMuatan, raw, post, norm)
  if (dasar.ekstraktorGagal) return { ...dasar, versiPenilai: VERSI_PENILAI_V2, integritasGt: 'OK' }
  const tRaw = S.tampilanRaw(raw)
  const tPost = S.tampilanPost(post)
  const flagsPost = post.proposal.cargoes.map((c) => c.flags ?? [])
  const mRaw = nilaiMuatan(gtCargoes, tRaw.cargoes, kasus.teks, norm, 'RAW')
  const mPost = nilaiMuatan(gtCargoes, tPost.cargoes, kasus.teks, norm, 'POST', flagsPost)
  const RAW = gabung(dasar.RAW, mRaw)
  const POST = gabung(dasar.POST, mPost)
  const rawPer = new Map(RAW.baris.map((x) => [x.jalur, x]))
  for (const x of POST.baris) if (x.generik?.startsWith('cargoes.') && x.hasil !== S.HASIL.CORRECT && rawPer.get(x.jalur)?.hasil === S.HASIL.CORRECT) x.atribusi = 'VALIDATOR'
  const integritasGt = RAW.konflikGt.length || POST.konflikGt.length ? INCONCLUSIVE_GT : 'OK'
  return { ...dasar, RAW, POST, versiPenilai: VERSI_PENILAI_V2, integritasGt }
}

/** Integritas GT satu run: satu kasus INCONCLUSIVE_GT → run INCONCLUSIVE_GT (tak boleh PASS). */
export function integritasGtRun(hasil) {
  const kasus = hasil.filter((h) => h?.integritasGt === INCONCLUSIVE_GT).map((h) => h.id)
  return { status: kasus.length ? INCONCLUSIVE_GT : 'OK', kasus }
}
