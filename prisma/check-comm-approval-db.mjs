// Uji integrasi DB Step 2D — approval WA-1 (TANPA Send, Attempt, provider, jaringan).
//
// Jalankan (PostgreSQL loopback sekali pakai yang SUDAH `prisma migrate deploy`, termasuk Q8):
//   COMM_APPROVAL_DB_URL=postgresql://postgres@127.0.0.1:55432/maritime_suite \
//     node prisma/check-comm-approval-db.mjs
// Tanpa COMM_APPROVAL_DB_URL → DILEWATI (kode 3).
//
// DITOLAK (DB tak disentuh) bila: host bukan loopback, parameter host, NODE_ENV=production,
// DATABASE_URL/DIRECT_URL menunjuk DB lain. Semua baris bertanda `WA1S2D-`; dihapus di akhir.
// Setiap balapan diulang beberapa kali dengan fixture baru; hasil akhir diperiksa terhadap
// invarian yang sama (pesan ⇔ approval ⇔ candidate) — bukan terhadap satu urutan kebetulan.

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
const URL_DB = process.env.COMM_APPROVAL_DB_URL
if (!URL_DB) {
  console.log('DILEWATI — COMM_APPROVAL_DB_URL tidak diset (butuh PostgreSQL loopback sekali pakai).')
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
tls.connect = catat('tls.connect')
dns.lookup = catat('dns.lookup')

const require = createRequire(import.meta.url)
const jiti = require('jiti')(fileURLToPath(import.meta.url), { alias: { '@': join(AKAR, 'src') }, interopDefault: true })
const S = jiti('../src/services/communication/communication.service.ts')
const AP = jiti('../src/services/communication/communication-approval.service.ts')
const TAH = jiti('../src/services/tah/tah-policy.ts')
const { prisma: prismaApp } = jiti('../src/lib/prisma.ts')
const { PrismaClient } = await import('@prisma/client')
const adm = new PrismaClient({ datasources: { db: { url: URL_DB } } })

const TAG = 'WA1S2D-'
let seq = 0
const uid = () => `${TAG}${++seq}`
const WAKTU = '2026-10-05T02:30:00.000Z'
const FX = 'WA1_TEST_FIXTURE_SUCCESS'
const ULANG = 5

const kode = async (fn) => {
  try {
    await fn()
    return null
  } catch (e) {
    return e?.code ?? e?.message ?? 'ERR'
  }
}

async function hapusTrigger() {
  await adm.$executeRawUnsafe('DROP TRIGGER IF EXISTS wa1s2d_gagal_audit ON "AuditLog"')
  await adm.$executeRawUnsafe('DROP FUNCTION IF EXISTS wa1s2d_gagal_audit()')
}
async function bersihkan() {
  await hapusTrigger()
  const t = await adm.tenant.findMany({ where: { companyName: { startsWith: TAG } }, select: { id: true } })
  await adm.tahApprovalRequest.deleteMany({ where: { tenantId: { in: t.map((x) => x.id) } } })
  await adm.tenant.deleteMany({ where: { companyName: { startsWith: TAG } } })
}
async function gagalkanAudit(peristiwa) {
  await hapusTrigger()
  await adm.$executeRawUnsafe(`CREATE FUNCTION wa1s2d_gagal_audit() RETURNS trigger AS $$ BEGIN IF NEW."newValue"->>'peristiwa' = '${peristiwa}' THEN RAISE EXCEPTION 'AUDIT_GAGAL_SENGAJA'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`)
  await adm.$executeRawUnsafe('CREATE TRIGGER wa1s2d_gagal_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION wa1s2d_gagal_audit()')
}

// ------------------------------------------------------------------ dunia uji
async function dunia(nama) {
  const t = await adm.tenant.create({ data: { companyName: `${TAG}${nama}` } })
  const kapal = await adm.vessel.create({ data: { tenantId: t.id, name: 'MT Contoh Satu' } })
  const port = await adm.port.create({ data: { tenantId: t.id, name: 'Pelabuhan Uji', timezone: 'Asia/Makassar' } })
  return {
    t,
    kapal,
    port,
    ctx: { tenantId: t.id, userId: `u-${nama}`, role: 'ADMIN' },
    ctx2: { tenantId: t.id, userId: `u-${nama}-2`, role: 'MANAJER_OPERASI' },
  }
}
const voyage = (w, ubah = {}) =>
  adm.voyage.create({ data: { tenantId: w.t.id, vesselId: w.kapal.id, portId: w.port.id, voyageNumber: uid(), eta: new Date('2026-10-12T00:00:00Z'), etd: new Date('2026-10-14T00:00:00Z'), ...ubah } })
const sinyal = (w, v, ubah = {}) =>
  adm.monitoringSignal.create({ data: { tenantId: w.t.id, voyageId: v.id, kind: 'ETA_CHANGED', severity: 'INFO', dedupeKey: uid(), sourceType: 'AUDIT_LOG', explanation: 'uji', recommendation: 'uji', ...ubah } })

/** Sumber milestone (EOSP) atau jadwal (ETA) → candidate → revisi → PREVIEWED. */
async function pratinjau(w, { jenis = 'EOSP', bahasa = 'ID' } = {}) {
  const v = await voyage(w)
  let sumber
  let s
  if (jenis === 'JADWAL') {
    sumber = await adm.auditLog.create({
      data: { tenantId: w.t.id, tableName: 'Voyage', recordId: v.id, action: 'UPDATE', oldValue: { peristiwa: 'UBAH_TANGGAL', eta: '2026-10-10' }, newValue: { peristiwa: 'UBAH_TANGGAL', medan: ['eta'], eta: '2026-10-12' } },
    })
    s = await sinyal(w, v, { sourceRef: sumber.id, after: { eta: '2026-10-12' } })
  } else {
    sumber = await adm.voyageEvent.create({ data: { tenantId: w.t.id, voyageId: v.id, eventCode: jenis, occurredAt: new Date(WAKTU), recordedByUserId: 'u-uji' } })
    s = await sinyal(w, v, { kind: 'OPERATIONAL_EVENT_RECORDED', sourceType: 'VOYAGE_EVENT', sourceRef: sumber.id, after: { eventCode: jenis, occurredAt: WAKTU } })
  }
  const h = await S.siapkanCandidate(w.ctx, { signalId: s.id })
  const r = await S.buatRevisiPesan(w.ctx, { candidateId: h.candidateId, recipientFixtureId: FX, language: bahasa })
  const p = await S.tandaiDipratinjau(w.ctx, { messageId: r.messageId, snapshotFingerprint: r.snapshotFingerprint })
  if (h.hasil !== 'SIAP' || r.hasil !== 'REVISI_DIBUAT' || p.hasil !== 'DIPRATINJAU') throw new Error(`fixture pratinjau gagal: ${h.hasil}/${r.hasil}/${p.hasil}`)
  return { v, sumber, s, candidateId: h.candidateId, messageId: r.messageId, fp: r.snapshotFingerprint }
}
const pesan = (id) => adm.communicationMessage.findFirst({ where: { id } })
const approval = (id) => adm.tahApprovalRequest.findFirst({ where: { id } })
const kandidat = (id) => adm.communicationCandidate.findFirst({ where: { id } })
const gantiKapal = async (w, v) => {
  const k = await adm.vessel.create({ data: { tenantId: w.t.id, name: `MT Ganti ${uid()}` } })
  await adm.voyage.updateMany({ where: { id: v.id }, data: { vesselId: k.id } })
}
const jumlahAudit = (peristiwa, recordId) =>
  adm.auditLog.count({ where: { newValue: { path: ['peristiwa'], equals: peristiwa }, ...(recordId ? { recordId } : {}) } })

/**
 * Invarian pesan ⇔ approval ⇔ candidate (dipakai setelah setiap balapan):
 *  I1 pesan APPROVED ⇒ approval APPROVED + eksekusi NOT_STARTED + activeKey ada + candidate ACTIVE
 *  I2 approval APPROVED & pesan bukan APPROVED ⇒ eksekusi CANCELLED
 *  I3 approval PENDING ⇒ pesan PREVIEWED, tertaut, activeKey ada, candidate ACTIVE
 *  I4 maksimal satu revisi aktif per pesan logis
 *  I5 approval final ⇒ finalizedAt terisi kecuali (APPROVED + NOT_STARTED)
 */
async function invarian(messageId) {
  const m = await pesan(messageId)
  const a = m.approvalRequestId ? await approval(m.approvalRequestId) : null
  const c = await kandidat(m.candidateId)
  const galat = []
  if (m.state === 'APPROVED' && !(a?.status === 'APPROVED' && a.executionStatus === 'NOT_STARTED' && m.activeKey && c.state === 'ACTIVE')) galat.push('I1')
  if (a?.status === 'APPROVED' && m.state !== 'APPROVED' && a.executionStatus !== 'CANCELLED') galat.push('I2')
  if (a?.status === 'PENDING' && !(m.state === 'PREVIEWED' && m.activeKey && c.state === 'ACTIVE')) galat.push('I3')
  if ((await adm.communicationMessage.count({ where: { logicalMessageKey: m.logicalMessageKey, activeKey: { not: null } } })) > 1) galat.push('I4')
  if (a && a.status !== 'PENDING' && !(a.status === 'APPROVED' && a.executionStatus === 'NOT_STARTED') && a.finalizedAt === null) galat.push('I5')
  if (a && !TAH.invarianStatus(a.status, a.executionStatus)) galat.push('TAH')
  return { ok: galat.length === 0, galat, m, a, c }
}

try {
  await bersihkan()
  const A = await dunia('A')
  const B = await dunia('B')
  process.env.AUTOMATION_TENANT_IDS = `${A.t.id},${B.t.id}`

  // ============================================================== minta
  bagian('[1] Minta approval (1–8)')
  const p1 = await pratinjau(A)
  const h1 = await AP.mintaApproval(A.ctx, { messageId: p1.messageId })
  const a1 = await approval(h1.approvalRequestId)
  const m1 = await pesan(p1.messageId)
  cek('1. PREVIEWED → APPROVAL_DIMINTA; approval PENDING; pesan tetap PREVIEWED + tertaut (D-2D-02)', h1.hasil === 'APPROVAL_DIMINTA' && h1.dibuatBaru === true && a1.status === 'PENDING' && a1.executionStatus === 'NOT_APPLICABLE' && m1.state === 'PREVIEWED' && m1.approvalRequestId === a1.id)
  cek('6. proposalHash PERSIS snapshotFingerprint', a1.proposalHash === m1.snapshotFingerprint && a1.proposalHash === p1.fp)
  cek('7. basisFingerprint PERSIS sourceFingerprint', a1.basisFingerprint === m1.sourceFingerprint)
  cek('8. subjek = CommunicationMessage / message.id; voyageId dari candidate', a1.subjectType === 'CommunicationMessage' && a1.subjectId === m1.id && a1.voyageId === p1.v.id)
  cek('registry: kind WA_INTERNAL_FAKE_TEST, INTERNAL_WRITE, peran ADMIN+MANAJER_OPERASI, originator = peminta', a1.kind === 'WA_INTERNAL_FAKE_TEST' && a1.actionRisk === 'INTERNAL_WRITE' && a1.requiredRoles.join() === 'ADMIN,MANAJER_OPERASI' && a1.originatorUserId === 'u-A' && a1.requestedBy === 'u-A')
  cek('35. Q8: expiresAt NULL (tanpa TTL produk); idempotencyKey WA1:<messageId>', a1.expiresAt === null && a1.idempotencyKey === `WA1:${m1.id}`)
  cek('usulan = snapshot immutable (body & sidik sama, ≤ 32 KB)', a1.proposal.body === m1.body && a1.proposal.snapshotFingerprint === m1.snapshotFingerprint && a1.proposal.messageId === m1.id && TAH.jsonMuat(a1.proposal, TAH.MAKS_BYTE_USULAN))
  {
    const p = await pratinjau(A)
    const h = await AP.mintaApproval(A.ctx, { messageId: p.messageId, kind: 'TAH_DEV_NOOP', expiresAt: new Date(Date.now() + 3_600_000), proposalHash: 'f'.repeat(64), requiredRoles: ['ADMIN'], actionRisk: 'EXTERNAL_COMMUNICATION' })
    const a = await approval(h.approvalRequestId)
    cek('Q8-R1: pemanggil TAK bisa memilih kind / expiresAt / proposalHash / peran / risiko — semua diturunkan server', a.kind === 'WA_INTERNAL_FAKE_TEST' && a.expiresAt === null && a.proposalHash === p.fp && a.requiredRoles.join() === 'ADMIN,MANAJER_OPERASI' && a.actionRisk === 'INTERNAL_WRITE')
  }
  const h1b = await AP.mintaApproval(A.ctx, { messageId: p1.messageId })
  cek('4. replay → approval SAMA, tanpa baris baru', h1b.hasil === 'APPROVAL_DIMINTA' && h1b.approvalRequestId === a1.id && h1b.dibuatBaru === false && (await adm.tahApprovalRequest.count({ where: { subjectId: m1.id } })) === 1)
  {
    const v = await voyage(A)
    const e = await adm.voyageEvent.create({ data: { tenantId: A.t.id, voyageId: v.id, eventCode: 'SAILED', occurredAt: new Date(WAKTU), recordedByUserId: 'u' } })
    const s = await sinyal(A, v, { kind: 'OPERATIONAL_EVENT_RECORDED', sourceType: 'VOYAGE_EVENT', sourceRef: e.id, after: { eventCode: 'SAILED' } })
    const h = await S.siapkanCandidate(A.ctx, { signalId: s.id })
    const r = await S.buatRevisiPesan(A.ctx, { candidateId: h.candidateId, recipientFixtureId: FX, language: 'ID' })
    const hd = await AP.mintaApproval(A.ctx, { messageId: r.messageId })
    cek('2. DRAFT tak bisa meminta → DITOLAK PREVIEW_REQUIRED, 0 approval', hd.hasil === 'DITOLAK' && hd.alasan === 'PREVIEW_REQUIRED' && (await adm.tahApprovalRequest.count({ where: { subjectId: r.messageId } })) === 0)
  }
  cek('messageId tak sah → VALIDATION', (await kode(() => AP.mintaApproval(A.ctx, { messageId: '' }))) === 'VALIDATION')
  for (let i = 0; i < ULANG; i++) {
    const p = await pratinjau(A)
    const r = await Promise.allSettled(Array.from({ length: 5 }, () => AP.mintaApproval(A.ctx, { messageId: p.messageId })))
    const ids = new Set(r.filter((x) => x.status === 'fulfilled').map((x) => x.value.approvalRequestId))
    const lain = r.filter((x) => x.status === 'rejected').map((x) => x.reason?.code)
    const inv = await invarian(p.messageId)
    cek(`5. [${i + 1}/${ULANG}] 5 permintaan bersamaan → SATU approval, semua menunjuk id itu`, ids.size === 1 && (await adm.tahApprovalRequest.count({ where: { subjectId: p.messageId } })) === 1 && lain.every((c) => c === 'CONFLICT') && inv.ok, `${[...ids].length} id, ${lain.length} CONFLICT, ${inv.galat}`)
  }

  // ============================================== gagal tertutup saat meminta
  bagian('[2] Gagal tertutup saat meminta (3, 11–15, 19)')
  {
    const p = await pratinjau(A)
    await adm.voyageEvent.updateMany({ where: { id: p.sumber.id }, data: { deletedAt: new Date() } })
    const h = await AP.mintaApproval(A.ctx, { messageId: p.messageId })
    const m = await pesan(p.messageId)
    cek('14. sumber terhapus sebelum minta → DIBLOKIR SOURCE_DELETED; candidate & pesan BLOCKED; 0 approval', h.hasil === 'DIBLOKIR' && h.alasan === 'SOURCE_DELETED' && m.state === 'BLOCKED' && m.activeKey === null && (await kandidat(p.candidateId)).state === 'BLOCKED' && (await adm.tahApprovalRequest.count({ where: { subjectId: p.messageId } })) === 0)
    const h3 = await AP.mintaApproval(A.ctx, { messageId: p.messageId })
    cek('3. pesan BLOCKED tak bisa meminta → DITOLAK, 0 approval', h3.hasil === 'DITOLAK' && h3.alasan === 'PREVIEW_REQUIRED' && (await adm.tahApprovalRequest.count({ where: { subjectId: p.messageId } })) === 0)
  }
  {
    const p = await pratinjau(A)
    await gantiKapal(A, p.v)
    const h = await AP.mintaApproval(A.ctx, { messageId: p.messageId })
    const m = await pesan(p.messageId)
    cek('15. drift sumber sebelum minta → DITOLAK APPROVAL_STALE; pesan CANCELED/APPROVAL_STALE, activeKey dilepas; 0 approval', h.hasil === 'DITOLAK' && h.alasan === 'APPROVAL_STALE' && m.state === 'CANCELED' && m.reasonCode === 'APPROVAL_STALE' && m.activeKey === null && (await adm.tahApprovalRequest.count({ where: { subjectId: p.messageId } })) === 0)
  }
  {
    const p = await pratinjau(A)
    await adm.communicationCandidate.updateMany({ where: { id: p.candidateId }, data: { state: 'BLOCKED', blockReason: 'SOURCE_DELETED' } })
    const h = await AP.mintaApproval(A.ctx, { messageId: p.messageId })
    cek('11. candidate tak aktif → DIBLOKIR (pesan diselaraskan BLOCKED), 0 approval', h.hasil === 'DIBLOKIR' && (await pesan(p.messageId)).state === 'BLOCKED' && (await adm.tahApprovalRequest.count({ where: { subjectId: p.messageId } })) === 0)
  }
  {
    const p = await pratinjau(A)
    await adm.communicationMessage.updateMany({ where: { id: p.messageId }, data: { activeKey: null } })
    const h = await AP.mintaApproval(A.ctx, { messageId: p.messageId })
    cek('12. activeKey hilang → DITOLAK APPROVAL_STALE (activeKey), 0 approval', h.hasil === 'DITOLAK' && h.alasan === 'APPROVAL_STALE' && h.medan === 'activeKey' && (await adm.tahApprovalRequest.count({ where: { subjectId: p.messageId } })) === 0)
  }
  {
    const p = await pratinjau(A)
    const asli = await pesan(p.messageId)
    await adm.communicationMessage.updateMany({ where: { id: p.messageId }, data: { body: `${asli.body} (disunting)` } })
    const h = await AP.mintaApproval(A.ctx, { messageId: p.messageId })
    cek('13. snapshot dirusak (body disunting di DB) → DITOLAK APPROVAL_STALE (snapshotFingerprint), 0 approval', h.hasil === 'DITOLAK' && h.medan === 'snapshotFingerprint' && (await adm.tahApprovalRequest.count({ where: { subjectId: p.messageId } })) === 0)
  }
  {
    const p = await pratinjau(A)
    await adm.monitoringSignal.updateMany({ where: { id: p.s.id }, data: { reviewState: 'EXPIRED' } })
    const h = await AP.mintaApproval(A.ctx, { messageId: p.messageId })
    cek('19. sinyal EXPIRED → DIBLOKIR SIGNAL_EXPIRED, 0 approval', h.hasil === 'DIBLOKIR' && h.alasan === 'SIGNAL_EXPIRED' && (await adm.tahApprovalRequest.count({ where: { subjectId: p.messageId } })) === 0)
  }

  // ================================================== otorisasi & lingkungan
  bagian('[3] Peran, setuju-sendiri, lingkungan, lintas tenant (9–10, 20–24)')
  cek('22. peran OPERATOR → FORBIDDEN (minta & setujui)', (await kode(() => AP.mintaApproval({ ...A.ctx, role: 'OPERATOR' }, { messageId: p1.messageId }))) === 'FORBIDDEN' && (await kode(() => AP.setujuiPesan({ ...A.ctx, role: 'OPERATOR' }, { approvalRequestId: a1.id }))) === 'FORBIDDEN')
  cek('23. konteks sistem → FORBIDDEN', (await kode(() => AP.setujuiPesan({ ...A.ctx, system: true }, { approvalRequestId: a1.id }))) === 'FORBIDDEN' && (await kode(() => AP.mintaApproval({ ...A.ctx, system: true }, { messageId: p1.messageId }))) === 'FORBIDDEN')
  process.env.NODE_ENV = 'production'
  cek('24. NODE_ENV=production → FORBIDDEN (minta, setujui, tolak)', (await kode(() => AP.mintaApproval(A.ctx, { messageId: p1.messageId }))) === 'FORBIDDEN' && (await kode(() => AP.setujuiPesan(A.ctx, { approvalRequestId: a1.id }))) === 'FORBIDDEN' && (await kode(() => AP.tolakPesan(A.ctx, { approvalRequestId: a1.id, decisionNote: 'tidak sesuai' }))) === 'FORBIDDEN')
  process.env.NODE_ENV = 'test'
  cek('24. WA kind ditolak di produksi menurut kebijakan TAH', !TAH.jenisBolehDiLingkungan({ hanyaNonProduksi: true }, 'production'))
  cek('9. tenant B meminta approval untuk pesan A → NOT_FOUND', (await kode(() => AP.mintaApproval(B.ctx, { messageId: p1.messageId }))) === 'NOT_FOUND')
  cek('10. tenant B menyetujui / menolak approval A → NOT_FOUND', (await kode(() => AP.setujuiPesan(B.ctx, { approvalRequestId: a1.id }))) === 'NOT_FOUND' && (await kode(() => AP.tolakPesan(B.ctx, { approvalRequestId: a1.id, decisionNote: 'tidak sesuai' }))) === 'NOT_FOUND')
  cek('9–10. approval & pesan A tak tersentuh', (await approval(a1.id)).status === 'PENDING' && (await pesan(p1.messageId)).state === 'PREVIEWED')
  {
    const p = await pratinjau(A)
    const h = await AP.mintaApproval(A.ctx, { messageId: p.messageId })
    await adm.tahApprovalRequest.updateMany({ where: { id: h.approvalRequestId }, data: { actionRisk: 'EXTERNAL_COMMUNICATION' } })
    cek('21. approval sintetis berkelas EXTERNAL_COMMUNICATION → setujui oleh originator FORBIDDEN (kebijakan tak cocok), tak berubah', (await kode(() => AP.setujuiPesan(A.ctx, { approvalRequestId: h.approvalRequestId }))) === 'FORBIDDEN' && (await approval(h.approvalRequestId)).status === 'PENDING' && (await pesan(p.messageId)).state === 'PREVIEWED')
    cek('21. kebijakan TAH: EXTERNAL_COMMUNICATION + originator = pemutus → SELF_APPROVAL_FORBIDDEN', TAH.bolehMemutuskan({ pemutus: { userId: 'u-A', role: 'ADMIN' }, peranWajib: ['ADMIN', 'MANAJER_OPERASI'], kelas: 'EXTERNAL_COMMUNICATION', setujuSendiriJenis: true, originatorUserId: 'u-A' }).kode === 'SELF_APPROVAL_FORBIDDEN')
    await adm.tahApprovalRequest.updateMany({ where: { id: h.approvalRequestId }, data: { actionRisk: 'INTERNAL_WRITE', requiredRoles: ['ADMIN'] } })
    cek('policy mismatch: requiredRoles disunting → FORBIDDEN', (await kode(() => AP.setujuiPesan(A.ctx2, { approvalRequestId: h.approvalRequestId }))) === 'FORBIDDEN')
    await adm.tahApprovalRequest.updateMany({ where: { id: h.approvalRequestId }, data: { requiredRoles: ['ADMIN', 'MANAJER_OPERASI'], expiresAt: new Date(Date.now() + 3_600_000) } })
    cek('policy mismatch: expiresAt diisi (WA wajib tanpa TTL) → FORBIDDEN', (await kode(() => AP.setujuiPesan(A.ctx2, { approvalRequestId: h.approvalRequestId }))) === 'FORBIDDEN')
  }
  {
    // Otorisasi/kebijakan SEBELUM revalidasi: sumber sudah terhapus, tetapi pemanggil ditolak kebijakan →
    // TIDAK boleh ada hard block, pembatalan, transisi, atau audit bisnis.
    const p = await pratinjau(A)
    const h = await AP.mintaApproval(A.ctx, { messageId: p.messageId })
    await adm.voyageEvent.updateMany({ where: { id: p.sumber.id }, data: { deletedAt: new Date() } })
    await adm.tahApprovalRequest.updateMany({ where: { id: h.approvalRequestId }, data: { actionRisk: 'EXTERNAL_COMMUNICATION' } })
    const auditSebelum = await adm.auditLog.count({ where: { tenantId: A.t.id } })
    const e = await kode(() => AP.setujuiPesan(A.ctx2, { approvalRequestId: h.approvalRequestId }))
    const e2 = await kode(() => AP.tolakPesan(A.ctx2, { approvalRequestId: h.approvalRequestId, decisionNote: 'tidak sesuai' }))
    cek('otorisasi sebelum revalidasi: ditolak kebijakan → FORBIDDEN dan NOL mutasi (candidate ACTIVE, pesan PREVIEWED, approval PENDING, tanpa audit baru)',
      e === 'FORBIDDEN' && e2 === 'FORBIDDEN' && (await kandidat(p.candidateId)).state === 'ACTIVE' && (await pesan(p.messageId)).state === 'PREVIEWED' && (await approval(h.approvalRequestId)).status === 'PENDING' && (await adm.auditLog.count({ where: { tenantId: A.t.id } })) === auditSebelum)
  }
  {
    const p = await pratinjau(A)
    const h = await AP.mintaApproval(A.ctx, { messageId: p.messageId })
    const d = await AP.setujuiPesan(A.ctx, { approvalRequestId: h.approvalRequestId })
    cek('20. setuju-sendiri WA_INTERNAL_FAKE_TEST (non-produksi) → DISETUJUI', d.hasil === 'DISETUJUI' && (await approval(h.approvalRequestId)).decidedByUserId === 'u-A')
  }

  // ============================================================== setujui
  bagian('[4] Setujui (25–26) & revalidasi saat menyetujui (16–18)')
  const d1 = await AP.setujuiPesan(A.ctx2, { approvalRequestId: a1.id, decisionNote: 'oke' })
  const a1d = await approval(a1.id)
  const m1d = await pesan(p1.messageId)
  cek('25. setujui → approval APPROVED, eksekusi NOT_STARTED, finalizedAt kosong (belum final)', d1.hasil === 'DISETUJUI' && a1d.status === 'APPROVED' && a1d.executionStatus === 'NOT_STARTED' && a1d.decidedByUserId === 'u-A-2' && a1d.decidedAt instanceof Date && a1d.finalizedAt === null && TAH.invarianStatus(a1d.status, a1d.executionStatus))
  cek('26. pesan APPROVED; approvedByUserId & approvedAt disalin; activeKey tetap', m1d.state === 'APPROVED' && m1d.approvedByUserId === 'u-A-2' && m1d.approvedAt?.getTime() === a1d.decidedAt.getTime() && m1d.activeKey === m1d.logicalMessageKey)
  cek('setujui ulang → SUDAH_DIPUTUSKAN APPROVED (idempoten)', (await AP.setujuiPesan(A.ctx2, { approvalRequestId: a1.id })).hasil === 'SUDAH_DIPUTUSKAN')
  cek('Prepare identik atas pesan APPROVED → REVISI_SAMA, approval tetap berlaku', (await S.buatRevisiPesan(A.ctx, { candidateId: p1.candidateId, recipientFixtureId: FX, language: 'ID' })).hasil === 'REVISI_SAMA' && (await pesan(p1.messageId)).state === 'APPROVED')
  {
    const p = await pratinjau(A)
    const h = await AP.mintaApproval(A.ctx, { messageId: p.messageId })
    await adm.voyageEvent.updateMany({ where: { id: p.sumber.id }, data: { deletedAt: new Date() } })
    const d = await AP.setujuiPesan(A.ctx2, { approvalRequestId: h.approvalRequestId })
    const a = await approval(h.approvalRequestId)
    cek('16. sumber terhapus setelah diminta → DIBLOKIR; approval CANCELLED (final), pesan BLOCKED', d.hasil === 'DIBLOKIR' && d.alasan === 'SOURCE_DELETED' && a.status === 'CANCELLED' && a.decisionNote === 'SOURCE_DELETED' && a.finalizedAt instanceof Date && (await pesan(p.messageId)).state === 'BLOCKED')
  }
  const p17 = await pratinjau(A)
  const h17 = await AP.mintaApproval(A.ctx, { messageId: p17.messageId })
  await gantiKapal(A, p17.v)
  const d17 = await AP.setujuiPesan(A.ctx2, { approvalRequestId: h17.approvalRequestId })
  cek('17. drift sumber setelah diminta → DITOLAK APPROVAL_STALE; approval CANCELLED; pesan CANCELED/APPROVAL_STALE', d17.hasil === 'DITOLAK' && d17.alasan === 'APPROVAL_STALE' && (await approval(h17.approvalRequestId)).status === 'CANCELLED' && (await pesan(p17.messageId)).state === 'CANCELED' && (await pesan(p17.messageId)).reasonCode === 'APPROVAL_STALE')
  {
    const p = await pratinjau(A)
    const h = await AP.mintaApproval(A.ctx, { messageId: p.messageId })
    await adm.monitoringSignal.updateMany({ where: { id: p.s.id }, data: { reviewState: 'DISMISSED' } })
    const d = await AP.setujuiPesan(A.ctx2, { approvalRequestId: h.approvalRequestId })
    cek('18. sinyal DISMISSED setelah diminta → DIBLOKIR SIGNAL_DISMISSED; approval CANCELLED', d.hasil === 'DIBLOKIR' && d.alasan === 'SIGNAL_DISMISSED' && (await approval(h.approvalRequestId)).status === 'CANCELLED')
  }
  {
    const p = await pratinjau(A)
    const h = await AP.mintaApproval(A.ctx, { messageId: p.messageId })
    const v = await adm.voyage.findFirst({ where: { id: p.v.id } })
    await adm.port.updateMany({ where: { id: v.portId }, data: { timezone: null } })
    const d = await AP.setujuiPesan(A.ctx2, { approvalRequestId: h.approvalRequestId })
    cek('recoverable saat setujui (timezone hilang) → DITOLAK_PULIH; approval tetap PENDING, pesan PREVIEWED', d.hasil === 'DITOLAK_PULIH' && d.alasan === 'TIMEZONE_MISSING' && (await approval(h.approvalRequestId)).status === 'PENDING' && (await pesan(p.messageId)).state === 'PREVIEWED')
    await adm.port.updateMany({ where: { id: v.portId }, data: { timezone: 'Asia/Makassar' } })
    cek('setelah diperbaiki → DISETUJUI', (await AP.setujuiPesan(A.ctx2, { approvalRequestId: h.approvalRequestId })).hasil === 'DISETUJUI')
  }
  {
    const p = await pratinjau(A)
    const h = await AP.mintaApproval(A.ctx, { messageId: p.messageId })
    const asli = await pesan(p.messageId)
    await adm.communicationMessage.updateMany({ where: { id: p.messageId }, data: { body: `${asli.body}!` } })
    const d = await AP.setujuiPesan(A.ctx2, { approvalRequestId: h.approvalRequestId })
    cek('13. snapshot dirusak setelah diminta → DITOLAK APPROVAL_STALE; approval CANCELLED; pesan CANCELED', d.hasil === 'DITOLAK' && (await approval(h.approvalRequestId)).status === 'CANCELLED' && (await pesan(p.messageId)).state === 'CANCELED')
  }

  {
    const p = await pratinjau(A)
    const h = await AP.mintaApproval(A.ctx, { messageId: p.messageId })
    await adm.tahApprovalRequest.updateMany({ where: { id: h.approvalRequestId }, data: { proposalHash: 'e'.repeat(64) } })
    const d = await AP.setujuiPesan(A.ctx2, { approvalRequestId: h.approvalRequestId })
    cek('6. proposalHash ≠ snapshotFingerprint (approval disunting) → DITOLAK APPROVAL_STALE (proposalHash); approval CANCELLED; pesan CANCELED', d.hasil === 'DITOLAK' && d.medan === 'proposalHash' && (await approval(h.approvalRequestId)).status === 'CANCELLED' && (await pesan(p.messageId)).state === 'CANCELED')
  }

  // ================================================================ tolak
  bagian('[5] Tolak (27–28)')
  const p27 = await pratinjau(A, { jenis: 'JADWAL' })
  const h27 = await AP.mintaApproval(A.ctx, { messageId: p27.messageId })
  cek('28. catatan penolakan kosong / < 3 karakter → VALIDATION, tak berubah', (await kode(() => AP.tolakPesan(A.ctx2, { approvalRequestId: h27.approvalRequestId, decisionNote: '' }))) === 'VALIDATION' && (await kode(() => AP.tolakPesan(A.ctx2, { approvalRequestId: h27.approvalRequestId, decisionNote: ' ab ' }))) === 'VALIDATION' && (await approval(h27.approvalRequestId)).status === 'PENDING')
  const t27 = await AP.tolakPesan(A.ctx2, { approvalRequestId: h27.approvalRequestId, decisionNote: 'Redaksi belum sesuai' })
  const a27 = await approval(h27.approvalRequestId)
  const m27 = await pesan(p27.messageId)
  cek('27. tolak → approval REJECTED (catatan, final); pesan CANCELED/APPROVAL_REJECTED, activeKey dilepas', t27.hasil === 'DITOLAK_PEMUTUS' && a27.status === 'REJECTED' && a27.decisionNote === 'Redaksi belum sesuai' && a27.finalizedAt instanceof Date && a27.executionStatus === 'NOT_APPLICABLE' && m27.state === 'CANCELED' && m27.reasonCode === 'APPROVAL_REJECTED' && m27.activeKey === null)
  const r27 = await S.buatRevisiPesan(A.ctx, { candidateId: p27.candidateId, recipientFixtureId: FX, language: 'ID' })
  await S.tandaiDipratinjau(A.ctx, { messageId: r27.messageId, snapshotFingerprint: r27.snapshotFingerprint })
  const h27b = await AP.mintaApproval(A.ctx, { messageId: r27.messageId })
  cek('27. revisi baru boleh disiapkan & meminta approval BARU (bukan approval lama)', r27.hasil === 'REVISI_DIBUAT' && h27b.hasil === 'APPROVAL_DIMINTA' && h27b.approvalRequestId !== a27.id)

  // ===================================================== basi / tak hidup kembali
  bagian('[6] Basi, SUPERSEDED, tak pernah hidup kembali (32–33, D-2D-04)')
  cek('32. approval CANCELLED disetujui lagi → SUDAH_DIPUTUSKAN; pesan tetap CANCELED', (await AP.setujuiPesan(A.ctx2, { approvalRequestId: h17.approvalRequestId })).hasil === 'SUDAH_DIPUTUSKAN' && (await pesan(p17.messageId)).state === 'CANCELED')
  cek('32. pesan CANCELED tak bisa meminta approval lagi', (await AP.mintaApproval(A.ctx, { messageId: p17.messageId })).hasil === 'DITOLAK' && (await adm.tahApprovalRequest.count({ where: { subjectId: p17.messageId } })) === 1)
  {
    const p = await pratinjau(A)
    const h = await AP.mintaApproval(A.ctx, { messageId: p.messageId })
    const r = await S.buatRevisiPesan(A.ctx, { candidateId: p.candidateId, recipientFixtureId: FX, language: 'EN' })
    const a = await approval(h.approvalRequestId)
    const lama = await pesan(p.messageId)
    const baru = await pesan(r.messageId)
    cek('33. approval PENDING + revisi diganti → approval SUPERSEDED (final); pesan lama CANCELED/REVISED; revisi baru TANPA approval', a.status === 'SUPERSEDED' && a.finalizedAt instanceof Date && lama.state === 'CANCELED' && lama.reasonCode === 'REVISED' && baru.state === 'DRAFT' && baru.approvalRequestId === null)
    cek('33. approval yang di-SUPERSEDED tak bisa disetujui', (await AP.setujuiPesan(A.ctx2, { approvalRequestId: h.approvalRequestId })).hasil === 'SUDAH_DIPUTUSKAN')
  }
  {
    const p = await pratinjau(A)
    const h = await AP.mintaApproval(A.ctx, { messageId: p.messageId })
    await AP.setujuiPesan(A.ctx2, { approvalRequestId: h.approvalRequestId })
    await S.buatRevisiPesan(A.ctx, { candidateId: p.candidateId, recipientFixtureId: FX, language: 'EN' })
    const a = await approval(h.approvalRequestId)
    cek('APPROVED (belum dieksekusi) + revisi diganti → approval tetap APPROVED, eksekusi CANCELLED (final); pesan CANCELED/REVISED', a.status === 'APPROVED' && a.executionStatus === 'CANCELLED' && a.executionErrorCode === 'REVISED' && a.finalizedAt instanceof Date && (await pesan(p.messageId)).state === 'CANCELED')
  }
  {
    const p = await pratinjau(A)
    const h = await AP.mintaApproval(A.ctx, { messageId: p.messageId })
    await AP.setujuiPesan(A.ctx2, { approvalRequestId: h.approvalRequestId })
    await adm.voyageEvent.updateMany({ where: { id: p.sumber.id }, data: { deletedAt: new Date() } })
    const hb = await S.siapkanCandidate(A.ctx, { signalId: p.s.id })
    const a = await approval(h.approvalRequestId)
    cek('APPROVED + hard block → candidate & pesan BLOCKED; approval APPROVED, eksekusi CANCELLED (SOURCE_DELETED)', hb.hasil === 'DIBLOKIR' && (await pesan(p.messageId)).state === 'BLOCKED' && a.status === 'APPROVED' && a.executionStatus === 'CANCELLED' && a.executionErrorCode === 'SOURCE_DELETED' && (await invarian(p.messageId)).ok)
  }

  // ================================================================ balapan
  bagian(`[7] Balapan (29–31), masing-masing ${ULANG}×`)
  for (let i = 0; i < ULANG; i++) {
    const p = await pratinjau(A)
    const h = await AP.mintaApproval(A.ctx, { messageId: p.messageId })
    const r = await Promise.allSettled([AP.setujuiPesan(A.ctx2, { approvalRequestId: h.approvalRequestId }), AP.tolakPesan(A.ctx2, { approvalRequestId: h.approvalRequestId, decisionNote: 'ditolak balapan' })])
    const hasil = r.map((x) => (x.status === 'fulfilled' ? x.value.hasil : x.reason?.code))
    const inv = await invarian(p.messageId)
    const pasangan = `${inv.a.status}/${inv.m.state}`
    cek(`29. [${i + 1}] setujui vs tolak → tepat satu keputusan; pasangan konsisten; yang kalah terkendali`, ['APPROVED/APPROVED', 'REJECTED/CANCELED'].includes(pasangan) && hasil.filter((x) => x === 'DISETUJUI' || x === 'DITOLAK_PEMUTUS').length === 1 && r.every((x) => x.status === 'fulfilled' || x.reason?.code === 'CONFLICT') && inv.ok, `${hasil.join(',')} → ${pasangan}`)
  }
  for (let i = 0; i < ULANG; i++) {
    const p = await pratinjau(A)
    const h = await AP.mintaApproval(A.ctx, { messageId: p.messageId })
    const r = await Promise.allSettled([AP.setujuiPesan(A.ctx2, { approvalRequestId: h.approvalRequestId }), S.buatRevisiPesan(A.ctx, { candidateId: p.candidateId, recipientFixtureId: FX, language: 'EN' })])
    const hasil = r.map((x) => (x.status === 'fulfilled' ? x.value.hasil : `${x.reason?.code ?? 'ERR'}:${String(x.reason?.message ?? '').slice(0, 60)}`))
    const inv = await invarian(p.messageId)
    const a = inv.a
    const sah =
      (inv.m.state === 'CANCELED' && inv.m.reasonCode === 'REVISED' && (a.status === 'SUPERSEDED' || (a.status === 'APPROVED' && a.executionStatus === 'CANCELLED'))) ||
      (inv.m.state === 'APPROVED' && a.status === 'APPROVED' && r[1].status === 'rejected' && r[1].reason?.code === 'CONFLICT')
    cek(`30. [${i + 1}] setujui vs revisi baru → approval revisi lama tak pernah berlaku untuk revisi baru`, sah && inv.ok && (await adm.communicationMessage.count({ where: { candidateId: p.candidateId, approvalRequestId: h.approvalRequestId } })) === 1, `${hasil.join(',')} → ${a.status}/${a.executionStatus}/${inv.m.state}`)
  }
  for (let i = 0; i < ULANG; i++) {
    const p = await pratinjau(A)
    const h = await AP.mintaApproval(A.ctx, { messageId: p.messageId })
    const r = await Promise.allSettled([
      AP.setujuiPesan(A.ctx2, { approvalRequestId: h.approvalRequestId }),
      (async () => {
        await adm.voyageEvent.updateMany({ where: { id: p.sumber.id }, data: { deletedAt: new Date() } })
        return S.siapkanCandidate(A.ctx, { signalId: p.s.id })
      })(),
    ])
    const hasil = r.map((x) => (x.status === 'fulfilled' ? x.value.hasil : x.reason?.code))
    const inv = await invarian(p.messageId)
    cek(`31. [${i + 1}] setujui vs hard block → candidate & pesan BLOCKED; approval CANCELLED atau APPROVED+eksekusi CANCELLED; yang kalah terkendali`, inv.c.state === 'BLOCKED' && inv.m.state === 'BLOCKED' && (inv.a.status === 'CANCELLED' || (inv.a.status === 'APPROVED' && inv.a.executionStatus === 'CANCELLED')) && r.every((x) => x.status === 'fulfilled' || x.reason?.code === 'CONFLICT') && inv.ok, `${hasil.join(',')} → ${inv.a.status}/${inv.a.executionStatus}`)
  }

  // ================================================================== audit
  bagian('[8] Audit atomik (34)')
  for (const p of ['WA1_APPROVAL_DIMINTA', 'WA1_APPROVAL_DITAUTKAN', 'WA1_APPROVAL_DISETUJUI', 'WA1_PESAN_DISETUJUI', 'WA1_APPROVAL_DITOLAK_PEMUTUS', 'WA1_PESAN_DIBATALKAN', 'WA1_APPROVAL_DIHENTIKAN', 'WA1_EKSEKUSI_DIBATALKAN', 'WA1_PESAN_BASI']) {
    cek(`34. audit ${p} ada`, (await jumlahAudit(p)) > 0)
  }
  {
    const p = await pratinjau(A)
    await gagalkanAudit('WA1_APPROVAL_DITAUTKAN')
    const e = await kode(() => AP.mintaApproval(A.ctx, { messageId: p.messageId }))
    await hapusTrigger()
    cek('34. audit tautan gagal → approval TIDAK tercipta, pesan tak tertaut, audit DIMINTA ikut batal', e !== null && (await adm.tahApprovalRequest.count({ where: { subjectId: p.messageId } })) === 0 && (await pesan(p.messageId)).approvalRequestId === null && (await jumlahAudit('WA1_APPROVAL_DIMINTA', p.messageId)) === 0)
  }
  {
    const p = await pratinjau(A)
    const h = await AP.mintaApproval(A.ctx, { messageId: p.messageId })
    await gagalkanAudit('WA1_PESAN_DISETUJUI')
    const e = await kode(() => AP.setujuiPesan(A.ctx2, { approvalRequestId: h.approvalRequestId }))
    await hapusTrigger()
    cek('34. audit pesan gagal saat setujui → approval TETAP PENDING, pesan PREVIEWED, audit DISETUJUI ikut batal', e !== null && (await approval(h.approvalRequestId)).status === 'PENDING' && (await pesan(p.messageId)).state === 'PREVIEWED' && (await jumlahAudit('WA1_APPROVAL_DISETUJUI', h.approvalRequestId)) === 0)
    await gagalkanAudit('WA1_PESAN_DIBATALKAN')
    const e2 = await kode(() => AP.tolakPesan(A.ctx2, { approvalRequestId: h.approvalRequestId, decisionNote: 'tidak sesuai' }))
    await hapusTrigger()
    cek('34. audit pesan gagal saat tolak → approval TETAP PENDING, pesan PREVIEWED', e2 !== null && (await approval(h.approvalRequestId)).status === 'PENDING' && (await pesan(p.messageId)).state === 'PREVIEWED')
    await gagalkanAudit('WA1_APPROVAL_DIHENTIKAN')
    const e3 = await kode(() => S.buatRevisiPesan(A.ctx, { candidateId: p.candidateId, recipientFixtureId: FX, language: 'EN' }))
    await hapusTrigger()
    cek('34. audit penghentian approval gagal saat revisi diganti → approval PENDING, pesan lama PREVIEWED, tanpa revisi baru', e3 !== null && (await approval(h.approvalRequestId)).status === 'PENDING' && (await pesan(p.messageId)).state === 'PREVIEWED' && (await adm.communicationMessage.count({ where: { candidateId: p.candidateId } })) === 1)
  }

  // ====================================================== Q8 & tanpa Send
  bagian('[9] Q8 & tanpa Send / Attempt / jaringan (35–39)')
  const kolom = await adm.$queryRawUnsafe(`SELECT is_nullable FROM information_schema.columns WHERE table_name = 'TahApprovalRequest' AND column_name = 'expiresAt'`)
  cek('35. kolom expiresAt nullable di DB (migrasi Q8 diterapkan)', kolom[0]?.is_nullable === 'YES')
  cek('35. semua approval WA berstatus tanpa TTL (expiresAt NULL) kecuali yang disunting uji', (await adm.tahApprovalRequest.count({ where: { kind: 'WA_INTERNAL_FAKE_TEST', expiresAt: { not: null } } })) === 1)
  const REG = jiti('../src/services/tah/registry.ts')
  cek('Q8-R1: definisi WA tertutup — tanpa TTL, non-produksi, INTERNAL_WRITE, setuju-sendiri, tak bisa disunting, beku', REG.JENIS_APPROVAL_WA_FAKE.kedaluwarsaJam === null && REG.JENIS_APPROVAL_WA_FAKE.hanyaNonProduksi === true && REG.JENIS_APPROVAL_WA_FAKE.risiko === 'INTERNAL_WRITE' && REG.JENIS_APPROVAL_WA_FAKE.setujuSendiri === true && REG.JENIS_APPROVAL_WA_FAKE.bisaDiedit === false && Object.isFrozen(REG.JENIS_APPROVAL_WA_FAKE))
  cek('Q8-R1: definisi WA ditolak di produksi oleh kebijakan beku', !TAH.jenisBolehDiLingkungan(REG.JENIS_APPROVAL_WA_FAKE, 'production'))
  const reg = TAH.validasiRegistry([{ key: 'X_AGEN', versi: 'x/1', jenisRun: ['EXTRACT'], jenisApproval: [] }], [{ kind: 'X_NONPROD', risiko: 'INTERNAL_WRITE', peranWajib: ['ADMIN'], setujuSendiri: true, kedaluwarsaJam: null, bisaDiedit: false, hanyaNonProduksi: true }], ['ADMIN', 'MANAJER_OPERASI'])
  cek('36. Q8-R1: TIDAK ada jalur NULL-TTL umum — validasiRegistry beku menolak kedaluwarsaJam null (bahkan non-produksi)', reg.some((g) => /kedaluwarsaJam/.test(g)))
  cek('Q8-R1: CLIENT_WA_UPDATE tidak ada di registry mana pun', !REG.JENIS_APPROVAL_TAH.some((j) => j.kind === 'CLIENT_WA_UPDATE') && REG.JENIS_APPROVAL_WA_FAKE.kind !== 'CLIENT_WA_UPDATE')
  cek('37. 0 CommunicationAttempt', (await adm.communicationAttempt.count()) === 0)
  cek('38. 0 Send: tak ada pesan QUEUED_FAKE/FAKE_SENT/FAKE_FAILED, successKey/fakeReceipt kosong; eksekusi tak pernah RUNNING/SUCCEEDED', (await adm.communicationMessage.count({ where: { OR: [{ state: { in: ['QUEUED_FAKE', 'FAKE_SENT', 'FAKE_FAILED'] } }, { successKey: { not: null } }, { fakeReceipt: { not: null } }] } })) === 0 && (await adm.tahApprovalRequest.count({ where: { executionStatus: { in: ['RUNNING', 'SUCCEEDED', 'SUCCEEDED_WITH_WARNINGS', 'FAILED'] } } })) === 0)
  cek('39. NOL panggilan jaringan (fetch/http/https/net/tls/dns/WebSocket)', egress.length === 0, egress.join(','))
  const semua = await adm.communicationMessage.findMany({ where: { tenantId: A.t.id }, select: { id: true } })
  const rusak = []
  for (const m of semua) {
    const inv = await invarian(m.id)
    if (!inv.ok) rusak.push(`${m.id}:${inv.galat}`)
  }
  cek(`invarian pesan ⇔ approval ⇔ candidate berlaku untuk SEMUA ${semua.length} pesan uji`, rusak.length === 0, rusak.slice(0, 3).join(' '))
} catch (e) {
  gagal++
  console.log(`  ❌ Uji berhenti karena galat: ${e?.stack ?? e}`)
} finally {
  try {
    await bersihkan()
    const sisa = await adm.tenant.count({ where: { companyName: { startsWith: TAG } } })
    cek('pembersihan: 0 tenant/approval uji tersisa, trigger uji dihapus', sisa === 0 && (await adm.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = 'wa1s2d_gagal_audit'`))[0].n === 0)
  } finally {
    await adm.$disconnect()
    await prismaApp.$disconnect()
  }
}

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`)
process.exit(gagal === 0 ? 0 : 1)
