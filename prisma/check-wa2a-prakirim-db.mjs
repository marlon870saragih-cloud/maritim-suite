// Uji DB revalidasi pra-kirim — SG-05 A2 / P-2 (keputusan owner O-1..O-8; B-1..B-3; uji DB B-3/O-10).
//
// Jalankan:
//   WA2A2_DB_URL=postgresql://postgres@127.0.0.1:<port>/<db> node prisma/check-wa2a-prakirim-db.mjs
//
// Hanya DB PostgreSQL loopback SEKALI PAKAI yang sudah `prisma migrate deploy`. Ditolak SEBELUM menulis apa pun bila:
// host bukan loopback, NODE_ENV=production, DATABASE_URL/DIRECT_URL menunjuk DB lain (ambigu), atau DB berisi tenant
// yang bukan data uji bertanda (bukan DB sekali pakai). Data sintetis bertanda `WA2A2-` (nomor pola +62996…),
// dibersihkan lewat hapus tenant dan pembersihan DIVERIFIKASI. Koneksi admin uji (`adm`) terpisah dari klien service.
//
// Batas jaringan (koreksi 4): koneksi PostgreSQL loopback oleh mesin Prisma (native) DIIZINKAN. Yang dilarang & dijebak
// di sisi JS: fetch/http/https/net/tls/dns (provider WhatsApp, Send, egress lain). Jebakan ini tidak mencakup kode
// native; klaim "tanpa provider/Send" bersandar pada jebakan + uji statis check-wa2a-prakirim.mjs (impor/identifier).
//
// Cakupan: ELIGIBLE (LAYAK) hanya membuktikan kelayakan PADA SAAT DIPERIKSA di dalam transaksi pemanggil; tidak
// membuktikan klaim tunggal / exactly-once (P-3, F-II). SG-05 tetap OPEN.

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
  if (kondisi) lulus++
  else gagal++
  console.log(`  ${kondisi ? '✅' : '❌'} ${nama}${detail ? ` — ${detail}` : ''}`)
}
const bagian = (j) => console.log(`\n${j}`)

const URL_DB = process.env.WA2A2_DB_URL
if (!URL_DB) {
  console.log('DILEWATI — WA2A2_DB_URL tidak diset (butuh PostgreSQL loopback sekali pakai). P-2 TIDAK dibuktikan oleh jalankan ini.')
  process.exit(3)
}
const tolakJalan = []
let urlDb
try {
  urlDb = new URL(URL_DB)
} catch {
  tolakJalan.push('URL tidak terurai')
}
if (urlDb && !['postgresql:', 'postgres:'].includes(urlDb.protocol)) tolakJalan.push('bukan URL PostgreSQL')
if (urlDb && !['127.0.0.1', 'localhost', '::1', '[::1]'].includes(urlDb.hostname)) tolakJalan.push('host bukan loopback')
if (urlDb && (urlDb.searchParams.has('host') || urlDb.searchParams.has('hostaddr'))) tolakJalan.push('parameter host tambahan (ambigu)')
if (urlDb && (urlDb.pathname.replace(/^\//, '') === '' || /prod/i.test(urlDb.pathname))) tolakJalan.push('nama DB kosong / mirip produksi')
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
const PK = jiti('../src/services/whatsapp/wa-prakirim.service.ts')
const VE = jiti('../src/services/ops/voyage-event.service.ts')
const { forTenant } = jiti('../src/services/tenant-db.ts')
const { PrismaClient } = await import('@prisma/client')
const adm = new PrismaClient({ datasources: { db: { url: URL_DB } } })

const TAG = 'WA2A2-'
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
    return { ok: false, kode: e?.details?.code ?? e?.code ?? 'ERR', pesan: String(e?.message ?? e).slice(0, 160) }
  }
}
const kode = async (fn) => {
  const r = await coba(fn)
  return r.ok ? 'OK' : r.kode
}

const PEMICU = 'wa2a2_gagal_audit'
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

// ============================================================================ fixture (pola check-wa2a-approval-f4-db)
const ETA_LAMA = '2026-10-13'
const ETA_BARU = '2026-10-15'
const ETD_BARU = '2026-10-17'

async function dunia(nama) {
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
    manajerCtx: c('manajer', 'MANAJER_OPERASI'), // pencatat konfirmasi
    admin2Ctx: c('admin2', 'ADMIN'), // pemberi preview + peminta approval
    checkerCtx: c('checker', 'MANAJER_OPERASI'),
    stafCtx: c('staf', 'ADMIN'), // pemanggil pra-kirim (konteks staf, O-5)
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

async function siapPesan(w, { jenis = 'jadwal', jamLalu, sumber } = {}) {
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
  const pv = await MS.pratinjauPesanKlien(w.admin2Ctx, { messageId: d.messageId, snapshotFingerprint: d.snapshotFingerprint })
  if (pv.hasil !== 'DIPRATINJAU') throw new Error(`fixture preview gagal: ${JSON.stringify(pv)}`)
  return { ...src, cid, grantId, d, mid: d.messageId, hash: d.snapshotFingerprint }
}
async function siapPending(w, o = {}) {
  const p = await siapPesan(w, o)
  const r = await AP.mintaApprovalPesanKlien(w.admin2Ctx, { messageId: p.mid, snapshotFingerprint: p.hash })
  if (r.hasil !== 'APPROVAL_DIMINTA') throw new Error(`fixture minta gagal: ${JSON.stringify(r)}`)
  return { ...p, aid: r.approvalRequestId }
}
const setujui = (w, p, hash = p.hash) => AP.setujuiPesanKlien(w.checkerCtx, { approvalRequestId: p.aid, proposalHash: hash })
async function siapApproved(w, o = {}) {
  const p = await siapPending(w, o)
  const h = await setujui(w, p)
  if (h.hasil !== 'DISETUJUI') throw new Error(`fixture setujui gagal: ${JSON.stringify(h)}`)
  return p
}
const batal = (w, p) => AP.batalkanPesanKlien(w.adminCtx, { messageId: p.mid, alasan: 'Dibatalkan staf (uji).' })
const pesan = (id) => adm.waClientMessage.findFirst({ where: { id } })
const approval = (id) => adm.tahApprovalRequest.findFirst({ where: { id } })
const jumlahAudit = (w, peristiwa) => adm.auditLog.count({ where: { tenantId: w.t.id, newValue: { path: ['peristiwa'], equals: peristiwa } } })
const keadaan = async (p) => {
  const [m, a] = await Promise.all([pesan(p.mid), approval(p.aid)])
  return `${m.state}/${a.status}/${a.executionStatus}`
}
/** Jejak mutasi: version/state pesan & approval + jumlah audit tenant. Sama sebelum/sesudah = tanpa mutasi. */
const jejak = async (w, p) => {
  const [m, a, n] = await Promise.all([pesan(p.mid), p.aid ? approval(p.aid) : null, adm.auditLog.count({ where: { tenantId: w.t.id } })])
  return JSON.stringify([m.state, m.version, m.reasonCode, m.activeKey, a?.status, a?.executionStatus, a?.version, n])
}
const teks = (h) => (h?.hasil ? `${h.hasil}${h.alasan ? `/${h.alasan}` : ''}` : JSON.stringify(h))

/** Panggil A2 di transaksi tenant pemanggil (forTenant(ctx).$transaction), seperti pemanggil F-II kelak. */
async function praKirim(w, p, o = {}) {
  const ctx = o.ctx ?? w.stafCtx
  const m = await pesan(p.mid)
  const input = o.input ?? { messageId: p.mid, expectedVersion: o.versi ?? m?.version, expectedSnapshotFingerprint: o.sidik ?? m?.snapshotFingerprint }
  return forTenant(ctx).$transaction(async (tx) => {
    const h = await PK.revalidasiPraKirimDalamTx(ctx, tx, input)
    return o.dalam ? o.dalam(tx, h, ctx) : h
  }, { timeout: o.timeout ?? 5000 })
}

/** Invarian: tak ada approval aktif yang subjeknya tidak lagi menunggu/berlaku (dan sebaliknya). */
async function approvalLiar(w, kecuali) {
  const ms = await adm.waClientMessage.findMany({ where: { tenantId: w.t.id, approvalRequestId: { not: null } }, select: { id: true, state: true, approvalRequestId: true } })
  const as = await adm.tahApprovalRequest.findMany({ where: { id: { in: ms.map((m) => m.approvalRequestId) } } })
  const per = new Map(as.map((a) => [a.id, a]))
  return ms.filter((m) => {
    if (kecuali.has(m.id)) return false
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

// ============================================================================ uji
const manual = new Set() // pesan yang sengaja dibuat tak konsisten di DB (dikecualikan dari invarian)
let aman = false
try {
  // Penjaga DB sekali pakai: DB tidak boleh berisi tenant selain data uji bertanda (gagal tertutup, tanpa menulis).
  const tenantAsing = await adm.tenant.count({ where: { NOT: { companyName: { startsWith: TAG } } } })
  if (tenantAsing > 0) throw new Error(`DITOLAK: DB berisi ${tenantAsing} tenant non-uji — bukan DB sekali pakai (tidak ada yang ditulis)`)
  aman = true
  await bersihkan()
  const A = await dunia('A')
  const B = await dunia('B')
  const X = await dunia('X-tidak-allowlist')
  setAllowlist(A.t.id, B.t.id)

  // ============================================================================ G
  bagian('[G] Gerbang & masukan (O-5)')
  const g0 = await siapApproved(A)
  const j0 = await jejak(A, g0)
  process.env.WA2_CLIENT_FOUNDATION_ENABLED = 'false'
  cek('G-1 flag WA-2 mati → FORBIDDEN', (await kode(() => praKirim(A, g0))) === 'FORBIDDEN')
  process.env.WA2_CLIENT_FOUNDATION_ENABLED = 'true'
  process.env.NODE_ENV = 'production'
  cek('G-2 NODE_ENV=production → FORBIDDEN', (await kode(() => praKirim(A, g0))) === 'FORBIDDEN')
  process.env.NODE_ENV = 'test'
  cek('G-3 konteks sistem → FORBIDDEN (bukan staf)', (await kode(() => praKirim(A, g0, { ctx: { ...A.stafCtx, system: true } }))) === 'FORBIDDEN')
  cek('G-4 tenant di luar allowlist otomasi → NOT_FOUND', (await kode(() => praKirim(X, g0, { ctx: X.stafCtx }))) === 'NOT_FOUND')
  const salahMasuk = [
    ['messageId kosong', { messageId: '', expectedVersion: 1, expectedSnapshotFingerprint: g0.hash }],
    ['expectedVersion 0', { messageId: g0.mid, expectedVersion: 0, expectedSnapshotFingerprint: g0.hash }],
    ["expectedVersion '2' (string)", { messageId: g0.mid, expectedVersion: '2', expectedSnapshotFingerprint: g0.hash }],
    ['expectedVersion 1.5', { messageId: g0.mid, expectedVersion: 1.5, expectedSnapshotFingerprint: g0.hash }],
    ['sidik bukan 64-hex', { messageId: g0.mid, expectedVersion: 2, expectedSnapshotFingerprint: 'XYZ' }],
  ]
  const kodeMasuk = []
  for (const [, input] of salahMasuk) kodeMasuk.push(await kode(() => praKirim(A, g0, { input })))
  cek('G-5 masukan tidak sah (5 bentuk) → VALIDATION', kodeMasuk.every((k) => k === 'VALIDATION'), kodeMasuk.join(','))
  cek('G-6 pesan tidak ada → NOT_FOUND', (await kode(() => praKirim(A, g0, { input: { messageId: 'tidak-ada-x', expectedVersion: 1, expectedSnapshotFingerprint: g0.hash } }))) === 'NOT_FOUND')
  cek('G-7 semua penolakan gerbang/masukan TANPA mutasi', (await jejak(A, g0)) === j0)

  // ============================================================================ N
  bagian('[N] Normal — LAYAK tanpa mutasi')
  for (const [id, o] of [['N-1', {}], ['N-2', { jenis: 'ALL_FAST' }]]) {
    const p = id === 'N-1' ? g0 : await siapApproved(A, o)
    const sebelum = await jejak(A, p)
    const m = await pesan(p.mid)
    const a = await approval(p.aid)
    const t0 = Date.now()
    const h = await praKirim(A, p)
    const tk = h.token
    cek(
      `${id} ${o.jenis ?? 'jadwal (customer)'} APPROVED+NOT_STARTED → LAYAK; token = tenant/pesan/version/approval/version/jam`,
      h.hasil === 'LAYAK' && Object.isFrozen(tk) && tk.tenantId === A.t.id && tk.messageId === p.mid && tk.version === m.version && tk.approvalRequestId === p.aid && tk.approvalVersion === a.version && Date.parse(tk.dinilaiPada) >= t0 - 5,
      teks(h),
    )
    cek(`${id} LAYAK tidak menulis apa pun (pesan, approval, audit)`, (await jejak(A, p)) === sebelum)
  }
  const jUlang = await jejak(A, g0)
  const hUlang = await praKirim(A, g0)
  cek('N-3 pemeriksaan ulang tetap LAYAK (baca-saja, tanpa klaim)', hUlang.hasil === 'LAYAK' && (await jejak(A, g0)) === jUlang)

  // ============================================================================ D + P (drift; paritas F4)
  bagian('[D/P] Drift — klasifikasi A2 & paritas dengan setujui F4 (O-1, O-7)')
  // Setiap skenario: pasangan fixture identik — pa (PENDING, diputus F4 setujuiPesanKlien) & pb (APPROVED, dinilai A2) —
  // drift sama diterapkan ke keduanya. Wajib: A2 sesuai harapan, A2 = F4 (hasil/alasan/state pesan), approval A2 dihentikan.
  const sesuaiF4 = []
  const skenario = []
  const kasus = async (id, nama, o, ubah, harap, opsi = {}) => {
    skenario.push(id)
    try {
      const pa = await siapPending(A, o)
      const pb = await siapApproved(A, o)
      await ubah(pa)
      await ubah(pb)
      if (opsi.tunggu) await opsi.tunggu(pa, pb)
      const auditA2 = await jumlahAudit(A, 'WA2_PRAKIRIM_REVALIDASI_GAGAL')
      const hF4 = await coba(() => setujui(A, pa, opsi.hashF4 ?? pa.hash))
      const hA2 = await coba(() => praKirim(A, pb))
      const mA = await pesan(pa.mid)
      const mB = await pesan(pb.mid)
      const aB = await approval(pb.aid)
      const harapan = [harap].flat()
      const okA2 = hA2.ok && harapan.includes(teks(hA2.nilai))
      const stateHarap = hA2.ok && hA2.nilai.hasil === 'DIBLOKIR' ? 'BLOCKED' : 'NEEDS_REVIEW'
      const tertulis = mB.state === stateHarap && mB.reasonCode === hA2.nilai?.alasan && aB.status === 'APPROVED' && aB.executionStatus === 'CANCELLED' && (stateHarap !== 'BLOCKED' || (mB.activeKey === null && mB.finalizedAt instanceof Date)) && mB.successKey === null
      const auditOk = (await jumlahAudit(A, 'WA2_PRAKIRIM_REVALIDASI_GAGAL')) === auditA2 + 1
      const paritas = hF4.ok && hA2.ok && teks(hF4.nilai) === teks(hA2.nilai) && mA.state === mB.state
      if (paritas) sesuaiF4.push(id)
      cek(`${id} ${nama} → ${harapan.join('|')}; pesan ${stateHarap} + approval eksekusi CANCELLED + 1 audit`, okA2 && tertulis && auditOk, `A2 ${hA2.ok ? teks(hA2.nilai) : hA2.kode} ${mB.state}/${aB.status}/${aB.executionStatus}`)
      cek(`  ↳ ${id} paritas F4 (setujui atas drift sama)`, paritas, `F4 ${hF4.ok ? teks(hF4.nilai) : hF4.kode} ${mA.state} · A2 ${hA2.ok ? teks(hA2.nilai) : hA2.kode} ${mB.state}`)
    } catch (e) {
      cek(`${id} ${nama}`, false, `galat fixture/uji: ${String(e?.message ?? e).slice(0, 160)}`)
    }
  }
  const kontrol = async () => {
    const pa = await siapPending(A)
    const pb = await siapApproved(A)
    const hF4 = await setujui(A, pa)
    const hA2 = await praKirim(A, pb)
    cek('P-0 kontrol tanpa drift: F4 DISETUJUI & A2 LAYAK', hF4.hasil === 'DISETUJUI' && hA2.hasil === 'LAYAK', `${teks(hF4)} · ${teks(hA2)}`)
  }
  await kontrol()
  // R3/R5/X-2 kontak
  await kasus('K-1', 'masa verifikasi kontak habis', {}, (p) => adm.waContact.update({ where: { id: p.cid }, data: { verificationExpiresAt: new Date(Date.now() - 1000) } }), 'DITAHAN/CONTACT_INELIGIBLE')
  await kasus('K-2', 'kontak INACTIVE (langsung di DB, tanpa jalur hold)', {}, (p) => adm.waContact.update({ where: { id: p.cid }, data: { status: 'INACTIVE', activeE164Key: null } }), 'DITAHAN/CONTACT_INELIGIBLE')
  await kasus('K-3', 'verifikasi kontak dicabut (status UNVERIFIED di DB)', {}, (p) => adm.waContact.update({ where: { id: p.cid }, data: { verificationStatus: 'UNVERIFIED' } }), 'DITAHAN/CONTACT_INELIGIBLE')
  await kasus('K-4', 'bahasa kontak ≠ snapshot (X-2)', {}, (p) => adm.waContact.update({ where: { id: p.cid }, data: { language: 'EN' } }), 'DITAHAN/CONTACT_INELIGIBLE')
  // R4 consent
  await kasus('C-1', 'consent OPT_OUT (DB, tanpa jalur hold)', {}, (p) => adm.waConsentState.updateMany({ where: { contactId: p.cid }, data: { status: 'OPT_OUT', version: { increment: 1 } } }), 'DITAHAN/CONSENT_NOT_GRANTED')
  await kasus('C-2', 'versi consent berubah (OPT_IN tetap)', {}, (p) => adm.waConsentState.updateMany({ where: { contactId: p.cid }, data: { version: { increment: 1 } } }), 'DITAHAN/CONSENT_CHANGED')
  // R6/R7 grant & akses
  await kasus('GR-1', 'grant kedaluwarsa (validUntil lewat, status ACTIVE)', { jenis: 'EOSP' }, (p) => adm.waPrincipalAccessGrant.update({ where: { id: p.grantId }, data: { validUntil: new Date(Date.now() - 1000) } }), ['DITAHAN/ACCESS_DENIED', 'DITAHAN/GRANT_NOT_ELIGIBLE'])
  await kasus('GR-2', 'grant status EXPIRED (DB)', { jenis: 'EOSP' }, (p) => adm.waPrincipalAccessGrant.update({ where: { id: p.grantId }, data: { status: 'EXPIRED' } }), ['DITAHAN/ACCESS_DENIED', 'DITAHAN/GRANT_NOT_ELIGIBLE'])
  await kasus('GR-3', 'grant REVOKED (DB, tanpa jalur hold)', { jenis: 'EOSP' }, (p) => adm.waPrincipalAccessGrant.update({ where: { id: p.grantId }, data: { status: 'REVOKED', revokedAt: new Date(), revokedByUserId: 'u-uji', revokeReason: 'Dicabut (uji).' } }), ['DITAHAN/ACCESS_DENIED', 'DITAHAN/GRANT_NOT_ELIGIBLE'])
  await kasus('GR-4', 'principal voyage dipindah (akses berubah)', { jenis: 'EOSP' }, (p) => adm.voyage.update({ where: { id: p.v.id }, data: { principalId: A.P2.id } }), 'DITAHAN/ACCESS_DENIED')
  // R8/X-4/X-5 sumber & freshness
  await kasus('S-1', 'sumber berubah (ETA voyage diganti)', {}, (p) => adm.voyage.update({ where: { id: p.v.id }, data: { eta: new Date('2026-10-19T00:00:00Z') } }), ['DIBLOKIR/SOURCE_CHANGED', 'DIBLOKIR/SOURCE_INVALID'])
  await kasus('S-2', 'konfirmasi jadwal diinvalidasi (service)', {}, async (p) => KJ.invalidasiKonfirmasiJadwal(A.manajerCtx, (await adm.voyageScheduleConfirmation.findFirst({ where: { voyageId: p.v.id } })).id, { alasan: 'Keliru (uji).' }), 'DITAHAN/CONFIRMATION_INVALIDATED')
  await kasus('S-3', 'K7: konfirmasi BARU sesudah approval (bukti berubah)', {}, (p) => konfirmasi(A, p.v, A.adminCtx, { sourceNote: `Email agen terbaru ${++seq} (uji sintetis).` }), 'DITAHAN/EVIDENCE_CHANGED')
  await kasus('S-4', 'milestone GANDA dicatat lewat service operasional', { jenis: 'ALL_FAST' }, (p) => VE.createVoyageEvent(A.adminCtx, p.v.id, { eventCode: 'ALL_FAST', occurredAt: new Date(Date.now() - JAM).toISOString() }), 'DIBLOKIR/EVENT_DUPLICATE')
  await kasus('S-5', 'milestone sumber dihapus lewat service operasional', { jenis: 'SAILED' }, (p) => VE.removeVoyageEvent(A.adminCtx, p.v.id, p.e.id), 'DIBLOKIR/SOURCE_INVALID')
  await kasus('S-6', 'kandidat WA-1 BLOCKED (DB)', {}, async (p) => adm.communicationCandidate.update({ where: { id: (await pesan(p.mid)).candidateId }, data: { state: 'BLOCKED', blockReason: 'UJI', blockedAt: new Date(), version: { increment: 1 } } }), 'DIBLOKIR/CANDIDATE_BLOCKED')
  // Resolver akses (R7) menolak voyage non-NYATA LEBIH DULU, sehingga cabang X-5 (syaratDataApproval) tidak tercapai lewat
  // DB — sama dengan F4 (paritas). X-5 tetap dipertahankan sebagai pertahanan berlapis; dicatat sebagai celah bukti.
  await kasus('S-7', 'asal data voyage bukan NYATA (ditolak resolver akses sebelum X-5)', {}, (p) => adm.voyage.update({ where: { id: p.v.id }, data: { dataOrigin: 'DEMO' } }), 'DITAHAN/ACCESS_DENIED')
  // X-1/X-3 snapshot & proposal
  await kasus('X-1a', 'activeKey pesan ≠ logicalMessageKey (DB)', {}, async (p) => adm.waClientMessage.update({ where: { id: p.mid }, data: { activeKey: `${(await pesan(p.mid)).logicalMessageKey}-x` } }), 'DIBLOKIR/SNAPSHOT_MISMATCH')
  await kasus('X-1b', 'isi pesan dirusak di DB (pemicu snapshot dilewati: SIMULASI korupsi, session_replication_role=replica)', {}, (p) =>
    adm.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica')
      await tx.$executeRawUnsafe('UPDATE "WaClientMessage" SET "body" = "body" || \' [disunting]\' WHERE "id" = $1', p.mid)
    }), 'DIBLOKIR/SNAPSHOT_MISMATCH')
  await kasus('X-3a', 'proposalHash approval disunting di DB', {}, (p) => adm.tahApprovalRequest.update({ where: { id: p.aid }, data: { proposalHash: 'c'.repeat(64) } }), 'DIBLOKIR/SNAPSHOT_MISMATCH', { hashF4: 'c'.repeat(64) })
  await kasus('X-3b', 'basisFingerprint approval disunting di DB', {}, (p) => adm.tahApprovalRequest.update({ where: { id: p.aid }, data: { basisFingerprint: 'e'.repeat(64) } }), 'DIBLOKIR/SNAPSHOT_MISMATCH')
  // Freshness berbasis waktu (batas terlewati antara approval & pra-kirim). confirmedAt/occurredAt tak dapat diubah (pemicu),
  // jadi fixture dibuat dekat batas lalu uji menunggu sampai batas terlewati.
  const LONGGAR = 25_000
  bagian('[F] Freshness pada saat pra-kirim (batas waktu terlewati sesudah approval)')
  {
    const pasangan = []
    const batasKonf = []
    for (let i = 0; i < 2; i++) {
      const src = await jadwal(A, { auditPada: new Date(Date.now() - 13 * JAM) })
      const konf = new Date(Date.now() - 12 * JAM + LONGGAR)
      await adm.voyageScheduleConfirmation.create({ data: { tenantId: A.t.id, voyageId: src.v.id, field: 'eta', confirmedValue: new Date(`${ETA_BARU}T00:00:00Z`), confirmedAt: konf, confirmedByUserId: A.manajerCtx.userId, sourceKind: 'MASTER_OR_SHIP', sourceNote: 'Dekat batas 12 jam (uji sintetis).' } })
      batasKonf.push(konf.getTime() + 12 * JAM)
      pasangan.push(i === 0 ? await siapPending(A, { sumber: src }) : await siapApproved(A, { sumber: src }))
    }
    const pml = [await siapPending(A, { jenis: 'EOSP', jamLalu: 24 - LONGGAR / JAM }), await siapApproved(A, { jenis: 'EOSP', jamLalu: 24 - LONGGAR / JAM })]
    const batas = Math.max(...batasKonf, ...pml.map((p) => p.e.occurredAt.getTime() + 24 * JAM))
    const segar = Date.now() < Math.min(...batasKonf, ...pml.map((p) => p.e.occurredAt.getTime() + 24 * JAM))
    if (batas - Date.now() > -500) await tidur(batas - Date.now() + 500)
    skenario.push('F-1', 'F-2')
    for (const [id, nama, [pa, pb], harap] of [['F-1', 'konfirmasi melewati 12 jam sesudah approval', pasangan, 'DITAHAN/CONFIRMATION_EXPIRED'], ['F-2', 'milestone melewati 24 jam sesudah approval', pml, 'DITAHAN/EVENT_TOO_OLD']]) {
      const hF4 = await coba(() => setujui(A, pa))
      const hA2 = await coba(() => praKirim(A, pb))
      const k = await keadaan(pb)
      cek(`${id} ${nama} → ${harap}; NEEDS_REVIEW/APPROVED/CANCELLED (fixture segar saat disetujui: ${segar})`, segar && hA2.ok && teks(hA2.nilai) === harap && k === 'NEEDS_REVIEW/APPROVED/CANCELLED', `${hA2.ok ? teks(hA2.nilai) : hA2.kode} ${k}`)
      const par = hF4.ok && hA2.ok && teks(hF4.nilai) === teks(hA2.nilai)
      if (par) sesuaiF4.push(id)
      cek(`  ↳ ${id} paritas F4`, par, `F4 ${hF4.ok ? teks(hF4.nilai) : hF4.kode}`)
    }
  }

  // ============================================================================ V
  bagian('[V] Status pesan/approval (O-6) & TTL (O-4)')
  {
    const p = await siapPending(A)
    const s = await jejak(A, p)
    const h = await praKirim(A, p)
    cek('V-1 pesan PENDING_APPROVAL → KONFLIK MESSAGE_NOT_APPROVED, tanpa mutasi', teks(h) === 'KONFLIK/MESSAGE_NOT_APPROVED' && (await jejak(A, p)) === s, teks(h))
  }
  for (const [id, exec] of [['V-2', 'FAILED'], ['V-3', 'RUNNING'], ['V-4', 'SUCCEEDED']]) {
    const p = await siapApproved(A)
    await adm.tahApprovalRequest.update({ where: { id: p.aid }, data: { executionStatus: exec } })
    manual.add(p.mid)
    const s = await jejak(A, p)
    const h = await praKirim(A, p)
    cek(`${id} approval APPROVED+${exec} → KONFLIK APPROVAL_NOT_ELIGIBLE, tanpa mutasi (${exec === 'FAILED' ? 'retry ditunda ke F-II' : 'bukan NOT_STARTED'})`, teks(h) === 'KONFLIK/APPROVAL_NOT_ELIGIBLE' && (await jejak(A, p)) === s && (await approval(p.aid)).executionStatus === exec, teks(h))
  }
  {
    const p = await siapApproved(A)
    await adm.tahApprovalRequest.update({ where: { id: p.aid }, data: { status: 'CANCELLED' } })
    manual.add(p.mid)
    const s = await jejak(A, p)
    const h = await praKirim(A, p)
    cek('V-5 approval status CANCELLED, pesan masih APPROVED → KONFLIK APPROVAL_NOT_ELIGIBLE, tanpa mutasi', teks(h) === 'KONFLIK/APPROVAL_NOT_ELIGIBLE' && (await jejak(A, p)) === s, teks(h))
  }
  {
    const p = await siapApproved(A)
    await batal(A, p)
    const s = await jejak(A, p)
    const h = await praKirim(A, p)
    cek('V-6 pesan dibatalkan staf (CANCELED) → KONFLIK MESSAGE_NOT_APPROVED, tanpa mutasi', teks(h) === 'KONFLIK/MESSAGE_NOT_APPROVED' && (await jejak(A, p)) === s, teks(h))
  }
  for (const [id, nama, aksi] of [
    ['V-7', 'opt-out lewat service (jalur hold K3 lebih dulu)', (p) => CS.catatOptOut(A.adminCtx, p.cid, { kanal: 'WHATSAPP', bukti: 'STOP (uji sintetis).' })],
    ['V-8', 'cabut grant lewat service', (p) => GS.cabutGrant(A.adminCtx, p.grantId, { alasan: 'Hubungan berakhir (uji).' })],
    ['V-9', 'nonaktifkan kontak lewat service', (p) => KT.nonaktifkanKontak(A.adminCtx, p.cid, { alasan: 'Kontak tidak aktif (uji).' })],
  ]) {
    const p = await siapApproved(A, id === 'V-8' ? { jenis: 'EOSP' } : {})
    await aksi(p)
    const s = await jejak(A, p)
    const h = await praKirim(A, p)
    cek(`${id} ${nama} → pesan sudah NEEDS_REVIEW; A2 KONFLIK MESSAGE_NOT_APPROVED, tanpa mutasi tambahan`, teks(h) === 'KONFLIK/MESSAGE_NOT_APPROVED' && (await keadaan(p)) === 'NEEDS_REVIEW/APPROVED/CANCELLED' && (await jejak(A, p)) === s, teks(h))
  }
  {
    const p = await siapApproved(A)
    await adm.tahApprovalRequest.update({ where: { id: p.aid }, data: { expiresAt: new Date(Date.now() - 60_000) } })
    const h = await praKirim(A, p)
    cek('V-10 O-4/T-2: expiresAt approval lewat pada APPROVED → TIDAK ada TTL APPROVED di A2 (LAYAK); keputusan TTL wajib sebelum F-II', h.hasil === 'LAYAK', teks(h))
  }

  // ============================================================================ I / T
  bagian('[I] Input basi (O-3) · [T] Tenant & relasi approval (koreksi 2)')
  {
    const p = await siapApproved(A)
    const m = await pesan(p.mid)
    const s = await jejak(A, p)
    const h1 = await praKirim(A, p, { versi: m.version + 1 })
    const h2 = await praKirim(A, p, { versi: m.version - 1 })
    const h3 = await praKirim(A, p, { sidik: 'd'.repeat(64) })
    cek('I-1 expectedVersion basi (±1) → KONFLIK INPUT_STALE, tanpa mutasi', teks(h1) === 'KONFLIK/INPUT_STALE' && teks(h2) === 'KONFLIK/INPUT_STALE' && (await jejak(A, p)) === s, `${teks(h1)} ${teks(h2)}`)
    cek('I-2 sidik snapshot basi (hex sah, beda) → KONFLIK INPUT_STALE, tanpa mutasi', teks(h3) === 'KONFLIK/INPUT_STALE' && (await jejak(A, p)) === s, teks(h3))
  }
  const pB = await siapApproved(B)
  const jB = await jejak(B, pB)
  {
    const p = await siapApproved(A)
    const s = await jejak(A, p)
    cek('T-1 pesan tenant A dari konteks tenant B → NOT_FOUND (tanpa bocor), A & B tanpa mutasi', (await kode(() => praKirim(B, p, { ctx: B.stafCtx }))) === 'NOT_FOUND' && (await jejak(A, p)) === s && (await jejak(B, pB)) === jB)
  }
  const relasi = async (id, nama, ubah, harap, saksi = []) => {
    const p = await siapApproved(A)
    const u = await coba(() => ubah(p))
    if (!u.ok) {
      cek(`${id} ${nama}`, false, `penyiapan ditolak DB: ${u.pesan}`)
      return
    }
    manual.add(p.mid)
    const s = await jejak(A, p)
    const ss = await Promise.all(saksi.map((x) => x.jejak()))
    const r = await coba(() => praKirim(A, p))
    const tetap = (await jejak(A, p)) === s && (await Promise.all(saksi.map((x) => x.jejak()))).every((x, i) => x === ss[i])
    cek(`${id} ${nama} → FORBIDDEN ${harap}, TANPA mutasi${saksi.length ? ' (termasuk approval/pesan yang ditunjuk)' : ''}`, !r.ok && r.kode === harap && tetap, r.ok ? teks(r.nilai) : `${r.kode}`)
  }
  await relasi('T-2', 'approvalRequestId pesan dikosongkan (DB)', (p) => adm.waClientMessage.update({ where: { id: p.mid }, data: { approvalRequestId: null } }), 'APPROVAL_RELATION_INVALID')
  const lain = await siapApproved(A)
  await relasi('T-3', 'pesan menunjuk approval MILIK pesan lain (tenant sama)', (p) => adm.waClientMessage.update({ where: { id: p.mid }, data: { approvalRequestId: lain.aid } }), 'APPROVAL_RELATION_INVALID', [{ jejak: () => jejak(A, lain) }])
  await relasi('T-4', 'approval: subjectId disunting ke pesan lain', (p) => adm.tahApprovalRequest.update({ where: { id: p.aid }, data: { subjectId: lain.mid } }), 'APPROVAL_RELATION_INVALID', [{ jejak: () => jejak(A, lain) }])
  await relasi('T-5', 'pesan menunjuk approval TENANT LAIN (B)', (p) => adm.waClientMessage.update({ where: { id: p.mid }, data: { approvalRequestId: pB.aid } }), 'APPROVAL_RELATION_INVALID', [{ jejak: () => jejak(B, pB) }])
  await relasi('T-6', 'approval menunjuk id yang tidak ada', (p) => adm.waClientMessage.update({ where: { id: p.mid }, data: { approvalRequestId: 'tidak-ada-approval' } }), 'APPROVAL_RELATION_INVALID')
  await relasi('T-7', 'kind approval disunting (bukan CLIENT_WA_UPDATE)', (p) => adm.tahApprovalRequest.update({ where: { id: p.aid }, data: { kind: 'WA_INTERNAL_FAKE_TEST' } }), 'APPROVAL_POLICY_MISMATCH')
  await relasi('T-8', 'subjectType approval disunting', (p) => adm.tahApprovalRequest.update({ where: { id: p.aid }, data: { subjectType: 'CommunicationMessage' } }), 'APPROVAL_RELATION_INVALID')

  // ============================================================================ TK
  bagian('[TK] Token LAYAK — hanya sah di transaksi & tenant yang sama (koreksi 3)')
  {
    const p = await siapApproved(A)
    let tok
    const dalamSama = await praKirim(A, p, {
      dalam: async (tx, h, ctx) => {
        tok = h.token
        const sah = await PK.periksaTokenPraKirim(ctx, tx, h.token)
        const salinan = await PK.periksaTokenPraKirim(ctx, tx, { ...h.token })
        const palsuV = await PK.periksaTokenPraKirim(ctx, tx, { ...h.token, version: h.token.version + 1 })
        const palsuA = await PK.periksaTokenPraKirim(ctx, tx, { ...h.token, approvalVersion: h.token.approvalVersion + 1 })
        const palsuJ = await PK.periksaTokenPraKirim(ctx, tx, { ...h.token, dinilaiPada: new Date(0).toISOString() })
        const tenantLain = await PK.periksaTokenPraKirim(B.stafCtx, tx, h.token)
        const tenantDipalsu = await PK.periksaTokenPraKirim(B.stafCtx, tx, { ...h.token, tenantId: B.t.id })
        const sistem = await kode(() => PK.periksaTokenPraKirim({ ...ctx, system: true }, tx, h.token))
        return { sah, salinan, palsuV, palsuA, palsuJ, tenantLain, tenantDipalsu, sistem }
      },
    })
    cek('TK-1 token sah di tx yang sama → true', dalamSama.sah === true)
    cek('TK-2 salinan bernilai sama di tx yang sama → true (registri berbasis nilai kanonik, bukan identitas objek)', dalamSama.salinan === true)
    cek('TK-3 token dipalsu (version / approvalVersion / dinilaiPada) → false', dalamSama.palsuV === false && dalamSama.palsuA === false && dalamSama.palsuJ === false)
    cek('TK-4 konteks tenant lain di tx yang sama → false (token asli maupun tenantId dipalsu)', dalamSama.tenantLain === false && dalamSama.tenantDipalsu === false)
    cek('TK-5 konteks sistem → FORBIDDEN (gerbang yang sama dengan revalidasi)', dalamSama.sistem === 'FORBIDDEN')
    const txLain = await forTenant(A.stafCtx).$transaction((tx) => PK.periksaTokenPraKirim(A.stafCtx, tx, tok))
    const txB = await forTenant(B.stafCtx).$transaction((tx) => PK.periksaTokenPraKirim(B.stafCtx, tx, tok))
    cek('TK-6 token dari tx yang sudah commit dipakai di tx LAIN (tenant sama) → false', txLain === false)
    cek('TK-7 token dipakai di tx tenant B → false', txB === false)
    let dalamUbah
    const r = await coba(() =>
      praKirim(A, p, {
        dalam: async (tx, h, ctx) => {
          await tx.waClientMessage.updateMany({ where: { id: p.mid }, data: { version: { increment: 1 } } })
          dalamUbah = await PK.periksaTokenPraKirim(ctx, tx, h.token)
          throw new Error('ROLLBACK_UJI')
        },
      }),
    )
    cek('TK-8 baris pesan berubah di tx yang sama sesudah LAYAK → token false (baca ulang version)', dalamUbah === false && !r.ok && r.pesan.includes('ROLLBACK_UJI'))
    cek('  ↳ TK-8 perubahan uji di-rollback (pesan tetap APPROVED, version semula)', (await praKirim(A, p)).hasil === 'LAYAK')
  }

  // ============================================================================ CM
  bagian('[CM] Commit / rollback penahanan (hold = nilai; gagal aman)')
  const siapDrift = async () => {
    const p = await siapApproved(A)
    await adm.waContact.update({ where: { id: p.cid }, data: { verificationExpiresAt: new Date(Date.now() - 1000) } })
    return p
  }
  {
    const p = await siapDrift()
    const a0 = await jumlahAudit(A, 'WA2_PRAKIRIM_REVALIDASI_GAGAL')
    const d0 = await jumlahAudit(A, 'WA2_APPROVAL_DIHENTIKAN')
    let dalam
    const r = await coba(() =>
      praKirim(A, p, {
        dalam: async (tx, h) => {
          dalam = h
          throw new Error('ROLLBACK_PEMANGGIL')
        },
      }),
    )
    cek('CM-1 pemanggil melempar sesudah DITAHAN → hold ikut rollback (APPROVED/APPROVED/NOT_STARTED, 0 audit baru)', teks(dalam) === 'DITAHAN/CONTACT_INELIGIBLE' && !r.ok && (await keadaan(p)) === 'APPROVED/APPROVED/NOT_STARTED' && (await jumlahAudit(A, 'WA2_PRAKIRIM_REVALIDASI_GAGAL')) === a0 && (await jumlahAudit(A, 'WA2_APPROVAL_DIHENTIKAN')) === d0, `${teks(dalam)} ${await keadaan(p)}`)
    const h = await praKirim(A, p)
    cek('CM-2 commit normal → hold tersimpan (NEEDS_REVIEW/APPROVED/CANCELLED) + audit WA2_PRAKIRIM_REVALIDASI_GAGAL & WA2_APPROVAL_DIHENTIKAN', teks(h) === 'DITAHAN/CONTACT_INELIGIBLE' && (await keadaan(p)) === 'NEEDS_REVIEW/APPROVED/CANCELLED' && (await jumlahAudit(A, 'WA2_PRAKIRIM_REVALIDASI_GAGAL')) === a0 + 1 && (await jumlahAudit(A, 'WA2_APPROVAL_DIHENTIKAN')) === d0 + 1)
  }
  for (const [id, peristiwa] of [['CM-3', 'WA2_PRAKIRIM_REVALIDASI_GAGAL'], ['CM-4', 'WA2_APPROVAL_DIHENTIKAN']]) {
    const p = await siapDrift()
    const s = await jejak(A, p)
    await pasangGagalAudit(peristiwa)
    const r = await coba(() => praKirim(A, p))
    await lepasGagalAudit()
    cek(`${id} audit ${peristiwa} gagal → seluruh hold rollback, tanpa efek parsial`, !r.ok && (await jejak(A, p)) === s && (await keadaan(p)) === 'APPROVED/APPROVED/NOT_STARTED', r.ok ? teks(r.nilai) : r.pesan.slice(0, 60))
    cek(`  ↳ ${id} sesudah pemicu dilepas, penahanan yang sama berhasil`, teks(await praKirim(A, p)) === 'DITAHAN/CONTACT_INELIGIBLE')
  }

  // ============================================================================ R
  bagian('[R] Konkurensi nyata (kunci DB, bukan token)')
  // R-1..R-4: A2 LAYAK lalu pemanggil MENAHAN transaksinya; mutasi pesaing lewat service harus MENUNGGU kunci A2 sampai
  // commit, lalu menang (tidak pernah ada perubahan kontak/consent/grant/batal yang lolos di tengah transaksi LAYAK).
  const TAHAN = 1200
  const tungguPesaing = async (id, nama, o, aksi, harapAkhir) => {
    const p = await siapApproved(A, o)
    let selesai = false
    let galat = null
    let jalan
    const h = await praKirim(A, p, {
      dalam: async (tx, h) => {
        if (h.hasil !== 'LAYAK') return h
        jalan = aksi(p).then(() => { selesai = true }, (e) => { galat = String(e?.details?.code ?? e?.message ?? e); selesai = true })
        await tidur(TAHAN)
        return { ...h, menunggu: !selesai, tokenMasihSah: await PK.periksaTokenPraKirim(A.stafCtx, tx, h.token) }
      },
    })
    await jalan
    const k = await keadaan(p)
    cek(`${id} LAYAK ∥ ${nama}: pesaing MENUNGGU kunci A2 (${TAHAN} ms), token tetap sah sampai commit, lalu pesaing berhasil → ${harapAkhir}`, h.hasil === 'LAYAK' && h.menunggu === true && h.tokenMasihSah === true && galat === null && k === harapAkhir, `menunggu=${h.menunggu} token=${h.tokenMasihSah} galat=${galat} keadaan=${k}`)
  }
  await tungguPesaing('R-1', 'opt-out consent', {}, (p) => CS.catatOptOut(A.adminCtx, p.cid, { kanal: 'WHATSAPP', bukti: 'STOP (uji sintetis).' }), 'NEEDS_REVIEW/APPROVED/CANCELLED')
  await tungguPesaing('R-2', 'nonaktifkan kontak', {}, (p) => KT.nonaktifkanKontak(A.adminCtx, p.cid, { alasan: 'Kontak tidak aktif (uji).' }), 'NEEDS_REVIEW/APPROVED/CANCELLED')
  await tungguPesaing('R-3', 'cabut grant', { jenis: 'EOSP' }, (p) => GS.cabutGrant(A.adminCtx, p.grantId, { alasan: 'Dicabut bersamaan (uji).' }), 'NEEDS_REVIEW/APPROVED/CANCELLED')
  await tungguPesaing('R-4', 'batal pesan', {}, (p) => batal(A, p), 'CANCELED/APPROVED/CANCELLED')

  // R-5..R-6: jam akhir SESUDAH kunci — transaksi lain memegang kunci; batas waktu terlewati selama A2 menunggu.
  const SISA = 1000
  const tahanLalu = async (sql, id, p) => {
    let hasil
    const mulai = Date.now()
    const r = await adm.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(sql, id)
      const jalan = praKirim(A, p).then((h) => { hasil = h }, (e) => { hasil = { galat: String(e?.details?.code ?? e?.message ?? e).slice(0, 80) } })
      await tidur(2500)
      return { jalan, menunggu: hasil === undefined }
    }, { timeout: 30_000 })
    await r.jalan
    return { hasil, menunggu: r.menunggu, mulai }
  }
  for (const [id, nama, o, pasang] of [
    ['R-5', 'verifikasi kontak kedaluwarsa selama A2 menunggu kunci kontak', {}, (p, exp) => adm.waContact.update({ where: { id: p.cid }, data: { verificationExpiresAt: exp } })],
    ['R-6', 'grant snapshot kedaluwarsa selama A2 menunggu kunci kontak', { jenis: 'EOSP' }, (p, exp) => adm.waPrincipalAccessGrant.update({ where: { id: p.grantId }, data: { validUntil: exp } })],
  ]) {
    const p = await siapApproved(A, o)
    const exp = new Date(Date.now() + SISA)
    await pasang(p, exp)
    const t = await tahanLalu('SELECT "id" FROM "WaContact" WHERE "id" = $1 FOR UPDATE', p.cid, p)
    const sah = t.menunggu && t.mulai < exp.getTime() - 200
    cek(`${id} ${nama} → DITAHAN (jam keputusan diambil sesudah kunci)`, sah && t.hasil?.hasil === 'DITAHAN' && (await keadaan(p)) === 'NEEDS_REVIEW/APPROVED/CANCELLED', `menunggu=${t.menunggu} segarAwal=${t.mulai < exp.getTime() - 200} hasil=${teks(t.hasil)}`)
  }
  {
    const p = await siapApproved(A)
    const t = await tahanLalu('SELECT "id" FROM "WaContact" WHERE "id" = $1 FOR UPDATE', p.cid, p)
    cek('R-7 kontrol: menunggu kunci tanpa batas terlewati → tetap LAYAK', t.menunggu && t.hasil?.hasil === 'LAYAK', teks(t.hasil))
  }
  // R-8/R-9: baris approval / pesan diubah transaksi lain selama A2 menunggu kunci → KONFLIK CONCURRENT_CHANGE tanpa mutasi A2.
  for (const [id, nama, kunci, ubah, harapAkhir] of [
    ['R-8', 'approval dihentikan transaksi lain selama A2 menunggu kunci approval', 'SELECT "id" FROM "TahApprovalRequest" WHERE "id" = $1 FOR UPDATE', (tx, p) => tx.tahApprovalRequest.update({ where: { id: p.aid }, data: { executionStatus: 'CANCELLED', version: { increment: 1 } } }), 'APPROVED/APPROVED/CANCELLED'],
    ['R-9', 'pesan ditahan transaksi lain selama A2 menunggu kunci pesan', 'SELECT "id" FROM "WaClientMessage" WHERE "id" = $1 FOR UPDATE', (tx, p) => tx.waClientMessage.update({ where: { id: p.mid }, data: { state: 'NEEDS_REVIEW', reasonCode: 'UJI', version: { increment: 1 } } }), 'NEEDS_REVIEW/APPROVED/NOT_STARTED'],
  ]) {
    const p = await siapApproved(A)
    manual.add(p.mid)
    const a0 = await jumlahAudit(A, 'WA2_PRAKIRIM_REVALIDASI_GAGAL')
    let hasil
    const r = await adm.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(kunci, id === 'R-8' ? p.aid : p.mid)
      const jalan = praKirim(A, p).then((h) => { hasil = h }, (e) => { hasil = { galat: String(e?.details?.code ?? e?.message ?? e).slice(0, 80) } })
      await tidur(1500)
      const menunggu = hasil === undefined
      await ubah(tx, p)
      return { jalan, menunggu }
    }, { timeout: 30_000 })
    await r.jalan
    cek(`${id} ${nama} → KONFLIK CONCURRENT_CHANGE, A2 tanpa mutasi`, r.menunggu && teks(hasil) === 'KONFLIK/CONCURRENT_CHANGE' && (await keadaan(p)) === harapAkhir && (await jumlahAudit(A, 'WA2_PRAKIRIM_REVALIDASI_GAGAL')) === a0, `menunggu=${r.menunggu} hasil=${teks(hasil)} keadaan=${await keadaan(p)}`)
  }
  // R-10..R-14: balapan bebas dengan jeda bertingkat (kedua urutan wajib muncul). Galat apa pun (termasuk deadlock) = anomali.
  const JEDA = [0, 0, 15, 30, 60, 100, 150, 250, 400, 600]
  const balap = async (id, nama, o, aksi, akhirSah, hasilSah) => {
    let anomali = 0
    const rinci = []
    const sebaran = {}
    for (let i = 0; i < JEDA.length; i++) {
      const p = await siapApproved(A, o)
      const [h1, h2] = await Promise.all([tidur(i % 2 ? JEDA[i] : 0).then(() => coba(() => praKirim(A, p))), tidur(i % 2 ? 0 : JEDA[i]).then(() => coba(() => aksi(p)))])
      const k = await keadaan(p)
      const label = h1.ok ? teks(h1.nilai) : `GALAT:${h1.kode}`
      sebaran[label] = (sebaran[label] ?? 0) + 1
      if (!(h1.ok && h2.ok && akhirSah.includes(k) && hasilSah.includes(teks(h1.nilai)))) {
        anomali++
        rinci.push(`${k} A2=${label} pesaing=${h2.ok ? 'ok' : h2.kode}`)
      }
    }
    cek(`${id} A2 ∥ ${nama} (${JEDA.length}×): tanpa galat/deadlock, keadaan akhir konsisten`, anomali === 0, rinci.slice(0, 3).join(' | ') || `sebaran ${JSON.stringify(sebaran)}`)
    cek(`  ↳ ${id} kedua urutan benar-benar terjadi (≥ 2 hasil A2 berbeda)`, Object.keys(sebaran).length >= 2, JSON.stringify(sebaran))
  }
  const HASIL_BALAP = ['LAYAK', 'KONFLIK/MESSAGE_NOT_APPROVED', 'KONFLIK/CONCURRENT_CHANGE']
  await balap('R-10', 'opt-out', {}, (p) => CS.catatOptOut(A.adminCtx, p.cid, { kanal: 'WHATSAPP', bukti: 'STOP (uji).' }), ['NEEDS_REVIEW/APPROVED/CANCELLED'], [...HASIL_BALAP, 'DITAHAN/CONSENT_NOT_GRANTED', 'DITAHAN/CONSENT_CHANGED'])
  await balap('R-11', 'nonaktifkan kontak', {}, (p) => KT.nonaktifkanKontak(A.adminCtx, p.cid, { alasan: 'Tidak aktif (uji).' }), ['NEEDS_REVIEW/APPROVED/CANCELLED'], [...HASIL_BALAP, 'DITAHAN/CONTACT_INELIGIBLE'])
  await balap('R-12', 'cabut grant', { jenis: 'EOSP' }, (p) => GS.cabutGrant(A.adminCtx, p.grantId, { alasan: 'Dicabut (uji).' }), ['NEEDS_REVIEW/APPROVED/CANCELLED'], [...HASIL_BALAP, 'DITAHAN/ACCESS_DENIED', 'DITAHAN/GRANT_NOT_ELIGIBLE'])
  await balap('R-13', 'batal pesan', {}, (p) => batal(A, p), ['CANCELED/APPROVED/CANCELLED'], HASIL_BALAP)
  {
    let anomali = 0
    for (let i = 0; i < 6; i++) {
      const p = await siapApproved(A)
      const s = await jejak(A, p)
      const hs = await Promise.all([coba(() => praKirim(A, p)), coba(() => praKirim(A, p, { ctx: A.adminCtx })), coba(() => praKirim(A, p))])
      if (!hs.every((h) => h.ok && h.nilai.hasil === 'LAYAK') || (await jejak(A, p)) !== s) anomali++
    }
    cek('R-14 tiga A2 bersamaan atas pesan yang sama (6×) → semua LAYAK, tanpa mutasi, tanpa galat (LAYAK ≠ klaim; klaim tunggal = P-3)', anomali === 0, `anomali ${anomali}`)
  }

  // ============================================================================ A / E / Z
  bagian('[A] Audit · [E] Efek terlarang · [Z] Invarian & isolasi')
  const auditA2 = await adm.auditLog.findMany({ where: { tenantId: A.t.id, newValue: { path: ['peristiwa'], equals: 'WA2_PRAKIRIM_REVALIDASI_GAGAL' } } })
  const auditHenti = await adm.auditLog.findMany({ where: { tenantId: A.t.id, newValue: { path: ['peristiwa'], equals: 'WA2_APPROVAL_DIHENTIKAN' } } })
  const nomor = (await adm.waContact.findMany({ where: { tenantId: A.t.id }, select: { e164: true } })).map((k) => k.e164)
  const teksAudit = JSON.stringify([...auditA2, ...auditHenti])
  cek('A-1 audit pra-kirim & penghentian tanpa nomor utuh (dibandingkan dengan semua e164 kontak tenant)', auditA2.length >= 20 && nomor.length > 0 && nomor.every((n) => !teksAudit.includes(n) && !teksAudit.includes(n.slice(1))), `audit pra-kirim ${auditA2.length}; nomor dicek ${nomor.length}`)
  cek('A-2 setiap audit pra-kirim memuat state, alasan, approvalRequestId, dinilaiPada (ISO) dan tabel WaClientMessage', auditA2.every((x) => x.tableName === 'WaClientMessage' && ['NEEDS_REVIEW', 'BLOCKED'].includes(x.newValue.state) && typeof x.newValue.alasan === 'string' && typeof x.newValue.approvalRequestId === 'string' && !Number.isNaN(Date.parse(x.newValue.dinilaiPada)) && x.oldValue?.state === 'APPROVED'))
  cek('A-3 pelaku audit = konteks staf pemanggil (bukan sistem)', auditA2.length > 0 && auditA2.every((x) => [A.stafCtx.userId, A.adminCtx.userId].includes(x.userId)))
  const tenantUji = [A.t.id, B.t.id]
  cek('E-1 tidak ada successKey pada pesan WA-2 tenant uji', (await adm.waClientMessage.count({ where: { tenantId: { in: tenantUji }, successKey: { not: null } } })) === 0)
  const jalanKirim = await adm.tahApprovalRequest.findMany({ where: { tenantId: { in: tenantUji }, kind: 'CLIENT_WA_UPDATE', executionStatus: { in: ['RUNNING', 'SUCCEEDED', 'SUCCEEDED_WITH_WARNINGS'] } }, select: { subjectId: true } })
  cek('E-2 tidak ada approval CLIENT_WA_UPDATE RUNNING/SUCCEEDED selain baris yang SENGAJA disunting uji (V-3/V-4)', jalanKirim.every((x) => manual.has(x.subjectId)) && jalanKirim.length === 2, `${jalanKirim.length} baris disunting uji`)
  cek('E-3 tidak ada pesan WA-2 di status kirim', (await adm.waClientMessage.count({ where: { tenantId: { in: tenantUji }, state: { notIn: ['DRAFT', 'PREVIEWED', 'PENDING_APPROVAL', 'APPROVED', 'NEEDS_REVIEW', 'BLOCKED', 'CANCELED', 'REJECTED', 'EXPIRED'] } } })) === 0)
  cek('E-4 jebakan egress JS (fetch/http/https/net/tls/dns): 0 panggilan — koneksi PostgreSQL loopback (native Prisma) diizinkan & tidak dihitung', egress.length === 0, egress.join(',') || 'nihil')
  const liar = await approvalLiar(A, manual)
  cek('Z-1 invarian approval aktif ↔ pesan berlaku (kecuali baris yang sengaja dirusak uji)', liar.length === 0, liar.slice(0, 3).map((m) => `${m.id}:${m.state}`).join(', '))
  cek('Z-2 tenant B: pesan & approval fixture tidak tersentuh A2 (jejak sama)', (await jejak(B, pB)) === jB)
  cek('Z-3 paritas F4 tercatat pada SEMUA skenario drift', skenario.length === 23 && JSON.stringify([...sesuaiF4].sort()) === JSON.stringify([...skenario].sort()), `${sesuaiF4.length}/${skenario.length} skenario: ${sesuaiF4.join(',')}`)
} catch (e) {
  gagal++
  console.log(`❌ Uji gagal dijalankan: ${String(e?.stack ?? e).split('\n').slice(0, 4).join(' | ')}`)
} finally {
  if (aman) {
    await bersihkan().catch(() => {})
    const sisaTenant = await adm.tenant.count({ where: { companyName: { startsWith: TAG } } }).catch(() => -1)
    const sisaPesan = await adm.waClientMessage.count({ where: { tenant: { companyName: { startsWith: TAG } } } }).catch(() => -1)
    const sisaPemicu = await adm.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_proc WHERE proname = '${PEMICU}'`).then((r) => r[0].n).catch(() => -1)
    const sisaKontak = await adm.waContact.count({ where: { e164: { startsWith: '+62996' } } }).catch(() => -1)
    cek('BERSIH: 0 tenant/pesan bertanda, 0 kontak nomor uji, 0 fungsi pemicu uji (diverifikasi sesudah hapus)', sisaTenant === 0 && sisaPesan === 0 && sisaPemicu === 0 && sisaKontak === 0, `tenant ${sisaTenant}, pesan ${sisaPesan}, kontak ${sisaKontak}, pemicu ${sisaPemicu}`)
  }
  await adm.$disconnect()
}

console.log('\nℹ️  Cakupan: LAYAK = layak saat diperiksa di tx pemanggil; BUKAN klaim / exactly-once (P-3). Linux + PostgreSQL loopback; bukan bukti Windows. SG-05 tetap OPEN.')
console.log(`\n${gagal === 0 ? '✅ SEMUA LULUS' : '❌ ADA YANG GAGAL'} — lulus ${lulus}, gagal ${gagal}`)
process.exit(gagal === 0 ? 0 : 1)
