// PRD-005 Step 3C — CONTROLLED EVALUATION 1 — RUNNER (tahap E3B: pipa LANGSUNG + eksekutor LEDGER_E2E).
//
// Harness E2 (spike-eval1.mjs) TETAP apa adanya: luring saja, tak tersentuh. Runner ini MENYUSUN
// ekspor E2 (integritas GT beku, rencana, pencegat biaya/allowlist, pemindai privasi, penulis
// laporan) + penilai E2 (spike-eval1-scorer.mjs) TANPA mengubah semantiknya, lalu menambah:
//   1. mode LANGSUNG yang benar-benar bisa mengirim permintaan (E4) — di balik gerbang otorisasi;
//   2. eksekutor LEDGER_E2E: submitIntake SUNGGUHAN + buku besar TAH di DB LOKAL → bukti G8 nyata;
//   3. CLI: mode & jalur laporan WAJIB eksplisit; laporan tak pernah di dalam repo.
// Jalur AI TIDAK diduplikasi: setiap panggilan lewat jalankanDenganKonteks → ekstrakDenganBatasWaktu
// → ekstrakLewatOpenRouter → chatCompletionMeta → fetch global (yang dipasangi pencegat E2).
// Spike, BUKAN kode produksi: registry, TAH_INTAKE_MODEL, OPENROUTER_SPK_MODEL tidak disentuh;
// anthropic/claude-sonnet-5 tetap PENDING_SPIKE.
//
// ── Menjalankan ─────────────────────────────────────────────────────────────────────────
//   Luring (stub deterministik dari GT, DRY_RUN / NON-LIVE):
//     [SPIKE_DATABASE_URL=postgresql://…@127.0.0.1:…/…] \
//     node prisma/spike-eval1-runner.mjs --mode offline --report /tmp/eval1-dry.json
//   Langsung (E4 — HANYA dengan otorisasi owner):
//     SPIKE_AUTHORIZED=<frasa Eval-1> SPIKE_OPENROUTER_API_KEY=<kunci uji khusus> \
//     SPIKE_DATABASE_URL=postgresql://…@127.0.0.1:…/… \
//     node prisma/spike-eval1-runner.mjs --mode live --report /tmp/eval1-live.json
//   Tanpa argumen → hanya cetak rencana & cara pakai; TIDAK ada mode bawaan, apalagi LANGSUNG.
//
// ── Pagar (semua dicek SEBELUM panggilan atau tulis DB apa pun) ──────────────────────────
//   • mode eksplisit (offline|live); flag lama `--live` ditolak; argumen tak dikenal ditolak.
//   • jalur laporan eksplisit, di luar repo (juga setelah symlink diurai), direktorinya ada.
//   • NODE_ENV ≠ production; OPENROUTER_API_KEY proses/shell KOSONG (kunci produksi tak pernah
//     ditimpa); DATABASE_URL kosong atau == SPIKE_DATABASE_URL; SPIKE_DATABASE_URL hanya
//     localhost; OPENROUTER_SPK_MODEL kosong/Sonnet 4.5; TAH_INTAKE_MODEL kosong;
//     VESSEL_CALL_INTAKE_EXTRACTOR kosong/OPENROUTER.
//   • LANGSUNG juga: frasa Eval-1 persis (frasa Phase 0 ditolak), SPIKE_OPENROUTER_API_KEY,
//     SPIKE_DATABASE_URL wajib. Mode tak pernah naik/turun diam-diam.
//   • Seam uji (transportUji, penilai/validator uji) DITOLAK bila transport = jaringan.

import { createRequire } from 'node:module'
import { existsSync, realpathSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import * as H from './spike-eval1.mjs'
import * as F from './fixtures/spike-intake/eval1-cases.mjs'
import * as S from './spike-eval1-scorer.mjs'

const AKAR = fileURLToPath(new URL('..', import.meta.url))

export const VERSI_RUNNER = 'prd005-step3c-eval1/runner-1'
export const MODE = Object.freeze({ OFFLINE: 'offline', LIVE: 'live' })
export const TRANSPORT = Object.freeze({ STUB: 'STUB', TEST_DOUBLE: 'TEST_DOUBLE', NETWORK: 'NETWORK' })
export const LABEL_DRY = 'DRY_RUN / NON-LIVE'
export const LABEL_LIVE = 'LIVE / SPIKE'
export const KUNCI_STUB = 'stub-kunci-eval1-runner-luring-000000'
export const AWALAN_TENANT = 'e3beval1'
export const NAMA_TENANT = 'E3B-EVAL1 (sintetis, dibuang)'
const HOST_LOKAL = ['localhost', '127.0.0.1', '::1', '[::1]']
const BATAS_WAKTU_MS = 60_000 // = BATAS_WAKTU_AI_BAWAAN_MS intake (dibuktikan uji)
/** Env proses yang disetel runner sementara; SELALU dipulihkan di finally. */
const ENV_DIKELOLA = [
  'OPENROUTER_API_KEY',
  'DATABASE_URL',
  'DIRECT_URL',
  'TAH_CORE_ENABLED',
  'VESSEL_CALL_INTAKE_ENABLED',
  'VESSEL_CALL_INTAKE_EXTRACTOR',
  'AUTOMATION_MONITORING_ENABLED',
  'AUTOMATION_TENANT_IDS',
]

// ------------------------------------------------------------------ CLI
/** Urai argv. Tidak ada mode bawaan: mode & laporan WAJIB eksplisit. */
export function uraiArgumen(argv = []) {
  const galat = []
  let mode = null
  let laporan = null
  const ambil = (i, a, nama) => {
    const eq = a.indexOf('=')
    if (eq > 0) return { v: a.slice(eq + 1), lompat: 0 }
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) {
      galat.push(`${nama}_TANPA_NILAI`)
      return { v: null, lompat: 0 }
    }
    return { v, lompat: 1 }
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--mode' || a.startsWith('--mode=')) {
      const { v, lompat } = ambil(i, a, 'MODE')
      i += lompat
      if (v !== null) {
        if (mode !== null && mode !== v) galat.push('MODE_GANDA')
        mode = v
      }
    } else if (a === '--report' || a.startsWith('--report=')) {
      const { v, lompat } = ambil(i, a, 'REPORT')
      i += lompat
      if (v !== null) laporan = v
    } else if (a === '--live') galat.push('FLAG_LIVE_LAMA_DITOLAK: pakai --mode live')
    else galat.push(`ARGUMEN_TIDAK_DIKENAL:${a.slice(0, 40)}`)
  }
  if (mode === null) galat.push('MODE_WAJIB_EKSPLISIT: --mode offline|live')
  else if (mode !== MODE.OFFLINE && mode !== MODE.LIVE) galat.push(`MODE_TIDAK_SAH:${String(mode).slice(0, 20)}`)
  if (laporan === null) galat.push('REPORT_WAJIB_EKSPLISIT: --report <jalur absolut di luar repo>')
  return { mode: galat.some((g) => g.startsWith('MODE')) ? null : mode, laporan, galat }
}

const diDalam = (p, akar) => p === akar || p.startsWith(akar + sep)

/** Galat jalur laporan (kosong = lolos). Dicek SEBELUM run: laporan tak pernah di dalam repo. */
export function periksaJalurLaporan(jalur) {
  if (typeof jalur !== 'string' || !jalur) return ['REPORT_WAJIB_EKSPLISIT']
  if (!isAbsolute(jalur)) return ['REPORT_HARUS_ABSOLUT']
  const abs = resolve(jalur)
  const akar = resolve(AKAR)
  const akarNyata = realpathSync(akar)
  if (diDalam(abs, akar) || diDalam(abs, akarNyata)) return ['REPORT_DI_DALAM_REPO_DITOLAK']
  const dir = dirname(abs)
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return ['REPORT_DIREKTORI_TIDAK_ADA']
  const dirNyata = realpathSync(dir)
  if (diDalam(dirNyata, akarNyata)) return ['REPORT_DI_DALAM_REPO_DITOLAK']
  if (existsSync(abs)) {
    try {
      if (diDalam(realpathSync(abs), akarNyata)) return ['REPORT_DI_DALAM_REPO_DITOLAK']
    } catch {}
  }
  return []
}

// ------------------------------------------------------------------ prasyarat
/** Host lokal dari URL postgres, atau null. */
export function uraiDbLokal(url) {
  try {
    const u = new URL(url)
    if (!['postgres:', 'postgresql:'].includes(u.protocol)) return { ok: false, alasan: 'PROTOKOL' }
    const host = u.hostname
    if (!HOST_LOKAL.includes(host)) return { ok: false, alasan: 'BUKAN_LOKAL' }
    return { ok: true, host: host.replace(/^\[|\]$/g, ''), port: Number(u.port || 5432), database: decodeURIComponent(u.pathname.replace(/^\//, '')) }
  } catch {
    return { ok: false, alasan: 'TIDAK_TERURAI' }
  }
}

/**
 * Galat prasyarat (kosong = lolos). `env` = setelan yang diberikan pemanggil (CLI: process.env);
 * `proses` = process.env yang NYATA dibaca kode — variabel berbahaya dicek di KEDUANYA.
 */
export function periksaPrasyaratRunner(env, mode, proses = process.env) {
  const galat = []
  if (mode !== MODE.OFFLINE && mode !== MODE.LIVE) return ['MODE_TIDAK_SAH']
  const dua = (nama) => [env[nama], proses[nama]]
  if (dua('NODE_ENV').includes('production')) galat.push('NODE_ENV=production ditolak')
  if (dua('OPENROUTER_API_KEY').some(Boolean)) galat.push('OPENROUTER_API_KEY harus KOSONG (kunci produksi tak pernah ditimpa/dipakai)')
  if (dua('TAH_INTAKE_MODEL').some((v) => v !== undefined && v.trim() !== '')) galat.push('TAH_INTAKE_MODEL harus kosong (slot ledger memakai jalur intake LEGACY)')
  if (dua('OPENROUTER_SPK_MODEL').some((v) => v !== undefined && v.trim() !== '' && v.trim() !== H.MODEL_S45)) galat.push('OPENROUTER_SPK_MODEL harus kosong atau Sonnet 4.5 (tidak diubah runner)')
  if (dua('VESSEL_CALL_INTAKE_EXTRACTOR').some((v) => v !== undefined && v.trim() !== '' && v.trim() !== 'OPENROUTER')) galat.push('VESSEL_CALL_INTAKE_EXTRACTOR harus kosong/OPENROUTER (slot ledger wajib memakai pengekstrak sungguhan)')
  const spikeDb = env.SPIKE_DATABASE_URL
  if (spikeDb) {
    const d = uraiDbLokal(spikeDb)
    if (!d.ok) galat.push(`SPIKE_DATABASE_URL hanya boleh postgres di localhost/127.0.0.1 (${d.alasan})`)
  } else if (mode === MODE.LIVE) galat.push('SPIKE_DATABASE_URL (DB lokal untuk LEDGER_E2E/G8) wajib untuk mode live')
  for (const nama of ['DATABASE_URL', 'DIRECT_URL']) {
    if (dua(nama).some((v) => v && v !== spikeDb)) galat.push(`${nama} harus kosong atau sama dengan SPIKE_DATABASE_URL (cegah DB produksi)`)
  }
  if (mode === MODE.LIVE) {
    if (env.SPIKE_AUTHORIZED === H.FRASA_PHASE0) galat.push('SPIKE_AUTHORIZED berisi frasa PHASE 0 — Eval-1 butuh frasanya sendiri')
    else if (env.SPIKE_AUTHORIZED !== H.FRASA_OTORISASI_EVAL1) galat.push('SPIKE_AUTHORIZED tidak sama dengan frasa otorisasi Eval-1')
    if (!env.SPIKE_OPENROUTER_API_KEY) galat.push('SPIKE_OPENROUTER_API_KEY (kunci uji khusus) tidak diset')
  }
  return galat
}

// ------------------------------------------------------------------ fixture luring
const pilihGt = (n) => (!n || typeof n !== 'object' || !('status' in n) ? undefined : n.status === 'PRESENT' ? n.value : n.status === 'ACCEPTABLE' ? n.values[0] ?? undefined : undefined)

/** Keluaran tool DETERMINISTIK dari GT beku (fixture DRY_RUN; BUKAN keluaran model). */
export function keluaranFixtureDariGt(k) {
  const g = k.gt
  const o = { classification: g.classification.values[0] }
  o.vessels = (g.vessels.daftar ?? []).map((v) => Object.fromEntries(['name', 'imo', 'mmsi', 'callSign', 'vesselType', 'role'].map((f) => [f, pilihGt(v[f])]).filter(([, x]) => x !== undefined)))
  for (const f of ['portName', 'portUnlocode', 'jetty', 'eta', 'etb', 'etc', 'etd', 'principalName', 'customerName', 'agencyType', 'clientReference', 'requestDate']) {
    const x = pilihGt(g[f])
    if (x !== undefined && x !== null) o[f] = x
  }
  o.cargoes = g.cargoes?.bentukDiterima ? g.cargoes.bentukDiterima[0].map((c) => Object.fromEntries(['name', 'quantity', 'unit', 'operation'].map((f) => [f, pilihGt(c[f])]).filter(([, x]) => x !== undefined && x !== null))) : []
  if (g.contact && !('status' in g.contact)) {
    const c = Object.fromEntries(['name', 'email', 'phone'].map((f) => [f, pilihGt(g.contact[f])]).filter(([, x]) => x !== undefined && x !== null))
    if (Object.keys(c).length) o.contact = c
  }
  return o
}

/**
 * Penyedia stub deterministik. `jawab(kasus, model, n)` → argumen tool, atau salah satu:
 * { __mentah: '<teks argumen>' } · { __tanpaTool: true } · { __http: 500 } · { __lempar: true }.
 * `opsi.served` / `opsi.tanpaBiaya` meniru kegagalan metadata. Kasus dikenali lewat sentinel.
 */
export function buatPenyediaStub(kasus, jawab = (k) => keluaranFixtureDariGt(k), opsi = {}) {
  const catatan = []
  let n = 0
  const fn = async (url, init) => {
    n++
    const body = JSON.parse(init.body)
    let teks = JSON.stringify(body.messages)
    const pdf = teks.match(/data:application\/pdf;base64,([A-Za-z0-9+/=]+)/)
    if (pdf) teks += Buffer.from(pdf[1], 'base64').toString('latin1')
    const k = kasus.find((x) => teks.includes(x.sentinel))
    const auth = String(init.headers?.Authorization ?? '')
    catatan.push({ n, kasus: k?.id ?? null, model: body.model, authorization: auth })
    const a = jawab(k, body.model, n)
    if (a?.__lempar) throw new Error('stub: kegagalan transport tersimulasi')
    if (a?.__http) return new Response(JSON.stringify({ error: { message: 'stub provider error' } }), { status: a.__http, headers: { 'content-type': 'application/json' } })
    const argumen = typeof a?.__mentah === 'string' ? a.__mentah : JSON.stringify(a)
    const pesan = a?.__tanpaTool ? { content: 'tidak ada tool call' } : { tool_calls: [{ function: { name: 'isi_intake_kunjungan', arguments: argumen } }] }
    return new Response(
      JSON.stringify({
        id: `gen-DRYRUN-${n}`,
        model: typeof opsi.served === 'function' ? opsi.served(body.model, n) : opsi.served ?? body.model,
        usage: opsi.tanpaBiaya ? { prompt_tokens: 2500, completion_tokens: 400 } : { prompt_tokens: 2500, completion_tokens: 400, cost: opsi.biaya ?? 0.01 },
        choices: [{ finish_reason: a?.__tanpaTool ? 'stop' : 'tool_calls', message: pesan }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }
  return { fn, catatan, jumlah: () => n }
}

// ------------------------------------------------------------------ laporan
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

const perekamRingkas = (m) => ({ status: m.status, errorCode: m.errorCode, requestedModel: m.requestedModel, servedModel: m.servedModel, promptId: m.promptId, promptHash: m.promptHash, schemaId: m.schemaId })

// ------------------------------------------------------------------ LEDGER_E2E
const acak = () => randomBytes(6).toString('hex')

/** Hapus sisa run E3B sebelumnya (tenant berawalan tetap + pemicu yatim). Tak menyentuh data lain. */
async function sapuSisa(prisma) {
  const lama = await prisma.tenant.findMany({ where: { id: { startsWith: AWALAN_TENANT }, companyName: NAMA_TENANT }, select: { id: true } })
  if (lama.length) {
    const ids = lama.map((t) => t.id)
    const users = await prisma.user.findMany({ where: { tenantId: { in: ids } }, select: { id: true } })
    await prisma.securityEvent.deleteMany({ where: { identifier: { in: users.map((u) => u.id) } } })
    await prisma.tenant.deleteMany({ where: { id: { in: ids } } })
  }
  const pemicu = await prisma.$queryRawUnsafe(`SELECT tgname FROM pg_trigger WHERE tgname LIKE 'e3b_eval1_%'`)
  for (const { tgname } of pemicu) await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${tgname}" ON "AgentRun"`)
  await prisma.$executeRawUnsafe(`DO $$ DECLARE f record; BEGIN FOR f IN SELECT proname FROM pg_proc WHERE proname LIKE 'e3b_eval1_%' LOOP EXECUTE format('DROP FUNCTION IF EXISTS %I()', f.proname); END LOOP; END $$`)
  return lama.length
}

/**
 * Eksekutor LEDGER_E2E. Menjalankan submitIntake SUNGGUHAN (gerbang intake → langganan → hash →
 * kuota → batas laju → mulaiLedgerIntake → jalankanEkstraksi → ekstrakLewatOpenRouter →
 * validasiEkstraksi → simpan intake → selesaiLedgerIntake) pada tenant SINTETIS di DB LOKAL,
 * membaca kembali AgentRun/AgentModelCall/AuditLog, dan menurunkan bukti G8 dari baris DB nyata.
 * Probe gagal-tertutup: INSERT AgentRun ditolak DB (pemicu sementara, tenant probe saja) →
 * submitIntake harus melempar SEBELUM panggilan penyedia apa pun. Semua baris dihapus di akhir.
 */
async function eksekusiLedgerE2E({ muat, slotLedger, petaKasus, keadaan, db, pindai, log }) {
  const I = muat('src/services/intake/intake.service.ts')
  const X = muat('src/lib/ai/vessel-call-extract.ts')
  const { prisma } = muat('src/lib/prisma.ts')
  const bukti = { dijalankan: false, db: null, slot: [], probeGagalTertutup: null, sentinelBersih: null, pembersihan: null, sisaDisapu: 0 }
  const tenantUtama = `${AWALAN_TENANT}${acak()}u`.padEnd(25, '0')
  const tenantProbe = `${AWALAN_TENANT}${acak()}p`.padEnd(25, '0')
  const users = []
  let pemicu = null
  const hasilSlot = new Map()
  try {
    // Identitas server DB yang SUNGGUH tersambung harus = SPIKE_DATABASE_URL (klien ter-cache pun dicek).
    const [id] = await prisma.$queryRawUnsafe('SELECT current_database() AS db, host(inet_server_addr()) AS host, inet_server_port() AS port')
    const hostCocok = HOST_LOKAL.includes(id.host) || id.host === '::1'
    if (!(id.db === db.database && Number(id.port) === db.port && hostCocok)) {
      bukti.db = { cocok: false }
      throw Object.assign(new Error('EVAL1_DB_TERSAMBUNG_BUKAN_SPIKE'), { kode: 'DB_TIDAK_COCOK' })
    }
    bukti.db = { cocok: true, host: id.host, port: Number(id.port), database: id.db, lokal: true }
    bukti.sisaDisapu = await sapuSisa(prisma)

    const trial = new Date(Date.now() + 7 * 86_400_000)
    for (const t of [tenantUtama, tenantProbe]) {
      await prisma.tenant.create({ data: { id: t, companyName: NAMA_TENANT, trialEndsAt: trial } })
      users.push(await prisma.user.create({ data: { tenantId: t, email: `e3b-eval1-${t}@uji.invalid`, name: 'E3B-EVAL1 runner', password: `!tidak-bisa-login-${acak()}`, role: 'ADMIN', isActive: true } }))
    }
    process.env.AUTOMATION_TENANT_IDS = `${tenantUtama},${tenantProbe}`
    const ctxUtama = { tenantId: tenantUtama, userId: users[0].id, role: 'ADMIN' }
    const ctxProbe = { tenantId: tenantProbe, userId: users[1].id, role: 'ADMIN' }
    bukti.dijalankan = true

    // ---- slot LEDGER_E2E (rencana beku: E01, E03 · Sonnet 4.5 · jalur LEGACY submitIntake)
    for (const r of slotLedger) {
      const k = petaKasus.get(r.kasus)
      const idx = keadaan.panggilan.length
      if (keadaan.berhenti) {
        hasilSlot.set(r.seq, { status: 'TIDAK_DIJALANKAN', sebab: keadaan.berhenti, panggilan: [] })
        continue
      }
      let galat = null
      let hasil = null
      try {
        hasil = await I.submitIntake(ctxUtama, { text: k.teks, saveOriginal: false, confirmReprocess: false })
      } catch (e) {
        galat = typeof e?.details?.code === 'string' ? e.details.code : typeof e?.code === 'string' ? e.code : 'ERROR'
      }
      const panggilan = keadaan.panggilan.slice(idx)
      const intake = hasil?.intake?.id ? await prisma.vesselCallIntake.findFirst({ where: { id: hasil.intake.id, tenantId: tenantUtama } }) : null
      const runs = intake
        ? await prisma.agentRun.findMany({ where: { tenantId: tenantUtama, inputHash: intake.inputHash }, include: { modelCalls: { orderBy: { seq: 'asc' } } } })
        : await prisma.agentRun.findMany({ where: { tenantId: tenantUtama, startedAt: { gte: new Date(Date.now() - 10 * 60_000) } }, include: { modelCalls: { orderBy: { seq: 'asc' } } }, orderBy: { startedAt: 'desc' }, take: 1 })
      const run = runs[0] ?? null
      const audit = run ? await prisma.auditLog.findMany({ where: { tenantId: tenantUtama, tableName: 'AgentRun', recordId: run.id }, orderBy: { createdAt: 'asc' } }) : []
      const mc = run?.modelCalls ?? []
      const ev = {
        submit: galat ? `GAGAL:${galat}` : hasil?.reused ? 'DIPAKAI_ULANG' : 'OK',
        intake: intake ? { status: intake.status, classification: intake.classification, inputKind: intake.inputKind, extractorVersion: intake.extractorVersion } : null,
        jumlahRun: runs.length,
        run: run
          ? {
              status: run.status,
              outcome: run.outcome,
              agentKey: run.agentKey,
              runType: run.runType,
              triggerType: run.triggerType,
              agentVersion: run.agentVersion,
              errorCode: run.errorCode,
              subjekCocok: !!intake && run.subjectType === 'VesselCallIntake' && run.subjectId === intake.id,
              inputHashCocok: !!intake && run.inputHash === intake.inputHash,
              outputHashAda: /^[0-9a-f]{64}$/.test(run.outputHash ?? ''),
              selesai: !!run.finishedAt && run.lateCompletion === false,
            }
          : null,
        modelCall: mc.map((c) => ({ seq: c.seq, status: c.status, errorCode: c.errorCode, requestedModel: c.requestedModel, servedModel: c.servedModel, promptHashCocok: c.promptHash === X.HASH_PROMPT_INTAKE, inputTokens: c.inputTokens, outputTokens: c.outputTokens })),
        panggilanPencegat: panggilan.length,
        auditRun: audit.map((a) => a.action),
      }
      ev.lengkap =
        ev.submit === 'OK' &&
        ev.intake?.status === 'NEEDS_REVIEW' &&
        ev.jumlahRun === 1 &&
        ev.run?.status === 'SUCCEEDED' &&
        ev.run?.outcome === 'PROPOSAL_CREATED' &&
        ev.run?.agentKey === 'INTAKE' &&
        ev.run?.subjekCocok &&
        ev.run?.inputHashCocok &&
        ev.run?.outputHashAda &&
        ev.run?.selesai &&
        panggilan.length >= 1 &&
        mc.length === panggilan.length &&
        mc.every((c, i) => c.seq === i + 1 && c.requestedModel === r.model && c.promptHash === X.HASH_PROMPT_INTAKE) &&
        mc.filter((c) => c.status === 'OK').every((c) => H.modelTerlayaniCocok(r.model, c.servedModel) && c.inputTokens !== null && c.outputTokens !== null) &&
        ev.auditRun.includes('CREATE') &&
        ev.auditRun.includes('UPDATE')
      bukti.slot.push({ seq: r.seq, kasus: r.kasus, ...ev })
      hasilSlot.set(r.seq, { status: galat ? `GAGAL:${galat}` : ev.lengkap ? 'OK' : 'GAGAL:BUKTI_LEDGER_TIDAK_LENGKAP', panggilan })
      log(`  ${String(r.seq).padStart(2)} LEDGER_E2E    ${r.kasus} → ${ev.submit}; run=${ev.run?.status ?? '-'}; modelCall=${mc.length}/${panggilan.length}; lengkap=${ev.lengkap}`)
    }

    // ---- probe gagal-tertutup: tulis AgentRun ditolak → tak boleh ada panggilan penyedia
    const nama = `e3b_eval1_${acak()}`
    await prisma.$executeRawUnsafe(`CREATE FUNCTION "${nama}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'E3B_LEDGER_TULIS_DITOLAK'; END $$`)
    await prisma.$executeRawUnsafe(`CREATE TRIGGER "${nama}" BEFORE INSERT ON "AgentRun" FOR EACH ROW WHEN (NEW."tenantId" = '${tenantProbe}') EXECUTE FUNCTION "${nama}"()`)
    pemicu = nama
    const sebelum = keadaan.total
    let melempar = false
    try {
      await I.submitIntake(ctxProbe, { text: petaKasus.get('E01').teks, saveOriginal: false, confirmReprocess: false })
    } catch {
      melempar = true
    }
    const intakeProbe = await prisma.vesselCallIntake.count({ where: { tenantId: tenantProbe } })
    const runProbe = await prisma.agentRun.count({ where: { tenantId: tenantProbe } })
    bukti.probeGagalTertutup = { submitMelempar: melempar, panggilanPenyedia: keadaan.total - sebelum, barisIntake: intakeProbe, barisRun: runProbe }
    bukti.probeGagalTertutup.ok = melempar && keadaan.total === sebelum && intakeProbe === 0 && runProbe === 0

    // ---- privasi baris buku besar: tanpa sentinel dokumen, badan dokumen, kontak, kunci
    const teksLedger = JSON.stringify({
      run: await prisma.agentRun.findMany({ where: { tenantId: { in: [tenantUtama, tenantProbe] } }, include: { modelCalls: true } }),
      audit: await prisma.auditLog.findMany({ where: { tenantId: { in: [tenantUtama, tenantProbe] }, tableName: 'AgentRun' } }),
    })
    const temuan = pindai(teksLedger)
    if (F.POLA_SENTINEL.test(teksLedger)) temuan.push('SENTINEL_DOKUMEN')
    bukti.sentinelBersih = temuan.length === 0
    bukti.temuanPrivasiLedger = [...new Set(temuan)]
  } finally {
    if (pemicu) {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${pemicu}" ON "AgentRun"`).catch(() => {})
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${pemicu}"()`).catch(() => {})
    }
    if (bukti.db?.cocok) {
      try {
        await prisma.securityEvent.deleteMany({ where: { identifier: { in: users.map((u) => u.id) } } })
        await prisma.tenant.deleteMany({ where: { id: { in: [tenantUtama, tenantProbe] } } }) // CASCADE: user, intake, run, modelCall, audit, usage
        const sisa =
          (await prisma.tenant.count({ where: { id: { in: [tenantUtama, tenantProbe] } } })) +
          (await prisma.agentRun.count({ where: { tenantId: { in: [tenantUtama, tenantProbe] } } })) +
          (await prisma.vesselCallIntake.count({ where: { tenantId: { in: [tenantUtama, tenantProbe] } } })) +
          (await prisma.auditLog.count({ where: { tenantId: { in: [tenantUtama, tenantProbe] } } })) +
          (await prisma.securityEvent.count({ where: { identifier: { in: users.map((u) => u.id) } } })) +
          Number((await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname LIKE 'e3b_eval1_%'`))[0].n)
        bukti.pembersihan = { sisaBaris: sisa, bersih: sisa === 0 }
      } catch (e) {
        bukti.pembersihan = { bersih: false, galat: e?.name ?? 'Error' }
      }
    }
    await prisma.$disconnect().catch(() => {})
  }
  const semuaSlotLengkap = slotLedger.length > 0 && bukti.slot.length === slotLedger.length && bukti.slot.every((s) => s.lengkap)
  const g8 = { sumber: 'LEDGER_E2E_EXECUTOR', failClosedOk: bukti.probeGagalTertutup?.ok === true, e2eOk: semuaSlotLengkap, sentinelBersih: bukti.sentinelBersih === true }
  return { bukti, g8, hasilSlot }
}

// ------------------------------------------------------------------ inti
/**
 * Jalankan Eval-1 lewat runner. Mengembalikan laporan tersanitasi (tidak menulis berkas).
 *   mode 'offline' → transport = penyedia stub (bawaan: fixture GT) — TIDAK pernah fetch nyata.
 *   mode 'live'    → transport = fetch global nyata (E4) ATAU `transportUji` (uji; label DRY_RUN).
 * Seam uji (`nilaiKasusUji`, `validasiUji`) ditolak bila transport = jaringan.
 */
export async function jalankanRunner({
  mode,
  env = process.env,
  hariIni = new Date(),
  log = () => {},
  jawabStub = null,
  opsiStub = {},
  transportUji = null,
  nilaiKasusUji = null,
  validasiUji = null,
} = {}) {
  const tolak = (verdict, galat) => ({ label: LABEL_DRY, verdict, mode: mode ?? null, galat, panggilanNyata: 0 })
  if (mode !== MODE.OFFLINE && mode !== MODE.LIVE) return tolak('DITOLAK_MODE', ['MODE_WAJIB_EKSPLISIT'])
  const integritas = H.verifikasiBeku()
  if (integritas.length) return tolak('DITOLAK_INTEGRITAS', integritas)
  const rencana = H.susunRencana()
  const galatRencana = H.validasiRencana(rencana)
  if (galatRencana.length) return tolak('DITOLAK_RENCANA', galatRencana)
  const pra = periksaPrasyaratRunner(env, mode)
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
  if (transport === TRANSPORT.NETWORK && (nilaiKasusUji || validasiUji)) return tolak('DITOLAK_PRASYARAT', ['SEAM_UJI_DILARANG_SAAT_JARINGAN'])
  const label = transport === TRANSPORT.NETWORK ? LABEL_LIVE : LABEL_DRY

  const require = createRequire(import.meta.url)
  const jiti = require('jiti')(fileURLToPath(import.meta.url), { alias: { '@': join(AKAR, 'src') }, interopDefault: true })
  const muat = (rel) => jiti(join(AKAR, rel))

  const kasusTerurai = H.bekukanDalam(F.bangunKasusEval1(hariIni))
  H.bekukanDalam(F.KASUS_EVAL1)
  const petaKasus = new Map(kasusTerurai.map((k) => [k.id, k]))
  const hariIso = new Date(hariIni).toISOString().slice(0, 10)
  if (transport === TRANSPORT.STUB) fetchTransport = buatPenyediaStub(kasusTerurai, jawabStub ?? undefined, opsiStub).fn

  const db = env.SPIKE_DATABASE_URL ? uraiDbLokal(env.SPIKE_DATABASE_URL) : null
  const snapshot = Object.fromEntries(ENV_DIKELOLA.map((n) => [n, process.env[n]]))
  const fetchSebelum = globalThis.fetch
  let jaringanTerblokir = 0
  const { pencegat, keadaan } = H.buatPencegat(fetchTransport)
  const slot = []
  let ledger = { status: 'TIDAK_DIJALANKAN', alasan: db ? null : 'SPIKE_DATABASE_URL_TIDAK_DISET', g8: null, bukti: null }
  let galatFatal = null
  try {
    // Satu-satunya jalan keluar: URL OpenRouter → pencegat E2 → transport. Lainnya DIBLOKIR.
    globalThis.fetch = (url, init) => {
      if (String(url) !== H.URL_OPENROUTER) {
        jaringanTerblokir++
        return Promise.reject(new Error('EVAL1_JARINGAN_DIBLOKIR'))
      }
      return pencegat(url, init)
    }
    // Kunci: LIVE → kunci uji khusus (prasyarat menjamin kunci produksi KOSONG); lainnya → stub.
    process.env.OPENROUTER_API_KEY = transport === TRANSPORT.STUB ? KUNCI_STUB : env.SPIKE_OPENROUTER_API_KEY
    if (db) {
      process.env.DATABASE_URL = env.SPIKE_DATABASE_URL
      process.env.DIRECT_URL = env.SPIKE_DATABASE_URL
    }

    const X = muat('src/lib/ai/vessel-call-extract.ts')
    const PR = muat('src/lib/ai/perekam-panggilan.ts')
    const P = muat('src/services/intake/intake-policy.ts')
    const V = muat('src/lib/vessels.ts')
    const G = muat('src/services/intake/intake-gate.ts')
    if (G.BATAS_WAKTU_AI_BAWAAN_MS !== BATAS_WAKTU_MS) throw new Error('EVAL1_BATAS_WAKTU_BERBEDA_DARI_INTAKE')
    const NORM_VALIDASI = { imo: V.normalisasiImo, imoSah: V.imoCheckDigitSah, mmsi: V.normalisasiMmsi, mmsiSah: V.mmsiSah, callSign: V.normalisasiCallSign }
    const NORM_SKOR = { namaKapal: P.normalisasiNamaKapal, namaPort: P.normalisasiNamaPort, namaPihak: P.normalisasiNamaPihak, unlocode: P.normalisasiUnlocode, imo: V.normalisasiImo, mmsi: V.normalisasiMmsi, callSign: V.normalisasiCallSign }
    const nilaiKasus = nilaiKasusUji ?? S.nilaiKasus
    const validasi = validasiUji ?? P.validasiEkstraksi

    const pdfCache = new Map()
    for (const r of rencana) {
      if (r.blok === 'LEDGER_E2E') continue // dijalankan eksekutor di bawah, urutan rencana dipertahankan
      const k = petaKasus.get(r.kasus)
      if (keadaan.berhenti || keadaan.ditolak.some((d) => ['BATAS_PANGGILAN', 'BERHENTI_LUNAK_BIAYA', 'BATAS_TOKEN'].includes(d.alasan))) {
        slot.push({ ...r, status: 'TIDAK_DIJALANKAN', sebab: keadaan.berhenti ?? 'BATAS', panggilan: [], perekam: [] })
        continue
      }
      let masukan
      if (k.kind === 'PDF') {
        if (!pdfCache.has(k.id)) pdfCache.set(k.id, await F.bangunPdfEval1(k))
        masukan = { kind: 'PDF', bytes: pdfCache.get(k.id), filename: k.pdf.namaBerkas }
      } else masukan = { kind: 'TEXT', text: P.normalisasiTeksSumber(k.teks) }
      const idx = keadaan.panggilan.length
      const perekam = []
      let raw = null
      let galat = null
      try {
        raw = await PR.jalankanDenganKonteks({ model: r.model, kemampuan: r.profil === 'TANPA_TEMPERATURE' ? H.PROFIL_TANPA_SUHU : null, catat: (m) => perekam.push(perekamRingkas(m)) }, () =>
          X.ekstrakDenganBatasWaktu(X.ekstrakLewatOpenRouter, masukan, BATAS_WAKTU_MS),
        )
      } catch (e) {
        galat = typeof e?.kode === 'string' ? e.kode : 'ERROR'
      }
      let post = null
      let galatValidator = null
      if (raw !== null && raw !== undefined && S.masalahArgumen(raw).length === 0) {
        try {
          post = validasi(raw, { inputKind: k.kind, sourceText: k.kind === 'TEXT' ? masukan.text : null, hariIni: hariIso, norm: NORM_VALIDASI })
        } catch {
          galatValidator = 'VALIDATOR_ERROR'
        }
      }
      let hasil = null
      let galatPenilai = null
      if (!galatValidator) {
        try {
          hasil = nilaiKasus(k, raw ?? null, post, NORM_SKOR)
        } catch {
          galatPenilai = 'PENILAI_ERROR'
        }
      }
      const status = galat
        ? `GAGAL:${galat}`
        : galatValidator
          ? `GAGAL:${galatValidator}`
          : galatPenilai
            ? `GAGAL:${galatPenilai}`
            : hasil.argumenTidakSah
              ? `GAGAL:ARGUMEN_TIDAK_SAH:${hasil.argumenTidakSah.join('+')}`
              : 'OK'
      // Slot tanpa hasil penilaian TIDAK ikut ringkasan → run tidak lengkap → tak pernah PASS.
      slot.push({ ...r, status, panggilan: keadaan.panggilan.slice(idx), perekam, hasil })
      log(`  ${String(r.seq).padStart(2)} ${r.blok.padEnd(13)} ${r.kasus} → ${status}; FATAL(POST)=${hasil?.POST?.jumlah.FATAL ?? '-'}`)
    }

    const slotLedger = rencana.filter((r) => r.blok === 'LEDGER_E2E')
    if (db) {
      Object.assign(process.env, { TAH_CORE_ENABLED: 'true', VESSEL_CALL_INTAKE_ENABLED: 'true', VESSEL_CALL_INTAKE_EXTRACTOR: 'OPENROUTER', AUTOMATION_MONITORING_ENABLED: 'true' })
      const pindai = (t) => H.pindaiPrivasiEval1(t, { kunci: env.SPIKE_OPENROUTER_API_KEY, frasa: H.FRASA_OTORISASI_EVAL1, kasus: kasusTerurai, rahasiaEnv: [env.SPIKE_DATABASE_URL] })
      try {
        const e = await eksekusiLedgerE2E({ muat, slotLedger, petaKasus, keadaan, db, pindai, log })
        ledger = { status: 'DIJALANKAN', g8: e.g8, bukti: e.bukti }
        for (const r of slotLedger) {
          const h = e.hasilSlot.get(r.seq) ?? { status: 'TIDAK_DIJALANKAN', panggilan: [] }
          slot.push({ ...r, status: h.status, sebab: h.sebab, panggilan: h.panggilan, perekam: [], hasil: null })
        }
      } catch (e) {
        // Infrastruktur ledger gagal (DB tak terjangkau / bukan DB spike): G8 TIDAK dievaluasi → INCONCLUSIVE.
        ledger = { status: 'GAGAL_INFRASTRUKTUR', galat: e?.kode ?? e?.name ?? 'Error', g8: null, bukti: null }
        for (const r of slotLedger) slot.push({ ...r, status: 'GAGAL:LEDGER_INFRASTRUKTUR', panggilan: [], perekam: [], hasil: null })
      }
    } else {
      for (const r of slotLedger) slot.push({ ...r, status: 'TIDAK_DIJALANKAN', sebab: 'SPIKE_DATABASE_URL_TIDAK_DISET', panggilan: [], perekam: [], hasil: null })
    }
  } catch (e) {
    galatFatal = e?.message?.startsWith('EVAL1_') ? e.message : e?.name ?? 'Error'
  } finally {
    globalThis.fetch = fetchSebelum
    for (const n of ENV_DIKELOLA) {
      if (snapshot[n] === undefined) delete process.env[n]
      else process.env[n] = snapshot[n]
    }
  }
  slot.sort((a, b) => a.seq - b.seq)

  const dasar = {
    label,
    spike: 'PRD-005 Step 3C Controlled Evaluation 1',
    runner: VERSI_RUNNER,
    mode,
    transport,
    panggilanNyata: transport === TRANSPORT.NETWORK ? keadaan.total : 0,
    panggilanTransport: keadaan.total,
    kunciTerpakai: transport === TRANSPORT.STUB ? 'stub' : 'SPIKE_OPENROUTER_API_KEY (nilai tidak dicatat)',
    catatanModel: 'anthropic/claude-sonnet-5 TETAP PENDING_SPIKE — laporan ini bukan aktivasi.',
    versiPenilai: S.VERSI_PENILAI,
    versiGt: F.EVAL1_VERSI,
    hashGt: H.HASH_GT_BEKU,
    tanggalEksekusi: hariIso,
    rencana: { direncanakan: rencana.length, maks: H.BATAS_OWNER.maksPanggilan },
    batas: H.BATAS_OWNER,
    biayaUsd: Number(keadaan.biaya.toFixed(6)),
    token: keadaan.token,
    berhenti: keadaan.berhenti,
    ditolakPencegat: keadaan.ditolak,
    jaringanTerblokir,
  }
  let laporan
  if (galatFatal) {
    laporan = { ...dasar, verdict: 'GAGAL_RUNNER', galat: [galatFatal], ledger, slot: slot.map((x) => ({ seq: x.seq, blok: x.blok, kasus: x.kasus, status: x.status })) }
  } else {
    let gerbang
    let ringkasan
    try {
      const run = (blok) => {
        const xs = slot.filter((x) => x.blok === blok && x.hasil)
        return { hasil: xs.map((x) => x.hasil), ringkas: S.ringkasRun(xs.map((x) => x.hasil), { latensiMs: xs.flatMap((x) => x.panggilan.map((p) => p.latencyMs)), jumlahKasusDiharapkan: blok === 'S5_TANPA_SUHU' ? 4 : 15 }) }
      }
      const s5 = [run('S5_RUN1'), run('S5_RUN2')]
      const s45 = run('S45_KONTROL')
      const tanpaSuhu = run('S5_TANPA_SUHU')
      const pelanggaranPagar = keadaan.ditolak.filter((d) => ['HOST_TIDAK_DIIZINKAN', 'MODEL_TIDAK_DIIZINKAN'].includes(d.alasan)).map((d) => d.alasan)
      if (jaringanTerblokir) pelanggaranPagar.push('PERCOBAAN_JARINGAN_LAIN')
      const operasional = {
        lengkap: [s5[0], s5[1], s45].every((r) => r.ringkas.lengkap),
        dihentikan: !!keadaan.berhenti || slot.some((x) => x.status === 'TIDAK_DIJALANKAN' && x.blok !== 'LEDGER_E2E'),
        pelanggaranPagar,
        servedCocok: keadaan.berhenti !== 'SERVED_MODEL_BERBEDA',
      }
      // G8 HANYA dari eksekutor ledger; tak ada jalur untuk menyuntik bukti dari luar.
      gerbang = S.evaluasiGerbang({ s5, s45, operasional, ledger: ledger.g8 })
      ringkasan = { S5_RUN1: s5[0].ringkas, S5_RUN2: s5[1].ringkas, S45_KONTROL: s45.ringkas, S5_TANPA_SUHU: tanpaSuhu.ringkas }
    } catch {
      gerbang = null
    }
    laporan = gerbang
      ? {
          ...dasar,
          ringkasan,
          gerbang: gerbang.gerbang,
          verdict: gerbang.verdict,
          catatan: gerbang.catatan,
          ledger,
          slot: slot.map((x) => ({
            seq: x.seq,
            blok: x.blok,
            kasus: x.kasus,
            requestedModel: x.model,
            profil: x.profil,
            status: x.status,
            sebab: x.sebab,
            panggilan: x.panggilan,
            perekam: x.perekam,
            hasil: x.hasil ? ringkasHasilKasus(x.hasil) : null,
          })),
        }
      : { ...dasar, verdict: 'GAGAL_PENILAI', galat: ['RINGKASAN_ATAU_GERBANG_GAGAL'], ledger, slot: slot.map((x) => ({ seq: x.seq, blok: x.blok, kasus: x.kasus, status: x.status })) }
  }
  const temuan = H.pindaiPrivasiEval1(JSON.stringify(laporan), { kunci: env.SPIKE_OPENROUTER_API_KEY, frasa: H.FRASA_OTORISASI_EVAL1, kasus: kasusTerurai, rahasiaEnv: [env.SPIKE_DATABASE_URL, env.DATABASE_URL] })
  laporan.privasi = { temuan, lulus: temuan.length === 0 }
  if (H.verifikasiBeku().length) {
    laporan.integritasAkhir = 'BERUBAH_SELAMA_RUN'
    laporan.verdict = 'DITOLAK_INTEGRITAS'
  }
  return laporan
}

/**
 * Tulis laporan HANYA bila pemindai privasi lulus; bila tidak, yang ditulis hanyalah pemberitahuan
 * minimal tanpa isi (jalur E2 tulisLaporan: menolak jalur di dalam repo).
 */
export function tulisLaporanAman(jalur, laporan) {
  const g = periksaJalurLaporan(jalur)
  if (g.length) throw new Error(`EVAL1_${g[0]}`)
  if (!laporan?.privasi?.lulus) {
    return { jalur: H.tulisLaporan(jalur, { label: laporan?.label ?? LABEL_DRY, verdict: 'LAPORAN_DITAHAN_PRIVASI', temuan: laporan?.privasi?.temuan ?? ['TIDAK_DIPINDAI'] }), ditahan: true }
  }
  return { jalur: H.tulisLaporan(jalur, laporan), ditahan: false }
}

// ------------------------------------------------------------------------ CLI
export async function cli(argv = process.argv.slice(2), env = process.env, cetak = console.log) {
  if (argv.length === 0) {
    const integritas = H.verifikasiBeku()
    cetak('PRD-005 Step 3C — Eval-1 runner (E3B). Tidak ada mode bawaan; tidak ada panggilan.')
    cetak(`integritas GT beku : ${integritas.length ? 'GAGAL ' + integritas.join(',') : 'OK'} (hash ${H.HASH_GT_BEKU.slice(0, 16)}…)`)
    cetak(`rencana panggilan  : ${H.susunRencana().length} / maks ${H.BATAS_OWNER.maksPanggilan}`)
    cetak('pakai              : --mode offline|live --report <jalur absolut di luar repo>')
    return 2
  }
  const a = uraiArgumen(argv)
  const galat = [...a.galat, ...(a.laporan !== null ? periksaJalurLaporan(a.laporan) : [])]
  if (!a.galat.length && a.mode) galat.push(...periksaPrasyaratRunner(env, a.mode))
  if (galat.length) {
    cetak(`DITOLAK (0 panggilan): ${galat.join(' | ')}`)
    return 3
  }
  cetak(`Eval-1 runner — mode ${a.mode.toUpperCase()} — ${a.mode === MODE.LIVE ? LABEL_LIVE + ' (panggilan penyedia NYATA)' : LABEL_DRY}`)
  const laporan = await jalankanRunner({ mode: a.mode, env, log: cetak })
  if (String(laporan.verdict).startsWith('DITOLAK')) {
    cetak(`DITOLAK (0 panggilan): ${laporan.galat?.join(' | ')}`)
    return 3
  }
  const { jalur, ditahan } = tulisLaporanAman(a.laporan, laporan)
  cetak(`label=${laporan.label} transport=${laporan.transport} panggilanNyata=${laporan.panggilanNyata} panggilanTransport=${laporan.panggilanTransport} biaya=US$${laporan.biayaUsd}`)
  cetak(`ledger=${laporan.ledger?.status} G8=${JSON.stringify(laporan.gerbang?.G8?.lulus ?? null)} verdict=${laporan.verdict} privasi=${laporan.privasi.lulus ? 'LULUS' : 'GAGAL'}`)
  cetak(`laporan${ditahan ? ' DITAHAN (privasi)' : ''}: ${jalur}`)
  return ditahan ? 4 : 0
}

const diCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (diCli) process.exit(await cli())
