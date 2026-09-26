// Uji kontrak ekstraksi Vessel Call Intake v2 — PRD-005 E5 Step 3 (TANPA DB, TANPA jaringan, TANPA LLM).
//
// Jalankan:  node prisma/check-intake-prompt.mjs
//
// Prompt v2 disusun dari ATURAN_PROMPT_INTAKE (data terstruktur). Uji ini TIDAK sekadar mencari
// kalimat: contoh kerja & tabel syarat minimum di tiap aturan dicocokkan dengan pagar deterministik
// yang sesungguhnya (syaratMinimumTerpenuhi, buktiTanggalDiSumber, lipatOcr/validasiEkstraksi),
// lalu permintaan yang BENAR-BENAR dikirim ekstrakLewatOpenRouter ditangkap lewat stub fetch.
//
// Lapis:
//   1. STRUKTUR — kode aturan wajib ada, unik, urutan = nomor di prompt; prompt = header + aturan.
//   2. KONSISTENSI DETERMINISTIK — tabel minimum = syaratMinimumTerpenuhi; contoh tanggal =
//      buktiTanggalDiSumber; contoh OCR = lipatOcr + validasiEkstraksi (Step 1/2 tak berubah).
//   3. SKEMA TOOL v2 — deskripsi larik kapal, nama utuh, role multi-tongkang, tanggal bertahun.
//   4. PERMINTAAN NYATA (stub) — system prompt & tool yang dikirim PERSIS v2; perekam mencatat
//      promptVersion/schemaVersion '2' dan hash = sha256(prompt + skema).
//   5. TANPA CABANG MODEL — kode ekstraksi & validator tak membedakan model.

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const AKAR = fileURLToPath(new URL('..', import.meta.url))
const baca = (rel) => readFileSync(join(AKAR, rel), 'utf8')

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

// ---------------------------------------------------------------- jaring jaringan
if (process.env.OPENROUTER_API_KEY) {
  console.log('❌ OPENROUTER_API_KEY terset — uji ini wajib tanpa kunci sungguhan.')
  process.exit(1)
}
let stub = null
const permintaan = []
globalThis.fetch = async (url, init = {}) => {
  permintaan.push({ url: String(url), init })
  if (!stub) throw new Error('JARINGAN_DILARANG_DALAM_UJI')
  return stub(String(url), init, permintaan.length)
}
const jawab = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } })

const require = createRequire(import.meta.url)
const jiti = require('jiti')(fileURLToPath(import.meta.url), { alias: { '@': join(AKAR, 'src') }, interopDefault: true })
const muat = (rel) => jiti(join(AKAR, rel))
process.env.OPENROUTER_API_KEY = 'stub-kunci-uji-kontrak-prompt'

const X = muat('src/lib/ai/vessel-call-extract.ts')
const PR = muat('src/lib/ai/perekam-panggilan.ts')
const P = muat('src/services/intake/intake-policy.ts')
const V = muat('src/lib/vessels.ts')
const NORM = { imo: V.normalisasiImo, imoSah: V.imoCheckDigitSah, mmsi: V.normalisasiMmsi, mmsiSah: V.mmsiSah, callSign: V.normalisasiCallSign }
const HARI_INI = '2026-09-26'

const ATURAN = X.ATURAN_PROMPT_INTAKE
const aturan = (kode) => ATURAN.find((a) => a.kode === kode)
const PROMPT = X.SYSTEM_PROMPT_INTAKE

// =====================================================================
bagian('1. STRUKTUR aturan & versi')
{
  const WAJIB = ['JANGAN_MENGARANG', 'DOKUMEN_DATA', 'TANPA_UANG', 'TANGGAL_TANPA_TAHUN', 'KLASIFIKASI', 'SYARAT_MINIMUM', 'KAPAL_SETIAP', 'KAPAL_RUJUKAN', 'NAMA_KAPAL_UTUH', 'OCR_SALAH_BACA', 'NILAI_TAK_TERBACA', 'KONTAK']
  const kode = ATURAN.map((a) => a.kode)
  cek('semua kode aturan wajib ada', WAJIB.every((k) => kode.includes(k)), WAJIB.filter((k) => !kode.includes(k)).join(','))
  cek('kode aturan unik', new Set(kode).size === kode.length)
  cek('prompt = header + "Aturan wajib:" + aturan bernomor sesuai urutan data', ATURAN.every((a, i) => PROMPT.includes(`\n${i + 1}. ${a.teks}`)) && PROMPT.split('\n').length === 3 + ATURAN.length)
  cek('KLASIFIKASI dirumuskan sebelum SYARAT_MINIMUM (INSUFFICIENT merujuk aturan berikutnya)', kode.indexOf('KLASIFIKASI') + 1 === kode.indexOf('SYARAT_MINIMUM'))
  cek('versi prompt & skema dinaikkan ke 2; id & nama skema tetap', X.VERSI_PROMPT_INTAKE === '2' && X.VERSI_SKEMA_INTAKE === '2' && X.ID_PROMPT_INTAKE === 'vessel-call-extract' && X.TOOL_INTAKE.function.name === 'isi_intake_kunjungan')
  cek('versi pengekstrak (agen INTAKE di registry) tidak berubah', X.VERSI_PENGEKSTRAK_INTAKE === 'vessel-call-extract/1')
  cek('hash = sha256(prompt + "\\n" + JSON skema tool)', X.HASH_PROMPT_INTAKE === createHash('sha256').update(PROMPT).update('\n').update(JSON.stringify(X.TOOL_INTAKE)).digest('hex'))
  cek('enam kelas klasifikasi prompt = enum skema tool = daftar validator', (() => {
    const enumTool = X.TOOL_INTAKE.function.parameters.properties.classification.enum
    return JSON.stringify([...enumTool].sort()) === JSON.stringify([...P.KLASIFIKASI].sort()) && enumTool.every((c) => aturan('KLASIFIKASI').teks.includes(c))
  })())
}

// =====================================================================
bagian('2. KONSISTENSI dengan pagar deterministik')
{
  // (1) kapal + pelabuhan tanpa ETA TIDAK otomatis insufficient — tabel prompt = syaratMinimumTerpenuhi.
  const tabel = aturan('SYARAT_MINIMUM').tabelMinimum ?? []
  const usulan = ({ kapal, pelabuhan, eta }) => {
    const raw = { classification: 'NEW_NOMINATION', vessels: kapal ? [{ name: 'MV SEA STAR' }] : [], portName: pelabuhan ? 'Samarinda' : null, eta: eta ? '2026-10-11' : null, cargoes: [] }
    return P.validasiEkstraksi(raw, { inputKind: 'TEXT', sourceText: 'MV SEA STAR ke Samarinda\nETA: 11/10/2026', hariIni: HARI_INI, norm: NORM })
  }
  cek('1. tabel syarat minimum ≥ 6 kombinasi, termasuk kapal + pelabuhan tanpa ETA = cukup', tabel.length >= 6 && tabel.some((b) => b.kapal && b.pelabuhan && !b.eta && b.cukup))
  const beda = tabel.filter((b) => P.syaratMinimumTerpenuhi(usulan(b).proposal) !== b.cukup)
  cek('1b. setiap baris tabel prompt = syaratMinimumTerpenuhi() (validator tidak dilonggarkan)', beda.length === 0, JSON.stringify(beda))
  const tanpaEta = usulan({ kapal: true, pelabuhan: true, eta: false })
  cek('1c. kapal + pelabuhan tanpa ETA → validator mempertahankan NEW_NOMINATION', tanpaEta.classification === 'NEW_NOMINATION' && tanpaEta.proposal.classificationReason === null)
  cek('1d. aturan menyebut semua identitas kapal & pelabuhan yang dipakai validator', ['nama', 'IMO', 'MMSI', 'call sign', 'UN/LOCODE', 'ETA', 'INSUFFICIENT_INFORMATION'].every((t) => aturan('SYARAT_MINIMUM').teks.includes(t)))

  // (2) larangan tahun simpulan — contoh prompt = keputusan pagar Step 1.
  const tgl = aturan('TANGGAL_TANPA_TAHUN')
  const sumberTgl = tgl.contoh.map((c) => c.sumber).join('\n')
  cek('2. contoh tanggal dikutip persis di teks aturan', tgl.contoh.every((c) => tgl.teks.includes(`"${c.sumber}"`)))
  cek('2b. contoh = pagar Step 1: ETA tanpa tahun → kosong, ETD bertahun → nilai itu', tgl.contoh.every((c) => {
    const bukti = P.buktiTanggalDiSumber(c.field, sumberTgl)
    return c.hasil === null ? bukti.length === 0 : bukti.length === 1 && bukti[0] === c.hasil
  }))
  cek('2c. mengisi ETA dengan tahun simpulan → tetap DIBUANG validator (DATE_NOT_IN_SOURCE)', (() => {
    const f = P.validasiEkstraksi({ classification: 'NEW_NOMINATION', vessels: [{ name: 'MV SEA STAR' }], portName: 'Samarinda', eta: '2026-11-13', etd: '2026-11-13', cargoes: [] },
      { inputKind: 'TEXT', sourceText: `MV SEA STAR ke Samarinda\n${sumberTgl}`, hariIni: HARI_INI, norm: NORM }).proposal
    return f.eta.value === null && f.eta.flags.includes('DATE_NOT_IN_SOURCE') && f.etd.value === '2026-11-13'
  })())
  cek('2d. larangan menyebut setiap sumber tahun yang dilarang', ['hari ini', 'tanggal surat', 'field tanggal lain', 'konteks voyage', 'teks di sekitarnya', 'asumsi operasional'].every((t) => tgl.teks.includes(t)))

  // (3) panduan OCR — contoh prompt = lipatan OCR Step 2 (0↔O, 1↔I, l↔I) dan tak lebih.
  const ocr = aturan('OCR_SALAH_BACA')
  cek('3. contoh OCR dikutip persis di teks aturan', ocr.contoh.every((c) => ocr.teks.includes(`"${c.sumber}"`) && (!c.bukan || ocr.teks.includes(`"${c.bukan}"`))))
  const nama = ocr.contoh.find((c) => c.field === 'vessels.name')
  cek('3b. contoh yang DIIZINKAN hanya berbeda pada karakter lipatan OCR (lipatOcr sama)', P.kompak(nama.sumber) !== P.kompak(nama.hasil) && P.lipatOcr(P.kompak(nama.sumber)) === P.lipatOcr(P.kompak(nama.hasil)))
  const larang = ocr.contoh.find((c) => c.bukan)
  cek('3c. contoh yang DILARANG ("Balikpapn"→"Balikpapan") memang bukan lipatan OCR', P.lipatOcr(P.kompak(larang.sumber)) !== P.lipatOcr(P.kompak(larang.bukan)) && larang.hasil === larang.sumber)
  const mmsi = ocr.contoh.find((c) => c.field === 'vessels.mmsi')
  cek('3d. contoh angka berspasi = normalisasi MMSI yang dipakai validator', V.normalisasiMmsi(mmsi.sumber) === mmsi.hasil && V.mmsiSah(mmsi.hasil))
  cek('3e. validator memperlakukan contoh persis seperti aturan (BOREAS → OCR_CORRECTED, Balikpapan → dibuang, Balikpapn harfiah → diterima)', (() => {
    const src = `Vesse1 : MV SEA ${nama.sumber}\nMMS1 : ${mmsi.sumber}\nP0rt : ${larang.sumber}\nE T A : 16.10.2026`
    const v = (portName) => P.validasiEkstraksi({ classification: 'NEW_NOMINATION', vessels: [{ name: `MV SEA ${nama.hasil}`, mmsi: mmsi.hasil }], portName, eta: '2026-10-16', cargoes: [] },
      { inputKind: 'TEXT', sourceText: src, hariIni: HARI_INI, norm: NORM }).proposal
    const tebak = v(larang.bukan)
    const salin = v(larang.hasil)
    return tebak.vessels[0].name.flags.join() === 'OCR_CORRECTED' && tebak.portName.value === null && tebak.portName.flags.join() === 'NOT_IN_SOURCE' &&
      salin.portName.value === larang.hasil && salin.portName.flags.length === 0
  })())
  cek('3f. aturan OCR hanya menyebut pasangan O↔0 dan I/l↔1 (sama dengan LIPATAN_OCR)', /O↔0 dan I\/l↔1/.test(ocr.teks) && JSON.stringify(P.LIPATAN_OCR) === '{"0":"O","1":"I","L":"I"}')

  // (4) nilai tak terbaca tetap kosong.
  cek('4. aturan NILAI_TAK_TERBACA: kosongkan, jangan lengkapi/tebak', /KOSONGKAN/.test(aturan('NILAI_TAK_TERBACA').teks) && /jangan melengkapi atau menebak/.test(aturan('NILAI_TAK_TERBACA').teks))
  cek('4b. OCR: huruf/kata hilang tidak ditebak', /JANGAN menebak huruf atau kata yang hilang/.test(ocr.teks))
}

// =====================================================================
bagian('3. SKEMA TOOL v2 (kontrak yang dilihat model)')
{
  const props = X.TOOL_INTAKE.function.parameters.properties
  const kapal = props.vessels
  cek('5. vessels: deskripsi larik = SETIAP kapal peserta satu entri', /SETIAP kapal yang ikut dalam kunjungan ini/.test(kapal.description ?? '') && kapal.type === 'array')
  cek('5b. aturan KAPAL_SETIAP: satu entri untuk SETIAP kapal peserta yang tertulis', /SATU entri untuk SETIAP kapal yang ikut dalam kunjungan ini/.test(aturan('KAPAL_SETIAP').teks))
  cek('6. multi-tongkang: aturan menolak asumsi "hanya sepasang" & menyebut satu tug + beberapa tongkang / beberapa tug',
    /satu tug \+ beberapa tongkang/.test(aturan('KAPAL_SETIAP').teks) && /beberapa tug \+ tongkang/.test(aturan('KAPAL_SETIAP').teks) && /Jangan menganggap hanya ada sepasang/.test(aturan('KAPAL_SETIAP').teks))
  cek('6b. role skema tak lagi "hanya untuk pasangan"; enum TUG/BARGE tetap', !/pasangan/.test(kapal.items.properties.role.description) && JSON.stringify(kapal.items.properties.role.enum) === '["TUG","BARGE"]')
  cek('6c. vessels di skema = daftar PERAN_KAPAL validator', JSON.stringify(kapal.items.properties.role.enum) === JSON.stringify(P.PERAN_KAPAL))
  cek('7. nama kapal UTUH: skema & aturan melarang membuang awalan/akhiran/kata/angka', /LENGKAP persis seperti tertulis/.test(kapal.items.properties.name.description) &&
    ['awalan', 'akhiran', 'kata', 'bagian angka', 'token'].every((t) => aturan('NAMA_KAPAL_UTUH').teks.includes(t)))
  cek('7b. nama yang dipotong model (token dibuang) tetap DITOLAK validator — pagar tetap penahan',
    (() => {
      const p = P.validasiEkstraksi({ classification: 'NEW_NOMINATION', vessels: [{ name: 'BG JAYA 3001', role: 'BARGE' }], portName: 'Samarinda', cargoes: [] },
        { inputKind: 'TEXT', sourceText: 'Barge : BG SNTLQC JAYA 3001 ke Samarinda', hariIni: HARI_INI, norm: NORM }).proposal
      return p.vessels.length === 0 && p.vesselsDropped === 1
    })())
  cek('8. kapal riwayat/pembanding/sister/rujukan dikecualikan (aturan & skema)', ['riwayat', 'pembanding', 'sister vessel', 'rujukan'].every((t) => aturan('KAPAL_RUJUKAN').teks.includes(t)) && /sister vessel tidak dimasukkan/.test(kapal.description))
  cek('tanggal skema: kelima field tanggal mensyaratkan tahun tertulis di field-nya sendiri', ['eta', 'etb', 'etc', 'etd', 'requestDate'].every((f) => /hanya bila tahun tertulis/.test(props[f].description)))
  cek('portName skema: huruf hilang tidak dilengkapi', /huruf yang hilang tidak dilengkapi/.test(props.portName.description))
  cek('field wajib skema tidak berubah', JSON.stringify(X.TOOL_INTAKE.function.parameters.required) === '["classification","vessels","cargoes"]')
}

// =====================================================================
bagian('4. PERMINTAAN NYATA ke penyedia (stub fetch, tanpa jaringan)')
{
  const argsOk = JSON.stringify({ classification: 'NOT_RELEVANT', vessels: [], cargoes: [] })
  stub = () => jawab({ id: 'gen-uji', model: 'anthropic/claude-sonnet-4.5', usage: { prompt_tokens: 10, completion_tokens: 2 }, choices: [{ message: { tool_calls: [{ function: { name: 'isi_intake_kunjungan', arguments: argsOk } }] } }] })
  permintaan.length = 0
  const catat = []
  await PR.jalankanDenganKonteks({ model: null, kemampuan: null, catat: (m) => catat.push(m) }, () =>
    X.ekstrakDenganBatasWaktu(X.ekstrakLewatOpenRouter, { kind: 'TEXT', text: 'Nominasi MV Contoh' }, 5000),
  )
  const body = JSON.parse(permintaan[0]?.init.body ?? '{}')
  cek('satu panggilan ke stub (tanpa jaringan)', permintaan.length === 1 && /openrouter\.ai/.test(permintaan[0].url))
  cek('system prompt yang dikirim = prompt v2 persis', body.messages?.[0]?.role === 'system' && body.messages[0].content === PROMPT)
  cek('setiap aturan v2 benar-benar terkirim', ATURAN.every((a) => body.messages[0].content.includes(a.teks)))
  cek('tool yang dikirim = skema v2 persis; tool tetap dipaksa; temperature 0 (perilaku lama)', JSON.stringify(body.tools) === JSON.stringify([X.TOOL_INTAKE]) && body.tool_choice?.function?.name === 'isi_intake_kunjungan' && body.temperature === 0)
  cek('perekam: promptVersion 2, schemaVersion 2, hash v2 (buku besar lewat mekanisme yang ada)', catat.length === 1 && catat[0].promptVersion === '2' && catat[0].schemaVersion === '2' && catat[0].promptHash === X.HASH_PROMPT_INTAKE && catat[0].promptId === 'vessel-call-extract')
  cek('perekam tidak menyimpan teks prompt', !JSON.stringify(catat).includes('Anda membaca'))
}

// =====================================================================
bagian('5. TANPA cabang per model')
{
  const tanpaKomentar = (s) => s.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
  const ekstrak = tanpaKomentar(baca('src/lib/ai/vessel-call-extract.ts'))
  const pol = tanpaKomentar(baca('src/services/intake/intake-policy.ts'))
  cek('vessel-call-extract.ts tidak menyebut model tertentu', !/sonnet|claude|anthropic|gpt|gemini/i.test(ekstrak))
  cek('intake-policy.ts tidak menyebut model', !/sonnet|claude|anthropic|gpt|gemini|model/i.test(pol))
  cek('prompt tidak berisi instruksi per model', !/sonnet|claude|anthropic|gpt|gemini/i.test(PROMPT))
}

console.log(`\n${gagal === 0 ? '✅ SEMUA LULUS' : '❌ ADA YANG GAGAL'} — lulus ${lulus}, gagal ${gagal}`)
process.exit(gagal === 0 ? 0 : 1)
