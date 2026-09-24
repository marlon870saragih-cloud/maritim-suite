// PRD-005 Step 3C — PHASE 0: probe kompatibilitas model LANGSUNG (spike, BUKAN kode produksi).
//
// Menjawab: apakah `anthropic/claude-sonnet-5` cocok dengan KONTRAK ekstraksi Intake SAAT INI?
// Memakai kode Intake yang SESUNGGUHNYA (ekstrakLewatOpenRouter → chatCompletionMeta →
// validasiEkstraksi) lewat konteks perekam Step 3B — TANPA mengubah kode produksi, registry
// kemampuan, atau konfigurasi. Hasil sukses berarti HANYA "siap ditinjau owner untuk Phase 1";
// model TETAP PENDING_SPIKE.
//
// ── Menjalankan (lingkungan NON-PRODUKSI terisolasi) ─────────────────────────────────────
//   SPIKE_AUTHORIZED=PRD-005-STEP3C-PHASE0 \
//   SPIKE_OPENROUTER_API_KEY=<kunci uji KHUSUS, batas kredit US$5> \
//   [SPIKE_DATABASE_URL=postgresql://…@localhost/…]   # opsional: bukti AgentRun/AgentModelCall
//   [SPIKE_REPORT_PATH=/tmp/phase0.json]              # bawaan: direktori temp OS
//   node prisma/spike-model-compat.mjs
//
// ── Pagar (ditegakkan SEBELUM panggilan apa pun) ────────────────────────────────────────
//   • frasa otorisasi persis; NODE_ENV ≠ production; OPENROUTER_API_KEY di shell HARUS kosong
//     (mencegah kunci produksi terpakai); SPIKE_DATABASE_URL hanya localhost/127.0.0.1.
//   • host tunggal: openrouter.ai/api/v1/chat/completions. Model: allowlist 2 slug saja.
//   • batas: total 5 panggilan (Sonnet 4.5 ≤ 1, Sonnet 5 ≤ 4), 100k token input / 15k output;
//     batas dicek SEBELUM panggilan — panggilan yang akan melewati batas TIDAK dikirim.
//   • tak ada ulang selain SATU ulang tanpa plugin PDF milik kode Intake yang ada.
//   • kunci tak pernah dicetak; badan permintaan/respons tak pernah dicetak/disimpan;
//     teks galat penyedia diklasifikasi DI MEMORI → hanya KATEGORI yang dicatat.
//
// Keluaran: laporan JSON tersanitasi + ringkasan konsol, keduanya dipindai sentinel sebelum ditulis.

import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SENTINEL, bangunPdf, kasusPhase0 } from './fixtures/spike-intake/phase0-cases.mjs'

export const FRASA_OTORISASI = 'PRD-005-STEP3C-PHASE0'
export const URL_OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions'
export const MODEL_KONTROL = 'anthropic/claude-sonnet-4.5'
export const MODEL_KANDIDAT = 'anthropic/claude-sonnet-5'
export const ALLOWLIST = Object.freeze([MODEL_KONTROL, MODEL_KANDIDAT])
export const BATAS = Object.freeze({
  total: 5,
  perModel: Object.freeze({ [MODEL_KONTROL]: 1, [MODEL_KANDIDAT]: 4 }),
  inputTokens: 100_000,
  outputTokens: 15_000,
})
const BATAS_WAKTU_MS = 60_000 // = BATAS_WAKTU_AI_BAWAAN_MS intake
const PROFIL_TANPA_SUHU = Object.freeze({ acceptsTemperature: false, supportsForcedToolChoice: true, supportsPdfNative: true })

const AKAR = fileURLToPath(new URL('..', import.meta.url))

// ------------------------------------------------------------------ prasyarat
export function periksaPrasyarat(env, { langsung = true } = {}) {
  const galat = []
  if (env.SPIKE_AUTHORIZED !== FRASA_OTORISASI) galat.push('SPIKE_AUTHORIZED tidak sama dengan frasa otorisasi Phase 0')
  if (env.NODE_ENV === 'production') galat.push('NODE_ENV=production ditolak')
  if (langsung) {
    if (!env.SPIKE_OPENROUTER_API_KEY) galat.push('SPIKE_OPENROUTER_API_KEY (kunci uji khusus) tidak diset')
    if (env.OPENROUTER_API_KEY) galat.push('OPENROUTER_API_KEY di shell harus KOSONG (cegah kunci produksi terpakai)')
  }
  if (env.SPIKE_DATABASE_URL) {
    let host = ''
    try {
      host = new URL(env.SPIKE_DATABASE_URL).hostname
    } catch {
      host = '?'
    }
    if (!['localhost', '127.0.0.1', '::1'].includes(host)) galat.push('SPIKE_DATABASE_URL hanya boleh localhost/127.0.0.1')
  }
  return galat
}

// ------------------------------------------------------------ klasifikasi galat
/** Teks galat penyedia → KATEGORI saja (teks tak pernah disimpan). Urutan = prioritas. */
export function kategoriGalat(status, pesan) {
  const m = String(pesan ?? '').toLowerCase()
  if (status === 404 || /not a valid model|model .*(not found|does not exist)|no endpoints found|invalid model|unknown model/.test(m)) return 'MODEL_NOT_FOUND'
  if (/temperature|sampling param|top_p|top_k/.test(m)) return 'TEMPERATURE'
  if (/tool_choice|tool choice|forced tool|tool use/.test(m)) return 'TOOL_CHOICE'
  if (/thinking|reasoning/.test(m)) return 'THINKING'
  if (/plugin|engine|native|file-parser|file parser/.test(m)) return 'PLUGIN'
  if (status === 401 || status === 403) return 'AUTH'
  if (status === 402) return 'CREDIT'
  if (status === 429) return 'RATE_LIMIT'
  if (status >= 500) return 'PROVIDER_SERVER'
  if (status === 408) return 'TIMEOUT'
  return 'OTHER'
}

const angka = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)

/** Cari medan biaya tanpa mengasumsikan semantik: kembalikan jalur + tipe + nilai numerik saja. */
function deteksiBiaya(json) {
  for (const [jalur, v] of [
    ['usage.cost', json?.usage?.cost],
    ['usage.total_cost', json?.usage?.total_cost],
    ['cost', json?.cost],
  ]) {
    if (v !== undefined) return { ada: true, jalur, tipe: typeof v, nilai: angka(v) }
  }
  return { ada: false, jalur: null, tipe: null, nilai: null }
}

// ------------------------------------------------------------------- pencegat
export function buatPencegat(fetchAsli) {
  const s = { panggilan: [], ditolak: [], total: 0, perModel: {}, token: { input: 0, output: 0, adaUsage: true } }
  async function pencegat(url, init = {}) {
    const u = String(url)
    if (u !== URL_OPENROUTER) {
      s.ditolak.push({ alasan: 'HOST_TIDAK_DIIZINKAN' })
      throw new Error('SPIKE_HOST_TIDAK_DIIZINKAN')
    }
    let body = {}
    try {
      body = JSON.parse(String(init.body ?? '{}'))
    } catch {
      body = {}
    }
    const model = body.model
    if (!ALLOWLIST.includes(model)) {
      s.ditolak.push({ alasan: 'MODEL_TIDAK_DIIZINKAN' })
      throw new Error('SPIKE_MODEL_TIDAK_DIIZINKAN')
    }
    if (s.total >= BATAS.total || (s.perModel[model] ?? 0) >= BATAS.perModel[model]) {
      s.ditolak.push({ alasan: 'BATAS_PANGGILAN', model })
      throw new Error('SPIKE_BATAS_PANGGILAN')
    }
    if (s.token.input >= BATAS.inputTokens || s.token.output >= BATAS.outputTokens) {
      s.ditolak.push({ alasan: 'BATAS_TOKEN', model })
      throw new Error('SPIKE_BATAS_TOKEN')
    }
    s.total++
    s.perModel[model] = (s.perModel[model] ?? 0) + 1
    const rek = {
      seq: s.total,
      requestedModel: model,
      temperatureDikirim: Object.prototype.hasOwnProperty.call(body, 'temperature'),
      toolChoicePaksa: body.tool_choice?.type === 'function',
      pluginDipakai: Array.isArray(body.plugins) && body.plugins.length > 0,
    }
    const t0 = Date.now()
    let res
    try {
      res = await fetchAsli(url, init)
    } catch (e) {
      rek.latencyMs = Date.now() - t0
      rek.http = 'GAGAL_JARINGAN'
      rek.kategoriGalat = e?.name === 'AbortError' || e?.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK'
      s.panggilan.push(rek)
      throw e
    }
    rek.latencyMs = Date.now() - t0
    const teks = await res.text()
    let json = {}
    try {
      json = JSON.parse(teks)
    } catch {
      json = {}
    }
    const ok = res.ok && !json.error
    rek.http = ok ? 'SUKSES' : 'GAGAL'
    rek.httpStatus = res.status
    rek.kategoriGalat = ok ? null : kategoriGalat(res.status, json.error?.message)
    rek.servedModel = typeof json.model === 'string' ? json.model.slice(0, 200) : null
    rek.providerRequestId = typeof json.id === 'string' ? json.id.slice(0, 200) : null
    const u2 = json.usage ?? null
    rek.promptTokens = angka(u2?.prompt_tokens)
    rek.completionTokens = angka(u2?.completion_tokens)
    rek.totalTokens = angka(u2?.total_tokens) ?? (rek.promptTokens !== null && rek.completionTokens !== null ? rek.promptTokens + rek.completionTokens : null)
    rek.biaya = deteksiBiaya(json)
    const pilihan = json.choices?.[0]
    rek.finishReason = typeof pilihan?.finish_reason === 'string' ? pilihan.finish_reason.slice(0, 40) : null
    const tc = pilihan?.message?.tool_calls?.[0]
    rek.toolCallAda = !!tc
    rek.toolCallNama = typeof tc?.function?.name === 'string' ? tc.function.name.slice(0, 64) : null
    rek.argumenAda = typeof tc?.function?.arguments === 'string' && tc.function.arguments.length > 0
    if (ok) {
      if (rek.promptTokens === null || rek.completionTokens === null) s.token.adaUsage = false
      s.token.input += rek.promptTokens ?? 0
      s.token.output += rek.completionTokens ?? 0
    }
    s.panggilan.push(rek)
    return new Response(teks, { status: res.status, headers: res.headers })
  }
  return { pencegat, keadaan: s }
}

// --------------------------------------------------------------- penilaian
const modelTerlayaniCocok = (diminta, dilayani) =>
  typeof dilayani === 'string' && (dilayani === diminta || dilayani.startsWith(`${diminta}-`) || dilayani.startsWith(`${diminta}:`) || dilayani.startsWith(`${diminta}@`))

function nilaiKebenaran(P, proposal, harap, kind) {
  const kompak = (v) => P.kompak(String(v ?? ''))
  const kapal = (proposal.vessels ?? []).filter((k) => !k.excluded)
  const h = {}
  h.jumlahKapal = kapal.length === harap.kapal.length
  h.namaKapal = harap.kapal.every((hk) => kapal.some((k) => kompak(k.name?.value).includes(kompak(hk.nama))))
  if (harap.kapal.some((k) => k.imo)) h.imo = harap.kapal.every((hk) => !hk.imo || kapal.some((k) => k.imo?.value === hk.imo))
  if (harap.kapal.some((k) => k.mmsi)) h.mmsi = harap.kapal.every((hk) => !hk.mmsi || kapal.some((k) => k.mmsi?.value === hk.mmsi))
  if (harap.kapal.some((k) => k.peran)) h.peran = harap.kapal.every((hk) => !hk.peran || kapal.some((k) => kompak(k.name?.value).includes(kompak(hk.nama)) && k.role?.value === hk.peran))
  h.portUnlocode = proposal.portUnlocode?.value === harap.portUnlocode
  h.eta = proposal.eta?.value === harap.eta
  h.cargo = harap.cargo.every((hc) => (proposal.cargoes ?? []).some((c) => c.quantity === hc.quantity && c.operation === hc.operation))
  if (kind === 'TEXT') {
    // Penemuan mesin atas nilai yang TIDAK ada di sumber (hanya bisa diperiksa untuk teks).
    const bendera = [proposal.portUnlocode, proposal.eta, ...kapal.flatMap((k) => [k.name, k.imo, k.mmsi])].flatMap((f) => f?.flags ?? [])
    h.tanpaNotInSource = !bendera.includes('NOT_IN_SOURCE')
  }
  return h
}

// ----------------------------------------------------------------- inti
/**
 * Jalankan Phase 0. `fetchAsli` = fetch sungguhan (langsung) atau stub (uji luring).
 * Mengembalikan laporan tersanitasi; TIDAK menulis berkas (pemanggil CLI yang menulis).
 */
export async function jalankanPhase0({ env = process.env, fetchAsli = globalThis.fetch, log = () => {}, hariIni = new Date() } = {}) {
  const langsung = fetchAsli === globalThis.fetch
  const prasyarat = periksaPrasyarat(env, { langsung })
  if (prasyarat.length) return { verdict: 'DITOLAK_PRASYARAT', prasyarat, panggilanNyata: 0 }

  const require = createRequire(import.meta.url)
  const jiti = require('jiti')(fileURLToPath(import.meta.url), { alias: { '@': join(AKAR, 'src') }, interopDefault: true })
  const muat = (rel) => jiti(join(AKAR, rel))

  const kunciSebelum = process.env.OPENROUTER_API_KEY
  const dbSebelum = process.env.DATABASE_URL
  const fetchSebelum = globalThis.fetch
  const { pencegat, keadaan } = buatPencegat(fetchAsli)
  globalThis.fetch = pencegat
  // Kunci uji hanya di proses ini, hanya selama spike; tak pernah dicetak.
  process.env.OPENROUTER_API_KEY = langsung ? env.SPIKE_OPENROUTER_API_KEY : 'stub-kunci-uji-luring-000000'
  if (env.SPIKE_DATABASE_URL) process.env.DATABASE_URL = env.SPIKE_DATABASE_URL

  const laporan = {
    spike: 'PRD-005 Step 3C Phase 0',
    mode: langsung ? 'LANGSUNG' : 'STUB_LURING',
    tanggal: hariIni.toISOString(),
    allowlist: ALLOWLIST,
    batas: BATAS,
    probe: [],
    verdict: null,
    alasan: null,
    kandidatKemampuan: null,
  }
  const { C1, C2 } = kasusPhase0(hariIni)
  try {
    const X = muat('src/lib/ai/vessel-call-extract.ts')
    const PR = muat('src/lib/ai/perekam-panggilan.ts')
    const P = muat('src/services/intake/intake-policy.ts')
    const V = muat('src/lib/vessels.ts')
    const NORM = { imo: V.normalisasiImo, imoSah: V.imoCheckDigitSah, mmsi: V.normalisasiMmsi, mmsiSah: V.mmsiSah, callSign: V.normalisasiCallSign }
    const pdfC2 = await bangunPdf(C2)

    async function probe(id, model, kemampuan, kasus) {
      const idx = keadaan.panggilan.length
      const metaPerekam = []
      const masukan = kasus.kind === 'PDF' ? { kind: 'PDF', bytes: pdfC2, filename: kasus.namaBerkas } : { kind: 'TEXT', text: P.normalisasiTeksSumber(kasus.teks) }
      let mentah
      let galatEkstraksi = null
      try {
        mentah = await PR.jalankanDenganKonteks({ model, kemampuan, catat: (m) => metaPerekam.push(m) }, () =>
          X.ekstrakDenganBatasWaktu(X.ekstrakLewatOpenRouter, masukan, BATAS_WAKTU_MS),
        )
      } catch (e) {
        galatEkstraksi = typeof e?.kode === 'string' ? e.kode : 'ERROR'
      }
      const percobaan = keadaan.panggilan.slice(idx)
      const akhir = percobaan[percobaan.length - 1] ?? null
      const r = {
        id,
        kasus: kasus.id,
        requestedModel: model,
        profilKemampuan: kemampuan === null ? 'LEGACY_BENTUK_SEKARANG' : 'TANPA_TEMPERATURE',
        percobaan,
        hasilEkstraktor: galatEkstraksi ? `GAGAL:${galatEkstraksi}` : 'OK',
        toolCallAda: !!akhir?.toolCallAda,
        argumenTerurai: mentah !== undefined,
        fallbackPlugin: percobaan.length > 1 && percobaan[0]?.pluginDipakai === true && percobaan[1]?.pluginDipakai === false,
        servedCocok: percobaan.filter((p) => p.http === 'SUKSES').every((p) => modelTerlayaniCocok(model, p.servedModel)) && percobaan.some((p) => p.http === 'SUKSES'),
        perekam: metaPerekam.map((m, i) => ({ seq: i + 1, status: m.status, errorCode: m.errorCode, promptId: m.promptId, promptVersion: m.promptVersion, promptHash: m.promptHash, schemaId: m.schemaId, requestedModel: m.requestedModel, servedModel: m.servedModel })),
        validasi: null,
        kebenaran: null,
      }
      if (mentah !== undefined) {
        try {
          const hasil = P.validasiEkstraksi(mentah, {
            inputKind: kasus.kind,
            sourceText: kasus.kind === 'TEXT' ? masukan.text : null,
            hariIni: hariIni.toISOString().slice(0, 10),
            norm: NORM,
          })
          const klasifikasiOk = kasus.harap.classification.includes(hasil.classification)
          r.validasi = { lulus: klasifikasiOk, classification: hasil.classification }
          r.kebenaran = nilaiKebenaran(P, hasil.proposal, kasus.harap, kasus.kind)
        } catch {
          r.validasi = { lulus: false, classification: null }
        }
      }
      laporan.probe.push(r)
      log(`  ${id} ${model} [${r.profilKemampuan}] → ${r.hasilEkstraktor}; panggilan=${percobaan.length}; tool=${r.toolCallAda}; validasi=${r.validasi?.lulus ?? '-'}; served=${percobaan.map((p) => p.servedModel ?? p.kategoriGalat ?? p.http).join('|')}`)
      return r
    }
    const kategori = (r) => r.percobaan.find((p) => p.http !== 'SUKSES')?.kategoriGalat ?? null
    const selesai = (verdict, alasan) => {
      laporan.verdict = verdict
      laporan.alasan = alasan
      return laporan
    }
    const lulusPenuh = (r) => r.hasilEkstraktor === 'OK' && r.toolCallAda && r.argumenTerurai && r.servedCocok && r.validasi?.lulus === true

    // P0.1 — kontrol Sonnet 4.5, bentuk permintaan Intake sekarang.
    const p1 = await probe('P0.1', MODEL_KONTROL, null, C1)
    if (!lulusPenuh(p1)) return selesai('INCONCLUSIVE', `Kontrol Sonnet 4.5 gagal (${p1.hasilEkstraktor}, kategori=${kategori(p1) ?? '-'}) — masalah harness/kunci/jalur; Sonnet 5 TIDAK dipanggil.`)

    // P0.2 — Sonnet 5, bentuk permintaan SEKARANG (temperature 0 + tool paksa).
    let profil = null
    const p2 = await probe('P0.2', MODEL_KANDIDAT, null, C1)
    if (!lulusPenuh(p2)) {
      const k = kategori(p2)
      if (k === 'MODEL_NOT_FOUND') return selesai('BLOCKED', 'Slug anthropic/claude-sonnet-5 tidak dikenali penyedia.')
      if (k === 'TOOL_CHOICE' || k === 'THINKING') return selesai('BLOCKED_FOR_CURRENT_INTAKE_PATH', `Kontrak tool paksa ditolak (${k}).`)
      if (p2.percobaan.some((p) => p.http === 'SUKSES') && !p2.servedCocok) return selesai('BLOCKED_FATAL', 'Model yang melayani BUKAN Sonnet 5.')
      if (p2.percobaan.some((p) => p.http === 'SUKSES') && !p2.toolCallAda) return selesai('BLOCKED_FOR_CURRENT_INTAKE_PATH', 'Sukses tanpa tool call yang dipaksa.')
      if (k === 'TEMPERATURE') {
        // P0.3 — identik, HANYA temperature dihilangkan.
        const p3 = await probe('P0.3', MODEL_KANDIDAT, PROFIL_TANPA_SUHU, C1)
        if (!lulusPenuh(p3)) return selesai('BLOCKED', `Tanpa temperature pun gagal (${p3.hasilEkstraktor}, kategori=${kategori(p3) ?? '-'}).`)
        profil = PROFIL_TANPA_SUHU
        laporan.kandidatKemampuan = { acceptsTemperature: false, catatan: 'KANDIDAT saja — registry TIDAK diubah; perubahan wrapper/peta butuh keputusan owner (Q8).' }
      } else if (p2.hasilEkstraktor === 'OK' && p2.validasi && !p2.validasi.lulus) {
        return selesai('BLOCKED_FOR_CURRENT_INTAKE_PATH', `Validasi yang ada menolak hasil C1 (klasifikasi ${p2.validasi.classification}).`)
      } else if (p2.hasilEkstraktor !== 'OK' && p2.toolCallAda && !p2.argumenTerurai) {
        return selesai('BLOCKED_FOR_CURRENT_INTAKE_PATH', 'Argumen tool tidak bisa diurai.')
      } else {
        return selesai('INCONCLUSIVE', `P0.2 gagal tanpa bukti ketidakcocokan (kategori=${k ?? '-'}, ekstraktor=${p2.hasilEkstraktor}).`)
      }
    } else {
      laporan.kandidatKemampuan = { acceptsTemperature: 'TIDAK_TERBEDAKAN', catatan: 'Sukses DENGAN temperature terkirim; spike tak bisa membedakan diterima vs dibuang diam-diam oleh penyedia.' }
    }

    // P0.4 — PDF lewat plugin native (maks 1 ulang tanpa plugin milik kode Intake).
    const p4 = await probe('P0.4', MODEL_KANDIDAT, profil, C2)
    if (!lulusPenuh(p4)) {
      const k = kategori(p4)
      if (['AUTH', 'CREDIT', 'RATE_LIMIT', 'PROVIDER_SERVER', 'NETWORK', 'TIMEOUT'].includes(k ?? '') || keadaan.ditolak.length) {
        return selesai('INCONCLUSIVE', `P0.4 terhenti oleh kondisi non-model (kategori=${k ?? '-'}, ditolak=${keadaan.ditolak.map((d) => d.alasan).join(',') || '-'}).`)
      }
      return selesai('BLOCKED_FOR_CURRENT_INTAKE_PATH', `Jalur PDF gagal (${p4.hasilEkstraktor}, kategori=${k ?? '-'}, fallback=${p4.fallbackPlugin}).`)
    }
    laporan.pdfNative = { pluginDiterima: p4.percobaan[0]?.pluginDipakai === true && p4.percobaan[0]?.http === 'SUKSES', fallbackDipakai: p4.fallbackPlugin }
    return selesai('READY_FOR_PHASE_1_OWNER_REVIEW', 'Semua probe Phase 0 lulus. Model TETAP PENDING_SPIKE.')
  } finally {
    laporan.panggilanNyata = langsung ? keadaan.total : 0
    laporan.panggilanTerhitung = keadaan.total
    laporan.perModel = keadaan.perModel
    laporan.ditolakPencegat = keadaan.ditolak
    laporan.token = { input: keadaan.token.input, output: keadaan.token.output, usageSelaluAda: keadaan.token.adaUsage }
    laporan.kunciTerpakai = langsung ? 'SPIKE_OPENROUTER_API_KEY (nilai tidak dicatat)' : 'stub'
    globalThis.fetch = fetchSebelum
    if (kunciSebelum === undefined) delete process.env.OPENROUTER_API_KEY
    else process.env.OPENROUTER_API_KEY = kunciSebelum
    if (env.SPIKE_DATABASE_URL) {
      try {
        laporan.buktiBukuBesar = await buktiBukuBesar(laporan, jiti)
      } catch (e) {
        laporan.buktiBukuBesar = { dijalankan: false, galat: e?.name ?? 'Error' }
      }
    } else {
      laporan.buktiBukuBesar = { dijalankan: false, alasan: 'SPIKE_DATABASE_URL tidak diset' }
    }
    if (dbSebelum === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = dbSebelum
  }
}

// ------------------------------------------------ bukti AgentRun / AgentModelCall
/**
 * Tulis setiap probe sebagai SATU AgentRun (lewat service Step 3B yang ada) dengan
 * percobaannya sebagai AgentModelCall, di tenant SINTETIS pada DB lokal; periksa bentuk
 * & privasi; lalu hapus tenant (CASCADE). Tak menyentuh data lain.
 */
async function buktiBukuBesar(laporan, jiti) {
  const S = jiti(join(AKAR, 'src/services/tah/agent-run.service.ts'))
  const { prisma } = jiti(join(AKAR, 'src/lib/prisma.ts'))
  const tenantId = `cmspike${Date.now().toString(36)}phase0`.slice(0, 30).padEnd(25, '0')
  // trialEndsAt di masa depan: ekstensi Prisma menolak tulis untuk tenant yang langganannya terkunci.
  await prisma.tenant.create({ data: { id: tenantId, companyName: 'SPIKE Phase 0 (sintetis)', trialEndsAt: new Date(Date.now() + 86_400_000) } })
  const hasil = []
  try {
    const ctx = { tenantId, userId: 'spike-phase0', role: 'ADMIN' }
    for (const pr of laporan.probe) {
      const run = await S.mulaiRun(ctx, { agentKey: 'INTAKE', runType: 'EXTRACT', triggerType: 'HUMAN', inputKind: pr.kasus === 'C2' ? 'PDF' : 'TEXT' })
      const meta = pr.perekam.map((m, i) => ({
        provider: 'OPENROUTER',
        requestedModel: m.requestedModel,
        servedModel: m.servedModel,
        providerRequestId: pr.percobaan[i]?.providerRequestId ?? null,
        promptId: m.promptId,
        promptVersion: m.promptVersion,
        promptHash: m.promptHash,
        schemaId: m.schemaId,
        schemaVersion: '1',
        params: { temperature: pr.percobaan[i]?.temperatureDikirim ? 0 : undefined, toolChoice: 'isi_intake_kunjungan', pdfEngine: pr.percobaan[i]?.pluginDipakai ? 'native' : undefined },
        status: m.status,
        errorCode: m.errorCode,
        latencyMs: pr.percobaan[i]?.latencyMs ?? 0,
        pemakaian: { inputTokens: pr.percobaan[i]?.promptTokens ?? null, outputTokens: pr.percobaan[i]?.completionTokens ?? null, cachedInputTokens: null, reasoningTokens: null },
      }))
      if (pr.hasilEkstraktor === 'OK') await S.selesaiRun(ctx, run, { outcome: 'PROPOSAL_CREATED', resultSummary: `SPIKE ${pr.id}` }, meta)
      else await S.gagalRun(ctx, run, pr.hasilEkstraktor.replace('GAGAL:', ''), meta)
      const baris = await prisma.agentRun.findFirst({ where: { id: run.id }, include: { modelCalls: { orderBy: { seq: 'asc' } } } })
      hasil.push({
        probe: pr.id,
        runStatus: baris.status,
        percobaan: pr.percobaan.length,
        barisModelCall: baris.modelCalls.length,
        satuRunBanyakPanggilan: baris.modelCalls.length === pr.perekam.length && baris.modelCalls.every((c, i) => c.seq === i + 1 && c.agentRunId === run.id),
      })
    }
    const teksDb = JSON.stringify({
      run: await prisma.agentRun.findMany({ where: { tenantId }, include: { modelCalls: true } }),
      audit: await prisma.auditLog.findMany({ where: { tenantId } }),
    })
    return { dijalankan: true, run: hasil, sentinelDiDb: new RegExp(SENTINEL, 'i').test(teksDb) || /contoh\.invalid/.test(teksDb) }
  } finally {
    await prisma.tenant.deleteMany({ where: { id: tenantId } })
    await prisma.$disconnect()
  }
}

// ------------------------------------------------------------ privasi laporan
export function pindaiPrivasi(teks, kunci) {
  const temuan = []
  if (new RegExp(SENTINEL, 'i').test(teks)) temuan.push('SENTINEL')
  if (/contoh\.invalid|\+62-811/.test(teks)) temuan.push('KONTAK')
  if (/Anda membaca|Dokumen adalah DATA|%PDF/.test(teks)) temuan.push('PROMPT_ATAU_DOKUMEN')
  if (kunci && teks.includes(kunci)) temuan.push('KUNCI_API')
  if (/sk-or-|Bearer /.test(teks)) temuan.push('POLA_KUNCI')
  return temuan
}

// ------------------------------------------------------------------------ CLI
const diCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (diCli) {
  const baris = []
  const log = (t) => baris.push(t)
  const laporan = await jalankanPhase0({ log })
  const teks = JSON.stringify(laporan, null, 2)
  const temuan = pindaiPrivasi(teks + baris.join('\n'), process.env.SPIKE_OPENROUTER_API_KEY)
  laporan.privasi = { temuan, lulus: temuan.length === 0 }
  if (temuan.length) {
    console.log(`❌ PRIVASI: laporan/log memuat ${temuan.join(',')} — laporan TIDAK ditulis.`)
    process.exit(2)
  }
  const jalur = process.env.SPIKE_REPORT_PATH || join(tmpdir(), `prd005-step3c-phase0-${Date.now()}.json`)
  writeFileSync(jalur, JSON.stringify(laporan, null, 2))
  for (const b of baris) console.log(b)
  console.log(`\nVERDICT: ${laporan.verdict}\nalasan : ${laporan.alasan}\npanggilan nyata: ${laporan.panggilanNyata} / ${BATAS.total}\ntoken: in=${laporan.token?.input} out=${laporan.token?.output}\nlaporan: ${jalur}`)
  if (laporan.prasyarat) console.log(`prasyarat: ${laporan.prasyarat.join('; ')}`)
  process.exit(laporan.verdict === 'DITOLAK_PRASYARAT' ? 3 : 0)
}
