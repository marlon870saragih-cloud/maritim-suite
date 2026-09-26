// Uji buku besar TAH + wiring intake — PRD-005 Step 3B (TANPA DB, TANPA dev server, TANPA jaringan).
//
// Jalankan:  node prisma/check-tah-ledger.mjs
//
// Modul yang mengimpor tanpa ekstensi / alias `@/` dimuat lewat jiti (sudah ada di
// node_modules). `globalThis.fetch` DIGANTI stub sebelum apa pun dimuat: setiap panggilan
// "OpenRouter" berakhir di stub — tak ada byte yang keluar ke jaringan. OPENROUTER_API_KEY
// wajib TIDAK diset saat uji dimulai (bukti tak ada kunci sungguhan yang dipakai).
//
// Lapis:
//   1. KUNCI SUMBER — chatCompletion & seluruh intake selain submitIntake BYTE-IDENTIK dengan
//      commit Step 3A (5bc6e0b); kuota/pemakaian/batas laju tak disentuh (TD-005-01);
//      rute & UI intake tak berubah; urutan biaya submitIntake; TD-005-02 tetap.
//   2. RINGKASAN Q3 — hanya nama field & hitungan, tanpa nilai / kontak / salinan proposal.
//   3. PEREKAM — no-op di luar konteks, terisolasi antar-permintaan paralel, tak pernah melempar.
//   4. chatCompletionMeta — permintaan PERSIS sama dengan chatCompletion; metadata aman.
//   5. PENGEKSTRAK SUNGGUHAN (stub fetch) — perilaku lama tanpa konteks, 2 percobaan ulang
//      plugin → 2 catatan, usage ada/hilang/rusak, timeout, model eksplisit, tanpa kebocoran.
//   6. PENGEKSTRAK PALSU — pelaporan deterministik, penanda RETRY 2 percobaan.
//   7. GERBANG MODEL (Q4) — requireIntake: tak diset/kosong → lama; diset tak terverifikasi →
//      MODEL_TIDAK_TERVERIFIKASI tanpa fallback.

import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const AKAR = fileURLToPath(new URL('..', import.meta.url))
const baca = (rel) => readFileSync(join(AKAR, rel), 'utf8')
const sha = (s) => createHash('sha256').update(s).digest('hex')

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
const KUNCI_ASLI_TERSET = typeof process.env.OPENROUTER_API_KEY === 'string' && process.env.OPENROUTER_API_KEY !== ''
const ASLI_FETCH = globalThis.fetch
let stub = null
const permintaan = []
globalThis.fetch = async (url, init = {}) => {
  permintaan.push({ url: String(url), init })
  if (!stub) throw new Error('JARINGAN_DILARANG_DALAM_UJI')
  return stub(String(url), init, permintaan.length)
}
const jawab = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } })
const tunggu = (ms) => new Promise((r) => setTimeout(r, ms))

const require = createRequire(import.meta.url)
const jiti = require('jiti')(fileURLToPath(import.meta.url), { alias: { '@': join(AKAR, 'src') }, interopDefault: true })
const muat = (rel) => jiti(join(AKAR, rel))

// =====================================================================
bagian('1. KUNCI SUMBER — yang tak boleh berubah di Step 3B')
{
  // Sidik jari dari commit Step 3A 5bc6e0b (dihitung dengan fungsi potong yang sama).
  const SIDIK = {
    chatCompletion: '02267f85f1d0102acbf7769aa80c5f308760b3d29ff1b7067c424d5c7aa7cfae',
    intakeSetelahSubmit: '9d3b261a5e6384b1fb91284a8980420c9580ad08ee7132aa56855a30e57ecbb7',
    intakeSebelumSubmit: '6067824246e03a0efdb0683588bbb0fe66d0004fe8ecf3c328012ac3724243be',
    'src/services/intake/intake-gate.ts': '98521d074c3aa0043ea4ce3c4c6e107313e96e5f82e4fd3ecd2a0a61b5255d9d',
    // Sidik Step 3A (c8781c27…f326) digantikan PRD-005 E5 Step 1 (81fab8cb…432e, pagar bukti tanggal),
    // lalu E5 Step 2 yang DISETUJUI OWNER (verifikasi OCR-aman + hitungan kapal dibuang).
    // Perubahan berikutnya pada berkas ini tetap harus memperbarui sidik ini secara eksplisit.
    'src/services/intake/intake-policy.ts': 'ea5739219e2849afbcb0fa55cb5d2c167d3705e4e22a6c138aa03888e929cbbb',
    'src/services/intake/intake-hash.ts': '862d3e086c24f578bdd4a07a70664de6fff96d6831e289dcb1d5ccd69e4525d3',
    'src/services/saas/quota.service.ts': '777e86317b23f3f1ebf3a4c0db9a941fa6159585d0071350f622019a844f29ce',
    'src/services/saas/usage.service.ts': '183fa3bbb9af7278d780d62431df5f91961130a8d84cd2392195b834cff0c23d',
    'src/services/saas/commercial-policy.ts': '2418580867772ecf43a5ed49469848bc4057bfaf985428d1ef3fc35489728ff1',
    'src/services/security/rate-limit.ts': '2ec73de38a1f76183a57714b205930d1768bf9768b8b80e791ba17bf7ffd2d4a',
    // Sidik Step 3A (5ab1278d…e316) digantikan PRD-005 E5 Step 2 yang DISETUJUI OWNER: UI tinjauan
    // intake menampilkan label DATE_NOT_IN_SOURCE / OCR_CORRECTED dan peringatan kapal dibuang.
    // Rute API tidak berubah.
    ruteDanUiIntake: 'f323c7461a99a37a6d0573aa775a431116a435fc2cb5ad24faac1cdd3eb62b70',
  }
  const fungsi = (src, nama) => {
    const i = src.indexOf(`export async function ${nama}(`)
    return i < 0 ? '' : src.slice(i, src.indexOf('\n}\n', i) + 3)
  }
  const or = baca('src/lib/ai/openrouter.ts')
  cek('chatCompletion BYTE-IDENTIK dengan Step 3A (pemanggil lama tak terpengaruh)', sha(fungsi(or, 'chatCompletion')) === SIDIK.chatCompletion)
  const svc = baca('src/services/intake/intake.service.ts')
  cek(
    'intake.service: listIntakes…linkExistingIntake (termasuk approve/reject/link/retry/update & helper-nya) BYTE-IDENTIK',
    sha(svc.slice(svc.indexOf('export async function listIntakes('))) === SIDIK.intakeSetelahSubmit,
  )
  cek(
    'intake.service: helper sebelum submitIntake (pemilihan pengekstrak, DTO, rekonsiliasi) BYTE-IDENTIK',
    sha(svc.slice(svc.indexOf('// ----------------------------------------------------------------- konstanta & util'), svc.indexOf('export async function submitIntake('))) === SIDIK.intakeSebelumSubmit,
  )
  for (const f of [
    'src/services/intake/intake-gate.ts',
    'src/services/intake/intake-policy.ts',
    'src/services/intake/intake-hash.ts',
  ]) cek(`${f} tak berubah`, sha(baca(f)) === SIDIK[f])
  for (const f of ['src/services/saas/quota.service.ts', 'src/services/saas/usage.service.ts', 'src/services/saas/commercial-policy.ts', 'src/services/security/rate-limit.ts']) {
    cek(`${f} tak berubah (semantik kuota/pemakaian AI tetap — TD-005-01 tak diperbaiki diam-diam)`, sha(baca(f)) === SIDIK[f])
  }
  const DAFTAR_RUTE = [
    'src/app/(app)/automation/intake/[id]/page.tsx',
    'src/app/(app)/automation/intake/page.tsx',
    'src/app/api/automation/intakes/[id]/approve/route.ts',
    'src/app/api/automation/intakes/[id]/link/route.ts',
    'src/app/api/automation/intakes/[id]/reject/route.ts',
    'src/app/api/automation/intakes/[id]/retry/route.ts',
    'src/app/api/automation/intakes/[id]/route.ts',
    'src/app/api/automation/intakes/route.ts',
    ...readdirSync(join(AKAR, 'src/components/automation')).map((f) => `src/components/automation/${f}`),
  ].sort()
  cek('rute API & UI intake/automation tak berubah (alur tampak pelanggan tetap)', sha(DAFTAR_RUTE.map((f) => f + '\n' + baca(f)).join('\n')) === SIDIK.ruteDanUiIntake)

  const i = svc.indexOf('export async function submitIntake(')
  const s = svc.slice(i, svc.indexOf('\nexport async function ', i + 10))
  const pos = ['pastikanLanggananAktif(ctx)', 'activeHashKey: hash', "pastikanKuota(ctx, 'PANGGILAN_AI')", 'cekBolehPanggilAi(', 'catatPanggilanAi(', 'mulaiLedgerIntake(', 'jalankanEkstraksi(', 'ekstrakDenganBatasWaktu(', 'P.validasiEkstraksi(', 'createManyAndReturn(', 'selesaiLedgerIntake(', "catatPemakaian(ctx, 'INTAKE_EXTRACTED'"].map((x) => s.indexOf(x))
  cek('submitIntake: langganan→hash→kuota→batas laju→AgentRun→ekstraksi→validasi→simpan→tutup run→pemakaian', pos.every((x, j) => x > 0 && (j === 0 || x > pos[j - 1])), pos.join(','))
  cek('submitIntake: ekstraksi gagal → run FAILED lalu galat upstream LAMA (pesan & kode sama)', /await gagalLedgerIntake\(ctx, ledger, kode\)\n\s+throw upstream\('Pembacaan AI gagal\. Tidak ada data yang dibuat — coba lagi nanti\.', \{ code: kode \}\)/.test(s))
  cek("pemakaian INTAKE_EXTRACTED masih tepat satu kali, argumen sama", (svc.match(/catatPemakaian\(ctx, 'INTAKE_EXTRACTED', \{ kind, classification \}\)/g) ?? []).length === 1)
  const ledger = baca('src/services/intake/intake-ledger.ts')
  cek('intake-ledger: TAH Core mati → null (tanpa baris ledger)', /if \(!tahCoreAktif\(\)\) return null/.test(ledger))
  cek('intake-ledger: tanpa ledger & tanpa model eksplisit → fungsi dipanggil APA ADANYA', /if \(!ledger && model === null\) return fn\(\)/.test(ledger))
  cek('intake-ledger: persetujuan intake tak disentuh', !/approveIntake|rejectIntake|linkExistingIntake|retryIntake|updateIntake/.test(ledger))
  const svcTah = baca('src/services/tah/agent-run.service.ts')
  cek('agent-run.service: akses DB hanya lewat forTenant (tanpa prisma mentah)', !/from '@\/lib\/prisma'/.test(svcTah) && /forTenant\(ctx\)/.test(svcTah))
  cek('agent-run.service: biaya tak diisi sampai spike (costAmount null)', /costAmount: null/.test(svcTah))
  cek('agent-run.service: tak menyentuh TahApprovalRequest / kuota / pemakaian', !/tahApprovalRequest|pastikanKuota|catatPemakaian|usageEvent/.test(svcTah))
}

// =====================================================================
bagian('2. RINGKASAN Q3 — data ringkasan saja')
{
  const { ringkasHasilIntake, teksRingkasanIntake } = muat('src/services/tah/ringkasan-intake.ts')
  const f = (value, flags = []) => ({ value, source: 'SOURCE_DOCUMENT', flags, extracted: value, confirmed: false })
  const kapal = (nama, excluded = false) => ({ name: f(nama), imo: f('9876543', ['IMO_CHECK_DIGIT']), mmsi: f(null), callSign: f('SENTCALL'), vesselType: f(null), role: f('TUG'), excluded })
  const proposal = {
    vessels: [kapal('MV SENTINEL-KAPAL'), kapal('TB SENTINEL-DIKECUALIKAN', true)],
    principalName: f('PT SENTINEL-PRINCIPAL', ['NOT_IN_SOURCE']),
    customerName: f(null),
    portName: f('SENTINEL-PELABUHAN'),
    portUnlocode: f(null),
    jetty: f(null),
    eta: f('2026-10-01'),
    etb: f(null),
    etc: f(null),
    etd: f(null),
    agencyType: f('FULL'),
    clientReference: f('SENTINEL-REF-001'),
    requestDate: f(null),
    cargoes: [{ name: 'SENTINEL-CARGO', quantity: 7777, unit: 'MT', operation: 'LOAD', source: 'SOURCE_DOCUMENT' }],
    contact: { name: 'SENTINEL-NAMA', email: 'sentinel@contoh.invalid', phone: '+62-SENTINEL' },
    classificationReason: 'SENTINEL-ALASAN',
  }
  const r = ringkasHasilIntake({ classification: 'NEW_NOMINATION', proposal, duplicateLevel: 'NO_DUPLICATE' })
  const teks = JSON.stringify(r) + teksRingkasanIntake(r)
  cek('ringkasan tanpa nilai field / kontak / cargo / alasan (tak ada "SENTINEL", 7777, 2026-10-01, 9876543)', !/SENTINEL|sentinel|7777|2026-10-01|9876543/.test(teks), teks)
  cek('ringkasan menyebut NAMA field terisi', JSON.stringify(r.fieldTerisi) === JSON.stringify(['principalName', 'portName', 'eta', 'agencyType', 'clientReference']))
  cek('ringkasan: kapal dikecualikan tak dihitung; cargo dihitung', r.jumlahKapal === 1 && r.jumlahCargo === 1)
  cek('ringkasan: kode flag unik terurut & jumlah flag', JSON.stringify(r.kodeFlag) === '["IMO_CHECK_DIGIT","NOT_IN_SOURCE"]' && r.jumlahFlag === 2)
  cek('ringkasan: klasifikasi ditimpa ditandai boolean (alasan tak disalin)', r.klasifikasiDitimpa === true)
  cek('ringkasan: tanpa kunci contact/proposal/vessels', !('contact' in r) && !('proposal' in r) && !('vessels' in r))
  cek('ringkasan: teks ≤ 300 karakter', teksRingkasanIntake(r).length <= 300)
}

// =====================================================================
bagian('3. PEREKAM — konteks per-permintaan')
{
  const P = muat('src/lib/ai/perekam-panggilan.ts')
  const meta = (n) => ({ provider: 'FAKE', requestedModel: 'm', servedModel: null, providerRequestId: null, promptId: 'p', promptVersion: '1', promptHash: 'h', schemaId: null, schemaVersion: null, params: {}, status: 'OK', errorCode: null, latencyMs: n, pemakaian: {} })
  let melempar = false
  try {
    P.laporPanggilan(meta(1))
  } catch {
    melempar = true
  }
  cek('di luar konteks: laporPanggilan no-op, tak melempar', !melempar)
  cek('di luar konteks: konteksModel() = null (pemanggil memakai bawaan lama)', P.konteksModel() === null)
  const a = []
  const b = []
  await Promise.all([
    P.jalankanDenganKonteks({ model: 'x/a', kemampuan: null, catat: (m) => a.push(m.latencyMs) }, async () => {
      await tunggu(15)
      P.laporPanggilan(meta(1))
      await tunggu(5)
      P.laporPanggilan(meta(2))
      return P.konteksModel()?.model
    }),
    P.jalankanDenganKonteks({ model: 'x/b', kemampuan: null, catat: (m) => b.push(m.latencyMs) }, async () => {
      await tunggu(5)
      P.laporPanggilan(meta(10))
    }),
  ])
  cek('dua permintaan paralel TIDAK tercampur', JSON.stringify(a) === '[1,2]' && JSON.stringify(b) === '[10]', `${a} | ${b}`)
  let lolos = true
  await P.jalankanDenganKonteks({ model: null, kemampuan: null, catat: () => { throw new Error('rusak') } }, async () => {
    try {
      P.laporPanggilan(meta(1))
    } catch {
      lolos = false
    }
  })
  cek('penerima catatan yang melempar tak mengganggu ekstraksi', lolos)
  const tanpaCatat = await P.jalankanDenganKonteks({ model: 'x/c', kemampuan: null }, async () => {
    P.laporPanggilan(meta(1))
    return P.konteksModel()?.model
  })
  cek('konteks model tanpa perekam (TAH Core mati + model eksplisit): model terbaca, catatan dibuang', tanpaCatat === 'x/c')
}

// =====================================================================
bagian('4. chatCompletionMeta vs chatCompletion — permintaan identik')
cek('OPENROUTER_API_KEY TIDAK diset saat uji dimulai (tak ada kunci sungguhan)', !KUNCI_ASLI_TERSET)
process.env.OPENROUTER_API_KEY = 'sk-SENTINEL-KUNCI-UJI-000000'
const OR = muat('src/lib/ai/openrouter.ts')
{
  const opsi = {
    model: 'vendor/uji',
    messages: [{ role: 'user', content: 'halo' }],
    tools: [{ type: 'function', function: { name: 't', description: 'd', parameters: {} } }],
    toolChoice: { type: 'function', function: { name: 't' } },
    temperature: 0,
    plugins: [{ id: 'file-parser', pdf: { engine: 'native' } }],
  }
  const respons = { id: 'gen-SENTINEL-ID', model: 'vendor/dilayani', usage: { prompt_tokens: 50, completion_tokens: 9 }, choices: [{ message: { content: 'SENTINEL-RESPON' } }] }
  stub = () => jawab(respons)
  permintaan.length = 0
  await OR.chatCompletion(opsi)
  const hasil = await OR.chatCompletionMeta(opsi)
  const [x, y] = permintaan
  cek('URL sama', x.url === y.url)
  cek('header sama', JSON.stringify(x.init.headers) === JSON.stringify(y.init.headers))
  cek('badan permintaan sama persis', x.init.body === y.init.body)
  cek('metode sama', x.init.method === y.init.method)
  cek('meta: servedModel/id/token terbaca', hasil.meta.servedModel === 'vendor/dilayani' && hasil.meta.providerRequestId === 'gen-SENTINEL-ID' && hasil.meta.pemakaian.inputTokens === 50 && hasil.meta.pemakaian.outputTokens === 9)
  cek('meta: tanpa isi respons', !JSON.stringify(hasil.meta).includes('SENTINEL-RESPON'))
  permintaan.length = 0
  await OR.chatCompletion({ ...opsi, temperature: undefined })
  await OR.chatCompletionMeta({ ...opsi, temperature: undefined })
  cek('bawaan temperature 0.2 sama di keduanya', permintaan[0].init.body === permintaan[1].init.body && JSON.parse(permintaan[1].init.body).temperature === 0.2)
  permintaan.length = 0
  await OR.chatCompletionMeta({ ...opsi, kirimTemperature: false })
  cek('kirimTemperature:false → temperature TIDAK dikirim', !('temperature' in JSON.parse(permintaan[0].init.body)))
  stub = () => jawab({ error: { message: 'pesan galat penyedia' } }, 500)
  const e1 = await OR.chatCompletion(opsi).catch((e) => e.message)
  const e2 = await OR.chatCompletionMeta(opsi).catch((e) => e.message)
  cek('galat penyedia: pesan yang dilempar sama (perilaku lama)', e1 === e2 && e1 === 'pesan galat penyedia')
  stub = () => jawab({ choices: [] })
  const tanpaUsage = await OR.chatCompletionMeta(opsi)
  cek('respons tanpa usage/model/id → meta null, tak melempar', tanpaUsage.meta.servedModel === null && tanpaUsage.meta.pemakaian.inputTokens === null)
}

// =====================================================================
bagian('5. PENGEKSTRAK SUNGGUHAN — stub fetch, tanpa jaringan')
const X = muat('src/lib/ai/vessel-call-extract.ts')
const PR = muat('src/lib/ai/perekam-panggilan.ts')
const MC = muat('src/lib/ai/model-capabilities.ts')
{
  const argsOk = JSON.stringify({ classification: 'NOT_RELEVANT', vessels: [], cargoes: [] })
  const sukses = (extra = {}) => jawab({ id: 'gen-ok-1', model: 'anthropic/claude-sonnet-4.5', usage: { prompt_tokens: 1200, completion_tokens: 80 }, choices: [{ message: { content: 'SENTINEL-RESPON', tool_calls: [{ function: { name: 'isi_intake_kunjungan', arguments: argsOk } }] } }], ...extra })
  const pdf = { kind: 'PDF', bytes: Buffer.from('%PDF-1.4 SENTINEL-DOKUMEN-ISI'), filename: 'SENTINEL-NAMA-BERKAS.pdf' }
  const teksMasukan = { kind: 'TEXT', text: 'Nominasi SENTINEL-DOKUMEN-TEKS MV Contoh' }

  // 5a. tanpa konteks = perilaku lama
  stub = () => sukses()
  permintaan.length = 0
  const r0 = await X.ekstrakDenganBatasWaktu(X.ekstrakLewatOpenRouter, teksMasukan, 5000)
  const b0 = JSON.parse(permintaan[0].init.body)
  cek('tanpa konteks: satu panggilan, hasil benar', permintaan.length === 1 && r0.classification === 'NOT_RELEVANT')
  cek('tanpa konteks: model = bawaan klien (SPK_MODEL) seperti sebelumnya', b0.model === OR.SPK_MODEL)
  cek('tanpa konteks: temperature 0 + tool paksa + tanpa plugin untuk teks', b0.temperature === 0 && b0.tool_choice?.function?.name === 'isi_intake_kunjungan' && b0.plugins === undefined)
  stub = () => sukses()
  permintaan.length = 0
  await X.ekstrakDenganBatasWaktu(X.ekstrakLewatOpenRouter, pdf, 5000)
  cek('tanpa konteks: PDF memakai plugin file-parser native seperti sebelumnya', JSON.parse(permintaan[0].init.body).plugins?.[0]?.pdf?.engine === 'native')

  // 5b. ulang plugin → dua percobaan dalam satu konteks perekam
  const tercatat = []
  stub = (_u, _i, n) => (n === 1 ? jawab({ error: { message: 'file-parser engine native not supported' } }, 400) : sukses())
  permintaan.length = 0
  const r1 = await PR.jalankanDenganKonteks({ model: null, kemampuan: null, catat: (m) => tercatat.push(m) }, () =>
    X.ekstrakDenganBatasWaktu(X.ekstrakLewatOpenRouter, pdf, 5000),
  )
  cek('ulang plugin: 2 panggilan (dengan lalu tanpa plugin), hasil benar', permintaan.length === 2 && !!JSON.parse(permintaan[0].init.body).plugins && !JSON.parse(permintaan[1].init.body).plugins && r1.classification === 'NOT_RELEVANT')
  cek('ulang plugin: 2 catatan percobaan', tercatat.length === 2)
  cek('percobaan 1: ERROR AI_UNAVAILABLE, pdfEngine native', tercatat[0]?.status === 'ERROR' && tercatat[0]?.errorCode === 'AI_UNAVAILABLE' && tercatat[0]?.params.pdfEngine === 'native')
  cek('percobaan 2: OK, tanpa plugin, servedModel/id/token tercatat', tercatat[1]?.status === 'OK' && tercatat[1]?.params.pdfEngine === undefined && tercatat[1]?.servedModel === 'anthropic/claude-sonnet-4.5' && tercatat[1]?.providerRequestId === 'gen-ok-1' && tercatat[1]?.pemakaian.inputTokens === 1200 && tercatat[1]?.pemakaian.outputTokens === 80)
  // PRD-005 E5 Step 3: kontrak ekstraksi v2 (prompt & skema) — versi tercatat mengikuti konstanta kode.
  cek('identitas prompt: id/versi/hash & skema', tercatat.every((m) => m.promptId === 'vessel-call-extract' && m.promptVersion === '2' && m.promptVersion === X.VERSI_PROMPT_INTAKE && /^[0-9a-f]{64}$/.test(m.promptHash) && m.schemaId === 'isi_intake_kunjungan' && m.schemaVersion === '2' && m.schemaVersion === X.VERSI_SKEMA_INTAKE && m.provider === 'OPENROUTER'))
  cek('hash prompt = sha256(system prompt + skema tool) — stabil', tercatat[0].promptHash === X.HASH_PROMPT_INTAKE)
  cek('requestedModel tanpa konteks model = SPK_MODEL', tercatat.every((m) => m.requestedModel === OR.SPK_MODEL))
  const semuaCatatan = JSON.stringify(tercatat)
  cek('catatan TANPA dokumen / nama berkas / respons / kunci API / prompt', !/SENTINEL-DOKUMEN|SENTINEL-NAMA-BERKAS|SENTINEL-RESPON|SENTINEL-KUNCI|Anda membaca|JVBERi/.test(semuaCatatan))

  // 5c. usage hilang / rusak → null, alur tetap jalan
  for (const [label, extra] of [['hilang', { usage: undefined }], ['rusak', { usage: { prompt_tokens: 'banyak', completion_tokens: -5 } }], ['bukan objek', { usage: 'x' }]]) {
    const c = []
    stub = () => sukses(extra)
    const r = await PR.jalankanDenganKonteks({ model: null, kemampuan: null, catat: (m) => c.push(m) }, () => X.ekstrakDenganBatasWaktu(X.ekstrakLewatOpenRouter, teksMasukan, 5000))
    cek(`usage ${label}: token null, ekstraksi tetap berhasil`, r.classification === 'NOT_RELEVANT' && c.length === 1 && c[0].pemakaian.inputTokens === null && c[0].pemakaian.outputTokens === null)
  }

  // 5d. timeout → AI_TIMEOUT, percobaan TIMEOUT
  const t = []
  stub = (_u, init) =>
    new Promise((_, tolak) => init.signal?.addEventListener('abort', () => tolak(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true }))
  // Timer AbortSignal.timeout tak menahan event loop; di server selalu ada kerja lain — di skrip, tahan manual.
  const jaga = setInterval(() => {}, 1000)
  const eT = await PR.jalankanDenganKonteks({ model: null, kemampuan: null, catat: (m) => t.push(m) }, () => X.ekstrakDenganBatasWaktu(X.ekstrakLewatOpenRouter, teksMasukan, 60)).catch((e) => e)
  await tunggu(50)
  clearInterval(jaga)
  cek('timeout: GalatEkstraksi AI_TIMEOUT (pemetaan lama)', eT?.kode === 'AI_TIMEOUT')
  cek('timeout: percobaan tercatat TIMEOUT', t.length === 1 && t[0].status === 'TIMEOUT' && t[0].errorCode === 'AI_TIMEOUT')

  // 5e. galat penyedia → pesan penyedia tidak bocor
  const g = []
  stub = () => jawab({ error: { message: 'RAHASIA-PENYEDIA upstream overloaded' } }, 503)
  const eG = await PR.jalankanDenganKonteks({ model: null, kemampuan: null, catat: (m) => g.push(m) }, () => X.ekstrakDenganBatasWaktu(X.ekstrakLewatOpenRouter, teksMasukan, 5000)).catch((e) => e)
  cek('galat penyedia → AI_UNAVAILABLE, pesan penyedia tak bocor ke galat maupun catatan', eG?.kode === 'AI_UNAVAILABLE' && !String(eG?.message).includes('RAHASIA') && !JSON.stringify(g).includes('RAHASIA'))

  // 5f. respons tanpa tool call → AI_BAD_RESPONSE; percobaan tetap OK (penyedia menjawab)
  const bd = []
  stub = () => jawab({ choices: [{ message: { content: 'x' } }] })
  const eB = await PR.jalankanDenganKonteks({ model: null, kemampuan: null, catat: (m) => bd.push(m) }, () => X.ekstrakDenganBatasWaktu(X.ekstrakLewatOpenRouter, teksMasukan, 5000)).catch((e) => e)
  cek('respons rusak → AI_BAD_RESPONSE, percobaan OK tercatat', eB?.kode === 'AI_BAD_RESPONSE' && bd.length === 1 && bd[0].status === 'OK')

  // 5g. model eksplisit terverifikasi + kemampuan
  const ok = MC.resolusiModelIntake({ TAH_INTAKE_MODEL: 'anthropic/claude-sonnet-4.5' })
  const e = []
  stub = () => sukses()
  permintaan.length = 0
  await PR.jalankanDenganKonteks({ model: ok.model, kemampuan: ok.kemampuan, catat: (m) => e.push(m) }, () => X.ekstrakDenganBatasWaktu(X.ekstrakLewatOpenRouter, teksMasukan, 5000))
  const be = JSON.parse(permintaan[0].init.body)
  cek('model eksplisit: badan memakai model itu, temperature 0 (didukung)', be.model === 'anthropic/claude-sonnet-4.5' && be.temperature === 0 && e[0].requestedModel === 'anthropic/claude-sonnet-4.5')
  permintaan.length = 0
  const tanpaSuhu = { acceptsTemperature: false, supportsForcedToolChoice: true, supportsPdfNative: false }
  await PR.jalankanDenganKonteks({ model: 'vendor/tanpa-suhu', kemampuan: tanpaSuhu }, () => X.ekstrakDenganBatasWaktu(X.ekstrakLewatOpenRouter, pdf, 5000))
  const bs = JSON.parse(permintaan[0].init.body)
  cek('model tanpa temperature: temperature tak dikirim; PDF native dimatikan', !('temperature' in bs) && bs.plugins === undefined && permintaan.length === 1)
  permintaan.length = 0
  const eF = await PR.jalankanDenganKonteks({ model: 'vendor/tanpa-tool', kemampuan: { acceptsTemperature: true, supportsForcedToolChoice: false, supportsPdfNative: true } }, () => X.ekstrakDenganBatasWaktu(X.ekstrakLewatOpenRouter, teksMasukan, 5000)).catch((err) => err)
  cek('model tanpa tool paksa: gagal AI_UNAVAILABLE TANPA panggilan jaringan', eF?.kode === 'AI_UNAVAILABLE' && permintaan.length === 0)
}

// =====================================================================
bagian('6. PENGEKSTRAK PALSU — deterministik, tanpa jaringan')
{
  const F = muat('src/services/intake/fake-extractor.ts')
  const penanda = (o, awalan = 'FAKE-AI') => `[[${awalan}:${Buffer.from(JSON.stringify(o)).toString('base64url')}]]`
  const out = { classification: 'NEW_NOMINATION', vessels: [], cargoes: [] }
  permintaan.length = 0
  const c = []
  const r = await PR.jalankanDenganKonteks({ model: null, kemampuan: null, catat: (m) => c.push(m) }, () => F.ekstrakPalsu({ kind: 'TEXT', text: penanda(out, 'FAKE-AI-RETRY') }, new AbortController().signal))
  cek('RETRY: hasil JSON benar & 2 percobaan (ERROR lalu OK)', r.classification === 'NEW_NOMINATION' && c.length === 2 && c[0].status === 'ERROR' && c[1].status === 'OK')
  cek('RETRY: percobaan 1 dengan plugin, 2 tanpa (meniru jalur sungguhan)', c[0].params.pdfEngine === 'native' && c[1].params.pdfEngine === undefined)
  cek('palsu: provider FAKE, metadata deterministik', c.every((m) => m.provider === 'FAKE') && c[1].servedModel === 'fake/deterministic' && c[1].pemakaian.inputTokens === 120)
  const c2 = []
  const eT = await PR.jalankanDenganKonteks({ model: 'anthropic/claude-sonnet-4.5', kemampuan: null, catat: (m) => c2.push(m) }, () => F.ekstrakPalsu({ kind: 'TEXT', text: '[[FAKE-AI:TIMEOUT]]' }, new AbortController().signal)).catch((e) => e)
  cek('palsu TIMEOUT: galat AI_TIMEOUT + percobaan TIMEOUT; requestedModel dari konteks', eT?.kode === 'AI_TIMEOUT' && c2[0]?.status === 'TIMEOUT' && c2[0]?.requestedModel === 'anthropic/claude-sonnet-4.5')
  let lempar = null
  try {
    await F.ekstrakPalsu({ kind: 'TEXT', text: penanda(out) }, new AbortController().signal)
  } catch (e) {
    lempar = e
  }
  cek('palsu di luar konteks: perilaku lama (tanpa galat, pelaporan no-op)', lempar === null)
  cek('palsu: tak ada panggilan jaringan', permintaan.length === 0)
}

// =====================================================================
bagian('7. GERBANG MODEL (Q4) — requireIntake')
{
  const A = muat('src/services/intake/intake-access.ts')
  const ID = 'cmtahledgeraaaaaaaaaaaaaa'
  const ctx = { tenantId: ID, userId: 'u1', role: 'ADMIN' }
  const env0 = { ...process.env }
  const pasang = (model) => {
    process.env.AUTOMATION_MONITORING_ENABLED = 'true'
    process.env.AUTOMATION_TENANT_IDS = ID
    process.env.VESSEL_CALL_INTAKE_ENABLED = 'true'
    process.env.VESSEL_CALL_INTAKE_EXTRACTOR = 'FAKE'
    process.env.OPENROUTER_SPK_MODEL = 'anthropic/legacy-probe'
    if (model === undefined) delete process.env.TAH_INTAKE_MODEL
    else process.env.TAH_INTAKE_MODEL = model
  }
  const coba = (model) => {
    pasang(model)
    try {
      A.requireIntake(ctx)
      return { ok: true, akses: A.bolehAksesIntake(ctx), m: A.modelIntake() }
    } catch (e) {
      return { ok: false, code: e?.details?.code ?? null, status: e?.status, akses: A.bolehAksesIntake(ctx), m: A.modelIntake() }
    }
  }
  const tak = coba(undefined)
  cek('tak diset → intake tersedia, mode LEGACY (model null = bawaan klien)', tak.ok && tak.akses && tak.m.mode === 'LEGACY' && tak.m.model === null)
  const kosong = coba('')
  cek('kosong "" → sama dengan tak diset (LEGACY)', kosong.ok && kosong.m.mode === 'LEGACY')
  const ver = coba('anthropic/claude-sonnet-4.5')
  cek('diset ke VERIFIED → tersedia, EXPLICIT', ver.ok && ver.m.mode === 'EXPLICIT' && ver.m.model === 'anthropic/claude-sonnet-4.5')
  for (const [label, v] of [['PENDING_SPIKE (sonnet-5)', 'anthropic/claude-sonnet-5'], ['tak dikenal', 'openai/gpt-4o'], ['slug tak sah', 'Bukan Slug!']]) {
    const x = coba(v)
    cek(`diset ${label} → 404 MODEL_TIDAK_TERVERIFIKASI, menu tersembunyi, TANPA fallback ke OPENROUTER_SPK_MODEL`, !x.ok && x.status === 404 && x.code === 'MODEL_TIDAK_TERVERIFIKASI' && x.akses === false && x.m.aktif === false && !('model' in x.m))
  }
  const peran = (() => {
    pasang('anthropic/claude-sonnet-5')
    try {
      A.requireIntake({ tenantId: 'cmtahledgerbbbbbbbbbbbbbb', userId: 'u2', role: 'ADMIN' })
      return 'lolos'
    } catch (e) {
      return e?.details?.code ?? `status-${e?.status}`
    }
  })()
  cek('tenant di luar allowlist tak pernah melihat kode konfigurasi (NOT_FOUND polos)', peran !== 'MODEL_TIDAK_TERVERIFIKASI' && peran !== 'lolos', peran)
  for (const k of Object.keys(process.env)) if (!(k in env0)) delete process.env[k]
  Object.assign(process.env, env0)
}

// =====================================================================
stub = null
const keJaringan = permintaan.filter((p) => !p.url.startsWith('https://openrouter.ai/'))
cek('tak ada permintaan jaringan di luar stub (semua panggilan berakhir di stub)', keJaringan.length === 0)
globalThis.fetch = ASLI_FETCH
delete process.env.OPENROUTER_API_KEY

console.log(`\n${gagal === 0 ? '✅ SEMUA LULUS' : '❌ ADA YANG GAGAL'} — lulus ${lulus}, gagal ${gagal}`)
process.exit(gagal === 0 ? 0 : 1)
