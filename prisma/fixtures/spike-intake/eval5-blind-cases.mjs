// PRD-005 Eval-5 — PEMUAT PAKET BLIND (40 kasus). Data ditulis konteks penulis INDEPENDEN yang hanya menerima
// docs/PRD-005-EVAL5-DATASET-SPEC.md (tanpa akses ke validator, leksikon, prompt, kasus Eval-1..4, atau keluaran
// model). Berkas data `eval5-blind-cases.json` dibekukan APA ADANYA; modul ini hanya menerjemahkan anotasi
// spesifikasi §4 ke bentuk GT penilai (PRESENT / ABSENT / ACCEPTABLE / NOT_SCORED) secara MEKANIS — tanpa
// menambah, membuang, atau menafsir ulang nilai GT.
//
// Tanggal relatif hari eksekusi lewat tetapkanTanggalEval3 (UTC, deterministik untuk satu hari eksekusi).

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { tetapkanTanggalEval3 } from './eval3-cases.mjs'

export const JALUR_DATA_EVAL5 = fileURLToPath(new URL('./eval5-blind-cases.json', import.meta.url))
export const POLA_SENTINEL_EVAL5 = /ZQV5[A-Z]{2}/
export const POLA_KONTAK_EVAL5 = /@uji5\.invalid|\+62-555-/i
export const KODE_FATAL_TERLARANG = Object.freeze({ MONEY: 'F7', INJECTION: 'F8', NOT_IDENTITY: 'F1', NON_CARGO_NUMBER: 'F5' })

/** Isi mentah berkas data (string) — dasar sha256 pembekuan. */
export const bacaDataMentahEval5 = (jalur = JALUR_DATA_EVAL5) => readFileSync(jalur, 'utf8')
export const muatDataEval5 = (jalur = JALUR_DATA_EVAL5) => JSON.parse(bacaDataMentahEval5(jalur))

// ------------------------------------------------------------------ anotasi → GT penilai
const P = (value, extra = {}) => ({ status: 'PRESENT', value, ...extra })
const A = () => ({ status: 'ABSENT' })
const AC = (values) => ({ status: 'ACCEPTABLE', values })
const NS = (catatan) => ({ status: 'NOT_SCORED', catatan })
const tanggal = (v) => (typeof v === 'string' && v.startsWith('@') ? { tanggalRef: v.slice(1) } : v)

/** Satu anotasi field (§4.1) → simpul GT. Anotasi tak dikenal → melempar (paket ditolak, bukan ditebak). */
export function simpulGt(a, jalur = '?') {
  if (a === undefined || a === 'absent') return A()
  if (a && typeof a === 'object' && !Array.isArray(a)) {
    if ('present' in a) {
      const alt = Array.isArray(a.alternatives) ? a.alternatives.map(tanggal) : []
      return P(tanggal(a.present), alt.length ? { alias: alt } : {})
    }
    if ('acceptable' in a && Array.isArray(a.acceptable)) return AC(a.acceptable.map(tanggal))
    if ('notScored' in a) return NS(String(a.notScored))
  }
  throw new Error(`EVAL5_ANOTASI_TIDAK_DIKENAL:${jalur}`)
}

const FIELD_ATAS = ['portName', 'portUnlocode', 'jetty', 'eta', 'etb', 'etc', 'etd', 'requestDate', 'principalName', 'customerName', 'agencyType', 'clientReference']
const FIELD_KAPAL = ['name', 'imo', 'mmsi', 'callSign', 'vesselType', 'role']
const FIELD_MUATAN = ['name', 'quantity', 'unit', 'operation']

/** GT anotasi satu kasus → GT penilai (tanggal masih {tanggalRef}). */
export function gtPenilai(c) {
  const g = c.gt ?? {}
  const out = {
    classification: AC([...(g.classification ?? [])]),
    larangNew: typeof g.notNewReason === 'string' && g.notNewReason.trim() ? g.notNewReason : null,
  }
  if (g.vessels === 'NOT_SCORED') out.vessels = { jumlah: NS('Dokumen non-keagenan — kapal tidak dinilai.'), daftar: [] }
  else if (Array.isArray(g.vessels)) out.vessels = { jumlah: P(g.vessels.length), daftar: g.vessels.map((v, i) => ({ ref: v.ref ?? `V${i + 1}`, ...Object.fromEntries(FIELD_KAPAL.map((f) => [f, simpulGt(v[f], `${c.id}.vessels[${i}].${f}`)])) })) }
  else throw new Error(`EVAL5_ANOTASI_KAPAL_TIDAK_SAH:${c.id}`)
  for (const f of FIELD_ATAS) out[f] = simpulGt(g[f], `${c.id}.${f}`)
  if (!Array.isArray(g.cargoes) || !g.cargoes.every(Array.isArray)) throw new Error(`EVAL5_ANOTASI_MUATAN_TIDAK_SAH:${c.id}`)
  out.cargoes = { bentukDiterima: g.cargoes.map((bentuk, bi) => bentuk.map((r, ri) => Object.fromEntries(FIELD_MUATAN.map((f) => [f, simpulGt(r[f], `${c.id}.cargoes[${bi}][${ri}].${f}`)])))) }
  if (g.contact === undefined || g.contact === 'absent') out.contact = A()
  else if (g.contact && typeof g.contact === 'object' && 'notScored' in g.contact) out.contact = NS(String(g.contact.notScored))
  else if (g.contact && typeof g.contact === 'object') out.contact = Object.fromEntries(['name', 'email', 'phone'].map((f) => [f, simpulGt(g.contact[f], `${c.id}.contact.${f}`)]))
  else throw new Error(`EVAL5_ANOTASI_KONTAK_TIDAK_SAH:${c.id}`)
  out.terlarang = (g.forbidden ?? []).map((t, i) => {
    const fatal = KODE_FATAL_TERLARANG[t.kind]
    if (!fatal) throw new Error(`EVAL5_TERLARANG_JENIS_TIDAK_DIKENAL:${c.id}#${i}`)
    return { nilai: t.value, lingkup: t.scope === 'ANY' ? 'FIELD_OPERASIONAL' : t.scope, fatal, alasan: String(t.reason ?? t.kind) }
  })
  return out
}

function resolusi(v, t) {
  if (Array.isArray(v)) return v.map((x) => resolusi(x, t))
  if (v && typeof v === 'object') {
    if ('tanggalRef' in v) {
      if (!t[v.tanggalRef]) throw new Error(`EVAL5_TANGGAL_TIDAK_DIDEKLARASIKAN:${v.tanggalRef}`)
      return t[v.tanggalRef].iso
    }
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolusi(x, t)]))
  }
  return v
}

/** Spesifikasi tanggal anotasi ({offset} | {ref, add}) → bentuk pembangun Eval-3 ({offset} | {ref, tambah}). */
const specTanggal = (d = {}) => Object.fromEntries(Object.entries(d).map(([n, s]) => [n, 'ref' in s ? { ref: s.ref, tambah: s.add } : { offset: s.offset }]))

/** Placeholder {NAMA.format} → nilai; placeholder tak dikenal → melempar. */
export function isiTeks(baris, t) {
  return baris.join('\n').replace(/\{([A-Za-z0-9_]+)\.([A-Za-z]+)\}/g, (m, n, f) => {
    if (!t[n] || typeof t[n][f] !== 'string' || f === 'offsetTerpakai') throw new Error(`EVAL5_PLACEHOLDER_TIDAK_SAH:${m}`)
    return t[n][f]
  })
}

/** Kasus siap pakai untuk satu hari eksekusi: teks + GT bertanggal ISO nyata (bentuk kasus penilai). */
export function bangunKasusEval5(hariIni = new Date(), data = muatDataEval5()) {
  return data.cases.map((c) => {
    const t = tetapkanTanggalEval3(specTanggal(c.dates), hariIni)
    return {
      id: c.id,
      kind: 'TEXT',
      kategori: c.category,
      bahasa: c.language,
      cakupan: [...(c.tags ?? [])],
      judul: c.title,
      tanggal: t,
      teks: isiTeks(c.text, t),
      gt: resolusi(gtPenilai(c), t),
      kapalDikecualikan: (c.excludedVessels ?? []).map((v) => ({ ...v })),
      kapalBukti: Array.isArray(c.evidenceVessels) && c.evidenceVessels.length ? c.evidenceVessels.map((v) => ({ ...v })) : null,
    }
  })
}
