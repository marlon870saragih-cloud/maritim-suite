// Uji DB WA-2a Step 2F (F3) — konfirmasi jadwal, draft & preview pesan klien, grant snapshot (D-GRANT),
// freshness D6, rollback, konkurensi, dan uji DIFERENSIAL WA-1 (perilaku terlihat WA-1 tidak berubah).
//
// Jalankan:
//   WA2F3_DB_URL=postgresql://postgres@127.0.0.1:55432/maritime_suite node prisma/check-wa2a-message-f3-db.mjs
//
// DB loopback sekali pakai yang sudah `prisma migrate deploy`. Ditolak bila host bukan loopback,
// NODE_ENV=production, atau DATABASE_URL/DIRECT_URL menunjuk DB lain. Jaring egress aktif.
// Data sintetis bertanda `WA2F3-`, dibersihkan lewat hapus tenant. Flag WA-1 SENGAJA mati kecuali saat
// langkah WA-1 pada uji diferensial (membuktikan WA-2 tidak bergantung pada flag FAKE WA-1).

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

const URL_DB = process.env.WA2F3_DB_URL
if (!URL_DB) {
  console.log('DILEWATI — WA2F3_DB_URL tidak diset (butuh PostgreSQL loopback sekali pakai).')
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
const W1S = jiti('../src/services/communication/communication.service.ts')
const W1R = jiti('../src/services/communication/communication-read.service.ts')
const W1A = jiti('../src/services/communication/communication-approval.service.ts')
const { PrismaClient } = await import('@prisma/client')
const adm = new PrismaClient({ datasources: { db: { url: URL_DB } } })

const TAG = 'WA2F3-'
let seq = 0
const uid = (p = 'x') => `${TAG}${p}-${++seq}`
let nomorSeq = 0
const nomorBaru = () => `+62997${String(++nomorSeq).padStart(8, '0')}`
const BUKTI = 'Dokumen penunjukan resmi & konfirmasi telepon ke kantor pihak (uji sintetis).'
const JAM = 3_600_000
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

async function bersihkan() {
  await adm.$executeRawUnsafe('DROP TRIGGER IF EXISTS wa2f3_gagal_audit ON "AuditLog"')
  await adm.$executeRawUnsafe('DROP FUNCTION IF EXISTS wa2f3_gagal_audit()')
  await adm.tenant.deleteMany({ where: { companyName: { startsWith: TAG } } })
}
const setAllowlist = (...ids) => {
  process.env.AUTOMATION_TENANT_IDS = ids.join(',')
}

const ETA_LAMA = '2026-10-13'
const ETA_BARU = '2026-10-15'
const ETD_BARU = '2026-10-17'

async function dunia(nama) {
  const t = await adm.tenant.create({ data: { companyName: `${TAG}${nama}` } })
  const C1 = await adm.customer.create({ data: { tenantId: t.id, name: `${TAG}Customer 1` } })
  const C2 = await adm.customer.create({ data: { tenantId: t.id, name: `${TAG}Customer 2` } })
  const P1 = await adm.principal.create({ data: { tenantId: t.id, name: `${TAG}Principal 1` } })
  const P2 = await adm.principal.create({ data: { tenantId: t.id, name: `${TAG}Principal 2` } })
  const kapal = await adm.vessel.create({ data: { tenantId: t.id, name: 'MV CONTOH SINTETIS' } })
  const port = await adm.port.create({ data: { tenantId: t.id, name: 'Balikpapan', timezone: 'Asia/Makassar' } })
  return {
    t, C1, C2, P1, P2, kapal, port,
    adminCtx: { tenantId: t.id, userId: `u-admin-${nama}`, role: 'ADMIN' },
    manajerCtx: { tenantId: t.id, userId: `u-manajer-${nama}`, role: 'MANAJER_OPERASI' },
    admin2Ctx: { tenantId: t.id, userId: `u-admin2-${nama}`, role: 'ADMIN' },
  }
}
const voyage = (w, ubah = {}) =>
  adm.voyage.create({
    data: { tenantId: w.t.id, vesselId: w.kapal.id, portId: w.port.id, voyageNumber: uid('VYG'), dataOrigin: 'NYATA', status: 'CONFIRMED', customerId: w.C1.id, principalId: w.P1.id, eta: new Date(`${ETA_BARU}T00:00:00Z`), etd: new Date(`${ETD_BARU}T00:00:00Z`), ...ubah },
  })
/** Sumber jadwal: AuditLog UBAH_TANGGAL (ETA berubah) + sinyal ETA_CHANGED. */
async function jadwal(w, { voyageUbah = {}, auditPada = new Date(Date.now() - JAM) } = {}) {
  const v = await voyage(w, voyageUbah)
  const a = await adm.auditLog.create({ data: { tenantId: w.t.id, tableName: 'Voyage', recordId: v.id, action: 'UPDATE', oldValue: { peristiwa: 'UBAH_TANGGAL', eta: ETA_LAMA }, newValue: { peristiwa: 'UBAH_TANGGAL', medan: ['eta'], eta: ETA_BARU }, createdAt: auditPada } })
  const s = await adm.monitoringSignal.create({ data: { tenantId: w.t.id, voyageId: v.id, kind: 'ETA_CHANGED', severity: 'INFO', dedupeKey: uid(), sourceType: 'AUDIT_LOG', sourceRef: a.id, explanation: 'uji', recommendation: 'uji', after: { eta: ETA_BARU } } })
  return { v, a, s }
}
/** Sumber milestone: VoyageEvent + sinyal OPERATIONAL_EVENT_RECORDED. */
async function milestone(w, eventCode = 'ALL_FAST', { voyageUbah = {}, eventUbah = {}, jamLalu = 2 } = {}) {
  const v = await voyage(w, voyageUbah)
  const terjadi = new Date(Date.now() - jamLalu * JAM)
  const e = await adm.voyageEvent.create({ data: { tenantId: w.t.id, voyageId: v.id, eventCode, occurredAt: terjadi, recordedByUserId: 'u-pencatat', ...eventUbah } })
  const s = await adm.monitoringSignal.create({ data: { tenantId: w.t.id, voyageId: v.id, kind: 'OPERATIONAL_EVENT_RECORDED', severity: 'INFO', dedupeKey: uid(), sourceType: 'VOYAGE_EVENT', sourceRef: e.id, explanation: 'uji', recommendation: 'uji', after: { eventCode, occurredAt: terjadi.toISOString() } } })
  return { v, e, s }
}
async function kontak(w, partyType, partyId, { verif = true, optIn = true, language = 'ID' } = {}) {
  const r = await KT.buatKontak(w.adminCtx, { partyType, partyId, nomor: nomorBaru(), displayName: 'PIC uji', language })
  if (verif) await KT.verifikasiKontak(w.adminCtx, r.contactId, { metode: 'DOCUMENT', bukti: BUKTI, berlakuSampai: GS.tambahBulan(new Date(), 6) })
  if (optIn) await CS.catatOptIn(w.adminCtx, r.contactId, { kanal: 'EMAIL', bukti: BUKTI })
  return r.contactId
}
async function grantAktif(w, contactId, voyageIds, kategori) {
  const g = await GS.ajukanGrant(w.manajerCtx, contactId, { voyageIds, kategori, buktiIdentitas: BUKTI, buktiHubungan: BUKTI, buktiKewenangan: BUKTI })
  await GS.putuskanGrant(w.adminCtx, g.grantId, { keputusan: 'SETUJU', catatan: 'Disetujui setelah cek bukti (uji).' })
  return g.grantId
}
const konfirmasi = (w, v, ctx = w.manajerCtx, ubah = {}) => KJ.catatKonfirmasiJadwal(ctx, v.id, { field: 'eta', nilai: ETA_BARU, sourceKind: 'MASTER_OR_SHIP', sourceNote: 'Noon report kapal (uji sintetis).', ...ubah })
const draft = (w, s, contactId, ctx = w.adminCtx) => MS.buatDraftPesanKlien(ctx, { signalId: s.id, contactId })
const jumlahKandidat = (w) => adm.communicationCandidate.count({ where: { tenantId: w.t.id } })
const jumlahPesan = (w) => adm.waClientMessage.count({ where: { tenantId: w.t.id } })
const jumlahAudit = (w, peristiwa) => adm.auditLog.count({ where: { tenantId: w.t.id, newValue: { path: ['peristiwa'], equals: peristiwa } } })
const pesan = (id) => adm.waClientMessage.findFirst({ where: { id } })

try {
  await bersihkan()
  const A = await dunia('A')
  const B = await dunia('B')
  const X = await dunia('X-tidak-allowlist')
  setAllowlist(A.t.id, B.t.id)

  // ============================================================================ G
  bagian('[G] Gerbang — WA-2 tanpa flag WA-1')
  const g0 = await jadwal(A)
  const kc0 = await kontak(A, 'CUSTOMER', A.C1.id)
  cek('flag FAKE WA-1 tidak diset sepanjang uji WA-2', process.env.WA1_INTERNAL_FAKE_TEST_ENABLED === undefined)
  process.env.WA2_CLIENT_FOUNDATION_ENABLED = 'false'
  cek('flag WA-2 mati → FORBIDDEN', (await kode(() => draft(A, g0.s, kc0))) === 'FORBIDDEN')
  process.env.WA2_CLIENT_FOUNDATION_ENABLED = 'true'
  process.env.NODE_ENV = 'production'
  cek('NODE_ENV=production → FORBIDDEN', (await kode(() => draft(A, g0.s, kc0))) === 'FORBIDDEN')
  process.env.NODE_ENV = 'test'
  cek('peran OPERATOR → FORBIDDEN (draft & konfirmasi)', (await kode(() => draft(A, g0.s, kc0, { ...A.adminCtx, role: 'OPERATOR' }))) === 'FORBIDDEN' && (await kode(() => konfirmasi(A, g0.v, { ...A.adminCtx, role: 'OPERATOR' }))) === 'FORBIDDEN')
  cek('konteks sistem → FORBIDDEN', (await kode(() => draft(A, g0.s, kc0, { ...A.adminCtx, system: true }))) === 'FORBIDDEN')
  cek('tenant di luar allowlist → NOT_FOUND', (await kode(() => draft(X, g0.s, kc0, X.adminCtx))) === 'NOT_FOUND')
  cek('gerbang menolak SEBELUM menulis (0 kandidat, 0 pesan)', (await jumlahKandidat(A)) === 0 && (await jumlahPesan(A)) === 0)

  // ============================================================================ K
  bagian('[K] Konfirmasi jadwal (F3c)')
  const k1 = await konfirmasi(A, g0.v)
  cek('MANAJER_OPERASI mencatat konfirmasi ETA = nilai voyage terkini → DICATAT', k1.hasil === 'DICATAT')
  cek('permintaan identik → SUDAH_ADA (id sama, tanpa baris baru)', (await konfirmasi(A, g0.v)).confirmationId === k1.confirmationId && (await adm.voyageScheduleConfirmation.count({ where: { voyageId: g0.v.id } })) === 1)
  cek('ADMIN juga boleh mencatat', (await konfirmasi(A, g0.v, A.adminCtx, { sourceNote: 'Email principal (uji sintetis).' })).hasil === 'DICATAT')
  cek('ETB ditolak (K-3) → CONFIRMATION_FIELD_INVALID', (await kode(() => konfirmasi(A, g0.v, A.manajerCtx, { field: 'etb' }))) === 'CONFIRMATION_FIELD_INVALID')
  const sebelumPalsu = await adm.voyageScheduleConfirmation.count({ where: { voyageId: g0.v.id } })
  cek('nilai ≠ jadwal voyage terkini (konfirmasi palsu) → CONFIRMATION_VALUE_NOT_CURRENT, tanpa baris', (await kode(() => konfirmasi(A, g0.v, A.manajerCtx, { nilai: '2026-10-20' }))) === 'CONFIRMATION_VALUE_NOT_CURRENT' && (await adm.voyageScheduleConfirmation.count({ where: { voyageId: g0.v.id } })) === sebelumPalsu)
  cek('tanggal tidak sah / sumber tak dikenal / catatan kosong → ditolak', (await kode(() => konfirmasi(A, g0.v, A.manajerCtx, { nilai: '2026-02-30' }))) === 'CONFIRMATION_VALUE_INVALID' && (await kode(() => konfirmasi(A, g0.v, A.manajerCtx, { sourceKind: 'RUMOR' }))) === 'CONFIRMATION_SOURCE_INVALID' && (await kode(() => konfirmasi(A, g0.v, A.manajerCtx, { sourceNote: '' }))) === 'CONFIRMATION_SOURCE_INVALID')
  cek('voyage tenant lain → NOT_FOUND (tanpa kebocoran)', (await kode(() => konfirmasi(B, g0.v, B.manajerCtx))) === 'NOT_FOUND')
  const vUji = await voyage(A, { dataOrigin: 'UJI' })
  cek('voyage non-NYATA → VOYAGE_NOT_ELIGIBLE', (await kode(() => konfirmasi(A, vUji))) === 'VOYAGE_NOT_ELIGIBLE')
  const inv = await KJ.invalidasiKonfirmasiJadwal(A.manajerCtx, k1.confirmationId, { alasan: 'Salah catat (uji).' })
  cek('invalidasi → DIINVALIDASI; berulang → SUDAH_DIINVALIDASI', inv.hasil === 'DIINVALIDASI' && (await KJ.invalidasiKonfirmasiJadwal(A.manajerCtx, k1.confirmationId, { alasan: 'Salah catat (uji).' })).hasil === 'SUDAH_DIINVALIDASI')
  cek('invalidasi oleh tenant lain → NOT_FOUND', (await kode(() => KJ.invalidasiKonfirmasiJadwal(B.manajerCtx, k1.confirmationId, { alasan: 'Salah catat (uji).' }))) === 'NOT_FOUND')
  cek('audit konfirmasi & invalidasi tercatat atomik; tanpa teks catatan mentah', (await jumlahAudit(A, 'WA2_JADWAL_DIKONFIRMASI')) === 2 && (await jumlahAudit(A, 'WA2_KONFIRMASI_JADWAL_DIINVALIDASI')) === 1 && !JSON.stringify(await adm.auditLog.findMany({ where: { tenantId: A.t.id, tableName: 'VoyageScheduleConfirmation' } })).includes('Noon report'))
  let duplikat = 0
  let galatKonk = 0
  for (let i = 0; i < 10; i++) {
    const vk = await voyage(A)
    const hasil = await Promise.all(Array.from({ length: 6 }, () => coba(() => konfirmasi(A, vk))))
    const baris = await adm.voyageScheduleConfirmation.count({ where: { voyageId: vk.id } })
    if (baris !== 1) duplikat++
    if (hasil.some((h) => !h.ok) || hasil.filter((h) => h.nilai.hasil === 'DICATAT').length !== 1) galatKonk++
  }
  cek('KONKURENSI: 10× enam konfirmasi identik bersamaan → tepat 1 baris; 1 DICATAT + 5 SUDAH_ADA; 0 galat', duplikat === 0 && galatKonk === 0, `duplikat ${duplikat}, anomali ${galatKonk}`)

  // ============================================================================ D
  bagian('[D] Draft — customer, jadwal (F3d)')
  const d1 = await jadwal(A)
  const kcA = await kontak(A, 'CUSTOMER', A.C1.id)
  const kandidatAwal = await jumlahKandidat(A)
  cek('tanpa konfirmasi → CONFIRMATION_MISSING; kandidat TIDAK dibuat (Prepare di-rollback)', (await kode(() => draft(A, d1.s, kcA))) === 'CONFIRMATION_MISSING' && (await jumlahKandidat(A)) === kandidatAwal && (await jumlahAudit(A, 'WA1_CANDIDATE_DIBUAT')) === 0)
  await konfirmasi(A, d1.v)
  const h1 = await draft(A, d1.s, kcA)
  const m1 = await pesan(h1.messageId)
  cek('draft dibuat: DRAFT, revisi 1, CLIENT_REAL, activeKey = logicalMessageKey', h1.hasil === 'DRAFT_DIBUAT' && m1.state === 'DRAFT' && m1.revision === 1 && m1.mode === 'CLIENT_REAL' && m1.activeKey === m1.logicalMessageKey)
  const harap = ['Update Jadwal Kapal — MV CONTOH SINTETIS', `Voyage: ${d1.v.voyageNumber} | Pelabuhan: Balikpapan`, '', 'Yth. Bapak/Ibu,', '', 'Berikut perubahan jadwal MV CONTOH SINTETIS:', `ETA: dari ${ETA_LAMA} menjadi ${ETA_BARU}.`, '', 'Jadwal dapat berubah sewaktu-waktu.', '', 'Balasan ke nomor ini belum kami pantau. Mohon hubungi kami melalui saluran yang biasa Anda gunakan.', '', 'Hormat kami,', 'PT Tribuana Solusi Maritim'].join('\n')
  cek('body = template F2 disetujui, byte-per-byte (hanya ETA yang berubah)', m1.body === harap && m1.templateId === 'wa2.schedule.ID.v1')
  const kRow = await adm.waContact.findFirst({ where: { id: kcA } })
  const cRow = await adm.waConsentState.findFirst({ where: { contactId: kcA } })
  cek('snapshot: nomor, pihak CUSTOMER, grant null, versi consent, bahasa kontak', m1.recipientE164Snapshot === kRow.e164 && m1.partyTypeSnapshot === 'CUSTOMER' && m1.partyIdSnapshot === A.C1.id && m1.grantIdSnapshot === null && m1.consentStateVersion === cRow.version && m1.language === 'ID')
  cek('freshnessVerdict LOLOS D6A dengan bukti konfirmasi', m1.freshnessVerdict.status === 'LOLOS' && m1.freshnessVerdict.aturan === 'D6A_KONFIRMASI_STAF' && m1.freshnessVerdict.bukti.konfirmasi.length === 1)
  cek('sidik snapshot = dihitung ulang dari kolom', MS.sidikSnapshotKlien({ candidateId: m1.candidateId, logicalMessageKey: m1.logicalMessageKey, contactId: m1.contactId, recipientE164Snapshot: m1.recipientE164Snapshot, partyTypeSnapshot: m1.partyTypeSnapshot, partyIdSnapshot: m1.partyIdSnapshot, grantIdSnapshot: m1.grantIdSnapshot, consentStateVersion: m1.consentStateVersion, language: m1.language, templateId: m1.templateId, templateVersion: m1.templateVersion, body: m1.body, fields: m1.fields, sourceFingerprint: m1.sourceFingerprint, freshnessVerdict: m1.freshnessVerdict, mode: m1.mode }) === m1.snapshotFingerprint)
  const auditDraft = await adm.auditLog.findMany({ where: { tenantId: A.t.id, tableName: 'WaClientMessage' } })
  cek('audit WA2_DRAFT_DIBUAT + WA2_CANDIDATE_DIPAKAI; tanpa nomor utuh & tanpa body', auditDraft.some((a) => a.newValue?.peristiwa === 'WA2_DRAFT_DIBUAT') && auditDraft.some((a) => a.newValue?.peristiwa === 'WA2_CANDIDATE_DIPAKAI') && !JSON.stringify(auditDraft).includes(kRow.e164) && !JSON.stringify(auditDraft).includes('Hormat kami'))
  cek('audit WA-2 TIDAK ditulis pada tabel kandidat WA-1 (riwayat WA-1 tak berubah)', (await adm.auditLog.count({ where: { tenantId: A.t.id, tableName: 'CommunicationCandidate', newValue: { path: ['peristiwa'], string_starts_with: 'WA2_' } } })) === 0)
  const h1b = await draft(A, d1.s, kcA)
  cek('IDEMPOTEN: draft identik → SUDAH_ADA, pesan sama, tanpa baris baru', h1b.hasil === 'SUDAH_ADA' && h1b.messageId === h1.messageId && (await adm.waClientMessage.count({ where: { candidateId: h1.candidateId } })) === 1)

  bagian('[D2] Penolakan SEBELUM Prepare — tanpa kandidat, tanpa sisa tulisan')
  const d2 = await jadwal(A)
  await konfirmasi(A, d2.v)
  const kInact = await kontak(A, 'CUSTOMER', A.C1.id)
  await KT.nonaktifkanKontak(A.adminCtx, kInact, { alasan: 'PIC pindah (uji).' })
  const kUnver = await kontak(A, 'CUSTOMER', A.C1.id, { verif: false, optIn: false })
  const kNone = await kontak(A, 'CUSTOMER', A.C1.id, { optIn: false })
  const kC2 = await kontak(A, 'CUSTOMER', A.C2.id)
  const kEn = await kontak(A, 'CUSTOMER', A.C1.id, { language: 'EN' })
  const k0 = await jumlahKandidat(A)
  const st0 = await adm.waConsentState.count({ where: { contactId: kNone } })
  cek('kontak INACTIVE → CONTACT_INELIGIBLE', (await kode(() => draft(A, d2.s, kInact))) === 'CONTACT_INELIGIBLE')
  cek('kontak belum terverifikasi → CONTACT_INELIGIBLE', (await kode(() => draft(A, d2.s, kUnver))) === 'CONTACT_INELIGIBLE')
  cek('consent bukan OPT_IN → CONSENT_NOT_GRANTED; baris consent NONE tidak tersisa (rollback)', (await kode(() => draft(A, d2.s, kNone))) === 'CONSENT_NOT_GRANTED' && (await adm.waConsentState.count({ where: { contactId: kNone } })) === st0)
  cek('voyage milik customer lain → ACCESS_DENIED', (await kode(() => draft(A, d2.s, kC2))) === 'ACCESS_DENIED')
  cek('kontak tenant lain → NOT_FOUND', (await kode(() => draft(B, d2.s, kcA, B.adminCtx))) === 'NOT_FOUND')
  const sNon = await adm.monitoringSignal.create({ data: { tenantId: A.t.id, voyageId: d2.v.id, kind: 'NOR_TENDERED', severity: 'INFO', dedupeKey: uid(), sourceType: 'VOYAGE_EVENT', sourceRef: 'x', explanation: 'uji', recommendation: 'uji' } })
  cek('sinyal di luar pilot → EVENT_NOT_ALLOWED', (await kode(() => draft(A, sNon, kcA))) === 'EVENT_NOT_ALLOWED')
  cek('semua penolakan di atas: 0 kandidat baru, 0 pesan baru', (await jumlahKandidat(A)) === k0 && (await adm.waClientMessage.count({ where: { contactId: { in: [kInact, kUnver, kNone, kC2] } } })) === 0)
  const hEn = await draft(A, d2.s, kEn)
  cek('bahasa diambil dari WaContact.language (EN) → template EN', (await pesan(hEn.messageId)).templateId === 'wa2.schedule.EN.v1')

  bagian('[D3] Freshness D6 lewat DB')
  // Konfirmasi append-only (trigger 2B) — umur lampau disisipkan langsung, sumber dibuat lebih tua lagi.
  const f1 = await jadwal(A, { auditPada: new Date(Date.now() - 13 * JAM) })
  await adm.voyageScheduleConfirmation.create({ data: { tenantId: A.t.id, voyageId: f1.v.id, field: 'eta', confirmedValue: new Date(`${ETA_BARU}T00:00:00Z`), confirmedAt: new Date(Date.now() - 12 * JAM - 1000), confirmedByUserId: A.manajerCtx.userId, sourceKind: 'MASTER_OR_SHIP', sourceNote: 'Lama (uji sintetis).' } })
  cek('konfirmasi > 12 jam → CONFIRMATION_EXPIRED', (await kode(() => draft(A, f1.s, kcA))) === 'CONFIRMATION_EXPIRED')
  const f2 = await jadwal(A, { auditPada: new Date(Date.now() + 60_000) })
  await konfirmasi(A, f2.v)
  cek('konfirmasi lebih tua dari AuditLog perubahan → CONFIRMATION_BEFORE_SOURCE', (await kode(() => draft(A, f2.s, kcA))) === 'CONFIRMATION_BEFORE_SOURCE')
  const f3 = await jadwal(A)
  const kf3 = await konfirmasi(A, f3.v)
  await KJ.invalidasiKonfirmasiJadwal(A.manajerCtx, kf3.confirmationId, { alasan: 'Batal (uji).' })
  cek('konfirmasi diinvalidasi → CONFIRMATION_INVALIDATED', (await kode(() => draft(A, f3.s, kcA))) === 'CONFIRMATION_INVALIDATED')
  const kP = await kontak(A, 'PRINCIPAL', A.P1.id)
  const m1v = await milestone(A, 'ALL_FAST')
  await grantAktif(A, kP, [m1v.v.id], ['MILESTONE'])
  const hm = await draft(A, m1v.s, kP)
  const mm = await pesan(hm.messageId)
  cek('milestone MANUAL 2 jam lalu → draft (D6B), body ALL_FAST template F2', hm.hasil === 'DRAFT_DIBUAT' && mm.freshnessVerdict.aturan === 'D6B_MANUAL' && mm.body.includes('— ALL FAST tercatat di Balikpapan pada '))
  const tua = await milestone(A, 'ALL_FAST', { jamLalu: 25 })
  await grantAktif(A, kP, [tua.v.id], ['MILESTONE'])
  cek('milestone > 24 jam → EVENT_TOO_OLD', (await kode(() => draft(A, tua.s, kP))) === 'EVENT_TOO_OLD')
  const imp = await milestone(A, 'SAILED', { eventUbah: { source: 'IMPORT' } })
  await grantAktif(A, kP, [imp.v.id], ['MILESTONE'])
  cek('sumber bukan MANUAL → EVENT_SOURCE_NOT_MANUAL', (await kode(() => draft(A, imp.s, kP))) === 'EVENT_SOURCE_NOT_MANUAL')
  const dup = await milestone(A, 'EOSP')
  await adm.voyageEvent.create({ data: { tenantId: A.t.id, voyageId: dup.v.id, eventCode: 'EOSP', occurredAt: new Date(Date.now() - JAM), recordedByUserId: 'u-lain' } })
  await grantAktif(A, kP, [dup.v.id], ['MILESTONE'])
  cek('peristiwa ganda aktif (kode, voyage, port call null = null) → EVENT_DUPLICATE', (await kode(() => draft(A, dup.s, kP))) === 'EVENT_DUPLICATE')
  const hapus = await milestone(A, 'EOSP')
  await grantAktif(A, kP, [hapus.v.id], ['MILESTONE'])
  await adm.voyageEvent.update({ where: { id: hapus.e.id }, data: { deletedAt: new Date() } })
  const kSebelumHapus = await jumlahKandidat(A)
  cek('peristiwa dihapus → SOURCE_INVALID; kandidat TIDAK diblokir/dibuat oleh WA-2 (rollback)', (await kode(() => draft(A, hapus.s, kP))) === 'SOURCE_INVALID' && (await jumlahKandidat(A)) === kSebelumHapus && (await adm.communicationCandidate.count({ where: { tenantId: A.t.id, state: 'BLOCKED' } })) === 0)

  bagian('[D4] Grant snapshot (D-GRANT)')
  const gv = await milestone(A, 'SAILED')
  const gStatus = await grantAktif(A, kP, [gv.v.id], ['STATUS'])
  cek('grant tanpa kategori MILESTONE → CATEGORY_NOT_GRANTED', (await kode(() => draft(A, gv.s, kP))) === 'CATEGORY_NOT_GRANTED')
  const gPendek = await grantAktif(A, kP, [gv.v.id], ['MILESTONE'])
  const gPanjang = await grantAktif(A, kP, [gv.v.id], ['MILESTONE', 'STATUS'])
  await adm.waPrincipalAccessGrant.update({ where: { id: gPendek }, data: { validUntil: new Date(Date.now() + 30 * 24 * JAM) } })
  const hg = await draft(A, gv.s, kP)
  const mg = await pesan(hg.messageId)
  cek('beberapa grant: dipilih masa berlaku TERPANJANG (bukan grant pertama); kandidat teraudit', mg.grantIdSnapshot === gPanjang && mg.fields.grant.kandidat.sort().join() === [gPendek, gPanjang].sort().join() && mg.fields.grant.aturan === 'VALID_UNTIL_TERLAMA_LALU_ID_TERKECIL' && !mg.fields.grant.kandidat.includes(gStatus))
  const tv = await milestone(A, 'SAILED')
  const t1 = await grantAktif(A, kP, [tv.v.id], ['MILESTONE'])
  const t2 = await grantAktif(A, kP, [tv.v.id], ['MILESTONE'])
  const samaVU = new Date(Date.now() + 40 * 24 * JAM)
  await adm.waPrincipalAccessGrant.updateMany({ where: { id: { in: [t1, t2] } }, data: { validUntil: samaVU } })
  const ht = await draft(A, tv.s, kP)
  cek('masa berlaku sama → grantId TERKECIL (deterministik)', (await pesan(ht.messageId)).grantIdSnapshot === [t1, t2].sort()[0])
  const rv1 = await milestone(A, 'EOSP')
  const gr = await grantAktif(A, kP, [rv1.v.id], ['MILESTONE'])
  await GS.cabutGrant(A.adminCtx, gr, { alasan: 'Hubungan berakhir (uji).' })
  cek('grant dicabut → ACCESS_DENIED', (await kode(() => draft(A, rv1.s, kP))) === 'ACCESS_DENIED')
  const ex1 = await milestone(A, 'EOSP')
  const ge = await grantAktif(A, kP, [ex1.v.id], ['MILESTONE'])
  await adm.waPrincipalAccessGrant.update({ where: { id: ge }, data: { validUntil: new Date(Date.now() - 1000) } })
  cek('grant kedaluwarsa (ACTIVE di DB) → ACCESS_DENIED', (await kode(() => draft(A, ex1.s, kP))) === 'ACCESS_DENIED')
  const kP2 = await kontak(A, 'PRINCIPAL', A.P2.id)
  cek('principal lain tanpa grant voyage → ACCESS_DENIED', (await kode(() => draft(A, gv.s, kP2))) === 'ACCESS_DENIED')

  bagian('[D5] Revisi, dua kontak, rollback')
  const r1 = await jadwal(A)
  await konfirmasi(A, r1.v)
  const hr1 = await draft(A, r1.s, kcA)
  await konfirmasi(A, r1.v, A.adminCtx, { sourceNote: 'Konfirmasi ulang dari agen (uji sintetis).' })
  const hr2 = await draft(A, r1.s, kcA)
  const lama = await pesan(hr1.messageId)
  const baru = await pesan(hr2.messageId)
  cek('bukti berubah → revisi BARU; yang lama CANCELED (REVISION_SUPERSEDED), activeKey dilepas; atomik', hr2.hasil === 'DRAFT_DIBUAT' && hr2.revisiDigantikan === hr1.messageId && lama.state === 'CANCELED' && lama.reasonCode === 'REVISION_SUPERSEDED' && lama.activeKey === null && baru.revision === 2 && baru.state === 'DRAFT')
  let tabrakan = 0
  for (let i = 0; i < 10; i++) {
    const dk = await jadwal(A)
    await konfirmasi(A, dk.v)
    const ka = await kontak(A, 'CUSTOMER', A.C1.id)
    const kb = await kontak(A, 'CUSTOMER', A.C1.id)
    const [ra, rb] = await Promise.all([coba(() => draft(A, dk.s, ka)), coba(() => draft(A, dk.s, kb))])
    const revisi = (await adm.waClientMessage.findMany({ where: { tenantId: A.t.id, contactId: { in: [ka, kb] } }, select: { revision: true, candidateId: true } }))
    if (!ra.ok || !rb.ok || revisi.length !== 2 || new Set(revisi.map((r) => r.candidateId)).size !== 1 || revisi.map((r) => r.revision).sort().join() !== '1,2') tabrakan++
  }
  cek('KONKURENSI: 10× dua kontak pada kandidat yang sama bersamaan → keduanya sukses, satu kandidat, revisi 1 & 2', tabrakan === 0, `anomali ${tabrakan}`)
  const rb1 = await jadwal(A)
  await konfirmasi(A, rb1.v)
  const hb1 = await draft(A, rb1.s, kcA)
  await konfirmasi(A, rb1.v, A.adminCtx, { sourceNote: 'Bukti pengganti (uji sintetis).' })
  await adm.$executeRawUnsafe(`CREATE FUNCTION wa2f3_gagal_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."newValue"->>'peristiwa' = 'WA2_DRAFT_DIBUAT' THEN RAISE EXCEPTION 'UJI_GAGAL_AUDIT'; END IF; RETURN NEW; END $$`)
  await adm.$executeRawUnsafe('CREATE TRIGGER wa2f3_gagal_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION wa2f3_gagal_audit()')
  const gagalAudit = await coba(() => draft(A, rb1.s, kcA))
  await adm.$executeRawUnsafe('DROP TRIGGER IF EXISTS wa2f3_gagal_audit ON "AuditLog"')
  await adm.$executeRawUnsafe('DROP FUNCTION IF EXISTS wa2f3_gagal_audit()')
  const tetap = await pesan(hb1.messageId)
  cek('ROLLBACK: audit draft gagal SETELAH revisi lama dibatalkan → revisi lama tetap DRAFT & aktif; tanpa revisi baru', !gagalAudit.ok && tetap.state === 'DRAFT' && tetap.activeKey === tetap.logicalMessageKey && (await adm.waClientMessage.count({ where: { candidateId: hb1.candidateId } })) === 1 && (await adm.auditLog.count({ where: { recordId: hb1.messageId, newValue: { path: ['peristiwa'], equals: 'WA2_REVISI_DIGANTIKAN' } } })) === 0)
  let bocorCabut = 0
  for (let i = 0; i < 10; i++) {
    const cm = await milestone(A, 'ALL_FAST')
    const gc = await grantAktif(A, kP, [cm.v.id], ['MILESTONE'])
    await Promise.all([coba(() => draft(A, cm.s, kP)), coba(() => GS.cabutGrant(A.adminCtx, gc, { alasan: 'Dicabut bersamaan (uji).' }))])
    const sisa = await adm.waClientMessage.count({ where: { grantIdSnapshot: gc, state: { in: ['DRAFT', 'PREVIEWED', 'PENDING_APPROVAL', 'APPROVED'] } } })
    if ((await adm.waPrincipalAccessGrant.findFirst({ where: { id: gc } })).status === 'REVOKED' && sisa > 0) bocorCabut++
  }
  cek('KONKURENSI: 10× cabut grant ∥ buat draft → tak pernah ada pesan aktif ber-grant REVOKED', bocorCabut === 0, `bocor ${bocorCabut}`)

  // ============================================================================ P
  bagian('[P] Preview')
  const p1 = await jadwal(A)
  await konfirmasi(A, p1.v)
  const hp = await draft(A, p1.s, kcA)
  cek('sidik sodoran salah → DITOLAK SNAPSHOT_MISMATCH, state tetap DRAFT', (await MS.pratinjauPesanKlien(A.manajerCtx, { messageId: hp.messageId, snapshotFingerprint: 'a'.repeat(64) })).alasan === 'SNAPSHOT_MISMATCH' && (await pesan(hp.messageId)).state === 'DRAFT')
  cek('preview tenant lain → NOT_FOUND', (await kode(() => MS.pratinjauPesanKlien(B.adminCtx, { messageId: hp.messageId, snapshotFingerprint: hp.snapshotFingerprint }))) === 'NOT_FOUND')
  const okp = await MS.pratinjauPesanKlien(A.manajerCtx, { messageId: hp.messageId, snapshotFingerprint: hp.snapshotFingerprint })
  const mp = await pesan(hp.messageId)
  cek('preview sah → PREVIEWED, previewedBy dicatat, audit WA2_DIPRATINJAU', okp.hasil === 'DIPRATINJAU' && mp.state === 'PREVIEWED' && mp.previewedByUserId === A.manajerCtx.userId && (await adm.auditLog.count({ where: { recordId: hp.messageId, newValue: { path: ['peristiwa'], equals: 'WA2_DIPRATINJAU' } } })) === 1)
  cek('preview kedua (bukan DRAFT) → DITOLAK MESSAGE_STATE_INVALID', (await MS.pratinjauPesanKlien(A.manajerCtx, { messageId: hp.messageId, snapshotFingerprint: hp.snapshotFingerprint })).alasan === 'MESSAGE_STATE_INVALID')
  const p2 = await milestone(A, 'EOSP')
  const g2 = await grantAktif(A, kP, [p2.v.id], ['MILESTONE'])
  const hp2 = await draft(A, p2.s, kP)
  await GS.cabutGrant(A.adminCtx, g2, { alasan: 'Dicabut sebelum preview (uji).' })
  cek('grant dicabut → pesan ditahan (NEEDS_REVIEW) → preview DITOLAK', (await pesan(hp2.messageId)).state === 'NEEDS_REVIEW' && (await MS.pratinjauPesanKlien(A.manajerCtx, { messageId: hp2.messageId, snapshotFingerprint: hp2.snapshotFingerprint })).hasil === 'DITOLAK')
  const p3 = await milestone(A, 'EOSP')
  await grantAktif(A, kP, [p3.v.id], ['MILESTONE'])
  const hp3 = await draft(A, p3.s, kP)
  await adm.voyage.update({ where: { id: p3.v.id }, data: { principalId: A.P2.id } })
  const rp3 = await MS.pratinjauPesanKlien(A.manajerCtx, { messageId: hp3.messageId, snapshotFingerprint: hp3.snapshotFingerprint })
  cek('principal voyage dipindah → preview DITAHAN (NEEDS_REVIEW, ACCESS_DENIED)', rp3.hasil === 'DITAHAN' && rp3.alasan === 'ACCESS_DENIED' && (await pesan(hp3.messageId)).state === 'NEEDS_REVIEW')
  const p4 = await jadwal(A)
  const kp4 = await konfirmasi(A, p4.v)
  const hp4 = await draft(A, p4.s, kcA)
  await KJ.invalidasiKonfirmasiJadwal(A.manajerCtx, kp4.confirmationId, { alasan: 'Ternyata keliru (uji).' })
  const rp4 = await MS.pratinjauPesanKlien(A.manajerCtx, { messageId: hp4.messageId, snapshotFingerprint: hp4.snapshotFingerprint })
  cek('konfirmasi diinvalidasi setelah draft → preview DITOLAK (CONFIRMATION_INVALIDATED), state tetap DRAFT', rp4.hasil === 'DITOLAK' && rp4.alasan === 'CONFIRMATION_INVALIDATED' && (await pesan(hp4.messageId)).state === 'DRAFT')
  const p5 = await jadwal(A)
  await konfirmasi(A, p5.v)
  const hp5 = await draft(A, p5.s, kcA)
  await adm.voyage.update({ where: { id: p5.v.id }, data: { eta: new Date('2026-10-19T00:00:00Z') } })
  const rp5 = await MS.pratinjauPesanKlien(A.manajerCtx, { messageId: hp5.messageId, snapshotFingerprint: hp5.snapshotFingerprint })
  const cp5 = await adm.communicationCandidate.findFirst({ where: { id: hp5.candidateId } })
  cek('sumber berubah (ETA diganti) → preview DIBLOKIR (pesan BLOCKED, activeKey dilepas); kandidat WA-1 TIDAK diblokir WA-2', rp5.hasil === 'DIBLOKIR' && (await pesan(hp5.messageId)).state === 'BLOCKED' && (await pesan(hp5.messageId)).activeKey === null && cp5.state === 'ACTIVE')
  cek('preview pada status terminal (BLOCKED) → DITOLAK', (await MS.pratinjauPesanKlien(A.manajerCtx, { messageId: hp5.messageId, snapshotFingerprint: hp5.snapshotFingerprint })).alasan === 'MESSAGE_STATE_INVALID')
  const p6 = await jadwal(A)
  await konfirmasi(A, p6.v)
  const kop = await kontak(A, 'CUSTOMER', A.C1.id)
  const hp6 = await draft(A, p6.s, kop)
  await CS.catatOptOut(A.adminCtx, kop, { kanal: 'WHATSAPP', bukti: 'Pelanggan membalas STOP (uji sintetis).' })
  cek('opt-out setelah draft → pesan ditahan (NEEDS_REVIEW) → preview DITOLAK', (await pesan(hp6.messageId)).state === 'NEEDS_REVIEW' && (await MS.pratinjauPesanKlien(A.manajerCtx, { messageId: hp6.messageId, snapshotFingerprint: hp6.snapshotFingerprint })).hasil === 'DITOLAK')

  // ============================================================================ W
  bagian('[W] Diferensial WA-1 — perilaku terlihat WA-1 tidak berubah')
  const W = await dunia('W')
  setAllowlist(A.t.id, B.t.id, W.t.id)
  const kW = await kontak(W, 'CUSTOMER', W.C1.id)
  const sA = await jadwal(W)
  const sB = await jadwal(W)
  await konfirmasi(W, sB.v)
  process.env.WA1_INTERNAL_FAKE_TEST_ENABLED = 'true'
  const pA = await W1S.siapkanCandidate(W.adminCtx, { signalId: sA.s.id })
  delete process.env.WA1_INTERNAL_FAKE_TEST_ENABLED
  const dB = await draft(W, sB.s, kW)
  process.env.WA1_INTERNAL_FAKE_TEST_ENABLED = 'true'
  const daftar = await W1R.daftarCandidate(W.adminCtx, {})
  const norm = (c) => JSON.parse(JSON.stringify(c, (k, v) => (['id', 'candidateId', 'voyageId', 'sourceRef', 'signalIds', 'createdAt', 'updatedAt', 'detectedAt', 'createdByUserId', 'voyageNumber', 'nomorVoyage'].includes(k) ? '∙' : v)))
  const iA = daftar.items.find((c) => c.id === pA.candidateId)
  const iB = daftar.items.find((c) => c.id === dB.candidateId)
  cek('daftar WA-1: kandidat via WA-2 tampil IDENTIK dengan kandidat via Prepare WA-1 (kecuali id/waktu/pelaku)', !!iA && !!iB && JSON.stringify(norm(iA)) === JSON.stringify(norm(iB)), JSON.stringify(norm(iB)).slice(0, 120))
  const detA = await W1R.detailCandidate(W.adminCtx, { candidateId: pA.candidateId })
  const detB = await W1R.detailCandidate(W.adminCtx, { candidateId: dB.candidateId })
  cek('detail WA-1 identik (pesan WA-1 kosong di keduanya; pesan WA-2 tidak tampil di WA-1)', JSON.stringify(norm(detA)) === JSON.stringify(norm(detB)))
  const rwA = await W1R.riwayatKomunikasi(W.adminCtx, { candidateId: pA.candidateId })
  const rwB = await W1R.riwayatKomunikasi(W.adminCtx, { candidateId: dB.candidateId })
  const peristiwaRw = (r) => r.jejakAudit.map((j) => j.peristiwa ?? j.newValue?.peristiwa ?? j.action).join()
  cek('riwayat WA-1 identik: hanya WA1_CANDIDATE_DIBUAT, tanpa audit WA2_*', peristiwaRw(rwA) === peristiwaRw(rwB) && !JSON.stringify(rwB).includes('WA2_'), `${peristiwaRw(rwA)} | ${peristiwaRw(rwB)}`)
  const revA = await W1S.buatRevisiPesan(W.adminCtx, { candidateId: pA.candidateId, recipientFixtureId: 'WA1_TEST_FIXTURE_SUCCESS', language: 'ID' })
  const revB = await W1S.buatRevisiPesan(W.adminCtx, { candidateId: dB.candidateId, recipientFixtureId: 'WA1_TEST_FIXTURE_SUCCESS', language: 'ID' })
  cek('aksi WA-1 berikutnya (revisi simulasi) berperilaku sama pada kedua kandidat', revA.hasil === revB.hasil && revA.hasil === 'REVISI_DIBUAT', `${revA.hasil} | ${revB.hasil}`)
  await W1S.tandaiDipratinjau(W.adminCtx, { messageId: revB.messageId, snapshotFingerprint: revB.snapshotFingerprint })
  const apB = await W1A.mintaApproval(W.adminCtx, { messageId: revB.messageId })
  const wa1Sebelum = JSON.stringify(await adm.communicationMessage.findMany({ where: { candidateId: dB.candidateId }, orderBy: { id: 'asc' } })) + JSON.stringify(await adm.tahApprovalRequest.findMany({ where: { tenantId: W.t.id }, orderBy: { id: 'asc' } }))
  delete process.env.WA1_INTERNAL_FAKE_TEST_ENABLED
  await konfirmasi(W, sB.v, W.adminCtx, { sourceNote: 'Bukti tambahan untuk revisi WA-2 (uji sintetis).' })
  const dB2 = await draft(W, sB.s, kW)
  const wa1Sesudah = JSON.stringify(await adm.communicationMessage.findMany({ where: { candidateId: dB.candidateId }, orderBy: { id: 'asc' } })) + JSON.stringify(await adm.tahApprovalRequest.findMany({ where: { tenantId: W.t.id }, orderBy: { id: 'asc' } }))
  cek('Prepare WA-2 pada kandidat yang PUNYA pesan & approval WA-1 → baris pesan & approval WA-1 tidak berubah sedikit pun', dB2.hasil === 'DRAFT_DIBUAT' && apB.hasil === 'APPROVAL_DIMINTA' && wa1Sebelum === wa1Sesudah)
  cek('route approve WA-1 menolak approval selain WA-1 (pengecekan kind, tanpa mutasi) — kode tidak berubah di F3', /if \(a\.kind !== j\.kind\) throw forbidden\('Approval ini bukan approval WA-1\.'\)/.test((await import('node:fs')).readFileSync(join(AKAR, 'src/services/communication/communication-approval.service.ts'), 'utf8')))

  // ============================================================================ Z
  bagian('[Z] Egress & isolasi')
  cek('NOL panggilan jaringan selama seluruh uji', egress.length === 0, egress.join(','))
  cek('tenant B tidak tersentuh (0 kandidat, 0 pesan, 0 konfirmasi)', (await jumlahKandidat(B)) === 0 && (await jumlahPesan(B)) === 0 && (await adm.voyageScheduleConfirmation.count({ where: { tenantId: B.t.id } })) === 0)
} catch (e) {
  gagal++
  console.log(`❌ Uji gagal dijalankan: ${e?.stack ?? e}`)
} finally {
  await bersihkan().catch(() => {})
  await adm.$disconnect()
}

console.log(`\n${gagal === 0 ? '✅ SEMUA LULUS' : '❌ ADA YANG GAGAL'} — lulus ${lulus}, gagal ${gagal}`)
process.exit(gagal === 0 ? 0 : 1)
