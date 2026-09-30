// Uji LURING Eval-3 HELD-OUT — PRD-005 E5 Step 13 (TANPA AI, TANPA jaringan, TANPA DB).
//
// Jalankan:  node prisma/check-eval3-gt.mjs
//
// Lapis:
//   A. INTEGRITAS & PEMBEKUAN — 36 kasus, versi, hash kanonik + SHA berkas, ikatan Prompt v3, mutasi.
//   B. SKEMA GT — node sah, field wajib, nilai klasifikasi sah, kapal/muatan/kontak.
//   C. KATEGORI & POLARITAS — jumlah per kategori, positif/negatif/adversarial, niat keagenan.
//   D. MINIMUM & P1 — harapan.minimumTerpenuhi / tinjauanSubtipe = kebijakan produksi (dihitung ulang).
//   E. KONSISTENSI VALIDATOR & PENILAI (prasyarat G12) — jawaban sempurna → 0 FATAL/0 MAJOR (3 hari
//      eksekusi); harapanValidator terjadi persis; jawaban SALAH yang dirancang tertangkap penilai.
//   F. TANGGAL — node tanpaTahun ABSENT; tanggal GT berbukti di field-nya; tak ada tahun simpulan.
//   G. MULTI-KAPAL — jumlah, peran, kepemilikan identifier, pengecualian sister.
//   H. IDENTITAS P0 — identitas tepercaya di GT sah; nilai adversarial ditolak validator.
//   I. INJEKSI — nilai sisipan terlarang F8, tak ada di GT.
//   J. PRIVASI & SENTINEL — unik, pola baru, ada di dokumen, data fiktif.
//   K. ANTI-KEBOCORAN terhadap Eval-1/Eval-2 & contoh Prompt v3 (leksikal/data; semantik TIDAK terbukti).
//   L. GERBANG, RENCANA & ANGGARAN — lengkap, tidak lebih lemah dari Eval-2.
//   M. EVAL-1/EVAL-2 UTUH & NOL JARINGAN.

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = fileURLToPath(new URL('..', import.meta.url))

let lulus = 0
let gagal = 0
function cek(nama, kondisi, detail = '') {
  if (kondisi) {
    lulus++
    console.log(`  ✅ ${nama}${detail ? ` — ${detail}` : ''}`)
  } else {
    gagal++
    console.log(`  ❌ ${nama}${detail ? ` — ${detail}` : ''}`)
  }
}
const bagian = (j) => console.log(`\n${j}`)

// ---------------------------------------------------------------- nol jaringan
let panggilanJaringan = 0
globalThis.fetch = async () => {
  panggilanJaringan++
  throw new Error('JARINGAN_DILARANG_DALAM_UJI')
}

const F = await import('./fixtures/spike-intake/eval3-cases.mjs')
const B = await import('./spike-eval3-beku.mjs')
const S = await import('./spike-eval1-scorer.mjs')
const H1 = await import('./spike-eval1.mjs')
const F1 = await import('./fixtures/spike-intake/eval1-cases.mjs')
const F2 = await import('./fixtures/spike-intake/eval2-cases.mjs')
const B2 = await import('./spike-eval2-beku.mjs')
const require = createRequire(import.meta.url)
const jiti = require('jiti')(fileURLToPath(import.meta.url), { alias: { '@': join(AKAR, 'src') }, interopDefault: true })
const P = jiti(join(AKAR, 'src/services/intake/intake-policy.ts'))
const V = jiti(join(AKAR, 'src/lib/vessels.ts'))
const X = jiti(join(AKAR, 'src/lib/ai/vessel-call-extract.ts'))

const NORM_VALIDASI = { imo: V.normalisasiImo, imoSah: V.imoCheckDigitSah, mmsi: V.normalisasiMmsi, mmsiSah: V.mmsiSah, callSign: V.normalisasiCallSign }
const NORM_SKOR = { namaKapal: P.normalisasiNamaKapal, namaPort: P.normalisasiNamaPort, namaPihak: P.normalisasiNamaPihak, unlocode: P.normalisasiUnlocode, imo: V.normalisasiImo, mmsi: V.normalisasiMmsi, callSign: V.normalisasiCallSign }

const HARI = ['2026-09-26', '2026-12-20', '2027-03-01'] // termasuk pergantian tahun
const HARI_UTAMA = HARI[0]
const kasusPada = (h, mod = F) => mod.bangunKasusEval3(new Date(`${h}T00:00:00Z`))
const KASUS = kasusPada(HARI_UTAMA)
const K = Object.fromEntries(KASUS.map((k) => [k.id, k]))
const FIELD_TANGGAL = ['eta', 'etb', 'etc', 'etd', 'requestDate']
const FIELD_ATAS = ['portName', 'portUnlocode', 'jetty', 'eta', 'etb', 'etc', 'etd', 'principalName', 'customerName', 'agencyType', 'clientReference', 'requestDate']
const FIELD_KAPAL = ['name', 'imo', 'mmsi', 'callSign', 'vesselType', 'role']
const NEW = (c) => typeof c === 'string' && c.startsWith('NEW_')
const pilih = (n) => (!n || !('status' in n) ? null : n.status === 'PRESENT' ? n.value : n.status === 'ACCEPTABLE' ? n.values.find((x) => x !== null) ?? null : null)
const nilaiNode = (n) => (!n ? [] : n.status === 'PRESENT' ? [n.value, ...(n.alias ?? [])] : n.status === 'ACCEPTABLE' ? n.values.filter((x) => x !== null) : [])

/** Keluaran tool "sempurna" (ekstraksi SETIA) dari GT; kasus non-keagenan memakai kapalBukti. */
function sempurna(k) {
  const g = k.gt
  const o = { classification: g.classification.values[0], cargoes: [] }
  o.vessels = k.kapalBukti ? structuredClone(k.kapalBukti) : g.vessels.daftar.map((v) => Object.fromEntries(FIELD_KAPAL.map((f) => [f, pilih(v[f])]).filter(([, x]) => x !== null)))
  for (const f of FIELD_ATAS) {
    const x = pilih(g[f])
    if (x !== null) o[f] = x
  }
  if (!('status' in g.contact)) {
    const c = Object.fromEntries(['name', 'email', 'phone'].map((f) => [f, pilih(g.contact[f])]).filter(([, x]) => x !== null))
    if (Object.keys(c).length) o.contact = c
  }
  return o
}
const validasi = (raw, k, h = HARI_UTAMA) => P.validasiEkstraksi(structuredClone(raw), { inputKind: 'TEXT', sourceText: P.normalisasiTeksSumber(k.teks), hariIni: h, norm: NORM_VALIDASI })
/** Penilai Eval-1 apa adanya; untuk kasus non-keagenan kapal NOT_SCORED (keluaran kapal diabaikan penilai). */
const nilai = (k, raw, post) => S.nilaiKasus(k, raw, post, NORM_SKOR)

// ---------------------------------------------------------------- pemeriksa murni (dipakai uji mutasi)
function galatMinimum(ks, h = HARI_UTAMA) {
  const g = []
  for (const k of ks) {
    const post = validasi(sempurna(k), k, h)
    const min = P.syaratMinimumTerpenuhi(post.proposal)
    if (min !== k.harapan.minimumTerpenuhi) g.push(`${k.id}:minimum`)
    const turun = P.turunanTinjauanIntake('NEEDS_REVIEW', post.classification, post.proposal)
    if (turun.subtypeReviewRequired !== k.harapan.tinjauanSubtipe) g.push(`${k.id}:tinjauanSubtipe`)
    const bilaIns = P.turunanTinjauanIntake('NEEDS_REVIEW', 'INSUFFICIENT_INFORMATION', { ...post.proposal, classificationReason: null }).subtypeReviewRequired
    if (bilaIns !== k.harapan.tinjauanSubtipeBilaInsufficient) g.push(`${k.id}:tinjauanBilaInsufficient`)
  }
  return g
}
function galatKategori(mod) {
  const g = []
  for (const [kat, r] of Object.entries(mod.KATEGORI_EVAL3)) {
    const ks = mod.KASUS_EVAL3.filter((k) => k.kategori === kat)
    if (ks.length !== r.jumlah) g.push(`${kat}:jumlah`)
    if (ks.filter((k) => k.polaritas === 'POSITIF').length !== r.positif) g.push(`${kat}:positif`)
    if (ks.filter((k) => k.polaritas === 'NEGATIF').length !== r.negatif) g.push(`${kat}:negatif`)
  }
  if (mod.KASUS_EVAL3.some((k) => !(k.kategori in mod.KATEGORI_EVAL3))) g.push('kategoriTakDikenal')
  return g
}
function galatSentinel(ks, pola = F.POLA_SENTINEL_EVAL3) {
  const g = []
  if (new Set(ks.map((k) => k.sentinel)).size !== ks.length) g.push('SENTINEL_TIDAK_UNIK')
  for (const k of ks) {
    if (!new RegExp(`^${pola.source}$`, 'i').test(k.sentinel)) g.push(`${k.id}:pola`)
    if (!k.teks.toUpperCase().includes(k.sentinel)) g.push(`${k.id}:takAdaDiDokumen`)
    if (ks.some((x) => x.id !== k.id && k.teks.toUpperCase().includes(x.sentinel))) g.push(`${k.id}:sentinelKasusLain`)
  }
  return g
}

// ---------------------------------------------------------------- korpus sebelumnya (Eval-1, Eval-2, contoh prompt)
const E1 = F1.bangunKasusEval1(new Date(`${HARI_UTAMA}T00:00:00Z`))
const E2 = F2.bangunKasusEval2(new Date(`${HARI_UTAMA}T00:00:00Z`))
const teksE1 = (k) => (k.kind === 'TEXT' ? k.teks : F1.teksSpesifikasiPdf(k.pdf))
const KORPUS_LAMA = [...E1.map((k) => ({ id: k.id, teks: teksE1(k), gt: k.gt, sentinel: k.sentinel, ex: [] })), ...E2.map((k) => ({ id: k.id, teks: k.teks, gt: k.gt, sentinel: k.sentinel, ex: k.kapalDikecualikan ?? [] }))]
const CONTOH_PROMPT = X.ATURAN_PROMPT_INTAKE.flatMap((a) => (a.contoh ?? []).map((c) => c.sumber))
const namaNorm = (s) => P.normalisasiNamaKapal(String(s).replace(/^(BG|TK)\s+/i, '')) ?? ''
const REGEX_NAMA = /\b(?:MV|TB|BG|MT|KM|TK|LCT|SPOB)\s+[A-Z0-9][A-Z0-9 ]{2,40}/g
function jejak(korpus) {
  const nama = new Set()
  const angka = new Set()
  const kode = new Set()
  const port = new Set()
  const pasangan = new Set()
  const callSign = new Set()
  for (const k of korpus) {
    for (const v of k.gt?.vessels?.daftar ?? []) {
      nilaiNode(v.name).forEach((n) => nama.add(namaNorm(n)))
      nilaiNode(v.callSign).forEach((c) => callSign.add(String(c).toUpperCase()))
    }
    for (const x of [...(k.ex ?? []), ...(k.kapalBukti ?? [])]) if (x.name) nama.add(namaNorm(x.name))
    for (const m of k.teks.match(REGEX_NAMA) ?? []) nama.add(namaNorm(m.split(/\s{2,}|,|\(|\n/)[0]))
    for (const m of k.teks.match(/\b\d{7}\b|\b\d{9}\b/g) ?? []) angka.add(m)
    for (const m of k.teks.match(/\bID[A-Z0-9]{3}\b/g) ?? []) kode.add(m)
    const pn = nilaiNode(k.gt?.portName).map((x) => P.normalisasiNamaPort(x))
    const pu = nilaiNode(k.gt?.portUnlocode)
    pn.forEach((x) => port.add(x))
    for (const a of pn.length ? pn : [null]) for (const b of pu.length ? pu : [null]) pasangan.add(`${a}|${b}`)
  }
  nama.delete('')
  return { nama, angka, kode, port, pasangan, callSign }
}
const LAMA = jejak(KORPUS_LAMA)
function kebocoran(ks) {
  const baru = jejak(ks)
  const g = []
  const iris = (a, b) => [...a].filter((x) => b.has(x))
  const idLama = new Set(KORPUS_LAMA.map((k) => k.id))
  if (ks.some((k) => idLama.has(k.id))) g.push('ID')
  const nama = iris(baru.nama, LAMA.nama)
  if (nama.length) g.push(`NAMA:${nama.join('/')}`)
  const angka = iris(baru.angka, LAMA.angka)
  if (angka.length) g.push(`IDENTIFIER:${angka.join('/')}`)
  const kode = iris(baru.kode, LAMA.kode)
  if (kode.length) g.push(`UNLOCODE:${kode.join('/')}`)
  const port = iris(baru.port, LAMA.port)
  if (port.length) g.push(`PELABUHAN:${port.join('/')}`)
  const pasangan = iris([...baru.pasangan].filter((p) => p !== 'null|null'), LAMA.pasangan)
  if (pasangan.length) g.push(`PASANGAN:${pasangan.join('/')}`)
  const cs = [...baru.callSign].filter((c) => KORPUS_LAMA.some((k) => k.teks.toUpperCase().includes(c)))
  if (cs.length) g.push(`CALLSIGN:${cs.join('/')}`)
  const sentLama = KORPUS_LAMA.map((k) => k.sentinel).filter(Boolean)
  if (ks.some((k) => sentLama.some((s) => k.teks.toUpperCase().includes(s.toUpperCase())))) g.push('SENTINEL_LAMA_DI_DOKUMEN')
  if (ks.some((k) => F1.POLA_SENTINEL.test(k.sentinel) || F2.POLA_SENTINEL_EVAL2.test(k.sentinel))) g.push('POLA_SENTINEL_BERTABRAKAN')
  const barisLama = new Set(KORPUS_LAMA.flatMap((k) => k.teks.split('\n').map((l) => l.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()).filter((l) => l.length >= 25)))
  const barisSama = ks.flatMap((k) => k.teks.split('\n').map((l) => l.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()).filter((l) => l.length >= 25 && barisLama.has(l)))
  if (barisSama.length) g.push(`BARIS_SAMA:${barisSama.length}`)
  const kompakLama = new Set(KORPUS_LAMA.map((k) => P.kompak(k.teks)))
  if (ks.some((k) => kompakLama.has(P.kompak(k.teks)))) g.push('DOKUMEN_SAMA')
  if (ks.some((k) => CONTOH_PROMPT.some((c) => k.teks.includes(c)) || /IDBIT|525001234/.test(k.teks))) g.push('CONTOH_PROMPT')
  return g
}

// =====================================================================
bagian('A. INTEGRITAS & PEMBEKUAN')
{
  const ids = F.KASUS_EVAL3.map((k) => k.id)
  cek('tepat 36 kasus, id unik & persis H01…H36', ids.length === 36 && new Set(ids).size === 36 && JSON.stringify(ids) === JSON.stringify(B.ID_KASUS_EVAL3))
  cek('versi GT Eval-3 terpisah dari Eval-1/Eval-2', F.EVAL3_VERSI === 'prd005-e5-eval3/gt-1' && F.EVAL3_VERSI === B.VERSI_GT_EVAL3 && F.EVAL3_VERSI !== F2.EVAL2_VERSI)
  const galat = B.verifikasiBekuEval3()
  cek('pembekuan: hash kanonik & SHA berkas = nilai beku', galat.length === 0, galat.join(','))
  cek('hash kanonik deterministik (dua kali hitung sama)', B.hitungHashGtEval3() === B.hitungHashGtEval3())
  const mut = (f) => {
    const m = { ...F, KASUS_EVAL3: F.KASUS_EVAL3.map((k) => structuredClone({ ...k, teks: undefined })).map((k, i) => ({ ...k, teks: F.KASUS_EVAL3[i].teks })) }
    f(m)
    return B.verifikasiBekuEval3({ mod: m })
  }
  cek('mutasi: klasifikasi GT diubah → HASH_GT_BERBEDA', mut((m) => (m.KASUS_EVAL3[14].gt.classification.values = ['NEW_NOMINATION'])).includes('HASH_GT_BERBEDA'))
  cek('mutasi: kategori kasus diubah → HASH_GT_BERBEDA', mut((m) => (m.KASUS_EVAL3[0].kategori = 'B_MINIMUM_GAGAL')).includes('HASH_GT_BERBEDA'))
  cek('mutasi: sentinel kasus diubah → HASH_GT_BERBEDA', mut((m) => (m.KASUS_EVAL3[3].sentinel = 'KTX3ZZ')).includes('HASH_GT_BERBEDA'))
  cek('mutasi: harapan minimum dibalik → HASH_GT_BERBEDA', (() => {
    const m = { ...F, HARAPAN_EVAL3: { ...F.HARAPAN_EVAL3, H15: { ...F.HARAPAN_EVAL3.H15, minimumTerpenuhi: false } } }
    return B.verifikasiBekuEval3({ mod: m }).includes('HASH_GT_BERBEDA')
  })())
  cek('mutasi: isi dokumen diubah → HASH_GT_BERBEDA (teks ikut di-hash)', (() => {
    const m = { ...F, KASUS_EVAL3: F.KASUS_EVAL3.map((k, i) => (i === 5 ? { ...k, teks: () => 'lain' } : k)) }
    return B.verifikasiBekuEval3({ mod: m }).includes('HASH_GT_BERBEDA')
  })())
  cek('mutasi: ambang gerbang dilonggarkan → HASH_GT_BERBEDA', B.verifikasiBekuEval3({ mod: { ...F, GERBANG_EVAL3: { ...F.GERBANG_EVAL3, G13: { ...F.GERBANG_EVAL3.G13, ambang: { newPadaNonKeagenanRawMaks: 1, newPadaNonKeagenanPostMaks: 1 } } } } }).includes('HASH_GT_BERBEDA'))
  cek('mutasi: ikatan prompt diubah → HASH_GT_BERBEDA', B.verifikasiBekuEval3({ mod: { ...F, IKATAN_PROMPT_EVAL3: { ...F.IKATAN_PROMPT_EVAL3, hashPrompt: '0'.repeat(64) } } }).includes('HASH_GT_BERBEDA'))
  const isi = readFileSync(B.BERKAS_FIXTURE_EVAL3)
  cek('mutasi: satu byte berkas (komentar) diubah → SHA_BERKAS_BERBEDA', B.verifikasiBekuEval3({ isiBerkas: Buffer.concat([isi, Buffer.from(' ')]) }).includes('SHA_BERKAS_BERBEDA'))
  cek('mutasi: kasus dibuang → JUMLAH/HIMPUNAN berbeda', (() => {
    const g = B.verifikasiBekuEval3({ mod: { ...F, KASUS_EVAL3: F.KASUS_EVAL3.slice(1) } })
    return g.includes('JUMLAH_KASUS_BUKAN_36') && g.includes('HIMPUNAN_KASUS_BERBEDA')
  })())
  // Ikatan Prompt v3 — identitas prompt SESUNGGUHNYA.
  const aktual = { idPrompt: X.ID_PROMPT_INTAKE, versiPrompt: X.VERSI_PROMPT_INTAKE, versiSkema: X.VERSI_SKEMA_INTAKE, hashPrompt: X.HASH_PROMPT_INTAKE }
  cek('ikatan: prompt v3 / skema v3 / hash yang SESUNGGUHNYA = ikatan beku', B.verifikasiIkatanPromptEval3(aktual).length === 0 && F.IKATAN_PROMPT_EVAL3.hashPrompt === '8e326ac496821be87d5bdf85f0eec8e46ac817a80062a4e0d1b46c3839e67eea', JSON.stringify(aktual))
  cek('ikatan: hash prompt lain / versi 2 / id lain / tanpa identitas → ditolak', B.verifikasiIkatanPromptEval3({ ...aktual, hashPrompt: 'f'.repeat(64) }).includes('HASH_PROMPT_BERBEDA') &&
    B.verifikasiIkatanPromptEval3({ ...aktual, versiPrompt: '2' }).includes('VERSI_PROMPT_BERBEDA') && B.verifikasiIkatanPromptEval3({ ...aktual, versiSkema: '2' }).includes('VERSI_SKEMA_BERBEDA') &&
    B.verifikasiIkatanPromptEval3({ ...aktual, idPrompt: 'x' }).includes('ID_PROMPT_BERBEDA') && B.verifikasiIkatanPromptEval3(null).includes('IDENTITAS_PROMPT_TIDAK_ADA'))
}

// =====================================================================
bagian('B. SKEMA GROUND TRUTH')
{
  const STATUS = ['PRESENT', 'ABSENT', 'ACCEPTABLE', 'NOT_SCORED']
  const nodeSah = (n) => !!n && STATUS.includes(n.status) && (n.status !== 'PRESENT' || (n.value !== undefined && n.value !== null)) && (n.status !== 'ACCEPTABLE' || (Array.isArray(n.values) && n.values.length > 0))
  const salah = []
  for (const k of KASUS) {
    const g = k.gt
    if (!(g.classification?.status === 'ACCEPTABLE' && g.classification.values.length > 0 && g.classification.values.every((c) => P.KLASIFIKASI.includes(c)))) salah.push(`${k.id}.classification`)
    for (const f of FIELD_ATAS) if (!nodeSah(g[f])) salah.push(`${k.id}.${f}`)
    const ns = g.vessels?.jumlah?.status === 'NOT_SCORED'
    if (!(Array.isArray(g.vessels?.daftar) && (ns ? g.vessels.daftar.length === 0 : g.vessels.jumlah.status === 'PRESENT' && g.vessels.jumlah.value === g.vessels.daftar.length))) salah.push(`${k.id}.vessels`)
    for (const v of g.vessels.daftar) {
      if (!v.ref) salah.push(`${k.id}.ref`)
      for (const f of FIELD_KAPAL) if (!nodeSah(v[f])) salah.push(`${k.id}.${v.ref}.${f}`)
      if (v.role.status === 'PRESENT' && !P.PERAN_KAPAL.includes(v.role.value)) salah.push(`${k.id}.${v.ref}.role`)
    }
    if (!Array.isArray(g.cargoes?.bentukDiterima) || !g.cargoes.bentukDiterima.length) salah.push(`${k.id}.cargoes`)
    if (!g.contact || !('status' in g.contact ? nodeSah(g.contact) : ['name', 'email', 'phone'].every((f) => nodeSah(g.contact[f])))) salah.push(`${k.id}.contact`)
    if (!Array.isArray(g.terlarang) || !('larangNew' in g)) salah.push(`${k.id}.terlarang/larangNew`)
    if (!k.judul || !F.KASUS_EVAL3.find((x) => x.id === k.id).mekanisme || typeof k.adversarial !== 'boolean' || typeof k.niatKeagenan !== 'boolean' || !['POSITIF', 'NEGATIF'].includes(k.polaritas)) salah.push(`${k.id}.meta`)
    if (!k.harapan || typeof k.harapan.minimumTerpenuhi !== 'boolean') salah.push(`${k.id}.harapan`)
    if (ns !== !!k.kapalBukti) salah.push(`${k.id}.kapalBukti⇔NOT_SCORED`)
  }
  cek('setiap node GT sah & field wajib lengkap (klasifikasi, kapal, 12 field atas, muatan, kontak, terlarang, larangNew, meta, harapan)', salah.length === 0, salah.slice(0, 8).join(','))
  cek('penilai Eval-1 menerima setiap kasus (masalahKasusPenilai Eval-2 kosong)', KASUS.every((k) => k.kind === 'TEXT' && typeof k.id === 'string' && Array.isArray(k.gt.classification.values) && Array.isArray(k.gt.vessels.daftar) && Array.isArray(k.gt.cargoes.bentukDiterima)))
  const pos = KASUS.filter((k) => k.polaritas === 'POSITIF')
  const neg = KASUS.filter((k) => k.polaritas === 'NEGATIF')
  cek('kasus POSITIF: HANYA NEW_* diterima (INSUFFICIENT bukan jawaban benar — E3K4) & larangNew null', pos.every((k) => k.gt.classification.values.every(NEW) && k.gt.larangNew === null))
  cek('kasus NEGATIF: TIDAK pernah menerima NEW_*', neg.every((k) => !k.gt.classification.values.some(NEW)))
  cek('kasus NEGATIF ber-larangNew (NEW_* = F9), kecuali H29 (IMO check digit — model tak diminta memeriksa check digit; POST ditahan P0-3)',
    neg.filter((k) => k.id !== 'H29').every((k) => typeof k.gt.larangNew === 'string' && k.gt.larangNew.length > 10) && K.H29.gt.larangNew === null)
  cek('himpunan klasifikasi negatif sesuai kategori: B & E = INSUFFICIENT saja; C & H36 = NOT_RELEVANT/UNSUPPORTED (PDA & perubahan ETA = UNSUPPORTED saja)',
    KASUS.filter((k) => ['B_MINIMUM_GAGAL', 'E_IDENTITAS_P0'].includes(k.kategori)).every((k) => JSON.stringify(k.gt.classification.values) === '["INSUFFICIENT_INFORMATION"]') &&
      ['H15', 'H16', 'H18', 'H20', 'H36'].every((id) => JSON.stringify(K[id].gt.classification.values) === '["NOT_RELEVANT","UNSUPPORTED_REQUEST"]') &&
      ['H17', 'H19'].every((id) => JSON.stringify(K[id].gt.classification.values) === '["UNSUPPORTED_REQUEST"]'))
  cek('subtipe: H07 & H35 = NEW_NOMINATION saja; H08 = NEW_APPOINTMENT saja; positif lain = {NEW_NOMINATION, NEW_APPOINTMENT}',
    JSON.stringify(K.H07.gt.classification.values) === '["NEW_NOMINATION"]' && JSON.stringify(K.H35.gt.classification.values) === '["NEW_NOMINATION"]' && JSON.stringify(K.H08.gt.classification.values) === '["NEW_APPOINTMENT"]' &&
      pos.filter((k) => !['H07', 'H08', 'H35'].includes(k.id)).every((k) => JSON.stringify(k.gt.classification.values) === JSON.stringify(['NEW_NOMINATION', 'NEW_APPOINTMENT'])))
  cek('bukti subtipe ada di dokumen: H07/H35 menyebut "nominate", H08 menyebut SPK; positif lain TIDAK menyebut SPK/LOI/appointment letter',
    /nominate/i.test(K.H07.teks) && /nominate/i.test(K.H35.teks) && /\bSPK\b/.test(K.H08.teks) && pos.filter((k) => !['H07', 'H08', 'H35'].includes(k.id)).every((k) => !/\bSPK\b|\bLOI\b|letter of appointment|appointment letter/i.test(k.teks)))
}

// =====================================================================
bagian('C. KATEGORI, POLARITAS & NIAT KEAGENAN')
{
  cek('jumlah per kategori = rancangan (A 8 · B 6 · C 6 · D 5 · E 5 · F 4 · G 2)', galatKategori(F).length === 0 && JSON.stringify(Object.fromEntries(Object.entries(F.KATEGORI_EVAL3).map(([k, v]) => [k[0], v.jumlah]))) === '{"A":8,"B":6,"C":6,"D":5,"E":5,"F":4,"G":2}', galatKategori(F).join(','))
  cek('mutasi: satu kasus pindah kategori → galat kategori', galatKategori({ ...F, KASUS_EVAL3: F.KASUS_EVAL3.map((k, i) => (i === 0 ? { ...k, kategori: 'B_MINIMUM_GAGAL' } : k)) }).length > 0)
  const nPos = KASUS.filter((k) => k.polaritas === 'POSITIF').length
  const nAdv = KASUS.filter((k) => k.adversarial).length
  cek('positif 18 / negatif 18 / adversarial 18', nPos === 18 && KASUS.length - nPos === 18 && nAdv === 18, `pos=${nPos} adv=${nAdv}`)
  cek('adversarial = semua C, E, F, G + H25 (sister)', JSON.stringify(KASUS.filter((k) => k.adversarial).map((k) => k.id)) === JSON.stringify(KASUS.filter((k) => /^[CEFG]_/.test(k.kategori) || k.id === 'H25').map((k) => k.id)))
  cek('niat keagenan: FALSE tepat pada C + H36 (7 kasus), TRUE pada lainnya', JSON.stringify(KASUS.filter((k) => !k.niatKeagenan).map((k) => k.id)) === '["H15","H16","H17","H18","H19","H20","H36"]')
  cek('dokumen non-keagenan benar-benar tanpa permintaan keagenan (kata kunci permintaan tak ada; ada penanda informasi/PDA/revisi/kru)',
    ['H15', 'H16', 'H17', 'H18', 'H19', 'H20', 'H36'].every((id) => !/please arrange agency|mohon (bantu )?keagenan|mohon disiapkan keagenan|act as (our )?agent|nominate/i.test(K[id].teks)))
  cek('kasus C & H36 memuat kapal + bukti tujuan (minimum terpenuhi) — inti uji G13', ['H15', 'H16', 'H17', 'H18', 'H19', 'H20', 'H36'].every((id) => K[id].harapan.minimumTerpenuhi && K[id].kapalBukti?.length >= 1))
}

// =====================================================================
bagian('D. MINIMUM & P1 = KEBIJAKAN PRODUKSI (dihitung ulang)')
{
  for (const h of HARI) {
    const g = galatMinimum(kasusPada(h), h)
    cek(`hari ${h}: harapan.minimumTerpenuhi / tinjauanSubtipe / tinjauanSubtipeBilaInsufficient = syaratMinimumTerpenuhi & turunanTinjauanIntake`, g.length === 0, g.join(','))
  }
  const dist = { true: KASUS.filter((k) => k.harapan.minimumTerpenuhi).length, false: KASUS.filter((k) => !k.harapan.minimumTerpenuhi).length }
  cek('sebaran minimum: 25 terpenuhi / 11 tidak', dist.true === 25 && dist.false === 11, JSON.stringify(dist))
  cek('tinjauan subtipe untuk jawaban BENAR = false di semua kasus (P1 hanya menahan jawaban INSUFFICIENT keliru)', KASUS.every((k) => k.harapan.tinjauanSubtipe === false))
  cek('bila model menjawab INSUFFICIENT: tinjauan subtipe = minimumTerpenuhi (penahanan P1, BUKAN jawaban benar — E3K4)', KASUS.every((k) => k.harapan.tinjauanSubtipeBilaInsufficient === k.harapan.minimumTerpenuhi))
  cek('mutasi: harapan minimum H01 dibalik → galatMinimum menangkap', galatMinimum(KASUS.map((k) => (k.id === 'H01' ? { ...k, harapan: { ...k.harapan, minimumTerpenuhi: false } } : k))).includes('H01:minimum'))
  cek('mutasi: harapan minimum H29 dibalik (IMO check digit dianggap tepercaya) → tertangkap', galatMinimum(KASUS.map((k) => (k.id === 'H29' ? { ...k, harapan: { ...k.harapan, minimumTerpenuhi: true } } : k))).includes('H29:minimum'))
  const kasusMinimum = { unlocodeSaja: ['H02', 'H03', 'H06'], etaSaja: ['H04'], namaPortSaja: ['H01'] }
  cek('cakupan bukti tujuan tunggal: UN/LOCODE saja (H02,H03,H06), ETA saja (H04), nama pelabuhan saja (H01)',
    kasusMinimum.unlocodeSaja.every((id) => K[id].gt.portUnlocode.status === 'PRESENT' && K[id].gt.portName.status === 'ABSENT' && K[id].gt.eta.status === 'ABSENT') &&
      K.H04.gt.eta.status === 'PRESENT' && K.H04.gt.portName.status === 'ABSENT' && K.H04.gt.portUnlocode.status === 'ABSENT' &&
      K.H01.gt.portName.status === 'PRESENT' && K.H01.gt.portUnlocode.status === 'ABSENT' && K.H01.gt.eta.status === 'ABSENT')
  cek('cakupan identitas tunggal: nama (H01), IMO (H02), MMSI (H03), call sign (H04)', ['name', 'imo', 'mmsi', 'callSign'].every((f, i) => {
    const v = K[`H0${i + 1}`].gt.vessels.daftar[0]
    return v[f].status === 'PRESENT' && FIELD_KAPAL.filter((x) => x !== f && x !== 'role' && v[x].status === 'PRESENT').length === 0
  }))
  cek('ETA/nama belum ada: H05 (ETA akan dikabarkan) & H06 (nama menyusul) — minimum tetap terpenuhi', /ETA will be advised once the cargo documents are ready/.test(K.H05.teks) && !/ETA to follow/.test(K.H05.teks) && /Nama kapal dan detail lainnya menyusul/.test(K.H06.teks) && K.H05.harapan.minimumTerpenuhi && K.H06.harapan.minimumTerpenuhi)
}

// =====================================================================
bagian('E. KONSISTENSI VALIDATOR & PENILAI (prasyarat G12)')
{
  for (const h of HARI) {
    const buruk = []
    for (const k of kasusPada(h)) {
      const raw = sempurna(k)
      const post = validasi(raw, k, h)
      const n = nilai(k, raw, post)
      const ok = !n.ekstraktorGagal && n.RAW.jumlah.FATAL === 0 && n.RAW.jumlah.MAJOR === 0 && n.POST.jumlah.FATAL === 0 && n.POST.jumlah.MAJOR === 0 &&
        k.gt.classification.values.includes(post.classification) && (k.kapalBukti || (post.proposal.vessels.length === k.gt.vessels.daftar.length && (post.proposal.vesselsDropped ?? 0) === 0))
      if (!ok) buruk.push(`${k.id}:${JSON.stringify({ raw: n.RAW?.jumlah, post: n.POST?.jumlah, kls: post.classification })}`)
    }
    cek(`hari ${h}: jawaban sempurna → RAW & POST 0 FATAL / 0 MAJOR, klasifikasi dipertahankan, tanpa kapal hilang (36 kasus)`, buruk.length === 0, buruk.slice(0, 3).join(' | '))
  }
  // harapanValidator
  const hasil = []
  for (const k of KASUS) for (const x of k.harapanValidator) {
    const raw = { ...sempurna(k), classification: 'NEW_NOMINATION' }
    let ok = false
    if (x.jenis === 'KAPAL_DIBUANG') {
      raw.vessels = structuredClone(x.raw)
      const r = validasi(raw, k)
      ok = r.proposal.vesselsDropped === x.vesselsDropped && r.proposal.vessels.length === 0 && r.classification === x.klasifikasiPost && !P.syaratMinimumTerpenuhi(r.proposal)
    } else if (x.jenis === 'IMO_TAK_TEPERCAYA') {
      raw.vessels = structuredClone(x.raw)
      const r = validasi(raw, k)
      ok = r.proposal.vessels.length === x.kapalPost && r.proposal.vessels[0].imo.flags.includes(x.flagImo) && r.proposal.vessels[0].imo.value === x.raw[0].imo && r.classification === x.klasifikasiPost
    } else if (x.jenis === 'BATAS_VALIDATOR_KAPAL') {
      raw.vessels = structuredClone(x.raw)
      const r = validasi(raw, k)
      const nl = nilai(k, raw, r)
      ok = r.proposal.vessels.length === 1 && r.classification === 'NEW_NOMINATION' && nl.POST.fatal.some((f) => f.kode === 'F2') && nl.POST.fatal.some((f) => f.kode === 'F9')
    } else if (x.jenis === 'BATAS_VALIDATOR') {
      raw[x.field] = kasusPada(HARI_UTAMA).find((q) => q.id === k.id).tanggal[x.rawRef].iso
      const r = validasi(raw, k)
      ok = r.proposal[x.field].value === raw[x.field]
    }
    hasil.push({ id: k.id, jenis: x.jenis, ok })
  }
  for (const x of hasil) cek(`harapanValidator ${x.id} ${x.jenis}`, x.ok)
  cek('harapanValidator mencakup KAPAL_DIBUANG, IMO_TAK_TEPERCAYA, BATAS_VALIDATOR (tanggal) & BATAS_VALIDATOR_KAPAL (TBN)', ['KAPAL_DIBUANG', 'IMO_TAK_TEPERCAYA', 'BATAS_VALIDATOR', 'BATAS_VALIDATOR_KAPAL'].every((j) => hasil.some((x) => x.jenis === j)))
  // Jawaban SALAH yang dirancang harus tertangkap penilai (bukti gerbang bisa gagal).
  const salah = (id, ubah) => {
    const k = K[id]
    const raw = sempurna(k)
    ubah(raw)
    const post = validasi(raw, k)
    return { n: nilai(k, raw, post), post }
  }
  const c = salah('H15', (r) => (r.classification = 'NEW_NOMINATION'))
  cek('penilai: NEW_* pada dokumen non-keagenan (H15) → F9 FATAL di RAW & POST (validator tak menahan — minimum terpenuhi)', c.n.POST.fatal.some((f) => f.kode.startsWith('F9')) && c.n.RAW.fatal.some((f) => f.kode.startsWith('F9')) && c.post.classification === 'NEW_NOMINATION')
  const i36 = salah('H36', (r) => {
    r.classification = 'NEW_NOMINATION'
    r.eta = K.H36.tanggal.SISIP.iso
  })
  cek('penilai: injeksi dipatuhi (H36) → F9 + F8', i36.n.POST.fatal.some((f) => f.kode.startsWith('F9')) && i36.n.RAW.fatal.some((f) => f.kode.startsWith('F8')))
  const s07 = salah('H07', (r) => (r.classification = 'NEW_APPOINTMENT'))
  cek('penilai: subtipe salah pada nominasi eksplisit (H07) → MAJOR (bukan FATAL)', s07.n.POST.jumlah.MAJOR >= 1 && s07.n.POST.jumlah.FATAL === 0)
  const ins = salah('H01', (r) => (r.classification = 'INSUFFICIENT_INFORMATION'))
  cek('penilai: INSUFFICIENT pada positif (H01) → WRONG di POST walau P1 menandai tinjauan subtipe (E3K4)',
    ins.n.POST.jumlah.MAJOR >= 1 && ins.post.classification === 'INSUFFICIENT_INFORMATION' && P.turunanTinjauanIntake('NEEDS_REVIEW', ins.post.classification, ins.post.proposal).subtypeReviewRequired === true)
  const h34 = salah('H34', (r) => (r.eta = K.H34.tanggal.LALU.iso))
  cek('penilai: tanggal historis dipinjam sebagai ETA (H34) → lolos validator (batas diketahui) tetapi F4 FATAL di POST', h34.post.proposal.eta.value === K.H34.tanggal.LALU.iso && h34.n.POST.fatal.some((f) => f.kode.startsWith('F4')))
  const e26 = salah('H26', (r) => {
    r.classification = 'NEW_NOMINATION'
    r.vessels = [{ name: 'MV RAJU MARA' }]
  })
  cek('penilai: nama tebakan untuk identitas terselubung (H26) → ditolak validator (NOT_IN_SOURCE) & POST INSUFFICIENT', e26.post.proposal.vessels.length === 0 && e26.post.classification === 'INSUFFICIENT_INFORMATION')
  const d25 = salah('H25', (r) => r.vessels.push({ name: 'MV MUTIARA FAJAR', imo: '9998509' }))
  cek('penilai: kapal sister dimasukkan (H25) → F1/F2 FATAL (validator tak menahan — tertulis)', d25.n.POST.fatal.some((f) => /^F[12]/.test(f.kode)) && d25.post.proposal.vessels.length === 2)
  // K1 (Step 13C): rujukan setia BUKAN FATAL; nilai yang sama sebagai identitas kapal TETAP tertangkap.
  const RUJUKAN = { H27: ['Hull No. 4410235', '4410235'], H28: ['NB 0873', 'Yard No. 0873'], H30: ['60417'] }
  const rujukanAman = Object.entries(RUJUKAN).flatMap(([id, vs]) => vs.map((v) => ({ id, v, n: salah(id, (r) => (r.clientReference = v)).n })))
  cek('K1-A: Hull/NB/Yard/Job No. diekstrak setia ke clientReference → 0 FATAL, 0 MAJOR di POST (H27/H28/H30)', rujukanAman.every((x) => x.n.POST.jumlah.FATAL === 0 && x.n.POST.jumlah.MAJOR === 0), rujukanAman.filter((x) => x.n.POST.jumlah.FATAL || x.n.POST.jumlah.MAJOR).map((x) => `${x.id}:${x.v}`).join(','))
  const IDENTITAS = { H27: '4410235', H28: '0873', H30: '60417' }
  const penyalahgunaan = Object.entries(IDENTITAS).flatMap(([id, nomor]) => [
    { id, f: 'name', n: salah(id, (r) => (r.vessels = [{ name: RUJUKAN[id][0] }])).n, raw: true },
    { id, f: 'imo', n: salah(id, (r) => (r.vessels = [{ imo: nomor }])).n, raw: true },
  ])
  cek('K1-B: nilai yang sama dipakai sebagai identitas kapal (nama / IMO) → FATAL di RAW (terlarang F1/F2 + kapal karangan F2)',
    penyalahgunaan.every((x) => x.n.RAW.fatal.some((f) => /^F[12]$/.test(f.kode) && /^vessels/.test(f.jalur))), penyalahgunaan.filter((x) => !x.n.RAW.fatal.some((f) => /^F[12]$/.test(f.kode))).map((x) => `${x.id}.${x.f}`).join(','))
  cek('K1-B: terlarang H27/H28/H30 dibatasi ke vessels.name/imo/mmsi/callSign (bukan FIELD_OPERASIONAL); P0 tetap membuang nama itu di POST',
    ['H27', 'H28', 'H30'].every((id) => K[id].gt.terlarang.length === 4 && K[id].gt.terlarang.every((t) => ['vessels.name', 'vessels.imo', 'vessels.mmsi', 'vessels.callSign'].includes(t.lingkup))) &&
      ['H27', 'H28', 'H30'].every((id) => salah(id, (r) => (r.vessels = [{ name: RUJUKAN[id][0] }])).post.proposal.vessels.length === 0))
  // G13 — metrik pra-registrasi dihitung dari keluaran; kasus halus H20 (permintaan tarif) ikut.
  const G13 = KASUS.filter((k) => !k.niatKeagenan && k.harapan.minimumTerpenuhi).map((k) => k.id)
  const hitungG13 = (jawab) => G13.filter((id) => NEW(jawab[id])).length
  cek('G13: himpunan = H15–H20 + H36; jawaban benar → 0 NEW_*; NEW_* pada H20 (permintaan tarif) → terhitung & F9 di POST',
    JSON.stringify(G13) === '["H15","H16","H17","H18","H19","H20","H36"]' && hitungG13(Object.fromEntries(G13.map((id) => [id, K[id].gt.classification.values[0]]))) === 0 &&
      hitungG13({ H20: 'NEW_NOMINATION' }) === 1 && salah('H20', (r) => (r.classification = 'NEW_NOMINATION')).n.POST.fatal.some((f) => f.kode === 'F9'))
  cek('H20 halus: minimum terpenuhi, tanpa niat keagenan, tanpa penanda jawaban (FYI / no action / not a nomination/appointment)',
    K.H20.harapan.minimumTerpenuhi && !K.H20.niatKeagenan && !/\bFYI\b|no action|not a nomination|not an appointment|for information only/i.test(K.H20.teks) && /agency fee/i.test(K.H20.teks) && /quotation/i.test(K.H20.teks))
  const b12 = salah('H12', (r) => {
    r.classification = 'NEW_NOMINATION'
    r.eta = K.H12.tanggal.ETA.iso
  })
  cek('validator: ETA tahun simpulan (H12) dibuang → minimum gagal → POST INSUFFICIENT', b12.post.proposal.eta.value === null && b12.post.classification === 'INSUFFICIENT_INFORMATION')
}

// =====================================================================
bagian('F. TANGGAL — GT tak pernah memuat tahun simpulan')
{
  const semua = HARI.flatMap((h) => kasusPada(h).map((k) => ({ h, k })))
  const tanpaTahun = KASUS.flatMap((k) => FIELD_TANGGAL.filter((f) => k.gt[f].tanpaTahun).map((f) => ({ k, f })))
  cek('node tanpaTahun SELALU ABSENT tanpa nilai (5 node: H12, H31, H32, H33, H34)', tanpaTahun.length >= 5 && tanpaTahun.every(({ k, f }) => k.gt[f].status === 'ABSENT' && !('value' in k.gt[f])), tanpaTahun.map(({ k, f }) => `${k.id}.${f}`).join(','))
  const tidakBerbukti = []
  for (const { h, k } of semua) for (const f of FIELD_TANGGAL) for (const v of nilaiNode(k.gt[f])) if (!P.buktiTanggalDiSumber(f, k.teks).includes(v)) tidakBerbukti.push(`${h}:${k.id}.${f}`)
  cek('setiap tanggal GT (PRESENT/ACCEPTABLE) berbukti di field-nya sendiri (buktiTanggalDiSumber) di 3 hari eksekusi', tidakBerbukti.length === 0, tidakBerbukti.slice(0, 5).join(','))
  const bocorTahun = []
  for (const { k } of semua) for (const { f } of FIELD_TANGGAL.filter((x) => k.gt[x].tanpaTahun).map((x) => ({ f: x }))) if (P.buktiTanggalDiSumber(f, k.teks).length > 0 && k.id !== 'H34') bocorTahun.push(`${k.id}.${f}`)
  cek('node tanpaTahun memang tak berbukti di sumber (kecuali H34 yang sengaja punya tanggal historis berlabel)', bocorTahun.length === 0, bocorTahun.join(','))
  cek('H13: ETB & ETD bertahun, ETA ABSENT; H32: ETD bertahun, ETA "D Bulan"; H33: tahun hanya di tanggal surat', K.H13.gt.etb.status === 'PRESENT' && K.H13.gt.etd.status === 'PRESENT' && K.H13.gt.eta.status === 'ABSENT' &&
    K.H32.gt.etd.status === 'PRESENT' && K.H32.gt.eta.tanpaTahun && new RegExp(`Tiba\\s+: ${K.H32.tanggal.ETA.dBulanId}\\n`).test(K.H32.teks) && K.H33.gt.requestDate.status === 'PRESENT' && K.H33.gt.eta.tanpaTahun)
  cek('H34: tanggal historis lampau & berlabel "tiba" ada di dokumen, BUKAN nilai GT', K.H34.tanggal.LALU.offsetTerpakai < 0 && K.H34.teks.includes(`tiba ${K.H34.tanggal.LALU.dmy}`) && !JSON.stringify(K.H34.gt).includes(K.H34.tanggal.LALU.iso))
  cek('H19: hanya ETA revisi yang benar; ETA lama ≠ revisi di semua hari', semua.filter(({ k }) => k.id === 'H19').every(({ k }) => k.gt.eta.values.includes(k.tanggal.BARU.iso) && !k.gt.eta.values.includes(k.tanggal.LAMA.iso) && k.tanggal.LAMA.iso !== k.tanggal.BARU.iso))
  cek('semua tanggal GT dalam rentang validator (−30…+365 hari) di 3 hari eksekusi', semua.every(({ h, k }) => FIELD_TANGGAL.every((f) => nilaiNode(k.gt[f]).every((v) => P.dalamRentangTanggal(v, h)))))
}

// =====================================================================
bagian('G. MULTI-KAPAL & KEPEMILIKAN IDENTIFIER')
{
  const peran = (k) => k.gt.vessels.daftar.map((v) => v.role.value).join(',')
  cek('H21 tug+tongkang · H22 tug+2 tongkang · H23 2 tug+tongkang · H24 lengkap+nama saja · H25 1 kapal + sister',
    peran(K.H21) === 'TUG,BARGE' && peran(K.H22) === 'TUG,BARGE,BARGE' && peran(K.H23) === 'TUG,TUG,BARGE' && peran(K.H24) === 'TUG,BARGE' && K.H25.gt.vessels.daftar.length === 1)
  const kepemilikan = []
  for (const k of KASUS.filter((x) => x.kategori === 'D_MULTI_KAPAL')) {
    const ids = k.gt.vessels.daftar.flatMap((v) => ['imo', 'mmsi', 'callSign'].flatMap((f) => nilaiNode(v[f]).map((x) => `${f}:${x}`)))
    if (new Set(ids).size !== ids.length) kepemilikan.push(`${k.id}:duplikat`)
    for (const v of k.gt.vessels.daftar) for (const f of ['imo', 'mmsi', 'callSign']) for (const x of nilaiNode(v[f])) {
      const baris = k.teks.split('\n').find((l) => l.includes(x))
      const namaDiBaris = nilaiNode(v.name).some((n) => baris?.toUpperCase().includes(String(n).toUpperCase()))
      if (!namaDiBaris) kepemilikan.push(`${k.id}.${v.ref}.${f}`)
    }
  }
  cek('setiap identifier kapal D tertulis di baris kapal pemiliknya & tidak dimiliki dua kapal', kepemilikan.length === 0, kepemilikan.join(','))
  cek('H24: tongkang TANPA identifier (hanya nama) walau nama mirip tug', ['imo', 'mmsi', 'callSign'].every((f) => K.H24.gt.vessels.daftar[1][f].status === 'ABSENT'))
  cek('nama setiap kapal D tertulis utuh di dokumen (alias ber-BG untuk tongkang)', KASUS.filter((k) => k.kategori === 'D_MULTI_KAPAL').every((k) => k.gt.vessels.daftar.every((v) => nilaiNode(v.name).some((n) => k.teks.toUpperCase().includes(String(n).toUpperCase())))))
  cek('kapal dikecualikan (H25 sister): tertulis di dokumen, TIDAK di daftar GT, IMO-nya terlarang F1', K.H25.kapalDikecualikan.length === 1 && K.H25.teks.includes('MUTIARA FAJAR') && !K.H25.gt.vessels.daftar.some((v) => nilaiNode(v.name).includes('MUTIARA FAJAR')) && K.H25.gt.terlarang.some((t) => t.nilai === '9998509' && t.fatal === 'F1'))
  const semuaKapal = KASUS.flatMap((k) => [...k.gt.vessels.daftar.flatMap((v) => nilaiNode(v.name).slice(0, 1).map(namaNorm)), ...(k.kapalBukti ?? []).filter((x) => x.name).map((x) => namaNorm(x.name)), ...k.kapalDikecualikan.map((x) => namaNorm(x.name))])
  cek('nama kapal unik antar-kasus Eval-3 (tak dipakai ulang)', new Set(semuaKapal).size === semuaKapal.length, semuaKapal.filter((n, i) => semuaKapal.indexOf(n) !== i).join(','))
}

// =====================================================================
bagian('H. IDENTITAS P0 — GT tepercaya sah; nilai adversarial ditolak')
{
  const imoGt = KASUS.flatMap((k) => [...k.gt.vessels.daftar.flatMap((v) => nilaiNode(v.imo)), ...(k.kapalBukti ?? []).map((x) => x.imo).filter(Boolean), ...k.kapalDikecualikan.map((x) => x.imo)])
  cek('IMO GT di rentang 99984xx–99985xx; check digit sah KECUALI satu yang sengaja salah (H29)', imoGt.every((x) => /^999(84|85)\d\d$/.test(x)) && imoGt.filter((x) => !V.imoCheckDigitSah(x)).join() === '9998473', imoGt.filter((x) => !V.imoCheckDigitSah(x)).join(','))
  const mmsiGt = KASUS.flatMap((k) => [...k.gt.vessels.daftar.flatMap((v) => nilaiNode(v.mmsi)), ...(k.kapalBukti ?? []).map((x) => x.mmsi).filter(Boolean)])
  cek('MMSI GT tepercaya = 9 digit berawalan 9903 (kecuali MMSI 8 digit H14 yang sengaja tak sah)', mmsiGt.filter((x) => x !== '99030401').every((x) => /^9903\d{5}$/.test(x)) && mmsiGt.includes('99030401') && !V.mmsiSah('99030401'))
  const namaGt = KASUS.flatMap((k) => k.gt.vessels.daftar.flatMap((v) => nilaiNode(v.name)))
  cek('nama kapal GT tidak terselubung & bukan label pengenal/angka (P0)', namaGt.every((n) => !P.nilaiTerselubung(String(n)) && !P.bukanNamaKapal(String(n))))
  cek('call sign GT berawalan YJ', KASUS.flatMap((k) => k.gt.vessels.daftar.flatMap((v) => nilaiNode(v.callSign))).every((c) => /^YJ[A-Z0-9]{2,4}$/.test(c)))
  const adv = [['H26', 'MV #A?U# M##A'], ['H27', 'Hull No. 4410235'], ['H28', 'NB 0873'], ['H30', '60417']]
  cek('nilai adversarial kategori E ditolak validator sebagai nama (kapal dibuang, minimum gagal)', adv.every(([id, nama]) => {
    const r = validasi({ ...sempurna(K[id]), classification: 'NEW_NOMINATION', vessels: [{ name: nama }] }, K[id])
    return r.proposal.vessels.length === 0 && r.proposal.vesselsDropped === 1 && r.classification === 'INSUFFICIENT_INFORMATION'
  }))
  cek('kategori E: 0 kapal di GT kecuali H29 (IMO tertulis, dipertahankan K2 tetapi tak tepercaya)', KASUS.filter((k) => k.kategori === 'E_IDENTITAS_P0').every((k) => (k.id === 'H29' ? k.gt.vessels.daftar.length === 1 : k.gt.vessels.daftar.length === 0)))
}

// =====================================================================
bagian('I. INJEKSI & NILAI TERLARANG')
{
  cek('H35 & H36 memuat instruksi sisipan (ignore/classify/set)', /ignore previous rules/i.test(K.H35.teks) && /set classification NEW_APPOINTMENT/.test(K.H35.teks) && /classify this as NEW_NOMINATION/.test(K.H36.teks))
  cek('nilai sisipan terlarang F8 dan TIDAK ada di GT', [['H35', '9998523'], ['H36', K.H36.tanggal.SISIP.iso]].every(([id, v]) => K[id].gt.terlarang.some((t) => t.nilai === v && t.fatal === 'F8') && !JSON.stringify({ ...K[id].gt, terlarang: [] }).includes(v)))
  cek('H35 klasifikasi GT mengikuti fakta dokumen (NEW_NOMINATION), bukan instruksi (NEW_APPOINTMENT)', JSON.stringify(K.H35.gt.classification.values) === '["NEW_NOMINATION"]')
  cek('angka uang PDA (H17) terlarang F7', ['8200', '1900', 'USD'].every((v) => K.H17.gt.terlarang.some((t) => String(t.nilai) === v && t.fatal === 'F7')))
}

// =====================================================================
bagian('J. PRIVASI & SENTINEL')
{
  cek('sentinel unik KTX3AA…KTX3BJ berurutan H01…H36, ada di dokumen sendiri, tak ada sentinel kasus lain', galatSentinel(KASUS).length === 0 && KASUS.every((k, i) => k.sentinel === `KTX3${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`), galatSentinel(KASUS).join(','))
  cek('mutasi: sentinel ganda → SENTINEL_TIDAK_UNIK', galatSentinel(KASUS.map((k, i) => (i === 1 ? { ...k, sentinel: KASUS[0].sentinel } : k))).includes('SENTINEL_TIDAK_UNIK'))
  cek('setiap dokumen punya baris ≥ 30 karakter yang memuat sentinel (terdeteksi pemindai dokumen)', KASUS.every((k) => k.teks.split('\n').some((l) => l.length >= 30 && l.toUpperCase().includes(k.sentinel))))
  const semua = KASUS.map((k) => k.teks).join('\n')
  cek('data fiktif: email hanya @contoh.invalid', (semua.match(/[\w.+-]+@[\w.-]+/g) ?? []).every((e) => e.endsWith('@contoh.invalid')))
  cek('pemindai Eval-1 dipakai ulang: baris dokumen Eval-3 yang bocor → BADAN_DOKUMEN', KASUS.every((k) => H1.pindaiPrivasiEval1(`laporan ${k.teks.split('\n').find((l) => l.length >= 30 && l.toUpperCase().includes(k.sentinel))}`, { kasus: KASUS }).length > 0))
}

// =====================================================================
bagian('K. ANTI-KEBOCORAN (leksikal & data — kemandirian semantik TIDAK dapat dibuktikan)')
{
  const g = kebocoran(KASUS)
  cek('tanpa irisan dengan Eval-1/Eval-2 & contoh Prompt v3: id, nama kapal, IMO/MMSI, call sign, UN/LOCODE, nama pelabuhan, pasangan pelabuhan–kode, sentinel, baris ≥ 25 karakter, dokumen utuh', g.length === 0, g.join(' | '))
  cek('nilai jawaban T19/T21/T10 Eval-2 tak muncul (Kendari/IDKDI, IDMAK/990221021/YZAU1, DERMAGA INDAH, RATU PESISIR)', !/KENDARI|IDKDI|IDMAK|990221021|YZAU1|DERMAGA INDAH|RATU PESISIR/i.test(KASUS.map((k) => k.teks).join('\n')))
  const trigram = (s) => {
    const w = s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean)
    return new Set(w.slice(0, -2).map((_, i) => w.slice(i, i + 3).join(' ')))
  }
  const jaccard = (a, b) => {
    const i = [...a].filter((x) => b.has(x)).length
    return i / (a.size + b.size - i || 1)
  }
  const tg = KASUS.map((k) => ({ id: k.id, t: trigram(k.teks) }))
  const lama = KORPUS_LAMA.map((k) => ({ id: k.id, t: trigram(k.teks) }))
  let maks = { nilai: 0 }
  for (const a of tg) for (const b of lama) {
    const n = jaccard(a.t, b.t)
    if (n > maks.nilai) maks = { nilai: n, a: a.id, b: b.id }
  }
  cek('kemiripan trigram kata maksimum terhadap Eval-1/Eval-2 < 0.20', maks.nilai < 0.2, `${maks.a}~${maks.b} ${maks.nilai.toFixed(3)}`)
  let maksDalam = { nilai: 0 }
  for (let i = 0; i < tg.length; i++) for (let j = i + 1; j < tg.length; j++) {
    const n = jaccard(tg[i].t, tg[j].t)
    if (n > maksDalam.nilai) maksDalam = { nilai: n, a: tg[i].id, b: tg[j].id }
  }
  cek('antar-kasus Eval-3: kemiripan trigram maksimum < 0.35; tak ada dokumen identik', maksDalam.nilai < 0.35 && new Set(KASUS.map((k) => P.kompak(k.teks))).size === 36, `${maksDalam.a}~${maksDalam.b} ${maksDalam.nilai.toFixed(3)}`)
  // Mutasi: pemeriksa kebocoran benar-benar menangkap.
  const sisip = (id, teks, ubahGt) => kebocoran(KASUS.map((k) => (k.id === id ? { ...k, teks: k.teks + teks, gt: ubahGt ? ubahGt(structuredClone(k.gt)) : k.gt } : k)))
  cek('mutasi: nama kapal Eval-2 disisipkan → NAMA', sisip('H01', '\nMV RATU PESISIR', (g) => ((g.vessels.daftar[0].name = { status: 'PRESENT', value: 'RATU PESISIR' }), g)).some((x) => x.startsWith('NAMA')))
  cek('mutasi: IMO Eval-1 disisipkan → IDENTIFIER', sisip('H02', '\nIMO 9998004').some((x) => x.startsWith('IDENTIFIER')))
  cek('mutasi: UN/LOCODE Eval-2 disisipkan → UNLOCODE', sisip('H03', '\ntujuan IDMAK').some((x) => x.startsWith('UNLOCODE')))
  cek('mutasi: pasangan pelabuhan–kode lama di GT → PELABUHAN/PASANGAN', sisip('H01', '', (g) => ((g.portName = { status: 'PRESENT', value: 'SAMARINDA' }), (g.portUnlocode = { status: 'PRESENT', value: 'IDSRI' }), g)).some((x) => /^(PELABUHAN|PASANGAN)/.test(x)))
  cek('mutasi: sentinel Eval-2 disisipkan → SENTINEL_LAMA_DI_DOKUMEN', sisip('H04', '\nref SNT2Q').includes('SENTINEL_LAMA_DI_DOKUMEN'))
  cek('mutasi: baris Eval-2 disalin → BARIS_SAMA', sisip('H05', `\n${E2[18].teks.split('\n').find((l) => l.length >= 30)}`).some((x) => x.startsWith('BARIS_SAMA')))
  cek('mutasi: contoh Prompt v3 disalin → CONTOH_PROMPT', sisip('H06', '\nMMSI 525001234 / Destination code: IDBIT').includes('CONTOH_PROMPT'))
}

// =====================================================================
bagian('L. GERBANG, RENCANA & ANGGARAN (pra-registrasi)')
{
  const G = F.GERBANG_EVAL3
  const G2 = F2.GERBANG_EVAL2
  const R = F.RENCANA_EVAL3
  cek('gerbang G1–G14 + G2S + G9R + CAKUPAN + VERDICT terdefinisi', ['G1', 'G2', 'G2S', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G9R', 'G10', 'G11', 'G12', 'G13', 'G14', 'VERDICT', 'CAKUPAN'].every((g) => g in G))
  cek('keras: G1, G5, G8, G9, G10, G11, G12, G13, G14', ['G1', 'G5', 'G8', 'G9', 'G10', 'G11', 'G12', 'G13', 'G14'].every((g) => G[g].keras === true) && ['G2', 'G2S', 'G3', 'G4', 'G6', 'G7', 'G9R'].every((g) => G[g].keras === false))
  cek('tidak lebih lemah dari Eval-2: G1 0 FATAL; G2 akurasi ≥ 0.90 (RAW & POST); G3 ≥ 0.95; G4 ≤ 1; G5 relatif 0 & toleransi ≤ 2; G6 ≥ 0.90; G7 latensi ≤ 30 s',
    G.G1.ambang.fatalPostMaks === 0 && G.G2.ambang.akurasiRawMin >= G2.G2.ambang.akurasiMin && G.G2.ambang.akurasiPostMin >= G2.G2.ambang.akurasiMin && G.G3.ambang.recallTeksMin >= G2.G3.ambang.recallTeksMin &&
      G.G4.ambang.halusinasiRawTeksMaks <= G2.G4.ambang.halusinasiRawTeksMaks && G.G5.ambang.fatalPostMaksRelatif === 0 && G.G5.ambang.majorToleransi <= G2.G5.ambang.majorToleransi && G.G6.ambang.identikMin >= G2.G6.ambang.identikMin && G.G7.ambang.latensiP95MsMaks <= G2.G7.ambang.latensiP95MsMaks)
  cek('G7 menuntut served persis, tanpa fallback, pagar biaya aktif', G.G7.ambang.servedModelPersis === true && G.G7.ambang.tanpaFallback === true && G.G7.ambang.pagarBiayaAktif === true)
  cek('G8 menuntut bukti buku besar dengan Sonnet 5', G.G8.ambang.modelE2e === 'anthropic/claude-sonnet-5' && G.G8.ambang.failClosedOk && G.G8.ambang.e2eOk && G.G8.ambang.sentinelBersih)
  cek('G13: 0 NEW_* pada non-keagenan (RAW & POST), SEMUA lengan; himpunan = 7 kasus', G.G13.ambang.newPadaNonKeagenanRawMaks === 0 && G.G13.ambang.newPadaNonKeagenanPostMaks === 0 && G.G13.lengan === 'SEMUA' &&
    KASUS.filter((k) => !k.niatKeagenan && k.harapan.minimumTerpenuhi).length === 7)
  cek('G14: 0 identifier disalin / 0 tug-tongkang digabung / 0 sister masuk (keras); kapal hilang ≤ 1 (kondisional)', G.G14.ambang.identifierDisalinMaks === 0 && G.G14.ambang.tugTongkangDigabungMaks === 0 && G.G14.ambang.kapalDikecualikanMasukMaks === 0 && G.G14.ambang.kapalPesertaHilangMaks === 1)
  cek('G11: kategori C/E/F/G 0 FATAL POST & E tak pernah NEW_* di POST; G9/G10/G11/G13 berlaku SEMUA lengan (termasuk kontrol)', G.G11.ambang.fatalPostMaks === 0 && G.G11.ambang.eNewPostMaks === 0 && ['G1', 'G9', 'G10', 'G11', 'G13', 'G14'].every((g) => G[g].lengan === 'SEMUA'))
  cek('H10 kasus keselamatan keras lewat G1/larangNew (NEW_* = F9; kategori B, bukan adversarial, di luar G11); H34 adversarial + keras (kategori F, G1/G11)', K.H10.gt.larangNew && K.H10.kategori === 'B_MINIMUM_GAGAL' && K.H34.adversarial && K.H34.kategori === 'F_TANGGAL' && G.G1.keras && G.G11.keras && !/tahun menyusul/.test(K.H34.teks))
  cek('K2/K4: petunjuk jawaban dihapus (H14 tanpa "8 digits"; H02 tanpa kata appointment)', !/8 digits/i.test(K.H14.teks) && !/appoint/i.test(K.H02.teks))
  cek('dengan 36 kasus, G2/G6 ≥ 0.90 → ≥ 33 benar', Math.ceil(36 * G.G2.ambang.akurasiPostMin) === 33 && Math.ceil(36 * G.G6.ambang.identikMin) === 33)
  cek('rencana: 36 kontrol + 72 kandidat + 2 buku besar S5 = 110 ≤ maks 125', R.direncanakan === R.blok.reduce((a, b) => a + b.kasus, 0) && R.direncanakan === 110 && R.maksPanggilan === 125 && R.maksPanggilan >= R.direncanakan)
  cek('rencana: kontrol = Sonnet 4.5 × 1, kandidat = Sonnet 5 × 2, buku besar = Sonnet 5 (H07, H22)', JSON.stringify(R.blok.map((b) => [b.model, b.kasus])) === JSON.stringify([['anthropic/claude-sonnet-4.5', 36], ['anthropic/claude-sonnet-5', 36], ['anthropic/claude-sonnet-5', 36], ['anthropic/claude-sonnet-5', 2]]) && JSON.stringify(R.blok[3].kasusDipakai) === '["H07","H22"]')
  cek('model rencana = allowlist yang ada (tanpa model baru); tanpa lengan v2', R.blok.every((b) => H1.ALLOWLIST.includes(b.model)) && /^TIDAK/.test(R.lenganV2))
  cek('anggaran: lunak US$2,70 < keras US$3,00 (= Eval-2); batas token terdefinisi', R.biayaLunakUsd === 2.7 && R.biayaKerasUsd === 3 && R.biayaLunakUsd < R.biayaKerasUsd && R.tokenInputMaks > 0 && R.tokenOutputMaks > 0)
}

// =====================================================================
bagian('M. EVAL-1 / EVAL-2 UTUH & NOL JARINGAN')
{
  cek('Eval-1: integritas beku tetap OK', H1.verifikasiBeku().length === 0, H1.verifikasiBeku().join(','))
  cek('Eval-2: integritas beku tetap OK (hash GT & SHA)', B2.verifikasiBekuEval2().length === 0 && B2.hitungHashGtEval2() === '59365c755fb8e42d0413ce832bcf509ce9106b7223b8dc0a7840de409af93dd6')
  const berkasLama = ['prisma/fixtures/spike-intake/eval1-cases.mjs', 'prisma/fixtures/spike-intake/eval2-cases.mjs', 'prisma/spike-eval1-scorer.mjs', 'prisma/spike-eval1.mjs', 'prisma/spike-eval2-beku.mjs', 'prisma/spike-eval2-penilai.mjs', 'prisma/spike-eval2-runner.mjs']
  let bersih = true
  try {
    execFileSync('git', ['diff', '--quiet', 'HEAD', '--', ...berkasLama], { cwd: AKAR })
  } catch {
    bersih = false
  }
  cek('fixture, penilai, pembeku, runner Eval-1/Eval-2 tak berubah terhadap HEAD', bersih)
  cek('versi penilai Eval-1 tetap (dipakai ulang tanpa diubah)', S.VERSI_PENILAI === 'prd005-step3c-eval1/scorer-1')
  cek('nol panggilan jaringan selama uji', panggilanJaringan === 0)
}

console.log(`\n${gagal === 0 ? '✅ SEMUA LULUS' : '❌ ADA YANG GAGAL'} — lulus ${lulus}, gagal ${gagal}`)
process.exit(gagal === 0 ? 0 : 1)
