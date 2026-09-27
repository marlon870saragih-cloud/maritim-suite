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
const FH = await import('./fixtures/spike-intake/eval4-heldout-cases.mjs')
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
  teks: ['Mohon bantu keagenan untuk kunjungan MV KAYANGAN LESTARI ke Pelabuhan Bitung.', 'Muatan: bongkar 1.200 MT semen.'].join('\n'),
  gt: gtDasar({ classification: AC(['NEW_NOMINATION', 'NEW_APPOINTMENT']), vessels: { jumlah: Pn(1), daftar: [kapal({ name: Pn('KAYANGAN LESTARI') })] }, portName: Pn('BITUNG'), cargoes: { bentukDiterima: [[{ name: Pn('semen'), quantity: Pn(1200), unit: Pn('MT'), operation: Pn('DISCHARGE') }]] } }),
}
const UJI_X02 = {
  id: 'UJI-X02', kind: 'TEXT', kategori: 'UJI_SINTETIS',
  teks: ['Please arrange port agency for MV RENGGANIS UTAMA calling Kendari.', 'No cargo operations planned; crew change only.'].join('\n'),
  gt: gtDasar({ classification: AC(['NEW_NOMINATION', 'NEW_APPOINTMENT']), vessels: { jumlah: Pn(1), daftar: [kapal({ name: Pn('RENGGANIS UTAMA') })] }, portName: Pn('KENDARI') }),
}
const paket = (kasus, x = {}) => {
  const p = { versi: 'uji-sintetis-1', kasus }
  return { ...p, hashGt: R.hitungHashPaket(p), ...x }
}
const BATAS_UJI = { maksPanggilan: 20, biayaLunakUsd: 0.9, biayaKerasUsd: 1, tokenInput: 1_000_000, tokenOutput: 100_000 }
const konfig = (x = {}) => ({ paket: paket([UJI_X01, UJI_X02]), ulangan: 1, batas: BATAS_UJI, plafonPerPanggilanUsd: 0.02, ambangKualitas: R.AMBANG_KUALITAS_EVAL4, ...x })

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
// `jalan` = mode regresi-saja (konfigUji null); `jalanBeku` = konfigurasi owner BEKU (20 held-out × 2 + regresi).
const jalan = (o) => R.jalankanRunnerEval4({ env: ENV_UJI, hariIni: HARI, terlihatUji: TERLIHAT, konfigUji: null, ...o })
const jalanBeku = (o) => R.jalankanRunnerEval4({ env: ENV_UJI, hariIni: HARI, terlihatUji: TERLIHAT, ...o })
const jalanLive = (tp, o = {}) => R.jalankanRunnerEval4({ mode: 'live', env: ENV_LIVE, hariIni: HARI, terlihatUji: TERLIHAT, transportUji: tp.fn, ...o })
const H20_BASE = { classification: 'UNSUPPORTED_REQUEST', vessels: [{ name: 'MV LAYANG BENGAWAN', imo: '9998535' }], portName: 'Probolinggo', portUnlocode: 'IDPRO', eta: '2026-10-28' }
const jawabH20 = (cargoes) => (k) => (k?.id === 'RG-H20' ? { ...H20_BASE, cargoes } : R3.jawabanSempurnaEval3(k))

// =====================================================================
bagian('A. preflight & penolakan (0 panggilan)')
{
  cek('A1 tanpa mode → DITOLAK_MODE', (await R.jalankanRunnerEval4({})).verdict === 'DITOLAK_MODE')
  const liveBawaan = await R.jalankanRunnerEval4({ mode: 'live', env: ENV_LIVE, hariIni: HARI })
  cek('A2 live jaringan (frasa + kunci palsu) dengan konfigurasi owner BEKU → DITOLAK_KESIAPAN_LIVE (kunci otorisasi owner repo = false), 0 panggilan', liveBawaan.verdict === 'DITOLAK_KESIAPAN_LIVE' && JSON.stringify(liveBawaan.galat) === JSON.stringify(['OTORISASI_LIVE_OWNER_TIDAK_ADA']) && liveBawaan.panggilanTransport === 0 && panggilanJaringan === 0, liveBawaan.galat.join(','))
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
  cek('A16 penghalang LIVE repo saat ini = HANYA otorisasi owner (dihitung, bukan ditanam)', JSON.stringify(hal) === JSON.stringify(['OTORISASI_LIVE_OWNER_TIDAK_ADA']), hal.join(','))
  const halSah = R.penghalangLiveEval4({ konfig: konfig(), terlihat: TERLIHAT })
  cek('A17 konfig uji sah (paket+batas+ambang, anggaran terbukti 4×0,02 ≤ 1) → HANYA otorisasi owner tersisa', JSON.stringify(halSah) === JSON.stringify(['OTORISASI_LIVE_OWNER_TIDAK_ADA']), halSah.join(','))
  const halRusak = R.penghalangLiveEval4({ konfig: konfig({ batas: { ...BATAS_UJI, biayaLunakUsd: 5 } }), terlihat: TERLIHAT })
  cek('A18 konfig owner dengan batas tak sah → BATAS_BIAYA_TIDAK_SAH', halRusak.includes('BATAS_BIAYA_TIDAK_SAH') && !halRusak.includes('PAKET_HELDOUT_TIDAK_SAH'))
}

// =====================================================================
bagian('B. paket held-out (D6: baru & belum terlihat; GT konsisten; hash beku)')
{
  const pk = (k, x) => R.periksaPaketHeldout(paket(k, x), { terlihat: TERLIHAT })
  cek('B1 paket/konfig owner tidak ada → PAKET_HELDOUT_TIDAK_ADA / KONFIG_OWNER_EVAL4_BELUM_DITETAPKAN', R.periksaPaketHeldout(null)[0] === 'PAKET_HELDOUT_TIDAK_ADA' && R.periksaKonfigOwner(null)[0] === 'KONFIG_OWNER_EVAL4_BELUM_DITETAPKAN' && R.KONFIG_OWNER_EVAL4 !== null)
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
bagian('C. run LURING regresi-saja (konfigUji null; stub dari GT)')
let lapC
{
  const envSebelum = process.env.OPENROUTER_API_KEY
  lapC = await jalan({ mode: 'offline' })
  cek('C1 label DRY_RUN, transport STUB, panggilanNyata 0, 2 panggilan stub', lapC.label === R.LABEL_DRY && lapC.transport === 'STUB' && lapC.panggilanNyata === 0 && lapC.panggilanTransport === 2)
  cek('C2 urutan deterministik: seq1 RG-H20, seq2 RG-H18 (H20 SELALU pertama)', lapC.slot.map((s) => `${s.seq}:${s.kasus}`).join(',') === '1:RG-H20,2:RG-H18')
  const lapC2 = await jalan({ mode: 'offline' })
  cek('C3 dua run → sidik rencana identik', lapC.rencana.sidik === lapC2.rencana.sidik && /^[0-9a-f]{64}$/.test(lapC.rencana.sidik))
  cek('C4 tiap panggilan: diminta & dilayani Sonnet 5 PERSIS; perekam Prompt v4 (hash cocok) + request id', lapC.slot.every((s) => s.panggilan.length === 1 && s.panggilan[0].requestedModel === S5 && s.panggilan[0].servedModel === S5 && s.perekam.length === 1 && s.perekam[0].promptVersion === '4' && s.perekam[0].promptHashCocok && /^gen-/.test(s.perekam[0].providerRequestId ?? '')))
  cek('C5 tanpa held-out → verdict REGRESI_SAJA_TANPA_HELDOUT (bukan PASS); gerbang TANPA_KONFIG_OWNER', lapC.verdict === 'REGRESI_SAJA_TANPA_HELDOUT' && lapC.gerbang.status === 'TANPA_KONFIG_OWNER' && lapC.sumberBatas === 'BATAS_LURING_STUB')
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
  cek('E1 dilayani Sonnet 4.5 → GAGAL INCONCLUSIVE_MODEL_IDENTITY, BERHENTI, tepat 1 panggilan', s45.l.slot[0].status.startsWith('GAGAL:INCONCLUSIVE_MODEL_IDENTITY') && s45.tp.jumlah() === 1 && s45.l.slot.slice(1).every((s) => s.status === 'TIDAK_DIJALANKAN') && s45.l.verdict === 'FAIL' && s45.l.gerbang.gerbang.G_IDENTITAS.lulus === false, s45.l.slot[0].status)
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
  cek('E9e laporan mencatat bentuk transport beku + bukti kapabilitas TERBUKTI (request id probe) + sidik', ok.l.bentukTransport.temperature === 'DIHILANGKAN' && ok.l.bentukTransport.toolChoice === 'FUNCTION_PAKSA' && ok.l.bentukTransport.model === S5 && ok.l.bentukTransport.buktiKapabilitas === 'TERBUKTI:gen-1790501177-tPEVHVfeDJZFILO7BC5M' && ok.l.bentukTransport.sidik === R.BUKTI_TRANSPORT_S5_EVAL4.sidikBentukTransport)
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
  const tp = penyedia(null, { biaya: 0.045 })
  const l = await jalanLive(tp, { konfigUji: konfig({ batas: { ...BATAS_UJI, biayaLunakUsd: 0.09, biayaKerasUsd: 0.09 }, plafonPerPanggilanUsd: 0.05 }) })
  cek('F1 proyeksi: 0,045 teramati + plafon 0,05 > keras 0,09 → panggilan ke-2 DITOLAK sebelum transport', tp.jumlah() === 1 && l.ditolakPencegat.some((d) => d.alasan === 'PROYEKSI_BIAYA_KERAS') && l.akuntansi.biayaUsd === 0.045 && l.slot[1].status.startsWith('DIHENTIKAN:PROYEKSI_BIAYA_KERAS'), l.slot[1]?.status)
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
bagian('G. held-out (paket uji kecil): rencana deterministik & putusan gerbang')
{
  const tp = penyedia()
  const l = await jalanLive(tp, { konfigUji: konfig({ ulangan: 2 }) })
  cek('G1 rencana: 2 regresi dulu, lalu held-out × 2 ulangan dalam urutan paket', l.slot.map((s) => `${s.kasus}/u${s.ulangan}`).join(',') === 'RG-H20/u1,RG-H18/u1,UJI-X01/u1,UJI-X02/u1,UJI-X01/u2,UJI-X02/u2')
  cek('G2 label test-double tetap DRY_RUN; panggilanNyata 0; 6 panggilan transport', l.label === R.LABEL_DRY && l.transport === 'TEST_DOUBLE' && l.panggilanNyata === 0 && tp.jumlah() === 6)
  cek('G3 lengkap + semua gerbang lulus (jawaban setia) → PASS; semua gerbang tercantum', l.verdict === 'PASS' && Object.values(l.gerbang.gerbang).every((g) => g.lulus === true) && l.gerbang.gagal.length === 0)
  cek('G4 agregat per blok: regresi 2/2 OK, held-out 4/4 OK; paket held-out tercatat (versi+hash)', l.agregat.REGRESI_MUATAN_S5_V4.ok === 2 && l.agregat.HELDOUT_S5_V4.ok === 4 && l.paketHeldout.hashGt === konfig().paket.hashGt)
  cek('G5 held-out UJI-X01: validator menerima muatan berbukti (semen 1200 MT DISCHARGE) → 0 FATAL POST', (() => { const s = l.slot.find((x) => x.kasus === 'UJI-X01'); return s.penilai.POST.FATAL === 0 && s.muatan.post === 1 })())
  const x02 = l.slot.find((x) => x.kasus === 'UJI-X02')
  cek('G6 ringkasan slot tanpa nilai string model (hanya enum/hitungan/flag/sidik)', !JSON.stringify(x02).includes('RENGGANIS') && x02.sumber.panjang === UJI_X02.teks.length && typeof x02.klasifikasi.benarPost === 'boolean')
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
  cek('H1 run penuh: checkpoint SELESAI, 4 slot OK, inflight null, akuntansi = 4 panggilan; ulangan 1 → konsistensi tak terukur → INCONCLUSIVE (bukan PASS)', akhir.status === 'SELESAI' && akhir.slot.length === 4 && akhir.slot.every((s) => s.status === 'OK') && akhir.inflight === null && akhir.akuntansi.total === 4 && penuh.verdict === 'INCONCLUSIVE' && penuh.gerbang.gerbang.G_KONSISTENSI_ULANGAN.lulus === null)
  const inflightSeq = toko1.riwayat.map((c) => c.inflight).filter((x) => x !== null)
  cek('H2 penanda inflight ditulis SEBELUM setiap panggilan (seq 1..4, berurutan)', JSON.stringify(inflightSeq) === '[1,2,3,4]')
  cek('H2b ikatan checkpoint memuat bentuk & profil transport Eval-4 (ubah bentuk → resume ditolak)', akhir.ikatan.bentukTransport?.temperature === 'DIHILANGKAN' && akhir.ikatan.profilTransport?.acceptsTemperature === false && R.periksaResume({ ...akhir, status: 'DIJEDA' }, { ...akhir.ikatan, profilTransport: { ...akhir.ikatan.profilTransport, acceptsTemperature: true } }).includes('IKATAN_CHECKPOINT_BERBEDA'))
  cek('H3 checkpoint tersanitasi: tanpa teks dokumen / nama kapal / kunci', (() => { const t = JSON.stringify(toko1.riwayat); return !t.includes('LAYANG BENGAWAN') && !t.includes('KAYANGAN') && !t.includes(KUNCI_PALSU) && !t.includes('sawn timber') })())

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

  // Anggaran kumulatif lintas resume: sesi 1 memakai 0,045; sesi 2 diproyeksi 0,045 + 0,05 > 0,09 → ditolak sebelum transport.
  const KB = konfig({ batas: { ...BATAS_UJI, biayaLunakUsd: 0.09, biayaKerasUsd: 0.09 }, plafonPerPanggilanUsd: 0.05 })
  const toko6 = R.buatTokoCheckpointMemori()
  let n6 = 0
  await jalanLive(penyedia(null, { biaya: 0.045 }), { konfigUji: KB, checkpoint: toko6, sinyalJeda: () => n6++ >= 1 })
  const tpH = penyedia(null, { biaya: 0.045 })
  const rBiaya = await jalanLive(tpH, { konfigUji: KB, checkpoint: toko6, lanjut: true })
  cek('H16 batas biaya berlaku untuk SELURUH run lintas resume (proyeksi memakai biaya sesi lalu) → 0 panggilan baru', tpH.jumlah() === 0 && rBiaya.ditolakPencegat.some((d) => d.alasan === 'PROYEKSI_BIAYA_KERAS') && rBiaya.akuntansi.biayaUsd === 0.045)

  const cpRusak = { ...toko2.isi(), status: 'DIJEDA', slot: toko2.isi().slot.slice(0, 1), akuntansi: { ...toko2.isi().akuntansi, total: 99 } }
  cek('H17 periksaResume: akuntansi tak konsisten / format lain → ditolak', R.periksaResume(cpRusak, cpRusak.ikatan).includes('AKUNTANSI_CHECKPOINT_TIDAK_KONSISTEN') && R.periksaResume({ ...cpRusak, format: 'x' }, cpRusak.ikatan).includes('FORMAT_CHECKPOINT_BERBEDA'))

  // ── ikatan TANGGAL EFEKTIF (checkpoint-2): teks kasus memuat tanggal turunan hari eksekusi.
  const BESOK = new Date('2026-09-28T00:00:00Z')
  cek('H17b ikatan checkpoint memuat tanggal efektif run (YYYY-MM-DD) + sidik sumber; format checkpoint-2', R.FORMAT_CHECKPOINT === 'prd005-eval4/checkpoint-2' && akhir.format === R.FORMAT_CHECKPOINT && akhir.ikatan.tanggalEfektif === '2026-09-27' && /^[0-9a-f]{64}$/.test(akhir.ikatan.sidikSumber ?? ''))
  const toko7 = R.buatTokoCheckpointMemori()
  let n7 = 0
  await jalanLive(penyedia(), { konfigUji: K, checkpoint: toko7, sinyalJeda: () => n7++ >= 1 })
  const tpI = penyedia()
  const rTanggal = await jalanLive(tpI, { konfigUji: K, checkpoint: R.buatTokoCheckpointMemori(toko7.isi()), lanjut: true, hariIni: BESOK })
  const tpJ = penyedia()
  const rTanggalSama = await jalanLive(tpJ, { konfigUji: K, checkpoint: R.buatTokoCheckpointMemori(toko7.isi()), lanjut: true })
  cek('H17c resume checkpoint DIJEDA pada tanggal efektif LAIN → DITOLAK_RESUME IKATAN_CHECKPOINT_BERBEDA, 0 panggilan; kontrol tanggal sama → lanjut 3 slot', toko7.isi().status === 'DIJEDA' && rTanggal.verdict === 'DITOLAK_RESUME' && rTanggal.galat.includes('IKATAN_CHECKPOINT_BERBEDA') && tpI.jumlah() === 0 && tpJ.jumlah() === 3 && rTanggalSama.checkpoint.dilanjutkan === true)
  // Paket BEKU owner (held-out ber-ETA relatif): tanggal lain → teks sumber lain → sidik sumber lain.
  const tokoH = R.buatTokoCheckpointMemori()
  let nH = 0
  await jalanBeku({ mode: 'offline', checkpoint: tokoH, sinyalJeda: () => nH++ >= 1 })
  const tokoH2 = R.buatTokoCheckpointMemori()
  let nH2 = 0
  await jalanBeku({ mode: 'offline', checkpoint: tokoH2, hariIni: BESOK, sinyalJeda: () => nH2++ >= 1 })
  const ikH = tokoH.isi().ikatan
  const ikH2 = tokoH2.isi().ikatan
  const rBekuTanggal = await jalanBeku({ mode: 'offline', checkpoint: R.buatTokoCheckpointMemori(tokoH.isi()), lanjut: true, hariIni: BESOK })
  cek('H17d paket beku: checkpoint hari H dilanjutkan hari H+1 → DITOLAK_RESUME IKATAN_CHECKPOINT_BERBEDA; tanggal efektif & sidik sumber berbeda, sidik rencana sama', tokoH.isi().status === 'DIJEDA' && rBekuTanggal.verdict === 'DITOLAK_RESUME' && rBekuTanggal.galat.includes('IKATAN_CHECKPOINT_BERBEDA') && ikH.tanggalEfektif === '2026-09-27' && ikH2.tanggalEfektif === '2026-09-28' && ikH.sidikSumber !== ikH2.sidikSumber && ikH.sidikRencana === ikH2.sidikRencana)
  const cpJeda = { ...tokoH.isi() }
  cek('H17e periksaResume murni: sidik sumber beda (tanggal sama) / tanggal beda (sidik sama) → IKATAN_CHECKPOINT_BERBEDA; ikatan identik → boleh', R.periksaResume(cpJeda, { ...ikH, sidikSumber: '0'.repeat(64) }).includes('IKATAN_CHECKPOINT_BERBEDA') && R.periksaResume(cpJeda, { ...ikH, tanggalEfektif: '2026-09-28' }).includes('IKATAN_CHECKPOINT_BERBEDA') && R.periksaResume(cpJeda, ikH).length === 0)
  const { tanggalEfektif: _t, sidikSumber: _s, ...ikatanLama } = ikH
  const cpLama = { ...cpJeda, format: 'prd005-eval4/checkpoint-1', ikatan: { ...ikatanLama, format: 'prd005-eval4/checkpoint-1', runner: 'prd005-eval4/runner-1', paket: { versi: 'prd005-eval4/heldout-1', hashGt: '8dca7b6c609d0e07955f67f8db1dd088a2c4381bf3a7540edda2c7235c6c541e' } } }
  cek('H17f checkpoint bentuk LAMA (checkpoint-1, tanpa tanggal efektif, paket heldout-1) → FORMAT & IKATAN berbeda → tak bisa dilanjutkan', (() => { const g = R.periksaResume(cpLama, ikH); return g.includes('FORMAT_CHECKPOINT_BERBEDA') && g.includes('IKATAN_CHECKPOINT_BERBEDA') })())

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
  cek('I4 CLI luring (konfigurasi BEKU): rencana 42 slot + proyeksi DICETAK SEBELUM eksekusi; kode 0; laporan di luar repo; PASS (stub setia)', rc === 0 && lap.verdict === 'PASS' && lap.panggilanTransport === 42 && lap.panggilanNyata === 0 && keluar.some((s) => s.includes('H20=LULUS')) &&
    keluar.findIndex((s) => s.startsWith('proyeksi maksimum')) >= 0 && keluar.findIndex((s) => s.startsWith('proyeksi maksimum')) < keluar.findIndex((s) => / RG-H20 u1 → (OK|GAGAL)/.test(s)) && keluar.filter((s) => /^ {2}#\d+ /.test(s)).length >= 42)
  const rcLive = await R.cli(['--mode', 'live', '--report', join(dir, 'l.json')], ENV_LIVE, () => {})
  cek('I5 CLI live (frasa + kunci palsu) → DITOLAK (kode 3), 0 jaringan — kunci otorisasi owner repo = false', rcLive === 3 && !existsSync(join(dir, 'l.json')) && panggilanJaringan === 0)
  cek('I6 CLI tanpa argumen → kode 2 (cetak rencana saja)', (await R.cli([], ENV_UJI, () => {})) === 2)
  writeFileSync(join(dir, 'ada.json'), '{}')
}

// =====================================================================
bagian('K. bukti kapabilitas transport Sonnet 5 (beku; hanya menghapus penghalang transport)')
{
  const B = R.BUKTI_TRANSPORT_S5_EVAL4
  const HP = R.harapanTransportEval4()
  const KT = 'KAPABILITAS_TRANSPORT_S5_BELUM_DIBUKTIKAN'
  const siapDengan = (bukti, harapan = HP, x = {}) => M.kesiapanLiveEval4({ otorisasiOwnerLive: true, dilayani: S5, konfigOwner: { ambangKualitas: { x: 1 } }, galatKonfig: [], buktiTransport: bukti, harapanTransport: harapan, ...x }).alasan
  const tanpaBukti = siapDengan(null)
  const denganBukti = siapDengan(B)
  cek('K1 bukti beku sah: periksaBuktiTransport = []; beku (Object.isFrozen); field inti = hasil probe', M.periksaBuktiTransport(B, HP).length === 0 && Object.isFrozen(B) && Object.isFrozen(B.pemakaian) &&
    B.providerRequestId === 'gen-1790501177-tPEVHVfeDJZFILO7BC5M' && B.provider === 'Claude Platform on AWS' && B.pemakaian.input === 5997 && B.pemakaian.output === 162 && B.pemakaian.total === 6159 && B.biayaUsd === 0.013614 && B.panggilanModel === 1 && B.finishReason === 'tool_calls')
  cek('K2 bukti menghapus HANYA penghalang transport (selisih tepat satu penghalang)', tanpaBukti.includes(KT) && !denganBukti.includes(KT) && JSON.stringify(tanpaBukti.filter((a) => a !== KT)) === JSON.stringify(denganBukti))
  const ubah = (x) => ({ ...B, ...x })
  const kembali = (bukti, harapan = HP) => siapDengan(bukti, harapan).includes(KT)
  cek('K3 served model salah (Sonnet 4.5 / -preview) → penghalang kembali', kembali(ubah({ servedModel: S45 })) && kembali(ubah({ servedModel: `${S5}-preview` })))
  cek('K4 requested model salah → penghalang kembali', kembali(ubah({ requestedModel: S45 })) && kembali(ubah({ requestedModel: 'anthropic/claude-opus-5' })))
  cek('K5 bukti dengan temperature terkirim → penghalang kembali', kembali(ubah({ temperatureDikirim: true })) && kembali(ubah({ temperatureDikirim: undefined })))
  cek('K6 fallback / provider override terkirim → penghalang kembali', kembali(ubah({ fallbackDikirim: true })) && kembali(ubah({ providerOverrideDikirim: true })))
  cek('K7 tool paksa salah / tidak terpaksa → penghalang kembali', kembali(ubah({ toolPaksa: 'tool_lain' })) && kembali(ubah({ toolCallTerpaksa: false })) && kembali(ubah({ finishReason: 'stop' })))
  cek('K8 request id hilang / tak sah → penghalang kembali', kembali(ubah({ providerRequestId: undefined })) && kembali(ubah({ providerRequestId: '' })) && kembali(ubah({ providerRequestId: 'bukan-id' })))
  const bentukLain = R.sidikBentukTransportEval4({ ...R.BENTUK_TRANSPORT_EVAL4, temperature: 'NOL' }, R.PROFIL_TRANSPORT_EVAL4)
  const profilLain = R.sidikBentukTransportEval4(R.BENTUK_TRANSPORT_EVAL4, { ...R.PROFIL_TRANSPORT_EVAL4, acceptsTemperature: true })
  cek('K9 identitas transport/hash berubah (bentuk, profil, hash Prompt v4, tool) → penghalang kembali', bentukLain !== HP.sidikBentukTransport && profilLain !== HP.sidikBentukTransport &&
    kembali(B, { ...HP, sidikBentukTransport: bentukLain }) && kembali(B, { ...HP, sidikBentukTransport: profilLain }) && kembali(B, { ...HP, hashPromptV4: X.PROMPT_INTAKE_V3.hash }) && kembali(B, { ...HP, toolPaksa: 'lain' }) && kembali(B, null))
  cek('K10 sidik beku = sidik bentuk+profil SAAT INI; tool paksa beku = tool Prompt v4 nyata', B.sidikBentukTransport === R.sidikBentukTransportEval4() && R.TOOL_PAKSA_EVAL4 === X.PROMPT_INTAKE_V4.tool.function.name && B.hashPromptV4 === X.PROMPT_INTAKE_V4.hash)
  cek('K11 bukti lain yang rusak (argumen tak sah, HTTP ≠200, panggilan ≠1, pemakaian/biaya tak konsisten, biaya > batas probe) → penghalang kembali',
    kembali(ubah({ argumenStrukturSah: false })) && kembali(ubah({ httpStatus: 500 })) && kembali(ubah({ panggilanModel: 2 })) && kembali(ubah({ pemakaian: { input: 5997, output: 162, total: 1 } })) && kembali(ubah({ biayaUsd: 0.06 })) && kembali(ubah({ jenis: 'X' })) && kembali(ubah({ provider: '' })))
  const hal = R.penghalangLiveEval4({ terlihat: TERLIHAT })
  cek('K12 penghalang lain TETAP (otorisasi owner); transport terbukti; kesiapan tetap FALSE', JSON.stringify(hal) === '["OTORISASI_LIVE_OWNER_TIDAK_ADA"]' && !hal.includes(KT) &&
    M.kesiapanLiveEval4({ otorisasiOwnerLive: true, dilayani: S5, konfigOwner: { ambangKualitas: { x: 1 } }, galatKonfig: [], buktiTransport: B, harapanTransport: HP }).siap === false)
  cek('K13 Sonnet 5 tetap PENDING_SPIKE, kemampuan null, dasar NONE; bawaan klien tetap Sonnet 4.5', MC.cariEntriModel(S5).status === 'PENDING_SPIKE' && MC.cariEntriModel(S5).kemampuan === null && MC.cariEntriModel(S5).dasar === 'NONE' && OR.SPK_MODEL === S45 && MC.resolusiModelIntake({ TAH_INTAKE_MODEL: S5 }).aktif === false)
  const lapLive = await R.jalankanRunnerEval4({ mode: 'live', env: ENV_LIVE, hariIni: HARI })
  cek('K14 live jaringan tetap DITOLAK sebelum panggilan apa pun (kesiapan: otorisasi owner)', lapLive.verdict === 'DITOLAK_KESIAPAN_LIVE' && lapLive.panggilanTransport === 0 && panggilanJaringan === 0)
}

// =====================================================================
bagian('L. paket held-out BEKU (20 kasus baru) & gerbang kualitas Eval-4')
{
  const KO = R.KONFIG_OWNER_EVAL4
  const AMB = R.AMBANG_KUALITAS_EVAL4
  const KH = FH.bangunKasusHeldoutEval4(HARI)
  const ids = FH.KASUS_HELDOUT_EVAL4.map((k) => k.id)
  cek('L1 tepat 20 kasus held-out: id unik Q01..Q20, semua TEXT, dibangun deterministik', ids.length === 20 && FH.JUMLAH_HELDOUT_EVAL4 === 20 && new Set(ids).size === 20 && JSON.stringify(ids) === JSON.stringify(Array.from({ length: 20 }, (_, i) => `Q${String(i + 1).padStart(2, '0')}`)) && KH.length === 20 && KH.every((k) => k.kind === 'TEXT') && JSON.stringify(FH.bangunKasusHeldoutEval4(HARI)) === JSON.stringify(KH))
  cek('L2 hash spesifikasi paket = hash beku konfigurasi owner; SHA berkas fixture terkunci', R.hitungHashSpekHeldout(FH) === KO.paket.hashGtBeku && R.verifikasiBekuEval4().length === 0 && 'prisma/fixtures/spike-intake/eval4-heldout-cases.mjs' in R.SHA_BEKU_EVAL4)
  const modUbah = { ...FH, KASUS_HELDOUT_EVAL4: FH.KASUS_HELDOUT_EVAL4.map((k, i) => (i === 4 ? { ...k, teks: () => 'teks diganti' } : k)) }
  cek('L2b spesifikasi diubah (satu teks) → hash beda → PAKET_HASH_GT_BERBEDA (paket tak bisa diganti diam-diam)', R.hitungHashSpekHeldout(modUbah) !== KO.paket.hashGtBeku && R.periksaPaketHeldout({ modul: modUbah, hashGtBeku: KO.paket.hashGtBeku }, { terlihat: TERLIHAT, hariIni: HARI }).includes('PAKET_HASH_GT_BERBEDA'))
  const lapK = R.laporanKemiripanHeldout(KH, TERLIHAT)
  const maksW = Math.max(...lapK.map((r) => r.trigramKata.nilai))
  const maksC = Math.max(...lapK.map((r) => r.ngramKarakter5.nilai))
  cek('L3 anti-kebocoran: id/teks/penanda lama tak dipakai ulang; kemiripan maks di bawah ambang beku; 0 nama kapal tumpang-tindih; konfigurasi owner sah', R.periksaPaketHeldout(KO.paket, { terlihat: TERLIHAT, hariIni: HARI }).length === 0 && R.periksaKonfigOwner(KO, { terlihat: TERLIHAT, hariIni: HARI }).length === 0 && lapK.every((r) => !r.mencurigakan && r.namaKapalTumpangTindih === 0) && maksW < R.AMBANG_KEMIRIPAN.trigramKata && maksC < R.AMBANG_KEMIRIPAN.ngramKarakter5 && TERLIHAT.korpus.length >= 80, `maks trigram ${maksW}, maks 5-gram ${maksC}, korpus ${TERLIHAT.korpus.length}`)
  const k3 = Object.fromEntries(F3.bangunKasusEval3(HARI).map((k) => [k.id, k]))
  const parafrase = { id: 'UJI-P1', kind: 'TEXT', kategori: 'UJI', teks: k3.H07.teks.replace('We hereby nominate your company', 'We nominate your firm').replace(/KTX3AG/g, 'Zeta'), gt: k3.H07.gt }
  const namaLama = { ...UJI_X01, id: 'UJI-P2', teks: 'Mohon bantu keagenan untuk kunjungan MV SEROJA BIRU ke Pelabuhan Bitung.\nMuatan: bongkar 1.200 MT semen.', gt: { ...UJI_X01.gt, vessels: { jumlah: Pn(1), daftar: [kapal({ name: Pn('SEROJA BIRU') })] } } }
  const gp = R.periksaPaketHeldout(paket([parafrase, namaLama]), { terlihat: TERLIHAT, hariIni: HARI })
  cek('L4 parafrase ringan kasus terlihat (H07) & nama kapal Eval-2 dipakai ulang → KEMIRIPAN_MENCURIGAKAN (tak diterima diam-diam)', gp.includes('UJI-P1:KEMIRIPAN_MENCURIGAKAN') && gp.includes('UJI-P2:KEMIRIPAN_MENCURIGAKAN'), gp.join(','))
  const tag = (t) => KH.filter((k) => k.cakupan.includes(t)).length
  const WAJIB = ['NORMAL', 'BAHASA_ID', 'BAHASA_EN', 'ANGKA_ID', 'TIDAK_LENGKAP', 'KONFLIK', 'MULTI_KAPAL', 'NON_KEAGENAN', 'INJEKSI', 'JEBAKAN_MUATAN', 'ASOSIASI_KAPAL_MUATAN', 'OPERASIONAL_REALISTIS']
  cek('L5 cakupan: setiap kategori wajib owner ≥ 2 kasus; bahasa seimbang 10 ID / 10 EN', WAJIB.every((t) => tag(t) >= 2) && KH.filter((k) => k.bahasa === 'ID').length === 10 && KH.filter((k) => k.bahasa === 'EN').length === 10, WAJIB.map((t) => `${t}:${tag(t)}`).join(' '))

  // Run penuh konfigurasi BEKU dengan stub SETIA (jawaban dari GT): gerbang harus lulus — GT konsisten dgn validator/penilai.
  const logL = []
  const lapL = await jalanBeku({ mode: 'offline', log: (x) => logL.push(x) })
  cek('L6 konsistensi GT: jawaban setia untuk 42 slot → PASS, 0 FATAL/MAJOR POST, H20 LULUS (DRY_RUN, 0 panggilan nyata)', lapL.verdict === 'PASS' && lapL.label === R.LABEL_DRY && lapL.panggilanNyata === 0 && lapL.panggilanTransport === 42 && lapL.h20.hasil === 'LULUS' && lapL.agregat.HELDOUT_S5_V4.fatalPost === 0 && lapL.gerbang.gerbang.G_LULUS_HELDOUT.lulusSlot === 40)
  const urut = ['1:REGRESI_MUATAN_S5_V4:RG-H20:u1', '2:REGRESI_MUATAN_S5_V4:RG-H18:u1', ...[1, 2].flatMap((u) => ids.map((id, i) => `${2 + (u - 1) * 20 + i + 1}:HELDOUT_S5_V4:${id}:u${u}`))]
  const rr1 = R.rincianRencanaEval4(KO, HARI)
  const rr2 = R.rincianRencanaEval4(KO, new Date('2027-01-15T00:00:00Z'))
  cek('L7 rencana deterministik: 42 slot, RG-H20 → RG-H18 → Q01..Q20 u1 → Q01..Q20 u2; sidik sama lintas hari eksekusi', JSON.stringify(lapL.rencana.daftar) === JSON.stringify(urut) && rr1.sidik === rr2.sidik && rr1.sidik === lapL.rencana.sidik && rr1.rencana.length === 42)
  cek('L8 ulangan = 2 untuk setiap kasus held-out; setiap slot TEPAT satu panggilan (0 ulang)', ids.every((id) => lapL.slot.filter((s) => s.kasus === id).map((s) => s.ulangan).join() === '1,2') && lapL.slot.every((s) => s.panggilan.length === 1) && lapL.operasional.tanpaUlang && lapL.akuntansi.percobaanUlang === 0)
  cek('L9 laporan memisahkan: regresi, held-out RAW & POST, fatal, muatan tak berbukti, fakta/angka, kelulusan, konsistensi, total panggilan/token/biaya', ['G_H20_POST', 'G_REGRESI', 'G_MUATAN_TAK_BERBUKTI_POST', 'G_FATAL_POST', 'G_IDENTITAS', 'G_OUTPUT_TOOL', 'G_LULUS_HELDOUT', 'G_KONSISTENSI_ULANGAN', 'G_LENGKAP', 'G_INTEGRITAS_GT'].every((k) => k in lapL.gerbang.gerbang) &&
    ['fatalRaw', 'fatalPost', 'f5UnsupportedRaw', 'f5UnsupportedPost'].every((k) => k in lapL.agregat.HELDOUT_S5_V4) && lapL.totalTokenInput === 42 * 2500 && lapL.totalTokenOutput === 42 * 400 && lapL.totalBiayaUsd === 0.42 && lapL.akuntansi.panggilanDicoba === 42)
  const iRencana = logL.findIndex((x) => x.startsWith('RENCANA PANGGILAN'))
  const iSlot1 = logL.findIndex((x) => / RG-H20 u1 → (OK|GAGAL)/.test(x))
  cek('L10 rencana panggilan LENGKAP dicetak SEBELUM panggilan pertama (log runner)', iRencana >= 0 && iRencana < iSlot1 && logL.slice(iRencana + 1, iSlot1).length === 42)

  // ── anggaran
  const ang = R.buktiAnggaranRencana(KO)
  cek('L11 anggaran rencana beku (owner D1): batas keras total = US$2,10; 42 × US$0,05 = US$2,10 ≤ US$2,10 → TERBUKTI & diterima preflight', ang.terbukti && ang.galat.length === 0 && ang.maksPanggilan === 42 && ang.maksBiayaUsd === 2.1 && ang.batasKerasUsd === 2.1 && KO.batas.biayaKerasUsd === R.BATAS_KERAS_MAKS_OWNER_USD && R.periksaKonfigOwner(KO, { terlihat: TERLIHAT, hariIni: HARI }).length === 0)
  const kf2 = (x) => R.periksaKonfigOwner({ ...KO, ...x }, { terlihat: TERLIHAT, hariIni: HARI })
  cek('L12 melewati US$2,10 DITOLAK: batas keras 2,20 / plafon 0,06 (kunci owner) & rencana 42 × 0,051 = 2,142 > 2,10 (anggaran tak terbukti)',
    kf2({ batas: { ...KO.batas, biayaKerasUsd: 2.2, biayaLunakUsd: 2.2 } }).includes('BATAS_KERAS_MELEBIHI_KEPUTUSAN_OWNER') && kf2({ plafonPerPanggilanUsd: 0.06 }).includes('PLAFON_MELEBIHI_KEPUTUSAN_OWNER') &&
      !R.buktiAnggaranRencana({ ...KO, plafonPerPanggilanUsd: 0.051 }).terbukti && !R.buktiAnggaranRencana({ ...KO, batas: { ...KO.batas, biayaKerasUsd: 2.09 } }).terbukti)
  const tolakKeras = await jalanBeku({ mode: 'offline', konfigUji: { ...KO, batas: { ...KO.batas, biayaKerasUsd: 2.2, biayaLunakUsd: 2.2 } } })
  const mahal = await jalanBeku({ mode: 'offline', opsiStub: { biaya: 0.05 } })
  cek('L13 runner menolak batas keras > US$2,10 (0 panggilan); saat run total TAK PERNAH melewati US$2,10 walau setiap panggilan tepat US$0,05', tolakKeras.verdict === 'DITOLAK_KONFIG_OWNER' && tolakKeras.panggilanTransport === 0 && mahal.totalBiayaUsd <= 2.1 && mahal.panggilanTransport <= 42, `biaya ${mahal.totalBiayaUsd}, panggilan ${mahal.panggilanTransport}, verdict ${mahal.verdict}`)
  const lewatPlafon = await jalanBeku({ mode: 'offline', opsiStub: { biaya: 0.06 } })
  cek('L14 plafon per panggilan DITEGAKKAN: biaya 0,06 > 0,05 → slot gagal BIAYA_PER_PANGGILAN_MELEBIHI_PLAFON, berhenti, 1 panggilan, INCONCLUSIVE', lewatPlafon.slot[0].status === 'GAGAL:BIAYA_PER_PANGGILAN_MELEBIHI_PLAFON' && lewatPlafon.panggilanTransport === 1 && lewatPlafon.verdict === 'INCONCLUSIVE' && lewatPlafon.berhenti === 'BIAYA_PER_PANGGILAN_MELEBIHI_PLAFON')

  // ── gerbang toleransi-nol (tak bisa ditutupi rata-rata)
  const validatorBocor = (raw, ctx) => {
    const r = P.validasiEkstraksi(structuredClone(raw), ctx)
    r.proposal.cargoes = (raw.cargoes ?? []).map((c) => ({ name: c.name, quantity: c.quantity ?? null, unit: c.unit ?? null, operation: c.operation ?? null, source: 'SOURCE_DOCUMENT', flags: [] }))
    return r
  }
  const h20Bocor = await jalanBeku({ mode: 'offline', jawabStub: jawabH20([{ name: 'coal', quantity: 5000, unit: 'MT', operation: 'LOAD' }]), validasiUji: validatorBocor })
  cek('L15 H20 muatan karangan lolos POST → FAIL (tanpa perataan) & run BERHENTI sebelum panggilan berikut (kebijakan toleransi-nol owner): 1 panggilan, slot 2..42 tak dijalankan', h20Bocor.verdict === 'FAIL' && h20Bocor.gerbang.gerbang.G_H20_POST.lulus === false && h20Bocor.gerbang.gerbang.G_MUATAN_TAK_BERBUKTI_POST.lulus === false && h20Bocor.panggilanTransport === 1 && h20Bocor.berhenti === 'TOLERANSI_NOL_FATAL_POST' && h20Bocor.slot.slice(1).every((x) => x.status === 'TIDAK_DIJALANKAN') && h20Bocor.pelanggaranToleransiNol.some((x) => x.startsWith('TOLERANSI_NOL_FATAL_POST:RG-H20#u1:F5')))
  const jawabQ16 = (k) => (k?.id === 'Q16' ? { ...R3.jawabanSempurnaEval3(k), cargoes: [{ name: 'bijih nikel', quantity: 5000, unit: 'MT', operation: 'LOAD' }] } : R3.jawabanSempurnaEval3(k))
  const q16Bocor = await jalanBeku({ mode: 'offline', jawabStub: jawabQ16, validasiUji: validatorBocor })
  cek('L16 muatan karangan held-out (jumlah Q16 tak tertulis) lolos POST → FAIL (G_MUATAN_TAK_BERBUKTI_POST) & berhenti di slot Q16 u1 (seq 18): 18 panggilan', q16Bocor.verdict === 'FAIL' && q16Bocor.gerbang.gerbang.G_MUATAN_TAK_BERBUKTI_POST.nilai >= 1 && q16Bocor.gerbang.gerbang.G_MUATAN_TAK_BERBUKTI_POST.detail.some((d) => d.startsWith('Q16#u1:F5')) && q16Bocor.panggilanTransport === 18 && q16Bocor.berhenti === 'TOLERANSI_NOL_FATAL_POST')
  const q16Aman = await jalanBeku({ mode: 'offline', jawabStub: jawabQ16 })
  cek('L17 muatan karangan hanya di RAW (validator produksi menahannya) → dilaporkan terpisah di RAW, POST bersih → tidak FAIL', q16Aman.agregat.HELDOUT_S5_V4.f5UnsupportedRaw >= 2 && q16Aman.agregat.HELDOUT_S5_V4.f5UnsupportedPost === 0 && q16Aman.gerbang.gerbang.G_MUATAN_TAK_BERBUKTI_POST.lulus === true && q16Aman.verdict === 'PASS')
  const q06 = await jalanBeku({ mode: 'offline', jawabStub: (k, m, n) => (k?.id === 'Q06' && n <= 22 ? { ...R3.jawabanSempurnaEval3(k), eta: KH.find((x) => x.id === 'Q06').tanggal.ETA1.iso } : R3.jawabanSempurnaEval3(k)) })
  cek('L18 kesalahan fakta/angka kritis (ETA yang dibatalkan, tertulis & berlabel) lolos POST → F4 → FAIL (satu slot cukup) & berhenti di Q06 u1 (seq 8): 8 panggilan', q06.verdict === 'FAIL' && q06.gerbang.gerbang.G_FATAL_POST.detail.some((d) => d.startsWith('Q06#u1:F4')) && q06.panggilanTransport === 8 && q06.slot.slice(8).every((x) => x.status === 'TIDAK_DIJALANKAN'))

  // ── koreksi owner heldout-2 (RCA run heldout-1): Q16 GT & Q17 teks sumber
  const slotKasus = (lap, id) => lap.slot.filter((s) => s.kasus === id)
  const bersih = (s) => s.status === 'OK' && s.penilai.POST.FATAL === 0 && s.penilai.POST.MAJOR === 0 && s.penilai.POST.MINOR === 0 && s.penilai.RAW.FATAL === 0 && s.penilai.RAW.MAJOR === 0 && s.penilai.integritasGt === 'OK' && s.penilai.POST.konflikGt === 0
  const q16Verbatim = await jalanBeku({ mode: 'offline', jawabStub: (k) => (k?.id === 'Q16' ? { ...R3.jawabanSempurnaEval3(k), cargoes: [{ name: 'bijih nikel (nickel ore)', operation: 'LOAD' }] } : R3.jawabanSempurnaEval3(k)) })
  cek('L18b Q16 bentuk verbatim sumber "bijih nikel (nickel ore)" (tanpa jumlah) → 0 FATAL/MAJOR/MINOR, tanpa konflik GT, PASS', FH.VERSI_HELDOUT_EVAL4 === 'prd005-eval4/heldout-3' && slotKasus(q16Verbatim, 'Q16').length === 2 && slotKasus(q16Verbatim, 'Q16').every(bersih) && q16Verbatim.verdict === 'PASS')
  const q16Lain = await jalanBeku({ mode: 'offline', jawabStub: (k) => (k?.id === 'Q16' ? { ...R3.jawabanSempurnaEval3(k), cargoes: [{ name: 'ore', operation: 'LOAD' }] } : R3.jawabanSempurnaEval3(k)) })
  cek('L18c Q16: pencocokan TIDAK dilonggarkan global — nama lain ("ore") tetap bukan pasangan GT (konflik GT, INCONCLUSIVE_GT)', slotKasus(q16Lain, 'Q16').every((s) => s.penilai.integritasGt === 'INCONCLUSIVE_GT' && s.penilai.POST.MAJOR === 1) && q16Lain.verdict !== 'PASS')
  const q17 = KH.find((k) => k.id === 'Q17')
  cek('L18d Q17 teks sumber tegas SATU kunjungan / satu port call / satu penunjukan keagenan; 4 kapal, 2 jumlah, Batulicin IDBTW, ETA tetap; GT klasifikasi = KEAGENAN saja', /SATU kunjungan \(satu port call\) dengan satu penunjukan keagenan/.test(q17.teks) && /di bawah penunjukan keagenan yang sama/.test(q17.teks) && ['TB SURYA MANDALA 5', 'BG SURYA MANDALA 3301', 'TB SURYA MANDALA 6', 'BG SURYA MANDALA 3302', '7.500 MT', '7.320 MT', 'Batulicin (IDBTW)', q17.tanggal.ETA.idLong].every((x) => q17.teks.includes(x)) && JSON.stringify(q17.gt.classification.values) === JSON.stringify(['NEW_NOMINATION', 'NEW_APPOINTMENT']))
  cek('L18e Q17 jawaban satu-port-call yang dimaksud (4 kapal ber-peran, 2 baris muatan) → 0 FATAL/MAJOR/MINOR (run setia L6)', slotKasus(lapL, 'Q17').length === 2 && slotKasus(lapL, 'Q17').every(bersih))
  const q17Unsup = await jalanBeku({ mode: 'offline', jawabStub: (k) => (k?.id === 'Q17' ? { ...R3.jawabanSempurnaEval3(k), classification: 'UNSUPPORTED_REQUEST' } : R3.jawabanSempurnaEval3(k)) })
  cek('L18f Q17 GT tidak dilonggarkan: UNSUPPORTED_REQUEST tetap MAJOR (klasifikasi salah), slot tidak lulus', slotKasus(q17Unsup, 'Q17').every((s) => s.penilai.POST.MAJOR === 1 && s.klasifikasi.benarPost === false) && q17Unsup.gerbang.gerbang.G_LULUS_HELDOUT.lulusSlot === 38)

  // ── KEBIJAKAN BERHENTI TOLERANSI-NOL (keputusan owner sesudah heldout-2; ditegakkan runner)
  cek('L18g kebijakan berhenti tercatat di laporan; runner-3; nilai pelanggaran murni: slot OK + FATAL POST → alasan, slot bersih/gagal → []', R.KEBIJAKAN_BERHENTI_EVAL4 === 'SEMUA_PELANGGARAN_TOLERANSI_NOL_HENTIKAN_SEBELUM_PANGGILAN_BERIKUT' && R.VERSI_RUNNER_EVAL4 === 'prd005-eval4/runner-3' && lapL.kebijakanBerhenti === R.KEBIJAKAN_BERHENTI_EVAL4 && lapL.pelanggaranToleransiNol.length === 0 &&
    R.pelanggaranToleransiNolSlot({ status: 'OK', kasus: 'Q01', ulangan: 2, penilai: { POST: { fatal: ['F3@portName'] } } })[0] === 'TOLERANSI_NOL_FATAL_POST:Q01#u2:F3@portName' && R.pelanggaranToleransiNolSlot({ status: 'OK', kasus: 'Q01', ulangan: 1, penilai: { POST: { fatal: [] } } }).length === 0 && R.pelanggaranToleransiNolSlot({ status: 'GAGAL:X', penilai: null }).length === 0)
  // Slot held-out SEMBARANG (u1 & u2, awal/tengah/akhir): muatan karangan disuntik di slot target & validator bocor
  // (seam uji, seperti L15/L16) → F5 FATAL POST di slot itu SAJA → berhenti; tepat seq panggilan, 0 sesudahnya.
  const karanganDi = (seqTarget) => (k, m, n) => (n === seqTarget ? { ...R3.jawabanSempurnaEval3(k), cargoes: [...(R3.jawabanSempurnaEval3(k).cargoes ?? []), { name: 'karet sintetis', quantity: 4321, unit: 'MT', operation: 'LOAD' }] } : R3.jawabanSempurnaEval3(k))
  const hasilSeq = []
  for (const seqT of [3, 14, 23, 35, 42]) {
    const lap = await jalanBeku({ mode: 'offline', jawabStub: karanganDi(seqT), validasiUji: validatorBocor })
    const s = lap.slot.find((x) => x.seq === seqT)
    const fatalPostSlot = s?.penilai?.POST.FATAL ?? 0
    hasilSeq.push({ seqT, ok: lap.verdict === 'FAIL' && fatalPostSlot > 0 && lap.panggilanTransport === seqT && lap.berhenti === 'TOLERANSI_NOL_FATAL_POST' && lap.slot.filter((x) => x.seq > seqT).every((x) => x.status === 'TIDAK_DIJALANKAN' && x.panggilan.length === 0), calls: lap.panggilanTransport, fatal: fatalPostSlot, verdict: lap.verdict })
  }
  cek('L18h F5 FATAL POST (muatan karangan lolos validator) di slot held-out SEMBARANG (seq 3, 14, 23 [u2 pertama], 35, 42 [terakhir]) → run berhenti: transport TEPAT = seq, 0 panggilan sesudahnya, verdict FAIL', hasilSeq.every((x) => x.ok), JSON.stringify(hasilSeq.filter((x) => !x.ok)))
  const tokoZ = R.buatTokoCheckpointMemori()
  const lapZ = await jalanBeku({ mode: 'offline', jawabStub: karanganDi(27), validasiUji: validatorBocor, checkpoint: tokoZ })
  const rZ = await jalanBeku({ mode: 'offline', validasiUji: validatorBocor, checkpoint: R.buatTokoCheckpointMemori(tokoZ.isi()), lanjut: true })
  cek('L18i berhenti toleransi-nol → checkpoint BERHENTI (bukan DIJEDA), inflight null; resume DITOLAK (0 panggilan)', lapZ.panggilanTransport === 27 && tokoZ.isi().status === 'BERHENTI' && tokoZ.isi().inflight === null && rZ.verdict === 'DITOLAK_RESUME' && rZ.galat.some((g) => g.startsWith('STATUS_TIDAK_BISA_DILANJUTKAN')) && rZ.panggilanTransport === 0)
  const lapIdent = await jalanBeku({ mode: 'offline', opsiStub: { served: (m, n) => (n === 30 ? 'anthropic/claude-sonnet-5-mini' : m) } })
  const lapTool = await jalanBeku({ mode: 'offline', jawabStub: (k, m, n) => (n === 12 ? { __mentah: '{bukan json' } : R3.jawabanSempurnaEval3(k)) })
  const lapTanpaTool = await jalanBeku({ mode: 'offline', jawabStub: (k, m, n) => (n === 40 ? { __tanpaTool: true } : R3.jawabanSempurnaEval3(k)) })
  cek('L18j identitas berbeda (seq 30) / output tool rusak (seq 12) / tanpa tool call (seq 40) → berhenti di slot itu, 0 panggilan sesudahnya, FAIL', [[lapIdent, 30, 'G_IDENTITAS'], [lapTool, 12, 'G_OUTPUT_TOOL'], [lapTanpaTool, 40, 'G_OUTPUT_TOOL']].every(([l, n, g]) => l.panggilanTransport === n && l.verdict === 'FAIL' && l.gerbang.gerbang[g].lulus === false && l.slot.filter((x) => x.seq > n).every((x) => x.status === 'TIDAK_DIJALANKAN')), [lapIdent, lapTool, lapTanpaTool].map((l) => `${l.panggilanTransport}/${l.verdict}`).join(' '))
  cek('L18k TIDAK berhenti bila muatan karangan hanya di RAW dan ditahan validator (POST bersih) — kebijakan menilai POST, sesuai gerbang (L17: 42 panggilan, PASS)', q16Aman.panggilanTransport === 42 && q16Aman.pelanggaranToleransiNol.length === 0 && q16Aman.verdict === 'PASS')
  // Replay Q19 heldout-2 (keluaran terekonstruksi = sidik POST e1366ce1…: semua benar kecuali portName "Pel. Pontianak").
  const q19Replay = await jalanBeku({ mode: 'offline', jawabStub: (k) => (k?.id === 'Q19' ? { ...R3.jawabanSempurnaEval3(k), portName: 'Pel. Pontianak' } : R3.jawabanSempurnaEval3(k)) })
  cek('L18l replay Q19 ("Pel. Pontianak (IDPNK)") dengan normalisasi terkoreksi → 0 FATAL/MAJOR/MINOR, tanpa F3, integritas GT OK; run 42 slot PASS', slotKasus(q19Replay, 'Q19').length === 2 && slotKasus(q19Replay, 'Q19').every((x) => bersih(x) && !x.penilai.POST.fatal.some((f) => f.startsWith('F3'))) && q19Replay.verdict === 'PASS' && q19Replay.panggilanTransport === 42)

  // ── ambang kelulusan & konsistensi (≥ 90%)
  const salahKelas = (daftar) => (k) => (daftar.includes(k?.id) ? { ...R3.jawabanSempurnaEval3(k), classification: 'INSUFFICIENT_INFORMATION' } : R3.jawabanSempurnaEval3(k))
  const lulus90 = await jalanBeku({ mode: 'offline', jawabStub: salahKelas(['Q01', 'Q18']) })
  const lulus85 = await jalanBeku({ mode: 'offline', jawabStub: salahKelas(['Q01', 'Q18', 'Q19']) })
  cek('L19 kelulusan held-out tepat 36/40 = 0,90 → lulus ambang; 34/40 = 0,85 → FAIL (G_LULUS_HELDOUT); konsistensi tetap 1,0', lulus90.gerbang.gerbang.G_LULUS_HELDOUT.nilai === 0.9 && lulus90.gerbang.gerbang.G_LULUS_HELDOUT.lulus === true && lulus90.verdict === 'PASS' && lulus85.gerbang.gerbang.G_LULUS_HELDOUT.nilai === 0.85 && lulus85.gerbang.gerbang.G_LULUS_HELDOUT.lulus === false && lulus85.verdict === 'FAIL' && lulus85.gerbang.gerbang.G_KONSISTENSI_ULANGAN.nilai === 1, `${lulus90.gerbang.gerbang.G_LULUS_HELDOUT.nilai}/${lulus85.gerbang.gerbang.G_LULUS_HELDOUT.nilai}`)
  const tanpaEta = (daftar) => (k) => { const o = R3.jawabanSempurnaEval3(k); if (daftar.includes(k?.id)) delete o.eta; return o }
  const major85 = await jalanBeku({ mode: 'offline', jawabStub: tanpaEta(['Q01', 'Q03', 'Q07']) })
  cek('L19b klasifikasi BENAR tetapi field kritis hilang (ETA, MAJOR) di 3 kasus × 2 → 34/40 → FAIL (slot lulus wajib 0 MAJOR POST)', major85.gerbang.gerbang.G_LULUS_HELDOUT.nilai === 0.85 && major85.verdict === 'FAIL' && major85.gerbang.gerbang.G_FATAL_POST.lulus === true && major85.slot.filter((x) => ['Q01', 'Q03', 'Q07'].includes(x.kasus)).every((x) => x.klasifikasi.benarPost && x.penilai.POST.MAJOR > 0), `${major85.gerbang.gerbang.G_LULUS_HELDOUT.nilai}`)
  const beda = (daftar) => (k, m, n) => (daftar.includes(k?.id) && n > 22 ? { ...R3.jawabanSempurnaEval3(k), vessels: [] } : R3.jawabanSempurnaEval3(k))
  const kons90 = await jalanBeku({ mode: 'offline', jawabStub: beda(['Q10', 'Q11']) })
  const kons85 = await jalanBeku({ mode: 'offline', jawabStub: beda(['Q10', 'Q11', 'Q20']) })
  cek('L20 konsistensi antar-ulangan 18/20 = 0,90 → lulus; 17/20 = 0,85 → FAIL walau kelulusan 40/40', kons90.gerbang.gerbang.G_KONSISTENSI_ULANGAN.nilai === 0.9 && kons90.verdict === 'PASS' && kons85.gerbang.gerbang.G_KONSISTENSI_ULANGAN.nilai === 0.85 && kons85.gerbang.gerbang.G_KONSISTENSI_ULANGAN.lulus === false && kons85.gerbang.gerbang.G_LULUS_HELDOUT.nilai === 1 && kons85.verdict === 'FAIL' && JSON.stringify(kons85.gerbang.gerbang.G_KONSISTENSI_ULANGAN.tidakKonsisten) === '["Q10","Q11","Q20"]')

  // ── konsistensi dihitung dari POST (owner D3), bukan RAW
  const srcR = baca('prisma/spike-eval4-runner.mjs')
  cek('L20b konsistensi gerbang = tanda tangan kritis scorer-1 atas tampilan POST; RAW hanya info', lapL.gerbang.gerbang.G_KONSISTENSI_ULANGAN.lapisan === 'POST' && srcR.includes("tidakKonsistenMenurut('sidikTandaTanganPost')") && srcR.includes('S.tandaTanganKritis(S.tampilanPost(post)') && 'infoRaw' in lapL.gerbang.gerbang.G_KONSISTENSI_ULANGAN && lapL.slot.every((x) => typeof x.sidikTandaTanganPost === 'string' && typeof x.sidikTandaTanganRaw === 'string'))
  const rawBedaDikoreksi = await jalanBeku({ mode: 'offline', jawabStub: (k, m, n) => (['Q16', 'Q15', 'Q13'].includes(k?.id) && n > 22 ? { ...R3.jawabanSempurnaEval3(k), cargoes: [{ name: 'bijih nikel', quantity: 5000, unit: 'MT', operation: 'LOAD' }] } : R3.jawabanSempurnaEval3(k)) })
  const gK = rawBedaDikoreksi.gerbang.gerbang.G_KONSISTENSI_ULANGAN
  cek('L20c RAW tak konsisten (muatan karangan di ulangan 2) TETAPI dikoreksi validator → POST konsisten 20/20 → tidak FAIL karena konsistensi (RAW 17/20 hanya info)', gK.nilai === 1 && gK.lulus === true && gK.infoRaw.nilai === 0.85 && rawBedaDikoreksi.gerbang.gerbang.G_MUATAN_TAK_BERBUKTI_POST.lulus === true && rawBedaDikoreksi.verdict === 'PASS', `POST ${gK.nilai} RAW ${gK.infoRaw.nilai} verdict ${rawBedaDikoreksi.verdict}`)
  const KH06 = KH.find((x) => x.id === 'Q06')
  const postBeda = (daftar) => (k, m, n) => {
    const o = R3.jawabanSempurnaEval3(k)
    if (n <= 22 || !daftar.includes(k?.id)) return o
    if (k.id === 'Q06') delete o.eta
    if (k.id === 'Q07') o.cargoes = [{ ...o.cargoes[0], quantity: 5480 }]
    if (k.id === 'Q11') delete o.eta
    return o
  }
  const post90 = await jalanBeku({ mode: 'offline', jawabStub: postBeda(['Q06', 'Q07']) })
  const post85 = await jalanBeku({ mode: 'offline', jawabStub: postBeda(['Q06', 'Q07', 'Q11']) })
  cek('L20d POST tak konsisten (nilai lain yang sama-sama diterima GT & lolos validator) 18/20 → lulus; 17/20 → FAIL walau kelulusan 40/40', post90.gerbang.gerbang.G_KONSISTENSI_ULANGAN.nilai === 0.9 && post90.verdict === 'PASS' && post85.gerbang.gerbang.G_KONSISTENSI_ULANGAN.nilai === 0.85 && post85.gerbang.gerbang.G_KONSISTENSI_ULANGAN.lulus === false && post85.gerbang.gerbang.G_LULUS_HELDOUT.nilai === 1 && post85.verdict === 'FAIL' && JSON.stringify(post85.gerbang.gerbang.G_KONSISTENSI_ULANGAN.tidakKonsisten) === '["Q06","Q07","Q11"]' && KH06.tanggal.ETA2.iso.length === 10, `${post90.gerbang.gerbang.G_KONSISTENSI_ULANGAN.nilai}/${post85.gerbang.gerbang.G_KONSISTENSI_ULANGAN.nilai}`)

  // ── UN/LOCODE: setiap pasangan pelabuhan/kode punya dasar verifikasi terdokumentasi
  const VU = FH.VERIFIKASI_UNLOCODE_EVAL4
  const kodeDiTeks = [...new Set(KH.flatMap((k) => k.teks.match(/\bID[A-Z]{3}\b/g) ?? []))].sort()
  const nilaiGt = (n) => (n?.status === 'PRESENT' ? [n.value] : n?.status === 'ACCEPTABLE' ? n.values.filter((x) => x !== null) : [])
  const pasangan = KH.flatMap((k) => nilaiGt(k.gt.portUnlocode).map((c) => ({ kasus: k.id, kode: c, nama: nilaiGt(k.gt.portName) })))
  const kompak = (x) => String(x).toUpperCase().replace(/[^A-Z]/g, '')
  cek('L33 setiap kode UN/LOCODE di teks 20 kasus tercatat di tabel verifikasi (sumber UNECE 2024.2, sha256 dataset), tanpa kode lama yang ditolak', kodeDiTeks.length > 0 && kodeDiTeks.every((c) => c in VU) && Object.keys(VU).sort().join() === kodeDiTeks.join() && /^[0-9a-f]{64}$/.test(FH.SUMBER_UNLOCODE.sha256) && !kodeDiTeks.some((c) => ['IDTPP', 'IDMRK', 'IDKBU', 'IDPNJ'].includes(c)), kodeDiTeks.join(','))
  cek('L34 setiap pasangan GT pelabuhan/kode: kode berfungsi pelabuhan laut (1) & nama pelabuhan GT = nama resmi UNECE; entri QQ wajib didukung bukti repo', pasangan.length >= 18 && pasangan.every((p) => VU[p.kode] && VU[p.kode].fungsi.startsWith('1') && p.nama.every((n) => kompak(VU[p.kode].nama).startsWith(kompak(n)))) && Object.values(VU).filter((v) => v.status === 'QQ').every((v) => v.repo.length > 0) && Object.values(VU).every((v) => ['AI', 'RL', 'QQ'].includes(v.status)), pasangan.filter((p) => !(VU[p.kode] && p.nama.every((n) => kompak(VU[p.kode].nama).startsWith(kompak(n))))).map((p) => p.kasus + ':' + p.kode).join(','))

  // ── identitas & output tool
  const idTengah = await jalanBeku({ mode: 'offline', opsiStub: { served: (m, n) => (n === 10 ? S45 : m) } })
  cek('L21 identitas berbeda di tengah run → berhenti SEGERA (tepat 10 panggilan), FAIL, sisa slot tak dijalankan', idTengah.panggilanTransport === 10 && idTengah.verdict === 'FAIL' && idTengah.gerbang.gerbang.G_IDENTITAS.lulus === false && idTengah.slot.slice(10).every((s) => s.status === 'TIDAK_DIJALANKAN'))
  const toolRusak = await jalanBeku({ mode: 'offline', jawabStub: (k, m, n) => (n === 5 ? { __tanpaTool: true } : R3.jawabanSempurnaEval3(k)) })
  const argRusak = await jalanBeku({ mode: 'offline', jawabStub: (k, m, n) => (n === 5 ? { __mentah: '{"classification": 7}' } : R3.jawabanSempurnaEval3(k)) })
  cek('L22 output tool hilang / argumen tak sah → FAIL (G_OUTPUT_TOOL), berhenti, tanpa ulang', toolRusak.verdict === 'FAIL' && toolRusak.gerbang.gerbang.G_OUTPUT_TOOL.lulus === false && toolRusak.panggilanTransport === 5 && argRusak.verdict === 'FAIL' && argRusak.gerbang.gerbang.G_OUTPUT_TOOL.lulus === false, `${toolRusak.slot[4].status} / ${argRusak.slot[4].status}`)
  const infra = await jalanBeku({ mode: 'offline', jawabStub: (k, m, n) => (n === 7 ? { __http: 503 } : R3.jawabanSempurnaEval3(k)) })
  cek('L23 galat infrastruktur (HTTP 503) → INCONCLUSIVE (bukan FAIL model, bukan PASS), tanpa ulang', infra.verdict === 'INCONCLUSIVE' && infra.panggilanTransport === 7 && infra.gerbang.gerbang.G_LENGKAP.lulus === false)

  // ── gerbang tak bisa dilewati
  const longgar = [{ ...AMB, fatalPostMaks: 1 }, { ...AMB, muatanTakBerbuktiPostMaks: 2 }, { ...AMB, lulusHeldoutMin: 0.8 }, { ...AMB, konsistensiUlanganMin: 0.5 }, { ...AMB, identitasBerbedaMaks: undefined }, null]
  cek('L24 ambang yang dilonggarkan / hilang DITOLAK periksaAmbangKualitas', longgar.every((a) => R.periksaAmbangKualitas(a).length > 0))
  const tolakLonggar = await jalanBeku({ mode: 'offline', konfigUji: { ...KO, ambangKualitas: { ...AMB, fatalPostMaks: 3 } } })
  cek('L25 runner menolak konfigurasi dengan ambang dilonggarkan (0 panggilan)', tolakLonggar.verdict === 'DITOLAK_KONFIG_OWNER' && tolakLonggar.galat.some((g) => g.startsWith('AMBANG_TOLERANSI_NOL_DILANGGAR')) && tolakLonggar.panggilanTransport === 0)
  const sintetis = (fatalReg) => R.evaluasiGerbangEval4({
    ringkas: lapL.slot.map((s) => (s.kasus === 'RG-H18' && fatalReg ? { ...s, penilai: { ...s.penilai, POST: { ...s.penilai.POST, FATAL: 1, fatal: ['F9@classification'] } } } : s)),
    rencana: lapL.rencana.daftar.map((d) => { const [seq, blok, kasus, u] = d.split(':'); return { seq: Number(seq), blok, kasus, ulangan: Number(u.slice(1)) } }),
    ambang: AMB, ulangan: 2, integritasGt: { status: 'OK', kasus: [] },
  })
  cek('L26 satu FATAL di regresi + 40/40 held-out + konsistensi 1,0 → tetap FAIL (tanpa perataan); tanpa FATAL → PASS', sintetis(true).putusan === 'FAIL' && sintetis(true).gerbang.G_REGRESI.lulus === false && sintetis(false).putusan === 'PASS')
  let jedaN = 0
  const jedaL = await jalanBeku({ mode: 'offline', sinyalJeda: () => jedaN++ >= 3 })
  cek('L27 run tak lengkap (dijeda) tak pernah PASS', jedaL.verdict === 'DIJEDA' && jedaL.gerbang.putusan !== 'PASS')
  cek('L28 gerbang kualitas terimplementasi (konstanta) & tak ada sakelar pelewat di runner', M.GERBANG_KUALITAS_EVAL4_DIIMPLEMENTASI === true && !/lewatiGerbang|skipGate|bypass/i.test(baca('prisma/spike-eval4-runner.mjs')))

  // ── kesiapan
  const halRepo = R.penghalangLiveEval4({ terlihat: TERLIHAT, hariIni: HARI })
  const halAnggaranLama = R.penghalangLiveEval4({ konfig: { ...KO, batas: { ...KO.batas, biayaKerasUsd: 1.5, biayaLunakUsd: 1.5 } }, terlihat: TERLIHAT, hariIni: HARI })
  cek('L29 kesiapan repo FALSE: penghalang tunggal = otorisasi owner (dihitung); dengan anggaran lama US$1,50 penghalang anggaran KEMBALI', JSON.stringify(halRepo) === JSON.stringify(['OTORISASI_LIVE_OWNER_TIDAK_ADA']) && JSON.stringify(halAnggaranLama) === JSON.stringify(['ANGGARAN_RENCANA_MELEBIHI_BATAS_KERAS', 'OTORISASI_LIVE_OWNER_TIDAK_ADA']))
  const siapSintetis = (otor) => M.kesiapanLiveEval4({ otorisasiOwnerLive: otor, dilayani: S5, konfigOwner: { ambangKualitas: AMB }, galatKonfig: [], galatAnggaran: [], buktiTransport: R.BUKTI_TRANSPORT_S5_EVAL4, harapanTransport: R.harapanTransportEval4() })
  cek('L30 tanpa otorisasi LIVE owner kesiapan SELALU false (fungsi murni: semua prasyarat lain terpenuhi)', siapSintetis(false).siap === false && JSON.stringify(siapSintetis(false).alasan) === '["OTORISASI_LIVE_OWNER_TIDAK_ADA"]' && siapSintetis(true).siap === true)
  const liveRepo = await R.jalankanRunnerEval4({ mode: 'live', env: ENV_LIVE, hariIni: HARI })
  cek('L31 live jaringan dengan konfigurasi beku (frasa + kunci palsu) → DITOLAK_KESIAPAN_LIVE (OTORISASI), 0 panggilan, 0 jaringan', liveRepo.verdict === 'DITOLAK_KESIAPAN_LIVE' && JSON.stringify(liveRepo.galat) === '["OTORISASI_LIVE_OWNER_TIDAK_ADA"]' && liveRepo.panggilanTransport === 0 && panggilanJaringan === 0)
  cek('L31b frasa di env TIDAK cukup: kunci otorisasi owner repo = false → otorisasiLiveOwner false; kunci true + frasa → true (fungsi murni)', R.OTORISASI_LIVE_EVAL4_OWNER === false && R.otorisasiLiveOwner(ENV_LIVE) === false && R.otorisasiLiveOwner(ENV_LIVE, true) === true && R.otorisasiLiveOwner({ SPIKE_AUTHORIZED: 'lain' }, true) === false)
  const keluarCetak = []
  R.cetakRencana((x) => keluarCetak.push(x), KO, HARI)
  cek('L32 cetakRencana: 42 baris rencana + proyeksi maksimum (42 × 0,05 = 2,1 ≤ 2,1 TERBUKTI) — tanpa panggilan', keluarCetak.filter((x) => /^ {2}#/.test(x)).length === 42 && keluarCetak.some((x) => x.includes('US$2.1 vs batas keras US$2.1') && x.includes('TERBUKTI ≤ batas')) && panggilanJaringan === 0)
}

// =====================================================================
bagian('J. kunci lingkup & nol jaringan')
{
  cek('J1 Sonnet 5 TETAP PENDING_SPIKE, kemampuan null; gerbang produksi TAH_INTAKE_MODEL tertutup', (() => { const e = MC.cariEntriModel(S5); return e.status === 'PENDING_SPIKE' && e.kemampuan === null && e.dasar === 'NONE' && MC.resolusiModelIntake({ TAH_INTAKE_MODEL: S5 }).aktif === false })())
  cek('J2 model bawaan klien tetap Sonnet 4.5; prompt produksi tetap v3', OR.SPK_MODEL === S45 && X.VERSI_PROMPT_INTAKE === '3' && X.PROMPT_INTAKE_V3.versi === '3')
  const KO = R.KONFIG_OWNER_EVAL4
  cek('J3 konfigurasi owner Eval-4 BEKU = keputusan owner persis (20 × 2, keras US$2,10 = lunak, plafon US$0,05, 42 maks, ambang terkunci)', Object.isFrozen(KO) && Object.isFrozen(KO.batas) && KO.jumlahKasusHeldout === 20 && KO.ulangan === 2 && KO.batas.biayaKerasUsd === 2.1 && KO.batas.biayaLunakUsd === 2.1 && KO.plafonPerPanggilanUsd === 0.05 && KO.batas.maksPanggilan === 42 && KO.ambangKualitas === R.AMBANG_KUALITAS_EVAL4 && R.periksaAmbangKualitas(KO.ambangKualitas).length === 0)
  const skrip = JSON.parse(baca('package.json')).scripts
  cek('J4 skrip npm Eval-4 hanya uji luring (prep/runner check) — tak ada skrip run live', Object.entries(skrip).filter(([k]) => /eval4/i.test(k)).every(([, v]) => /^node prisma\/check-eval4-(prep|runner)\.mjs$/.test(v)) && !Object.values(skrip).some((v) => /spike-eval4-runner|--mode\s+live/.test(v)))
  const src = baca('prisma/spike-eval4-runner.mjs')
  cek('J5 runner tanpa DB/Prisma dan tanpa baca kunci produksi (hanya SPIKE_OPENROUTER_API_KEY)', !/PrismaClient|src\/lib\/prisma|DATABASE_URL\s*=/.test(src) && !/(?<!process\.)env\.OPENROUTER_API_KEY/.test(src))
  cek('J6 nol panggilan ke fetch global (jaringan) sepanjang uji', panggilanJaringan === 0 && globalThis.fetch === fetchJebakan)
  cek('J7 env proses bersih sesudah semua uji', process.env.OPENROUTER_API_KEY === undefined && process.env.TAH_INTAKE_MODEL === undefined)
}

console.log(`\n${gagal === 0 ? '✅ SEMUA LULUS' : '❌ ADA YANG GAGAL'} — lulus ${lulus}, gagal ${gagal}`)
process.exit(gagal === 0 ? 0 : 1)
