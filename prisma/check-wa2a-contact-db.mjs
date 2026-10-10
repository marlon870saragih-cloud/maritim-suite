// Uji DB WA-2a Step 2C — service kontak & consent (PostgreSQL loopback sekali pakai, data sintetis).
//
// Jalankan:
//   WA2A_CONTACT_DB_URL=postgresql://postgres@127.0.0.1:55432/maritime_suite node prisma/check-wa2a-contact-db.mjs
//
// DB WAJIB sudah `prisma migrate deploy` (termasuk migrasi WA-2a Step 2B). Ditolak bila host bukan
// loopback, ada parameter host, NODE_ENV=production, atau DATABASE_URL/DIRECT_URL menunjuk DB lain.
// Jaring egress aktif (fetch/http/https/net/tls/dns dilarang). Nomor sintetis rentang +62999….
// Data bertanda `WA2C-`, dibersihkan lewat hapus tenant (juga saat gagal).
//
// Bagian (AC-2C-xx / TS-2C-xx):
//   K1 gerbang · K2 registrasi & DB-3 · K3 verifikasi & pencabutan · K4 nonaktifkan
//   C1 consent & idempotensi · C2 penahanan pesan · I1 isolasi tenant · A1 audit & log
//   R1–R5 race condition terencana

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

const URL_DB = process.env.WA2A_CONTACT_DB_URL
if (!URL_DB) {
  console.log('DILEWATI — WA2A_CONTACT_DB_URL tidak diset (butuh PostgreSQL loopback sekali pakai).')
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
process.env.WA2_CLIENT_FOUNDATION_ENABLED = 'true'
process.env.AUTOMATION_MONITORING_ENABLED = 'true'

// ------------------------------------------------- jaring egress (SEBELUM memuat service)
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

// ------------------------------------------------- penangkap log (nomor/bukti tak boleh bocor)
const logTertangkap = []
const asliStderr = process.stderr.write.bind(process.stderr)
process.stderr.write = (chunk, ...rest) => {
  logTertangkap.push(String(chunk))
  return asliStderr(chunk, ...rest)
}
for (const m of ['error', 'warn', 'info', 'debug']) {
  const asli = console[m].bind(console)
  console[m] = (...a) => {
    logTertangkap.push(a.map(String).join(' '))
    asli(...a)
  }
}

const require = createRequire(import.meta.url)
const jiti = require('jiti')(fileURLToPath(import.meta.url), { alias: { '@': join(AKAR, 'src') }, interopDefault: true })
const KT = jiti('../src/services/whatsapp/wa-contact.service.ts')
const CS = jiti('../src/services/whatsapp/wa-consent.service.ts')
const { PrismaClient } = await import('@prisma/client')
const adm = new PrismaClient({ datasources: { db: { url: URL_DB } } })

const TAG = 'WA2C-'
let seq = 0
const uid = (p = 'x') => `${TAG}${p}-${++seq}`
let nomorSeq = 0
const nomorBaru = () => `+62999${String(++nomorSeq).padStart(8, '0')}`
const lokal = (e164) => `0${e164.slice(3)}` // bentuk lokal "0999…" untuk menguji normalisasi
const BUKTI = 'Telepon balik ke nomor kantor resmi pihak; PIC mengonfirmasi jabatan & hubungan (uji sintetis).'
const nanti = (bulan) => {
  const d = new Date()
  d.setUTCMonth(d.getUTCMonth() + bulan)
  return d
}
const kode = async (fn) => {
  try {
    await fn()
    return 'OK'
  } catch (e) {
    return e?.details?.code ?? e?.code ?? String(e?.message ?? e)
  }
}
const coba = async (fn) => {
  try {
    return { ok: true, nilai: await fn() }
  } catch (e) {
    return { ok: false, kode: e?.details?.code ?? e?.code ?? 'ERR', pesan: String(e?.message ?? e) }
  }
}
const acak = (arr) => (Math.random() < 0.5 ? arr : [...arr].reverse())

async function bersihkan() {
  await adm.tenant.deleteMany({ where: { companyName: { startsWith: TAG } } })
}

async function dunia(nama) {
  const t = await adm.tenant.create({ data: { companyName: `${TAG}${nama}` } })
  const cust = (n, ubah = {}) => adm.customer.create({ data: { tenantId: t.id, name: `${TAG}${n}`, ...ubah } })
  const C1 = await cust('Customer 1')
  const C2 = await cust('Customer 2')
  const CNonaktif = await cust('Customer nonaktif', { isActive: false })
  const CHapus = await cust('Customer terhapus', { deletedAt: new Date() })
  const P1 = await adm.principal.create({ data: { tenantId: t.id, name: `${TAG}Principal 1` } })
  const kapal = await adm.vessel.create({ data: { tenantId: t.id, name: `${TAG}MT Uji` } })
  const V1 = await adm.voyage.create({ data: { tenantId: t.id, vesselId: kapal.id, voyageNumber: uid('V'), customerId: C1.id, principalId: P1.id, dataOrigin: 'UJI' } })
  return {
    t, C1, C2, CNonaktif, CHapus, P1, V1,
    ctx: { tenantId: t.id, userId: `u-admin-${nama}`, role: 'ADMIN' },
    ctx2: { tenantId: t.id, userId: `u-manajer-${nama}`, role: 'MANAJER_OPERASI' },
  }
}
const setAllowlist = (...ids) => {
  process.env.AUTOMATION_TENANT_IDS = ids.join(',')
}

// ------------------------------------------------- pembantu data sintetis (langsung via adm)
async function pesan(w, contactId, state) {
  const cand = await adm.communicationCandidate.create({ data: { tenantId: w.t.id, voyageId: w.V1.id, family: 'EOSP', sourceType: 'VOYAGE_EVENT', sourceRef: uid('ref'), createdByUserId: 'u-uji' } })
  const k = await adm.waContact.findFirst({ where: { id: contactId } })
  const id = uid('msg')
  const kunci = uid('lmk')
  const terminal = ['EXPIRED', 'REJECTED', 'BLOCKED', 'CANCELED'].includes(state)
  await adm.$executeRawUnsafe(
    `INSERT INTO "WaClientMessage" ("id","tenantId","candidateId","revision","contactId","recipientE164Snapshot","partyTypeSnapshot","partyIdSnapshot","consentStateVersion","logicalMessageKey","activeKey","language","templateId","templateVersion","body","fields","sourceFingerprint","snapshotFingerprint","freshnessVerdict","mode","state","createdByUserId","updatedAt")
     VALUES ($1,$2,$3,1,$4,$5,$6,$7,1,$8,$9,'ID','T',1,'b','{}'::jsonb,'s','s','{}'::jsonb,'CLIENT_REAL',$10,'u-uji',now())`,
    id, w.t.id, cand.id, contactId, k.e164, k.partyType, k.customerId ?? k.principalId, kunci, terminal ? null : kunci, state,
  )
  return id
}
const statePesan = async (id) => (await adm.waClientMessage.findFirst({ where: { id }, select: { state: true, reasonCode: true } })) ?? {}
async function grant(w, contactId, status) {
  const id = uid('grant')
  await adm.$executeRawUnsafe(
    `INSERT INTO "WaPrincipalAccessGrant" ("id","tenantId","contactId","principalId","dataCategories","identityEvidence","relationshipEvidence","authorityEvidence","requestedByUserId","updatedAt")
     VALUES ($1,$2,$3,$4,ARRAY['STATUS'],'a','b','c','u-peminta',now())`,
    id, w.t.id, contactId, w.P1.id,
  )
  if (status === 'ACTIVE') await adm.$executeRawUnsafe(`UPDATE "WaPrincipalAccessGrant" SET "status"='ACTIVE',"decidedByUserId"='u-pemutus',"decidedAt"=now() WHERE id=$1`, id)
  return id
}
const statusGrant = async (id) => (await adm.waPrincipalAccessGrant.findFirst({ where: { id }, select: { status: true, revokeReason: true } })) ?? {}
const jumlahMutasi = async (tenantId) =>
  (await adm.waContact.count({ where: { tenantId } })) + (await adm.waConsentState.count({ where: { tenantId } })) + (await adm.waConsentEvent.count({ where: { tenantId } })) + (await adm.auditLog.count({ where: { tenantId } }))

try {
  await bersihkan()
  const A = await dunia('A')
  const B = await dunia('B')
  const C = await dunia('C-di-luar-allowlist')
  setAllowlist(A.t.id, B.t.id)

  // ========================================================================== K1
  bagian('[K1] Gerbang (AC-2C-01)')
  const masukan = (w, nomor) => ({ partyType: 'CUSTOMER', partyId: w.C1.id, nomor, displayName: 'PIC Uji', language: 'ID' })
  const awalA = await jumlahMutasi(A.t.id)
  process.env.WA2_CLIENT_FOUNDATION_ENABLED = 'false'
  cek('flag mati → FORBIDDEN', (await kode(() => KT.buatKontak(A.ctx, masukan(A, nomorBaru())))) === 'FORBIDDEN')
  process.env.WA2_CLIENT_FOUNDATION_ENABLED = 'true'
  process.env.NODE_ENV = 'production'
  cek('NODE_ENV=production → FORBIDDEN walau flag "true"', (await kode(() => KT.buatKontak(A.ctx, masukan(A, nomorBaru())))) === 'FORBIDDEN')
  process.env.NODE_ENV = 'test'
  cek('tenant di luar allowlist Automation → NOT_FOUND', (await kode(() => KT.buatKontak(C.ctx, masukan(C, nomorBaru())))) === 'NOT_FOUND')
  cek('peran OPERATOR → FORBIDDEN', (await kode(() => KT.buatKontak({ ...A.ctx, role: 'OPERATOR' }, masukan(A, nomorBaru())))) === 'FORBIDDEN')
  cek('konteks sistem → FORBIDDEN', (await kode(() => CS.catatOptOut({ ...A.ctx, system: true }, 'apa-saja', { kanal: 'EMAIL' }))) === 'FORBIDDEN')
  cek('semua penolakan gerbang: 0 mutasi, 0 audit', (await jumlahMutasi(A.t.id)) === awalA)

  // ========================================================================== K2
  bagian('[K2] Registrasi, normalisasi, PIC multi-pihak (AC-2C-02..04)')
  const N1 = nomorBaru()
  const r1 = await KT.buatKontak(A.ctx, masukan(A, lokal(N1)))
  const k1 = await adm.waContact.findFirst({ where: { id: r1.contactId } })
  cek('kontak dibuat dari nomor lokal "0…" → tersimpan E.164, UNVERIFIED, ACTIVE', r1.hasil === 'DIBUAT' && k1.e164 === N1 && k1.verificationStatus === 'UNVERIFIED' && k1.status === 'ACTIVE')
  const r1b = await KT.buatKontak(A.ctx, masukan(A, `+62 ${N1.slice(3, 6)}-${N1.slice(6)}`))
  cek('idempoten: nomor sama (penulisan beda) & pihak sama → SUDAH_ADA, id sama', r1b.hasil === 'SUDAH_ADA' && r1b.contactId === r1.contactId)
  const inUse = await coba(() => KT.buatKontak(A.ctx, { ...masukan(A, N1), partyId: A.C2.id }))
  cek('DB-3: nomor aktif sama untuk CUSTOMER lain → CONTACT_NUMBER_IN_USE (jenis pihak saja)', !inUse.ok && inUse.kode === 'CONTACT_NUMBER_IN_USE' && !inUse.pesan.includes(N1.slice(3)))
  cek('DB-3: nomor aktif sama sebagai PRINCIPAL → CONTACT_NUMBER_IN_USE', (await kode(() => KT.buatKontak(A.ctx, { partyType: 'PRINCIPAL', partyId: A.P1.id, nomor: N1, displayName: 'PIC', language: 'EN' }))) === 'CONTACT_NUMBER_IN_USE')
  cek('tidak ada grant/akses otomatis yang tercipta dari kesamaan nomor', (await adm.waPrincipalAccessGrant.count({ where: { tenantId: A.t.id } })) === 0)
  const rB = await KT.buatKontak(B.ctx, masukan(B, N1))
  cek('nomor sama di tenant LAIN diperbolehkan (keterikatan per tenant)', rB.hasil === 'DIBUAT')
  cek('pihak tenant lain (customer B lewat ctx A) → PARTY_NOT_ELIGIBLE', (await kode(() => KT.buatKontak(A.ctx, { ...masukan(A, nomorBaru()), partyId: B.C1.id }))) === 'PARTY_NOT_ELIGIBLE')
  cek('customer nonaktif → PARTY_NOT_ELIGIBLE', (await kode(() => KT.buatKontak(A.ctx, { ...masukan(A, nomorBaru()), partyId: A.CNonaktif.id }))) === 'PARTY_NOT_ELIGIBLE')
  cek('customer terhapus (lunak) → PARTY_NOT_ELIGIBLE', (await kode(() => KT.buatKontak(A.ctx, { ...masukan(A, nomorBaru()), partyId: A.CHapus.id }))) === 'PARTY_NOT_ELIGIBLE')
  cek('nomor tidak sah / pengenal fixture → PHONE_INVALID', (await kode(() => KT.buatKontak(A.ctx, masukan(A, 'TEST_FIXTURE_WA_001')))) === 'PHONE_INVALID' && (await kode(() => KT.buatKontak(A.ctx, masukan(A, '12345')))) === 'PHONE_INVALID')
  const rP = await KT.buatKontak(A.ctx, { partyType: 'PRINCIPAL', partyId: A.P1.id, nomor: nomorBaru(), displayName: 'PIC Principal', language: 'EN' })
  cek('kontak PRINCIPAL dibuat — tanpa grant (default ditolak)', rP.hasil === 'DIBUAT' && (await adm.waPrincipalAccessGrant.count({ where: { contactId: rP.contactId } })) === 0)

  // ========================================================================== K3
  bagian('[K3] Verifikasi & pencabutan dini (AC-2C-05, C-2, C-3)')
  const tanpaBukti = await kode(() => KT.verifikasiKontak(A.ctx, r1.contactId, { metode: 'CALL_BACK', bukti: 'ok', berlakuSampai: nanti(6) }))
  cek('bukti terlalu singkat → VERIFICATION_EVIDENCE_REQUIRED', tanpaBukti === 'VERIFICATION_EVIDENCE_REQUIRED')
  cek('metode tak dikenal → VERIFICATION_EVIDENCE_REQUIRED', (await kode(() => KT.verifikasiKontak(A.ctx, r1.contactId, { metode: 'TEBAKAN', bukti: BUKTI, berlakuSampai: nanti(6) }))) === 'VERIFICATION_EVIDENCE_REQUIRED')
  cek('masa berlaku > 12 bulan → VERIFICATION_EXPIRY_INVALID', (await kode(() => KT.verifikasiKontak(A.ctx, r1.contactId, { metode: 'CALL_BACK', bukti: BUKTI, berlakuSampai: nanti(13) }))) === 'VERIFICATION_EXPIRY_INVALID')
  cek('masa berlaku di masa lalu → VERIFICATION_EXPIRY_INVALID', (await kode(() => KT.verifikasiKontak(A.ctx, r1.contactId, { metode: 'CALL_BACK', bukti: BUKTI, berlakuSampai: new Date(Date.now() - 1000) }))) === 'VERIFICATION_EXPIRY_INVALID')
  const ver = await KT.verifikasiKontak(A.ctx, r1.contactId, { metode: 'CALL_BACK', bukti: BUKTI, berlakuSampai: nanti(12) })
  const detail1 = await KT.bacaKontak(A.ctx, r1.contactId)
  cek('C-3: satu staf berwenang memverifikasi (≤12 bulan) → VERIFIED, pencatat = staf itu', ver.hasil === 'TERVERIFIKASI' && detail1.verifikasi === 'VERIFIED' && (await adm.waContact.findFirst({ where: { id: r1.contactId } })).verifiedByUserId === A.ctx.userId)
  cek('verifikasi TIDAK membuat grant / akses data apa pun', (await adm.waPrincipalAccessGrant.count({ where: { tenantId: A.t.id } })) === 0)
  await adm.waContact.updateMany({ where: { id: r1.contactId }, data: { verificationExpiresAt: new Date(Date.now() - 60_000) } })
  cek('verifikasi kedaluwarsa → dibaca EXPIRED (gagal tertutup)', (await KT.bacaKontak(A.ctx, r1.contactId)).verifikasi === 'EXPIRED')
  await KT.verifikasiKontak(A.ctx2, r1.contactId, { metode: 'EMAIL_FROM_KNOWN_DOMAIN', bukti: BUKTI, berlakuSampai: nanti(3) })
  cek('verifikasi ulang memperbarui masa berlaku', (await KT.bacaKontak(A.ctx, r1.contactId)).verifikasi === 'VERIFIED')
  cek('pencabutan tanpa alasan sah / catatan → ditolak', (await kode(() => KT.cabutVerifikasi(A.ctx, r1.contactId, { alasan: 'BOSAN', catatan: 'tidak sah' }))) === 'VALIDATION' && (await kode(() => KT.cabutVerifikasi(A.ctx, r1.contactId, { alasan: 'PIC_CHANGED_COMPANY', catatan: '' }))) === 'VALIDATION')
  // Kontak principal terverifikasi + grant ACTIVE + pesan tertunda → pencabutan berantai.
  await KT.verifikasiKontak(A.ctx, rP.contactId, { metode: 'DOCUMENT', bukti: BUKTI, berlakuSampai: nanti(12) })
  const gAktif = await grant(A, rP.contactId, 'ACTIVE')
  const mDraft = await pesan(A, rP.contactId, 'APPROVED')
  const cabut = await KT.cabutVerifikasi(A.ctx, rP.contactId, { alasan: 'AUTHORITY_CHANGED', catatan: 'Kewenangan PIC berubah per surat principal (uji).' })
  cek('C-2 cabut verifikasi: UNVERIFIED + grant ACTIVE → REVOKED + pesan tertunda → NEEDS_REVIEW', cabut.hasil === 'DICABUT' && (await KT.bacaKontak(A.ctx, rP.contactId)).verifikasi === 'UNVERIFIED' && (await statusGrant(gAktif)).status === 'REVOKED' && (await statusGrant(gAktif)).revokeReason === 'VERIFICATION_REVOKED:AUTHORITY_CHANGED' && (await statePesan(mDraft)).state === 'NEEDS_REVIEW')
  const cabutLagi = await KT.cabutVerifikasi(A.ctx, rP.contactId, { alasan: 'AUTHORITY_CHANGED', catatan: 'Ulang (uji idempotensi).' })
  cek('cabut verifikasi kedua kali → SUDAH_TIDAK_BERLAKU (idempoten)', cabutLagi.hasil === 'SUDAH_TIDAK_BERLAKU')

  // ========================================================================== K4
  bagian('[K4] Nonaktifkan kontak (AC-2C-06)')
  const rD = await KT.buatKontak(A.ctx, { partyType: 'PRINCIPAL', partyId: A.P1.id, nomor: nomorBaru(), displayName: 'PIC pindah', language: 'ID' })
  await KT.verifikasiKontak(A.ctx, rD.contactId, { metode: 'IN_PERSON', bukti: BUKTI, berlakuSampai: nanti(12) })
  const gA = await grant(A, rD.contactId, 'ACTIVE')
  const gP = await grant(A, rD.contactId, 'PENDING')
  const mD = await pesan(A, rD.contactId, 'DRAFT')
  const mPA = await pesan(A, rD.contactId, 'PENDING_APPROVAL')
  const mX = await pesan(A, rD.contactId, 'CANCELED')
  cek('alasan penonaktifan wajib', (await kode(() => KT.nonaktifkanKontak(A.ctx, rD.contactId, { alasan: '' }))) === 'VALIDATION')
  const non = await KT.nonaktifkanKontak(A.ctx, rD.contactId, { alasan: 'PIC pindah perusahaan (uji).' })
  const kD = await adm.waContact.findFirst({ where: { id: rD.contactId } })
  cek('satu transaksi: INACTIVE + verifikasi gugur + kunci nomor dilepas', non.hasil === 'DICABUT' && kD.status === 'INACTIVE' && kD.verificationStatus === 'UNVERIFIED' && kD.activeE164Key === null)
  cek('grant ACTIVE → REVOKED (CONTACT_DEACTIVATED)', (await statusGrant(gA)).status === 'REVOKED' && (await statusGrant(gA)).revokeReason === 'CONTACT_DEACTIVATED')
  cek('grant PENDING tetap PENDING (tak dapat diputuskan tanpa orang kedua) — wajib ditolak 2a-E karena kontak INACTIVE', (await statusGrant(gP)).status === 'PENDING')
  cek('pesan DRAFT/PENDING_APPROVAL → NEEDS_REVIEW; pesan CANCELED (terminal) tak berubah', (await statePesan(mD)).state === 'NEEDS_REVIEW' && (await statePesan(mPA)).state === 'NEEDS_REVIEW' && (await statePesan(mX)).state === 'CANCELED')
  cek('kontak INACTIVE tak dapat diverifikasi lagi → CONTACT_INACTIVE', (await kode(() => KT.verifikasiKontak(A.ctx, rD.contactId, { metode: 'CALL_BACK', bukti: BUKTI, berlakuSampai: nanti(6) }))) === 'CONTACT_INACTIVE')
  cek('nonaktifkan ulang → SUDAH_TIDAK_BERLAKU (idempoten)', (await KT.nonaktifkanKontak(A.ctx, rD.contactId, { alasan: 'Ulang (uji).' })).hasil === 'SUDAH_TIDAK_BERLAKU')
  const rD2 = await KT.buatKontak(A.ctx, { partyType: 'CUSTOMER', partyId: A.C2.id, nomor: kD.e164, displayName: 'PIC di perusahaan baru', language: 'ID' })
  cek('nomor yang sama → kontak BARU untuk pihak baru (kontak lama tak dipakai ulang, tanpa warisan akses)', rD2.hasil === 'DIBUAT' && rD2.contactId !== rD.contactId && (await adm.waPrincipalAccessGrant.count({ where: { contactId: rD2.contactId } })) === 0)

  // ========================================================================== C1
  bagian('[C1] Consent: opt-in, STOP/opt-out, re-opt-in, idempotensi (AC-2C-07, AC-2C-08)')
  const rc = await KT.buatKontak(A.ctx, masukan(A, nomorBaru()))
  const cid = rc.contactId
  cek('status awal NONE', (await CS.bacaStatusConsent(A.ctx, cid)).status === 'NONE')
  cek('opt-in tanpa bukti → CONSENT_EVIDENCE_REQUIRED', (await kode(() => CS.catatOptIn(A.ctx, cid, { kanal: 'EMAIL', bukti: '' }))) === 'CONSENT_EVIDENCE_REQUIRED')
  cek('opt-in kanal tak dikenal → CONSENT_EVIDENCE_REQUIRED', (await kode(() => CS.catatOptIn(A.ctx, cid, { kanal: 'SMS', bukti: BUKTI }))) === 'CONSENT_EVIDENCE_REQUIRED')
  cek('waktu kejadian di masa depan → ditolak', (await kode(() => CS.catatOptIn(A.ctx, cid, { kanal: 'EMAIL', bukti: BUKTI, waktu: new Date(Date.now() + 86_400_000) }))) === 'VALIDATION')
  const in1 = await CS.catatOptIn(A.ctx, cid, { kanal: 'STAFF_RECORDED', bukti: BUKTI })
  cek('opt-in pertama (catatan staf + bukti) → OPT_IN, v2, satu event', in1.hasil === 'DICATAT' && in1.status === 'OPT_IN' && in1.version === 2)
  const in2 = await CS.catatOptIn(A.ctx, cid, { kanal: 'EMAIL', bukti: BUKTI })
  cek('opt-in kedua → SUDAH_OPT_IN, TANPA event baru', in2.hasil === 'SUDAH_OPT_IN' && (await adm.waConsentEvent.count({ where: { contactId: cid } })) === 1)
  const mTunda = await pesan(A, cid, 'APPROVED')
  const out1 = await CS.catatOptOut(A.ctx, cid, { kanal: 'WHATSAPP', bukti: 'STOP' })
  cek('STOP/opt-out → OPT_OUT + pesan APPROVED langsung NEEDS_REVIEW (CONSENT_NOT_GRANTED)', out1.status === 'OPT_OUT' && out1.pesanDitahan.includes(mTunda) && (await statePesan(mTunda)).reasonCode === 'CONSENT_NOT_GRANTED')
  const out2 = await CS.catatOptOut(A.ctx, cid, { kanal: 'STAFF_RECORDED' })
  cek('opt-out kedua → SUDAH_OPT_OUT, TANPA event baru (idempoten)', out2.hasil === 'SUDAH_OPT_OUT' && (await adm.waConsentEvent.count({ where: { contactId: cid } })) === 2)
  cek('re-opt-in setelah STOP dengan catatan staf saja → CONSENT_REOPTIN_EVIDENCE_REQUIRED', (await kode(() => CS.catatOptIn(A.ctx, cid, { kanal: 'STAFF_RECORDED', bukti: BUKTI }))) === 'CONSENT_REOPTIN_EVIDENCE_REQUIRED')
  const reIn = await CS.catatOptIn(A.ctx, cid, { kanal: 'EMAIL', bukti: 'Email pelanggan 10 Okt: "mohon kirim update lagi" (uji).' })
  cek('re-opt-in dengan bukti eksplisit pelanggan (EMAIL) → OPT_IN', reIn.hasil === 'DICATAT' && reIn.status === 'OPT_IN')
  const ev = await adm.waConsentEvent.findMany({ where: { contactId: cid }, orderBy: { createdAt: 'asc' } })
  const st = await adm.waConsentState.findFirst({ where: { contactId: cid } })
  cek('jejak: 3 event (IN, OUT, IN) + versi state = 1 + jumlah event; lastEventId = event terakhir', ev.map((e) => e.action).join() === 'OPT_IN,OPT_OUT,OPT_IN' && st.version === 1 + ev.length && st.lastEventId === ev.at(-1).id)
  cek('event consent append-only di DB (UPDATE ditolak)', (await coba(() => adm.$executeRawUnsafe(`UPDATE "WaConsentEvent" SET "action"='OPT_IN' WHERE id=$1`, ev[1].id))).pesan?.includes('WA2A_APPEND_ONLY'))
  cek('consent ≠ otorisasi: OPT_IN tidak menciptakan grant/akses', (await adm.waPrincipalAccessGrant.count({ where: { contactId: cid } })) === 0)
  const rIn = await KT.buatKontak(A.ctx, masukan(A, nomorBaru()))
  await KT.nonaktifkanKontak(A.ctx, rIn.contactId, { alasan: 'Uji consent kontak nonaktif.' })
  cek('opt-in pada kontak INACTIVE → CONTACT_INACTIVE', (await kode(() => CS.catatOptIn(A.ctx, rIn.contactId, { kanal: 'EMAIL', bukti: BUKTI }))) === 'CONTACT_INACTIVE')
  cek('opt-out pada kontak INACTIVE tetap DITERIMA (tidak pernah ditolak)', (await CS.catatOptOut(A.ctx, rIn.contactId, { kanal: 'EMAIL' })).status === 'OPT_OUT')

  // ========================================================================== I1
  bagian('[I1] Isolasi tenant (AC-2C-10)')
  const awalI = await jumlahMutasi(A.t.id)
  cek('ctx B membaca kontak A → NOT_FOUND', (await kode(() => KT.bacaKontak(B.ctx, r1.contactId))) === 'NOT_FOUND')
  cek('ctx B verifikasi / cabut / nonaktifkan kontak A → NOT_FOUND', (await kode(() => KT.verifikasiKontak(B.ctx, r1.contactId, { metode: 'CALL_BACK', bukti: BUKTI, berlakuSampai: nanti(6) }))) === 'NOT_FOUND' && (await kode(() => KT.cabutVerifikasi(B.ctx, r1.contactId, { alasan: 'EVIDENCE_INVALID', catatan: 'uji lintas tenant' }))) === 'NOT_FOUND' && (await kode(() => KT.nonaktifkanKontak(B.ctx, r1.contactId, { alasan: 'uji lintas tenant' }))) === 'NOT_FOUND')
  cek('ctx B opt-in / opt-out / riwayat kontak A → NOT_FOUND', (await kode(() => CS.catatOptIn(B.ctx, cid, { kanal: 'EMAIL', bukti: BUKTI }))) === 'NOT_FOUND' && (await kode(() => CS.catatOptOut(B.ctx, cid, { kanal: 'EMAIL' }))) === 'NOT_FOUND' && (await kode(() => CS.riwayatConsent(B.ctx, cid))) === 'NOT_FOUND')
  cek('daftar kontak pihak A lewat ctx B → kosong', (await KT.daftarKontakPihak(B.ctx, 'CUSTOMER', A.C1.id)).length === 0)
  cek('semua upaya lintas tenant: 0 mutasi & 0 audit di tenant A; tidak ada state consent B untuk kontak A', (await jumlahMutasi(A.t.id)) === awalI && (await adm.waConsentState.count({ where: { contactId: cid, tenantId: B.t.id } })) === 0)
  const daftar = await KT.daftarKontakPihak(A.ctx, 'CUSTOMER', A.C1.id)
  cek('daftar kontak: nomor SELALU tersamar; tanpa medan voyage/kapal', daftar.length >= 1 && daftar.every((d) => /^\+\d\d••••\d{4}$/.test(d.nomorTersamar) && !('e164' in d) && !Object.keys(d).some((k) => /voyage|vessel|eta|etd/i.test(k))))

  // ========================================================================== R1–R5
  bagian('[R1] Pendaftaran nomor sama bersamaan ×10 (dua pihak berbeda)')
  {
    const N = nomorBaru()
    const hasil = await Promise.all(Array.from({ length: 10 }, (_, i) => coba(() => KT.buatKontak(A.ctx, { ...masukan(A, N), partyId: i % 2 ? A.C2.id : A.C1.id }))))
    const kontak = await adm.waContact.findMany({ where: { tenantId: A.t.id, e164: N } })
    const pemenang = kontak[0]
    const sesuai = hasil.every((r) => (r.ok ? r.nilai.contactId === pemenang?.id : r.kode === 'CONTACT_NUMBER_IN_USE'))
    cek('tepat satu kontak tercipta; pihak pemenang → DIBUAT/SUDAH_ADA, pihak lain → CONTACT_NUMBER_IN_USE; tanpa galat tak dikenal', kontak.length === 1 && sesuai, JSON.stringify(hasil.map((r) => (r.ok ? r.nilai.hasil : r.kode))))
  }

  bagian('[R2] Opt-in vs opt-out bersamaan ×20')
  {
    const r = await KT.buatKontak(A.ctx, masukan(A, nomorBaru()))
    let galatTakDikenal = 0
    for (let i = 0; i < 20; i++) {
      const ops = acak([() => CS.catatOptIn(A.ctx, r.contactId, { kanal: 'EMAIL', bukti: BUKTI }), () => CS.catatOptOut(A.ctx, r.contactId, { kanal: 'WHATSAPP', bukti: 'STOP' })])
      const h = await Promise.all(ops.map((f) => coba(f)))
      galatTakDikenal += h.filter((x) => !x.ok).length
    }
    const evs = await adm.waConsentEvent.findMany({ where: { contactId: r.contactId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
    const s = await adm.waConsentState.findFirst({ where: { contactId: r.contactId } })
    const terakhir = evs.find((e) => e.id === s.lastEventId)
    cek('tanpa galat; versi = 1 + jumlah event (tanpa celah); status = aksi event terakhir; event bergantian (tanpa duplikat berurutan)', galatTakDikenal === 0 && s.version === 1 + evs.length && terakhir?.action === s.status && evs.every((e, i) => i === 0 || e.action !== evs[i - 1].action), `${evs.length} event, v${s.version}, galat ${galatTakDikenal}`)
  }

  bagian('[R3] Nonaktifkan vs verifikasi bersamaan ×10')
  {
    let langgar = 0
    let galatTakDikenal = 0
    for (let i = 0; i < 10; i++) {
      const r = await KT.buatKontak(A.ctx, masukan(A, nomorBaru()))
      const ops = acak([() => KT.nonaktifkanKontak(A.ctx, r.contactId, { alasan: 'Uji balapan R3.' }), () => KT.verifikasiKontak(A.ctx2, r.contactId, { metode: 'CALL_BACK', bukti: BUKTI, berlakuSampai: nanti(6) })])
      const h = await Promise.all(ops.map((f) => coba(f)))
      galatTakDikenal += h.filter((x) => !x.ok && x.kode !== 'CONTACT_INACTIVE').length
      const k = await adm.waContact.findFirst({ where: { id: r.contactId } })
      if (k.status !== 'INACTIVE' || k.verificationStatus !== 'UNVERIFIED' || k.verificationExpiresAt !== null) langgar++
    }
    cek('tidak pernah berakhir INACTIVE + VERIFIED; verifikasi yang kalah ditolak CONTACT_INACTIVE', langgar === 0 && galatTakDikenal === 0, `pelanggaran ${langgar}, galat lain ${galatTakDikenal}`)
  }

  // Simulasi protokol 2a-F (BELUM ada service): kunci kontak SHARE → kunci consent UPDATE → cek OPT_IN → APPROVED.
  const simulasiSetujui = (contactId, messageId) =>
    adm.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(`SELECT 1 FROM "WaContact" WHERE id=$1 FOR SHARE`, contactId)
      const s = await tx.$queryRawUnsafe(`SELECT status FROM "WaConsentState" WHERE "contactId"=$1 AND purpose='PROACTIVE_OPERATIONAL_UPDATE' FOR UPDATE`, contactId)
      if (s[0]?.status !== 'OPT_IN') throw new Error('CONSENT_NOT_GRANTED')
      const n = await tx.$executeRawUnsafe(`UPDATE "WaClientMessage" SET state='APPROVED', "updatedAt"=now() WHERE id=$1 AND state='PENDING_APPROVAL'`, messageId)
      if (n !== 1) throw new Error('STATE_BERUBAH')
    })
  bagian('[R4] Opt-out vs persetujuan pesan (simulasi protokol 2a-F) ×20')
  {
    let langgar = 0
    for (let i = 0; i < 20; i++) {
      const r = await KT.buatKontak(A.ctx, masukan(A, nomorBaru()))
      await CS.catatOptIn(A.ctx, r.contactId, { kanal: 'EMAIL', bukti: BUKTI })
      const m = await pesan(A, r.contactId, 'PENDING_APPROVAL')
      await Promise.all(acak([() => coba(() => CS.catatOptOut(A.ctx, r.contactId, { kanal: 'WHATSAPP', bukti: 'STOP' })), () => coba(() => simulasiSetujui(r.contactId, m))]).map((f) => f()))
      const s = await adm.waConsentState.findFirst({ where: { contactId: r.contactId } })
      const p = await statePesan(m)
      if (s.status !== 'OPT_OUT' || p.state === 'APPROVED') langgar++
    }
    cek('tidak pernah APPROVED setelah opt-out commit; state akhir selalu OPT_OUT + pesan NEEDS_REVIEW/belum disetujui', langgar === 0, `pelanggaran ${langgar}`)
  }

  // Simulasi protokol 2a-E (BELUM ada service): kunci kontak SHARE → cek ACTIVE & VERIFIED → grant ACTIVE.
  const simulasiAktivasi = (contactId, grantId) =>
    adm.$transaction(async (tx) => {
      const k = await tx.$queryRawUnsafe(`SELECT status, "verificationStatus" FROM "WaContact" WHERE id=$1 FOR SHARE`, contactId)
      if (k[0]?.status !== 'ACTIVE' || k[0]?.verificationStatus !== 'VERIFIED') throw new Error('CONTACT_INELIGIBLE')
      await tx.$executeRawUnsafe(`UPDATE "WaPrincipalAccessGrant" SET status='ACTIVE',"decidedByUserId"='u-pemutus',"decidedAt"=now() WHERE id=$1 AND status='PENDING'`, grantId)
    })
  bagian('[R5] Nonaktifkan vs aktivasi grant (simulasi protokol 2a-E) ×20')
  {
    let langgar = 0
    for (let i = 0; i < 20; i++) {
      const r = await KT.buatKontak(A.ctx, { partyType: 'PRINCIPAL', partyId: A.P1.id, nomor: nomorBaru(), displayName: 'PIC R5', language: 'ID' })
      await KT.verifikasiKontak(A.ctx, r.contactId, { metode: 'DOCUMENT', bukti: BUKTI, berlakuSampai: nanti(6) })
      const g = await grant(A, r.contactId, 'PENDING')
      await Promise.all(acak([() => coba(() => KT.nonaktifkanKontak(A.ctx, r.contactId, { alasan: 'Uji balapan R5.' })), () => coba(() => simulasiAktivasi(r.contactId, g))]).map((f) => f()))
      const k = await adm.waContact.findFirst({ where: { id: r.contactId } })
      const s = await statusGrant(g)
      if (k.status === 'INACTIVE' && s.status === 'ACTIVE') langgar++
    }
    cek('tidak pernah ada grant ACTIVE pada kontak INACTIVE', langgar === 0, `pelanggaran ${langgar}`)
  }

  // ========================================================================== A1
  bagian('[A1] Audit & log (AC-2C-11)')
  const semuaKontak = await adm.waContact.findMany({ where: { tenantId: { in: [A.t.id, B.t.id] } }, select: { e164: true, verificationEvidence: true } })
  const audit = await adm.auditLog.findMany({ where: { tenantId: { in: [A.t.id, B.t.id] }, tableName: { in: ['WaContact', 'WaConsentState'] } } })
  const teksAudit = JSON.stringify(audit.map((a) => [a.oldValue, a.newValue]))
  const nomorUtuh = semuaKontak.map((k) => k.e164)
  cek('setiap mutasi tercatat AuditLog (kontak & consent) dengan actor', audit.length >= 30 && audit.every((a) => typeof a.userId === 'string' && a.userId.length > 0))
  cek('AuditLog TIDAK memuat nomor utuh maupun teks bukti', !nomorUtuh.some((x) => teksAudit.includes(x) || teksAudit.includes(x.slice(3))) && !teksAudit.includes(BUKTI) && !teksAudit.includes('STOP"'))
  const teksLog = logTertangkap.join('\n')
  // Batas penangkap: tulisan `prisma:error` mesin Prisma TIDAK selalu lewat console/stderr JS yang
  // dibungkus di sini. Bukti lengkap = pindai seluruh keluaran proses (stdout+stderr) dari luar —
  // prosedur & hasilnya di docs/whatsapp/WA-2a-C-EVIDENCE.md.
  cek('log JS yang tertangkap (console/stderr) TIDAK memuat nomor utuh maupun bukti', !nomorUtuh.some((x) => teksLog.includes(x.slice(3))) && !teksLog.includes(BUKTI), `${logTertangkap.length} baris tertangkap; pindai keluaran penuh dari luar untuk prisma:error`)
  cek('tidak ada egress jaringan selama uji', egress.length === 0, egress.join(','))
} catch (e) {
  gagal++
  console.log(`  ❌ galat tak terduga: ${String(e?.stack ?? e).slice(0, 600)}`)
} finally {
  await bersihkan().catch(() => {})
  const sisa = await adm.tenant.count({ where: { companyName: { startsWith: TAG } } })
  cek('pembersihan data uji tuntas (lewat hapus tenant)', sisa === 0, `${sisa} tenant tersisa`)
  await adm.$disconnect()
  const { prisma: prismaApp } = jiti('../src/lib/prisma.ts')
  await prismaApp.$disconnect().catch(() => {})
}

console.log(`\n${gagal === 0 ? '✅ SEMUA LULUS' : '❌ ADA YANG GAGAL'} — lulus ${lulus}, gagal ${gagal}`)
process.exit(gagal === 0 ? 0 : 1)
