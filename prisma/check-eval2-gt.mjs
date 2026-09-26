// Uji LURING Eval-2 TARGETED — PRD-005 E5 Step 4 (TANPA AI, TANPA jaringan, TANPA DB).
//
// Jalankan:  node prisma/check-eval2-gt.mjs
//
// Lapis:
//   A. INTEGRITAS — 26 kasus, id unik & persis, versi, pembekuan (hash + SHA) & uji mutasi.
//   B. SKEMA GT — setiap node sah, field wajib lengkap, klasifikasi sesuai polaritas.
//   C. TANGGAL — tanggal GT berbukti di field-nya (pagar Step 1); node tanpaTahun tak berbukti &
//      tak pernah bernilai; tiga tanggal eksekusi (termasuk pergantian tahun).
//   D. MULTI-KAPAL & KAPAL DIKECUALIKAN — jumlah & peran; kapal riwayat/sister tak ada di GT.
//   E. KONSISTENSI VALIDATOR (prasyarat G12) — jawaban sempurna dari GT lewat validasiEkstraksi +
//      penilai Eval-1 → 0 FATAL/0 MAJOR; setiap harapanValidator terjadi persis.
//   F. PRIVASI & SENTINEL — sentinel unik, terdeteksi pemindai, sebaran lokasi, data fiktif.
//   G. ANTI-DUPLIKASI — antar-kasus Eval-2 & terhadap Eval-1.
//   H. GERBANG & RENCANA — lengkap dan TIDAK lebih lemah dari Eval-1.
//   I. EVAL-1 UTUH & NOL PANGGILAN JARINGAN.

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

const F = await import('./fixtures/spike-intake/eval2-cases.mjs')
const B = await import('./spike-eval2-beku.mjs')
const S = await import('./spike-eval1-scorer.mjs')
const H = await import('./spike-eval1.mjs')
const F1 = await import('./fixtures/spike-intake/eval1-cases.mjs')
const require = createRequire(import.meta.url)
const jiti = require('jiti')(fileURLToPath(import.meta.url), { alias: { '@': join(AKAR, 'src') }, interopDefault: true })
const P = jiti(join(AKAR, 'src/services/intake/intake-policy.ts'))
const V = jiti(join(AKAR, 'src/lib/vessels.ts'))

const NORM_VALIDASI = { imo: V.normalisasiImo, imoSah: V.imoCheckDigitSah, mmsi: V.normalisasiMmsi, mmsiSah: V.mmsiSah, callSign: V.normalisasiCallSign }
const NORM_SKOR = { namaKapal: P.normalisasiNamaKapal, namaPort: P.normalisasiNamaPort, namaPihak: P.normalisasiNamaPihak, unlocode: P.normalisasiUnlocode, imo: V.normalisasiImo, mmsi: V.normalisasiMmsi, callSign: V.normalisasiCallSign }

const HARI = ['2026-09-26', '2026-12-20', '2027-03-01'] // termasuk pergantian tahun
const HARI_UTAMA = HARI[0]
const kasusPada = (h) => F.bangunKasusEval2(new Date(`${h}T00:00:00Z`))
const KASUS = kasusPada(HARI_UTAMA)
const K = Object.fromEntries(KASUS.map((k) => [k.id, k]))
const FIELD_TANGGAL = ['eta', 'etb', 'etc', 'etd', 'requestDate']
const FIELD_ATAS = ['portName', 'portUnlocode', 'jetty', 'eta', 'etb', 'etc', 'etd', 'principalName', 'customerName', 'agencyType', 'clientReference', 'requestDate']
const FIELD_KAPAL = ['name', 'imo', 'mmsi', 'callSign', 'vesselType', 'role']

// =====================================================================
bagian('A. INTEGRITAS & PEMBEKUAN')
{
  const ids = F.KASUS_EVAL2.map((k) => k.id)
  cek('tepat 26 kasus', ids.length === 26)
  cek('id unik & persis T01…T26', new Set(ids).size === 26 && JSON.stringify(ids) === JSON.stringify(B.ID_KASUS_EVAL2))
  cek('versi GT Eval-2 terpisah dari Eval-1', F.EVAL2_VERSI === 'prd005-e5-eval2/gt-1' && F.EVAL2_VERSI === B.VERSI_GT_EVAL2 && F.EVAL2_VERSI !== F1.EVAL1_VERSI)
  const hitung = (pred) => F.KASUS_EVAL2.filter(pred).length
  const perKat = Object.fromEntries(Object.keys(F.KATEGORI_EVAL2).map((c) => [c, { jumlah: hitung((k) => k.kategori === c), positif: hitung((k) => k.kategori === c && k.polaritas === 'POSITIF'), negatif: hitung((k) => k.kategori === c && k.polaritas === 'NEGATIF') }]))
  cek('jumlah per kategori = rancangan (OCR 5 · TANGGAL 5 · MULTI 4 · LINTAS BAGIAN 4 · PARSIAL 8)', JSON.stringify(perKat) === JSON.stringify(F.KATEGORI_EVAL2), JSON.stringify(perKat))
  cek('setiap kasus berkategori sah', F.KASUS_EVAL2.every((k) => k.kategori in F.KATEGORI_EVAL2))
  cek('semua kasus TEXT (E2K7)', F.KASUS_EVAL2.every((k) => k.kind === 'TEXT'))
  const galat = B.verifikasiBekuEval2()
  cek('pembekuan: hash kanonik & SHA berkas = nilai beku', galat.length === 0, galat.join(','))
  // mutasi GT → hash berubah
  const modMutasi = { ...F, KASUS_EVAL2: F.KASUS_EVAL2.map((k, i) => (i === 9 ? { ...k, gt: { ...k.gt, eta: { status: 'PRESENT', value: { tanggalRef: 'D' } } } } : k)) }
  cek('mutasi: ETA tanpa tahun diubah jadi berisi → HASH_GT_BERBEDA', B.verifikasiBekuEval2({ mod: modMutasi }).includes('HASH_GT_BERBEDA'))
  const modTeks = { ...F, KASUS_EVAL2: F.KASUS_EVAL2.map((k, i) => (i === 0 ? { ...k, teks: () => 'dokumen lain' } : k)) }
  cek('mutasi: isi dokumen diubah → HASH_GT_BERBEDA (teks ikut di-hash)', B.verifikasiBekuEval2({ mod: modTeks }).includes('HASH_GT_BERBEDA'))
  const modGerbang = { ...F, GERBANG_EVAL2: { ...F.GERBANG_EVAL2, G2: { ...F.GERBANG_EVAL2.G2, ambang: { akurasiMin: 0.8, newPalsuNegatifMaks: 0 } } } }
  cek('mutasi: ambang gerbang dilonggarkan → HASH_GT_BERBEDA', B.verifikasiBekuEval2({ mod: modGerbang }).includes('HASH_GT_BERBEDA'))
  const isi = readFileSync(B.BERKAS_FIXTURE_EVAL2)
  cek('mutasi: satu byte berkas (komentar) diubah → SHA_BERKAS_BERBEDA', B.verifikasiBekuEval2({ isiBerkas: Buffer.concat([isi, Buffer.from(' ')]) }).includes('SHA_BERKAS_BERBEDA'))
  cek('mutasi: kasus dibuang → JUMLAH/HIMPUNAN berbeda', (() => {
    const g = B.verifikasiBekuEval2({ mod: { ...F, KASUS_EVAL2: F.KASUS_EVAL2.slice(1) } })
    return g.includes('JUMLAH_KASUS_BUKAN_26') && g.includes('HIMPUNAN_KASUS_BERBEDA')
  })())
  cek('hash kanonik deterministik (dua kali hitung sama)', B.hitungHashGtEval2() === B.hitungHashGtEval2())
}

// =====================================================================
bagian('B. SKEMA GROUND TRUTH')
{
  const STATUS = ['PRESENT', 'ABSENT', 'ACCEPTABLE', 'NOT_SCORED']
  const nodeSah = (n) =>
    !!n && STATUS.includes(n.status) &&
    (n.status !== 'PRESENT' || (n.value !== undefined && n.value !== null)) &&
    (n.status !== 'ACCEPTABLE' || (Array.isArray(n.values) && n.values.length > 0))
  const salah = []
  for (const k of KASUS) {
    const g = k.gt
    if (!(g.classification?.status === 'ACCEPTABLE' && g.classification.values.every((c) => P.KLASIFIKASI.includes(c)))) salah.push(`${k.id}.classification`)
    for (const f of FIELD_ATAS) if (!nodeSah(g[f])) salah.push(`${k.id}.${f}`)
    if (!(g.vessels?.jumlah?.status === 'PRESENT' && Array.isArray(g.vessels.daftar) && g.vessels.jumlah.value === g.vessels.daftar.length)) salah.push(`${k.id}.vessels.jumlah`)
    for (const v of g.vessels.daftar) {
      if (!v.ref) salah.push(`${k.id}.vessels.ref`)
      for (const f of FIELD_KAPAL) if (!nodeSah(v[f])) salah.push(`${k.id}.${v.ref}.${f}`)
      if (v.role.status === 'PRESENT' && !P.PERAN_KAPAL.includes(v.role.value)) salah.push(`${k.id}.${v.ref}.role`)
    }
    if (!Array.isArray(g.cargoes?.bentukDiterima) || !g.cargoes.bentukDiterima.length) salah.push(`${k.id}.cargoes`)
    for (const bentuk of g.cargoes.bentukDiterima) for (const c of bentuk) for (const f of ['name', 'quantity', 'unit', 'operation']) if (!nodeSah(c[f])) salah.push(`${k.id}.cargo.${f}`)
    if (!g.contact || !('status' in g.contact ? nodeSah(g.contact) : ['name', 'email', 'phone'].every((f) => nodeSah(g.contact[f])))) salah.push(`${k.id}.contact`)
    if (!Array.isArray(g.terlarang)) salah.push(`${k.id}.terlarang`)
    if (!('larangNew' in g)) salah.push(`${k.id}.larangNew`)
    if (!['POSITIF', 'NEGATIF'].includes(k.polaritas) || typeof k.adversarial !== 'boolean' || !k.judul || !F.KASUS_EVAL2.find((x) => x.id === k.id).mekanisme) salah.push(`${k.id}.meta`)
  }
  cek('setiap node GT sah & field wajib lengkap (klasifikasi, kapal, 12 field atas, muatan, kontak, terlarang, larangNew, meta)', salah.length === 0, salah.slice(0, 8).join(','))
  const NEW = ['NEW_NOMINATION', 'NEW_APPOINTMENT']
  const neg = KASUS.filter((k) => k.polaritas === 'NEGATIF')
  cek('kasus NEGATIF ditandai eksplisit: hanya INSUFFICIENT_INFORMATION + larangNew berisi alasan', neg.length === 5 && neg.every((k) => JSON.stringify(k.gt.classification.values) === '["INSUFFICIENT_INFORMATION"]' && typeof k.gt.larangNew === 'string' && k.gt.larangNew.length > 10), neg.map((k) => k.id).join(','))
  const pos = KASUS.filter((k) => k.polaritas === 'POSITIF')
  cek('kasus POSITIF: HANYA NEW_* (INSUFFICIENT bukan jawaban benar — E2K2) & larangNew null', pos.length === 21 && pos.every((k) => JSON.stringify(k.gt.classification.values) === JSON.stringify(NEW) && k.gt.larangNew === null))
  cek('kasus adversarial ditandai (T05, T10, T14, T18, T25, T26)', JSON.stringify(KASUS.filter((k) => k.adversarial).map((k) => k.id)) === '["T05","T10","T14","T18","T25","T26"]')
  cek('setiap kasus punya harapanValidator (larik) & kapalDikecualikan (larik)', KASUS.every((k) => Array.isArray(k.harapanValidator) && Array.isArray(k.kapalDikecualikan)))
}

// =====================================================================
bagian('C. TANGGAL — GT tak pernah memuat tahun simpulan')
{
  const mentah = F.KASUS_EVAL2
  const tanpaTahun = mentah.flatMap((k) => FIELD_TANGGAL.filter((f) => k.gt[f]?.tanpaTahun).map((f) => ({ k, f })))
  cek('node tanpaTahun SELALU ABSENT tanpa value/values (GT tak menyimpan tahun simpulan)', tanpaTahun.length >= 8 && tanpaTahun.every(({ k, f }) => k.gt[f].status === 'ABSENT' && !('value' in k.gt[f]) && !('values' in k.gt[f])), `${tanpaTahun.length} node`)
  cek('kategori TANGGAL: setiap kasus punya ≥ 1 node tanpaTahun', mentah.filter((k) => k.kategori === 'TANGGAL_TANPA_TAHUN').every((k) => FIELD_TANGGAL.some((f) => k.gt[f]?.tanpaTahun)))
  for (const h of HARI) {
    const ks = kasusPada(h)
    const masalah = []
    for (const k of ks) {
      const src = P.normalisasiTeksSumber(k.teks)
      for (const f of FIELD_TANGGAL) {
        const n = k.gt[f]
        const bukti = P.buktiTanggalDiSumber(f, src)
        const nilai = n.status === 'PRESENT' ? [n.value] : n.status === 'ACCEPTABLE' ? n.values.filter((x) => x !== null) : []
        for (const v of nilai) {
          if (!bukti.includes(v)) masalah.push(`${k.id}.${f}:${v} tak berbukti`)
          if (!P.dalamRentangTanggal(v, h)) masalah.push(`${k.id}.${f}:${v} di luar rentang`)
        }
        if (n.tanpaTahun && bukti.length) masalah.push(`${k.id}.${f} tanpaTahun tapi sumber berbukti ${bukti}`)
      }
    }
    cek(`hari eksekusi ${h}: tanggal GT berbukti di field-nya & dalam rentang; tanpaTahun tak berbukti`, masalah.length === 0, masalah.slice(0, 5).join(' | '))
  }
  const t10 = K.T10
  cek('T10 adversarial: ETA "DD/MM" dan ETD bertahun jatuh di tanggal kalender SAMA', t10.teks.includes(`Rencana tiba : ${t10.tanggal.D.dm}`) && t10.teks.includes(`Rencana berangkat : ${t10.tanggal.D.idLong}`) && t10.gt.etd.value === t10.tanggal.D.iso)
  cek('T09: ETA tanpa tahun ≠ ETD (tanggal berbeda, di semua hari eksekusi)', HARI.every((h) => { const k = kasusPada(h).find((x) => x.id === 'T09'); return k.tanggal.X.iso !== k.tanggal.ETD.iso }))
  cek('T08: "tgl 5"/"tgl 6" tanpa bulan & tahun; T07: arrival "D Month"; T06: "DD/MM"', /tgl 5, sandar tgl 6/.test(K.T08.teks) && !/\d{4}/.test(K.T08.teks.split('\n')[0].replace(/^\[WA \d\d\.\d\d\]/, '')) && /Expected arrival: \d{1,2} [A-Z][a-z]+$/m.test(K.T07.teks) && /ETA {9}: \d\d\/\d\d$/m.test(K.T06.teks))
}

// =====================================================================
bagian('D. MULTI-KAPAL & KAPAL DIKECUALIKAN')
{
  const peran = (k) => k.gt.vessels.daftar.map((v) => (v.role.status === 'PRESENT' ? v.role.value : '-')).join(',')
  cek('T11: 1 tug + 2 tongkang (3 entri)', K.T11.gt.vessels.jumlah.value === 3 && peran(K.T11) === 'TUG,BARGE,BARGE')
  cek('T12: 1 tug + 3 tongkang (4 entri)', K.T12.gt.vessels.jumlah.value === 4 && peran(K.T12) === 'TUG,BARGE,BARGE,BARGE')
  cek('T13: 2 tug + 2 tongkang (4 entri)', K.T13.gt.vessels.jumlah.value === 4 && peran(K.T13) === 'TUG,TUG,BARGE,BARGE')
  cek('setiap nama kapal GT multi-kapal tertulis di dokumen (alias ber-BG disediakan)', ['T11', 'T12', 'T13'].every((id) => K[id].gt.vessels.daftar.every((v) => P.kompak(K[id].teks).includes(P.kompak(v.name.value)))))
  const dikecualikan = KASUS.filter((k) => k.kapalDikecualikan.length)
  cek('kapal dikecualikan: T14 (riwayat) & T18 (sister)', JSON.stringify(dikecualikan.map((k) => k.id)) === '["T14","T18"]')
  cek('kapal dikecualikan TERTULIS di dokumen tetapi TIDAK ada di daftar GT', dikecualikan.every((k) => k.kapalDikecualikan.every((x) => P.kompak(k.teks).includes(P.kompak(x.name)) && k.teks.includes(x.imo) && k.gt.vessels.daftar.every((v) => P.normalisasiNamaKapal(v.name.value ?? '') !== P.normalisasiNamaKapal(x.name) && v.imo.value !== x.imo))))
  cek('IMO kapal dikecualikan terdaftar sebagai terlarang F1', dikecualikan.every((k) => k.kapalDikecualikan.every((x) => k.gt.terlarang.some((t) => t.nilai === x.imo && t.fatal === 'F1'))))
  cek('identitas kapal unik antar-kasus (nama & IMO & MMSI tak dipakai ulang)', (() => {
    const nama = KASUS.flatMap((k) => k.gt.vessels.daftar.map((v) => v.name.value).filter(Boolean).map((n) => P.normalisasiNamaKapal(n)))
    const imo = KASUS.flatMap((k) => k.gt.vessels.daftar.flatMap((v) => (v.imo.status === 'PRESENT' ? [v.imo.value] : v.imo.values ?? []).filter(Boolean)))
    const mmsi = KASUS.flatMap((k) => k.gt.vessels.daftar.flatMap((v) => (v.mmsi.status === 'PRESENT' ? [v.mmsi.value] : v.mmsi.values ?? []).filter(Boolean)))
    return new Set(nama).size === nama.length && new Set(imo).size === imo.length && new Set(mmsi).size === mmsi.length
  })())
}

// =====================================================================
bagian('E. KONSISTENSI VALIDATOR (prasyarat G12) — jawaban sempurna & perilaku deterministik')
const pilih = (n) => (!n || !('status' in n) ? null : n.status === 'PRESENT' ? n.value : n.status === 'ACCEPTABLE' ? n.values.find((x) => x !== null) ?? null : null)
/** Keluaran tool "sempurna" yang disusun dari GT (bukan dari model). */
function sempurna(k) {
  const g = k.gt
  const o = { classification: g.classification.values[0] }
  o.vessels = g.vessels.daftar.map((v) => Object.fromEntries(FIELD_KAPAL.map((f) => [f, pilih(v[f])]).filter(([, x]) => x !== null)))
  for (const f of FIELD_ATAS) {
    const x = pilih(g[f])
    if (x !== null) o[f] = x
  }
  o.cargoes = g.cargoes.bentukDiterima[0].map((c) => Object.fromEntries(['name', 'quantity', 'unit', 'operation'].map((f) => [f, pilih(c[f])]).filter(([, x]) => x !== null)))
  if (!('status' in g.contact)) {
    const c = Object.fromEntries(['name', 'email', 'phone'].map((f) => [f, pilih(g.contact[f])]).filter(([, x]) => x !== null))
    if (Object.keys(c).length) o.contact = c
  }
  return o
}
const validasi = (raw, k, h) => P.validasiEkstraksi(structuredClone(raw), { inputKind: 'TEXT', sourceText: P.normalisasiTeksSumber(k.teks), hariIni: h, norm: NORM_VALIDASI })
const bulanDepan = (h, hari) => {
  const d = new Date(`${h}T00:00:00Z`)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, hari)).toISOString().slice(0, 10)
}
for (const h of HARI) {
  const ks = kasusPada(h)
  const buruk = []
  for (const k of ks) {
    const raw = sempurna(k)
    const post = validasi(raw, k, h)
    const nilai = S.nilaiKasus(k, raw, post, NORM_SKOR)
    const ok = !nilai.ekstraktorGagal && nilai.RAW.jumlah.FATAL === 0 && nilai.RAW.jumlah.MAJOR === 0 && nilai.POST.jumlah.FATAL === 0 && nilai.POST.jumlah.MAJOR === 0 &&
      post.classification === raw.classification && post.proposal.vessels.length === k.gt.vessels.daftar.length && (post.proposal.vesselsDropped ?? 0) === 0
    if (!ok) buruk.push(`${k.id}:${JSON.stringify({ raw: nilai.RAW?.jumlah, post: nilai.POST?.jumlah, kls: post.classification, kapal: post.proposal.vessels.length, fatal: nilai.POST?.fatal, major: nilai.POST?.baris.filter((b) => b.keparahan?.tingkat === 'MAJOR').map((b) => b.jalur) })}`)
  }
  cek(`hari ${h}: jawaban sempurna dari GT → RAW & POST 0 FATAL/0 MAJOR, klasifikasi dipertahankan, tanpa kapal hilang (26 kasus)`, buruk.length === 0, buruk.slice(0, 3).join(' | '))
}
{
  const h = HARI_UTAMA
  const hasilHarapan = []
  for (const k of KASUS) {
    for (const x of k.harapanValidator) {
      const raw = sempurna(k)
      let ok = false
      let detail = ''
      if (x.jenis === 'OCR_CORRECTED') {
        const i = k.gt.vessels.daftar.findIndex((v) => v.ref === x.kapal)
        raw.vessels[i][x.field] = x.raw
        const f = validasi(raw, k, h).proposal.vessels[i][x.field]
        ok = f.flags.includes('OCR_CORRECTED') && f.value !== null
        detail = JSON.stringify(f.flags)
      } else if (x.jenis === 'DATE_NOT_IN_SOURCE' || x.jenis === 'MINIMUM_FIELDS_MISSING') {
        const iso = x.rawRef ? k.tanggal[x.rawRef].iso : x.rawIso === 'HARI_5_BULAN_DEPAN' ? bulanDepan(h, 5) : bulanDepan(h, 6)
        raw[x.field] = iso
        if (x.klasifikasiRaw) raw.classification = x.klasifikasiRaw
        const r = validasi(raw, k, h)
        const f = r.proposal[x.field]
        ok = f.value === null && f.flags.join() === 'DATE_NOT_IN_SOURCE' && f.extracted === iso && (!x.klasifikasiPost || r.classification === x.klasifikasiPost)
        detail = `${iso} → ${JSON.stringify(f.flags)} ${r.classification}`
      } else if (x.jenis === 'KAPAL_DIBUANG') {
        raw.vessels = structuredClone(x.raw)
        raw.classification = 'NEW_NOMINATION'
        const r = validasi(raw, k, h)
        ok = r.proposal.vesselsDropped === x.vesselsDropped && r.classification === x.klasifikasiPost && !JSON.stringify(r.proposal).includes(x.raw.find((v, i) => i >= 0 && v.name && !P.kompak(k.teks).includes(P.kompak(v.name)))?.name ?? '\u0000')
        detail = `dropped=${r.proposal.vesselsDropped} kls=${r.classification}`
      } else if (x.jenis === 'BATAS_VALIDATOR') {
        raw.vessels = structuredClone(x.raw)
        raw.classification = 'NEW_NOMINATION'
        const r = validasi(raw, k, h)
        ok = r.proposal.vessels.length === x.kapalPost && (!x.flagImo || r.proposal.vessels[0].imo.flags.includes(x.flagImo))
        detail = `kapalPost=${r.proposal.vessels.length} kls=${r.classification}`
      }
      hasilHarapan.push({ id: k.id, jenis: x.jenis, ok, detail })
    }
  }
  for (const x of hasilHarapan) cek(`harapan ${x.id} ${x.jenis}`, x.ok, x.detail)
  cek('harapanValidator mencakup kelima jenis perilaku deterministik', ['OCR_CORRECTED', 'DATE_NOT_IN_SOURCE', 'KAPAL_DIBUANG', 'BATAS_VALIDATOR', 'MINIMUM_FIELDS_MISSING'].every((j) => hasilHarapan.some((x) => x.jenis === j)))
  // Negatif tetap aman di POST walau RAW mengarang NEW_* (kecuali batas validator yang didokumentasikan).
  const t23 = validasi({ ...sempurna(K.T23), classification: 'NEW_NOMINATION' }, K.T23, h)
  cek('T23: RAW NEW_* tanpa pelabuhan/ETA → POST dipaksa INSUFFICIENT (MINIMUM_FIELDS_MISSING)', t23.classification === 'INSUFFICIENT_INFORMATION' && t23.proposal.classificationReason === 'MINIMUM_FIELDS_MISSING')
  const t14 = validasi({ ...sempurna(K.T14), vessels: [...sempurna(K.T14).vessels, { name: 'MV PELANGI SELATAN', imo: '9998341' }] }, K.T14, h)
  cek('T14: kapal riwayat yang ditambahkan model TERTULIS → validator TIDAK menahan (batas diketahui; ditangkap G11/penilai)', t14.proposal.vessels.length === 2)
}

// =====================================================================
bagian('F. PRIVASI & SENTINEL')
{
  cek('sentinel unik SNT2A…SNT2Z berurutan T01…T26 & cocok POLA_SENTINEL_EVAL2', KASUS.every((k, i) => k.sentinel === `SNT2${String.fromCharCode(65 + i)}` && F.POLA_SENTINEL_EVAL2.test(k.sentinel)))
  cek('pola sentinel Eval-2 tidak bertabrakan dengan Eval-1 (SNTLQ*)', !F.POLA_SENTINEL_EVAL2.test('SNTLQA') && !F1.POLA_SENTINEL.test('SNT2A'))
  // Sentinel boleh huruf kecil (mis. di alamat email) — pola pemindai tidak peka huruf besar/kecil.
  const ada = (teks, s) => teks.toUpperCase().includes(s.toUpperCase())
  cek('setiap dokumen memuat sentinel-nya sendiri (≥ 1×, tak peka huruf) dan TIDAK memuat sentinel kasus lain', KASUS.every((k) => ada(k.teks, k.sentinel) && KASUS.every((o) => o.id === k.id || !ada(k.teks, o.sentinel))))
  cek('setiap dokumen punya baris ≥ 30 karakter yang memuat sentinel (terdeteksi BADAN_DOKUMEN)', KASUS.every((k) => k.teks.split('\n').some((b) => b.trim().length >= 30 && ada(b, k.sentinel))))
  const pindai = (t) => H.pindaiPrivasiEval1(t, { kasus: KASUS })
  cek('pemindai Eval-1 dipakai ulang: baris dokumen Eval-2 yang bocor → BADAN_DOKUMEN', KASUS.every((k) => pindai(`laporan ... ${k.teks.split('\n').find((b) => b.trim().length >= 30)} ...`).includes('BADAN_DOKUMEN')))
  cek('pemindai: kontak Eval-2 yang bocor → KONTAK', pindai('email maya.snt2c@contoh.invalid').includes('KONTAK') && pindai('+62-000-000-2203').includes('KONTAK'))
  cek('pemindai: laporan bersih → tanpa temuan', pindai('{"id":"T01","hasil":"CORRECT","sidik":"a1b2c3d4e5f6"}').length === 0)
  const lokasi = {}
  for (const k of KASUS) lokasi[k.sentinelLokasi] = (lokasi[k.sentinelLokasi] ?? 0) + 1
  cek('sebaran lokasi sentinel: NAMA_KAPAL 5 · PIHAK 6 · KONTAK 6 · REFERENSI 6 · CATATAN 3', JSON.stringify(lokasi) === JSON.stringify({ PIHAK: 6, REFERENSI: 6, KONTAK: 6, NAMA_KAPAL: 5, CATATAN: 3 }), JSON.stringify(lokasi))
  cek('sentinelLokasi sesuai isi: NAMA_KAPAL ⇔ sentinel ada di nama kapal GT', KASUS.every((k) => (k.sentinelLokasi === 'NAMA_KAPAL') === k.gt.vessels.daftar.some((v) => (v.name.value ?? '').includes(k.sentinel))))
  const namaAlami = KASUS.flatMap((k) => k.gt.vessels.daftar.map((v) => v.name.value).filter(Boolean)).filter((n) => !F.POLA_SENTINEL_EVAL2.test(n))
  cek('hipotesis E03: ≥ 20 nama kapal ALAMI (tanpa sentinel) & multi-kapal punya kelompok sentinel (T11) vs alami (T12, T13)', namaAlami.length >= 20 && K.T11.gt.vessels.daftar.every((v) => v.name.value.includes('SNT2K')) && ['T12', 'T13'].every((id) => K[id].gt.vessels.daftar.every((v) => !F.POLA_SENTINEL_EVAL2.test(v.name.value))), `${namaAlami.length} nama alami`)
  const semua = KASUS.map((k) => k.teks).join('\n')
  cek('data fiktif: email hanya @contoh.invalid, telepon hanya +62-000', (semua.match(/[\w.+-]+@[\w.-]+/g) ?? []).every((e) => e.endsWith('@contoh.invalid')) && (semua.match(/\+\d[\d-]+/g) ?? []).every((t) => t.startsWith('+62-000')))
  const imoGt = KASUS.flatMap((k) => k.gt.vessels.daftar.flatMap((v) => (v.imo.status === 'PRESENT' ? [v.imo.value] : v.imo.values ?? []).filter(Boolean)))
  cek('IMO GT di rentang 99982xx–99983xx & check digit sah', imoGt.every((x) => /^999(82|83)\d\d$/.test(x) && V.imoCheckDigitSah(x)), imoGt.join(','))
  const mmsiGt = KASUS.flatMap((k) => k.gt.vessels.daftar.flatMap((v) => (v.mmsi.status === 'PRESENT' ? [v.mmsi.value] : v.mmsi.values ?? []).filter(Boolean)))
  cek('MMSI GT berawalan 9902 (alat bantu navigasi, bukan kapal)', mmsiGt.every((x) => /^9902\d{5}$/.test(x)))
}

// =====================================================================
bagian('G. ANTI-DUPLIKASI')
{
  const trigram = (s) => {
    const w = s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean)
    return new Set(w.slice(0, -2).map((_, i) => w.slice(i, i + 3).join(' ')))
  }
  const jaccard = (a, b) => {
    const i = [...a].filter((x) => b.has(x)).length
    return i / (a.size + b.size - i || 1)
  }
  const tg = KASUS.map((k) => ({ id: k.id, t: trigram(k.teks) }))
  let maks = { nilai: 0 }
  for (let i = 0; i < tg.length; i++) for (let j = i + 1; j < tg.length; j++) {
    const n = jaccard(tg[i].t, tg[j].t)
    if (n > maks.nilai) maks = { nilai: n, a: tg[i].id, b: tg[j].id }
  }
  cek('antar-kasus Eval-2: kemiripan trigram kata maksimum < 0.35', maks.nilai < 0.35, `${maks.a}~${maks.b} ${maks.nilai.toFixed(3)}`)
  const e1 = F1.bangunKasusEval1(new Date(`${HARI_UTAMA}T00:00:00Z`)).map((k) => ({ id: k.id, t: trigram(k.kind === 'TEXT' ? k.teks : F1.teksSpesifikasiPdf(k.pdf)) }))
  let maks1 = { nilai: 0 }
  for (const a of tg) for (const b of e1) {
    const n = jaccard(a.t, b.t)
    if (n > maks1.nilai) maks1 = { nilai: n, a: a.id, b: b.id }
  }
  cek('terhadap Eval-1 (termasuk E03/E10/E15): kemiripan trigram maksimum < 0.35 — bukan salinan', maks1.nilai < 0.35, `${maks1.a}~${maks1.b} ${maks1.nilai.toFixed(3)}`)
  cek('tidak ada dua dokumen identik (ternormalisasi)', new Set(KASUS.map((k) => P.kompak(k.teks))).size === 26)
}

// =====================================================================
bagian('H. GERBANG PRA-REGISTRASI & RENCANA (tidak lebih lemah dari Eval-1)')
{
  const G = F.GERBANG_EVAL2
  const A = S.AMBANG
  cek('gerbang G1–G12 + G9R + VERDICT terdefinisi', ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G9R', 'G10', 'G11', 'G12', 'VERDICT'].every((x) => x in G))
  cek('G1 nol FATAL POST (keras)', G.G1.ambang.fatalPostMaks === 0 && G.G1.keras)
  cek('G2 akurasi ≥ Eval-1', G.G2.ambang.akurasiMin >= A.akurasiKlasifikasi && G.G2.ambang.newPalsuNegatifMaks === 0)
  cek('G3 recall teks ≥ Eval-1', G.G3.ambang.recallTeksMin >= A.recallTeks)
  cek('G4 halusinasi RAW teks ≤ Eval-1 (mutlak)', G.G4.ambang.halusinasiRawTeksMaks <= A.halusinasiRawTeksMaks)
  cek('G5 toleransi MAJOR ≤ Eval-1 & FATAL relatif 0 (keras)', G.G5.ambang.majorToleransi <= A.majorToleransiG5 && G.G5.ambang.fatalPostMaksRelatif === 0 && G.G5.keras)
  cek('G6 stabilitas ≥ Eval-1', G.G6.ambang.identikMin >= A.stabilitas)
  cek('G7 latensi ≤ Eval-1, tanpa gagal tool/pagar', G.G7.ambang.latensiP95MsMaks <= A.latensiP95Ms && G.G7.ambang.gagalToolMaks === 0 && G.G7.ambang.pelanggaranPagarMaks === 0)
  cek('G8 buku besar wajib (keras)', G.G8.keras && G.G8.ambang.failClosedOk && G.G8.ambang.e2eOk && G.G8.ambang.sentinelBersih)
  cek('G9 nol tanggal tak berbukti di POST, kontrol & uji (keras); G10 hilang diam-diam 0 (keras); G11 negatif aman (keras); G12 prasyarat luring (keras)',
    G.G9.keras && G.G9.ambang.tanggalTakBerbuktiPostMaks === 0 && G.G10.keras && G.G10.ambang.hilangDiamDiamMaks === 0 && G.G11.keras && G.G11.ambang.fatalPostMaks === 0 && G.G11.ambang.kapalDikecualikanMunculMaks === 0 && G.G12.keras)
  cek('dengan 26 kasus, ambang G2/G6 = ≥ 24 benar (0.923)', Math.ceil(26 * G.G2.ambang.akurasiMin) === 24 && Math.ceil(26 * G.G6.ambang.identikMin) === 24)
  const R = F.RENCANA_EVAL2
  cek('rencana = 26×3 + 2 = 80 ≤ maks; biaya TIDAK dinaikkan dari Eval-1', R.direncanakan === R.blok.reduce((a, b) => a + b.kasus, 0) && R.direncanakan === 80 && R.direncanakan <= R.maksPanggilan && R.biayaLunakUsd <= H.BATAS_OWNER.biayaLunakUsd && R.biayaKerasUsd <= H.BATAS_OWNER.biayaKerasUsd)
  cek('model rencana = allowlist Eval-1 (tanpa model baru)', R.blok.every((b) => H.ALLOWLIST.includes(b.model)))
}

// =====================================================================
bagian('I. EVAL-1 UTUH & NOL JARINGAN')
{
  cek('Eval-1: integritas beku (hash GT & SHA berkas) tetap OK', H.verifikasiBeku().length === 0, H.verifikasiBeku().join(','))
  const berkasEval1 = ['prisma/fixtures/spike-intake/eval1-cases.mjs', 'prisma/spike-eval1-scorer.mjs', 'prisma/spike-eval1.mjs', 'prisma/spike-eval1-runner.mjs']
  let bersih = true
  try {
    execFileSync('git', ['diff', '--quiet', 'HEAD', '--', ...berkasEval1], { cwd: AKAR })
  } catch {
    bersih = false
  }
  cek('Eval-1: fixture, penilai, harness, runner tak berubah terhadap HEAD', bersih)
  cek('versi penilai Eval-1 tetap', S.VERSI_PENILAI === 'prd005-step3c-eval1/scorer-1')
  cek('nol panggilan jaringan selama uji', panggilanJaringan === 0)
}

console.log(`\n${gagal === 0 ? '✅ SEMUA LULUS' : '❌ ADA YANG GAGAL'} — lulus ${lulus}, gagal ${gagal}`)
process.exit(gagal === 0 ? 0 : 1)
