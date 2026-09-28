// PRD-005 Eval-6 — FINAL FRESH BLIND TEXT EVALUATION RUNNER (Sonnet 5 + kandidat pasca-remediasi) — JALUR PRODUKSI NYATA.
//
// Turunan runner Eval-5 (spike-eval5-runner.mjs, beku & TIDAK diubah). Perbedaan Eval-6:
//   • kandidat = prd005-intake-text/kandidat-pasca-eval5-1 (commit d097fe5; validator + leksikon v2) — spike-kandidat-pasca-eval5;
//   • paket = W01–W40 (eval6-blind-cases.json) dari penulis independen baru; Eval-5 Z01–Z40 = EXPOSED — REGRESSION ONLY;
//   • PRASYARAT: regresi Eval-5 (validator, jawaban sempurna) = 39/40 kasus (78/80 slot, hanya Z17) + H20/H18/E09 — gagal → DITOLAK;
//   • gerbang toleransi-nol TAMBAHAN (owner, dibekukan sebelum LIVE): ETD/ETB/ETC, call sign, dan satuan muatan tak berbukti
//     (WRONG/HALLUCINATED di POST) = 0; sisa tenant DB = 0 dan privasi laporan lulus adalah gerbang KERAS (bukan hanya "ditahan").
//
// Seperti Eval-5, SETIAP slot Eval-6 berjalan lewat jalur produksi utuh:
//   submitIntake (intake.service) → requireIntake/registri → mulaiLedgerIntake (TAH Core) → jalankanEkstraksi(ledger,'TEXT')
//   → ruteModelIntakeUntukInput → ekstrakIntakeProduksi → buatEkstraktorOpenRouter(Prompt v4) → validasiEkstraksi → simpan
// dengan TAH_INTAKE_MODEL=anthropic/claude-sonnet-5, pada PostgreSQL LOOPBACK sekali pakai, satu tenant sintetis PER SLOT
// (tanpa efek dedup/rate-limit antar-slot). Seam uji `pengekstrakUji` submitIntake TIDAK PERNAH dipakai.
//
// Bukti per slot (semua wajib): tepat 1 panggilan penyedia; requested = served = Sonnet 5; badan permintaan = system prompt
// & skema tool Prompt v4 persis, tool paksa, tanpa temperature, tanpa fallback; 1 VesselCallIntake TEXT; AgentRun SUCCEEDED
// dengan 1 AgentModelCall (identitas prompt v4) dan outputHash = sha256(jsonKanonik(RAW tertangkap)); POST yang dinilai =
// baris produksi di DB, dan sama persis dengan validasiEkstraksi independen atas KLON RAW.
//
// Dipakai ulang TANPA diubah: pencegat Eval-1, pagar served ketat Eval-2, pagar slot & proyeksi biaya Eval-3, gerbang kualitas
// & ringkasan slot & checkpoint Eval-4, scorer-3, pemeriksa GT↔sumber gt-sumber-2.
// Mode LIVE BELUM DIOTORISASI: OTORISASI_LIVE_EVAL6_OWNER = false (perubahan eksplisit owner) DAN frasa di SPIKE_AUTHORIZED.
//
// ── Menjalankan ──
//   Luring (stub dari GT; DRY_RUN; 0 panggilan penyedia; tetap lewat jalur produksi + DB loopback):
//     SPIKE_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/maritime_suite \
//     env -u SPIKE_OPENROUTER_API_KEY node prisma/spike-eval6-runner.mjs --mode offline --report /tmp/eval6-dry.json
//   Tanpa argumen → cetak integritas, rencana, dan penghalang LIVE (0 panggilan, DB tak disentuh).

import { createRequire } from 'node:module'
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as H from './spike-eval1.mjs'
import * as R1 from './spike-eval1-runner.mjs'
import * as S from './spike-eval1-scorer.mjs'
import * as R2 from './spike-eval2-runner.mjs'
import * as R3 from './spike-eval3-runner.mjs'
import * as R4 from './spike-eval4-runner.mjs'
import * as S3 from './spike-eval4-scorer.mjs'
import * as G from './spike-gt-konsistensi.mjs'
import * as M from './spike-eval4-identitas-model.mjs'
import * as K from './spike-eval5-kandidat.mjs'
import * as K2 from './spike-kandidat-pasca-eval5.mjs'
import * as DS from './spike-eval6-dataset.mjs'
import * as RG from './fixtures/spike-intake/eval4-regresi-muatan.mjs'
import * as D from './fixtures/spike-intake/eval6-blind-cases.mjs'
import * as D5 from './fixtures/spike-intake/eval5-blind-cases.mjs'
import * as F1 from './fixtures/spike-intake/eval1-cases.mjs'

const AKAR = fileURLToPath(new URL('..', import.meta.url))
const sha256 = (x) => createHash('sha256').update(x).digest('hex')
const acak = () => randomBytes(6).toString('hex')

export const VERSI_RUNNER_EVAL6 = 'prd005-eval6/runner-1'
/** USULAN — belum diotorisasi. Hanya frasa ini (persis) yang kelak membuka mode live Eval-6. */
export const FRASA_OTORISASI_EVAL6 = 'PRD-005-EVAL6-LIVE'
/** KUNCI OTORISASI LIVE OWNER (repo). Selama false, jalur jaringan mustahil (frasa di repo tidak cukup sendirian). */
export const OTORISASI_LIVE_EVAL6_OWNER = false
export const otorisasiLiveOwnerEval6 = (env, kunci = OTORISASI_LIVE_EVAL6_OWNER) => kunci === true && env?.SPIKE_AUTHORIZED === FRASA_OTORISASI_EVAL6
export const FRASA_LAMA = Object.freeze([...R4.FRASA_LAMA, R4.FRASA_OTORISASI_EVAL4, 'PRD-005-EVAL5-LIVE'])
/** Commit tempat kandidat Eval-6 dibekukan (dokumentasi; penegakan = SHA berkas K2.SHA_KANDIDAT). */
export const COMMIT_DASAR_KANDIDAT = 'd097fe5b0ee3e40a9ba31b85d391ddce1d0c69f8'
export const ID_KANDIDAT = K2.ID_KANDIDAT
export const MODE = R1.MODE
export const TRANSPORT = R1.TRANSPORT
export const LABEL_DRY = R1.LABEL_DRY
export const LABEL_LIVE = R1.LABEL_LIVE
export const KUNCI_STUB = 'stub-kunci-eval6-runner-luring-000000'
export const AWALAN_TENANT = 'e6eval6'
export const NAMA_TENANT = 'E6-EVAL6 (sintetis, dibuang)'
export const BLOK_REGRESI = R4.BLOK_REGRESI
export const BLOK_HELDOUT = R4.BLOK_HELDOUT
export const FORMAT_CHECKPOINT = 'prd005-eval6/checkpoint-1'
export const JALUR_MANIFES_BEKU = fileURLToPath(new URL('./spike-eval6-beku.json', import.meta.url))

/**
 * KONFIGURASI OWNER Eval-6 (keputusan owner: OPSI B). 40 kasus baru × 2 ulangan + 2 kanari regresi = 82 panggilan.
 * Batas keras total US$3,00 (lunak = keras). Plafon proyeksi per panggilan US$0,035 → 82 × 0,035 = US$2,87 ≤ US$3,00.
 * Batas token TURUNAN dari tarif Sonnet 5 teramati di probe Eval-4 (US$2/MTok input, US$10/MTok output).
 * Ambang kualitas = AMBANG_KUALITAS_EVAL4 APA ADANYA (tidak dilonggarkan).
 */
export const BATAS_KERAS_MAKS_OWNER_USD = 3.0
export const KONFIG_OWNER_EVAL6 = Object.freeze({
  jumlahKasusHeldout: 40,
  ulangan: 2,
  jumlahRegresi: R4.URUTAN_REGRESI.length,
  batas: Object.freeze({ maksPanggilan: 82, biayaLunakUsd: 3.0, biayaKerasUsd: 3.0, tokenInput: 1_500_000, tokenOutput: 300_000 }),
  plafonPerPanggilanUsd: 0.035,
  ambangKualitas: R4.AMBANG_KUALITAS_EVAL4,
  /** Aturan INCONCLUSIVE_GT (owner): > 2 cacat GT sah → INCONCLUSIVE; 1–2 → tidak pernah PASS otomatis (adjudikasi owner). */
  cacatGtMaksSebelumInconclusive: 2,
})
/** Batas KHUSUS stub luring (biaya stub, bukan uang nyata). */
export const PLAFON_LURING_STUB_USD = 0.02
const BATAS_WAKTU_EKSTRAKSI_MS = 60_000
const STOP_ALASAN = ['BATAS_PANGGILAN', 'BERHENTI_LUNAK_BIAYA', 'BATAS_TOKEN', 'PROYEKSI_BIAYA_KERAS']
const ENV_DIKELOLA = ['OPENROUTER_API_KEY', 'TAH_INTAKE_MODEL', 'TAH_CORE_ENABLED', 'VESSEL_CALL_INTAKE_ENABLED', 'VESSEL_CALL_INTAKE_EXTRACTOR', 'AUTOMATION_MONITORING_ENABLED', 'AUTOMATION_TENANT_IDS', 'DATABASE_URL', 'DIRECT_URL', 'OPENROUTER_SPK_MODEL']

// ------------------------------------------------------------------ pembekuan (manifes)
/** Berkas yang dibekukan manifes Eval-6 (selain berkas kandidat yang dibekukan spike-kandidat-pasca-eval5). */
export const BERKAS_BEKU_EVAL6 = Object.freeze([
  'prisma/fixtures/spike-intake/eval6-blind-cases.json',
  'prisma/fixtures/spike-intake/eval6-blind-cases.mjs',
  'prisma/fixtures/spike-intake/eval4-regresi-muatan.mjs',
  'prisma/fixtures/spike-intake/eval3-cases.mjs',
  'docs/PRD-005-EVAL6-DATASET-SPEC.md',
  'docs/PRD-005-EVAL6-PROTOCOL.md',
  'prisma/spike-eval6-runner.mjs',
  'prisma/spike-kandidat-pasca-eval5.mjs',
  'prisma/spike-eval5-kandidat.mjs',
  'prisma/spike-eval6-dataset.mjs',
  'prisma/fixtures/spike-intake/eval5-blind-cases.json',
  'prisma/fixtures/spike-intake/eval5-blind-cases.mjs',
  'prisma/fixtures/spike-intake/eval1-cases.mjs',
  'prisma/spike-eval4-runner.mjs',
  'prisma/spike-eval4-scorer.mjs',
  'prisma/spike-eval4-identitas-model.mjs',
  'prisma/spike-gt-konsistensi.mjs',
  'prisma/spike-eval3-runner.mjs',
  'prisma/spike-eval2-runner.mjs',
  'prisma/spike-eval2-penilai.mjs',
  'prisma/spike-eval1-runner.mjs',
  'prisma/spike-eval1-scorer.mjs',
  'prisma/spike-eval1.mjs',
])
const kanon = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, kanon(v[k])])) : Array.isArray(v) ? v.map(kanon) : v)
/** Hash GT kanonik (anotasi GT + kapal dikecualikan/bukti per kasus, tanpa teks) — identitas "GT". */
export const hitungHashGtEval6 = (data) => sha256(JSON.stringify(kanon(data.cases.map((c) => ({ id: c.id, gt: c.gt, excludedVessels: c.excludedVessels ?? [], evidenceVessels: c.evidenceVessels ?? [] })))))
/** Hash dataset kanonik (versi + seluruh kasus termasuk teks & tanggal). */
export const hitungHashDatasetEval6 = (data) => sha256(JSON.stringify(kanon({ version: data.version, cases: data.cases })))

/** Manifes beku yang dihitung dari keadaan repo SAAT INI (dipakai pembeku & pemeriksa). */
export function hitungManifesEval6({ baca = (rel) => readFileSync(join(AKAR, rel)) } = {}) {
  const data = JSON.parse(String(baca('prisma/fixtures/spike-intake/eval6-blind-cases.json')))
  return {
    versi: 'prd005-eval6/beku-1',
    kandidat: { commitDasar: COMMIT_DASAR_KANDIDAT, sidik: K2.sidikKandidat(), berkas: K2.SHA_KANDIDAT, prompt: K.IKATAN_PROMPT_V4, rute: K.HARAPAN_RUTE_TEXT, transport: K.BENTUK_TRANSPORT_EVAL5 },
    dataset: { versi: data.version, jumlahKasus: data.cases.length, hashDataset: hitungHashDatasetEval6(data), hashGt: hitungHashGtEval6(data) },
    penilai: { scorer: S3.VERSI_PENILAI_V2, scorerDasar: S.VERSI_PENILAI, pemeriksaGt: G.VERSI_PEMERIKSA_GT, pemeriksaPaket: DS.VERSI_PEMERIKSA_EVAL6, regresi: RG.VERSI_REGRESI_MUATAN },
    runner: VERSI_RUNNER_EVAL6,
    rencana: { model: K.MODEL_KANDIDAT, panggilan: KONFIG_OWNER_EVAL6.batas.maksPanggilan, heldout: KONFIG_OWNER_EVAL6.jumlahKasusHeldout, ulangan: KONFIG_OWNER_EVAL6.ulangan, regresi: [...R4.URUTAN_REGRESI] },
    anggaran: { batasKerasUsd: KONFIG_OWNER_EVAL6.batas.biayaKerasUsd, plafonPerPanggilanUsd: KONFIG_OWNER_EVAL6.plafonPerPanggilanUsd },
    ambang: KONFIG_OWNER_EVAL6.ambangKualitas,
    berkas: Object.fromEntries(BERKAS_BEKU_EVAL6.map((rel) => [rel, sha256(baca(rel))])),
  }
}
/** Sidik manifes (kanonik). */
export const sidikManifes = (m) => sha256(JSON.stringify(kanon(m)))

/** Galat pembekuan (kosong = identik dengan manifes beku di repo). */
export function verifikasiBekuEval6({ baca = (rel) => readFileSync(join(AKAR, rel)), bacaManifes = () => JSON.parse(readFileSync(JALUR_MANIFES_BEKU, 'utf8')) } = {}) {
  let beku
  try {
    beku = bacaManifes()
  } catch {
    return ['MANIFES_BEKU_TIDAK_ADA']
  }
  let kini
  try {
    kini = hitungManifesEval6({ baca })
  } catch {
    return ['MANIFES_GAGAL_DIHITUNG']
  }
  const g = []
  for (const bagian of ['versi', 'kandidat', 'dataset', 'penilai', 'runner', 'rencana', 'anggaran', 'ambang']) if (JSON.stringify(kanon(beku[bagian])) !== JSON.stringify(kanon(kini[bagian]))) g.push(`BEKU_BERBEDA:${bagian}`)
  for (const rel of BERKAS_BEKU_EVAL6) if (beku.berkas?.[rel] !== kini.berkas[rel]) g.push(`BERKAS_BEKU_BERBEDA:${rel}`)
  if (beku.dataset?.hashDataset !== kini.dataset.hashDataset) g.push('HASH_DATASET_BERBEDA')
  if (beku.dataset?.hashGt !== kini.dataset.hashGt) g.push('HASH_GT_BERBEDA')
  return [...new Set(g)]
}

// ------------------------------------------------------------------ anggaran & prasyarat
export function buktiAnggaranEval6(konfig = KONFIG_OWNER_EVAL6) {
  const maksPanggilan = konfig.jumlahRegresi + konfig.jumlahKasusHeldout * konfig.ulangan
  const maksBiayaUsd = Number((maksPanggilan * konfig.plafonPerPanggilanUsd).toFixed(6))
  const g = []
  if (maksPanggilan !== konfig.batas.maksPanggilan) g.push(`RENCANA_${maksPanggilan}_BEDA_DENGAN_BATAS_${konfig.batas.maksPanggilan}`)
  if (!(maksBiayaUsd <= konfig.batas.biayaKerasUsd)) g.push(`ANGGARAN_MAKS_${maksBiayaUsd}_MELEBIHI_BATAS_KERAS_${konfig.batas.biayaKerasUsd}`)
  if (konfig.batas.biayaKerasUsd > BATAS_KERAS_MAKS_OWNER_USD) g.push('BATAS_KERAS_MELEBIHI_KEPUTUSAN_OWNER')
  if (konfig.batas.biayaLunakUsd > konfig.batas.biayaKerasUsd) g.push('BATAS_LUNAK_MELEBIHI_KERAS')
  const a = konfig.ambangKualitas
  for (const k of ['h20MuatanTakBerbuktiPostMaks', 'muatanTakBerbuktiPostMaks', 'fatalPostMaks', 'identitasBerbedaMaks', 'kegagalanOutputToolMaks']) if (a?.[k] !== 0) g.push(`AMBANG_TOLERANSI_NOL_DILANGGAR:${k}`)
  for (const k of ['lulusHeldoutMin', 'konsistensiUlanganMin']) if (!(a?.[k] >= 0.9)) g.push(`AMBANG_MINIMUM_DILONGGARKAN:${k}`)
  return { maksPanggilan, plafonPerPanggilanUsd: konfig.plafonPerPanggilanUsd, maksBiayaUsd, batasKerasUsd: konfig.batas.biayaKerasUsd, terbukti: g.length === 0, galat: g }
}

export function periksaPrasyaratEval6(env, mode, proses = process.env) {
  const galat = []
  if (mode !== MODE.OFFLINE && mode !== MODE.LIVE) return ['MODE_TIDAK_SAH']
  const dua = (n) => [env[n], proses[n]]
  if (dua('NODE_ENV').includes('production')) galat.push('NODE_ENV=production ditolak')
  if (dua('VERCEL_ENV').includes('production')) galat.push('VERCEL_ENV=production ditolak')
  if (dua('OPENROUTER_API_KEY').some(Boolean)) galat.push('OPENROUTER_API_KEY harus KOSONG (kunci produksi tak pernah dipakai)')
  if (dua('TAH_INTAKE_MODEL').some((v) => v !== undefined && v.trim() !== '')) galat.push('TAH_INTAKE_MODEL harus kosong (runner memasangnya sendiri)')
  if (dua('OPENROUTER_SPK_MODEL').some((v) => v !== undefined && v.trim() !== '' && v.trim() !== H.MODEL_S45)) galat.push('OPENROUTER_SPK_MODEL harus kosong atau Sonnet 4.5')
  const url = env.SPIKE_DATABASE_URL
  if (!url) galat.push('SPIKE_DATABASE_URL (PostgreSQL loopback sekali pakai) wajib — jalur produksi butuh DB')
  else {
    const d = R3.uraiDbLoopback(url)
    if (!d.ok) galat.push(`SPIKE_DATABASE_URL bukan loopback (${d.alasan})`)
  }
  for (const n of ['DATABASE_URL', 'DIRECT_URL']) if (dua(n).some((v) => v && v !== url)) galat.push(`${n} menunjuk DB lain`)
  if (mode === MODE.LIVE) {
    if (FRASA_LAMA.includes(env.SPIKE_AUTHORIZED)) galat.push('SPIKE_AUTHORIZED berisi frasa run terdahulu — Eval-6 butuh frasanya sendiri')
    else if (env.SPIKE_AUTHORIZED !== FRASA_OTORISASI_EVAL6) galat.push('SPIKE_AUTHORIZED tidak sama dengan frasa otorisasi Eval-6')
    if (!env.SPIKE_OPENROUTER_API_KEY) galat.push('SPIKE_OPENROUTER_API_KEY (kunci uji khusus) tidak diset')
  }
  return galat
}

// ------------------------------------------------------------------ pagar badan permintaan (terluar)
/**
 * Badan permintaan dari jalur PRODUKSI wajib: model Sonnet 5, system prompt = Prompt v4 persis, tepat satu tool = skema v4
 * persis, tool paksa, tanpa temperature, tanpa larik/rute fallback. Ditolak SEBELUM pagar slot/transport (0 biaya).
 */
export function periksaBadanEval6(b, prompt) {
  const g = [...M.periksaBadanPermintaanEval4(b), ...R4.periksaBentukTransportEval4(b)]
  if (b?.model !== K.MODEL_KANDIDAT) g.push('MODEL_BADAN_BUKAN_KANDIDAT')
  if (!(Array.isArray(b?.messages) && b.messages[0]?.role === 'system' && b.messages[0]?.content === prompt?.system)) g.push('SYSTEM_PROMPT_BUKAN_V4')
  if (!(Array.isArray(b?.tools) && b.tools.length === 1 && JSON.stringify(b.tools[0]) === JSON.stringify(prompt?.tool))) g.push('SKEMA_TOOL_BUKAN_V4')
  return [...new Set(g)]
}
export function pagarBadanEval6(berikut, keadaan, prompt) {
  return async (url, init) => {
    let b = {}
    try {
      b = JSON.parse(String(init?.body ?? '{}'))
    } catch {}
    const g = periksaBadanEval6(b, prompt)
    if (g.length) {
      keadaan.ditolak.push({ alasan: 'BADAN_EVAL6_DITOLAK', detail: g })
      keadaan.berhenti = keadaan.berhenti ?? 'BADAN_EVAL6_DITOLAK'
      throw new Error('EVAL6_BADAN_EVAL6_DITOLAK')
    }
    return berikut(url, init)
  }
}
/** Argumen tool dari respons penyedia (cermin firstToolArguments + JSON.parse produksi); null bila tak ada/rusak. */
export function argumenDariRespons(teks) {
  try {
    const j = JSON.parse(teks)
    const a = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments
    return typeof a === 'string' ? JSON.parse(a) : null
  } catch {
    return null
  }
}

// ------------------------------------------------------------------ toko DB (jalur produksi nyata)
/**
 * Toko jalur produksi pada DB loopback: tenant+pengguna sintetis per slot, submitIntake produksi, pembacaan bukti,
 * pindai buku besar, pembersihan & hitung sisa INDEPENDEN (semua tabel ber-tenantId + SecurityEvent pengguna).
 */
export function buatTokoProduksi({ muat, db }) {
  const I = muat('src/services/intake/intake.service.ts')
  const { prisma } = muat('src/lib/prisma.ts')
  const tenant = new Map()
  const users = []
  let dbCocok = false
  const semuaTenant = () => [...tenant.values()].map((x) => x.tenantId)
  async function tabelBerTenant() {
    return (await prisma.$queryRawUnsafe(`SELECT table_name AS t FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'tenantId'`)).map((r) => r.t)
  }
  async function hitungSisa(filter) {
    let n = 0
    const rinci = {}
    for (const t of await tabelBerTenant()) {
      const [x] = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" LIKE $1`, filter)
      if (x.n) rinci[t] = x.n
      n += x.n
    }
    const [tn] = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "Tenant" WHERE id LIKE $1`, filter)
    const [us] = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "User" WHERE email LIKE 'e6-eval6-%'`)
    const [se] = users.length ? await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "SecurityEvent" WHERE identifier = ANY($1)`, users) : [{ n: 0 }]
    if (tn.n) rinci.Tenant = tn.n
    if (us.n) rinci.User = us.n
    if (se.n) rinci.SecurityEvent = se.n
    return { sisaBaris: n + tn.n + us.n + se.n, rinci }
  }
  async function sapu() {
    const lama = await prisma.tenant.findMany({ where: { id: { startsWith: AWALAN_TENANT } }, select: { id: true } })
    if (lama.length) {
      const ids = lama.map((t) => t.id)
      const us = await prisma.user.findMany({ where: { tenantId: { in: ids } }, select: { id: true } })
      await prisma.securityEvent.deleteMany({ where: { identifier: { in: us.map((u) => u.id) } } })
      await prisma.tenant.deleteMany({ where: { id: { in: ids } } })
    }
    return lama.length
  }
  return {
    async siapkan(slotSeqs) {
      const [id] = await prisma.$queryRawUnsafe('SELECT current_database() AS db, host(inet_server_addr()) AS host, inet_server_port() AS port')
      if (!(id.db === db.database && Number(id.port) === db.port && ['127.0.0.1', '::1'].includes(id.host))) throw Object.assign(new Error('EVAL6_DB_TERSAMBUNG_BUKAN_LOOPBACK'), { kode: 'DB_TIDAK_COCOK' })
      dbCocok = true
      const sisaDisapu = await sapu()
      const trial = new Date(Date.now() + 7 * 86_400_000)
      for (const seq of slotSeqs) {
        const t = `${AWALAN_TENANT}${acak()}s${String(seq).padStart(2, '0')}`.padEnd(25, '0')
        await prisma.tenant.create({ data: { id: t, companyName: NAMA_TENANT, trialEndsAt: trial } })
        const u = await prisma.user.create({ data: { tenantId: t, email: `e6-eval6-${t}@uji.invalid`, name: 'E6-EVAL6 runner', password: `!tidak-bisa-login-${acak()}`, role: 'ADMIN', isActive: true } })
        users.push(u.id)
        tenant.set(seq, { tenantId: t, userId: u.id, role: 'ADMIN' })
      }
      return { cocok: true, host: id.host, port: Number(id.port), database: id.db, loopback: true, sisaDisapu, tenant: tenant.size }
    },
    tenantIds: () => semuaTenant(),
    submit: (seq, teks) => I.submitIntake(tenant.get(seq), { text: teks, saveOriginal: false, confirmReprocess: false }),
    async bukti(seq) {
      const t = tenant.get(seq).tenantId
      const intake = await prisma.vesselCallIntake.findMany({ where: { tenantId: t } })
      const runs = await prisma.agentRun.findMany({ where: { tenantId: t }, include: { modelCalls: { orderBy: { seq: 'asc' } } } })
      return { intake, runs }
    },
    async dumpBukuBesar() {
      const ids = semuaTenant()
      return JSON.stringify({
        run: await prisma.agentRun.findMany({ where: { tenantId: { in: ids } }, select: { resultSummary: true, errorDetail: true, errorCode: true, outcome: true, inputKind: true } }),
        mc: await prisma.agentModelCall.findMany({ where: { tenantId: { in: ids } } }),
        audit: await prisma.auditLog.findMany({ where: { tenantId: { in: ids }, tableName: { in: ['AgentRun', 'AgentModelCall'] } } }),
      })
    },
    async bersihkan() {
      try {
        if (!dbCocok) return { bersih: true, sisaBaris: 0, catatan: 'DB_TIDAK_DISENTUH' }
        if (users.length) await prisma.securityEvent.deleteMany({ where: { identifier: { in: users } } })
        await prisma.tenant.deleteMany({ where: { id: { in: semuaTenant() } } })
        const s = await hitungSisa(`${AWALAN_TENANT}%`)
        return { ...s, bersih: s.sisaBaris === 0 }
      } finally {
        await prisma.$disconnect().catch(() => {})
      }
    },
    /** Uji saja: sisakan satu baris (simulasi pembersihan gagal). */
    async __sisakanBaris() {
      await prisma.tenant.create({ data: { id: `${AWALAN_TENANT}${acak()}zz`.padEnd(25, '0'), companyName: NAMA_TENANT, trialEndsAt: new Date() } })
    },
  }
}

// ------------------------------------------------------------------ bukti jalur produksi per slot
/** Galat bukti jalur produksi (kosong = terbukti). MURNI. */
export function periksaBuktiProduksi({ bukti, raw, postIndependen, jsonKanonik }) {
  const g = []
  const intake = bukti?.intake ?? []
  const runs = bukti?.runs ?? []
  if (intake.length !== 1) g.push(`INTAKE_${intake.length}_BARIS`)
  if (runs.length !== 1) g.push(`RUN_${runs.length}_BARIS`)
  const i = intake[0]
  const r = runs[0]
  if (i && i.inputKind !== 'TEXT') g.push('INTAKE_BUKAN_TEXT')
  if (r) {
    if (r.status !== 'SUCCEEDED') g.push(`RUN_${r.status}`)
    if (r.agentKey !== 'INTAKE' || r.inputKind !== 'TEXT') g.push('RUN_BUKAN_INTAKE_TEXT')
    if (i && r.subjectId !== i.id) g.push('RUN_TIDAK_TERTAUT_INTAKE')
    const mc = r.modelCalls ?? []
    if (mc.length !== 1) g.push(`MODEL_CALL_${mc.length}`)
    for (const c of mc) {
      if (c.requestedModel !== K.MODEL_KANDIDAT || c.servedModel !== K.MODEL_KANDIDAT) g.push('MODEL_CALL_IDENTITAS_BERBEDA')
      if (c.status !== 'OK') g.push(`MODEL_CALL_${c.status}`)
      if (c.promptId !== K.IKATAN_PROMPT_V4.id || c.promptVersion !== K.IKATAN_PROMPT_V4.versi || c.schemaVersion !== K.IKATAN_PROMPT_V4.versiSkema || c.promptHash !== K.IKATAN_PROMPT_V4.hash) g.push('MODEL_CALL_PROMPT_BUKAN_V4')
    }
    if (raw === null || raw === undefined) g.push('RAW_TIDAK_TERTANGKAP')
    else if (r.outputHash !== sha256(jsonKanonik(raw))) g.push('OUTPUT_HASH_BEDA_DENGAN_RAW')
  }
  if (i && postIndependen && jsonKanonik({ classification: i.classification, proposal: i.proposal }) !== jsonKanonik(JSON.parse(JSON.stringify(postIndependen)))) g.push('POST_PRODUKSI_BEDA_DENGAN_VALIDATOR_INDEPENDEN')
  return [...new Set(g)]
}

// ------------------------------------------------------------------ putusan
/**
 * Putusan Eval-6 (urutan tetap). FAIL tetap FAIL bila ada bukti FATAL/gerbang keras yang sah, walau run berhenti karena
 * infrastruktur (402, jaringan) atau runner galat SESUDAHNYA. Tak pernah PASS bila: run tak lengkap, sisa DB, cacat GT,
 * kandidat berubah, privasi buku besar gagal, atau runner galat.
 */
export function putusanEval6({ gerbang4, gerbang5, galatRunner, kandidatBerubah, sisa, cacatGt, maksCacatGt }) {
  const kerasGagal = Object.entries(gerbang4.gerbang).filter(([k, v]) => v.lulus === false && (v.keras || k === 'G_LULUS_HELDOUT' || k === 'G_KONSISTENSI_ULANGAN')).map(([k]) => k)
  const keras5 = Object.entries(gerbang5).filter(([, v]) => v.keras && v.lulus === false).map(([k]) => k)
  if (kerasGagal.length || keras5.length) return { verdict: 'FAIL', sebab: [...kerasGagal, ...keras5] }
  if (galatRunner) return { verdict: 'GAGAL_RUNNER', sebab: [galatRunner] }
  if (kandidatBerubah) return { verdict: 'DITOLAK_INTEGRITAS', sebab: ['KANDIDAT_BERUBAH_SELAMA_RUN'] }
  if (sisa) return { verdict: 'DITAHAN_SISA_DB', sebab: ['SISA_DB_SETELAH_PEMBERSIHAN'] }
  if (cacatGt > maksCacatGt) return { verdict: 'INCONCLUSIVE', sebab: [`CACAT_GT_${cacatGt}_MELEBIHI_${maksCacatGt}`] }
  if (gerbang4.putusan !== 'PASS') return { verdict: 'INCONCLUSIVE', sebab: gerbang4.belumTerukur.length ? gerbang4.belumTerukur : gerbang4.gagal }
  if (cacatGt > 0) return { verdict: 'MENUNGGU_ADJUDIKASI_GT', sebab: [`CACAT_GT_${cacatGt}`] }
  return { verdict: 'PASS', sebab: [] }
}

/**
 * GERBANG TOLERANSI-NOL TAMBAHAN Eval-6 (owner, dibekukan sebelum LIVE): nilai POST yang TIDAK didukung sumber pada field
 * yang bukan FATAL di scorer-1 tetapi diminta owner nol — ETD/ETB/ETC, call sign, satuan muatan. WRONG/HALLUCINATED di POST
 * = pelanggaran (sama beratnya dengan FATAL). IMO/MMSI/nama/pelabuhan/ETA/jumlah/operasi sudah FATAL (F1–F5).
 */
export const FIELD_TOLERANSI_NOL_TAMBAHAN = Object.freeze(['etd', 'etb', 'etc', 'vessels.callSign', 'cargoes.unit'])
export function pelanggaranTambahanSlot(nilai, tag) {
  if (!nilai?.POST?.baris) return []
  return nilai.POST.baris.filter((b) => FIELD_TOLERANSI_NOL_TAMBAHAN.includes(b.generik) && (b.hasil === S.HASIL.WRONG || b.hasil === S.HASIL.HALLUCINATED)).map((b) => `TOLERANSI_NOL_TAMBAHAN:${tag}:${b.generik}@${b.jalur}:${b.hasil}`)
}

/**
 * PRASYARAT KELAYAKAN LIVE: regresi Eval-5 (EXPOSED — REGRESSION ONLY) pada validator kandidat dengan jawaban sempurna harus
 * tepat 39/40 kasus (= 78/80 slot; hanya Z17 konservatif, keputusan owner 1) dengan 0 FATAL, plus H20/H18/E09.
 * Bukan bukti held-out — hanya penjaga bahwa kandidat yang diuji adalah kandidat hasil remediasi yang diharapkan.
 */
export const HARAPAN_REGRESI_EVAL5 = Object.freeze({ lulusKasus: 39, tidakLulus: Object.freeze(['Z17']) })
export function prasyaratRegresi({ P, NORM_VALIDASI, NORM_SKOR, hariIni }) {
  const g = []
  const hariIso = new Date(hariIni).toISOString().slice(0, 10)
  const validasi = (raw, teks) => P.validasiEkstraksi(structuredClone(raw), { inputKind: 'TEXT', sourceText: P.normalisasiTeksSumber(teks), hariIni: hariIso, norm: NORM_VALIDASI })
  const kasus5 = D5.bangunKasusEval5(hariIni)
  const hasil = kasus5.map((k) => {
    const raw = R3.jawabanSempurnaEval3(k)
    const post = validasi(raw, k.teks)
    const n = S3.nilaiKasusV2(k, raw, post, NORM_SKOR)
    return { id: k.id, lulus: k.gt.classification.values.includes(post.classification) && n.POST.jumlah.FATAL === 0 && n.POST.jumlah.MAJOR === 0, fatal: n.POST.jumlah.FATAL }
  })
  const tak = hasil.filter((h) => !h.lulus).map((h) => h.id)
  if (hasil.some((h) => h.fatal > 0)) g.push('REGRESI_EVAL5_ADA_FATAL')
  if (hasil.filter((h) => h.lulus).length !== HARAPAN_REGRESI_EVAL5.lulusKasus || JSON.stringify(tak) !== JSON.stringify(HARAPAN_REGRESI_EVAL5.tidakLulus)) g.push(`REGRESI_EVAL5_${hasil.filter((h) => h.lulus).length}_DARI_40:${tak.join('+')}`)
  const baris = (teks, c) => validasi({ classification: 'NEW_NOMINATION', vessels: [{ name: 'MV REGRESI' }], cargoes: [c] }, teks).proposal.cargoes[0] ?? null
  const h20 = RG.KASUS_REGRESI_MUATAN.find((k) => k.id === 'RG-H20')
  const h18 = RG.KASUS_REGRESI_MUATAN.find((k) => k.id === 'RG-H18')
  const a = baris(h20.teks, { name: 'sawn timber', quantity: 5000, unit: 'MT', operation: 'LOAD' })
  if (!(a && a.quantity === null && a.unit === null)) g.push('REGRESI_H20')
  if (baris(h18.teks, { name: 'coal', quantity: null, unit: null, operation: 'DISCHARGE' }) !== null) g.push('REGRESI_H18')
  const e09 = G.teksKasus(F1.bangunKasusEval1(hariIni).find((k) => k.id === 'E09'))
  const e = baris(e09, { name: 'coal', quantity: 7500, unit: 'MT', operation: 'LOAD' })
  if (!(e && e.operation === null)) g.push('REGRESI_E09')
  return { galat: g, eval5: { lulusKasus: hasil.filter((h) => h.lulus).length, slot: `${2 * hasil.filter((h) => h.lulus).length}/80`, tidakLulus: tak } }
}

/** Kasus cacat GT (scorer-3 INCONCLUSIVE_GT) — unik per kasus. */
const kasusCacatGt = (ringkas) => [...new Set(ringkas.filter((r) => r.penilai?.integritasGt === S3.INCONCLUSIVE_GT).map((r) => r.kasus))]

// ------------------------------------------------------------------ privasi
export function pindaiLaporanEval6(teks, { kunci, kasus, rahasiaEnv = [] }) {
  const t = String(teks)
  // Sidik tanda tangan Eval-4 (16 hex, string JSON utuh) dikosongkan sebelum uji nilai GT utuh — alasan sama dengan
  // penanganan 12/64 hex di pemindai Eval-3 (angka GT pendek bisa muncul di dalam sidik secara kebetulan).
  const temuan = R3.pindaiLaporanEval3(t.replace(/"[0-9a-f]{16}"/g, '""'), { kunci, kasus, rahasiaEnv })
  if (kunci && t.includes(kunci)) temuan.push('KUNCI_API')
  if (t.includes(FRASA_OTORISASI_EVAL6) || FRASA_LAMA.some((f) => t.includes(f))) temuan.push('FRASA_OTORISASI')
  if (D.POLA_SENTINEL_EVAL6.test(t)) temuan.push('SENTINEL_EVAL6')
  if (D.POLA_KONTAK_EVAL6.test(t)) temuan.push('KONTAK_EVAL6')
  return [...new Set(temuan)]
}

// ------------------------------------------------------------------ inti
/**
 * Jalankan Eval-6. Mengembalikan laporan tersanitasi. PREFLIGHT (integritas beku, kandidat, identitas prompt/rute,
 * paket: integritas GT + tumpang-tindih, anggaran, prasyarat, otorisasi) → galat apa pun = DITOLAK, 0 panggilan, DB tak disentuh.
 * Seam uji (dilarang saat transport = jaringan): bekuUji, kandidatUji, dataUji, tumpangUji, konfigUji, jawabStub/opsiStub,
 * transportUji, tokoUji, kaitSlot.
 */
export async function jalankanRunnerEval6({
  mode,
  env = process.env,
  hariIni = new Date(),
  log = () => {},
  jawabStub = null,
  opsiStub = {},
  transportUji = null,
  konfigUji,
  bekuUji = null,
  kandidatUji = null,
  dataUji = null,
  tumpangUji = null,
  tokoUji = null,
  kaitSlot = null,
  regresiUji = null,
  checkpoint = null,
  sinyalJeda = () => false,
} = {}) {
  const tolak = (verdict, galat) => ({ label: LABEL_DRY, verdict, mode: mode ?? null, galat, panggilanNyata: 0, panggilanTransport: 0, dbDisentuh: false })
  if (mode !== MODE.OFFLINE && mode !== MODE.LIVE) return tolak('DITOLAK_MODE', ['MODE_WAJIB_EKSPLISIT'])
  const pakaiSeam = !!(bekuUji || kandidatUji || dataUji || tumpangUji || tokoUji || kaitSlot || regresiUji || konfigUji !== undefined)
  if (mode === MODE.LIVE && !transportUji && pakaiSeam) return tolak('DITOLAK_PRASYARAT', ['SEAM_UJI_DILARANG_SAAT_JARINGAN'])

  // ── PREFLIGHT (urutan tetap; galat apa pun → 0 panggilan, DB tak disentuh) ──
  const galatBeku = bekuUji ? bekuUji() : verifikasiBekuEval6()
  if (galatBeku.length) return tolak('DITOLAK_INTEGRITAS', galatBeku)
  const cekKandidat = kandidatUji ?? (() => K2.verifikasiKandidat())
  const galatKandidat = cekKandidat()
  if (galatKandidat.length) return tolak('DITOLAK_KANDIDAT', galatKandidat)
  const require = createRequire(import.meta.url)
  const jiti = require('jiti')(fileURLToPath(import.meta.url), { alias: { '@': join(AKAR, 'src') }, interopDefault: true })
  const muat = (rel) => jiti(join(AKAR, rel))
  const X = muat('src/lib/ai/vessel-call-extract.ts')
  const MC = muat('src/lib/ai/model-capabilities.ts')
  const galatRute = K.verifikasiIdentitasRute({ X, MC })
  if (galatRute.length) return tolak('DITOLAK_IKATAN_PROMPT', galatRute)
  const P = muat('src/services/intake/intake-policy.ts')
  const V = muat('src/lib/vessels.ts')
  const NORM_VALIDASI = { imo: V.normalisasiImo, imoSah: V.imoCheckDigitSah, mmsi: V.normalisasiMmsi, mmsiSah: V.mmsiSah, callSign: V.normalisasiCallSign }
  const NORM_SKOR = { namaKapal: P.normalisasiNamaKapal, namaPort: P.normalisasiNamaPort, namaPihak: P.normalisasiNamaPihak, unlocode: P.normalisasiUnlocode, imo: V.normalisasiImo, mmsi: V.normalisasiMmsi, callSign: V.normalisasiCallSign }

  const regresi5 = regresiUji ? regresiUji() : prasyaratRegresi({ P, NORM_VALIDASI, NORM_SKOR, hariIni })
  if (regresi5.galat.length) return tolak('DITOLAK_REGRESI_EVAL5', regresi5.galat)
  let data
  let heldoutMentah
  try {
    data = dataUji ?? D.muatDataEval6()
    heldoutMentah = D.bangunKasusEval6(hariIni, data)
  } catch (e) {
    return tolak('DITOLAK_PAKET', [String(e?.message ?? e).slice(0, 120)])
  }
  const integ = DS.periksaIntegritasPaket(data, heldoutMentah)
  if (!integ.lulus) return tolak('DITOLAK_GT_INTEGRITAS', integ.temuan.map((x) => `${x.kasus}:${x.aturan}`))
  const tumpang = tumpangUji ? tumpangUji(heldoutMentah) : DS.periksaTumpangTindih(heldoutMentah, { korpus: DS.korpusTerlihatEval6(hariIni) })
  if (!tumpang.lulus) return tolak('DITOLAK_TUMPANG_TINDIH', tumpang.temuan.map((x) => `${x.kasus}:${x.aturan}`))
  const tambahNormal = (k) => ({ ...k, teksNormal: P.normalisasiTeksSumber(k.teks) })
  const petaRg = new Map(RG.KASUS_REGRESI_MUATAN.map((k) => [k.id, k]))
  const regresi = H.bekukanDalam(R4.URUTAN_REGRESI.map((id) => tambahNormal(petaRg.get(id))))
  const heldout = H.bekukanDalam(heldoutMentah.map(tambahNormal))
  const kasus = [...regresi, ...heldout]
  const petaKasus = new Map(kasus.map((k) => [k.id, k]))

  const konfig = konfigUji !== undefined ? konfigUji : KONFIG_OWNER_EVAL6
  const anggaran = buktiAnggaranEval6(konfig)
  if (!anggaran.terbukti) return tolak('DITOLAK_ANGGARAN', anggaran.galat)
  const rencana = R4.susunRencanaEval4({ regresi, heldout, ulangan: konfig.ulangan })
  if (rencana.length !== konfig.batas.maksPanggilan) return tolak('DITOLAK_ANGGARAN', ['RENCANA_TIDAK_SAMA_DENGAN_BATAS'])
  const pra = periksaPrasyaratEval6(env, mode)
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
  if (transport === TRANSPORT.NETWORK) {
    if (!otorisasiLiveOwnerEval6(env)) return tolak('DITOLAK_OTORISASI_LIVE', ['OTORISASI_LIVE_OWNER_TIDAK_ADA'])
    if (!checkpoint) return tolak('DITOLAK_PRASYARAT', ['CHECKPOINT_WAJIB_UNTUK_JARINGAN'])
  }
  if (checkpoint?.ada()) return tolak('DITOLAK_PRASYARAT', ['CHECKPOINT_SUDAH_ADA_PAKAI_JALUR_BARU'])
  const label = transport === TRANSPORT.NETWORK ? LABEL_LIVE : LABEL_DRY
  const plafonUsd = transport === TRANSPORT.STUB ? PLAFON_LURING_STUB_USD : konfig.plafonPerPanggilanUsd
  const batas = konfig.batas
  const hariIso = new Date(hariIni).toISOString().slice(0, 10)
  if (transport === TRANSPORT.STUB) fetchTransport = R2.buatPenyediaStubEval2(kasus, jawabStub ?? ((k) => R3.jawabanSempurnaEval3(k)), opsiStub).fn
  const db = R3.uraiDbLoopback(env.SPIKE_DATABASE_URL)

  const ikatan = {
    format: FORMAT_CHECKPOINT,
    runner: VERSI_RUNNER_EVAL6,
    mode,
    transport,
    model: K.MODEL_KANDIDAT,
    sidikKandidat: K2.sidikKandidat(),
    dataset: { versi: data.version, hashDataset: hitungHashDatasetEval6(data), hashGt: hitungHashGtEval6(data) },
    penilai: S3.VERSI_PENILAI_V2,
    ulangan: konfig.ulangan,
    batas,
    plafonUsd,
    sidikRencana: R4.sidikRencana(rencana),
    tanggalEfektif: hariIso,
    sidikSumber: R4.sidikSumberKasus(kasus),
  }
  const rahasiaEnv = [env.SPIKE_DATABASE_URL]
  const pindai = (t) => pindaiLaporanEval6(t, { kunci: env.SPIKE_OPENROUTER_API_KEY, kasus, rahasiaEnv })

  // ── Eksekusi ──
  const snapshot = Object.fromEntries(ENV_DIKELOLA.map((n) => [n, process.env[n]]))
  const fetchSebelum = globalThis.fetch
  let jaringanTerblokir = 0
  const { jalur, keadaan, slotAktif } = R3.rakitJalurPenyedia(fetchTransport, batas, { plafonUsd })
  const tangkap = { raw: undefined }
  const jalurEval6 = pagarBadanEval6(jalur, keadaan, X.PROMPT_INTAKE_V4)
  const ringkas = []
  const pelanggaranToleransiNol = []
  const buktiProduksi = []
  let dijeda = false
  let galatFatal = null
  let kandidatBerubah = false
  let toko = null
  let infoDb = null
  let pembersihan = null
  let privasiBukuBesar = null
  const simpan = (status, inflight) => {
    if (!checkpoint) return
    const obj = { format: FORMAT_CHECKPOINT, ikatan, status, inflight, diperbarui: new Date().toISOString(), slot: ringkas, akuntansi: { total: keadaan.total, biaya: keadaan.biaya, token: { ...keadaan.token }, panggilan: keadaan.panggilan, ditolak: keadaan.ditolak } }
    const temuan = pindai(JSON.stringify(obj))
    if (temuan.length) throw new Error(`EVAL6_CHECKPOINT_DITAHAN_PRIVASI:${temuan.join('+')}`)
    checkpoint.tulis(obj)
  }
  const berhentiKeras = () => !!keadaan.berhenti || keadaan.ditolak.some((d) => STOP_ALASAN.includes(d.alasan))
  const penilai = S3.nilaiKasusV2
  try {
    // Lingkungan jalur produksi (dipulihkan di finally). Kunci stub luring bukan kunci nyata.
    Object.assign(process.env, {
      DATABASE_URL: env.SPIKE_DATABASE_URL,
      DIRECT_URL: env.SPIKE_DATABASE_URL,
      TAH_INTAKE_MODEL: K.MODEL_KANDIDAT,
      TAH_CORE_ENABLED: 'true',
      VESSEL_CALL_INTAKE_ENABLED: 'true',
      VESSEL_CALL_INTAKE_EXTRACTOR: 'OPENROUTER',
      AUTOMATION_MONITORING_ENABLED: 'true',
      OPENROUTER_API_KEY: transport === TRANSPORT.STUB ? KUNCI_STUB : env.SPIKE_OPENROUTER_API_KEY,
    })
    delete process.env.OPENROUTER_SPK_MODEL
    globalThis.fetch = async (url, init) => {
      if (String(url) !== H.URL_OPENROUTER) {
        jaringanTerblokir++
        throw new Error('EVAL6_JARINGAN_DIBLOKIR')
      }
      const res = await jalurEval6(url, init)
      try {
        tangkap.raw = argumenDariRespons(await res.clone().text())
      } catch {
        tangkap.raw = null
      }
      return res
    }
    toko = tokoUji ? tokoUji({ muat, db }) : buatTokoProduksi({ muat, db })
    infoDb = await toko.siapkan(rencana.map((r) => r.seq))
    process.env.AUTOMATION_TENANT_IDS = toko.tenantIds().join(',')
    const LP = muat('src/services/intake/intake-policy.ts')
    const BT = muat('src/lib/business-time.ts')
    simpan('BERJALAN', null)
    log(`RENCANA (${rencana.length} slot, 1 panggilan/slot, tanpa ulang; plafon/panggilan US$${plafonUsd}; batas keras US$${batas.biayaKerasUsd}):`)

    for (const r of rencana) {
      const k = petaKasus.get(r.kasus)
      const slot = { seq: r.seq, blok: r.blok, ulangan: r.ulangan, model: r.model, status: null, panggilan: [], perekam: [] }
      if (!dijeda && !berhentiKeras() && (kandidatUji ?? (() => K2.verifikasiKandidat()))().length) {
        kandidatBerubah = true
        keadaan.berhenti = keadaan.berhenti ?? 'KANDIDAT_BERUBAH'
      }
      if (dijeda || berhentiKeras()) {
        slot.status = 'TIDAK_DIJALANKAN'
        slot.sebab = dijeda ? 'DIJEDA' : keadaan.berhenti ?? 'BATAS'
        ringkas.push(R4.ringkasSlot({ slot, kasus: k, raw: null, post: null, nilai: null, P }))
        continue
      }
      if (sinyalJeda()) {
        dijeda = true
        slot.status = 'TIDAK_DIJALANKAN'
        slot.sebab = 'DIJEDA'
        ringkas.push(R4.ringkasSlot({ slot, kasus: k, raw: null, post: null, nilai: null, P }))
        continue
      }
      if (kaitSlot) await kaitSlot(r, { toko })
      simpan('BERJALAN', r.seq)
      const idx = keadaan.panggilan.length
      const idxDitolak = keadaan.ditolak.length
      slotAktif.model = r.model
      slotAktif.percobaan = 0
      tangkap.raw = undefined
      const tanggalSebelum = BT.tanggalBisnis(new Date())
      let galatSubmit = null
      try {
        await toko.submit(r.seq, k.teks)
      } catch (e) {
        galatSubmit = typeof e?.details?.code === 'string' ? e.details.code : typeof e?.kode === 'string' ? e.kode : e?.name ?? 'ERROR'
      } finally {
        slotAktif.model = null
      }
      const tanggalSesudah = BT.tanggalBisnis(new Date())
      slot.panggilan = keadaan.panggilan.slice(idx)
      const ditolakSlot = keadaan.ditolak.slice(idxDitolak)
      const infra = slot.panggilan.find((p) => p.http !== 'SUKSES')
      const berhenti = (sebab) => {
        keadaan.berhenti = keadaan.berhenti ?? sebab
      }
      if (ditolakSlot.length) {
        const a = ditolakSlot[0].alasan
        slot.status = a === 'BADAN_EVAL6_DITOLAK' ? 'GAGAL:JALUR_PRODUKSI:BADAN_EVAL6_DITOLAK' : ['MODEL_DIMINTA_BERBEDA', 'PERCOBAAN_ULANG', 'FALLBACK_DIMINTA', 'PANGGILAN_DI_LUAR_SLOT', 'PANGGILAN_SAAT_PROBE'].includes(a) ? `GAGAL:${a}` : `DIHENTIKAN:${a}`
        berhenti(a)
      } else if (slot.panggilan.length === 0) {
        slot.status = `GAGAL:TANPA_PANGGILAN_PENYEDIA:${galatSubmit ?? 'ERROR'}`
        berhenti('TANPA_PANGGILAN_PENYEDIA')
      } else if (slot.panggilan.length > 1) {
        slot.status = 'GAGAL:PERCOBAAN_ULANG'
        berhenti('PERCOBAAN_ULANG')
      } else if (infra) {
        slot.status = `GAGAL:TRANSPORT_${infra.http}${infra.httpStatus ? `_${infra.httpStatus}` : ''}`
        berhenti('GAGAL_TRANSPORT')
      } else if (slot.panggilan.some((p) => typeof p.biayaUsd === 'number' && p.biayaUsd > plafonUsd)) {
        slot.status = 'GAGAL:BIAYA_PER_PANGGILAN_MELEBIHI_PLAFON'
        berhenti('BIAYA_PER_PANGGILAN_MELEBIHI_PLAFON')
      } else if (slot.panggilan.some((p) => !p.servedModel)) {
        slot.status = `GAGAL:${M.INCONCLUSIVE_MODEL_IDENTITY}:SERVED_TIDAK_DILAPORKAN`
        berhenti('SERVED_MODEL_TIDAK_DILAPORKAN')
      } else if (slot.panggilan.some((p) => !M.periksaIdentitasModel({ diminta: p.requestedModel, dilayani: p.servedModel }).ok)) {
        const alasan = slot.panggilan.map((p) => M.periksaIdentitasModel({ diminta: p.requestedModel, dilayani: p.servedModel })).find((x) => !x.ok).alasan
        slot.status = `GAGAL:${M.INCONCLUSIVE_MODEL_IDENTITY}:${alasan}`
        berhenti('SERVED_MODEL_BERBEDA')
      } else if (keadaan.berhenti) slot.status = `GAGAL:${keadaan.berhenti}`
      else if (galatSubmit) {
        slot.status = /AI_BAD_RESPONSE/.test(galatSubmit) ? 'GAGAL:AI_BAD_RESPONSE' : `GAGAL:SUBMIT_PRODUKSI_${galatSubmit}`
        berhenti(`SUBMIT_${galatSubmit}`)
      }
      let raw = slot.status ? null : tangkap.raw ?? null
      let post = null
      let nilai = null
      if (!slot.status) {
        const masalah = S.masalahArgumen(raw)
        if (masalah.length) {
          slot.status = `GAGAL:ARGUMEN_TIDAK_SAH:${masalah.join('+')}`
          berhenti('ARGUMEN_TIDAK_SAH')
          raw = null
        }
      }
      // Bukti jalur produksi + POST produksi (baris DB) = validator independen atas KLON RAW.
      if (!slot.status) {
        let b = null
        let galatBukti = []
        try {
          b = await toko.bukti(r.seq)
          const hitungPost = (hari) => LP.validasiEkstraksi(structuredClone(raw), { inputKind: 'TEXT', sourceText: k.teksNormal, hariIni: hari, norm: NORM_VALIDASI })
          const kandidatPost = [...new Set([tanggalSebelum, tanggalSesudah])].map(hitungPost)
          const cocok = kandidatPost.find((pi) => periksaBuktiProduksi({ bukti: b, raw, postIndependen: pi, jsonKanonik: LP.jsonKanonik }).length === 0)
          galatBukti = cocok ? [] : periksaBuktiProduksi({ bukti: b, raw, postIndependen: kandidatPost[0], jsonKanonik: LP.jsonKanonik })
        } catch (e) {
          galatBukti = [`BUKTI_TIDAK_TERBACA:${e?.name ?? 'Error'}`]
        }
        buktiProduksi.push({ seq: r.seq, kasus: k.id, ulangan: r.ulangan, lengkap: galatBukti.length === 0, galat: galatBukti })
        if (galatBukti.length) {
          slot.status = `GAGAL:JALUR_PRODUKSI:${galatBukti.join('+')}`
          berhenti('JALUR_PRODUKSI_TIDAK_TERBUKTI')
        } else {
          const i = b.intake[0]
          post = { classification: i.classification, proposal: i.proposal }
          slot.perekam = b.runs[0].modelCalls.map((c) => ({ status: c.status, requestedModel: c.requestedModel, servedModel: c.servedModel, promptVersion: c.promptVersion, schemaVersion: c.schemaVersion, promptHashCocok: c.promptHash === K.IKATAN_PROMPT_V4.hash }))
        }
      }
      if (!slot.status) {
        try {
          nilai = penilai(k, raw, post, NORM_SKOR)
          if (nilai.ekstraktorGagal) {
            slot.status = `GAGAL:ARGUMEN_TIDAK_SAH:${(nilai.argumenTidakSah ?? []).join('+') || 'EKSTRAKTOR_GAGAL'}`
            berhenti('EKSTRAKTOR_GAGAL')
            nilai = null
          } else slot.status = 'OK'
        } catch {
          slot.status = 'GAGAL:PENILAI_ERROR'
          berhenti('PENILAI_ERROR')
          nilai = null
        }
      }
      const tandaTanganPost = nilai && post ? S.tandaTanganKritis(S.tampilanPost(post), NORM_SKOR, k.gt.classification) : null
      const rk = R4.ringkasSlot({ slot, kasus: k, raw, post, nilai, P, tandaTanganPost })
      rk.toleransiNolTambahan = slot.status === 'OK' ? pelanggaranTambahanSlot(nilai, `${k.id}#u${r.ulangan}`) : []
      ringkas.push(rk)
      const nolToleransi = [...R4.pelanggaranToleransiNolSlot(rk), ...rk.toleransiNolTambahan]
      if (nolToleransi.length) {
        berhenti('TOLERANSI_NOL_FATAL_POST')
        pelanggaranToleransiNol.push(...nolToleransi)
      }
      simpan(slot.status === 'OK' && !nolToleransi.length ? 'BERJALAN' : 'BERHENTI', null)
      log(`  ${String(r.seq).padStart(3)} ${r.blok.padEnd(20)} ${r.kasus.padEnd(6)} u${r.ulangan} → ${slot.status}; FATAL RAW/POST=${rk.penilai?.RAW.FATAL ?? '-'}/${rk.penilai?.POST.FATAL ?? '-'}`)
    }
    const semuaOk = ringkas.length === rencana.length && ringkas.every((r) => r.status === 'OK')
    simpan(semuaOk ? 'SELESAI' : dijeda && !keadaan.berhenti ? 'DIJEDA' : 'BERHENTI', null)
  } catch (e) {
    galatFatal = e?.message?.startsWith('EVAL6_') ? e.message.split(':')[0] : `${e?.name ?? 'Error'}`
  } finally {
    globalThis.fetch = fetchSebelum
    if (toko) {
      try {
        const dump = infoDb ? await toko.dumpBukuBesar() : '{}'
        const temuan = pindai(dump)
        const barisDok = kasus.flatMap((k) => k.teks.split('\n')).map((b) => b.trim()).filter((b) => b.length >= 30)
        if (barisDok.some((b) => dump.includes(b))) temuan.push('BADAN_DOKUMEN_DI_BUKU_BESAR')
        privasiBukuBesar = { temuan: [...new Set(temuan)], lulus: temuan.length === 0 }
      } catch (e) {
        privasiBukuBesar = { temuan: [`TIDAK_TERBACA:${e?.name ?? 'Error'}`], lulus: false }
      }
      try {
        pembersihan = await toko.bersihkan()
      } catch (e) {
        pembersihan = { bersih: false, galat: e?.name ?? 'Error' }
      }
    }
    for (const n of ENV_DIKELOLA) {
      if (snapshot[n] === undefined) delete process.env[n]
      else process.env[n] = snapshot[n]
    }
  }

  // ── Gerbang & putusan ──
  const cacatGt = kasusCacatGt(ringkas)
  const gerbang4 = R4.evaluasiGerbangEval4({ ringkas, rencana, ambang: konfig.ambangKualitas, ulangan: konfig.ulangan, integritasGt: { status: 'OK' } })
  const gagalJalur = ringkas.filter((r) => /^GAGAL:JALUR_PRODUKSI/.test(r.status))
  const gerbang5 = {
    G_JALUR_PRODUKSI: { keras: true, nilai: gagalJalur.length, detail: gagalJalur.map((r) => `${r.kasus}#u${r.ulangan}:${r.status}`), lulus: gagalJalur.length === 0 },
    G_PRIVASI_BUKU_BESAR: { keras: true, nilai: privasiBukuBesar?.temuan ?? null, lulus: privasiBukuBesar ? privasiBukuBesar.lulus : null },
    G_PEMBERSIHAN: { keras: true, nilai: pembersihan?.sisaBaris ?? null, lulus: pembersihan ? pembersihan.bersih === true : null },
    G_TOLERANSI_NOL_TAMBAHAN: { keras: true, field: FIELD_TOLERANSI_NOL_TAMBAHAN, nilai: ringkas.reduce((a, r) => a + (r.toleransiNolTambahan?.length ?? 0), 0), detail: ringkas.flatMap((r) => r.toleransiNolTambahan ?? []), lulus: !ringkas.some((r) => r.toleransiNolTambahan?.length) },
    G_CACAT_GT: { keras: false, nilai: cacatGt.length, kasus: cacatGt, ambangInconclusive: `> ${konfig.cacatGtMaksSebelumInconclusive}`, lulus: cacatGt.length === 0 },
  }
  const pu = putusanEval6({ gerbang4, gerbang5, galatRunner: galatFatal, kandidatBerubah, sisa: pembersihan ? pembersihan.bersih !== true : !!toko, cacatGt: cacatGt.length, maksCacatGt: konfig.cacatGtMaksSebelumInconclusive })
  const verdict = pu.verdict === 'INCONCLUSIVE' && dijeda && !keadaan.berhenti ? 'DIJEDA' : pu.verdict
  const perSeq = new Map(ringkas.map((r) => [r.seq, r]))
  const regresiHasil = Object.fromEntries(rencana.filter((r) => r.blok === BLOK_REGRESI).map((r) => [r.kasus, { seq: r.seq, ...R4.hasilRegresi(perSeq.get(r.seq)) }]))
  const laporan = {
    label,
    evaluasi: 'PRD-005 Eval-6 Fresh Blind (Sonnet 5 + kandidat produksi intake TEXT, jalur produksi nyata)',
    runner: VERSI_RUNNER_EVAL6,
    penilai: S3.VERSI_PENILAI_V2,
    pemeriksaGt: G.VERSI_PEMERIKSA_GT,
    pemeriksaPaket: DS.VERSI_PEMERIKSA_EVAL6,
    kandidat: { commitDasar: COMMIT_DASAR_KANDIDAT, sidik: K2.sidikKandidat(), prompt: K.IKATAN_PROMPT_V4, rute: K.HARAPAN_RUTE_TEXT, transport: K.BENTUK_TRANSPORT_EVAL5 },
    dataset: ikatan.dataset,
    mode,
    transport,
    tanggalEksekusi: hariIso,
    db: infoDb ? { loopback: infoDb.loopback, port: infoDb.port, database: infoDb.database, tenantSintetis: infoDb.tenant, sisaDisapuSebelum: infoDb.sisaDisapu } : null,
    panggilanNyata: transport === TRANSPORT.NETWORK ? keadaan.total : 0,
    panggilanTransport: keadaan.total,
    kunciTerpakai: transport === TRANSPORT.STUB ? 'stub' : 'SPIKE_OPENROUTER_API_KEY (nilai tidak dicatat)',
    rencana: { direncanakan: rencana.length, regresi: rencana.filter((r) => r.blok === BLOK_REGRESI).length, heldout: rencana.filter((r) => r.blok === BLOK_HELDOUT).length, ulangan: konfig.ulangan, sidik: ikatan.sidikRencana },
    anggaran,
    batas,
    plafonPerPanggilanUsd: plafonUsd,
    akuntansi: R3.ringkasAkuntansi(keadaan, ringkas),
    berhenti: keadaan.berhenti,
    kebijakanBerhenti: R4.KEBIJAKAN_BERHENTI_EVAL4,
    pelanggaranToleransiNol,
    dijeda,
    ditolakPencegat: keadaan.ditolak,
    jaringanTerblokir,
    buktiProduksi: { slot: buktiProduksi.length, lengkap: buktiProduksi.filter((x) => x.lengkap).length, gagal: buktiProduksi.filter((x) => !x.lengkap) },
    privasiBukuBesar,
    pembersihan,
    kandidatBerubahSelamaRun: kandidatBerubah,
    verdict,
    sebabPutusan: pu.sebab,
    regresiMuatan: regresiHasil,
    prasyaratRegresiEval5: regresi5.eval5,
    kandidatId: K2.ID_KANDIDAT,
    gerbang: { ...gerbang4.gerbang, ...gerbang5 },
    integritasPaketPraRun: { lulus: integ.lulus, info: integ.info.length },
    tumpangTindihPraRun: { lulus: tumpang.lulus, ukuranKorpus: tumpang.ukuranKorpus ?? null },
    totalTokenInput: keadaan.token.input,
    totalTokenOutput: keadaan.token.output,
    totalBiayaUsd: Number(keadaan.biaya.toFixed(6)),
    galat: [galatFatal].filter(Boolean),
    slot: ringkas,
  }
  const temuan = pindai(JSON.stringify(laporan))
  laporan.privasi = { temuan, lulus: temuan.length === 0 }
  // Privasi = gerbang toleransi-nol (owner): laporan yang gagal pemindai → FAIL (dan hanya temuan yang ditulis).
  if (!laporan.privasi.lulus) {
    laporan.verdict = 'FAIL'
    laporan.sebabPutusan = [...(laporan.sebabPutusan ?? []), 'G_PRIVASI_LAPORAN']
  }
  if (!bekuUji && verifikasiBekuEval6().length) {
    laporan.integritasAkhir = 'BERUBAH_SELAMA_RUN'
    if (laporan.verdict !== 'FAIL') laporan.verdict = 'DITOLAK_INTEGRITAS'
  }
  return laporan
}

/** Tulis laporan HANYA bila pemindai privasi lulus (jalur di luar repo). */
export function tulisLaporanAman(jalur, laporan) {
  const g = R1.periksaJalurLaporan(jalur)
  if (g.length) throw new Error(`EVAL6_${g[0]}`)
  if (!laporan?.privasi?.lulus) return { jalur: H.tulisLaporan(jalur, { label: laporan?.label ?? LABEL_DRY, verdict: 'FAIL', sebabPutusan: ['G_PRIVASI_LAPORAN'], status: 'LAPORAN_DITAHAN_PRIVASI', temuan: laporan?.privasi?.temuan ?? ['TIDAK_DIPINDAI'] }), ditahan: true }
  return { jalur: H.tulisLaporan(jalur, laporan), ditahan: false }
}

// ------------------------------------------------------------------ CLI
export async function cli(argv = process.argv.slice(2), env = process.env, cetak = console.log) {
  if (argv.length === 0) {
    const beku = verifikasiBekuEval6()
    const kandidat = K2.verifikasiKandidat()
    const a = buktiAnggaranEval6()
    cetak('PRD-005 Eval-6 runner. Tidak ada mode bawaan; tidak ada panggilan; DB tidak disentuh. Mode live BELUM diotorisasi.')
    cetak(`integritas beku : ${beku.length ? 'GAGAL ' + beku.join(',') : 'OK'}`)
    cetak(`kandidat        : ${kandidat.length ? 'BERUBAH ' + kandidat.join(',') : `OK (sidik ${K2.sidikKandidat().slice(0, 16)}…)`}`)
    cetak(`rencana         : ${a.maksPanggilan} panggilan (${KONFIG_OWNER_EVAL6.jumlahRegresi} regresi + ${KONFIG_OWNER_EVAL6.jumlahKasusHeldout} × ${KONFIG_OWNER_EVAL6.ulangan}), ${K.MODEL_KANDIDAT}`)
    cetak(`anggaran        : ${a.maksPanggilan} × US$${a.plafonPerPanggilanUsd} = US$${a.maksBiayaUsd} ≤ batas keras US$${a.batasKerasUsd} → ${a.terbukti ? 'TERBUKTI' : a.galat.join(',')}`)
    cetak(`otorisasi LIVE  : ${OTORISASI_LIVE_EVAL6_OWNER ? 'kunci repo TERBUKA' : 'kunci repo TERTUTUP (OTORISASI_LIVE_EVAL6_OWNER = false)'}`)
    cetak('pakai           : --mode offline|live --report <jalur absolut di luar repo> [--checkpoint <jalur>]  (SPIKE_DATABASE_URL loopback wajib)')
    return 2
  }
  const a = R4.uraiArgumenEval4(argv)
  const galat = [...a.galat, ...(a.laporan !== null ? R1.periksaJalurLaporan(a.laporan) : [])]
  if (a.resume) galat.push('RESUME_TIDAK_DIDUKUNG_EVAL6')
  if (!a.galat.length && a.mode) galat.push(...periksaPrasyaratEval6(env, a.mode))
  if (galat.length) {
    cetak(`DITOLAK (0 panggilan): ${galat.join(' | ')}`)
    return 3
  }
  let jeda = false
  const onSigint = () => {
    jeda = true
    cetak('SIGINT: jeda di batas slot berikutnya.')
  }
  process.on('SIGINT', onSigint)
  try {
    cetak(`Eval-6 runner — mode ${a.mode.toUpperCase()} — ${a.mode === MODE.LIVE ? LABEL_LIVE + ' (panggilan penyedia NYATA)' : LABEL_DRY}`)
    const laporan = await jalankanRunnerEval6({ mode: a.mode, env, log: cetak, checkpoint: a.checkpoint ? R4.buatTokoCheckpointBerkas(resolve(a.checkpoint)) : null, sinyalJeda: () => jeda })
    if (String(laporan.verdict).startsWith('DITOLAK') && laporan.panggilanTransport === 0 && !laporan.slot) {
      cetak(`DITOLAK (0 panggilan): ${laporan.galat?.join(' | ')}`)
      return 3
    }
    const { jalur, ditahan } = tulisLaporanAman(a.laporan, laporan)
    cetak(`label=${laporan.label} transport=${laporan.transport} panggilanNyata=${laporan.panggilanNyata} panggilanTransport=${laporan.panggilanTransport} biaya=US$${laporan.akuntansi.biayaUsd}`)
    cetak(`verdict=${laporan.verdict} jalurProduksi=${laporan.buktiProduksi.lengkap}/${laporan.buktiProduksi.slot} sisaDB=${laporan.pembersihan?.sisaBaris ?? '-'} privasi=${laporan.privasi.lulus ? 'LULUS' : 'GAGAL'}`)
    cetak(`laporan${ditahan ? ' DITAHAN (privasi)' : ''}: ${jalur}`)
    return ditahan ? 4 : 0
  } finally {
    process.off('SIGINT', onSigint)
  }
}

const diCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (diCli) process.exit(await cli())
