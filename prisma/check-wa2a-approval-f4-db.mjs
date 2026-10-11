// Uji DB WA-2a Step 2F (F4) — approval eksternal pesan klien: permintaan, maker-checker atas bukti, revalidasi
// saat keputusan (K2/K7), kedaluwarsa (K11), tolak, batal (K6), supersede & hold (K3), K1 (kunci Voyage pada
// penulis VoyageEvent), konkurensi nyata, rollback audit, diferensial WA-1, dan invarian "tanpa approval aktif liar".
//
// Jalankan:
//   WA2F4_DB_URL=postgresql://postgres@127.0.0.1:55432/maritime_suite node prisma/check-wa2a-approval-f4-db.mjs
//
// DB loopback sekali pakai yang sudah `prisma migrate deploy`. Ditolak bila host bukan loopback, NODE_ENV=production,
// atau DATABASE_URL/DIRECT_URL menunjuk DB lain. Jaring egress aktif sepanjang uji. Data sintetis bertanda `WA2F4-`
// (nomor pola +62996…), dibersihkan lewat hapus tenant. Tidak ada pengiriman: F4 berhenti di APPROVED.

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

const URL_DB = process.env.WA2F4_DB_URL
if (!URL_DB) {
  console.log('DILEWATI — WA2F4_DB_URL tidak diset (butuh PostgreSQL loopback sekali pakai).')
  process.exit(3)
}
const tolakJalan = []
let urlDb
try {
  urlDb = new URL(URL_DB)
} catch {
  tolakJalan.push('URL tidak terurai')
}
if (urlDb && !['127.0.0.1', 'localhost', '::1', '[::1]'].includes(urlDb.hostname)) tolakJalan.push('host bukan loopback')
if ((process.env.NODE_ENV ?? '').trim().toLowerCase() === 'production') tolakJalan.push('NODE_ENV=production')
for (const n of ['DATABASE_URL', 'DIRECT_URL']) if (process.env[n] && process.env[n] !== URL_DB) tolakJalan.push(`${n} menunjuk DB lain (ambigu)`)
if (tolakJalan.length) {
  console.log(`❌ DITOLAK (DB tidak disentuh): ${tolakJalan.join(' | ')}`)
  process.exit(1)
}
process.env.DATABASE_URL = URL_DB
process.env.DIRECT_URL = URL_DB
process.env.NODE_ENV = 'test'
process.env.WA2_CLIENT_FOUNDATION_ENABLED = 'true'
process.env.AUTOMATION_MONITORING_ENABLED = 'true'
delete process.env.WA1_INTERNAL_FAKE_TEST_ENABLED

const egress = []
const jebak = (jalur) => () => {
  egress.push(jalur)
  throw new Error(`EGRESS_DILARANG_DALAM_UJI:${jalur}`)
}
globalThis.fetch = jebak('fetch')
http.request = jebak('http.request')
http.get = jebak('http.get')
https.request = jebak('https.request')
https.get = jebak('https.get')
net.connect = jebak('net.connect')
net.createConnection = jebak('net.createConnection')
tls.connect = jebak('tls.connect')
dns.lookup = jebak('dns.lookup')

const require = createRequire(import.meta.url)
const jiti = require('jiti')(fileURLToPath(import.meta.url), { alias: { '@': join(AKAR, 'src') }, interopDefault: true })
const KT = jiti('../src/services/whatsapp/wa-contact.service.ts')
const CS = jiti('../src/services/whatsapp/wa-consent.service.ts')
const GS = jiti('../src/services/whatsapp/wa-grant.service.ts')
const KJ = jiti('../src/services/whatsapp/wa-schedule-confirmation.service.ts')
const MS = jiti('../src/services/whatsapp/wa-message.service.ts')
const AP = jiti('../src/services/whatsapp/wa-message-approval.service.ts')
const VE = jiti('../src/services/ops/voyage-event.service.ts')
const W1S = jiti('../src/services/communication/communication.service.ts')
const W1A = jiti('../src/services/communication/communication-approval.service.ts')
const { PrismaClient } = await import('@prisma/client')
const adm = new PrismaClient({ datasources: { db: { url: URL_DB } } })

const TAG = 'WA2F4-'
let seq = 0
const uid = (p = 'x') => `${TAG}${p}-${++seq}`
let nomorSeq = 0
const nomorBaru = () => `+62996${String(++nomorSeq).padStart(8, '0')}`
const BUKTI = 'Dokumen penunjukan resmi & konfirmasi telepon ke kantor pihak (uji sintetis).'
const JAM = 3_600_000
const tidur = (ms) => new Promise((r) => setTimeout(r, ms))
const coba = async (fn) => {
  try {
    return { ok: true, nilai: await fn() }
  } catch (e) {
    return { ok: false, kode: e?.details?.code ?? e?.code ?? 'ERR', pesan: String(e?.message ?? e) }
  }
}
const kode = async (fn) => {
  const r = await coba(fn)
  return r.ok ? 'OK' : r.kode
}

const PEMICU = 'wa2f4_gagal_audit'
async function pasangGagalAudit(peristiwa) {
  await adm.$executeRawUnsafe(`CREATE FUNCTION ${PEMICU}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."newValue"->>'peristiwa' = '${peristiwa}' THEN RAISE EXCEPTION 'UJI_GAGAL_AUDIT'; END IF; RETURN NEW; END $$`)
  await adm.$executeRawUnsafe(`CREATE TRIGGER ${PEMICU} BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION ${PEMICU}()`)
}
async function lepasGagalAudit() {
  await adm.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${PEMICU} ON "AuditLog"`)
  await adm.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${PEMICU}()`)
}
async function bersihkan() {
  await lepasGagalAudit()
  await adm.tenant.deleteMany({ where: { companyName: { startsWith: TAG } } })
}
const setAllowlist = (...ids) => {
  process.env.AUTOMATION_TENANT_IDS = ids.join(',')
}

const ETA_LAMA = '2026-10-13'
const ETA_BARU = '2026-10-15'
const ETD_BARU = '2026-10-17'

async function dunia(nama) {
  // Masa uji coba aktif: service operasional VoyageEvent menegakkan langganan (perilaku lama, tidak diubah F4).
  const t = await adm.tenant.create({ data: { companyName: `${TAG}${nama}`, trialEndsAt: new Date(Date.now() + 30 * 24 * JAM) } })
  const C1 = await adm.customer.create({ data: { tenantId: t.id, name: `${TAG}Customer 1` } })
  const P1 = await adm.principal.create({ data: { tenantId: t.id, name: `${TAG}Principal 1` } })
  const P2 = await adm.principal.create({ data: { tenantId: t.id, name: `${TAG}Principal 2` } })
  const kapal = await adm.vessel.create({ data: { tenantId: t.id, name: 'MV CONTOH SINTETIS' } })
  const port = await adm.port.create({ data: { tenantId: t.id, name: 'Balikpapan', timezone: 'Asia/Makassar' } })
  const c = (u, role) => ({ tenantId: t.id, userId: `u-${u}-${nama}`, role })
  return {
    t, C1, P1, P2, kapal, port,
    adminCtx: c('admin', 'ADMIN'), // pembuat draft
    manajerCtx: c('manajer', 'MANAJER_OPERASI'), // pencatat konfirmasi ETA/ETD
    admin2Ctx: c('admin2', 'ADMIN'), // pemberi preview + peminta approval
    checkerCtx: c('checker', 'MANAJER_OPERASI'),
    checker2Ctx: c('checker2', 'ADMIN'),
    prevCtx: c('prev', 'ADMIN'),
  }
}
const voyage = (w, ubah = {}) =>
  adm.voyage.create({
    data: { tenantId: w.t.id, vesselId: w.kapal.id, portId: w.port.id, voyageNumber: uid('VYG'), dataOrigin: 'NYATA', status: 'CONFIRMED', customerId: w.C1.id, principalId: w.P1.id, eta: new Date(`${ETA_BARU}T00:00:00Z`), etd: new Date(`${ETD_BARU}T00:00:00Z`), ...ubah },
  })
async function jadwal(w, { auditPada = new Date(Date.now() - JAM) } = {}) {
  const v = await voyage(w)
  const a = await adm.auditLog.create({ data: { tenantId: w.t.id, tableName: 'Voyage', recordId: v.id, action: 'UPDATE', oldValue: { peristiwa: 'UBAH_TANGGAL', eta: ETA_LAMA }, newValue: { peristiwa: 'UBAH_TANGGAL', medan: ['eta'], eta: ETA_BARU }, createdAt: auditPada } })
  const s = await adm.monitoringSignal.create({ data: { tenantId: w.t.id, voyageId: v.id, kind: 'ETA_CHANGED', severity: 'INFO', dedupeKey: uid(), sourceType: 'AUDIT_LOG', sourceRef: a.id, explanation: 'uji', recommendation: 'uji', after: { eta: ETA_BARU } } })
  return { v, a, s }
}
async function milestone(w, eventCode = 'ALL_FAST', { jamLalu = 2, pencatat = 'u-pencatat' } = {}) {
  const v = await voyage(w)
  const terjadi = new Date(Date.now() - jamLalu * JAM)
  const e = await adm.voyageEvent.create({ data: { tenantId: w.t.id, voyageId: v.id, eventCode, occurredAt: terjadi, recordedByUserId: pencatat } })
  const s = await adm.monitoringSignal.create({ data: { tenantId: w.t.id, voyageId: v.id, kind: 'OPERATIONAL_EVENT_RECORDED', severity: 'INFO', dedupeKey: uid(), sourceType: 'VOYAGE_EVENT', sourceRef: e.id, explanation: 'uji', recommendation: 'uji', after: { eventCode, occurredAt: terjadi.toISOString() } } })
  return { v, e, s }
}
async function kontak(w, partyType, partyId) {
  const r = await KT.buatKontak(w.adminCtx, { partyType, partyId, nomor: nomorBaru(), displayName: 'PIC uji', language: 'ID' })
  await KT.verifikasiKontak(w.adminCtx, r.contactId, { metode: 'DOCUMENT', bukti: BUKTI, berlakuSampai: GS.tambahBulan(new Date(), 6) })
  await CS.catatOptIn(w.adminCtx, r.contactId, { kanal: 'EMAIL', bukti: BUKTI })
  return r.contactId
}
async function grantAktif(w, contactId, voyageIds, kategori) {
  const g = await GS.ajukanGrant(w.manajerCtx, contactId, { voyageIds, kategori, buktiIdentitas: BUKTI, buktiHubungan: BUKTI, buktiKewenangan: BUKTI })
  await GS.putuskanGrant(w.adminCtx, g.grantId, { keputusan: 'SETUJU', catatan: 'Disetujui setelah cek bukti (uji).' })
  return g.grantId
}
const konfirmasi = (w, v, ctx = w.manajerCtx, ubah = {}) => KJ.catatKonfirmasiJadwal(ctx, v.id, { field: 'eta', nilai: ETA_BARU, sourceKind: 'MASTER_OR_SHIP', sourceNote: 'Noon report kapal (uji sintetis).', ...ubah })

/** Pesan PREVIEWED. jenis: 'jadwal' (customer) | 'ALL_FAST'/'EOSP'/'SAILED' (principal + grant MILESTONE). */
async function siapPesan(w, { jenis = 'jadwal', previewCtx = w.admin2Ctx, jamLalu, sumber } = {}) {
  let src
  let cid
  let grantId = null
  if (jenis === 'jadwal') {
    src = sumber ?? (await jadwal(w))
    if (!sumber) await konfirmasi(w, src.v)
    cid = await kontak(w, 'CUSTOMER', w.C1.id)
  } else {
    src = await milestone(w, jenis, jamLalu === undefined ? {} : { jamLalu })
    cid = await kontak(w, 'PRINCIPAL', w.P1.id)
    grantId = await grantAktif(w, cid, [src.v.id], ['MILESTONE'])
  }
  const d = await MS.buatDraftPesanKlien(w.adminCtx, { signalId: src.s.id, contactId: cid })
  const pv = await MS.pratinjauPesanKlien(previewCtx, { messageId: d.messageId, snapshotFingerprint: d.snapshotFingerprint })
  if (pv.hasil !== 'DIPRATINJAU') throw new Error(`fixture preview gagal: ${JSON.stringify(pv)}`)
  return { ...src, cid, grantId, d, mid: d.messageId, hash: d.snapshotFingerprint }
}
const minta = (w, p, ctx = w.admin2Ctx) => AP.mintaApprovalPesanKlien(ctx, { messageId: p.mid, snapshotFingerprint: p.hash })
async function siapPending(w, o = {}) {
  const p = await siapPesan(w, o)
  const r = await minta(w, p, o.mintaCtx)
  if (r.hasil !== 'APPROVAL_DIMINTA') throw new Error(`fixture minta gagal: ${JSON.stringify(r)}`)
  return { ...p, aid: r.approvalRequestId }
}
const setujui = (w, p, ctx = w.checkerCtx, hash = p.hash) => AP.setujuiPesanKlien(ctx, { approvalRequestId: p.aid, proposalHash: hash })
const tolak = (w, p, ctx = w.checkerCtx) => AP.tolakPesanKlien(ctx, { approvalRequestId: p.aid, proposalHash: p.hash, decisionNote: 'Isi tidak sesuai (uji).' })
const batal = (w, p, ctx = w.adminCtx) => AP.batalkanPesanKlien(ctx, { messageId: p.mid, alasan: 'Dibatalkan staf (uji).' })
const pesan = (id) => adm.waClientMessage.findFirst({ where: { id } })
const approval = (id) => adm.tahApprovalRequest.findFirst({ where: { id } })
const jumlahAudit = (w, peristiwa) => adm.auditLog.count({ where: { tenantId: w.t.id, newValue: { path: ['peristiwa'], equals: peristiwa } } })
const keadaan = async (p) => {
  const [m, a] = await Promise.all([pesan(p.mid), approval(p.aid)])
  return `${m.state}/${a.status}/${a.executionStatus}`
}

/** Invarian K3/K6: tak ada approval aktif yang subjeknya tidak lagi menunggu/berlaku, dan sebaliknya. */
async function approvalLiar(w) {
  const ms = await adm.waClientMessage.findMany({ where: { tenantId: w.t.id, approvalRequestId: { not: null } }, select: { id: true, state: true, approvalRequestId: true } })
  const as = await adm.tahApprovalRequest.findMany({ where: { id: { in: ms.map((m) => m.approvalRequestId) } } })
  const per = new Map(as.map((a) => [a.id, a]))
  return ms.filter((m) => {
    const a = per.get(m.approvalRequestId)
    if (!a || a.subjectId !== m.id) return true
    const pending = a.status === 'PENDING'
    const approvedAktif = a.status === 'APPROVED' && ['NOT_STARTED', 'FAILED'].includes(a.executionStatus)
    if (pending && m.state !== 'PENDING_APPROVAL') return true
    if (approvedAktif && m.state !== 'APPROVED') return true
    if (m.state === 'PENDING_APPROVAL' && !pending) return true
    if (m.state === 'APPROVED' && !(a.status === 'APPROVED' && a.executionStatus === 'NOT_STARTED')) return true
    return false
  })
}

try {
  await bersihkan()
  const A = await dunia('A')
  const B = await dunia('B')
  const X = await dunia('X-tidak-allowlist')
  setAllowlist(A.t.id, B.t.id)

  // ============================================================================ G
  bagian('[G] Gerbang')
  const g0 = await siapPesan(A)
  process.env.WA2_CLIENT_FOUNDATION_ENABLED = 'false'
  cek('flag WA-2 mati → FORBIDDEN (minta)', (await kode(() => minta(A, g0))) === 'FORBIDDEN')
  process.env.WA2_CLIENT_FOUNDATION_ENABLED = 'true'
  process.env.NODE_ENV = 'production'
  cek('NODE_ENV=production → FORBIDDEN (minta)', (await kode(() => minta(A, g0))) === 'FORBIDDEN')
  process.env.NODE_ENV = 'test'
  cek('K4: peminta OPERATOR → FORBIDDEN', (await kode(() => minta(A, g0, { ...A.admin2Ctx, role: 'OPERATOR' }))) === 'FORBIDDEN')
  cek('konteks sistem → FORBIDDEN', (await kode(() => minta(A, g0, { ...A.admin2Ctx, system: true }))) === 'FORBIDDEN')
  cek('tenant di luar allowlist → NOT_FOUND', (await kode(() => minta(X, g0, X.admin2Ctx))) === 'NOT_FOUND')
  cek('pesan tenant lain → NOT_FOUND', (await kode(() => minta(B, g0, B.admin2Ctx))) === 'NOT_FOUND')
  cek('gerbang menolak SEBELUM menulis (0 approval, pesan tetap PREVIEWED)', (await adm.tahApprovalRequest.count({ where: { tenantId: A.t.id } })) === 0 && (await pesan(g0.mid)).state === 'PREVIEWED')

  // ============================================================================ R
  bagian('[R] Permintaan approval')
  cek('sidik sodoran salah → DITOLAK SNAPSHOT_MISMATCH, tanpa approval', (await AP.mintaApprovalPesanKlien(A.admin2Ctx, { messageId: g0.mid, snapshotFingerprint: 'a'.repeat(64) })).alasan === 'SNAPSHOT_MISMATCH' && (await adm.tahApprovalRequest.count({ where: { tenantId: A.t.id } })) === 0)
  const dDraft = await MS.buatDraftPesanKlien(A.adminCtx, { signalId: (await jadwal(A).then(async (j) => (await konfirmasi(A, j.v), j))).s.id, contactId: await kontak(A, 'CUSTOMER', A.C1.id) })
  cek('pesan DRAFT (belum dipratinjau) → DITOLAK MESSAGE_STATE_INVALID', (await AP.mintaApprovalPesanKlien(A.admin2Ctx, { messageId: dDraft.messageId, snapshotFingerprint: dDraft.snapshotFingerprint })).alasan === 'MESSAGE_STATE_INVALID')
  const t1 = Date.now()
  const r0 = await minta(A, g0)
  const t2 = Date.now()
  const a0 = await approval(r0.approvalRequestId)
  const m0 = await pesan(g0.mid)
  cek('APPROVAL_DIMINTA: kind/kelas/peran/subjek dari definisi beku', r0.hasil === 'APPROVAL_DIMINTA' && a0.kind === 'CLIENT_WA_UPDATE' && a0.actionRisk === 'EXTERNAL_COMMUNICATION' && a0.requiredRoles.join() === 'ADMIN,MANAJER_OPERASI' && a0.subjectType === 'WaClientMessage' && a0.subjectId === g0.mid)
  cek('TTL = 2 jam dari jam server saat diminta', a0.expiresAt.getTime() >= t1 + 2 * JAM && a0.expiresAt.getTime() <= t2 + 2 * JAM, `${a0.expiresAt.getTime() - t1 - 2 * JAM} ms`)
  cek('proposalHash = sidik snapshot; basisFingerprint = sidik sumber; peminta tercatat; idempotencyKey WA2:', a0.proposalHash === m0.snapshotFingerprint && a0.basisFingerprint === m0.sourceFingerprint && a0.originatorUserId === A.admin2Ctx.userId && a0.requestedBy === A.admin2Ctx.userId && a0.idempotencyKey === `WA2:${g0.mid}`)
  cek('status PENDING, eksekusi NOT_APPLICABLE; pesan PENDING_APPROVAL tertaut', a0.status === 'PENDING' && a0.executionStatus === 'NOT_APPLICABLE' && m0.state === 'PENDING_APPROVAL' && m0.approvalRequestId === a0.id)
  cek('usulan & audit tanpa nomor utuh (nomor samaran saja)', !JSON.stringify(a0.proposal).includes(m0.recipientE164Snapshot) && a0.proposal.recipientMasked !== m0.recipientE164Snapshot && !JSON.stringify(await adm.auditLog.findMany({ where: { tenantId: A.t.id, recordId: { in: [a0.id, g0.mid] } } })).includes(m0.recipientE164Snapshot))
  cek('audit WA2_APPROVAL_DIMINTA + WA2_APPROVAL_DITAUTKAN (atomik)', (await jumlahAudit(A, 'WA2_APPROVAL_DIMINTA')) === 1 && (await jumlahAudit(A, 'WA2_APPROVAL_DITAUTKAN')) === 1)
  const r0b = await minta(A, g0)
  cek('IDEMPOTEN: permintaan ulang → SUDAH_ADA, approval sama, tanpa baris baru', r0b.hasil === 'SUDAH_ADA' && r0b.approvalRequestId === a0.id && (await adm.tahApprovalRequest.count({ where: { subjectId: g0.mid } })) === 1)
  let gandaMinta = 0
  for (let i = 0; i < 6; i++) {
    const p = await siapPesan(A)
    const hs = await Promise.all([coba(() => minta(A, p)), coba(() => minta(A, p)), coba(() => minta(A, p))])
    const baris = await adm.tahApprovalRequest.count({ where: { subjectId: p.mid } })
    if (baris !== 1 || hs.some((h) => !h.ok) || hs.filter((h) => h.nilai.hasil === 'APPROVAL_DIMINTA').length !== 1) gandaMinta++
  }
  cek('KONKURENSI: 6× tiga permintaan bersamaan → tepat 1 approval; 1 DIMINTA + 2 SUDAH_ADA; 0 galat', gandaMinta === 0, `anomali ${gandaMinta}`)
  const rk = await siapPesan(A)
  const kfR = (await adm.voyageScheduleConfirmation.findFirst({ where: { voyageId: rk.v.id } })).id
  await KJ.invalidasiKonfirmasiJadwal(A.manajerCtx, kfR, { alasan: 'Keliru (uji).' })
  const hrk = await minta(A, rk)
  cek('revalidasi saat permintaan: konfirmasi diinvalidasi → DITAHAN NEEDS_REVIEW, TANPA approval', hrk.hasil === 'DITAHAN' && hrk.alasan === 'CONFIRMATION_INVALIDATED' && (await pesan(rk.mid)).state === 'NEEDS_REVIEW' && (await adm.tahApprovalRequest.count({ where: { subjectId: rk.mid } })) === 0)

  // ============================================================================ M
  bagian('[M] Maker-checker atas bukti aktual (K5) — DB')
  const pm = await siapPending(A)
  const pm0 = await approval(pm.aid)
  const matriksDb = [
    ['pembuat draft', A.adminCtx, 'CHECKER_IS_MAKER'],
    ['peminta approval (juga pemberi preview)', A.admin2Ctx, 'SELF_APPROVAL_FORBIDDEN'],
    ['pencatat konfirmasi ETA', A.manajerCtx, 'CHECKER_IS_EVIDENCE_RECORDER'],
    ['peran OPERATOR', { ...A.checkerCtx, role: 'OPERATOR' }, 'FORBIDDEN'],
    ['konteks sistem', { ...A.checkerCtx, system: true }, 'FORBIDDEN'],
  ]
  for (const [nama, ctx, harap] of matriksDb) {
    cek(`SETUJU oleh ${nama} → ${harap}`, (await kode(() => setujui(A, pm, ctx))) === harap)
    cek(`TOLAK oleh ${nama} → ${harap}`, (await kode(() => tolak(A, pm, ctx))) === harap)
  }
  cek('checker tenant lain → NOT_FOUND', (await kode(() => setujui(A, pm, B.checkerCtx))) === 'NOT_FOUND')
  cek('proposalHash yang tidak dilihat → DITOLAK PROPOSAL_HASH_MISMATCH', (await setujui(A, pm, A.checkerCtx, 'b'.repeat(64))).alasan === 'PROPOSAL_HASH_MISMATCH')
  const pm1 = await approval(pm.aid)
  cek('semua penolakan otorisasi di atas: TANPA mutasi (versi approval & pesan tetap)', pm1.status === 'PENDING' && pm1.version === pm0.version && (await pesan(pm.mid)).state === 'PENDING_APPROVAL')
  const pml = await siapPending(A, { jenis: 'ALL_FAST' })
  cek('milestone: pencatat peristiwa sebagai checker → CHECKER_IS_EVIDENCE_RECORDER', (await kode(() => setujui(A, pml, { ...A.checkerCtx, userId: 'u-pencatat' }))) === 'CHECKER_IS_EVIDENCE_RECORDER')
  const ppv = await siapPending(A, { previewCtx: A.prevCtx })
  cek('pemberi preview (bukan peminta/pembuat/pencatat) BOLEH menyetujui', (await setujui(A, ppv, A.prevCtx)).hasil === 'DISETUJUI')

  // ============================================================================ A
  bagian('[A] Setujui — berhenti di APPROVED')
  const hs = await setujui(A, pm)
  const as = await approval(pm.aid)
  const ms = await pesan(pm.mid)
  cek('DISETUJUI: approval APPROVED + eksekusi NOT_STARTED + pemutus tercatat', hs.hasil === 'DISETUJUI' && as.status === 'APPROVED' && as.executionStatus === 'NOT_STARTED' && as.decidedByUserId === A.checkerCtx.userId && as.decidedAt instanceof Date)
  cek('pesan APPROVED (approvedBy/At), activeKey tetap, successKey kosong — TIDAK ada pengiriman', ms.state === 'APPROVED' && ms.approvedByUserId === A.checkerCtx.userId && ms.approvedAt instanceof Date && ms.activeKey === ms.logicalMessageKey && ms.successKey === null)
  cek('audit WA2_APPROVAL_DISETUJUI + WA2_PESAN_DISETUJUI', (await jumlahAudit(A, 'WA2_APPROVAL_DISETUJUI')) >= 1 && (await jumlahAudit(A, 'WA2_PESAN_DISETUJUI')) >= 1)
  cek('keputusan ulang → SUDAH_DIPUTUSKAN (tanpa mutasi)', (await setujui(A, pm)).hasil === 'SUDAH_DIPUTUSKAN' && (await approval(pm.aid)).version === as.version)
  const hml = await setujui(A, pml)
  cek('milestone (checker sah) → DISETUJUI', hml.hasil === 'DISETUJUI', JSON.stringify(hml))

  // ============================================================================ V
  bagian('[V] Revalidasi saat keputusan (K2/K7) — approval tertaut dihentikan atomik')
  const kasus = async (nama, o, ubah, harapHasil, harapState, harapAlasanSatu) => {
    const harapAlasan = [harapAlasanSatu].flat()
    const p = await siapPending(A, o)
    await ubah(p)
    const h = await setujui(A, p)
    const a = await approval(p.aid)
    const m = await pesan(p.mid)
    cek(`${nama} → ${harapHasil} ${harapState} (${harapAlasan.join('|')}); approval CANCELLED`, h.hasil === harapHasil && harapAlasan.includes(h.alasan) && m.state === harapState && a.status === 'CANCELLED' && (harapState !== 'BLOCKED' || m.activeKey === null), `${h.hasil}/${h.alasan} ${m.state} ${a.status}`)
  }
  await kasus('konfirmasi diinvalidasi', {}, async (p) => KJ.invalidasiKonfirmasiJadwal(A.manajerCtx, (await adm.voyageScheduleConfirmation.findFirst({ where: { voyageId: p.v.id } })).id, { alasan: 'Keliru (uji).' }), 'DITAHAN', 'NEEDS_REVIEW', 'CONFIRMATION_INVALIDATED')
  await kasus('K7: konfirmasi BARU setelah preview (bukti berubah)', {}, (p) => konfirmasi(A, p.v, A.adminCtx, { sourceNote: 'Email agen terbaru (uji sintetis).' }), 'DITAHAN', 'NEEDS_REVIEW', 'EVIDENCE_CHANGED')
  await kasus('versi consent berubah (OPT_IN tetap, versi ≠ snapshot)', {}, (p) => adm.waConsentState.updateMany({ where: { contactId: p.cid }, data: { version: { increment: 1 } } }), 'DITAHAN', 'NEEDS_REVIEW', 'CONSENT_CHANGED')
  await kasus('masa verifikasi kontak habis', {}, (p) => adm.waContact.update({ where: { id: p.cid }, data: { verificationExpiresAt: new Date(Date.now() - 1000) } }), 'DITAHAN', 'NEEDS_REVIEW', 'CONTACT_INELIGIBLE')
  await kasus('principal voyage dipindah', { jenis: 'EOSP' }, (p) => adm.voyage.update({ where: { id: p.v.id }, data: { principalId: A.P2.id } }), 'DITAHAN', 'NEEDS_REVIEW', 'ACCESS_DENIED')
  await kasus('grant kedaluwarsa (ACTIVE di DB)', { jenis: 'EOSP' }, (p) => adm.waPrincipalAccessGrant.update({ where: { id: p.grantId }, data: { validUntil: new Date(Date.now() - 1000) } }), 'DITAHAN', 'NEEDS_REVIEW', 'ACCESS_DENIED')
  await kasus('sumber berubah (ETA diganti)', {}, (p) => adm.voyage.update({ where: { id: p.v.id }, data: { eta: new Date('2026-10-19T00:00:00Z') } }), 'DIBLOKIR', 'BLOCKED', ['SOURCE_CHANGED', 'SOURCE_INVALID'])
  await kasus('milestone dihapus lewat service operasional', { jenis: 'SAILED' }, (p) => VE.removeVoyageEvent(A.adminCtx, p.v.id, p.e.id), 'DIBLOKIR', 'BLOCKED', 'SOURCE_INVALID')
  await kasus('milestone GANDA dicatat lewat service operasional', { jenis: 'ALL_FAST' }, (p) => VE.createVoyageEvent(A.adminCtx, p.v.id, { eventCode: 'ALL_FAST', occurredAt: new Date(Date.now() - JAM).toISOString() }), 'DIBLOKIR', 'BLOCKED', 'EVENT_DUPLICATE')
  const tinggal = 6000
  const pkf = await jadwal(A, { auditPada: new Date(Date.now() - 13 * JAM) })
  await adm.voyageScheduleConfirmation.create({ data: { tenantId: A.t.id, voyageId: pkf.v.id, field: 'eta', confirmedValue: new Date(`${ETA_BARU}T00:00:00Z`), confirmedAt: new Date(Date.now() - 12 * JAM + tinggal), confirmedByUserId: A.manajerCtx.userId, sourceKind: 'MASTER_OR_SHIP', sourceNote: 'Hampir kedaluwarsa (uji sintetis).' } })
  await kasus('konfirmasi melewati 12 jam di antara permintaan & keputusan', { sumber: pkf }, () => tidur(tinggal + 500), 'DITAHAN', 'NEEDS_REVIEW', 'CONFIRMATION_EXPIRED')
  await kasus('milestone melewati 24 jam di antara permintaan & keputusan', { jenis: 'EOSP', jamLalu: 24 - tinggal / JAM }, () => tidur(tinggal + 500), 'DITAHAN', 'NEEDS_REVIEW', 'EVENT_TOO_OLD')
  const ps = await siapPending(A)
  await adm.tahApprovalRequest.update({ where: { id: ps.aid }, data: { proposalHash: 'c'.repeat(64) } })
  const hsn = await setujui(A, ps, A.checkerCtx, 'c'.repeat(64))
  cek('proposalHash approval ≠ sidik pesan (disunting di DB) → DIBLOKIR SNAPSHOT_MISMATCH', hsn.hasil === 'DIBLOKIR' && hsn.alasan === 'SNAPSHOT_MISMATCH' && (await pesan(ps.mid)).state === 'BLOCKED' && (await approval(ps.aid)).status === 'CANCELLED')
  const pk = await siapPending(A)
  await adm.tahApprovalRequest.update({ where: { id: pk.aid }, data: { kind: 'WA_INTERNAL_FAKE_TEST' } })
  cek('kind approval disunting → FORBIDDEN APPROVAL_POLICY_MISMATCH tanpa mutasi', (await kode(() => setujui(A, pk))) === 'APPROVAL_POLICY_MISMATCH' && (await pesan(pk.mid)).state === 'PENDING_APPROVAL' && (await approval(pk.aid)).status === 'PENDING')
  await adm.tahApprovalRequest.update({ where: { id: pk.aid }, data: { kind: 'CLIENT_WA_UPDATE' } })

  // ============================================================================ E
  bagian('[T] Freshness pada jam keputusan — transaksi ditahan kunci sampai bukti melewati batas (perbaikan pra-merge #1)')
  // Baris WaContact dipegang FOR UPDATE oleh transaksi lain → setujui MENUNGGU di kunci pertamanya (kontak SHARE).
  // Bukti masih segar saat setujui dimulai, kedaluwarsa selama menunggu. Uji memvalidasi dirinya sendiri: bukti
  // HARUS segar saat mulai dan HARUS lewat batas saat kunci dilepas — selain itu uji dianggap tidak sah (gagal).
  // Tahanan < 5 s: transaksi interaktif Prisma service bertimeout bawaan 5000 ms (tahanan lebih lama → rollback, juga
  // gagal tertutup — diuji terpisah di bawah). Bukti dijadwalkan habis ±1,2 s setelah setujui mulai menunggu.
  const TAHAN = 3000
  const SISA = 1200
  const tahanLalu = async (p, batas) => {
    let hasil
    if (batas !== null && batas - Date.now() > SISA) await tidur(batas - Date.now() - SISA)
    const mulai = Date.now()
    const r = await adm.$transaction(async (tx) => {
      await tx.$queryRawUnsafe('SELECT "id" FROM "WaContact" WHERE "id" = $1 FOR UPDATE', p.cid)
      const jalan = setujui(A, p).then((h) => { hasil = h }, (e) => { hasil = { galat: String(e?.details?.code ?? e?.message ?? e) } })
      await tidur(TAHAN)
      return { jalan, menunggu: hasil === undefined }
    }, { timeout: 30_000 })
    const lepas = Date.now()
    await r.jalan
    return { hasil, menunggu: r.menunggu, segarSaatMulai: batas === null || mulai < batas - 300, lewatSaatLepas: batas === null || lepas > batas + 300 }
  }
  const kasusTahan = async (nama, siap, harapHasil, harapAlasan) => {
    const { p, batas } = await siap()
    const t = await tahanLalu(p, batas)
    const k = await keadaan(p)
    const sah = t.menunggu && t.segarSaatMulai && t.lewatSaatLepas
    const ok = harapHasil === 'DISETUJUI' ? t.hasil?.hasil === 'DISETUJUI' && k === 'APPROVED/APPROVED/NOT_STARTED' : t.hasil?.hasil === harapHasil && t.hasil?.alasan === harapAlasan && !k.includes('APPROVED/NOT_STARTED')
    cek(`${nama} → ${harapHasil}${harapAlasan ? ` ${harapAlasan}` : ''}`, sah && ok, `menunggu=${t.menunggu} segarAwal=${t.segarSaatMulai} lewatAkhir=${t.lewatSaatLepas} hasil=${JSON.stringify(t.hasil)} keadaan=${k}`)
  }
  const LONGGAR = 8000 // cukup untuk menyiapkan fixture; sisa diatur tahanLalu
  await kasusTahan('konfirmasi ETA melewati 12 jam selama menunggu kunci', async () => {
    const src = await jadwal(A, { auditPada: new Date(Date.now() - 13 * JAM) })
    const konf = new Date(Date.now() - 12 * JAM + LONGGAR)
    await adm.voyageScheduleConfirmation.create({ data: { tenantId: A.t.id, voyageId: src.v.id, field: 'eta', confirmedValue: new Date(`${ETA_BARU}T00:00:00Z`), confirmedAt: konf, confirmedByUserId: A.manajerCtx.userId, sourceKind: 'MASTER_OR_SHIP', sourceNote: 'Batas 12 jam (uji adversarial).' } })
    const p = await siapPending(A, { sumber: src })
    return { p, batas: konf.getTime() + 12 * JAM }
  }, 'DITAHAN', 'CONFIRMATION_EXPIRED')
  await kasusTahan('milestone melewati 24 jam selama menunggu kunci', async () => {
    const p = await siapPending(A, { jenis: 'EOSP', jamLalu: 24 - LONGGAR / JAM })
    return { p, batas: p.e.occurredAt.getTime() + 24 * JAM }
  }, 'DITAHAN', 'EVENT_TOO_OLD')
  await kasusTahan('verifikasi kontak kedaluwarsa selama menunggu kunci', async () => {
    const p = await siapPending(A)
    const exp = new Date(Date.now() + SISA)
    await adm.waContact.update({ where: { id: p.cid }, data: { verificationExpiresAt: exp } })
    return { p, batas: exp.getTime() }
  }, 'DITAHAN', 'CONTACT_INELIGIBLE')
  await kasusTahan('grant snapshot kedaluwarsa selama menunggu kunci', async () => {
    const p = await siapPending(A, { jenis: 'EOSP' })
    const exp = new Date(Date.now() + SISA)
    await adm.waPrincipalAccessGrant.update({ where: { id: p.grantId }, data: { validUntil: exp } })
    return { p, batas: exp.getTime() }
  }, 'DITAHAN', 'ACCESS_DENIED')
  await kasusTahan('TTL approval 2 jam lewat selama menunggu kunci', async () => {
    const p = await siapPending(A)
    const exp = new Date(Date.now() + SISA)
    await adm.tahApprovalRequest.update({ where: { id: p.aid }, data: { expiresAt: exp } })
    return { p, batas: exp.getTime() }
  }, 'KEDALUWARSA', undefined)
  {
    const p = await siapPending(A)
    let hasil
    await adm.$transaction(async (tx) => {
      await tx.$queryRawUnsafe('SELECT "id" FROM "WaContact" WHERE "id" = $1 FOR UPDATE', p.cid)
      const jalan = setujui(A, p).then((h) => { hasil = h }, (e) => { hasil = { galat: String(e?.message ?? e).slice(0, 80) } })
      await tidur(6500)
      return { jalan }
    }, { timeout: 30_000 }).then((r) => r.jalan)
    await tidur(300)
    cek('tahanan > 5 s (timeout transaksi service) → setujui GAGAL & di-rollback, approval tetap PENDING (gagal tertutup)', !hasil?.hasil && (await keadaan(p)) === 'PENDING_APPROVAL/PENDING/NOT_APPLICABLE', JSON.stringify(hasil).slice(0, 120))
  }
  await kasusTahan('BATAS BELUM TERLEWATI (konfirmasi segar, verifikasi/grant/TTL jauh) walau menunggu kunci', async () => ({ p: await siapPending(A, { jenis: 'jadwal' }), batas: null }), 'DISETUJUI', undefined)
  await kasusTahan('BATAS BELUM TERLEWATI (milestone segar, grant jauh) walau menunggu kunci', async () => ({ p: await siapPending(A, { jenis: 'ALL_FAST' }), batas: null }), 'DISETUJUI', undefined)

  bagian('[E] Kedaluwarsa (K11)')
  const pe = await siapPending(A)
  await adm.tahApprovalRequest.update({ where: { id: pe.aid }, data: { expiresAt: new Date(Date.now() - 1) } })
  const he = await setujui(A, pe)
  const ae = await approval(pe.aid)
  const me = await pesan(pe.mid)
  cek('lewat expiresAt (−1 ms) → KEDALUWARSA: approval EXPIRED, pesan EXPIRED (activeKey dilepas)', he.hasil === 'KEDALUWARSA' && ae.status === 'EXPIRED' && me.state === 'EXPIRED' && me.activeKey === null && me.finalizedAt instanceof Date)
  cek('EXPIRED terminal: setujui/tolak berikutnya → SUDAH_DIPUTUSKAN; batal → DITOLAK', (await setujui(A, pe)).hasil === 'SUDAH_DIPUTUSKAN' && (await tolak(A, pe)).hasil === 'SUDAH_DIPUTUSKAN' && (await batal(A, pe)).hasil === 'DITOLAK')
  const pe2 = await siapPending(A)
  await adm.tahApprovalRequest.update({ where: { id: pe2.aid }, data: { expiresAt: new Date(Date.now() - 1) } })
  cek('tolak setelah kedaluwarsa → KEDALUWARSA (bukan REJECTED)', (await tolak(A, pe2)).hasil === 'KEDALUWARSA' && (await approval(pe2.aid)).status === 'EXPIRED')
  const pe3 = await siapPending(A)
  await adm.tahApprovalRequest.update({ where: { id: pe3.aid }, data: { expiresAt: new Date(Date.now() + 60_000) } })
  cek('belum lewat (+60 s) → DISETUJUI', (await setujui(A, pe3)).hasil === 'DISETUJUI')
  const reDraft = await MS.buatDraftPesanKlien(A.adminCtx, { signalId: pe.s.id, contactId: pe.cid })
  cek('pemulihan EXPIRED = revisi BARU (draft baru, revisi lebih tinggi)', reDraft.hasil === 'DRAFT_DIBUAT' && reDraft.revision > me.revision && (await pesan(pe.mid)).state === 'EXPIRED')

  // ============================================================================ J/C/S
  bagian('[J] Tolak · [C] Batal (K6) · [S] Revisi menggantikan')
  const pj = await siapPending(A)
  cek('catatan penolakan wajib', (await kode(() => AP.tolakPesanKlien(A.checkerCtx, { approvalRequestId: pj.aid, proposalHash: pj.hash, decisionNote: '' }))) === 'DECISION_NOTE_INVALID')
  const hj = await tolak(A, pj)
  cek('DITOLAK_PEMUTUS: approval REJECTED, pesan REJECTED (activeKey dilepas)', hj.hasil === 'DITOLAK_PEMUTUS' && (await keadaan(pj)) === 'REJECTED/REJECTED/NOT_APPLICABLE' && (await pesan(pj.mid)).activeKey === null)
  const pc1 = await siapPending(A)
  const hc1 = await batal(A, pc1)
  cek('batal PENDING_APPROVAL → pesan CANCELED + approval CANCELLED', hc1.hasil === 'DIBATALKAN' && hc1.approvalDihentikan === true && (await keadaan(pc1)) === 'CANCELED/CANCELLED/NOT_APPLICABLE')
  const pc2 = await siapPending(A)
  await setujui(A, pc2)
  cek('batal APPROVED → pesan CANCELED + eksekusi CANCELLED (keputusan APPROVED final)', (await batal(A, pc2)).hasil === 'DIBATALKAN' && (await keadaan(pc2)) === 'CANCELED/APPROVED/CANCELLED')
  cek('batal berulang → SUDAH_DIBATALKAN; batal pesan REJECTED → DITOLAK', (await batal(A, pc2)).hasil === 'SUDAH_DIBATALKAN' && (await batal(A, pj)).hasil === 'DITOLAK')
  const pc3 = await siapPesan(A)
  cek('batal PREVIEWED tanpa approval → CANCELED', (await batal(A, pc3)).hasil === 'DIBATALKAN' && (await pesan(pc3.mid)).state === 'CANCELED')
  const pr1 = await siapPending(A)
  await konfirmasi(A, pr1.v, A.adminCtx, { sourceNote: 'Konfirmasi pengganti (uji sintetis).' })
  const hr1 = await MS.buatDraftPesanKlien(A.adminCtx, { signalId: pr1.s.id, contactId: pr1.cid })
  cek('revisi baru atas PENDING_APPROVAL → lama CANCELED (REVISION_SUPERSEDED) + approval SUPERSEDED, atomik', hr1.hasil === 'DRAFT_DIBUAT' && hr1.revisiDigantikan === pr1.mid && (await keadaan(pr1)) === 'CANCELED/SUPERSEDED/NOT_APPLICABLE' && (await pesan(pr1.mid)).reasonCode === 'REVISION_SUPERSEDED')
  const pr2 = await siapPending(A)
  await setujui(A, pr2)
  await konfirmasi(A, pr2.v, A.adminCtx, { sourceNote: 'Konfirmasi pengganti 2 (uji sintetis).' })
  await MS.buatDraftPesanKlien(A.adminCtx, { signalId: pr2.s.id, contactId: pr2.cid })
  cek('revisi baru atas APPROVED → lama CANCELED + eksekusi CANCELLED', (await keadaan(pr2)) === 'CANCELED/APPROVED/CANCELLED')
  cek('keputusan atas approval yang sudah digantikan → SUDAH_DIPUTUSKAN', (await setujui(A, pr1)).hasil === 'SUDAH_DIPUTUSKAN')

  // ============================================================================ H
  bagian('[H] Hold 2C/2E menghentikan approval tertaut (K3)')
  const ph1 = await siapPending(A)
  await CS.catatOptOut(A.adminCtx, ph1.cid, { kanal: 'WHATSAPP', bukti: 'STOP (uji sintetis).' })
  cek('opt-out atas PENDING → approval CANCELLED + pesan NEEDS_REVIEW', (await keadaan(ph1)) === 'NEEDS_REVIEW/CANCELLED/NOT_APPLICABLE')
  const ph2 = await siapPending(A)
  await setujui(A, ph2)
  await CS.catatOptOut(A.adminCtx, ph2.cid, { kanal: 'WHATSAPP', bukti: 'STOP (uji sintetis).' })
  cek('opt-out atas APPROVED → eksekusi CANCELLED + pesan NEEDS_REVIEW', (await keadaan(ph2)) === 'NEEDS_REVIEW/APPROVED/CANCELLED')
  const ph3 = await siapPending(A)
  await KT.cabutVerifikasi(A.adminCtx, ph3.cid, { alasan: 'PIC_CHANGED_COMPANY', catatan: 'PIC pindah perusahaan (uji).' })
  cek('cabut verifikasi → approval CANCELLED + NEEDS_REVIEW', (await keadaan(ph3)) === 'NEEDS_REVIEW/CANCELLED/NOT_APPLICABLE')
  const ph4 = await siapPending(A)
  await setujui(A, ph4)
  await KT.nonaktifkanKontak(A.adminCtx, ph4.cid, { alasan: 'Kontak tidak aktif (uji).' })
  cek('nonaktifkan kontak atas APPROVED → eksekusi CANCELLED + NEEDS_REVIEW', (await keadaan(ph4)) === 'NEEDS_REVIEW/APPROVED/CANCELLED')
  const ph5 = await siapPending(A, { jenis: 'EOSP' })
  await GS.cabutGrant(A.adminCtx, ph5.grantId, { alasan: 'Hubungan berakhir (uji).' })
  cek('cabut grant → approval CANCELLED + NEEDS_REVIEW', (await keadaan(ph5)) === 'NEEDS_REVIEW/CANCELLED/NOT_APPLICABLE')
  cek('keputusan setelah hold → SUDAH_DIPUTUSKAN (tak menghidupkan kembali)', (await setujui(A, ph1)).hasil === 'SUDAH_DIPUTUSKAN' && (await setujui(A, ph5)).hasil === 'SUDAH_DIPUTUSKAN')
  cek('audit WA2_APPROVAL_DIHENTIKAN per pesan + label WA-1 (WA1_APPROVAL_DIHENTIKAN / WA1_EKSEKUSI_DIBATALKAN) dari penghenti bersama', (await jumlahAudit(A, 'WA2_APPROVAL_DIHENTIKAN')) >= 10 && (await jumlahAudit(A, 'WA1_APPROVAL_DIHENTIKAN')) >= 5 && (await jumlahAudit(A, 'WA1_EKSEKUSI_DIBATALKAN')) >= 3)

  // ============================================================================ K1
  bagian('[K1] Kunci Voyage pada penulis VoyageEvent — kedua urutan')
  const pk1 = await siapPending(A, { jenis: 'ALL_FAST' })
  const tungguPenulis = async (aksi) => {
    let selesai = false
    const r = await adm.$transaction(async (tx) => {
      await tx.$queryRawUnsafe('SELECT "id" FROM "Voyage" WHERE "id" = $1 FOR SHARE', pk1.v.id)
      const jalan = aksi().then(() => {
        selesai = true
      })
      await tidur(800)
      return { jalan, menunggu: !selesai }
    }, { timeout: 15_000 })
    await r.jalan
    return r.menunggu && selesai
  }
  const vk = await milestone(A, 'EOSP')
  cek('createVoyageEvent MENUNGGU selama pembaca WA-2 memegang Voyage FOR SHARE, lalu berhasil', await tungguPenulis(async () => {
    await adm.$executeRawUnsafe('SELECT 1')
    await VE.createVoyageEvent(A.adminCtx, pk1.v.id, { eventCode: 'COMPLETED', occurredAt: new Date(Date.now() - JAM).toISOString() })
  }))
  const evHapus = await VE.createVoyageEvent(A.adminCtx, pk1.v.id, { eventCode: 'NOR_TENDERED', occurredAt: new Date(Date.now() - JAM).toISOString() })
  cek('removeVoyageEvent MENUNGGU selama pembaca WA-2 memegang Voyage FOR SHARE, lalu berhasil', await tungguPenulis(() => VE.removeVoyageEvent(A.adminCtx, pk1.v.id, evHapus.id)))
  let hasilK1
  const balik = await adm.$transaction(async (tx) => {
    await tx.$queryRawUnsafe('SELECT "id" FROM "Voyage" WHERE "id" = $1 FOR NO KEY UPDATE', pk1.v.id)
    await tx.voyageEvent.create({ data: { tenantId: A.t.id, voyageId: pk1.v.id, eventCode: 'ALL_FAST', occurredAt: new Date(Date.now() - JAM), recordedByUserId: 'u-lain' } })
    const jalan = setujui(A, pk1).then((h) => {
      hasilK1 = h
    })
    await tidur(800)
    return { jalan, menunggu: hasilK1 === undefined }
  }, { timeout: 15_000 })
  await balik.jalan
  cek('urutan sebaliknya: keputusan MENUNGGU penulis yang belum commit, lalu MELIHAT sisipan ganda → DIBLOKIR EVENT_DUPLICATE', balik.menunggu && hasilK1?.hasil === 'DIBLOKIR' && hasilK1?.alasan === 'EVENT_DUPLICATE' && (await approval(pk1.aid)).status === 'CANCELLED', JSON.stringify(hasilK1))
  cek('perilaku operasional: voyage tenant lain / terhapus → NOT_FOUND; kode asing → VALIDATION (tak berubah)', (await kode(() => VE.createVoyageEvent(B.adminCtx, vk.v.id, { eventCode: 'EOSP', occurredAt: new Date().toISOString() }))) === 'NOT_FOUND' && (await kode(() => VE.createVoyageEvent(A.adminCtx, vk.v.id, { eventCode: 'ASING', occurredAt: new Date().toISOString() }))) === 'VALIDATION')
  const rowOk = await VE.createVoyageEvent(A.adminCtx, vk.v.id, { eventCode: 'COMPLETED', occurredAt: new Date(Date.now() - JAM).toISOString(), remarks: 'uji' })
  cek('createVoyageEvent mengembalikan baris bernama pencatat seperti sebelumnya (source MANUAL)', rowOk.source === 'MANUAL' && rowOk.recordedByUserId === A.adminCtx.userId && rowOk.remarks === 'uji' && 'recordedByName' in rowOk)

  // ============================================================================ K
  bagian('[K] Konkurensi nyata (service ∥ service)')
  // Jeda bertingkat pada aksi lawan: 0 ms → aksi lawan biasanya mengunci dulu; jeda besar → setujui mengunci dulu.
  // Kedua urutan WAJIB muncul (sebaran dicek), bukan hanya satu urutan yang selalu menang.
  const JEDA = [0, 0, 20, 40, 80, 120, 200, 300, 400, 600]
  const N = JEDA.length
  const putaran = async (nama, siap, aksiLain, sahFn, keduaUrutan = true, jedaUtama = JEDA.map(() => 0)) => {
    let anomali = 0
    const rinci = []
    const sebaran = {}
    for (let i = 0; i < N; i++) {
      const p = await siap()
      const [h1, h2] = await Promise.all([tidur(jedaUtama[i]).then(() => coba(() => setujui(A, p))), tidur(jedaUtama[i] > 0 ? 0 : JEDA[i]).then(() => coba(() => aksiLain(p)))])
      const k = await keadaan(p)
      sebaran[k] = (sebaran[k] ?? 0) + 1
      const ok = sahFn(h1, h2, k, p)
      if (!(await ok)) {
        anomali++
        rinci.push(`${k} ${h1.ok ? h1.nilai.hasil : h1.kode} ${h2.ok ? h2.nilai?.hasil ?? 'ok' : h2.kode}`)
      }
    }
    cek(`${nama} (${N}×)`, anomali === 0, rinci.slice(0, 3).join(' | ') || `konsisten; sebaran ${JSON.stringify(sebaran)}`)
    if (keduaUrutan) cek(`  ↳ kedua urutan benar-benar terjadi (≥ 2 hasil akhir berbeda)`, Object.keys(sebaran).length >= 2, JSON.stringify(sebaran))
  }
  await putaran('setujui ∥ opt-out → tak pernah APPROVED aktif dengan consent OPT_OUT', () => siapPending(A), (p) => CS.catatOptOut(A.adminCtx, p.cid, { kanal: 'WHATSAPP', bukti: 'STOP (uji).' }), async (h1, h2, k) => h2.ok && (h1.ok || h1.kode === 'CONCURRENCY_CONFLICT') && ['NEEDS_REVIEW/APPROVED/CANCELLED', 'NEEDS_REVIEW/CANCELLED/NOT_APPLICABLE'].includes(k))
  await putaran('setujui ∥ cabut grant → tak pernah APPROVED aktif dengan grant REVOKED', () => siapPending(A, { jenis: 'EOSP' }), (p) => GS.cabutGrant(A.adminCtx, p.grantId, { alasan: 'Dicabut bersamaan (uji).' }), async (h1, h2, k) => h2.ok && ['NEEDS_REVIEW/APPROVED/CANCELLED', 'NEEDS_REVIEW/CANCELLED/NOT_APPLICABLE'].includes(k))
  await putaran('setujui ∥ batal → pesan CANCELED & approval tak aktif', () => siapPending(A), (p) => batal(A, p), async (h1, h2, k) => h2.ok && ['CANCELED/APPROVED/CANCELLED', 'CANCELED/CANCELLED/NOT_APPLICABLE'].includes(k))
  // Revisi baru hanya terjadi bila bukti berubah → setujui yang mengunci duluan menangkap EVIDENCE_CHANGED (NEEDS_REVIEW,
  // approval CANCELLED) lalu revisi menggantikan; atau revisi duluan → SUPERSEDED. APPROVED tak mungkin (bukti beda).
  await putaran('setujui ∥ revisi baru → revisi lama CANCELED & approval tak aktif', async () => {
    const p = await siapPending(A)
    await konfirmasi(A, p.v, A.adminCtx, { sourceNote: `Pengganti ${++seq} (uji sintetis).` })
    return p
  }, (p) => MS.buatDraftPesanKlien(A.adminCtx, { signalId: p.s.id, contactId: p.cid }), async (h1, h2, k) => h2.ok && ['CANCELED/APPROVED/CANCELLED', 'CANCELED/SUPERSEDED/NOT_APPLICABLE', 'CANCELED/CANCELLED/NOT_APPLICABLE'].includes(k) && (k !== 'CANCELED/CANCELLED/NOT_APPLICABLE' || (h1.ok && h1.nilai.alasan === 'EVIDENCE_CHANGED')))
  await putaran('setujui ∥ sisipan milestone ganda (service) → APPROVED (sisipan sesudah commit) atau BLOCKED EVENT_DUPLICATE', () => siapPending(A, { jenis: 'ALL_FAST' }), (p) => VE.createVoyageEvent(A.adminCtx, p.v.id, { eventCode: 'ALL_FAST', occurredAt: new Date(Date.now() - JAM).toISOString() }), async (h1, h2, k) => h1.ok && h2.ok && (k === 'APPROVED/APPROVED/NOT_STARTED' || (k === 'BLOCKED/CANCELLED/NOT_APPLICABLE' && h1.nilai.alasan === 'EVENT_DUPLICATE')))
  await putaran('setujui ∥ hapus milestone sumber (service) → APPROVED atau BLOCKED', () => siapPending(A, { jenis: 'SAILED' }), (p) => VE.removeVoyageEvent(A.adminCtx, p.v.id, p.e.id), async (h1, h2, k) => h1.ok && h2.ok && ['APPROVED/APPROVED/NOT_STARTED', 'BLOCKED/CANCELLED/NOT_APPLICABLE'].includes(k))
  const pemenang = new Set()
  await putaran('dua checker bersamaan → tepat satu DISETUJUI, pemutus tunggal', () => siapPending(A), (p) => setujui(A, p, A.checker2Ctx), async (h1, h2, k, p) => {
    const hasil = [h1, h2].map((h) => (h.ok ? h.nilai.hasil : h.kode))
    const a = await approval(p.aid)
    pemenang.add(a.decidedByUserId)
    return k === 'APPROVED/APPROVED/NOT_STARTED' && hasil.filter((x) => x === 'DISETUJUI').length === 1 && hasil.every((x) => ['DISETUJUI', 'SUDAH_DIPUTUSKAN', 'CONCURRENCY_CONFLICT'].includes(x)) && [A.checkerCtx.userId, A.checker2Ctx.userId].includes(a.decidedByUserId)
  }, false, JEDA.map((j, i) => (i % 2 ? 0 : j)))
  cek('  ↳ kedua checker pernah menang (kedua urutan terjadi)', pemenang.size === 2, [...pemenang].join(','))
  await putaran('setujui ∥ tolak → tepat satu keputusan final', () => siapPending(A), (p) => tolak(A, p, A.checker2Ctx), async (h1, h2, k) => ['APPROVED/APPROVED/NOT_STARTED', 'REJECTED/REJECTED/NOT_APPLICABLE'].includes(k) && [h1, h2].filter((h) => h.ok && ['DISETUJUI', 'DITOLAK_PEMUTUS'].includes(h.nilai.hasil)).length === 1)
  await putaran('setujui ∥ principal dipindah (DB) → konsisten, tanpa deadlock', () => siapPending(A, { jenis: 'EOSP' }), (p) => adm.voyage.update({ where: { id: p.v.id }, data: { principalId: A.P2.id } }), async (h1, h2, k) => h1.ok && h2.ok && ['APPROVED/APPROVED/NOT_STARTED', 'NEEDS_REVIEW/CANCELLED/NOT_APPLICABLE'].includes(k))

  // ============================================================================ RB
  bagian('[RB] Rollback audit — tanpa efek parsial')
  const prb = await siapPending(A)
  await pasangGagalAudit('WA2_PESAN_DISETUJUI')
  const grb = await coba(() => setujui(A, prb))
  await lepasGagalAudit()
  cek('audit setujui gagal → approval tetap PENDING, pesan PENDING_APPROVAL, tanpa audit WA2_APPROVAL_DISETUJUI', !grb.ok && (await keadaan(prb)) === 'PENDING_APPROVAL/PENDING/NOT_APPLICABLE' && (await adm.auditLog.count({ where: { recordId: prb.aid, newValue: { path: ['peristiwa'], equals: 'WA2_APPROVAL_DISETUJUI' } } })) === 0)
  cek('setelah pemicu dilepas, keputusan yang sama berhasil', (await setujui(A, prb)).hasil === 'DISETUJUI')
  const prq = await siapPesan(A)
  await pasangGagalAudit('WA2_APPROVAL_DITAUTKAN')
  const grq = await coba(() => minta(A, prq))
  await lepasGagalAudit()
  cek('audit permintaan gagal → TANPA baris approval, pesan tetap PREVIEWED', !grq.ok && (await adm.tahApprovalRequest.count({ where: { subjectId: prq.mid } })) === 0 && (await pesan(prq.mid)).state === 'PREVIEWED')
  const prh = await siapPending(A)
  const consentSebelum = await adm.waConsentState.findFirst({ where: { contactId: prh.cid } })
  await pasangGagalAudit('WA2_APPROVAL_DIHENTIKAN')
  const grh = await coba(() => CS.catatOptOut(A.adminCtx, prh.cid, { kanal: 'WHATSAPP', bukti: 'STOP (uji).' }))
  await lepasGagalAudit()
  const consentSesudah = await adm.waConsentState.findFirst({ where: { contactId: prh.cid } })
  cek('audit penghentian gagal saat opt-out → opt-out DIBATALKAN UTUH (consent, approval, pesan tak berubah)', !grh.ok && consentSesudah.version === consentSebelum.version && consentSesudah.status === 'OPT_IN' && (await keadaan(prh)) === 'PENDING_APPROVAL/PENDING/NOT_APPLICABLE')
  const prc = await siapPending(A)
  await pasangGagalAudit('WA2_PESAN_DIBATALKAN')
  const grc = await coba(() => batal(A, prc))
  await lepasGagalAudit()
  cek('audit pembatalan gagal → approval & pesan tak berubah', !grc.ok && (await keadaan(prc)) === 'PENDING_APPROVAL/PENDING/NOT_APPLICABLE')

  // ============================================================================ W
  bagian('[W] Diferensial WA-1 — tanpa approval WA-2 lewat jalur WA-1 (dan sebaliknya)')
  const W = await dunia('W')
  setAllowlist(A.t.id, B.t.id, W.t.id)
  const pw = await siapPending(W)
  const aw0 = await approval(pw.aid)
  process.env.WA1_INTERNAL_FAKE_TEST_ENABLED = 'true'
  const w1Setuju = await kode(() => W1A.setujuiPesan(W.checkerCtx, { approvalRequestId: pw.aid }))
  const w1Tolak = await kode(() => W1A.tolakPesan(W.checkerCtx, { approvalRequestId: pw.aid, decisionNote: 'Tolak lewat WA-1 (uji).' }))
  const sW1 = await jadwal(W)
  const pA1 = await W1S.siapkanCandidate(W.adminCtx, { signalId: sW1.s.id })
  const rev = await W1S.buatRevisiPesan(W.adminCtx, { candidateId: pA1.candidateId, recipientFixtureId: 'WA1_TEST_FIXTURE_SUCCESS', language: 'ID' })
  await W1S.tandaiDipratinjau(W.adminCtx, { messageId: rev.messageId, snapshotFingerprint: rev.snapshotFingerprint })
  const ap1 = await W1A.mintaApproval(W.adminCtx, { messageId: rev.messageId })
  delete process.env.WA1_INTERNAL_FAKE_TEST_ENABLED
  const aw1 = await approval(pw.aid)
  cek('WA-1 setujuiPesan / tolakPesan atas approval CLIENT_WA_UPDATE → FORBIDDEN, tanpa mutasi', w1Setuju === 'FORBIDDEN' && w1Tolak === 'FORBIDDEN' && aw1.status === 'PENDING' && aw1.version === aw0.version && (await pesan(pw.mid)).state === 'PENDING_APPROVAL')
  const ap1Row = await approval(ap1.approvalRequestId)
  const w2AtasW1 = await kode(() => AP.setujuiPesanKlien(W.checkerCtx, { approvalRequestId: ap1.approvalRequestId, proposalHash: ap1Row.proposalHash }))
  const w2TolakW1 = await kode(() => AP.tolakPesanKlien(W.checkerCtx, { approvalRequestId: ap1.approvalRequestId, proposalHash: ap1Row.proposalHash, decisionNote: 'Tolak lewat WA-2 (uji).' }))
  const ap1Sesudah = await approval(ap1.approvalRequestId)
  cek('WA-2 setujui/tolak atas approval WA-1 → FORBIDDEN (APPROVAL_POLICY_MISMATCH), tanpa mutasi', w2AtasW1 === 'APPROVAL_POLICY_MISMATCH' && w2TolakW1 === 'APPROVAL_POLICY_MISMATCH' && ap1Sesudah.status === 'PENDING' && ap1Sesudah.version === ap1Row.version)
  process.env.WA1_INTERNAL_FAKE_TEST_ENABLED = 'true'
  const w1Ok = await W1A.setujuiPesan(W.checkerCtx, { approvalRequestId: ap1.approvalRequestId })
  delete process.env.WA1_INTERNAL_FAKE_TEST_ENABLED
  cek('jalur WA-1 atas approval WA-1 tetap berfungsi seperti sebelumnya (DISETUJUI)', w1Ok.hasil === 'DISETUJUI', JSON.stringify(w1Ok))
  cek('approval WA-2 tetap dapat diputus jalur WA-2 (DISETUJUI)', (await setujui(W, pw)).hasil === 'DISETUJUI')

  // ============================================================================ Z
  bagian('[Z] Invarian, egress, isolasi')
  const liar = [...(await approvalLiar(A)), ...(await approvalLiar(W))]
  cek('INVARIAN: tidak ada approval aktif yang subjeknya tidak menunggu/berlaku (dan sebaliknya) — seluruh uji', liar.length === 0, liar.slice(0, 3).map((m) => `${m.id}:${m.state}`).join(', '))
  cek('tidak ada pesan WA-2 di status kirim & tidak ada successKey (F4 berhenti di APPROVED)', (await adm.waClientMessage.count({ where: { tenantId: { in: [A.t.id, W.t.id] }, OR: [{ successKey: { not: null } }, { state: { notIn: ['DRAFT', 'PREVIEWED', 'PENDING_APPROVAL', 'APPROVED', 'NEEDS_REVIEW', 'EXPIRED', 'REJECTED', 'BLOCKED', 'CANCELED'] } }] } })) === 0)
  cek('tidak ada approval WA-2 dengan eksekusi RUNNING/SUCCEEDED', (await adm.tahApprovalRequest.count({ where: { tenantId: { in: [A.t.id, W.t.id] }, kind: 'CLIENT_WA_UPDATE', executionStatus: { in: ['RUNNING', 'SUCCEEDED', 'SUCCEEDED_WITH_WARNINGS'] } } })) === 0)
  cek('NOL panggilan jaringan selama seluruh uji', egress.length === 0, egress.join(','))
  cek('tenant B tidak tersentuh (0 approval, 0 pesan)', (await adm.tahApprovalRequest.count({ where: { tenantId: B.t.id } })) === 0 && (await adm.waClientMessage.count({ where: { tenantId: B.t.id } })) === 0)
} catch (e) {
  gagal++
  console.log(`❌ Uji gagal dijalankan: ${e?.stack ?? e}`)
} finally {
  await bersihkan().catch(() => {})
  await adm.$disconnect()
}

console.log(`\n${gagal === 0 ? '✅ SEMUA LULUS' : '❌ ADA YANG GAGAL'} — lulus ${lulus}, gagal ${gagal}`)
process.exit(gagal === 0 ? 0 : 1)
