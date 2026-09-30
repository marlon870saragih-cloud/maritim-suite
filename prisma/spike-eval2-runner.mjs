// PRD-005 E5 Step 5 — EVAL-2 TARGETED — RUNNER (pipa produksi + diagnostik RAW tersanitasi).
//
// Eval-1 (spike-eval1*.mjs) TIDAK disentuh; runner ini MEMAKAI ULANG ekspornya:
//   • pencegat penyedia (buatPencegat): host tunggal, allowlist model, batas panggilan/biaya/token,
//     usage.cost wajib, served model (pencocok Eval-1 longgar; Eval-2 menambah pagarServedPersis:
//     served === requested persis, selain itu SERVED_MODEL_BERBEDA → berhenti);
//   • pemindai privasi (pindaiPrivasiEval1) + penulis laporan (tulisLaporan, jalur di luar repo);
//   • pengurai CLI, pemeriksa jalur laporan, pengurai DB lokal (spike-eval1-runner.mjs).
// Khas Eval-2: verifikasi beku Eval-2, rencana 80 slot, gerbang G1–G12/G9R (spike-eval2-penilai),
// pagar PROYEKSI biaya (tak memulai panggilan yang bisa melewati batas keras), served model per
// slot, eksekutor LEDGER_E2E Eval-2, dan laporan yang HANYA memuat diagnostik tersanitasi.
//
// Jalur AI TIDAK diduplikasi: jalankanDenganKonteks → ekstrakDenganBatasWaktu →
// ekstrakLewatOpenRouter (prompt v2) → chatCompletionMeta → fetch global (dipasangi pencegat).
// Lalu validasiEkstraksi (pagar Step 1/2) → penilai Eval-1 → gerbang Eval-2. RAW (argumen tool)
// dan POST (proposal validator) dinilai TERPISAH; RAW tidak pernah diganti POST.
//
// ── Menjalankan ─────────────────────────────────────────────────────────────────────────
//   Luring (stub deterministik dari GT; DRY_RUN / NON-LIVE; nol panggilan penyedia):
//     [SPIKE_DATABASE_URL=postgresql://…@127.0.0.1:…/…] \
//     node prisma/spike-eval2-runner.mjs --mode offline --report /tmp/eval2-dry.json
//   Langsung (HANYA dengan otorisasi owner — BELUM diotorisasi di Step 5):
//     SPIKE_AUTHORIZED=<frasa Eval-2> SPIKE_OPENROUTER_API_KEY=<kunci uji khusus> \
//     SPIKE_DATABASE_URL=postgresql://…@127.0.0.1:…/… \
//     node prisma/spike-eval2-runner.mjs --mode live --report /tmp/eval2-live.json
//   Tanpa argumen → hanya cetak integritas & rencana; TIDAK ada mode bawaan.

import { createRequire } from 'node:module'
import { randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import * as H from './spike-eval1.mjs'
import * as R1 from './spike-eval1-runner.mjs'
import * as S from './spike-eval1-scorer.mjs'
import * as F from './fixtures/spike-intake/eval2-cases.mjs'
import * as B from './spike-eval2-beku.mjs'
import * as E from './spike-eval2-penilai.mjs'

const AKAR = fileURLToPath(new URL('..', import.meta.url))

export const VERSI_RUNNER_EVAL2 = 'prd005-e5-eval2/runner-1'
export const FRASA_OTORISASI_EVAL2 = 'PRD-005-E5-EVAL2-LIVE'
export const MODE = R1.MODE
export const TRANSPORT = R1.TRANSPORT
export const LABEL_DRY = R1.LABEL_DRY
export const LABEL_LIVE = R1.LABEL_LIVE
export const KUNCI_STUB = 'stub-kunci-eval2-runner-luring-000000'
export const AWALAN_TENANT = 'e5eval2'
export const NAMA_TENANT = 'E5-EVAL2 (sintetis, dibuang)'
const HOST_LOKAL = ['localhost', '127.0.0.1', '::1', '[::1]']
const BATAS_WAKTU_MS = 60_000

/**
 * Batas run Eval-2: panggilan & biaya dari RENCANA_EVAL2 BEKU (maks 90, lunak 2,70, keras 3,00);
 * batas token = Eval-1 (tidak dinaikkan). Runner menolak batas yang lebih longgar dari ini.
 */
export const BATAS_EVAL2 = Object.freeze({
  rencana: F.RENCANA_EVAL2.direncanakan,
  maksPanggilan: F.RENCANA_EVAL2.maksPanggilan,
  biayaLunakUsd: F.RENCANA_EVAL2.biayaLunakUsd,
  biayaKerasUsd: F.RENCANA_EVAL2.biayaKerasUsd,
  tokenInput: H.BATAS_OWNER.tokenInput,
  tokenOutput: H.BATAS_OWNER.tokenOutput,
})

const ENV_DIKELOLA = ['OPENROUTER_API_KEY', 'DATABASE_URL', 'DIRECT_URL', 'TAH_CORE_ENABLED', 'VESSEL_CALL_INTAKE_ENABLED', 'VESSEL_CALL_INTAKE_EXTRACTOR', 'AUTOMATION_MONITORING_ENABLED', 'AUTOMATION_TENANT_IDS']

// ------------------------------------------------------------------ prasyarat
/** Batas yang diminta tidak boleh lebih longgar dari batas beku Eval-2. */
export function periksaBatas(batas) {
  const g = []
  for (const k of ['maksPanggilan', 'biayaLunakUsd', 'biayaKerasUsd', 'tokenInput', 'tokenOutput']) {
    if (!(typeof batas?.[k] === 'number' && batas[k] <= BATAS_EVAL2[k])) g.push(`BATAS_MELEBIHI_BEKU:${k}`)
  }
  if (batas?.biayaLunakUsd > batas?.biayaKerasUsd) g.push('BATAS_LUNAK_MELEBIHI_KERAS')
  return g
}

/**
 * Galat prasyarat (kosong = lolos). Variabel berbahaya dicek di `env` (setelan pemanggil) DAN di
 * process.env nyata. LANGSUNG: frasa Eval-2 PERSIS (frasa Eval-1 / Phase 0 ditolak), kunci uji
 * khusus, DB lokal wajib.
 */
export function periksaPrasyaratEval2(env, mode, proses = process.env) {
  const galat = []
  if (mode !== MODE.OFFLINE && mode !== MODE.LIVE) return ['MODE_TIDAK_SAH']
  const dua = (n) => [env[n], proses[n]]
  if (dua('NODE_ENV').includes('production')) galat.push('NODE_ENV=production ditolak')
  if (dua('OPENROUTER_API_KEY').some(Boolean)) galat.push('OPENROUTER_API_KEY harus KOSONG (kunci produksi tak pernah dipakai)')
  if (dua('TAH_INTAKE_MODEL').some((v) => v !== undefined && v.trim() !== '')) galat.push('TAH_INTAKE_MODEL harus kosong')
  if (dua('OPENROUTER_SPK_MODEL').some((v) => v !== undefined && v.trim() !== '' && v.trim() !== H.MODEL_S45)) galat.push('OPENROUTER_SPK_MODEL harus kosong atau Sonnet 4.5')
  if (dua('VESSEL_CALL_INTAKE_EXTRACTOR').some((v) => v !== undefined && v.trim() !== '' && v.trim() !== 'OPENROUTER')) galat.push('VESSEL_CALL_INTAKE_EXTRACTOR harus kosong/OPENROUTER')
  const spikeDb = env.SPIKE_DATABASE_URL
  if (spikeDb) {
    const d = R1.uraiDbLokal(spikeDb)
    if (!d.ok) galat.push(`SPIKE_DATABASE_URL hanya boleh postgres di localhost (${d.alasan})`)
  } else if (mode === MODE.LIVE) galat.push('SPIKE_DATABASE_URL (DB lokal untuk LEDGER_E2E/G8) wajib untuk mode live')
  for (const n of ['DATABASE_URL', 'DIRECT_URL']) if (dua(n).some((v) => v && v !== spikeDb)) galat.push(`${n} harus kosong atau sama dengan SPIKE_DATABASE_URL`)
  if (mode === MODE.LIVE) {
    if (env.SPIKE_AUTHORIZED === H.FRASA_OTORISASI_EVAL1 || env.SPIKE_AUTHORIZED === H.FRASA_PHASE0) galat.push('SPIKE_AUTHORIZED berisi frasa Eval-1/Phase 0 — Eval-2 butuh frasanya sendiri')
    else if (env.SPIKE_AUTHORIZED !== FRASA_OTORISASI_EVAL2) galat.push('SPIKE_AUTHORIZED tidak sama dengan frasa otorisasi Eval-2')
    if (!env.SPIKE_OPENROUTER_API_KEY) galat.push('SPIKE_OPENROUTER_API_KEY (kunci uji khusus) tidak diset')
  }
  return galat
}

/** G12 — konsistensi validator luring (check-eval2-gt.mjs) wajib lulus pada commit yang sama. */
export function jalankanG12() {
  try {
    execFileSync(process.execPath, [join(AKAR, 'prisma/check-eval2-gt.mjs')], { cwd: AKAR, stdio: 'ignore', timeout: 180_000 })
    return true
  } catch {
    return false
  }
}

// ------------------------------------------------------------------ stub luring
const pilihGt = (n) => (!n || typeof n !== 'object' || !('status' in n) ? null : n.status === 'PRESENT' ? n.value : n.status === 'ACCEPTABLE' ? n.values.find((x) => x !== null) ?? null : null)

/** Keluaran tool "sempurna" DARI GT (fixture DRY_RUN; bukan keluaran model). */
export function jawabanSempurna(k) {
  const g = k.gt
  const o = { classification: g.classification.values[0] }
  o.vessels = g.vessels.daftar.map((v) => Object.fromEntries(['name', 'imo', 'mmsi', 'callSign', 'vesselType', 'role'].map((f) => [f, pilihGt(v[f])]).filter(([, x]) => x !== null)))
  for (const f of ['portName', 'portUnlocode', 'jetty', 'eta', 'etb', 'etc', 'etd', 'principalName', 'customerName', 'agencyType', 'clientReference', 'requestDate']) {
    const x = pilihGt(g[f])
    if (x !== null) o[f] = x
  }
  o.cargoes = g.cargoes.bentukDiterima[0].map((c) => Object.fromEntries(['name', 'quantity', 'unit', 'operation'].map((f) => [f, pilihGt(c[f])]).filter(([, x]) => x !== null)))
  if (!('status' in g.contact)) {
    const c = Object.fromEntries(['name', 'email', 'phone'].map((f) => [f, pilihGt(g.contact[f])]).filter(([, x]) => x !== null))
    if (Object.keys(c).length) o.contact = c
  }
  return o
}

/**
 * Penyedia stub deterministik. Kasus dikenali dari isi dokumen ternormalisasi di pesan user.
 * `jawab(kasus, model, n)` → argumen tool, atau: { __mentah: '<teks>' } · { __tanpaTool: true } ·
 * { __http: 500 } · { __lempar: true } · { __bukanJson: true } (badan respons bukan JSON).
 * `opsi.served(model, n)` / `opsi.biaya(n)` / `opsi.tanpaBiaya` meniru metadata penyedia.
 */
export function buatPenyediaStubEval2(kasus, jawab = (k) => jawabanSempurna(k), opsi = {}) {
  const catatan = []
  let n = 0
  const fn = async (url, init) => {
    n++
    const body = JSON.parse(init.body)
    const pesanUser = JSON.stringify(body.messages?.[1]?.content ?? '')
    const k = kasus.find((x) => pesanUser.includes(JSON.stringify(x.teksNormal).slice(1, -1))) ?? null
    catatan.push({ n, kasus: k?.id ?? null, model: body.model })
    const a = jawab(k, body.model, n)
    if (a?.__lempar) throw new Error('stub: kegagalan transport tersimulasi')
    if (a?.__http) return new Response(JSON.stringify({ error: { message: 'stub provider error' } }), { status: a.__http, headers: { 'content-type': 'application/json' } })
    if (a?.__bukanJson) return new Response('<html>bukan json</html>', { status: 200, headers: { 'content-type': 'text/html' } })
    const argumen = typeof a?.__mentah === 'string' ? a.__mentah : JSON.stringify(a)
    const pesan = a?.__tanpaTool ? { content: 'tidak ada tool call' } : { tool_calls: [{ function: { name: 'isi_intake_kunjungan', arguments: argumen } }] }
    const biaya = typeof opsi.biaya === 'function' ? opsi.biaya(n) : opsi.biaya ?? 0.01
    return new Response(
      JSON.stringify({
        id: `gen-DRYRUN2-${n}`,
        model: typeof opsi.served === 'function' ? opsi.served(body.model, n) : opsi.served ?? body.model,
        usage: opsi.tanpaBiaya ? { prompt_tokens: 2500, completion_tokens: 400 } : { prompt_tokens: 2500, completion_tokens: 400, cost: biaya },
        choices: [{ finish_reason: a?.__tanpaTool ? 'stop' : 'tool_calls', message: pesan }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }
  return { fn, catatan, jumlah: () => n }
}

/**
 * Pencocokan served model Eval-2: KETAT, served === requested. Tidak ada akhiran yang diterima
 * (`-mini`, `-fast`, `:x`, `@x`, snapshot bertanggal, dst.) — pencocok Eval-1 yang longgar
 * (H.modelTerlayaniCocok) sengaja TIDAK dipakai di Eval-2.
 */
export const modelTerlayaniPersis = (diminta, dilayani) => typeof diminta === 'string' && diminta.length > 0 && typeof dilayani === 'string' && dilayani === diminta

/**
 * Pagar served model KETAT di BELAKANG pencegat Eval-1 (yang longgar): setelah respons, setiap
 * panggilan SUKSES baru yang served model-nya tidak persis sama dengan requested → berhenti
 * SERVED_MODEL_BERBEDA, sehingga slot berikutnya tidak dijalankan.
 */
export function pagarServedPersis(pencegat, keadaan) {
  return async (url, init) => {
    const idx = keadaan.panggilan.length
    try {
      return await pencegat(url, init)
    } finally {
      if (keadaan.panggilan.slice(idx).some((p) => p.http === 'SUKSES' && !modelTerlayaniPersis(p.requestedModel, p.servedModel))) {
        keadaan.berhenti = keadaan.berhenti ?? 'SERVED_MODEL_BERBEDA'
      }
    }
  }
}

/**
 * Pagar proyeksi biaya di DEPAN pencegat: panggilan berikutnya DITOLAK bila biaya berjalan +
 * biaya panggilan termahal yang sudah teramati akan melewati batas keras. Mencegah melampaui
 * US$3,00 (pencegat Eval-1 hanya menolak sesudah batas terlewati).
 */
export function pagarProyeksiBiaya(pencegat, keadaan, batas) {
  return async (url, init) => {
    const maksPerPanggilan = keadaan.panggilan.reduce((m, p) => Math.max(m, p.biayaUsd ?? 0), 0)
    if (keadaan.total > 0 && keadaan.biaya + maksPerPanggilan > batas.biayaKerasUsd) {
      keadaan.ditolak.push({ alasan: 'PROYEKSI_BIAYA_KERAS', biaya: Number(keadaan.biaya.toFixed(6)), maksPerPanggilan })
      keadaan.berhenti = keadaan.berhenti ?? 'PROYEKSI_BIAYA_KERAS'
      throw new Error('EVAL2_PROYEKSI_BIAYA_KERAS')
    }
    return pencegat(url, init)
  }
}

// ------------------------------------------------------------------ LEDGER_E2E (Eval-2)
const acak = () => randomBytes(6).toString('hex')

async function sapuSisa(prisma) {
  const lama = await prisma.tenant.findMany({ where: { id: { startsWith: AWALAN_TENANT }, companyName: NAMA_TENANT }, select: { id: true } })
  if (lama.length) {
    const ids = lama.map((t) => t.id)
    const users = await prisma.user.findMany({ where: { tenantId: { in: ids } }, select: { id: true } })
    await prisma.securityEvent.deleteMany({ where: { identifier: { in: users.map((u) => u.id) } } })
    await prisma.tenant.deleteMany({ where: { id: { in: ids } } })
  }
  const pemicu = await prisma.$queryRawUnsafe(`SELECT tgname FROM pg_trigger WHERE tgname LIKE 'e5_eval2_%'`)
  for (const { tgname } of pemicu) await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${tgname}" ON "AgentRun"`)
  await prisma.$executeRawUnsafe(`DO $$ DECLARE f record; BEGIN FOR f IN SELECT proname FROM pg_proc WHERE proname LIKE 'e5_eval2_%' LOOP EXECUTE format('DROP FUNCTION IF EXISTS %I()', f.proname); END LOOP; END $$`)
  return lama.length
}

/**
 * Eksekutor LEDGER_E2E Eval-2 (adaptasi eksekutor Eval-1 yang tidak diekspor & tidak boleh diubah).
 * submitIntake SUNGGUHAN pada tenant sintetis di DB LOKAL → AgentRun/AgentModelCall/AuditLog dibaca
 * kembali → bukti G8; probe gagal-tertutup (INSERT AgentRun ditolak → nol panggilan penyedia);
 * pemindaian privasi baris ledger; semua baris dihapus di akhir.
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
    const [id] = await prisma.$queryRawUnsafe('SELECT current_database() AS db, host(inet_server_addr()) AS host, inet_server_port() AS port')
    if (!(id.db === db.database && Number(id.port) === db.port && (HOST_LOKAL.includes(id.host) || id.host === '::1'))) {
      bukti.db = { cocok: false }
      throw Object.assign(new Error('EVAL2_DB_TERSAMBUNG_BUKAN_SPIKE'), { kode: 'DB_TIDAK_COCOK' })
    }
    bukti.db = { cocok: true, host: id.host, port: Number(id.port), database: id.db, lokal: true }
    bukti.sisaDisapu = await sapuSisa(prisma)
    const trial = new Date(Date.now() + 7 * 86_400_000)
    for (const t of [tenantUtama, tenantProbe]) {
      await prisma.tenant.create({ data: { id: t, companyName: NAMA_TENANT, trialEndsAt: trial } })
      users.push(await prisma.user.create({ data: { tenantId: t, email: `e5-eval2-${t}@uji.invalid`, name: 'E5-EVAL2 runner', password: `!tidak-bisa-login-${acak()}`, role: 'ADMIN', isActive: true } }))
    }
    process.env.AUTOMATION_TENANT_IDS = `${tenantUtama},${tenantProbe}`
    const ctxUtama = { tenantId: tenantUtama, userId: users[0].id, role: 'ADMIN' }
    const ctxProbe = { tenantId: tenantProbe, userId: users[1].id, role: 'ADMIN' }
    bukti.dijalankan = true

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
      const runs = intake ? await prisma.agentRun.findMany({ where: { tenantId: tenantUtama, inputHash: intake.inputHash }, include: { modelCalls: { orderBy: { seq: 'asc' } } } }) : []
      const run = runs[0] ?? null
      const audit = run ? await prisma.auditLog.findMany({ where: { tenantId: tenantUtama, tableName: 'AgentRun', recordId: run.id }, orderBy: { createdAt: 'asc' } }) : []
      const mc = run?.modelCalls ?? []
      const ev = {
        submit: galat ? `GAGAL:${galat}` : hasil?.reused ? 'DIPAKAI_ULANG' : 'OK',
        intake: intake ? { status: intake.status, classification: intake.classification } : null,
        jumlahRun: runs.length,
        run: run ? { status: run.status, outcome: run.outcome, agentKey: run.agentKey, subjekCocok: !!intake && run.subjectId === intake.id, selesai: !!run.finishedAt && run.lateCompletion === false } : null,
        modelCall: mc.map((c) => ({ seq: c.seq, status: c.status, requestedModel: c.requestedModel, servedModel: c.servedModel, promptVersion: c.promptVersion, schemaVersion: c.schemaVersion, promptHashCocok: c.promptHash === X.HASH_PROMPT_INTAKE })),
        panggilanPencegat: panggilan.length,
        auditRun: audit.map((a) => a.action),
      }
      ev.lengkap =
        ev.submit === 'OK' && ev.intake?.status === 'NEEDS_REVIEW' && ev.jumlahRun === 1 && ev.run?.status === 'SUCCEEDED' && ev.run?.outcome === 'PROPOSAL_CREATED' &&
        ev.run?.agentKey === 'INTAKE' && ev.run?.subjekCocok && ev.run?.selesai && panggilan.length >= 1 && mc.length === panggilan.length &&
        mc.every((c, i) => c.seq === i + 1 && c.requestedModel === r.model && c.promptHash === X.HASH_PROMPT_INTAKE && c.promptVersion === X.VERSI_PROMPT_INTAKE) &&
        mc.filter((c) => c.status === 'OK').every((c) => modelTerlayaniPersis(r.model, c.servedModel)) && ev.auditRun.includes('CREATE') && ev.auditRun.includes('UPDATE')
      bukti.slot.push({ seq: r.seq, kasus: r.kasus, ...ev })
      hasilSlot.set(r.seq, { status: galat ? `GAGAL:${galat}` : ev.lengkap ? 'OK' : 'GAGAL:BUKTI_LEDGER_TIDAK_LENGKAP', panggilan })
      log(`  ${String(r.seq).padStart(2)} LEDGER_E2E    ${r.kasus} → ${ev.submit}; run=${ev.run?.status ?? '-'}; modelCall=${mc.length}/${panggilan.length}; lengkap=${ev.lengkap}`)
    }

    const nama = `e5_eval2_${acak()}`
    await prisma.$executeRawUnsafe(`CREATE FUNCTION "${nama}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'E5_LEDGER_TULIS_DITOLAK'; END $$`)
    await prisma.$executeRawUnsafe(`CREATE TRIGGER "${nama}" BEFORE INSERT ON "AgentRun" FOR EACH ROW WHEN (NEW."tenantId" = '${tenantProbe}') EXECUTE FUNCTION "${nama}"()`)
    pemicu = nama
    const sebelum = keadaan.total
    let melempar = false
    try {
      await I.submitIntake(ctxProbe, { text: petaKasus.get(slotLedger[0].kasus).teks, saveOriginal: false, confirmReprocess: false })
    } catch {
      melempar = true
    }
    const intakeProbe = await prisma.vesselCallIntake.count({ where: { tenantId: tenantProbe } })
    const runProbe = await prisma.agentRun.count({ where: { tenantId: tenantProbe } })
    bukti.probeGagalTertutup = { submitMelempar: melempar, panggilanPenyedia: keadaan.total - sebelum, barisIntake: intakeProbe, barisRun: runProbe }
    bukti.probeGagalTertutup.ok = melempar && keadaan.total === sebelum && intakeProbe === 0 && runProbe === 0

    const teksLedger = JSON.stringify({
      run: await prisma.agentRun.findMany({ where: { tenantId: { in: [tenantUtama, tenantProbe] } }, include: { modelCalls: true } }),
      audit: await prisma.auditLog.findMany({ where: { tenantId: { in: [tenantUtama, tenantProbe] }, tableName: 'AgentRun' } }),
    })
    const temuan = pindai(teksLedger)
    if (F.POLA_SENTINEL_EVAL2.test(teksLedger)) temuan.push('SENTINEL_DOKUMEN')
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
        await prisma.tenant.deleteMany({ where: { id: { in: [tenantUtama, tenantProbe] } } })
        const sisa =
          (await prisma.tenant.count({ where: { id: { in: [tenantUtama, tenantProbe] } } })) +
          (await prisma.agentRun.count({ where: { tenantId: { in: [tenantUtama, tenantProbe] } } })) +
          (await prisma.vesselCallIntake.count({ where: { tenantId: { in: [tenantUtama, tenantProbe] } } })) +
          (await prisma.auditLog.count({ where: { tenantId: { in: [tenantUtama, tenantProbe] } } })) +
          (await prisma.securityEvent.count({ where: { identifier: { in: users.map((u) => u.id) } } })) +
          Number((await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname LIKE 'e5_eval2_%'`))[0].n)
        bukti.pembersihan = { sisaBaris: sisa, bersih: sisa === 0 }
      } catch (e) {
        bukti.pembersihan = { bersih: false, galat: e?.name ?? 'Error' }
      }
    }
    await prisma.$disconnect().catch(() => {})
  }
  const semuaSlotLengkap = slotLedger.length > 0 && bukti.slot.length === slotLedger.length && bukti.slot.every((s) => s.lengkap)
  return { bukti, g8: { sumber: 'LEDGER_E2E_EXECUTOR', failClosedOk: bukti.probeGagalTertutup?.ok === true, e2eOk: semuaSlotLengkap, sentinelBersih: bukti.sentinelBersih === true }, hasilSlot }
}

// ------------------------------------------------------------------ privasi laporan
/** Nilai string GT (nama, pihak, kontak, rujukan) yang TIDAK boleh muncul utuh di laporan. */
export function nilaiGtTerlarangDiLaporan(kasus) {
  const out = new Set()
  const tambah = (n) => {
    for (const v of n?.status === 'PRESENT' ? [n.value, ...(n.alias ?? [])] : n?.status === 'ACCEPTABLE' ? n.values : []) if (typeof v === 'string' && v.length >= 5 && !/^\d{4}-\d{2}-\d{2}$/.test(v)) out.add(v)
  }
  for (const k of kasus) {
    for (const v of k.gt.vessels.daftar) ['name', 'imo', 'mmsi', 'callSign'].forEach((f) => tambah(v[f]))
    ;['principalName', 'customerName', 'portName', 'clientReference', 'jetty'].forEach((f) => tambah(k.gt[f]))
    if (!('status' in k.gt.contact)) ['name', 'email', 'phone'].forEach((f) => tambah(k.gt.contact[f]))
    for (const x of k.kapalDikecualikan ?? []) out.add(x.name)
  }
  return [...out]
}

export function pindaiLaporanEval2(teks, { kunci, kasus }) {
  const temuan = H.pindaiPrivasiEval1(teks, { kunci, frasa: FRASA_OTORISASI_EVAL2, kasus })
  if (teks.includes(H.FRASA_OTORISASI_EVAL1)) temuan.push('FRASA_OTORISASI')
  if (F.POLA_SENTINEL_EVAL2.test(teks)) temuan.push('SENTINEL_EVAL2')
  const up = teks.toUpperCase()
  if (nilaiGtTerlarangDiLaporan(kasus).some((v) => up.includes(v.toUpperCase()))) temuan.push('NILAI_GT_UTUH')
  return [...new Set(temuan)]
}

// ------------------------------------------------------------------ inti
/**
 * Jalankan Eval-2. Mengembalikan laporan tersanitasi (tidak menulis berkas).
 *   offline → transport stub (bawaan: jawaban sempurna dari GT); TIDAK pernah fetch nyata.
 *   live    → fetch global nyata (butuh otorisasi) ATAU `transportUji` (uji; label DRY_RUN).
 * Seam uji (`validasiUji`, `bekuUji`, `rencanaUji`, `batasUji`, `g12Uji`) — ditolak saat transport = jaringan.
 */
export async function jalankanRunnerEval2({
  mode,
  env = process.env,
  hariIni = new Date(),
  log = () => {},
  jawabStub = null,
  opsiStub = {},
  transportUji = null,
  validasiUji = null,
  bekuUji = null,
  rencanaUji = null,
  batasUji = null,
  g12Uji,
} = {}) {
  const tolak = (verdict, galat) => ({ label: LABEL_DRY, verdict, mode: mode ?? null, galat, panggilanNyata: 0 })
  if (mode !== MODE.OFFLINE && mode !== MODE.LIVE) return tolak('DITOLAK_MODE', ['MODE_WAJIB_EKSPLISIT'])
  const pakaiSeam = !!(validasiUji || bekuUji || rencanaUji || batasUji || g12Uji !== undefined)
  if (mode === MODE.LIVE && !transportUji && pakaiSeam) return tolak('DITOLAK_PRASYARAT', ['SEAM_UJI_DILARANG_SAAT_JARINGAN'])
  const integritas = bekuUji ? bekuUji() : B.verifikasiBekuEval2()
  if (integritas.length) return tolak('DITOLAK_INTEGRITAS', integritas)
  if (H.verifikasiBeku().length) return tolak('DITOLAK_INTEGRITAS', ['EVAL1_BERUBAH'])
  const rencana = rencanaUji ?? E.susunRencanaEval2()
  const galatRencana = E.validasiRencanaEval2(rencana, { allowlist: H.ALLOWLIST })
  if (galatRencana.length) return tolak('DITOLAK_RENCANA', galatRencana)
  const batas = batasUji ?? BATAS_EVAL2
  const galatBatas = periksaBatas(batas)
  if (galatBatas.length) return tolak('DITOLAK_BATAS', galatBatas)
  if (rencana.length > batas.maksPanggilan) return tolak('DITOLAK_BATAS', ['RENCANA_MELEBIHI_BATAS_PANGGILAN'])
  const pra = periksaPrasyaratEval2(env, mode)
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
  // G12 dievaluasi SEBELUM panggilan apa pun; saat jaringan WAJIB lulus.
  const g12 = g12Uji !== undefined ? g12Uji : jalankanG12()
  if (transport === TRANSPORT.NETWORK && g12 !== true) return tolak('DITOLAK_G12', ['CHECK_EVAL2_GT_GAGAL'])
  const label = transport === TRANSPORT.NETWORK ? LABEL_LIVE : LABEL_DRY

  const require = createRequire(import.meta.url)
  const jiti = require('jiti')(fileURLToPath(import.meta.url), { alias: { '@': join(AKAR, 'src') }, interopDefault: true })
  const muat = (rel) => jiti(join(AKAR, rel))
  const P = muat('src/services/intake/intake-policy.ts')
  const V = muat('src/lib/vessels.ts')
  const NORM_VALIDASI = { imo: V.normalisasiImo, imoSah: V.imoCheckDigitSah, mmsi: V.normalisasiMmsi, mmsiSah: V.mmsiSah, callSign: V.normalisasiCallSign }
  const NORM_SKOR = { namaKapal: P.normalisasiNamaKapal, namaPort: P.normalisasiNamaPort, namaPihak: P.normalisasiNamaPihak, unlocode: P.normalisasiUnlocode, imo: V.normalisasiImo, mmsi: V.normalisasiMmsi, callSign: V.normalisasiCallSign }

  const kasus = H.bekukanDalam(F.bangunKasusEval2(hariIni).map((k) => ({ ...k, teksNormal: P.normalisasiTeksSumber(k.teks) })))
  const petaKasus = new Map(kasus.map((k) => [k.id, k]))
  const hariIso = new Date(hariIni).toISOString().slice(0, 10)
  if (transport === TRANSPORT.STUB) fetchTransport = buatPenyediaStubEval2(kasus, jawabStub ?? undefined, opsiStub).fn

  const db = env.SPIKE_DATABASE_URL ? R1.uraiDbLokal(env.SPIKE_DATABASE_URL) : null
  const snapshot = Object.fromEntries(ENV_DIKELOLA.map((n) => [n, process.env[n]]))
  const fetchSebelum = globalThis.fetch
  let jaringanTerblokir = 0
  const { pencegat, keadaan } = H.buatPencegat(fetchTransport, batas)
  const jalurPenyedia = pagarProyeksiBiaya(pagarServedPersis(pencegat, keadaan), keadaan, batas)
  const slots = []
  let ledger = { status: 'TIDAK_DIJALANKAN', alasan: db ? null : 'SPIKE_DATABASE_URL_TIDAK_DISET', g8: null, bukti: null }
  let galatFatal = null
  const berhentiKeras = () => keadaan.berhenti || keadaan.ditolak.some((d) => ['BATAS_PANGGILAN', 'BERHENTI_LUNAK_BIAYA', 'BATAS_TOKEN', 'PROYEKSI_BIAYA_KERAS'].includes(d.alasan))
  try {
    globalThis.fetch = (url, init) => {
      if (String(url) !== H.URL_OPENROUTER) {
        jaringanTerblokir++
        return Promise.reject(new Error('EVAL2_JARINGAN_DIBLOKIR'))
      }
      return jalurPenyedia(url, init)
    }
    process.env.OPENROUTER_API_KEY = transport === TRANSPORT.STUB ? KUNCI_STUB : env.SPIKE_OPENROUTER_API_KEY
    if (db) {
      process.env.DATABASE_URL = env.SPIKE_DATABASE_URL
      process.env.DIRECT_URL = env.SPIKE_DATABASE_URL
    }
    const X = muat('src/lib/ai/vessel-call-extract.ts')
    const PR = muat('src/lib/ai/perekam-panggilan.ts')
    const Gt = muat('src/services/intake/intake-gate.ts')
    if (Gt.BATAS_WAKTU_AI_BAWAAN_MS !== BATAS_WAKTU_MS) throw new Error('EVAL2_BATAS_WAKTU_BERBEDA_DARI_INTAKE')
    const validasi = validasiUji ?? P.validasiEkstraksi

    for (const r of rencana) {
      if (r.blok === 'LEDGER_E2E') continue
      const k = petaKasus.get(r.kasus)
      const slot = { seq: r.seq, blok: r.blok, model: r.model, kasus: k, status: null, raw: null, post: null, nilai: null, panggilan: [], perekam: [], sumber: E.sidikSumber(k.teks) }
      slots.push(slot)
      if (berhentiKeras()) {
        slot.status = 'TIDAK_DIJALANKAN'
        slot.sebab = keadaan.berhenti ?? 'BATAS'
        continue
      }
      const idx = keadaan.panggilan.length
      const idxDitolak = keadaan.ditolak.length
      // A → B/C: dokumen lewat jalur produksi; C = argumen tool RAW (hanya di memori).
      try {
        slot.raw = await PR.jalankanDenganKonteks({ model: r.model, kemampuan: null, catat: (m) => slot.perekam.push({ status: m.status, errorCode: m.errorCode, requestedModel: m.requestedModel, servedModel: m.servedModel, promptVersion: m.promptVersion, schemaVersion: m.schemaVersion }) }, () =>
          X.ekstrakDenganBatasWaktu(X.ekstrakLewatOpenRouter, { kind: 'TEXT', text: k.teksNormal }, BATAS_WAKTU_MS),
        )
      } catch (e) {
        slot.status = `GAGAL:${typeof e?.kode === 'string' ? e.kode : 'ERROR'}`
      }
      slot.panggilan = keadaan.panggilan.slice(idx)
      // Panggilan slot ini ditolak pencegat (batas panggilan/biaya/token/proyeksi) → DIHENTIKAN, bukan galat model.
      const ditolakSlot = keadaan.ditolak.slice(idxDitolak)
      if (ditolakSlot.length) slot.status = `DIHENTIKAN:${ditolakSlot[0].alasan}`
      // Tanpa fallback model: setiap percobaan WAJIB meminta model slot & dilayani model itu.
      if (slot.panggilan.some((p) => p.requestedModel !== r.model)) slot.status = 'GAGAL:MODEL_DIMINTA_BERBEDA'
      else if (slot.panggilan.some((p) => p.http === 'SUKSES' && !p.servedModel)) slot.status = 'GAGAL:SERVED_MODEL_TIDAK_DILAPORKAN'
      else if (slot.panggilan.some((p) => p.http === 'SUKSES' && !modelTerlayaniPersis(r.model, p.servedModel))) slot.status = 'GAGAL:SERVED_MODEL_BERBEDA'
      if (slot.status) {
        slot.raw = /SERVED_MODEL|MODEL_DIMINTA/.test(slot.status) ? null : slot.raw
      }
      if (!slot.status) {
        const masalah = S.masalahArgumen(slot.raw)
        if (masalah.length) slot.status = `GAGAL:ARGUMEN_TIDAK_SAH:${masalah.join('+')}`
      }
      // D/E: validator → POST. RAW tetap objek terpisah (klon), tak pernah ditimpa POST.
      if (!slot.status) {
        try {
          slot.post = validasi(structuredClone(slot.raw), { inputKind: 'TEXT', sourceText: k.teksNormal, hariIni: hariIso, norm: NORM_VALIDASI })
        } catch {
          slot.status = 'GAGAL:VALIDATOR_ERROR'
        }
      }
      // F: penilai (RAW & POST terpisah).
      if (!slot.status) {
        const mk = E.masalahKasusPenilai(k)
        if (mk.length) slot.status = `GAGAL:PENILAI_INPUT:${mk.join('+')}`
        else {
          try {
            slot.nilai = S.nilaiKasus(k, slot.raw, slot.post, NORM_SKOR)
            slot.status = slot.nilai.ekstraktorGagal ? `GAGAL:${slot.nilai.argumenTidakSah.join('+')}` : 'OK'
            if (slot.nilai.ekstraktorGagal) slot.nilai = null
          } catch {
            slot.status = 'GAGAL:PENILAI_ERROR'
          }
        }
      }
      log(`  ${String(r.seq).padStart(2)} ${r.blok.padEnd(12)} ${r.kasus} → ${slot.status}; FATAL(POST)=${slot.nilai?.POST?.jumlah.FATAL ?? '-'}`)
    }

    const slotLedger = rencana.filter((r) => r.blok === 'LEDGER_E2E')
    if (db) {
      Object.assign(process.env, { TAH_CORE_ENABLED: 'true', VESSEL_CALL_INTAKE_ENABLED: 'true', VESSEL_CALL_INTAKE_EXTRACTOR: 'OPENROUTER', AUTOMATION_MONITORING_ENABLED: 'true' })
      const pindai = (t) => H.pindaiPrivasiEval1(t, { kunci: env.SPIKE_OPENROUTER_API_KEY, frasa: FRASA_OTORISASI_EVAL2, kasus, rahasiaEnv: [env.SPIKE_DATABASE_URL] })
      try {
        const e = await eksekusiLedgerE2E({ muat, slotLedger, petaKasus, keadaan, db, pindai, log })
        ledger = { status: 'DIJALANKAN', g8: e.g8, bukti: e.bukti, slot: slotLedger.map((r) => ({ seq: r.seq, kasus: r.kasus, status: e.hasilSlot.get(r.seq)?.status ?? 'TIDAK_DIJALANKAN' })) }
      } catch (e) {
        ledger = { status: 'GAGAL_INFRASTRUKTUR', galat: e?.kode ?? e?.name ?? 'Error', g8: null, bukti: null }
      }
    }
  } catch (e) {
    galatFatal = e?.message?.startsWith('EVAL2_') ? e.message : e?.name ?? 'Error'
  } finally {
    globalThis.fetch = fetchSebelum
    for (const n of ENV_DIKELOLA) {
      if (snapshot[n] === undefined) delete process.env[n]
      else process.env[n] = snapshot[n]
    }
  }

  // G: gerbang + atribusi; laporan HANYA diagnostik tersanitasi (RAW/POST/nilai tak pernah ditulis).
  const garam = randomBytes(16)
  const pelanggaranPagar = keadaan.ditolak.filter((d) => ['HOST_TIDAK_DIIZINKAN', 'MODEL_TIDAK_DIIZINKAN'].includes(d.alasan)).map((d) => d.alasan)
  if (jaringanTerblokir) pelanggaranPagar.push('PERCOBAAN_JARINGAN_LAIN')
  const servedCocok = keadaan.berhenti !== 'SERVED_MODEL_BERBEDA' && !slots.some((s) => /^GAGAL:(SERVED_MODEL|MODEL_DIMINTA)/.test(s.status))
  const operasional = {
    lengkap: !galatFatal && slots.length === rencana.filter((r) => r.blok !== 'LEDGER_E2E').length && slots.every((s) => s.status === 'OK'),
    dihentikan: !!keadaan.berhenti || slots.some((s) => s.status === 'TIDAK_DIJALANKAN' || s.status.startsWith('DIHENTIKAN:')),
    pelanggaranPagar,
    servedCocok,
  }
  let evaluasi = null
  let galatPenilai = null
  try {
    evaluasi = E.evaluasiGerbangEval2({ slots, operasional, ledger: ledger.g8, g12, norm: NORM_SKOR })
  } catch {
    galatPenilai = 'GERBANG_GAGAL_DIHITUNG'
  }
  const diagnostik = slots.map((s) => {
    const d = E.diagnostikSlot({ slot: s, kasus: s.kasus, raw: s.raw, post: s.post, nilai: s.nilai, panggilan: s.panggilan, garam, norm: NORM_SKOR })
    d.sumber = s.sumber
    d.perekam = s.perekam
    d.gerbang = evaluasi?.atribusi.get(s.seq) ?? []
    return d
  })
  const verdict = galatFatal ? 'GAGAL_RUNNER' : galatPenilai ? 'GAGAL_PENILAI' : evaluasi.verdict
  const laporan = {
    label,
    evaluasi: 'PRD-005 E5 Eval-2 Targeted',
    runner: VERSI_RUNNER_EVAL2,
    penilai: E.VERSI_PENILAI_EVAL2,
    penilaiEval1: S.VERSI_PENILAI,
    versiGt: F.EVAL2_VERSI,
    hashGt: B.HASH_GT_BEKU_EVAL2,
    shaFixture: B.SHA_BERKAS_BEKU_EVAL2,
    mode,
    transport,
    tanggalEksekusi: hariIso,
    catatanModel: 'anthropic/claude-sonnet-5 TETAP PENDING_SPIKE — laporan ini bukan aktivasi.',
    panggilanNyata: transport === TRANSPORT.NETWORK ? keadaan.total : 0,
    panggilanTransport: keadaan.total,
    kunciTerpakai: transport === TRANSPORT.STUB ? 'stub' : 'SPIKE_OPENROUTER_API_KEY (nilai tidak dicatat)',
    rencana: { direncanakan: rencana.length, dinilai: slots.length, ledger: rencana.filter((r) => r.blok === 'LEDGER_E2E').length },
    batas,
    biayaUsd: Number(keadaan.biaya.toFixed(6)),
    token: keadaan.token,
    berhenti: keadaan.berhenti,
    ditolakPencegat: keadaan.ditolak,
    jaringanTerblokir,
    operasional,
    verdict,
    galat: [galatFatal, galatPenilai].filter(Boolean),
    gerbang: evaluasi ? Object.fromEntries(Object.entries(evaluasi.gerbang).map(([k, v]) => [k, { lulus: v.lulus, keras: !!F.GERBANG_EVAL2[k]?.keras, detail: v.detail }])) : null,
    ringkasan: evaluasi?.ringkasan ?? null,
    ledger: { status: ledger.status, g8: ledger.g8, slot: ledger.slot ?? null, bukti: ledger.bukti ? { db: ledger.bukti.db, probeGagalTertutup: ledger.bukti.probeGagalTertutup, sentinelBersih: ledger.bukti.sentinelBersih, pembersihan: ledger.bukti.pembersihan, sisaDisapu: ledger.bukti.sisaDisapu, slot: ledger.bukti.slot } : null },
    diagnostik,
  }
  const temuan = pindaiLaporanEval2(JSON.stringify(laporan), { kunci: env.SPIKE_OPENROUTER_API_KEY, kasus })
  laporan.privasi = { temuan, lulus: temuan.length === 0 }
  if (B.verifikasiBekuEval2().length && !bekuUji) {
    laporan.integritasAkhir = 'BERUBAH_SELAMA_RUN'
    laporan.verdict = 'DITOLAK_INTEGRITAS'
  }
  // Hanya untuk uji luring: objek RAW/POST di memori (TIDAK ikut laporan/berkas).
  Object.defineProperty(laporan, '__slotMemori', { value: slots, enumerable: false })
  return laporan
}

/** Tulis laporan HANYA bila pemindai privasi lulus (jalur di luar repo). */
export function tulisLaporanAman(jalur, laporan) {
  const g = R1.periksaJalurLaporan(jalur)
  if (g.length) throw new Error(`EVAL2_${g[0]}`)
  if (!laporan?.privasi?.lulus) return { jalur: H.tulisLaporan(jalur, { label: laporan?.label ?? LABEL_DRY, verdict: 'LAPORAN_DITAHAN_PRIVASI', temuan: laporan?.privasi?.temuan ?? ['TIDAK_DIPINDAI'] }), ditahan: true }
  return { jalur: H.tulisLaporan(jalur, laporan), ditahan: false }
}

// ------------------------------------------------------------------ CLI
export async function cli(argv = process.argv.slice(2), env = process.env, cetak = console.log) {
  if (argv.length === 0) {
    const integritas = B.verifikasiBekuEval2()
    const rencana = E.susunRencanaEval2()
    cetak('PRD-005 E5 — Eval-2 runner. Tidak ada mode bawaan; tidak ada panggilan.')
    cetak(`integritas GT Eval-2 : ${integritas.length ? 'GAGAL ' + integritas.join(',') : 'OK'} (${F.EVAL2_VERSI}, hash ${B.HASH_GT_BEKU_EVAL2.slice(0, 16)}…)`)
    cetak(`rencana panggilan    : ${rencana.length} / maks ${BATAS_EVAL2.maksPanggilan} (biaya lunak US$${BATAS_EVAL2.biayaLunakUsd}, keras US$${BATAS_EVAL2.biayaKerasUsd})`)
    cetak('pakai                : --mode offline|live --report <jalur absolut di luar repo>')
    return 2
  }
  const a = R1.uraiArgumen(argv)
  const galat = [...a.galat, ...(a.laporan !== null ? R1.periksaJalurLaporan(a.laporan) : [])]
  if (!a.galat.length && a.mode) galat.push(...periksaPrasyaratEval2(env, a.mode))
  if (galat.length) {
    cetak(`DITOLAK (0 panggilan): ${galat.join(' | ')}`)
    return 3
  }
  cetak(`Eval-2 runner — mode ${a.mode.toUpperCase()} — ${a.mode === MODE.LIVE ? LABEL_LIVE + ' (panggilan penyedia NYATA)' : LABEL_DRY}`)
  const laporan = await jalankanRunnerEval2({ mode: a.mode, env, log: cetak })
  if (String(laporan.verdict).startsWith('DITOLAK')) {
    cetak(`DITOLAK (0 panggilan): ${laporan.galat?.join(' | ')}`)
    return 3
  }
  const { jalur, ditahan } = tulisLaporanAman(a.laporan, laporan)
  cetak(`label=${laporan.label} transport=${laporan.transport} panggilanNyata=${laporan.panggilanNyata} panggilanTransport=${laporan.panggilanTransport} biaya=US$${laporan.biayaUsd}`)
  cetak(`ledger=${laporan.ledger.status} verdict=${laporan.verdict} privasi=${laporan.privasi.lulus ? 'LULUS' : 'GAGAL'}`)
  cetak(`laporan${ditahan ? ' DITAHAN (privasi)' : ''}: ${jalur}`)
  return ditahan ? 4 : 0
}

const diCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (diCli) process.exit(await cli())
