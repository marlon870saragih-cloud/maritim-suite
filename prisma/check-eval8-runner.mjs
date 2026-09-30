// Uji LURING Eval-8 — runner jalur produksi (kandidat Validator V3 beku) + latihan kegagalan. Turunan check-eval6-runner. TANPA panggilan penyedia, TANPA jaringan.
//
// Jalankan:
//   EVAL8_DB_URL=postgresql://postgres@127.0.0.1:55432/maritime_suite env -u SPIKE_OPENROUTER_API_KEY node prisma/check-eval8-runner.mjs
// Bagian yang butuh DB loopback (jalur produksi nyata) DILEWATI bila EVAL8_DB_URL tidak diset (dilaporkan, bukan lulus diam-diam).
//
// Latihan kegagalan wajib owner:
//   F01 SHA kandidat salah → DITOLAK, 0 panggilan          F07 FATAL sah lalu 402 → FAIL
//   F02 hash dataset salah → DITOLAK, 0 panggilan           F08 proyeksi biaya > batas keras → STOP
//   F03 tumpang-tindih → DITOLAK, 0 panggilan               F09 privasi gagal → laporan ditahan
//   F04 served model beda → gagal tertutup                  F10 sisa DB → penyelesaian ditahan
//   F05 model fallback → gagal tertutup                     F11 kandidat berubah antar-ulangan → STOP
//   F06 402 sebelum FATAL → INCONCLUSIVE                    F12 integritas GT gagal → DITOLAK, 0 panggilan

import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as R from './spike-eval8-runner.mjs'
import * as R3 from './spike-eval3-runner.mjs'
import * as R4 from './spike-eval4-runner.mjs'
import * as K from './spike-eval5-kandidat.mjs'
import * as KV3 from './spike-kandidat-v3.mjs'
import * as DS from './spike-eval8-dataset.mjs'
import * as D from './fixtures/spike-intake/eval8-blind-cases.mjs'

let lulus = 0
let gagal = 0
let dilewati = 0
function cek(nama, kondisi, detail = '') {
  if (kondisi) lulus++
  else gagal++
  console.log(`  ${kondisi ? '✅' : '❌'} ${nama}${!kondisi && detail ? ` — ${detail}` : ''}`)
}
const bagian = (j) => console.log(`\n${j}`)

let fetchNyata = 0
globalThis.fetch = async () => {
  fetchNyata++
  throw new Error('JARINGAN_DILARANG_DALAM_UJI')
}
for (const n of ['SPIKE_OPENROUTER_API_KEY', 'OPENROUTER_API_KEY', 'SPIKE_AUTHORIZED', 'TAH_INTAKE_MODEL', 'DATABASE_URL', 'DIRECT_URL']) {
  if (process.env[n]) {
    console.log(`❌ DITOLAK: ${n} terset — jalankan dengan env -u ${n}`)
    process.exit(1)
  }
}
const URL_DB = process.env.EVAL8_DB_URL ?? null
if (URL_DB && !R3.uraiDbLoopback(URL_DB).ok) {
  console.log('❌ DITOLAK: EVAL8_DB_URL bukan loopback')
  process.exit(1)
}
const HARI = new Date('2026-09-28T00:00:00Z')
const envUji = (x = {}) => ({ ...(URL_DB ? { SPIKE_DATABASE_URL: URL_DB } : { SPIKE_DATABASE_URL: 'postgresql://postgres@127.0.0.1:1/tidak_ada' }), ...x })
const { createRequire } = await import('node:module')
const { fileURLToPath } = await import('node:url')
const AKAR6 = fileURLToPath(new URL('..', import.meta.url))
const jiti6 = createRequire(import.meta.url)('jiti')(fileURLToPath(import.meta.url), { alias: { '@': join(AKAR6, 'src') }, interopDefault: true })
const PV = jiti6(join(AKAR6, 'src/services/intake/intake-policy.ts'))
const MCX = jiti6(join(AKAR6, 'src/lib/ai/model-capabilities.ts'))
const VV = jiti6(join(AKAR6, 'src/lib/vessels.ts'))
const NORMV = { imo: VV.normalisasiImo, imoSah: VV.imoCheckDigitSah, mmsi: VV.normalisasiMmsi, mmsiSah: VV.mmsiSah, callSign: VV.normalisasiCallSign }
const NORMS = { namaKapal: PV.normalisasiNamaKapal, namaPort: PV.normalisasiNamaPort, namaPihak: PV.normalisasiNamaPihak, unlocode: PV.normalisasiUnlocode, imo: VV.normalisasiImo, mmsi: VV.normalisasiMmsi, callSign: VV.normalisasiCallSign }
const DATA = D.muatDataEval8()
const regresiOk = () => ({ galat: [], eval5: { lulusKasus: 39, slot: '78/80', tidakLulus: ['Z23'] }, eval6: { lulusKasus: 35, slot: '70/80', tidakLulus: ['W04', 'W13', 'W15', 'W16', 'W24'] }, eval7: { lulusKasus: 40, slot: '80/80', tidakLulus: [] } })
const salin = (x) => JSON.parse(JSON.stringify(x))
const bekuOk = () => []
const jalan = (opsi = {}) => R.jalankanRunnerEval8({ mode: 'offline', env: envUji(), hariIni: HARI, bekuUji: bekuOk, ...opsi })
const tanpaPanggilan = (l) => l.panggilanTransport === 0 && l.panggilanNyata === 0 && l.dbDisentuh === false

// ============================================================================ S — spike eval-only (Sonnet 5 PENDING_SPIKE)
bagian('S. Spike eval-only: registri berkas PENDING_SPIKE; override hanya di proses runner, gagal tertutup, selalu dipulihkan')
{
  const e = MCX.cariEntriModel('anthropic/claude-sonnet-5')
  cek('S1 registri berkas: Sonnet 5 PENDING_SPIKE → resolusi produksi normal MODEL_TIDAK_TERVERIFIKASI (tanpa runner)', e?.status === 'PENDING_SPIKE' && MCX.resolusiModelIntake({ TAH_INTAKE_MODEL: 'anthropic/claude-sonnet-5' }).aktif === false)
  const s1 = R.aktifkanSpikeEval(MCX)
  const aktif = MCX.ruteModelIntakeUntukInput({ TAH_INTAKE_MODEL: 'anthropic/claude-sonnet-5' }, 'TEXT')
  s1.pulihkan()
  s1.pulihkan()
  cek('S2 aktifkanSpikeEval: selama aktif rute TEXT EXPLICIT Prompt v4; sesudah pulihkan (idempoten) kembali PENDING_SPIKE', s1.galat.length === 0 && aktif.aktif && aktif.rute === 'EXPLICIT' && aktif.promptIntake?.versi === '4' && e.status === 'PENDING_SPIKE')
  cek('S3 berkas registri sudah VERIFIED → spike DITOLAK (gagal tertutup)', R.aktifkanSpikeEval({ cariEntriModel: () => ({ ...e, status: 'VERIFIED' }) }).galat.some((g) => g.startsWith('SPIKE_REGISTRI_BUKAN_PENDING_SPIKE')))
  cek('S4 cakupan bukan TEXT / prompt bukan v4 / entri hilang → DITOLAK', R.aktifkanSpikeEval({ cariEntriModel: () => ({ ...e, cakupanInput: ['TEXT', 'PDF'] }) }).galat.includes('SPIKE_CAKUPAN_BUKAN_TEXT') && R.aktifkanSpikeEval({ cariEntriModel: () => ({ ...e, promptIntake: { versi: '3', hash: 'x' } }) }).galat.includes('SPIKE_PROMPT_BUKAN_V4') && R.aktifkanSpikeEval({ cariEntriModel: () => null }).galat.includes('SPIKE_ENTRI_TIDAK_ADA'))
  const kodeProduksi = ['src/services/intake/intake.service.ts', 'src/services/intake/intake-ledger.ts', 'src/services/intake/intake-access.ts', 'src/lib/ai/model-capabilities.ts'].map((f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')).join('\n')
  cek('S5 kode produksi tidak mengimpor runner evaluasi / aktifkanSpikeEval (override tak tersedia di jalur normal)', !/spike-eval|aktifkanSpikeEval/.test(kodeProduksi))
}

// ============================================================================ A — pembekuan & kandidat
bagian('A. Pembekuan kandidat, manifes, dan identitas rute (murni)')
{
  cek('A1 kandidat V3 FINAL (ac6460c) di disk identik dengan sidik beku (21 berkas, termasuk spesifikasi & adendum-1/2)', KV3.verifikasiKandidat().length === 0 && Object.keys(KV3.SHA_KANDIDAT_V3).length === 21 && KV3.ID_KANDIDAT === 'prd005-intake-text/kandidat-validator-v3-2' && KV3.sidikKandidat() === '775b899b396ab8165ad98d140b5a9cd8c6062157e9ec2921551fde4b2b3b956c')
  const salah = KV3.verifikasiKandidat({ baca: (rel) => (rel.endsWith('intake-policy.ts') ? Buffer.from('// diubah') : readFileSync(new URL(`../${rel}`, import.meta.url))) })
  cek('A2 mutasi intake-policy.ts terdeteksi', salah.length === 1 && salah[0] === 'KANDIDAT_BERUBAH:src/services/intake/intake-policy.ts', salah.join(','))
  cek('A3 manifes beku ada & identik dengan repo (hash dataset, GT, protokol, runner, kandidat)', R.verifikasiBekuEval8().length === 0, R.verifikasiBekuEval8().join(','))
  const m = R.hitungManifesEval8()
  cek('A4 manifes memuat rencana 82 panggilan, Sonnet 5, batas keras US$3,00, ambang Eval-4 apa adanya', m.rencana.panggilan === 82 && m.rencana.model === 'anthropic/claude-sonnet-5' && m.anggaran.batasKerasUsd === 3 && JSON.stringify(m.ambang) === JSON.stringify(R4.AMBANG_KUALITAS_EVAL4))
  cek('A5 otorisasi LIVE bawaan TERTUTUP (kunci repo false; frasa saja tidak cukup)', R.OTORISASI_LIVE_EVAL8_OWNER === false && R.otorisasiLiveOwnerEval8({ SPIKE_AUTHORIZED: R.FRASA_OTORISASI_EVAL8 }) === false && R.otorisasiLiveOwnerEval8({ SPIKE_AUTHORIZED: R.FRASA_OTORISASI_EVAL8 }, true) === true)
  const a = R.buktiAnggaranEval8()
  cek('A6 anggaran: 82 × US$0,035 = US$2,87 ≤ US$3,00', a.terbukti && a.maksPanggilan === 82 && a.maksBiayaUsd === 2.87)
  cek('A7 anggaran: batas keras > US$3,00 ditolak', R.buktiAnggaranEval8({ ...R.KONFIG_OWNER_EVAL8, batas: { ...R.KONFIG_OWNER_EVAL8.batas, biayaKerasUsd: 3.01, biayaLunakUsd: 3.01 } }).galat.includes('BATAS_KERAS_MELEBIHI_KEPUTUSAN_OWNER'))
  cek('A8 anggaran: plafon yang membuat 82 × plafon > US$3,00 ditolak', !R.buktiAnggaranEval8({ ...R.KONFIG_OWNER_EVAL8, plafonPerPanggilanUsd: 0.04 }).terbukti)
  cek('A9 anggaran: ambang kualitas dilonggarkan ditolak', !R.buktiAnggaranEval8({ ...R.KONFIG_OWNER_EVAL8, ambangKualitas: { ...R4.AMBANG_KUALITAS_EVAL4, fatalPostMaks: 1 } }).terbukti && !R.buktiAnggaranEval8({ ...R.KONFIG_OWNER_EVAL8, ambangKualitas: { ...R4.AMBANG_KUALITAS_EVAL4, lulusHeldoutMin: 0.85 } }).terbukti)
}

// ============================================================================ R — prasyarat regresi Eval-5 & gerbang tambahan
bagian('R. Prasyarat LIVE: regresi Eval-5 (EXPOSED — REGRESSION ONLY) + H20/H18/E09; gerbang toleransi-nol tambahan (murni)')
{
  const reg = R.prasyaratRegresi({ P: PV, NORM_VALIDASI: NORMV, NORM_SKOR: NORMS, hariIni: HARI })
  cek('R1 regresi nyata V3 FINAL: Eval-5 78/80 (Z23), Eval-6 70/80 (W04 W13 W15 W16 W24), Eval-7 80/80; H20/H18/E09 lulus → 0 galat', reg.galat.length === 0 && reg.eval5.slot === '78/80' && JSON.stringify(reg.eval5.tidakLulus) === '["Z23"]' && reg.eval6.slot === '70/80' && JSON.stringify(reg.eval6.tidakLulus) === JSON.stringify(['W04', 'W13', 'W15', 'W16', 'W24']) && reg.eval7.slot === '80/80', JSON.stringify([reg.galat, reg.eval5, reg.eval6, reg.eval7]))
  const lReg = await jalan({ regresiUji: () => ({ galat: ['REGRESI_EVAL5_38_DARI_40:Z05+Z23'], eval5: {}, eval6: {} }) })
  cek('R2 prasyarat regresi gagal → DITOLAK_REGRESI_EVAL5, 0 panggilan, DB tak disentuh', lReg.verdict === 'DITOLAK_REGRESI_EVAL5' && tanpaPanggilan(lReg))
  const nilaiPalsu = { POST: { baris: [{ generik: 'etd', jalur: 'etd', hasil: 'HALLUCINATED' }, { generik: 'vessels.callSign', jalur: 'vessels[0].callSign', hasil: 'WRONG' }, { generik: 'cargoes.unit', jalur: 'cargoes[0].unit', hasil: 'HALLUCINATED' }, { generik: 'etb', jalur: 'etb', hasil: 'MISSING' }, { generik: 'jetty', jalur: 'jetty', hasil: 'WRONG' }] } }
  cek('R3 gerbang tambahan: ETD/call sign/satuan WRONG|HALLUCINATED = pelanggaran; MISSING & field lain bukan', R.pelanggaranTambahanSlot(nilaiPalsu, 'B01#u1').length === 3)
  const dir6 = mkdtempSync(join(tmpdir(), 'eval8-priv-'))
  const wp = R.tulisLaporanAman(join(dir6, 'l.json'), { label: R.LABEL_DRY, privasi: { lulus: false, temuan: ['SENTINEL_EVAL8'] } })
  cek('R4 privasi laporan gagal → berkas ditahan dengan verdict FAIL (gerbang keras Eval-8)', wp.ditahan && JSON.parse(readFileSync(wp.jalur, 'utf8')).verdict === 'FAIL')
}

// ============================================================================ B — paket
bagian('B. Paket blind: integritas GT & tumpang-tindih (murni, luring)')
const KASUS = D.bangunKasusEval8(HARI, DATA)
{
  const i = DS.periksaIntegritasPaket(DATA, KASUS)
  cek('B1 integritas GT paket beku: 0 temuan', i.lulus, i.temuan.slice(0, 6).map((x) => `${x.kasus}:${x.aturan}:${JSON.stringify(x.detail)}`).join(' | '))
  const t = DS.periksaTumpangTindih(KASUS)
  cek('B2 tumpang-tindih paket beku: 0 temuan (entitas + kemiripan)', t.lulus, t.temuan.slice(0, 6).map((x) => `${x.kasus}:${x.aturan}:${JSON.stringify(x.detail)}`).join(' | '))
  const maks = t.kemiripan.reduce((m, r) => ({ w: Math.max(m.w, r.trigramKata.nilai), c: Math.max(m.c, r.ngramKarakter5.nilai) }), { w: 0, c: 0 })
  cek('B3 kemiripan maksimum di bawah ambang beku Eval-4', maks.w < R4.AMBANG_KEMIRIPAN.trigramKata && maks.c < R4.AMBANG_KEMIRIPAN.ngramKarakter5, JSON.stringify(maks))
  // mutasi: setiap kelas temuan wajib tertangkap
  const mutasi = (fn) => {
    const d = salin(DATA)
    fn(d)
    return D.bangunKasusEval8(HARI, d)
  }
  const cariKasus = (d, pred) => d.cases.find(pred)
  const m1 = salin(DATA)
  const kNama = cariKasus(m1, (c) => Array.isArray(c.gt.vessels) && c.gt.vessels[0]?.name?.present)
  const namaLama = kNama.gt.vessels[0].name.present
  const namaInti = namaLama.replace(/^(MV|MT|TB|BG|KM)\.?\s+/i, '')
  const ganti = (s) => s.split(namaInti).join('SEGARA WIBAWA')
  kNama.text = kNama.text.map(ganti)
  kNama.gt.vessels[0].name = { present: 'SEGARA WIBAWA', alternatives: (kNama.gt.vessels[0].name.alternatives ?? []).map(ganti) }
  const tm1 = DS.periksaTumpangTindih(D.bangunKasusEval8(HARI, m1))
  cek('B4 mutasi: nama kapal Eval-4 (SEGARA WIBAWA) → T3', tm1.temuan.some((x) => x.aturan === 'T3_NAMA_KAPAL_SUDAH_ADA'), JSON.stringify(tm1.temuan.slice(0, 3)))
  const m2 = salin(DATA)
  m2.cases[0].text.push('Ref IMO 9741205')
  cek('B5 mutasi: IMO Eval-4 di teks → T4', DS.periksaTumpangTindih(D.bangunKasusEval8(HARI, m2)).temuan.some((x) => x.aturan === 'T4_IMO_MMSI_SUDAH_ADA'))
  const m3 = salin(DATA)
  m3.cases[1].text.push('Port code IDJKT')
  cek('B6 mutasi: UN/LOCODE terpakai (IDJKT) → T7', DS.periksaTumpangTindih(D.bangunKasusEval8(HARI, m3)).temuan.some((x) => x.aturan === 'T7_LOCODE_SUDAH_DIPAKAI'))
  const m4 = salin(DATA)
  m4.cases[2].text = R4.kasusTerlihat(HARI).korpus.find((k) => k.id === 'H07')?.teks.split('\n') ?? ['x']
  const tm4 = DS.periksaTumpangTindih(D.bangunKasusEval8(HARI, m4))
  cek('B7 mutasi: teks kasus lama → T2/T8', tm4.temuan.some((x) => x.kasus === m4.cases[2].id && ['T2_TEKS_PERSIS_SUDAH_TERLIHAT', 'T8_KEMIRIPAN_MENCURIGAKAN'].includes(x.aturan)))
  const m5 = salin(DATA)
  m5.cases[3].text.push('Old ref SNT2B')
  cek('B8 mutasi: sentinel lama → T9', DS.periksaTumpangTindih(D.bangunKasusEval8(HARI, m5)).temuan.some((x) => x.aturan === 'T9_SENTINEL_LAMA'))
  // integritas: muatan tanpa jumlah → GT berjumlah karangan
  const m6 = salin(DATA)
  const kMuatan = m6.cases.find((c) => c.gt.cargoes.some((b) => b.some((r) => r.name && r.name !== 'absent' && (r.quantity === 'absent' || r.quantity === undefined))))
  if (kMuatan) {
    const b = kMuatan.gt.cargoes.find((bb) => bb.some((r) => r.quantity === 'absent' || r.quantity === undefined))
    const r = b.find((rr) => rr.quantity === 'absent' || rr.quantity === undefined)
    r.quantity = { present: 7777 }
    const im6 = DS.periksaIntegritasPaket(m6, D.bangunKasusEval8(HARI, m6))
    cek('B9 mutasi: muatan tanpa jumlah di sumber diberi jumlah GT → D7/K3', im6.temuan.some((x) => x.kasus === kMuatan.id && /D7_JUMLAH_TIDAK_TERTULIS|D13_K3/.test(x.aturan)), JSON.stringify(im6.temuan.slice(0, 3)))
  } else cek('B9 paket memuat kasus muatan tanpa jumlah (prinsip H20)', false, 'tidak ditemukan')
  const m7 = salin(DATA)
  const kDwt = m7.cases.find((c) => c.gt.forbidden?.some((f) => f.kind === 'NON_CARGO_NUMBER' && typeof f.value === 'number') && c.gt.cargoes.some((b) => b.length))
  if (kDwt) {
    const angka = kDwt.gt.forbidden.find((f) => f.kind === 'NON_CARGO_NUMBER' && typeof f.value === 'number').value
    const baris = kDwt.gt.cargoes.find((b) => b.length)[0]
    baris.quantity = { present: angka }
    const im7 = DS.periksaIntegritasPaket(m7, D.bangunKasusEval8(HARI, m7))
    cek('B10 mutasi: angka partikular/terlarang dijadikan jumlah muatan GT → D7', im7.temuan.some((x) => x.kasus === kDwt.id && /^D7_|D13_K3|D11_/.test(x.aturan)), JSON.stringify(im7.temuan.slice(0, 3)))
  } else cek('B10 paket memuat angka pengecoh bukan-muatan bertanda terlarang', false, 'tidak ditemukan')
  const m8 = salin(DATA)
  const kEta = m8.cases.find((c) => c.gt.eta?.present && typeof c.gt.eta.present === 'string')
  const ref = kEta.gt.eta.present.slice(1)
  kEta.text = kEta.text.map((l) => l.replace(new RegExp(`\\{${ref}\\.(iso|dmy|idLong|enLong)\\}`, 'g'), `{${ref}.dm}`))
  cek('B11 mutasi: ETA GT hadir tetapi sumber tanpa tahun → D8', DS.periksaIntegritasPaket(m8, D.bangunKasusEval8(HARI, m8)).temuan.some((x) => x.kasus === kEta.id && x.aturan === 'D8_TANGGAL_GT_TANPA_TAHUN_DI_SUMBER'))
  const m9 = salin(DATA)
  const kIns = m9.cases.find((c) => c.gt.classification.length === 1 && c.gt.classification[0] === 'INSUFFICIENT_INFORMATION')
  kIns.gt.classification = ['NEW_NOMINATION']
  kIns.gt.notNewReason = null
  cek('B12 mutasi: INSUFFICIENT diubah NEW tanpa syarat minimum → D9', DS.periksaIntegritasPaket(m9, D.bangunKasusEval8(HARI, m9)).temuan.some((x) => x.kasus === kIns.id && x.aturan === 'D9_NEW_TANPA_SYARAT_MINIMUM_DI_GT'))
  const m10 = salin(DATA)
  m10.cases[4].text.push('cc: XJW8ZZ desk')
  cek('B13 mutasi: sentinel ganda → D2', DS.periksaIntegritasPaket(m10, D.bangunKasusEval8(HARI, m10)).temuan.some((x) => x.aturan === 'D2_SENTINEL_BUKAN_TUNGGAL'))
}

// ============================================================================ C — putusan & pemindai (murni)
bagian('C. Putusan Eval-8 & pemindai privasi (murni)')
{
  const rencana = R4.susunRencanaEval4({ regresi: [{ id: 'RG-H20' }, { id: 'RG-H18' }], heldout: [{ id: 'B01' }, { id: 'B02' }], ulangan: 2 })
  const pen = (fatal = []) => ({ versi: 'x', integritasGt: 'OK', RAW: { FATAL: fatal.length, MAJOR: 0, fatal, f5Unsupported: 0, karanganMuatan: 0 }, POST: { FATAL: fatal.length, MAJOR: 0, MINOR: 0, fatal, f5Unsupported: fatal.filter((f) => f.startsWith('F5')).length, karanganMuatan: 0 } })
  const ok = (r, fatal = []) => ({ seq: r.seq, blok: r.blok, kasus: r.kasus, ulangan: r.ulangan, status: 'OK', klasifikasi: { benarPost: true }, penilai: pen(fatal), sidikTandaTanganPost: 'a', sidikTandaTanganRaw: 'a', muatan: { raw: 0, post: 0, flagsPost: [], postTidakTepercaya: 0 }, panggilan: [] })
  const lain = (r, status) => ({ seq: r.seq, blok: r.blok, kasus: r.kasus, ulangan: r.ulangan, status, klasifikasi: {}, penilai: null, panggilan: [] })
  const g5 = (x = {}) => ({ G_JALUR_PRODUKSI: { keras: true, lulus: true }, G_PRIVASI_BUKU_BESAR: { keras: true, lulus: true }, G_PEMBERSIHAN: { keras: false, lulus: true }, G_CACAT_GT: { keras: false, lulus: true }, ...x })
  const pu = (ringkas, x = {}) => R.putusanEval8({ gerbang4: R4.evaluasiGerbangEval4({ ringkas, rencana, ambang: R4.AMBANG_KUALITAS_EVAL4, ulangan: 2, integritasGt: { status: 'OK' } }), gerbang5: g5(x.g5), galatRunner: null, kandidatBerubah: false, sisa: false, cacatGt: 0, maksCacatGt: 2, ...x })
  const semuaOk = rencana.map((r) => ok(r))
  cek('C1 semua slot OK tanpa temuan → PASS', pu(semuaOk).verdict === 'PASS')
  const f07 = [ok(rencana[0]), ok(rencana[1]), ok(rencana[2], ['F4@eta']), lain(rencana[3], 'GAGAL:TRANSPORT_GAGAL_402'), lain(rencana[4], 'TIDAK_DIJALANKAN'), lain(rencana[5], 'TIDAK_DIJALANKAN')]
  cek('F07 FATAL sah lalu HTTP 402 (run tak lengkap) → FAIL (bukan INCONCLUSIVE)', pu(f07).verdict === 'FAIL', JSON.stringify(pu(f07)))
  cek('F07b FATAL sah lalu runner galat → tetap FAIL', pu(f07, { galatRunner: 'Error' }).verdict === 'FAIL')
  cek('F07c FATAL sah + sisa DB + kandidat berubah → tetap FAIL', pu(f07, { sisa: true, kandidatBerubah: true }).verdict === 'FAIL')
  const f06 = [ok(rencana[0]), ok(rencana[1]), lain(rencana[2], 'GAGAL:TRANSPORT_GAGAL_402'), ...rencana.slice(3).map((r) => lain(r, 'TIDAK_DIJALANKAN'))]
  cek('F06 HTTP 402 sebelum FATAL apa pun → INCONCLUSIVE', pu(f06).verdict === 'INCONCLUSIVE', JSON.stringify(pu(f06)))
  cek('C2 cacat GT 1–2 → MENUNGGU_ADJUDIKASI_GT (tak pernah PASS); > 2 → INCONCLUSIVE', pu(semuaOk, { cacatGt: 2 }).verdict === 'MENUNGGU_ADJUDIKASI_GT' && pu(semuaOk, { cacatGt: 3 }).verdict === 'INCONCLUSIVE')
  cek('C3 cacat GT tidak menyembunyikan FATAL sah', pu(f07, { cacatGt: 3 }).verdict === 'FAIL')
  cek('C4 jalur produksi tak terbukti → FAIL; privasi buku besar gagal → FAIL', pu(semuaOk, { g5: { G_JALUR_PRODUKSI: { keras: true, lulus: false } } }).verdict === 'FAIL' && pu(semuaOk, { g5: { G_PRIVASI_BUKU_BESAR: { keras: true, lulus: false } } }).verdict === 'FAIL')
  cek('F10a sisa DB tanpa FATAL → DITAHAN_SISA_DB (bukan PASS)', pu(semuaOk, { sisa: true }).verdict === 'DITAHAN_SISA_DB')
  cek('F11a kandidat berubah tanpa FATAL → DITOLAK_INTEGRITAS', pu(semuaOk, { kandidatBerubah: true }).verdict === 'DITOLAK_INTEGRITAS')
  const kasusPriv = KASUS
  const dasar = JSON.stringify({ label: R.LABEL_DRY, slot: [{ sidik: 'a60417bcdef01234' }] })
  cek('F09a pemindai: laporan bersih lulus (termasuk sidik 16-hex)', R.pindaiLaporanEval8(dasar, { kunci: 'kunci-uji-palsu-123456', kasus: kasusPriv }).length === 0)
  const sentinel = KASUS[0].teks.match(D.POLA_SENTINEL_EVAL8)[0]
  const vesselGt = KASUS.find((k) => k.gt.vessels.daftar?.[0]?.name?.status === 'PRESENT').gt.vessels.daftar[0].name.value
  for (const [nama, sisip, harap] of [['sentinel XJW8', sentinel, 'SENTINEL_EVAL8'], ['email uji', 'a@uji8.invalid', 'KONTAK_EVAL8'], ['telepon uji', '+62-558-1234', 'KONTAK_EVAL8'], ['kunci', 'kunci-uji-palsu-123456', 'KUNCI_API'], ['frasa Eval-8', R.FRASA_OTORISASI_EVAL8, 'FRASA_OTORISASI'], ['nama kapal GT', vesselGt, 'NILAI_GT_UTUH'], ['URL DB', 'postgresql://postgres@127.0.0.1:55432/rahasia', 'RAHASIA_ENV']]) {
    const t = R.pindaiLaporanEval8(dasar.replace('"slot":[', `"slot":[${JSON.stringify({ bocor: sisip })},`), { kunci: 'kunci-uji-palsu-123456', kasus: kasusPriv, rahasiaEnv: ['postgresql://postgres@127.0.0.1:55432/rahasia'] })
    cek(`F09b mutasi privasi ${nama} → ${harap}`, t.includes(harap), t.join(','))
  }
  const dir = mkdtempSync(join(tmpdir(), 'eval8-cek-'))
  const w = R.tulisLaporanAman(join(dir, 'l.json'), { label: R.LABEL_DRY, privasi: { lulus: false, temuan: ['SENTINEL_EVAL8'] }, rahasia: sentinel })
  cek('F09c privasi gagal → laporan DITAHAN (hanya temuan ditulis)', w.ditahan && !readFileSync(w.jalur, 'utf8').includes(sentinel))
  // pagar badan & fallback (murni)
  const { jalur, keadaan, slotAktif } = R3.rakitJalurPenyedia(async () => new Response('{}'), { maksPanggilan: 5, biayaLunakUsd: 1, biayaKerasUsd: 1, tokenInput: 1e6, tokenOutput: 1e6 }, { plafonUsd: 0.01 })
  slotAktif.model = K.MODEL_KANDIDAT
  let e1 = null
  await jalur('https://openrouter.ai/api/v1/chat/completions', { body: JSON.stringify({ model: K.MODEL_KANDIDAT, models: [K.MODEL_KANDIDAT, 'anthropic/claude-sonnet-4.5'] }) }).catch((e) => (e1 = e.message))
  cek('F05a badan meminta larik fallback → FALLBACK_DIMINTA sebelum transport (0 panggilan)', /FALLBACK_DIMINTA/.test(e1) && keadaan.total === 0)
  cek('C5 periksaBadanEval8: temperature / system prompt lain / skema lain ditolak', R.periksaBadanEval8({ model: K.MODEL_KANDIDAT, temperature: 0, messages: [{ role: 'system', content: 'x' }], tools: [{}], tool_choice: {} }, { system: 'y', tool: { a: 1 } }).length >= 3)
}

// ============================================================================ D — runner: preflight (0 panggilan, DB tak disentuh)
bagian('D. Runner — preflight menolak dengan 0 panggilan & DB tak disentuh')
{
  const l1 = await jalan({ kandidatUji: () => ['KANDIDAT_BERUBAH:src/services/intake/intake-policy.ts'] })
  cek('F01 SHA kandidat salah → DITOLAK_KANDIDAT, 0 panggilan, DB tak disentuh', l1.verdict === 'DITOLAK_KANDIDAT' && tanpaPanggilan(l1))
  const dRusak = salin(DATA)
  dRusak.cases[0].text[0] = `${dRusak.cases[0].text[0]} `
  const galatBeku = R.verifikasiBekuEval8({ baca: (rel) => (rel === 'prisma/fixtures/spike-intake/eval8-blind-cases.json' ? Buffer.from(JSON.stringify(dRusak, null, 2)) : readFileSync(new URL(`../${rel}`, import.meta.url))) })
  cek('F02a dataset diubah 1 spasi → manifes mendeteksi HASH_DATASET_BERBEDA', galatBeku.includes('HASH_DATASET_BERBEDA'), galatBeku.join(','))
  const l2 = await jalan({ bekuUji: () => galatBeku })
  cek('F02 hash dataset salah → DITOLAK_INTEGRITAS, 0 panggilan, DB tak disentuh', l2.verdict === 'DITOLAK_INTEGRITAS' && tanpaPanggilan(l2))
  const dTumpang = salin(DATA)
  const kx = dTumpang.cases.find((c) => Array.isArray(c.gt.vessels) && c.gt.vessels[0]?.name?.present)
  const inti = kx.gt.vessels[0].name.present.replace(/^(MV|MT|TB|BG|KM)\.?\s+/i, '')
  kx.text = kx.text.map((s) => s.split(inti).join('SEGARA WIBAWA'))
  kx.gt.vessels[0].name = { present: 'SEGARA WIBAWA', alternatives: (kx.gt.vessels[0].name.alternatives ?? []).map((s) => s.split(inti).join('SEGARA WIBAWA')) }
  const l3 = await jalan({ dataUji: dTumpang })
  cek('F03 tumpang-tindih (nama kapal Eval-4) → DITOLAK_TUMPANG_TINDIH, 0 panggilan, DB tak disentuh', l3.verdict === 'DITOLAK_TUMPANG_TINDIH' && tanpaPanggilan(l3), JSON.stringify(l3.galat))
  const dGt = salin(DATA)
  const kg = dGt.cases.find((c) => c.gt.cargoes.some((b) => b.some((r) => r.quantity === 'absent' || r.quantity === undefined)) && c.gt.cargoes.some((b) => b.length))
  kg.gt.cargoes.find((b) => b.length)[0].quantity = { present: 424242 }
  const l12 = await jalan({ dataUji: dGt })
  cek('F12 integritas GT gagal (jumlah muatan karangan di GT) → DITOLAK_GT_INTEGRITAS, 0 panggilan', l12.verdict === 'DITOLAK_GT_INTEGRITAS' && tanpaPanggilan(l12), JSON.stringify(l12.galat))
  const l8a = await jalan({ konfigUji: { ...R.KONFIG_OWNER_EVAL8, plafonPerPanggilanUsd: 0.04 } })
  cek('F08a proyeksi rencana 82 × plafon > US$3,00 → DITOLAK_ANGGARAN, 0 panggilan', l8a.verdict === 'DITOLAK_ANGGARAN' && tanpaPanggilan(l8a))
  const lLive = await R.jalankanRunnerEval8({ mode: 'live', env: envUji({ SPIKE_AUTHORIZED: R.FRASA_OTORISASI_EVAL8, SPIKE_OPENROUTER_API_KEY: 'kunci-uji-palsu-123456' }), hariIni: HARI })
  cek('D1 LIVE dengan frasa + kunci tetapi kunci repo tertutup → DITOLAK, 0 panggilan, 0 fetch', /^DITOLAK/.test(lLive.verdict) && tanpaPanggilan(lLive) && fetchNyata === 0, `${lLive.verdict} ${JSON.stringify(lLive.galat)}`)
  const lFrasa = await R.jalankanRunnerEval8({ mode: 'live', env: envUji({ SPIKE_AUTHORIZED: 'PRD-005-EVAL4-LIVE', SPIKE_OPENROUTER_API_KEY: 'x' }), hariIni: HARI, bekuUji: undefined })
  cek('D2 frasa run terdahulu tidak pernah membuka Eval-8', /^DITOLAK/.test(lFrasa.verdict) && tanpaPanggilan(lFrasa))
  const lSeam = await R.jalankanRunnerEval8({ mode: 'live', env: envUji(), hariIni: HARI, bekuUji: bekuOk })
  cek('D3 seam uji saat transport jaringan → DITOLAK', lSeam.verdict === 'DITOLAK_PRASYARAT' && tanpaPanggilan(lSeam))
  const lDb = await jalan({ env: { SPIKE_DATABASE_URL: 'postgresql://u@db.contoh.invalid:5432/prod' } })
  cek('D4 DB bukan loopback → DITOLAK_PRASYARAT, DB tak disentuh', lDb.verdict === 'DITOLAK_PRASYARAT' && tanpaPanggilan(lDb))
}

// ============================================================================ E — runner jalur produksi (DB loopback)
bagian('E. Runner — jalur produksi nyata pada DB loopback (stub transport)')
if (!URL_DB) {
  dilewati++
  console.log('  ⏭️  DILEWATI — EVAL8_DB_URL tidak diset (bagian E butuh PostgreSQL loopback sekali pakai)')
} else {
  const lPenuh = await jalan()
  cek('E1 dry-run lengkap: 82/82 slot OK lewat submitIntake produksi (stub = jawaban sempurna dari GT)', lPenuh.slot.length === 82 && lPenuh.slot.every((s) => s.status === 'OK'), `${lPenuh.verdict} ${lPenuh.slot?.filter((s) => s.status !== 'OK').slice(0, 3).map((s) => `${s.kasus}:${s.status}`).join(' ')} ${JSON.stringify(lPenuh.galat)}`)
  // Eval-8: dry-run jawaban SEMPURNA atas paket blind beku. Plafon < 90% karena perilaku V3 = penghalang LIVE (STOP; V3 tidak diubah).
  const plafon = [...new Set(lPenuh.slot.filter((s) => s.blok === R.BLOK_HELDOUT && !(s.status === 'OK' && s.klasifikasi.benarPost && s.penilai?.POST.FATAL === 0 && s.penilai?.POST.MAJOR === 0)).map((s) => s.kasus))]
  console.log(`     jawaban sempurna: held-out lulus ${lPenuh.gerbang.G_LULUS_HELDOUT.lulusSlot}/80; tak lulus: ${plafon.join(',') || '-'}; verdict ${lPenuh.verdict}`)
  cek('E1b jawaban sempurna: 0 FATAL POST, 0 muatan tak berbukti, 0 identitas, 0 pelanggaran toleransi-nol tambahan', lPenuh.gerbang.G_FATAL_POST.nilai === 0 && lPenuh.gerbang.G_MUATAN_TAK_BERBUKTI_POST.nilai === 0 && lPenuh.gerbang.G_IDENTITAS.nilai === 0 && lPenuh.gerbang.G_TOLERANSI_NOL_TAMBAHAN.nilai === 0, JSON.stringify(lPenuh.gerbang?.G_TOLERANSI_NOL_TAMBAHAN))
  cek('E1c plafon kandidat pada paket beku (jawaban sempurna) ≥ 90% → LIVE punya nilai keputusan; verdict dry-run PASS', lPenuh.gerbang.G_LULUS_HELDOUT.lulusSlot >= 72 && lPenuh.verdict === 'PASS', `${lPenuh.gerbang.G_LULUS_HELDOUT.lulusSlot}/80 ${lPenuh.verdict} ${JSON.stringify(lPenuh.sebabPutusan)}`)
  cek('E1d prasyarat regresi tercatat di laporan: Eval-5 78/80 (Z23), Eval-6 70/80, Eval-7 80/80', lPenuh.prasyaratRegresiEval5?.slot === '78/80' && lPenuh.prasyaratRegresiEval6?.slot === '70/80' && lPenuh.prasyaratRegresiEval7?.slot === '80/80', JSON.stringify([lPenuh.prasyaratRegresiEval5, lPenuh.prasyaratRegresiEval6, lPenuh.prasyaratRegresiEval7]))
  cek('E1e spike eval-only tercatat (IN_PROCESS_EVAL_ONLY, registri berkas PENDING_SPIKE) dan DIPULIHKAN sesudah run', lPenuh.spikeEval?.mode === 'IN_PROCESS_EVAL_ONLY' && lPenuh.spikeEval.registriBerkas === 'PENDING_SPIKE' && lPenuh.spikeEval.statusSelamaRun === 'VERIFIED' && MCX.cariEntriModel('anthropic/claude-sonnet-5').status === 'PENDING_SPIKE', JSON.stringify(lPenuh.spikeEval))
  cek('E2 bukti jalur produksi 82/82 (rute EXPLICIT, prompt v4 di badan & ledger, outputHash = RAW, POST DB = validator independen)', lPenuh.buktiProduksi?.slot === 82 && lPenuh.buktiProduksi.lengkap === 82, JSON.stringify(lPenuh.buktiProduksi?.gagal?.slice(0, 2)))
  cek('E3 82 panggilan transport stub, 0 panggilan nyata, 0 fetch jaringan, tanpa ulang', lPenuh.panggilanTransport === 82 && lPenuh.panggilanNyata === 0 && fetchNyata === 0 && lPenuh.jaringanTerblokir === 0)
  cek('E4 pembersihan: sisa DB 0 (semua tabel ber-tenantId + User + SecurityEvent)', lPenuh.pembersihan?.bersih === true && lPenuh.pembersihan.sisaBaris === 0, JSON.stringify(lPenuh.pembersihan))
  cek('E5 privasi buku besar & laporan lulus', lPenuh.privasiBukuBesar?.lulus === true && lPenuh.privasi.lulus === true, JSON.stringify([lPenuh.privasiBukuBesar, lPenuh.privasi]))
  cek('E6 regresi H20/H18 lulus di jalur produksi', lPenuh.regresiMuatan['RG-H20']?.hasil === 'LULUS' && lPenuh.regresiMuatan['RG-H18']?.hasil === 'LULUS')
  cek('E7 perekam: setiap slot 1 AgentModelCall Sonnet 5 / prompt v4 / hash cocok', lPenuh.slot.every((s) => s.perekam.length === 1 && s.perekam[0].requestedModel === K.MODEL_KANDIDAT && s.perekam[0].servedModel === K.MODEL_KANDIDAT && s.perekam[0].promptVersion === '4' && s.perekam[0].promptHashCocok))

  const l4 = await jalan({ opsiStub: { served: () => 'anthropic/claude-sonnet-5-fast' } })
  cek('F04 served model beda → gagal tertutup: FAIL, 1 panggilan, berhenti, sisa DB 0', l4.verdict === 'FAIL' && l4.panggilanTransport === 1 && l4.slot.filter((s) => s.status !== 'TIDAK_DIJALANKAN').length === 1 && l4.pembersihan?.bersih === true, `${l4.verdict} ${l4.panggilanTransport} ${l4.slot?.[0]?.status}`)
  const l5 = await jalan({ opsiStub: { served: () => 'anthropic/claude-sonnet-4.5' } })
  cek('F05 penyedia melayani model fallback (Sonnet 4.5) → gagal tertutup: FAIL, 1 panggilan', l5.verdict === 'FAIL' && l5.panggilanTransport === 1 && /INCONCLUSIVE_MODEL_IDENTITY/.test(l5.slot[0].status), `${l5.verdict} ${l5.slot?.[0]?.status}`)
  const l6 = await jalan({ jawabStub: (k, m, n) => (n === 3 ? { __http: 402 } : R3.jawabanSempurnaEval3(k)) })
  cek('F06 HTTP 402 di panggilan ke-3 sebelum FATAL → INCONCLUSIVE, berhenti di 3 panggilan, sisa DB 0', l6.verdict === 'INCONCLUSIVE' && l6.panggilanTransport === 3 && /TRANSPORT_GAGAL_402/.test(l6.slot[2].status) && l6.pembersihan?.bersih === true, `${l6.verdict} ${l6.panggilanTransport} ${l6.slot?.[2]?.status}`)
  // Karangan yang DITAHAN validator bukan FATAL POST: ETA di luar jendela dibuang (0 FATAL) → run lanjut; 402 sesudahnya → INCONCLUSIVE.
  const salahEta = (k) => ({ ...R3.jawabanSempurnaEval3(k), eta: '2027-12-30' })
  const l7a = await jalan({ jawabStub: (k, m, n) => (n === 3 ? salahEta(k) : n === 4 ? { __http: 402 } : R3.jawabanSempurnaEval3(k)) })
  cek('F07a ETA karangan di luar jendela ditahan validator (RAW FATAL, POST 0 FATAL) → run lanjut, 402 sesudahnya → INCONCLUSIVE', l7a.verdict === 'INCONCLUSIVE' && l7a.slot[2].penilai?.RAW.FATAL > 0 && l7a.slot[2].penilai?.POST.FATAL === 0 && l7a.panggilanTransport === 4, `${l7a.verdict} ${JSON.stringify(l7a.slot?.[2]?.penilai)}`)
  // FATAL yang LOLOS validator: klasifikasi NEW_* palsu (F9) pada kasus non-keagenan pertama yang syarat minimumnya terpenuhi
  // (validator tidak menurunkannya ke INSUFFICIENT); 402 dijadwalkan pada panggilan sesudahnya.
  const kasus6 = D.bangunKasusEval8(HARI)
  const iNeg = kasus6.findIndex((k) => k.gt.larangNew && !k.gt.classification.values.some((v) => v.startsWith('NEW')) && PV.validasiEkstraksi({ ...R3.jawabanSempurnaEval3(k), classification: 'NEW_NOMINATION' }, { inputKind: 'TEXT', sourceText: PV.normalisasiTeksSumber(k.teks), hariIni: '2026-09-28', norm: NORMV }).classification.startsWith('NEW'))
  const nZ = 2 + iNeg + 1
  const idNeg = kasus6[iNeg]?.id
  const l7 = await jalan({ jawabStub: (k, m, n) => (n === nZ ? { ...R3.jawabanSempurnaEval3(k), classification: 'NEW_NOMINATION' } : n === nZ + 1 ? { __http: 402 } : R3.jawabanSempurnaEval3(k)) })
  cek(`F07 FATAL sah lolos validator (F9 NEW_* palsu, ${idNeg}) → FAIL; berhenti sebelum panggilan berikut (402 terjadwal tak pernah terjadi)`, iNeg >= 0 && l7.verdict === 'FAIL' && l7.panggilanTransport === nZ && l7.pelanggaranToleransiNol.some((x) => x.includes(`${idNeg}#u1:F9`)) && l7.pembersihan?.bersih === true, `${idNeg} ${l7.verdict} ${l7.panggilanTransport} ${JSON.stringify(l7.pelanggaranToleransiNol)}`)
  // Toleransi-nol TAMBAHAN: call sign karangan pada kapal pertama slot ke-3 → FAIL, berhenti.
  const iKapal = kasus6.findIndex((k) => Array.isArray(k.gt.vessels.daftar) && k.gt.vessels.daftar.length && k.gt.vessels.daftar[0].callSign?.status === 'ABSENT')
  const nK = 2 + iKapal + 1
  const lCs = await jalan({ jawabStub: (k, m, n) => { const a = R3.jawabanSempurnaEval3(k); if (n === nK && a.vessels?.[0]) a.vessels[0] = { ...a.vessels[0], callSign: 'YZQX9' }; return a } })
  const csDiterima = lCs.slot[nK - 1]?.penilai !== undefined
  cek(`T1 call sign karangan (${kasus6[iKapal]?.id}) → pelanggaran toleransi-nol tambahan → FAIL & berhenti — ATAU validator sudah membuangnya (0 pelanggaran, run lanjut)`, iKapal >= 0 && csDiterima && ((lCs.verdict === 'FAIL' && lCs.gerbang.G_TOLERANSI_NOL_TAMBAHAN.nilai > 0 && lCs.panggilanTransport === nK) || (lCs.gerbang.G_TOLERANSI_NOL_TAMBAHAN.nilai === 0 && lCs.panggilanTransport === 82)), `${lCs.verdict} ${lCs.panggilanTransport} ${JSON.stringify(lCs.gerbang?.G_TOLERANSI_NOL_TAMBAHAN)}`)
  const l8 = await jalan({ konfigUji: { ...R.KONFIG_OWNER_EVAL8, plafonPerPanggilanUsd: 0.001, batas: { ...R.KONFIG_OWNER_EVAL8.batas, biayaLunakUsd: 0.1, biayaKerasUsd: 0.1 } } })
  cek('F08 proyeksi biaya berjalan > batas keras → STOP sebelum transport (INCONCLUSIVE, biaya ≤ batas)', l8.verdict === 'INCONCLUSIVE' && l8.ditolakPencegat.some((d) => d.alasan === 'PROYEKSI_BIAYA_KERAS') && l8.totalBiayaUsd <= 0.1 && l8.panggilanTransport < 82, `${l8.verdict} ${l8.panggilanTransport} ${l8.totalBiayaUsd}`)
  let tokoSisa = null
  let n10 = 0
  const l10 = await jalan({ sinyalJeda: () => ++n10 > 3, tokoUji: (a) => { const t = R.buatTokoProduksi(a); tokoSisa = t; const asli = t.bersihkan; t.bersihkan = async () => { await t.__sisakanBaris(); return asli() }; return t } })
  cek('F10 sisa DB setelah pembersihan (run dijeda sesudah 3 slot) → FAIL (G_PEMBERSIHAN keras di Eval-8)', l10.verdict === 'FAIL' && l10.sebabPutusan.includes('G_PEMBERSIHAN') && l10.pembersihan?.bersih === false, `${l10.verdict} ${JSON.stringify(l10.pembersihan)}`)
  const lSapu = await jalan({ konfigUji: { ...R.KONFIG_OWNER_EVAL8, plafonPerPanggilanUsd: 0.001, batas: { ...R.KONFIG_OWNER_EVAL8.batas, biayaLunakUsd: 0.1, biayaKerasUsd: 0.1 } } })
  cek('F10b run berikut menyapu sisa lama sebelum mulai (sisaDisapuSebelum ≥ 1) dan bersih kembali', (lSapu.db?.sisaDisapuSebelum ?? 0) >= 1 && lSapu.pembersihan?.bersih === true, JSON.stringify(lSapu.db))
  let n11 = 0
  const l11 = await jalan({ kandidatUji: () => (++n11 > 43 ? ['KANDIDAT_BERUBAH:src/lib/ai/vessel-call-extract.ts'] : []) })
  cek('F11 kandidat berubah di awal ulangan ke-2 → STOP sebelum panggilan berikut; DITOLAK_INTEGRITAS; 42 panggilan', l11.verdict === 'DITOLAK_INTEGRITAS' && l11.panggilanTransport === 42 && l11.kandidatBerubahSelamaRun === true && l11.pembersihan?.bersih === true, `${l11.verdict} ${l11.panggilanTransport}`)
  const l9 = await jalan({ jawabStub: (k) => ({ ...R3.jawabanSempurnaEval3(k), contact: { name: `Ops ${k.teks.match(D.POLA_SENTINEL_EVAL8)?.[0] ?? 'XJW8AA'}` } }) })
  cek('F09d nama sentinel diekstrak model ke kontak: buku besar tetap bersih (hanya hash/metadata), laporan lulus', l9.privasiBukuBesar?.lulus === true && l9.privasi.lulus === true, JSON.stringify(l9.privasiBukuBesar))
  cek('E8 0 fetch jaringan di seluruh bagian E', fetchNyata === 0)
}

console.log(`\n${gagal === 0 ? '✅' : '❌'} ${lulus} lulus, ${gagal} gagal${dilewati ? `, ${dilewati} bagian dilewati (tanpa DB)` : ''}`)
process.exit(gagal === 0 ? 0 : 1)
