// Uji integrasi DB Step 2G — layanan baca & Communication History WA-1 (TANPA API, UI, jaringan).
//
// Jalankan (PostgreSQL loopback sekali pakai yang SUDAH `prisma migrate deploy`):
//   COMM_READ_DB_URL=postgresql://postgres@127.0.0.1:55432/maritime_suite \
//     node prisma/check-comm-read-db.mjs
// Tanpa COMM_READ_DB_URL → DILEWATI (kode 3).
//
// DITOLAK (DB tak disentuh) bila: host bukan loopback, parameter host, NODE_ENV=production,
// DATABASE_URL/DIRECT_URL menunjuk DB lain. Semua baris bertanda `WA1S2G-`; dihapus di akhir.
// Tiga tenant: A & B di allowlist Automation (keduanya berisi data), C di luar allowlist.

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
const URL_DB = process.env.COMM_READ_DB_URL
if (!URL_DB) {
  console.log('DILEWATI — COMM_READ_DB_URL tidak diset (butuh PostgreSQL loopback sekali pakai).')
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
const R = jiti('../src/services/communication/communication-read.service.ts')
const P = jiti('../src/services/communication/comm-policy.ts')
const { PrismaClient } = await import('@prisma/client')
const adm = new PrismaClient({ datasources: { db: { url: URL_DB } } })

// ---------------------------------------------- titik jeda deterministik (khusus uji)
// Sama dengan uji 2E/2F: forTenant dibungkus supaya SATU kueri di dalam transaksi service bisa
// ditahan sampai uji melepasnya. Kode produksi tidak tahu apa-apa soal ini.
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

const TAG = 'WA1S2G-'
let seq = 0
const uid = () => `${TAG}${++seq}`
let rkSeq = 0
const rk = () => `rk-${Date.now().toString(36)}-${++rkSeq}`
const WAKTU = '2026-10-05T02:30:00.000Z'
const FX = 'WA1_TEST_FIXTURE_SUCCESS'
const FX_ULANG = 'WA1_TEST_FIXTURE_RETRY'
const ALASAN = 'Klien minta tunda pemberitahuan (uji 2G)'

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

async function bersihkan() {
  const t = await adm.tenant.findMany({ where: { companyName: { startsWith: TAG } }, select: { id: true } })
  await adm.tahApprovalRequest.deleteMany({ where: { tenantId: { in: t.map((x) => x.id) } } })
  await adm.auditLog.deleteMany({ where: { tenantId: { in: t.map((x) => x.id) } } })
  await adm.tenant.deleteMany({ where: { companyName: { startsWith: TAG } } })
}

// ------------------------------------------------------------------ dunia uji
async function dunia(nama) {
  const t = await adm.tenant.create({ data: { companyName: `${TAG}${nama}` } })
  const kapal = await adm.vessel.create({ data: { tenantId: t.id, name: `MT Contoh ${nama}` } })
  const port = await adm.port.create({ data: { tenantId: t.id, name: `Pelabuhan Uji ${nama}`, timezone: 'Asia/Makassar' } })
  return { t, kapal, port, ctx: { tenantId: t.id, userId: `u-${nama}`, role: 'ADMIN' } }
}
const voyage = (w) =>
  adm.voyage.create({ data: { tenantId: w.t.id, vesselId: w.kapal.id, portId: w.port.id, voyageNumber: uid(), eta: new Date('2026-10-12T00:00:00Z'), etd: new Date('2026-10-14T00:00:00Z') } })
const sinyal = (w, v, ubah = {}) =>
  adm.monitoringSignal.create({ data: { tenantId: w.t.id, voyageId: v.id, kind: 'ETA_CHANGED', severity: 'INFO', dedupeKey: uid(), sourceType: 'AUDIT_LOG', explanation: 'uji', recommendation: 'uji', ...ubah } })

/** EOSP → candidate → revisi DRAFT (bahasa & fixture dapat dipilih). */
async function draf(w, { fx = FX, bahasa = 'ID' } = {}) {
  const v = await voyage(w)
  const sumber = await adm.voyageEvent.create({ data: { tenantId: w.t.id, voyageId: v.id, eventCode: 'EOSP', occurredAt: new Date(WAKTU), recordedByUserId: 'u-uji' } })
  const s = await sinyal(w, v, { kind: 'OPERATIONAL_EVENT_RECORDED', sourceType: 'VOYAGE_EVENT', sourceRef: sumber.id, after: { eventCode: 'EOSP', occurredAt: WAKTU } })
  const h = await S.siapkanCandidate(w.ctx, { signalId: s.id })
  const r = await S.buatRevisiPesan(w.ctx, { candidateId: h.candidateId, recipientFixtureId: fx, language: bahasa })
  if (h.hasil !== 'SIAP' || r.hasil !== 'REVISI_DIBUAT') throw new Error(`fixture draf gagal: ${h.hasil}/${r.hasil}`)
  return { v, sumber, s, candidateId: h.candidateId, messageId: r.messageId, fp: r.snapshotFingerprint }
}
async function disetujui(w, opsi = {}) {
  const p = await draf(w, opsi)
  await S.tandaiDipratinjau(w.ctx, { messageId: p.messageId, snapshotFingerprint: p.fp })
  const a = await AP.mintaApproval(w.ctx, { messageId: p.messageId })
  const d = await AP.setujuiPesan(w.ctx, { approvalRequestId: a.approvalRequestId })
  if (a.hasil !== 'APPROVAL_DIMINTA' || d.hasil !== 'DISETUJUI') throw new Error(`fixture approval gagal: ${a.hasil}/${d.hasil}`)
  return { ...p, approvalId: a.approvalRequestId }
}
const kirim = (w, messageId) => KS.kirimFake(w.ctx, { messageId, requestKey: rk() })

/** Potret baris komunikasi + audit satu tenant — untuk membuktikan pembacaan tak menulis apa pun. */
async function potretTenant(tenantId) {
  const [c, m, a, at, au] = await Promise.all([
    adm.communicationCandidate.findMany({ where: { tenantId }, select: { id: true, state: true, version: true, updatedAt: true }, orderBy: { id: 'asc' } }),
    adm.communicationMessage.findMany({ where: { tenantId }, select: { id: true, state: true, version: true, updatedAt: true, activeKey: true }, orderBy: { id: 'asc' } }),
    adm.tahApprovalRequest.findMany({ where: { tenantId }, select: { id: true, status: true, executionStatus: true, version: true, updatedAt: true }, orderBy: { id: 'asc' } }),
    adm.communicationAttempt.findMany({ where: { tenantId }, select: { id: true, state: true, updatedAt: true }, orderBy: { id: 'asc' } }),
    adm.auditLog.count({ where: { tenantId } }),
  ])
  return JSON.stringify({ c, m, a, at, au })
}

try {
  await bersihkan()
  const A = await dunia('A')
  const B = await dunia('B')
  const C = await dunia('C') // TIDAK di allowlist Automation
  process.env.AUTOMATION_TENANT_IDS = `${A.t.id},${B.t.id}`

  // Data di KEDUA tenant allowlist — isolasi diuji terhadap tenant yang benar-benar berisi.
  const aKirim = await disetujui(A)
  const hKirim = await kirim(A, aKirim.messageId)
  const aUlang = await disetujui(A, { fx: FX_ULANG })
  const hUlang1 = await kirim(A, aUlang.messageId)
  const hUlang2 = await kirim(A, aUlang.messageId)
  const aBatal = await disetujui(A)
  const hBatal = await CS.batalkanPesan({ tenantId: A.t.id, userId: 'u-manajer-A', role: 'MANAJER_OPERASI' }, { messageId: aBatal.messageId, cancelNote: `  ${ALASAN}  ` })
  const aRevisi = await draf(A)
  const rv2 = await S.buatRevisiPesan(A.ctx, { candidateId: aRevisi.candidateId, recipientFixtureId: FX, language: 'EN' })
  const bKirim = await disetujui(B)
  await kirim(B, bKirim.messageId)
  const bDraf = await draf(B)
  if (hKirim.hasil !== 'FAKE_SENT' || hUlang1.hasil !== 'FAKE_FAILED' || hUlang2.hasil !== 'FAKE_SENT' || hBatal.hasil !== 'DIBATALKAN' || rv2.hasil !== 'REVISI_DIBUAT') {
    throw new Error('fixture dunia uji tidak sesuai harapan')
  }

  // ============================================================== gerbang
  bagian('[1] Gerbang, otorisasi, validasi')
  {
    const fungsi = {
      daftar: (ctx) => R.daftarCandidate(ctx, {}),
      detailCandidate: (ctx) => R.detailCandidate(ctx, { candidateId: aKirim.candidateId }),
      detailPesan: (ctx) => R.detailPesan(ctx, { messageId: aKirim.messageId }),
      riwayat: (ctx) => R.riwayatKomunikasi(ctx, { candidateId: aKirim.candidateId }),
    }
    const semua = async (ctx) => Promise.all(Object.values(fungsi).map((f) => kode(() => f(ctx))))
    cek('1. tenant di luar allowlist Automation → NOT_FOUND di keempat fungsi baca', (await semua(C.ctx)).every((x) => x === 'NOT_FOUND'))
    cek('2. peran OPERATOR / FINANCE / DIREKTUR → FORBIDDEN', (await Promise.all(['OPERATOR', 'FINANCE', 'DIREKTUR'].map((role) => semua({ ...A.ctx, role })))).flat().every((x) => x === 'FORBIDDEN'))
    cek('3. konteks sistem → FORBIDDEN', (await semua({ ...A.ctx, system: true })).every((x) => x === 'FORBIDDEN'))
    process.env.WA1_INTERNAL_FAKE_TEST_ENABLED = 'false'
    const mati = await coba(() => fungsi.riwayat(A.ctx))
    process.env.WA1_INTERNAL_FAKE_TEST_ENABLED = 'true'
    cek('4. flag WA mati → FORBIDDEN (FEATURE_DISABLED)', mati.ok === false && mati.kode === 'FORBIDDEN' && mati.pesan.includes('FEATURE_DISABLED'))
    process.env.NODE_ENV = 'production'
    const prod = await coba(() => fungsi.daftar(A.ctx))
    process.env.NODE_ENV = 'test'
    cek('5. NODE_ENV=production → FORBIDDEN ENV_NOT_ALLOWED', prod.ok === false && prod.kode === 'FORBIDDEN' && prod.pesan.includes('ENV_NOT_ALLOWED'))
    const salah = await Promise.all([
      kode(() => R.detailCandidate(A.ctx, { candidateId: '' })),
      kode(() => R.detailPesan(A.ctx, { messageId: 'x'.repeat(65) })),
      kode(() => R.riwayatKomunikasi(A.ctx, { candidateId: 7 })),
      kode(() => R.daftarCandidate(A.ctx, { take: 0 })),
      kode(() => R.daftarCandidate(A.ctx, { take: 101 })),
      kode(() => R.daftarCandidate(A.ctx, { take: 2.5 })),
      kode(() => R.daftarCandidate(A.ctx, { state: 'CANCELED' })),
      kode(() => R.daftarCandidate(A.ctx, { voyageId: '' })),
    ])
    cek('6. id / take / state / voyageId tak sah → VALIDATION', salah.every((x) => x === 'VALIDATION'), salah.join(','))
    const mo = { tenantId: A.t.id, userId: 'u-manajer-lain', role: 'MANAJER_OPERASI' }
    cek('7. MANAJER_OPERASI (bukan pembuat) boleh membaca', (await semua(mo)).every((x) => x === null))
  }

  // ============================================================== isolasi tenant
  bagian('[2] Isolasi tenant — dua tenant berisi data (A & B)')
  {
    const silang = await Promise.all([
      kode(() => R.detailCandidate(A.ctx, { candidateId: bKirim.candidateId })),
      kode(() => R.detailPesan(A.ctx, { messageId: bKirim.messageId })),
      kode(() => R.riwayatKomunikasi(A.ctx, { candidateId: bKirim.candidateId })),
      kode(() => R.detailCandidate(B.ctx, { candidateId: aKirim.candidateId })),
      kode(() => R.detailPesan(B.ctx, { messageId: aBatal.messageId })),
      kode(() => R.riwayatKomunikasi(B.ctx, { candidateId: aBatal.candidateId })),
      kode(() => R.daftarCandidate(A.ctx, { cursor: bDraf.candidateId })),
    ])
    cek('8. id milik tenant lain (candidate / pesan / riwayat / kursor), dua arah → NOT_FOUND', silang.every((x) => x === 'NOT_FOUND'), silang.join(','))
    cek('9. id yang tidak ada → NOT_FOUND (tak bisa dibedakan dari milik tenant lain)', (await kode(() => R.detailPesan(A.ctx, { messageId: 'cmtidakadasamasekali00000' }))) === 'NOT_FOUND')
    const dA = await R.daftarCandidate(A.ctx, { take: 100 })
    const dB = await R.daftarCandidate(B.ctx, { take: 100 })
    const idA = new Set((await adm.communicationCandidate.findMany({ where: { tenantId: A.t.id }, select: { id: true } })).map((x) => x.id))
    const idB = new Set((await adm.communicationCandidate.findMany({ where: { tenantId: B.t.id }, select: { id: true } })).map((x) => x.id))
    cek('10. daftar A = PERSIS candidate A; daftar B = PERSIS candidate B; tanpa irisan', dA.items.length === idA.size && dA.items.every((c) => idA.has(c.id)) && dB.items.length === idB.size && dB.items.every((c) => idB.has(c.id)) && idB.size >= 2, `A=${dA.items.length}/${idA.size} B=${dB.items.length}/${idB.size}`)
    const filterSilang = await R.daftarCandidate(A.ctx, { voyageId: bKirim.v.id })
    cek('11. filter voyageId milik B dari A → kosong (tanpa bocor)', filterSilang.items.length === 0 && filterSilang.nextCursor === null)
    const rA = await R.riwayatKomunikasi(A.ctx, { candidateId: aKirim.candidateId })
    const tenantJejak = await adm.auditLog.findMany({ where: { id: { in: rA.jejakAudit.map((j) => j.id) } }, select: { tenantId: true } })
    cek('12. setiap entri jejak audit riwayat A milik tenant A', tenantJejak.length === rA.jejakAudit.length && tenantJejak.every((x) => x.tenantId === A.t.id))
  }

  // ============================================================== samaran
  bagian('[3] Samaran pengenal di daftar; detail utuh untuk pengguna berwenang')
  {
    cek('13. samarkanPengenal: panjang tetap, tepi dipertahankan; pendek/non-string → •••', P.samarkanPengenal('TEST_FIXTURE_WA_001') === 'TEST•••01' && P.samarkanPengenal('+6281234567890') === '+628•••90' && P.samarkanPengenal('1234567') === '•••' && P.samarkanPengenal(null) === '•••' && P.samarkanPengenal(42) === '•••')
    const d = await R.daftarCandidate(A.ctx, { take: 100 })
    const teks = JSON.stringify(d)
    cek('14. daftar: pengenal penerima disamarkan; pengenal utuh & logicalMessageKey TIDAK muncul di mana pun', d.items.filter((c) => c.pesanTerakhir).every((c) => c.pesanTerakhir.penerima === 'TEST•••01' || c.pesanTerakhir.penerima === 'TEST•••03') && !/TEST_FIXTURE_WA_\d{3}/.test(teks) && !/WA1M|logicalMessageKey|activeKey|successKey/.test(teks))
    cek('15. daftar tak memuat body, fingerprint, maupun recipientFixtureId', !/"body"|Fingerprint|recipientFixtureId/.test(teks))
    const dp = await R.detailPesan(A.ctx, { messageId: aKirim.messageId })
    cek('16. detail pesan: pengenal utuh untuk pengguna berwenang + label simulasi eksplisit', dp.recipientIdentifier === 'TEST_FIXTURE_WA_001' && dp.recipientFixtureId === FX && dp.simulasi.provider === 'FAKE' && dp.simulasi.simulation === true && dp.simulasi.externalDelivery === false)
    const dpTeks = JSON.stringify(dp)
    cek('17. detail tak membocorkan isi usulan approval, kunci idempotensi, maupun ipAddress', !/"proposal"|idempotencyKey|ipAddress|requestKey/.test(dpTeks))
  }

  // ============================================================== rantai History
  bagian('[4] Communication History — rantai lengkap (AC-17)')
  {
    const r = await R.riwayatKomunikasi(A.ctx, { candidateId: aKirim.candidateId })
    const m = r.pesan[0]
    cek('18. signal → candidate: sinyal asal ada & cocok dengan signalIds', r.candidate.sinyal.length === 1 && r.candidate.sinyal[0].id === aKirim.s.id && r.candidate.signalIds.includes(aKirim.s.id) && r.candidate.sourceRef === aKirim.sumber.id && r.candidate.voyageNumber === aKirim.v.voyageNumber)
    cek('19. candidate → snapshot: satu revisi FAKE_SENT dengan body & sidik snapshot yang disetujui', r.pesan.length === 1 && m.state === 'FAKE_SENT' && m.snapshotFingerprint === aKirim.fp && m.body.includes('[SIMULASI INTERNAL — TIDAK DIKIRIM]') && m.fakeReceipt === hKirim.receipt)
    cek('20. snapshot → approval: APPROVED / SUCCEEDED, approval milik pesan ini', m.approval?.id === aKirim.approvalId && m.approval.status === 'APPROVED' && m.approval.executionStatus === 'SUCCEEDED' && m.approval.executionAttempts === 1)
    cek('21. approval → attempt → hasil: satu attempt FAKE_SENT, FAKE/simulation/tanpa egress, receipt sama', m.attempts.length === 1 && m.attempts[0].state === 'FAKE_SENT' && m.attempts[0].provider === 'FAKE' && m.attempts[0].simulation === true && m.attempts[0].externalDelivery === false && m.attempts[0].receipt === hKirim.receipt)
    const urut = r.jejakAudit.map((j) => j.peristiwa)
    const harap = ['WA1_CANDIDATE_DIBUAT', 'WA1_REVISI_DIBUAT', 'WA1_DIPRATINJAU', 'WA1_PESAN_DISETUJUI', 'WA1_SEND_DIKLAIM', 'WA1_ATTEMPT_DIKLAIM', 'WA1_PESAN_FAKE_SENT', 'WA1_ATTEMPT_FAKE_SENT', 'WA1_EKSEKUSI_SELESAI']
    cek('22. jejak audit mencakup seluruh transisi rantai (candidate, revisi, pratinjau, approval, klaim, attempt, hasil)', harap.every((p) => urut.includes(p)), urut.join(' → '))
    const waktu = r.jejakAudit.map((j) => j.waktu)
    cek('23. jejak audit urut waktu naik; mencakup keempat tabel rantai', waktu.every((t, i) => i === 0 || t >= waktu[i - 1]) && ['CommunicationCandidate', 'CommunicationMessage', 'TahApprovalRequest', 'CommunicationAttempt'].every((t) => r.jejakAudit.some((j) => j.tabel === t)))
    const jumlahAuditRantai = await adm.auditLog.count({ where: { tenantId: A.t.id, OR: [{ recordId: aKirim.candidateId }, { recordId: aKirim.messageId }, { recordId: aKirim.approvalId }, { recordId: { in: m.attempts.map((x) => x.id) } }] } })
    cek('24. jejak audit LENGKAP: jumlahnya sama dengan seluruh baris audit milik baris-baris rantai', r.jejakAudit.length === jumlahAuditRantai, `${r.jejakAudit.length}/${jumlahAuditRantai}`)

    const ru = await R.riwayatKomunikasi(A.ctx, { candidateId: aUlang.candidateId })
    cek('25. retry manual: attempt #1 FAKE_FAILED lalu #2 FAKE_SENT, urut; approval executionAttempts 2', ru.pesan[0].attempts.map((x) => `${x.attemptNo}:${x.state}`).join() === '1:FAKE_FAILED,2:FAKE_SENT' && ru.pesan[0].approval.executionAttempts === 2 && ru.jejakAudit.some((j) => j.peristiwa === 'WA1_SEND_RETRY_MANUAL'))

    const rr = await R.riwayatKomunikasi(A.ctx, { candidateId: aRevisi.candidateId })
    cek('26. revisi: #1 CANCELED/REVISED dan #2 DRAFT aktif tampil berurutan; keduanya di jejak', rr.pesan.map((x) => `${x.revision}:${x.state}:${x.reasonCode}`).join() === '1:CANCELED:REVISED,2:DRAFT:null' && rr.candidate.revisi.length === 2 && rr.jejakAudit.some((j) => j.peristiwa === 'WA1_REVISI_DIGANTIKAN'))

    const v2 = await voyage(A)
    const aud = await adm.auditLog.create({ data: { tenantId: A.t.id, tableName: 'Voyage', recordId: v2.id, action: 'UPDATE', oldValue: { peristiwa: 'UBAH_TANGGAL', eta: '2026-10-10', etd: '2026-10-13' }, newValue: { peristiwa: 'UBAH_TANGGAL', medan: ['eta', 'etd'], eta: '2026-10-12', etd: '2026-10-14' } } })
    const s1 = await sinyal(A, v2, { sourceRef: aud.id, after: { eta: '2026-10-12' } })
    const s2 = await sinyal(A, v2, { sourceRef: aud.id, after: { etd: '2026-10-14' } })
    const hj = await S.siapkanCandidate(A.ctx, { signalId: s1.id })
    const dj = await R.detailCandidate(A.ctx, { candidateId: hj.candidateId })
    cek('27. jadwal ETA+ETD (dua sinyal, satu sourceRef) → satu candidate dengan dua sinyal di History', dj.sinyal.length === 2 && [s1.id, s2.id].every((id) => dj.sinyal.some((s) => s.id === id)) && dj.revisi.length === 0)
  }

  // ============================================================== alasan Cancel
  bagian('[5] Alasan Cancel (Step 2F) terbaca dari AuditLog')
  {
    const dp = await R.detailPesan(A.ctx, { messageId: aBatal.messageId })
    cek('28. detail pesan dibatalkan: pembatalan.catatan = alasan (ter-trim), olehUserId = pembatal, stateSebelum APPROVED', dp.state === 'CANCELED' && dp.reasonCode === 'CANCELED_BY_USER' && dp.pembatalan?.catatan === ALASAN && dp.pembatalan.olehUserId === 'u-manajer-A' && dp.pembatalan.stateSebelum === 'APPROVED')
    cek('29. approval pesan dibatalkan: keputusan APPROVED tetap, eksekusi CANCELLED (CANCELED_BY_USER), 0 attempt', dp.approval?.status === 'APPROVED' && dp.approval.executionStatus === 'CANCELLED' && dp.approval.executionErrorCode === 'CANCELED_BY_USER' && dp.attempts.length === 0)
    const r = await R.riwayatKomunikasi(A.ctx, { candidateId: aBatal.candidateId })
    const j = r.jejakAudit.find((x) => x.peristiwa === 'WA1_PESAN_DIBATALKAN_PENGGUNA')
    cek('30. riwayat memuat entri pembatalan dengan alasan & actor; eksekusi dibatalkan juga terjejak', j?.newValue?.catatan === ALASAN && j.userId === 'u-manajer-A' && r.jejakAudit.some((x) => x.peristiwa === 'WA1_EKSEKUSI_DIBATALKAN'))
    const dRev = await R.detailPesan(A.ctx, { messageId: aRevisi.messageId })
    const dOk = await R.detailPesan(A.ctx, { messageId: aKirim.messageId })
    cek('31. pembatalan hanya diisi untuk CANCELED_BY_USER (bukan REVISED / FAKE_SENT)', dRev.pembatalan === null && dOk.pembatalan === null)
  }

  // ============================================================== paginasi & filter
  bagian('[6] Daftar: urutan, paginasi keyset, filter')
  {
    for (let i = 0; i < 3; i++) await draf(B)
    const semua = await R.daftarCandidate(B.ctx, { take: 100 })
    const halaman = []
    let cursor = null
    for (let i = 0; i < 20; i++) {
      const h = await R.daftarCandidate(B.ctx, { take: 2, cursor })
      halaman.push(...h.items.map((c) => c.id))
      cursor = h.nextCursor
      if (!cursor) break
    }
    cek('32. paginasi take=2 menelusuri SEMUA candidate B tepat sekali, urutan sama dengan satu halaman penuh', halaman.join() === semua.items.map((c) => c.id).join() && new Set(halaman).size === halaman.length && halaman.length === semua.items.length, `${halaman.length} item`)
    const t = semua.items.map((c) => c.createdAt)
    cek('33. urut terbaru dulu', t.every((x, i) => i === 0 || x <= t[i - 1]))
    const v = await R.daftarCandidate(B.ctx, { voyageId: bKirim.v.id })
    cek('34. filter voyageId → hanya candidate voyage itu', v.items.length === 1 && v.items[0].id === bKirim.candidateId && v.items[0].pesanTerakhir?.state === 'FAKE_SENT')
    await adm.voyageEvent.updateMany({ where: { id: bDraf.sumber.id }, data: { deletedAt: new Date() } })
    await S.buatRevisiPesan(B.ctx, { candidateId: bDraf.candidateId, recipientFixtureId: FX, language: 'EN' })
    const blok = await R.daftarCandidate(B.ctx, { state: 'BLOCKED' })
    cek('35. filter state BLOCKED → hanya candidate yang diblokir (sumber dihapus)', blok.items.length === 1 && blok.items[0].id === bDraf.candidateId && blok.items[0].blockReason === 'SOURCE_DELETED')
  }

  // ============================================================== read-only
  bagian('[7] Read-only — membaca tak mengubah status maupun audit')
  {
    const awalA = await potretTenant(A.t.id)
    const awalB = await potretTenant(B.t.id)
    for (const w of [A, B]) {
      const d = await R.daftarCandidate(w.ctx, { take: 100 })
      for (const c of d.items) {
        const r = await R.riwayatKomunikasi(w.ctx, { candidateId: c.id })
        await R.detailCandidate(w.ctx, { candidateId: c.id })
        for (const m of r.pesan) await R.detailPesan(w.ctx, { messageId: m.id })
      }
    }
    await Promise.all([R.daftarCandidate(C.ctx).catch(() => null), R.riwayatKomunikasi(A.ctx, { candidateId: bKirim.candidateId }).catch(() => null)])
    cek('36. setelah membaca SEMUA daftar/detail/riwayat kedua tenant (+ pembacaan ditolak): 0 perubahan baris, versi, updatedAt, dan 0 audit baru', (await potretTenant(A.t.id)) === awalA && (await potretTenant(B.t.id)) === awalB)
  }

  // ============================================================== konsistensi bersamaan
  bagian('[8] Konsistensi baca bersamaan dengan Send (REPEATABLE READ)')
  {
    let tidakKonsisten = 0
    for (let n = 0; n < 10; n++) {
      const p = await disetujui(A)
      const [, ...hasil] = await Promise.all([kirim(A, p.messageId), ...Array.from({ length: 4 }, () => R.riwayatKomunikasi(A.ctx, { candidateId: p.candidateId }))])
      for (const r of hasil) {
        const m = r.pesan[0]
        const ok =
          (m.state === 'APPROVED' && m.attempts.length === 0 && m.approval.executionStatus === 'NOT_STARTED') ||
          (m.state === 'FAKE_SENT' && m.attempts.length === 1 && m.attempts[0].state === 'FAKE_SENT' && m.approval.executionStatus === 'SUCCEEDED')
        if (!ok) tidakKonsisten++
      }
    }
    cek('37. 10× (Send ∥ 4 pembacaan riwayat): setiap riwayat konsisten — APPROVED+0 attempt ATAU FAKE_SENT+1 attempt; tak pernah state antara', tidakKonsisten === 0, `tidakKonsisten=${tidakKonsisten}`)

    // Deterministik: riwayat sudah membaca pesan (APPROVED) lalu DITAHAN tepat sebelum membaca attempt;
    // Send dijalankan sampai commit di celah itu; riwayat dilepas. Dengan REPEATABLE READ seluruh
    // rantai berasal dari satu snapshot (APPROVED + 0 attempt + NOT_STARTED); tanpa itu, attempt
    // FAKE_SENT akan terbaca bersama pesan APPROVED (rantai campuran).
    for (let n = 1; n <= 3; n++) {
      const p = await disetujui(A)
      const jeda = pasangJeda('communicationAttempt', 'findMany', (a) => Array.isArray(a?.where?.messageId?.in) && a.where.messageId.in.includes(p.messageId))
      const baca = R.riwayatKomunikasi(A.ctx, { candidateId: p.candidateId })
      await jeda.sampai
      const h = await kirim(A, p.messageId)
      jeda.lepas()
      const r = await baca
      const m = r.pesan[0]
      cek(`37b. [${n}] Send commit DI TENGAH pembacaan riwayat → riwayat tetap satu snapshot (APPROVED, 0 attempt, NOT_STARTED); bacaan berikutnya FAKE_SENT`, h.hasil === 'FAKE_SENT' && m.state === 'APPROVED' && m.attempts.length === 0 && m.approval.executionStatus === 'NOT_STARTED' && (await R.detailPesan(A.ctx, { messageId: p.messageId })).state === 'FAKE_SENT', `${m.state}/${m.attempts.length}/${m.approval.executionStatus}`)
    }
    cek('37c. semua titik jeda terpakai', titikJeda.length === 0)
  }

  bagian('[9] Zero egress')
  cek('38. NOL panggilan jaringan selama seluruh uji (fetch/http/https/net/net.Socket/tls/dns/WebSocket)', egress.length === 0, egress.join(','))
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
