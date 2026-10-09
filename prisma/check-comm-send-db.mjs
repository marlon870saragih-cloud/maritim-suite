// Uji integrasi DB Step 2E — FAKE Send + retry manual WA-1 (TANPA WhatsApp nyata, API, UI, jaringan).
//
// Jalankan (PostgreSQL loopback sekali pakai yang SUDAH `prisma migrate deploy`):
//   COMM_SEND_DB_URL=postgresql://postgres@127.0.0.1:55432/maritime_suite \
//     node prisma/check-comm-send-db.mjs
// Tanpa COMM_SEND_DB_URL → DILEWATI (kode 3).
//
// DITOLAK (DB tak disentuh) bila: host bukan loopback, parameter host, NODE_ENV=production,
// DATABASE_URL/DIRECT_URL menunjuk DB lain. Semua baris bertanda `WA1S2E-`; dihapus di akhir.
// Balapan diulang dengan fixture baru; hasil akhir diperiksa terhadap invarian yang sama
// (pesan ⇔ approval ⇔ attempt ⇔ candidate), bukan terhadap satu urutan kebetulan.

import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import tls from 'node:tls'
import dns from 'node:dns'
import { createHash } from 'node:crypto'

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

// ---------------------------------------------------------------- guard DB
const URL_DB = process.env.COMM_SEND_DB_URL
if (!URL_DB) {
  console.log('DILEWATI — COMM_SEND_DB_URL tidak diset (butuh PostgreSQL loopback sekali pakai).')
  process.exit(3)
}
const tolak = []
let urlDb
try {
  urlDb = new URL(URL_DB)
} catch {
  tolak.push('URL tidak terurai')
}
if (urlDb && !['127.0.0.1', 'localhost', '::1', '[::1]'].includes(urlDb.hostname)) tolak.push('host bukan loopback')
if (urlDb && [...urlDb.searchParams.keys()].some((k) => k.toLowerCase() === 'host')) tolak.push('parameter host')
if ((process.env.NODE_ENV ?? '').trim().toLowerCase() === 'production') tolak.push('NODE_ENV=production')
for (const n of ['DATABASE_URL', 'DIRECT_URL']) if (process.env[n] && process.env[n] !== URL_DB) tolak.push(`${n} menunjuk DB lain (ambigu)`)
if (tolak.length) {
  console.log(`❌ DITOLAK (DB tidak disentuh): ${tolak.join(' | ')}`)
  process.exit(1)
}
process.env.DATABASE_URL = URL_DB
process.env.DIRECT_URL = URL_DB
process.env.NODE_ENV = 'test'
process.env.WA1_INTERNAL_FAKE_TEST_ENABLED = 'true'
process.env.AUTOMATION_MONITORING_ENABLED = 'true'

// ------------------------------------------------- jaring egress (SEBELUM memuat service)
// Prisma memakai mesin kueri native (bukan modul net Node) untuk PostgreSQL loopback, jadi jaring
// ini tak memicu positif palsu — dan setiap upaya jaringan dari kode JS service akan tertangkap.
const egress = []
const catat = (jalur) => () => {
  egress.push(jalur)
  throw new Error(`EGRESS_DILARANG_DALAM_UJI:${jalur}`)
}
globalThis.fetch = catat('fetch')
if (typeof globalThis.WebSocket === 'function') globalThis.WebSocket = catat('WebSocket')
http.request = catat('http.request')
http.get = catat('http.get')
https.request = catat('https.request')
https.get = catat('https.get')
net.connect = catat('net.connect')
net.createConnection = catat('net.createConnection')
net.Socket.prototype.connect = catat('net.Socket.connect')
tls.connect = catat('tls.connect')
dns.lookup = catat('dns.lookup')
dns.resolve = catat('dns.resolve')

const require = createRequire(import.meta.url)
const jiti = require('jiti')(fileURLToPath(import.meta.url), { alias: { '@': join(AKAR, 'src') }, interopDefault: true })
const S = jiti('../src/services/communication/communication.service.ts')
const AP = jiti('../src/services/communication/communication-approval.service.ts')
const KS = jiti('../src/services/communication/communication-send.service.ts')
const H = jiti('../src/services/communication/comm-hash.ts')
const TAH = jiti('../src/services/tah/tah-policy.ts')
const { PrismaClient } = await import('@prisma/client')
const adm = new PrismaClient({ datasources: { db: { url: URL_DB } } })

// ---------------------------------------------- titik jeda deterministik (khusus uji)
// Service memanggil forTenant lewat binding modul tenant-db saat jalan; uji membungkusnya supaya
// SATU kueri tertentu di dalam transaksi service bisa ditahan sampai uji melepasnya. Dengan ini
// urutan balapan (mis. Send commit DI ANTARA dua bacaan Prepare) dipaksa, bukan kebetulan.
// Kode produksi tidak tahu apa-apa soal ini.
const TD = jiti('../src/services/tenant-db.ts')
const forTenantAsli = TD.forTenant
const titikJeda = []
function pasangJeda(model, op, cocok) {
  let tiba
  let lepas
  const sampai = new Promise((r) => (tiba = r))
  const pLepas = new Promise((r) => (lepas = r))
  titikJeda.push({ model, op, cocok, tiba, pLepas })
  return { sampai, lepas }
}
const bungkusDelegasi = (model, d) =>
  new Proxy(d, {
    get(t, op) {
      const f = t[op]
      if (typeof f !== 'function') return f
      return async (args) => {
        const i = titikJeda.findIndex((j) => j.model === model && j.op === op && j.cocok(args ?? {}))
        if (i >= 0) {
          const [j] = titikJeda.splice(i, 1)
          j.tiba()
          await j.pLepas
        }
        return f.call(t, args)
      }
    },
  })
const bungkusTx = (tx) =>
  new Proxy(tx, {
    get(t, p) {
      const v = t[p]
      return typeof p === 'string' && /^[a-z]/.test(p) && v && typeof v === 'object' ? bungkusDelegasi(p, v) : v
    },
  })
TD.forTenant = (ctx) => {
  const db = forTenantAsli(ctx)
  return new Proxy(db, { get: (t, p) => (p === '$transaction' ? (fn, opts) => t.$transaction((tx) => fn(bungkusTx(tx)), opts) : t[p]) })
}
/** Tunggu sampai `janji` selesai ATAU ada sesi DB yang menunggu kunci baris (maks `ms`). */
async function tungguBlokirAtauSelesai(janji, ms = 3000) {
  let selesai = false
  janji.then(() => (selesai = true), () => (selesai = true))
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (selesai) return 'SELESAI'
    const [{ n }] = await adm.$queryRawUnsafe("select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'")
    if (n > 0) return 'TERBLOKIR'
    await new Promise((r) => setTimeout(r, 20))
  }
  return 'TIMEOUT'
}

const TAG = 'WA1S2E-'
let seq = 0
const uid = () => `${TAG}${++seq}`
let rkSeq = 0
const rk = () => `rk-${Date.now().toString(36)}-${++rkSeq}`
const WAKTU = '2026-10-05T02:30:00.000Z'
const FX = 'WA1_TEST_FIXTURE_SUCCESS'
const FX_GAGAL = 'WA1_TEST_FIXTURE_FAIL'
const FX_ULANG = 'WA1_TEST_FIXTURE_RETRY'
const ULANG = 5

const kode = async (fn) => {
  try {
    await fn()
    return null
  } catch (e) {
    return e?.code ?? e?.message ?? 'ERR'
  }
}
const coba = async (fn) => {
  try {
    return { ok: true, nilai: await fn() }
  } catch (e) {
    return { ok: false, kode: e?.code ?? 'ERR', pesan: String(e?.message ?? '') }
  }
}

async function hapusTrigger() {
  await adm.$executeRawUnsafe('DROP TRIGGER IF EXISTS wa1s2e_gagal_audit ON "AuditLog"')
  await adm.$executeRawUnsafe('DROP FUNCTION IF EXISTS wa1s2e_gagal_audit()')
}
async function bersihkan() {
  await hapusTrigger()
  const t = await adm.tenant.findMany({ where: { companyName: { startsWith: TAG } }, select: { id: true } })
  await adm.tahApprovalRequest.deleteMany({ where: { tenantId: { in: t.map((x) => x.id) } } })
  await adm.auditLog.deleteMany({ where: { tenantId: { in: t.map((x) => x.id) } } })
  await adm.tenant.deleteMany({ where: { companyName: { startsWith: TAG } } })
}
async function gagalkanAudit(peristiwa) {
  await hapusTrigger()
  await adm.$executeRawUnsafe(`CREATE FUNCTION wa1s2e_gagal_audit() RETURNS trigger AS $$ BEGIN IF NEW."newValue"->>'peristiwa' = '${peristiwa}' THEN RAISE EXCEPTION 'AUDIT_GAGAL_SENGAJA'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`)
  await adm.$executeRawUnsafe('CREATE TRIGGER wa1s2e_gagal_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION wa1s2e_gagal_audit()')
}

// ------------------------------------------------------------------ dunia uji
async function dunia(nama) {
  const t = await adm.tenant.create({ data: { companyName: `${TAG}${nama}` } })
  const kapal = await adm.vessel.create({ data: { tenantId: t.id, name: 'MT Contoh Satu' } })
  const port = await adm.port.create({ data: { tenantId: t.id, name: 'Pelabuhan Uji', timezone: 'Asia/Makassar' } })
  return { t, kapal, port, ctx: { tenantId: t.id, userId: `u-${nama}`, role: 'ADMIN' } }
}
const voyage = (w, ubah = {}) =>
  adm.voyage.create({ data: { tenantId: w.t.id, vesselId: w.kapal.id, portId: w.port.id, voyageNumber: uid(), eta: new Date('2026-10-12T00:00:00Z'), etd: new Date('2026-10-14T00:00:00Z'), ...ubah } })
const sinyal = (w, v, ubah = {}) =>
  adm.monitoringSignal.create({ data: { tenantId: w.t.id, voyageId: v.id, kind: 'ETA_CHANGED', severity: 'INFO', dedupeKey: uid(), sourceType: 'AUDIT_LOG', explanation: 'uji', recommendation: 'uji', ...ubah } })

const MEDAN_JENIS = { JADWAL_ETA: ['eta'], JADWAL_ETD: ['etd'], JADWAL_ETA_ETD: ['eta', 'etd'] }
const LAMA = { eta: '2026-10-10', etd: '2026-10-13' }
const BARU = { eta: '2026-10-12', etd: '2026-10-14' }

/** Sumber (jadwal / milestone) → candidate → revisi → PREVIEWED. */
async function pratinjau(w, { jenis = 'EOSP', bahasa = 'ID', fx = FX } = {}) {
  const v = await voyage(w)
  let sumber
  const sig = []
  if (MEDAN_JENIS[jenis]) {
    const medan = MEDAN_JENIS[jenis]
    sumber = await adm.auditLog.create({
      data: {
        tenantId: w.t.id,
        tableName: 'Voyage',
        recordId: v.id,
        action: 'UPDATE',
        oldValue: { peristiwa: 'UBAH_TANGGAL', ...Object.fromEntries(medan.map((m) => [m, LAMA[m]])) },
        newValue: { peristiwa: 'UBAH_TANGGAL', medan, ...Object.fromEntries(medan.map((m) => [m, BARU[m]])) },
      },
    })
    for (const m of medan) sig.push(await sinyal(w, v, { sourceRef: sumber.id, after: { [m]: BARU[m] } }))
  } else {
    sumber = await adm.voyageEvent.create({ data: { tenantId: w.t.id, voyageId: v.id, eventCode: jenis, occurredAt: new Date(WAKTU), recordedByUserId: 'u-uji' } })
    sig.push(await sinyal(w, v, { kind: 'OPERATIONAL_EVENT_RECORDED', sourceType: 'VOYAGE_EVENT', sourceRef: sumber.id, after: { eventCode: jenis, occurredAt: WAKTU } }))
  }
  const h = await S.siapkanCandidate(w.ctx, { signalId: sig[0].id })
  const r = await S.buatRevisiPesan(w.ctx, { candidateId: h.candidateId, recipientFixtureId: fx, language: bahasa })
  const p = await S.tandaiDipratinjau(w.ctx, { messageId: r.messageId, snapshotFingerprint: r.snapshotFingerprint })
  if (h.hasil !== 'SIAP' || r.hasil !== 'REVISI_DIBUAT' || p.hasil !== 'DIPRATINJAU') throw new Error(`fixture pratinjau gagal: ${h.hasil}/${r.hasil}/${p.hasil}`)
  return { v, sumber, s: sig[0], sig, candidateId: h.candidateId, messageId: r.messageId, fp: r.snapshotFingerprint }
}
/** Pratinjau → minta approval → setujui (satu admin, D-05) → pesan APPROVED. */
async function disetujui(w, opsi = {}) {
  const p = await pratinjau(w, opsi)
  const a = await AP.mintaApproval(w.ctx, { messageId: p.messageId })
  const d = await AP.setujuiPesan(w.ctx, { approvalRequestId: a.approvalRequestId })
  if (a.hasil !== 'APPROVAL_DIMINTA' || d.hasil !== 'DISETUJUI') throw new Error(`fixture approval gagal: ${a.hasil}/${d.hasil}`)
  return { ...p, approvalId: a.approvalRequestId }
}
const kirim = (w, messageId, requestKey = rk()) => KS.kirimFake(w.ctx, { messageId, requestKey })
const pesan = (id) => adm.communicationMessage.findFirst({ where: { id } })
const approval = (id) => adm.tahApprovalRequest.findFirst({ where: { id } })
const kandidat = (id) => adm.communicationCandidate.findFirst({ where: { id } })
const attempts = (messageId) => adm.communicationAttempt.findMany({ where: { messageId }, orderBy: { attemptNo: 'asc' } })
const jumlahAudit = (peristiwa, recordId) =>
  adm.auditLog.count({ where: { newValue: { path: ['peristiwa'], equals: peristiwa }, ...(recordId ? { recordId } : {}) } })
const potret = async (p) => {
  const m = await pesan(p.messageId)
  const a = m.approvalRequestId ? await approval(m.approvalRequestId) : null
  return JSON.stringify({ m: [m.state, m.version, m.reasonCode, m.activeKey, m.successKey], a: a && [a.status, a.executionStatus, a.version], at: await adm.communicationAttempt.count({ where: { messageId: p.messageId } }) })
}

/**
 * Invarian pesan ⇔ approval ⇔ attempt (dipakai setelah setiap balapan):
 *  J1 FAKE_SENT ⇔ successKey = logicalMessageKey, activeKey NULL, approval SUCCEEDED + finalizedAt, tepat 1 attempt FAKE_SENT
 *  J2 FAKE_FAILED ⇒ approval eksekusi FAILED, attempt terakhir FAKE_FAILED, activeKey ada
 *  J3 APPROVED ⇒ approval NOT_STARTED, 0 attempt
 *  J4 tak ada state antara ter-commit (QUEUED_FAKE / attempt QUEUED_FAKE / eksekusi RUNNING)
 *  J5 setiap attempt: provider FAKE, simulation true, externalDelivery false
 *  J6 maksimal satu sukses & satu revisi aktif per pesan logis; invarian status TAH
 */
async function invarian(messageId) {
  const m = await pesan(messageId)
  const a = m.approvalRequestId ? await approval(m.approvalRequestId) : null
  const at = await attempts(messageId)
  const g = []
  if (m.state === 'FAKE_SENT' && !(m.successKey === m.logicalMessageKey && m.activeKey === null && a?.executionStatus === 'SUCCEEDED' && a.finalizedAt && at.filter((x) => x.state === 'FAKE_SENT').length === 1)) g.push('J1')
  if (m.state !== 'FAKE_SENT' && (m.successKey !== null || at.some((x) => x.state === 'FAKE_SENT'))) g.push('J1b')
  if (m.state === 'FAKE_FAILED' && !(a?.executionStatus === 'FAILED' && at.at(-1)?.state === 'FAKE_FAILED' && m.activeKey)) g.push('J2')
  if (m.state === 'APPROVED' && !(a?.executionStatus === 'NOT_STARTED' && at.length === 0)) g.push('J3')
  if (m.state === 'QUEUED_FAKE' || at.some((x) => x.state === 'QUEUED_FAKE') || a?.executionStatus === 'RUNNING') g.push('J4')
  if (at.some((x) => x.provider !== 'FAKE' || x.simulation !== true || x.externalDelivery !== false)) g.push('J5')
  if ((await adm.communicationMessage.count({ where: { logicalMessageKey: m.logicalMessageKey, successKey: { not: null } } })) > 1) g.push('J6a')
  if ((await adm.communicationMessage.count({ where: { logicalMessageKey: m.logicalMessageKey, activeKey: { not: null } } })) > 1) g.push('J6b')
  if (a && !TAH.invarianStatus(a.status, a.executionStatus)) g.push('TAH')
  return { ok: g.length === 0, g, m, a, at }
}

try {
  await bersihkan()
  const A = await dunia('A')
  const B = await dunia('B')
  const C = await dunia('C') // TIDAK di allowlist Automation
  process.env.AUTOMATION_TENANT_IDS = `${A.t.id},${B.t.id}`

  // ============================================================== gerbang
  bagian('[1] Gerbang, otorisasi, isolasi tenant')
  {
    const p = await disetujui(A)
    const awal = await potret(p)
    const auditAwal = await adm.auditLog.count()
    cek('1. tenant di luar allowlist Automation → NOT_FOUND', (await kode(() => KS.kirimFake(C.ctx, { messageId: p.messageId, requestKey: rk() }))) === 'NOT_FOUND')
    cek('2. peran OPERATOR → FORBIDDEN; konteks sistem → FORBIDDEN', (await kode(() => KS.kirimFake({ ...A.ctx, role: 'OPERATOR' }, { messageId: p.messageId, requestKey: rk() }))) === 'FORBIDDEN' && (await kode(() => KS.kirimFake({ ...A.ctx, system: true }, { messageId: p.messageId, requestKey: rk() }))) === 'FORBIDDEN')
    process.env.WA1_INTERNAL_FAKE_TEST_ENABLED = 'false'
    cek('3. flag WA mati → FORBIDDEN (FEATURE_DISABLED)', (await coba(() => kirim(A, p.messageId))).pesan.includes('FEATURE_DISABLED'))
    process.env.WA1_INTERNAL_FAKE_TEST_ENABLED = 'true'
    process.env.NODE_ENV = 'production'
    const prod = await coba(() => kirim(A, p.messageId))
    process.env.NODE_ENV = 'test'
    cek('4. NODE_ENV=production → FORBIDDEN ENV_NOT_ALLOWED', prod.ok === false && prod.kode === 'FORBIDDEN' && prod.pesan.includes('ENV_NOT_ALLOWED'), prod.pesan)
    cek('5. requestKey tak sah (pendek / spasi / >128 / bukan string) & messageId tak sah → VALIDATION', (await Promise.all(['pendek', 'ada spasi 123', 'x'.repeat(129), 42, null].map((k) => kode(() => KS.kirimFake(A.ctx, { messageId: p.messageId, requestKey: k }))))).every((x) => x === 'VALIDATION') && (await kode(() => KS.kirimFake(A.ctx, { messageId: '', requestKey: rk() }))) === 'VALIDATION')
    cek('6. tenant B mengirim pesan A → NOT_FOUND (tanpa bocor)', (await kode(() => kirim(B, p.messageId))) === 'NOT_FOUND')
    cek('7. semua penolakan gerbang: 0 mutasi, 0 attempt, 0 audit baru (gerbang sebelum DB)', (await potret(p)) === awal && (await adm.auditLog.count()) === auditAwal, `${awal} → ${await potret(p)}`)

    const kunciSama = 'rk-sama-lintas-konteks'
    const pB = await disetujui(B)
    const hA = await kirim(A, p.messageId, kunciSama)
    const hB = await kirim(B, pB.messageId, kunciSama)
    const [atA] = await attempts(p.messageId)
    const [atB] = await attempts(pB.messageId)
    cek('8. requestKey SAMA di tenant A & B → keduanya FAKE_SENT segar (bukan replay lintas tenant)', hA.hasil === 'FAKE_SENT' && hB.hasil === 'FAKE_SENT' && hA.ulangan === false && hB.ulangan === false)
    // K3 — dihitung INDEPENDEN dari modul service (sha256 atas domain + JSON kanonik berkunci terurut).
    const kunciHarap = (tenantId, messageId, snapshotFingerprint, requestKey) =>
      createHash('sha256').update('WA1_SEND\n').update(JSON.stringify({ messageId, requestKey, snapshotFingerprint, tenantId, v: 1 }), 'utf8').digest('hex')
    cek('9. attempt terikat tenant masing-masing; idempotencyKey = sha256(WA1_SEND, {tenant, pesan, snapshot, requestKey}) dihitung independen', atA.tenantId === A.t.id && atB.tenantId === B.t.id && atA.idempotencyKey !== atB.idempotencyKey && atA.idempotencyKey === kunciHarap(A.t.id, p.messageId, p.fp, kunciSama) && atB.idempotencyKey === kunciHarap(B.t.id, pB.messageId, pB.fp, kunciSama))
    const p2 = await disetujui(A)
    const h2 = await kirim(A, p2.messageId, kunciSama)
    cek('10. requestKey SAMA pada pesan lain di tenant sama → kirim segar, bukan hasil pesan pertama', h2.hasil === 'FAKE_SENT' && h2.ulangan === false && h2.attemptId !== hA.attemptId && h2.messageId === p2.messageId)
    const pakaiBdiA = await kode(() => KS.kirimFake(A.ctx, { messageId: pB.messageId, requestKey: kunciSama }))
    cek('11. replay kunci B dari tenant A atas pesan B → NOT_FOUND', pakaiBdiA === 'NOT_FOUND')
  }

  // ============================================================== happy path
  bagian('[2] Happy path: 4 keluarga event × ID/EN → FAKE_SENT (satu admin, D-05)')
  for (const jenis of ['JADWAL_ETA', 'JADWAL_ETD', 'JADWAL_ETA_ETD', 'EOSP', 'ALL_FAST', 'SAILED']) {
    for (const bahasa of ['ID', 'EN']) {
      const p = await disetujui(A, { jenis, bahasa })
      const sebelum = await pesan(p.messageId)
      const h = await kirim(A, p.messageId)
      const i = await invarian(p.messageId)
      const [at] = i.at
      const ok =
        h.hasil === 'FAKE_SENT' &&
        h.provider === 'FAKE' && h.simulation === true && h.externalDelivery === false &&
        i.ok && i.m.state === 'FAKE_SENT' && i.m.body === sebelum.body && i.m.snapshotFingerprint === sebelum.snapshotFingerprint &&
        i.m.fakeReceipt === h.receipt && /^fake_[0-9a-f]{32}$/.test(h.receipt) &&
        i.at.length === 1 && at.attemptNo === 1 && at.scenario === 'SUCCESS' && at.receipt === h.receipt && at.requestedByUserId === A.ctx.userId &&
        i.a.status === 'APPROVED' && i.a.executionStatus === 'SUCCEEDED' && i.a.executionAttempts === 1 && i.a.executedAt && i.a.finalizedAt &&
        i.a.resultRef?.messageId === p.messageId && i.a.resultRef?.attemptId === at.id && i.a.proposalHash === i.m.snapshotFingerprint
      cek(`${jenis} ${bahasa} → FAKE_SENT; snapshot utuh; attempt #1 SUCCESS; eksekusi SUCCEEDED; invarian`, ok, `${h.hasil} ${i.g.join(',')}`)
      if (jenis === 'JADWAL_ETA_ETD' && bahasa === 'ID') {
        cek('ETA+ETD satu AuditLog → body memuat baris ETA lalu ETD (tanggal saja) — satu pesan, satu attempt', /ETA: dari 2026-10-10 menjadi 2026-10-12\.\nETD: dari 2026-10-13 menjadi 2026-10-14\./.test(i.m.body) && p.sig.length === 2)
      }
      if (jenis === 'EOSP' && bahasa === 'EN') {
        cek('EOSP EN → waktu lokal + zona IANA', i.m.body.includes('2026-10-05 10:30 (UTC+08:00, Asia/Makassar)') && i.m.body.startsWith('[INTERNAL SIMULATION — NOT SENT]'))
      }
      if (jenis === 'EOSP' && bahasa === 'ID') {
        const rantai = ['WA1_EKSEKUSI_DIMULAI', 'WA1_SEND_DIKLAIM', 'WA1_ATTEMPT_DIKLAIM', 'WA1_EKSEKUSI_SELESAI', 'WA1_PESAN_FAKE_SENT', 'WA1_ATTEMPT_FAKE_SENT']
        const rec = { WA1_EKSEKUSI_DIMULAI: p.approvalId, WA1_EKSEKUSI_SELESAI: p.approvalId, WA1_SEND_DIKLAIM: p.messageId, WA1_PESAN_FAKE_SENT: p.messageId, WA1_ATTEMPT_DIKLAIM: at.id, WA1_ATTEMPT_FAKE_SENT: at.id }
        const n = await Promise.all(rantai.map((x) => jumlahAudit(x, rec[x])))
        cek('AC-17/§14: rantai audit lengkap (eksekusi mulai/selesai, klaim, attempt, FAKE_SENT) masing-masing tepat 1', n.every((x) => x === 1), n.join(','))
        const e = await adm.auditLog.findFirst({ where: { recordId: p.messageId, newValue: { path: ['peristiwa'], equals: 'WA1_PESAN_FAKE_SENT' } } })
        const v = e.newValue
        cek('entri audit membawa actor, tenant, voyage, sumber, candidate, snapshot, approval, attempt, simulasi', e.userId === A.ctx.userId && e.tenantId === A.t.id && v.voyageId === p.v.id && v.sourceType === 'VOYAGE_EVENT' && v.sourceRef === p.sumber.id && v.candidateId === p.candidateId && v.snapshotFingerprint === p.fp && v.approvalRequestId === p.approvalId && v.attemptId === at.id && v.externalDelivery === false && v.simulation === true)
      }
    }
  }

  // ============================================================== kegagalan FAKE
  bagian('[3] Skenario FAKE: FAIL_BEFORE_ACCEPT, FAIL_ONCE_THEN_SUCCESS, retry manual')
  {
    const p = await disetujui(A, { fx: FX_GAGAL })
    const k1 = rk()
    const h1 = await kirim(A, p.messageId, k1)
    const i1 = await invarian(p.messageId)
    cek('12. FAIL_BEFORE_ACCEPT → FAKE_FAILED FAKE_SIMULATED_FAILURE; eksekusi FAILED (belum final); activeKey tetap; tanpa successKey', h1.hasil === 'FAKE_FAILED' && h1.alasan === 'FAKE_SIMULATED_FAILURE' && i1.ok && i1.m.state === 'FAKE_FAILED' && i1.m.reasonCode === 'FAKE_SIMULATED_FAILURE' && i1.a.executionStatus === 'FAILED' && i1.a.executionErrorCode === 'FAKE_SIMULATED_FAILURE' && i1.a.finalizedAt === null && i1.m.activeKey && i1.m.successKey === null, i1.g.join(','))
    const h2 = await kirim(A, p.messageId)
    const i2 = await invarian(p.messageId)
    cek('13. retry manual (kunci baru) → attempt #2, tetap FAKE_FAILED; executionAttempts 2; snapshot sama', h2.hasil === 'FAKE_FAILED' && h2.attemptNo === 2 && i2.ok && i2.at.length === 2 && i2.a.executionAttempts === 2 && i2.m.snapshotFingerprint === p.fp && (await jumlahAudit('WA1_SEND_RETRY_MANUAL', p.messageId)) === 1)
    const h1r = await kirim(A, p.messageId, k1)
    cek('14. replay kunci attempt #1 → hasil attempt #1 (FAKE_FAILED, ulangan), tanpa attempt baru', h1r.hasil === 'FAKE_FAILED' && h1r.ulangan === true && h1r.attemptId === h1.attemptId && (await attempts(p.messageId)).length === 2)

    const q = await disetujui(A, { fx: FX_ULANG })
    const kq = rk()
    const g1 = await kirim(A, q.messageId, kq)
    const g2 = await kirim(A, q.messageId)
    const iq = await invarian(q.messageId)
    cek('15. FAIL_ONCE_THEN_SUCCESS → attempt #1 FAKE_FAILED, retry manual #2 FAKE_SENT dengan snapshot sama', g1.hasil === 'FAKE_FAILED' && g1.attemptNo === 1 && g2.hasil === 'FAKE_SENT' && g2.attemptNo === 2 && iq.ok && iq.m.state === 'FAKE_SENT' && iq.m.snapshotFingerprint === q.fp && iq.a.executionStatus === 'SUCCEEDED' && iq.a.executionAttempts === 2 && iq.at.map((x) => x.state).join() === 'FAKE_FAILED,FAKE_SENT', iq.g.join(','))
    const g1r = await kirim(A, q.messageId, kq)
    cek('16. replay kunci attempt gagal SETELAH sukses → tetap hasil gagal semula (idempoten), tanpa attempt baru', g1r.hasil === 'FAKE_FAILED' && g1r.ulangan === true && (await attempts(q.messageId)).length === 2)
    const g3 = await kirim(A, q.messageId)
    cek('17. kunci baru setelah FAKE_SENT → DITOLAK ALREADY_FAKE_SENT, tanpa attempt baru', g3.hasil === 'DITOLAK' && g3.alasan === 'ALREADY_FAKE_SENT' && (await attempts(q.messageId)).length === 2)
  }

  // ============================================================== idempotensi & approval
  bagian('[4] Idempotensi & gerbang approval (AC-12, AC-16)')
  {
    const p = await disetujui(A)
    const k = rk()
    const h = await kirim(A, p.messageId, k)
    const r = await kirim(A, p.messageId, k)
    cek('18. replay kunci sama → hasil existing (ulangan=true, attempt sama), tanpa attempt baru', r.hasil === 'FAKE_SENT' && r.ulangan === true && r.attemptId === h.attemptId && r.receipt === h.receipt && (await attempts(p.messageId)).length === 1)
    cek('19. duplikat dicatat audit (WA1_SEND_DUPLIKAT)', (await jumlahAudit('WA1_SEND_DUPLIKAT', h.attemptId)) === 1)

    const q = await pratinjau(A)
    await adm.monitoringSignal.updateMany({ where: { id: q.s.id }, data: { reviewState: 'ACKNOWLEDGED' } })
    const awal = await potret(q)
    const hq = await kirim(A, q.messageId)
    cek('20. TS-16: sinyal ACKNOWLEDGED + pesan PREVIEWED tanpa approval → APPROVAL_REQUIRED, tanpa perubahan', hq.hasil === 'DITOLAK' && hq.alasan === 'APPROVAL_REQUIRED' && (await potret(q)) === awal)
    await AP.mintaApproval(A.ctx, { messageId: q.messageId })
    const hq2 = await kirim(A, q.messageId)
    cek('21. approval PENDING (belum disetujui) → APPROVAL_REQUIRED, tanpa attempt', hq2.hasil === 'DITOLAK' && hq2.alasan === 'APPROVAL_REQUIRED' && (await attempts(q.messageId)).length === 0)
    cek('22. penolakan Send dicatat audit WA1_SEND_DITOLAK', (await jumlahAudit('WA1_SEND_DITOLAK', q.messageId)) === 2)

    const t = await disetujui(A)
    await adm.communicationMessage.updateMany({ where: { id: t.messageId }, data: { approvalRequestId: null } })
    const ht = await kirim(A, t.messageId)
    cek('23. pesan APPROVED tanpa approval tertaut → APPROVAL_REQUIRED (gagal tertutup), 0 attempt', ht.hasil === 'DITOLAK' && ht.alasan === 'APPROVAL_REQUIRED' && (await attempts(t.messageId)).length === 0)

    const u = await disetujui(A)
    await adm.tahApprovalRequest.updateMany({ where: { id: u.approvalId }, data: { kind: 'TAH_DEV_NOOP' } })
    cek('24. baris approval menyimpang dari definisi WA → FORBIDDEN, 0 attempt', (await kode(() => kirim(A, u.messageId))) === 'FORBIDDEN' && (await attempts(u.messageId)).length === 0)

    const x = await disetujui(A)
    await adm.tahApprovalRequest.updateMany({ where: { id: x.approvalId }, data: { executionStatus: 'SUCCEEDED' } })
    const ax = await potret(x)
    const ex = await coba(() => kirim(A, x.messageId))
    cek('25. eksekusi approval tak konsisten dengan pesan → galat gagal tertutup, rollback (0 mutasi)', ex.ok === false && /tidak konsisten/.test(ex.pesan) && (await potret(x)) === ax)

    const y = await disetujui(A)
    await adm.communicationMessage.updateMany({ where: { id: y.messageId }, data: { mode: 'LIVE' } })
    const ay = await potret(y)
    const hy = await kirim(A, y.messageId)
    cek('26. AC-13: mode snapshot bukan INTERNAL_FAKE_TEST → MODE_NOT_FAKE, tanpa fallback/perubahan', hy.hasil === 'DITOLAK' && hy.alasan === 'MODE_NOT_FAKE' && (await potret(y)) === ay)
  }

  // ============================================================== revalidasi #2
  bagian('[5] Revalidasi sumber #2 (SG-03/SG-04): KERAS → BLOCKED, PULIH → ditolak tanpa perubahan')
  {
    const p = await disetujui(A)
    await adm.voyageEvent.updateMany({ where: { id: p.sumber.id }, data: { deletedAt: new Date() } })
    const h = await kirim(A, p.messageId)
    const i = await invarian(p.messageId)
    const c = await kandidat(p.candidateId)
    cek('27. TS-11/AC-10: sumber dihapus setelah Approve → DIBLOKIR SOURCE_DELETED; pesan BLOCKED; candidate BLOCKED; eksekusi CANCELLED; 0 attempt', h.hasil === 'DIBLOKIR' && h.alasan === 'SOURCE_DELETED' && i.ok && i.m.state === 'BLOCKED' && i.m.reasonCode === 'SOURCE_DELETED' && i.m.activeKey === null && c.state === 'BLOCKED' && i.a.status === 'APPROVED' && i.a.executionStatus === 'CANCELLED' && i.a.finalizedAt && i.at.length === 0, i.g.join(','))
    cek('28. sinyal lama tetap ada; penolakan teraudit (WA1_SEND_DITOLAK)', (await adm.monitoringSignal.count({ where: { id: p.s.id } })) === 1 && (await jumlahAudit('WA1_SEND_DITOLAK', p.messageId)) === 1)
    const h2 = await kirim(A, p.messageId)
    cek('29. Send ulang atas pesan BLOCKED → DITOLAK SOURCE_DELETED, tanpa perubahan', h2.hasil === 'DITOLAK' && h2.alasan === 'SOURCE_DELETED')

    const q = await disetujui(A, { jenis: 'JADWAL_ETA' })
    await adm.auditLog.create({ data: { tenantId: A.t.id, tableName: 'Voyage', recordId: q.v.id, action: 'UPDATE', oldValue: { peristiwa: 'UBAH_TANGGAL', eta: '2026-10-12' }, newValue: { peristiwa: 'UBAH_TANGGAL', medan: ['eta'], eta: '2026-10-15' } } })
    await adm.voyage.updateMany({ where: { id: q.v.id }, data: { eta: new Date('2026-10-15T00:00:00Z') } })
    const hq = await kirim(A, q.messageId)
    cek('30. TS-17: jadwal diubah lagi setelah Approve → DIBLOKIR SOURCE_SUPERSEDED, tanpa FAKE_SENT', hq.hasil === 'DIBLOKIR' && hq.alasan === 'SOURCE_SUPERSEDED' && (await pesan(q.messageId)).state === 'BLOCKED' && (await attempts(q.messageId)).length === 0)

    const r = await disetujui(A)
    await adm.voyage.updateMany({ where: { id: r.v.id }, data: { deletedAt: new Date() } })
    const hr = await kirim(A, r.messageId)
    cek('31. voyage di-soft-delete → DIBLOKIR SOURCE_DELETED', hr.hasil === 'DIBLOKIR' && hr.alasan === 'SOURCE_DELETED')

    const s = await disetujui(A)
    await adm.monitoringSignal.updateMany({ where: { id: s.s.id }, data: { reviewState: 'DISMISSED' } })
    const hs = await kirim(A, s.messageId)
    cek('32. P-08: sinyal DISMISSED setelah Approve → DIBLOKIR SIGNAL_DISMISSED', hs.hasil === 'DIBLOKIR' && hs.alasan === 'SIGNAL_DISMISSED')

    const W = await dunia('W') // port sendiri supaya perubahan zona tak menyentuh dunia lain
    process.env.AUTOMATION_TENANT_IDS = `${A.t.id},${B.t.id},${W.t.id}`
    const t = await disetujui(W)
    const awal = await potret(t)
    await adm.port.updateMany({ where: { id: W.port.id }, data: { timezone: null } })
    const ht = await kirim(W, t.messageId)
    cek('33. AC-08: zona waktu pelabuhan kosong setelah Approve → DITOLAK_PULIH TIMEZONE_MISSING, TANPA perubahan state', ht.hasil === 'DITOLAK_PULIH' && ht.alasan === 'TIMEZONE_MISSING' && (await potret(t)) === awal)
    await adm.port.updateMany({ where: { id: W.port.id }, data: { timezone: 'Mars/Olympus' } })
    const ht2 = await kirim(W, t.messageId)
    cek('34. zona waktu bukan IANA → DITOLAK_PULIH TIMEZONE_INVALID, tanpa perubahan', ht2.hasil === 'DITOLAK_PULIH' && ht2.alasan === 'TIMEZONE_INVALID' && (await potret(t)) === awal)
    cek('35. penolakan PULIH teraudit (WA1_SEND_DITOLAK) tanpa attempt', (await jumlahAudit('WA1_SEND_DITOLAK', t.messageId)) === 2 && (await attempts(t.messageId)).length === 0)
    await adm.port.updateMany({ where: { id: W.port.id }, data: { timezone: 'Asia/Makassar' } })
    const ht3 = await kirim(W, t.messageId)
    cek('36. setelah zona diperbaiki → Send berhasil (approval yang sama masih berlaku)', ht3.hasil === 'FAKE_SENT' && (await invarian(t.messageId)).ok)

    const u = await disetujui(A)
    const awalU = await potret(u)
    await adm.voyageEvent.updateMany({ where: { id: u.sumber.id }, data: { occurredAt: new Date(Date.now() + 3 * 864e5) } })
    const hu = await kirim(A, u.messageId)
    cek('37. AC-05/TS-18: occurredAt dipindah ke masa depan → DITOLAK_PULIH TIME_IN_FUTURE, tanpa perubahan', hu.hasil === 'DITOLAK_PULIH' && hu.alasan === 'TIME_IN_FUTURE' && (await potret(u)) === awalU)
  }

  // ============================================================== K1 NEEDS_REVIEW
  bagian('[6] K1 — approval basi → NEEDS_REVIEW (PRD §12.2/AC-11)')
  {
    const p = await disetujui(A)
    const kapalBaru = await adm.vessel.create({ data: { tenantId: A.t.id, name: 'MT Nama Baru' } })
    await adm.voyage.updateMany({ where: { id: p.v.id }, data: { vesselId: kapalBaru.id } })
    const h = await kirim(A, p.messageId)
    const i = await invarian(p.messageId)
    cek('38. fakta sumber yang dipakai template berubah → PERLU_TINJAUAN APPROVAL_STALE; pesan NEEDS_REVIEW; activeKey tetap; eksekusi CANCELLED; keputusan tetap APPROVED; 0 attempt', h.hasil === 'PERLU_TINJAUAN' && h.alasan === 'APPROVAL_STALE' && h.medan === 'sourceFingerprint' && i.ok && i.m.state === 'NEEDS_REVIEW' && i.m.reasonCode === 'APPROVAL_STALE' && i.m.activeKey === i.m.logicalMessageKey && i.a.status === 'APPROVED' && i.a.executionStatus === 'CANCELLED' && i.a.finalizedAt && i.at.length === 0, i.g.join(','))
    cek('39. transisi NEEDS_REVIEW teraudit (WA1_PESAN_PERLU_TINJAUAN + eksekusi dibatalkan)', (await jumlahAudit('WA1_PESAN_PERLU_TINJAUAN', p.messageId)) === 1 && (await jumlahAudit('WA1_EKSEKUSI_DIBATALKAN', p.approvalId)) === 1)
    const h2 = await kirim(A, p.messageId)
    cek('40. Send atas NEEDS_REVIEW → DITOLAK APPROVAL_STALE, tanpa perubahan', h2.hasil === 'DITOLAK' && h2.alasan === 'APPROVAL_STALE' && (await pesan(p.messageId)).state === 'NEEDS_REVIEW')
    const rv = await S.buatRevisiPesan(A.ctx, { candidateId: p.candidateId, recipientFixtureId: FX, language: 'ID' })
    const lama = await pesan(p.messageId)
    cek('41. revisi baru (2C) menggantikan revisi NEEDS_REVIEW → lama CANCELED/REVISED, approval lama tak dipakai ulang', rv.hasil === 'REVISI_DIBUAT' && rv.digantikanId === p.messageId && lama.state === 'CANCELED' && lama.reasonCode === 'REVISED' && lama.activeKey === null)
    await S.tandaiDipratinjau(A.ctx, { messageId: rv.messageId, snapshotFingerprint: rv.snapshotFingerprint })
    const a2 = await AP.mintaApproval(A.ctx, { messageId: rv.messageId })
    await AP.setujuiPesan(A.ctx, { approvalRequestId: a2.approvalRequestId })
    const h3 = await kirim(A, rv.messageId)
    const m3 = await pesan(rv.messageId)
    cek('42. revisi baru → preview → approval baru → FAKE_SENT dengan nama kapal baru', h3.hasil === 'FAKE_SENT' && a2.approvalRequestId !== p.approvalId && m3.body.includes('MT Nama Baru') && (await invarian(rv.messageId)).ok)

    const q = await disetujui(A)
    await adm.communicationMessage.updateMany({ where: { id: q.messageId }, data: { body: 'isi disunting langsung di DB' } })
    const hq = await kirim(A, q.messageId)
    cek('43. snapshot disunting (sidik tak cocok) → PERLU_TINJAUAN APPROVAL_STALE snapshotFingerprint', hq.hasil === 'PERLU_TINJAUAN' && hq.alasan === 'APPROVAL_STALE' && hq.medan === 'snapshotFingerprint' && (await attempts(q.messageId)).length === 0)

    const r = await disetujui(A)
    await adm.tahApprovalRequest.updateMany({ where: { id: r.approvalId }, data: { proposalHash: 'f'.repeat(64) } })
    const hr = await kirim(A, r.messageId)
    cek('44. proposalHash approval ≠ snapshot → PERLU_TINJAUAN APPROVAL_STALE proposalHash', hr.hasil === 'PERLU_TINJAUAN' && hr.alasan === 'APPROVAL_STALE' && hr.medan === 'proposalHash')

    // Template aktif berubah: body tersimpan beda dari render template saat ini, tetapi snapshot &
    // proposalHash disusun ulang konsisten → hanya pemeriksaan template yang bisa menangkapnya.
    const sunting = async (p0, ubah) => {
      const m = await pesan(p0.messageId)
      const c = await kandidat(m.candidateId)
      const baru = { ...m, ...ubah }
      const fp = H.sidikSnapshot({
        sourceFingerprint: baru.sourceFingerprint,
        teksKunciCandidate: JSON.stringify(['WA1C', A.t.id, c.voyageId, c.sourceType, c.sourceRef]),
        logicalMessageKey: baru.logicalMessageKey,
        recipientFixtureId: baru.recipientFixtureId,
        recipientIdentifier: baru.recipientIdentifier,
        language: baru.language,
        templateId: baru.templateId,
        templateVersion: baru.templateVersion,
        body: baru.body,
        mode: baru.mode,
      })
      await adm.communicationMessage.updateMany({ where: { id: m.id }, data: { ...ubah, snapshotFingerprint: fp } })
      await adm.tahApprovalRequest.updateMany({ where: { id: p0.approvalId }, data: { proposalHash: fp } })
    }
    const s = await disetujui(A)
    await sunting(s, { body: `${(await pesan(s.messageId)).body}\n(teks template lama)` })
    const hs = await kirim(A, s.messageId)
    cek('45. template aktif tak lagi menghasilkan body snapshot → PERLU_TINJAUAN APPROVAL_STALE template', hs.hasil === 'PERLU_TINJAUAN' && hs.alasan === 'APPROVAL_STALE' && hs.medan === 'template')
    const t = await disetujui(A)
    await sunting(t, { templateVersion: 2 })
    const ht = await kirim(A, t.messageId)
    cek('46. versi template snapshot ≠ versi aktif → PERLU_TINJAUAN APPROVAL_STALE template', ht.hasil === 'PERLU_TINJAUAN' && ht.medan === 'template')
    const u = await disetujui(A)
    await sunting(u, { recipientFixtureId: 'WA1_TEST_FIXTURE_TIDAK_ADA' })
    const hu = await kirim(A, u.messageId)
    cek('47. SG-05: penerima snapshot bukan fixture terdaftar → PERLU_TINJAUAN CONTACT_INELIGIBLE, 0 attempt', hu.hasil === 'PERLU_TINJAUAN' && hu.alasan === 'CONTACT_INELIGIBLE' && (await attempts(u.messageId)).length === 0)
  }

  // ============================================================== balapan
  bagian('[7] Balapan (AC-12, TS-12) — maksimal satu FAKE_SENT; yang kalah terkendali')
  const terkendali = (r) => (r.ok && ['FAKE_SENT', 'DITOLAK', 'DIBLOKIR', 'PERLU_TINJAUAN', 'FAKE_FAILED', 'PERCOBAAN_HABIS'].includes(r.nilai.hasil)) || (!r.ok && r.kode === 'CONFLICT')
  for (let n = 1; n <= ULANG; n++) {
    const p = await disetujui(A)
    const hs = await Promise.all([coba(() => kirim(A, p.messageId)), coba(() => kirim(A, p.messageId))])
    const i = await invarian(p.messageId)
    const sukses = hs.filter((r) => r.ok && r.nilai.hasil === 'FAKE_SENT' && !r.nilai.ulangan).length
    cek(`48. [${n}] dua Send kunci BERBEDA → tepat satu FAKE_SENT, 1 attempt, sisanya ALREADY_FAKE_SENT/CONFLICT`, sukses === 1 && i.ok && i.at.length === 1 && hs.every(terkendali) && hs.filter((r) => r.ok && r.nilai.hasil === 'DITOLAK').every((r) => r.nilai.alasan === 'ALREADY_FAKE_SENT'), JSON.stringify(hs.map((r) => (r.ok ? r.nilai.hasil + (r.nilai.alasan ? ':' + r.nilai.alasan : '') : r.kode))))

    const q = await disetujui(A)
    const k = rk()
    const hq = await Promise.all([coba(() => kirim(A, q.messageId, k)), coba(() => kirim(A, q.messageId, k))])
    const iq = await invarian(q.messageId)
    const attemptIds = new Set(hq.filter((r) => r.ok).map((r) => r.nilai.attemptId))
    cek(`49. [${n}] dua Send kunci SAMA → 1 attempt; keduanya hasil attempt yang sama (atau CONFLICT)`, iq.ok && iq.at.length === 1 && attemptIds.size <= 1 && hq.every((r) => (r.ok && r.nilai.hasil === 'FAKE_SENT') || (!r.ok && r.kode === 'CONFLICT')), JSON.stringify(hq.map((r) => (r.ok ? `${r.nilai.hasil}/${r.nilai.ulangan}` : r.kode))))

    const x = await disetujui(A)
    const hx = await Promise.all(Array.from({ length: 5 }, (_, j) => coba(() => kirim(A, x.messageId, j % 2 ? k + 'x' + n : rk()))))
    const ix = await invarian(x.messageId)
    cek(`50. [${n}] lima Send campuran → maksimal 1 FAKE_SENT, 1 attempt, semuanya terkendali`, ix.ok && ix.at.length === 1 && ix.m.state === 'FAKE_SENT' && hx.every(terkendali), JSON.stringify(hx.map((r) => (r.ok ? r.nilai.hasil : r.kode))))

    const y = await disetujui(A)
    const hy = await Promise.all([coba(() => kirim(A, y.messageId)), coba(() => S.buatRevisiPesan(A.ctx, { candidateId: y.candidateId, recipientFixtureId: FX, language: 'EN' }))])
    const iy = await invarian(y.messageId)
    const sudah = iy.m.state === 'FAKE_SENT'
    cek(`51. [${n}] Send vs revisi baru → tepat satu menang; pesan FAKE_SENT ⇒ revisi ditolak ALREADY_FAKE_SENT; pesan CANCELED ⇒ eksekusi CANCELLED, 0 sukses`, iy.ok && (sudah ? (!hy[1].ok ? hy[1].kode === 'CONFLICT' : hy[1].nilai.hasil === 'DITOLAK' && hy[1].nilai.alasan === 'ALREADY_FAKE_SENT') : iy.m.state === 'CANCELED' && iy.a.executionStatus === 'CANCELLED' && iy.at.length === 0) && terkendali(hy[0]), `${iy.m.state} ${JSON.stringify(hy.map((r) => (r.ok ? r.nilai.hasil : r.kode)))}`)

    const z = await disetujui(A)
    const hz = await Promise.all([coba(() => kirim(A, z.messageId)), adm.voyageEvent.updateMany({ where: { id: z.sumber.id }, data: { deletedAt: new Date() } })])
    const iz = await invarian(z.messageId)
    cek(`52. [${n}] Send vs hapus sumber → konsisten: FAKE_SENT (urutan serial kirim→hapus) ATAU BLOCKED SOURCE_DELETED; tak ada state campuran`, iz.ok && (iz.m.state === 'FAKE_SENT' || (iz.m.state === 'BLOCKED' && iz.at.length === 0 && iz.a.executionStatus === 'CANCELLED')) && terkendali(hz[0]), `${iz.m.state} ${hz[0].ok ? hz[0].nilai.hasil : hz[0].kode}`)
    if (iz.m.state !== 'FAKE_SENT') {
      const h2 = await kirim(A, z.messageId)
      cek(`52b. [${n}] setelah penghapusan terlihat → Send berikutnya tak pernah FAKE_SENT`, h2.hasil === 'DITOLAK')
    }
  }
  {
    // Stres: 20 iterasi dua Send bersamaan kunci berbeda — tak ada galat DB tak dikenal.
    let galat = 0
    let suksesGanda = 0
    for (let n = 0; n < 20; n++) {
      const p = await disetujui(A)
      const hs = await Promise.all([coba(() => kirim(A, p.messageId)), coba(() => kirim(A, p.messageId))])
      if (!hs.every(terkendali)) galat++
      if ((await invarian(p.messageId)).at.length !== 1) suksesGanda++
    }
    cek('53. stres 20× dua Send bersamaan: 0 hasil tak terkendali, 0 attempt ganda', galat === 0 && suksesGanda === 0, `${galat}/${suksesGanda}`)
  }

  // ============================================================== audit atomik
  bagian('[8] SG-09 — audit gagal → rollback total, tanpa klaim sukses')
  for (const [peristiwa, fx] of [['WA1_PESAN_FAKE_SENT', FX], ['WA1_ATTEMPT_DIKLAIM', FX], ['WA1_EKSEKUSI_DIMULAI', FX], ['WA1_PESAN_FAKE_FAILED', FX_GAGAL]]) {
    const p = await disetujui(A, { fx })
    const awal = await potret(p)
    await gagalkanAudit(peristiwa)
    const r = await coba(() => kirim(A, p.messageId))
    await hapusTrigger()
    cek(`54. gagal tulis audit ${peristiwa} → AUDIT_PERSIST_FAILED; pesan/approval/attempt tak berubah; 0 audit klaim tertinggal`, r.ok === false && r.kode === 'AUDIT_PERSIST_FAILED' && (await potret(p)) === awal && (await jumlahAudit('WA1_SEND_DIKLAIM', p.messageId)) === 0, `${r.kode} ${awal} → ${await potret(p)}`)
  }
  {
    const p = await disetujui(A)
    await gagalkanAudit('WA1_PESAN_PERLU_TINJAUAN')
    await adm.tahApprovalRequest.updateMany({ where: { id: p.approvalId }, data: { proposalHash: 'e'.repeat(64) } })
    const awal = await potret(p)
    const r = await coba(() => kirim(A, p.messageId))
    await hapusTrigger()
    cek('55. gagal tulis audit NEEDS_REVIEW → AUDIT_PERSIST_FAILED; pesan tetap APPROVED, eksekusi tetap NOT_STARTED', r.ok === false && r.kode === 'AUDIT_PERSIST_FAILED' && (await potret(p)) === awal)
    const q = await disetujui(A)
    await gagalkanAudit('WA1_PESAN_FAKE_SENT')
    await coba(() => kirim(A, q.messageId))
    await hapusTrigger()
    const h = await kirim(A, q.messageId)
    cek('56. setelah audit pulih → Send berhasil normal (attempt #1)', h.hasil === 'FAKE_SENT' && h.attemptNo === 1)
  }

  // ============================================================== review PR #10 — temuan 1
  bagian('[10] Temuan review 1 — balapan Send vs Prepare (revisi baru), dua urutan dipaksa deterministik')
  const ringkas = (r) => (r.ok ? r.nilai.hasil + (r.nilai.alasan ? ':' + r.nilai.alasan : '') : r.kode)
  /** Setelah satu sukses: TAK BOLEH ada revisi aktif (DRAFT dsb.) untuk pesan logis yang sama. */
  const pascaSukses = async (logicalMessageKey) => ({
    sukses: await adm.communicationMessage.count({ where: { logicalMessageKey, successKey: { not: null } } }),
    aktif: await adm.communicationMessage.count({ where: { logicalMessageKey, activeKey: { not: null } } }),
  })
  for (let n = 1; n <= 3; n++) {
    // Urutan A (skenario reviewer): Prepare sudah membaca successKey (kosong), lalu DITAHAN tepat
    // sebelum membaca revisi aktif; Send dijalankan pada celah itu; Prepare dilepas.
    const p = await disetujui(A)
    const m0 = await pesan(p.messageId)
    const jeda = pasangJeda('communicationMessage', 'findFirst', (a) => a?.where?.activeKey !== undefined)
    const rev = coba(() => S.buatRevisiPesan(A.ctx, { candidateId: p.candidateId, recipientFixtureId: FX, language: 'EN' }))
    await jeda.sampai
    const snd = coba(() => kirim(A, p.messageId))
    const statusSend = await tungguBlokirAtauSelesai(snd)
    jeda.lepas()
    const [hr, hs] = await Promise.all([rev, snd])
    const ps = await pascaSukses(m0.logicalMessageKey)
    const iA = await invarian(p.messageId)
    cek(`63. [${n}] urutan A (Send di antara dua bacaan Prepare): Send TIDAK bisa selesai selagi Prepare berjalan; tak ada revisi aktif sesudah FAKE_SENT; maks 1 sukses`, statusSend === 'TERBLOKIR' && ps.sukses <= 1 && !(ps.sukses === 1 && ps.aktif > 0) && iA.ok && terkendali(hs), `send=${statusSend} rev=${ringkas(hr)} send=${ringkas(hs)} sukses=${ps.sukses} aktif=${ps.aktif} pesan=${iA.m.state}`)

    // Urutan B: Send sudah mengklaim (memegang kunci) lalu DITAHAN sebelum membuat attempt;
    // Prepare dijalankan; Send dilepas.
    const q = await disetujui(A)
    const q0 = await pesan(q.messageId)
    const jedaB = pasangJeda('communicationAttempt', 'create', () => true)
    const sndB = coba(() => kirim(A, q.messageId))
    await jedaB.sampai
    const revB = coba(() => S.buatRevisiPesan(A.ctx, { candidateId: q.candidateId, recipientFixtureId: FX, language: 'EN' }))
    const statusRev = await tungguBlokirAtauSelesai(revB)
    jedaB.lepas()
    const [hsB, hrB] = await Promise.all([sndB, revB])
    const psB = await pascaSukses(q0.logicalMessageKey)
    cek(`64. [${n}] urutan B (Send klaim dulu, Prepare menyusul): Prepare menunggu; Send FAKE_SENT; revisi ditolak ALREADY_FAKE_SENT; tak ada revisi aktif`, statusRev === 'TERBLOKIR' && hsB.ok && hsB.nilai.hasil === 'FAKE_SENT' && ((hrB.ok && hrB.nilai.hasil === 'DITOLAK' && hrB.nilai.alasan === 'ALREADY_FAKE_SENT') || (!hrB.ok && hrB.kode === 'CONFLICT')) && psB.sukses === 1 && psB.aktif === 0 && (await invarian(q.messageId)).ok, `rev=${statusRev} send=${ringkas(hsB)} rev=${ringkas(hrB)} sukses=${psB.sukses} aktif=${psB.aktif}`)
  }
  cek('65. semua titik jeda terpakai (tak ada jeda menggantung)', titikJeda.length === 0)

  // ============================================================== review PR #10 — temuan 2
  bagian('[11] Temuan review 2 — batas MAKS_PERCOBAAN_EKSEKUSI (tah-policy beku = 5)')
  {
    const p = await disetujui(A, { fx: FX_GAGAL })
    const kunci = []
    for (let i = 0; i < 5; i++) {
      const k = rk()
      kunci.push(k)
      await kirim(A, p.messageId, k)
    }
    const i5 = await invarian(p.messageId)
    cek('66. attempt #1..#5 (1 kirim + 4 retry manual) tercatat FAKE_FAILED; executionAttempts = 5', i5.ok && i5.at.map((x) => x.attemptNo).join() === '1,2,3,4,5' && i5.at.every((x) => x.state === 'FAKE_FAILED') && i5.a.executionAttempts === 5)
    const awal = await potret(p)
    const h6 = await coba(() => kirim(A, p.messageId))
    cek('67. retry ke-6 dengan kunci BARU → PERCOBAAN_HABIS EXECUTION_ATTEMPTS_EXHAUSTED, tanpa attempt baru, tanpa perubahan state', h6.ok && h6.nilai.hasil === 'PERCOBAAN_HABIS' && h6.nilai.kode === 'EXECUTION_ATTEMPTS_EXHAUSTED' && h6.nilai.maks === 5 && (await potret(p)) === awal, h6.ok ? JSON.stringify(h6.nilai) : h6.kode)
    cek('68. penolakan batas teraudit (WA1_SEND_DITOLAK, kode EXECUTION_ATTEMPTS_EXHAUSTED)', (await adm.auditLog.count({ where: { recordId: p.messageId, newValue: { path: ['kode'], equals: 'EXECUTION_ATTEMPTS_EXHAUSTED' } } })) >= 1)
    const r3 = await kirim(A, p.messageId, kunci[2])
    cek('69. replay kunci attempt #3 sesudah batas habis → hasil attempt #3 (idempoten), tanpa attempt baru', r3.hasil === 'FAKE_FAILED' && r3.ulangan === true && r3.attemptNo === 3 && (await attempts(p.messageId)).length === 5)

    for (let n = 1; n <= 3; n++) {
      const q = await disetujui(A, { fx: FX_GAGAL })
      for (let i = 0; i < 4; i++) await kirim(A, q.messageId)
      const hs = await Promise.all(Array.from({ length: 4 }, () => coba(() => kirim(A, q.messageId))))
      const iq = await invarian(q.messageId)
      const baru = hs.filter((r) => r.ok && r.nilai.hasil === 'FAKE_FAILED' && !r.nilai.ulangan).length
      cek(`70. [${n}] pada attempt #4, empat retry bersamaan → tepat satu attempt #5; sisanya PERCOBAAN_HABIS/CONFLICT; tak pernah > 5`, baru === 1 && iq.ok && iq.at.length === 5 && iq.a.executionAttempts === 5 && hs.every((r) => (r.ok && ['FAKE_FAILED', 'PERCOBAAN_HABIS'].includes(r.nilai.hasil)) || (!r.ok && r.kode === 'CONFLICT')), JSON.stringify(hs.map(ringkas)))
    }

    const u = await disetujui(A, { fx: FX_ULANG })
    const u1 = await kirim(A, u.messageId)
    const u2 = await kirim(A, u.messageId)
    cek('71. batas tak mengganggu jalur normal: FAIL_ONCE_THEN_SUCCESS sukses di attempt #2', u1.hasil === 'FAKE_FAILED' && u2.hasil === 'FAKE_SENT' && u2.attemptNo === 2)
  }

  // ============================================================== egress & invarian global
  bagian('[9] Zero egress & invarian global')
  cek('57. NOL panggilan jaringan selama seluruh uji (fetch/http/https/net/net.Socket/tls/dns/WebSocket)', egress.length === 0, egress.join(','))
  const tenantUji = (await adm.tenant.findMany({ where: { companyName: { startsWith: TAG } }, select: { id: true } })).map((t) => t.id)
  const semuaAt = await adm.communicationAttempt.findMany({ where: { tenantId: { in: tenantUji } } })
  cek('58. setiap attempt: provider FAKE, simulation true, externalDelivery false, receipt hanya fake_…', semuaAt.length > 0 && semuaAt.every((x) => x.provider === 'FAKE' && x.simulation === true && x.externalDelivery === false && (x.receipt === null || /^fake_[0-9a-f]{32}$/.test(x.receipt))))
  cek('59. tak ada state antara ter-commit (pesan/attempt QUEUED_FAKE, eksekusi RUNNING)', (await adm.communicationMessage.count({ where: { tenantId: { in: tenantUji }, state: 'QUEUED_FAKE' } })) === 0 && semuaAt.every((x) => x.state !== 'QUEUED_FAKE') && (await adm.tahApprovalRequest.count({ where: { tenantId: { in: tenantUji }, executionStatus: 'RUNNING' } })) === 0)
  const semuaAp = await adm.tahApprovalRequest.findMany({ where: { tenantId: { in: tenantUji } } })
  cek('60. invarian status TAH (beku) berlaku di semua approval uji; tak ada keputusan selain APPROVED/PENDING/CANCELLED/SUPERSEDED/REJECTED', semuaAp.every((a) => TAH.invarianStatus(a.status, a.executionStatus)))
  const semuaM = await adm.communicationMessage.findMany({ where: { tenantId: { in: tenantUji } } })
  const sukses = new Map()
  for (const m of semuaM.filter((x) => x.successKey)) sukses.set(m.successKey, (sukses.get(m.successKey) ?? 0) + 1)
  cek('61. maksimal satu FAKE_SENT per pesan logis (seluruh dunia uji)', [...sukses.values()].every((n) => n === 1) && semuaM.filter((m) => m.state === 'FAKE_SENT').every((m) => m.successKey === m.logicalMessageKey))
  cek('62. setiap attempt milik tenant pesannya (isolasi tenant attempt ↔ message)', semuaAt.every((x) => semuaM.find((m) => m.id === x.messageId)?.tenantId === x.tenantId))
} catch (e) {
  gagal++
  console.log(`\n  ❌ Uji DB berhenti karena galat: ${e?.stack ?? e}`)
} finally {
  try {
    await bersihkan()
  } catch (e) {
    console.log(`  (pembersihan gagal: ${e?.message})`)
  }
  await adm.$disconnect()
}

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`)
process.exit(gagal === 0 ? 0 : 1)
