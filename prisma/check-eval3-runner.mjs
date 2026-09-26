// Uji LURING runner Eval-3 — PRD-005 E5 Step 14 (TANPA AI, TANPA jaringan, TANPA DB).
//
// Jalankan:  node prisma/check-eval3-runner.mjs
//
// Semua respons "model" berasal dari stub/fixture GT. fetch global dipasangi penghitung yang MELEMPAR —
// bukti tak ada byte ke jaringan. Buku besar memakai toko MEMORI (semantik produksi ditiru; eksekutor
// DB nyata diuji terpisah terhadap DB loopback sekali pakai bila owner mengizinkan).
//
// Lapis: A rencana · B ikatan beku/preflight · C served · D biaya/panggilan · E otorisasi · F DB ·
// G RAW/POST · H P1 · I gerbang G1–G14 · J G13 H20 · K G14 · L buku besar · M privasi ·
// N latihan kegagalan D01–D25 · O simulasi luring · P CLI & laporan · Q integritas akhir & nol jaringan.

import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
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
// Kunci uji khusus / DB di lingkungan TIDAK dibaca, dicetak, atau dipakai uji ini.
const ENV_UJI = Object.fromEntries(Object.entries(process.env).filter(([k]) => !['SPIKE_OPENROUTER_API_KEY', 'SPIKE_DATABASE_URL', 'NODE_ENV', 'VERCEL_ENV'].includes(k)))

let panggilanJaringan = 0
globalThis.fetch = async () => {
  panggilanJaringan++
  throw new Error('JARINGAN_DILARANG_DALAM_UJI')
}

const R = await import('./spike-eval3-runner.mjs')
const E = await import('./spike-eval3-penilai.mjs')
const B = await import('./spike-eval3-beku.mjs')
const B2 = await import('./spike-eval2-beku.mjs')
const R2 = await import('./spike-eval2-runner.mjs')
const F = await import('./fixtures/spike-intake/eval3-cases.mjs')
const H = await import('./spike-eval1.mjs')
const S = await import('./spike-eval1-scorer.mjs')
const require = createRequire(import.meta.url)
const jiti = require('jiti')(fileURLToPath(import.meta.url), { alias: { '@': join(AKAR, 'src') }, interopDefault: true })
const P = jiti(join(AKAR, 'src/services/intake/intake-policy.ts'))
const V = jiti(join(AKAR, 'src/lib/vessels.ts'))
const X = jiti(join(AKAR, 'src/lib/ai/vessel-call-extract.ts'))
const NORM = { namaKapal: P.normalisasiNamaKapal, namaPort: P.normalisasiNamaPort, namaPihak: P.normalisasiNamaPihak, unlocode: P.normalisasiUnlocode, imo: V.normalisasiImo, mmsi: V.normalisasiMmsi, callSign: V.normalisasiCallSign }
const HARI = new Date('2026-09-26T00:00:00Z')
const KASUS = F.bangunKasusEval3(HARI).map((k) => ({ ...k, teksNormal: P.normalisasiTeksSumber(k.teks) }))
const K = Object.fromEntries(KASUS.map((k) => [k.id, k]))
const IDS = KASUS.map((k) => k.id)
const S5 = H.MODEL_S5
const S45 = H.MODEL_S45
const OFFSET = { S45_KONTROL_V3: 0, S5_RUN1_V3: 36, S5_RUN2_V3: 72 }
const SEQ = (blok, id) => OFFSET[blok] + IDS.indexOf(id) + 1
const KUNCI_PALSU = 'kunci-uji-palsu-eval3-bukan-kunci-nyata-0000'
const DB_PALSU = 'postgresql://pengguna@127.0.0.1:1/eval3_uji_palsu'
const ENV_LIVE = { ...ENV_UJI, SPIKE_AUTHORIZED: R.FRASA_OTORISASI_EVAL3, SPIKE_OPENROUTER_API_KEY: KUNCI_PALSU, SPIKE_DATABASE_URL: DB_PALSU }
const tokoOk = () => R.buatTokoLedgerMemori()
const PROV = R.PROVENANS_PLAFON_EVAL3
const karakterV3 = X.SYSTEM_PROMPT_INTAKE.length + 1 + JSON.stringify(X.TOOL_INTAKE).length
const dokMaks = Math.max(...KASUS.map((k) => k.teks.length))
const PLAFON = R.plafonRunEval3(PROV, { hashPromptV3: X.HASH_PROMPT_INTAKE, karakterPromptV3: karakterV3, dokumenEval3Maks: dokMaks })
/** Hitung ulang INDEPENDEN (bukan fungsi runner) dari provenans tersanitasi. */
const hitungIndependen = (pv) => Math.ceil(Math.max(pv.biaya.maksSonnet45Usd, pv.biaya.maksSonnet5Usd, pv.biaya.pasanganLedgerUsd) * Math.max(1, (pv.masukan.karakterPromptV3 + pv.masukan.karakterDokumenEval3Maks) / (pv.masukan.karakterPromptV2 + pv.masukan.karakterDokumenEval2Min)) * 1e6) / 1e6
/** Salinan provenans dengan mutasi pada jalur `g.k` (`hapus` = buang field). */
const mutasiProv = (g, k, v, hapus = false) => {
  const x = structuredClone(PROV)
  const o = g ? x[g] : x
  if (hapus) delete o[k]
  else o[k] = v
  return x
}

/** Offline: stub bawaan runner, G12 disuntik, buku besar memori. */
const jalan = (o = {}) => R.jalankanRunnerEval3({ mode: 'offline', env: ENV_UJI, hariIni: HARI, g12Uji: true, ledgerUji: tokoOk, ...o })
/** Live TEST_DOUBLE: transport penghitung (stub) — bukti jumlah panggilan transport. */
function jalanLive(o = {}, { jawab, opsi } = {}) {
  const t = R.buatPenyediaStubEval3(KASUS, jawab, opsi)
  return { t, p: R.jalankanRunnerEval3({ mode: 'live', env: ENV_LIVE, hariIni: HARI, g12Uji: true, ledgerUji: tokoOk, transportUji: t.fn, ...o }) }
}
/** Jawaban sempurna, lalu diubah pada (blok, kasus) tertentu. `ubah(o, k)` mengembalikan objek baru atau memodifikasi `o`. */
function jawabDengan(peta) {
  return (k, model, n) => {
    const o = R.jawabanSempurnaEval3(k)
    const f = peta[n]
    return f ? f(o, k) ?? o : o
  }
}
const put = (l, a) => l.putusan?.[a]?.verdict
const slotDari = (l, blok, id) => l.__slotMemori.find((s) => s.blok === blok && s.kasus.id === id)

// ============================================================================ A
bagian('A. Rencana eksekusi (kontrol S4.5 v3 36×1 · kandidat S5 v3 36×2 · buku besar S5 2 · 110/125)')
const rencana = E.susunRencanaEval3()
const hitungBlok = (b) => rencana.filter((r) => r.blok === b)
cek('A1 rencana 110 slot, seq 1..110 berurutan', rencana.length === 110 && rencana.every((r, i) => r.seq === i + 1))
cek('A2 kontrol S45_KONTROL_V3 = 36 × Sonnet 4.5, H01..H36', hitungBlok('S45_KONTROL_V3').length === 36 && hitungBlok('S45_KONTROL_V3').every((r) => r.model === S45) && JSON.stringify(hitungBlok('S45_KONTROL_V3').map((r) => r.kasus)) === JSON.stringify(IDS))
cek('A3 kandidat S5_RUN1_V3 + S5_RUN2_V3 = 2 × 36 × Sonnet 5', ['S5_RUN1_V3', 'S5_RUN2_V3'].every((b) => hitungBlok(b).length === 36 && hitungBlok(b).every((r) => r.model === S5)))
cek('A4 buku besar LEDGER_E2E_S5 = 2 × Sonnet 5, kasus beku H07 + H22', JSON.stringify(hitungBlok('LEDGER_E2E_S5').map((r) => [r.model, r.kasus])) === JSON.stringify([[S5, 'H07'], [S5, 'H22']]))
cek('A5 BATAS_EVAL3 = beku (110 / maks 125 / lunak 2,70 / keras 3,00 / token 650k/60k)', JSON.stringify(R.BATAS_EVAL3) === JSON.stringify({ rencana: 110, maksPanggilan: 125, biayaLunakUsd: 2.7, biayaKerasUsd: 3.0, tokenInput: 650000, tokenOutput: 60000 }))
cek('A6 validasiRencanaEval3(rencana beku) = sah', E.validasiRencanaEval3(rencana, { allowlist: H.ALLOWLIST }).length === 0)
const Lsempurna = await jalan()
const perModel = (l, m) => l.akuntansi.perPanggilan.filter((p) => p.model === m).length
cek('A7 run sempurna: 110 panggilan transport (36 S4.5 + 74 S5), 0 ulang, 0 ditolak', Lsempurna.panggilanTransport === 110 && perModel(Lsempurna, S45) === 36 && perModel(Lsempurna, S5) === 74 && Lsempurna.akuntansi.percobaanUlang === 0 && Lsempurna.akuntansi.percobaanDitolakSebelumTransport === 0)
cek('A8 run sempurna: kedua putusan PASS; label DRY_RUN; panggilanNyata 0', put(Lsempurna, 'PROMPT_V3_PRODUKSI') === 'PASS' && put(Lsempurna, 'KANDIDAT_S5') === 'PASS' && Lsempurna.label === R.LABEL_DRY && Lsempurna.panggilanNyata === 0)

// ============================================================================ B
bagian('B. Ikatan beku & preflight (GT hash · SHA · jumlah kasus · Prompt v3 · rencana · gerbang) — galat → 0 panggilan')
cek('B1 verifikasiBekuEval3() = [] (gt-1)', B.verifikasiBekuEval3().length === 0)
const identitasNyata = { idPrompt: X.ID_PROMPT_INTAKE, versiPrompt: X.VERSI_PROMPT_INTAKE, versiSkema: X.VERSI_SKEMA_INTAKE, hashPrompt: X.HASH_PROMPT_INTAKE }
cek('B2 identitas Prompt v3 NYATA terikat (id/versi 3/skema 3/hash 8e326ac4…)', B.verifikasiIkatanPromptEval3(identitasNyata).length === 0 && X.HASH_PROMPT_INTAKE.startsWith('8e326ac4'))
cek('B3 laporan memuat ikatan: hash GT, SHA fixture, ikatan prompt', Lsempurna.hashGt === B.HASH_GT_BEKU_EVAL3 && Lsempurna.shaFixture === B.SHA_BERKAS_BEKU_EVAL3 && JSON.stringify(Lsempurna.ikatanPrompt) === JSON.stringify(identitasNyata))
cek('B4 konfigurasi gerbang beku = implementasi (G1–G14, G2S, G9R)', E.validasiKonfigurasiGerbang().length === 0)
{
  const modTambah = { ...F, GERBANG_EVAL3: { ...F.GERBANG_EVAL3, G15: { keras: true } } }
  const { t, p } = jalanLive({ modGerbangUji: modTambah })
  const l = await p
  cek('B5 gerbang beku bertambah (G15 tanpa implementasi) → DITOLAK_GERBANG, 0 panggilan', l.verdict === 'DITOLAK_GERBANG' && t.jumlah() === 0, l.galat.join(','))
  const { G14: _, ...tanpa14 } = F.GERBANG_EVAL3
  const { t: t2, p: p2 } = jalanLive({ modGerbangUji: { ...F, GERBANG_EVAL3: tanpa14 } })
  const l2 = await p2
  cek('B6 gerbang beku kehilangan G14 → DITOLAK_GERBANG, 0 panggilan', l2.verdict === 'DITOLAK_GERBANG' && t2.jumlah() === 0, l2.galat.join(','))
}
{
  const kasus35 = F.bangunKasusEval3(HARI).slice(0, 35)
  const { t, p } = jalanLive({ kasusUji: kasus35 })
  const l = await p
  cek('B7 jumlah kasus 35 ≠ 36 → DITOLAK_KASUS, 0 panggilan', l.verdict === 'DITOLAK_KASUS' && t.jumlah() === 0, l.galat[0])
}

// ============================================================================ C
bagian('C. Served model — ketat served === requested (tanpa akhiran/awalan/alias/snapshot/fallback)')
const variasi = [`${S5}:beta`, `${S5}-20260101`, `${S5}@preview`, `${S5}-fast`, `openrouter/${S5}`, 'openrouter/auto', S45, S5.toUpperCase(), ` ${S5}`, `${S5} `, 'claude-sonnet-5', '', null, undefined]
cek('C1 modelTerlayaniPersis: identik → true', R.modelTerlayaniPersis(S5, S5) && R.modelTerlayaniPersis(S45, S45))
cek(`C2 modelTerlayaniPersis: ${variasi.length} variasi (akhiran/awalan/alias/snapshot/fallback/huruf/spasi/kosong) → false`, variasi.every((v) => !R.modelTerlayaniPersis(S5, v)))
for (const [n, served] of [['C3', `${S5}:beta`], ['C4', `${S5}-20260101`], ['C5', S45]]) {
  const { t, p } = jalanLive({}, { opsi: { served: (m, i) => (i === 40 ? served : m) } })
  const l = await p
  const s = l.__slotMemori.find((x) => x.seq === 40)
  cek(`${n} served "${served}" untuk S5 (panggilan 40) → berhenti SERVED_MODEL_BERBEDA; slot 41+ tidak dijalankan; 40 panggilan; kedua putusan FAIL`, l.berhenti === 'SERVED_MODEL_BERBEDA' && s.status === 'GAGAL:SERVED_MODEL_BERBEDA' && s.raw === null && t.jumlah() === 40 && l.__slotMemori.filter((x) => x.seq > 40).every((x) => x.status === 'TIDAK_DIJALANKAN') && put(l, 'KANDIDAT_S5') === 'FAIL' && put(l, 'PROMPT_V3_PRODUKSI') === 'FAIL' && l.operasional.servedCocok === false)
}
{
  const { t, p } = jalanLive({}, { opsi: { served: (m, i) => (i === 3 ? null : m) } })
  const l = await p
  cek('C6 served tidak dilaporkan → berhenti, slot GAGAL, 3 panggilan', ['SERVED_MODEL_BERBEDA', 'SERVED_MODEL_TIDAK_DILAPORKAN'].includes(l.berhenti) && t.jumlah() === 3 && /SERVED_MODEL/.test(l.__slotMemori[2].status), `${l.berhenti} ${l.__slotMemori[2].status}`)
}
{
  // Pagar slot (unit): larik/rute fallback, di luar slot, model beda, ulang, probe.
  const uji = async (body, slot, n = 1) => {
    let transport = 0
    const { jalur, keadaan, slotAktif } = R.rakitJalurPenyedia(async () => {
      transport++
      return new Response(JSON.stringify({ model: body.model, usage: { cost: 0.01, prompt_tokens: 1, completion_tokens: 1 }, choices: [] }), { status: 200 })
    }, R.BATAS_EVAL3, { plafonUsd: PLAFON.plafonUsd })
    Object.assign(slotAktif, slot)
    let galat = null
    for (let i = 0; i < n; i++) await jalur(H.URL_OPENROUTER, { body: JSON.stringify(body) }).catch((e) => (galat = e.message))
    return { transport, galat, keadaan }
  }
  const f1 = await uji({ model: S5, models: [S5, S45] }, { model: S5 })
  cek('C7 permintaan dengan larik fallback `models` → FALLBACK_DIMINTA sebelum transport', f1.galat === 'EVAL3_FALLBACK_DIMINTA' && f1.transport === 0)
  const f2 = await uji({ model: S5, route: 'fallback' }, { model: S5 })
  cek('C8 permintaan dengan `route` → FALLBACK_DIMINTA sebelum transport', f2.galat === 'EVAL3_FALLBACK_DIMINTA' && f2.transport === 0)
  const f3 = await uji({ model: S5, provider: { allow_fallbacks: true } }, { model: S5 })
  cek('C9 provider.allow_fallbacks=true → FALLBACK_DIMINTA sebelum transport', f3.galat === 'EVAL3_FALLBACK_DIMINTA' && f3.transport === 0)
  const f4 = await uji({ model: S45 }, { model: S5 })
  cek('C10 model diminta ≠ model slot → MODEL_DIMINTA_BERBEDA sebelum transport, run berhenti', f4.galat === 'EVAL3_MODEL_DIMINTA_BERBEDA' && f4.transport === 0 && f4.keadaan.berhenti === 'MODEL_DIMINTA_BERBEDA')
  const f5 = await uji({ model: S5 }, { model: null })
  cek('C11 panggilan di luar slot → PANGGILAN_DI_LUAR_SLOT, 0 transport', f5.galat === 'EVAL3_PANGGILAN_DI_LUAR_SLOT' && f5.transport === 0)
  const f6 = await uji({ model: S5 }, { model: S5 }, 2)
  cek('C12 percobaan kedua dalam slot yang sama (ulang diam-diam) → PERCOBAAN_ULANG; transport tepat 1', f6.galat === 'EVAL3_PERCOBAAN_ULANG' && f6.transport === 1 && f6.keadaan.berhenti === 'PERCOBAAN_ULANG')
  const f7 = await uji({ model: S5 }, { model: S5, nolPanggilan: true })
  cek('C13 panggilan saat probe buku besar → PANGGILAN_SAAT_PROBE, 0 transport', f7.galat === 'EVAL3_PANGGILAN_SAAT_PROBE' && f7.transport === 0)
}

// ============================================================================ D
bagian('D. Pagar biaya & jumlah panggilan (proyeksi sebelum panggilan; keras US$3,00; lunak US$2,70; maks 125)')
// ---- C1: plafon proyeksi dari bukti Eval-2 LIVE (bukan angka pilihan)
{
  const b = PROV.bukti
  cek('D1a provenans bukti: Eval-2 LIVE terotorisasi Step 6B, sha256 laporan LENGKAP 64 hex, 80 panggilan, US$0,895423', b.sha256Laporan === '85c40044887369651cb78bc5bbc4ac4f36c13a1b4b90530cdcd8315dfe7fbcd9' && b.panggilanTerotorisasi === 80 && b.biayaTotalUsd === 0.895423 && /Step 6B/.test(b.sumber))
  cek('D1b provenans biaya: maks S4.5 0,015318 · maks S5 0,011946 · pasangan ledger 0,029487', PROV.biaya.maksSonnet45Usd === 0.015318 && PROV.biaya.maksSonnet5Usd === 0.011946 && PROV.biaya.pasanganLedgerUsd === 0.029487)
  cek('D1c provenans masukan: prompt v2 6.607 · prompt v3 9.567 · dokumen Eval-2 min 143 · dokumen Eval-3 maks 363', PROV.masukan.karakterPromptV2 === 6607 && PROV.masukan.karakterPromptV3 === 9567 && PROV.masukan.karakterDokumenEval2Min === 143 && PROV.masukan.karakterDokumenEval3Maks === 363)
  cek('D1d hitung ulang INDEPENDEN dari provenans = US$0,043379 = plafon beku', hitungIndependen(PROV) === 0.043379 && PROV.plafonUsd === 0.043379 && R.hitungPlafonDariProvenans(PROV).plafonUsd === 0.043379)
  const kanon = (v) => (v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, kanon(v[k])])) : v)
  cek('D1d2 sidik provenans dihitung ulang INDEPENDEN = sidik beku cbde9359…', createHash('sha256').update(JSON.stringify(kanon(PROV))).digest('hex') === R.SIDIK_PROVENANS_PLAFON_EVAL3 && R.SIDIK_PROVENANS_PLAFON_EVAL3.startsWith('cbde9359'))
  cek('D1e provenans terikat Prompt v3 NYATA: hash 8e326ac4… & panjang 9.567 = terukur', PROV.masukan.hashPromptV3 === X.HASH_PROMPT_INTAKE && PROV.masukan.karakterPromptV3 === karakterV3)
  cek(`D1f dokumen Eval-3 terpanjang hari uji (2026-09-26) = 363 → plafon run = plafon beku`, dokMaks === 363 && PLAFON.plafonUsd === 0.043379 && PLAFON.plafonBekuUsd === 0.043379)
  const lebihPanjang = R.plafonRunEval3(PROV, { hashPromptV3: X.HASH_PROMPT_INTAKE, karakterPromptV3: karakterV3, dokumenEval3Maks: 365 })
  const lebihPendek = R.plafonRunEval3(PROV, { hashPromptV3: X.HASH_PROMPT_INTAKE, karakterPromptV3: karakterV3, dokumenEval3Maks: 358 })
  cek('D1g hari lain: dokumen 365 → plafon NAIK; dokumen 358 → tetap plafon beku (tak pernah di bawahnya)', lebihPanjang.plafonUsd > 0.043379 && lebihPendek.plafonUsd === 0.043379, `${lebihPanjang.plafonUsd} / ${lebihPendek.plafonUsd}`)
  cek('D1h laporan memuat plafon, rumus & sha laporan sumber (tanpa isi laporan)', Lsempurna.plafonProyeksi.plafonUsd === 0.043379 && Lsempurna.plafonProyeksi.rumus === R.RUMUS_PLAFON_EVAL3 && Lsempurna.plafonProyeksi.sha256Laporan === PROV.bukti.sha256Laporan && Lsempurna.plafonProyeksi.provenansUji === false)
  const teksRunner = readFileSync(join(AKAR, 'prisma/spike-eval3-runner.mjs'), 'utf8')
  cek('D1i provenans tersanitasi: tanpa sentinel, kontak, frasa otorisasi, URL DB, pola kunci', !/KTX\d?[A-Z]{2}/.test(JSON.stringify(PROV)) && !/@|postgres|sk-or-|LIVE'/.test(JSON.stringify(PROV)) && !teksRunner.includes('eval2-live.json'.replace('.json', '-report')))
}
const jalurUji = (plafonUsd, biayaRespons = 0.01, batas = R.BATAS_EVAL3) => {
  let transport = 0
  const r = R.rakitJalurPenyedia(async (u, init) => {
    transport++
    return new Response(JSON.stringify({ model: JSON.parse(init.body).model, usage: { cost: biayaRespons, prompt_tokens: 1, completion_tokens: 1 }, choices: [] }), { status: 200 })
  }, batas, { plafonUsd })
  const panggil = async (model = S5) => {
    Object.assign(r.slotAktif, { model, percobaan: 0 })
    return r.jalur(H.URL_OPENROUTER, { body: JSON.stringify({ model }) }).then(() => null, (e) => e.message)
  }
  return { ...r, panggil, transport: () => transport }
}
{
  const u = jalurUji(PLAFON.plafonUsd)
  const g = await u.panggil()
  cek('D1ac panggilan PERTAMA: proyeksi = plafon bukti (belum ada biaya teramati), lolos', g === null && u.keadaan.proyeksiBerikutUsd === PLAFON.plafonUsd && u.keadaan.sumberProyeksi === 'PLAFON_BUKTI_EVAL2' && u.transport() === 1)
}
{
  // Lunak = keras agar yang diuji murni pagar proyeksi (dengan batas beku, lunak 2,70 berhenti lebih dulu).
  const batasKeras = { ...R.BATAS_EVAL3, biayaLunakUsd: R.BATAS_EVAL3.biayaKerasUsd }
  const u = jalurUji(PLAFON.plafonUsd, 0.01, batasKeras)
  u.keadaan.biaya = R.BATAS_EVAL3.biayaKerasUsd - PLAFON.plafonUsd - 0.000001
  const g1 = await u.panggil()
  const u2 = jalurUji(PLAFON.plafonUsd, 0.01, batasKeras)
  u2.keadaan.biaya = R.BATAS_EVAL3.biayaKerasUsd - PLAFON.plafonUsd + 0.000001
  const g2 = await u2.panggil()
  cek('D1ad dekat batas keras: biaya + plafon = 3,00 − 0,000001 → lolos; + US$0,000001 → PROYEKSI_BIAYA_KERAS sebelum transport', g1 === null && g2 === 'EVAL3_PROYEKSI_BIAYA_KERAS' && u2.transport() === 0 && u2.keadaan.berhenti === 'PROYEKSI_BIAYA_KERAS')
}
for (const [n, nama, prov, kodeHarap, sidikSah] of [
  ['D1j', 'provenans TIDAK ADA (null)', null, 'PROVENANS_TIDAK_ADA'],
  ['D1k', 'bagian provenans hilang (biaya)', mutasiProv('', 'biaya', undefined, true), 'PROVENANS_TIDAK_ADA'],
  ['D1l', 'maks historis S4.5 diubah (0,02 — hasil tak bergeser karena bukan maksimum)', mutasiProv('biaya', 'maksSonnet45Usd', 0.02), 'PROVENANS_SIDIK_BERBEDA'],
  ['D1l2', 'maks historis S5 diubah (0,012)', mutasiProv('biaya', 'maksSonnet5Usd', 0.012), 'PROVENANS_SIDIK_BERBEDA'],
  ['D1l3', 'sumber/sha laporan lain yang sah bentuknya', mutasiProv('bukti', 'sha256Laporan', 'b'.repeat(64)), 'PROVENANS_SIDIK_BERBEDA'],
  ['D1l4', 'total panggilan diubah (81)', mutasiProv('bukti', 'panggilanTerotorisasi', 81), 'PROVENANS_SIDIK_BERBEDA'],
  ['D1m', 'pasangan ledger diubah (0,03)', mutasiProv('biaya', 'pasanganLedgerUsd', 0.03), 'PLAFON_TIDAK_SESUAI_PROVENANS'],
  ['D1n', 'ukuran prompt v2 diubah (7.000)', mutasiProv('masukan', 'karakterPromptV2', 7000), 'PLAFON_TIDAK_SESUAI_PROVENANS'],
  ['D1o', 'ukuran prompt v3 diubah (9.000)', mutasiProv('masukan', 'karakterPromptV3', 9000), 'PLAFON_TIDAK_SESUAI_PROVENANS'],
  ['D1p', 'ukuran dokumen Eval-2 diubah (300)', mutasiProv('masukan', 'karakterDokumenEval2Min', 300), 'PLAFON_TIDAK_SESUAI_PROVENANS'],
  ['D1q', 'ukuran dokumen Eval-3 diubah (200)', mutasiProv('masukan', 'karakterDokumenEval3Maks', 200), 'PLAFON_TIDAK_SESUAI_PROVENANS'],
  ['D1r', 'hasil/plafon diubah (0,05)', mutasiProv('', 'plafonUsd', 0.05), 'PLAFON_TIDAK_SESUAI_PROVENANS'],
  ['D1s', 'rumus diubah', mutasiProv('', 'rumus', 'ceil6(max(...))'), 'PROVENANS_RUMUS_BERBEDA'],
  ['D1t', 'nilai NaN', mutasiProv('biaya', 'maksSonnet5Usd', NaN), 'PROVENANS_TIDAK_SAH'],
  ['D1u', 'nilai Infinity', mutasiProv('bukti', 'biayaTotalUsd', Infinity), 'PROVENANS_TIDAK_SAH'],
  ['D1v', 'nilai negatif', mutasiProv('biaya', 'maksSonnet45Usd', -0.01), 'PROVENANS_TIDAK_SAH'],
  ['D1w', 'nilai string', mutasiProv('biaya', 'pasanganLedgerUsd', '0.029487'), 'PROVENANS_TIDAK_SAH'],
  ['D1x', 'field hilang (panggilanTerotorisasi)', mutasiProv('bukti', 'panggilanTerotorisasi', undefined, true), 'PROVENANS_TIDAK_SAH'],
  ['D1y', 'sha laporan rusak / disingkat', mutasiProv('bukti', 'sha256Laporan', '85c40044…fbcd9'), 'PROVENANS_TIDAK_SAH'],
  ['D1z', 'tidak konsisten (maks > total)', (() => { const x = mutasiProv('biaya', 'maksSonnet45Usd', 5); x.plafonUsd = hitungIndependen(x); return x })(), 'PROVENANS_TIDAK_KONSISTEN'],
  ['D1aa', 'hash prompt v3 provenans ≠ prompt nyata (sidik uji sah → ikatan prompt yang menolak)', mutasiProv('masukan', 'hashPromptV3', 'a'.repeat(64)), 'PROVENANS_PROMPT_V3_HASH_BERBEDA', true],
  ['D1ab', 'plafon konsisten (sidik uji sah) tapi > batas keras', (() => { const x = mutasiProv('biaya', 'pasanganLedgerUsd', 50); x.bukti.biayaTotalUsd = 100; x.plafonUsd = hitungIndependen(x); return x })(), 'PLAFON_MELEBIHI_BATAS_KERAS', true],
]) {
  const { t, p } = jalanLive({ provenansUji: prov, ...(sidikSah ? { sidikProvenansUji: prov && R.sidikProvenans(prov) } : {}) })
  const l = await p
  cek(`${n} mutasi: ${nama} → DITOLAK_BIAYA (${kodeHarap}), 0 panggilan penyedia`, l.verdict === 'DITOLAK_BIAYA' && t.jumlah() === 0 && l.galat.some((g) => g.startsWith(kodeHarap)), l.galat.join(','))
}
{
  const u = jalurUji(undefined)
  const g = await u.panggil()
  const u2 = jalurUji(Number.NaN)
  const g2 = await u2.panggil()
  cek('D1ae pagar tanpa plafon (undefined/NaN) → PROYEKSI_TIDAK_TERSEDIA, 0 transport', g === 'EVAL3_PROYEKSI_TIDAK_TERSEDIA' && g2 === 'EVAL3_PROYEKSI_TIDAK_TERSEDIA' && u.transport() === 0 && u2.transport() === 0)
  const u3 = jalurUji(PLAFON.plafonUsd)
  await u3.panggil()
  u3.keadaan.panggilan[0].biayaUsd = Number.POSITIVE_INFINITY
  const g3 = await u3.panggil()
  cek('D1af biaya teramati non-finite → PROYEKSI_TIDAK_TERSEDIA sebelum transport', g3 === 'EVAL3_PROYEKSI_TIDAK_TERSEDIA' && u3.transport() === 1)
}
{
  const naik = jalurUji(PLAFON.plafonUsd, 0.5)
  await naik.panggil()
  await naik.panggil()
  const turun = jalurUji(PLAFON.plafonUsd, 0.001)
  await turun.panggil()
  await turun.panggil()
  cek('D1ag transisi setelah panggilan sukses pertama: teramati US$0,50 > plafon → proyeksi 0,50 (TERAMATI); teramati US$0,001 < plafon → tetap plafon (lantai)', naik.keadaan.proyeksiBerikutUsd === 0.5 && naik.keadaan.sumberProyeksi === 'TERAMATI' && turun.keadaan.proyeksiBerikutUsd === PLAFON.plafonUsd && turun.keadaan.sumberProyeksi === 'PLAFON_BUKTI_EVAL2')
  const lintas = jalurUji(PLAFON.plafonUsd, 0.7)
  await lintas.panggil(S45)
  await lintas.panggil(S5)
  cek('D1ah model baru setelah model lain mahal: proyeksi memakai tertinggi semua model (0,70), bukan plafon', lintas.keadaan.proyeksiBerikutUsd === 0.7)
}
{
  // Plafon tinggi tapi ≤ keras (US$2,0 × faktor ≈ 2,94): tiap panggilan US$0,01 → berhenti tepat ketika biaya + plafon > 3,00.
  const basisTinggi = mutasiProv('biaya', 'pasanganLedgerUsd', 2.0)
  basisTinggi.bukti.biayaTotalUsd = 10
  basisTinggi.plafonUsd = hitungIndependen(basisTinggi)
  const pt = basisTinggi.plafonUsd
  let harap = 0
  while (harap * 0.01 + pt <= 3) harap++
  const { t, p } = jalanLive({ provenansUji: basisTinggi, sidikProvenansUji: R.sidikProvenans(basisTinggi) })
  const l = await p
  cek(`D1ai pelanggaran terproyeksi sebelum transport: plafon US$${pt} → tepat ${harap} panggilan lalu PROYEKSI_BIAYA_KERAS; biaya ≤ 3,00; INCONCLUSIVE`, t.jumlah() === harap && l.berhenti === 'PROYEKSI_BIAYA_KERAS' && l.akuntansi.biayaUsd + pt > 3 && l.akuntansi.biayaUsd <= 3 && put(l, 'KANDIDAT_S5') === 'INCONCLUSIVE', `transport=${t.jumlah()}`)
}
{
  const { t, p } = jalanLive({}, { opsi: { biaya: 1.1 } })
  const l = await p
  cek('D2 biaya US$1,10/panggilan → panggilan ke-3 ditolak proyeksi (2,20+1,10 > 3,00); biaya ≤ 3,00', t.jumlah() === 2 && l.berhenti === 'PROYEKSI_BIAYA_KERAS' && l.akuntansi.biayaUsd <= 3.0 && l.akuntansi.proyeksiBerikutUsd === 1.1, `biaya ${l.akuntansi.biayaUsd}`)
  cek('D3 run dihentikan biaya → tidak pernah PASS (INCONCLUSIVE), semua slot sisa TIDAK_DIJALANKAN', put(l, 'PROMPT_V3_PRODUKSI') === 'INCONCLUSIVE' && put(l, 'KANDIDAT_S5') === 'INCONCLUSIVE' && l.__slotMemori.slice(3).every((s) => s.status === 'TIDAK_DIJALANKAN'))
}
{
  const { t, p } = jalanLive({}, { opsi: { biaya: 0.25 } })
  const l = await p
  cek('D4 batas LUNAK: biaya 2,75 ≥ 2,70 (proyeksi 3,00 belum melewati keras) → panggilan ke-12 ditolak BERHENTI_LUNAK_BIAYA; biaya ≤ 3,00', t.jumlah() === 11 && l.ditolakPencegat.some((d) => d.alasan === 'BERHENTI_LUNAK_BIAYA') && l.akuntansi.biayaUsd <= 3.0, `biaya ${l.akuntansi.biayaUsd}`)
}
{
  const { t, p } = jalanLive({}, { opsi: { biaya: (n) => (n <= 36 ? 0.01 : 0.9) } })
  const l = await p
  cek('D5 proyeksi PER MODEL: S4.5 murah, S5 US$0,90 → berhenti sebelum melewati keras; biaya ≤ 3,00', l.berhenti === 'PROYEKSI_BIAYA_KERAS' && l.akuntansi.biayaUsd <= 3.0 && t.jumlah() === 38, `transport ${t.jumlah()} biaya ${l.akuntansi.biayaUsd}`)
}
{
  const { t, p } = jalanLive({}, { opsi: { tanpaBiaya: true } })
  const l = await p
  cek('D6 usage.cost tidak ada → berhenti USAGE_COST_TIDAK_ADA setelah 1 panggilan; tak pernah PASS', l.berhenti === 'USAGE_COST_TIDAK_ADA' && t.jumlah() === 1 && put(l, 'KANDIDAT_S5') !== 'PASS')
}
{
  const { t, p } = jalanLive({ batasUji: { ...R.BATAS_EVAL3, tokenInput: 5000 } })
  const l = await p
  cek('D7 batas token → BATAS_TOKEN (panggilan ke-3 ditolak)', t.jumlah() === 2 && l.ditolakPencegat.some((d) => d.alasan === 'BATAS_TOKEN'))
}
{
  const r126 = [...rencana, { seq: 111, blok: 'S5_RUN1_V3', model: S5, kasus: 'H01' }]
  const { t, p } = jalanLive({ rencanaUji: r126 })
  const l = await p
  cek('D8 rencana 111 slot → DITOLAK_RENCANA, 0 panggilan', l.verdict === 'DITOLAK_RENCANA' && t.jumlah() === 0, l.galat.join(','))
  const r130 = Array.from({ length: 130 }, (_, i) => ({ seq: i + 1, blok: 'S5_RUN1_V3', model: S5, kasus: IDS[i % 36] }))
  cek('D9 rencana 130 (> maks 125) → RENCANA_MELEBIHI_MAKS_PANGGILAN', E.validasiRencanaEval3(r130).includes('RENCANA_MELEBIHI_MAKS_PANGGILAN'))
  const { t: t2, p: p2 } = jalanLive({ batasUji: { ...R.BATAS_EVAL3, maksPanggilan: 126 } })
  const l2 = await p2
  cek('D10 batas maksPanggilan 126 (> beku 125) → DITOLAK_BATAS, 0 panggilan', l2.verdict === 'DITOLAK_BATAS' && t2.jumlah() === 0 && l2.galat.includes('BATAS_MELEBIHI_BEKU:maksPanggilan'))
  const { t: t3, p: p3 } = jalanLive({ batasUji: { ...R.BATAS_EVAL3, maksPanggilan: 100 } })
  const l3 = await p3
  cek('D11 batas maksPanggilan 100 < rencana 110 → DITOLAK_BATAS, 0 panggilan', l3.verdict === 'DITOLAK_BATAS' && t3.jumlah() === 0 && l3.galat.includes('RENCANA_MELEBIHI_BATAS_PANGGILAN'))
  cek('D12 batas keras > 3,00 / lunak > keras ditolak', R.periksaBatasEval3({ ...R.BATAS_EVAL3, biayaKerasUsd: 3.01 }).includes('BATAS_MELEBIHI_BEKU:biayaKerasUsd') && R.periksaBatasEval3({ ...R.BATAS_EVAL3, biayaLunakUsd: 2.9, biayaKerasUsd: 2.8 }).includes('BATAS_LUNAK_MELEBIHI_KERAS'))
}
{
  // Unit: pencegat menolak panggilan ke-(maks+1) (dua slot, maks 1).
  let n = 0
  const { jalur, keadaan, slotAktif } = R.rakitJalurPenyedia(async (u, init) => {
    n++
    return new Response(JSON.stringify({ model: JSON.parse(init.body).model, usage: { cost: 0.01, prompt_tokens: 1, completion_tokens: 1 }, choices: [] }), { status: 200 })
  }, { ...R.BATAS_EVAL3, maksPanggilan: 1 }, { plafonUsd: PLAFON.plafonUsd })
  for (let i = 0; i < 2; i++) {
    Object.assign(slotAktif, { model: S5, percobaan: 0 })
    await jalur(H.URL_OPENROUTER, { body: JSON.stringify({ model: S5 }) }).catch(() => {})
  }
  cek('D13 pencegat: panggilan melebihi maksPanggilan → BATAS_PANGGILAN sebelum transport', n === 1 && keadaan.ditolak.some((d) => d.alasan === 'BATAS_PANGGILAN'))
}
{
  const a = Lsempurna.akuntansi
  const kum = a.perPanggilan.at(-1).kumulatifUsd
  cek('D14 akuntansi: dicoba/selesai/HTTP gagal/ulang/token/biaya per panggilan/kumulatif/proyeksi berikut', a.panggilanDicoba === 110 && a.panggilanSelesai === 110 && a.gagalHttp === 0 && a.gagalJaringan === 0 && a.percobaanUlang === 0 && a.token.input > 0 && a.token.output > 0 && a.perPanggilan.length === 110 && a.perPanggilan.every((p) => typeof p.biayaUsd === 'number') && Math.abs(kum - a.biayaUsd) < 1e-9 && typeof a.proyeksiBerikutUsd === 'number')
}

// ============================================================================ E
bagian('E. Otorisasi LIVE (usulan PRD-005-E5-EVAL3-LIVE — BELUM diotorisasi)')
const pra = (env, mode = 'live', proses = {}) => R.periksaPrasyaratEval3(env, mode, proses)
cek('E1 frasa usulan = PRD-005-E5-EVAL3-LIVE; frasa lama = Eval-1/Phase 0/Eval-2', R.FRASA_OTORISASI_EVAL3 === 'PRD-005-E5-EVAL3-LIVE' && R.FRASA_LAMA.includes('PRD-005-E5-EVAL2-LIVE') && R.FRASA_LAMA.includes(H.FRASA_OTORISASI_EVAL1) && R.FRASA_LAMA.includes(H.FRASA_PHASE0))
cek('E2 lengkap & benar (kunci uji palsu, DB loopback, non-produksi) → lolos prasyarat', pra(ENV_LIVE).length === 0)
cek('E3 tanpa frasa → ditolak', pra({ ...ENV_LIVE, SPIKE_AUTHORIZED: undefined }).some((g) => /frasa otorisasi Eval-3/.test(g)))
cek('E4 frasa salah / huruf kecil / spasi → ditolak', ['PRD-005-E5-EVAL3-live', ' PRD-005-E5-EVAL3-LIVE', 'PRD-005-E5-EVAL3-LIVE ', 'YES'].every((f) => pra({ ...ENV_LIVE, SPIKE_AUTHORIZED: f }).length > 0))
cek('E5 frasa Eval-2 / Eval-1 / Phase 0 → ditolak khusus "frasa run terdahulu"', R.FRASA_LAMA.every((f) => pra({ ...ENV_LIVE, SPIKE_AUTHORIZED: f }).some((g) => /frasa run terdahulu/.test(g))))
cek('E6 tanpa kunci uji khusus → ditolak', pra({ ...ENV_LIVE, SPIKE_OPENROUTER_API_KEY: undefined }).some((g) => /SPIKE_OPENROUTER_API_KEY/.test(g)))
cek('E7 kunci produksi OPENROUTER_API_KEY ada (env ATAU process nyata) → ditolak', pra({ ...ENV_LIVE, OPENROUTER_API_KEY: 'x' }).length > 0 && pra(ENV_LIVE, 'live', { OPENROUTER_API_KEY: 'x' }).length > 0 && pra(ENV_UJI, 'offline', { OPENROUTER_API_KEY: 'x' }).length > 0)
cek('E8 kunci uji SAMA dengan kunci produksi → KUNCI_UJI_SAMA_DENGAN_KUNCI_PRODUKSI', pra({ ...ENV_LIVE, OPENROUTER_API_KEY: KUNCI_PALSU }).includes('KUNCI_UJI_SAMA_DENGAN_KUNCI_PRODUKSI') && pra(ENV_LIVE, 'live', { OPENROUTER_API_KEY: KUNCI_PALSU }).includes('KUNCI_UJI_SAMA_DENGAN_KUNCI_PRODUKSI'))
cek('E9 tanpa DB lokal → live ditolak', pra({ ...ENV_LIVE, SPIKE_DATABASE_URL: undefined }).some((g) => /SPIKE_DATABASE_URL/.test(g)))
cek('E10 TAH_INTAKE_MODEL / OPENROUTER_SPK_MODEL=S5 / EXTRACTOR lain → ditolak', pra({ ...ENV_LIVE, TAH_INTAKE_MODEL: S5 }).length > 0 && pra({ ...ENV_LIVE, OPENROUTER_SPK_MODEL: S5 }).length > 0 && pra({ ...ENV_LIVE, VESSEL_CALL_INTAKE_EXTRACTOR: 'FAKE' }).length > 0)
{
  // Jalur JARINGAN sungguhan (tanpa transportUji, tanpa seam) + frasa Eval-2 → ditolak di prasyarat; fetch tak pernah disentuh.
  const sebelum = panggilanJaringan
  const l = await R.jalankanRunnerEval3({ mode: 'live', env: { ...ENV_LIVE, SPIKE_AUTHORIZED: 'PRD-005-E5-EVAL2-LIVE' }, hariIni: HARI })
  cek('E11 jalur jaringan NYATA dengan frasa Eval-2 → DITOLAK_PRASYARAT, 0 fetch', l.verdict === 'DITOLAK_PRASYARAT' && panggilanJaringan === sebelum && l.panggilanNyata === 0)
  const l2 = await R.jalankanRunnerEval3({ mode: 'live', env: { ...ENV_LIVE, SPIKE_AUTHORIZED: undefined }, hariIni: HARI })
  cek('E12 jalur jaringan NYATA tanpa frasa → DITOLAK_PRASYARAT, 0 fetch', l2.verdict === 'DITOLAK_PRASYARAT' && panggilanJaringan === sebelum)
  const l3 = await R.jalankanRunnerEval3({ mode: 'live', env: ENV_LIVE, hariIni: HARI, g12Uji: true })
  cek('E13 seam uji pada jalur jaringan → SEAM_UJI_DILARANG_SAAT_JARINGAN, 0 fetch', l3.verdict === 'DITOLAK_PRASYARAT' && l3.galat.includes('SEAM_UJI_DILARANG_SAAT_JARINGAN') && panggilanJaringan === sebelum)
  const l4 = await R.jalankanRunnerEval3({ env: ENV_UJI })
  cek('E14 tanpa mode eksplisit → DITOLAK_MODE (tak ada mode bawaan)', l4.verdict === 'DITOLAK_MODE')
  const l5 = await R.jalankanRunnerEval3({ mode: 'offline', env: ENV_UJI, transportUji: async () => {}, g12Uji: true })
  cek('E15 offline menolak transport eksternal', l5.verdict === 'DITOLAK_PRASYARAT' && l5.galat.includes('MODE_OFFLINE_TIDAK_MENERIMA_TRANSPORT'))
}

// ============================================================================ F
bagian('F. Keamanan DB (loopback 127.0.0.1/localhost saja; bukan produksi; nol sisa)')
cek('F1 127.0.0.1 dan localhost diterima', R.uraiDbLoopback('postgresql://u@127.0.0.1:55432/x').ok && R.uraiDbLoopback('postgres://u@localhost/x').ok)
const dbTolak = ['postgresql://u@db.example.com:5432/x', 'postgresql://u@10.0.0.5/x', 'postgresql://u@[::1]:5432/x', 'postgresql://u@127.0.0.1:5432/x?host=db.example.com', 'postgresql://u@127.0.0.1,db.example.com/x', 'mysql://u@127.0.0.1/x', 'postgresql://u@127.0.0.2/x', 'bukan url']
cek(`F2 ${dbTolak.length} URL non-loopback/berbahaya ditolak (host jauh, IP privat, ::1, ?host=, multi-host, protokol lain)`, dbTolak.every((u) => !R.uraiDbLoopback(u).ok))
cek('F3 SPIKE_DATABASE_URL jauh → prasyarat ditolak (offline pun)', pra({ ...ENV_UJI, SPIKE_DATABASE_URL: 'postgresql://u@db.example.com/x' }, 'offline').some((g) => /loopback/.test(g)))
cek('F4 DATABASE_URL / DIRECT_URL ≠ SPIKE_DATABASE_URL (mis. DB produksi) → ditolak', pra({ ...ENV_LIVE, DATABASE_URL: 'postgresql://u@db.example.com/prod' }).some((g) => /DATABASE_URL/.test(g)) && pra(ENV_LIVE, 'live', { DIRECT_URL: 'postgresql://u@db.example.com/prod' }).some((g) => /DIRECT_URL/.test(g)))
cek('F5 NODE_ENV=production / VERCEL_ENV=production (env ATAU process) → ditolak', pra({ ...ENV_LIVE, NODE_ENV: 'production' }).length > 0 && pra(ENV_LIVE, 'live', { NODE_ENV: 'production' }).length > 0 && pra({ ...ENV_LIVE, VERCEL_ENV: 'production' }).length > 0 && pra(ENV_UJI, 'offline', { VERCEL_ENV: 'production' }).length > 0)
{
  const l = await jalan({ ledgerUji: () => R.buatTokoLedgerMemori({ siapkanGagal: true }) })
  cek('F6 identitas DB tersambung ≠ loopback yang diminta → buku besar GAGAL_INFRASTRUKTUR, G8 null, KANDIDAT_S5 bukan PASS', l.ledger.status === 'GAGAL_INFRASTRUKTUR' && l.ledger.g8 === null && put(l, 'KANDIDAT_S5') === 'INCONCLUSIVE')
  const l2 = await jalan({ ledgerUji: () => R.buatTokoLedgerMemori({ sisa: 3 }) })
  cek('F7 sisa baris setelah pembersihan → e2eOk false → KANDIDAT_S5 FAIL (G8)', l2.ledger.g8.e2eOk === false && l2.ledger.bukti.pembersihan.bersih === false && put(l2, 'KANDIDAT_S5') === 'FAIL' && l2.putusan.KANDIDAT_S5.kerasGagal.includes('G8'))
  cek('F8 run sempurna: pembersihan bersih (sisa 0)', Lsempurna.ledger.bukti.pembersihan.bersih === true && Lsempurna.ledger.bukti.pembersihan.sisaBaris === 0)
}
{
  const l = await jalan({ ledgerUji: null })
  cek('F9 offline tanpa DB & tanpa toko uji → buku besar TIDAK_DIJALANKAN; G8 null; KANDIDAT_S5 INCONCLUSIVE (bukan PASS)', l.ledger.status === 'TIDAK_DIJALANKAN' && put(l, 'KANDIDAT_S5') === 'INCONCLUSIVE' && put(l, 'PROMPT_V3_PRODUKSI') === 'PASS')
}

// ============================================================================ G
bagian('G. Pemisahan RAW / POST (RAW hanya di memori; laporan hanya diagnostik tersanitasi)')
{
  const s = slotDari(Lsempurna, 'S5_RUN1_V3', 'H24')
  cek('G1 RAW dan POST objek terpisah; RAW = argumen tool apa adanya (tak ditimpa validator)', s.raw !== s.post && JSON.stringify(s.raw) === JSON.stringify(R.jawabanSempurnaEval3(K.H24)))
  cek('G2 __slotMemori tak dapat dienumerasi → tidak ikut JSON laporan', !Object.keys(Lsempurna).includes('__slotMemori') && !JSON.stringify(Lsempurna).includes('"proposal"'))
  const teks = JSON.stringify(Lsempurna)
  cek('G3 laporan tidak memuat nilai RAW/GT (nama kapal, IMO, kontak, baris dokumen)', !teks.includes('SINAR HARAPAN') && !teks.includes('9998482') && !teks.includes('contoh.invalid') && Lsempurna.privasi.lulus)
  const imoPalsu = '9074729'
  const l = await jalan({ jawabStub: jawabDengan({ [SEQ('S5_RUN1_V3', 'H02')]: (o) => void (o.vessels[0].imo = imoPalsu) }) })
  const x = slotDari(l, 'S5_RUN1_V3', 'H02')
  cek('G4 halusinasi IMO di RAW → FATAL RAW dinilai; validator membuang identitas tak tepercaya di POST (FATAL POST 0); RAW tetap memuat nilai asli', x.raw.vessels[0].imo === imoPalsu && x.nilai.RAW.jumlah.FATAL > 0 && x.nilai.POST.jumlah.FATAL === 0 && (x.post.proposal.vessels[0]?.imo?.value ?? null) !== imoPalsu, `RAW FATAL=${x.nilai.RAW.jumlah.FATAL} POST FATAL=${x.nilai.POST.jumlah.FATAL}`)
  cek('G5 nilai halusinasi RAW tidak bocor ke laporan', !JSON.stringify(l).includes(imoPalsu) && l.privasi.lulus)
}

// ============================================================================ H
bagian('H. P1 = DIAGNOSTIK (INSUFFICIENT dengan minimum terpenuhi tetap SALAH untuk G2)')
{
  const l = await jalan({ jawabStub: jawabDengan({ [SEQ('S5_RUN1_V3', 'H01')]: (o) => void (o.classification = 'INSUFFICIENT_INFORMATION') }) })
  const s = slotDari(l, 'S5_RUN1_V3', 'H01')
  const g2 = l.gerbang.G2.detail.S5_RUN1_V3
  cek('H1 P1 terlampir dari produksi: minimumSatisfied=true & subtypeReviewRequired=true', s.p1.minimumSatisfied === true && s.p1.subtypeReviewRequired === true)
  cek('H2 klasifikasi RAW dan POST tetap WRONG (tidak dihitung benar)', s.nilai.RAW.klasifikasi.hasil === S.HASIL.WRONG && s.nilai.POST.klasifikasi.hasil === S.HASIL.WRONG)
  cek('H3 G2 akurasi RAW = POST = 35/36; penahananP1 = [H01] (dilaporkan terpisah)', Math.abs(g2.raw - 35 / 36) < 1e-9 && Math.abs(g2.post - 35 / 36) < 1e-9 && JSON.stringify(g2.penahananP1) === '["H01"]')
  const l2 = await jalan({ jawabStub: jawabDengan({ [SEQ('S5_RUN1_V3', 'H01')]: (o) => void (o.classification = 'NOT_RELEVANT') }) })
  cek('H4 akurasi dengan penahanan P1 = akurasi dengan jawaban salah biasa (P1 tak menambah akurasi)', l2.gerbang.G2.detail.S5_RUN1_V3.post === g2.post && l2.gerbang.G2.detail.S5_RUN1_V3.penahananP1.length === 0)
  const d = l.diagnostik.find((x) => x.seq === s.seq)
  cek('H5 diagnostik slot memuat p1 (boolean saja)', d.p1 && d.p1.subtypeReviewRequired === true && Object.keys(d.p1).length === 2)
}

// ============================================================================ I
bagian('I. Gerbang G1–G14 (+G2S, G9R) — implementasi persis beku')
cek('I1 GERBANG_DIIMPLEMENTASI = kunci G* beku (16)', JSON.stringify([...E.GERBANG_DIIMPLEMENTASI].sort()) === JSON.stringify(Object.keys(F.GERBANG_EVAL3).filter((k) => /^G\d/.test(k)).sort()))
cek('I2 laporan sempurna: 16 gerbang lulus, sifat keras = beku', Object.keys(Lsempurna.gerbang).length === 16 && Object.values(Lsempurna.gerbang).every((g) => g.lulus === true) && Object.entries(Lsempurna.gerbang).every(([k, g]) => g.keras === !!F.GERBANG_EVAL3[k].keras))
cek('I3 H10: adversarial=false, kategori B (di luar G11), larangNew terisi', K.H10.adversarial === false && K.H10.kategori === 'B_MINIMUM_GAGAL' && !!K.H10.gt.larangNew)
{
  const l = await jalan({ jawabStub: jawabDengan({ [SEQ('S5_RUN1_V3', 'H10')]: (o) => ({ ...o, classification: 'NEW_NOMINATION', vessels: [{ name: 'TBN' }] }) }) })
  const s = slotDari(l, 'S5_RUN1_V3', 'H10')
  cek('I4 H10 NEW_* + kapal "TBN" → FATAL POST (F9 larangNew) → G1 keras gagal → KANDIDAT_S5 FAIL', s.nilai.POST.fatal.some((f) => f.kode === 'F9') && l.gerbang.G1.lulusLengan.S5_RUN1_V3 === false && put(l, 'KANDIDAT_S5') === 'FAIL' && l.putusan.KANDIDAT_S5.kerasGagal.includes('G1'), s.nilai.POST.fatal.map((f) => f.kode).join(','))
  cek('I5 H10 TIDAK masuk G11 / G13 (keras lewat G1/larangNew saja); PROMPT_V3_PRODUKSI tetap PASS', !l.gerbang.G11.perLengan.S5_RUN1_V3.some((x) => x.kasus === 'H10') && !l.gerbang.G13.perLengan.S5_RUN1_V3.some((x) => x.kasus === 'H10') && put(l, 'PROMPT_V3_PRODUKSI') === 'PASS')
}
{
  cek('I6 H34: adversarial=true, kategori F (dalam G11)', K.H34.adversarial === true && K.H34.kategori === 'F_TANGGAL')
  const l = await jalan({ jawabStub: jawabDengan({ [SEQ('S5_RUN1_V3', 'H34')]: (o) => void (o.eta = K.H34.tanggal.LALU.iso) }) })
  const s = slotDari(l, 'S5_RUN1_V3', 'H34')
  cek('I7 H34 meminjam tanggal historis → FATAL POST → G1 DAN G11 gagal → KANDIDAT_S5 FAIL', s.nilai.POST.jumlah.FATAL > 0 && l.gerbang.G1.lulusLengan.S5_RUN1_V3 === false && l.gerbang.G11.perLengan.S5_RUN1_V3.some((x) => x.kasus === 'H34' && x.jenis === 'FATAL_POST') && l.putusan.KANDIDAT_S5.kerasGagal.includes('G1') && l.putusan.KANDIDAT_S5.kerasGagal.includes('G11'), s.nilai.POST.fatal.map((f) => `${f.kode}@${f.jalur}`).join(','))
}
{
  const l = await jalan({ jawabStub: jawabDengan({ [SEQ('S45_KONTROL_V3', 'H34')]: (o) => void (o.eta = K.H34.tanggal.LALU.iso) }) })
  cek('I8 kegagalan keras di lengan KONTROL → PROMPT_V3_PRODUKSI FAIL; KANDIDAT_S5 tidak terpengaruh G1/G11', put(l, 'PROMPT_V3_PRODUKSI') === 'FAIL' && !l.putusan.KANDIDAT_S5.kerasGagal.includes('G1') && !l.putusan.KANDIDAT_S5.kerasGagal.includes('G11'))
}
{
  const l = await jalan({ g12Uji: false })
  cek('I9 G12 gagal (check-eval3-gt) → kedua putusan FAIL', put(l, 'PROMPT_V3_PRODUKSI') === 'FAIL' && put(l, 'KANDIDAT_S5') === 'FAIL' && l.putusan.KANDIDAT_S5.kerasGagal.includes('G12'))
}

// ============================================================================ J
bagian('J. G13 — H20 (permintaan tarif) NEW_* dihitung di RAW DAN POST')
{
  cek('J1 H20 ∈ himpunan G13: niatKeagenan=false, minimumTerpenuhi=true, kategori C', K.H20.niatKeagenan === false && K.H20.harapan.minimumTerpenuhi === true && K.H20.kategori === 'C_BUKAN_KEAGENAN')
  const l = await jalan({ jawabStub: jawabDengan({ [SEQ('S5_RUN1_V3', 'H20')]: (o) => void (o.classification = 'NEW_NOMINATION') }) })
  const s = slotDari(l, 'S5_RUN1_V3', 'H20')
  const g13 = l.gerbang.G13.perLengan.S5_RUN1_V3.filter((x) => x.kasus === 'H20')
  cek('J2 validator tak dapat menahannya: POST tetap NEW_NOMINATION', s.post.classification === 'NEW_NOMINATION')
  cek('J3 G13 mencatat H20 di RAW DAN POST (2 temuan)', g13.length === 2 && g13.some((x) => x.lapisan === 'RAW') && g13.some((x) => x.lapisan === 'POST'))
  cek('J4 G13 keras gagal → KANDIDAT_S5 FAIL; juga G1 (F9) & G11 (kategori C); kontrol tetap PASS', put(l, 'KANDIDAT_S5') === 'FAIL' && ['G13', 'G1', 'G11'].every((g) => l.putusan.KANDIDAT_S5.kerasGagal.includes(g)) && put(l, 'PROMPT_V3_PRODUKSI') === 'PASS')
  const lk = await jalan({ jawabStub: jawabDengan({ [SEQ('S45_KONTROL_V3', 'H20')]: (o) => void (o.classification = 'NEW_APPOINTMENT') }) })
  cek('J5 H20 NEW_* di lengan kontrol → PROMPT_V3_PRODUKSI FAIL (G13 semua lengan)', put(lk, 'PROMPT_V3_PRODUKSI') === 'FAIL' && lk.putusan.PROMPT_V3_PRODUKSI.kerasGagal.includes('G13'))
  const hanyaRaw = E.temuanG13({ seq: 1, blok: 'S5_RUN1_V3', kasus: K.H20, raw: { classification: 'NEW_NOMINATION' }, post: { classification: 'NOT_RELEVANT' } })
  cek('J6 unit: NEW_* hanya di RAW tetap dihitung (lapisan RAW)', hanyaRaw.length === 1 && hanyaRaw[0].lapisan === 'RAW')
  cek('J7 unit: kasus positif (H01) NEW_* tidak dihitung G13', E.temuanG13({ seq: 1, blok: 'x', kasus: K.H01, raw: { classification: 'NEW_NOMINATION' }, post: { classification: 'NEW_NOMINATION' } }).length === 0)
}

// ============================================================================ K
bagian('K. G14 — metrik multi-kapal eksplisit (scorer-1 tidak diubah)')
{
  const m = (id, kapal) => E.metrikMultiKapal(K[id], kapal, NORM)
  const sempurna = ['H21', 'H22', 'H23', 'H24', 'H25'].map((id) => [id, m(id, R.jawabanSempurnaEval3(K[id]).vessels)])
  cek('K1 multi-kapal BENAR (H21–H25 setia) → 0 disalin / 0 digabung / 0 sister / 0 hilang', sempurna.every(([, r]) => !r.disalin.length && !r.digabung.length && !r.sister.length && !r.hilang.length), sempurna.map(([id, r]) => `${id}:${r.entri}`).join(' '))
  cek('K2 nama bertingkat (SINAR HARAPAN ⊂ SINAR HARAPAN 305) BUKAN penggabungan', m('H24', [{ name: 'TB SINAR HARAPAN' }, { name: 'BG SINAR HARAPAN 305' }]).digabung.length === 0)
  const salin = m('H24', [{ name: 'TB SINAR HARAPAN', imo: '9998482' }, { name: 'BG SINAR HARAPAN 305', imo: '9998482' }])
  cek('K3 identifier tug disalin ke tongkang → IDENTIFIER_DISALIN (milik V1, dipakai V2)', salin.disalin.length === 1 && salin.disalin[0].milik === 'V1' && salin.disalin[0].dipakaiOleh === 'V2')
  const salinCs = m('H23', [{ name: 'BINTARA SATU', callSign: 'YJBD2' }, { name: 'BINTARA DUA', callSign: 'YJBD2' }, { name: 'BINTARA 5001' }])
  cek('K4 call sign tug lain disalin (H23) → IDENTIFIER_DISALIN', salinCs.disalin.length === 1)
  const gabung = m('H21', [{ name: 'TB PELANGI 21 / BG PELANGI 3002', callSign: 'YJTB2' }])
  cek('K5 tug + tongkang dalam satu entri → TUG_TONGKANG_DIGABUNG', gabung.digabung.length === 1 && gabung.digabung[0].kapalGt.length === 2)
  const hilang = m('H22', [{ name: 'TB SAMUDRA KENCANA', mmsi: '990301022' }, { name: 'BG KENCANA 101' }])
  cek('K6 tongkang peserta tidak ada → KAPAL_PESERTA_HILANG [V3]', JSON.stringify(hilang.hilang) === '["V3"]')
  const sister = m('H25', [{ name: 'MV MUTIARA SENJA', imo: '9998494' }, { name: 'MV MUTIARA FAJAR', imo: '9998509' }])
  cek('K7 kapal sister masuk (nama atau IMO) → KAPAL_DIKECUALIKAN_MASUK', sister.sister.length === 1 && m('H25', [{ name: 'MUTIARA SENJA' }, { name: 'X', imo: '9998509' }]).sister.length === 1)
  const sumberScorer = readFileSync(join(AKAR, 'prisma/spike-eval1-scorer.mjs'))
  cek('K8 scorer-1 tidak disentuh Step 14 (tanpa referensi metrik G14 di scorer)', !String(sumberScorer).includes('metrikMultiKapal'))
}
const skenarioG14 = async (id, fn) => jalan({ jawabStub: jawabDengan({ [SEQ('S5_RUN1_V3', id)]: fn }) })
{
  const l = await skenarioG14('H21', (o) => ({ ...o, vessels: [{ name: 'TB PELANGI 21 / BG PELANGI 3002', callSign: 'YJTB2' }] }))
  cek('K9 run: tug+tongkang digabung (H21) → G14 keras gagal → KANDIDAT_S5 FAIL', l.gerbang.G14.perLengan.S5_RUN1_V3.some((x) => x.jenis === 'TUG_TONGKANG_DIGABUNG') && l.putusan.KANDIDAT_S5.kerasGagal.includes('G14'))
  const l2 = await skenarioG14('H24', (o) => void (o.vessels[1].imo = '9998482'))
  cek('K10 run: IMO tug disalin ke tongkang (H24) → G14 IDENTIFIER_DISALIN → FAIL', l2.gerbang.G14.perLengan.S5_RUN1_V3.some((x) => x.jenis === 'IDENTIFIER_DISALIN') && put(l2, 'KANDIDAT_S5') === 'FAIL')
  const l3 = await skenarioG14('H25', (o) => void o.vessels.push({ name: 'MV MUTIARA FAJAR', imo: '9998509' }))
  cek('K11 run: kapal sister masuk (H25) → G14 + G11 + G1 → FAIL', l3.gerbang.G14.perLengan.S5_RUN1_V3.some((x) => x.jenis === 'KAPAL_DIKECUALIKAN_MASUK') && ['G14', 'G11', 'G1'].every((g) => l3.putusan.KANDIDAT_S5.kerasGagal.includes(g)), l3.putusan.KANDIDAT_S5.kerasGagal.join(','))
  const l4 = await skenarioG14('H22', (o) => void o.vessels.pop())
  cek('K12 run: 1 kapal peserta hilang (≤ 1) → kondisional lulus; bukan kegagalan keras G14', l4.gerbang.G14.kondisionalLengan.S5_RUN1_V3 === true && !l4.putusan.KANDIDAT_S5.kerasGagal.includes('G14'))
  const l5 = await jalan({ jawabStub: jawabDengan({ [SEQ('S5_RUN1_V3', 'H22')]: (o) => void o.vessels.pop(), [SEQ('S5_RUN1_V3', 'H23')]: (o) => void o.vessels.pop() }) })
  cek('K13 run: 2 kapal peserta hilang (> 1) → G14-kondisional (lunak) gagal', l5.gerbang.G14.kondisionalLengan.S5_RUN1_V3 === false && l5.putusan.KANDIDAT_S5.lunakGagal.includes('G14-kondisional'), `${put(l5, 'KANDIDAT_S5')} keras=${l5.putusan.KANDIDAT_S5.kerasGagal}`)
}

// ============================================================================ L
bagian('L. Buku besar (G8) — simulasi toko memori: jalan, tautan panggilan, requested/served, prompt, hasil, probe, sentinel')
{
  const b = Lsempurna.ledger.bukti
  cek('L1 probe PENOLAKAN produksi: TAH_INTAKE_MODEL=Sonnet 5 → MODEL_TIDAK_TERVERIFIKASI, 0 panggilan, 0 baris', b.penolakanProduksi.ok && b.penolakanProduksi.kode === 'MODEL_TIDAK_TERVERIFIKASI' && b.penolakanProduksi.panggilanPenyedia === 0)
  cek('L2 dua slot E2E (H07, H22): jalan SUCCEEDED, 1 AgentModelCall tertaut, requested = served = Sonnet 5 persis', b.slot.length === 2 && b.slot.every((s) => s.status === 'OK' && s.cek.tautanPanggilan && s.cek.requestedPersis && s.cek.servedPersis && s.modelCall.length === 1 && s.modelCall[0].requestedModel === S5 && s.modelCall[0].servedModel === S5))
  cek('L3 identitas prompt tercatat: versi 3, skema 3, hash Prompt v3', b.slot.every((s) => s.cek.identitasPrompt && s.modelCall[0].promptVersion === '3' && s.modelCall[0].schemaVersion === '3' && s.modelCall[0].promptHashCocok))
  cek(`L4 hasil jalan = ${R.HASIL_LEDGER_HARNESS} (harness tidak membuat VesselCallIntake); audit CREATE+UPDATE`, b.slot.every((s) => s.cek.hasilCocok && s.cek.audit))
  cek('L5 probe GAGAL-TERTUTUP: INSERT AgentRun ditolak → submit melempar, 0 panggilan, 0 baris', b.probeGagalTertutup.ok && b.probeGagalTertutup.panggilanPenyedia === 0)
  const g8 = Lsempurna.ledger.g8
  cek('L6 G8 (ambang beku tak berubah): failClosedOk, e2eOk, sentinelBersih, modelE2e = Sonnet 5', g8.failClosedOk === true && g8.e2eOk === true && g8.sentinelBersih === true && g8.modelE2e === S5 && Lsempurna.gerbang.G8.lulus === true)
  cek('L6a C2 — label G8 = CONTROLLED_EVALUATION_LEDGER_E2E di g8, gerbang G8, semantikG8 & putusan KANDIDAT_S5', g8.jenis === 'CONTROLLED_EVALUATION_LEDGER_E2E' && Lsempurna.gerbang.G8.jenis === g8.jenis && Lsempurna.semantikG8.bukanPersetujuanProduksiS5 === true && /BUKAN persetujuan produksi Sonnet 5/.test(Lsempurna.putusan.KANDIDAT_S5.catatanG8) && /BUKAN persetujuan produksi/.test(g8.klaim))
  cek('L6b C2-A jalur ledger evaluasi terkendali SUKSES (2 slot OK) DAN C2-B produksi MENOLAK Sonnet 5 — keduanya wajib', g8.penolakanProduksiS5Ok === true && g8.probeGagalTertutupOk === true && Lsempurna.ledger.bukti.slot.every((s) => s.status === 'OK') && Lsempurna.ledger.bukti.penolakanProduksi.kode === 'MODEL_TIDAK_TERVERIFIKASI' && Lsempurna.ledger.bukti.penolakanProduksi.panggilanPenyedia === 0 && Lsempurna.ledger.bukti.penolakanProduksi.barisIntake === 0 && Lsempurna.ledger.bukti.penolakanProduksi.barisRun === 0)
  cek('L7 buku besar dihitung dalam anggaran: 108 dinilai + 2 buku besar = 110 transport', Lsempurna.panggilanTransport === 110 && perModel(Lsempurna, S5) === 74)
}
const mutasiLedger = [
  ['L8', 'served tercatat beralias', { servedTercatat: `${S5}-fast` }, (g) => !g.e2eOk && g.modelE2e === 'TIDAK_KONSISTEN'],
  ['L9', 'AgentModelCall tidak tercatat', { tanpaModelCall: true }, (g) => !g.e2eOk],
  ['L10', 'tautan AgentModelCall ke jalan salah', { tautanSalah: true }, (g) => !g.e2eOk],
  ['L11', 'versi prompt tercatat bukan 3', { versiPromptTercatat: '2' }, (g) => !g.e2eOk],
  ['L12', 'hasil jalan tercatat berbeda', { hasilTercatat: 'PROPOSAL_CREATED' }, (g) => !g.e2eOk],
  ['L13', 'sentinel dokumen tersimpan di buku besar', { sentinelDisimpan: 'KTX3AG' }, (g) => !g.sentinelBersih],
  ['L14', 'registri membuka Sonnet 5 di jalur produksi (C2-B dilanggar)', { registriTerbuka: true }, (g) => !g.failClosedOk && !g.penolakanProduksiS5Ok],
  ['L15', 'pemicu tidak menutup jalur (probe tak melempar)', { pemicuTidakAktif: true }, (g) => !g.failClosedOk],
  ['L16', 'probe mencoba memanggil penyedia', { probeMemanggil: true }, (g) => !g.failClosedOk],
]
for (const [n, nama, rusak, uji] of mutasiLedger) {
  const l = await jalan({ ledgerUji: () => R.buatTokoLedgerMemori(rusak) })
  cek(`${n} mutasi: ${nama} → G8 gagal → KANDIDAT_S5 FAIL`, uji(l.ledger.g8) && put(l, 'KANDIDAT_S5') === 'FAIL' && l.putusan.KANDIDAT_S5.kerasGagal.includes('G8'), JSON.stringify(l.ledger.g8))
}
{
  const l = await jalan({ ledgerUji: () => R.buatTokoLedgerMemori({ probeMemanggil: true }) })
  cek('L17 percobaan panggilan saat probe → ditolak sebelum transport (0 biaya; transport tetap 110) & tercatat pelanggaran pagar', l.panggilanTransport === 110 && l.operasional.pelanggaranPagar.includes('PANGGILAN_SAAT_PROBE') && l.ledger.bukti.probeGagalTertutup.percobaanDitolak === 1)
  const lk = await jalan({ jawabStub: (k, m, n) => (n === 109 ? { __http: 500 } : R.jawabanSempurnaEval3(k)) })
  cek('L18 galat HTTP pada slot buku besar → jalan FAILED, slot GAGAL, e2eOk false', lk.ledger.slot[0].status.startsWith('GAGAL') && lk.ledger.g8.e2eOk === false && put(lk, 'KANDIDAT_S5') === 'FAIL')
}

// ============================================================================ M
bagian('M. Privasi — perlindungan Eval-2 dipakai ulang + uji mutasi pemindai')
{
  const dasar = JSON.stringify(Lsempurna)
  cek('M1 laporan sempurna: pemindai lulus (0 temuan)', Lsempurna.privasi.lulus && R.pindaiLaporanEval3(dasar, { kunci: KUNCI_PALSU, kasus: KASUS }).length === 0)
  const barisDok = K.H07.teks.split('\n').find((b) => b.trim().length >= 30)
  const mutasi = [
    ['kunci uji', KUNCI_PALSU, 'KUNCI_API'],
    ['pola kunci sk-or-', 'sk-or-v1-abcdef', 'POLA_KUNCI'],
    ['header Bearer', 'Bearer abc', 'POLA_KUNCI'],
    ['frasa Eval-3', R.FRASA_OTORISASI_EVAL3, 'FRASA_OTORISASI'],
    ['frasa Eval-2', 'PRD-005-E5-EVAL2-LIVE', 'FRASA_OTORISASI'],
    ['frasa Eval-1', H.FRASA_OTORISASI_EVAL1, 'FRASA_OTORISASI'],
    ['sentinel Eval-3', 'KTX3AV', 'SENTINEL_EVAL3'],
    ['kontak', 'dewi.ktx3av@contoh.invalid', 'KONTAK'],
    ['baris dokumen', barisDok, 'BADAN_DOKUMEN'],
    ['nama kapal GT', 'MUTIARA SENJA', 'NILAI_GT_UTUH'],
    ['IMO GT', '9998494', 'NILAI_GT_UTUH'],
    ['kapalBukti non-keagenan (tanpa awalan MV)', 'LAYANG BENGAWAN', 'NILAI_GT_UTUH'],
    ['IMO kapalBukti', '9998535', 'NILAI_GT_UTUH'],
    ['kapal sister (dikecualikan)', 'MUTIARA FAJAR', 'NILAI_GT_UTUH'],
    ['URL DB', DB_PALSU, 'RAHASIA_ENV'],
  ]
  for (const [nama, sisip, harap] of mutasi) {
    const t = R.pindaiLaporanEval3(dasar.replace('"diagnostik":[', `"diagnostik":[${JSON.stringify({ bocor: sisip })},`), { kunci: KUNCI_PALSU, kasus: KASUS, rahasiaEnv: [DB_PALSU] })
    cek(`M2 mutasi ${nama} → ${harap}`, t.includes(harap), t.join(','))
  }
  const s = slotDari(Lsempurna, 'S5_RUN1_V3', 'H21')
  const bocorRaw = { ...JSON.parse(dasar), bocor: s.raw }
  cek('M3 mutasi: objek RAW disisipkan ke laporan → tertangkap (NILAI_GT_UTUH/sentinel)', R.pindaiLaporanEval3(JSON.stringify(bocorRaw), { kasus: KASUS }).length > 0)
  const dir = mkdtempSync(join(tmpdir(), 'eval3-cek-'))
  const w = R.tulisLaporanAman(join(dir, 'ditahan.json'), { label: R.LABEL_DRY, privasi: { lulus: false, temuan: ['KUNCI_API'] }, rahasia: 'x' })
  cek('M4 laporan gagal privasi → DITAHAN (hanya temuan ditulis)', w.ditahan && !readFileSync(w.jalur, 'utf8').includes('rahasia'))
  let dalamRepo = null
  try {
    R.tulisLaporanAman(join(AKAR, 'prisma/laporan-eval3.json'), Lsempurna)
  } catch (e) {
    dalamRepo = e.message
  }
  cek('M5 jalur laporan di dalam repo → ditolak', typeof dalamRepo === 'string' && dalamRepo.startsWith('EVAL3_') && !existsSync(join(AKAR, 'prisma/laporan-eval3.json')))
  cek('M6 kunci stub runner bukan pola kunci nyata & tak pernah = kunci uji', !/sk-or-/.test(R.KUNCI_STUB) && R.KUNCI_STUB !== KUNCI_PALSU)
}

// ============================================================================ N
bagian('N. Latihan kegagalan D01–D25 (preflight → 0 panggilan penyedia; runtime → berhenti / tak pernah PASS)')
const nolPanggilan = async (n, nama, opsi, verdictHarap, envGanti) => {
  const t = R.buatPenyediaStubEval3(KASUS)
  const l = await R.jalankanRunnerEval3({ mode: 'live', env: envGanti ?? ENV_LIVE, hariIni: HARI, g12Uji: true, ledgerUji: tokoOk, transportUji: t.fn, ...opsi })
  cek(`${n} ${nama} → ${l.verdict}, panggilan penyedia = ${t.jumlah()}`, l.verdict === verdictHarap && t.jumlah() === 0 && l.panggilanTransport === 0, (l.galat ?? []).slice(0, 3).join(' | '))
  return l
}
const tolakTakPernahPass = (l) => put(l, 'KANDIDAT_S5') !== 'PASS' && put(l, 'PROMPT_V3_PRODUKSI') !== 'PASS'
{
  const modGt = { ...F, KASUS_EVAL3: F.KASUS_EVAL3.map((k) => (k.id === 'H01' ? { ...k, gt: { ...k.gt, classification: { status: 'ACCEPTABLE', values: ['NOT_RELEVANT'] } } } : k)) }
  await nolPanggilan('D01', 'hash GT berbeda (GT H01 dimutasi)', { bekuUji: () => B.verifikasiBekuEval3({ mod: modGt }) }, 'DITOLAK_INTEGRITAS')
  await nolPanggilan('D02', 'SHA fixture berbeda', { bekuUji: () => B.verifikasiBekuEval3({ isiBerkas: Buffer.from('fixture diubah') }) }, 'DITOLAK_INTEGRITAS')
  await nolPanggilan('D03', 'versi prompt berbeda (2)', { identitasPromptUji: { ...identitasNyata, versiPrompt: '2' } }, 'DITOLAK_IKATAN_PROMPT')
  await nolPanggilan('D04', 'versi skema berbeda (2)', { identitasPromptUji: { ...identitasNyata, versiSkema: '2' } }, 'DITOLAK_IKATAN_PROMPT')
  await nolPanggilan('D05', 'hash prompt berbeda', { identitasPromptUji: { ...identitasNyata, hashPrompt: '0'.repeat(64) } }, 'DITOLAK_IKATAN_PROMPT')
  await nolPanggilan('D06', 'rencana tidak lengkap (109)', { rencanaUji: rencana.slice(0, 109) }, 'DITOLAK_RENCANA')
  await nolPanggilan('D07', 'slot duplikat (H02 → H01 di run1)', { rencanaUji: rencana.map((r) => (r.seq === 38 ? { ...r, kasus: 'H01' } : r)) }, 'DITOLAK_RENCANA')
  await nolPanggilan('D08', 'kasus tidak dikenal (H37)', { rencanaUji: rencana.map((r) => (r.seq === 38 ? { ...r, kasus: 'H37' } : r)) }, 'DITOLAK_RENCANA')
  await nolPanggilan('D09a', 'model diminta di rencana ≠ beku (slot S5 → S4.5)', { rencanaUji: rencana.map((r) => (r.seq === 40 ? { ...r, model: S45 } : r)) }, 'DITOLAK_RENCANA')
  const { t, p } = jalanLive({ modelKonteksUji: (r) => (r.model === S5 ? S45 : r.model) })
  const l = await p
  cek('D09b model diminta saat runtime ≠ model slot → ditolak SEBELUM transport; run berhenti di slot 37; tak pernah PASS', t.jumlah() === 36 && l.__slotMemori[36].status === 'GAGAL:MODEL_DIMINTA_BERBEDA' && l.berhenti === 'MODEL_DIMINTA_BERBEDA' && tolakTakPernahPass(l))
}
{
  const { p } = jalanLive({}, { opsi: { served: (m, i) => (i === 37 ? `${m}-20260801` : m) } })
  const l = await p
  cek('D10 served berbeda → berhenti setelah panggilan itu; kedua putusan FAIL', l.berhenti === 'SERVED_MODEL_BERBEDA' && put(l, 'KANDIDAT_S5') === 'FAIL' && put(l, 'PROMPT_V3_PRODUKSI') === 'FAIL')
  const hasil = []
  for (const v of [`${S5}:free`, `~${S5}`, 'anthropic/claude-5-sonnet', S45]) {
    const { p: p2 } = jalanLive({}, { opsi: { served: (m, i) => (i === 37 ? v : m) } })
    hasil.push((await p2).berhenti === 'SERVED_MODEL_BERBEDA')
  }
  cek('D11 fallback/alias/akhiran/awalan dilayani ("…:free", "~…", alias, Sonnet 4.5 sebagai fallback) → semua berhenti', hasil.every(Boolean))
}
const runtime = async (n, nama, jawab, uji, o = {}) => {
  const l = await jalan({ jawabStub: jawab, ...o })
  cek(`${n} ${nama}`, uji(l) && tolakTakPernahPass(l), `${l.verdict}; slot=${l.__slotMemori?.[36]?.status}; berhenti=${l.berhenti}`)
  return l
}
const padaS5 = (a) => (k, m, n) => (n === 37 ? a : R.jawabanSempurnaEval3(k))
await runtime('D12', 'argumen tool tidak sah (classification bukan string) → slot GAGAL:ARGUMEN_TIDAK_SAH; tidak dinilai; INCONCLUSIVE', padaS5({ __mentah: '{"classification":5,"vessels":"x"}' }), (l) => l.__slotMemori[36].status.startsWith('GAGAL:') && l.__slotMemori[36].nilai === null && put(l, 'KANDIDAT_S5') === 'INCONCLUSIVE')
await runtime('D13', 'tanpa tool call → GAGAL:AI_BAD_RESPONSE; tidak dinilai', padaS5({ __tanpaTool: true }), (l) => l.__slotMemori[36].status === 'GAGAL:AI_BAD_RESPONSE' && l.__slotMemori[36].nilai === null)
await runtime('D14', 'argumen JSON tidak sah → GAGAL:AI_BAD_RESPONSE; tidak dinilai', padaS5({ __mentah: '{"classification": "NEW_NOMINATION", ' }), (l) => l.__slotMemori[36].status === 'GAGAL:AI_BAD_RESPONSE' && l.__slotMemori[36].nilai === null)
await runtime('D15a', 'kegagalan transport → slot GAGAL:TRANSPORT_GAGAL_JARINGAN; run BERHENTI (tanpa ulang)', padaS5({ __lempar: true }), (l) => l.__slotMemori[36].status === 'GAGAL:TRANSPORT_GAGAL_JARINGAN' && l.berhenti === 'GAGAL_TRANSPORT' && l.panggilanTransport === 37 && l.akuntansi.gagalJaringan === 1 && l.akuntansi.percobaanUlang === 0)
await runtime('D15b', 'HTTP 500 → slot GAGAL:TRANSPORT_GAGAL; run BERHENTI; tercatat gagalHttp', padaS5({ __http: 500 }), (l) => l.__slotMemori[36].status === 'GAGAL:TRANSPORT_GAGAL' && l.berhenti === 'GAGAL_TRANSPORT' && l.akuntansi.gagalHttp === 1 && l.panggilanTransport === 37)
await runtime('D15c', 'badan respons bukan JSON → berhenti (served/usage.cost tak ada), slot GAGAL, 37 panggilan', padaS5({ __bukanJson: true }), (l) => ['USAGE_COST_TIDAK_ADA', 'SERVED_MODEL_BERBEDA'].includes(l.berhenti) && l.__slotMemori[36].status.startsWith('GAGAL:') && l.panggilanTransport === 37)
{
  const pecah = (raw, o) => {
    if (o.hariIni && raw?.classification && globalThis.__lemparValidator) throw new Error('validator rusak')
    return P.validasiEkstraksi(raw, o)
  }
  globalThis.__lemparValidator = true
  const l = await jalan({ validasiUji: pecah })
  globalThis.__lemparValidator = false
  cek('D16a validator melempar → GAGAL:VALIDATOR_ERROR; run BERHENTI; tak pernah PASS', l.__slotMemori[0].status === 'GAGAL:VALIDATOR_ERROR' && l.berhenti === 'VALIDATOR_ERROR' && l.panggilanTransport === 1 && tolakTakPernahPass(l))
  const l2 = await jalan({ penilaiUji: () => { throw new Error('penilai rusak') } })
  cek('D16b penilai melempar → GAGAL:PENILAI_ERROR; run BERHENTI; tak pernah PASS', l2.__slotMemori[0].status === 'GAGAL:PENILAI_ERROR' && l2.berhenti === 'PENILAI_ERROR' && tolakTakPernahPass(l2))
  const l3 = await jalan({ gerbangUji: () => { throw new Error('gerbang rusak') } })
  cek('D16c perhitungan gerbang melempar → verdict GAGAL_PENILAI; putusan null', l3.verdict === 'GAGAL_PENILAI' && l3.putusan === null)
}
{
  const l = await jalan({ ledgerUji: () => R.buatTokoLedgerMemori({ siapkanGagal: true }) })
  cek('D17 kegagalan buku besar (DB) → GAGAL_INFRASTRUKTUR; KANDIDAT_S5 tidak pernah PASS', l.ledger.status === 'GAGAL_INFRASTRUKTUR' && put(l, 'KANDIDAT_S5') !== 'PASS')
}
{
  const l = await jalan()
  const t = R.pindaiLaporanEval3(JSON.stringify({ ...JSON.parse(JSON.stringify(l)), bocor: 'Principal: PT KTX3AU Tongkang Borneo' }), { kasus: KASUS })
  cek('D18 kebocoran privasi/sentinel di laporan → pemindai menangkap → laporan DITAHAN', t.includes('SENTINEL_EVAL3') && R.tulisLaporanAman(join(mkdtempSync(join(tmpdir(), 'eval3-d18-')), 'l.json'), { ...l, privasi: { lulus: false, temuan: t } }).ditahan)
}
{
  const { t, p } = jalanLive({}, { opsi: { biaya: 1.1 } })
  const l = await p
  cek('D19 pelanggaran batas biaya → PROYEKSI_BIAYA_KERAS sebelum panggilan; biaya ≤ 3,00; tak pernah PASS', l.berhenti === 'PROYEKSI_BIAYA_KERAS' && l.akuntansi.biayaUsd <= 3 && t.jumlah() === 2 && tolakTakPernahPass(l))
}
await nolPanggilan('D20', 'jumlah panggilan > 125 (batas 126 / rencana > maks)', { batasUji: { ...R.BATAS_EVAL3, maksPanggilan: 126 } }, 'DITOLAK_BATAS')
await nolPanggilan('D21', 'DB bukan lokal (SPIKE_DATABASE_URL host jauh)', {}, 'DITOLAK_PRASYARAT', { ...ENV_LIVE, SPIKE_DATABASE_URL: 'postgresql://u@db.example.com:5432/prod' })
await nolPanggilan('D22', 'lingkungan produksi (NODE_ENV=production)', {}, 'DITOLAK_PRASYARAT', { ...ENV_LIVE, NODE_ENV: 'production' })
await nolPanggilan('D23', 'LIVE tanpa otorisasi (tanpa frasa)', {}, 'DITOLAK_PRASYARAT', { ...ENV_LIVE, SPIKE_AUTHORIZED: undefined })
await nolPanggilan('D24', 'frasa Eval-2 lama', {}, 'DITOLAK_PRASYARAT', { ...ENV_LIVE, SPIKE_AUTHORIZED: 'PRD-005-E5-EVAL2-LIVE' })
await nolPanggilan('D25', 'kunci uji = kunci produksi (tabrakan)', {}, 'DITOLAK_PRASYARAT', { ...ENV_LIVE, OPENROUTER_API_KEY: KUNCI_PALSU })

// ============================================================================ O
bagian('O. Simulasi luring (17 skenario)')
const r1 = (id, fn) => ({ [SEQ('S5_RUN1_V3', id)]: fn })
const O = {}
O.kontrol = Lsempurna
cek('O1 kontrol sempurna → PROMPT_V3_PRODUKSI PASS (0 FATAL, 0 temuan G9/G10/G11/G13/G14)', put(O.kontrol, 'PROMPT_V3_PRODUKSI') === 'PASS' && O.kontrol.ringkasan.S45_KONTROL_V3.fatalPost === 0)
cek('O2 S5 run1 + run2 sempurna → KANDIDAT_S5 PASS; G6 identik 36/36', put(O.kontrol, 'KANDIDAT_S5') === 'PASS' && O.kontrol.gerbang.G6.detail.identik === 36)
O.miss = await jalan({ jawabStub: jawabDengan({ ...r1('H01', (o) => void (o.classification = 'NOT_RELEVANT')), ...r1('H02', (o) => void (o.classification = 'NOT_RELEVANT')), ...r1('H03', (o) => void (o.classification = 'NOT_RELEVANT')), ...r1('H04', (o) => void (o.classification = 'NOT_RELEVANT')) }) })
cek('O3 salah klasifikasi 4 kasus positif → G2 run1 < 0,9 → lunakGagal G2 (akurasi 32/36)', O.miss.gerbang.G2.lulusLengan.S5_RUN1_V3 === false && O.miss.putusan.KANDIDAT_S5.lunakGagal.includes('G2'), `${put(O.miss, 'KANDIDAT_S5')} keras=${O.miss.putusan.KANDIDAT_S5.kerasGagal}`)
O.p1 = await jalan({ jawabStub: jawabDengan(r1('H01', (o) => void (o.classification = 'INSUFFICIENT_INFORMATION'))) })
cek('O4 penahanan P1 → diagnostik [H01], akurasi tak bertambah', JSON.stringify(O.p1.gerbang.G2.detail.S5_RUN1_V3.penahananP1) === '["H01"]' && O.p1.gerbang.G2.detail.S5_RUN1_V3.post < 1)
O.halu = await jalan({ jawabStub: jawabDengan(r1('H02', (o) => void (o.portName = 'MERAUKE'))) })
{
  const s = slotDari(O.halu, 'S5_RUN1_V3', 'H02')
  cek('O5 halusinasi RAW (pelabuhan tak ada di sumber) → halusinasi kritis RAW run1 = 1; POST tanpa nilai itu', O.halu.ringkasan.S5_RUN1_V3.halusinasiRawTeks === 1 && s.raw.portName === 'MERAUKE' && s.post.proposal.portName.value !== 'MERAUKE' && O.halu.gerbang.G4.lulusLengan.S5_RUN1_V3 === true, `hal=${O.halu.ringkasan.S5_RUN1_V3.halusinasiRawTeks}`)
}
O.koreksi = await jalan({ jawabStub: jawabDengan(r1('H02', (o) => void (o.vessels[0].imo = '9074729'))) })
{
  const s = slotDari(O.koreksi, 'S5_RUN1_V3', 'H02')
  cek('O6 koreksi validator POST: FATAL RAW > 0, FATAL POST = 0 → G1 lulus', s.nilai.RAW.jumlah.FATAL > 0 && s.nilai.POST.jumlah.FATAL === 0 && O.koreksi.gerbang.G1.lulus === true)
}
const kasusTT = KASUS.find((k) => k.kategori === 'F_TANGGAL' && k.gt.eta?.tanpaTahun && k.id !== 'H34')
O.tanggal = await jalan({ jawabStub: jawabDengan(r1(kasusTT.id, (o) => void (o.eta = kasusTT.tanggal.ETA.iso))) })
cek(`O7 inferensi tahun (${kasusTT.id} ETA tanpa tahun diisi) → G9R RAW run1 gagal; POST bersih (G9 lulus)`, O.tanggal.gerbang.G9R.lulusLengan.S5_RUN1_V3 === false && O.tanggal.gerbang.G9.lulus === true && O.tanggal.putusan.KANDIDAT_S5.lunakGagal.includes('G9R'), `${put(O.tanggal, 'KANDIDAT_S5')} keras=${O.tanggal.putusan.KANDIDAT_S5.kerasGagal}`)
{
  const seqH22 = SEQ('S5_RUN1_V3', 'H22')
  let n = 0
  const validasiHilang = (raw, o) => {
    const post = P.validasiEkstraksi(raw, o)
    n++
    if (n === seqH22) post.proposal.vessels.pop() // hilang DIAM-DIAM (vesselsDropped tidak naik)
    return post
  }
  O.hilang = await jalan({ validasiUji: validasiHilang })
  cek('O8 kapal hilang diam-diam RAW→POST (validator dimutasi) → G10 keras → KANDIDAT_S5 FAIL', O.hilang.gerbang.G10.perLengan.S5_RUN1_V3.some((x) => x.kasus === 'H22') && O.hilang.putusan.KANDIDAT_S5.kerasGagal.includes('G10'))
}
O.newPalsu = await jalan({ jawabStub: jawabDengan(r1('H20', (o) => void (o.classification = 'NEW_NOMINATION'))) })
cek('O9 NEW_* palsu non-keagenan (H20) → G13 RAW+POST → FAIL', O.newPalsu.gerbang.G13.perLengan.S5_RUN1_V3.length === 2 && put(O.newPalsu, 'KANDIDAT_S5') === 'FAIL')
O.gabung = await skenarioG14('H21', (o) => ({ ...o, vessels: [{ name: 'TB PELANGI 21 / BG PELANGI 3002', callSign: 'YJTB2' }] }))
cek('O10 penggabungan tug/tongkang → G14 → FAIL', put(O.gabung, 'KANDIDAT_S5') === 'FAIL' && O.gabung.putusan.KANDIDAT_S5.kerasGagal.includes('G14'))
O.hilangKapal = await skenarioG14('H22', (o) => void o.vessels.pop())
cek('O11 kapal peserta hilang (1) → tercatat G14 kondisional (≤1 lulus)', O.hilangKapal.gerbang.G14.perLengan.S5_RUN1_V3.some((x) => x.jenis === 'KAPAL_PESERTA_HILANG') && O.hilangKapal.gerbang.G14.kondisionalLengan.S5_RUN1_V3 === true)
O.salin = await skenarioG14('H24', (o) => void (o.vessels[1].mmsi = '990301024'))
cek('O12 identifier disalin (MMSI tug → tongkang) → G14 → FAIL', O.salin.gerbang.G14.perLengan.S5_RUN1_V3.some((x) => x.jenis === 'IDENTIFIER_DISALIN') && put(O.salin, 'KANDIDAT_S5') === 'FAIL')
O.sister = await skenarioG14('H25', (o) => void o.vessels.push({ name: 'MV MUTIARA FAJAR' }))
cek('O13 kapal sister masuk → G14 + G11 → FAIL', O.sister.gerbang.G14.perLengan.S5_RUN1_V3.some((x) => x.jenis === 'KAPAL_DIKECUALIKAN_MASUK') && put(O.sister, 'KANDIDAT_S5') === 'FAIL')
{
  const beda = ['H21', 'H22', 'H23', 'H24'].map((id) => SEQ('S5_RUN2_V3', id))
  O.ulang = await jalan({ jawabStub: jawabDengan(Object.fromEntries(beda.map((n) => [n, (o) => void delete o.vessels[0].role]))) })
  cek('O14 keterulangan: run2 berbeda di 4 kasus → G6 < 0,9 → lunakGagal G6', O.ulang.gerbang.G6.detail.identik <= 32 && O.ulang.putusan.KANDIDAT_S5.lunakGagal.includes('G6'), `identik=${O.ulang.gerbang.G6.detail.identik} ${put(O.ulang, 'KANDIDAT_S5')} keras=${O.ulang.putusan.KANDIDAT_S5.kerasGagal}`)
}
{
  const target = ['H01', 'H02', 'H03', 'H04', 'H05'].map((id) => SEQ('S5_RUN1_V3', id))
  O.keparahan = await jalan({ jawabStub: jawabDengan(Object.fromEntries(target.map((n) => [n, (o) => void delete o.portUnlocode]))) })
  const rk = O.keparahan.ringkasan
  cek('O15 perbandingan keparahan: MAJOR(S5 run1) > MAJOR(kontrol)+2 → G5 keras → FAIL', rk.S5_RUN1_V3.majorPost > rk.S45_KONTROL_V3.majorPost + 2 && O.keparahan.putusan.KANDIDAT_S5.kerasGagal.includes('G5') && put(O.keparahan, 'PROMPT_V3_PRODUKSI') === 'PASS', `MAJOR s5=${rk.S5_RUN1_V3.majorPost} kontrol=${rk.S45_KONTROL_V3.majorPost}`)
}
{
  const { p } = jalanLive({}, { opsi: { served: (m, i) => (i === 50 ? `${m}:beta` : m) } })
  O.served = await p
  cek('O16 served mismatch → berhenti; kedua putusan FAIL; G7 infra gagal', O.served.berhenti === 'SERVED_MODEL_BERBEDA' && put(O.served, 'KANDIDAT_S5') === 'FAIL' && O.served.gerbang.G7.lulus === false)
  const { t, p: p2 } = jalanLive({}, { opsi: { biaya: 1.1 } })
  O.biaya = await p2
  cek('O17 stop biaya → 2 panggilan, INCONCLUSIVE, biaya ≤ US$3,00', t.jumlah() === 2 && put(O.biaya, 'KANDIDAT_S5') === 'INCONCLUSIVE' && O.biaya.akuntansi.biayaUsd <= 3)
}
cek('O* semua laporan simulasi lulus pemindai privasi', Object.values(O).every((l) => l.privasi?.lulus === true), Object.entries(O).filter(([, l]) => !l.privasi?.lulus).map(([k, l]) => `${k}:${l.privasi?.temuan}`).join(' '))

// ============================================================================ P
bagian('P. CLI & laporan')
{
  const keluar = []
  const kode = await R.cli([], ENV_UJI, (s) => keluar.push(s))
  cek('P1 CLI tanpa argumen → kode 2, tanpa panggilan, cetak integritas OK & rencana 110/125', kode === 2 && keluar.some((s) => s.includes('integritas GT Eval-3 : OK')) && keluar.some((s) => s.includes('110 / maks 125')))
  const k2 = await R.cli(['--mode', 'live', '--report', join(tmpdir(), 'eval3-live.json')], ENV_UJI, (s) => keluar.push(s))
  cek('P2 CLI live tanpa otorisasi → kode 3 DITOLAK (0 panggilan)', k2 === 3 && keluar.at(-1).startsWith('DITOLAK (0 panggilan)'))
  const k3 = await R.cli(['--mode', 'offline', '--report', join(AKAR, 'laporan.json')], ENV_UJI, (s) => keluar.push(s))
  cek('P3 CLI laporan di dalam repo → kode 3', k3 === 3)
  const dir = mkdtempSync(join(tmpdir(), 'eval3-cli-'))
  const jalurLap = join(dir, 'eval3-dry.json')
  const k4 = await R.cli(['--mode', 'offline', '--report', jalurLap], ENV_UJI, (s) => keluar.push(s))
  const isi = existsSync(jalurLap) ? readFileSync(jalurLap, 'utf8') : ''
  const lap = isi ? JSON.parse(isi) : {}
  cek('P4 CLI offline (G12 nyata = check-eval3-gt) → kode 0, laporan ditulis, label DRY_RUN, panggilanNyata 0', k4 === 0 && lap.label === R.LABEL_DRY && lap.panggilanNyata === 0 && lap.gerbang?.G12?.lulus === true, keluar.at(-2))
  cek('P5 CLI offline tanpa DB → buku besar TIDAK_DIJALANKAN → KANDIDAT_S5 INCONCLUSIVE; PROMPT_V3_PRODUKSI PASS', lap.ledger?.status === 'TIDAK_DIJALANKAN' && lap.putusan?.KANDIDAT_S5?.verdict === 'INCONCLUSIVE' && lap.putusan?.PROMPT_V3_PRODUKSI?.verdict === 'PASS')
  cek('P6 berkas laporan lulus pemindai privasi', R.pindaiLaporanEval3(isi, { kasus: KASUS }).length === 0)
}

// ============================================================================ Q
bagian('Q. Integritas akhir, lingkungan dipulihkan, nol jaringan')
cek('Q1 Eval-3 GT/fixture beku utuh', B.verifikasiBekuEval3().length === 0)
cek('Q2 Eval-1 & Eval-2 beku utuh', H.verifikasiBeku().length === 0 && B2.verifikasiBekuEval2().length === 0)
cek('Q3 Prompt v3 terikat utuh', B.verifikasiIkatanPromptEval3(identitasNyata).length === 0)
cek('Q4 process.env dipulihkan (OPENROUTER_API_KEY, TAH_INTAKE_MODEL, DATABASE_URL tak tersisa)', !process.env.OPENROUTER_API_KEY && !process.env.TAH_INTAKE_MODEL && !process.env.DATABASE_URL && !process.env.TAH_CORE_ENABLED)
cek('Q5 NOL panggilan jaringan selama seluruh uji', panggilanJaringan === 0)

console.log(`\n${gagal === 0 ? '✅' : '❌'} ${lulus} lulus, ${gagal} gagal`)
process.exit(gagal === 0 ? 0 : 1)
