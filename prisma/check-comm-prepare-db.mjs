// Uji integrasi DB Step 2C — Prepare / Candidate / Revisi / Pratinjau (TANPA approval, Send, jaringan).
//
// Jalankan (PostgreSQL loopback sekali pakai yang SUDAH `prisma migrate deploy`):
//   COMM_PREPARE_DB_URL=postgresql://postgres@127.0.0.1:55432/maritime_suite \
//     node prisma/check-comm-prepare-db.mjs
// Tanpa COMM_PREPARE_DB_URL → DILEWATI (kode 3).
//
// DITOLAK (DB tak disentuh) bila: host bukan loopback, ada parameter host, NODE_ENV=production,
// DATABASE_URL/DIRECT_URL terset ke DB lain (konfigurasi ambigu). Service dimuat lewat jiti
// (alias @/) dan memakai DB yang SAMA. Semua baris bertanda `WA1S2C-`; dihapus di akhir.
//
// Jujur soal batas Step 2C: revalidasi #1 berjalan pada READ COMMITTED — penghapusan sumber
// yang terjadi SESUDAH revalidasi boleh meninggalkan DRAFT (Step 2C tak punya jalur Send;
// Send 2E wajib merevalidasi). Urutan AuditLog bukan urutan commit yang ketat (D-2C-03).

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
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
const URL_DB = process.env.COMM_PREPARE_DB_URL
if (!URL_DB) {
  console.log('DILEWATI — COMM_PREPARE_DB_URL tidak diset (butuh PostgreSQL loopback sekali pakai).')
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
const { prisma: prismaApp } = jiti('../src/lib/prisma.ts')
const { PrismaClient } = await import('@prisma/client')
const adm = new PrismaClient({ datasources: { db: { url: URL_DB } } })

const TAG = 'WA1S2C-'
let seq = 0
const uid = () => `${TAG}${++seq}`
const hariIni = new Date()
const WAKTU = '2026-10-05T02:30:00.000Z'
const WAKTU_LOKAL = '2026-10-05 10:30 (UTC+08:00, Asia/Makassar)'

const kode = async (fn) => {
  try {
    await fn()
    return null
  } catch (e) {
    return e?.code ?? e?.message ?? 'ERR'
  }
}

async function bersihkan() {
  await adm.$executeRawUnsafe('DROP TRIGGER IF EXISTS wa1s2c_gagal_audit ON "AuditLog"')
  await adm.$executeRawUnsafe('DROP FUNCTION IF EXISTS wa1s2c_gagal_audit()')
  await adm.tenant.deleteMany({ where: { companyName: { startsWith: TAG } } })
}

// ------------------------------------------------------------------ dunia uji
async function dunia(nama) {
  const t = await adm.tenant.create({ data: { companyName: `${TAG}${nama}` } })
  const kapal = await adm.vessel.create({ data: { tenantId: t.id, name: 'MT Contoh Satu' } })
  const port = await adm.port.create({ data: { tenantId: t.id, name: 'Pelabuhan Uji', timezone: 'Asia/Makassar' } })
  return { t, kapal, port, ctx: { tenantId: t.id, userId: `u-${nama}`, role: 'ADMIN' } }
}
const voyage = (w, ubah = {}) =>
  adm.voyage.create({
    data: { tenantId: w.t.id, vesselId: w.kapal.id, portId: w.port.id, voyageNumber: uid(), eta: new Date('2026-10-12T00:00:00Z'), etd: new Date('2026-10-14T00:00:00Z'), ...ubah },
  })
const auditJadwal = (w, v, medan, lama, baru, createdAt = new Date()) =>
  adm.auditLog.create({
    data: { tenantId: w.t.id, tableName: 'Voyage', recordId: v.id, action: 'UPDATE', oldValue: { peristiwa: 'UBAH_TANGGAL', ...lama }, newValue: { peristiwa: 'UBAH_TANGGAL', medan, ...baru }, createdAt },
  })
const sinyal = (w, v, ubah = {}) =>
  adm.monitoringSignal.create({
    data: { tenantId: w.t.id, voyageId: v.id, kind: 'ETA_CHANGED', severity: 'INFO', dedupeKey: uid(), sourceType: 'AUDIT_LOG', explanation: 'uji', recommendation: 'uji', ...ubah },
  })
const peristiwa = (w, v, eventCode, ubah = {}) =>
  adm.voyageEvent.create({ data: { tenantId: w.t.id, voyageId: v.id, eventCode, occurredAt: new Date(WAKTU), recordedByUserId: 'u-uji', ...ubah } })
const sinyalMilestone = (w, v, e, ubah = {}) =>
  sinyal(w, v, { kind: 'OPERATIONAL_EVENT_RECORDED', sourceType: 'VOYAGE_EVENT', sourceRef: e.id, after: { eventCode: e.eventCode, occurredAt: WAKTU }, ...ubah })

/** Sumber jadwal ETA+ETD lengkap: AuditLog + sinyal eta (+etd). */
async function jadwal(w, { medan = ['eta'], lama = { eta: '2026-10-10', etd: '2026-10-11' }, baru = { eta: '2026-10-12', etd: '2026-10-14' }, voyageUbah = {}, stEta = 'OPEN', stEtd = 'OPEN' } = {}) {
  const v = await voyage(w, voyageUbah)
  const a = await auditJadwal(w, v, medan, Object.fromEntries(medan.map((m) => [m, lama[m]])), Object.fromEntries(medan.map((m) => [m, baru[m]])))
  const s = {}
  if (medan.includes('eta')) s.eta = await sinyal(w, v, { sourceRef: a.id, reviewState: stEta, after: { eta: baru.eta } })
  if (medan.includes('etd')) s.etd = await sinyal(w, v, { sourceRef: a.id, reviewState: stEtd, after: { etd: baru.etd } })
  return { v, a, s }
}
async function milestone(w, eventCode = 'EOSP', { voyageUbah = {}, eventUbah = {}, sinyalUbah = {} } = {}) {
  const v = await voyage(w, voyageUbah)
  const e = await peristiwa(w, v, eventCode, eventUbah)
  const s = await sinyalMilestone(w, v, e, sinyalUbah)
  return { v, e, s }
}
const kandidat = (id) => adm.communicationCandidate.findFirst({ where: { id } })
const pesanDari = (candidateId) => adm.communicationMessage.findMany({ where: { candidateId }, orderBy: { revision: 'asc' } })
const jumlahAudit = (peristiwa, recordId) =>
  adm.auditLog.count({ where: { newValue: { path: ['peristiwa'], equals: peristiwa }, ...(recordId ? { recordId } : {}) } })

const badan = (judul, voyageNumber, isi) =>
  ['[SIMULASI INTERNAL — TIDAK DIKIRIM]', judul, `Voyage: ${voyageNumber} | Pelabuhan: Pelabuhan Uji`, 'Yth. Bapak/Ibu,', ...isi, 'Hormat kami', ''].join('\n').replace('Hormat kami\n', 'Hormat kami,\nPT Tribuana Solusi Maritim')
const badanEN = (judul, voyageNumber, isi) =>
  ['[INTERNAL SIMULATION — NOT SENT]', judul, `Voyage: ${voyageNumber} | Port: Pelabuhan Uji`, 'Dear Sir/Madam,', ...isi, 'Regards,', 'PT Tribuana Solusi Maritim'].join('\n')

const SNAPSHOT = ['tenantId', 'candidateId', 'revision', 'logicalMessageKey', 'recipientFixtureId', 'recipientIdentifier', 'language', 'templateId', 'templateVersion', 'body', 'fields', 'sourceFingerprint', 'snapshotFingerprint', 'mode', 'createdByUserId']
const potretSnapshot = (m) => JSON.stringify(SNAPSHOT.map((k) => m[k]))

try {
  await bersihkan()
  const A = await dunia('A')
  const B = await dunia('B')
  const C = await dunia('C-tak-diizinkan')
  process.env.AUTOMATION_TENANT_IDS = `${A.t.id},${B.t.id}`
  const FX = 'WA1_TEST_FIXTURE_SUCCESS'
  const revisi = (ctx, candidateId, language = 'ID', recipientFixtureId = FX) => S.buatRevisiPesan(ctx, { candidateId, recipientFixtureId, language })

  // =============================================================== statis
  bagian('[0] Statis — snapshot immutable di kode service')
  const svc = readFileSync(join(AKAR, 'src/services/communication/communication.service.ts'), 'utf8')
  const blokData = (src, mulai) => {
    const i = src.indexOf('data: {', mulai)
    let d = 0
    for (let j = i + 6; j < src.length; j++) {
      if (src[j] === '{') d++
      else if (src[j] === '}' && --d === 0) return src.slice(i + 6, j + 1)
    }
    return ''
  }
  // Kunci tingkat-1 sebuah objek literal (termasuk shorthand `revision,`): pecah di koma tingkat atas.
  const kunciTingkat1 = (blok) => {
    const isi = blok.trim().replace(/^\{/, '').replace(/\}$/, '')
    const bagianObj = []
    let d = 0
    let awal = 0
    for (let j = 0; j < isi.length; j++) {
      const ch = isi[j]
      if ('{(['.includes(ch)) d++
      else if ('})]'.includes(ch)) d--
      else if (ch === ',' && d === 0) {
        bagianObj.push(isi.slice(awal, j))
        awal = j + 1
      }
    }
    bagianObj.push(isi.slice(awal))
    return bagianObj.map((x) => /^\s*(\w+)/.exec(x)?.[1]).filter(Boolean)
  }
  const SIKLUS = new Set(['state', 'reasonCode', 'activeKey', 'version', 'previewedAt', 'previewedByUserId'])
  const ubahPesan = [...svc.matchAll(/communicationMessage\.updateMany\(/g)].map((m) => kunciTingkat1(blokData(svc, m.index)))
  cek('setiap updateMany pesan hanya menyentuh medan siklus hidup 2C', ubahPesan.length >= 3 && ubahPesan.every((ks) => ks.length > 0 && ks.every((k) => SIKLUS.has(k))), JSON.stringify(ubahPesan))
  const buat = kunciTingkat1(blokData(svc, svc.indexOf('communicationMessage.create(')))
  cek('create pesan mengisi SEMUA medan snapshot + tanpa medan approval/send', SNAPSHOT.every((k) => buat.includes(k)) && !buat.some((k) => ['approvalRequestId', 'approvedByUserId', 'approvedAt', 'successKey', 'fakeReceipt', 'previewedAt'].includes(k)), buat.join(','))

  // =============================================================== gerbang
  bagian('[1] Gerbang & otorisasi')
  const g0 = await jadwal(A)
  cek('tenant di luar allowlist Automation → NOT_FOUND', (await kode(() => S.siapkanCandidate(C.ctx, { signalId: g0.s.eta.id }))) === 'NOT_FOUND')
  cek('peran di luar ADMIN/MANAJER_OPERASI → FORBIDDEN', (await kode(() => S.siapkanCandidate({ ...A.ctx, role: 'OPERATOR' }, { signalId: g0.s.eta.id }))) === 'FORBIDDEN')
  cek('konteks sistem → FORBIDDEN', (await kode(() => S.siapkanCandidate({ ...A.ctx, system: true }, { signalId: g0.s.eta.id }))) === 'FORBIDDEN')
  process.env.WA1_INTERNAL_FAKE_TEST_ENABLED = 'false'
  cek('flag WA mati → FORBIDDEN (FEATURE_DISABLED)', (await kode(() => S.siapkanCandidate(A.ctx, { signalId: g0.s.eta.id }))) === 'FORBIDDEN')
  process.env.WA1_INTERNAL_FAKE_TEST_ENABLED = 'true'
  process.env.NODE_ENV = 'production'
  cek('NODE_ENV=production → FORBIDDEN (ENV_NOT_ALLOWED)', (await kode(() => S.siapkanCandidate(A.ctx, { signalId: g0.s.eta.id }))) === 'FORBIDDEN')
  process.env.NODE_ENV = 'test'
  cek('signalId tak sah → VALIDATION', (await kode(() => S.siapkanCandidate(A.ctx, { signalId: '' }))) === 'VALIDATION')
  cek('bahasa tak sah → VALIDATION', (await kode(() => S.buatRevisiPesan(A.ctx, { candidateId: 'x', recipientFixtureId: FX, language: 'FR' }))) === 'VALIDATION')
  cek('gerbang menolak SEBELUM menulis apa pun', (await adm.communicationCandidate.count()) === 0)

  // ================================================== candidate & pengelompokan
  bagian('[2] Candidate & pengelompokan (1–8)')
  const h1 = await S.siapkanCandidate(A.ctx, { signalId: g0.s.eta.id })
  const h1b = await S.siapkanCandidate(A.ctx, { signalId: g0.s.eta.id })
  cek('1. idempoten: Prepare ulang → candidate SAMA, dibuat sekali', h1.hasil === 'SIAP' && h1.dibuatBaru === true && h1b.hasil === 'SIAP' && h1b.candidateId === h1.candidateId && h1b.dibuatBaru === false && (await adm.communicationCandidate.count({ where: { sourceRef: g0.a.id } })) === 1 && (await jumlahAudit('WA1_CANDIDATE_DIBUAT', h1.candidateId)) === 1)
  const c1 = await kandidat(h1.candidateId)
  cek('2. ETA saja: family SCHEDULE_CHANGE, includedFields [eta], tenant dari ctx', c1.family === 'SCHEDULE_CHANGE' && c1.includedFields.join() === 'eta' && c1.tenantId === A.t.id && c1.state === 'ACTIVE' && c1.createdByUserId === 'u-A')
  const r1 = await revisi(A.ctx, h1.candidateId)
  const m1 = (await pesanDari(h1.candidateId))[0]
  const vn1 = g0.v.voyageNumber
  const BODY_ETA_ID = badan('Update Jadwal Kapal — MT Contoh Satu', vn1, ['Berikut perubahan jadwal MT Contoh Satu:', 'ETA: dari 2026-10-10 menjadi 2026-10-12.'])
  cek('2. ETA saja: revisi DRAFT, body = expected byte-per-byte', r1.hasil === 'REVISI_DIBUAT' && r1.revision === 1 && m1.state === 'DRAFT' && m1.body === BODY_ETA_ID, JSON.stringify(m1.body))
  const g2 = await jadwal(A, { medan: ['etd'] })
  const h2 = await S.siapkanCandidate(A.ctx, { signalId: g2.s.etd.id })
  await revisi(A.ctx, h2.candidateId, 'EN')
  const m2 = (await pesanDari(h2.candidateId))[0]
  cek('3. ETD saja: includedFields [etd], body EN satu baris ETD', (await kandidat(h2.candidateId)).includedFields.join() === 'etd' && m2.body === badanEN('Vessel Schedule Update — MT Contoh Satu', g2.v.voyageNumber, ['Please note the following schedule changes for MT Contoh Satu:', 'ETD: revised from 2026-10-11 to 2026-10-14.']))
  const g3 = await jadwal(A, { medan: ['eta', 'etd'], stEtd: 'ACKNOWLEDGED' })
  const h3 = await S.siapkanCandidate(A.ctx, { signalId: g3.s.etd.id })
  const h3b = await S.siapkanCandidate(A.ctx, { signalId: g3.s.eta.id })
  const c3 = await kandidat(h3.candidateId)
  cek('4. ETA+ETD satu AuditLog → SATU candidate, signalIds terurut unik, includedFields [eta, etd]', h3.candidateId === h3b.candidateId && c3.signalIds.join() === [g3.s.eta.id, g3.s.etd.id].sort().join() && c3.includedFields.join() === 'eta,etd' && (await adm.communicationCandidate.count({ where: { sourceRef: g3.a.id } })) === 1)
  await revisi(A.ctx, h3.candidateId)
  cek('4. body ETA lalu ETD', (await pesanDari(h3.candidateId))[0].body === badan('Update Jadwal Kapal — MT Contoh Satu', g3.v.voyageNumber, ['Berikut perubahan jadwal MT Contoh Satu:', 'ETA: dari 2026-10-10 menjadi 2026-10-12.', 'ETD: dari 2026-10-11 menjadi 2026-10-14.']))

  const ms = await milestone(A, 'EOSP')
  const adm1 = await sinyal(A, ms.v, { kind: 'ACTUAL_DATE_MISSING', severity: 'WARNING', sourceType: 'VOYAGE_EVENT', sourceRef: ms.e.id, reviewState: 'DISMISSED', after: { ata: null, eventCode: 'EOSP' } })
  const h5 = await S.siapkanCandidate(A.ctx, { signalId: ms.s.id })
  cek('5. ACTUAL_DATE_MISSING (DISMISSED, sourceRef sama) TIDAK ikut grup → SIAP', h5.hasil === 'SIAP' && (await kandidat(h5.candidateId)).signalIds.join() === ms.s.id)
  const h5b = await S.siapkanCandidate(A.ctx, { signalId: adm1.id })
  cek('5. Prepare dari ACTUAL_DATE_MISSING → DITOLAK EVENT_NOT_ALLOWED tanpa candidate baru (D-2C-04)', h5b.hasil === 'DITOLAK' && h5b.alasan === 'EVENT_NOT_ALLOWED' && h5b.candidateId === null && (await adm.communicationCandidate.count({ where: { sourceRef: ms.e.id } })) === 1)
  await revisi(A.ctx, h5.candidateId)
  cek('6. EOSP: body = expected (waktu lokal + zona)', (await pesanDari(h5.candidateId))[0].body === badan('Update Kapal — MT Contoh Satu', ms.v.voyageNumber, [`Milestone EOSP untuk MT Contoh Satu pada kunjungan Pelabuhan Uji tercatat pada ${WAKTU_LOKAL}.`]))
  const af = await milestone(A, 'ALL_FAST')
  const h7 = await S.siapkanCandidate(A.ctx, { signalId: af.s.id })
  await revisi(A.ctx, h7.candidateId, 'EN')
  cek('7. ALL_FAST: body EN tanpa berth/terminal', (await pesanDari(h7.candidateId))[0].body === badanEN('Berthing Update — MT Contoh Satu', af.v.voyageNumber, [`MT Contoh Satu — ALL FAST recorded at Pelabuhan Uji at ${WAKTU_LOKAL}.`]))
  const sl = await milestone(A, 'SAILED')
  const h8 = await S.siapkanCandidate(A.ctx, { signalId: sl.s.id })
  await revisi(A.ctx, h8.candidateId)
  cek('8. SAILED: body ID', (await pesanDari(h8.candidateId))[0].body === badan('Update Keberangkatan — MT Contoh Satu', sl.v.voyageNumber, [`MT Contoh Satu telah berangkat dari Pelabuhan Uji pada ${WAKTU_LOKAL}.`]))
  const vsu = await adm.voyage.create({ data: { tenantId: A.t.id, vesselId: A.kapal.id, voyageNumber: uid() } })
  const sStatus = await sinyal(A, vsu, { kind: 'VOYAGE_STATUS_CHANGED', sourceRef: (await auditJadwal(A, vsu, ['eta'], {}, {})).id })
  const h0 = await S.siapkanCandidate(A.ctx, { signalId: sStatus.id })
  cek('sinyal non-pilot (VOYAGE_STATUS_CHANGED) → DITOLAK EVENT_NOT_ALLOWED, 0 candidate, audit pada MonitoringSignal', h0.hasil === 'DITOLAK' && h0.alasan === 'EVENT_NOT_ALLOWED' && (await adm.communicationCandidate.count({ where: { voyageId: vsu.id } })) === 0 && (await adm.auditLog.count({ where: { tableName: 'MonitoringSignal', recordId: sStatus.id } })) === 1)

  // ======================================================== kelayakan sinyal
  bagian('[3] Kelayakan sinyal P-08/Q4 (9–13)')
  cek('9. OPEN layak (kasus 2)', c1.state === 'ACTIVE')
  const gAck = await jadwal(A, { stEta: 'ACKNOWLEDGED' })
  const hAck = await S.siapkanCandidate(A.ctx, { signalId: gAck.s.eta.id })
  const rAck = await revisi(A.ctx, hAck.candidateId)
  const mAck = (await pesanDari(hAck.candidateId))[0]
  cek('10. ACKNOWLEDGED layak — TAPI bukan approval: revisi DRAFT, approval kosong', hAck.hasil === 'SIAP' && rAck.hasil === 'REVISI_DIBUAT' && mAck.state === 'DRAFT' && mAck.approvalRequestId === null && mAck.approvedAt === null)
  for (const [n, st, alasan] of [['11', 'DISMISSED', 'SIGNAL_DISMISSED'], ['12', 'EXPIRED', 'SIGNAL_EXPIRED'], ['13', 'ANEH', 'SIGNAL_STATE_INVALID']]) {
    const g = await jadwal(A, { stEta: st })
    const h = await S.siapkanCandidate(A.ctx, { signalId: g.s.eta.id })
    const c = h.candidateId && (await kandidat(h.candidateId))
    cek(`${n}. ${st} → DIBLOKIR ${alasan} (candidate BLOCKED, blockReason, blockedAt)`, h.hasil === 'DIBLOKIR' && h.alasan === alasan && c?.state === 'BLOCKED' && c.blockReason === alasan && c.blockedAt instanceof Date)
  }
  const gMix = await jadwal(A, { medan: ['eta', 'etd'], stEta: 'OPEN', stEtd: 'DISMISSED' })
  const hMix = await S.siapkanCandidate(A.ctx, { signalId: gMix.s.eta.id })
  cek('Q4: grup ETA OPEN + ETD DISMISSED → SELURUH candidate DIBLOKIR SIGNAL_DISMISSED', hMix.hasil === 'DIBLOKIR' && hMix.alasan === 'SIGNAL_DISMISSED')
  cek('candidate BLOCKED idempoten: Prepare ulang → DIBLOKIR sama, tanpa candidate baru', (await S.siapkanCandidate(A.ctx, { signalId: gMix.s.etd.id })).candidateId === hMix.candidateId)
  cek('candidate BLOCKED → buatRevisi DIBLOKIR, 0 pesan', (await revisi(A.ctx, hMix.candidateId)).hasil === 'DIBLOKIR' && (await pesanDari(hMix.candidateId)).length === 0)

  // ============================================================ alasan KERAS
  bagian('[4] Semua alasan KERAS (14)')
  const keras = async (label, siap, harap) => {
    const h = await S.siapkanCandidate(A.ctx, { signalId: siap.id })
    const c = h.candidateId && (await kandidat(h.candidateId))
    cek(`14. ${label} → DIBLOKIR ${harap}`, h.hasil === 'DIBLOKIR' && h.alasan === harap && c?.state === 'BLOCKED', `${h.hasil}/${h.alasan}`)
  }
  {
    const v = await voyage(A)
    await keras('AuditLog sumber tak ada', await sinyal(A, v, { sourceRef: 'audit-tidak-ada' }), 'SOURCE_NOT_FOUND')
    const e = await milestone(A, 'EOSP', { eventUbah: { deletedAt: new Date() } })
    await keras('VoyageEvent dihapus', e.s, 'SOURCE_DELETED')
    const vd = await jadwal(A, { voyageUbah: { deletedAt: new Date() } })
    await keras('voyage dihapus', vd.s.eta, 'SOURCE_DELETED')
    const sup = await jadwal(A, { voyageUbah: { eta: new Date('2026-10-20T00:00:00Z') } })
    await keras('nilai ETA kini ≠ nilai baru', sup.s.eta, 'SOURCE_SUPERSEDED')
    const fs = await jadwal(A, { lama: { eta: null } })
    await keras('ETA diisi pertama kali', fs.s.eta, 'SCHEDULE_FIRST_SET')
    const cl = await jadwal(A, { baru: { eta: null }, voyageUbah: { eta: null } })
    await keras('ETA dikosongkan', cl.s.eta, 'SCHEDULE_CLEARED')
    const na = await milestone(A, 'COMMENCED', { sinyalUbah: { after: { eventCode: 'EOSP' } } })
    await keras('kode peristiwa sumber ≠ keluarga sinyal (temuan saat revalidasi)', na.s, 'EVENT_NOT_ALLOWED')
  }
  // Hard block atas candidate ACTIVE dengan revisi PREVIEWED (D-2C-01).
  const pb = await milestone(A, 'SAILED')
  const hpb = await S.siapkanCandidate(A.ctx, { signalId: pb.s.id })
  const rpb = await revisi(A.ctx, hpb.candidateId)
  await S.tandaiDipratinjau(A.ctx, { messageId: rpb.messageId, snapshotFingerprint: rpb.snapshotFingerprint })
  const sebelumBlok = await adm.communicationMessage.findFirst({ where: { id: rpb.messageId } })
  await adm.voyageEvent.updateMany({ where: { id: pb.e.id }, data: { deletedAt: new Date() } })
  const hpb2 = await S.siapkanCandidate(A.ctx, { signalId: pb.s.id })
  const mpb = await adm.communicationMessage.findFirst({ where: { id: rpb.messageId } })
  cek('D-2C-01: candidate ACTIVE + revisi PREVIEWED, sumber dihapus → candidate BLOCKED, revisi BLOCKED, activeKey dilepas', hpb2.hasil === 'DIBLOKIR' && hpb2.alasan === 'SOURCE_DELETED' && sebelumBlok.state === 'PREVIEWED' && mpb.state === 'BLOCKED' && mpb.reasonCode === 'SOURCE_DELETED' && mpb.activeKey === null && (await kandidat(hpb.candidateId)).state === 'BLOCKED')

  // ========================================================== alasan PULIH
  bagian('[5] Semua alasan PULIH (15–16)')
  const pulih = async (label, siap, harap) => {
    const h = await S.siapkanCandidate(A.ctx, { signalId: siap.id })
    const c = h.candidateId && (await kandidat(h.candidateId))
    const n = h.candidateId ? (await pesanDari(h.candidateId)).length : -1
    cek(`15. ${label} → DITOLAK_PULIH ${harap}; candidate ACTIVE, 0 pesan, audit`, h.hasil === 'DITOLAK_PULIH' && h.alasan === harap && c?.state === 'ACTIVE' && n === 0 && (await jumlahAudit('WA1_PREPARE_DITOLAK', h.candidateId)) >= 1, `${h.hasil}/${h.alasan}`)
    return h
  }
  const portTz = await adm.port.create({ data: { tenantId: A.t.id, name: 'Pelabuhan Tanpa Zona', timezone: null } })
  const tzM = await milestone(A, 'EOSP', { voyageUbah: { portId: portTz.id } })
  const hTz = await pulih('timezone kosong', tzM.s, 'TIMEZONE_MISSING')
  const portUtc = await adm.port.create({ data: { tenantId: A.t.id, name: 'Pelabuhan UTC', timezone: 'UTC' } })
  await pulih('timezone UTC', (await milestone(A, 'EOSP', { voyageUbah: { portId: portUtc.id } })).s, 'TIMEZONE_INVALID')
  await pulih('pelabuhan voyage kosong', (await milestone(A, 'EOSP', { voyageUbah: { portId: null } })).s, 'PORT_MISSING')
  {
    const v = await voyage(A)
    const pc = await adm.portCall.create({ data: { tenantId: A.t.id, vesselId: A.kapal.id, port: 'Pelabuhan Lain', voyageId: v.id } })
    const e = await peristiwa(A, v, 'ALL_FAST', { portCallId: pc.id })
    await pulih('port call tanpa portRefId', await sinyalMilestone(A, v, e), 'PORT_AMBIGUOUS')
  }
  const kapalKosong = await adm.vessel.create({ data: { tenantId: A.t.id, name: '   ' } })
  await pulih('nama kapal kosong', (await milestone(A, 'SAILED', { voyageUbah: { vesselId: kapalKosong.id } })).s, 'REQUIRED_DATA_MISSING')
  await pulih('occurredAt di masa depan', (await milestone(A, 'EOSP', { eventUbah: { occurredAt: new Date(hariIni.getTime() + 86_400_000) } })).s, 'TIME_IN_FUTURE')
  const kapalToken = await adm.vessel.create({ data: { tenantId: A.t.id, name: 'MT {{port_name}}' } })
  const tk = await milestone(A, 'EOSP', { voyageUbah: { vesselId: kapalToken.id } })
  const htk = await S.siapkanCandidate(A.ctx, { signalId: tk.s.id })
  const rtk = await revisi(A.ctx, htk.candidateId)
  cek('OD-2A-04: data berpola {{…}} → buatRevisi DITOLAK_PULIH REQUIRED_DATA_MISSING, 0 pesan', rtk.hasil === 'DITOLAK_PULIH' && rtk.alasan === 'REQUIRED_DATA_MISSING' && (await pesanDari(htk.candidateId)).length === 0)
  await adm.port.updateMany({ where: { id: portTz.id }, data: { timezone: 'Asia/Makassar' } })
  const hTz2 = await S.siapkanCandidate(A.ctx, { signalId: tzM.s.id })
  const rTz2 = await revisi(A.ctx, hTz2.candidateId)
  cek('16. diperbaiki lalu diulang → candidate SAMA, SIAP, revisi DRAFT', hTz2.hasil === 'SIAP' && hTz2.candidateId === hTz.candidateId && rTz2.hasil === 'REVISI_DIBUAT')

  // ================================================================== Q5
  bagian('[6] Q5 supersession (17–18) — urutan AuditLog bukan urutan commit ketat (D-2C-03)')
  {
    const v = await voyage(A, { eta: new Date('2026-10-12T00:00:00Z') })
    const t0 = Date.now() - 60_000
    const a1 = await auditJadwal(A, v, ['eta'], { eta: '2026-10-10' }, { eta: '2026-10-12' }, new Date(t0))
    const a2 = await auditJadwal(A, v, ['eta'], { eta: '2026-10-12' }, { eta: '2026-10-10' }, new Date(t0 + 1000))
    const a3 = await auditJadwal(A, v, ['eta'], { eta: '2026-10-10' }, { eta: '2026-10-12' }, new Date(t0 + 2000))
    const [s1, , s3] = [await sinyal(A, v, { sourceRef: a1.id }), await sinyal(A, v, { sourceRef: a2.id }), await sinyal(A, v, { sourceRef: a3.id })]
    const q1 = await S.siapkanCandidate(A.ctx, { signalId: s1.id })
    const q3 = await S.siapkanCandidate(A.ctx, { signalId: s3.id })
    cek('17. A→B→A→B: candidate audit pertama SOURCE_SUPERSEDED walau nilai kini kembali B', q1.hasil === 'DIBLOKIR' && q1.alasan === 'SOURCE_SUPERSEDED')
    cek('17. candidate audit terbaru tetap SIAP', q3.hasil === 'SIAP')
    const v2 = await voyage(A, { eta: new Date('2026-10-12T00:00:00Z') })
    const t = new Date(t0 + 5000)
    const k1 = await auditJadwal(A, v2, ['eta'], { eta: '2026-10-10' }, { eta: '2026-10-12' }, t)
    const k2 = await auditJadwal(A, v2, ['eta'], { eta: '2026-10-10' }, { eta: '2026-10-12' }, t)
    const qk1 = await S.siapkanCandidate(A.ctx, { signalId: (await sinyal(A, v2, { sourceRef: k1.id })).id })
    const qk2 = await S.siapkanCandidate(A.ctx, { signalId: (await sinyal(A, v2, { sourceRef: k2.id })).id })
    cek('18. createdAt sama persis → KEDUA candidate SOURCE_SUPERSEDED (gagal tertutup)', qk1.alasan === 'SOURCE_SUPERSEDED' && qk2.alasan === 'SOURCE_SUPERSEDED')
    const v3 = await voyage(A)
    const b1 = await auditJadwal(A, v3, ['eta'], { eta: '2026-10-10' }, { eta: '2026-10-12' }, new Date(t0))
    const sb1 = await sinyal(A, v3, { sourceRef: b1.id })
    const hb = await S.siapkanCandidate(A.ctx, { signalId: sb1.id })
    await auditJadwal(A, v3, ['eta'], { eta: '2026-10-12' }, { eta: '2026-10-12' }, new Date(t0 + 1000))
    const rb = await revisi(A.ctx, hb.candidateId)
    cek('D. superseded di antara Prepare dan revisi → buatRevisi DIBLOKIR SOURCE_SUPERSEDED, 0 revisi aktif', hb.hasil === 'SIAP' && rb.hasil === 'DIBLOKIR' && rb.alasan === 'SOURCE_SUPERSEDED' && (await adm.communicationMessage.count({ where: { candidateId: hb.candidateId, activeKey: { not: null } } })) === 0)
  }

  // ========================================================== lintas tenant
  bagian('[7] Lintas tenant (19–22) — NOT_FOUND tanpa bocor')
  const gB = await jadwal(B)
  const hB = await S.siapkanCandidate(B.ctx, { signalId: gB.s.eta.id })
  const rB = await revisi(B.ctx, hB.candidateId)
  const mBsebelum = await adm.communicationMessage.findFirst({ where: { id: rB.messageId } })
  const jmlA = await adm.communicationCandidate.count({ where: { tenantId: A.t.id } })
  cek('19. A memakai sinyal B → NOT_FOUND, 0 candidate baru di A', (await kode(() => S.siapkanCandidate(A.ctx, { signalId: gB.s.eta.id }))) === 'NOT_FOUND' && (await adm.communicationCandidate.count({ where: { tenantId: A.t.id } })) === jmlA)
  const sVoyB = await sinyal(A, gB.v, { sourceRef: gB.a.id })
  cek('20. sinyal A (rusak) menunjuk voyage B → NOT_FOUND, 0 candidate A atas voyage B', (await kode(() => S.siapkanCandidate(A.ctx, { signalId: sVoyB.id }))) === 'NOT_FOUND' && (await adm.communicationCandidate.count({ where: { tenantId: A.t.id, voyageId: gB.v.id } })) === 0)
  const vA21 = await voyage(A)
  const h21 = await S.siapkanCandidate(A.ctx, { signalId: (await sinyal(A, vA21, { sourceRef: gB.a.id })).id })
  const eB = await peristiwa(B, gB.v, 'EOSP')
  const h21b = await S.siapkanCandidate(A.ctx, { signalId: (await sinyalMilestone(A, vA21, eB)).id })
  cek('21. sourceRef A menunjuk AuditLog/VoyageEvent B → SOURCE_NOT_FOUND (tak ada fakta B terbaca), candidate milik A', h21.alasan === 'SOURCE_NOT_FOUND' && h21b.alasan === 'SOURCE_NOT_FOUND' && (await kandidat(h21.candidateId)).tenantId === A.t.id && (await pesanDari(h21.candidateId)).length === 0)
  cek('22. A buatRevisi atas candidate B → NOT_FOUND', (await kode(() => revisi(A.ctx, hB.candidateId))) === 'NOT_FOUND')
  cek('22. A tandaiDipratinjau pesan B → NOT_FOUND', (await kode(() => S.tandaiDipratinjau(A.ctx, { messageId: rB.messageId, snapshotFingerprint: rB.snapshotFingerprint }))) === 'NOT_FOUND')
  cek('22. pesan B tak tersentuh', potretSnapshot(await adm.communicationMessage.findFirst({ where: { id: rB.messageId } })) === potretSnapshot(mBsebelum) && (await adm.communicationMessage.findFirst({ where: { id: rB.messageId } })).state === 'DRAFT')
  cek('22. tidak ada pesan A yang menunjuk candidate B', (await adm.communicationMessage.count({ where: { tenantId: A.t.id, candidateId: hB.candidateId } })) === 0)

  // =================================================== snapshot, sidik, revisi
  bagian('[8] Snapshot, sidik, revisi (23–28)')
  const gS = await jadwal(A, { medan: ['eta', 'etd'] })
  const hS = await S.siapkanCandidate(A.ctx, { signalId: gS.s.eta.id })
  const rS1 = await revisi(A.ctx, hS.candidateId, 'ID')
  const rS2 = await revisi(A.ctx, hS.candidateId, 'ID')
  cek('27. Prepare identik → REVISI_SAMA, tanpa revisi duplikat', rS2.hasil === 'REVISI_SAMA' && rS2.messageId === rS1.messageId && (await pesanDari(hS.candidateId)).length === 1)
  const mS1 = await adm.communicationMessage.findFirst({ where: { id: rS1.messageId } })
  const potret1 = potretSnapshot(mS1)
  const CT = jiti('../src/services/communication/comm-template.ts')
  cek('23. body deterministik = render ulang dari fields tersimpan', CT.renderPesan({ keluarga: 'SCHEDULE_CHANGE', bahasa: 'ID', vesselName: mS1.fields.vesselName, voyageNumber: mS1.fields.voyageNumber, portName: mS1.fields.portName, perubahan: mS1.fields.perubahan }).body === mS1.body)
  await adm.voyage.updateMany({ where: { id: gS.v.id }, data: { status: 'ARRIVED' } })
  const rS3 = await revisi(A.ctx, hS.candidateId, 'ID')
  cek('25. perubahan TAK relevan (status voyage) → sidik sumber sama → REVISI_SAMA', rS3.hasil === 'REVISI_SAMA' && rS3.messageId === rS1.messageId)
  const rEN = await revisi(A.ctx, hS.candidateId, 'EN')
  const mEN = await adm.communicationMessage.findFirst({ where: { id: rEN.messageId } })
  const lamaSetelah = await adm.communicationMessage.findFirst({ where: { id: rS1.messageId } })
  cek('26. bahasa berbeda → snapshotFingerprint berbeda, sourceFingerprint & logicalMessageKey SAMA', mEN.snapshotFingerprint !== mS1.snapshotFingerprint && mEN.sourceFingerprint === mS1.sourceFingerprint && mEN.logicalMessageKey === mS1.logicalMessageKey)
  cek('28. revisi lama CANCELED/REVISED, activeKey NULL; revisi baru DRAFT rev 2 memegang activeKey', rEN.hasil === 'REVISI_DIBUAT' && rEN.digantikanId === rS1.messageId && lamaSetelah.state === 'CANCELED' && lamaSetelah.reasonCode === 'REVISED' && lamaSetelah.activeKey === null && mEN.state === 'DRAFT' && mEN.revision === 2 && mEN.activeKey === mEN.logicalMessageKey)
  cek('28. audit WA1_REVISI_DIGANTIKAN tercatat', (await jumlahAudit('WA1_REVISI_DIGANTIKAN', rS1.messageId)) === 1)
  const kapalBaru = await adm.vessel.create({ data: { tenantId: A.t.id, name: 'MT Contoh Dua' } })
  await adm.voyage.updateMany({ where: { id: gS.v.id }, data: { vesselId: kapalBaru.id } })
  const rS4 = await revisi(A.ctx, hS.candidateId, 'EN')
  const mS4 = await adm.communicationMessage.findFirst({ where: { id: rS4.messageId } })
  cek('25. perubahan RELEVAN (nama kapal) → sidik sumber berubah → revisi baru', rS4.hasil === 'REVISI_DIBUAT' && mS4.sourceFingerprint !== mEN.sourceFingerprint && /MT Contoh Dua/.test(mS4.body))
  cek('24. kolom snapshot revisi 1 TIDAK berubah setelah revisi diganti', potretSnapshot(lamaSetelah) === potret1)
  cek('maksimal SATU revisi aktif per pesan logis', (await adm.communicationMessage.count({ where: { logicalMessageKey: mS1.logicalMessageKey, activeKey: { not: null } } })) === 1)
  const mBeku = await adm.communicationMessage.create({
    data: { ...Object.fromEntries(SNAPSHOT.map((k) => [k, mS4[k]])), revision: 99, activeKey: null, successKey: mS4.logicalMessageKey, state: 'FAKE_SENT', fields: mS4.fields },
  })
  const rSukses = await revisi(A.ctx, hS.candidateId, 'ID')
  cek('pesan logis sudah sukses (successKey) → DITOLAK ALREADY_FAKE_SENT, tanpa revisi baru', rSukses.hasil === 'DITOLAK' && rSukses.alasan === 'ALREADY_FAKE_SENT' && (await pesanDari(hS.candidateId)).length === 4)
  await adm.communicationMessage.deleteMany({ where: { id: mBeku.id } })
  const rFx = await revisi(A.ctx, hS.candidateId, 'ID', 'NOMOR-BEBAS')
  cek('penerima bukan fixture terdaftar → DITOLAK CONTACT_INELIGIBLE', rFx.hasil === 'DITOLAK' && rFx.alasan === 'CONTACT_INELIGIBLE')

  // ================================================================ pratinjau
  bagian('[9] Pratinjau (32–33)')
  const salah = 'f'.repeat(64)
  const p0 = await S.tandaiDipratinjau(A.ctx, { messageId: rS4.messageId, snapshotFingerprint: salah })
  cek('33. sidik tak cocok → DITOLAK PREVIEW_REQUIRED, state tetap DRAFT', p0.hasil === 'DITOLAK' && p0.alasan === 'PREVIEW_REQUIRED' && (await adm.communicationMessage.findFirst({ where: { id: rS4.messageId } })).state === 'DRAFT')
  cek('33. sidik bukan hex-64 → VALIDATION', (await kode(() => S.tandaiDipratinjau(A.ctx, { messageId: rS4.messageId, snapshotFingerprint: 'abc' }))) === 'VALIDATION')
  const p1 = await S.tandaiDipratinjau(A.ctx, { messageId: rS4.messageId, snapshotFingerprint: rS4.snapshotFingerprint })
  const mP = await adm.communicationMessage.findFirst({ where: { id: rS4.messageId } })
  cek('32. sidik cocok → PREVIEWED, previewedAt & previewedByUserId terisi', p1.hasil === 'DIPRATINJAU' && mP.state === 'PREVIEWED' && mP.previewedAt instanceof Date && mP.previewedByUserId === 'u-A')
  cek('32. pratinjau ulang → SUDAH_DIPRATINJAU (idempoten)', (await S.tandaiDipratinjau(A.ctx, { messageId: rS4.messageId, snapshotFingerprint: rS4.snapshotFingerprint })).hasil === 'SUDAH_DIPRATINJAU')
  cek('pratinjau revisi CANCELED → DITOLAK', (await S.tandaiDipratinjau(A.ctx, { messageId: rS1.messageId, snapshotFingerprint: rS1.snapshotFingerprint })).hasil === 'DITOLAK')
  cek('24. snapshot TIDAK berubah oleh pratinjau', potretSnapshot(mP) === potretSnapshot(mS4))

  // ============================================================== konkurensi
  bagian('[10] Konkurensi (29–31, E)')
  const gR = await jadwal(A)
  const raceC = await Promise.allSettled(Array.from({ length: 6 }, () => S.siapkanCandidate(A.ctx, { signalId: gR.s.eta.id })))
  const okC = raceC.filter((r) => r.status === 'fulfilled').map((r) => r.value.candidateId)
  cek('30. 6 Prepare bersamaan untuk sumber sama → SATU candidate, semua hasil menunjuk id itu', okC.length >= 1 && new Set(okC).size === 1 && (await adm.communicationCandidate.count({ where: { sourceRef: gR.a.id } })) === 1, `${okC.length} berhasil`)
  const gG = await jadwal(A, { medan: ['eta', 'etd'] })
  const raceG = await Promise.allSettled([S.siapkanCandidate(A.ctx, { signalId: gG.s.eta.id }), S.siapkanCandidate(A.ctx, { signalId: gG.s.etd.id }), S.siapkanCandidate(A.ctx, { signalId: gG.s.etd.id })])
  const idG = raceG.filter((r) => r.status === 'fulfilled').map((r) => r.value.candidateId)
  const cG = await adm.communicationCandidate.findFirst({ where: { sourceRef: gG.a.id } })
  cek('31. ETA & ETD berlomba (AuditLog sama) → SATU candidate dengan kedua sinyal', new Set(idG).size === 1 && (await adm.communicationCandidate.count({ where: { sourceRef: gG.a.id } })) === 1 && cG.signalIds.join() === [gG.s.eta.id, gG.s.etd.id].sort().join())
  const raceR = await Promise.allSettled(['ID', 'EN', 'ID', 'EN', 'ID'].map((l) => revisi(A.ctx, gR.s && okC[0], l)))
  const msR = await pesanDari(okC[0])
  const aktifR = msR.filter((m) => m.activeKey !== null)
  cek('29. 5 revisi bersamaan (ID/EN) → TEPAT satu revisi aktif; nomor revisi unik; sisanya CANCELED/REVISED', aktifR.length === 1 && new Set(msR.map((m) => m.revision)).size === msR.length && msR.filter((m) => m.activeKey === null).every((m) => m.state === 'CANCELED' && m.reasonCode === 'REVISED'), `${raceR.filter((r) => r.status === 'fulfilled').length} berhasil, ${msR.length} revisi`)
  const gagalR = raceR.filter((r) => r.status === 'rejected').map((r) => r.reason?.code)
  cek('29. yang gagal hanya CONFLICT terkendali (bukan galat lain)', gagalR.every((c) => c === 'CONFLICT'), gagalR.join(','))
  const del = await milestone(A, 'EOSP')
  const hDel = await S.siapkanCandidate(A.ctx, { signalId: del.s.id })
  const [rDel] = await Promise.all([revisi(A.ctx, hDel.candidateId), adm.voyageEvent.updateMany({ where: { id: del.e.id }, data: { deletedAt: new Date() } })])
  cek('E. penghapusan sumber bersamaan Prepare → DIBLOKIR (terlihat) ATAU DRAFT (hapus sesudah revalidasi) — keduanya sah di 2C', ['DIBLOKIR', 'REVISI_DIBUAT'].includes(rDel.hasil), rDel.hasil)
  const hDel2 = await S.siapkanCandidate(A.ctx, { signalId: del.s.id })
  cek('E. Prepare berikutnya melihat penghapusan → candidate BLOCKED, 0 revisi aktif (Send 2E tetap wajib merevalidasi)', hDel2.hasil === 'DIBLOKIR' && hDel2.alasan === 'SOURCE_DELETED' && (await adm.communicationMessage.count({ where: { candidateId: hDel.candidateId, activeKey: { not: null } } })) === 0)

  // ================================================================== audit
  bagian('[11] Audit (34–35)')
  for (const p of ['WA1_CANDIDATE_DIBUAT', 'WA1_CANDIDATE_DIBLOKIR', 'WA1_PREPARE_DITOLAK', 'WA1_REVISI_DIBUAT', 'WA1_REVISI_DIGANTIKAN', 'WA1_DIPRATINJAU']) {
    cek(`34. audit ${p} ada`, (await jumlahAudit(p)) > 0)
  }
  cek('34. setiap revisi punya audit WA1_REVISI_DIBUAT', (await adm.communicationMessage.count({ where: { tenantId: A.t.id, revision: { lt: 99 } } })) === (await adm.auditLog.count({ where: { tenantId: A.t.id, newValue: { path: ['peristiwa'], equals: 'WA1_REVISI_DIBUAT' } } })))
  cek('34. audit komunikasi hanya pada tabel komunikasi/MonitoringSignal — tak ada baris Voyage dari service', (await adm.auditLog.count({ where: { newValue: { path: ['peristiwa'], string_starts_with: 'WA1_' }, NOT: { tableName: { in: ['CommunicationCandidate', 'CommunicationMessage', 'MonitoringSignal'] } } } })) === 0 && (await adm.auditLog.count({ where: { tableName: 'Voyage', userId: { startsWith: 'u-' } } })) === 0)
  // Atomisitas sejati: audit PERTAMA (WA1_REVISI_DIGANTIKAN) berhasil, audit KEDUA (WA1_REVISI_DIBUAT)
  // digagalkan → audit pertama HARUS ikut batal. Bila audit ditulis di luar transaksi, baris pertama tertinggal.
  await adm.$executeRawUnsafe(`CREATE FUNCTION wa1s2c_gagal_audit() RETURNS trigger AS $$ BEGIN IF NEW."newValue"->>'peristiwa' = 'WA1_REVISI_DIBUAT' THEN RAISE EXCEPTION 'AUDIT_GAGAL_SENGAJA'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`)
  await adm.$executeRawUnsafe('CREATE TRIGGER wa1s2c_gagal_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION wa1s2c_gagal_audit()')
  const aktifX = await adm.communicationMessage.findFirst({ where: { candidateId: hS.candidateId, activeKey: { not: null } } })
  const digantiSebelum = await jumlahAudit('WA1_REVISI_DIGANTIKAN')
  const eX = await kode(() => revisi(A.ctx, hS.candidateId, aktifX.language === 'ID' ? 'EN' : 'ID'))
  const aktifX2 = await adm.communicationMessage.findFirst({ where: { candidateId: hS.candidateId, activeKey: { not: null } } })
  cek('35. audit ke-2 gagal → audit ke-1 (WA1_REVISI_DIGANTIKAN) & mutasi ikut ROLLBACK (satu transaksi)', eX !== null && (await jumlahAudit('WA1_REVISI_DIGANTIKAN')) === digantiSebelum && aktifX2.id === aktifX.id && aktifX2.state === aktifX.state && aktifX2.activeKey === aktifX.activeKey)
  await adm.$executeRawUnsafe('DROP TRIGGER wa1s2c_gagal_audit ON "AuditLog"')
  await adm.$executeRawUnsafe('DROP FUNCTION wa1s2c_gagal_audit()')
  await adm.$executeRawUnsafe(`CREATE FUNCTION wa1s2c_gagal_audit() RETURNS trigger AS $$ BEGIN IF NEW."tableName" IN ('CommunicationCandidate','CommunicationMessage','MonitoringSignal') THEN RAISE EXCEPTION 'AUDIT_GAGAL_SENGAJA'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`)
  await adm.$executeRawUnsafe('CREATE TRIGGER wa1s2c_gagal_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION wa1s2c_gagal_audit()')
  const gF = await jadwal(A)
  const eF = await kode(() => S.siapkanCandidate(A.ctx, { signalId: gF.s.eta.id }))
  cek('35. audit gagal saat candidate dibuat → galat, candidate TIDAK tersimpan (rollback)', eF !== null && (await adm.communicationCandidate.count({ where: { sourceRef: gF.a.id } })) === 0, String(eF))
  const nPesan = await adm.communicationMessage.count({ where: { candidateId: hS.candidateId } })
  const aktifSebelum = await adm.communicationMessage.findFirst({ where: { candidateId: hS.candidateId, activeKey: { not: null } } })
  const eR = await kode(() => revisi(A.ctx, hS.candidateId, 'ID'))
  const aktifSesudah = await adm.communicationMessage.findFirst({ where: { candidateId: hS.candidateId, activeKey: { not: null } } })
  cek('35. audit gagal saat revisi → revisi lama TETAP aktif, tak ada revisi baru (rollback atomik)', eR !== null && (await adm.communicationMessage.count({ where: { candidateId: hS.candidateId } })) === nPesan && aktifSesudah.id === aktifSebelum.id && aktifSesudah.state === aktifSebelum.state)
  const eP = await kode(() => S.tandaiDipratinjau(A.ctx, { messageId: rTz2.messageId, snapshotFingerprint: rTz2.snapshotFingerprint }))
  cek('35. audit gagal saat pratinjau → state tetap DRAFT', eP !== null && (await adm.communicationMessage.findFirst({ where: { id: rTz2.messageId } })).state === 'DRAFT')
  const blokF = await milestone(A, 'EOSP', { eventUbah: { deletedAt: new Date() } })
  const eBlok = await kode(() => S.siapkanCandidate(A.ctx, { signalId: blokF.s.id }))
  cek('35. audit gagal saat hard block → tak ada candidate BLOCKED tersimpan', eBlok !== null && (await adm.communicationCandidate.count({ where: { sourceRef: blokF.e.id } })) === 0)
  await adm.$executeRawUnsafe('DROP TRIGGER wa1s2c_gagal_audit ON "AuditLog"')
  await adm.$executeRawUnsafe('DROP FUNCTION wa1s2c_gagal_audit()')

  // ===================================================== tanpa approval/send
  bagian('[12] Tanpa approval / attempt / send / jaringan (36–38)')
  cek('36. 0 CommunicationAttempt', (await adm.communicationAttempt.count()) === 0)
  cek('37. 0 TahApprovalRequest', (await adm.tahApprovalRequest.count()) === 0)
  cek('tak ada pesan dengan medan approval/send terisi oleh service', (await adm.communicationMessage.count({ where: { OR: [{ approvalRequestId: { not: null } }, { approvedAt: { not: null } }, { fakeReceipt: { not: null } }, { state: { in: ['APPROVED', 'QUEUED_FAKE', 'FAKE_SENT', 'FAKE_FAILED'] } }] } })) === 0)
  cek('38. NOL panggilan jaringan (fetch/http/https/net/tls/dns/WebSocket)', egress.length === 0, egress.join(','))
} catch (e) {
  gagal++
  console.log(`  ❌ Uji berhenti karena galat: ${e?.stack ?? e}`)
} finally {
  try {
    await bersihkan()
    const sisa = await adm.tenant.count({ where: { companyName: { startsWith: TAG } } })
    cek('pembersihan: 0 tenant uji tersisa, trigger uji dihapus', sisa === 0 && (await adm.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = 'wa1s2c_gagal_audit'`))[0].n === 0)
  } finally {
    await adm.$disconnect()
    await prismaApp.$disconnect()
  }
}

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`)
process.exit(gagal === 0 ? 0 : 1)
