// Uji schema + DB fondasi WhatsApp klien — WA-2a Step 2B (persistensi saja; tanpa service/API/UI).
//
// Jalankan:
//   node prisma/check-wa2a-schema.mjs                          → bagian STATIS saja, lalu DILEWATI (kode 3)
//   WA2A_SCHEMA_DB_URL=postgresql://postgres@127.0.0.1:55432/maritime_suite \
//     node prisma/check-wa2a-schema.mjs                        → STATIS + DB LOOPBACK
//
// DB WAJIB PostgreSQL loopback sekali pakai yang SUDAH `prisma migrate deploy`
// (prosedur docs/CHECKPOINT-LANJUTAN.md §6). Ditolak bila host bukan loopback, bila
// DATABASE_URL/DIRECT_URL menunjuk DB lain, atau bila NODE_ENV=production.
// Data uji sintetis bertanda `WA2AB-`; dibersihkan di akhir lewat HAPUS TENANT (sekaligus
// membuktikan hapus tenant tetap berjalan). Tanpa nomor telepon nyata (pola +6299900…).
//
// Lapis:
//   S1. schema — 7 model, tenant CASCADE, FK pihak NO ACTION, FK komposit, unik, TENANT_MODELS.
//   S2. migrasi — murni aditif (hanya tabel baru), 5 CHECK, trigger hanya pada tabel baru.
//   S3. lingkup — belum ada kode aplikasi yang memakai tabel baru; berkas beku tidak tersentuh.
//   D1. objek DB nyata (tabel, CHECK, trigger, aksi FK).
//   D2. kontak: pihak tepat-satu, kunci aktif, nomor aktif unik (DB-3), identitas & INACTIVE terminal.
//   D3. consent: FK komposit tenant, append-only, identitas state.
//   D4. grant principal: hanya voyage principal-nya, maker-checker, transisi, cakupan terkunci, revoke.
//   D5. pesan klien & konfirmasi jadwal: tenant kandidat/voyage, snapshot pihak, append-only.
//   D6. guard tenant aplikasi (forTenant).
//   D7. penghapusan: pihak ditolak, baris bukti ditolak, voyage menyusutkan cakupan, tenant berhasil.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
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

const MODEL_BARU = [
  'WaContact',
  'WaConsentState',
  'WaConsentEvent',
  'WaPrincipalAccessGrant',
  'WaPrincipalAccessGrantVoyage',
  'WaClientMessage',
  'VoyageScheduleConfirmation',
]
const MIGRASI = '20261010180000_wa2a_contact_consent_access'
const CHECK_WAJIB = [
  'WaContact_party_xor',
  'WaContact_active_key',
  'WaGrant_maker_checker',
  'WaGrant_categories_allowed',
  'VoyageScheduleConfirmation_field',
]
const TRIGGER_WAJIB = [
  ['wa2a_contact_guard', 'WaContact'],
  ['wa2a_contact_no_delete', 'WaContact'],
  ['wa2a_consent_state_guard', 'WaConsentState'],
  ['wa2a_consent_state_no_delete', 'WaConsentState'],
  ['wa2a_consent_event_append_only', 'WaConsentEvent'],
  ['wa2a_consent_event_no_delete', 'WaConsentEvent'],
  ['wa2a_grant_guard', 'WaPrincipalAccessGrant'],
  ['wa2a_grant_no_delete', 'WaPrincipalAccessGrant'],
  ['wa2a_grant_voyage_guard', 'WaPrincipalAccessGrantVoyage'],
  ['wa2a_client_message_guard', 'WaClientMessage'],
  ['wa2a_schedule_confirmation_guard', 'VoyageScheduleConfirmation'],
]

const { TENANT_MODELS, tenantGuardExtension } = await import('../src/services/tenant-guard.ts')
const K = await import('../src/services/whatsapp/wa2-policy.ts')

// ============================================================================ S1
bagian('[S1] Schema Prisma')
const schema = baca('prisma/schema.prisma')
const blok = (m) => schema.match(new RegExp(`\\nmodel ${m} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? ''
for (const m of MODEL_BARU) {
  cek(`${m}: ada, FK tenant CASCADE, terdaftar di TENANT_MODELS`, blok(m) !== '' && /tenant\s+Tenant\s+@relation\(fields: \[tenantId\], references: \[id\], onDelete: Cascade\)/.test(blok(m)) && TENANT_MODELS.has(m))
}
cek('WaContact: FK Customer & Principal = NoAction (DB-1, menolak hapus pihak)', /customer\s+Customer\?\s+@relation\(fields: \[customerId\], references: \[id\], onDelete: NoAction\)/.test(blok('WaContact')) && /principal\s+Principal\?\s+@relation\(fields: \[principalId\], references: \[id\], onDelete: NoAction\)/.test(blok('WaContact')))
cek('WaContact: unik (tenantId, activeE164Key) — DB-3', /@@unique\(\[tenantId, activeE164Key\]\)/.test(blok('WaContact')))
cek('WaConsentState/Event/ClientMessage: FK komposit (tenantId, contactId) → WaContact(tenantId, id)', ['WaConsentState', 'WaConsentEvent', 'WaClientMessage'].every((m) => /@relation\(fields: \[tenantId, contactId\], references: \[tenantId, id\], onDelete: NoAction\)/.test(blok(m))))
cek('WaPrincipalAccessGrant: FK komposit (tenantId, contactId, principalId) + FK Principal NoAction', /@relation\(fields: \[tenantId, contactId, principalId\], references: \[tenantId, id, principalId\], onDelete: NoAction\)/.test(blok('WaPrincipalAccessGrant')) && /principal\s+Principal\s+@relation\(fields: \[principalId\], references: \[id\], onDelete: NoAction\)/.test(blok('WaPrincipalAccessGrant')))
cek('WaPrincipalAccessGrantVoyage: FK komposit (tenantId, grantId) + unik (grantId, voyageId)', /@relation\(fields: \[tenantId, grantId\], references: \[tenantId, id\], onDelete: Cascade\)/.test(blok('WaPrincipalAccessGrantVoyage')) && /@@unique\(\[grantId, voyageId\]\)/.test(blok('WaPrincipalAccessGrantVoyage')))
cek('WaClientMessage: unik pola WA-1 (candidateId+revision, activeKey, successKey); approvalRequestId TANPA FK', ['@@unique([candidateId, revision])', '@@unique([tenantId, activeKey])', '@@unique([tenantId, successKey])'].every((u) => blok('WaClientMessage').includes(u)) && /approvalRequestId String\?/.test(blok('WaClientMessage')) && !/approvalRequest\s+TahApprovalRequest/.test(blok('WaClientMessage')))
cek('Model lama: hanya rujukan balik (tanpa kolom skalar baru)', (() => {
  const lama = { Tenant: 'tenant', Customer: '', Principal: '', Voyage: '', CommunicationCandidate: '' }
  return Object.keys(lama).every((m) => !/^\s+(wa|voyageSchedule)\w*\s+(String|Int|DateTime|Boolean|Json)/m.test(blok(m)))
})())
const schemaHead = execFileSync('git', ['show', 'HEAD:prisma/schema.prisma'], { cwd: AKAR, encoding: 'utf8' })
const blokDari = (src, m) => src.match(new RegExp(`\\nmodel ${m} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? null
cek('model WA-1/TAH (CommunicationCandidate/Message/Attempt, TahApprovalRequest) IDENTIK dengan HEAD', ['CommunicationCandidate', 'CommunicationMessage', 'CommunicationAttempt', 'TahApprovalRequest', 'AgentRun'].every((m) => blokDari(schemaHead, m) !== null && blokDari(schemaHead, m) === blok(m)))
cek('WaClientMessage.candidateId TANPA relasi/FK ke CommunicationCandidate (model WA-1 tak disentuh)', /candidateId String/.test(blok('WaClientMessage')) && !/CommunicationCandidate\s+@relation/.test(blok('WaClientMessage')))
cek('Kosakata wa2-policy selaras CHECK (kategori grant, field konfirmasi, pihak)', K.KATEGORI_DATA_GRANT.join() === 'STATUS,SCHEDULE_ESTIMATE,SCHEDULE_ACTUAL,MILESTONE' && K.FIELD_KONFIRMASI_JADWAL.join() === 'eta,etb,etd' && K.JENIS_PIHAK_KONTAK.join() === 'CUSTOMER,PRINCIPAL')

// ============================================================================ S2
bagian('[S2] Migrasi aditif')
const dirMigrasi = readdirSync(join(AKAR, 'prisma/migrations')).filter((d) => /^\d{14}_/.test(d)).sort()
cek(`migrasi ${MIGRASI} ada & paling akhir`, dirMigrasi.at(-1) === MIGRASI)
const sql = baca(`prisma/migrations/${MIGRASI}/migration.sql`)
const sqlTanpaKomentar = sql.replace(/--[^\n]*/g, '')
const tabelDibuat = [...sqlTanpaKomentar.matchAll(/CREATE TABLE "(\w+)"/g)].map((m) => m[1]).sort()
cek('CREATE TABLE persis 7 tabel baru', tabelDibuat.join() === [...MODEL_BARU].sort().join(), tabelDibuat.join())
const alterTarget = [...sqlTanpaKomentar.matchAll(/ALTER TABLE "(\w+)"/g)].map((m) => m[1])
cek('ALTER TABLE hanya pada tabel baru', alterTarget.length > 0 && alterTarget.every((t) => MODEL_BARU.includes(t)), `${alterTarget.length} pernyataan`)
const triggerOn = [...sqlTanpaKomentar.matchAll(/CREATE TRIGGER "\w+" BEFORE [A-Z ]+ ON "(\w+)"/g)].map((m) => m[1])
cek('CREATE TRIGGER hanya pada tabel baru (11)', triggerOn.length === 11 && triggerOn.every((t) => MODEL_BARU.includes(t)))
cek('tanpa DROP / RENAME / TRUNCATE / INSERT / UPDATE / DELETE data / GRANT / ROLE / PASSWORD', !/\b(DROP|RENAME|TRUNCATE|INSERT INTO|GRANT|REVOKE|CREATE ROLE|ALTER ROLE|PASSWORD)\b/i.test(sqlTanpaKomentar.replace(/RAISE EXCEPTION '[^']*'/g, '')) && !/^\s*(UPDATE|DELETE FROM)\s/im.test(sqlTanpaKomentar))
cek('tanpa nomor telepon / angka berbentuk telepon', !/\+\d{6,}|\b0\d{9,}\b/.test(sql))
cek('5 CHECK wajib ada', CHECK_WAJIB.every((n) => sql.includes(`ADD CONSTRAINT "${n}" CHECK`)))
cek('FK Customer/Principal = ON DELETE NO ACTION; FK Tenant = CASCADE', /"WaContact_customerId_fkey"[^;]*ON DELETE NO ACTION/.test(sql) && /"WaContact_principalId_fkey"[^;]*ON DELETE NO ACTION/.test(sql) && /"WaPrincipalAccessGrant_principalId_fkey"[^;]*ON DELETE NO ACTION/.test(sql) && MODEL_BARU.every((m) => new RegExp(`"${m}_tenantId_fkey"[^;]*ON DELETE CASCADE`).test(sql)))
cek('Kode galat trigger = daftar KODE_GALAT_DB_WA2A', (() => {
  const diSql = new Set([...sqlTanpaKomentar.matchAll(/'(WA2A_[A-Z_]+)/g)].map((m) => m[1]))
  return diSql.size === K.KODE_GALAT_DB_WA2A.length && K.KODE_GALAT_DB_WA2A.every((k) => diSql.has(k))
})())

// ============================================================================ S3
bagian('[S3] Lingkup Step 2B')
const semuaSrc = execFileSync('git', ['ls-files', 'src'], { cwd: AKAR, encoding: 'utf8' }).trim().split('\n')
const pemakai = semuaSrc.filter((f) => /\.(ts|tsx)$/.test(f) && /\.(waContact|waConsentState|waConsentEvent|waPrincipalAccessGrant|waPrincipalAccessGrantVoyage|waClientMessage|voyageScheduleConfirmation)\b/.test(baca(f)))
cek('belum ada kode aplikasi yang memakai tabel baru', pemakai.length === 0, pemakai.join(', '))
const policy = baca('src/services/whatsapp/wa2-policy.ts').replace(/\/\/[^\n]*|\/\*\*?[\s\S]*?\*\//g, '')
cek('wa2-policy.ts: data saja (tanpa impor, process.env, DB, jaringan)', !/^\s*import\s/m.test(policy) && !/process\.env|prisma|fetch\(/.test(policy))
const berubah = execFileSync('git', ['diff', '--name-only', 'HEAD'], { cwd: AKAR, encoding: 'utf8' }).trim().split('\n').filter(Boolean)
const baru = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: AKAR, encoding: 'utf8' }).trim().split('\n').filter(Boolean)
const BEKU = [/^src\/services\/communication\//, /^src\/services\/tah\//, /^src\/services\/intake\//, /^docs\/whatsapp\/PRD-WA-1\.md$/, /^prisma\/check-comm-/, /^prisma\/check-tah-/, /^prisma\/check-validator/, /^prisma\/migrations\/(?!20261010180000_)/]
cek('tidak ada berkas WA-1 / TAH / Validator V3 / migrasi lama yang berubah', [...berubah, ...baru].every((f) => !BEKU.some((r) => r.test(f))), [...berubah, ...baru].join(', '))

// ============================================================================ DB
const urlTeks = process.env.WA2A_SCHEMA_DB_URL
if (!urlTeks) {
  console.log(`\nDILEWATI bagian DB — WA2A_SCHEMA_DB_URL tidak diset. Statis: lulus ${lulus}, gagal ${gagal}.`)
  process.exit(gagal === 0 ? 3 : 1)
}
let urlDb = null
try {
  urlDb = new URL(urlTeks)
} catch {
  /* ditolak di bawah */
}
const tolak = []
if (!urlDb) tolak.push('URL tidak sah')
if (urlDb && !['127.0.0.1', 'localhost', '::1', '[::1]'].includes(urlDb.hostname)) tolak.push('host bukan loopback')
if ((process.env.NODE_ENV ?? '').trim().toLowerCase() === 'production') tolak.push('NODE_ENV=production')
for (const n of ['DATABASE_URL', 'DIRECT_URL']) if (process.env[n] && process.env[n] !== urlTeks) tolak.push(`${n} menunjuk DB lain`)
if (tolak.length) {
  console.log(`\n❌ DITOLAK (DB tidak disentuh): ${tolak.join('; ')}`)
  process.exit(1)
}

const { PrismaClient } = await import('@prisma/client')
const prisma = new PrismaClient({ datasources: { db: { url: urlTeks } } })
const dbTenant = (t) => prisma.$extends(tenantGuardExtension(t))
const TAG = 'WA2AB-'
const q = (s, ...p) => prisma.$queryRawUnsafe(s, ...p)
const x = (s, ...p) => prisma.$executeRawUnsafe(s, ...p)
/** Jalankan; true bila GAGAL dengan pesan yang cocok pola. */
async function ditolak(fn, pola) {
  try {
    await fn()
    return { ok: false, pesan: '(berhasil — seharusnya ditolak)' }
  } catch (e) {
    const pesan = String(e?.meta?.message ?? e?.message ?? e)
    return { ok: pola.test(pesan), pesan: pesan.replace(/\s+/g, ' ').slice(0, 160) }
  }
}
async function cekTolak(nama, fn, pola) {
  const r = await ditolak(fn, pola)
  cek(nama, r.ok, r.ok ? '' : r.pesan)
}
let n = 0
const id = (p) => `${TAG}${p}-${++n}`
const nomor = (k) => `+6299900${String(k).padStart(5, '0')}` // rentang sintetis, bukan nomor nyata

const tenantDibuat = []
try {
  // ========================================================================== D1
  bagian('[D1] Objek DB nyata')
  const mig = await q(`SELECT finished_at FROM _prisma_migrations WHERE migration_name = $1`, MIGRASI)
  cek('migrasi tercatat selesai di _prisma_migrations', mig.length === 1 && mig[0].finished_at !== null)
  const tabel = await q(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])`, MODEL_BARU)
  cek('7 tabel ada', tabel.length === 7)
  const chk = await q(`SELECT conname FROM pg_constraint WHERE contype = 'c' AND conname = ANY($1::text[])`, CHECK_WAJIB)
  cek('5 CHECK terpasang di pg_constraint', chk.length === 5)
  const trg = await q(`SELECT t.tgname, c.relname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal AND t.tgname LIKE 'wa2a_%'`)
  cek('11 trigger terpasang pada tabel yang benar', trg.length === 11 && TRIGGER_WAJIB.every(([t, r]) => trg.some((g) => g.tgname === t && g.relname === r)))
  const fk = await q(`SELECT conname, confdeltype FROM pg_constraint WHERE contype = 'f' AND conrelid::regclass::text = ANY($1::text[])`, MODEL_BARU.map((m) => `"${m}"`))
  const aksi = Object.fromEntries(fk.map((r) => [r.conname, r.confdeltype]))
  cek('aksi FK: pihak = NO ACTION (a), tenant = CASCADE (c)', aksi.WaContact_customerId_fkey === 'a' && aksi.WaContact_principalId_fkey === 'a' && aksi.WaPrincipalAccessGrant_principalId_fkey === 'a' && MODEL_BARU.every((m) => aksi[`${m}_tenantId_fkey`] === 'c'), JSON.stringify(aksi).slice(0, 120))
  const trgLama = await q(`SELECT c.relname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal AND c.relname IN ('Tenant','Customer','Principal','Voyage','CommunicationCandidate')`)
  cek('tidak ada trigger pada tabel lama', trgLama.length === 0)

  // ---------------------------------------------------------------- data sintetis
  const tA = await prisma.tenant.create({ data: { companyName: `${TAG}Tenant A` } })
  const tB = await prisma.tenant.create({ data: { companyName: `${TAG}Tenant B` } })
  tenantDibuat.push(tA.id, tB.id)
  const cust = (t, nm) => prisma.customer.create({ data: { tenantId: t.id, name: `${TAG}${nm}` } })
  const prin = (t, nm) => prisma.principal.create({ data: { tenantId: t.id, name: `${TAG}${nm}` } })
  const CA1 = await cust(tA, 'Customer A1')
  const CA2 = await cust(tA, 'Customer A2')
  const CB1 = await cust(tB, 'Customer B1')
  const PA1 = await prin(tA, 'Principal A1')
  const PA2 = await prin(tA, 'Principal A2')
  const PB1 = await prin(tB, 'Principal B1')
  const kA = await prisma.vessel.create({ data: { tenantId: tA.id, name: `${TAG}MT Satu Kapal` } })
  const kB = await prisma.vessel.create({ data: { tenantId: tB.id, name: `${TAG}MT Kapal B` } })
  const voy = (t, k, no, ubah = {}) => prisma.voyage.create({ data: { tenantId: t.id, vesselId: k.id, voyageNumber: `${TAG}${no}`, dataOrigin: 'UJI', ...ubah } })
  // Satu kapal, dua pelanggan, dua principal (TS-2a-11).
  const VA1 = await voy(tA, kA, 'A1', { customerId: CA1.id, principalId: PA1.id })
  const VA2 = await voy(tA, kA, 'A2', { customerId: CA2.id, principalId: PA2.id })
  const VA3 = await voy(tA, kA, 'A3', { principalId: PA1.id })
  const VA4 = await voy(tA, kA, 'A4', { principalId: PA1.id, deletedAt: new Date() })
  const VB1 = await voy(tB, kB, 'B1', { customerId: CB1.id, principalId: PB1.id })

  const insKontak = (k) =>
    x(
      `INSERT INTO "WaContact" ("id","tenantId","partyType","customerId","principalId","e164","activeE164Key","displayName","language","status","createdByUserId","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ID',$9,'u-uji',now())`,
      k.id, k.tenantId, k.partyType, k.customerId ?? null, k.principalId ?? null, k.e164, k.activeE164Key === undefined ? (k.status === 'INACTIVE' ? null : k.e164) : k.activeE164Key, `${TAG}PIC`, k.status ?? 'ACTIVE',
    )

  // ========================================================================== D2
  bagian('[D2] Kontak — pihak, nomor aktif unik (DB-3), identitas, INACTIVE terminal')
  const KA1 = { id: id('kontak'), tenantId: tA.id, partyType: 'CUSTOMER', customerId: CA1.id, e164: nomor(1) }
  await insKontak(KA1)
  cek('kontak customer tenant A tersimpan', (await q(`SELECT 1 FROM "WaContact" WHERE id = $1`, KA1.id)).length === 1)
  await cekTolak('pihak tenant B untuk kontak tenant A → WA2A_TENANT_MISMATCH', () => insKontak({ id: id('k'), tenantId: tA.id, partyType: 'CUSTOMER', customerId: CB1.id, e164: nomor(2) }), /WA2A_TENANT_MISMATCH/)
  await cekTolak('principal tenant B untuk kontak tenant A → WA2A_TENANT_MISMATCH', () => insKontak({ id: id('k'), tenantId: tA.id, partyType: 'PRINCIPAL', principalId: PB1.id, e164: nomor(3) }), /WA2A_TENANT_MISMATCH/)
  await cekTolak('CUSTOMER dengan principalId juga → CHECK WaContact_party_xor', () => insKontak({ id: id('k'), tenantId: tA.id, partyType: 'CUSTOMER', customerId: CA1.id, principalId: PA1.id, e164: nomor(4) }), /WaContact_party_xor/)
  await cekTolak('PRINCIPAL tanpa principalId → CHECK WaContact_party_xor', () => insKontak({ id: id('k'), tenantId: tA.id, partyType: 'PRINCIPAL', e164: nomor(5) }), /WaContact_party_xor|WA2A_TENANT_MISMATCH/)
  await cekTolak('partyType tak dikenal → CHECK WaContact_party_xor', () => insKontak({ id: id('k'), tenantId: tA.id, partyType: 'VENDOR', customerId: CA1.id, e164: nomor(6) }), /WaContact_party_xor|WA2A_TENANT_MISMATCH/)
  await cekTolak('ACTIVE tanpa activeE164Key → CHECK WaContact_active_key', () => insKontak({ id: id('k'), tenantId: tA.id, partyType: 'CUSTOMER', customerId: CA2.id, e164: nomor(7), activeE164Key: null }), /WaContact_active_key/)
  await cekTolak('activeE164Key ≠ e164 → CHECK WaContact_active_key', () => insKontak({ id: id('k'), tenantId: tA.id, partyType: 'CUSTOMER', customerId: CA2.id, e164: nomor(8), activeE164Key: nomor(9) }), /WaContact_active_key/)
  await cekTolak('INACTIVE dengan activeE164Key → CHECK WaContact_active_key', () => insKontak({ id: id('k'), tenantId: tA.id, partyType: 'CUSTOMER', customerId: CA2.id, e164: nomor(10), status: 'INACTIVE', activeE164Key: nomor(10) }), /WaContact_active_key/)
  await cekTolak('DB-3: nomor yang sama AKTIF untuk pihak lain di tenant sama → unik ditolak', () => insKontak({ id: id('k'), tenantId: tA.id, partyType: 'CUSTOMER', customerId: CA2.id, e164: nomor(1) }), /WaContact_tenantId_activeE164Key_key|\("tenantId", "activeE164Key"\)/)
  await cekTolak('DB-3: nomor yang sama sebagai PRINCIPAL di tenant sama → unik ditolak (tanpa akses otomatis lintas pihak)', () => insKontak({ id: id('k'), tenantId: tA.id, partyType: 'PRINCIPAL', principalId: PA1.id, e164: nomor(1) }), /WaContact_tenantId_activeE164Key_key|\("tenantId", "activeE164Key"\)/)
  const KB1 = { id: id('kontak'), tenantId: tB.id, partyType: 'CUSTOMER', customerId: CB1.id, e164: nomor(1) }
  await insKontak(KB1)
  cek('nomor yang sama boleh di tenant LAIN (keterikatan per tenant)', (await q(`SELECT 1 FROM "WaContact" WHERE id = $1`, KB1.id)).length === 1)
  await cekTolak('identitas tak dapat diubah: ganti e164', () => x(`UPDATE "WaContact" SET "e164" = $2, "activeE164Key" = $2 WHERE id = $1`, KA1.id, nomor(11)), /WA2A_CONTACT_IDENTITY_IMMUTABLE/)
  await cekTolak('identitas tak dapat diubah: pindah ke customer lain (S2 pindah perusahaan)', () => x(`UPDATE "WaContact" SET "customerId" = $2 WHERE id = $1`, KA1.id, CA2.id), /WA2A_CONTACT_IDENTITY_IMMUTABLE/)
  await cekTolak('identitas tak dapat diubah: pindah tenant', () => x(`UPDATE "WaContact" SET "tenantId" = $2 WHERE id = $1`, KA1.id, tB.id), /WA2A_CONTACT_IDENTITY_IMMUTABLE|foreign key/)
  // Kontak sementara untuk siklus nonaktif → nomor bebas → kontak baru.
  const KA9 = { id: id('kontak'), tenantId: tA.id, partyType: 'CUSTOMER', customerId: CA2.id, e164: nomor(20) }
  await insKontak(KA9)
  await x(`UPDATE "WaContact" SET "status" = 'INACTIVE', "activeE164Key" = NULL, "deactivatedAt" = now(), "deactivatedByUserId" = 'u-admin', "deactivationReason" = 'PIC pindah' WHERE id = $1`, KA9.id)
  await cekTolak('INACTIVE terminal: tak dapat diaktifkan kembali', () => x(`UPDATE "WaContact" SET "status" = 'ACTIVE', "activeE164Key" = "e164" WHERE id = $1`, KA9.id), /WA2A_CONTACT_INACTIVE_TERMINAL/)
  const KA10 = { id: id('kontak'), tenantId: tA.id, partyType: 'CUSTOMER', customerId: CA2.id, e164: nomor(20) }
  await insKontak(KA10)
  cek('setelah kontak lama INACTIVE, nomor yang sama boleh menjadi kontak BARU', (await q(`SELECT 1 FROM "WaContact" WHERE id = $1`, KA10.id)).length === 1)

  // ========================================================================== D3
  bagian('[D3] Consent — FK komposit tenant, append-only, identitas state')
  const insState = (s) => x(`INSERT INTO "WaConsentState" ("id","tenantId","contactId","purpose","status","updatedAt") VALUES ($1,$2,$3,'PROACTIVE_OPERATIONAL_UPDATE',$4,now())`, s.id, s.tenantId, s.contactId, s.status ?? 'NONE')
  const insEvent = (e) =>
    x(`INSERT INTO "WaConsentEvent" ("id","tenantId","contactId","purpose","action","channel","evidence","actorType","actorUserId","occurredAt") VALUES ($1,$2,$3,'PROACTIVE_OPERATIONAL_UPDATE',$4,'EMAIL',$5,'STAFF','u-staf',now())`, e.id, e.tenantId, e.contactId, e.action, `${TAG}bukti`)
  const SA1 = { id: id('cs'), tenantId: tA.id, contactId: KA1.id }
  await insState(SA1)
  await cekTolak('state consent tenant A → kontak tenant B → FK komposit ditolak', () => insState({ id: id('cs'), tenantId: tA.id, contactId: KB1.id }), /WaConsentState_tenantId_contactId_fkey/)
  await cekTolak('unik (contactId, purpose)', () => insState({ id: id('cs'), tenantId: tA.id, contactId: KA1.id }), /WaConsentState_contactId_purpose_key|\("contactId", purpose\)/)
  const EA1 = { id: id('ce'), tenantId: tA.id, contactId: KA1.id, action: 'OPT_IN' }
  await insEvent(EA1)
  await cekTolak('event consent tenant A → kontak tenant B → FK komposit ditolak', () => insEvent({ id: id('ce'), tenantId: tA.id, contactId: KB1.id, action: 'OPT_IN' }), /WaConsentEvent_tenantId_contactId_fkey/)
  await cekTolak('event consent APPEND-ONLY: UPDATE ditolak', () => x(`UPDATE "WaConsentEvent" SET "action" = 'OPT_OUT' WHERE id = $1`, EA1.id), /WA2A_APPEND_ONLY/)
  await x(`UPDATE "WaConsentState" SET "status" = 'OPT_OUT', "lastEventId" = $2, "version" = "version" + 1 WHERE id = $1`, SA1.id, EA1.id)
  cek('state consent boleh berubah status (OPT_IN/OPT_OUT) dengan versi', (await q(`SELECT status, version FROM "WaConsentState" WHERE id = $1`, SA1.id))[0]?.status === 'OPT_OUT')
  await cekTolak('state consent: kontak/tujuan tak dapat diubah', () => x(`UPDATE "WaConsentState" SET "contactId" = $2 WHERE id = $1`, SA1.id, KA10.id), /WA2A_CONSENT_STATE_IDENTITY_IMMUTABLE/)

  // ========================================================================== D4
  bagian('[D4] Grant principal — voyage terotorisasi, maker-checker, transisi, revoke')
  const KP1 = { id: id('kontak'), tenantId: tA.id, partyType: 'PRINCIPAL', principalId: PA1.id, e164: nomor(30) }
  await insKontak(KP1)
  const insGrant = (g) =>
    x(
      `INSERT INTO "WaPrincipalAccessGrant" ("id","tenantId","contactId","principalId","dataCategories","identityEvidence","relationshipEvidence","authorityEvidence","status","requestedByUserId","decidedByUserId","decidedAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5::text[],'bukti-identitas','bukti-hubungan','bukti-kewenangan',$6,$7,$8,$9,now())`,
      g.id, g.tenantId, g.contactId, g.principalId, g.kategori ?? ['STATUS', 'MILESTONE'], g.status ?? 'PENDING', g.peminta ?? 'u-manajer', g.pemutus ?? null, g.pemutus ? new Date() : null,
    )
  await cekTolak('grant untuk kontak CUSTOMER → FK komposit ditolak (principal default ditolak)', () => insGrant({ id: id('g'), tenantId: tA.id, contactId: KA1.id, principalId: PA1.id }), /WaPrincipalAccessGrant_tenantId_contactId_principalId_fkey/)
  await cekTolak('grant principal P2 memakai kontak milik P1 → FK komposit ditolak', () => insGrant({ id: id('g'), tenantId: tA.id, contactId: KP1.id, principalId: PA2.id }), /WaPrincipalAccessGrant_tenantId_contactId_principalId_fkey/)
  await cekTolak('grant tenant B memakai kontak tenant A → FK komposit ditolak', () => insGrant({ id: id('g'), tenantId: tB.id, contactId: KP1.id, principalId: PA1.id }), /WaPrincipalAccessGrant_tenantId_contactId_principalId_fkey|foreign key/)
  await cekTolak('grant langsung ACTIVE saat dibuat → WA2A_GRANT_MUST_START_PENDING', () => insGrant({ id: id('g'), tenantId: tA.id, contactId: KP1.id, principalId: PA1.id, status: 'ACTIVE', pemutus: 'u-admin' }), /WA2A_GRANT_MUST_START_PENDING/)
  await cekTolak('kategori di luar allowlist (INVOICE) → CHECK WaGrant_categories_allowed', () => insGrant({ id: id('g'), tenantId: tA.id, contactId: KP1.id, principalId: PA1.id, kategori: ['STATUS', 'INVOICE'] }), /WaGrant_categories_allowed/)
  await cekTolak('kategori kosong → CHECK WaGrant_categories_allowed', () => insGrant({ id: id('g'), tenantId: tA.id, contactId: KP1.id, principalId: PA1.id, kategori: [] }), /WaGrant_categories_allowed/)
  const G1 = { id: id('grant'), tenantId: tA.id, contactId: KP1.id, principalId: PA1.id }
  await insGrant(G1)
  const insGV = (tenantId, grantId, voyageId) => x(`INSERT INTO "WaPrincipalAccessGrantVoyage" ("id","tenantId","grantId","voyageId") VALUES ($1,$2,$3,$4)`, id('gv'), tenantId, grantId, voyageId)
  await insGV(tA.id, G1.id, VA1.id)
  await insGV(tA.id, G1.id, VA3.id)
  cek('cakupan grant: voyage dengan principalId = P1 diterima (VA1, VA3)', Number((await q(`SELECT count(*)::int AS n FROM "WaPrincipalAccessGrantVoyage" WHERE "grantId" = $1`, G1.id))[0].n) === 2)
  await cekTolak('cakupan grant: voyage KAPAL SAMA milik principal/pelanggan lain (VA2) → NOT_AUTHORIZED', () => insGV(tA.id, G1.id, VA2.id), /WA2A_GRANT_VOYAGE_NOT_AUTHORIZED/)
  await cekTolak('cakupan grant: voyage terhapus (VA4) → NOT_AUTHORIZED', () => insGV(tA.id, G1.id, VA4.id), /WA2A_GRANT_VOYAGE_NOT_AUTHORIZED/)
  await cekTolak('cakupan grant: voyage tenant B → WA2A_TENANT_MISMATCH', () => insGV(tA.id, G1.id, VB1.id), /WA2A_TENANT_MISMATCH/)
  await cekTolak('cakupan grant: baris bertenant B menunjuk grant tenant A → FK komposit ditolak', () => insGV(tB.id, G1.id, VB1.id), /WaPrincipalAccessGrantVoyage_tenantId_grantId_fkey|WA2A_GRANT_SCOPE_LOCKED/)
  await cekTolak('cakupan duplikat → unik (grantId, voyageId)', () => insGV(tA.id, G1.id, VA1.id), /WaPrincipalAccessGrantVoyage_grantId_voyageId_key|\("grantId", "voyageId"\)/)
  await cekTolak('maker-checker: pemutus = pengaju → CHECK WaGrant_maker_checker', () => x(`UPDATE "WaPrincipalAccessGrant" SET "status" = 'ACTIVE', "decidedByUserId" = 'u-manajer', "decidedAt" = now() WHERE id = $1`, G1.id), /WaGrant_maker_checker/)
  await cekTolak('ACTIVE tanpa pemutus → WA2A_GRANT_DECISION_REQUIRED', () => x(`UPDATE "WaPrincipalAccessGrant" SET "status" = 'ACTIVE' WHERE id = $1`, G1.id), /WA2A_GRANT_DECISION_REQUIRED/)
  await cekTolak('PENDING → REVOKED (lompat) → WA2A_GRANT_TRANSITION_FORBIDDEN', () => x(`UPDATE "WaPrincipalAccessGrant" SET "status" = 'REVOKED', "revokedAt" = now(), "revokedByUserId" = 'u-admin', "revokeReason" = 'x' WHERE id = $1`, G1.id), /WA2A_GRANT_TRANSITION_FORBIDDEN/)
  await x(`UPDATE "WaPrincipalAccessGrant" SET "status" = 'ACTIVE', "decidedByUserId" = 'u-admin', "decidedAt" = now() WHERE id = $1`, G1.id)
  cek('PENDING → ACTIVE oleh pemutus berbeda diterima', (await q(`SELECT status FROM "WaPrincipalAccessGrant" WHERE id = $1`, G1.id))[0]?.status === 'ACTIVE')
  await cekTolak('cakupan TERKUNCI setelah ACTIVE: tambah ulang voyage → WA2A_GRANT_SCOPE_LOCKED (trigger sebelum unik)', () => insGV(tA.id, G1.id, VA3.id), /WA2A_GRANT_SCOPE_LOCKED/)
  const VA5 = await voy(tA, kA, 'A5', { principalId: PA1.id })
  await cekTolak('cakupan TERKUNCI setelah ACTIVE: voyage sah baru pun ditolak', () => insGV(tA.id, G1.id, VA5.id), /WA2A_GRANT_SCOPE_LOCKED/)
  // Batas penegakan DB yang DIDOKUMENTASIKAN (bukan diklaim): Voyage adalah tabel LAMA tanpa trigger, jadi
  // perubahan Voyage.principalId SETELAH grant dibuat tidak dicegah DB → resolver (2a-E) wajib memeriksa
  // ulang principalId setiap pemakaian (desain rev2 §4.1 langkah 4).
  const VA6 = await voy(tA, kA, 'A6', { principalId: PA1.id })
  const G0 = { id: id('grant'), tenantId: tA.id, contactId: KP1.id, principalId: PA1.id }
  await insGrant(G0)
  await insGV(tA.id, G0.id, VA6.id)
  await prisma.voyage.update({ where: { id: VA6.id }, data: { principalId: PA2.id } })
  cek('DIDOKUMENTASIKAN: DB tidak mencegah Voyage.principalId berubah setelah grant → WAJIB dicek ulang resolver 2a-E', (await q(`SELECT "principalId" FROM "Voyage" WHERE id = $1`, VA6.id))[0]?.principalId === PA2.id)
  await cekTolak('identitas grant tak dapat diubah: perluas kategori', () => x(`UPDATE "WaPrincipalAccessGrant" SET "dataCategories" = ARRAY['STATUS','MILESTONE','SCHEDULE_ACTUAL'] WHERE id = $1`, G1.id), /WA2A_GRANT_IDENTITY_IMMUTABLE/)
  await cekTolak('identitas grant tak dapat diubah: ganti pemutus', () => x(`UPDATE "WaPrincipalAccessGrant" SET "decidedByUserId" = 'u-lain' WHERE id = $1`, G1.id), /WA2A_GRANT_IDENTITY_IMMUTABLE/)
  await cekTolak('revoke tanpa alasan → WA2A_GRANT_REVOKE_REASON_REQUIRED', () => x(`UPDATE "WaPrincipalAccessGrant" SET "status" = 'REVOKED' WHERE id = $1`, G1.id), /WA2A_GRANT_REVOKE_REASON_REQUIRED/)
  await x(`UPDATE "WaPrincipalAccessGrant" SET "status" = 'REVOKED', "revokedAt" = now(), "revokedByUserId" = 'u-admin', "revokeReason" = 'kewenangan berakhir' WHERE id = $1`, G1.id)
  cek('ACTIVE → REVOKED dengan alasan diterima', (await q(`SELECT status FROM "WaPrincipalAccessGrant" WHERE id = $1`, G1.id))[0]?.status === 'REVOKED')
  await cekTolak('REVOKED terminal: tak dapat diaktifkan kembali', () => x(`UPDATE "WaPrincipalAccessGrant" SET "status" = 'ACTIVE' WHERE id = $1`, G1.id), /WA2A_GRANT_TRANSITION_FORBIDDEN/)
  await cekTolak('REVOKED terminal: kolom lain pun tak dapat diubah', () => x(`UPDATE "WaPrincipalAccessGrant" SET "validUntil" = now() WHERE id = $1`, G1.id), /WA2A_GRANT_TERMINAL/)
  const G2 = { id: id('grant'), tenantId: tA.id, contactId: KP1.id, principalId: PA1.id }
  await insGrant(G2)
  await x(`UPDATE "WaPrincipalAccessGrant" SET "status" = 'REJECTED', "decidedByUserId" = 'u-admin', "decidedAt" = now(), "decisionNote" = 'bukti kurang' WHERE id = $1`, G2.id)
  await cekTolak('REJECTED terminal', () => x(`UPDATE "WaPrincipalAccessGrant" SET "status" = 'ACTIVE' WHERE id = $1`, G2.id), /WA2A_GRANT_TRANSITION_FORBIDDEN/)
  await cekTolak('cakupan grant baris tak dapat diubah (UPDATE)', () => x(`UPDATE "WaPrincipalAccessGrantVoyage" SET "voyageId" = $2 WHERE "grantId" = $1`, G1.id, VA2.id), /WA2A_APPEND_ONLY/)

  // ========================================================================== D5
  bagian('[D5] Pesan klien & konfirmasi jadwal')
  const candA = await prisma.communicationCandidate.create({ data: { tenantId: tA.id, voyageId: VA1.id, family: 'EOSP', sourceType: 'VOYAGE_EVENT', sourceRef: id('ev'), createdByUserId: 'u-uji' } })
  const candB = await prisma.communicationCandidate.create({ data: { tenantId: tB.id, voyageId: VB1.id, family: 'EOSP', sourceType: 'VOYAGE_EVENT', sourceRef: id('ev'), createdByUserId: 'u-uji' } })
  const insPesan = (m) =>
    x(
      `INSERT INTO "WaClientMessage" ("id","tenantId","candidateId","revision","contactId","recipientE164Snapshot","partyTypeSnapshot","partyIdSnapshot","consentStateVersion","logicalMessageKey","activeKey","language","templateId","templateVersion","body","fields","sourceFingerprint","snapshotFingerprint","freshnessVerdict","mode","createdByUserId","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,$9,$10,'ID','T-EOSP',1,'isi uji','{}'::jsonb,'sf','ss','{"verdict":"OK"}'::jsonb,'CLIENT_REAL','u-uji',now())`,
      m.id, m.tenantId, m.candidateId, m.revision ?? 1, m.contactId, KA1.e164, m.partyType ?? 'CUSTOMER', m.partyId ?? CA1.id, m.kunci ?? `${TAG}lmk-${m.id}`, m.aktif === undefined ? `${TAG}lmk-${m.id}` : m.aktif,
    )
  const M1 = { id: id('msg'), tenantId: tA.id, candidateId: candA.id, contactId: KA1.id, kunci: `${TAG}lmk-1`, aktif: `${TAG}lmk-1` }
  await insPesan(M1)
  cek('pesan klien sah tersimpan', (await q(`SELECT 1 FROM "WaClientMessage" WHERE id = $1`, M1.id)).length === 1)
  await cekTolak('pesan tenant A dengan kandidat tenant B → WA2A_TENANT_MISMATCH', () => insPesan({ id: id('msg'), tenantId: tA.id, candidateId: candB.id, contactId: KA1.id }), /WA2A_TENANT_MISMATCH/)
  await cekTolak('pesan dengan kandidat yang TIDAK ADA → ditolak trigger (tanpa FK)', () => insPesan({ id: id('msg'), tenantId: tA.id, candidateId: `${TAG}tak-ada`, revision: 5, contactId: KA1.id }), /WA2A_TENANT_MISMATCH/)
  await cekTolak('pesan tenant A ke kontak tenant B → FK komposit ditolak', () => insPesan({ id: id('msg'), tenantId: tA.id, candidateId: candA.id, revision: 2, contactId: KB1.id }), /WaClientMessage_tenantId_contactId_fkey|WA2A_MESSAGE_PARTY_MISMATCH/)
  await cekTolak('snapshot pihak ≠ pihak kontak → WA2A_MESSAGE_PARTY_MISMATCH', () => insPesan({ id: id('msg'), tenantId: tA.id, candidateId: candA.id, revision: 3, contactId: KA1.id, partyId: CA2.id }), /WA2A_MESSAGE_PARTY_MISMATCH/)
  await cekTolak('maksimal satu revisi aktif per pesan logis → unik activeKey', () => insPesan({ id: id('msg'), tenantId: tA.id, candidateId: candA.id, revision: 4, contactId: KA1.id, kunci: `${TAG}lmk-1`, aktif: `${TAG}lmk-1` }), /WaClientMessage_tenantId_activeKey_key|\("tenantId", "activeKey"\)/)
  await cekTolak('snapshot tak dapat diubah (body)', () => x(`UPDATE "WaClientMessage" SET "body" = 'ubah' WHERE id = $1`, M1.id), /WA2A_MESSAGE_SNAPSHOT_IMMUTABLE/)
  await x(`UPDATE "WaClientMessage" SET "state" = 'NEEDS_REVIEW', "reasonCode" = 'ACCESS_REVOKED', "activeKey" = NULL WHERE id = $1`, M1.id)
  cek('state pesan boleh berubah (NEEDS_REVIEW) tanpa menyentuh snapshot', (await q(`SELECT state FROM "WaClientMessage" WHERE id = $1`, M1.id))[0]?.state === 'NEEDS_REVIEW')

  // --- candidateId tanpa FK (penyesuaian #2 yang disetujui owner): integritas & isolasi tenant ---
  await cekTolak('UPDATE candidateId ke kandidat tenant lain → WA2A_MESSAGE_SNAPSHOT_IMMUTABLE', () => x(`UPDATE "WaClientMessage" SET "candidateId" = $2 WHERE id = $1`, M1.id, candB.id), /WA2A_MESSAGE_SNAPSHOT_IMMUTABLE/)
  await cekTolak('UPDATE tenantId pesan → ditolak (snapshot / FK komposit)', () => x(`UPDATE "WaClientMessage" SET "tenantId" = $2 WHERE id = $1`, M1.id, tB.id), /WA2A_MESSAGE_SNAPSHOT_IMMUTABLE|foreign key/)
  // Balapan — dua koneksi. Klien kedua memakai lock_timeout pendek supaya "menunggu" teramati sebagai galat.
  const prisma2 = new PrismaClient({ datasources: { db: { url: urlTeks } } })
  try {
    const candR = await prisma.communicationCandidate.create({ data: { tenantId: tA.id, voyageId: VA1.id, family: 'ALL_FAST', sourceType: 'VOYAGE_EVENT', sourceRef: id('ev'), createdByUserId: 'u-uji' } })
    // (a) INSERT pesan sedang berjalan → hapus/pindah-tenant kandidat oleh transaksi lain harus MENUNGGU (FOR SHARE).
    let hapusSaatInsert = null
    let pindahSaatInsert = null
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO "WaClientMessage" ("id","tenantId","candidateId","revision","contactId","recipientE164Snapshot","partyTypeSnapshot","partyIdSnapshot","consentStateVersion","logicalMessageKey","activeKey","language","templateId","templateVersion","body","fields","sourceFingerprint","snapshotFingerprint","freshnessVerdict","mode","createdByUserId","updatedAt")
         VALUES ($1,$2,$3,1,$4,$5,'CUSTOMER',$6,1,$7,$7,'ID','T',1,'b','{}'::jsonb,'s','s','{}'::jsonb,'CLIENT_REAL','u',now())`,
        id('msg'), tA.id, candR.id, KA1.id, KA1.e164, CA1.id, `${TAG}lmk-race-a`,
      )
      hapusSaatInsert = await ditolak(() => prisma2.$transaction([prisma2.$executeRawUnsafe(`SET LOCAL lock_timeout = '700ms'`), prisma2.$executeRawUnsafe(`DELETE FROM "CommunicationCandidate" WHERE id = $1`, candR.id)]), /lock timeout|canceling statement/)
      pindahSaatInsert = await ditolak(() => prisma2.$transaction([prisma2.$executeRawUnsafe(`SET LOCAL lock_timeout = '700ms'`), prisma2.$executeRawUnsafe(`UPDATE "CommunicationCandidate" SET "tenantId" = $2 WHERE id = $1`, candR.id, tB.id)]), /lock timeout|canceling statement/)
    }, { timeout: 15000 })
    cek('balapan (a): hapus kandidat saat INSERT pesan berjalan → MENUNGGU kunci (tak ada celah cek→commit)', hapusSaatInsert?.ok === true, hapusSaatInsert?.pesan)
    cek('balapan (a): pindah tenant kandidat saat INSERT pesan berjalan → MENUNGGU kunci', pindahSaatInsert?.ok === true, pindahSaatInsert?.pesan)
    // (b) Kandidat sedang dihapus (belum commit) → INSERT pesan menunggu; setelah hapus commit → INSERT ditolak.
    const candD = await prisma.communicationCandidate.create({ data: { tenantId: tA.id, voyageId: VA1.id, family: 'SAILED', sourceType: 'VOYAGE_EVENT', sourceRef: id('ev'), createdByUserId: 'u-uji' } })
    const insertD = (lockTimeout) =>
      prisma2.$transaction([
        prisma2.$executeRawUnsafe(`SET LOCAL lock_timeout = '${lockTimeout}'`),
        prisma2.$executeRawUnsafe(
          `INSERT INTO "WaClientMessage" ("id","tenantId","candidateId","revision","contactId","recipientE164Snapshot","partyTypeSnapshot","partyIdSnapshot","consentStateVersion","logicalMessageKey","language","templateId","templateVersion","body","fields","sourceFingerprint","snapshotFingerprint","freshnessVerdict","mode","createdByUserId","updatedAt")
           VALUES ($1,$2,$3,1,$4,$5,'CUSTOMER',$6,1,$7,'ID','T',1,'b','{}'::jsonb,'s','s','{}'::jsonb,'CLIENT_REAL','u',now())`,
          id('msg'), tA.id, candD.id, KA1.id, KA1.e164, CA1.id, `${TAG}lmk-race-b`,
        ),
      ])
    let insertSaatHapus = null
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`DELETE FROM "CommunicationCandidate" WHERE id = $1`, candD.id)
      insertSaatHapus = await ditolak(() => insertD('700ms'), /lock timeout|canceling statement/)
    }, { timeout: 15000 })
    cek('balapan (b): INSERT pesan saat kandidat sedang dihapus → MENUNGGU kunci', insertSaatHapus?.ok === true, insertSaatHapus?.pesan)
    const sesudahHapus = await ditolak(() => insertD('5s'), /WA2A_TENANT_MISMATCH/)
    cek('balapan (b): setelah hapus kandidat commit → INSERT pesan ditolak (kandidat tidak ada)', sesudahHapus.ok, sesudahHapus.pesan)
    // (c) Kandidat dihapus SETELAH pesan ada → riwayat pesan tetap, tenant pesan tak berubah (orphan terdokumentasi).
    const mOrphan = (await q(`SELECT id FROM "WaClientMessage" WHERE "candidateId" = $1`, candR.id))[0]
    await x(`DELETE FROM "CommunicationCandidate" WHERE id = $1`, candR.id)
    const sisaOrphan = await q(`SELECT "tenantId", "candidateId" FROM "WaClientMessage" WHERE id = $1`, mOrphan?.id)
    cek('kandidat dihapus setelah pesan ada → pesan TETAP (riwayat utuh), tenant pesan tetap A; service wajib memuat kandidat lewat forTenant (gagal tertutup bila hilang)', sisaOrphan.length === 1 && sisaOrphan[0].tenantId === tA.id && (await dbTenant(tA.id).communicationCandidate.findFirst({ where: { id: candR.id } })) === null)
  } finally {
    await prisma2.$disconnect()
  }

  const insKonf = (k) =>
    x(`INSERT INTO "VoyageScheduleConfirmation" ("id","tenantId","voyageId","field","confirmedValue","confirmedByUserId","sourceKind","sourceNote","invalidatedAt") VALUES ($1,$2,$3,$4,now() + interval '2 days','u-manajer','MASTER_OR_SHIP','telp nakhoda (uji)',$5)`, k.id, k.tenantId, k.voyageId, k.field ?? 'eta', k.invalid ?? null)
  const KF1 = { id: id('konf'), tenantId: tA.id, voyageId: VA1.id }
  await insKonf(KF1)
  cek('konfirmasi jadwal tersimpan', (await q(`SELECT 1 FROM "VoyageScheduleConfirmation" WHERE id = $1`, KF1.id)).length === 1)
  await cekTolak('konfirmasi voyage tenant B dengan tenant A → WA2A_TENANT_MISMATCH', () => insKonf({ id: id('konf'), tenantId: tA.id, voyageId: VB1.id }), /WA2A_TENANT_MISMATCH/)
  await cekTolak('field aktual (ata) → CHECK VoyageScheduleConfirmation_field', () => insKonf({ id: id('konf'), tenantId: tA.id, voyageId: VA1.id, field: 'ata' }), /VoyageScheduleConfirmation_field/)
  await cekTolak('konfirmasi tak boleh dibuat dalam keadaan invalid', () => insKonf({ id: id('konf'), tenantId: tA.id, voyageId: VA1.id, invalid: new Date() }), /WA2A_CONFIRMATION_INVALID_AT_INSERT/)
  await cekTolak('konfirmasi append-only: ubah sumber/nilai ditolak', () => x(`UPDATE "VoyageScheduleConfirmation" SET "sourceNote" = 'ubah' WHERE id = $1`, KF1.id), /WA2A_CONFIRMATION_APPEND_ONLY/)
  await cekTolak('invalidasi wajib lengkap (waktu+staf+alasan)', () => x(`UPDATE "VoyageScheduleConfirmation" SET "invalidatedAt" = now() WHERE id = $1`, KF1.id), /WA2A_CONFIRMATION_APPEND_ONLY/)
  await x(`UPDATE "VoyageScheduleConfirmation" SET "invalidatedAt" = now(), "invalidatedByUserId" = 'u-manajer', "invalidatedReason" = 'ETA berubah' WHERE id = $1`, KF1.id)
  cek('invalidasi lengkap satu kali diterima', (await q(`SELECT "invalidatedAt" FROM "VoyageScheduleConfirmation" WHERE id = $1`, KF1.id))[0]?.invalidatedAt !== null)
  await cekTolak('invalidasi kedua ditolak', () => x(`UPDATE "VoyageScheduleConfirmation" SET "invalidatedReason" = 'lagi' WHERE id = $1`, KF1.id), /WA2A_CONFIRMATION_APPEND_ONLY/)

  // ========================================================================== D6
  bagian('[D6] Guard tenant aplikasi (forTenant)')
  const dbA = prisma.$extends(tenantGuardExtension(tA.id))
  const dbB = prisma.$extends(tenantGuardExtension(tB.id))
  const lihatA = await dbA.waContact.findMany()
  const lihatB = await dbB.waContact.findMany()
  cek('forTenant(A)/forTenant(B) hanya melihat kontak masing-masing', lihatA.length >= 3 && lihatA.every((r) => r.tenantId === tA.id) && lihatB.length >= 1 && lihatB.every((r) => r.tenantId === tB.id))
  cek('forTenant(B) tak bisa membaca kontak/grant/pesan/konfirmasi A lewat id', (await dbB.waContact.findFirst({ where: { id: KA1.id } })) === null && (await dbB.waPrincipalAccessGrant.findFirst({ where: { id: G1.id } })) === null && (await dbB.waClientMessage.findFirst({ where: { id: M1.id } })) === null && (await dbB.voyageScheduleConfirmation.findFirst({ where: { id: KF1.id } })) === null)
  cek('forTenant(B) updateMany pada consent A → count 0', (await dbB.waConsentState.updateMany({ where: { id: SA1.id }, data: { status: 'OPT_IN' } })).count === 0)
  const r = await ditolak(() => dbB.waContact.findUnique({ where: { id: KA1.id } }), /tidak bisa dipagari tenant|findUnique/)
  cek('selector unik (findUnique) dilarang guard pada model baru', r.ok, r.ok ? '' : r.pesan)
  const dibuatB = await dbB.waConsentEvent.create({ data: { tenantId: tA.id, contactId: KB1.id, purpose: 'PROACTIVE_OPERATIONAL_UPDATE', action: 'OPT_IN', channel: 'FORM', evidence: `${TAG}bukti`, actorType: 'STAFF', actorUserId: 'u-staf', occurredAt: new Date() } }).catch((e) => e)
  cek('create lewat forTenant(B) yang menyodorkan tenantId A → tenantId dipaksa B', !(dibuatB instanceof Error) && dibuatB.tenantId === tB.id, dibuatB instanceof Error ? String(dibuatB.message).slice(0, 120) : '')

  // ========================================================================== D7
  bagian('[D7] Penghapusan — DB-1 & audit tidak hilang diam-diam')
  await cekTolak('hapus PRINCIPAL yang masih punya kontak/grant → FK ditolak (DB-1)', () => x(`DELETE FROM "Principal" WHERE id = $1`, PA1.id), /WaContact_principalId_fkey|WaPrincipalAccessGrant_principalId_fkey|foreign key/)
  const route = await ditolak(() => prisma.principal.deleteMany({ where: { id: PA1.id, tenantId: tA.id } }), /P2003|Foreign key|foreign key/)
  cek('jalur route principal (deleteMany) mendapat galat FK → route lama memetakannya ke 409', route.ok, route.ok ? '' : route.pesan)
  await cekTolak('hapus CUSTOMER yang masih punya kontak → FK ditolak', () => x(`DELETE FROM "Customer" WHERE id = $1`, CA1.id), /WaContact_customerId_fkey|foreign key/)
  await cekTolak('hapus langsung kontak → WA2A_DELETE_FORBIDDEN', () => x(`DELETE FROM "WaContact" WHERE id = $1`, KA9.id), /WA2A_DELETE_FORBIDDEN/)
  await cekTolak('hapus langsung event consent (bukti) → WA2A_DELETE_FORBIDDEN', () => x(`DELETE FROM "WaConsentEvent" WHERE id = $1`, EA1.id), /WA2A_DELETE_FORBIDDEN/)
  await cekTolak('hapus langsung state consent → WA2A_DELETE_FORBIDDEN', () => x(`DELETE FROM "WaConsentState" WHERE id = $1`, SA1.id), /WA2A_DELETE_FORBIDDEN/)
  await cekTolak('hapus langsung grant (bukti keputusan) → WA2A_DELETE_FORBIDDEN', () => x(`DELETE FROM "WaPrincipalAccessGrant" WHERE id = $1`, G2.id), /WA2A_DELETE_FORBIDDEN/)
  const principalTanpaKontak = await prin(tA, 'Principal tanpa kontak')
  await x(`DELETE FROM "Principal" WHERE id = $1`, principalTanpaKontak.id)
  cek('principal TANPA kontak WA tetap dapat dihapus (perilaku lama tak berubah)', (await q(`SELECT 1 FROM "Principal" WHERE id = $1`, principalTanpaKontak.id)).length === 0)
  // Grant aktif kedua untuk uji hapus voyage → cakupan menyusut (aman), grant tetap ada.
  const G3 = { id: id('grant'), tenantId: tA.id, contactId: KP1.id, principalId: PA1.id }
  await insGrant(G3)
  await insGV(tA.id, G3.id, VA5.id)
  await x(`UPDATE "WaPrincipalAccessGrant" SET "status" = 'ACTIVE', "decidedByUserId" = 'u-admin', "decidedAt" = now() WHERE id = $1`, G3.id)
  await x(`DELETE FROM "Voyage" WHERE id = $1`, VA5.id)
  cek('hapus permanen voyage → baris cakupan ikut terhapus (akses menyusut), grant tetap tercatat', Number((await q(`SELECT count(*)::int AS n FROM "WaPrincipalAccessGrantVoyage" WHERE "grantId" = $1`, G3.id))[0].n) === 0 && (await q(`SELECT 1 FROM "WaPrincipalAccessGrant" WHERE id = $1`, G3.id)).length === 1)

  // NO ACTION vs RESTRICT (penyesuaian #1 yang disetujui owner) — eksperimen di dalam transaksi yang DIBATALKAN:
  // pasang sementara RESTRICT pada FK pihak lalu coba hapus tenant A. Hasilnya dicatat apa adanya.
  let hasilRestrict = null
  await prisma
    .$transaction(async (tx) => {
      for (const [tbl, fk, kol, ref] of [['WaContact', 'WaContact_customerId_fkey', 'customerId', 'Customer'], ['WaContact', 'WaContact_principalId_fkey', 'principalId', 'Principal'], ['WaPrincipalAccessGrant', 'WaPrincipalAccessGrant_principalId_fkey', 'principalId', 'Principal']]) {
        await tx.$executeRawUnsafe(`ALTER TABLE "${tbl}" DROP CONSTRAINT "${fk}", ADD CONSTRAINT "${fk}" FOREIGN KEY ("${kol}") REFERENCES "${ref}"("id") ON DELETE RESTRICT ON UPDATE CASCADE`)
      }
      await tx.$executeRawUnsafe('SAVEPOINT uji_restrict')
      try {
        await tx.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = $1`, tA.id)
        hasilRestrict = 'BERHASIL'
      } catch (e) {
        hasilRestrict = String(e?.meta?.message ?? e?.message ?? e).replace(/\s+/g, ' ').slice(0, 140)
        await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT uji_restrict')
      }
      throw new Error('BATALKAN_EKSPERIMEN')
    }, { timeout: 15000 })
    .catch((e) => {
      if (!String(e?.message).includes('BATALKAN_EKSPERIMEN')) throw e
    })
  const fkKembali = await q(`SELECT conname, confdeltype FROM pg_constraint WHERE conname IN ('WaContact_customerId_fkey','WaContact_principalId_fkey','WaPrincipalAccessGrant_principalId_fkey')`)
  cek('eksperimen RESTRICT dibatalkan: FK kembali NO ACTION (a) & tenant A masih ada', fkKembali.length === 3 && fkKembali.every((r) => r.confdeltype === 'a') && (await q(`SELECT 1 FROM "Tenant" WHERE id = $1`, tA.id)).length === 1)
  cek('CATATAN NO ACTION vs RESTRICT — hasil hapus tenant bila FK pihak RESTRICT', hasilRestrict !== null, hasilRestrict === 'BERHASIL' ? 'RESTRICT juga berhasil di PG16 untuk data uji ini' : `RESTRICT MENGGAGALKAN hapus tenant: ${hasilRestrict}`)

  // Hapus tenant (cascade penuh) — bukti DB-1 tidak memblokir prosedur administrasi tenant.
  const jumlahA = async () => Number((await q(`SELECT (SELECT count(*) FROM "WaContact" WHERE "tenantId"=$1)+(SELECT count(*) FROM "WaConsentState" WHERE "tenantId"=$1)+(SELECT count(*) FROM "WaConsentEvent" WHERE "tenantId"=$1)+(SELECT count(*) FROM "WaPrincipalAccessGrant" WHERE "tenantId"=$1)+(SELECT count(*) FROM "WaPrincipalAccessGrantVoyage" WHERE "tenantId"=$1)+(SELECT count(*) FROM "WaClientMessage" WHERE "tenantId"=$1)+(SELECT count(*) FROM "VoyageScheduleConfirmation" WHERE "tenantId"=$1) AS n`, tA.id))[0].n)
  const sebelum = await jumlahA()
  const hapusA = await ditolak(() => prisma.tenant.delete({ where: { id: tA.id } }), /.*/)
  cek('hapus TENANT A (berisi kontak, consent, grant, cakupan, pesan, konfirmasi) BERHASIL lewat cascade', !hapusA.ok || hapusA.pesan === '(berhasil — seharusnya ditolak)', hapusA.pesan)
  cek('setelah hapus tenant A: 0 baris WA-2a tersisa untuk A; tenant B utuh', sebelum > 10 && (await jumlahA()) === 0 && (await q(`SELECT 1 FROM "WaContact" WHERE id = $1`, KB1.id)).length === 1, `sebelum ${sebelum}`)
} catch (e) {
  gagal++
  console.log(`  ❌ galat tak terduga: ${String(e?.message ?? e).slice(0, 300)}`)
} finally {
  for (const t of tenantDibuat) await prisma.tenant.deleteMany({ where: { id: t } }).catch(() => {})
  const sisa = await prisma.tenant.count({ where: { companyName: { startsWith: TAG } } })
  cek('pembersihan data uji tuntas (lewat hapus tenant)', sisa === 0, `${sisa} tenant tersisa`)
  await prisma.$disconnect()
}

console.log(`\n${gagal === 0 ? '✅ SEMUA LULUS' : '❌ ADA YANG GAGAL'} — lulus ${lulus}, gagal ${gagal}`)
process.exit(gagal === 0 ? 0 : 1)
