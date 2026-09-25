// PRD-005 Step 3C — CONTROLLED EVALUATION 1 — HARNESS BERPAGAR (tahap E2: LURING SAJA).
//
// Menilai ekstraksi Intake SUNGGUHAN (ekstrakLewatOpenRouter → chatCompletionMeta →
// validasiEkstraksi) terhadap ground truth BEKU eval1-cases.mjs, dengan penilai
// spike-eval1-scorer.mjs. Spike, BUKAN kode produksi: registry, TAH_INTAKE_MODEL,
// OPENROUTER_SPK_MODEL tidak disentuh; Sonnet 5 tetap PENDING_SPIKE.
//
// ── Mode ──────────────────────────────────────────────────────────────────────────────────
//   (bawaan) RENCANA   `node prisma/spike-eval1.mjs` — cek integritas GT beku, rencana panggilan,
//                      prasyarat. TANPA eksekusi, TANPA jaringan.
//   LURING (API)       jalankanEval1({ fetchStub }) — seluruh rencana lewat kode ekstraksi asli,
//                      penyedia DIGANTI stub. fetch global DIBLOKIR; panggilan jaringan = 0.
//   LANGSUNG           `--live` + semua prasyarat. SAAT INI SELALU DITOLAK: eksekutor ledger E2E
//                      belum diimplementasikan (butuh persetujuan owner tersendiri).
//
// ── Pagar (dicek SEBELUM panggilan penyedia apa pun) ────────────────────────────────────
//   • hash kanonik GT & sha256 berkas fixture = nilai beku; himpunan kasus = 15 persis; GT
//     dibekukan-dalam (deep-freeze) di memori; laporan tak boleh ditulis di dalam repo.
//   • frasa otorisasi BARU (bukan frasa Phase 0), NODE_ENV ≠ production, OPENROUTER_API_KEY
//     shell kosong, kunci khusus SPIKE_OPENROUTER_API_KEY, DB spike hanya localhost.
//   • host tunggal, allowlist 2 model, rencana 51 ≤ maks 60, biaya keras US$3,00 / berhenti
//     lunak US$2,70, token 400k/60k, usage.cost wajib ada; tak ada ulang selain SATU ulang
//     tanpa plugin PDF milik kode Intake.
//   • kunci/frasa/isi dokumen/kontak tak pernah masuk laporan; laporan dipindai sebelum ditulis.

import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as F from './fixtures/spike-intake/eval1-cases.mjs'
import * as S from './spike-eval1-scorer.mjs'
import { kategoriGalat } from './spike-model-compat.mjs'

const AKAR = fileURLToPath(new URL('..', import.meta.url))
export const BERKAS_FIXTURE = join(AKAR, 'prisma/fixtures/spike-intake/eval1-cases.mjs')

// ------------------------------------------------------------------ nilai BEKU (owner)
export const HASH_GT_BEKU = '37af32761620ed8389889112a92866f648cc0d9ab4da5111037c5ca19e4b1423'
export const SHA_BERKAS_BEKU = '187e4b7e4cec3ecdd1f175d61341b8b8dd15d289f237b574f56b70298b91d3bd'
export const ID_KASUS_EVAL1 = Object.freeze(['E01', 'E02', 'E03', 'E04', 'E05', 'E06', 'E07', 'E08', 'E09', 'E10', 'E12', 'E13', 'E14', 'E15', 'E16'])

export const FRASA_OTORISASI_EVAL1 = 'PRD-005-STEP3C-EVAL1-LIVE'
export const FRASA_PHASE0 = 'PRD-005-STEP3C-PHASE0'
export const URL_OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions'
export const MODEL_S5 = 'anthropic/claude-sonnet-5'
export const MODEL_S45 = 'anthropic/claude-sonnet-4.5'
export const ALLOWLIST = Object.freeze([MODEL_S45, MODEL_S5])
export const BATAS_OWNER = Object.freeze({
  rencana: 51,
  maksPanggilan: 60,
  biayaKerasUsd: 3.0,
  biayaLunakUsd: 2.7,
  tokenInput: 400_000,
  tokenOutput: 60_000,
})
export const SUBSET_TANPA_SUHU = Object.freeze(['E01', 'E06', 'E08', 'E12'])
export const KASUS_LEDGER_E2E = Object.freeze(['E01', 'E03'])
export const PROFIL_TANPA_SUHU = Object.freeze({ acceptsTemperature: false, supportsForcedToolChoice: true, supportsPdfNative: true })
/** Eksekutor ledger E2E (submitIntake + DB lokal) BELUM ada → mode LANGSUNG gagal tertutup. */
export const LEDGER_E2E_TERIMPLEMENTASI = false
const BATAS_WAKTU_MS = 60_000

// ------------------------------------------------------------------ integritas GT beku
const kanon = (v) => JSON.stringify(v, (k, x) => (typeof x === 'function' ? x.toString() : x))

/** Hash kanonik spesifikasi GT — rumus identik dengan pembekuan E1. */
export function hitungHashGt(mod = F) {
  const spec = {
    versi: mod.EVAL1_VERSI,
    keputusan: mod.KEPUTUSAN_OWNER_EVAL1,
    fieldKritis: mod.FIELD_KRITIS,
    fieldOperasional: mod.FIELD_OPERASIONAL,
    kasus: mod.KASUS_EVAL1.map((k) => ({ id: k.id, kind: k.kind, sentinel: k.sentinel, tanggal: k.tanggal, gt: k.gt })),
  }
  return createHash('sha256').update(kanon(spec)).digest('hex')
}

export const shaBerkas = (isi) => createHash('sha256').update(isi).digest('hex')

/** Galat integritas (kosong = lulus). `mod`/`isiBerkas` bisa disuntik untuk uji mutasi. */
export function verifikasiBeku({ mod = F, isiBerkas } = {}) {
  const galat = []
  let isi = isiBerkas
  try {
    isi = isi ?? readFileSync(BERKAS_FIXTURE)
  } catch {
    return ['FIXTURE_TIDAK_TERBACA']
  }
  if (shaBerkas(isi) !== SHA_BERKAS_BEKU) galat.push('SHA_BERKAS_BERBEDA')
  let h
  try {
    h = hitungHashGt(mod)
  } catch {
    return [...galat, 'FIXTURE_TIDAK_TERURAI']
  }
  if (h !== HASH_GT_BEKU) galat.push('HASH_GT_BERBEDA')
  const ids = (mod.KASUS_EVAL1 ?? []).map((k) => k.id)
  if (ids.length !== 15) galat.push('JUMLAH_KASUS_BUKAN_15')
  if (JSON.stringify(ids) !== JSON.stringify(ID_KASUS_EVAL1)) galat.push('HIMPUNAN_KASUS_BERBEDA')
  if (ids.includes('E11')) galat.push('E11_TERLARANG_DI_EVAL1')
  return galat
}

/** Beku-dalam objek di memori (GT tak bisa diubah harness). */
export function bekukanDalam(o) {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o)) bekukanDalam(v)
    Object.freeze(o)
  }
  return o
}

// ------------------------------------------------------------------ rencana panggilan
/** Rencana beku: kontrol S4.5 → S5 run1 → S5 run2 → subset tanpa temperature → ledger E2E. */
export function susunRencana() {
  const r = []
  const tambah = (blok, model, kasus, profil) => r.push({ seq: r.length + 1, blok, model, kasus, profil })
  for (const id of ID_KASUS_EVAL1) tambah('S45_KONTROL', MODEL_S45, id, 'LEGACY')
  for (const id of ID_KASUS_EVAL1) tambah('S5_RUN1', MODEL_S5, id, 'LEGACY')
  for (const id of ID_KASUS_EVAL1) tambah('S5_RUN2', MODEL_S5, id, 'LEGACY')
  for (const id of SUBSET_TANPA_SUHU) tambah('S5_TANPA_SUHU', MODEL_S5, id, 'TANPA_TEMPERATURE')
  for (const id of KASUS_LEDGER_E2E) tambah('LEDGER_E2E', MODEL_S45, id, 'LEGACY_SUBMIT_INTAKE')
  return r
}

/** Galat rencana/konfigurasi (kosong = lulus). Batas konfigurasi tak boleh melebihi batas owner. */
export function validasiRencana(rencana = susunRencana(), batas = BATAS_OWNER) {
  const galat = []
  for (const [k, v] of Object.entries(BATAS_OWNER)) if (!(typeof batas[k] === 'number' && batas[k] <= v)) galat.push(`BATAS_MELEBIHI_OWNER:${k}`)
  if (rencana.length !== BATAS_OWNER.rencana) galat.push(`RENCANA_BUKAN_${BATAS_OWNER.rencana}:${rencana.length}`)
  if (rencana.length > batas.maksPanggilan) galat.push('RENCANA_MELEBIHI_MAKS')
  const hitung = (b) => rencana.filter((x) => x.blok === b).length
  const harap = { S45_KONTROL: 15, S5_RUN1: 15, S5_RUN2: 15, S5_TANPA_SUHU: 4, LEDGER_E2E: 2 }
  for (const [b, n] of Object.entries(harap)) if (hitung(b) !== n) galat.push(`BLOK_${b}_BUKAN_${n}`)
  if (rencana.some((x) => !ALLOWLIST.includes(x.model))) galat.push('MODEL_DI_LUAR_ALLOWLIST')
  if (rencana.some((x) => !ID_KASUS_EVAL1.includes(x.kasus))) galat.push('KASUS_DI_LUAR_EVAL1')
  return galat
}

// ------------------------------------------------------------------ prasyarat
export function periksaPrasyarat(env, argv = []) {
  const langsung = argv.includes('--live')
  const galat = []
  if (!langsung) return { mode: 'LURING', galat }
  if (env.SPIKE_AUTHORIZED === FRASA_PHASE0) galat.push('SPIKE_AUTHORIZED berisi frasa PHASE 0 — Eval-1 butuh frasa otorisasinya sendiri')
  else if (env.SPIKE_AUTHORIZED !== FRASA_OTORISASI_EVAL1) galat.push('SPIKE_AUTHORIZED tidak sama dengan frasa otorisasi Eval-1')
  if (env.NODE_ENV === 'production') galat.push('NODE_ENV=production ditolak')
  if (!env.SPIKE_OPENROUTER_API_KEY) galat.push('SPIKE_OPENROUTER_API_KEY (kunci uji khusus) tidak diset')
  if (env.OPENROUTER_API_KEY) galat.push('OPENROUTER_API_KEY di shell harus KOSONG (cegah kunci produksi terpakai)')
  if (!env.SPIKE_DATABASE_URL) galat.push('SPIKE_DATABASE_URL (DB lokal untuk bukti ledger G8) tidak diset')
  else {
    let host = '?'
    try {
      host = new URL(env.SPIKE_DATABASE_URL).hostname
    } catch {}
    if (!['localhost', '127.0.0.1', '::1'].includes(host)) galat.push('SPIKE_DATABASE_URL hanya boleh localhost/127.0.0.1')
  }
  if (!LEDGER_E2E_TERIMPLEMENTASI) galat.push('Eksekutor ledger E2E belum diimplementasikan — mode LANGSUNG gagal tertutup')
  return { mode: 'LANGSUNG', galat }
}

// ------------------------------------------------------------------ pencegat penyedia
const angka = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)
export const modelTerlayaniCocok = (diminta, dilayani) =>
  typeof dilayani === 'string' && (dilayani === diminta || [`${diminta}-`, `${diminta}:`, `${diminta}@`].some((p) => dilayani.startsWith(p)))

/**
 * Pencegat: SATU-SATUNYA jalan ke penyedia. Batas dicek SEBELUM panggilan dikirim.
 * `fetchAsli` = stub (luring) atau fetch sungguhan (langsung — belum diizinkan di E2).
 */
export function buatPencegat(fetchAsli, batas = BATAS_OWNER) {
  const s = { panggilan: [], ditolak: [], total: 0, biaya: 0, token: { input: 0, output: 0 }, berhenti: null }
  async function pencegat(url, init = {}) {
    const tolak = (alasan, extra = {}) => {
      s.ditolak.push({ alasan, ...extra })
      throw new Error(`EVAL1_${alasan}`)
    }
    if (String(url) !== URL_OPENROUTER) tolak('HOST_TIDAK_DIIZINKAN')
    let body = {}
    try {
      body = JSON.parse(String(init.body ?? '{}'))
    } catch {}
    if (!ALLOWLIST.includes(body.model)) tolak('MODEL_TIDAK_DIIZINKAN')
    if (s.berhenti) tolak('DIHENTIKAN', { sebab: s.berhenti })
    if (s.total >= batas.maksPanggilan) tolak('BATAS_PANGGILAN')
    if (s.biaya >= batas.biayaLunakUsd) tolak('BERHENTI_LUNAK_BIAYA')
    if (s.token.input >= batas.tokenInput || s.token.output >= batas.tokenOutput) tolak('BATAS_TOKEN')
    s.total++
    const rek = {
      seq: s.total,
      requestedModel: body.model,
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
    } catch {}
    const ok = res.ok && !json.error
    rek.http = ok ? 'SUKSES' : 'GAGAL'
    rek.httpStatus = res.status
    rek.kategoriGalat = ok ? null : kategoriGalat(res.status, json.error?.message)
    rek.servedModel = typeof json.model === 'string' ? json.model.slice(0, 200) : null
    rek.promptTokens = angka(json.usage?.prompt_tokens)
    rek.completionTokens = angka(json.usage?.completion_tokens)
    rek.biayaUsd = angka(json.usage?.cost)
    rek.finishReason = typeof json.choices?.[0]?.finish_reason === 'string' ? json.choices[0].finish_reason.slice(0, 40) : null
    if (ok) {
      s.token.input += rek.promptTokens ?? 0
      s.token.output += rek.completionTokens ?? 0
      if (rek.biayaUsd === null) s.berhenti = 'USAGE_COST_TIDAK_ADA'
      else s.biaya += rek.biayaUsd
      if (!modelTerlayaniCocok(body.model, rek.servedModel)) s.berhenti = 'SERVED_MODEL_BERBEDA'
    }
    if (s.biaya > batas.biayaKerasUsd) s.berhenti = 'BIAYA_KERAS_TERLAMPAUI'
    if (s.token.input > batas.tokenInput || s.token.output > batas.tokenOutput) s.berhenti = s.berhenti ?? 'TOKEN_KERAS_TERLAMPAUI'
    s.panggilan.push(rek)
    return new Response(teks, { status: res.status, headers: res.headers })
  }
  return { pencegat, keadaan: s }
}

// ------------------------------------------------------------------ privasi
/**
 * Temuan privasi pada teks laporan/log. `kasus` = kasus ter-resolve (untuk mendeteksi baris
 * badan dokumen). Pengenal sentinel sintetis BOLEH muncul (bukti per kasus).
 */
export function pindaiPrivasiEval1(teks, { kunci, frasa, kasus = [], rahasiaEnv = [] } = {}) {
  const t = String(teks)
  const temuan = []
  if (kunci && t.includes(kunci)) temuan.push('KUNCI_API')
  if (/sk-or-|Bearer\s/.test(t)) temuan.push('POLA_KUNCI')
  if (frasa && t.includes(frasa)) temuan.push('FRASA_OTORISASI')
  if (/@contoh\.invalid|\+62-000/i.test(t)) temuan.push('KONTAK')
  if (/%PDF|Anda membaca|Dokumen adalah DATA/.test(t)) temuan.push('PROMPT_ATAU_DOKUMEN')
  for (const r of rahasiaEnv) if (r && r.length >= 8 && t.includes(r)) temuan.push('RAHASIA_ENV')
  const baris = kasus.flatMap((k) => (k.kind === 'TEXT' ? k.teks.split('\n') : F.teksSpesifikasiPdf(k.pdf).split('\n'))).map((b) => b.trim())
  if (baris.some((b) => b.length >= 30 && t.includes(b))) temuan.push('BADAN_DOKUMEN')
  return [...new Set(temuan)]
}

// ------------------------------------------------------------------ laporan
/** Ringkas hasil satu kasus TANPA isi dokumen & TANPA nilai kontak. */
function ringkasHasilKasus(h) {
  if (h.ekstraktorGagal) return { id: h.id, kind: h.kind, ekstraktorGagal: true, argumenTidakSah: h.argumenTidakSah ?? null }
  const lap = (L) => ({
    klasifikasi: { got: L.klasifikasi.got, hasil: L.klasifikasi.hasil, keparahan: L.klasifikasi.keparahan },
    jumlah: L.jumlah,
    fatal: L.fatal,
    recall: L.recall,
    halusinasiKritis: L.halusinasiKritis,
    inferensi: L.inferensi,
    kapal: { jumlahGot: L.kapal.jumlahGot, karangan: L.kapal.karangan.length, hilang: L.kapal.hilang.map((k) => k.ref) },
    muatan: { bentuk: L.muatan.bentuk, karangan: L.muatan.karangan.length, hilang: L.muatan.hilang.length },
    terlarang: L.terlarang.map((x) => ({ kode: x.kode, jalur: x.jalur })),
    field: L.baris
      .filter((b) => b.hasil !== 'CORRECT' || b.tanda.includes('KOREKSI_OCR'))
      .map((b) => ({
        jalur: b.jalur,
        hasil: b.hasil,
        keparahan: b.keparahan,
        atribusi: b.atribusi,
        tanda: b.tanda.filter((x) => x === 'KOREKSI_OCR'),
        got: b.generik.startsWith('contact.') ? '[DISENSOR]' : b.got,
      })),
  })
  return { id: h.id, kind: h.kind, RAW: lap(h.RAW), POST: lap(h.POST) }
}

export function tulisLaporan(jalur, laporan) {
  const abs = resolve(jalur)
  if (abs === resolve(AKAR) || abs.startsWith(resolve(AKAR) + sep)) throw new Error('EVAL1_LAPORAN_DI_DALAM_REPO_DITOLAK')
  writeFileSync(abs, JSON.stringify(laporan, null, 2))
  return abs
}

// ------------------------------------------------------------------ inti
/**
 * Jalankan Eval-1. E2: HANYA mode LURING dengan `fetchStub`. Mode LANGSUNG ditolak oleh
 * prasyarat (ledger E2E belum ada). Mengembalikan laporan tersanitasi (tidak menulis berkas).
 */
export async function jalankanEval1({ env = process.env, argv = [], fetchStub = null, hariIni = new Date(), log = () => {}, ledger = null } = {}) {
  const integritas = verifikasiBeku()
  if (integritas.length) return { verdict: 'DITOLAK_INTEGRITAS', galat: integritas, panggilanNyata: 0 }
  const rencana = susunRencana()
  const galatRencana = validasiRencana(rencana)
  if (galatRencana.length) return { verdict: 'DITOLAK_RENCANA', galat: galatRencana, panggilanNyata: 0 }
  const pra = periksaPrasyarat(env, argv)
  if (pra.galat.length) return { verdict: 'DITOLAK_PRASYARAT', mode: pra.mode, galat: pra.galat, panggilanNyata: 0 }
  if (pra.mode === 'LANGSUNG') return { verdict: 'DITOLAK_PRASYARAT', mode: pra.mode, galat: ['LANGSUNG_TIDAK_DIIZINKAN_DI_E2'], panggilanNyata: 0 }
  if (typeof fetchStub !== 'function') return { verdict: 'DITOLAK_PRASYARAT', mode: 'LURING', galat: ['MODE_LURING_BUTUH_STUB'], panggilanNyata: 0 }

  const require = createRequire(import.meta.url)
  const jiti = require('jiti')(fileURLToPath(import.meta.url), { alias: { '@': join(AKAR, 'src') }, interopDefault: true })
  const muat = (rel) => jiti(join(AKAR, rel))
  const X = muat('src/lib/ai/vessel-call-extract.ts')
  const PR = muat('src/lib/ai/perekam-panggilan.ts')
  const P = muat('src/services/intake/intake-policy.ts')
  const V = muat('src/lib/vessels.ts')
  const NORM_VALIDASI = { imo: V.normalisasiImo, imoSah: V.imoCheckDigitSah, mmsi: V.normalisasiMmsi, mmsiSah: V.mmsiSah, callSign: V.normalisasiCallSign }
  const NORM_SKOR = {
    namaKapal: P.normalisasiNamaKapal,
    namaPort: P.normalisasiNamaPort,
    namaPihak: P.normalisasiNamaPihak,
    unlocode: P.normalisasiUnlocode,
    imo: V.normalisasiImo,
    mmsi: V.normalisasiMmsi,
    callSign: V.normalisasiCallSign,
  }

  bekukanDalam(F.KASUS_EVAL1)
  const kasusTerurai = bekukanDalam(F.bangunKasusEval1(hariIni))
  const petaKasus = new Map(kasusTerurai.map((k) => [k.id, k]))
  const hariIso = new Date(hariIni).toISOString().slice(0, 10)

  const fetchSebelum = globalThis.fetch
  const kunciSebelum = process.env.OPENROUTER_API_KEY
  let jaringanTerblokir = 0
  const { pencegat, keadaan } = buatPencegat(fetchStub)
  // fetch global = pencegat → stub. Jalur jaringan sungguhan tidak tersedia sama sekali.
  globalThis.fetch = (url, init) => {
    if (String(url) !== URL_OPENROUTER) {
      jaringanTerblokir++
      return Promise.reject(new Error('EVAL1_JARINGAN_DIBLOKIR'))
    }
    return pencegat(url, init)
  }
  process.env.OPENROUTER_API_KEY = 'stub-kunci-eval1-luring-000000'

  const slot = []
  try {
    const pdfCache = new Map()
    for (const r of rencana) {
      const k = petaKasus.get(r.kasus)
      if (r.blok === 'LEDGER_E2E') {
        slot.push({ ...r, status: 'TIDAK_DIIMPLEMENTASIKAN', panggilan: [] })
        continue
      }
      if (keadaan.berhenti || keadaan.ditolak.some((d) => ['BATAS_PANGGILAN', 'BERHENTI_LUNAK_BIAYA', 'BATAS_TOKEN'].includes(d.alasan))) {
        slot.push({ ...r, status: 'TIDAK_DIJALANKAN', sebab: keadaan.berhenti ?? 'BATAS', panggilan: [] })
        continue
      }
      let masukan
      if (k.kind === 'PDF') {
        if (!pdfCache.has(k.id)) pdfCache.set(k.id, await F.bangunPdfEval1(k))
        masukan = { kind: 'PDF', bytes: pdfCache.get(k.id), filename: k.pdf.namaBerkas }
      } else masukan = { kind: 'TEXT', text: P.normalisasiTeksSumber(k.teks) }
      const idx = keadaan.panggilan.length
      let raw = null
      let galat = null
      try {
        raw = await PR.jalankanDenganKonteks({ model: r.model, kemampuan: r.profil === 'TANPA_TEMPERATURE' ? PROFIL_TANPA_SUHU : null, catat: () => {} }, () =>
          X.ekstrakDenganBatasWaktu(X.ekstrakLewatOpenRouter, masukan, BATAS_WAKTU_MS),
        )
      } catch (e) {
        galat = typeof e?.kode === 'string' ? e.kode : 'ERROR'
      }
      let post = null
      // Argumen tak sah tidak pernah diteruskan ke validator/penilai sebagai ekstraksi.
      if (raw !== null && raw !== undefined && S.masalahArgumen(raw).length === 0) {
        post = P.validasiEkstraksi(raw, { inputKind: k.kind, sourceText: k.kind === 'TEXT' ? masukan.text : null, hariIni: hariIso, norm: NORM_VALIDASI })
      }
      const hasil = S.nilaiKasus(k, raw ?? null, post, NORM_SKOR)
      const status = galat ? `GAGAL:${galat}` : hasil.argumenTidakSah ? `GAGAL:ARGUMEN_TIDAK_SAH:${hasil.argumenTidakSah.join('+')}` : 'OK'
      slot.push({ ...r, status, panggilan: keadaan.panggilan.slice(idx), hasil })
      log(`  ${String(r.seq).padStart(2)} ${r.blok.padEnd(13)} ${r.kasus} → ${galat ? 'GAGAL:' + galat : 'OK'}; FATAL(POST)=${hasil.POST?.jumlah.FATAL ?? '-'}`)
    }
  } finally {
    globalThis.fetch = fetchSebelum
    if (kunciSebelum === undefined) delete process.env.OPENROUTER_API_KEY
    else process.env.OPENROUTER_API_KEY = kunciSebelum
  }

  const run = (blok) => {
    const xs = slot.filter((x) => x.blok === blok && x.hasil)
    const hasil = xs.map((x) => x.hasil)
    return { hasil, ringkas: S.ringkasRun(hasil, { latensiMs: xs.flatMap((x) => x.panggilan.map((p) => p.latencyMs)), jumlahKasusDiharapkan: blok === 'S5_TANPA_SUHU' ? 4 : 15 }) }
  }
  const s5 = [run('S5_RUN1'), run('S5_RUN2')]
  const s45 = run('S45_KONTROL')
  const tanpaSuhu = run('S5_TANPA_SUHU')
  const pelanggaranPagar = keadaan.ditolak.filter((d) => ['HOST_TIDAK_DIIZINKAN', 'MODEL_TIDAK_DIIZINKAN'].includes(d.alasan)).map((d) => d.alasan)
  if (jaringanTerblokir) pelanggaranPagar.push('PERCOBAAN_JARINGAN_LAIN')
  const operasional = {
    lengkap: [s5[0], s5[1], s45].every((r) => r.ringkas.lengkap),
    dihentikan: !!keadaan.berhenti || slot.some((x) => x.status === 'TIDAK_DIJALANKAN'),
    pelanggaranPagar,
    servedCocok: keadaan.berhenti !== 'SERVED_MODEL_BERBEDA',
  }
  const gerbang = S.evaluasiGerbang({ s5, s45, operasional, ledger })

  const laporan = {
    spike: 'PRD-005 Step 3C Controlled Evaluation 1',
    mode: 'LURING_STUB',
    versiPenilai: S.VERSI_PENILAI,
    versiGt: F.EVAL1_VERSI,
    hashGt: HASH_GT_BEKU,
    tanggalEksekusi: hariIso,
    rencana: { direncanakan: rencana.length, maks: BATAS_OWNER.maksPanggilan },
    batas: BATAS_OWNER,
    panggilanNyata: 0,
    panggilanStub: keadaan.total,
    biayaStubUsd: Number(keadaan.biaya.toFixed(6)),
    token: keadaan.token,
    berhenti: keadaan.berhenti,
    ditolakPencegat: keadaan.ditolak,
    jaringanTerblokir,
    ringkasan: { S5_RUN1: s5[0].ringkas, S5_RUN2: s5[1].ringkas, S45_KONTROL: s45.ringkas, S5_TANPA_SUHU: tanpaSuhu.ringkas },
    gerbang: gerbang.gerbang,
    verdict: gerbang.verdict,
    catatan: gerbang.catatan,
    slot: slot.map((x) => ({
      seq: x.seq,
      blok: x.blok,
      kasus: x.kasus,
      model: x.model,
      profil: x.profil,
      status: x.status,
      panggilan: x.panggilan,
      hasil: x.hasil ? ringkasHasilKasus(x.hasil) : null,
    })),
  }
  const temuan = pindaiPrivasiEval1(JSON.stringify(laporan), { kunci: env.SPIKE_OPENROUTER_API_KEY, frasa: FRASA_OTORISASI_EVAL1, kasus: kasusTerurai, rahasiaEnv: [env.SPIKE_DATABASE_URL, env.DATABASE_URL] })
  laporan.privasi = { temuan, lulus: temuan.length === 0 }
  if (verifikasiBeku().length) laporan.integritasAkhir = 'BERUBAH_SELAMA_RUN'
  return laporan
}

// ------------------------------------------------------------------------ CLI (RENCANA)
const diCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (diCli) {
  const integritas = verifikasiBeku()
  const rencana = susunRencana()
  const galatRencana = validasiRencana(rencana)
  const pra = periksaPrasyarat(process.env, process.argv.slice(2))
  console.log('PRD-005 Step 3C — Eval-1 harness (E2: RENCANA, tanpa eksekusi, tanpa jaringan)')
  console.log(`integritas GT beku : ${integritas.length ? 'GAGAL ' + integritas.join(',') : 'OK'} (hash ${HASH_GT_BEKU.slice(0, 16)}…)`)
  console.log(`rencana panggilan  : ${rencana.length} / maks ${BATAS_OWNER.maksPanggilan} ${galatRencana.length ? 'GAGAL ' + galatRencana.join(',') : 'OK'}`)
  console.log(`mode diminta       : ${pra.mode}${pra.galat.length ? '\nprasyarat DITOLAK  : ' + pra.galat.join('; ') : ''}`)
  console.log('Tidak ada panggilan penyedia yang dilakukan.')
  process.exit(integritas.length || galatRencana.length || pra.galat.length ? 3 : 0)
}
