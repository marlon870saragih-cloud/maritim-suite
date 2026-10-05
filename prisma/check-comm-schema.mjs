// Uji schema + DB komunikasi WA-1 — Step 2B (persistensi saja; tanpa service/API/UI).
//
// Jalankan:
//   node prisma/check-comm-schema.mjs                         → bagian STATIS saja, lalu DILEWATI (kode 3)
//   COMM_SCHEMA_DB_URL=postgresql://postgres@127.0.0.1:55432/maritime_suite \
//     node prisma/check-comm-schema.mjs                       → STATIS + DB LOOPBACK
//
// DB WAJIB PostgreSQL loopback sekali pakai yang SUDAH `prisma migrate deploy`
// (prosedur docs/CHECKPOINT-LANJUTAN.md §6). Ditolak bila host bukan 127.0.0.1/localhost,
// bila DATABASE_URL/DIRECT_URL menunjuk DB lain, atau bila NODE_ENV=production.
// Semua baris uji bertanda `WA1S2B-` dan dihapus di akhir (termasuk saat gagal).
//
// Lapis:
//   S1. schema — tiga model, tenant CASCADE, unique PERSIS, tanpa index spekulatif,
//       approvalRequestId TANPA FK, default = konstanta Step 2A.
//   S2. migrasi — murni aditif, tanpa backfill/GRANT/tabel TAH, FK CASCADE.
//   S3. lingkup — TENANT_MODELS, belum ada kode aplikasi yang memakai tabel baru.
//   D1. default kolom di DB.            D2. constraint unik + race A–E (Promise.all).
//   D3. guard tenant (forTenant).       D4. FK / penghapusan (eksperimen ROLLBACK).

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = fileURLToPath(new URL('..', import.meta.url))
const baca = (rel) => readFileSync(join(AKAR, rel), 'utf8')

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

const P = await import('../src/services/communication/comm-policy.ts')
const F = await import('../src/services/communication/comm-fixture.ts')
const { TENANT_MODELS, tenantGuardExtension } = await import('../src/services/tenant-guard.ts')
const { JENIS_APPROVAL_TAH, JENIS_APPROVAL_WA_FAKE } = await import('../src/services/tah/registry.ts')

const MODEL = ['CommunicationCandidate', 'CommunicationMessage', 'CommunicationAttempt']
const schema = baca('prisma/schema.prisma')
const blok = (nama) => schema.match(new RegExp(`\\nmodel ${nama} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? ''
const tanpaKomentar = (s) => s.replace(/\/\/.*$/gm, '')

// ===================================================================== S1
bagian('[S1] Schema')
for (const m of MODEL) {
  const b = tanpaKomentar(blok(m))
  cek(`${m}: ada, id cuid`, b !== '' && /\bid\s+String\s+@id @default\(cuid\(\)\)/.test(b))
  cek(`${m}: tenantId + FK Tenant CASCADE`, /\n\s*tenantId\s+String\n/.test(b) && /tenant\s+Tenant\s+@relation\(fields: \[tenantId\], references: \[id\], onDelete: Cascade\)/.test(b))
  cek(`${m}: createdAt/updatedAt`, /createdAt\s+DateTime\s+@default\(now\(\)\)/.test(b) && /updatedAt\s+DateTime\s+@updatedAt/.test(b))
  cek(`${m}: tanpa @@index spekulatif (hanya @@unique)`, !/@@index/.test(b))
  cek(`${m}: tanpa relasi ke tabel TAH`, !/TahApprovalRequest|AgentRun|AgentModelCall/.test(b))
  cek(`${m}: tanpa enum Prisma (status/kode = String, pola K55)`, [...b.matchAll(/^\s+(\w+)\s+(\w+)/gm)].every(([, , t]) => ['String', 'Int', 'Boolean', 'DateTime', 'Json', 'Tenant', 'Voyage', 'CommunicationCandidate', 'CommunicationMessage', 'CommunicationAttempt'].includes(t)))
}
const C = tanpaKomentar(blok('CommunicationCandidate'))
const M = tanpaKomentar(blok('CommunicationMessage'))
const A = tanpaKomentar(blok('CommunicationAttempt'))
const unik = (b) => [...b.matchAll(/@@unique\(\[([^\]]+)\]\)/g)].map((x) => x[1].replace(/\s/g, '')).sort()
cek('Candidate: FK Voyage CASCADE (bukan Restrict/NoAction)', /voyage\s+Voyage\s+@relation\(fields: \[voyageId\], references: \[id\], onDelete: Cascade\)/.test(C))
cek('Candidate: unique PERSIS (tenantId, voyageId, sourceType, sourceRef)', unik(C).join('|') === 'tenantId,voyageId,sourceType,sourceRef')
cek('Message: unique PERSIS (candidateId,revision) (tenantId,activeKey) (tenantId,successKey)', unik(M).join('|') === 'candidateId,revision|tenantId,activeKey|tenantId,successKey')
cek('Attempt: unique PERSIS (messageId,attemptNo) (tenantId,idempotencyKey)', unik(A).join('|') === 'messageId,attemptNo|tenantId,idempotencyKey')
cek('Message → Candidate CASCADE; Attempt → Message CASCADE', /candidate\s+CommunicationCandidate\s+@relation\(fields: \[candidateId\], references: \[id\], onDelete: Cascade\)/.test(M) && /message\s+CommunicationMessage\s+@relation\(fields: \[messageId\], references: \[id\], onDelete: Cascade\)/.test(A))
cek('D-2B-01: approvalRequestId String? TANPA relasi', /\n\s*approvalRequestId\s+String\?\n/.test(M) && !/approvalRequest\s+\w+\s+@relation/.test(M))
cek('D-2B-02: activeKey & successKey nullable', /\n\s*activeKey\s+String\?\n/.test(M) && /\n\s*successKey\s+String\?\n/.test(M))
cek('D-2B-07: approvedByUserId + approvedAt di Message', /\n\s*approvedByUserId\s+String\?\n/.test(M) && /\n\s*approvedAt\s+DateTime\?\n/.test(M))
cek('OD-2A-05: penerima = recipientFixtureId + recipientIdentifier (tanpa kolom phone/nomor/e164)', /recipientFixtureId\s+String/.test(M) && /recipientIdentifier\s+String/.test(M) && !/phone|nomor|e164|msisdn/i.test(M))
cek('kolom pengguna = String polos (tanpa relasi User)', !/\sUser\s/.test(C + M + A))
cek('default state = konstanta Step 2A', new RegExp(`state\\s+String\\s+@default\\("${P.STATUS_CANDIDATE[0]}"\\)`).test(C) && new RegExp(`state\\s+String\\s+@default\\("${P.STATUS_PESAN[0]}"\\)`).test(M) && new RegExp(`state\\s+String\\s+@default\\("${P.STATUS_ATTEMPT[0]}"\\)`).test(A))
cek('Attempt: simulation default true, externalDelivery default false', /simulation\s+Boolean\s+@default\(true\)/.test(A) && /externalDelivery\s+Boolean\s+@default\(false\)/.test(A))
cek('version Int @default(1) di Candidate & Message (klaim optimistik)', [C, M].every((b) => /version\s+Int\s+@default\(1\)/.test(b)))
cek('Voyage: hanya rujukan balik communicationCandidates', /communicationCandidates\s+CommunicationCandidate\[\]/.test(blok('Voyage')))
cek('Tenant: rujukan balik ketiga model', ['communicationCandidates', 'communicationMessages', 'communicationAttempts'].every((r) => new RegExp(`${r}\\s+Communication\\w+\\[\\]`).test(blok('Tenant'))))
cek('TahApprovalRequest TIDAK disentuh (tanpa rujukan Communication)', blok('TahApprovalRequest') !== '' && !/Communication/.test(blok('TahApprovalRequest')))
cek('MonitoringSignal/AuditLog/VoyageEvent TIDAK disentuh (tanpa rujukan Communication)', ['MonitoringSignal', 'AuditLog', 'VoyageEvent'].every((m) => !/Communication/.test(blok(m))))

// ===================================================================== S2
bagian('[S2] Migrasi')
const dirMig = readdirSync(join(AKAR, 'prisma/migrations')).filter((d) => /wa1|communication/i.test(d))
cek('PERSIS satu migrasi WA-1', dirMig.length === 1, dirMig.join())
const sqlMentah = dirMig[0] ? baca(`prisma/migrations/${dirMig[0]}/migration.sql`) : ''
const sql = sqlMentah.replace(/--.*$/gm, '')
const pernyataan = sql.split(';').map((s) => s.trim()).filter(Boolean)
const BARU = new Set(MODEL)
const tabel = pernyataan.map((s) => /^CREATE TABLE "(\w+)"/.exec(s)?.[1]).filter(Boolean)
cek('membuat PERSIS tiga tabel baru', JSON.stringify([...tabel].sort()) === JSON.stringify([...MODEL].sort()), tabel.join())
const asing = pernyataan.filter((s) => {
  if (/^CREATE TABLE "(\w+)"/.test(s)) return !BARU.has(/^CREATE TABLE "(\w+)"/.exec(s)[1])
  if (/^CREATE UNIQUE INDEX "\w+" ON "(\w+)"/.test(s)) return !BARU.has(/ ON "(\w+)"/.exec(s)[1])
  if (/^ALTER TABLE "(\w+)" ADD CONSTRAINT "\w+" FOREIGN KEY/.test(s)) return !BARU.has(/^ALTER TABLE "(\w+)"/.exec(s)[1])
  return true
})
cek('MURNI ADITIF: hanya CREATE TABLE / CREATE UNIQUE INDEX / FK pada tabel baru', asing.length === 0, asing.map((s) => s.slice(0, 60)).join(' | '))
cek('PERSIS 6 unique index, 0 index non-unik', pernyataan.filter((s) => /^CREATE UNIQUE INDEX/.test(s)).length === 6 && !pernyataan.some((s) => /^CREATE INDEX/.test(s)))
const fk = pernyataan.filter((s) => /FOREIGN KEY/.test(s))
cek('PERSIS 6 FK, semuanya ON DELETE CASCADE', fk.length === 6 && fk.every((s) => /ON DELETE CASCADE/.test(s)))
cek('FK hanya ke Tenant, Voyage, dan tabel komunikasi', fk.every((s) => /REFERENCES "(Tenant|Voyage|CommunicationCandidate|CommunicationMessage)"/.test(s)))
cek('tanpa DROP / ALTER COLUMN / RENAME / SET NOT NULL', !/\bDROP\b|ALTER COLUMN|RENAME|SET NOT NULL/i.test(sql))
const tanpaBackfill = (t) => !/\b(INSERT|UPDATE|DELETE|TRUNCATE|MERGE|COPY)\b/i.test(t.replace(/ON (DELETE|UPDATE) (CASCADE|SET NULL|RESTRICT|NO ACTION)/gi, ''))
cek('tanpa backfill / penulisan data', tanpaBackfill(sql))
cek('tanpa GRANT / RLS (portal default-deny, K147)', !/\bGRANT\b|ROW LEVEL SECURITY|maritime_portal/i.test(sql))
cek('tak menyebut tabel TAH (termasuk komentar — kunci check-tah-policy)', !/AgentRun|AgentModelCall|TahApprovalRequest/.test(sqlMentah))

// ===================================================================== S3
bagian('[S3] Lingkup Step 2B/2C/2D')
cek('TENANT_MODELS memuat ketiga model', MODEL.every((m) => TENANT_MODELS.has(m)))
cek('Step 2D R1: definisi WA_INTERNAL_FAKE_TEST terpisah; registry TAH lama tanpa WA / CLIENT_WA_UPDATE', JENIS_APPROVAL_WA_FAKE.kind === 'WA_INTERNAL_FAKE_TEST' && !JENIS_APPROVAL_TAH.some((j) => ['WA_INTERNAL_FAKE_TEST', 'CLIENT_WA_UPDATE'].includes(j.kind)))
const jelajah = (rel, hasil = []) => {
  for (const d of readdirSync(join(AKAR, rel), { withFileTypes: true })) {
    const p = `${rel}/${d.name}`
    if (d.isDirectory()) jelajah(p, hasil)
    else if (/\.(ts|tsx)$/.test(d.name)) hasil.push(p)
  }
  return hasil
}
const pemakai = jelajah('src').filter((p) => /communicationCandidate|communicationMessage|communicationAttempt/.test(baca(p)))
cek('Step 2D: HANYA service Prepare (2C) & approval (2D) yang membaca/menulis tabel komunikasi', pemakai.sort().join() === 'src/services/communication/communication-approval.service.ts,src/services/communication/communication.service.ts', pemakai.join(', '))
cek('Step 2D: kedua service belum menulis CommunicationAttempt (Send = 2E)', ['communication.service.ts', 'communication-approval.service.ts'].every((f) => !/communicationAttempt/.test(baca(`src/services/communication/${f}`))))

// ===================================================================== DB
const URL_DB = process.env.COMM_SCHEMA_DB_URL
if (!URL_DB) {
  console.log(`\nBagian DB DILEWATI — COMM_SCHEMA_DB_URL tidak diset. Statis: ${lulus} lulus, ${gagal} gagal.`)
  process.exit(gagal === 0 ? 3 : 1)
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
for (const n of ['DATABASE_URL', 'DIRECT_URL']) if (process.env[n] && process.env[n] !== URL_DB) tolak.push(`${n} menunjuk DB lain`)
if (tolak.length) {
  console.log(`\n❌ DITOLAK (DB tidak disentuh): ${tolak.join(' | ')}`)
  process.exit(1)
}

const { PrismaClient, Prisma } = await import('@prisma/client')
const prisma = new PrismaClient({ datasources: { db: { url: URL_DB } } })
const TAG = 'WA1S2B-'
const P2002 = (e) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
const gagalP2002 = async (fn) => {
  try {
    await fn()
    return false
  } catch (e) {
    return P2002(e)
  }
}
const ROLLBACK = new Error('ROLLBACK_SENGAJA')
const eksperimen = async (fn) => {
  let hasil
  try {
    await prisma.$transaction(async (tx) => {
      hasil = await fn(tx)
      throw ROLLBACK
    })
  } catch (e) {
    if (e !== ROLLBACK) throw e
  }
  return hasil
}

async function bersihkan() {
  await prisma.tenant.deleteMany({ where: { companyName: { startsWith: TAG } } })
}

try {
  bagian('[D0] DB loopback')
  const mig = await prisma.$queryRaw`SELECT migration_name, finished_at FROM "_prisma_migrations" WHERE migration_name = ${dirMig[0]}`
  cek(`migrasi ${dirMig[0]} sudah diterapkan di DB loopback`, mig.length === 1 && mig[0].finished_at !== null)
  const [{ current_database: namaDb }] = await prisma.$queryRaw`SELECT current_database()`
  cek('identitas DB = URL uji', namaDb === urlDb.pathname.slice(1), String(namaDb))
  await bersihkan()

  const tenantA = await prisma.tenant.create({ data: { companyName: `${TAG}Tenant A` } })
  const tenantB = await prisma.tenant.create({ data: { companyName: `${TAG}Tenant B` } })
  const kapal = (t) => prisma.vessel.create({ data: { tenantId: t.id, name: `${TAG}MT Contoh` } })
  const kA = await kapal(tenantA)
  const kB = await kapal(tenantB)
  const vA = await prisma.voyage.create({ data: { tenantId: tenantA.id, vesselId: kA.id, voyageNumber: `${TAG}A-1` } })
  const vA2 = await prisma.voyage.create({ data: { tenantId: tenantA.id, vesselId: kA.id, voyageNumber: `${TAG}A-2` } })
  const vB = await prisma.voyage.create({ data: { tenantId: tenantB.id, vesselId: kB.id, voyageNumber: `${TAG}B-1` } })

  const kandidat = (t, v, ref, ubah = {}) => ({ tenantId: t.id, voyageId: v.id, family: 'SCHEDULE_CHANGE', sourceType: 'AUDIT_LOG', sourceRef: ref, createdByUserId: 'u-uji', ...ubah })
  const fx = F.FIXTURE_PENERIMA[0]
  const pesan = (t, c, rev, ubah = {}) => {
    const logis = P.teksKunciPesanLogis({ tenantId: t.id, voyageId: c.voyageId, sourceType: c.sourceType, sourceRef: c.sourceRef }, fx.pengenal)
    return {
      tenantId: t.id, candidateId: c.id, revision: rev, logicalMessageKey: logis, activeKey: logis,
      recipientFixtureId: fx.id, recipientIdentifier: fx.pengenal, language: 'ID', templateId: 'wa1.schedule.ID.v1', templateVersion: 1,
      body: '[SIMULASI INTERNAL — TIDAK DIKIRIM]', fields: { uji: true }, sourceFingerprint: 'a'.repeat(64), snapshotFingerprint: `${rev}`.padStart(64, 'b'),
      mode: P.MODE_KOMUNIKASI, createdByUserId: 'u-uji', ...ubah,
    }
  }
  const percobaan = (t, m, no, kunci, ubah = {}) => ({ tenantId: t.id, messageId: m.id, attemptNo: no, idempotencyKey: kunci, provider: 'FAKE', scenario: 'SUCCESS', requestedByUserId: 'u-uji', ...ubah })

  // ------------------------------------------------------------------- D1
  bagian('[D1] Default kolom di DB')
  const cA = await prisma.communicationCandidate.create({ data: kandidat(tenantA, vA, 'audit-1') })
  cek('candidate: state ACTIVE, version 1, signalIds & includedFields []', cA.state === 'ACTIVE' && cA.version === 1 && Array.isArray(cA.signalIds) && cA.signalIds.length === 0 && cA.includedFields.length === 0)
  const m1 = await prisma.communicationMessage.create({ data: pesan(tenantA, cA, 1) })
  cek('message: state DRAFT, version 1, successKey/approval kosong', m1.state === 'DRAFT' && m1.version === 1 && m1.successKey === null && m1.approvalRequestId === null && m1.approvedAt === null)
  const a1 = await prisma.communicationAttempt.create({ data: percobaan(tenantA, m1, 1, 'idem-1') })
  cek('attempt: state QUEUED_FAKE, simulation true, externalDelivery false', a1.state === 'QUEUED_FAKE' && a1.simulation === true && a1.externalDelivery === false && a1.claimedAt instanceof Date)
  cek('D-2B-01: approvalRequestId boleh id sembarang (tanpa FK ke tabel approval)', (await prisma.communicationMessage.updateMany({ where: { id: m1.id }, data: { approvalRequestId: 'bukan-id-approval-nyata' } })).count === 1)

  // ------------------------------------------------------------------- D2
  bagian('[D2] Constraint unik & race')
  cek('candidate kunci sumber sama → P2002', await gagalP2002(() => prisma.communicationCandidate.create({ data: kandidat(tenantA, vA, 'audit-1', { family: 'EOSP' }) })))
  cek('sourceRef sama di voyage lain → boleh', !!(await prisma.communicationCandidate.create({ data: kandidat(tenantA, vA2, 'audit-1') })))
  cek('sourceRef sama di tenant lain → boleh', !!(await prisma.communicationCandidate.create({ data: kandidat(tenantB, vB, 'audit-1') })))
  cek('sourceType berbeda, sourceRef sama → boleh (VOYAGE_EVENT vs AUDIT_LOG)', !!(await prisma.communicationCandidate.create({ data: kandidat(tenantA, vA, 'audit-1', { sourceType: 'VOYAGE_EVENT', family: 'EOSP' }) })))
  const raceA = await Promise.allSettled(Array.from({ length: 6 }, () => prisma.communicationCandidate.create({ data: kandidat(tenantA, vA, 'race-a') })))
  cek('Race A: 6 create bersamaan → tepat 1 berhasil, 5 P2002', raceA.filter((r) => r.status === 'fulfilled').length === 1 && raceA.filter((r) => r.status === 'rejected' && P2002(r.reason)).length === 5)

  const cB = await prisma.communicationCandidate.create({ data: kandidat(tenantA, vA, 'audit-rev') })
  cek('revisi sama pada candidate sama → P2002', await (async () => {
    await prisma.communicationMessage.create({ data: pesan(tenantA, cB, 1, { activeKey: null }) })
    return gagalP2002(() => prisma.communicationMessage.create({ data: pesan(tenantA, cB, 1, { activeKey: null }) }))
  })())
  const raceB = await Promise.allSettled(Array.from({ length: 5 }, () => prisma.communicationMessage.create({ data: pesan(tenantA, cB, 2, { activeKey: null }) })))
  cek('Race B: 5 Prepare revisi sama bersamaan → tepat 1 berhasil', raceB.filter((r) => r.status === 'fulfilled').length === 1 && raceB.filter((r) => r.status === 'rejected' && P2002(r.reason)).length === 4)

  const cC = await prisma.communicationCandidate.create({ data: kandidat(tenantA, vA, 'audit-aktif') })
  const r1 = await prisma.communicationMessage.create({ data: pesan(tenantA, cC, 1) })
  cek('D-2B-02: revisi AKTIF kedua untuk pesan logis sama → P2002', await gagalP2002(() => prisma.communicationMessage.create({ data: pesan(tenantA, cC, 2) })))
  await prisma.communicationMessage.updateMany({ where: { id: r1.id }, data: { state: 'CANCELED', reasonCode: 'REVISED', activeKey: null } })
  cek('D-2B-03: setelah revisi lama CANCELED/REVISED (activeKey NULL) → revisi baru boleh', !!(await prisma.communicationMessage.create({ data: pesan(tenantA, cC, 2) })))
  cek('activeKey NULL boleh banyak (riwayat revisi terminal)', (await prisma.communicationMessage.count({ where: { tenantId: tenantA.id, activeKey: null } })) >= 3)

  const cD = await prisma.communicationCandidate.create({ data: kandidat(tenantA, vA, 'audit-sukses') })
  const d1 = await prisma.communicationMessage.create({ data: pesan(tenantA, cD, 1, { activeKey: null }) })
  const d2 = await prisma.communicationMessage.create({ data: pesan(tenantA, cD, 2, { activeKey: null }) })
  cek('successKey NULL boleh banyak', d1.successKey === null && d2.successKey === null)
  const raceD = await Promise.allSettled([d1, d2].map((m) => prisma.communicationMessage.updateMany({ where: { id: m.id }, data: { state: 'FAKE_SENT', successKey: m.logicalMessageKey } })))
  cek('Race D: dua revisi berbeda menandai sukses bersamaan → tepat 1 menang (successKey unik)', raceD.filter((r) => r.status === 'fulfilled').length === 1 && raceD.filter((r) => r.status === 'rejected' && P2002(r.reason)).length === 1)
  cek('successKey sama di tenant lain → boleh', !!(await prisma.communicationMessage.create({ data: pesan(tenantB, await prisma.communicationCandidate.findFirstOrThrow({ where: { tenantId: tenantB.id } }), 9, { activeKey: null, successKey: d1.logicalMessageKey }) })))

  const cE = await prisma.communicationCandidate.create({ data: kandidat(tenantA, vA, 'audit-attempt') })
  const e1 = await prisma.communicationMessage.create({ data: pesan(tenantA, cE, 1) })
  await prisma.communicationAttempt.create({ data: percobaan(tenantA, e1, 1, 'idem-e1') })
  cek('attemptNo sama pada message sama → P2002', await gagalP2002(() => prisma.communicationAttempt.create({ data: percobaan(tenantA, e1, 1, 'idem-e1-lain') })))
  cek('idempotencyKey sama di tenant sama → P2002', await gagalP2002(() => prisma.communicationAttempt.create({ data: percobaan(tenantA, e1, 2, 'idem-e1') })))
  const raceC = await Promise.allSettled([2, 3, 4].map((no) => prisma.communicationAttempt.create({ data: percobaan(tenantA, e1, no, 'idem-race-c') })))
  cek('Race C: 3 Send dengan idempotency key sama bersamaan → tepat 1 berhasil', raceC.filter((r) => r.status === 'fulfilled').length === 1 && raceC.filter((r) => r.status === 'rejected' && P2002(r.reason)).length === 2)
  const raceNo = await Promise.allSettled(['x1', 'x2', 'x3'].map((k) => prisma.communicationAttempt.create({ data: percobaan(tenantA, e1, 9, k) })))
  cek('dua+ attempt berbeda dengan attemptNo sama bersamaan → tepat 1 berhasil', raceNo.filter((r) => r.status === 'fulfilled').length === 1)

  const raceE = await Promise.all([
    prisma.communicationMessage.updateMany({ where: { id: e1.id, state: 'DRAFT', version: 1 }, data: { state: 'CANCELED', reasonCode: null, activeKey: null, version: { increment: 1 } } }),
    prisma.communicationMessage.updateMany({ where: { id: e1.id, state: 'DRAFT', version: 1 }, data: { state: 'QUEUED_FAKE', version: { increment: 1 } } }),
  ])
  const akhirE = await prisma.communicationMessage.findFirstOrThrow({ where: { id: e1.id } })
  cek('Race E: Cancel vs Send bersyarat state+version → tepat 1 transisi menang', raceE[0].count + raceE[1].count === 1 && akhirE.version === 2 && ['CANCELED', 'QUEUED_FAKE'].includes(akhirE.state), akhirE.state)

  // ------------------------------------------------------------------- D3
  bagian('[D3] Guard tenant (forTenant)')
  const dbA = prisma.$extends(tenantGuardExtension(tenantA.id))
  const dbB = prisma.$extends(tenantGuardExtension(tenantB.id))
  const lihatA = await dbA.communicationCandidate.findMany({ select: { tenantId: true } })
  const lihatB = await dbB.communicationCandidate.findMany({ select: { tenantId: true } })
  cek('forTenant(A) hanya melihat candidate A; forTenant(B) hanya B', lihatA.length > 0 && lihatA.every((r) => r.tenantId === tenantA.id) && lihatB.length > 0 && lihatB.every((r) => r.tenantId === tenantB.id))
  cek('forTenant(B) tak bisa membaca message/attempt A lewat id', (await dbB.communicationMessage.findFirst({ where: { id: m1.id } })) === null && (await dbB.communicationAttempt.findFirst({ where: { id: a1.id } })) === null)
  cek('forTenant(B) updateMany pada baris A → count 0', (await dbB.communicationMessage.updateMany({ where: { id: m1.id }, data: { state: 'CANCELED' } })).count === 0)
  const sisip = await dbA.communicationCandidate.create({ data: kandidat(tenantB, vA, 'audit-sisip') })
  cek('create dengan tenantId lain di data → ditimpa tenant konteks', sisip.tenantId === tenantA.id)
  const dilarang = []
  for (const [nama, fn] of [
    ['findUnique', () => dbA.communicationCandidate.findUnique({ where: { id: cA.id } })],
    ['update', () => dbA.communicationMessage.update({ where: { id: m1.id }, data: { state: 'CANCELED' } })],
    ['delete', () => dbA.communicationAttempt.delete({ where: { id: a1.id } })],
    ['upsert', () => dbA.communicationCandidate.upsert({ where: { id: cA.id }, create: kandidat(tenantA, vA, 'x'), update: {} })],
  ]) {
    try {
      await fn()
    } catch (e) {
      if (/tenant-guard/.test(String(e?.message))) dilarang.push(nama)
    }
  }
  cek('findUnique/update/delete/upsert pada model baru ditolak guard', dilarang.join() === 'findUnique,update,delete,upsert', dilarang.join())
  const silang = await prisma.communicationMessage.create({ data: pesan(tenantA, await prisma.communicationCandidate.findFirstOrThrow({ where: { tenantId: tenantB.id } }), 77, { activeKey: null }) })
  cek('D-2B-06 (DITERIMA, didokumentasikan): DB TIDAK mencegah message A → candidate B; WAJIB dicegah service 2C (muat induk lewat forTenant)', !!silang)
  await prisma.communicationMessage.deleteMany({ where: { id: silang.id } })

  // ------------------------------------------------------------------- D4
  bagian('[D4] FK & penghapusan (eksperimen ROLLBACK)')
  const hitung = async (db, tenantId) => ({
    c: await db.communicationCandidate.count({ where: { tenantId } }),
    m: await db.communicationMessage.count({ where: { tenantId } }),
    a: await db.communicationAttempt.count({ where: { tenantId } }),
  })
  const sebelum = await hitung(prisma, tenantA.id)
  const saatHapus = await eksperimen(async (tx) => {
    await tx.tenant.delete({ where: { id: tenantA.id } })
    return hitung(tx, tenantA.id)
  })
  cek('hapus tenant → candidate/message/attempt ikut terhapus (CASCADE, tak menggagalkan)', saatHapus.c === 0 && saatHapus.m === 0 && saatHapus.a === 0 && sebelum.c > 0 && sebelum.m > 0 && sebelum.a > 0, JSON.stringify(sebelum))
  const pulih = await hitung(prisma, tenantA.id)
  cek('ROLLBACK memulihkan semua baris (eksperimen tak meninggalkan efek)', JSON.stringify(pulih) === JSON.stringify(sebelum))
  const saatVoyage = await eksperimen(async (tx) => {
    const idC = (await tx.communicationCandidate.findMany({ where: { voyageId: vA.id }, select: { id: true } })).map((x) => x.id)
    await tx.voyage.delete({ where: { id: vA.id } })
    return {
      c: await tx.communicationCandidate.count({ where: { voyageId: vA.id } }),
      m: await tx.communicationMessage.count({ where: { candidateId: { in: idC } } }),
      sisaVoyageLain: await tx.communicationCandidate.count({ where: { voyageId: vA2.id } }),
    }
  })
  cek('hard delete voyage → candidate & turunannya ikut terhapus; voyage lain utuh', saatVoyage.c === 0 && saatVoyage.m === 0 && saatVoyage.sisaVoyageLain > 0)
  const saatCandidate = await eksperimen(async (tx) => {
    await tx.communicationCandidate.delete({ where: { id: cE.id } })
    return { m: await tx.communicationMessage.count({ where: { candidateId: cE.id } }), a: await tx.communicationAttempt.count({ where: { messageId: e1.id } }) }
  })
  cek('hapus candidate → message & attempt ikut terhapus (agregat satu; aplikasi tanpa jalur hapus)', saatCandidate.m === 0 && saatCandidate.a === 0)
  const saatSoftDelete = await eksperimen(async (tx) => {
    await tx.voyage.updateMany({ where: { id: vA.id }, data: { deletedAt: new Date() } })
    return tx.communicationCandidate.count({ where: { voyageId: vA.id } })
  })
  cek('soft delete voyage (perilaku aplikasi) → riwayat komunikasi TETAP ada', saatSoftDelete > 0)
} catch (e) {
  gagal++
  console.log(`  ❌ Uji DB berhenti karena galat: ${e?.message ?? e}`)
} finally {
  try {
    await bersihkan()
    const sisa = await prisma.tenant.count({ where: { companyName: { startsWith: TAG } } })
    const sisaKom = await prisma.communicationCandidate.count({ where: { sourceRef: { in: ['audit-1', 'race-a', 'audit-rev', 'audit-aktif', 'audit-sukses', 'audit-attempt', 'audit-sisip'] } } })
    cek('pembersihan: 0 tenant/candidate uji tersisa', sisa === 0 && sisaKom === 0, `${sisa}/${sisaKom}`)
  } finally {
    await prisma.$disconnect()
  }
}

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`)
process.exit(gagal === 0 ? 0 : 1)
