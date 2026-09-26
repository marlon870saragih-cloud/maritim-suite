// PRD-005 E5 Step 14 — EVAL-3 HELD-OUT — RUNNER (pipa produksi + gagal-tertutup + diagnostik tersanitasi).
//
// Step 14 = LURING SAJA. Mode live BELUM diotorisasi; frasa usulan FRASA_OTORISASI_EVAL3 tidak berlaku
// sampai owner menyetujuinya secara eksplisit. Runner ini TIDAK mengubah Eval-1/Eval-2 dan MEMAKAI ULANG:
//   • pencegat penyedia Eval-1 (host tunggal, allowlist, batas panggilan/biaya lunak/token, usage.cost wajib);
//   • pagar served KETAT Eval-2 (served === requested persis) + pemindai privasi & penulis laporan;
//   • penilai Eval-1 (scorer-1, tak diubah) + diagnostik slot Eval-2; gerbang G1–G14 dari spike-eval3-penilai.
// Khas Eval-3:
//   • preflight mengikat hash GT, SHA fixture, jumlah kasus, identitas Prompt v3 NYATA (id/versi/skema/hash),
//     konfigurasi gerbang, rencana 110/125 — satu saja berbeda → 0 panggilan;
//   • pagar SLOT: tepat satu panggilan per slot (tanpa ulang diam-diam), model diminta = model slot,
//     tanpa larik fallback (`models`/`route`), nol panggilan selama probe buku besar;
//   • pagar PROYEKSI biaya sebelum SETIAP panggilan; plafon per panggilan diturunkan dari bukti Eval-2 LIVE
//     (PROVENANS_PLAFON_EVAL3, dihitung ulang & diikat Prompt v3) — provenans hilang/rusak → 0 panggilan;
//   • galat transport/HTTP/served/validator/penilai → run BERHENTI (tak membakar anggaran pada jalur rusak);
//   • P1 (turunanTinjauanIntake) dilampirkan per slot sebagai DIAGNOSTIK — tak pernah dihitung benar;
//   • buku besar Sonnet 5: probe PENOLAKAN produksi (TAH_INTAKE_MODEL=Sonnet 5 → MODEL_TIDAK_TERVERIFIKASI,
//     0 panggilan) + E2E TINGKAT HARNESS lewat layanan TAH (mulaiRun → konteks model → selesaiRun)
//     + probe gagal-tertutup produksi (INSERT AgentRun ditolak → 0 panggilan) + pindai sentinel + nol sisa.
//     submitIntake produksi TIDAK dapat menjalankan Sonnet 5 selama registri PENDING_SPIKE — registri
//     TIDAK diubah; ini keputusan terbuka untuk owner (lihat laporan Step 14).
//
// ── Menjalankan ─────────────────────────────────────────────────────────────────────────
//   Luring (stub deterministik dari GT; DRY_RUN / NON-LIVE; nol panggilan penyedia):
//     node prisma/spike-eval3-runner.mjs --mode offline --report /tmp/eval3-dry.json
//   Langsung: BELUM DIOTORISASI (Step 14). Tanpa argumen → hanya cetak integritas & rencana.

import { createRequire } from 'node:module'
import { createHash, randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as H from './spike-eval1.mjs'
import * as R1 from './spike-eval1-runner.mjs'
import * as S from './spike-eval1-scorer.mjs'
import * as B2 from './spike-eval2-beku.mjs'
import * as R2 from './spike-eval2-runner.mjs'
import * as F from './fixtures/spike-intake/eval3-cases.mjs'
import * as B from './spike-eval3-beku.mjs'
import * as E from './spike-eval3-penilai.mjs'

const AKAR = fileURLToPath(new URL('..', import.meta.url))

export const VERSI_RUNNER_EVAL3 = 'prd005-e5-eval3/runner-1'
/** USULAN — belum diotorisasi. Hanya frasa ini (persis) yang kelak membuka mode live Eval-3. */
export const FRASA_OTORISASI_EVAL3 = 'PRD-005-E5-EVAL3-LIVE'
/** Frasa run terdahulu: TIDAK PERNAH mengotorisasi Eval-3. */
export const FRASA_LAMA = Object.freeze([H.FRASA_OTORISASI_EVAL1, H.FRASA_PHASE0, R2.FRASA_OTORISASI_EVAL2])
export const MODE = R1.MODE
export const TRANSPORT = R1.TRANSPORT
export const LABEL_DRY = R1.LABEL_DRY
export const LABEL_LIVE = R1.LABEL_LIVE
export const KUNCI_STUB = 'stub-kunci-eval3-runner-luring-000000'
export const AWALAN_TENANT = 'e5eval3'
export const NAMA_TENANT = 'E5-EVAL3 (sintetis, dibuang)'
export const HOST_DB_LOOPBACK = Object.freeze(['127.0.0.1', 'localhost'])
/**
 * PROVENANS PLAFON BIAYA PANGGILAN PERTAMA (Step 14B C1, disetujui owner; provenans Step 14C).
 * Hanya AGREGAT tersanitasi dari laporan Eval-2 LIVE terotorisasi (Step 6B) — laporan itu sendiri TIDAK
 * disimpan di repo (tanpa respons model, dokumen, sentinel, kunci, kontak, URL DB). Cukup untuk menghitung
 * ULANG plafon secara independen (check-eval3-runner D1*):
 *   dasar  = max(maksSonnet45, maksSonnet5, pasanganLedger)  — 2 panggilan ledger tak berbiaya per panggilan di
 *            laporan; total keduanya (0,895423 − 0,865936 untuk 78 slot) = batas atas SATU panggilan;
 *   faktor = max(1, (karakterPromptV3 + karakterDokumenEval3Maks) / (karakterPromptV2 + karakterDokumenEval2Min))
 *            — masukan Eval-3 TERBESAR vs masukan Eval-2 TERKECIL, dikenakan ke SELURUH biaya;
 *   plafon = ceil6(dasar × faktor) = US$0,043379.
 * Karakter = system prompt + "\n" + JSON skema tool; dokumen = panjang teks kasus pada hari 2026-09-26.
 */
export const RUMUS_PLAFON_EVAL3 = 'ceil6(max(maksSonnet45Usd, maksSonnet5Usd, pasanganLedgerUsd) * max(1, (karakterPromptV3 + karakterDokumenEval3Maks) / (karakterPromptV2 + karakterDokumenEval2Min)))'
export const PROVENANS_PLAFON_EVAL3 = Object.freeze({
  bukti: Object.freeze({
    sumber: 'PRD-005 Eval-2 LIVE terotorisasi (Step 6B)',
    runner: 'prd005-e5-eval2/runner-1',
    tanggal: '2026-09-26',
    sha256Laporan: '85c40044887369651cb78bc5bbc4ac4f36c13a1b4b90530cdcd8315dfe7fbcd9',
    panggilanTerotorisasi: 80,
    biayaTotalUsd: 0.895423,
  }),
  biaya: Object.freeze({
    maksSonnet45Usd: 0.015318,
    maksSonnet5Usd: 0.011946,
    pasanganLedgerUsd: 0.029487,
  }),
  masukan: Object.freeze({
    hashPromptV2: '38ded424feb6d56f51f62d3978031916e5bcb01335c9b8517eec3c3c03e29113',
    karakterPromptV2: 6607,
    hashPromptV3: '8e326ac496821be87d5bdf85f0eec8e46ac817a80062a4e0d1b46c3839e67eea',
    karakterPromptV3: 9567,
    karakterDokumenEval2Min: 143,
    karakterDokumenEval3Maks: 363,
    hariDokumen: '2026-09-26',
  }),
  rumus: RUMUS_PLAFON_EVAL3,
  plafonUsd: 0.043379,
})

/** Sidik sha256 JSON kanonik (kunci terurut) seluruh provenans — mutasi field APA PUN (termasuk yang tak menggeser hasil) terdeteksi. */
export function sidikProvenans(prov) {
  const kanon = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, kanon(v[k])])) : v)
  return createHash('sha256').update(JSON.stringify(kanon(prov))).digest('hex')
}
export const SIDIK_PROVENANS_PLAFON_EVAL3 = 'cbde93594a20fe0f2bcb865171288389a6a6b269a8bd2e81797a8d5eba1350e9'

const ceil6 = (x) => Math.ceil(x * 1e6) / 1e6
const positif = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0

/** Hitung ULANG plafon dari provenans tersanitasi (MURNI). Provenans hilang/rusak/tak konsisten → plafonUsd null. */
export function hitungPlafonDariProvenans(prov, { sidik = SIDIK_PROVENANS_PLAFON_EVAL3 } = {}) {
  if (!prov || typeof prov !== 'object' || !prov.bukti || !prov.biaya || !prov.masukan) return { plafonUsd: null, galat: ['PROVENANS_TIDAK_ADA'] }
  const galat = []
  const { bukti, biaya, masukan } = prov
  for (const [g, k] of [['bukti', 'panggilanTerotorisasi'], ['bukti', 'biayaTotalUsd'], ['biaya', 'maksSonnet45Usd'], ['biaya', 'maksSonnet5Usd'], ['biaya', 'pasanganLedgerUsd'], ['masukan', 'karakterPromptV2'], ['masukan', 'karakterPromptV3'], ['masukan', 'karakterDokumenEval2Min'], ['masukan', 'karakterDokumenEval3Maks'], ['', 'plafonUsd']]) {
    if (!positif(g ? prov[g][k] : prov[k])) galat.push(`PROVENANS_TIDAK_SAH:${g ? g + '.' : ''}${k}`)
  }
  for (const [g, k] of [['bukti', 'sha256Laporan'], ['masukan', 'hashPromptV2'], ['masukan', 'hashPromptV3']]) if (!/^[0-9a-f]{64}$/.test(prov[g][k] ?? '')) galat.push(`PROVENANS_TIDAK_SAH:${g}.${k}`)
  if (prov.rumus !== RUMUS_PLAFON_EVAL3) galat.push('PROVENANS_RUMUS_BERBEDA')
  if (galat.length) return { plafonUsd: null, galat }
  if ([biaya.maksSonnet45Usd, biaya.maksSonnet5Usd, biaya.pasanganLedgerUsd].some((v) => v > bukti.biayaTotalUsd)) return { plafonUsd: null, galat: ['PROVENANS_TIDAK_KONSISTEN'] }
  const dasarUsd = Math.max(biaya.maksSonnet45Usd, biaya.maksSonnet5Usd, biaya.pasanganLedgerUsd)
  const faktor = Math.max(1, (masukan.karakterPromptV3 + masukan.karakterDokumenEval3Maks) / (masukan.karakterPromptV2 + masukan.karakterDokumenEval2Min))
  const plafonUsd = ceil6(dasarUsd * faktor)
  if (!positif(plafonUsd)) return { plafonUsd: null, galat: ['PLAFON_TIDAK_FINITE'] }
  if (plafonUsd !== prov.plafonUsd) return { plafonUsd: null, galat: [`PLAFON_TIDAK_SESUAI_PROVENANS:${plafonUsd}≠${prov.plafonUsd}`] }
  if (sidikProvenans(prov) !== sidik) return { plafonUsd: null, galat: ['PROVENANS_SIDIK_BERBEDA'] }
  return { plafonUsd, galat: [], dasarUsd, faktor: Number(faktor.toFixed(6)) }
}

/**
 * Plafon SAAT RUN: provenans wajib konsisten & terikat Prompt v3 NYATA (hash + panjang). Panjang dokumen Eval-3
 * bergantung hari eksekusi (358–365 karakter sepanjang 2026–2027) → plafon = max(plafon beku, hitung ulang dengan
 * dokumen terpanjang hari ini). Tidak pernah di bawah plafon beku.
 */
export function plafonRunEval3(prov, { hashPromptV3, karakterPromptV3, dokumenEval3Maks, sidik }) {
  const h = hitungPlafonDariProvenans(prov, sidik === undefined ? {} : { sidik })
  if (h.galat.length) return h
  const galat = []
  if (hashPromptV3 !== prov.masukan.hashPromptV3) galat.push('PROVENANS_PROMPT_V3_HASH_BERBEDA')
  if (karakterPromptV3 !== prov.masukan.karakterPromptV3) galat.push('PROVENANS_PROMPT_V3_PANJANG_BERBEDA')
  if (!positif(dokumenEval3Maks)) galat.push('DOKUMEN_EVAL3_TIDAK_SAH')
  if (galat.length) return { plafonUsd: null, galat }
  const faktorHariIni = Math.max(1, (karakterPromptV3 + dokumenEval3Maks) / (prov.masukan.karakterPromptV2 + prov.masukan.karakterDokumenEval2Min))
  const plafonUsd = Math.max(prov.plafonUsd, ceil6(h.dasarUsd * faktorHariIni))
  return { plafonUsd, galat: [], dasarUsd: h.dasarUsd, faktor: Number(Math.max(h.faktor, faktorHariIni).toFixed(6)), plafonBekuUsd: prov.plafonUsd, dokumenEval3Maks }
}
export const HASIL_LEDGER_HARNESS = 'NO_PROPOSAL'
const BATAS_WAKTU_MS = 60_000
const STOP_ALASAN = ['BATAS_PANGGILAN', 'BERHENTI_LUNAK_BIAYA', 'BATAS_TOKEN', 'PROYEKSI_BIAYA_KERAS']
const TOLAK_SLOT = ['MODEL_DIMINTA_BERBEDA', 'PERCOBAAN_ULANG', 'FALLBACK_DIMINTA', 'PANGGILAN_DI_LUAR_SLOT', 'PANGGILAN_SAAT_PROBE']

/** Batas run Eval-3 — SEMUA dari RENCANA_EVAL3 beku (110 rencana, maks 125, lunak 2,70, keras 3,00, token). */
export const BATAS_EVAL3 = Object.freeze({
  rencana: F.RENCANA_EVAL3.direncanakan,
  maksPanggilan: F.RENCANA_EVAL3.maksPanggilan,
  biayaLunakUsd: F.RENCANA_EVAL3.biayaLunakUsd,
  biayaKerasUsd: F.RENCANA_EVAL3.biayaKerasUsd,
  tokenInput: F.RENCANA_EVAL3.tokenInputMaks,
  tokenOutput: F.RENCANA_EVAL3.tokenOutputMaks,
})

const ENV_DIKELOLA = ['OPENROUTER_API_KEY', 'DATABASE_URL', 'DIRECT_URL', 'TAH_CORE_ENABLED', 'TAH_INTAKE_MODEL', 'VESSEL_CALL_INTAKE_ENABLED', 'VESSEL_CALL_INTAKE_EXTRACTOR', 'AUTOMATION_MONITORING_ENABLED', 'AUTOMATION_TENANT_IDS']

// ------------------------------------------------------------------ prasyarat
export function periksaBatasEval3(batas) {
  const g = []
  for (const k of ['maksPanggilan', 'biayaLunakUsd', 'biayaKerasUsd', 'tokenInput', 'tokenOutput']) {
    if (!(typeof batas?.[k] === 'number' && Number.isFinite(batas[k]) && batas[k] > 0 && batas[k] <= BATAS_EVAL3[k])) g.push(`BATAS_MELEBIHI_BEKU:${k}`)
  }
  if (batas?.biayaLunakUsd > batas?.biayaKerasUsd) g.push('BATAS_LUNAK_MELEBIHI_KERAS')
  return g
}

/** DB hanya postgres LOOPBACK (127.0.0.1 / localhost) — tanpa `?host=` (soket/host lain) dan tanpa multi-host. */
export function uraiDbLoopback(url) {
  const d = R1.uraiDbLokal(url)
  if (!d.ok) return d
  try {
    const u = new URL(url)
    if (!HOST_DB_LOOPBACK.includes(u.hostname)) return { ok: false, alasan: 'BUKAN_LOOPBACK' }
    if ([...u.searchParams.keys()].some((k) => k.toLowerCase() === 'host')) return { ok: false, alasan: 'PARAMETER_HOST' }
  } catch {
    return { ok: false, alasan: 'TIDAK_TERURAI' }
  }
  return d
}

/**
 * Galat prasyarat (kosong = lolos). Variabel berbahaya dicek di `env` (setelan pemanggil) DAN di
 * process.env nyata. LIVE: frasa Eval-3 PERSIS (frasa Eval-1/Phase 0/Eval-2 ditolak), kunci uji khusus
 * yang BUKAN kunci produksi, DB loopback terisolasi wajib, lingkungan bukan produksi.
 */
export function periksaPrasyaratEval3(env, mode, proses = process.env) {
  const galat = []
  if (mode !== MODE.OFFLINE && mode !== MODE.LIVE) return ['MODE_TIDAK_SAH']
  const dua = (n) => [env[n], proses[n]]
  if (dua('NODE_ENV').includes('production')) galat.push('NODE_ENV=production ditolak')
  if (dua('VERCEL_ENV').includes('production')) galat.push('VERCEL_ENV=production ditolak')
  if (dua('OPENROUTER_API_KEY').some(Boolean)) galat.push('OPENROUTER_API_KEY harus KOSONG (kunci produksi tak pernah dipakai)')
  const kunciUji = env.SPIKE_OPENROUTER_API_KEY
  if (kunciUji && dua('OPENROUTER_API_KEY').includes(kunciUji)) galat.push('KUNCI_UJI_SAMA_DENGAN_KUNCI_PRODUKSI')
  if (dua('TAH_INTAKE_MODEL').some((v) => v !== undefined && v.trim() !== '')) galat.push('TAH_INTAKE_MODEL harus kosong')
  if (dua('OPENROUTER_SPK_MODEL').some((v) => v !== undefined && v.trim() !== '' && v.trim() !== H.MODEL_S45)) galat.push('OPENROUTER_SPK_MODEL harus kosong atau Sonnet 4.5')
  if (dua('VESSEL_CALL_INTAKE_EXTRACTOR').some((v) => v !== undefined && v.trim() !== '' && v.trim() !== 'OPENROUTER')) galat.push('VESSEL_CALL_INTAKE_EXTRACTOR harus kosong/OPENROUTER')
  const spikeDb = env.SPIKE_DATABASE_URL
  if (spikeDb) {
    const d = uraiDbLoopback(spikeDb)
    if (!d.ok) galat.push(`SPIKE_DATABASE_URL hanya boleh postgres loopback 127.0.0.1/localhost (${d.alasan})`)
  } else if (mode === MODE.LIVE) galat.push('SPIKE_DATABASE_URL (DB lokal terisolasi untuk buku besar/G8) wajib untuk mode live')
  for (const n of ['DATABASE_URL', 'DIRECT_URL']) if (dua(n).some((v) => v && v !== spikeDb)) galat.push(`${n} harus kosong atau sama dengan SPIKE_DATABASE_URL`)
  if (mode === MODE.LIVE) {
    if (FRASA_LAMA.includes(env.SPIKE_AUTHORIZED)) galat.push('SPIKE_AUTHORIZED berisi frasa run terdahulu (Eval-1/Phase 0/Eval-2) — Eval-3 butuh frasanya sendiri')
    else if (env.SPIKE_AUTHORIZED !== FRASA_OTORISASI_EVAL3) galat.push('SPIKE_AUTHORIZED tidak sama dengan frasa otorisasi Eval-3')
    if (!kunciUji) galat.push('SPIKE_OPENROUTER_API_KEY (kunci uji khusus) tidak diset')
  }
  return galat
}

/** G12 — check-eval3-gt.mjs wajib lulus pada commit yang sama. */
export function jalankanG12() {
  try {
    execFileSync(process.execPath, [join(AKAR, 'prisma/check-eval3-gt.mjs')], { cwd: AKAR, stdio: 'ignore', timeout: 300_000 })
    return true
  } catch {
    return false
  }
}

// ------------------------------------------------------------------ stub luring
const pilihGt = (n) => (!n || typeof n !== 'object' || !('status' in n) ? null : n.status === 'PRESENT' ? n.value : n.status === 'ACCEPTABLE' ? n.values.find((x) => x !== null) ?? null : null)

/** Keluaran tool "sempurna" DARI GT (ekstraksi setia; kasus non-keagenan memakai kapalBukti). Bukan keluaran model. */
export function jawabanSempurnaEval3(k) {
  const g = k.gt
  const o = { classification: g.classification.values[0] }
  o.vessels = k.kapalBukti
    ? structuredClone(k.kapalBukti)
    : g.vessels.daftar.map((v) => Object.fromEntries(['name', 'imo', 'mmsi', 'callSign', 'vesselType', 'role'].map((f) => [f, pilihGt(v[f])]).filter(([, x]) => x !== null)))
  for (const f of ['portName', 'portUnlocode', 'jetty', 'eta', 'etb', 'etc', 'etd', 'principalName', 'customerName', 'agencyType', 'clientReference', 'requestDate']) {
    const x = pilihGt(g[f])
    if (x !== null) o[f] = x
  }
  o.cargoes = (g.cargoes?.bentukDiterima?.[0] ?? []).map((c) => Object.fromEntries(['name', 'quantity', 'unit', 'operation'].map((f) => [f, pilihGt(c[f])]).filter(([, x]) => x !== null)))
  if (!('status' in g.contact)) {
    const c = Object.fromEntries(['name', 'email', 'phone'].map((f) => [f, pilihGt(g.contact[f])]).filter(([, x]) => x !== null))
    if (Object.keys(c).length) o.contact = c
  }
  return o
}

/** Penyedia stub Eval-3 = stub Eval-2 (dipakai ulang apa adanya; jawaban bawaan = jawabanSempurnaEval3). */
export const buatPenyediaStubEval3 = (kasus, jawab = (k) => jawabanSempurnaEval3(k), opsi = {}) => R2.buatPenyediaStubEval2(kasus, jawab, opsi)

// ------------------------------------------------------------------ pagar
export const modelTerlayaniPersis = R2.modelTerlayaniPersis
export const pagarServedPersis = R2.pagarServedPersis

function tolakPagar(keadaan, alasan, extra = {}) {
  keadaan.ditolak.push({ alasan, ...extra })
  keadaan.berhenti = keadaan.berhenti ?? alasan
  throw new Error(`EVAL3_${alasan}`)
}
const badan = (init) => {
  try {
    return JSON.parse(String(init?.body ?? '{}'))
  } catch {
    return {}
  }
}

/**
 * Pagar SLOT (terluar): hanya panggilan di dalam slot aktif, tepat SATU percobaan per slot (ulang diam-diam
 * → PERCOBAAN_ULANG), model diminta = model slot, tanpa larik/rute fallback, nol panggilan saat probe.
 * Penolakan terjadi SEBELUM transport (0 biaya) dan menghentikan run.
 */
export function pagarSlotEval3(berikut, keadaan, slotAktif) {
  return async (url, init) => {
    const b = badan(init)
    if (slotAktif.nolPanggilan) tolakPagar(keadaan, 'PANGGILAN_SAAT_PROBE')
    if (keadaan.berhenti) tolakPagar(keadaan, 'DIHENTIKAN', { sebab: keadaan.berhenti })
    if (Array.isArray(b.models) || b.route !== undefined || (b.provider && b.provider.allow_fallbacks !== false && b.provider.allow_fallbacks !== undefined)) tolakPagar(keadaan, 'FALLBACK_DIMINTA')
    if (!slotAktif.model) tolakPagar(keadaan, 'PANGGILAN_DI_LUAR_SLOT')
    if (b.model !== slotAktif.model) tolakPagar(keadaan, 'MODEL_DIMINTA_BERBEDA')
    if (slotAktif.percobaan >= 1) tolakPagar(keadaan, 'PERCOBAAN_ULANG')
    slotAktif.percobaan++
    return berikut(url, init)
  }
}

/**
 * Pagar PROYEKSI biaya Eval-3 (di depan pencegat), dicek SEBELUM SETIAP panggilan:
 *   proyeksi = max(plafonUsd, biaya tertinggi yang teramati untuk model itu, biaya tertinggi semua model)
 * Plafon bukti (plafonRunEval3) tetap menjadi LANTAI setelah biaya teramati — proyeksi hanya bisa naik.
 * Plafon/biaya teramati tidak finite atau tidak tersedia → PROYEKSI_TIDAK_TERSEDIA (gagal-tertutup, 0 transport).
 * Biaya berjalan + proyeksi > batas keras → PROYEKSI_BIAYA_KERAS sebelum transport.
 */
export function pagarProyeksiBiayaEval3(berikut, keadaan, batas, plafonUsd) {
  return async (url, init) => {
    const model = badan(init).model
    const finite = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0
    if (!(finite(plafonUsd) && plafonUsd > 0) || !finite(keadaan.biaya) || !finite(batas?.biayaKerasUsd)) tolakPagar(keadaan, 'PROYEKSI_TIDAK_TERSEDIA')
    const teramati = keadaan.panggilan.filter((p) => p.http === 'SUKSES').map((p) => p.biayaUsd)
    if (teramati.some((v) => !finite(v))) tolakPagar(keadaan, 'PROYEKSI_TIDAK_TERSEDIA')
    const biayaModel = keadaan.panggilan.filter((p) => p.requestedModel === model && p.http === 'SUKSES').map((p) => p.biayaUsd)
    const proyeksi = Math.max(plafonUsd, ...biayaModel, ...teramati)
    keadaan.proyeksiBerikutUsd = Number(proyeksi.toFixed(6))
    keadaan.sumberProyeksi = proyeksi > plafonUsd ? 'TERAMATI' : 'PLAFON_BUKTI_EVAL2'
    if (keadaan.biaya + proyeksi > batas.biayaKerasUsd) tolakPagar(keadaan, 'PROYEKSI_BIAYA_KERAS', { biaya: Number(keadaan.biaya.toFixed(6)), proyeksi: keadaan.proyeksiBerikutUsd })
    return berikut(url, init)
  }
}

/** Rantai penyedia: slot → proyeksi biaya → served persis → pencegat Eval-1 → transport. */
export function rakitJalurPenyedia(fetchTransport, batas, { plafonUsd } = {}) {
  const { pencegat, keadaan } = H.buatPencegat(fetchTransport, batas)
  keadaan.proyeksiBerikutUsd = null
  const slotAktif = { model: null, percobaan: 0, nolPanggilan: false }
  const jalur = pagarSlotEval3(pagarProyeksiBiayaEval3(pagarServedPersis(pencegat, keadaan), keadaan, batas, plafonUsd), keadaan, slotAktif)
  return { jalur, keadaan, slotAktif }
}

// ------------------------------------------------------------------ buku besar (G8)
const acak = () => randomBytes(6).toString('hex')
const kodeGalat = (e) => (typeof e?.details?.code === 'string' ? e.details.code : typeof e?.kode === 'string' ? e.kode : typeof e?.code === 'string' ? e.code : 'ERROR')
const KODE_RUN = ['AI_TIMEOUT', 'AI_UNAVAILABLE', 'AI_BAD_RESPONSE', 'VALIDATION_FAILED', 'GATE_CLOSED', 'RUN_ABANDONED', 'INTERNAL']

/**
 * G8 Eval-3 = CONTROLLED EVALUATION LEDGER E2E (Step 14B / C2). Membuktikan layanan buku besar TAH NYATA
 * (mulaiRun/selesaiRun, AgentRun + AgentModelCall tertaut, audit) dengan identitas Sonnet 5 requested/served
 * persis dan identitas Prompt v3 — di HARNESS evaluasi terkendali. TIDAK mengklaim submitIntake produksi
 * menerima Sonnet 5: jalur produksi WAJIB menolak Sonnet 5 selama PENDING_SPIKE (diuji di G8 yang sama).
 */
export const JENIS_G8 = 'CONTROLLED_EVALUATION_LEDGER_E2E'
export const KLAIM_G8 =
  'G8 = controlled evaluation ledger E2E (harness). BUKAN persetujuan produksi Sonnet 5: submitIntake produksi menolak Sonnet 5 (MODEL_TIDAK_TERVERIFIKASI, 0 panggilan, 0 baris) selama PENDING_SPIKE.'

/** Bukti satu jalan buku besar (MURNI): jalan, tautan panggilan model, requested/served persis, identitas prompt, hasil, audit. */
export function periksaBuktiRun(baca, { model, identitas, panggilanPencegat, hasilDiharapkan = HASIL_LEDGER_HARNESS }) {
  const mc = baca?.modelCalls ?? []
  const cek = {
    jalanAda: !!baca,
    statusSucceeded: baca?.status === 'SUCCEEDED',
    hasilCocok: baca?.outcome === hasilDiharapkan,
    agenIntake: baca?.agentKey === 'INTAKE',
    selesai: !!baca?.selesai,
    satuPanggilan: panggilanPencegat === 1 && mc.length === 1,
    tautanPanggilan: mc.length > 0 && mc.every((c, i) => c.seq === i + 1 && c.agentRunId === baca?.id),
    requestedPersis: mc.length > 0 && mc.every((c) => c.requestedModel === model),
    servedPersis: mc.length > 0 && mc.every((c) => c.status === 'OK' && modelTerlayaniPersis(model, c.servedModel)),
    identitasPrompt: mc.length > 0 && mc.every((c) => c.promptId === identitas.idPrompt && c.promptVersion === identitas.versiPrompt && c.schemaVersion === identitas.versiSkema && c.promptHash === identitas.hashPrompt),
    audit: (baca?.audit ?? []).includes('CREATE') && (baca?.audit ?? []).includes('UPDATE'),
  }
  return { cek, lengkap: Object.values(cek).every(Boolean) }
}

/**
 * Urutan buku besar Eval-3 (sama untuk toko Prisma dan toko memori uji):
 *   1. probe PENOLAKAN produksi — submitIntake dengan TAH_INTAKE_MODEL=Sonnet 5 wajib MODEL_TIDAK_TERVERIFIKASI,
 *      0 panggilan, 0 baris (registri PENDING_SPIKE dibuktikan menutup jalur produksi);
 *   2. E2E tingkat harness per slot buku besar: mulaiRun → ekstraksi produksi dalam konteks model slot → validator
 *      → selesaiRun → baca kembali & periksaBuktiRun;
 *   3. probe GAGAL-TERTUTUP produksi — INSERT AgentRun ditolak pemicu → submitIntake melempar, 0 panggilan, 0 baris;
 *   4. pindai sentinel/privasi seluruh baris buku besar; 5. pembersihan + hitung sisa.
 */
export async function jalankanLedgerEval3({ toko, slotLedger, petaKasus, keadaan, slotAktif, ekstrak, validasi, identitas, pindai, log = () => {} }) {
  const bukti = { dijalankan: false, db: null, penolakanProduksi: null, slot: [], probeGagalTertutup: null, sentinelBersih: null, temuanPrivasiLedger: [], pembersihan: null }
  const hasilSlot = new Map()
  const probe = async (fn) => {
    const sebelum = keadaan.total
    const ditolakSebelum = keadaan.ditolak.length
    slotAktif.model = null
    slotAktif.nolPanggilan = true
    let kode = null
    try {
      await fn()
    } catch (e) {
      kode = kodeGalat(e)
    } finally {
      slotAktif.nolPanggilan = false
    }
    return { kode, panggilanPenyedia: keadaan.total - sebelum, percobaanDitolak: keadaan.ditolak.length - ditolakSebelum }
  }
  try {
    bukti.db = await toko.siapkan()
    bukti.dijalankan = true
    const teksProbe = petaKasus.get(slotLedger[0].kasus).teks

    const p1 = await probe(() => toko.submitProduksi('UTAMA', teksProbe, { modelIntake: H.MODEL_S5, ekstrak }))
    const b1 = await toko.hitung('UTAMA')
    bukti.penolakanProduksi = { ...p1, ...b1, ok: p1.kode === 'MODEL_TIDAK_TERVERIFIKASI' && p1.panggilanPenyedia === 0 && p1.percobaanDitolak === 0 && b1.barisIntake === 0 && b1.barisRun === 0 }

    for (const r of slotLedger) {
      const k = petaKasus.get(r.kasus)
      if (keadaan.berhenti) {
        hasilSlot.set(r.seq, { status: 'TIDAK_DIJALANKAN', sebab: keadaan.berhenti })
        continue
      }
      const idx = keadaan.panggilan.length
      const rekam = []
      let status = null
      const run = await toko.mulaiRun('UTAMA', { inputHash: createHash('sha256').update(k.teksNormal).digest('hex') })
      slotAktif.model = r.model
      slotAktif.percobaan = 0
      let raw = null
      try {
        raw = await ekstrak(k, r.model, (m) => rekam.push(m))
      } catch (e) {
        status = `GAGAL:${kodeGalat(e)}`
      } finally {
        slotAktif.model = null
      }
      const panggilan = keadaan.panggilan.slice(idx)
      if (!status && S.masalahArgumen(raw).length) status = 'GAGAL:ARGUMEN_TIDAK_SAH'
      let post = null
      if (!status) {
        try {
          post = validasi(structuredClone(raw), k)
        } catch {
          status = 'GAGAL:VALIDATOR_ERROR'
        }
      }
      if (status) await toko.gagalRun(run, KODE_RUN.includes(status.slice(6)) ? status.slice(6) : 'INTERNAL', rekam)
      else await toko.selesaiRun(run, { outcome: HASIL_LEDGER_HARNESS, resultSummary: `EVAL3_HARNESS ${post.classification}`, outputHash: createHash('sha256').update(JSON.stringify(raw)).digest('hex') }, rekam)
      const baca = await toko.bacaRun(run.id)
      const ev = periksaBuktiRun(status ? null : baca, { model: r.model, identitas, panggilanPencegat: panggilan.length })
      bukti.slot.push({ seq: r.seq, kasus: r.kasus, status: status ?? (ev.lengkap ? 'OK' : 'GAGAL:BUKTI_LEDGER_TIDAK_LENGKAP'), cek: ev.cek, modelCall: (baca?.modelCalls ?? []).map((c) => ({ seq: c.seq, status: c.status, requestedModel: c.requestedModel, servedModel: c.servedModel, promptVersion: c.promptVersion, schemaVersion: c.schemaVersion, promptHashCocok: c.promptHash === identitas.hashPrompt })), panggilanPencegat: panggilan.length })
      hasilSlot.set(r.seq, { status: status ?? (ev.lengkap ? 'OK' : 'GAGAL:BUKTI_LEDGER_TIDAK_LENGKAP') })
      log(`  ${String(r.seq).padStart(3)} ${E.BLOK_LEDGER} ${r.kasus} → ${hasilSlot.get(r.seq).status}`)
    }

    await toko.pasangPemicuTolak('PROBE')
    const p3 = await probe(() => toko.submitProduksi('PROBE', teksProbe, { modelIntake: null, ekstrak }))
    const b3 = await toko.hitung('PROBE')
    bukti.probeGagalTertutup = { ...p3, submitMelempar: p3.kode !== null, ...b3, ok: p3.kode !== null && p3.panggilanPenyedia === 0 && p3.percobaanDitolak === 0 && b3.barisIntake === 0 && b3.barisRun === 0 }

    const teksLedger = await toko.dump()
    const temuan = pindai(teksLedger)
    if (F.POLA_SENTINEL_EVAL3.test(teksLedger)) temuan.push('SENTINEL_DOKUMEN')
    bukti.temuanPrivasiLedger = [...new Set(temuan)]
    bukti.sentinelBersih = temuan.length === 0
  } finally {
    slotAktif.model = null
    slotAktif.nolPanggilan = false
    try {
      bukti.pembersihan = await toko.bersihkan()
    } catch (e) {
      bukti.pembersihan = { bersih: false, galat: e?.name ?? 'Error' }
    }
  }
  const semuaSlot = slotLedger.length > 0 && bukti.slot.length === slotLedger.length && bukti.slot.every((s) => s.status === 'OK')
  const modelTercatat = [...new Set(bukti.slot.flatMap((s) => s.modelCall.flatMap((c) => [c.requestedModel, c.servedModel])))]
  const g8 = {
    sumber: 'LEDGER_EVAL3',
    jenis: JENIS_G8,
    klaim: KLAIM_G8,
    penolakanProduksiS5Ok: bukti.penolakanProduksi?.ok === true,
    probeGagalTertutupOk: bukti.probeGagalTertutup?.ok === true,
    failClosedOk: bukti.penolakanProduksi?.ok === true && bukti.probeGagalTertutup?.ok === true,
    e2eOk: semuaSlot && bukti.pembersihan?.bersih === true,
    sentinelBersih: bukti.sentinelBersih === true,
    modelE2e: semuaSlot && modelTercatat.length === 1 ? modelTercatat[0] : 'TIDAK_KONSISTEN',
  }
  return { bukti, g8, hasilSlot }
}

/** Toko buku besar NYATA: layanan TAH + submitIntake produksi pada DB loopback terisolasi. */
export function buatTokoPrisma({ muat, db }) {
  const I = muat('src/services/intake/intake.service.ts')
  const T = muat('src/services/tah/agent-run.service.ts')
  const { prisma } = muat('src/lib/prisma.ts')
  const tenant = { UTAMA: `${AWALAN_TENANT}${acak()}u`.padEnd(25, '0'), PROBE: `${AWALAN_TENANT}${acak()}p`.padEnd(25, '0') }
  const ctx = {}
  const users = []
  let pemicu = null
  let dbCocok = false
  const semuaTenant = () => Object.values(tenant)
  async function sapuSisa() {
    const lama = await prisma.tenant.findMany({ where: { id: { startsWith: AWALAN_TENANT }, companyName: NAMA_TENANT }, select: { id: true } })
    if (lama.length) {
      const ids = lama.map((t) => t.id)
      const us = await prisma.user.findMany({ where: { tenantId: { in: ids } }, select: { id: true } })
      await prisma.securityEvent.deleteMany({ where: { identifier: { in: us.map((u) => u.id) } } })
      await prisma.tenant.deleteMany({ where: { id: { in: ids } } })
    }
    for (const { tgname } of await prisma.$queryRawUnsafe(`SELECT tgname FROM pg_trigger WHERE tgname LIKE 'e5_eval3_%'`)) await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${tgname}" ON "AgentRun"`)
    await prisma.$executeRawUnsafe(`DO $$ DECLARE f record; BEGIN FOR f IN SELECT proname FROM pg_proc WHERE proname LIKE 'e5_eval3_%' LOOP EXECUTE format('DROP FUNCTION IF EXISTS %I()', f.proname); END LOOP; END $$`)
    return lama.length
  }
  return {
    async siapkan() {
      const [id] = await prisma.$queryRawUnsafe('SELECT current_database() AS db, host(inet_server_addr()) AS host, inet_server_port() AS port')
      if (!(id.db === db.database && Number(id.port) === db.port && ['127.0.0.1', '::1'].includes(id.host))) throw Object.assign(new Error('EVAL3_DB_TERSAMBUNG_BUKAN_LOOPBACK'), { kode: 'DB_TIDAK_COCOK' })
      dbCocok = true
      const sisaDisapu = await sapuSisa()
      const trial = new Date(Date.now() + 7 * 86_400_000)
      for (const [nama, t] of Object.entries(tenant)) {
        await prisma.tenant.create({ data: { id: t, companyName: NAMA_TENANT, trialEndsAt: trial } })
        const u = await prisma.user.create({ data: { tenantId: t, email: `e5-eval3-${t}@uji.invalid`, name: 'E5-EVAL3 runner', password: `!tidak-bisa-login-${acak()}`, role: 'ADMIN', isActive: true } })
        users.push(u)
        ctx[nama] = { tenantId: t, userId: u.id, role: 'ADMIN' }
      }
      process.env.AUTOMATION_TENANT_IDS = semuaTenant().join(',')
      return { cocok: true, host: id.host, port: Number(id.port), database: id.db, loopback: true, sisaDisapu }
    },
    async submitProduksi(nama, teks, { modelIntake }) {
      const lama = process.env.TAH_INTAKE_MODEL
      if (modelIntake) process.env.TAH_INTAKE_MODEL = modelIntake
      else delete process.env.TAH_INTAKE_MODEL
      try {
        return await I.submitIntake(ctx[nama], { text: teks, saveOriginal: false, confirmReprocess: false })
      } finally {
        if (lama === undefined) delete process.env.TAH_INTAKE_MODEL
        else process.env.TAH_INTAKE_MODEL = lama
      }
    },
    mulaiRun: (nama, { inputHash }) => T.mulaiRun(ctx[nama], { agentKey: 'INTAKE', runType: 'EXTRACT', triggerType: 'HUMAN', inputKind: 'TEXT', inputHash }),
    selesaiRun: (run, a, panggilan) => T.selesaiRun(ctx.UTAMA, run, a, panggilan),
    gagalRun: (run, kode, panggilan) => T.gagalRun(ctx.UTAMA, run, kode, panggilan, null),
    async bacaRun(id) {
      const r = await prisma.agentRun.findFirst({ where: { id, tenantId: tenant.UTAMA }, include: { modelCalls: { orderBy: { seq: 'asc' } } } })
      if (!r) return null
      const audit = await prisma.auditLog.findMany({ where: { tenantId: tenant.UTAMA, tableName: 'AgentRun', recordId: id }, orderBy: { createdAt: 'asc' } })
      return { id: r.id, status: r.status, outcome: r.outcome, agentKey: r.agentKey, selesai: !!r.finishedAt && r.lateCompletion === false, modelCalls: r.modelCalls, audit: audit.map((a) => a.action) }
    },
    async hitung(nama) {
      return { barisIntake: await prisma.vesselCallIntake.count({ where: { tenantId: tenant[nama] } }), barisRun: await prisma.agentRun.count({ where: { tenantId: tenant[nama] } }) }
    },
    async pasangPemicuTolak(nama) {
      const f = `e5_eval3_${acak()}`
      await prisma.$executeRawUnsafe(`CREATE FUNCTION "${f}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'E5_LEDGER_TULIS_DITOLAK'; END $$`)
      pemicu = f
      await prisma.$executeRawUnsafe(`CREATE TRIGGER "${f}" BEFORE INSERT ON "AgentRun" FOR EACH ROW WHEN (NEW."tenantId" = '${tenant[nama]}') EXECUTE FUNCTION "${f}"()`)
    },
    async dump() {
      return JSON.stringify({
        run: await prisma.agentRun.findMany({ where: { tenantId: { in: semuaTenant() } }, include: { modelCalls: true } }),
        audit: await prisma.auditLog.findMany({ where: { tenantId: { in: semuaTenant() } } }),
        intake: await prisma.vesselCallIntake.findMany({ where: { tenantId: { in: semuaTenant() } } }),
      })
    },
    async bersihkan() {
      try {
        if (pemicu) {
          await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${pemicu}" ON "AgentRun"`).catch(() => {})
          await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${pemicu}"()`).catch(() => {})
        }
        if (!dbCocok) return { bersih: true, sisaBaris: 0, catatan: 'DB_TIDAK_DISENTUH' }
        await prisma.securityEvent.deleteMany({ where: { identifier: { in: users.map((u) => u.id) } } })
        await prisma.tenant.deleteMany({ where: { id: { in: semuaTenant() } } })
        const ids = { tenantId: { in: semuaTenant() } }
        const sisa =
          (await prisma.tenant.count({ where: { id: { in: semuaTenant() } } })) +
          (await prisma.agentRun.count({ where: ids })) +
          (await prisma.agentModelCall.count({ where: ids })) +
          (await prisma.vesselCallIntake.count({ where: ids })) +
          (await prisma.auditLog.count({ where: ids })) +
          (await prisma.securityEvent.count({ where: { identifier: { in: users.map((u) => u.id) } } })) +
          Number((await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname LIKE 'e5_eval3_%'`))[0].n) +
          Number((await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_proc WHERE proname LIKE 'e5_eval3_%'`))[0].n)
        return { sisaBaris: sisa, bersih: sisa === 0 }
      } finally {
        await prisma.$disconnect().catch(() => {})
      }
    },
  }
}

/**
 * Toko buku besar MEMORI (uji luring): meniru semantik produksi — registri menolak Sonnet 5
 * (MODEL_TIDAK_TERVERIFIKASI sebelum apa pun), pemicu menolak INSERT jalan sebelum AI, baris
 * AgentModelCall dari metadata perekam. `rusak` menyuntik kerusakan untuk uji mutasi.
 */
export function buatTokoLedgerMemori(rusak = {}) {
  const runs = new Map()
  const intake = { UTAMA: 0, PROBE: 0 }
  let pemicu = null
  let n = 0
  const rekam = { runs, intake }
  const buatRun = (nama) => {
    if (pemicu === nama) throw new Error('E5_LEDGER_TULIS_DITOLAK')
    const id = `run-${++n}`
    runs.set(id, { id, tenant: nama, status: 'RUNNING', outcome: null, agentKey: 'INTAKE', selesai: false, modelCalls: [], audit: ['CREATE'], resultSummary: null })
    return { id, agentKey: 'INTAKE' }
  }
  const tutup = (run, data, panggilan) => {
    const r = runs.get(run.id)
    Object.assign(r, data, { selesai: true })
    r.modelCalls = rusak.tanpaModelCall ? [] : panggilan.map((m, i) => ({ agentRunId: rusak.tautanSalah ? 'run-lain' : run.id, seq: i + 1, status: m.status, requestedModel: m.requestedModel, servedModel: rusak.servedTercatat ?? m.servedModel, promptId: m.promptId, promptVersion: rusak.versiPromptTercatat ?? m.promptVersion, promptHash: m.promptHash, schemaVersion: m.schemaVersion }))
    r.audit.push('UPDATE')
  }
  return {
    rekam,
    async siapkan() {
      if (rusak.siapkanGagal) throw Object.assign(new Error('EVAL3_DB_TERSAMBUNG_BUKAN_LOOPBACK'), { kode: 'DB_TIDAK_COCOK' })
      return { cocok: true, host: 'memori', loopback: true, sisaDisapu: 0 }
    },
    async submitProduksi(nama, teks, { modelIntake, ekstrak }) {
      // Registri: Sonnet 5 PENDING_SPIKE → ditolak SEBELUM baris apa pun (kecuali `rusak.registriTerbuka`).
      if (modelIntake === H.MODEL_S5 && !rusak.registriTerbuka) throw Object.assign(new Error('tidak tersedia'), { details: { code: 'MODEL_TIDAK_TERVERIFIKASI' } })
      if (rusak.probeMemanggil && ekstrak) await ekstrak({ teksNormal: teks }, modelIntake ?? H.MODEL_S45, () => {}).catch(() => {})
      const run = buatRun(nama)
      intake[nama]++
      tutup(run, { status: 'SUCCEEDED', outcome: 'PROPOSAL_CREATED' }, [])
      return { intake: { id: `intake-${n}` } }
    },
    async mulaiRun(nama) {
      return buatRun(nama)
    },
    async selesaiRun(run, a, panggilan) {
      tutup(run, { status: 'SUCCEEDED', outcome: rusak.hasilTercatat ?? a.outcome, resultSummary: rusak.sentinelDisimpan ? `${a.resultSummary} ${rusak.sentinelDisimpan}` : a.resultSummary }, panggilan)
      return true
    },
    async gagalRun(run, kode, panggilan) {
      tutup(run, { status: 'FAILED', errorCode: kode }, panggilan)
      return true
    },
    async bacaRun(id) {
      const r = runs.get(id)
      return r ? structuredClone(r) : null
    },
    async hitung(nama) {
      return { barisIntake: intake[nama], barisRun: [...runs.values()].filter((r) => r.tenant === nama).length }
    },
    async pasangPemicuTolak(nama) {
      if (!rusak.pemicuTidakAktif) pemicu = nama
    },
    async dump() {
      return JSON.stringify([...runs.values()])
    },
    async bersihkan() {
      pemicu = null
      const sisa = rusak.sisa ?? 0
      runs.clear()
      return { sisaBaris: sisa, bersih: sisa === 0 }
    },
  }
}

// ------------------------------------------------------------------ privasi laporan
/** Nilai GT (termasuk kapalBukti kasus non-keagenan) yang TIDAK boleh muncul utuh di laporan. */
export function nilaiGtTerlarangEval3(kasus) {
  const out = new Set(R2.nilaiGtTerlarangDiLaporan(kasus))
  for (const k of kasus) for (const v of k.kapalBukti ?? []) for (const x of [v.name, v.imo, v.mmsi, v.callSign]) if (typeof x === 'string' && x.length >= 5) out.add(x)
  // Nama kapal juga tanpa awalan jenis (MV/TB/BG/…) — laporan tak boleh memuat nama inti sekalipun.
  for (const x of [...out]) {
    const inti = x.replace(/^(MV|MT|TB|BG|KM|KMP|SPOB|LCT)\.?\s+/i, '')
    if (inti !== x && inti.length >= 5) out.add(inti)
  }
  return [...out]
}

export function pindaiLaporanEval3(teks, { kunci, kasus, rahasiaEnv = [] }) {
  const t = String(teks)
  const temuan = H.pindaiPrivasiEval1(t, { kunci, frasa: FRASA_OTORISASI_EVAL3, kasus, rahasiaEnv })
  if (FRASA_LAMA.some((f) => t.includes(f))) temuan.push('FRASA_OTORISASI')
  if (F.POLA_SENTINEL_EVAL3.test(t)) temuan.push('SENTINEL_EVAL3')
  const up = t.toUpperCase()
  if (nilaiGtTerlarangEval3(kasus).some((v) => up.includes(v.toUpperCase()))) temuan.push('NILAI_GT_UTUH')
  return [...new Set(temuan)]
}

// ------------------------------------------------------------------ akuntansi
export function ringkasAkuntansi(keadaan, slots) {
  let kumulatif = 0
  const perPanggilan = keadaan.panggilan.map((p) => {
    kumulatif += p.biayaUsd ?? 0
    return { seq: p.seq, model: p.requestedModel, http: p.http, biayaUsd: p.biayaUsd ?? null, kumulatifUsd: Number(kumulatif.toFixed(6)), tokenInput: p.promptTokens ?? null, tokenOutput: p.completionTokens ?? null }
  })
  return {
    percobaanDitolakSebelumTransport: keadaan.ditolak.length,
    panggilanDicoba: keadaan.total,
    panggilanSelesai: keadaan.panggilan.filter((p) => p.http === 'SUKSES').length,
    gagalHttp: keadaan.panggilan.filter((p) => p.http === 'GAGAL').length,
    gagalJaringan: keadaan.panggilan.filter((p) => p.http === 'GAGAL_JARINGAN').length,
    percobaanUlang: keadaan.ditolak.filter((d) => d.alasan === 'PERCOBAAN_ULANG').length + slots.filter((s) => (s.panggilan?.length ?? 0) > 1).length,
    token: { ...keadaan.token },
    biayaUsd: Number(keadaan.biaya.toFixed(6)),
    proyeksiBerikutUsd: keadaan.proyeksiBerikutUsd ?? null,
    sumberProyeksi: keadaan.sumberProyeksi ?? null,
    perPanggilan,
  }
}

const URUTAN_PUTUSAN = ['FAIL', 'INCONCLUSIVE', 'CONDITIONAL', 'PASS']
const terburuk = (...vs) => URUTAN_PUTUSAN.find((v) => vs.includes(v)) ?? 'INCONCLUSIVE'

// ------------------------------------------------------------------ inti
/**
 * Jalankan Eval-3. Mengembalikan laporan tersanitasi (tidak menulis berkas).
 *   offline → transport stub (bawaan: jawaban sempurna dari GT); TIDAK pernah fetch nyata.
 *   live    → fetch global nyata (butuh otorisasi — BELUM ada di Step 14) ATAU `transportUji` (uji; label DRY_RUN).
 * Seam uji ditolak saat transport = jaringan.
 */
export async function jalankanRunnerEval3({
  mode,
  env = process.env,
  hariIni = new Date(),
  log = () => {},
  jawabStub = null,
  opsiStub = {},
  transportUji = null,
  validasiUji = null,
  penilaiUji = null,
  gerbangUji = null,
  bekuUji = null,
  identitasPromptUji = null,
  modGerbangUji = null,
  kasusUji = null,
  rencanaUji = null,
  batasUji = null,
  g12Uji,
  ledgerUji = null,
  modelKonteksUji = null,
  provenansUji,
  sidikProvenansUji,
} = {}) {
  const tolak = (verdict, galat) => ({ label: LABEL_DRY, verdict, mode: mode ?? null, galat, panggilanNyata: 0, panggilanTransport: 0 })
  if (mode !== MODE.OFFLINE && mode !== MODE.LIVE) return tolak('DITOLAK_MODE', ['MODE_WAJIB_EKSPLISIT'])
  const pakaiSeam = !!(validasiUji || penilaiUji || gerbangUji || bekuUji || identitasPromptUji || modGerbangUji || kasusUji || rencanaUji || batasUji || ledgerUji || modelKonteksUji || g12Uji !== undefined || provenansUji !== undefined || sidikProvenansUji !== undefined)
  if (mode === MODE.LIVE && !transportUji && pakaiSeam) return tolak('DITOLAK_PRASYARAT', ['SEAM_UJI_DILARANG_SAAT_JARINGAN'])

  // ── PREFLIGHT (urutan tetap; galat apa pun → 0 panggilan) ──
  const integritas = bekuUji ? bekuUji() : B.verifikasiBekuEval3()
  if (integritas.length) return tolak('DITOLAK_INTEGRITAS', integritas)
  if (H.verifikasiBeku().length) return tolak('DITOLAK_INTEGRITAS', ['EVAL1_BERUBAH'])
  if (B2.verifikasiBekuEval2().length) return tolak('DITOLAK_INTEGRITAS', ['EVAL2_BERUBAH'])
  const require = createRequire(import.meta.url)
  const jiti = require('jiti')(fileURLToPath(import.meta.url), { alias: { '@': join(AKAR, 'src') }, interopDefault: true })
  const muat = (rel) => jiti(join(AKAR, rel))
  const X = muat('src/lib/ai/vessel-call-extract.ts')
  const identitas = identitasPromptUji ?? { idPrompt: X.ID_PROMPT_INTAKE, versiPrompt: X.VERSI_PROMPT_INTAKE, versiSkema: X.VERSI_SKEMA_INTAKE, hashPrompt: X.HASH_PROMPT_INTAKE }
  const galatIkatan = B.verifikasiIkatanPromptEval3(identitas)
  if (galatIkatan.length) return tolak('DITOLAK_IKATAN_PROMPT', galatIkatan)
  const galatGerbang = E.validasiKonfigurasiGerbang(modGerbangUji ?? F)
  if (galatGerbang.length) return tolak('DITOLAK_GERBANG', galatGerbang)

  const P = muat('src/services/intake/intake-policy.ts')
  const V = muat('src/lib/vessels.ts')
  const NORM_VALIDASI = { imo: V.normalisasiImo, imoSah: V.imoCheckDigitSah, mmsi: V.normalisasiMmsi, mmsiSah: V.mmsiSah, callSign: V.normalisasiCallSign }
  const NORM_SKOR = { namaKapal: P.normalisasiNamaKapal, namaPort: P.normalisasiNamaPort, namaPihak: P.normalisasiNamaPihak, unlocode: P.normalisasiUnlocode, imo: V.normalisasiImo, mmsi: V.normalisasiMmsi, callSign: V.normalisasiCallSign }
  const kasus = H.bekukanDalam((kasusUji ?? F.bangunKasusEval3(hariIni)).map((k) => ({ ...k, teksNormal: P.normalisasiTeksSumber(k.teks) })))
  const galatKasus = []
  if (kasus.length !== B.ID_KASUS_EVAL3.length || JSON.stringify(kasus.map((k) => k.id)) !== JSON.stringify(B.ID_KASUS_EVAL3)) galatKasus.push(`JUMLAH_ATAU_HIMPUNAN_KASUS_BERBEDA:${kasus.length}`)
  for (const k of kasus) for (const m of E.masalahKasusPenilai(k)) galatKasus.push(`${k.id}:${m}`)
  if (galatKasus.length) return tolak('DITOLAK_KASUS', galatKasus)
  const petaKasus = new Map(kasus.map((k) => [k.id, k]))

  const rencana = rencanaUji ?? E.susunRencanaEval3()
  const galatRencana = E.validasiRencanaEval3(rencana, { allowlist: H.ALLOWLIST })
  if (galatRencana.length) return tolak('DITOLAK_RENCANA', galatRencana)
  const batas = batasUji ?? BATAS_EVAL3
  const galatBatas = periksaBatasEval3(batas)
  if (galatBatas.length) return tolak('DITOLAK_BATAS', galatBatas)
  if (rencana.length > batas.maksPanggilan) return tolak('DITOLAK_BATAS', ['RENCANA_MELEBIHI_BATAS_PANGGILAN'])
  // C1: plafon proyeksi per panggilan dari bukti Eval-2 LIVE × pertumbuhan masukan Prompt v3 + dokumen Eval-3 NYATA.
  const plafon = plafonRunEval3(provenansUji !== undefined ? provenansUji : PROVENANS_PLAFON_EVAL3, {
    hashPromptV3: identitas.hashPrompt,
    karakterPromptV3: String(X.SYSTEM_PROMPT_INTAKE ?? '').length + 1 + JSON.stringify(X.TOOL_INTAKE ?? null).length,
    dokumenEval3Maks: Math.max(...kasus.map((k) => k.teks.length)),
    sidik: sidikProvenansUji,
  })
  if (plafon.galat.length) return tolak('DITOLAK_BIAYA', plafon.galat)
  if (plafon.plafonUsd > batas.biayaKerasUsd) return tolak('DITOLAK_BIAYA', ['PLAFON_MELEBIHI_BATAS_KERAS'])
  const pra = periksaPrasyaratEval3(env, mode)
  if (pra.length) return tolak('DITOLAK_PRASYARAT', pra)

  let transport
  let fetchTransport
  if (mode === MODE.OFFLINE) {
    if (transportUji) return tolak('DITOLAK_PRASYARAT', ['MODE_OFFLINE_TIDAK_MENERIMA_TRANSPORT'])
    transport = TRANSPORT.STUB
  } else {
    if (jawabStub) return tolak('DITOLAK_PRASYARAT', ['MODE_LIVE_TIDAK_MENERIMA_STUB'])
    transport = typeof transportUji === 'function' ? TRANSPORT.TEST_DOUBLE : TRANSPORT.NETWORK
    fetchTransport = transportUji ?? globalThis.fetch
  }
  const g12 = g12Uji !== undefined ? g12Uji : jalankanG12()
  if (transport === TRANSPORT.NETWORK && g12 !== true) return tolak('DITOLAK_G12', ['CHECK_EVAL3_GT_GAGAL'])
  const label = transport === TRANSPORT.NETWORK ? LABEL_LIVE : LABEL_DRY
  const hariIso = new Date(hariIni).toISOString().slice(0, 10)
  if (transport === TRANSPORT.STUB) fetchTransport = buatPenyediaStubEval3(kasus, jawabStub ?? undefined, opsiStub).fn

  const db = env.SPIKE_DATABASE_URL ? uraiDbLoopback(env.SPIKE_DATABASE_URL) : null
  const snapshot = Object.fromEntries(ENV_DIKELOLA.map((n) => [n, process.env[n]]))
  const fetchSebelum = globalThis.fetch
  let jaringanTerblokir = 0
  const { jalur, keadaan, slotAktif } = rakitJalurPenyedia(fetchTransport, batas, { plafonUsd: plafon.plafonUsd })
  const slots = []
  let ledger = { status: 'TIDAK_DIJALANKAN', alasan: ledgerUji ? null : db ? null : 'SPIKE_DATABASE_URL_TIDAK_DISET', g8: null, bukti: null }
  let galatFatal = null
  const berhentiKeras = () => !!keadaan.berhenti || keadaan.ditolak.some((d) => STOP_ALASAN.includes(d.alasan))
  const validasiAsli = validasiUji ?? P.validasiEkstraksi
  const validasi = (raw, k) => validasiAsli(raw, { inputKind: 'TEXT', sourceText: k.teksNormal, hariIni: hariIso, norm: NORM_VALIDASI })
  const penilai = penilaiUji ?? S.nilaiKasus
  try {
    globalThis.fetch = (url, init) => {
      if (String(url) !== H.URL_OPENROUTER) {
        jaringanTerblokir++
        return Promise.reject(new Error('EVAL3_JARINGAN_DIBLOKIR'))
      }
      return jalur(url, init)
    }
    process.env.OPENROUTER_API_KEY = transport === TRANSPORT.STUB ? KUNCI_STUB : env.SPIKE_OPENROUTER_API_KEY
    delete process.env.TAH_INTAKE_MODEL
    if (db?.ok) {
      process.env.DATABASE_URL = env.SPIKE_DATABASE_URL
      process.env.DIRECT_URL = env.SPIKE_DATABASE_URL
    }
    const PR = muat('src/lib/ai/perekam-panggilan.ts')
    const Gt = muat('src/services/intake/intake-gate.ts')
    if (Gt.BATAS_WAKTU_AI_BAWAAN_MS !== BATAS_WAKTU_MS) throw new Error('EVAL3_BATAS_WAKTU_BERBEDA_DARI_INTAKE')
    const ekstrak = (k, model, catat) => PR.jalankanDenganKonteks({ model, kemampuan: null, catat }, () => X.ekstrakDenganBatasWaktu(X.ekstrakLewatOpenRouter, { kind: 'TEXT', text: k.teksNormal }, BATAS_WAKTU_MS))

    for (const r of rencana) {
      if (r.blok === E.BLOK_LEDGER) continue
      const k = petaKasus.get(r.kasus)
      const slot = { seq: r.seq, blok: r.blok, model: r.model, kasus: k, status: null, raw: null, post: null, nilai: null, p1: null, panggilan: [], perekam: [], sumber: E.sidikSumber(k.teks) }
      slots.push(slot)
      if (berhentiKeras()) {
        slot.status = 'TIDAK_DIJALANKAN'
        slot.sebab = keadaan.berhenti ?? 'BATAS'
        continue
      }
      const idx = keadaan.panggilan.length
      const idxDitolak = keadaan.ditolak.length
      slotAktif.model = r.model
      slotAktif.percobaan = 0
      let galatEkstrak = null
      try {
        slot.raw = await ekstrak(k, modelKonteksUji ? modelKonteksUji(r) : r.model, (m) => slot.perekam.push({ status: m.status, errorCode: m.errorCode, requestedModel: m.requestedModel, servedModel: m.servedModel, promptVersion: m.promptVersion, schemaVersion: m.schemaVersion }))
      } catch (e) {
        galatEkstrak = kodeGalat(e)
      } finally {
        slotAktif.model = null
      }
      slot.panggilan = keadaan.panggilan.slice(idx)
      const ditolakSlot = keadaan.ditolak.slice(idxDitolak)
      const infra = slot.panggilan.find((p) => p.http !== 'SUKSES')
      if (ditolakSlot.length) slot.status = TOLAK_SLOT.includes(ditolakSlot[0].alasan) ? `GAGAL:${ditolakSlot[0].alasan}` : `DIHENTIKAN:${ditolakSlot[0].alasan}`
      else if (slot.panggilan.length === 0) {
        slot.status = `GAGAL:TANPA_PANGGILAN_PENYEDIA:${galatEkstrak ?? 'ERROR'}`
        keadaan.berhenti = keadaan.berhenti ?? 'TANPA_PANGGILAN_PENYEDIA'
      } else if (slot.panggilan.some((p) => p.requestedModel !== r.model)) {
        slot.status = 'GAGAL:MODEL_DIMINTA_BERBEDA'
        keadaan.berhenti = keadaan.berhenti ?? 'MODEL_DIMINTA_BERBEDA'
      } else if (infra) {
        slot.status = `GAGAL:TRANSPORT_${infra.http}`
        keadaan.berhenti = keadaan.berhenti ?? 'GAGAL_TRANSPORT'
      } else if (slot.panggilan.some((p) => !p.servedModel)) {
        slot.status = 'GAGAL:SERVED_MODEL_TIDAK_DILAPORKAN'
        keadaan.berhenti = keadaan.berhenti ?? 'SERVED_MODEL_TIDAK_DILAPORKAN'
      } else if (slot.panggilan.some((p) => !modelTerlayaniPersis(r.model, p.servedModel))) {
        slot.status = 'GAGAL:SERVED_MODEL_BERBEDA'
        keadaan.berhenti = keadaan.berhenti ?? 'SERVED_MODEL_BERBEDA'
      } else if (keadaan.berhenti) slot.status = `GAGAL:${keadaan.berhenti}`
      else if (galatEkstrak) slot.status = `GAGAL:${galatEkstrak}`
      if (slot.status) slot.raw = null
      if (!slot.status) {
        const masalah = S.masalahArgumen(slot.raw)
        if (masalah.length) slot.status = `GAGAL:ARGUMEN_TIDAK_SAH:${masalah.join('+')}`
      }
      // POST: validator produksi atas KLON RAW (RAW tak pernah ditimpa).
      if (!slot.status) {
        try {
          slot.post = validasi(structuredClone(slot.raw), k)
        } catch {
          slot.status = 'GAGAL:VALIDATOR_ERROR'
          keadaan.berhenti = keadaan.berhenti ?? 'VALIDATOR_ERROR'
        }
      }
      // P1 — DIAGNOSTIK saja (turunan produksi atas POST).
      if (!slot.status) {
        try {
          slot.p1 = P.turunanTinjauanIntake('NEEDS_REVIEW', slot.post.classification, slot.post.proposal)
        } catch {
          slot.status = 'GAGAL:P1_ERROR'
          keadaan.berhenti = keadaan.berhenti ?? 'P1_ERROR'
        }
      }
      if (!slot.status) {
        try {
          slot.nilai = penilai(k, slot.raw, slot.post, NORM_SKOR)
          slot.status = slot.nilai.ekstraktorGagal ? `GAGAL:${slot.nilai.argumenTidakSah.join('+')}` : 'OK'
          if (slot.nilai.ekstraktorGagal) slot.nilai = null
        } catch {
          slot.status = 'GAGAL:PENILAI_ERROR'
          keadaan.berhenti = keadaan.berhenti ?? 'PENILAI_ERROR'
        }
      }
      log(`  ${String(r.seq).padStart(3)} ${r.blok.padEnd(14)} ${r.kasus} → ${slot.status}; FATAL(POST)=${slot.nilai?.POST?.jumlah.FATAL ?? '-'}`)
    }

    const slotLedger = rencana.filter((r) => r.blok === E.BLOK_LEDGER)
    // Run yang sudah BERHENTI tidak menjalankan buku besar (G8 = belum dievaluasi → INCONCLUSIVE, bukan bukti).
    if (keadaan.berhenti && (ledgerUji || db?.ok)) ledger = { status: 'TIDAK_DIJALANKAN', alasan: `RUN_DIHENTIKAN:${keadaan.berhenti}`, g8: null, bukti: null }
    else if (ledgerUji || db?.ok) {
      Object.assign(process.env, { TAH_CORE_ENABLED: 'true', VESSEL_CALL_INTAKE_ENABLED: 'true', VESSEL_CALL_INTAKE_EXTRACTOR: 'OPENROUTER', AUTOMATION_MONITORING_ENABLED: 'true' })
      const pindai = (t) => pindaiLaporanEval3(t, { kunci: env.SPIKE_OPENROUTER_API_KEY, kasus, rahasiaEnv: [env.SPIKE_DATABASE_URL] })
      try {
        const toko = ledgerUji ? ledgerUji() : buatTokoPrisma({ muat, db })
        const e = await jalankanLedgerEval3({ toko, slotLedger, petaKasus, keadaan, slotAktif, ekstrak, validasi, identitas, pindai, log })
        ledger = { status: 'DIJALANKAN', sumber: ledgerUji ? 'TOKO_MEMORI_UJI' : 'DB_LOOPBACK', g8: e.g8, bukti: e.bukti, slot: slotLedger.map((r) => ({ seq: r.seq, kasus: r.kasus, status: e.hasilSlot.get(r.seq)?.status ?? 'TIDAK_DIJALANKAN' })) }
      } catch (e) {
        ledger = { status: 'GAGAL_INFRASTRUKTUR', galat: e?.kode ?? e?.name ?? 'Error', g8: null, bukti: null }
      }
    }
  } catch (e) {
    galatFatal = e?.message?.startsWith('EVAL3_') ? e.message : e?.name ?? 'Error'
  } finally {
    globalThis.fetch = fetchSebelum
    for (const n of ENV_DIKELOLA) {
      if (snapshot[n] === undefined) delete process.env[n]
      else process.env[n] = snapshot[n]
    }
  }

  // ── Gerbang & laporan (HANYA diagnostik tersanitasi; RAW/POST/nilai tak pernah ditulis) ──
  const garam = randomBytes(16)
  const pelanggaranPagar = keadaan.ditolak.filter((d) => ['HOST_TIDAK_DIIZINKAN', 'MODEL_TIDAK_DIIZINKAN', ...TOLAK_SLOT].includes(d.alasan)).map((d) => d.alasan)
  if (jaringanTerblokir) pelanggaranPagar.push('PERCOBAAN_JARINGAN_LAIN')
  const servedCocok = !['SERVED_MODEL_BERBEDA', 'SERVED_MODEL_TIDAK_DILAPORKAN'].includes(keadaan.berhenti) && !slots.some((s) => /^GAGAL:(SERVED_MODEL|MODEL_DIMINTA)/.test(s.status))
  const nDinilai = rencana.filter((r) => r.blok !== E.BLOK_LEDGER).length
  const operasional = {
    lengkap: !galatFatal && slots.length === nDinilai && slots.every((s) => s.status === 'OK'),
    dihentikan: !!keadaan.berhenti || slots.some((s) => s.status === 'TIDAK_DIJALANKAN' || s.status.startsWith('DIHENTIKAN:')),
    pelanggaranPagar,
    servedCocok,
    tanpaFallback: !keadaan.ditolak.some((d) => d.alasan === 'FALLBACK_DIMINTA') && servedCocok,
    pagarBiayaAktif: true,
  }
  let evaluasi = null
  let galatPenilai = null
  try {
    evaluasi = (gerbangUji ?? E.evaluasiGerbangEval3)({ slots, operasional, ledger: ledger.g8, g12, norm: NORM_SKOR })
  } catch {
    galatPenilai = 'GERBANG_GAGAL_DIHITUNG'
  }
  const diagnostik = slots.map((s) => {
    let d
    try {
      d = E.diagnostikSlotEval2({ slot: s, kasus: s.kasus, raw: s.raw, post: s.post, nilai: s.nilai, panggilan: s.panggilan, garam, norm: NORM_SKOR })
    } catch {
      d = { seq: s.seq, kasus: s.kasus.id, status: s.status, galat: 'DIAGNOSTIK_GAGAL' }
    }
    d.blok = s.blok
    d.sumber = s.sumber
    d.perekam = s.perekam
    d.p1 = s.p1 ? { minimumSatisfied: s.p1.minimumSatisfied, subtypeReviewRequired: s.p1.subtypeReviewRequired } : null
    d.gerbang = evaluasi?.atribusi.get(s.seq) ?? []
    return d
  })
  const putusan = evaluasi?.putusan ?? null
  const verdict = galatFatal ? 'GAGAL_RUNNER' : galatPenilai ? 'GAGAL_PENILAI' : terburuk(putusan.PROMPT_V3_PRODUKSI.verdict, putusan.KANDIDAT_S5.verdict)
  const laporan = {
    label,
    evaluasi: 'PRD-005 E5 Eval-3 Held-out',
    runner: VERSI_RUNNER_EVAL3,
    penilai: E.VERSI_PENILAI_EVAL3,
    penilaiEval1: S.VERSI_PENILAI,
    versiGt: F.EVAL3_VERSI,
    hashGt: B.HASH_GT_BEKU_EVAL3,
    shaFixture: B.SHA_BERKAS_BEKU_EVAL3,
    ikatanPrompt: { idPrompt: identitas.idPrompt, versiPrompt: identitas.versiPrompt, versiSkema: identitas.versiSkema, hashPrompt: identitas.hashPrompt },
    mode,
    transport,
    tanggalEksekusi: hariIso,
    catatanModel: 'anthropic/claude-sonnet-5 TETAP PENDING_SPIKE — laporan ini bukan aktivasi; G8 = controlled evaluation ledger E2E, bukan persetujuan produksi.',
    panggilanNyata: transport === TRANSPORT.NETWORK ? keadaan.total : 0,
    panggilanTransport: keadaan.total,
    kunciTerpakai: transport === TRANSPORT.STUB ? 'stub' : 'SPIKE_OPENROUTER_API_KEY (nilai tidak dicatat)',
    rencana: { direncanakan: rencana.length, dinilai: slots.length, ledger: rencana.filter((r) => r.blok === E.BLOK_LEDGER).length, maks: batas.maksPanggilan },
    batas,
    akuntansi: ringkasAkuntansi(keadaan, slots),
    plafonProyeksi: { plafonUsd: plafon.plafonUsd, plafonBekuUsd: plafon.plafonBekuUsd, dasarUsd: plafon.dasarUsd, faktor: plafon.faktor, dokumenEval3Maks: plafon.dokumenEval3Maks, rumus: RUMUS_PLAFON_EVAL3, sidikProvenans: SIDIK_PROVENANS_PLAFON_EVAL3, sumber: PROVENANS_PLAFON_EVAL3.bukti.sumber, sha256Laporan: PROVENANS_PLAFON_EVAL3.bukti.sha256Laporan, provenansUji: provenansUji !== undefined },
    berhenti: keadaan.berhenti,
    ditolakPencegat: keadaan.ditolak,
    jaringanTerblokir,
    operasional,
    verdict,
    putusan: putusan ? { ...putusan, KANDIDAT_S5: { ...putusan.KANDIDAT_S5, catatanG8: KLAIM_G8 } } : null,
    galat: [galatFatal, galatPenilai].filter(Boolean),
    gerbang: evaluasi ? Object.fromEntries(Object.entries(evaluasi.gerbang).map(([k, v]) => [k, { lulus: v.lulus, keras: !!F.GERBANG_EVAL3[k]?.keras, ...(k === 'G8' ? { jenis: JENIS_G8, klaim: KLAIM_G8 } : {}), lulusLengan: v.lulusLengan, kondisionalLengan: v.kondisionalLengan, detail: v.detail, perLengan: v.perLengan }])) : null,
    ringkasan: evaluasi?.ringkasan ?? null,
    semantikG8: { jenis: JENIS_G8, klaim: KLAIM_G8, bukanPersetujuanProduksiS5: true },
    ledger: { status: ledger.status, jenis: JENIS_G8, sumber: ledger.sumber ?? null, alasan: ledger.alasan ?? null, galat: ledger.galat ?? null, g8: ledger.g8, slot: ledger.slot ?? null, bukti: ledger.bukti },
    diagnostik,
  }
  const temuan = pindaiLaporanEval3(JSON.stringify(laporan), { kunci: env.SPIKE_OPENROUTER_API_KEY, kasus, rahasiaEnv: [env.SPIKE_DATABASE_URL] })
  laporan.privasi = { temuan, lulus: temuan.length === 0 }
  if (!bekuUji && (B.verifikasiBekuEval3().length || H.verifikasiBeku().length || B2.verifikasiBekuEval2().length)) {
    laporan.integritasAkhir = 'BERUBAH_SELAMA_RUN'
    laporan.verdict = 'DITOLAK_INTEGRITAS'
  }
  if (!identitasPromptUji && B.verifikasiIkatanPromptEval3({ idPrompt: X.ID_PROMPT_INTAKE, versiPrompt: X.VERSI_PROMPT_INTAKE, versiSkema: X.VERSI_SKEMA_INTAKE, hashPrompt: X.HASH_PROMPT_INTAKE }).length) {
    laporan.integritasAkhir = 'PROMPT_BERUBAH_SELAMA_RUN'
    laporan.verdict = 'DITOLAK_IKATAN_PROMPT'
  }
  // Hanya untuk uji luring: objek RAW/POST di memori (TIDAK ikut laporan/berkas).
  Object.defineProperty(laporan, '__slotMemori', { value: slots, enumerable: false })
  Object.defineProperty(laporan, '__evaluasi', { value: evaluasi, enumerable: false })
  return laporan
}

/** Tulis laporan HANYA bila pemindai privasi lulus (jalur di luar repo). */
export function tulisLaporanAman(jalur, laporan) {
  const g = R1.periksaJalurLaporan(jalur)
  if (g.length) throw new Error(`EVAL3_${g[0]}`)
  if (!laporan?.privasi?.lulus) return { jalur: H.tulisLaporan(jalur, { label: laporan?.label ?? LABEL_DRY, verdict: 'LAPORAN_DITAHAN_PRIVASI', temuan: laporan?.privasi?.temuan ?? ['TIDAK_DIPINDAI'] }), ditahan: true }
  return { jalur: H.tulisLaporan(jalur, laporan), ditahan: false }
}

// ------------------------------------------------------------------ CLI
export async function cli(argv = process.argv.slice(2), env = process.env, cetak = console.log) {
  if (argv.length === 0) {
    const integritas = B.verifikasiBekuEval3()
    const rencana = E.susunRencanaEval3()
    cetak('PRD-005 E5 — Eval-3 runner. Tidak ada mode bawaan; tidak ada panggilan. Mode live BELUM diotorisasi.')
    cetak(`integritas GT Eval-3 : ${integritas.length ? 'GAGAL ' + integritas.join(',') : 'OK'} (${F.EVAL3_VERSI}, hash ${B.HASH_GT_BEKU_EVAL3.slice(0, 16)}…)`)
    cetak(`rencana panggilan    : ${rencana.length} / maks ${BATAS_EVAL3.maksPanggilan} (biaya lunak US$${BATAS_EVAL3.biayaLunakUsd}, keras US$${BATAS_EVAL3.biayaKerasUsd})`)
    cetak('pakai                : --mode offline|live --report <jalur absolut di luar repo>')
    return 2
  }
  const a = R1.uraiArgumen(argv)
  const galat = [...a.galat, ...(a.laporan !== null ? R1.periksaJalurLaporan(a.laporan) : [])]
  if (!a.galat.length && a.mode) galat.push(...periksaPrasyaratEval3(env, a.mode))
  if (galat.length) {
    cetak(`DITOLAK (0 panggilan): ${galat.join(' | ')}`)
    return 3
  }
  cetak(`Eval-3 runner — mode ${a.mode.toUpperCase()} — ${a.mode === MODE.LIVE ? LABEL_LIVE + ' (panggilan penyedia NYATA)' : LABEL_DRY}`)
  const laporan = await jalankanRunnerEval3({ mode: a.mode, env, log: cetak })
  if (String(laporan.verdict).startsWith('DITOLAK')) {
    cetak(`DITOLAK (0 panggilan): ${laporan.galat?.join(' | ')}`)
    return 3
  }
  const { jalur, ditahan } = tulisLaporanAman(a.laporan, laporan)
  cetak(`label=${laporan.label} transport=${laporan.transport} panggilanNyata=${laporan.panggilanNyata} panggilanTransport=${laporan.panggilanTransport} biaya=US$${laporan.akuntansi.biayaUsd}`)
  cetak(`ledger=${laporan.ledger.status} verdict=${laporan.verdict} (PROMPT_V3_PRODUKSI=${laporan.putusan?.PROMPT_V3_PRODUKSI.verdict ?? '-'}, KANDIDAT_S5=${laporan.putusan?.KANDIDAT_S5.verdict ?? '-'}) privasi=${laporan.privasi.lulus ? 'LULUS' : 'GAGAL'}`)
  cetak(`laporan${ditahan ? ' DITAHAN (privasi)' : ''}: ${jalur}`)
  return ditahan ? 4 : 0
}

const diCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (diCli) process.exit(await cli())
