// Uji LURING harness spike Phase 0 — PRD-005 Step 3C. NOL panggilan penyedia sungguhan.
//
// Jalankan:  node prisma/check-spike-harness.mjs
//            [TEST_SPIKE_DATABASE_URL=postgresql://…@localhost/…]  → juga uji bukti AgentRun di DB lokal
//
// OpenRouter DISTUB: stub membaca badan permintaan (model, temperature, plugin, jenis isi) dan
// meniru skenario penyedia. Respons stub SENGAJA memuat nilai sentinel dokumen — laporan harness
// tak boleh memuatnya. `globalThis.fetch` sungguhan diganti jebakan: panggilan apa pun = gagal.

import { SENTINEL, kasusPhase0 } from './fixtures/spike-intake/phase0-cases.mjs'
import {
  ALLOWLIST,
  BATAS,
  FRASA_OTORISASI,
  MODEL_KANDIDAT,
  MODEL_KONTROL,
  URL_OPENROUTER,
  buatPencegat,
  jalankanPhase0,
  kategoriGalat,
  periksaPrasyarat,
  pindaiPrivasi,
} from './spike-model-compat.mjs'

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

let jaringanNyata = 0
globalThis.fetch = async () => {
  jaringanNyata++
  throw new Error('JARINGAN_DILARANG_DALAM_UJI')
}
const kunciAsli = process.env.OPENROUTER_API_KEY
cek('OPENROUTER_API_KEY tidak diset saat uji dimulai', !kunciAsli)

const HARI = new Date('2026-09-24T02:00:00.000Z')
const { C1, C2 } = kasusPhase0(HARI)
const ENV = { SPIKE_AUTHORIZED: FRASA_OTORISASI, NODE_ENV: 'development' }

const argC1 = {
  classification: 'NEW_NOMINATION',
  vessels: [{ name: `MV ${SENTINEL} OCEAN`, imo: '9999993', mmsi: '990012345', callSign: 'SNTL9', vesselType: 'Bulk Carrier' }],
  principalName: `PT ${SENTINEL} Shipping Lines`,
  portName: 'Samarinda',
  portUnlocode: 'IDSRI',
  eta: C1.harap.eta,
  cargoes: [{ name: 'Batubara', quantity: 55000, unit: 'MT', operation: 'LOAD' }],
  clientReference: `${SENTINEL}/NOM/001`,
  contact: { name: `Budi ${SENTINEL}`, email: `budi.${SENTINEL.toLowerCase()}@contoh.invalid`, phone: `+62-811-0000-${SENTINEL}` },
}
const argC2 = {
  classification: 'NEW_APPOINTMENT',
  vessels: [
    { name: `TB ${SENTINEL} PERKASA 1`, callSign: 'YDSN1', role: 'TUG' },
    { name: `BG ${SENTINEL} JAYA 301`, role: 'BARGE' },
  ],
  principalName: `PT ${SENTINEL} Samudera`,
  portName: 'Balikpapan',
  portUnlocode: 'IDBPN',
  eta: C2.harap.eta,
  etd: C2.baris.find((b) => b.startsWith('ETD')).split(': ')[1],
  agencyType: 'FULL',
  cargoes: [{ name: 'Batubara', quantity: 7500, unit: 'MT', operation: 'DISCHARGE' }],
}

/** Stub OpenRouter yang dapat dikonfigurasi. */
function stub(o = {}) {
  const cfg = { kontrol: 'ok', s5: 'ok', suhu: 'ok', plugin: 'ok', usage: true, ...o }
  const panggilan = []
  const jawab = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } })
  const fn = async (url, init) => {
    const body = JSON.parse(init.body)
    const pdf = Array.isArray(body.messages?.[1]?.content) && body.messages[1].content.some((p) => p.type === 'file')
    panggilan.push({ url, model: body.model, suhu: 'temperature' in body, plugin: !!body.plugins, tool: body.tool_choice?.function?.name, pdf })
    if (body.model === MODEL_KONTROL && cfg.kontrol === '401') return jawab({ error: { message: `No auth credentials ${SENTINEL}` } }, 401)
    if (body.model === MODEL_KANDIDAT) {
      if (cfg.s5 === '404') return jawab({ error: { message: 'anthropic/claude-sonnet-5 is not a valid model ID' } }, 404)
      if (cfg.s5 === 'tool') return jawab({ error: { message: 'tool_choice forcing tool use is not supported when thinking is enabled' } }, 400)
      if (cfg.suhu === 'tolak' && 'temperature' in body) return jawab({ error: { message: `temperature: sampling parameters are not supported for this model (${SENTINEL})` } }, 400)
      if (cfg.s5 === 'server') return jawab({ error: { message: 'upstream error' } }, 502)
    }
    if (pdf && body.plugins && cfg.plugin === 'tolak') return jawab({ error: { message: 'file-parser engine native not supported for this model' } }, 400)
    const served = body.model === MODEL_KANDIDAT && cfg.s5 === 'served' ? MODEL_KONTROL : body.model
    const args = pdf ? argC2 : argC1
    const pesan = body.model === MODEL_KANDIDAT && cfg.s5 === 'notool'
      ? { content: `Saya membaca dokumen ${SENTINEL}` }
      : { content: `ringkas ${SENTINEL}`, tool_calls: [{ function: { name: 'isi_intake_kunjungan', arguments: JSON.stringify(args) } }] }
    return jawab({
      id: `gen-${panggilan.length}`,
      model: served,
      usage: cfg.usage ? { prompt_tokens: pdf ? 4200 : 1800, completion_tokens: 350, total_tokens: pdf ? 4550 : 2150, cost: 0.0123 } : undefined,
      choices: [{ finish_reason: pesan.tool_calls ? 'tool_calls' : 'stop', message: pesan }],
    })
  }
  return { fn, panggilan }
}

async function jalan(o, env = ENV) {
  const s = stub(o)
  const log = []
  const laporan = await jalankanPhase0({ env, fetchAsli: s.fn, log: (t) => log.push(t), hariIni: HARI })
  return { laporan, panggilan: s.panggilan, log }
}
const idProbe = (l) => l.probe.map((p) => p.id).join(',')

// =====================================================================
bagian('1. Kategori galat (teks → kategori saja)')
for (const [s, m, k] of [
  [404, 'x', 'MODEL_NOT_FOUND'],
  [400, 'anthropic/claude-sonnet-5 is not a valid model ID', 'MODEL_NOT_FOUND'],
  [400, 'temperature is not supported when thinking is enabled', 'TEMPERATURE'],
  [400, 'tool_choice forcing is not supported with thinking', 'TOOL_CHOICE'],
  [400, 'extended thinking requires budget', 'THINKING'],
  [400, 'file-parser engine native unsupported', 'PLUGIN'],
  [401, 'x', 'AUTH'],
  [402, 'x', 'CREDIT'],
  [429, 'x', 'RATE_LIMIT'],
  [503, 'x', 'PROVIDER_SERVER'],
  [400, 'something else', 'OTHER'],
]) cek(`${s} "${m.slice(0, 40)}" → ${k}`, kategoriGalat(s, m) === k)

// =====================================================================
bagian('2. Prasyarat & pagar')
cek('tanpa frasa otorisasi → ditolak', periksaPrasyarat({}, { langsung: false }).length > 0)
cek('NODE_ENV=production → ditolak', periksaPrasyarat({ ...ENV, NODE_ENV: 'production' }, { langsung: false }).some((g) => /production/.test(g)))
cek('langsung tanpa SPIKE_OPENROUTER_API_KEY → ditolak', periksaPrasyarat(ENV).some((g) => /SPIKE_OPENROUTER_API_KEY/.test(g)))
cek('langsung dengan OPENROUTER_API_KEY di shell → ditolak (cegah kunci produksi)', periksaPrasyarat({ ...ENV, SPIKE_OPENROUTER_API_KEY: 'k', OPENROUTER_API_KEY: 'p' }).some((g) => /OPENROUTER_API_KEY/.test(g)))
cek('SPIKE_DATABASE_URL non-lokal → ditolak', periksaPrasyarat({ ...ENV, SPIKE_DATABASE_URL: 'postgresql://u@db.contoh.com/x' }, { langsung: false }).some((g) => /localhost/.test(g)))
cek('lengkap (langsung, kunci uji saja, DB lokal) → lolos', periksaPrasyarat({ ...ENV, SPIKE_OPENROUTER_API_KEY: 'k', SPIKE_DATABASE_URL: 'postgresql://u@127.0.0.1:5432/x' }).length === 0)
const ditolak = await jalankanPhase0({ env: {}, fetchAsli: stub().fn })
cek('harness tanpa otorisasi → DITOLAK_PRASYARAT, 0 panggilan', ditolak.verdict === 'DITOLAK_PRASYARAT' && ditolak.panggilanNyata === 0)
cek('allowlist tepat 2 slug', JSON.stringify(ALLOWLIST) === JSON.stringify(['anthropic/claude-sonnet-4.5', 'anthropic/claude-sonnet-5']))
cek('batas Phase 0: total 5, Sonnet 4.5 ≤ 1, Sonnet 5 ≤ 4, 100k/15k token', BATAS.total === 5 && BATAS.perModel[MODEL_KONTROL] === 1 && BATAS.perModel[MODEL_KANDIDAT] === 4 && BATAS.inputTokens === 100_000 && BATAS.outputTokens === 15_000)

bagian('3. Pencegat — batas DITEGAKKAN SEBELUM panggilan')
{
  const s = stub()
  const { pencegat, keadaan } = buatPencegat(s.fn)
  const kirim = (model, url = URL_OPENROUTER) => pencegat(url, { method: 'POST', body: JSON.stringify({ model, messages: [{ role: 'user', content: 'x' }] }) }).then(() => 'ok', (e) => e.message)
  cek('host lain → ditolak tanpa panggilan', (await kirim(MODEL_KANDIDAT, 'https://api.contoh.com/v1')) === 'SPIKE_HOST_TIDAK_DIIZINKAN' && s.panggilan.length === 0)
  cek('model di luar allowlist → ditolak tanpa panggilan', (await kirim('openai/gpt-4o')) === 'SPIKE_MODEL_TIDAK_DIIZINKAN' && s.panggilan.length === 0)
  cek('Sonnet 4.5 panggilan ke-1 → dikirim', (await kirim(MODEL_KONTROL)) === 'ok')
  cek('Sonnet 4.5 panggilan ke-2 → DITOLAK sebelum dikirim', (await kirim(MODEL_KONTROL)) === 'SPIKE_BATAS_PANGGILAN' && s.panggilan.length === 1)
  for (let i = 0; i < 4; i++) await kirim(MODEL_KANDIDAT)
  cek('Sonnet 5: 4 dikirim, ke-5 DITOLAK sebelum dikirim; total nyata = 5', (await kirim(MODEL_KANDIDAT)) === 'SPIKE_BATAS_PANGGILAN' && s.panggilan.length === 5 && keadaan.total === 5)
  const s2 = stub()
  const p2 = buatPencegat(async (u, i) => {
    const r = await s2.fn(u, i)
    const j = await r.json()
    j.usage = { prompt_tokens: 60_000, completion_tokens: 100 }
    return new Response(JSON.stringify(j), { status: r.status })
  })
  const k2 = (m) => p2.pencegat(URL_OPENROUTER, { method: 'POST', body: JSON.stringify({ model: m, messages: [] }) }).then(() => 'ok', (e) => e.message)
  await k2(MODEL_KANDIDAT)
  await k2(MODEL_KANDIDAT)
  cek('batas token input 100k: panggilan ke-3 DITOLAK sebelum dikirim', (await k2(MODEL_KANDIDAT)) === 'SPIKE_BATAS_TOKEN' && s2.panggilan.length === 2)
}

// =====================================================================
bagian('4. Alur Phase 0 — setiap cabang')
{
  const { laporan: l, panggilan: c } = await jalan({})
  cek('S1 semua lulus → READY_FOR_PHASE_1_OWNER_REVIEW', l.verdict === 'READY_FOR_PHASE_1_OWNER_REVIEW', l.alasan)
  cek('S1 urutan P0.1,P0.2,P0.4 (P0.3 tak perlu); 3 panggilan', idProbe(l) === 'P0.1,P0.2,P0.4' && c.length === 3)
  cek('S1 P0.2 = bentuk SEKARANG persis: temperature 0 + tool paksa', c[1].model === MODEL_KANDIDAT && c[1].suhu && c[1].tool === 'isi_intake_kunjungan')
  cek('S1 validasi & kebenaran-dasar C1 lulus', l.probe[1].validasi?.lulus && Object.values(l.probe[1].kebenaran).every(Boolean), JSON.stringify(l.probe[1].kebenaran))
  cek('S1 P0.4 PDF dengan plugin native, kebenaran C2 (tug+barge, IDBPN) lulus', c[2].pdf && c[2].plugin && Object.values(l.probe[2].kebenaran).every(Boolean), JSON.stringify(l.probe[2].kebenaran))
  cek('S1 temperature diterima → kandidat "TIDAK_TERBEDAKAN" (jujur: bisa dibuang diam-diam)', l.kandidatKemampuan?.acceptsTemperature === 'TIDAK_TERBEDAKAN')
  cek('S1 token & biaya tercatat per panggilan (biaya: jalur+tipe, tak diasumsikan)', l.probe.every((p) => p.percobaan.every((q) => q.promptTokens > 0 && q.biaya.ada && q.biaya.jalur === 'usage.cost')))
  cek('S1 perekam Step 3B: hash prompt, skema, model diminta/dilayani', l.probe.every((p) => p.perekam.every((m) => /^[0-9a-f]{64}$/.test(m.promptHash) && m.schemaId === 'isi_intake_kunjungan' && m.requestedModel === p.requestedModel)))
  cek('S1 mode stub: panggilan NYATA = 0, terhitung = 3', l.panggilanNyata === 0 && l.panggilanTerhitung === 3)
}
{
  const { laporan: l, panggilan: c } = await jalan({ suhu: 'tolak' })
  cek('S2 temperature ditolak → P0.3 → READY dengan kandidat acceptsTemperature:false', l.verdict === 'READY_FOR_PHASE_1_OWNER_REVIEW' && l.kandidatKemampuan?.acceptsTemperature === false && idProbe(l) === 'P0.1,P0.2,P0.3,P0.4', l.alasan)
  cek('S2 P0.3 identik kecuali temperature (tool paksa tetap)', !c[2].suhu && c[2].tool === 'isi_intake_kunjungan' && c[1].suhu)
  cek('S2 kategori P0.2 = TEMPERATURE (teks galat tak disimpan)', l.probe[1].percobaan[0].kategoriGalat === 'TEMPERATURE' && !JSON.stringify(l).includes('sampling parameters'))
  cek('S2 P0.4 juga tanpa temperature (profil kandidat); Sonnet 5 = 3 panggilan ≤ 4', !c[3].suhu && l.perModel[MODEL_KANDIDAT] === 3)
}
{
  const { laporan: l, panggilan: c } = await jalan({ suhu: 'tolak', plugin: 'tolak' })
  cek('S3 temp ditolak + plugin ditolak → fallback tanpa plugin = panggilan Sonnet 5 ke-4 (batas tepat)', l.verdict === 'READY_FOR_PHASE_1_OWNER_REVIEW' && l.perModel[MODEL_KANDIDAT] === 4 && l.probe[3].fallbackPlugin === true && c.length === 5, l.alasan)
  cek('S3 total panggilan = 5 = batas keras', l.panggilanTerhitung === 5)
}
{
  const { laporan: l, panggilan: c } = await jalan({ s5: '404' })
  cek('S4 MODEL_NOT_FOUND → BLOCKED, berhenti (tanpa P0.3/P0.4)', l.verdict === 'BLOCKED' && idProbe(l) === 'P0.1,P0.2' && c.length === 2, l.alasan)
}
{
  const { laporan: l } = await jalan({ s5: 'tool' })
  cek('S5 tool_choice/thinking → BLOCKED_FOR_CURRENT_INTAKE_PATH, berhenti', l.verdict === 'BLOCKED_FOR_CURRENT_INTAKE_PATH' && idProbe(l) === 'P0.1,P0.2', l.alasan)
}
{
  const { laporan: l } = await jalan({ s5: 'served' })
  cek('S6 model yang melayani bukan Sonnet 5 → BLOCKED_FATAL', l.verdict === 'BLOCKED_FATAL' && idProbe(l) === 'P0.1,P0.2', l.alasan)
}
{
  const { laporan: l } = await jalan({ s5: 'notool' })
  cek('S7 sukses tanpa tool call → BLOCKED_FOR_CURRENT_INTAKE_PATH', l.verdict === 'BLOCKED_FOR_CURRENT_INTAKE_PATH', l.alasan)
}
{
  const { laporan: l, panggilan: c } = await jalan({ kontrol: '401' })
  cek('S8 kontrol gagal (AUTH) → INCONCLUSIVE, Sonnet 5 TIDAK dipanggil', l.verdict === 'INCONCLUSIVE' && c.every((x) => x.model !== MODEL_KANDIDAT) && c.length === 1, l.alasan)
}
{
  const { laporan: l } = await jalan({ s5: 'server' })
  cek('S9 galat server penyedia → INCONCLUSIVE (bukan VERIFIED/BLOCKED)', l.verdict === 'INCONCLUSIVE', l.alasan)
}
{
  const { laporan: l } = await jalan({ usage: false })
  cek('S10 usage tak tersedia → tetap berjalan, dicatat usageSelaluAda=false', l.verdict === 'READY_FOR_PHASE_1_OWNER_REVIEW' && l.token.usageSelaluAda === false)
}

// =====================================================================
bagian('5. Privasi laporan & log')
{
  const { laporan: l, log } = await jalan({ suhu: 'tolak', plugin: 'tolak' })
  const teks = JSON.stringify(l) + log.join('\n')
  const temuan = pindaiPrivasi(teks, 'stub-kunci-uji-luring-000000')
  cek('laporan + log: tanpa sentinel dokumen/kontak/prompt/kunci (respons stub SENGAJA memuatnya)', temuan.length === 0, temuan.join(','))
  cek('pemindai privasi mendeteksi sentinel bila bocor', pindaiPrivasi(`x ${SENTINEL} y`).includes('SENTINEL'))
  cek('pemindai privasi mendeteksi kunci & kontak', pindaiPrivasi('k=abc123 budi@contoh.invalid', 'abc123').includes('KUNCI_API') && pindaiPrivasi('budi@contoh.invalid').includes('KONTAK'))
  cek('kunci OPENROUTER_API_KEY dipulihkan (tak diset) sesudah harness', process.env.OPENROUTER_API_KEY === undefined)
}

// =====================================================================
bagian('6. Bukti AgentRun / AgentModelCall (DB lokal, opsional)')
if (process.env.TEST_SPIKE_DATABASE_URL) {
  const { laporan: l } = await jalan({ plugin: 'tolak' }, { ...ENV, SPIKE_DATABASE_URL: process.env.TEST_SPIKE_DATABASE_URL })
  const b = l.buktiBukuBesar
  cek('bukti buku besar dijalankan', b?.dijalankan === true, JSON.stringify(b))
  cek('setiap probe = SATU AgentRun; tiap percobaan = SATU AgentModelCall', b?.run?.every((r) => r.satuRunBanyakPanggilan && r.barisModelCall === r.percobaan))
  const pdf = b?.run?.find((r) => r.probe === 'P0.4')
  cek('P0.4 (plugin ditolak → fallback): 2 AgentModelCall di bawah 1 AgentRun', pdf?.barisModelCall === 2 && pdf?.satuRunBanyakPanggilan === true, JSON.stringify(pdf))
  cek('sentinel/kontak TIDAK ada di AgentRun/AgentModelCall/AuditLog', b?.sentinelDiDb === false)
} else {
  console.log('  ⏭  dilewati (TEST_SPIKE_DATABASE_URL tidak diset)')
}

cek('tak ada panggilan jaringan nyata sepanjang uji', jaringanNyata === 0, `${jaringanNyata}`)
console.log(`\n${gagal === 0 ? '✅ SEMUA LULUS' : '❌ ADA YANG GAGAL'} — lulus ${lulus}, gagal ${gagal}`)
process.exit(gagal === 0 ? 0 : 1)
