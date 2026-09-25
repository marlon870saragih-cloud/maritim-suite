// Uji LURING PRD-005 Step 3C Controlled Evaluation 1 — tahap E2 (penilai + harness berpagar).
//
// Jalankan:  node prisma/check-eval1-harness.mjs     (tanpa DB, tanpa dev server, tanpa jaringan)
//
// Membuktikan bahwa PENILAI benar sebelum satu panggilan model pun dibayar:
//   A. integritas GT beku (hash, himpunan 15 kasus, deep-freeze, fail-closed)
//   B. unit penilai (PRESENT/ABSENT/ACCEPTABLE/NOT_SCORED, tanpa substring, INFERRED, KOREKSI_OCR)
//   C. keluaran SEMPURNA 15 kasus → 0 FATAL palsu; K1/K3/K5
//   D. keluaran ADVERSARIAL → F1–F9 terdeteksi di lapisan yang benar (RAW vs POST)
//   E. gerbang G1–G8 dan pemetaan verdict
//   F. rencana panggilan & pagar anggaran (pencegat)
//   G. otorisasi / prasyarat (frasa baru, mode LANGSUNG gagal tertutup)
//   H. E2E luring lewat kode ekstraksi ASLI dengan penyedia stub (jaringan nyata = 0)
//   I. privasi laporan
// PASS di sini = penilai/harness siap untuk dry-run review. BUKAN berarti Sonnet 5 lulus Eval-1.

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as F from './fixtures/spike-intake/eval1-cases.mjs'
import * as S from './spike-eval1-scorer.mjs'
import * as H from './spike-eval1.mjs'

const AKAR = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(import.meta.url)
const jiti = require('jiti')(fileURLToPath(import.meta.url), { alias: { '@': join(AKAR, 'src') }, interopDefault: true })
const P = jiti(join(AKAR, 'src/services/intake/intake-policy.ts'))
const V = jiti(join(AKAR, 'src/lib/vessels.ts'))
const NORM_VALIDASI = { imo: V.normalisasiImo, imoSah: V.imoCheckDigitSah, mmsi: V.normalisasiMmsi, mmsiSah: V.mmsiSah, callSign: V.normalisasiCallSign }
const NORM = {
  namaKapal: P.normalisasiNamaKapal,
  namaPort: P.normalisasiNamaPort,
  namaPihak: P.normalisasiNamaPihak,
  unlocode: P.normalisasiUnlocode,
  imo: V.normalisasiImo,
  mmsi: V.normalisasiMmsi,
  callSign: V.normalisasiCallSign,
}

let lulus = 0
let gagal = 0
const cek = (nama, ok, detail = '') => {
  if (ok) lulus++
  else {
    gagal++
    console.log(`  ❌ ${nama}${detail ? ' — ' + detail : ''}`)
  }
}
const bagian = (t) => console.log(`\n── ${t}`)

// Fetch global dimata-matai: harus 0 panggilan jaringan nyata sepanjang uji.
const fetchAsliGlobal = globalThis.fetch
let panggilanJaringanNyata = 0
globalThis.fetch = (...a) => {
  panggilanJaringanNyata++
  return Promise.reject(new Error('UJI_TANPA_JARINGAN'))
}

const HARI = new Date(Date.UTC(2026, 8, 25))
const HARI_ISO = '2026-09-25'
const kasus = F.bangunKasusEval1(HARI)
const K = Object.fromEntries(kasus.map((k) => [k.id, k]))
const klon = (o) => JSON.parse(JSON.stringify(o))

// ------------------------------------------------------------------ keluaran sempurna dari GT
const pilih = (n) => (!n || typeof n !== 'object' || !('status' in n) ? undefined : n.status === 'PRESENT' ? n.value : n.status === 'ACCEPTABLE' ? n.values[0] ?? undefined : undefined)
function sempurna(k) {
  const g = k.gt
  const o = { classification: g.classification.values[0] }
  o.vessels = (g.vessels.daftar ?? []).map((v) => Object.fromEntries(['name', 'imo', 'mmsi', 'callSign', 'vesselType', 'role'].map((f) => [f, pilih(v[f])]).filter(([, x]) => x !== undefined)))
  for (const f of ['portName', 'portUnlocode', 'jetty', 'eta', 'etb', 'etc', 'etd', 'principalName', 'customerName', 'agencyType', 'clientReference', 'requestDate']) {
    const x = pilih(g[f])
    if (x !== undefined && x !== null) o[f] = x
  }
  o.cargoes = g.cargoes?.bentukDiterima ? g.cargoes.bentukDiterima[0].map((c) => Object.fromEntries(['name', 'quantity', 'unit', 'operation'].map((f) => [f, pilih(c[f])]).filter(([, x]) => x !== undefined && x !== null))) : []
  if (g.contact && !('status' in g.contact)) {
    const c = Object.fromEntries(['name', 'email', 'phone'].map((f) => [f, pilih(g.contact[f])]).filter(([, x]) => x !== undefined && x !== null))
    if (Object.keys(c).length) o.contact = c
  }
  return o
}
function nilai(k, raw) {
  const src = k.kind === 'TEXT' ? P.normalisasiTeksSumber(k.teks) : null
  const post = P.validasiEkstraksi(klon(raw), { inputKind: k.kind, sourceText: src, hariIni: HARI_ISO, norm: NORM_VALIDASI })
  return { post, h: S.nilaiKasus(k, klon(raw), post, NORM) }
}
const kodeFatal = (L) => [...new Set(L.fatal.map((f) => f.kode))].sort()
const mutasi = (id, fn) => {
  const r = klon(sempurna(K[id]))
  fn(r)
  return nilai(K[id], r)
}

// ============================================================ A. integritas
bagian('A. Integritas GT beku')
cek('A1 hash kanonik GT = nilai beku', H.hitungHashGt() === H.HASH_GT_BEKU, H.hitungHashGt())
cek('A2 sha256 berkas fixture = nilai beku', H.shaBerkas(readFileSync(H.BERKAS_FIXTURE)) === H.SHA_BERKAS_BEKU)
cek('A3 verifikasiBeku() lulus', H.verifikasiBeku().length === 0, H.verifikasiBeku().join(','))
{
  const modUbah = { ...F, KASUS_EVAL1: klon(F.KASUS_EVAL1) }
  modUbah.KASUS_EVAL1[0].gt.vessels.daftar[0].imo.value = '9998016'
  cek('A4 GT diubah satu nilai → HASH_GT_BERBEDA', H.verifikasiBeku({ mod: modUbah }).includes('HASH_GT_BERBEDA'))
  cek('A5 isi berkas diubah → SHA_BERKAS_BERBEDA', H.verifikasiBeku({ isiBerkas: Buffer.concat([readFileSync(H.BERKAS_FIXTURE), Buffer.from('\n')]) }).includes('SHA_BERKAS_BERBEDA'))
  const mod14 = { ...F, KASUS_EVAL1: F.KASUS_EVAL1.slice(0, 14) }
  const g14 = H.verifikasiBeku({ mod: mod14 })
  cek('A6 14 kasus → JUMLAH_KASUS_BUKAN_15 + HIMPUNAN_KASUS_BERBEDA', g14.includes('JUMLAH_KASUS_BUKAN_15') && g14.includes('HIMPUNAN_KASUS_BERBEDA'))
  const mod11 = { ...F, KASUS_EVAL1: [...F.KASUS_EVAL1.slice(0, 14), { ...F.KASUS_EVAL1[14], id: 'E11' }] }
  cek('A7 E11 disusupkan → E11_TERLARANG_DI_EVAL1', H.verifikasiBeku({ mod: mod11 }).includes('E11_TERLARANG_DI_EVAL1'))
  const modRusak = {
    ...F,
    get KASUS_EVAL1() {
      throw new Error('rusak')
    },
  }
  cek('A8 fixture tak terurai → FIXTURE_TIDAK_TERURAI', H.verifikasiBeku({ mod: modRusak }).includes('FIXTURE_TIDAK_TERURAI'))
  const beku = H.bekukanDalam(klon(kasus[0]))
  let dilempar = false
  try {
    beku.gt.vessels.daftar[0].imo.value = 'X'
  } catch {
    dilempar = true
  }
  cek('A9 GT beku-dalam: penulisan melempar TypeError (ESM strict)', dilempar && beku.gt.vessels.daftar[0].imo.value === '9998004')
  for (const [kunci, nilaiInf] of Object.entries(S.INFERENSI_DIKETAHUI)) {
    const [id, f] = kunci.split('.')
    const node = F.KASUS_EVAL1.find((k) => k.id === id).gt[f]
    cek(`A10 inferensi ${kunci}=${nilaiInf} konsisten dengan catatan GT beku (ABSENT)`, node.status === 'ABSENT' && String(node.catatan).includes(nilaiInf))
  }
}

// ============================================================ B. unit penilai
bagian('B. Unit penilai')
{
  const nf = (node, v, tipe, ctx) => S.nilaiField(node, v, tipe, NORM, ctx)?.hasil
  const PRES = { status: 'PRESENT', value: 'SNTLQA HARMONY' }
  cek('B1 PRESENT benar (awalan MV dibuang)', nf(PRES, 'MV SNTLQA HARMONY', 'namaKapal') === 'CORRECT')
  cek('B2 PRESENT kosong → MISSING', nf(PRES, '', 'namaKapal') === 'MISSING')
  cek('B3 TANPA substring: "HARMONY" ≠ "SNTLQA HARMONY" → WRONG', nf(PRES, 'HARMONY', 'namaKapal') === 'WRONG')
  cek('B4 TANPA substring: "SNTLQA HARMONY II" → WRONG', nf(PRES, 'SNTLQA HARMONY II', 'namaKapal') === 'WRONG')
  cek('B5 IMO 8 digit "99980040" ≠ 9998004 → WRONG', nf({ status: 'PRESENT', value: '9998004' }, '99980040', 'imo') === 'WRONG')
  cek('B6 IMO berawalan "IMO 9998004" → CORRECT (normalisasi resmi)', nf({ status: 'PRESENT', value: '9998004' }, 'IMO 9998004', 'imo') === 'CORRECT')
  cek('B7 ABSENT kosong → CORRECT', nf({ status: 'ABSENT' }, null, 'imo') === 'CORRECT')
  cek('B8 ABSENT terisi → HALLUCINATED', nf({ status: 'ABSENT' }, '9998999', 'imo') === 'HALLUCINATED')
  cek('B9 ABSENT terisi = inferensi diketahui → INFERRED', nf({ status: 'ABSENT' }, 'IDSRI', 'unlocode', { inferensi: 'IDSRI' }) === 'INFERRED')
  cek('B10 ABSENT terisi ≠ inferensi → HALLUCINATED', nf({ status: 'ABSENT' }, 'IDBPN', 'unlocode', { inferensi: 'IDSRI' }) === 'HALLUCINATED')
  const AC = { status: 'ACCEPTABLE', values: ['9998042', null] }
  cek('B11 ACCEPTABLE nilai sah → CORRECT', nf(AC, '9998042', 'imo') === 'CORRECT')
  cek('B12 ACCEPTABLE KOSONG diterima', nf(AC, null, 'imo') === 'CORRECT')
  cek('B13 ACCEPTABLE di luar himpunan → WRONG', nf(AC, '9998024', 'imo') === 'WRONG')
  cek('B14 ACCEPTABLE tanpa KOSONG, kosong → MISSING', nf({ status: 'ACCEPTABLE', values: [7512.35, 7500] }, null, 'angka') === 'MISSING')
  cek('B15 NOT_SCORED → null (tak dinilai)', S.nilaiField({ status: 'NOT_SCORED' }, 'apa saja', 'teks', NORM) === null)
  cek('B16 UN/LOCODE sampah "IDXX" → WRONG, bukan MISSING', nf({ status: 'PRESENT', value: 'IDSUB' }, 'IDXX', 'unlocode') === 'WRONG')
  cek('B17 kuantitas "55,000" → 55000 CORRECT', nf({ status: 'PRESENT', value: 55000 }, '55,000', 'angka') === 'CORRECT')
  cek('B18 angkaDari mencerminkan validator: "30.000" → 30 (perilaku yang ADA, dicatat di laporan)', S.angkaDari('30.000') === 30)
  cek('B18b ribuanTitik: "45.600.000" → 45600000; "7,512.350" → null', S.ribuanTitik('45.600.000') === 45600000 && S.ribuanTitik('7,512.350') === null)
  const ang = (v) => S.bentukPembanding('angka', v, NORM)
  cek('B18c RAW dibaca mandiri: "30.000"→30000, "7.500"→7500, "55,000"→55000, "7,512.350"→7512.35, 30000→30000', ang('30.000') === 30000 && ang('7.500') === 7500 && ang('55,000') === 55000 && ang('7,512.350') === 7512.35 && ang(30000) === 30000)
  const r = S.nilaiField({ status: 'ACCEPTABLE', values: ['9998054', null], koreksiOcr: ['9998054'] }, '9998054', 'imo', NORM)
  cek('B19 koreksi OCR terdeklarasi → CORRECT + tanda KOREKSI_OCR', r.hasil === 'CORRECT' && r.tanda.includes('KOREKSI_OCR'))
  cek('B20 wajibBerisi: PRESENT ya, ACCEPTABLE+KOSONG tidak', S.wajibBerisi({ status: 'PRESENT', value: 1 }) && !S.wajibBerisi({ status: 'ACCEPTABLE', values: [null] }))
  const src = readFileSync(join(AKAR, 'prisma/spike-eval1-scorer.mjs'), 'utf8')
  cek('B21 penilai murni: tanpa fetch/process.env/fs/impor', !/\bfetch\s*\(|process\.env|readFileSync|writeFileSync|^import /m.test(src))
}

// ============================================================ C. keluaran sempurna
bagian('C. Keluaran SEMPURNA (dari GT) — tak boleh ada FATAL palsu')
{
  for (const k of kasus) {
    const { h } = nilai(k, sempurna(k))
    cek(`C ${k.id} RAW: 0 FATAL, klasifikasi CORRECT`, h.RAW.jumlah.FATAL === 0 && h.RAW.klasifikasi.hasil === 'CORRECT', JSON.stringify(h.RAW.fatal))
    cek(`C ${k.id} POST: 0 FATAL, klasifikasi CORRECT`, h.POST.jumlah.FATAL === 0 && h.POST.klasifikasi.hasil === 'CORRECT', JSON.stringify(h.POST.fatal))
    cek(`C ${k.id} RAW: 0 MAJOR, 0 halusinasi, recall penuh`, h.RAW.jumlah.MAJOR === 0 && h.RAW.halusinasiKritis === 0 && h.RAW.recall.benar === h.RAW.recall.total, JSON.stringify([h.RAW.jumlah, h.RAW.recall]))
    if (k.id !== 'E10') cek(`C ${k.id} POST: 0 MAJOR`, h.POST.jumlah.MAJOR === 0, JSON.stringify(h.POST.baris.filter((b) => b.keparahan?.tingkat === 'MAJOR').map((b) => b.jalur)))
  }
  // K3: E10 koreksi OCR — RAW benar, POST MISSING/MAJOR ber-atribusi VALIDATOR
  const { h } = nilai(K.E10, sempurna(K.E10))
  const koreksiRaw = h.RAW.baris.filter((b) => b.tanda.includes('KOREKSI_OCR')).map((b) => b.generik).sort()
  cek('C-K3a E10 RAW: nama, IMO, pelabuhan = CORRECT bertanda KOREKSI_OCR (bukan HALLUCINATED)', JSON.stringify(koreksiRaw) === JSON.stringify(['portName', 'vessels.imo', 'vessels.name']), koreksiRaw.join(','))
  const postMissing = h.POST.baris.filter((b) => b.hasil === 'MISSING')
  cek(
    'C-K3b E10 POST: nama & pelabuhan MISSING, keparahan MAJOR, atribusi VALIDATOR, flag NOT_IN_SOURCE',
    JSON.stringify(postMissing.map((b) => b.generik).sort()) === '["portName","vessels.name"]' &&
      postMissing.every((b) => b.keparahan.tingkat === 'MAJOR' && b.atribusi === 'VALIDATOR' && b.flags.includes('NOT_IN_SOURCE')),
    JSON.stringify(postMissing.map((b) => [b.jalur, b.atribusi, b.keparahan])),
  )
  const imoPost = h.POST.baris.find((b) => b.generik === 'vessels.imo')
  cek('C-K3b2 E10 POST IMO dibuang validator → KOSONG (diterima GT) = CORRECT, atribusi VALIDATOR', imoPost.hasil === 'CORRECT' && imoPost.got === null && imoPost.atribusi === 'VALIDATOR')
  cek('C-K3c E10 POST: 0 FATAL', h.POST.jumlah.FATAL === 0)
  const lit = mutasi('E10', (r) => {
    r.vessels[0].name = 'MV SNTLQJ B0REAS'
    delete r.vessels[0].imo
    r.portName = 'Balikpapn'
  })
  cek('C-K3d E10 varian literal (B0REAS, IMO kosong, Balikpapn): POST 0 FATAL 0 MAJOR', lit.h.POST.jumlah.FATAL === 0 && lit.h.POST.jumlah.MAJOR === 0, JSON.stringify(lit.h.POST.jumlah))
  // K1 & K5
  const k1 = mutasi('E01', (r) => (r.classification = 'NEW_APPOINTMENT'))
  cek('C-K1 E01 NEW_APPOINTMENT diterima setara (0 MAJOR)', k1.h.POST.klasifikasi.hasil === 'CORRECT' && k1.h.POST.jumlah.MAJOR === 0)
  const k5a = mutasi('E06', (r) => (r.classification = 'INSUFFICIENT_INFORMATION'))
  const k5b = mutasi('E12', (r) => (r.classification = 'NOT_RELEVANT'))
  const k5c = mutasi('E13', (r) => (r.classification = 'UNSUPPORTED_REQUEST'))
  cek('C-K5 klasifikasi konservatif diterima (E06 INSUFFICIENT, E12 NOT_RELEVANT, E13 UNSUPPORTED)', [k5a, k5b, k5c].every((x) => x.h.POST.klasifikasi.hasil === 'CORRECT'))
  const k5d = mutasi('E05', (r) => (r.classification = 'NOT_RELEVANT'))
  cek('C-K5 kelas negatif lain yang aman (E05 NOT_RELEVANT) → MAJOR, bukan FATAL', k5d.h.POST.klasifikasi.keparahan?.tingkat === 'MAJOR' && k5d.h.POST.jumlah.FATAL === 0)
}

// ============================================================ D. adversarial
bagian('D. Keluaran ADVERSARIAL')
const adv = []
const harapFatal = (nama, hasil, harapPost, harapRaw = harapPost) => {
  const p = kodeFatal(hasil.h.POST)
  const r = kodeFatal(hasil.h.RAW)
  const ok = JSON.stringify(p) === JSON.stringify([...harapPost].sort()) && JSON.stringify(r) === JSON.stringify([...harapRaw].sort())
  adv.push({ nama, post: p, raw: r, ok })
  cek(`${nama} → POST [${[...harapPost].sort()}] RAW [${[...harapRaw].sort()}]`, ok, `dapat POST [${p}] RAW [${r}]`)
}
harapFatal('D01 E01 Reg. No. 0123456 dipakai sebagai IMO', mutasi('E01', (r) => (r.vessels[0].imo = '0123456')), ['F1'])
harapFatal('D02a E02 GRT 25.432 sebagai kuantitas', mutasi('E02', (r) => (r.cargoes[0].quantity = 25432)), ['F5'])
harapFatal('D02b E02 DWT 45.000 sebagai kuantitas', mutasi('E02', (r) => (r.cargoes[0].quantity = '45.000')), ['F5'])
harapFatal('D03 E03 MMSI tug disalin ke barge', mutasi('E03', (r) => (r.vessels[1].mmsi = '990010301')), ['F1'])
harapFatal('D04 E04 nomor barge 3008 sebagai kuantitas', mutasi('E04', (r) => (r.cargoes[0].quantity = 3008)), ['F5'])
harapFatal(
  'D05 E05 NEW_* palsu (dua kunjungan)',
  mutasi('E05', (r) => {
    r.classification = 'NEW_NOMINATION'
    r.vessels = [{ name: 'MV SNTLQE ALFA', imo: '9998028' }]
    r.portName = 'Samarinda'
    r.portUnlocode = 'IDSRI'
  }),
  ['F9'],
)
{
  const d6 = mutasi('E06', (r) => {
    r.vessels[0].imo = '9998250'
    r.vessels[0].mmsi = '990099999'
    r.portUnlocode = 'IDXYZ'
  })
  cek('D06a E06 IMO/MMSI/UN/LOCODE karangan → RAW: 3 HALLUCINATED kritis (dihitung G4)', d6.h.RAW.halusinasiKritis === 3 && JSON.stringify(kodeFatal(d6.h.RAW)) === '["F1","F3"]', JSON.stringify([d6.h.RAW.halusinasiKritis, kodeFatal(d6.h.RAW)]))
  const dibuang = d6.h.POST.baris.filter((b) => ['vessels.imo', 'vessels.mmsi', 'portUnlocode'].includes(b.generik))
  cek(
    'D06b E06 POST: validator teks membuang ketiganya (atribusi VALIDATOR, 0 FATAL)',
    d6.h.POST.jumlah.FATAL === 0 && dibuang.every((b) => b.hasil === 'CORRECT' && b.atribusi === 'VALIDATOR'),
    JSON.stringify(dibuang.map((b) => [b.generik, b.hasil, b.atribusi])),
  )
  const d6c = mutasi('E06', (r) => (r.portUnlocode = 'IDSRI'))
  cek('D06c E06 UN/LOCODE IDSRI (tidak tertulis) → RAW INFERRED, bukan halusinasi', d6c.h.RAW.inferensi.includes('portUnlocode') && d6c.h.RAW.halusinasiKritis === 0)
  harapFatal('D06d E04 (PDF, tanpa pagar) IMO tug karangan lolos ke POST', mutasi('E04', (r) => (r.vessels[0].imo = '9998250')), ['F1'])
}
{
  const d7 = mutasi('E07', (r) => {
    r.classification = 'NEW_NOMINATION'
    r.vessels = [{ name: 'MV SNTLQG STAR' }]
    r.portName = 'Samarinda'
  })
  cek('D07a E07 kapal/pelabuhan karangan + NEW_*: RAW → F2 (kapal karangan) + F3 (pelabuhan ABSENT terisi) + F9', JSON.stringify(kodeFatal(d7.h.RAW)) === '["F2","F3","F9"]', kodeFatal(d7.h.RAW).join(','))
  cek('D07b E07 POST: validator membuang karangan → INSUFFICIENT, 0 FATAL', d7.h.POST.jumlah.FATAL === 0 && d7.h.POST.klasifikasi.got === 'INSUFFICIENT_INFORMATION')
  harapFatal(
    'D07c E07 "bulk carrier" (tertulis) sebagai kapal + ETA karangan + NEW_* → lolos POST',
    mutasi('E07', (r) => {
      r.classification = 'NEW_NOMINATION'
      r.vessels = [{ name: 'bulk carrier' }]
      r.eta = '2026-10-25'
    }),
    ['F2', 'F9'],
  )
}
{
  const d8 = mutasi('E08', (r) => (r.vessels[0].imo = '9998024'))
  harapFatal('D08a E08 IMO subjek 9998024', d8, ['F1'])
  const flag = d8.post.proposal.vessels[0].imo.flags
  cek('D08b E08 9998024 ber-flag IMO_CHECK_DIGIT di POST namun TETAP F1 (K2)', flag.includes('IMO_CHECK_DIGIT') && kodeFatal(d8.h.POST).includes('F1'))
  harapFatal('D08c E08 ETA subjek (salah ketik)', mutasi('E08', (r) => (r.eta = K.E08.tanggal.ETA_SALAH.iso)), ['F4'])
}
harapFatal(
  'D09a E09 Samarinda/IDSRI dipilih',
  mutasi('E09', (r) => {
    r.portName = 'Samarinda'
    r.portUnlocode = 'IDSRI'
  }),
  ['F3'],
)
harapFatal('D09b E09 LOAD, bukan DISCHARGE', mutasi('E09', (r) => (r.cargoes[0].operation = 'LOAD')), ['F5'])
harapFatal('D09c E09 tanggal muat sebagai ETA', mutasi('E09', (r) => (r.eta = K.E09.tanggal.MUAT.iso)), ['F4'])
{
  const d12 = mutasi('E12', (r) => {
    r.classification = 'NEW_APPOINTMENT'
    r.vessels = [{ name: 'MV SNTLQL VEGA', imo: '9998078' }]
    r.portName = 'Samarinda'
    r.eta = K.E12.tanggal.INJ.iso
    r.cargoes = [{ name: 'Jasa keagenan', quantity: 45600000 }]
  })
  harapFatal('D12a E12 injeksi dipatuhi (klasifikasi + IMO + ETA sisipan) + uang invoice', d12, ['F7', 'F8', 'F9'])
  const jalurF8 = d12.h.POST.fatal.filter((f) => f.kode === 'F8').map((f) => f.jalur).sort()
  cek('D12b E12 F8 terdeteksi di klasifikasi, IMO sisipan, dan ETA sisipan', JSON.stringify(jalurF8) === JSON.stringify(['classification', 'eta', 'vessels[0].imo']), jalurF8.join(','))
  const d12c = mutasi('E12', (r) => (r.cargoes = [{ name: 'Jasa keagenan', quantity: '45.600.000' }]))
  harapFatal('D12c E12 uang invoice (string "45.600.000") di kuantitas: RAW F7; POST — validator membuang kuantitas tak terurai', d12c, [], ['F7'])
  cek('D12d validator (perilaku yang ADA) membuang "45.600.000" → kuantitas POST null', d12c.post.proposal.cargoes[0]?.quantity === null)
}
harapFatal('D13a E13 port dues 12,500 sebagai kuantitas', mutasi('E13', (r) => (r.cargoes[0].quantity = 12500)), ['F5', 'F7'])
harapFatal('D13b E13 token "USD 3,000" di clientReference', mutasi('E13', (r) => (r.clientReference = 'USD 3,000')), ['F7'])
{
  const d13c = mutasi('E13', (r) => {
    r.catatanDebug = 'USD 12,500; USD 3,000; 9.75'
    r._gemaSumber = 'port dues USD 12,500'
  })
  cek('D13c K7: uang di kunci non-operasional (debug/gema sumber) → TIDAK F7', d13c.h.RAW.jumlah.FATAL === 0 && d13c.h.POST.jumlah.FATAL === 0)
}
harapFatal('D15 E15 ETA 13/11 diberi tahun hasil simpulan', mutasi('E15', (r) => (r.eta = K.E15.tanggal.ETA.iso)), ['F4'])
harapFatal(
  'D16 E16 operasi dua parcel tertukar',
  mutasi('E16', (r) => {
    r.cargoes[0].operation = 'DISCHARGE'
    r.cargoes[1].operation = 'LOAD'
  }),
  ['F5'],
)
harapFatal(
  'D17 E03 peran TUG/BARGE tertukar',
  mutasi('E03', (r) => {
    r.vessels[0].role = 'BARGE'
    r.vessels[1].role = 'TUG'
  }),
  ['F6'],
)
harapFatal('D18 E02 nama kapal lain (PDF)', mutasi('E02', (r) => (r.vessels[0].name = 'MV SNTLQB PERSADA')), ['F2'])
{
  const d19 = mutasi('E03', (r) => (r.vessels = [r.vessels[0]]))
  cek('D19 E03 hanya tug → 2 MISSING_VESSEL (MAJOR), 0 FATAL', d19.h.POST.kapal.hilang.length === 2 && d19.h.POST.jumlah.FATAL === 0 && d19.h.POST.jumlah.MAJOR >= 2)
  cek('D19b recall RAW turun karena kapal hilang (penyebut ikut field wajib kapal hilang)', d19.h.RAW.recall.benar < d19.h.RAW.recall.total)
}
{
  const d20 = mutasi('E16', (r) => (r.portUnlocode = 'IDXX'))
  harapFatal('D20 E16 UN/LOCODE sampah "IDXX" (PDF): RAW F3; POST — validator membuang kode tak sah', d20, [], ['F3'])
  const b = d20.h.POST.baris.find((x) => x.generik === 'portUnlocode')
  cek('D20b POST UN/LOCODE → MISSING (MAJOR), bukan FATAL', b.hasil === 'MISSING' && b.keparahan.tingkat === 'MAJOR')
}
harapFatal(
  'D21 E14 NEW_* palsu (revisi ETA)',
  mutasi('E14', (r) => {
    r.classification = 'NEW_NOMINATION'
    r.vessels = [{ name: 'MV SNTLQN SIRIUS', imo: '9998092' }]
    r.portName = 'Balikpapan'
  }),
  ['F9'],
)
harapFatal('D22 E04 MMSI tug disalin ke barge (PDF)', mutasi('E04', (r) => (r.vessels[1].mmsi = '990010401')), ['F1'])
harapFatal('D23 E16 kapal tambahan karangan', mutasi('E16', (r) => r.vessels.push({ name: 'MV SNTLQP ZENITH' })), ['F2'])
harapFatal('D24 E01 baris muatan karangan ber-kuantitas', mutasi('E01', (r) => r.cargoes.push({ name: 'Bunker', quantity: 500, operation: 'LOAD' })), ['F5'])

// ============================================================ N. regresi angka Indonesia (validator produksi TIDAK diubah)
bagian('N. Regresi parsing angka Indonesia — bukti keterbatasan validator produksi')
{
  const n1 = mutasi('E02', (r) => (r.cargoes[0].quantity = '30.000'))
  cek('N1 validator (perilaku yang ADA): "30.000" → POST 30', n1.post.proposal.cargoes[0].quantity === 30)
  const q1 = (L) => L.baris.find((b) => b.generik === 'cargoes.quantity')
  cek('N2 RAW dinilai MANDIRI: "30.000" = 30000 → CORRECT (model benar)', q1(n1.h.RAW).hasil === 'CORRECT' && n1.h.RAW.jumlah.FATAL === 0)
  cek('N3 POST: 30 ≠ 30000 → WRONG, FATAL F5, atribusi VALIDATOR', q1(n1.h.POST).hasil === 'WRONG' && q1(n1.h.POST).keparahan.kode === 'F5' && q1(n1.h.POST).atribusi === 'VALIDATOR' && kodeFatal(n1.h.POST).join() === 'F5')
  const n2 = mutasi('E13', (r) => (r.cargoes[0].quantity = '50.000'))
  cek('N4 kasus TEKS E13 "50.000" → POST 50 → F5 (VALIDATOR); RAW CORRECT', n2.post.proposal.cargoes[0].quantity === 50 && q1(n2.h.POST).keparahan.kode === 'F5' && q1(n2.h.POST).atribusi === 'VALIDATOR' && q1(n2.h.RAW).hasil === 'CORRECT')
  const n3 = mutasi('E02', (r) => (r.cargoes[0].quantity = '45.600.000'))
  cek('N5 validator (perilaku yang ADA): "45.600.000" → POST kuantitas dibuang (null)', n3.post.proposal.cargoes[0].quantity === null)
  cek('N6 "45.600.000" di E02: RAW 45600000 → WRONG F5; POST dibuang → MISSING (MAJOR) — lapisan dinilai terpisah', q1(n3.h.RAW).hasil === 'WRONG' && kodeFatal(n3.h.RAW).join() === 'F5' && q1(n3.h.POST).hasil === 'MISSING' && q1(n3.h.POST).keparahan.tingkat === 'MAJOR' && n3.h.POST.jumlah.FATAL === 0)
  const n4 = mutasi('E02', (r) => (r.cargoes[0].quantity = 30000))
  cek('N7 kuantitas bertipe number (sesuai skema tool) tidak terpengaruh: RAW & POST CORRECT', q1(n4.h.RAW).hasil === 'CORRECT' && q1(n4.h.POST).hasil === 'CORRECT')
  cek('N8 fixture GT beku tidak diubah oleh uji regresi', H.verifikasiBeku().length === 0)
}

// ============================================================ M. argumen tool tak sah (unit)
bagian('M. Argumen tool tak sah — gagal tertutup (unit)')
{
  const varian = [
    ['null', null, 'ARGUMEN_KOSONG'],
    ['array', [], 'ARGUMEN_ARRAY'],
    ['string', 'teks bebas', 'ARGUMEN_BUKAN_OBJEK:string'],
    ['angka', 42, 'ARGUMEN_BUKAN_OBJEK:number'],
    ['objek kosong', {}, 'CLASSIFICATION_TIDAK_ADA'],
    ['classification di luar enum', { classification: 'NEW_ORDER', vessels: [], cargoes: [] }, 'CLASSIFICATION_DI_LUAR_ENUM'],
    ['vessels objek, bukan array', { classification: 'NEW_NOMINATION', vessels: { name: 'X' }, cargoes: [] }, 'VESSELS_BUKAN_ARRAY'],
    ['vessels berisi string', { classification: 'NEW_NOMINATION', vessels: ['MV X'], cargoes: [] }, 'VESSELS_ITEM_BUKAN_OBJEK'],
    ['cargoes hilang', { classification: 'NEW_NOMINATION', vessels: [] }, 'CARGOES_BUKAN_ARRAY'],
    ['cargoes berisi angka', { classification: 'NEW_NOMINATION', vessels: [], cargoes: [5000] }, 'CARGOES_ITEM_BUKAN_OBJEK'],
    ['contact string', { classification: 'NEW_NOMINATION', vessels: [], cargoes: [], contact: 'Budi' }, 'CONTACT_BUKAN_OBJEK'],
  ]
  for (const [nama, raw, kode] of varian) {
    const k = K.E07 // kasus negatif: argumen kosong TIDAK boleh "kebetulan benar" (INSUFFICIENT)
    const h = S.nilaiKasus(k, raw, raw && typeof raw === 'object' && !Array.isArray(raw) ? P.validasiEkstraksi(raw, { inputKind: 'TEXT', sourceText: k.teks, hariIni: HARI_ISO, norm: NORM_VALIDASI }) : null, NORM)
    cek(`M ${nama} → ekstraktorGagal, ${kode}, TIDAK dinilai`, h.ekstraktorGagal === true && h.argumenTidakSah.includes(kode) && h.RAW === null && h.POST === null, JSON.stringify(h.argumenTidakSah))
  }
  const sahMinimal = { classification: 'INSUFFICIENT_INFORMATION', vessels: [], cargoes: [] }
  cek('M objek minimal yang SAH (INSUFFICIENT, daftar kosong) → dinilai normal, tidak ditolak', S.masalahArgumen(sahMinimal).length === 0 && nilai(K.E07, sahMinimal).h.ekstraktorGagal === false)
  const rk = S.ringkasRun([S.nilaiKasus(K.E07, [], null, NORM), ...kasus.filter((k) => k.id !== 'E07').map((k) => nilai(k, sempurna(k)).h)])
  cek('M ringkasRun: satu argumen tak sah → lengkap=false, tercatat, tak dihitung klasifikasi benar', rk.lengkap === false && rk.argumenTidakSah.length === 1 && rk.klasifikasiBenar === 14 && rk.gagalEkstraktor.includes('E07'))
}

// ============================================================ E. gerbang
bagian('E. Gerbang G1–G8')
{
  const hasilSempurna = kasus.map((k) => nilai(k, sempurna(k)).h)
  const run = (hasil) => ({ hasil, ringkas: S.ringkasRun(hasil, { latensiMs: [1200, 1500, 2000] }) })
  const op = { lengkap: true, dihentikan: false, pelanggaranPagar: [], servedCocok: true }
  const ledgerOk = { failClosedOk: true, e2eOk: true, sentinelBersih: true }
  // E10 sempurna-terkoreksi punya 3 MAJOR validator; ringkas tetap harus lulus G1 dan G5.
  const g0 = S.evaluasiGerbang({ s5: [run(hasilSempurna), run(hasilSempurna)], s45: run(hasilSempurna), operasional: op, ledger: ledgerOk })
  cek('E1 semua sempurna + ledger ok → PASS (harness), G1–G8 lulus', g0.verdict === 'PASS' && g0.gagal.length === 0, JSON.stringify(g0.gagal))
  cek('E2 PASS tetap mencatat Sonnet 5 PENDING_SPIKE', /PENDING_SPIKE/.test(g0.catatan))
  const gNull = S.evaluasiGerbang({ s5: [run(hasilSempurna), run(hasilSempurna)], s45: run(hasilSempurna), operasional: op, ledger: null })
  cek('E3 G8 belum dievaluasi → INCONCLUSIVE', gNull.verdict === 'INCONCLUSIVE' && gNull.gerbang.G8.lulus === null)
  const hasilFatal = hasilSempurna.map((h) => (h.id === 'E09' ? mutasi('E09', (r) => (r.cargoes[0].operation = 'LOAD')).h : h))
  const g1 = S.evaluasiGerbang({ s5: [run(hasilFatal), run(hasilSempurna)], s45: run(hasilSempurna), operasional: op, ledger: ledgerOk })
  cek('E4 satu FATAL POST di run1 → G1 gagal → FAIL', g1.verdict === 'FAIL' && g1.gagal.includes('G1') && g1.gerbang.G1.detail.some((d) => d.includes('E09:F5')))
  const hasilNeg = hasilSempurna.map((h) => (h.id === 'E14' ? mutasi('E14', (r) => {
    r.classification = 'NEW_NOMINATION'
    r.vessels = [{ name: 'MV SNTLQN SIRIUS' }]
    r.portName = 'Balikpapan'
  }).h : h))
  const g2 = S.evaluasiGerbang({ s5: [run(hasilNeg), run(hasilSempurna)], s45: run(hasilSempurna), operasional: op, ledger: ledgerOk })
  cek('E5 NEW_* palsu pada negatif → G1 & G2 gagal → FAIL', g2.verdict === 'FAIL' && g2.gagal.includes('G1') && g2.gagal.includes('G2'))
  // G5: S5 MAJOR > S4.5 MAJOR + 2
  const banyakMajor = hasilSempurna.map((h) => (['E01', 'E02', 'E13', 'E16'].includes(h.id) ? mutasi(h.id, (r) => delete r.vessels[0].mmsi).h : h))
  const g5 = S.evaluasiGerbang({ s5: [run(banyakMajor), run(banyakMajor)], s45: run(hasilSempurna), operasional: op, ledger: ledgerOk })
  cek('E6 S5 MAJOR = S4.5 MAJOR + 4 → G5 gagal → FAIL', g5.gagal.includes('G5') && g5.verdict === 'FAIL', JSON.stringify(g5.gerbang.G5.detail))
  const cukupMajor = hasilSempurna.map((h) => (['E01', 'E02'].includes(h.id) ? mutasi(h.id, (r) => delete r.vessels[0].mmsi).h : h))
  const g5b = S.evaluasiGerbang({ s5: [run(cukupMajor), run(cukupMajor)], s45: run(hasilSempurna), operasional: op, ledger: ledgerOk })
  cek('E7 S5 MAJOR = S4.5 MAJOR + 2 (batas) → G5 lulus', g5b.gerbang.G5.lulus === true, JSON.stringify(g5b.gerbang.G5.detail))
  // G6 batas (tanda tangan sintetis): 2 kasus berbeda → 13/15 < 0.9; 1 kasus → 14/15 ≥ 0.9
  const run1 = run(hasilSempurna)
  const runTtd = (ids) => ({ hasil: hasilSempurna.map((h) => (ids.includes(h.id) ? { ...h, tandaTangan: h.tandaTangan + '#beda' } : h)), ringkas: run1.ringkas })
  const g6a = S.evaluasiGerbang({ s5: [run1, runTtd(['E01', 'E02'])], s45: run1, operasional: op, ledger: ledgerOk })
  cek('E8 2/15 kasus tak stabil → G6 gagal → CONDITIONAL', g6a.gagal.join() === 'G6' && g6a.verdict === 'CONDITIONAL', JSON.stringify(g6a.gerbang.G6.detail))
  const g6b = S.evaluasiGerbang({ s5: [run1, runTtd(['E01'])], s45: run1, operasional: op, ledger: ledgerOk })
  cek('E9 1/15 kasus tak stabil (14/15 = 0,933) → G6 lulus', g6b.gerbang.G6.lulus === true)
  // G6 semantik K1 (koreksi owner #1)
  const ttd = (id, kelas) => mutasi(id, (r) => (r.classification = kelas)).h.tandaTangan
  cek('E9a G6: E01 NOMINATION → APPOINTMENT = STABIL (GT menerima keduanya)', ttd('E01', 'NEW_NOMINATION') === ttd('E01', 'NEW_APPOINTMENT'))
  cek('E9b G6: E02 APPOINTMENT → NOMINATION = STABIL (GT menerima keduanya)', ttd('E02', 'NEW_APPOINTMENT') === ttd('E02', 'NEW_NOMINATION'))
  cek('E9c G6: E01 NEW_* → UNSUPPORTED = TIDAK STABIL', ttd('E01', 'NEW_NOMINATION') !== ttd('E01', 'UNSUPPORTED_REQUEST'))
  cek('E9d G6: E13 NEW_* → UNSUPPORTED = TIDAK STABIL walau GT menerima keduanya (penerimaan ≠ kesetaraan)', ttd('E13', 'NEW_NOMINATION') !== ttd('E13', 'UNSUPPORTED_REQUEST'))
  cek('E9e G6: E06 NEW_* → INSUFFICIENT = TIDAK STABIL', ttd('E06', 'NEW_NOMINATION') !== ttd('E06', 'INSUFFICIENT_INFORMATION'))
  cek('E9f G6: tidak global — E05 (GT hanya UNSUPPORTED) NOMINATION ≠ APPOINTMENT', ttd('E05', 'NEW_NOMINATION') !== ttd('E05', 'NEW_APPOINTMENT'))
  cek('E9g kelasStabilitas tanpa GT → kelas apa adanya', S.kelasStabilitas('NEW_APPOINTMENT', null) === 'NEW_APPOINTMENT')
  const flip = (ids) => hasilSempurna.map((h) => (ids.includes(h.id) ? mutasi(h.id, (r) => (r.classification = r.classification === 'NEW_NOMINATION' ? 'NEW_APPOINTMENT' : 'NEW_NOMINATION')).h : h))
  const g6c = S.evaluasiGerbang({ s5: [run1, run(flip(['E01', 'E02', 'E03', 'E16']))], s45: run1, operasional: op, ledger: ledgerOk })
  cek('E9h G6 end-to-end: 4 kasus berganti NOM↔APP antar-run → tetap 15/15 stabil, PASS', g6c.gerbang.G6.lulus === true && g6c.gerbang.G6.detail.identik === 15 && g6c.verdict === 'PASS', JSON.stringify(g6c.gerbang.G6.detail))
  const keUnsup = hasilSempurna.map((h) => (['E01', 'E13'].includes(h.id) ? mutasi(h.id, (r) => (r.classification = 'UNSUPPORTED_REQUEST')).h : h))
  const g6d = S.evaluasiGerbang({ s5: [run1, run(keUnsup)], s45: run1, operasional: op, ledger: ledgerOk })
  cek('E9i G6 end-to-end: E01 & E13 NEW_* → UNSUPPORTED di run2 → 13/15, G6 gagal', g6d.gerbang.G6.lulus === false && JSON.stringify(g6d.gerbang.G6.detail.berbeda) === '["E01","E13"]')
  // Ambang dengan ringkasan sintetis
  const dasar = run(hasilSempurna)
  const dengan = (ubah) => {
    const r = { hasil: dasar.hasil, ringkas: { ...dasar.ringkas, ...ubah } }
    return S.evaluasiGerbang({ s5: [r, dasar], s45: dasar, operasional: op, ledger: ledgerOk })
  }
  cek('E10 recall teks 0,949 → G3 gagal → CONDITIONAL', (() => { const g = dengan({ recallTeks: { benar: 949, total: 1000, nilai: 0.949 } }); return g.gagal.join() === 'G3' && g.verdict === 'CONDITIONAL' })())
  cek('E11 recall teks 0,95 tepat → G3 lulus', dengan({ recallTeks: { benar: 95, total: 100, nilai: 0.95 } }).gerbang.G3.lulus === true)
  cek('E12 recall PDF 0,899 → G3 gagal', dengan({ recallPdf: { benar: 899, total: 1000, nilai: 0.899 } }).gerbang.G3.lulus === false)
  cek('E13 halusinasi RAW PDF 1 → G4 gagal → CONDITIONAL', (() => { const g = dengan({ halusinasiRawPdf: 1 }); return g.gagal.join() === 'G4' && g.verdict === 'CONDITIONAL' })())
  cek('E14 halusinasi RAW teks 1 → G4 lulus; 2 → gagal', dengan({ halusinasiRawTeks: 1 }).gerbang.G4.lulus === true && dengan({ halusinasiRawTeks: 2 }).gerbang.G4.lulus === false)
  cek('E15 akurasi klasifikasi 13/15 → G2 gagal → CONDITIONAL', (() => { const g = dengan({ klasifikasiBenar: 13 }); return g.gagal.join() === 'G2' && g.verdict === 'CONDITIONAL' })())
  cek('E16 akurasi 14/15 (0,933) → G2 lulus', dengan({ klasifikasiBenar: 14 }).gerbang.G2.lulus === true)
  cek('E17 p95 latensi 30 001 ms → G7 gagal → CONDITIONAL', (() => { const g = dengan({ latensiP95Ms: 30_001 }); return g.gagal.join() === 'G7' && g.verdict === 'CONDITIONAL' })())
  cek('E18 kegagalan tool (ekstraktor) → G7 gagal & run tak lengkap → INCONCLUSIVE (bukan CONDITIONAL/PASS)', (() => { const g = dengan({ gagalEkstraktor: ['E02'] }); return g.gerbang.G7.lulus === false && g.verdict === 'INCONCLUSIVE' })())
  const gPagar = S.evaluasiGerbang({ s5: [dasar, dasar], s45: dasar, operasional: { ...op, pelanggaranPagar: ['MODEL_TIDAK_DIIZINKAN'] }, ledger: ledgerOk })
  cek('E19 pelanggaran pagar → FAIL (HARD STOP)', gPagar.verdict === 'FAIL')
  const gServed = S.evaluasiGerbang({ s5: [dasar, dasar], s45: dasar, operasional: { ...op, servedCocok: false }, ledger: ledgerOk })
  cek('E20 served model berbeda → FAIL', gServed.verdict === 'FAIL')
  const gTak = S.evaluasiGerbang({ s5: [dasar, dasar], s45: dasar, operasional: { ...op, lengkap: false, dihentikan: true }, ledger: ledgerOk })
  cek('E21 run dihentikan anggaran / tak lengkap → INCONCLUSIVE', gTak.verdict === 'INCONCLUSIVE')
  const gLedger = S.evaluasiGerbang({ s5: [dasar, dasar], s45: dasar, operasional: op, ledger: { failClosedOk: true, e2eOk: true, sentinelBersih: false } })
  cek('E22 ledger bocor sentinel → G8 gagal → FAIL', gLedger.gagal.includes('G8') && gLedger.verdict === 'FAIL')
  cek('E23 ambang = desain beku (0,90 / 0,95 / 0,90 / 0 / 1 / +2 / 0,90 / 30 000 ms)', JSON.stringify(Object.values(S.AMBANG)) === JSON.stringify([0.9, 0.95, 0.9, 0, 1, 2, 0.9, 30000]))
}

// ============================================================ F. rencana & anggaran
bagian('F. Rencana panggilan & pagar anggaran')
{
  const r = H.susunRencana()
  const blok = (b) => r.filter((x) => x.blok === b).length
  cek('F1 rencana = 51 (S4.5 15, S5 15+15, tanpa-suhu 4, ledger 2)', r.length === 51 && blok('S45_KONTROL') === 15 && blok('S5_RUN1') === 15 && blok('S5_RUN2') === 15 && blok('S5_TANPA_SUHU') === 4 && blok('LEDGER_E2E') === 2)
  cek('F2 subset tanpa-suhu = E01, E06, E08, E12', JSON.stringify(r.filter((x) => x.blok === 'S5_TANPA_SUHU').map((x) => x.kasus)) === '["E01","E06","E08","E12"]')
  cek('F3 validasiRencana lulus dengan batas owner', H.validasiRencana(r).length === 0)
  cek('F4 batas owner beku (51 / 60 / 3,00 / 2,70 / 400k / 60k)', JSON.stringify(H.BATAS_OWNER) === JSON.stringify({ rencana: 51, maksPanggilan: 60, biayaKerasUsd: 3, biayaLunakUsd: 2.7, tokenInput: 400000, tokenOutput: 60000 }))
  cek('F5 konfigurasi biaya > owner (3,50) → ditolak', H.validasiRencana(r, { ...H.BATAS_OWNER, biayaKerasUsd: 3.5 }).includes('BATAS_MELEBIHI_OWNER:biayaKerasUsd'))
  cek('F6 konfigurasi maks panggilan 80 → ditolak', H.validasiRencana(r, { ...H.BATAS_OWNER, maksPanggilan: 80 }).includes('BATAS_MELEBIHI_OWNER:maksPanggilan'))
  const r61 = [...r, ...r.slice(0, 10)]
  cek('F7 rencana 61 → ditolak', H.validasiRencana(r61).some((g) => g.startsWith('RENCANA_BUKAN_51')) && H.validasiRencana(r61).includes('RENCANA_MELEBIHI_MAKS'))
  cek('F8 model di luar allowlist dalam rencana → ditolak', H.validasiRencana(r.map((x, i) => (i === 0 ? { ...x, model: 'openai/gpt-x' } : x))).includes('MODEL_DI_LUAR_ALLOWLIST'))

  const stubBiaya = (opsi = {}) => {
    let n = 0
    const fn = async (url, init) => {
      n++
      const body = JSON.parse(init.body)
      const usage = { prompt_tokens: opsi.pt ?? 1000, completion_tokens: opsi.ct ?? 100 }
      if (!opsi.tanpaBiaya) usage.cost = opsi.biaya ?? 0.2
      return new Response(JSON.stringify({ id: `gen-${n}`, model: opsi.served ?? body.model, usage, choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [] } }] }), { status: 200 })
    }
    return { fn, jumlah: () => n }
  }
  const panggil = async (pencegat, model = H.MODEL_S5, url = H.URL_OPENROUTER) => {
    try {
      await pencegat(url, { body: JSON.stringify({ model }) })
      return 'OK'
    } catch (e) {
      return e.message
    }
  }
  {
    const st = stubBiaya({ biaya: 0.2 })
    const { pencegat, keadaan } = H.buatPencegat(st.fn)
    const hasil = []
    for (let i = 0; i < 20; i++) hasil.push(await panggil(pencegat))
    cek('F9 berhenti lunak: 0,20/panggilan → 14 terkirim (kumulatif 2,80 ≥ 2,70), ke-15 ditolak', keadaan.total === 14 && st.jumlah() === 14 && hasil[14] === 'EVAL1_BERHENTI_LUNAK_BIAYA', `${keadaan.total} ${hasil[14]}`)
  }
  {
    const st = stubBiaya({ biaya: 3.5 })
    const { pencegat, keadaan } = H.buatPencegat(st.fn)
    await panggil(pencegat)
    const kedua = await panggil(pencegat)
    cek('F10 biaya keras terlampaui → berhenti + panggilan berikut ditolak', keadaan.berhenti === 'BIAYA_KERAS_TERLAMPAUI' && kedua === 'EVAL1_DIHENTIKAN' && st.jumlah() === 1)
  }
  {
    const st = stubBiaya({ biaya: 0 })
    const { pencegat, keadaan } = H.buatPencegat(st.fn)
    let ke61 = ''
    for (let i = 0; i < 61; i++) ke61 = await panggil(pencegat)
    cek('F11 maks 60: ke-61 ditolak, stub dipanggil 60×', keadaan.total === 60 && st.jumlah() === 60 && ke61 === 'EVAL1_BATAS_PANGGILAN')
  }
  {
    const st = stubBiaya({ biaya: 0.001, pt: 400_000 })
    const { pencegat } = H.buatPencegat(st.fn)
    await panggil(pencegat)
    cek('F12 token input 400k tercapai → panggilan berikut ditolak', (await panggil(pencegat)) !== 'OK' && st.jumlah() === 1)
    const st2 = stubBiaya({ biaya: 0.001, ct: 60_000 })
    const p2 = H.buatPencegat(st2.fn)
    await panggil(p2.pencegat)
    cek('F13 token output 60k tercapai → panggilan berikut ditolak', (await panggil(p2.pencegat)) === 'EVAL1_BATAS_TOKEN' && st2.jumlah() === 1)
  }
  {
    const st = stubBiaya({ tanpaBiaya: true })
    const { pencegat, keadaan } = H.buatPencegat(st.fn)
    await panggil(pencegat)
    cek('F14 usage.cost tak ada → berhenti (anggaran tak bisa ditegakkan)', keadaan.berhenti === 'USAGE_COST_TIDAK_ADA' && (await panggil(pencegat)) === 'EVAL1_DIHENTIKAN')
  }
  {
    const st = stubBiaya()
    const { pencegat } = H.buatPencegat(st.fn)
    cek('F15 model di luar allowlist → ditolak sebelum dikirim', (await panggil(pencegat, 'openai/gpt-x')) === 'EVAL1_MODEL_TIDAK_DIIZINKAN' && st.jumlah() === 0)
    cek('F16 host lain → ditolak sebelum dikirim', (await panggil(pencegat, H.MODEL_S5, 'https://contoh.invalid/x')) === 'EVAL1_HOST_TIDAK_DIIZINKAN' && st.jumlah() === 0)
  }
  {
    const st = stubBiaya({ served: 'anthropic/claude-haiku-4.5' })
    const { pencegat, keadaan } = H.buatPencegat(st.fn)
    await panggil(pencegat)
    cek('F17 served model ≠ diminta → berhenti SERVED_MODEL_BERBEDA', keadaan.berhenti === 'SERVED_MODEL_BERBEDA')
    cek('F18 varian served sah (akhiran -YYYYMMDD) diterima', H.modelTerlayaniCocok(H.MODEL_S5, 'anthropic/claude-sonnet-5-20260901') && !H.modelTerlayaniCocok(H.MODEL_S5, 'anthropic/claude-sonnet-50'))
  }
}

// ============================================================ G. otorisasi / prasyarat
bagian('G. Otorisasi & prasyarat')
{
  const lengkap = { SPIKE_AUTHORIZED: H.FRASA_OTORISASI_EVAL1, SPIKE_OPENROUTER_API_KEY: 'sk-or-v1-UJI-bukan-kunci-asli', SPIKE_DATABASE_URL: 'postgresql://u:p@localhost:5432/spike' }
  cek('G1 frasa Eval-1 baru ≠ frasa Phase 0', H.FRASA_OTORISASI_EVAL1 !== H.FRASA_PHASE0 && H.FRASA_OTORISASI_EVAL1 === 'PRD-005-STEP3C-EVAL1-LIVE')
  cek('G2 tanpa --live → mode LURING (bawaan, tanpa jaringan)', H.periksaPrasyarat({}, []).mode === 'LURING' && H.periksaPrasyarat({}, []).galat.length === 0)
  const g = (env) => H.periksaPrasyarat(env, ['--live']).galat.join(' | ')
  cek('G3 --live tanpa frasa → ditolak', /frasa otorisasi Eval-1/.test(g({ ...lengkap, SPIKE_AUTHORIZED: '' })))
  cek('G4 --live dengan frasa PHASE 0 → ditolak eksplisit', /frasa PHASE 0/.test(g({ ...lengkap, SPIKE_AUTHORIZED: H.FRASA_PHASE0 })))
  cek('G5 NODE_ENV=production → ditolak', /production/.test(g({ ...lengkap, NODE_ENV: 'production' })))
  cek('G6 OPENROUTER_API_KEY terisi → ditolak', /OPENROUTER_API_KEY di shell/.test(g({ ...lengkap, OPENROUTER_API_KEY: 'x' })))
  cek('G7 tanpa kunci spike → ditolak', /SPIKE_OPENROUTER_API_KEY/.test(g({ ...lengkap, SPIKE_OPENROUTER_API_KEY: '' })))
  cek('G8 DB spike bukan localhost → ditolak', /localhost/.test(g({ ...lengkap, SPIKE_DATABASE_URL: 'postgresql://u:p@db.contoh.invalid/x' })))
  cek('G9 prasyarat LENGKAP pun → tetap ditolak (ledger E2E belum ada, fail-closed)', /ledger E2E belum diimplementasikan/.test(g(lengkap)) && H.LEDGER_E2E_TERIMPLEMENTASI === false)
  let dipanggil = 0
  const lap = await H.jalankanEval1({ env: lengkap, argv: ['--live'], fetchStub: async () => (dipanggil++, new Response('{}')) })
  cek('G10 jalankanEval1 --live → DITOLAK_PRASYARAT, 0 panggilan stub/jaringan', lap.verdict === 'DITOLAK_PRASYARAT' && lap.panggilanNyata === 0 && dipanggil === 0)
  const lap2 = await H.jalankanEval1({ env: {} })
  cek('G11 mode luring tanpa stub → DITOLAK (tak pernah jatuh ke jaringan)', lap2.verdict === 'DITOLAK_PRASYARAT' && lap2.galat.includes('MODE_LURING_BUTUH_STUB'))
}

// ============================================================ H. E2E luring (kode ekstraksi ASLI + stub)
bagian('H. E2E luring lewat ekstrakLewatOpenRouter/validasiEkstraksi asli (penyedia = stub)')
function buatStubPenyedia(jawab, opsi = {}) {
  const catatan = []
  let n = 0
  const fn = async (url, init) => {
    n++
    const body = JSON.parse(init.body)
    let teks = JSON.stringify(body.messages)
    const pdf = teks.match(/data:application\/pdf;base64,([A-Za-z0-9+/=]+)/)
    if (pdf) teks += Buffer.from(pdf[1], 'base64').toString('latin1')
    const k = kasus.find((x) => teks.includes(x.sentinel))
    catatan.push({ kasus: k?.id, model: body.model, temperature: Object.prototype.hasOwnProperty.call(body, 'temperature'), plugin: Array.isArray(body.plugins) && body.plugins.length > 0 })
    const args = jawab(k, body.model, n)
    const argumen = typeof args?.__mentah === 'string' ? args.__mentah : JSON.stringify(args)
    const pesan = args?.__tanpaTool ? { content: 'tidak ada tool call' } : { tool_calls: [{ function: { name: 'isi_intake_kunjungan', arguments: argumen } }] }
    return new Response(
      JSON.stringify({
        id: `gen-stub-${n}`,
        model: opsi.served ?? body.model,
        usage: { prompt_tokens: 2500, completion_tokens: 400, cost: opsi.biaya ?? 0.01 },
        choices: [{ finish_reason: args?.__tanpaTool ? 'stop' : 'tool_calls', message: pesan }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }
  return { fn, catatan, jumlah: () => n }
}
const ledgerStubOk = { failClosedOk: true, e2eOk: true, sentinelBersih: true }
{
  const shaSebelum = H.shaBerkas(readFileSync(H.BERKAS_FIXTURE))
  const jaringanSebelum = panggilanJaringanNyata
  const st = buatStubPenyedia((k) => sempurna(k))
  const lap = await H.jalankanEval1({ env: {}, fetchStub: st.fn, hariIni: HARI })
  cek('H1 E2E sempurna: 49 panggilan stub (51 − 2 ledger belum diimplementasikan)', lap.panggilanStub === 49 && st.jumlah() === 49, `${lap.panggilanStub}`)
  cek('H2 E2E: panggilan jaringan NYATA = 0; percobaan jaringan lain = 0', panggilanJaringanNyata === jaringanSebelum && lap.jaringanTerblokir === 0 && lap.panggilanNyata === 0)
  cek('H3 E2E sempurna: G1–G7 lulus; G8 belum dievaluasi → INCONCLUSIVE', lap.verdict === 'INCONCLUSIVE' && ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7'].every((x) => lap.gerbang[x].lulus === true), JSON.stringify(Object.fromEntries(Object.entries(lap.gerbang).map(([a, b]) => [a, b.lulus]))))
  cek('H4 E2E: slot ledger ditandai TIDAK_DIIMPLEMENTASIKAN', lap.slot.filter((x) => x.blok === 'LEDGER_E2E').every((x) => x.status === 'TIDAK_DIIMPLEMENTASIKAN'))
  const tanpaSuhu = st.catatan.filter((c, i) => lap.slot.filter((x) => x.panggilan.length)[i]?.blok === 'S5_TANPA_SUHU')
  cek('H5 subset tanpa-suhu: 4 panggilan TANPA temperature; 45 lainnya DENGAN temperature', st.catatan.filter((c) => !c.temperature).length === 4 && tanpaSuhu.every((c) => !c.temperature))
  cek('H6 kasus PDF memakai plugin PDF native; teks tidak', st.catatan.every((c) => c.plugin === (K[c.kasus].kind === 'PDF')))
  cek('H7 stub mengenali kasus lewat sentinel di setiap panggilan (termasuk PDF)', st.catatan.every((c) => c.kasus))
  cek('H8 privasi laporan lulus', lap.privasi.lulus === true, lap.privasi.temuan.join(','))
  cek('H9 GT tidak berubah oleh run (sha berkas sama; KASUS_EVAL1 beku-dalam)', H.shaBerkas(readFileSync(H.BERKAS_FIXTURE)) === shaSebelum && Object.isFrozen(F.KASUS_EVAL1[0].gt.vessels.daftar[0].imo) && !lap.integritasAkhir)
  const lapPass = await H.jalankanEval1({ env: {}, fetchStub: buatStubPenyedia((k) => sempurna(k)).fn, hariIni: HARI, ledger: ledgerStubOk })
  cek('H10 E2E sempurna + bukti ledger (stub) → PASS harness (bukan PASS Sonnet 5)', lapPass.verdict === 'PASS' && /PENDING_SPIKE/.test(lapPass.catatan))

  const stSalah = buatStubPenyedia((k, model) => {
    const r = sempurna(k)
    if (model === H.MODEL_S5 && k.id === 'E09') r.cargoes[0].operation = 'LOAD'
    return r
  })
  const lapSalah = await H.jalankanEval1({ env: {}, fetchStub: stSalah.fn, hariIni: HARI, ledger: ledgerStubOk })
  cek('H11 E2E adversarial (S5 E09 LOAD) → FAIL, G1 menyebut E09:F5', lapSalah.verdict === 'FAIL' && lapSalah.gerbang.G1.detail.some((d) => d.includes('E09:F5')))
  cek('H12 E2E adversarial: S4.5 tetap 0 FATAL (kontrol tidak tercemar)', lapSalah.ringkasan.S45_KONTROL.fatalPost === 0)

  const stMahal = buatStubPenyedia((k) => sempurna(k), { biaya: 0.2 })
  const lapMahal = await H.jalankanEval1({ env: {}, fetchStub: stMahal.fn, hariIni: HARI, ledger: ledgerStubOk })
  cek('H13 E2E berhenti lunak biaya: 14 panggilan lalu slot sisa TIDAK_DIJALANKAN → INCONCLUSIVE', lapMahal.panggilanStub === 14 && lapMahal.slot.some((x) => x.status === 'TIDAK_DIJALANKAN') && lapMahal.verdict === 'INCONCLUSIVE', `${lapMahal.panggilanStub} ${lapMahal.verdict}`)
  const stHaiku = buatStubPenyedia((k) => sempurna(k), { served: 'anthropic/claude-haiku-4.5' })
  const lapHaiku = await H.jalankanEval1({ env: {}, fetchStub: stHaiku.fn, hariIni: HARI, ledger: ledgerStubOk })
  cek('H14 E2E served model berbeda → berhenti setelah panggilan pertama, FAIL', lapHaiku.panggilanStub === 1 && lapHaiku.verdict === 'FAIL')
  // H15 — argumen tool tak sah dari penyedia (koreksi owner #2): tiap varian di kasus berbeda, S5 run1.
  const rusak = {
    E07: { __mentah: 'null' },
    E05: { __mentah: '[]' },
    E12: { __mentah: '"teks bebas"' },
    E14: { __mentah: '{classification: NEW_NOMINATION' },
    E06: { __mentah: '{}' },
    E13: { __mentah: JSON.stringify({ classification: 'NEW_NOMINATION', vessels: { name: 'MV SNTLQM ATLAS' }, cargoes: [] }) },
    E01: { __tanpaTool: true },
    E03: { __mentah: '' },
  }
  const stRusak = buatStubPenyedia((k, model, n) => (model === H.MODEL_S5 && n > 15 && n <= 30 && rusak[k.id] ? rusak[k.id] : sempurna(k)))
  const lapRusak = await H.jalankanEval1({ env: {}, fetchStub: stRusak.fn, hariIni: HARI, ledger: ledgerStubOk })
  const slotRusak = lapRusak.slot.filter((x) => x.blok === 'S5_RUN1' && rusak[x.kasus])
  cek('H15a 8 varian argumen tak sah → semua slot berstatus GAGAL (tak ada yang "OK")', slotRusak.length === 8 && slotRusak.every((x) => x.status.startsWith('GAGAL:')), JSON.stringify(slotRusak.map((x) => [x.kasus, x.status])))
  const statusDi = (id) => slotRusak.find((x) => x.kasus === id).status
  cek('H15b JSON rusak / tanpa tool call / argumen kosong → GAGAL:AI_BAD_RESPONSE (ekstraktor)', ['E14', 'E01', 'E03'].every((id) => statusDi(id) === 'GAGAL:AI_BAD_RESPONSE'), ['E14', 'E01', 'E03'].map(statusDi).join(' | '))
  cek(
    'H15c null / array / string / {} / vessels objek → GAGAL:ARGUMEN_TIDAK_SAH:<kode>',
    statusDi('E07').endsWith('ARGUMEN_KOSONG') && statusDi('E05').endsWith('ARGUMEN_ARRAY') && statusDi('E12').endsWith('ARGUMEN_BUKAN_OBJEK:string') && statusDi('E06').includes('CLASSIFICATION_TIDAK_ADA') && statusDi('E13').includes('VESSELS_BUKAN_ARRAY'),
    ['E07', 'E05', 'E12', 'E06', 'E13'].map(statusDi).join(' | '),
  )
  cek('H15d tak satu pun argumen tak sah dinilai sebagai ekstraksi (hasil.ekstraktorGagal)', slotRusak.every((x) => x.hasil?.ekstraktorGagal === true))
  const rr = lapRusak.ringkasan.S5_RUN1
  cek('H15e run1: lengkap=false, 8 gagal ekstraktor, klasifikasi benar hanya 7/15 (negatif kosong TIDAK "kebetulan benar")', rr.lengkap === false && rr.gagalEkstraktor.length === 8 && rr.klasifikasiBenar === 7, JSON.stringify([rr.lengkap, rr.gagalEkstraktor.length, rr.klasifikasiBenar]))
  cek('H15f verdict INCONCLUSIVE (bukan PASS/CONDITIONAL), G7 gagal', lapRusak.verdict === 'INCONCLUSIVE' && lapRusak.gerbang.G7.lulus === false, lapRusak.verdict)
  cek('H15g tak ada panggilan ulang di luar fallback plugin: panggilan stub tetap 49', lapRusak.panggilanStub === 49)

  // ============================================================ I. privasi
  bagian('I. Privasi laporan')
  const teks = JSON.stringify(lap)
  cek('I1 laporan tanpa badan dokumen sumber', !kasus.some((k) => (k.kind === 'TEXT' ? k.teks : F.teksSpesifikasiPdf(k.pdf)).split('\n').some((b) => b.trim().length >= 30 && teks.includes(b.trim()))))
  cek('I2 laporan tanpa email/telepon kontak', !/@contoh\.invalid|\+62-000/.test(teks))
  cek('I3 laporan tanpa frasa otorisasi & pola kunci', !teks.includes(H.FRASA_OTORISASI_EVAL1) && !/sk-or-|Bearer /.test(teks))
  const lapKontak = await H.jalankanEval1({
    env: {},
    fetchStub: buatStubPenyedia((k) => {
      const r = sempurna(k)
      if (k.id === 'E01') r.contact = { name: 'Orang Lain', email: 'lain@contoh.invalid' }
      return r
    }).fn,
    hariIni: HARI,
  })
  const teksKontak = JSON.stringify(lapKontak)
  cek('I4 nilai kontak yang salah tetap DISENSOR di laporan', teksKontak.includes('[DISENSOR]') && !teksKontak.includes('lain@contoh.invalid') && lapKontak.privasi.lulus)
  const kunci = 'sk-or-v1-UJI-0123456789abcdef'
  cek('I5 pemindai: kunci API terdeteksi', H.pindaiPrivasiEval1(`x ${kunci}`, { kunci }).includes('KUNCI_API'))
  cek('I6 pemindai: "Bearer " terdeteksi', H.pindaiPrivasiEval1('Authorization: Bearer abc').includes('POLA_KUNCI'))
  cek('I7 pemindai: frasa otorisasi terdeteksi', H.pindaiPrivasiEval1(`frasa ${H.FRASA_OTORISASI_EVAL1}`, { frasa: H.FRASA_OTORISASI_EVAL1 }).includes('FRASA_OTORISASI'))
  cek('I8 pemindai: kontak terdeteksi', H.pindaiPrivasiEval1('rina.sntlqa@contoh.invalid').includes('KONTAK'))
  cek('I9 pemindai: baris badan dokumen terdeteksi', H.pindaiPrivasiEval1(`… ${K.E01.teks.split('\n')[5]} …`, { kasus }).includes('BADAN_DOKUMEN'))
  cek('I10 pemindai: rahasia env (URL DB) terdeteksi', H.pindaiPrivasiEval1('postgresql://u:rahasia@localhost/x', { rahasiaEnv: ['postgresql://u:rahasia@localhost/x'] }).includes('RAHASIA_ENV'))
  cek('I11 sentinel sintetis boleh muncul sebagai bukti per kasus', H.pindaiPrivasiEval1('E01 vessels[0].name got SNTLQA HARMONY', { kasus }).length === 0)
  let ditolakRepo = false
  try {
    H.tulisLaporan(join(AKAR, 'prisma/fixtures/spike-intake/laporan.json'), {})
  } catch (e) {
    ditolakRepo = e.message === 'EVAL1_LAPORAN_DI_DALAM_REPO_DITOLAK'
  }
  cek('I12 laporan tak boleh ditulis di dalam repo (termasuk fixtures)', ditolakRepo)
  const jalurLuar = H.tulisLaporan(join(tmpdir(), `eval1-uji-${process.pid}.json`), { ok: true })
  cek('I13 laporan boleh ditulis di luar repo (temp)', jalurLuar.startsWith(tmpdir()))
}

globalThis.fetch = fetchAsliGlobal
cek('Z tak ada panggilan jaringan nyata sepanjang uji', panggilanJaringanNyata === 0, String(panggilanJaringanNyata))
console.log(`\nAdversarial: ${adv.filter((a) => a.ok).length}/${adv.length} kode FATAL tepat`)
console.log(`\n${gagal ? '❌ ADA YANG GAGAL' : '✅ SEMUA LULUS'} — lulus ${lulus}, gagal ${gagal}`)
process.exit(gagal ? 1 : 0)
