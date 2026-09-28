// PRD-005 Eval-5 — PEMERIKSA PAKET BLIND: INTEGRITAS GT (Step D) + ANTI-TUMPANG-TINDIH (Step C). LURING, MURNI.
//
// Tidak pernah mengubah data. Tidak memanggil model, validator, atau DB. Temuan GAGAL memblok pembekuan & LIVE.
//
// INTEGRITAS GT (D*) — setiap kasus: sumber ↔ klasifikasi ↔ identitas kapal ↔ pelabuhan ↔ ETA/ETD ↔ muatan
// ↔ jumlah/satuan ↔ relevansi. Penekanan owner: muatan tanpa jumlah di sumber → GT TIDAK boleh berjumlah;
// angka DWT/GRT/LOA/draft/harga/tarif/invoice/telepon/rekening/rujukan tak boleh menjadi jumlah muatan.
// TUMPANG-TINDIH (T*) — terhadap korpus terlihat: Eval-1/2/3/4, RG-H20/RG-H18, Phase 0, E11, fixture E2E intake,
// contoh Prompt v3/v4, literal pengembangan validator & leksikon. Wajib 0 temuan untuk: teks persis, ID,
// identitas kapal, IMO, MMSI, call sign, principal/perusahaan, pasangan pelabuhan+UN/LOCODE, sentinel lama;
// kemiripan memakai ambang beku Eval-4 (trigram kata ≥ 0,30 / 5-gram karakter ≥ 0,40).

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as G from './spike-gt-konsistensi.mjs'
import * as R4 from './spike-eval4-runner.mjs'
import * as F1 from './fixtures/spike-intake/eval1-cases.mjs'
import * as F2 from './fixtures/spike-intake/eval2-cases.mjs'
import * as F3 from './fixtures/spike-intake/eval3-cases.mjs'
import * as FH from './fixtures/spike-intake/eval4-heldout-cases.mjs'
import * as D from './fixtures/spike-intake/eval5-blind-cases.mjs'

const AKAR = fileURLToPath(new URL('..', import.meta.url))
export const VERSI_PEMERIKSA_EVAL5 = 'prd005-eval5/pemeriksa-paket-1'

// ------------------------------------------------------------------ spesifikasi beku (docs/PRD-005-EVAL5-DATASET-SPEC.md)
export const DISTRIBUSI = Object.freeze({ A: 8, B: 5, C: 7, D: 4, E: 4, F: 6, G: 3, H: 3 })
export const BAHASA = Object.freeze({ ID: 15, EN: 15, MIX: 10 })
export const KLASIFIKASI = Object.freeze(['NEW_NOMINATION', 'NEW_APPOINTMENT', 'NOT_RELEVANT', 'INSUFFICIENT_INFORMATION', 'UNSUPPORTED_REQUEST'])
export const POOL_PELABUHAN = Object.freeze({
  IDBKS: 'Bengkulu', IDCBN: 'Cirebon', IDDJB: 'Jambi', IDDJJ: 'Jayapura', IDGTO: 'Gorontalo', IDKTG: 'Ketapang', IDLUW: 'Luwuk', IDMDC: 'Manado',
  IDMKQ: 'Merauke', IDMKW: 'Manokwari', IDMOF: 'Maumere', IDNNX: 'Nunukan', IDPDG: 'Padang', IDPKN: 'Pangkalanbuun', IDPSJ: 'Poso', IDPUM: 'Pomalaa',
  IDRGT: 'Rengat', IDSMQ: 'Sampit', IDSWQ: 'Sumbawa', IDTJQ: 'Tanjung Pandan', IDTLI: 'Tolitoli', IDTNJ: 'Tanjungpinang', IDWGP: 'Waingapu', IDBIK: 'Biak',
  IDMJU: 'Mamuju', IDKUM: 'Kumai', IDLBR: 'Lembar', IDPAL: 'Palu', IDKTJ: 'Kualatanjung', IDSTU: 'Satui',
})
export const POOL_IMO = Object.freeze('9864007 9864019 9864021 9864033 9864045 9864069 9864071 9864083 9864112 9864124 9864162 9864215 9864227 9864241 9864253 9864265 9864277 9864289 9864291 9864306 9864318 9864320 9864332 9864344 9864356 9864368 9864411 9864423 9864447 9864459 9864461 9864514 9864540 9864564 9864590 9864617 9864643 9864655 9864679 9864708 9864710 9864722 9864734 9864758 9864772 9864796 9864801 9864813 9864837 9864849 9864851 9864863 9864875 9864887 9864904 9864928 9864930 9864966 9864978 9864992'.split(' '))
export const POOL_MMSI = Object.freeze('525372749 525387699 525710050 525704441 525110832 525095410 525529164 525961487 525559645 525217811 525855398 525811255 525970860 525786438 525562340 525016896 525291819 525833680 525140609 525685865 525102579 525609349 525851622 525557589 525950312 525477657 525997942 525048299 525901437 525589072'.split(' '))
export const POOL_CALLSIGN = Object.freeze('YDLU YCFU YDMM5 YEHA4 YENV2 PNMC5 YBER7 PNUP2 YBNF8 YCJX7 YEBD9 PKAA POVM YDWJ1 YCQR4 PMLD YCVE PNDR YDCK7 POXJ PNXZ PNPL YELX PNDS PKKD YCBK7 YBDB8 YCSJ YDTA3 PMRP'.split(' '))
const NEW = (c) => c === 'NEW_NOMINATION' || c === 'NEW_APPOINTMENT'
const FIELD_ATAS_GT = ['portName', 'portUnlocode', 'jetty', 'eta', 'etb', 'etc', 'etd', 'requestDate', 'principalName', 'customerName', 'agencyType', 'clientReference']
const FORMAT_BERTAHUN = ['iso', 'dmy', 'idLong', 'enLong']
const FORMAT_TANGGAL = ['iso', 'dmy', 'dm', 'dMonEn', 'dBulanId', 'idLong', 'enLong']
/** Kata konteks yang membuat angka di baris itu BUKAN jumlah muatan (partikular kapal, uang, kontak, pengenal). */
const KONTEKS_BUKAN_JUMLAH = /\b(DWT|GRT|NRT|LOA|BEAM|DRAFT|DRAUGHT|SARAT|DEADWEIGHT|GROSS|RP|IDR|USD|US\$|SGD|EUR|TARIF|TARIFF|RATE|FEE|BIAYA|HARGA|PRICE|INVOICE|TAGIHAN|NPWP|REKENING|ACCOUNT|ACC|A\/C|TELP|TEL|PHONE|HP|WA|FAX|HULL|YARD|NB|PO|REF|JOB|VOY|VOYAGE)\b/i

const up = (s) => String(s ?? '').toUpperCase()
const rapat = (s) => up(s).replace(/\s+/g, ' ').trim()
const kompak = (s) => up(s).replace(/[^A-Z0-9]/g, '')
const nilaiSimpul = (n) => (!n ? [] : n.status === 'PRESENT' ? [n.value, ...(n.alias ?? [])] : n.status === 'ACCEPTABLE' ? n.values.filter((x) => x !== null) : [])
const utama = (n) => (n?.status === 'PRESENT' ? [n.value] : n?.status === 'ACCEPTABLE' ? n.values.filter((x) => x !== null) : [])
const hadir = (n) => n?.status === 'PRESENT' || (n?.status === 'ACCEPTABLE' && n.values.every((x) => x !== null))
const tertulis = (teks, v) => rapat(teks).includes(rapat(v)) || kompak(teks).includes(kompak(v))

// ------------------------------------------------------------------ INTEGRITAS GT (per data mentah + kasus terbangun)
/**
 * Temuan integritas paket. `data` = JSON mentah penulis; `kasus` = bangunKasusEval5(hariIni, data).
 * Hasil: { temuan: [{kasus, aturan, detail}], lulus }. Semua temuan GAGAL (tanpa tingkat INFO) kecuali G.K4.
 */
export function periksaIntegritasPaket(data, kasus) {
  const t = []
  const tambah = (id, aturan, detail = null) => t.push({ kasus: id, aturan, detail })
  const c = data?.cases
  if (data?.version !== 'prd005-eval5/blind-1') tambah('*', 'D0_VERSI')
  if (!Array.isArray(c) || c.length !== 40) return { temuan: [...t, { kasus: '*', aturan: 'D0_JUMLAH_BUKAN_40', detail: c?.length ?? null }], lulus: false }
  // D1 ID, distribusi, bahasa
  c.forEach((x, i) => x.id !== `Z${String(i + 1).padStart(2, '0')}` && tambah(x.id, 'D1_ID_URUTAN'))
  const hitung = (f) => c.reduce((o, x) => ((o[x[f]] = (o[x[f]] ?? 0) + 1), o), {})
  const kat = hitung('category')
  const bhs = hitung('language')
  if (JSON.stringify(Object.keys(DISTRIBUSI).map((k) => kat[k] ?? 0)) !== JSON.stringify(Object.values(DISTRIBUSI)) || Object.keys(kat).some((k) => !(k in DISTRIBUSI))) tambah('*', 'D1_DISTRIBUSI', kat)
  if (JSON.stringify(Object.keys(BAHASA).map((k) => bhs[k] ?? 0)) !== JSON.stringify(Object.values(BAHASA)) || Object.keys(bhs).some((k) => !(k in BAHASA))) tambah('*', 'D1_BAHASA', bhs)

  const semuaTeks = kasus.map((k) => k.teks).join('\n')
  // Satu nilai pool dipakai paling banyak di SATU kasus (boleh muncul berulang di dalam kasus itu, mis. koreksi).
  const kasusPemakai = (v) => kasus.filter((k) => new RegExp(`(?<![0-9A-Z])${v}(?![0-9A-Z])`).test(k.teks)).map((k) => k.id)
  for (const [pool, nama] of [[POOL_IMO, 'IMO'], [POOL_MMSI, 'MMSI'], [POOL_CALLSIGN, 'CALLSIGN']]) for (const v of pool) if (kasusPemakai(v).length > 1) tambah('*', `D3_${nama}_DIPAKAI_LINTAS_KASUS`, `${v}:${kasusPemakai(v).join(',')}`)
  const pakaiPort = {}

  const sentinel = new Set()
  kasus.forEach((k, i) => {
    const raw = c[i]
    const g = k.gt
    // D2 privasi: sentinel tunggal & unik, domain/telepon uji
    const s = k.teks.match(new RegExp(D.POLA_SENTINEL_EVAL5.source, 'g')) ?? []
    if (s.length !== 1) tambah(k.id, 'D2_SENTINEL_BUKAN_TUNGGAL', s.length)
    else if (sentinel.has(s[0])) tambah(k.id, 'D2_SENTINEL_GANDA', s[0])
    else sentinel.add(s[0])
    for (const e of k.teks.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g) ?? []) if (!/@uji5\.invalid$/i.test(e)) tambah(k.id, 'D2_EMAIL_DOMAIN', e)
    for (const p of k.teks.match(/\+\d[\d\s-]{6,}/g) ?? []) if (!/^\+62-555-\d{4,6}/.test(p.trim())) tambah(k.id, 'D2_TELEPON_FORMAT', p.trim())
    // D2b tanggal: placeholder terdeklarasi; offset dalam jendela; tanggal konkret tidak ditulis langsung
    for (const [n, sp] of Object.entries(raw.dates ?? {})) if ('offset' in sp && !((sp.offset >= 7 && sp.offset <= 120) || (sp.offset >= -25 && sp.offset <= -1))) tambah(k.id, 'D2_OFFSET_DI_LUAR_JENDELA', `${n}:${sp.offset}`)
    for (const [n, x] of Object.entries(k.tanggal)) if (x.offsetTerpakai > 150 || x.offsetTerpakai < -30) tambah(k.id, 'D2_TANGGAL_TURUNAN_DI_LUAR_JENDELA', n)
    if (/\b20\d{2}\b/.test(raw.text.join('\n').replace(/\{[^}]+\}/g, ''))) tambah(k.id, 'D2_TAHUN_DITULIS_LANGSUNG')

    // D3 identitas dari pool
    for (const m of k.teks.match(/\b\d{7}\b/g) ?? []) if (/IMO[\s:#.]*$/i.test(k.teks.slice(0, k.teks.indexOf(m))) && !POOL_IMO.includes(m)) tambah(k.id, 'D3_IMO_BUKAN_POOL', m)
    const vs = Array.isArray(g.vessels.daftar) ? g.vessels.daftar : []
    for (const v of vs) {
      for (const x of nilaiSimpul(v.imo)) if (!POOL_IMO.includes(String(x))) tambah(k.id, 'D3_GT_IMO_BUKAN_POOL', x)
      for (const x of nilaiSimpul(v.mmsi)) if (!POOL_MMSI.includes(String(x))) tambah(k.id, 'D3_GT_MMSI_BUKAN_POOL', x)
      for (const x of nilaiSimpul(v.callSign)) if (!POOL_CALLSIGN.includes(up(x))) tambah(k.id, 'D3_GT_CALLSIGN_BUKAN_POOL', x)
    }
    // D4 pelabuhan: kode tertulis ∈ pool; nama GT sesuai kode pool bila keduanya hadir
    for (const kode of new Set(k.teks.match(/\bID[A-Z]{3}\b/g) ?? [])) {
      if (!(kode in POOL_PELABUHAN)) tambah(k.id, 'D4_LOCODE_BUKAN_POOL', kode)
      else pakaiPort[kode] = (pakaiPort[kode] ?? 0) + 1
    }
    for (const kode of utama(g.portUnlocode)) if (!(up(kode) in POOL_PELABUHAN)) tambah(k.id, 'D4_GT_LOCODE_BUKAN_POOL', kode)

    // D5 nilai GT kritis tertulis literal di sumber
    const cekTertulis = (jalur, n) => {
      for (const v of utama(n)) if (typeof v === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(v) && !tertulis(k.teks, v)) tambah(k.id, 'D5_NILAI_GT_TIDAK_TERTULIS', `${jalur}=${v}`)
      // Alternatif nama MUATAN boleh berupa sinonim/terjemahan (mis. jagung ↔ corn; pola `sinonim` Eval-4): alternatif
      // hanya MENAMBAH bentuk yang diterima, tak pernah mewajibkan nilai tak tertulis. Alternatif field identitas tetap wajib tertulis.
      if (!/^cargoes\[/.test(jalur)) for (const v of n?.alias ?? []) if (typeof v === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(v) && !tertulis(k.teks, v)) tambah(k.id, 'D5_ALTERNATIF_TIDAK_TERTULIS', `${jalur}=${v}`)
    }
    vs.forEach((v, j) => ['name', 'imo', 'mmsi', 'callSign'].forEach((f) => cekTertulis(`vessels[${j}].${f}`, v[f])))
    for (const f of ['portName', 'portUnlocode', 'jetty', 'principalName', 'customerName', 'clientReference']) cekTertulis(f, g[f])
    g.cargoes.bentukDiterima.forEach((b, bi) => b.forEach((r, ri) => { cekTertulis(`cargoes[${bi}][${ri}].name`, r.name); cekTertulis(`cargoes[${bi}][${ri}].unit`, r.unit) }))

    // D6 label identitas: IMO/MMSI/call sign GT harus berlabel di sumber
    const berlabel = (v, pola) => new RegExp(`(${pola})[^\\n]{0,40}?${String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(k.teks)
    vs.forEach((v, j) => {
      for (const x of utama(v.imo)) if (!berlabel(x, 'IMO')) tambah(k.id, 'D6_IMO_TANPA_LABEL', `vessels[${j}]=${x}`)
      for (const x of utama(v.mmsi)) if (!berlabel(x, 'MMSI')) tambah(k.id, 'D6_MMSI_TANPA_LABEL', `vessels[${j}]=${x}`)
      for (const x of utama(v.callSign)) if (!berlabel(x, 'CALL\\s*SIGN|CALLSIGN|C\\/S|TANDA\\s+PANGGIL')) tambah(k.id, 'D6_CALLSIGN_TANPA_LABEL', `vessels[${j}]=${x}`)
    })

    // D7 muatan: jumlah GT = angka di pernyataan muatan (bukan partikular/uang/kontak), tak pernah = nilai terlarang
    const barisTeks = k.teks.split('\n')
    const terlarangAngka = (g.terlarang ?? []).filter((x) => typeof x.nilai === 'number').map((x) => x.nilai)
    g.cargoes.bentukDiterima.forEach((b, bi) =>
      b.forEach((r, ri) => {
        for (const q of utama(r.quantity)) {
          if (typeof q !== 'number') { tambah(k.id, 'D7_JUMLAH_BUKAN_ANGKA', `cargoes[${bi}][${ri}]=${q}`); continue }
          const bentukAngka = barisTeks.filter((l) => (l.match(/\d[\d.,]*/g) ?? []).some((tok) => angkaDariToken(tok) === q))
          if (!bentukAngka.length) tambah(k.id, 'D7_JUMLAH_TIDAK_TERTULIS', `cargoes[${bi}][${ri}]=${q}`)
          else if (bentukAngka.every((l) => KONTEKS_BUKAN_JUMLAH.test(sebelumAngka(l, q)))) tambah(k.id, 'D7_JUMLAH_DARI_KONTEKS_BUKAN_MUATAN', `cargoes[${bi}][${ri}]=${q}`)
          if (terlarangAngka.includes(q)) tambah(k.id, 'D7_JUMLAH_SAMA_DENGAN_TERLARANG', q)
        }
        if (hadir(r.unit) && !hadir(r.quantity) && r.quantity?.status !== 'ACCEPTABLE') tambah(k.id, 'D7_SATUAN_TANPA_JUMLAH', `cargoes[${bi}][${ri}]`)
      }),
    )
    // D8 tanggal GT hadir → placeholder bertahun untuk tanggal itu ada di teks; placeholder tanpa tahun saja → GT tak boleh hadir
    for (const f of ['eta', 'etb', 'etc', 'etd', 'requestDate']) {
      const sumber = raw.gt?.[f]
      const refs = []
      if (sumber && typeof sumber === 'object') for (const v of [sumber.present, ...(sumber.acceptable ?? []), ...(sumber.alternatives ?? [])]) if (typeof v === 'string' && v.startsWith('@')) refs.push(v.slice(1))
      for (const ref of refs) {
        const dipakai = FORMAT_TANGGAL.filter((fm) => raw.text.join('\n').includes(`{${ref}.${fm}}`))
        if (!dipakai.some((fm) => FORMAT_BERTAHUN.includes(fm))) tambah(k.id, 'D8_TANGGAL_GT_TANPA_TAHUN_DI_SUMBER', `${f}=@${ref}`)
      }
    }
    // D9 klasifikasi ↔ aturan minimum (§3.2) menurut GT
    const kls = g.classification.values
    if (!kls.length || kls.some((x) => !KLASIFIKASI.includes(x))) tambah(k.id, 'D9_KLASIFIKASI_TIDAK_SAH', kls)
    const identitas = vs.some((v) => ['name', 'imo', 'mmsi', 'callSign'].some((f) => hadir(v[f])))
    const tujuan = hadir(g.portName) || hadir(g.portUnlocode) || hadir(g.eta)
    if (kls.every(NEW) && !(identitas && tujuan)) tambah(k.id, 'D9_NEW_TANPA_SYARAT_MINIMUM_DI_GT')
    if (kls.length === 1 && kls[0] === 'INSUFFICIENT_INFORMATION' && identitas && tujuan) tambah(k.id, 'D9_INSUFFICIENT_PADAHAL_MINIMUM_TERPENUHI_DI_GT')
    if (kls.every(NEW) && g.vessels.jumlah?.status === 'NOT_SCORED') tambah(k.id, 'D9_NEW_TANPA_KAPAL_DINILAI')
    // D10 larangNew konsisten
    const negatif = kls.every((x) => !NEW(x))
    if (negatif && !g.larangNew) tambah(k.id, 'D10_NEGATIF_TANPA_ALASAN')
    if (kls.some(NEW) && g.larangNew) tambah(k.id, 'D10_NEW_DENGAN_LARANG_NEW')
    // D11 nilai terlarang tidak boleh sekaligus nilai GT yang diterima PADA LINGKUP YANG SAMA (kontradiksi GT).
    // Nilai terlarang yang TIDAK tertulis sah (menjaga inferensi, mis. nama pelabuhan diturunkan dari kode) — hanya INFO.
    const diterimaDi = (lingkup) => {
      const f = (jalur, n) => (lingkup === 'FIELD_OPERASIONAL' || lingkup === jalur ? nilaiSimpul(n) : [])
      return [
        ...vs.flatMap((v) => ['name', 'imo', 'mmsi', 'callSign', 'vesselType', 'role'].flatMap((x) => f(`vessels.${x}`, v[x]))),
        ...FIELD_ATAS_GT.flatMap((x) => f(x, g[x])),
        ...g.cargoes.bentukDiterima.flat().flatMap((r) => ['name', 'quantity', 'unit', 'operation'].flatMap((x) => f(`cargoes.${x}`, r[x]))),
      ].map((v) => kompak(v))
    }
    for (const x of g.terlarang ?? []) if (diterimaDi(x.lingkup).includes(kompak(x.nilai))) tambah(k.id, 'D11_TERLARANG_SEKALIGUS_GT', `${x.lingkup}=${x.nilai}`)
    // D12 kapal dikecualikan bukan kapal GT
    for (const x of k.kapalDikecualikan ?? []) if (vs.some((v) => utama(v.name).some((n) => kompak(n).endsWith(kompak(x.name).replace(/^(MV|MT|TB|BG|KM|SPOB|LCT)/, ''))))) tambah(k.id, 'D12_DIKECUALIKAN_ADA_DI_GT', x.name)
  })
  for (const [kode, n] of Object.entries(pakaiPort)) if (n > 2) tambah('*', 'D4_PELABUHAN_LEBIH_DARI_DUA', `${kode}:${n}`)
  // D13 aturan GT↔sumber Eval-4 (K1–K3 GAGAL; K4 INFO) — dipakai ulang tanpa diubah
  const kons = G.periksaKonsistensiGtSumber(kasus)
  for (const x of kons.gagal) tambah(x.kasus, `D13_${x.aturan}`, x.detail)
  return { versi: VERSI_PEMERIKSA_EVAL5, temuan: t, info: kons.temuan.filter((x) => x.tingkat === 'INFO'), lulus: t.length === 0 }
}

/** Angka dari satu token teks: ribuan bertitik gaya ID, desimal koma, ribuan koma gaya EN. */
export function angkaDariToken(tok) {
  const t = String(tok).replace(/[.,]$/, '')
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) return Number(t.replace(/\./g, '').replace(',', '.'))
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) return Number(t.replace(/,/g, ''))
  if (/^\d+,\d+$/.test(t)) return Number(t.replace(',', '.'))
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t)
  return null
}
/** Potongan baris sebelum kemunculan angka q (untuk uji konteks bukan-jumlah). */
function sebelumAngka(baris, q) {
  const m = [...baris.matchAll(/\d[\d.,]*/g)].find((x) => angkaDariToken(x[0]) === q)
  const awal = m ? m.index : baris.length
  return baris.slice(Math.max(0, awal - 24), awal)
}

// ------------------------------------------------------------------ KORPUS TERLIHAT & TUMPANG-TINDIH
/** Berkas pengembangan validator/leksikon/prompt/E2E yang literalnya ikut korpus kemiripan. */
export const BERKAS_LITERAL = Object.freeze([
  'src/lib/ai/vessel-call-extract.ts', 'src/services/intake/intake-policy.ts', 'src/lib/maritim-lexicon.ts', 'src/services/intake/fake-extractor.ts',
  'prisma/check-intake-policy.mjs', 'prisma/check-intake-prompt.mjs', 'prisma/check-intake-api.mjs', 'prisma/check-tah-ledger-api.mjs', 'prisma/check-tah-ledger.mjs',
  'prisma/check-eval4-prep.mjs', 'prisma/check-eval4-runner.mjs', 'prisma/check-gt-source-consistency.mjs', 'prisma/check-eval1-harness.mjs',
])
/** Artefak Eval-5 sendiri — dikecualikan dari korpus. */
const MILIK_EVAL5 = /(^|\/)(eval5-|spike-eval5-|check-eval5-|PRD-005-EVAL5-)/

const literal = (src) => [...src.matchAll(/'((?:[^'\\\n]|\\.){30,})'|"((?:[^"\\\n]|\\.){30,})"|`((?:[^`\\]|\\.){30,})`/g)].map((m) => m[1] ?? m[2] ?? m[3])

/** Korpus terlihat: kasus Eval-1..4, regresi, Phase 0, E11 (dari Eval-4) + held-out Eval-4 + prompt + literal pengembangan. */
export function korpusTerlihatEval5(hariIni = new Date(), { baca = (rel) => readFileSync(join(AKAR, rel), 'utf8') } = {}) {
  const dasar = R4.kasusTerlihat(hariIni)
  const q = FH.bangunKasusHeldoutEval4(hariIni).map((k) => ({ id: k.id, teks: k.teks }))
  const lit = BERKAS_LITERAL.flatMap((rel) => literal(baca(rel)).map((s, i) => ({ id: `LIT:${rel}#${i}`, teks: s })))
  const korpus = [...dasar.korpus.map(({ id, teks }) => ({ id, teks })), ...q, ...lit].filter((k) => typeof k.teks === 'string' && k.teks.trim())
  const ids = new Set([...dasar.id, ...q.map((k) => k.id)])
  return { ids, teks: new Set(korpus.map((k) => rapat(k.teks))), korpus }
}

/** Seluruh teks berkas terlacak repo (kecuali artefak Eval-5 & biner) — dasar pemindaian entitas. */
export function teksRepoTerlacak({ git = () => execFileSync('git', ['ls-files'], { cwd: AKAR, encoding: 'utf8' }), baca = (rel) => readFileSync(join(AKAR, rel), 'utf8') } = {}) {
  return git().split('\n').filter((f) => f && !MILIK_EVAL5.test(f) && !/\.(docx|jpe?g|png|ico|pdf|woff2?|lock)$/i.test(f) && f !== 'package-lock.json').map((f) => {
    try {
      return baca(f)
    } catch {
      return ''
    }
  }).join('\n')
}

/** Nilai contoh di docs/PRD-005-EVAL5-DATASET-SPEC.md (ilustrasi format, bukan data). */
export const CONTOH_SPEC = Object.freeze(['ARUNA BIRU', 'HALBERD MARINE'])
const namaInti = (n) => up(n).replace(/^(MV|MT|TB|BG|KM|KMP|SPOB|LCT)\.?\s+/, '').trim()
const namaPihak = (n) => up(n).replace(/\b(PT|CV|TBK|LTD|PTE|CO|INC|LLC|LIMITED|CORP|GMBH|SDN|BHD)\b\.?/g, ' ').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const adaKata = (hay, needle) => needle.length >= 5 && new RegExp(`(?<![A-Z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')}(?![A-Z0-9])`).test(hay)

/** Temuan tumpang-tindih (kosong = lulus) + laporan kemiripan per kasus (bukti). */
export function periksaTumpangTindih(kasus, { korpus = korpusTerlihatEval5(), repo = teksRepoTerlacak() } = {}) {
  const t = []
  const tambah = (id, aturan, detail = null) => t.push({ kasus: id, aturan, detail })
  const REPO = up(repo)
  for (const k of kasus) {
    if (korpus.ids.has(k.id)) tambah(k.id, 'T1_ID_SUDAH_TERLIHAT')
    if (korpus.teks.has(rapat(k.teks))) tambah(k.id, 'T2_TEKS_PERSIS_SUDAH_TERLIHAT')
    if ([F1.POLA_SENTINEL, F2.POLA_SENTINEL_EVAL2, F3.POLA_SENTINEL_EVAL3].some((p) => p.test(k.teks))) tambah(k.id, 'T9_SENTINEL_LAMA')
    const g = k.gt
    const vs = Array.isArray(g.vessels.daftar) ? g.vessels.daftar : []
    const namaKapal = [...vs.flatMap((v) => utama(v.name)), ...(k.kapalDikecualikan ?? []).map((v) => v.name), ...(k.kapalBukti ?? []).map((v) => v.name)].filter(Boolean).map(namaInti)
    for (const n of new Set(namaKapal)) if (adaKata(REPO, n)) tambah(k.id, 'T3_NAMA_KAPAL_SUDAH_ADA', n)
    const angkaId = [...vs.flatMap((v) => [...utama(v.imo), ...utama(v.mmsi)]), ...(k.kapalDikecualikan ?? []).flatMap((v) => [v.imo, v.mmsi]), ...(k.kapalBukti ?? []).flatMap((v) => [v.imo, v.mmsi])].filter(Boolean)
    for (const x of new Set([...angkaId.map(String), ...(k.teks.match(/\b\d{7}\b|\b\d{9}\b/g) ?? [])])) if (new RegExp(`(?<!\\d)${x}(?!\\d)`).test(repo)) tambah(k.id, 'T4_IMO_MMSI_SUDAH_ADA', x)
    for (const x of new Set(vs.flatMap((v) => utama(v.callSign)).map(up))) if (new RegExp(`(?<![A-Z0-9])${x}(?![A-Z0-9])`).test(REPO)) tambah(k.id, 'T5_CALLSIGN_SUDAH_ADA', x)
    for (const x of new Set(['principalName', 'customerName'].flatMap((f) => utama(g[f])).map(namaPihak))) if (adaKata(REPO, x)) tambah(k.id, 'T6_PIHAK_SUDAH_ADA', x)
    for (const kode of new Set(k.teks.match(/\bID[A-Z]{3}\b/g) ?? [])) if (new RegExp(`(?<![A-Z0-9])${kode}(?![A-Z0-9])`).test(REPO)) tambah(k.id, 'T7_LOCODE_SUDAH_DIPAKAI', kode)
    if (/ZQV5/.test(REPO)) tambah(k.id, 'T9_SENTINEL_EVAL5_SUDAH_ADA_DI_REPO')
    // T10 contoh ilustrasi spesifikasi tidak boleh disalin ke kasus
    for (const x of CONTOH_SPEC) if (adaKata(up(k.teks), x)) tambah(k.id, 'T10_CONTOH_SPEC_DISALIN', x)
  }
  const kemiripan = kasus.map((k) => {
    let w = { nilai: 0, kasus: null }
    let c = { nilai: 0, kasus: null }
    for (const p of korpus.korpus) {
      const m = R4.kemiripanTeks(k.teks, p.teks)
      if (m.trigramKata > w.nilai) w = { nilai: m.trigramKata, kasus: p.id }
      if (m.ngramKarakter5 > c.nilai) c = { nilai: m.ngramKarakter5, kasus: p.id }
    }
    const r = (x) => Number(x.toFixed(3))
    return { kasus: k.id, trigramKata: { nilai: r(w.nilai), kasus: w.kasus }, ngramKarakter5: { nilai: r(c.nilai), kasus: c.kasus }, mencurigakan: w.nilai >= R4.AMBANG_KEMIRIPAN.trigramKata || c.nilai >= R4.AMBANG_KEMIRIPAN.ngramKarakter5 }
  })
  for (const r of kemiripan) if (r.mencurigakan) tambah(r.kasus, 'T8_KEMIRIPAN_MENCURIGAKAN', r)
  return { versi: VERSI_PEMERIKSA_EVAL5, ambang: R4.AMBANG_KEMIRIPAN, ukuranKorpus: korpus.korpus.length, temuan: t, kemiripan, lulus: t.length === 0 }
}
