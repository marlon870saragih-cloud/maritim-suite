// Uji integrasi DB Step 2F — Cancel oleh pengguna WA-1 (TANPA WhatsApp nyata, API, UI, jaringan).
//
// Jalankan (PostgreSQL loopback sekali pakai yang SUDAH `prisma migrate deploy`):
//   COMM_CANCEL_DB_URL=postgresql://postgres@127.0.0.1:55432/maritime_suite \
//     node prisma/check-comm-cancel-db.mjs
// Tanpa COMM_CANCEL_DB_URL → DILEWATI (kode 3).
//
// DITOLAK (DB tak disentuh) bila: host bukan loopback, parameter host, NODE_ENV=production,
// DATABASE_URL/DIRECT_URL menunjuk DB lain. Semua baris bertanda `WA1S2F-`; dihapus di akhir.
// Balapan Cancel vs Send dipaksa dalam dua urutan (titik jeda deterministik) dan diulang
// bebas; hasil akhir diperiksa terhadap invarian (pesan ⇔ approval ⇔ attempt), bukan satu urutan.

import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import tls from 'node:tls'
import dns from 'node:dns'

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
const URL_DB = process.env.COMM_CANCEL_DB_URL
if (!URL_DB) {
  console.log('DILEWATI — COMM_CANCEL_DB_URL tidak diset (butuh PostgreSQL loopback sekali pakai).')
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
const CS = jiti('../src/services/communication/communication-cancel.service.ts')
const TAH = jiti('../src/services/tah/tah-policy.ts')
const { PrismaClient } = await import('@prisma/client')
const adm = new PrismaClient({ datasources: { db: { url: URL_DB } } })

// ---------------------------------------------- titik jeda deterministik (khusus uji)
// Sama dengan uji Step 2E: forTenant dibungkus supaya SATU kueri tertentu di dalam transaksi
// service bisa ditahan sampai uji melepasnya. Kode produksi tidak tahu apa-apa soal ini.
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

const TAG = 'WA1S2F-'
let seq = 0
const uid = () => `${TAG}${++seq}`
let rkSeq = 0
const rk = () => `rk-${Date.now().toString(36)}-${++rkSeq}`
const WAKTU = '2026-10-05T02:30:00.000Z'
const FX = 'WA1_TEST_FIXTURE_SUCCESS'
const FX_GAGAL = 'WA1_TEST_FIXTURE_FAIL'
const ULANG = 5
const ALASAN = 'Dibatalkan untuk uji Step 2F'

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
const ringkas = (r) => (r.ok ? r.nilai.hasil + (r.nilai.alasan ? ':' + r.nilai.alasan : '') : r.kode)

async function hapusTrigger() {
  await adm.$executeRawUnsafe('DROP TRIGGER IF EXISTS wa1s2f_gagal_audit ON "AuditLog"')
  await adm.$executeRawUnsafe('DROP FUNCTION IF EXISTS wa1s2f_gagal_audit()')
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
  await adm.$executeRawUnsafe(`CREATE FUNCTION wa1s2f_gagal_audit() RETURNS trigger AS $$ BEGIN IF NEW."newValue"->>'peristiwa' = '${peristiwa}' THEN RAISE EXCEPTION 'AUDIT_GAGAL_SENGAJA'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`)
  await adm.$executeRawUnsafe('CREATE TRIGGER wa1s2f_gagal_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION wa1s2f_gagal_audit()')
}

// ------------------------------------------------------------------ dunia uji
async function dunia(nama) {
  const t = await adm.tenant.create({ data: { companyName: `${TAG}${nama}` } })
  const kapal = await adm.vessel.create({ data: { tenantId: t.id, name: 'MT Contoh Satu' } })
  const port = await adm.port.create({ data: { tenantId: t.id, name: 'Pelabuhan Uji', timezone: 'Asia/Makassar' } })
  return { t, kapal, port, ctx: { tenantId: t.id, userId: `u-${nama}`, role: 'ADMIN' } }
}
const voyage = (w) =>
  adm.voyage.create({ data: { tenantId: w.t.id, vesselId: w.kapal.id, portId: w.port.id, voyageNumber: uid(), eta: new Date('2026-10-12T00:00:00Z'), etd: new Date('2026-10-14T00:00:00Z') } })
const sinyal = (w, v, ubah = {}) =>
  adm.monitoringSignal.create({ data: { tenantId: w.t.id, voyageId: v.id, kind: 'ETA_CHANGED', severity: 'INFO', dedupeKey: uid(), sourceType: 'AUDIT_LOG', explanation: 'uji', recommendation: 'uji', ...ubah } })

/** Sumber milestone EOSP → candidate → revisi DRAFT. */
async function draf(w, { fx = FX } = {}) {
  const v = await voyage(w)
  const sumber = await adm.voyageEvent.create({ data: { tenantId: w.t.id, voyageId: v.id, eventCode: 'EOSP', occurredAt: new Date(WAKTU), recordedByUserId: 'u-uji' } })
  const s = await sinyal(w, v, { kind: 'OPERATIONAL_EVENT_RECORDED', sourceType: 'VOYAGE_EVENT', sourceRef: sumber.id, after: { eventCode: 'EOSP', occurredAt: WAKTU } })
  const h = await S.siapkanCandidate(w.ctx, { signalId: s.id })
  const r = await S.buatRevisiPesan(w.ctx, { candidateId: h.candidateId, recipientFixtureId: fx, language: 'ID' })
  if (h.hasil !== 'SIAP' || r.hasil !== 'REVISI_DIBUAT') throw new Error(`fixture draf gagal: ${h.hasil}/${r.hasil}`)
  return { v, sumber, s, candidateId: h.candidateId, messageId: r.messageId, fp: r.snapshotFingerprint }
}
async function pratinjau(w, opsi = {}) {
  const p = await draf(w, opsi)
  const t = await S.tandaiDipratinjau(w.ctx, { messageId: p.messageId, snapshotFingerprint: p.fp })
  if (t.hasil !== 'DIPRATINJAU') throw new Error(`fixture pratinjau gagal: ${t.hasil}`)
  return p
}
async function menunggu(w, opsi = {}) {
  const p = await pratinjau(w, opsi)
  const a = await AP.mintaApproval(w.ctx, { messageId: p.messageId })
  if (a.hasil !== 'APPROVAL_DIMINTA') throw new Error(`fixture minta approval gagal: ${a.hasil}`)
  return { ...p, approvalId: a.approvalRequestId }
}
async function disetujui(w, opsi = {}) {
  const p = await menunggu(w, opsi)
  const d = await AP.setujuiPesan(w.ctx, { approvalRequestId: p.approvalId })
  if (d.hasil !== 'DISETUJUI') throw new Error(`fixture setujui gagal: ${d.hasil}`)
  return p
}
async function gagalKirim(w) {
  const p = await disetujui(w, { fx: FX_GAGAL })
  const h = await kirim(w, p.messageId)
  if (h.hasil !== 'FAKE_FAILED') throw new Error(`fixture FAKE_FAILED gagal: ${h.hasil}`)
  return p
}
async function perluTinjauan(w) {
  const p = await disetujui(w)
  const kapalBaru = await adm.vessel.create({ data: { tenantId: w.t.id, name: `MT Ganti ${uid()}` } })
  await adm.voyage.updateMany({ where: { id: p.v.id }, data: { vesselId: kapalBaru.id } })
  const h = await kirim(w, p.messageId)
  if (h.hasil !== 'PERLU_TINJAUAN') throw new Error(`fixture NEEDS_REVIEW gagal: ${h.hasil}`)
  return p
}
const kirim = (w, messageId, requestKey = rk()) => KS.kirimFake(w.ctx, { messageId, requestKey })
const batal = (w, messageId, cancelNote = ALASAN, ctx = w.ctx) => CS.batalkanPesan(ctx, { messageId, cancelNote })
const pesan = (id) => adm.communicationMessage.findFirst({ where: { id } })
const approval = (id) => adm.tahApprovalRequest.findFirst({ where: { id } })
const attempts = (messageId) => adm.communicationAttempt.findMany({ where: { messageId }, orderBy: { attemptNo: 'asc' } })
const auditPeristiwa = (peristiwa, recordId) =>
  adm.auditLog.findMany({ where: { newValue: { path: ['peristiwa'], equals: peristiwa }, ...(recordId ? { recordId } : {}) }, orderBy: { createdAt: 'asc' } })
const jumlahAudit = async (peristiwa, recordId) => (await auditPeristiwa(peristiwa, recordId)).length
const potret = async (messageId) => {
  const m = await pesan(messageId)
  const a = m.approvalRequestId ? await approval(m.approvalRequestId) : null
  return JSON.stringify({ m: [m.state, m.version, m.reasonCode, m.activeKey, m.successKey], a: a && [a.status, a.executionStatus, a.version], at: await adm.communicationAttempt.count({ where: { messageId } }) })
}

/**
 * Invarian pesan ⇔ approval ⇔ attempt sesudah Cancel / balapan:
 *  C1 CANCELED_BY_USER ⇒ activeKey NULL, successKey NULL, tak ada attempt FAKE_SENT, approval tak
 *     lagi PENDING dan eksekusinya tak NOT_STARTED/FAILED/RUNNING (dihentikan), tepat satu audit pembatalan
 *  C2 FAKE_SENT ⇔ successKey = logicalMessageKey & tepat satu attempt FAKE_SENT & eksekusi SUCCEEDED
 *  C3 tak ada state antara ter-commit; maksimal satu sukses & satu revisi aktif per pesan logis
 *  C4 invarian status TAH beku berlaku
 */
async function invarian(messageId) {
  const m = await pesan(messageId)
  const a = m.approvalRequestId ? await approval(m.approvalRequestId) : null
  const at = await attempts(messageId)
  const g = []
  if (m.state === 'CANCELED' && m.reasonCode === 'CANCELED_BY_USER') {
    if (m.activeKey !== null || m.successKey !== null) g.push('C1kunci')
    if (at.some((x) => x.state === 'FAKE_SENT')) g.push('C1attempt')
    if (a && (a.status === 'PENDING' || ['NOT_STARTED', 'FAILED', 'RUNNING'].includes(a.executionStatus))) g.push('C1approval')
    if ((await jumlahAudit('WA1_PESAN_DIBATALKAN_PENGGUNA', m.id)) !== 1) g.push('C1audit')
  }
  if (m.state === 'FAKE_SENT' && !(m.successKey === m.logicalMessageKey && at.filter((x) => x.state === 'FAKE_SENT').length === 1 && a?.executionStatus === 'SUCCEEDED')) g.push('C2')
  if (m.state !== 'FAKE_SENT' && (m.successKey !== null || at.some((x) => x.state === 'FAKE_SENT'))) g.push('C2b')
  if (m.state === 'QUEUED_FAKE' || at.some((x) => x.state === 'QUEUED_FAKE') || a?.executionStatus === 'RUNNING') g.push('C3antara')
  if ((await adm.communicationMessage.count({ where: { logicalMessageKey: m.logicalMessageKey, successKey: { not: null } } })) > 1) g.push('C3sukses')
  if ((await adm.communicationMessage.count({ where: { logicalMessageKey: m.logicalMessageKey, activeKey: { not: null } } })) > 1) g.push('C3aktif')
  if (a && !TAH.invarianStatus(a.status, a.executionStatus)) g.push('C4')
  return { ok: g.length === 0, g, m, a, at }
}

try {
  await bersihkan()
  const A = await dunia('A')
  const B = await dunia('B')
  const C = await dunia('C') // TIDAK di allowlist Automation
  process.env.AUTOMATION_TENANT_IDS = `${A.t.id},${B.t.id}`

  // ============================================================== gerbang
  bagian('[1] Gerbang, otorisasi, validasi alasan, isolasi tenant')
  {
    const p = await disetujui(A)
    const awal = await potret(p.messageId)
    const auditAwal = await adm.auditLog.count()
    cek('1. tenant di luar allowlist Automation → NOT_FOUND', (await kode(() => batal(A, p.messageId, ALASAN, C.ctx))) === 'NOT_FOUND')
    cek('2. peran OPERATOR / FINANCE → FORBIDDEN; konteks sistem → FORBIDDEN', (await kode(() => batal(A, p.messageId, ALASAN, { ...A.ctx, role: 'OPERATOR' }))) === 'FORBIDDEN' && (await kode(() => batal(A, p.messageId, ALASAN, { ...A.ctx, role: 'FINANCE' }))) === 'FORBIDDEN' && (await kode(() => batal(A, p.messageId, ALASAN, { ...A.ctx, system: true }))) === 'FORBIDDEN')
    process.env.WA1_INTERNAL_FAKE_TEST_ENABLED = 'false'
    const mati = await coba(() => batal(A, p.messageId))
    process.env.WA1_INTERNAL_FAKE_TEST_ENABLED = 'true'
    cek('3. flag WA mati → FORBIDDEN (FEATURE_DISABLED)', mati.ok === false && mati.kode === 'FORBIDDEN' && mati.pesan.includes('FEATURE_DISABLED'), mati.pesan)
    process.env.NODE_ENV = 'production'
    const prod = await coba(() => batal(A, p.messageId))
    process.env.NODE_ENV = 'test'
    cek('4. NODE_ENV=production → FORBIDDEN ENV_NOT_ALLOWED', prod.ok === false && prod.kode === 'FORBIDDEN' && prod.pesan.includes('ENV_NOT_ALLOWED'), prod.pesan)
    const alasanSalah = [undefined, null, '', '   ', 'ab', '  ab  ', 'x'.repeat(1001), 42, { teks: ALASAN }]
    cek('5. alasan wajib: kosong / spasi / < 3 / > 1000 / bukan string → VALIDATION', (await Promise.all(alasanSalah.map((n) => kode(() => CS.batalkanPesan(A.ctx, { messageId: p.messageId, cancelNote: n }))))).every((x) => x === 'VALIDATION') && (await kode(() => CS.batalkanPesan(A.ctx, { messageId: p.messageId }))) === 'VALIDATION')
    cek('6. messageId tak sah (kosong / > 64 / bukan string) → VALIDATION', (await Promise.all(['', 'x'.repeat(65), 7, null].map((id) => kode(() => CS.batalkanPesan(A.ctx, { messageId: id, cancelNote: ALASAN }))))).every((x) => x === 'VALIDATION'))
    cek('7. tenant B membatalkan pesan A → NOT_FOUND (tanpa bocor)', (await kode(() => batal(B, p.messageId))) === 'NOT_FOUND')
    cek('8. semua penolakan di atas: 0 mutasi, 0 audit baru (gerbang & validasi sebelum DB)', (await potret(p.messageId)) === awal && (await adm.auditLog.count()) === auditAwal, `${awal} → ${await potret(p.messageId)}`)

    const mo = { tenantId: A.t.id, userId: 'u-manajer-lain', role: 'MANAJER_OPERASI' }
    const h = await batal(A, p.messageId, `  ${ALASAN}  `, mo)
    const i = await invarian(p.messageId)
    const [jejak] = await auditPeristiwa('WA1_PESAN_DIBATALKAN_PENGGUNA', p.messageId)
    cek('9. MANAJER_OPERASI yang BUKAN pembuat pesan boleh membatalkan → DIBATALKAN', h.hasil === 'DIBATALKAN' && i.ok && i.m.createdByUserId !== mo.userId, i.g.join(','))
    cek('10. audit mencatat actor pembatal, tenant, alasan (di-trim), stateSebelum, rantai sumber', jejak?.userId === mo.userId && jejak.tenantId === A.t.id && jejak.newValue.catatan === ALASAN && jejak.newValue.stateSebelum === 'APPROVED' && jejak.newValue.candidateId === p.candidateId && jejak.newValue.sourceRef === p.sumber.id && jejak.newValue.snapshotFingerprint === p.fp && jejak.oldValue.state === 'APPROVED')
  }

  // ============================================================== state yang diizinkan
  bagian('[2] Cancel dari setiap state yang diizinkan (FR-20)')
  {
    const sah = async (label, p, harapApproval) => {
      const sebelum = await pesan(p.messageId)
      const h = await batal(A, p.messageId)
      const i = await invarian(p.messageId)
      const ok =
        h.hasil === 'DIBATALKAN' &&
        h.stateSebelum === sebelum.state &&
        i.ok &&
        i.m.state === 'CANCELED' &&
        i.m.reasonCode === 'CANCELED_BY_USER' &&
        i.m.activeKey === null &&
        i.m.successKey === null &&
        i.m.version === sebelum.version + 1 &&
        i.m.snapshotFingerprint === sebelum.snapshotFingerprint &&
        i.m.body === sebelum.body &&
        harapApproval(i.a)
      cek(`${label}: ${sebelum.state} → CANCELED/CANCELED_BY_USER; activeKey dilepas; snapshot utuh; approval dihentikan benar`, ok, `${ringkas({ ok: true, nilai: h })} ${i.g.join(',')} a=${i.a ? `${i.a.status}/${i.a.executionStatus}` : '-'}`)
      return i
    }
    await sah('11', await draf(A), (a) => a === null)
    await sah('12', await pratinjau(A), (a) => a === null)
    const iPend = await sah('13', await menunggu(A), (a) => a?.status === 'CANCELLED' && a.executionStatus === 'NOT_APPLICABLE' && a.decisionNote === 'CANCELED_BY_USER' && a.finalizedAt)
    cek('13b. approval PENDING → CANCELLED teraudit (WA1_APPROVAL_DIHENTIKAN)', (await jumlahAudit('WA1_APPROVAL_DIHENTIKAN', iPend.a.id)) === 1)
    const iApp = await sah('14', await disetujui(A), (a) => a?.status === 'APPROVED' && a.executionStatus === 'CANCELLED' && a.executionErrorCode === 'CANCELED_BY_USER' && a.finalizedAt)
    cek('14b. keputusan APPROVED tak diubah; eksekusi CANCELLED teraudit (WA1_EKSEKUSI_DIBATALKAN); 0 attempt', iApp.at.length === 0 && (await jumlahAudit('WA1_EKSEKUSI_DIBATALKAN', iApp.a.id)) === 1)
    const iGagal = await sah('15', await gagalKirim(A), (a) => a?.status === 'APPROVED' && a.executionStatus === 'CANCELLED' && a.executionAttempts === 1)
    cek('15b. FAKE_FAILED dibatalkan: attempt gagal tetap ada sebagai riwayat (1, FAKE_FAILED), tanpa attempt baru', iGagal.at.length === 1 && iGagal.at[0].state === 'FAKE_FAILED')
    await sah('16', await perluTinjauan(A), (a) => a?.status === 'APPROVED' && a.executionStatus === 'CANCELLED')
  }

  // ============================================================== state terminal
  bagian('[3] Cancel ditolak dari state terminal (tanpa perubahan state, tercatat)')
  {
    const tolakTerminal = async (label, messageId, stateHarap, reasonHarap) => {
      const awal = await potret(messageId)
      const auditTolak = await jumlahAudit('WA1_CANCEL_DITOLAK', messageId)
      const h = await batal(A, messageId)
      cek(`${label}: ${stateHarap} → DITOLAK CANCEL_NOT_ALLOWED; 0 mutasi; penolakan teraudit`, h.hasil === 'DITOLAK' && h.kode === 'CANCEL_NOT_ALLOWED' && h.state === stateHarap && h.reasonCode === reasonHarap && (await potret(messageId)) === awal && (await jumlahAudit('WA1_CANCEL_DITOLAK', messageId)) === auditTolak + 1, `${h.hasil}/${h.state}/${h.reasonCode}`)
    }
    const s = await disetujui(A)
    await kirim(A, s.messageId)
    await tolakTerminal('17', s.messageId, 'FAKE_SENT', null)
    const c = await draf(A)
    await batal(A, c.messageId)
    await tolakTerminal('18 (batal dua kali)', c.messageId, 'CANCELED', 'CANCELED_BY_USER')
    cek('18b. batal dua kali → tepat SATU audit pembatalan', (await jumlahAudit('WA1_PESAN_DIBATALKAN_PENGGUNA', c.messageId)) === 1)
    const r = await draf(A)
    const r2 = await S.buatRevisiPesan(A.ctx, { candidateId: r.candidateId, recipientFixtureId: FX, language: 'EN' })
    await tolakTerminal('19', r.messageId, 'CANCELED', 'REVISED')
    const t = await menunggu(A)
    await AP.tolakPesan(A.ctx, { approvalRequestId: t.approvalId, decisionNote: 'ditolak uji' })
    await tolakTerminal('20', t.messageId, 'CANCELED', 'APPROVAL_REJECTED')
    const b = await disetujui(A)
    await adm.voyageEvent.updateMany({ where: { id: b.sumber.id }, data: { deletedAt: new Date() } })
    await kirim(A, b.messageId)
    await tolakTerminal('21', b.messageId, 'BLOCKED', 'SOURCE_DELETED')
    cek('21b. revisi aktif lain tak tersentuh oleh penolakan (revisi pengganti #19 tetap DRAFT)', (await pesan(r2.messageId)).state === 'DRAFT')
  }

  // ============================================================== sesudah Cancel
  bagian('[4] Sesudah Cancel: tak bisa Send/approval; Prepare boleh revisi baru')
  {
    const p = await disetujui(A)
    await batal(A, p.messageId)
    const k = await kirim(A, p.messageId)
    cek('22. Send atas pesan CANCELED → DITOLAK CANCELED_BY_USER, 0 attempt, eksekusi tetap CANCELLED', k.hasil === 'DITOLAK' && k.alasan === 'CANCELED_BY_USER' && (await attempts(p.messageId)).length === 0 && (await approval(p.approvalId)).executionStatus === 'CANCELLED')
    const ma = await coba(() => AP.mintaApproval(A.ctx, { messageId: p.messageId }))
    cek('23. minta approval atas pesan CANCELED → tak membuat approval baru', (await adm.tahApprovalRequest.count({ where: { subjectId: p.messageId } })) === 1 && !(ma.ok && ma.nilai.hasil === 'APPROVAL_DIMINTA'), ringkas(ma))
    const rv = await S.buatRevisiPesan(A.ctx, { candidateId: p.candidateId, recipientFixtureId: FX, language: 'ID' })
    cek('24. Prepare sesudah Cancel → REVISI_DIBUAT baru (activeKey dilepas), bukan menghidupkan revisi lama', rv.hasil === 'REVISI_DIBUAT' && rv.messageId !== p.messageId && rv.digantikanId === null && (await pesan(p.messageId)).state === 'CANCELED')
    await S.tandaiDipratinjau(A.ctx, { messageId: rv.messageId, snapshotFingerprint: rv.snapshotFingerprint })
    const a2 = await AP.mintaApproval(A.ctx, { messageId: rv.messageId })
    await AP.setujuiPesan(A.ctx, { approvalRequestId: a2.approvalRequestId })
    const h2 = await kirim(A, rv.messageId)
    cek('25. revisi baru → approval BARU → FAKE_SENT; revisi yang dibatalkan tetap CANCELED tanpa sukses', h2.hasil === 'FAKE_SENT' && a2.approvalRequestId !== p.approvalId && (await invarian(p.messageId)).ok && (await invarian(rv.messageId)).ok)
  }

  // ============================================================== balapan deterministik
  bagian('[5] Balapan Cancel vs Send — dua urutan dipaksa deterministik (AC-18)')
  for (let n = 1; n <= 3; n++) {
    // Urutan A: Send sudah mengklaim (memegang kunci candidate) lalu DITAHAN sebelum membuat attempt;
    // Cancel dijalankan dan HARUS menunggu; Send dilepas → FAKE_SENT; Cancel melihat FAKE_SENT → DITOLAK.
    const p = await disetujui(A)
    const jeda = pasangJeda('communicationAttempt', 'create', () => true)
    const snd = coba(() => kirim(A, p.messageId))
    await jeda.sampai
    const btl = coba(() => batal(A, p.messageId))
    const statusBatal = await tungguBlokirAtauSelesai(btl)
    jeda.lepas()
    const [hs, hb] = await Promise.all([snd, btl])
    const i = await invarian(p.messageId)
    cek(`26. [${n}] urutan A (Send klaim dulu): Cancel menunggu kunci; Send FAKE_SENT; Cancel DITOLAK; 0 audit pembatalan`, statusBatal === 'TERBLOKIR' && hs.ok && hs.nilai.hasil === 'FAKE_SENT' && ((hb.ok && hb.nilai.hasil === 'DITOLAK' && hb.nilai.state === 'FAKE_SENT') || (!hb.ok && hb.kode === 'CONFLICT')) && i.ok && (await jumlahAudit('WA1_PESAN_DIBATALKAN_PENGGUNA', p.messageId)) === 0, `batal=${statusBatal} send=${ringkas(hs)} batal=${ringkas(hb)} ${i.g.join(',')}`)

    // Urutan B: Cancel sudah memegang kunci candidate dan DITAHAN tepat sebelum membaca ulang pesan;
    // Send dijalankan dan HARUS menunggu; Cancel dilepas → DIBATALKAN; Send (REPEATABLE READ) gagal
    // serialisasi → diulang → melihat CANCELED → DITOLAK CANCELED_BY_USER, tanpa attempt.
    const q = await disetujui(A)
    const jedaB = pasangJeda('communicationMessage', 'findFirst', (a) => a?.where?.id === q.messageId && a?.select?.successKey === true && a?.select?.version === true)
    const btlB = coba(() => batal(A, q.messageId))
    await jedaB.sampai
    const sndB = coba(() => kirim(A, q.messageId))
    const statusSend = await tungguBlokirAtauSelesai(sndB)
    jedaB.lepas()
    const [hbB, hsB] = await Promise.all([btlB, sndB])
    const iB = await invarian(q.messageId)
    cek(`27. [${n}] urutan B (Cancel kunci dulu): Send menunggu; Cancel DIBATALKAN; Send DITOLAK CANCELED_BY_USER; 0 attempt; tak pernah FAKE_SENT`, statusSend === 'TERBLOKIR' && hbB.ok && hbB.nilai.hasil === 'DIBATALKAN' && ((hsB.ok && hsB.nilai.hasil === 'DITOLAK' && hsB.nilai.alasan === 'CANCELED_BY_USER') || (!hsB.ok && hsB.kode === 'CONFLICT')) && iB.ok && iB.m.state === 'CANCELED' && iB.at.length === 0, `send=${statusSend} batal=${ringkas(hbB)} send=${ringkas(hsB)} ${iB.g.join(',')}`)
  }
  cek('28. semua titik jeda terpakai (tak ada jeda menggantung)', titikJeda.length === 0)

  // ============================================================== balapan bebas
  bagian('[6] Balapan bebas — tepat satu transisi pemenang, tak pernah FAKE_SENT sesudah CANCELED')
  const terkendali = (r) => (r.ok && ['DIBATALKAN', 'DITOLAK', 'DIBLOKIR', 'FAKE_SENT', 'FAKE_FAILED', 'PERLU_TINJAUAN', 'PERCOBAAN_HABIS'].includes(r.nilai.hasil)) || (!r.ok && r.kode === 'CONFLICT')
  for (let n = 1; n <= ULANG; n++) {
    const p = await disetujui(A)
    const hs = await Promise.all([coba(() => batal(A, p.messageId)), coba(() => kirim(A, p.messageId))])
    const i = await invarian(p.messageId)
    const menangBatal = hs[0].ok && hs[0].nilai.hasil === 'DIBATALKAN'
    const menangKirim = hs[1].ok && hs[1].nilai.hasil === 'FAKE_SENT'
    cek(`29. [${n}] Cancel ∥ Send (APPROVED) → tepat satu pemenang; state akhir sesuai pemenang`, i.ok && hs.every(terkendali) && menangBatal !== menangKirim && (menangBatal ? i.m.state === 'CANCELED' && i.at.length === 0 : i.m.state === 'FAKE_SENT'), `${hs.map(ringkas).join(' | ')} → ${i.m.state} ${i.g.join(',')}`)

    const f = await gagalKirim(A)
    const hf = await Promise.all([coba(() => batal(A, f.messageId)), coba(() => kirim(A, f.messageId))])
    const iF = await invarian(f.messageId)
    const batalF = hf[0].ok && hf[0].nilai.hasil === 'DIBATALKAN'
    const retryF = hf[1].ok && hf[1].nilai.hasil === 'FAKE_FAILED' && !hf[1].nilai.ulangan
    cek(`30. [${n}] Cancel ∥ retry manual (FAKE_FAILED) → tepat satu pemenang; batal menang ⇒ tetap 1 attempt`, iF.ok && hf.every(terkendali) && batalF !== retryF && (batalF ? iF.m.state === 'CANCELED' && iF.at.length === 1 : iF.m.state === 'FAKE_FAILED' && iF.at.length === 2), `${hf.map(ringkas).join(' | ')} → ${iF.m.state} at=${iF.at.length}`)

    const d = await draf(A)
    const hd = await Promise.all([coba(() => batal(A, d.messageId)), coba(() => batal(A, d.messageId, 'Pembatalan kedua bersamaan'))])
    const iD = await invarian(d.messageId)
    cek(`31. [${n}] Cancel ∥ Cancel → tepat satu DIBATALKAN, satu audit pembatalan; yang lain DITOLAK/CONFLICT`, iD.ok && hd.filter((r) => r.ok && r.nilai.hasil === 'DIBATALKAN').length === 1 && hd.every(terkendali), hd.map(ringkas).join(' | '))

    const m = await menunggu(A)
    const hm = await Promise.all([coba(() => batal(A, m.messageId)), coba(() => AP.setujuiPesan(A.ctx, { approvalRequestId: m.approvalId }))])
    const iM = await invarian(m.messageId)
    cek(`32. [${n}] Cancel ∥ Setujui (PENDING) → konsisten: CANCELED dengan approval CANCELLED / eksekusi CANCELLED, atau APPROVED (Cancel kalah)`, iM.ok && terkendali(hm[0]) && (hm[1].ok || hm[1].kode === 'CONFLICT') && (iM.m.state === 'CANCELED' ? iM.a.status === 'CANCELLED' || iM.a.executionStatus === 'CANCELLED' : iM.m.state === 'APPROVED' && iM.a.executionStatus === 'NOT_STARTED'), `${hm.map(ringkas).join(' | ')} → ${iM.m.state} a=${iM.a.status}/${iM.a.executionStatus}`)

    const r = await disetujui(A)
    const hr = await Promise.all([coba(() => batal(A, r.messageId)), coba(() => S.buatRevisiPesan(A.ctx, { candidateId: r.candidateId, recipientFixtureId: FX, language: 'EN' }))])
    const iR = await invarian(r.messageId)
    cek(`33. [${n}] Cancel ∥ revisi baru (Prepare) → revisi lama CANCELED (CANCELED_BY_USER atau REVISED); maks satu revisi aktif`, iR.ok && iR.m.state === 'CANCELED' && ['CANCELED_BY_USER', 'REVISED'].includes(iR.m.reasonCode) && terkendali(hr[0]) && ((hr[1].ok && ['REVISI_DIBUAT', 'REVISI_SAMA', 'DITOLAK'].includes(hr[1].nilai.hasil)) || (!hr[1].ok && hr[1].kode === 'CONFLICT')), `${hr.map(ringkas).join(' | ')} → ${iR.m.reasonCode}`)
  }
  {
    let takTerkendali = 0
    let pelanggaran = 0
    let menangBatal = 0
    for (let n = 0; n < 20; n++) {
      const p = await disetujui(A)
      const hs = await Promise.all([coba(() => kirim(A, p.messageId)), coba(() => batal(A, p.messageId)), coba(() => kirim(A, p.messageId))])
      if (!hs.every(terkendali)) takTerkendali++
      const i = await invarian(p.messageId)
      if (!i.ok || (i.m.state === 'CANCELED' && i.at.length > 0) || !['CANCELED', 'FAKE_SENT'].includes(i.m.state)) pelanggaran++
      if (i.m.state === 'CANCELED') menangBatal++
    }
    cek('34. stres 20× (Send ∥ Cancel ∥ Send): 0 hasil tak terkendali, 0 pelanggaran invarian, state akhir hanya CANCELED/FAKE_SENT', takTerkendali === 0 && pelanggaran === 0, `takTerkendali=${takTerkendali} pelanggaran=${pelanggaran} batalMenang=${menangBatal}/20`)
  }

  // ============================================================== audit atomik
  bagian('[7] Audit atomik — gagal tulis audit → rollback total')
  {
    const p = await disetujui(A)
    const awal = await potret(p.messageId)
    await gagalkanAudit('WA1_PESAN_DIBATALKAN_PENGGUNA')
    const r = await coba(() => batal(A, p.messageId))
    await hapusTrigger()
    cek('35. gagal tulis audit pembatalan → galat; pesan tetap APPROVED, eksekusi tetap NOT_STARTED, 0 audit approval tertinggal', r.ok === false && (await potret(p.messageId)) === awal && (await jumlahAudit('WA1_EKSEKUSI_DIBATALKAN', p.approvalId)) === 0, `${r.kode} ${awal} → ${await potret(p.messageId)}`)
    const q = await menunggu(A)
    const awalQ = await potret(q.messageId)
    await gagalkanAudit('WA1_APPROVAL_DIHENTIKAN')
    const rq = await coba(() => batal(A, q.messageId))
    await hapusTrigger()
    cek('36. gagal tulis audit penghentian approval → galat; pesan tetap PREVIEWED, approval tetap PENDING', rq.ok === false && (await potret(q.messageId)) === awalQ)
    const h = await batal(A, p.messageId)
    cek('37. setelah audit pulih → Cancel berhasil normal', h.hasil === 'DIBATALKAN' && (await invarian(p.messageId)).ok)
  }

  // ============================================================== isolasi tenant & global
  bagian('[8] Isolasi tenant, zero egress, invarian global')
  {
    const pA = await disetujui(A)
    const pB = await disetujui(B)
    const hB = await batal(B, pB.messageId)
    cek('38. Cancel di tenant B tak menyentuh pesan/approval tenant A', hB.hasil === 'DIBATALKAN' && (await pesan(pA.messageId)).state === 'APPROVED' && (await approval(pA.approvalId)).executionStatus === 'NOT_STARTED')
    cek('39. tenant A tak bisa membatalkan pesan B yang sudah dibatalkan maupun yang aktif (NOT_FOUND)', (await kode(() => batal(A, pB.messageId))) === 'NOT_FOUND' && (await kode(() => batal(B, pA.messageId))) === 'NOT_FOUND')
  }
  cek('40. NOL panggilan jaringan selama seluruh uji (fetch/http/https/net/net.Socket/tls/dns/WebSocket)', egress.length === 0, egress.join(','))
  const tenantUji = (await adm.tenant.findMany({ where: { companyName: { startsWith: TAG } }, select: { id: true } })).map((t) => t.id)
  const semuaM = await adm.communicationMessage.findMany({ where: { tenantId: { in: tenantUji } } })
  const dibatalkan = semuaM.filter((m) => m.reasonCode === 'CANCELED_BY_USER')
  const atBatal = await adm.communicationAttempt.findMany({ where: { messageId: { in: dibatalkan.map((m) => m.id) } } })
  cek('41. TIDAK PERNAH FAKE_SENT sesudah CANCELED: semua pesan CANCELED_BY_USER tanpa successKey/receipt dan tanpa attempt FAKE_SENT', dibatalkan.length > 0 && dibatalkan.every((m) => m.state === 'CANCELED' && m.successKey === null && m.fakeReceipt === null && m.activeKey === null) && atBatal.every((x) => x.state !== 'FAKE_SENT'), `${dibatalkan.length} pesan dibatalkan`)
  const auditBatal = await auditPeristiwa('WA1_PESAN_DIBATALKAN_PENGGUNA')
  cek('42. tepat satu audit pembatalan per pesan dibatalkan, di tenant pesan itu, dengan alasan', dibatalkan.every((m) => auditBatal.filter((x) => x.recordId === m.id).length === 1) && auditBatal.every((x) => semuaM.find((m) => m.id === x.recordId)?.tenantId === x.tenantId && typeof x.newValue.catatan === 'string' && x.newValue.catatan.length >= 3))
  const semuaAp = await adm.tahApprovalRequest.findMany({ where: { tenantId: { in: tenantUji } } })
  cek('43. invarian status TAH (beku) berlaku di semua approval uji; tak ada state antara ter-commit', semuaAp.every((a) => TAH.invarianStatus(a.status, a.executionStatus) && a.executionStatus !== 'RUNNING') && semuaM.every((m) => m.state !== 'QUEUED_FAKE'))
  const sukses = new Map()
  for (const m of semuaM.filter((x) => x.successKey)) sukses.set(m.successKey, (sukses.get(m.successKey) ?? 0) + 1)
  const aktif = new Map()
  for (const m of semuaM.filter((x) => x.activeKey)) aktif.set(m.activeKey, (aktif.get(m.activeKey) ?? 0) + 1)
  cek('44. maksimal satu FAKE_SENT dan satu revisi aktif per pesan logis (seluruh dunia uji)', [...sukses.values()].every((n) => n === 1) && [...aktif.values()].every((n) => n === 1))
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
