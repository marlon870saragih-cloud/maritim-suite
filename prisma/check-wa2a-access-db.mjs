// Uji DB WA-2a Step 2E — grant principal, resolver otorisasi, pembaca terbatas, race R5′–R10.
//
// Jalankan:
//   WA2A_ACCESS_DB_URL=postgresql://postgres@127.0.0.1:55432/maritime_suite node prisma/check-wa2a-access-db.mjs
//
// DB loopback sekali pakai yang sudah `prisma migrate deploy`. Ditolak bila host bukan loopback,
// NODE_ENV=production, atau DATABASE_URL/DIRECT_URL menunjuk DB lain. Jaring egress aktif.
// Data sintetis bertanda `WA2E-` (dataOrigin NYATA hanya di DB uji ini), dibersihkan lewat hapus tenant.
// Race memakai DUA koneksi sungguhan: pool service aplikasi + klien `adm` terpisah.

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

const URL_DB = process.env.WA2A_ACCESS_DB_URL
if (!URL_DB) {
  console.log('DILEWATI — WA2A_ACCESS_DB_URL tidak diset (butuh PostgreSQL loopback sekali pakai).')
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
const GS = jiti('../src/services/whatsapp/wa-grant.service.ts')
const VW = jiti('../src/services/whatsapp/wa-voyage-view.ts')
const { PrismaClient } = await import('@prisma/client')
const adm = new PrismaClient({ datasources: { db: { url: URL_DB } } })

const TAG = 'WA2E-'
let seq = 0
const uid = (p = 'x') => `${TAG}${p}-${++seq}`
let nomorSeq = 0
const nomorBaru = () => `+62998${String(++nomorSeq).padStart(8, '0')}`
const BUKTI = 'Dokumen penunjukan resmi principal & konfirmasi telepon ke kantor principal (uji sintetis).'
const tidur = (ms) => new Promise((r) => setTimeout(r, ms))
const nanti = (bulan) => GS.tambahBulan(new Date(), bulan)
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
const acak = (arr) => (Math.random() < 0.5 ? arr : [...arr].reverse())
const sudahSelesai = async (p) => Promise.race([p.then(() => true, () => true), tidur(0).then(() => false)])

async function bersihkan() {
  await adm.tenant.deleteMany({ where: { companyName: { startsWith: TAG } } })
}

async function dunia(nama) {
  const t = await adm.tenant.create({ data: { companyName: `${TAG}${nama}` } })
  const cust = (n, ubah = {}) => adm.customer.create({ data: { tenantId: t.id, name: `${TAG}${n}`, ...ubah } })
  const prin = (n) => adm.principal.create({ data: { tenantId: t.id, name: `${TAG}${n}` } })
  const C1 = await cust('Customer 1')
  const C2 = await cust('Customer 2')
  const P1 = await prin('Principal 1')
  const P2 = await prin('Principal 2')
  const kapal = await adm.vessel.create({ data: { tenantId: t.id, name: `${TAG}MT Satu Kapal` } })
  const port = await adm.port.create({ data: { tenantId: t.id, name: `${TAG}Pelabuhan`, timezone: 'Asia/Makassar' } })
  const jam = (h) => new Date(Date.now() + h * 3_600_000)
  const voy = (ubah) => adm.voyage.create({ data: { tenantId: t.id, vesselId: kapal.id, portId: port.id, voyageNumber: uid('V'), dataOrigin: 'NYATA', status: 'CONFIRMED', eta: jam(24), etb: jam(30), etd: jam(48), notes: 'CATATAN-INTERNAL-RAHASIA', ...ubah } })
  const V = {
    C1P1: await voy({ customerId: C1.id, principalId: P1.id }),
    C2P2: await voy({ customerId: C2.id, principalId: P2.id }),
    P1only: await voy({ principalId: P1.id }),
    P1closed: await voy({ principalId: P1.id, status: 'CLOSED' }),
    P1cancel: await voy({ principalId: P1.id, status: 'CANCELLED' }),
    P1uji: await voy({ principalId: P1.id, dataOrigin: 'UJI' }),
    P1null: await voy({ principalId: P1.id, dataOrigin: null }),
    C1cancel: await voy({ customerId: C1.id, status: 'CANCELLED' }),
    C1closed: await voy({ customerId: C1.id, status: 'CLOSED' }),
    C1uji: await voy({ customerId: C1.id, dataOrigin: 'SEED' }),
  }
  await adm.voyageEvent.create({ data: { tenantId: t.id, voyageId: V.C1P1.id, eventCode: 'EOSP', occurredAt: jam(-3), recordedByUserId: 'u-uji' } })
  return {
    t, C1, C2, P1, P2, kapal, V, voy,
    adminCtx: { tenantId: t.id, userId: `u-admin-${nama}`, role: 'ADMIN' },
    manajerCtx: { tenantId: t.id, userId: `u-manajer-${nama}`, role: 'MANAJER_OPERASI' },
    admin2Ctx: { tenantId: t.id, userId: `u-admin2-${nama}`, role: 'ADMIN' },
  }
}

async function kontak(w, partyType, partyId, { verif = true } = {}) {
  const r = await KT.buatKontak(w.adminCtx, { partyType, partyId, nomor: nomorBaru(), displayName: 'PIC uji', language: 'ID' })
  if (verif) await KT.verifikasiKontak(w.adminCtx, r.contactId, { metode: 'DOCUMENT', bukti: BUKTI, berlakuSampai: nanti(6) })
  return r.contactId
}
const ajukan = (w, contactId, voyageIds, kategori = ['STATUS', 'SCHEDULE_ESTIMATE'], ekstra = {}) =>
  GS.ajukanGrant(w.manajerCtx, contactId, { voyageIds, kategori, buktiIdentitas: BUKTI, buktiHubungan: BUKTI, buktiKewenangan: BUKTI, ...ekstra })
const setujui = (w, grantId, ctx = w.adminCtx) => GS.putuskanGrant(ctx, grantId, { keputusan: 'SETUJU', catatan: 'Disetujui setelah cek bukti (uji).' })
const akses = async (w, contactId, ctx = w.adminCtx) => {
  const r = await VW.cekAksesKontak(ctx, contactId)
  return r.izin === 'IZIN' ? r.akses.map((a) => a.voyageId).sort() : `TOLAK:${r.alasan}`
}
const statusGrant = async (id) => (await adm.waPrincipalAccessGrant.findFirst({ where: { id } }))?.status
const setAllowlist = (...ids) => {
  process.env.AUTOMATION_TENANT_IDS = ids.join(',')
}

try {
  await bersihkan()
  const A = await dunia('A')
  const B = await dunia('B')
  setAllowlist(A.t.id, B.t.id)
  const V = A.V

  // ========================================================================== G1
  bagian('[G1] Pengajuan grant — default deny, cakupan eksplisit (AC-2E-03/06)')
  const KC1 = await kontak(A, 'CUSTOMER', A.C1.id)
  const KP1 = await kontak(A, 'PRINCIPAL', A.P1.id)
  const KP1b = await kontak(A, 'PRINCIPAL', A.P1.id)
  const KPun = await kontak(A, 'PRINCIPAL', A.P1.id, { verif: false })
  cek('principal tanpa grant → IZIN dengan daftar KOSONG (default deny)', JSON.stringify(await akses(A, KP1)) === '[]')
  cek('grant untuk kontak CUSTOMER → CONTACT_NOT_PRINCIPAL', (await kode(() => ajukan(A, KC1, [V.C1P1.id]))) === 'CONTACT_NOT_PRINCIPAL')
  cek('E-4: grant untuk kontak UNVERIFIED → CONTACT_INELIGIBLE', (await kode(() => ajukan(A, KPun, [V.P1only.id]))) === 'CONTACT_INELIGIBLE')
  for (const [nm, v] of [['milik principal lain (satu kapal)', V.C2P2], ['CLOSED', V.P1closed], ['CANCELLED', V.P1cancel], ['dataOrigin UJI', V.P1uji], ['dataOrigin NULL', V.P1null], ['tenant lain', B.V.C1P1]]) {
    cek(`voyage ${nm} → VOYAGE_NOT_AUTHORIZED`, (await kode(() => ajukan(A, KP1, [V.P1only.id, v.id]))) === 'VOYAGE_NOT_AUTHORIZED')
  }
  cek('cakupan kosong / duplikat → GRANT_SCOPE_INVALID', (await kode(() => ajukan(A, KP1, []))) === 'GRANT_SCOPE_INVALID' && (await kode(() => ajukan(A, KP1, [V.P1only.id, V.P1only.id]))) === 'GRANT_SCOPE_INVALID')
  cek('kategori di luar allowlist (INVOICE) → GRANT_SCOPE_INVALID', (await kode(() => ajukan(A, KP1, [V.P1only.id], ['STATUS', 'INVOICE']))) === 'GRANT_SCOPE_INVALID')
  cek('bukti kurang → GRANT_EVIDENCE_REQUIRED', (await kode(() => ajukan(A, KP1, [V.P1only.id], ['STATUS'], { buktiKewenangan: '' }))) === 'GRANT_EVIDENCE_REQUIRED')
  cek('berlakuSampai > 12 bulan → GRANT_EXPIRY_INVALID', (await kode(() => ajukan(A, KP1, [V.P1only.id], ['STATUS'], { berlakuSampai: nanti(13) }))) === 'GRANT_EXPIRY_INVALID')
  const awalG = await adm.waPrincipalAccessGrant.count({ where: { tenantId: A.t.id } })
  cek('semua penolakan pengajuan: 0 grant tercipta', awalG === 0)
  const g1 = await ajukan(A, KP1, [V.C1P1.id, V.P1only.id])
  cek('pengajuan sah → PENDING, 2 voyage cakupan, belum ada akses', (await statusGrant(g1.grantId)) === 'PENDING' && (await adm.waPrincipalAccessGrantVoyage.count({ where: { grantId: g1.grantId } })) === 2 && JSON.stringify(await akses(A, KP1)) === '[]')

  // ========================================================================== G2
  bagian('[G2] Keputusan — dua orang, E-3 (AC-2E-06)')
  cek('pengaju memutuskan sendiri → GRANT_SELF_DECISION_FORBIDDEN (service)', (await kode(() => setujui(A, g1.grantId, A.manajerCtx))) === 'GRANT_SELF_DECISION_FORBIDDEN')
  cek('peran OPERATOR → FORBIDDEN', (await kode(() => setujui(A, g1.grantId, { ...A.adminCtx, role: 'OPERATOR' }))) === 'FORBIDDEN')
  cek('pemutus = pengaju lewat SQL langsung → CHECK DB menolak', (await coba(() => adm.$executeRawUnsafe(`UPDATE "WaPrincipalAccessGrant" SET status='ACTIVE',"decidedByUserId"=$2,"decidedAt"=now() WHERE id=$1`, g1.grantId, A.manajerCtx.userId))).pesan?.includes('WaGrant_maker_checker'))
  const d1 = await setujui(A, g1.grantId)
  const gRow = await adm.waPrincipalAccessGrant.findFirst({ where: { id: g1.grantId } })
  cek('E-3: SETUJU oleh orang lain → ACTIVE; validUntil = waktu persetujuan + 12 bulan (tanpa tanggal diminta)', d1.hasil === 'DISETUJUI' && gRow.status === 'ACTIVE' && gRow.decidedByUserId === A.adminCtx.userId && gRow.validUntil.getTime() === GS.tambahBulan(gRow.decidedAt, 12).getTime())
  cek('keputusan kedua → GRANT_NOT_PENDING', (await kode(() => setujui(A, g1.grantId, A.admin2Ctx))) === 'GRANT_NOT_PENDING')
  const gPendek = await ajukan(A, KP1b, [V.P1only.id], ['STATUS'], { berlakuSampai: nanti(3) })
  await setujui(A, gPendek.grantId)
  const gp = await adm.waPrincipalAccessGrant.findFirst({ where: { id: gPendek.grantId } })
  cek('E-3: tanggal diminta (3 bulan) < batas → dipakai apa adanya', Math.abs(gp.validUntil.getTime() - nanti(3).getTime()) < 120_000)

  // ========================================================================== RS
  bagian('[RS] Resolver — customer, principal, perubahan, E-2/E-5 (AC-2E-01..05)')
  const harapCustomer = [V.C1P1.id, V.C1closed.id].sort()
  cek('customer: hanya voyage miliknya; CLOSED terlihat; CANCELLED/SEED/principal-only/pelanggan lain TIDAK', JSON.stringify(await akses(A, KC1)) === JSON.stringify(harapCustomer), JSON.stringify(await akses(A, KC1)))
  cek('principal dengan grant → hanya voyage cakupan (bukan voyage principal lain di kapal yang sama)', JSON.stringify(await akses(A, KP1)) === JSON.stringify([V.C1P1.id, V.P1only.id].sort()))
  const rKP1 = await VW.cekAksesKontak(A.adminCtx, KP1)
  cek('kategori per voyage = kategori grant (diurutkan)', rKP1.akses.every((a) => a.kategori.join() === 'SCHEDULE_ESTIMATE,STATUS'))
  cek('grant milik kontak lain (principal sama) tidak berlaku untuk KP1b di luar grant-nya sendiri', JSON.stringify(await akses(A, KP1b)) === JSON.stringify([V.P1only.id]))
  cek('kontak UNVERIFIED → TOLAK', (await akses(A, KPun)) === 'TOLAK:CONTACT_INELIGIBLE')
  await adm.voyage.update({ where: { id: V.P1only.id }, data: { principalId: A.P2.id } })
  cek('voyage dipindah ke principal lain → langsung hilang dari resolver (nilai SAAT INI)', JSON.stringify(await akses(A, KP1)) === JSON.stringify([V.C1P1.id]))
  await adm.voyage.update({ where: { id: V.P1only.id }, data: { principalId: A.P1.id } })
  await adm.voyage.update({ where: { id: V.P1only.id }, data: { status: 'CLOSED' } })
  cek('E-5: voyage CLOSED → tidak lagi lewat grant principal', JSON.stringify(await akses(A, KP1)) === JSON.stringify([V.C1P1.id]))
  await adm.voyage.update({ where: { id: V.P1only.id }, data: { status: 'CANCELLED' } })
  cek('E-5: voyage CANCELLED → tidak terlihat', JSON.stringify(await akses(A, KP1)) === JSON.stringify([V.C1P1.id]))
  await adm.voyage.update({ where: { id: V.P1only.id }, data: { status: 'CONFIRMED', dataOrigin: 'UJI' } })
  cek('E-2: voyage menjadi data UJI → tidak terlihat', JSON.stringify(await akses(A, KP1)) === JSON.stringify([V.C1P1.id]))
  await adm.voyage.update({ where: { id: V.P1only.id }, data: { dataOrigin: 'NYATA' } })
  await adm.$executeRawUnsafe(`UPDATE "WaPrincipalAccessGrant" SET "validUntil" = now() - interval '1 minute' WHERE id = $1`, gPendek.grantId)
  cek('grant lewat validUntil → akses berhenti (dihitung saat dibaca)', JSON.stringify(await akses(A, KP1b)) === '[]')
  const dg = await GS.daftarGrantKontak(A.adminCtx, KP1b)
  cek('daftar grant menampilkan status efektif EXPIRED_EFEKTIF', dg.some((g) => g.id === gPendek.grantId && g.statusEfektif === 'EXPIRED_EFEKTIF'))
  await adm.waContact.updateMany({ where: { id: KP1 }, data: { verificationExpiresAt: new Date(Date.now() - 60_000) } })
  cek('verifikasi kontak kedaluwarsa → TOLAK walau grant ACTIVE', (await akses(A, KP1)) === 'TOLAK:CONTACT_INELIGIBLE')
  await KT.verifikasiKontak(A.admin2Ctx, KP1, { metode: 'CALL_BACK', bukti: BUKTI, berlakuSampai: nanti(6) })
  await adm.customer.update({ where: { id: A.C1.id }, data: { isActive: false } })
  cek('customer dinonaktifkan → TOLAK untuk PIC-nya', (await akses(A, KC1)) === 'TOLAK:PARTY_NOT_ELIGIBLE')
  await adm.customer.update({ where: { id: A.C1.id }, data: { isActive: true } })

  // ========================================================================== G3
  bagian('[G3] E-4 — grant PENDING untuk kontak tak layak tidak pernah ACTIVE (AC-2E-07/08)')
  const KP2 = await kontak(A, 'PRINCIPAL', A.P1.id)
  const gE = await ajukan(A, KP2, [V.P1only.id])
  await adm.waContact.updateMany({ where: { id: KP2 }, data: { verificationExpiresAt: new Date(Date.now() - 60_000) } })
  const tl = await setujui(A, gE.grantId)
  cek('SETUJU pada kontak verifikasi EXPIRED → TIDAK_LAYAK, status tetap PENDING', tl.hasil === 'TIDAK_LAYAK' && tl.alasan === 'CONTACT_INELIGIBLE' && (await statusGrant(gE.grantId)) === 'PENDING')
  cek('percobaan tak layak DIAUDIT', (await adm.auditLog.count({ where: { recordId: gE.grantId, newValue: { path: ['peristiwa'], equals: 'WA2_GRANT_PERSETUJUAN_DITOLAK_SISTEM' } } })) === 1)
  const tolakE = await GS.putuskanGrant(A.adminCtx, gE.grantId, { keputusan: 'TOLAK', catatan: 'Kontak tidak layak (uji).' })
  cek('TOLAK eksplisit tetap bisa → REJECTED (diaudit)', tolakE.hasil === 'DITOLAK' && (await statusGrant(gE.grantId)) === 'REJECTED')
  const KP3 = await kontak(A, 'PRINCIPAL', A.P1.id)
  const gI = await ajukan(A, KP3, [V.P1only.id])
  await KT.nonaktifkanKontak(A.adminCtx, KP3, { alasan: 'PIC pindah (uji).' })
  cek('SETUJU pada kontak INACTIVE → TIDAK_LAYAK, tetap PENDING', (await setujui(A, gI.grantId)).hasil === 'TIDAK_LAYAK' && (await statusGrant(gI.grantId)) === 'PENDING')
  const KP4 = await kontak(A, 'PRINCIPAL', A.P1.id)
  const gS = await ajukan(A, KP4, [V.P1only.id])
  await adm.voyage.update({ where: { id: V.P1only.id }, data: { principalId: A.P2.id } })
  const st = await setujui(A, gS.grantId)
  cek('cakupan basi (voyage pindah principal sebelum keputusan) → GRANT_SCOPE_STALE, tetap PENDING', st.hasil === 'TIDAK_LAYAK' && st.alasan === 'GRANT_SCOPE_STALE' && (await statusGrant(gS.grantId)) === 'PENDING')
  await adm.voyage.update({ where: { id: V.P1only.id }, data: { principalId: A.P1.id } })

  // ========================================================================== V
  bagian('[V] Pembaca terbatas — kolom per kategori, tanpa kebocoran (AC-2E-10)')
  const IDENT = ['voyageId', 'voyageNumber', 'namaKapal', 'namaPelabuhan', 'zonaWaktu']
  const kunciSah = new Set([...IDENT, 'status', 'eta', 'etb', 'etd', 'ata', 'atb', 'atd', 'milestoneTerakhir'])
  const fc = await VW.bacaVoyageTerotorisasi(A.adminCtx, KC1, V.C1P1.id)
  cek('customer: identitas + semua kategori; milestone terakhir EOSP', Object.keys(fc).every((k) => kunciSah.has(k)) && 'ata' in fc && fc.milestoneTerakhir?.eventCode === 'EOSP' && fc.status === 'CONFIRMED')
  const fp = await VW.bacaVoyageTerotorisasi(A.adminCtx, KP1, V.C1P1.id)
  cek('principal (STATUS+SCHEDULE_ESTIMATE): TANPA ata/atb/atd & milestone', Object.keys(fp).sort().join() === [...IDENT, 'status', 'eta', 'etb', 'etd'].sort().join())
  const semuaTeks = JSON.stringify([fc, fp])
  cek('tidak ada kolom/teks terlarang (catatan internal, customer/principal, biaya)', !/CATATAN-INTERNAL|customerId|principalId|baseCurrency|notes|invoice/i.test(semuaTeks))
  cek('principal membaca voyage pelanggan lain (kapal sama) → NOT_FOUND', (await kode(() => VW.bacaVoyageTerotorisasi(A.adminCtx, KP1, V.C2P2.id))) === 'NOT_FOUND')
  cek('customer membaca voyage principal-only → NOT_FOUND', (await kode(() => VW.bacaVoyageTerotorisasi(A.adminCtx, KC1, V.P1only.id))) === 'NOT_FOUND')
  cek('E-2: voyage SEED milik customer → NOT_FOUND', (await kode(() => VW.bacaVoyageTerotorisasi(A.adminCtx, KC1, V.C1uji.id))) === 'NOT_FOUND')
  cek('E-5: voyage CANCELLED milik customer → NOT_FOUND', (await kode(() => VW.bacaVoyageTerotorisasi(A.adminCtx, KC1, V.C1cancel.id))) === 'NOT_FOUND')

  // ========================================================================== G4
  bagian('[G4] Pencabutan — efek seketika (AC-2E-05/09)')
  const KP5 = await kontak(A, 'PRINCIPAL', A.P1.id)
  const gR = await ajukan(A, KP5, [V.P1only.id], ['STATUS'])
  await setujui(A, gR.grantId)
  const cand = await adm.communicationCandidate.create({ data: { tenantId: A.t.id, voyageId: V.P1only.id, family: 'EOSP', sourceType: 'VOYAGE_EVENT', sourceRef: uid('ref'), createdByUserId: 'u-uji' } })
  const k5 = await adm.waContact.findFirst({ where: { id: KP5 } })
  const msgId = uid('msg')
  await adm.$executeRawUnsafe(
    `INSERT INTO "WaClientMessage" ("id","tenantId","candidateId","revision","contactId","recipientE164Snapshot","partyTypeSnapshot","partyIdSnapshot","grantIdSnapshot","consentStateVersion","logicalMessageKey","activeKey","language","templateId","templateVersion","body","fields","sourceFingerprint","snapshotFingerprint","freshnessVerdict","mode","state","createdByUserId","updatedAt")
     VALUES ($1,$2,$3,1,$4,$5,'PRINCIPAL',$6,$7,1,$8,$8,'ID','T',1,'b','{}'::jsonb,'s','s','{}'::jsonb,'CLIENT_REAL','APPROVED','u-uji',now())`,
    msgId, A.t.id, cand.id, KP5, k5.e164, A.P1.id, gR.grantId, uid('lmk'),
  )
  cek('sebelum dicabut: pembaca berhasil', (await coba(() => VW.bacaVoyageTerotorisasi(A.adminCtx, KP5, V.P1only.id))).ok)
  cek('cabut tanpa alasan → ditolak', (await kode(() => GS.cabutGrant(A.adminCtx, gR.grantId, { alasan: '' }))) === 'VALIDATION')
  const cb = await GS.cabutGrant(A.adminCtx, gR.grantId, { alasan: 'Kewenangan principal berakhir (uji).' })
  cek('cabut → REVOKED + pesan tertaut NEEDS_REVIEW (ACCESS_REVOKED)', cb.hasil === 'DICABUT' && cb.pesanDitahan.includes(msgId) && (await adm.waClientMessage.findFirst({ where: { id: msgId } })).reasonCode === 'ACCESS_REVOKED')
  cek('revoke yang sudah commit → pembacaan berikutnya DITOLAK', (await kode(() => VW.bacaVoyageTerotorisasi(A.adminCtx, KP5, V.P1only.id))) === 'NOT_FOUND' && JSON.stringify(await akses(A, KP5)) === '[]')
  cek('cabut ulang → SUDAH_DICABUT; cabut PENDING → GRANT_NOT_ACTIVE', (await GS.cabutGrant(A.adminCtx, gR.grantId, { alasan: 'Ulang (uji).' })).hasil === 'SUDAH_DICABUT' && (await kode(async () => GS.cabutGrant(A.adminCtx, (await ajukan(A, KP5, [V.P1only.id])).grantId, { alasan: 'PENDING (uji).' }))) === 'GRANT_NOT_ACTIVE')

  // ========================================================================== I
  bagian('[I] Isolasi tenant & tanpa akses dari verifikasi/consent (AC-2E-11/12)')
  const awalA = (await adm.waPrincipalAccessGrant.count({ where: { tenantId: A.t.id } })) + (await adm.auditLog.count({ where: { tenantId: A.t.id } }))
  cek('ctx B: putuskan/cabut/daftar grant A → NOT_FOUND', (await kode(() => setujui(B, g1.grantId))) === 'NOT_FOUND' && (await kode(() => GS.cabutGrant(B.adminCtx, g1.grantId, { alasan: 'lintas tenant' }))) === 'NOT_FOUND' && (await kode(() => GS.daftarGrantKontak(B.adminCtx, KP1))) === 'NOT_FOUND')
  cek('ctx B: ajukan untuk kontak A → NOT_FOUND', (await kode(() => ajukan(B, KP1, [V.C1P1.id]))) === 'NOT_FOUND')
  cek('ctx B: resolver untuk kontak A → TOLAK; pembaca → NOT_FOUND', (await akses(B, KC1)) === 'TOLAK:CONTACT_INELIGIBLE' && (await kode(() => VW.bacaVoyageTerotorisasi(B.adminCtx, KC1, V.C1P1.id))) === 'NOT_FOUND')
  cek('upaya lintas tenant: 0 mutasi & 0 audit di tenant A', (await adm.waPrincipalAccessGrant.count({ where: { tenantId: A.t.id } })) + (await adm.auditLog.count({ where: { tenantId: A.t.id } })) === awalA)
  const KP6 = await kontak(A, 'PRINCIPAL', A.P1.id)
  cek('verifikasi kontak principal saja → akses KOSONG (verifikasi ≠ hak akses)', JSON.stringify(await akses(A, KP6)) === '[]')

  // ========================================================================== R5′–R10
  const siapGrant = async (voyId = V.P1only.id) => {
    const c = await kontak(A, 'PRINCIPAL', A.P1.id)
    const g = await ajukan(A, c, [voyId], ['STATUS'])
    return { c, g: g.grantId }
  }
  bagian('[R5′] nonaktifkanKontak vs putuskanGrant(SETUJU) — service sungguhan ×20')
  {
    let langgar = 0
    let lain = 0
    for (let i = 0; i < 20; i++) {
      const { c, g } = await siapGrant()
      const h = await Promise.all(acak([() => coba(() => KT.nonaktifkanKontak(A.admin2Ctx, c, { alasan: 'Uji R5 aksen.' })), () => coba(() => setujui(A, g))]).map((f) => f()))
      lain += h.filter((x) => !x.ok).length
      const k = await adm.waContact.findFirst({ where: { id: c } })
      if (k.status === 'INACTIVE' && (await statusGrant(g)) === 'ACTIVE') langgar++
    }
    cek('tidak pernah ada grant ACTIVE pada kontak INACTIVE; tanpa galat', langgar === 0 && lain === 0, `pelanggaran ${langgar}, galat ${lain}`)
  }
  bagian('[R6] cabutVerifikasi vs putuskanGrant(SETUJU) ×20')
  {
    let langgar = 0
    let lain = 0
    for (let i = 0; i < 20; i++) {
      const { c, g } = await siapGrant()
      const h = await Promise.all(acak([() => coba(() => KT.cabutVerifikasi(A.admin2Ctx, c, { alasan: 'RELATIONSHIP_ENDED', catatan: 'Uji R6 balapan.' })), () => coba(() => setujui(A, g))]).map((f) => f()))
      lain += h.filter((x) => !x.ok).length
      const k = await adm.waContact.findFirst({ where: { id: c } })
      if (k.verificationStatus !== 'VERIFIED' && (await statusGrant(g)) === 'ACTIVE') langgar++
    }
    cek('tidak pernah ada grant ACTIVE pada kontak UNVERIFIED; tanpa galat', langgar === 0 && lain === 0, `pelanggaran ${langgar}, galat ${lain}`)
  }
  bagian('[R7] Dua pemutus bersamaan: SETUJU vs TOLAK ×20')
  {
    let langgar = 0
    for (let i = 0; i < 20; i++) {
      const { g } = await siapGrant()
      const h = await Promise.all(acak([() => coba(() => setujui(A, g, A.adminCtx)), () => coba(() => GS.putuskanGrant(A.admin2Ctx, g, { keputusan: 'TOLAK', catatan: 'Uji R7 balapan.' }))]).map((f) => f()))
      const menang = h.filter((x) => x.ok)
      const kalah = h.filter((x) => !x.ok)
      const s = await statusGrant(g)
      const cocok = menang.length === 1 && kalah.length === 1 && kalah[0].kode === 'GRANT_NOT_PENDING' && ((menang[0].nilai.hasil === 'DISETUJUI' && s === 'ACTIVE') || (menang[0].nilai.hasil === 'DITOLAK' && s === 'REJECTED'))
      if (!cocok) langgar++
    }
    cek('tepat satu keputusan final; yang kalah GRANT_NOT_PENDING; status konsisten', langgar === 0, `pelanggaran ${langgar}`)
  }
  bagian('[R8] cabutGrant vs pembacaan — dua koneksi')
  {
    // (a) Deterministik: pembaca menahan kunci FOR SHARE → pencabutan MENUNGGU sampai pembaca selesai.
    const { c, g } = await siapGrant()
    await setujui(A, g)
    let revokeP = null
    let selesaiSaatDitahan = null
    let hasilDalam = null
    await adm.$transaction(async (tx) => {
      hasilDalam = await VW.bacaFaktaDalamTx(tx, A.t.id, c, V.P1only.id, new Date())
      revokeP = GS.cabutGrant(A.adminCtx, g, { alasan: 'Uji R8 deterministik.' })
      await tidur(800)
      selesaiSaatDitahan = await sudahSelesai(revokeP)
    }, { timeout: 15000 })
    const rv = await revokeP
    cek('pembaca melihat akses konsisten; pencabutan MENUNGGU kunci pembaca (tak menyusup di tengah pemeriksaan)', hasilDalam?.voyageId === V.P1only.id && selesaiSaatDitahan === false && rv.hasil === 'DICABUT')
    cek('setelah pencabutan commit → pembacaan berikutnya DITOLAK', (await kode(() => VW.bacaVoyageTerotorisasi(A.adminCtx, c, V.P1only.id))) === 'NOT_FOUND')
    // (b) Acak ×20: hasil baca selalu utuh-sebelum atau ditolak-sesudah; setelah keduanya selesai selalu ditolak.
    let langgar = 0
    for (let i = 0; i < 20; i++) {
      const s = await siapGrant()
      await setujui(A, s.g)
      const h = await Promise.all(acak([() => coba(() => GS.cabutGrant(A.adminCtx, s.g, { alasan: 'Uji R8 acak.' })), () => coba(() => VW.bacaVoyageTerotorisasi(A.adminCtx, s.c, V.P1only.id))]).map((f) => f()))
      const baca = h.find((x) => (x.ok && x.nilai?.voyageId) || (!x.ok && x.kode === 'NOT_FOUND'))
      const sesudah = await kode(() => VW.bacaVoyageTerotorisasi(A.adminCtx, s.c, V.P1only.id))
      if (!baca || sesudah !== 'NOT_FOUND' || (baca.ok && Object.keys(baca.nilai).some((k) => !kunciSah.has(k)))) langgar++
    }
    cek('acak ×20: tidak ada hasil campuran; selalu ditolak setelah pencabutan', langgar === 0, `pelanggaran ${langgar}`)
  }
  bagian('[R9] putuskanGrant(SETUJU) vs pemindahan Voyage.principalId — dua koneksi')
  {
    // (a) Deterministik: pemindahan sedang berlangsung (belum commit) → persetujuan MENUNGGU, lalu GRANT_SCOPE_STALE.
    const vX = await A.voy({ principalId: A.P1.id })
    const { g } = await siapGrant(vX.id)
    let putusP = null
    let selesaiSaatDitahan = null
    await adm.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`UPDATE "Voyage" SET "principalId" = $2 WHERE id = $1`, vX.id, A.P2.id)
      putusP = setujui(A, g)
      await tidur(800)
      selesaiSaatDitahan = await sudahSelesai(putusP)
    }, { timeout: 15000 })
    const hasil = await putusP
    cek('persetujuan MENUNGGU pemindahan; setelah commit → TIDAK_LAYAK GRANT_SCOPE_STALE, tetap PENDING', selesaiSaatDitahan === false && hasil.hasil === 'TIDAK_LAYAK' && hasil.alasan === 'GRANT_SCOPE_STALE' && (await statusGrant(g)) === 'PENDING')
    // (b) Acak ×20: bila voyage akhirnya milik principal lain, resolver TIDAK PERNAH mengembalikannya.
    let langgar = 0
    for (let i = 0; i < 20; i++) {
      const v = await A.voy({ principalId: A.P1.id })
      const s = await siapGrant(v.id)
      await Promise.all(acak([() => coba(() => setujui(A, s.g)), () => coba(() => adm.voyage.update({ where: { id: v.id }, data: { principalId: A.P2.id } }))]).map((f) => f()))
      const ak = await akses(A, s.c)
      if (Array.isArray(ak) && ak.includes(v.id)) langgar++
    }
    cek('acak ×20: perpindahan principal selalu membatalkan kelayakan akses lama', langgar === 0, `pelanggaran ${langgar}`)
  }
  bagian('[R10] ajukanGrant vs hapus permanen voyage cakupan ×10')
  {
    let langgar = 0
    let galatTakDikenal = 0
    for (let i = 0; i < 10; i++) {
      const v = await A.voy({ principalId: A.P1.id })
      const c = await kontak(A, 'PRINCIPAL', A.P1.id)
      const h = await Promise.all(acak([() => coba(() => ajukan(A, c, [v.id], ['STATUS'])), () => coba(() => adm.voyage.delete({ where: { id: v.id } }))]).map((f) => f()))
      galatTakDikenal += h.filter((x) => !x.ok && !['VOYAGE_NOT_AUTHORIZED', 'P2025'].includes(x.kode)).length
      const grants = await adm.waPrincipalAccessGrant.findMany({ where: { contactId: c }, select: { id: true } })
      for (const g of grants) {
        const sisa = await adm.waPrincipalAccessGrantVoyage.count({ where: { grantId: g.id } })
        if (sisa === 0) {
          const p = await setujui(A, g.id)
          if (p.hasil !== 'TIDAK_LAYAK' || (await statusGrant(g.id)) !== 'PENDING') langgar++
        }
      }
    }
    cek('tidak ada cakupan yatim; grant dengan cakupan terhapus tak pernah dapat ACTIVE', langgar === 0 && galatTakDikenal === 0, `pelanggaran ${langgar}, galat lain ${galatTakDikenal}`)
  }

  // ========================================================================== A
  bagian('[A] Audit')
  const audit = await adm.auditLog.findMany({ where: { tenantId: A.t.id, tableName: 'WaPrincipalAccessGrant' } })
  const teks = JSON.stringify(audit.map((a) => [a.oldValue, a.newValue]))
  cek('pengajuan/keputusan/pencabutan tercatat (actor + peristiwa), tanpa teks bukti', audit.length >= 40 && audit.every((a) => a.userId) && !teks.includes(BUKTI) && /WA2_GRANT_DIAJUKAN/.test(teks) && /WA2_GRANT_DISETUJUI/.test(teks) && /WA2_GRANT_DICABUT/.test(teks) && /WA2_GRANT_DITOLAK/.test(teks))
  cek('tidak ada egress jaringan selama uji', egress.length === 0, egress.join(','))
} catch (e) {
  gagal++
  console.log(`  ❌ galat tak terduga: ${String(e?.stack ?? e).slice(0, 700)}`)
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
