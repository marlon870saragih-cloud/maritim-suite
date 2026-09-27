// Uji LURING runner Eval-4 — PRD-005 (TANPA AI, TANPA jaringan, TANPA DB).
//
// Jalankan:  node prisma/check-eval4-runner.mjs
//
// Semua respons "model" berasal dari stub/test-double. fetch global dipasangi penghitung yang MELEMPAR —
// bukti tak ada byte ke jaringan. Kunci uji khusus di lingkungan TIDAK dibaca/dicetak/dipakai (dibuang dari env uji).
//
// Lapis: A preflight & penolakan · B paket held-out (D6) · C run luring regresi · D H20 teramati (RAW/POST) ·
// E identitas served / tanpa fallback / tanpa ulang / galat penyedia · F biaya & batas · G held-out & putusan ·
// H titik-simpan & resume · I CLI · J kunci lingkup & nol jaringan.

import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
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

if (process.env.OPENROUTER_API_KEY || process.env.SPIKE_AUTHORIZED) {
  console.log('❌ OPENROUTER_API_KEY / SPIKE_AUTHORIZED terset — uji luring ini wajib tanpa keduanya.')
  process.exit(1)
}
const ENV_UJI = Object.fromEntries(Object.entries(process.env).filter(([k]) => !['SPIKE_OPENROUTER_API_KEY', 'SPIKE_DATABASE_URL', 'DATABASE_URL', 'DIRECT_URL', 'NODE_ENV', 'VERCEL_ENV', 'TAH_INTAKE_MODEL', 'OPENROUTER_SPK_MODEL'].includes(k)))
const KUNCI_PALSU = 'kunci-palsu-uji-eval4-0000000000'
const ENV_LIVE = { ...ENV_UJI, SPIKE_AUTHORIZED: 'PRD-005-EVAL4-LIVE', SPIKE_OPENROUTER_API_KEY: KUNCI_PALSU }

let panggilanJaringan = 0
const fetchJebakan = async () => {
  panggilanJaringan++
  throw new Error('JARINGAN_DILARANG_DALAM_UJI')
}
globalThis.fetch = fetchJebakan

const R = await import('./spike-eval4-runner.mjs')
const M = await import('./spike-eval4-identitas-model.mjs')
const R3 = await import('./spike-eval3-runner.mjs')
const RG = await import('./fixtures/spike-intake/eval4-regresi-muatan.mjs')
const F3 = await import('./fixtures/spike-intake/eval3-cases.mjs')
const require = createRequire(import.meta.url)
const jiti = require('jiti')(fileURLToPath(import.meta.url), { alias: { '@': join(AKAR, 'src') }, interopDefault: true })
const P = jiti(join(AKAR, 'src/services/intake/intake-policy.ts'))
const X = jiti(join(AKAR, 'src/lib/ai/vessel-call-extract.ts'))
const MC = jiti(join(AKAR, 'src/lib/ai/model-capabilities.ts'))
const OR = jiti(join(AKAR, 'src/lib/ai/openrouter.ts'))

const S5 = 'anthropic/claude-sonnet-5'
const S45 = 'anthropic/claude-sonnet-4.5'
const HARI = new Date('2026-09-27T00:00:00Z')
const TERLIHAT = R.kasusTerlihat(HARI)
const baca = (rel) => readFileSync(join(AKAR, rel), 'utf8')

// ---------------------------------------------------------------- paket held-out SINTETIS (hanya uji)
const Pn = (value, extra = {}) => ({ status: 'PRESENT', value, ...extra })
const A = () => ({ status: 'ABSENT' })
const AC = (values) => ({ status: 'ACCEPTABLE', values })
const gtDasar = (x) => ({ larangNew: null, eta: A(), etb: A(), etc: A(), etd: A(), requestDate: A(), portName: A(), portUnlocode: A(), principalName: A(), customerName: A(), agencyType: A(), clientReference: A(), jetty: A(), cargoes: { bentukDiterima: [[]] }, contact: A(), terlarang: [], ...x })
const kapal = (x) => ({ ref: 'V1', name: A(), imo: A(), mmsi: A(), callSign: A(), vesselType: A(), role: A(), ...x })
const UJI_X01 = {
  id: 'UJI-X01', kind: 'TEXT', kategori: 'UJI_SINTETIS',
  teks: ['Mohon bantu keagenan untuk kunjungan MV SEROJA BIRU ke Pelabuhan Bitung.', 'Muatan: bongkar 1.200 MT semen.'].join('\n'),
  gt: gtDasar({ classification: AC(['NEW_NOMINATION', 'NEW_APPOINTMENT']), vessels: { jumlah: Pn(1), daftar: [kapal({ name: Pn('SEROJA BIRU') })] }, portName: Pn('BITUNG'), cargoes: { bentukDiterima: [[{ name: Pn('semen'), quantity: Pn(1200), unit: Pn('MT'), operation: Pn('DISCHARGE') }]] } }),
}
const UJI_X02 = {
  id: 'UJI-X02', kind: 'TEXT', kategori: 'UJI_SINTETIS',
  teks: ['Please arrange port agency for MV TELUK HIJAU calling Kendari.', 'No cargo operations planned; crew change only.'].join('\n'),
  gt: gtDasar({ classification: AC(['NEW_NOMINATION', 'NEW_APPOINTMENT']), vessels: { jumlah: Pn(1), daftar: [kapal({ name: Pn('TELUK HIJAU') })] }, portName: Pn('KENDARI') }),
}
const paket = (kasus, x = {}) => {
  const p = { versi: 'uji-sintetis-1', kasus }
  return { ...p, hashGt: R.hitungHashPaket(p), ...x }
}
const BATAS_UJI = { maksPanggilan: 20, biayaLunakUsd: 0.9, biayaKerasUsd: 1, tokenInput: 1_000_000, tokenOutput: 100_000 }
const konfig = (x = {}) => ({ paket: paket([UJI_X01, UJI_X02]), ulangan: 1, batas: BATAS_UJI, plafonPerPanggilanUsd: 0.02, ...x })

/** Test-double penyedia: stub Eval-2 + penghitung & rekaman badan permintaan (model, fallback). */
function penyedia(jawab = null, opsi = {}) {
  const badan = []
  const kasusSemua = [...RG.KASUS_REGRESI_MUATAN, UJI_X01, UJI_X02].map((k) => ({ ...k, teksNormal: P.normalisasiTeksSumber(k.teks) }))
  const stub = R2.buatPenyediaStubEval2(kasusSemua, jawab ?? ((k) => R3.jawabanSempurnaEval3(k)), opsi)
  const fn = async (url, init) => {
    badan.push(JSON.parse(init.body))
    return stub.fn(url, init)
  }
  return { fn, badan, catatan: stub.catatan, jumlah: stub.jumlah }
}
const R2 = await import('./spike-eval2-runner.mjs')
const jalan = (o) => R.jalankanRunnerEval4({ env: ENV_UJI, hariIni: HARI, terlihatUji: TERLIHAT, ...o })
const jalanLive = (tp, o = {}) => R.jalankanRunnerEval4({ mode: 'live', env: ENV_LIVE, hariIni: HARI, terlihatUji: TERLIHAT, transportUji: tp.fn, ...o })
const H20_BASE = { classification: 'UNSUPPORTED_REQUEST', vessels: [{ name: 'MV LAYANG BENGAWAN', imo: '9998535' }], portName: 'Probolinggo', portUnlocode: 'IDPRO', eta: '2026-10-28' }
const jawabH20 = (cargoes) => (k) => (k?.id === 'RG-H20' ? { ...H20_BASE, cargoes } : R3.jawabanSempurnaEval3(k))

// =====================================================================
bagian('A. preflight & penolakan (0 panggilan)')
{
  cek('A1 tanpa mode → DITOLAK_MODE', (await R.jalankanRunnerEval4({})).verdict === 'DITOLAK_MODE')
  const liveBawaan = await R.jalankanRunnerEval4({ mode: 'live', env: ENV_LIVE, hariIni: HARI })
  cek('A2 live jaringan dengan konfigurasi owner bawaan (null) → DITOLAK_KONFIG_OWNER, 0 panggilan', liveBawaan.verdict === 'DITOLAK_KONFIG_OWNER' && liveBawaan.galat.includes('KONFIG_OWNER_EVAL4_BELUM_DITETAPKAN') && liveBawaan.panggilanTransport === 0, liveBawaan.galat.join(','))
  const seam = await R.jalankanRunnerEval4({ mode: 'live', env: ENV_LIVE, hariIni: HARI, konfigUji: konfig() })
  cek('A3 live jaringan + seam uji (konfigUji) → SEAM_UJI_DILARANG_SAAT_JARINGAN', seam.verdict === 'DITOLAK_PRASYARAT' && seam.galat.includes('SEAM_UJI_DILARANG_SAAT_JARINGAN'))
  const beku = await jalan({ mode: 'offline', bekuUji: () => ['SHA_BERKAS_BEKU_BERBEDA:x'] })
  cek('A4 integritas beku gagal → DITOLAK_INTEGRITAS', beku.verdict === 'DITOLAK_INTEGRITAS')
  cek('A5 verifikasiBekuEval4 nyata = [] (Eval-1/2/3 + regresi + scorer-3 + leksikon)', R.verifikasiBekuEval4().length === 0)
  const mutasi = R.verifikasiBekuEval4({ baca: (rel) => Buffer.from(readFileSync(join(AKAR, rel), 'utf8') + ' ') })
  cek('A6 mutasi 1 byte pada SETIAP berkas beku Eval-4 terdeteksi', Object.keys(R.SHA_BEKU_EVAL4).every((rel) => mutasi.includes(`SHA_BERKAS_BEKU_BERBEDA:${rel}`)))
  cek('A7 SHA beku = isi berkas sekarang (pin tidak basi)', Object.entries(R.SHA_BEKU_EVAL4).every(([rel, h]) => createHash('sha256').update(readFileSync(join(AKAR, rel))).digest('hex') === h))
  cek('A8 ikatan Prompt v4: v4 lolos, v3 ditolak (hash/versi)', R.verifikasiIkatanPromptV4(X.PROMPT_INTAKE_V4).length === 0 && R.verifikasiIkatanPromptV4(X.PROMPT_INTAKE_V3).includes('HASH_PROMPT_BERBEDA'))
  const pra = (env, mode = 'offline') => R.periksaPrasyaratEval4(env, mode, {})
  cek('A9 prasyarat: OPENROUTER_API_KEY terisi → ditolak', pra({ OPENROUTER_API_KEY: 'x' }).some((g) => g.startsWith('OPENROUTER_API_KEY')))
  cek('A10 prasyarat: DATABASE_URL / SPIKE_DATABASE_URL terisi → ditolak (tanpa DB)', pra({ DATABASE_URL: 'postgres://x' }).length > 0 && pra({ SPIKE_DATABASE_URL: 'postgres://127.0.0.1/x' }).length > 0)
  cek('A11 prasyarat: TAH_INTAKE_MODEL terisi / OPENROUTER_SPK_MODEL bukan Sonnet 4.5 → ditolak', pra({ TAH_INTAKE_MODEL: S5 }).length > 0 && pra({ OPENROUTER_SPK_MODEL: S5 }).length > 0)
  cek('A12 prasyarat live: frasa Eval-3/Eval-2/Eval-1 ditolak; frasa Eval-4 tanpa kunci uji ditolak', pra({ SPIKE_AUTHORIZED: 'PRD-005-E5-EVAL3-LIVE', SPIKE_OPENROUTER_API_KEY: 'k' }, 'live').some((g) => g.includes('frasa run terdahulu')) && pra({ SPIKE_AUTHORIZED: R.FRASA_OTORISASI_EVAL4 }, 'live').some((g) => g.includes('SPIKE_OPENROUTER_API_KEY')))
  cek('A13 prasyarat: NODE_ENV=production ditolak; lingkungan bersih luring = []', pra({ NODE_ENV: 'production' }).length > 0 && pra({}).length === 0)
  const tp = penyedia()
  const stubLive = await jalanLive(tp, { jawabStub: () => ({}) , konfigUji: konfig() })
  cek('A14 live menolak jawabStub; luring menolak transportUji', stubLive.galat?.includes('MODE_LIVE_TIDAK_MENERIMA_STUB') && (await jalan({ mode: 'offline', transportUji: tp.fn })).galat.includes('MODE_OFFLINE_TIDAK_MENERIMA_TRANSPORT') && tp.jumlah() === 0)
  const src = baca('prisma/spike-eval4-runner.mjs')
  cek('A15 jalur JARINGAN terkunci kesiapanLiveEval4 (masih selalu tidak siap) + checkpoint wajib', src.includes('M.kesiapanLiveEval4(') && src.includes('CHECKPOINT_WAJIB_UNTUK_JARINGAN') && M.kesiapanLiveEval4({ otorisasiOwnerLive: true, dilayani: S5 }).siap === false)
  const hal = R.penghalangLiveEval4({ terlihat: TERLIHAT })
  cek('A16 penghalang LIVE repo saat ini = konfig/paket/batas/ambang/gerbang/kapabilitas/otorisasi (tanpa "runner belum dibangun")', JSON.stringify(hal) === JSON.stringify(['KONFIG_OWNER_EVAL4_BELUM_DIBEKUKAN', 'PAKET_HELDOUT_BELUM_DIBEKUKAN', 'BATAS_BIAYA_BELUM_DIBEKUKAN', 'AMBANG_KUALITAS_BELUM_DIBEKUKAN', 'GERBANG_KUALITAS_BELUM_DIIMPLEMENTASI_DI_RUNNER', 'KAPABILITAS_TRANSPORT_S5_BELUM_DIBUKTIKAN', 'OTORISASI_LIVE_OWNER_TIDAK_ADA']), hal.join(','))
  const halSah = R.penghalangLiveEval4({ konfig: konfig(), terlihat: TERLIHAT })
  cek('A17 konfig owner sah (paket+batas) → penghalang konfig hilang; ambang/gerbang/kapabilitas/otorisasi TETAP', !halSah.some((a) => /KONFIG|PAKET|BATAS/.test(a)) && ['AMBANG_KUALITAS_BELUM_DIBEKUKAN', 'GERBANG_KUALITAS_BELUM_DIIMPLEMENTASI_DI_RUNNER', 'KAPABILITAS_TRANSPORT_S5_BELUM_DIBUKTIKAN'].every((a) => halSah.includes(a)))
  const halRusak = R.penghalangLiveEval4({ konfig: konfig({ batas: { ...BATAS_UJI, biayaLunakUsd: 5 } }), terlihat: TERLIHAT })
  cek('A18 konfig owner dengan batas tak sah → BATAS_BIAYA_TIDAK_SAH', halRusak.includes('BATAS_BIAYA_TIDAK_SAH') && !halRusak.includes('PAKET_HELDOUT_TIDAK_SAH'))
}

// =====================================================================
bagian('B. paket held-out (D6: baru & belum terlihat; GT konsisten; hash beku)')
{
  const pk = (k, x) => R.periksaPaketHeldout(paket(k, x), { terlihat: TERLIHAT })
  cek('B1 paket/konfig owner tidak ada → PAKET_HELDOUT_TIDAK_ADA / KONFIG_OWNER_EVAL4_BELUM_DITETAPKAN', R.periksaPaketHeldout(null)[0] === 'PAKET_HELDOUT_TIDAK_ADA' && R.periksaKonfigOwner(null)[0] === 'KONFIG_OWNER_EVAL4_BELUM_DITETAPKAN' && R.KONFIG_OWNER_EVAL4 === null)
  cek('B2 paket sintetis baru + konfig sah → []', pk([UJI_X01, UJI_X02]).length === 0 && R.periksaKonfigOwner(konfig(), { terlihat: TERLIHAT }).length === 0, pk([UJI_X01, UJI_X02]).join(','))
  const k3 = Object.fromEntries(F3.bangunKasusEval3(HARI).map((k) => [k.id, k]))
  const salinH05 = { ...UJI_X02, id: 'UJI-X09', teks: k3.H05.teks, gt: k3.H05.gt }
  cek('B3 teks kasus Eval-3 (sudah diperiksa) dengan id baru → KASUS_SUDAH_TERLIHAT_TEKS + SENTINEL_EVAL_LAMA', (() => { const g = pk([salinH05]); return g.includes('UJI-X09:KASUS_SUDAH_TERLIHAT_TEKS') && g.includes('UJI-X09:SENTINEL_EVAL_LAMA') })())
  const spasi = { ...UJI_X02, id: 'UJI-X10', teks: `  ${RG.KASUS_REGRESI_MUATAN[0].teks.replace(/\n/g, '\n\n  ')}  ` }
  cek('B4 teks regresi RG-H20 dengan spasi berbeda → tetap KASUS_SUDAH_TERLIHAT_TEKS', pk([spasi]).includes('UJI-X10:KASUS_SUDAH_TERLIHAT_TEKS'))
  cek('B5 id lama (H05 / RG-H20 / E01) dipakai ulang → KASUS_SUDAH_TERLIHAT_ID', ['H05', 'RG-H20', 'E01'].every((id) => pk([{ ...UJI_X01, id }]).includes(`${id}:KASUS_SUDAH_TERLIHAT_ID`)))
  cek('B6 hash GT paket tidak cocok → PAKET_HASH_GT_BERBEDA', pk([UJI_X01], { hashGt: '0'.repeat(64) }).includes('PAKET_HASH_GT_BERBEDA'))
  const gtRusak = { ...UJI_X01, id: 'UJI-X11', gt: { ...UJI_X01.gt, cargoes: { bentukDiterima: [[]] } } }
  cek('B7 GT muatan kosong padahal sumber memuat komoditas+operasi → GT_TIDAK_KONSISTEN_K1', pk([gtRusak]).includes('UJI-X11:GT_TIDAK_KONSISTEN_K1'))
  cek('B8 kasus bukan TEXT → KIND; id ganda → PAKET_ID_GANDA; kosong → PAKET_KASUS_KOSONG', pk([{ ...UJI_X01, kind: 'PDF' }]).includes('UJI-X01:KIND') && pk([UJI_X01, UJI_X01]).includes('PAKET_ID_GANDA') && pk([]).includes('PAKET_KASUS_KOSONG'))
  const kf = (x) => R.periksaKonfigOwner(konfig(x), { terlihat: TERLIHAT })
  cek('B9 konfig: ulangan 0/4, plafon ≤0 / > keras, batas lunak>keras → ditolak', kf({ ulangan: 0 }).includes('ULANGAN_TIDAK_SAH') && kf({ ulangan: 4 }).includes('ULANGAN_TIDAK_SAH') && kf({ plafonPerPanggilanUsd: 0 }).includes('PLAFON_PER_PANGGILAN_TIDAK_SAH') && kf({ plafonPerPanggilanUsd: 2 }).includes('PLAFON_MELEBIHI_BATAS_KERAS') && kf({ batas: { ...BATAS_UJI, biayaLunakUsd: 2 } }).includes('BATAS_LUNAK_MELEBIHI_KERAS'))
  cek('B10 hash paket kanonik: urutan kunci objek tak mengubah hash; isi teks mengubah hash', R.hitungHashPaket({ versi: 'v', kasus: [{ ...UJI_X01 }] }) === R.hitungHashPaket({ kasus: [Object.fromEntries(Object.entries(UJI_X01).reverse())], versi: 'v' }) && R.hitungHashPaket({ versi: 'v', kasus: [UJI_X01] }) !== R.hitungHashPaket({ versi: 'v', kasus: [{ ...UJI_X01, teks: UJI_X01.teks + '.' }] }))
}

// =====================================================================
bagian('C. run LURING bawaan (regresi saja, stub dari GT)')
let lapC
{
  const envSebelum = process.env.OPENROUTER_API_KEY
  lapC = await jalan({ mode: 'offline' })
  cek('C1 label DRY_RUN, transport STUB, panggilanNyata 0, 2 panggilan stub', lapC.label === R.LABEL_DRY && lapC.transport === 'STUB' && lapC.panggilanNyata === 0 && lapC.panggilanTransport === 2)
  cek('C2 urutan deterministik: seq1 RG-H20, seq2 RG-H18 (H20 SELALU pertama)', lapC.slot.map((s) => `${s.seq}:${s.kasus}`).join(',') === '1:RG-H20,2:RG-H18')
  const lapC2 = await jalan({ mode: 'offline' })
  cek('C3 dua run → sidik rencana identik', lapC.rencana.sidik === lapC2.rencana.sidik && /^[0-9a-f]{64}$/.test(lapC.rencana.sidik))
  cek('C4 tiap panggilan: diminta & dilayani Sonnet 5 PERSIS; perekam Prompt v4 (hash cocok) + request id', lapC.slot.every((s) => s.panggilan.length === 1 && s.panggilan[0].requestedModel === S5 && s.panggilan[0].servedModel === S5 && s.perekam.length === 1 && s.perekam[0].promptVersion === '4' && s.perekam[0].promptHashCocok && /^gen-/.test(s.perekam[0].providerRequestId ?? '')))
  cek('C5 tanpa held-out → verdict REGRESI_SAJA_TANPA_HELDOUT (bukan PASS); gerbang BELUM_DITETAPKAN_OWNER', lapC.verdict === 'REGRESI_SAJA_TANPA_HELDOUT' && lapC.gerbang.status === 'BELUM_DITETAPKAN_OWNER' && lapC.sumberBatas === 'BATAS_LURING_STUB')
  cek('C6 akuntansi: 2 dicoba, 2 selesai, 0 ulang, biaya stub 0,02, token dihitung', lapC.akuntansi.panggilanDicoba === 2 && lapC.akuntansi.panggilanSelesai === 2 && lapC.akuntansi.percobaanUlang === 0 && lapC.akuntansi.biayaUsd === 0.02 && lapC.akuntansi.token.input === 5000)
  const teks = JSON.stringify(lapC)
  cek('C7 privasi: lulus; laporan tanpa baris dokumen / nama kapal / kunci', lapC.privasi.lulus && !teks.includes('LAYANG BENGAWAN') && !teks.includes('to load sawn timber') && !teks.includes(R.KUNCI_STUB))
  cek('C8 env & fetch dipulihkan sesudah run', process.env.OPENROUTER_API_KEY === envSebelum && process.env.TAH_INTAKE_MODEL === undefined && globalThis.fetch === fetchJebakan)
  cek('C9 laporan mencatat registri: Sonnet 5 PENDING_SPIKE & gerbang produksi tertutup', lapC.registri.statusSonnet5 === 'PENDING_SPIKE' && lapC.registri.gerbangProduksiTertutup === true)
}

// =====================================================================
bagian('D. H20 teramati eksplisit (RAW & POST)')
{
  const h = lapC.h20
  cek('D1 bagian h20 selalu ada: kasus RG-H20, kriteria, RAW & POST terpisah', h.kasus === 'RG-H20' && typeof h.kriteria === 'string' && h.RAW && h.POST && h.seq === 1)
  cek('D2 ekstraksi setia (GT bentuk 0 = []) → H20 LULUS, tanpa F5', h.hasil === 'LULUS' && h.RAW.f5Unsupported === 0 && h.POST.f5Unsupported === 0)
  const coal = await jalan({ mode: 'offline', jawabStub: jawabH20([{ name: 'coal', quantity: 5000, unit: 'MT', operation: 'LOAD' }]) })
  cek('D3 komoditas karangan "coal 5000 MT" → RAW F5_UNSUPPORTED; validator membuangnya di POST → LULUS + ditahanValidator', coal.h20.RAW.f5Unsupported >= 1 && coal.h20.POST.f5Unsupported === 0 && coal.h20.hasil === 'LULUS' && coal.h20.ditahanValidator === true, JSON.stringify(coal.h20.RAW.fatal))
  const qty = await jalan({ mode: 'offline', jawabStub: jawabH20([{ name: 'sawn timber', quantity: 5000, unit: 'CBM', operation: 'LOAD' }]) })
  cek('D4 "sawn timber" + jumlah karangan → RAW F5; POST jumlah dikosongkan (flag) → LULUS', qty.h20.RAW.f5Unsupported >= 1 && qty.h20.POST.f5Unsupported === 0 && qty.h20.POST.flags.includes('CARGO_QUANTITY_NOT_IN_SOURCE') && qty.h20.hasil === 'LULUS', qty.h20.POST.flags.join(','))
  // Simulasi kegagalan Eval-3 H20: validator yang MELOLOSKAN muatan RAW apa adanya.
  const validatorBocor = (raw, ctx) => {
    const r = P.validasiEkstraksi(structuredClone(raw), ctx)
    r.proposal.cargoes = (raw.cargoes ?? []).map((c) => ({ name: c.name, quantity: c.quantity ?? null, unit: c.unit ?? null, operation: c.operation ?? null, source: 'SOURCE_DOCUMENT', flags: [] }))
    return r
  }
  const bocor = await jalan({ mode: 'offline', jawabStub: jawabH20([{ name: 'coal', quantity: 5000, unit: 'MT', operation: 'LOAD' }]), validasiUji: validatorBocor })
  cek('D5 muatan karangan LOLOS POST (kegagalan H20 asli) → H20 GAGAL, karanganLolosPost, verdict GAGAL_REGRESI_MUATAN', bocor.h20.hasil === 'GAGAL' && bocor.h20.karanganLolosPost === true && bocor.h20.POST.f5Unsupported >= 1 && bocor.verdict === 'GAGAL_REGRESI_MUATAN')
  const berhenti = await jalan({ mode: 'offline', jawabStub: (k) => (k?.id === 'RG-H18' ? { __http: 500 } : R3.jawabanSempurnaEval3(k)) })
  cek('D6 run berhenti SESUDAH H20 → hasil H20 tetap dilaporkan; verdict INCONCLUSIVE_BERHENTI', berhenti.h20.hasil === 'LULUS' && berhenti.regresiMuatan['RG-H18'].hasil === 'TIDAK_DINILAI' && berhenti.verdict === 'INCONCLUSIVE_BERHENTI')
  const gagalH20 = await jalan({ mode: 'offline', jawabStub: (k) => (k?.id === 'RG-H20' ? { __http: 402 } : R3.jawabanSempurnaEval3(k)) })
  cek('D7 H20 gagal ditransport → h20.hasil TIDAK_DINILAI (bukan LULUS diam-diam), slot berikut tak dijalankan', gagalH20.h20.hasil === 'TIDAK_DINILAI' && gagalH20.slot[1].status === 'TIDAK_DIJALANKAN' && gagalH20.panggilanTransport === 1)
  cek('D8 GT H20/regresi tidak diubah (SHA regresi & Eval-3 beku)', R.verifikasiBekuEval4().length === 0 && createHash('sha256').update(readFileSync(join(AKAR, 'prisma/fixtures/spike-intake/eval3-cases.mjs'))).digest('hex') === 'c6098c1a06a9cc771e202b15c65fd38d351a89a258f03985002ef4a3450853d1')
}

// =====================================================================
bagian('E. identitas served, tanpa fallback, tanpa ulang, galat penyedia → BERHENTI')
{
  const coba = async (opsiStub, jawab = null) => {
    const tp = penyedia(jawab, opsiStub)
    const l = await jalanLive(tp, { konfigUji: konfig() })
    return { l, tp }
  }
  const s45 = await coba({ served: S45 })
  cek('E1 dilayani Sonnet 4.5 → GAGAL INCONCLUSIVE_MODEL_IDENTITY, BERHENTI, tepat 1 panggilan', s45.l.slot[0].status.startsWith('GAGAL:INCONCLUSIVE_MODEL_IDENTITY') && s45.tp.jumlah() === 1 && s45.l.slot.slice(1).every((s) => s.status === 'TIDAK_DIJALANKAN') && s45.l.verdict === 'INCONCLUSIVE_BERHENTI', s45.l.slot[0].status)
  const pv = await coba({ served: `${S5}-preview` })
  cek('E2 dilayani "sonnet-5-preview" (akhiran) → ditolak persis, 1 panggilan', pv.l.slot[0].status.startsWith('GAGAL:INCONCLUSIVE_MODEL_IDENTITY') && pv.tp.jumlah() === 1)
  const nul = await coba({ served: () => null })
  cek('E3 penyedia tak melaporkan model dilayani → GAGAL, 1 panggilan', nul.l.slot[0].status.startsWith('GAGAL:') && nul.tp.jumlah() === 1 && nul.l.berhenti)
  for (const kode of [401, 402, 403, 404, 429, 500, 503]) {
    const x = await coba({}, () => ({ __http: kode }))
    cek(`E4 HTTP ${kode} → GAGAL:TRANSPORT_GAGAL_${kode}, BERHENTI, TANPA ulang (1 panggilan)`, x.l.slot[0].status === `GAGAL:TRANSPORT_GAGAL_${kode}` && x.tp.jumlah() === 1 && x.l.berhenti === 'GAGAL_TRANSPORT' && x.l.operasional.tanpaUlang)
  }
  const jar = await coba({}, () => ({ __lempar: true }))
  cek('E5 galat jaringan → GAGAL:TRANSPORT_GAGAL_JARINGAN, 1 panggilan', jar.l.slot[0].status === 'GAGAL:TRANSPORT_GAGAL_JARINGAN' && jar.tp.jumlah() === 1)
  const biaya = await coba({ tanpaBiaya: true })
  cek('E6 usage.cost tidak ada → BERHENTI USAGE_COST_TIDAK_ADA, slot berikut tak dijalankan', biaya.l.berhenti === 'USAGE_COST_TIDAK_ADA' && biaya.tp.jumlah() === 1)
  const tanpaTool = await coba({}, () => ({ __tanpaTool: true }))
  cek('E7 respons tanpa tool call → GAGAL (AI_BAD_RESPONSE), berhenti, 1 panggilan', tanpaTool.l.slot[0].status === 'GAGAL:AI_BAD_RESPONSE' && tanpaTool.tp.jumlah() === 1)
  const ok = await coba({})
  cek('E8 run sehat: SEMUA badan permintaan model = Sonnet 5 persis, tanpa models/route/fallback', ok.tp.badan.length === 4 && ok.tp.badan.every((b) => b.model === S5 && b.models === undefined && b.route === undefined && M.periksaBadanPermintaanEval4(b).length === 0))
  cek('E9 run sehat: tool paksa + Prompt v4 (sistem) terkirim; bukan Prompt v3 produksi', ok.tp.badan.every((b) => b.tool_choice?.function?.name === X.PROMPT_INTAKE_V4.tool.function.name && b.messages[0].content === X.PROMPT_INTAKE_V4.system && b.messages[0].content !== X.PROMPT_INTAKE_V3.system))
  const punya = (o, kunci) => Object.prototype.hasOwnProperty.call(o, kunci)
  cek('E9b bentuk transport Eval-4: TIDAK ADA field temperature di badan permintaan mana pun', ok.tp.badan.length === 4 && ok.tp.badan.every((b) => !punya(b, 'temperature')))
  cek('E9c tool paksa tetap WAJIB: tepat satu tool & tool_choice {type:function} menunjuk tool itu', ok.tp.badan.every((b) => b.tools?.length === 1 && b.tool_choice?.type === 'function' && b.tool_choice.function?.name === b.tools[0].function.name))
  cek('E9d model diminta PERSIS anthropic/claude-sonnet-5; tanpa models/route/provider fallback', ok.tp.badan.every((b) => b.model === S5 && !punya(b, 'models') && !punya(b, 'route') && !punya(b, 'provider')))
  cek('E9e laporan mencatat bentuk transport beku + bukti kapabilitas BELUM', ok.l.bentukTransport.temperature === 'DIHILANGKAN' && ok.l.bentukTransport.toolChoice === 'FUNCTION_PAKSA' && ok.l.bentukTransport.model === S5 && /^BELUM/.test(ok.l.bentukTransport.buktiKapabilitas))
  const bentukSah = { model: S5, messages: [], tools: [{ type: 'function', function: { name: 't' } }], tool_choice: { type: 'function', function: { name: 't' } } }
  cek('E9f periksaBentukTransportEval4: sah = []; temperature 0 → TEMPERATURE_DIKIRIM; auto → TOOL_PAKSA_TIDAK_ADA; tanpa tool → TOOL_TIDAK_TUNGGAL; tool lain → TOOL_PAKSA_TIDAK_ADA',
    R.periksaBentukTransportEval4(bentukSah).length === 0 && R.periksaBentukTransportEval4({ ...bentukSah, temperature: 0 }).includes('TEMPERATURE_DIKIRIM') &&
      R.periksaBentukTransportEval4({ ...bentukSah, tool_choice: 'auto' }).includes('TOOL_PAKSA_TIDAK_ADA') && R.periksaBentukTransportEval4({ ...bentukSah, tools: [] }).includes('TOOL_TIDAK_TUNGGAL') &&
      R.periksaBentukTransportEval4({ ...bentukSah, tool_choice: { type: 'function', function: { name: 'lain' } } }).includes('TOOL_PAKSA_TIDAK_ADA'))
  cek('E9g profil transport Eval-4 beku & terpisah dari registri: tanpa temperature, tool paksa; registri Sonnet 5 tetap PENDING_SPIKE/kemampuan null',
    Object.isFrozen(R.PROFIL_TRANSPORT_EVAL4) && R.PROFIL_TRANSPORT_EVAL4.acceptsTemperature === false && R.PROFIL_TRANSPORT_EVAL4.supportsForcedToolChoice === true && MC.cariEntriModel(S5).status === 'PENDING_SPIKE' && MC.cariEntriModel(S5).kemampuan === null)
  const produksi = MC.bentukParameter(null, { temperature: 0, paksaTool: 'x', pdfNative: false })
  cek('E9h perilaku produksi TIDAK berubah: tanpa profil (LEGACY) parameter tetap temperature 0 + tool paksa', produksi.ok && produksi.temperature === 0 && produksi.paksaTool === 'x')
  const k = { ditolak: [], berhenti: null }
  let lewat = 0
  const pg = R.pagarBadanEval4(async () => { lewat++ }, k)
  const hasil = []
  for (const b of [{ model: S5, models: [S5, S45] }, { model: S45 }, { model: S5, provider: { allow_fallbacks: true } }, { model: S5, route: 'fallback' }]) hasil.push(await pg('u', { body: JSON.stringify(b) }).then(() => 'LEWAT', () => 'DITOLAK'))
  cek('E10 pagarBadanEval4: larik fallback / Sonnet 4.5 / allow_fallbacks / route → ditolak SEBELUM transport', hasil.every((x) => x === 'DITOLAK') && lewat === 0 && k.berhenti === 'BADAN_EVAL4_DITOLAK')
  await pg('u', { body: JSON.stringify({ model: S5, tools: [{ type: 'function', function: { name: 't' } }], tool_choice: { type: 'function', function: { name: 't' } } }) }).catch(() => {})
  await pg('u', { body: JSON.stringify({ model: S5 }) }).catch(() => {})
  cek('E11 pagarBadanEval4: badan bentuk beku (Sonnet 5 + tool paksa, tanpa temperature) diteruskan; {model} saja ditolak', lewat === 1 && k.ditolak.at(-1).detail.includes('TOOL_PAKSA_TIDAK_ADA'))
  const k2 = { ditolak: [], berhenti: null }
  let lewat2 = 0
  const pg2 = R.pagarBadanEval4(async () => { lewat2++ }, k2)
  const bSah = { model: S5, tools: [{ type: 'function', function: { name: 't' } }], tool_choice: { type: 'function', function: { name: 't' } } }
  const r1 = await pg2('u', { body: JSON.stringify({ ...bSah, temperature: 0 }) }).then(() => 'LEWAT', () => 'DITOLAK')
  const r2 = await pg2('u', { body: JSON.stringify({ ...bSah, tool_choice: 'auto' }) }).then(() => 'LEWAT', () => 'DITOLAK')
  const r3 = await pg2('u', { body: JSON.stringify(bSah) }).then(() => 'LEWAT', () => 'DITOLAK')
  cek('E11b pagarBadanEval4: badan DENGAN temperature / TANPA tool paksa → ditolak SEBELUM transport; bentuk beku diteruskan', r1 === 'DITOLAK' && r2 === 'DITOLAK' && r3 === 'LEWAT' && lewat2 === 1 && k2.ditolak.every((d) => d.alasan === 'BADAN_EVAL4_DITOLAK') && k2.ditolak[0].detail.includes('TEMPERATURE_DIKIRIM') && k2.ditolak[1].detail.includes('TOOL_PAKSA_TIDAK_ADA'))
}

// =====================================================================
bagian('F. biaya & batas (proyeksi sebelum panggilan; lunak; batas rencana)')
{
  const tp = penyedia(null, { biaya: 0.45 })
  const l = await jalanLive(tp, { konfigUji: konfig({ batas: { ...BATAS_UJI, biayaLunakUsd: 0.9, biayaKerasUsd: 0.9 }, plafonPerPanggilanUsd: 0.5 }) })
  cek('F1 proyeksi: 0,45 teramati + plafon 0,5 > keras 0,9 → panggilan ke-2 DITOLAK sebelum transport', tp.jumlah() === 1 && l.ditolakPencegat.some((d) => d.alasan === 'PROYEKSI_BIAYA_KERAS') && l.akuntansi.biayaUsd === 0.45 && l.slot[1].status.startsWith('DIHENTIKAN:PROYEKSI_BIAYA_KERAS'), l.slot[1].status)
  const tp2 = penyedia(null, { biaya: 0.02 })
  const l2 = await jalanLive(tp2, { konfigUji: konfig({ batas: { ...BATAS_UJI, biayaLunakUsd: 0.02 } }) })
  cek('F2 batas lunak tercapai → panggilan berikut DITOLAK (BERHENTI_LUNAK_BIAYA), 1 panggilan', tp2.jumlah() === 1 && l2.ditolakPencegat.some((d) => d.alasan === 'BERHENTI_LUNAK_BIAYA'))
  const l3 = await jalanLive(penyedia(), { konfigUji: konfig({ batas: { ...BATAS_UJI, maksPanggilan: 3 } }) })
  cek('F3 rencana (4) > maksPanggilan (3) → DITOLAK_BATAS sebelum panggilan apa pun', l3.verdict === 'DITOLAK_BATAS' && l3.panggilanTransport === 0)
  const tp4 = penyedia()
  const l4 = await jalanLive(tp4, { konfigUji: konfig({ batas: { ...BATAS_UJI, tokenInput: 2500 } }) })
  cek('F4 batas token tercapai → berhenti (BATAS_TOKEN), tak ada panggilan sesudahnya', tp4.jumlah() === 1 && l4.ditolakPencegat.some((d) => d.alasan === 'BATAS_TOKEN'))
}

// =====================================================================
bagian('G. held-out: rencana deterministik & putusan (tanpa PASS)')
{
  const tp = penyedia()
  const l = await jalanLive(tp, { konfigUji: konfig({ ulangan: 2 }) })
  cek('G1 rencana: 2 regresi dulu, lalu held-out × 2 ulangan dalam urutan paket', l.slot.map((s) => `${s.kasus}/u${s.ulangan}`).join(',') === 'RG-H20/u1,RG-H18/u1,UJI-X01/u1,UJI-X02/u1,UJI-X01/u2,UJI-X02/u2')
  cek('G2 label test-double tetap DRY_RUN; panggilanNyata 0; 6 panggilan transport', l.label === R.LABEL_DRY && l.transport === 'TEST_DOUBLE' && l.panggilanNyata === 0 && tp.jumlah() === 6)
  cek('G3 lengkap tanpa gerbang owner → MENUNGGU_GERBANG_OWNER (tak pernah PASS)', l.verdict === 'MENUNGGU_GERBANG_OWNER' && !JSON.stringify(l).includes('"PASS"'))
  cek('G4 agregat per blok: regresi 2/2 OK, held-out 4/4 OK; paket held-out tercatat (versi+hash)', l.agregat.REGRESI_MUATAN_S5_V4.ok === 2 && l.agregat.HELDOUT_S5_V4.ok === 4 && l.paketHeldout.hashGt === konfig().paket.hashGt)
  cek('G5 held-out UJI-X01: validator menerima muatan berbukti (semen 1200 MT DISCHARGE) → 0 FATAL POST', (() => { const s = l.slot.find((x) => x.kasus === 'UJI-X01'); return s.penilai.POST.FATAL === 0 && s.muatan.post === 1 })())
  const x02 = l.slot.find((x) => x.kasus === 'UJI-X02')
  cek('G6 ringkasan slot tanpa nilai string model (hanya enum/hitungan/flag/sidik)', !JSON.stringify(x02).includes('TELUK') && x02.sumber.panjang === UJI_X02.teks.length && typeof x02.klasifikasi.benarPost === 'boolean')
  const gtKonflik = await jalanLive(penyedia((k) => (k?.id === 'RG-H18' ? { classification: 'NOT_RELEVANT', vessels: [], cargoes: [{ name: 'semen', operation: 'DISCHARGE' }] } : R3.jawabanSempurnaEval3(k))), { konfigUji: konfig() })
  cek('G7 muatan karangan di RG-H18 (tak tertulis di sumber) → dibuang validator; regresi H18 LULUS', gtKonflik.regresiMuatan['RG-H18'].hasil === 'LULUS' && gtKonflik.regresiMuatan['RG-H18'].RAW.f5Unsupported >= 1)
}

// =====================================================================
bagian('H. titik-simpan & resume (jeda aman, tanpa ulang panggilan, akuntansi kumulatif)')
{
  const K = konfig()
  const toko1 = R.buatTokoCheckpointMemori()
  const tpA = penyedia()
  const penuh = await jalanLive(tpA, { konfigUji: K, checkpoint: toko1 })
  const akhir = toko1.isi()
  cek('H1 run penuh: checkpoint SELESAI, 4 slot OK, inflight null, akuntansi = 4 panggilan', akhir.status === 'SELESAI' && akhir.slot.length === 4 && akhir.slot.every((s) => s.status === 'OK') && akhir.inflight === null && akhir.akuntansi.total === 4 && penuh.verdict === 'MENUNGGU_GERBANG_OWNER')
  const inflightSeq = toko1.riwayat.map((c) => c.inflight).filter((x) => x !== null)
  cek('H2 penanda inflight ditulis SEBELUM setiap panggilan (seq 1..4, berurutan)', JSON.stringify(inflightSeq) === '[1,2,3,4]')
  cek('H2b ikatan checkpoint memuat bentuk & profil transport Eval-4 (ubah bentuk → resume ditolak)', akhir.ikatan.bentukTransport?.temperature === 'DIHILANGKAN' && akhir.ikatan.profilTransport?.acceptsTemperature === false && R.periksaResume({ ...akhir, status: 'DIJEDA' }, { ...akhir.ikatan, profilTransport: { ...akhir.ikatan.profilTransport, acceptsTemperature: true } }).includes('IKATAN_CHECKPOINT_BERBEDA'))
  cek('H3 checkpoint tersanitasi: tanpa teks dokumen / nama kapal / kunci', (() => { const t = JSON.stringify(toko1.riwayat); return !t.includes('LAYANG BENGAWAN') && !t.includes('SEROJA') && !t.includes(KUNCI_PALSU) && !t.includes('sawn timber') })())

  const toko2 = R.buatTokoCheckpointMemori()
  const tpB = penyedia()
  let slotSelesai = 0
  const jeda = await jalanLive(tpB, { konfigUji: K, checkpoint: toko2, sinyalJeda: () => slotSelesai++ >= 1 })
  cek('H4 sinyal jeda sesudah slot 1 → DIJEDA, 1 panggilan, checkpoint DIJEDA dengan 1 slot OK', jeda.verdict === 'DIJEDA' && tpB.jumlah() === 1 && toko2.isi().status === 'DIJEDA' && toko2.isi().slot.length === 1 && toko2.isi().inflight === null)
  const tpC = penyedia()
  const lanjut = await jalanLive(tpC, { konfigUji: K, checkpoint: toko2, lanjut: true })
  cek('H5 resume: HANYA 3 slot sisa dipanggil (tanpa ulang slot 1); putusan = run penuh', tpC.jumlah() === 3 && lanjut.verdict === penuh.verdict && lanjut.checkpoint.slotDariCheckpoint === 1 && lanjut.checkpoint.dilanjutkan === true)
  cek('H6 resume: akuntansi KUMULATIF lintas sesi (4 panggilan, biaya 0,04) & kasus tak terpanggil dua kali', lanjut.akuntansi.panggilanDicoba === 4 && lanjut.akuntansi.biayaUsd === 0.04 && new Set([...tpB.catatan, ...tpC.catatan].map((c) => c.kasus)).size === 4)
  cek('H7 resume: ringkasan slot & H20 identik dengan run penuh (kecuali penanda asal)', JSON.stringify(lanjut.h20) === JSON.stringify(penuh.h20) && lanjut.slot.length === 4 && toko2.isi().status === 'SELESAI')
  const tpD = penyedia()
  const lagi = await jalanLive(tpD, { konfigUji: K, checkpoint: toko2, lanjut: true })
  cek('H8 resume run SELESAI → DITOLAK_RESUME RUN_SUDAH_SELESAI, 0 panggilan', lagi.verdict === 'DITOLAK_RESUME' && lagi.galat.includes('RUN_SUDAH_SELESAI') && tpD.jumlah() === 0)

  const inflight = R.buatTokoCheckpointMemori({ ...toko2.riwayat.find((c) => c.inflight === 2) })
  const tpE = penyedia()
  const rInflight = await jalanLive(tpE, { konfigUji: K, checkpoint: inflight, lanjut: true })
  cek('H9 checkpoint dengan slot INFLIGHT (putus di tengah panggilan) → DITOLAK_RESUME, 0 panggilan (tinjauan owner)', rInflight.verdict === 'DITOLAK_RESUME' && rInflight.galat.some((g) => g.startsWith('SLOT_INFLIGHT:2')) && tpE.jumlah() === 0)

  const toko3 = R.buatTokoCheckpointMemori()
  await jalanLive(penyedia((k) => (k?.id === 'RG-H18' ? { __http: 429 } : R3.jawabanSempurnaEval3(k))), { konfigUji: K, checkpoint: toko3 })
  const tpF = penyedia()
  const rGagal = await jalanLive(tpF, { konfigUji: K, checkpoint: toko3, lanjut: true })
  cek('H10 run BERHENTI karena slot gagal (429) → resume DITOLAK (tanpa ulang otomatis), 0 panggilan', toko3.isi().status === 'BERHENTI' && rGagal.verdict === 'DITOLAK_RESUME' && rGagal.galat.some((g) => g.startsWith('STATUS_TIDAK_BISA_DILANJUTKAN')) && tpF.jumlah() === 0)

  const toko4 = R.buatTokoCheckpointMemori()
  let n4 = 0
  await jalanLive(penyedia(), { konfigUji: K, checkpoint: toko4, sinyalJeda: () => n4++ >= 1 })
  const rIkatan = await jalanLive(penyedia(), { konfigUji: konfig({ ulangan: 2 }), checkpoint: toko4, lanjut: true })
  cek('H11 resume dengan konfigurasi berbeda (ulangan 2) → IKATAN_CHECKPOINT_BERBEDA', rIkatan.verdict === 'DITOLAK_RESUME' && rIkatan.galat.includes('IKATAN_CHECKPOINT_BERBEDA'))
  const rMode = await R.jalankanRunnerEval4({ mode: 'offline', env: ENV_UJI, hariIni: HARI, terlihatUji: TERLIHAT, konfigUji: K, checkpoint: toko4, lanjut: true })
  cek('H12 resume dengan transport berbeda (STUB vs TEST_DOUBLE) → IKATAN_CHECKPOINT_BERBEDA', rMode.galat?.includes('IKATAN_CHECKPOINT_BERBEDA'))
  const baru = await jalanLive(penyedia(), { konfigUji: K, checkpoint: toko4 })
  cek('H13 run baru ke checkpoint yang SUDAH ada → ditolak (tak pernah menimpa)', baru.galat?.includes('CHECKPOINT_SUDAH_ADA_PAKAI_RESUME_ATAU_JALUR_BARU'))
  const rKosong = await jalanLive(penyedia(), { konfigUji: K, checkpoint: R.buatTokoCheckpointMemori(), lanjut: true })
  cek('H14 resume tanpa checkpoint → DITOLAK_RESUME CHECKPOINT_TIDAK_ADA', rKosong.galat?.includes('CHECKPOINT_TIDAK_ADA'))

  const toko5 = R.buatTokoCheckpointMemori(null, { gagalTulisKe: 3 })
  const tpG = penyedia()
  const rTulis = await jalanLive(tpG, { konfigUji: K, checkpoint: toko5 })
  const rSesudah = await jalanLive(penyedia(), { konfigUji: K, checkpoint: R.buatTokoCheckpointMemori(toko5.isi()), lanjut: true })
  cek('H15 gagal tulis checkpoint sesudah panggilan → GAGAL_RUNNER, run berhenti; checkpoint masih INFLIGHT → resume DITOLAK', rTulis.verdict === 'GAGAL_RUNNER' && tpG.jumlah() === 1 && rSesudah.verdict === 'DITOLAK_RESUME' && rSesudah.galat.some((g) => g.startsWith('SLOT_INFLIGHT:1')))

  // Anggaran kumulatif lintas resume: sesi 1 memakai 0,45; sesi 2 diproyeksi 0,45 + 0,5 > 0,9 → ditolak sebelum transport.
  const KB = konfig({ batas: { ...BATAS_UJI, biayaLunakUsd: 0.9, biayaKerasUsd: 0.9 }, plafonPerPanggilanUsd: 0.5 })
  const toko6 = R.buatTokoCheckpointMemori()
  let n6 = 0
  await jalanLive(penyedia(null, { biaya: 0.45 }), { konfigUji: KB, checkpoint: toko6, sinyalJeda: () => n6++ >= 1 })
  const tpH = penyedia(null, { biaya: 0.45 })
  const rBiaya = await jalanLive(tpH, { konfigUji: KB, checkpoint: toko6, lanjut: true })
  cek('H16 batas biaya berlaku untuk SELURUH run lintas resume (proyeksi memakai biaya sesi lalu) → 0 panggilan baru', tpH.jumlah() === 0 && rBiaya.ditolakPencegat.some((d) => d.alasan === 'PROYEKSI_BIAYA_KERAS') && rBiaya.akuntansi.biayaUsd === 0.45)

  const cpRusak = { ...toko2.isi(), status: 'DIJEDA', slot: toko2.isi().slot.slice(0, 1), akuntansi: { ...toko2.isi().akuntansi, total: 99 } }
  cek('H17 periksaResume: akuntansi tak konsisten / format lain → ditolak', R.periksaResume(cpRusak, cpRusak.ikatan).includes('AKUNTANSI_CHECKPOINT_TIDAK_KONSISTEN') && R.periksaResume({ ...cpRusak, format: 'x' }, cpRusak.ikatan).includes('FORMAT_CHECKPOINT_BERBEDA'))

  // Toko BERKAS nyata (direktori sementara di luar repo): tulis atomik & dapat dibaca kembali.
  const dir = mkdtempSync(join(tmpdir(), 'eval4-ckpt-'))
  const jalurCk = join(dir, 'eval4.ckpt.json')
  const tokoB = R.buatTokoCheckpointBerkas(jalurCk)
  let nB = 0
  const lB = await jalan({ mode: 'offline', checkpoint: tokoB, sinyalJeda: () => nB++ >= 1 })
  const lB2 = await jalan({ mode: 'offline', checkpoint: R.buatTokoCheckpointBerkas(jalurCk), lanjut: true })
  cek('H18 toko berkas: jeda → berkas DIJEDA; resume dari berkas → SELESAI; tanpa berkas .tmp tersisa', lB.verdict === 'DIJEDA' && lB2.verdict === 'REGRESI_SAJA_TANPA_HELDOUT' && JSON.parse(readFileSync(jalurCk, 'utf8')).status === 'SELESAI' && !existsSync(`${jalurCk}.tmp-${process.pid}`))
}

// =====================================================================
bagian('I. CLI (argumen & jalur)')
{
  const dir = mkdtempSync(join(tmpdir(), 'eval4-cli-'))
  const a = (argv) => R.uraiArgumenEval4(argv)
  cek('I1 --checkpoint di dalam repo → ditolak', a(['--mode', 'offline', '--report', join(dir, 'r.json'), '--checkpoint', join(AKAR, 'x.ckpt.json')]).galat.some((g) => g.startsWith('CHECKPOINT_DI_DALAM_REPO')))
  cek('I2 --resume tanpa --checkpoint → RESUME_BUTUH_CHECKPOINT', a(['--mode', 'offline', '--report', join(dir, 'r.json'), '--resume']).galat.includes('RESUME_BUTUH_CHECKPOINT'))
  cek('I3 checkpoint = report → ditolak; argumen sah → tanpa galat', a(['--mode', 'offline', '--report', join(dir, 'r.json'), '--checkpoint', join(dir, 'r.json')]).galat.includes('CHECKPOINT_SAMA_DENGAN_REPORT') && a(['--mode=offline', '--report', join(dir, 'r.json'), '--checkpoint', join(dir, 'c.json')]).galat.length === 0)
  const keluar = []
  const rc = await R.cli(['--mode', 'offline', '--report', join(dir, 'lap.json')], ENV_UJI, (s) => keluar.push(s))
  const lap = JSON.parse(readFileSync(join(dir, 'lap.json'), 'utf8'))
  cek('I4 CLI luring: kode 0, laporan tertulis di luar repo, H20 & verdict tercetak', rc === 0 && lap.verdict === 'REGRESI_SAJA_TANPA_HELDOUT' && keluar.some((s) => s.includes('H20=LULUS')))
  const rcLive = await R.cli(['--mode', 'live', '--report', join(dir, 'l.json')], ENV_LIVE, () => {})
  cek('I5 CLI live (frasa + kunci palsu) → DITOLAK (kode 3), 0 jaringan — konfigurasi owner belum ada', rcLive === 3 && !existsSync(join(dir, 'l.json')))
  cek('I6 CLI tanpa argumen → kode 2 (cetak rencana saja)', (await R.cli([], ENV_UJI, () => {})) === 2)
  writeFileSync(join(dir, 'ada.json'), '{}')
}

// =====================================================================
bagian('J. kunci lingkup & nol jaringan')
{
  cek('J1 Sonnet 5 TETAP PENDING_SPIKE, kemampuan null; gerbang produksi TAH_INTAKE_MODEL tertutup', (() => { const e = MC.cariEntriModel(S5); return e.status === 'PENDING_SPIKE' && e.kemampuan === null && e.dasar === 'NONE' && MC.resolusiModelIntake({ TAH_INTAKE_MODEL: S5 }).aktif === false })())
  cek('J2 model bawaan klien tetap Sonnet 4.5; prompt produksi tetap v3', OR.SPK_MODEL === S45 && X.VERSI_PROMPT_INTAKE === '3' && X.PROMPT_INTAKE_V3.versi === '3')
  cek('J3 konfigurasi owner Eval-4 = null (tak ada paket/anggaran/ambang yang ditebak)', R.KONFIG_OWNER_EVAL4 === null)
  const skrip = JSON.parse(baca('package.json')).scripts
  cek('J4 skrip npm Eval-4 hanya uji luring (prep/runner check) — tak ada skrip run live', Object.entries(skrip).filter(([k]) => /eval4/i.test(k)).every(([, v]) => /^node prisma\/check-eval4-(prep|runner)\.mjs$/.test(v)) && !Object.values(skrip).some((v) => /spike-eval4-runner|--mode\s+live/.test(v)))
  const src = baca('prisma/spike-eval4-runner.mjs')
  cek('J5 runner tanpa DB/Prisma dan tanpa baca kunci produksi (hanya SPIKE_OPENROUTER_API_KEY)', !/PrismaClient|src\/lib\/prisma|DATABASE_URL\s*=/.test(src) && !/(?<!process\.)env\.OPENROUTER_API_KEY/.test(src))
  cek('J6 nol panggilan ke fetch global (jaringan) sepanjang uji', panggilanJaringan === 0 && globalThis.fetch === fetchJebakan)
  cek('J7 env proses bersih sesudah semua uji', process.env.OPENROUTER_API_KEY === undefined && process.env.TAH_INTAKE_MODEL === undefined)
}

console.log(`\n${gagal === 0 ? '✅ SEMUA LULUS' : '❌ ADA YANG GAGAL'} — lulus ${lulus}, gagal ${gagal}`)
process.exit(gagal === 0 ? 0 : 1)
