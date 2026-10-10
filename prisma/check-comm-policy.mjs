// Uji murni komunikasi WA-1 — Step 2A (TANPA DB, TANPA dev server, TANPA jaringan).
//
// Jalankan:  node prisma/check-comm-policy.mjs
//
// Lapis:
//   1. GERBANG — INTERNAL_FAKE_TEST mati bawaan, ditolak di produksi, mode harus FAKE.
//   2. KELUARGA EVENT — allowlist empat keluarga pilot (TS-13), kunci candidate.
//   3. SINYAL P-08 / Q4 — OPEN & ACK layak, DISMISSED/EXPIRED ditolak, grup campuran.
//   4. PENGELOMPOKAN — dua sinyal ETA/ETD satu AuditLog → satu grup (TS-03).
//   5. SUMBER JADWAL — first-set (TS-04), cleared (TS-05), supersession Q5 A→B→A→B.
//   6. SUMBER MILESTONE — dihapus, masa depan (TS-18), pelabuhan Q7, zona (TS-09).
//   7. ZONA WAKTU Q10 — IANA bernama diterima; kosong/invalid/UTC/Etc/offset ditolak.
//   8. TEMPLATE — body expected byte-per-byte (8 template), deterministik, token tersisa gagal.
//   9. MESIN STATUS & APPROVAL — tabel transisi, ACK bukan approval (TS-16), Q8 tanpa TTL.
//  10. FIXTURE — jelas TEST_FIXTURE, pengenal uji non-routable (bukan nomor telepon), bukan dari Principal/Customer.
//  11. HASH — JSON kanonik stabil & menolak nilai tanpa bentuk stabil.
//  12. EGRESS & LINGKUP — nol panggilan jaringan saat jalan, scan sumber, batas Step 2A.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import tls from 'node:tls'
import dns from 'node:dns'

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
const melempar = (fn, code) => {
  try {
    fn()
    return false
  } catch (e) {
    return code === undefined || e?.code === code
  }
}

// ------------------------------------------------- jaring jaringan (SEBELUM impor modul)
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

const P = await import('../src/services/communication/comm-policy.ts')
const T = await import('../src/services/communication/comm-template.ts')
const F = await import('../src/services/communication/comm-fixture.ts')
const H = await import('../src/services/communication/comm-hash.ts')
const FK = await import('../src/services/communication/comm-fake-provider.ts')
const TAH = await import('../src/services/tah/tah-policy.ts')
const { JENIS_APPROVAL_TAH, JENIS_APPROVAL_WA_FAKE } = await import('../src/services/tah/registry.ts')
const { TENANT_MODELS } = await import('../src/services/tenant-guard.ts')
const { STATUS_REVIEW, JENIS_SINYAL } = await import('../src/services/automation/monitoring-policy.ts')

// ------------------------------------------------------------------ fakta uji
const TENANT = 'tenantuji00000000000001'
const VOYAGE = 'voyageuji0000000000001'
const PORT = 'portuji00000000000000001'
const SEKARANG = new Date('2026-10-05T06:00:00.000Z')

const voyage = (ubah = {}) => ({
  id: VOYAGE,
  voyageNumber: 'VYG-TEST-000001',
  deletedAt: null,
  portId: PORT,
  eta: '2026-10-12',
  etd: '2026-10-14',
  ...ubah,
})
const port = (ubah = {}) => ({ id: PORT, name: 'Pelabuhan Uji', timezone: 'Asia/Makassar', deletedAt: null, ...ubah })
const kapal = { name: 'MT Contoh Satu' }
const audit = (id, createdAt, medan, lama, baru) => ({
  id,
  tableName: 'Voyage',
  recordId: VOYAGE,
  createdAt,
  oldValue: { peristiwa: 'UBAH_TANGGAL', ...lama },
  newValue: { peristiwa: 'UBAH_TANGGAL', medan, ...baru },
})
const AUDIT_ETA_ETD = audit('audit01', '2026-10-05T01:00:00.000Z', ['eta', 'etd'], { eta: '2026-10-10', etd: '2026-10-11' }, { eta: '2026-10-12', etd: '2026-10-14' })
const faktaJadwal = (ubah = {}) => ({ audit: AUDIT_ETA_ETD, voyage: voyage(), kapal, port: port(), auditSesudah: [], ...ubah })

const peristiwa = (ubah = {}) => ({
  id: 'event01',
  voyageId: VOYAGE,
  eventCode: 'EOSP',
  occurredAt: '2026-10-05T02:30:00.000Z',
  deletedAt: null,
  portCallId: null,
  ...ubah,
})
const faktaMilestone = (ubah = {}) => ({ keluarga: 'EOSP', peristiwa: peristiwa(), voyage: voyage(), kapal, port: port(), portCall: null, ...ubah })
const O = { sekarang: SEKARANG }

const sinyal = (ubah = {}) => ({
  id: 'sig01',
  tenantId: TENANT,
  voyageId: VOYAGE,
  kind: 'ETA_CHANGED',
  sourceType: 'AUDIT_LOG',
  sourceRef: 'audit01',
  reviewState: 'OPEN',
  after: { eta: '2026-10-12' },
  ...ubah,
})

// ============================================================================ 1
bagian('[1] Gerbang INTERNAL_FAKE_TEST')
{
  const g = (env) => P.bacaKonfigurasiKomunikasi(env)
  cek('bawaan (env kosong) → mati FEATURE_DISABLED', !g({}).aktif && g({}).alasan === 'FEATURE_DISABLED')
  cek('flag "false" → mati', !g({ WA1_INTERNAL_FAKE_TEST_ENABLED: 'false' }).aktif)
  cek('flag bukan persis "true" (TRUE/1/yes) → mati', ['TRUE', '1', 'yes', 'True'].every((v) => !g({ WA1_INTERNAL_FAKE_TEST_ENABLED: v }).aktif))
  cek('flag "true" + development → aktif, mode INTERNAL_FAKE_TEST, penyedia FAKE', (() => {
    const k = g({ WA1_INTERNAL_FAKE_TEST_ENABLED: 'true', NODE_ENV: 'development' })
    return k.aktif && k.mode === 'INTERNAL_FAKE_TEST' && k.penyedia === 'FAKE' && k.alasan === null
  })())
  cek('flag "true" + NODE_ENV tak diset → aktif (NODE_ENV ≠ production)', g({ WA1_INTERNAL_FAKE_TEST_ENABLED: 'true' }).aktif)
  cek('NODE_ENV=production → ENV_NOT_ALLOWED walau flag "true" (TS-14 varian, D-12)', (() => {
    const k = g({ WA1_INTERNAL_FAKE_TEST_ENABLED: 'true', NODE_ENV: 'production' })
    return !k.aktif && k.alasan === 'ENV_NOT_ALLOWED'
  })())
  cek('variasi "Production"/" production " tetap ditolak (gagal tertutup)', ['Production', ' production ', 'PRODUCTION'].every((n) => g({ WA1_INTERNAL_FAKE_TEST_ENABLED: 'true', NODE_ENV: n }).alasan === 'ENV_NOT_ALLOWED'))
  cek('flag WA khusus, bukan TAH_CORE_ENABLED (Q9)', P.FLAG_KOMUNIKASI === 'WA1_INTERNAL_FAKE_TEST_ENABLED' && !g({ TAH_CORE_ENABLED: 'true' }).aktif)
  cek('periksaModeFake: INTERNAL_FAKE_TEST/FAKE lolos', P.periksaModeFake({ mode: 'INTERNAL_FAKE_TEST', penyedia: 'FAKE' }).ok)
  cek('periksaModeFake: penyedia/mode lain → MODE_NOT_FAKE (AC-13)', [{ mode: 'INTERNAL_FAKE_TEST', penyedia: 'META' }, { mode: 'LIVE', penyedia: 'FAKE' }, { mode: undefined, penyedia: undefined }].every((x) => P.periksaModeFake(x).alasan === 'MODE_NOT_FAKE'))
}

// ============================================================================ 2
bagian('[2] Keluarga event pilot (TS-13)')
{
  const k = (s) => P.klasifikasiSinyal(sinyal(s))
  cek('ETA_CHANGED/AUDIT_LOG → SCHEDULE_CHANGE', k({}).ok && k({}).nilai.keluarga === 'SCHEDULE_CHANGE')
  for (const kode of ['EOSP', 'ALL_FAST', 'SAILED']) {
    const h = k({ kind: 'OPERATIONAL_EVENT_RECORDED', sourceType: 'VOYAGE_EVENT', sourceRef: 'event01', after: { eventCode: kode } })
    cek(`OPERATIONAL_EVENT_RECORDED ${kode} → ${kode}`, h.ok && h.nilai.keluarga === kode && h.nilai.kunci.sourceRef === 'event01')
  }
  for (const kode of ['NOR_TENDERED', 'PILOT_ON_BOARD', 'COMMENCED', 'COMPLETED', 'OTHER']) {
    const h = k({ kind: 'OPERATIONAL_EVENT_RECORDED', sourceType: 'VOYAGE_EVENT', sourceRef: 'event01', after: { eventCode: kode } })
    cek(`TS-13: peristiwa ${kode} → EVENT_NOT_ALLOWED`, !h.ok && h.alasan === 'EVENT_NOT_ALLOWED')
  }
  const lain = JENIS_SINYAL.filter((j) => j !== 'ETA_CHANGED' && j !== 'OPERATIONAL_EVENT_RECORDED')
  cek(`TS-13: jenis sinyal lain (${lain.join(', ')}) → EVENT_NOT_ALLOWED`, lain.length === 6 && lain.every((kind) => k({ kind }).alasan === 'EVENT_NOT_ALLOWED'))
  cek('ETA_CHANGED bersumber selain AUDIT_LOG → EVENT_NOT_ALLOWED', k({ sourceType: 'VOYAGE' }).alasan === 'EVENT_NOT_ALLOWED')
  cek('sinyal pilot tanpa sourceRef → SOURCE_NOT_FOUND', k({ sourceRef: null }).alasan === 'SOURCE_NOT_FOUND')
  cek('allowlist persis empat keluarga', P.KELUARGA_EVENT.join() === 'SCHEDULE_CHANGE,EOSP,ALL_FAST,SAILED' && P.KODE_MILESTONE_PILOT.join() === 'EOSP,ALL_FAST,SAILED')
  const a = { tenantId: 'a', voyageId: 'b', sourceType: 'AUDIT_LOG', sourceRef: 'c' }
  cek('kunci candidate stabil & tak ambigu', P.teksKunciCandidate(a) === P.teksKunciCandidate({ ...a }) && P.teksKunciCandidate({ ...a, voyageId: 'b:AUDIT_LOG' , sourceRef: 'c' }) !== P.teksKunciCandidate(a))
  cek('kunci pesan logis = candidate + pengenal penerima (P-06)', P.teksKunciPesanLogis(a, 'TEST_FIXTURE_WA_001') !== P.teksKunciPesanLogis(a, 'TEST_FIXTURE_WA_002'))
}

// ============================================================================ 3
bagian('[3] Kelayakan sinyal P-08 / Q4')
{
  cek('STATUS_REVIEW monitoring = OPEN, ACKNOWLEDGED, DISMISSED, EXPIRED (kontrak yang dibaca)', STATUS_REVIEW.join() === 'OPEN,ACKNOWLEDGED,DISMISSED,EXPIRED')
  cek('P-08: OPEN → layak', P.kelayakanSinyal('OPEN').ok)
  cek('P-08: ACKNOWLEDGED → layak', P.kelayakanSinyal('ACKNOWLEDGED').ok)
  cek('DISMISSED → SIGNAL_DISMISSED', P.kelayakanSinyal('DISMISSED').alasan === 'SIGNAL_DISMISSED')
  cek('EXPIRED → SIGNAL_EXPIRED', P.kelayakanSinyal('EXPIRED').alasan === 'SIGNAL_EXPIRED')
  cek('status tak dikenal → SIGNAL_STATE_INVALID (gagal tertutup)', ['', 'open', null, undefined, 'APPROVED'].every((s) => P.kelayakanSinyal(s).alasan === 'SIGNAL_STATE_INVALID'))
  const g = P.kelayakanGrupSinyal
  cek('grup OPEN + ACKNOWLEDGED → layak', g(['OPEN', 'ACKNOWLEDGED']).ok)
  cek('grup campuran ACKNOWLEDGED + DISMISSED → seluruh grup SIGNAL_DISMISSED', g(['ACKNOWLEDGED', 'DISMISSED']).alasan === 'SIGNAL_DISMISSED')
  cek('grup campuran OPEN + EXPIRED → seluruh grup SIGNAL_EXPIRED', g(['OPEN', 'EXPIRED']).alasan === 'SIGNAL_EXPIRED')
  cek('grup DISMISSED + EXPIRED → deterministik (SIGNAL_DISMISSED, tak bergantung urutan)', g(['EXPIRED', 'DISMISSED']).alasan === 'SIGNAL_DISMISSED' && g(['DISMISSED', 'EXPIRED']).alasan === 'SIGNAL_DISMISSED')
  cek('grup kosong → SOURCE_NOT_FOUND', g([]).alasan === 'SOURCE_NOT_FOUND')
}

// ============================================================================ 4
bagian('[4] Pengelompokan ETA/ETD (TS-03, K-2)')
{
  const h = P.kelompokkanSinyal([
    sinyal({ id: 'sigETD', after: { etd: '2026-10-14' }, reviewState: 'ACKNOWLEDGED' }),
    sinyal({ id: 'sigETA' }),
    sinyal({ id: 'sigEOSP', kind: 'OPERATIONAL_EVENT_RECORDED', sourceType: 'VOYAGE_EVENT', sourceRef: 'event01', after: { eventCode: 'EOSP' } }),
    sinyal({ id: 'sigNOR', kind: 'OPERATIONAL_EVENT_RECORDED', sourceType: 'VOYAGE_EVENT', sourceRef: 'event02', after: { eventCode: 'NOR_TENDERED' } }),
  ])
  const jadwal = h.grup.filter((x) => x.keluarga === 'SCHEDULE_CHANGE')
  cek('dua sinyal ETA/ETD sourceRef sama → SATU grup', jadwal.length === 1 && jadwal[0].sinyalIds.join() === 'sigETA,sigETD')
  cek('reviewState ikut terurut sesuai id sinyal', jadwal[0].reviewStates.join() === 'OPEN,ACKNOWLEDGED')
  cek('milestone = grup sendiri', h.grup.filter((x) => x.keluarga === 'EOSP').length === 1 && h.grup.length === 2)
  cek('sinyal non-pilot masuk daftar ditolak (EVENT_NOT_ALLOWED)', h.ditolak.length === 1 && h.ditolak[0].sinyalId === 'sigNOR' && h.ditolak[0].alasan === 'EVENT_NOT_ALLOWED')
  const b = P.kelompokkanSinyal([sinyal({ id: 'x2' }), sinyal({ id: 'x1', sourceRef: 'audit02' }), sinyal({ id: 'x3' })])
  const c = P.kelompokkanSinyal([sinyal({ id: 'x3' }), sinyal({ id: 'x1', sourceRef: 'audit02' }), sinyal({ id: 'x2' })])
  cek('pengelompokan deterministik terhadap urutan masukan', JSON.stringify(b) === JSON.stringify(c))
  cek('voyage berbeda dengan sourceRef sama → grup terpisah', P.kelompokkanSinyal([sinyal({ id: 'a' }), sinyal({ id: 'b', voyageId: 'voyagelain' })]).grup.length === 2)
}

// ============================================================================ 5
bagian('[5] Revalidasi sumber jadwal (TS-04, TS-05, Q5)')
{
  const n = P.nilaiSumberJadwal
  const ok = n(faktaJadwal())
  cek('ETA+ETD valid → lolos, urutan ETA lalu ETD, tanggal saja', ok.ok && JSON.stringify(ok.nilai.perubahan) === JSON.stringify([{ medan: 'eta', lama: '2026-10-10', baru: '2026-10-12' }, { medan: 'etd', lama: '2026-10-11', baru: '2026-10-14' }]))
  const aEta = audit('auditEta', '2026-10-05T01:00:00.000Z', ['eta'], { eta: '2026-10-10' }, { eta: '2026-10-12' })
  cek('TS-01 (kebijakan): hanya ETA → satu perubahan', (() => { const h = n(faktaJadwal({ audit: aEta })); return h.ok && h.nilai.perubahan.length === 1 && h.nilai.perubahan[0].medan === 'eta' })())
  const aEtd = audit('auditEtd', '2026-10-05T01:00:00.000Z', ['etd'], { etd: '2026-10-11' }, { etd: '2026-10-14' })
  cek('TS-02 (kebijakan): hanya ETD → satu perubahan', (() => { const h = n(faktaJadwal({ audit: aEtd })); return h.ok && h.nilai.perubahan.length === 1 && h.nilai.perubahan[0].medan === 'etd' })())
  const aFirst = audit('auditF', '2026-10-05T01:00:00.000Z', ['eta'], { eta: null }, { eta: '2026-10-12' })
  cek('TS-04: ETA diisi pertama kali → SCHEDULE_FIRST_SET', n(faktaJadwal({ audit: aFirst })).alasan === 'SCHEDULE_FIRST_SET')
  const aClear = audit('auditC', '2026-10-05T01:00:00.000Z', ['eta'], { eta: '2026-10-12' }, { eta: null })
  cek('TS-05: ETA dikosongkan → SCHEDULE_CLEARED', n(faktaJadwal({ audit: aClear, voyage: voyage({ eta: null }) })).alasan === 'SCHEDULE_CLEARED')
  const aCampur = audit('auditM', '2026-10-05T01:00:00.000Z', ['eta', 'etd'], { eta: '2026-10-10', etd: null }, { eta: '2026-10-12', etd: '2026-10-14' })
  cek('P-01: ETA sah + ETD first-set → SELURUH candidate diblokir', (() => { const h = n(faktaJadwal({ audit: aCampur })); return !h.ok && h.alasan === 'SCHEDULE_FIRST_SET' && h.medan === 'etd' })())
  cek('nilai voyage kini ≠ nilai baru → SOURCE_SUPERSEDED', n(faktaJadwal({ voyage: voyage({ eta: '2026-10-20' }) })).alasan === 'SOURCE_SUPERSEDED')

  // Q5 — A→B (audit1), B→A (audit2), A→B (audit3). Nilai kini = B = nilai baru audit1.
  const A = '2026-10-10'
  const B = '2026-10-12'
  const a1 = audit('q5a1', '2026-10-05T01:00:00.000Z', ['eta'], { eta: A }, { eta: B })
  const a2 = audit('q5a2', '2026-10-05T02:00:00.000Z', ['eta'], { eta: B }, { eta: A })
  const a3 = audit('q5a3', '2026-10-05T03:00:00.000Z', ['eta'], { eta: A }, { eta: B })
  const v = voyage({ eta: B })
  cek('Q5: A→B→A→B — candidate audit1 SOURCE_SUPERSEDED walau nilai kini kembali B', n({ ...faktaJadwal(), audit: a1, voyage: v, auditSesudah: [a1, a2, a3] }).alasan === 'SOURCE_SUPERSEDED')
  cek('Q5: candidate audit3 (terbaru) tetap lolos', n({ ...faktaJadwal(), audit: a3, voyage: v, auditSesudah: [a1, a2, a3] }).ok)
  cek('Q5: baris lebih LAMA dari sumber diabaikan', n({ ...faktaJadwal(), audit: a3, voyage: v, auditSesudah: [a1, a2] }).ok)
  const aEtb = audit('q5etb', '2026-10-05T04:00:00.000Z', ['etb'], { etb: A }, { etb: B })
  cek('Q5: UBAH_TANGGAL lebih baru pada medan LAIN (etb) tidak menyalip', n({ ...faktaJadwal(), audit: a3, voyage: v, auditSesudah: [aEtb] }).ok)
  const aEtdBaru = audit('q5etd', '2026-10-05T04:00:00.000Z', ['etd'], { etd: '2026-10-14' }, { etd: '2026-10-15' })
  cek('Q5: AuditLog lebih baru menyentuh ETD → candidate ETA+ETD SOURCE_SUPERSEDED', n(faktaJadwal({ voyage: voyage({ etd: '2026-10-15' }), auditSesudah: [aEtdBaru] })).alasan === 'SOURCE_SUPERSEDED')
  const kembar = audit('q5kembar', a3.createdAt, ['eta'], { eta: A }, { eta: B })
  cek('Q5: createdAt sama persis → dianggap menyalip (gagal tertutup)', n({ ...faktaJadwal(), audit: a3, voyage: v, auditSesudah: [kembar] }).alasan === 'SOURCE_SUPERSEDED')
  const statusLebihBaru = { ...a3, id: 'status1', createdAt: '2026-10-05T05:00:00.000Z', oldValue: { status: 'PLANNED' }, newValue: { status: 'ARRIVED' } }
  cek('jejak status (bukan UBAH_TANGGAL) tidak menyalip', n({ ...faktaJadwal(), audit: a3, voyage: v, auditSesudah: [statusLebihBaru] }).ok)

  cek('AuditLog tak ditemukan → SOURCE_NOT_FOUND', n(faktaJadwal({ audit: null })).alasan === 'SOURCE_NOT_FOUND')
  cek('AuditLog milik voyage lain → SOURCE_NOT_FOUND', n(faktaJadwal({ audit: { ...AUDIT_ETA_ETD, recordId: 'lain' } })).alasan === 'SOURCE_NOT_FOUND')
  cek('AuditLog bukan UBAH_TANGGAL → SOURCE_NOT_FOUND', n(faktaJadwal({ audit: statusLebihBaru })).alasan === 'SOURCE_NOT_FOUND')
  cek('voyage dihapus → SOURCE_DELETED', n(faktaJadwal({ voyage: voyage({ deletedAt: '2026-10-05T04:00:00.000Z' }) })).alasan === 'SOURCE_DELETED')
  cek('UBAH_TANGGAL tanpa eta/etd (mis. etb saja) → EVENT_NOT_ALLOWED', n(faktaJadwal({ audit: aEtb })).alasan === 'EVENT_NOT_ALLOWED')
  cek('tanggal rusak (2026-02-30) → REQUIRED_DATA_MISSING', n(faktaJadwal({ audit: audit('r', '2026-10-05T01:00:00.000Z', ['eta'], { eta: '2026-02-30' }, { eta: '2026-10-12' }) })).alasan === 'REQUIRED_DATA_MISSING')
  cek('pelabuhan voyage kosong → PORT_MISSING', n(faktaJadwal({ voyage: voyage({ portId: null }) })).alasan === 'PORT_MISSING')
  cek('pelabuhan soft-delete → PORT_MISSING', n(faktaJadwal({ port: port({ deletedAt: '2026-10-01T00:00:00.000Z' }) })).alasan === 'PORT_MISSING')
  cek('nama kapal kosong → REQUIRED_DATA_MISSING', n(faktaJadwal({ kapal: { name: '  ' } })).alasan === 'REQUIRED_DATA_MISSING')
  cek('jadwal TIDAK butuh timezone (K-1): timezone kosong tetap lolos', n(faktaJadwal({ port: port({ timezone: null }) })).ok)
}

// ============================================================================ 6
bagian('[6] Revalidasi sumber milestone (TS-09, TS-10, TS-18, Q7)')
{
  const n = (f) => P.nilaiSumberMilestone(f, O)
  const ok = n(faktaMilestone())
  cek('EOSP valid → lolos + waktu lokal operasional', ok.ok && ok.nilai.eventLocalTime === '2026-10-05 10:30 (UTC+08:00, Asia/Makassar)')
  for (const kode of ['ALL_FAST', 'SAILED']) {
    cek(`${kode} valid → lolos`, n(faktaMilestone({ keluarga: kode, peristiwa: peristiwa({ eventCode: kode }) })).ok)
  }
  cek('TS-10: VoyageEvent.deletedAt ≠ null → SOURCE_DELETED', n(faktaMilestone({ peristiwa: peristiwa({ deletedAt: '2026-10-05T03:00:00.000Z' }) })).alasan === 'SOURCE_DELETED')
  cek('voyage dihapus → SOURCE_DELETED', n(faktaMilestone({ voyage: voyage({ deletedAt: '2026-10-05T03:00:00.000Z' }) })).alasan === 'SOURCE_DELETED')
  cek('VoyageEvent tak ditemukan → SOURCE_NOT_FOUND', n(faktaMilestone({ peristiwa: null })).alasan === 'SOURCE_NOT_FOUND')
  cek('VoyageEvent milik voyage lain → SOURCE_NOT_FOUND', n(faktaMilestone({ peristiwa: peristiwa({ voyageId: 'lain' }) })).alasan === 'SOURCE_NOT_FOUND')
  cek('kode peristiwa ≠ keluarga candidate → EVENT_NOT_ALLOWED', n(faktaMilestone({ keluarga: 'SAILED' })).alasan === 'EVENT_NOT_ALLOWED')
  cek('kode non-pilot (COMMENCED) → EVENT_NOT_ALLOWED', n(faktaMilestone({ peristiwa: peristiwa({ eventCode: 'COMMENCED' }) })).alasan === 'EVENT_NOT_ALLOWED')
  cek('TS-18: occurredAt di masa depan → TIME_IN_FUTURE', n(faktaMilestone({ peristiwa: peristiwa({ occurredAt: '2026-10-05T06:00:00.001Z' }) })).alasan === 'TIME_IN_FUTURE')
  cek('occurredAt = sekarang → bukan masa depan', n(faktaMilestone({ peristiwa: peristiwa({ occurredAt: SEKARANG.toISOString() }) })).ok)
  cek('occurredAt rusak → REQUIRED_DATA_MISSING', n(faktaMilestone({ peristiwa: peristiwa({ occurredAt: 'bukan-waktu' }) })).alasan === 'REQUIRED_DATA_MISSING')
  cek('TS-09: Port.timezone kosong → TIMEZONE_MISSING', n(faktaMilestone({ port: port({ timezone: null }) })).alasan === 'TIMEZONE_MISSING')
  cek('TS-09 varian: Port.timezone bukan IANA → TIMEZONE_INVALID', n(faktaMilestone({ port: port({ timezone: 'WITA' }) })).alasan === 'TIMEZONE_INVALID')
  cek('pelabuhan voyage kosong → PORT_MISSING', n(faktaMilestone({ voyage: voyage({ portId: null }), port: null })).alasan === 'PORT_MISSING')
  cek('Q7: portCallId ada, port call tak ditemukan → PORT_AMBIGUOUS', n(faktaMilestone({ peristiwa: peristiwa({ portCallId: 'pc1' }), portCall: null })).alasan === 'PORT_AMBIGUOUS')
  cek('Q7: portCallId ada, portRefId null → PORT_AMBIGUOUS', n(faktaMilestone({ peristiwa: peristiwa({ portCallId: 'pc1' }), portCall: { id: 'pc1', portRefId: null } })).alasan === 'PORT_AMBIGUOUS')
  cek('Q7: portRefId ≠ pelabuhan voyage → PORT_AMBIGUOUS', n(faktaMilestone({ peristiwa: peristiwa({ portCallId: 'pc1' }), portCall: { id: 'pc1', portRefId: 'portlain' } })).alasan === 'PORT_AMBIGUOUS')
  cek('Q7: portRefId = pelabuhan voyage → lolos', n(faktaMilestone({ peristiwa: peristiwa({ portCallId: 'pc1' }), portCall: { id: 'pc1', portRefId: PORT } })).ok)
  cek('urutan tetap: sumber terhapus mengalahkan timezone kosong', n(faktaMilestone({ peristiwa: peristiwa({ deletedAt: '2026-10-05T03:00:00.000Z' }), port: port({ timezone: null }) })).alasan === 'SOURCE_DELETED')
  cek('ALL_FAST tak butuh berth/terminal (K-3): fakta tanpa medan berth tetap lolos', n(faktaMilestone({ keluarga: 'ALL_FAST', peristiwa: peristiwa({ eventCode: 'ALL_FAST' }) })).ok)
}

// ============================================================================ 7
bagian('[7] Zona waktu Q10')
{
  const z = (v) => P.nilaiZonaWaktu(v)
  cek('Intl.supportedValuesOf tersedia di runtime ini', P.zonaDidukungRuntime().size > 100, `${P.zonaDidukungRuntime().size} zona`)
  cek('IANA bernama diterima: Asia/Makassar, Asia/Jakarta, Asia/Jayapura, Asia/Pontianak, Asia/Singapore', ['Asia/Makassar', 'Asia/Jakarta', 'Asia/Jayapura', 'Asia/Pontianak', 'Asia/Singapore'].every((x) => z(x).ok))
  cek('IANA tiga segmen diterima (America/Argentina/Salta)', z('America/Argentina/Salta').ok)
  cek('alias IANA modern diterima walau ICU mendaftar nama lama (Asia/Kolkata → Asia/Calcutta)', z('Asia/Kolkata').ok && z('America/Argentina/Buenos_Aires').ok)
  cek('variasi huruf yang diresolusikan Intl TETAP ditolak (Asia/makassar, ASIA/MAKASSAR)', ['Asia/makassar', 'ASIA/MAKASSAR'].every((x) => z(x).alasan === 'TIMEZONE_INVALID'))
  cek('kosong / null / undefined → TIMEZONE_MISSING', ['', null, undefined].every((x) => z(x).alasan === 'TIMEZONE_MISSING'))
  cek('invalid (WITA, Asia/Atlantis, angka) → TIMEZONE_INVALID', ['WITA', 'Asia/Atlantis', 8, 'Mars/Olympus'].every((x) => z(x).alasan === 'TIMEZONE_INVALID'))
  cek('UTC / GMT / Etc/UTC ditolak', ['UTC', 'GMT', 'Etc/UTC', 'Etc/GMT'].every((x) => z(x).alasan === 'TIMEZONE_INVALID'))
  cek('Etc/* ditolak (Etc/GMT-8, Etc/GMT+7)', ['Etc/GMT-8', 'Etc/GMT+7'].every((x) => z(x).alasan === 'TIMEZONE_INVALID'))
  cek('offset tetap ditolak (+08:00, UTC+8, GMT+08:00, -0700)', ['+08:00', 'UTC+8', 'GMT+08:00', '-0700'].every((x) => z(x).alasan === 'TIMEZONE_INVALID'))
  cek('tanpa normalisasi diam-diam: huruf kecil / spasi ditolak', ['asia/makassar', ' Asia/Makassar', 'Asia/Makassar '].every((x) => z(x).alasan === 'TIMEZONE_INVALID'))
  cek('nama warisan tanpa wilayah ditolak (EST5EDT, WET, PST8PDT)', ['EST5EDT', 'WET', 'PST8PDT'].every((x) => z(x).alasan === 'TIMEZONE_INVALID'))
  cek('daftar terkontrol: zona sah pola tapi tak didukung runtime → ditolak', P.nilaiZonaWaktu('Asia/Makassar', new Set()).alasan === 'TIMEZONE_INVALID')
  cek('bukan try/catch Intl: Intl sendiri MENERIMA "+08:00" tetapi kebijakan menolak', (() => { try { new Intl.DateTimeFormat('en-US', { timeZone: '+08:00' }); return true } catch { return false } })() ? z('+08:00').alasan === 'TIMEZONE_INVALID' : z('+08:00').alasan === 'TIMEZONE_INVALID')
  const f = P.formatWaktuLokal
  cek('format WITA', f('2026-10-05T02:30:59.999Z', 'Asia/Makassar') === '2026-10-05 10:30 (UTC+08:00, Asia/Makassar)')
  cek('format WIB & lintas tanggal', f('2026-10-05T17:15:00.000Z', 'Asia/Jakarta') === '2026-10-06 00:15 (UTC+07:00, Asia/Jakarta)')
  cek('format offset setengah jam', f('2026-10-05T00:00:00.000Z', 'Asia/Kolkata') === '2026-10-05 05:30 (UTC+05:30, Asia/Kolkata)')
  cek('format offset nol tampil UTC+00:00 dengan nama zona', f('2026-10-05T00:00:00.000Z', 'Africa/Abidjan') === '2026-10-05 00:00 (UTC+00:00, Africa/Abidjan)')
  cek('format offset negatif', f('2026-10-05T12:00:00.000Z', 'America/Argentina/Salta') === '2026-10-05 09:00 (UTC-03:00, America/Argentina/Salta)')
  cek('format menolak zona tak sah (tanpa fallback)', melempar(() => f('2026-10-05T00:00:00.000Z', 'UTC')) && melempar(() => f('2026-10-05T00:00:00.000Z', '')))
  cek('kunci tanggal kalender: 2028-02-29 sah, 2026-02-29 & 2026-13-01 tidak', P.kunciTanggalKalenderSah('2028-02-29') && !P.kunciTanggalKalenderSah('2026-02-29') && !P.kunciTanggalKalenderSah('2026-13-01') && !P.kunciTanggalKalenderSah('2026-10-05T00:00'))
}

// ============================================================================ 8
bagian('[8] Template deterministik — body expected byte-per-byte')
{
  const dasar = { vesselName: 'MT Contoh Satu', voyageNumber: 'VYG-TEST-000001', portName: 'Pelabuhan Uji' }
  const waktu = '2026-10-05 10:30 (UTC+08:00, Asia/Makassar)'
  const perubahan = [{ medan: 'eta', lama: '2026-10-10', baru: '2026-10-12' }, { medan: 'etd', lama: '2026-10-11', baru: '2026-10-14' }]
  const EXPECTED = {
    'wa1.schedule.ID.v1': [
      '[SIMULASI INTERNAL — TIDAK DIKIRIM]',
      'Update Jadwal Kapal — MT Contoh Satu',
      'Voyage: VYG-TEST-000001 | Pelabuhan: Pelabuhan Uji',
      'Yth. Bapak/Ibu,',
      'Berikut perubahan jadwal MT Contoh Satu:',
      'ETA: dari 2026-10-10 menjadi 2026-10-12.',
      'ETD: dari 2026-10-11 menjadi 2026-10-14.',
      'Hormat kami,',
      'PT Tribuana Solusi Maritim',
    ].join('\n'),
    'wa1.schedule.EN.v1': [
      '[INTERNAL SIMULATION — NOT SENT]',
      'Vessel Schedule Update — MT Contoh Satu',
      'Voyage: VYG-TEST-000001 | Port: Pelabuhan Uji',
      'Dear Sir/Madam,',
      'Please note the following schedule changes for MT Contoh Satu:',
      'ETA: revised from 2026-10-10 to 2026-10-12.',
      'ETD: revised from 2026-10-11 to 2026-10-14.',
      'Regards,',
      'PT Tribuana Solusi Maritim',
    ].join('\n'),
    'wa1.eosp.ID.v1': [
      '[SIMULASI INTERNAL — TIDAK DIKIRIM]',
      'Update Kapal — MT Contoh Satu',
      'Voyage: VYG-TEST-000001 | Pelabuhan: Pelabuhan Uji',
      'Yth. Bapak/Ibu,',
      'Milestone EOSP untuk MT Contoh Satu pada kunjungan Pelabuhan Uji tercatat pada 2026-10-05 10:30 (UTC+08:00, Asia/Makassar).',
      'Hormat kami,',
      'PT Tribuana Solusi Maritim',
    ].join('\n'),
    'wa1.eosp.EN.v1': [
      '[INTERNAL SIMULATION — NOT SENT]',
      'Vessel Update — MT Contoh Satu',
      'Voyage: VYG-TEST-000001 | Port: Pelabuhan Uji',
      'Dear Sir/Madam,',
      'The EOSP milestone for MT Contoh Satu on the Pelabuhan Uji port call was recorded at 2026-10-05 10:30 (UTC+08:00, Asia/Makassar).',
      'Regards,',
      'PT Tribuana Solusi Maritim',
    ].join('\n'),
    'wa1.all_fast.ID.v1': [
      '[SIMULASI INTERNAL — TIDAK DIKIRIM]',
      'Update Sandar — MT Contoh Satu',
      'Voyage: VYG-TEST-000001 | Pelabuhan: Pelabuhan Uji',
      'Yth. Bapak/Ibu,',
      'MT Contoh Satu — ALL FAST tercatat di Pelabuhan Uji pada 2026-10-05 10:30 (UTC+08:00, Asia/Makassar).',
      'Hormat kami,',
      'PT Tribuana Solusi Maritim',
    ].join('\n'),
    'wa1.all_fast.EN.v1': [
      '[INTERNAL SIMULATION — NOT SENT]',
      'Berthing Update — MT Contoh Satu',
      'Voyage: VYG-TEST-000001 | Port: Pelabuhan Uji',
      'Dear Sir/Madam,',
      'MT Contoh Satu — ALL FAST recorded at Pelabuhan Uji at 2026-10-05 10:30 (UTC+08:00, Asia/Makassar).',
      'Regards,',
      'PT Tribuana Solusi Maritim',
    ].join('\n'),
    'wa1.sailed.ID.v1': [
      '[SIMULASI INTERNAL — TIDAK DIKIRIM]',
      'Update Keberangkatan — MT Contoh Satu',
      'Voyage: VYG-TEST-000001 | Pelabuhan: Pelabuhan Uji',
      'Yth. Bapak/Ibu,',
      'MT Contoh Satu telah berangkat dari Pelabuhan Uji pada 2026-10-05 10:30 (UTC+08:00, Asia/Makassar).',
      'Hormat kami,',
      'PT Tribuana Solusi Maritim',
    ].join('\n'),
    'wa1.sailed.EN.v1': [
      '[INTERNAL SIMULATION — NOT SENT]',
      'Departure Update — MT Contoh Satu',
      'Voyage: VYG-TEST-000001 | Port: Pelabuhan Uji',
      'Dear Sir/Madam,',
      'MT Contoh Satu sailed from Pelabuhan Uji at 2026-10-05 10:30 (UTC+08:00, Asia/Makassar).',
      'Regards,',
      'PT Tribuana Solusi Maritim',
    ].join('\n'),
  }
  for (const keluarga of ['SCHEDULE_CHANGE', 'EOSP', 'ALL_FAST', 'SAILED']) {
    for (const bahasa of ['ID', 'EN']) {
      const input = keluarga === 'SCHEDULE_CHANGE' ? { ...dasar, keluarga, bahasa, perubahan } : { ...dasar, keluarga, bahasa, eventLocalTime: waktu }
      const r = T.renderPesan(input)
      cek(`${r.templateId}: body = expected byte-per-byte`, r.body === EXPECTED[r.templateId] && r.templateVersion === 1 && r.bahasa === bahasa)
      cek(`${r.templateId}: render ulang identik (AC-07)`, T.renderPesan(input).body === r.body)
    }
  }
  cek('delapan template, id stabil', Object.keys(EXPECTED).length === 8)
  cek('jadwal: hanya tanggal — tak ada jam/zona di body', !/\d{2}:\d{2}|UTC|WITA/.test(T.renderPesan({ ...dasar, keluarga: 'SCHEDULE_CHANGE', bahasa: 'ID', perubahan }).body))
  cek('jadwal: urutan ETA lalu ETD walau masukan terbalik', T.renderPesan({ ...dasar, keluarga: 'SCHEDULE_CHANGE', bahasa: 'ID', perubahan: [perubahan[1], perubahan[0]] }).body === EXPECTED['wa1.schedule.ID.v1'])
  cek('TS-01 body: ETA saja → satu baris ETA', T.renderPesan({ ...dasar, keluarga: 'SCHEDULE_CHANGE', bahasa: 'ID', perubahan: [perubahan[0]] }).body.split('\n').filter((l) => /^ET[AD]:/.test(l)).join() === 'ETA: dari 2026-10-10 menjadi 2026-10-12.')
  cek('TS-02 body: ETD saja → satu baris ETD', T.renderPesan({ ...dasar, keluarga: 'SCHEDULE_CHANGE', bahasa: 'EN', perubahan: [perubahan[1]] }).body.split('\n').filter((l) => /^ET[AD]:/.test(l)).join() === 'ETD: revised from 2026-10-11 to 2026-10-14.')
  cek('ALL_FAST tanpa token/data berth/terminal (K-3; judul PRD "Berthing Update" tetap)', !/terminal|dermaga|\{\{[^}]*(berth|terminal)/i.test(T.TEMPLATE.ALL_FAST.ID + T.TEMPLATE.ALL_FAST.EN) && !/terminal|dermaga/i.test(EXPECTED['wa1.all_fast.ID.v1'] + EXPECTED['wa1.all_fast.EN.v1']))
  cek('template mentah memuat preamble simulasi', Object.values(T.TEMPLATE).every((x) => x.ID.startsWith('[SIMULASI INTERNAL — TIDAK DIKIRIM]\n') && x.EN.startsWith('[INTERNAL SIMULATION — NOT SENT]\n')))

  cek('token tak terisi → TEMPLATE_TOKEN_UNRESOLVED', melempar(() => T.isiTemplate('Halo {{vessel_name}} {{port_name}}', { vessel_name: 'X' }), 'TEMPLATE_TOKEN_UNRESOLVED'))
  cek('sisa penanda "{{" di hasil → TEMPLATE_TOKEN_UNRESOLVED', melempar(() => T.isiTemplate('Halo {{ vessel }}', {}), 'TEMPLATE_TOKEN_UNRESOLVED'))
  cek('nilai tidak dipindai ulang (substitusi sekali jalan)', T.isiTemplate('{{a}}-{{b}}', { a: 'x', b: 'y' }) === 'x-y')
  cek('data memuat {{...}} ditolak', melempar(() => T.renderPesan({ ...dasar, vesselName: 'MT {{port_name}}', keluarga: 'EOSP', bahasa: 'ID', eventLocalTime: waktu }), 'TEMPLATE_DATA_INVALID'))
  const nakal = T.renderPesan({ ...dasar, vesselName: 'MT Contoh\nSatu\r\n\t', portName: 'Pelabuhan\u2028Uji\u0000', keluarga: 'EOSP', bahasa: 'ID', eventLocalTime: waktu })
  cek('newline/kontrol di data dinormalisasi → body sama dengan data bersih', nakal.body === EXPECTED['wa1.eosp.ID.v1'])
  cek('data kosong setelah normalisasi ditolak', melempar(() => T.renderPesan({ ...dasar, portName: '\n\t ', keluarga: 'EOSP', bahasa: 'ID', eventLocalTime: waktu }), 'TEMPLATE_DATA_INVALID'))
  cek('milestone tanpa waktu lokal ditolak', melempar(() => T.renderPesan({ ...dasar, keluarga: 'SAILED', bahasa: 'ID' }), 'TEMPLATE_INPUT_INVALID'))
  cek('milestone dengan waktu tanpa zona/offset ditolak', melempar(() => T.renderPesan({ ...dasar, keluarga: 'SAILED', bahasa: 'ID', eventLocalTime: '2026-10-05 10:30' }), 'TEMPLATE_INPUT_INVALID'))
  cek('milestone dengan waktu UTC palsu ditolak', melempar(() => T.renderPesan({ ...dasar, keluarga: 'SAILED', bahasa: 'ID', eventLocalTime: '2026-10-05 10:30 (UTC+00:00, UTC)' }), 'TEMPLATE_INPUT_INVALID'))
  cek('jadwal dengan jam ditolak', melempar(() => T.renderPesan({ ...dasar, keluarga: 'SCHEDULE_CHANGE', bahasa: 'ID', perubahan: [{ medan: 'eta', lama: '2026-10-10 08:00', baru: '2026-10-12' }] }), 'TEMPLATE_INPUT_INVALID'))
  cek('jadwal tanpa perubahan / medan ganda ditolak', melempar(() => T.renderPesan({ ...dasar, keluarga: 'SCHEDULE_CHANGE', bahasa: 'ID', perubahan: [] })) && melempar(() => T.renderPesan({ ...dasar, keluarga: 'SCHEDULE_CHANGE', bahasa: 'ID', perubahan: [perubahan[0], perubahan[0]] })))
  cek('bahasa selain ID/EN ditolak', melempar(() => T.renderPesan({ ...dasar, keluarga: 'EOSP', bahasa: 'FR', eventLocalTime: waktu })))

  // Rantai kebijakan → template (bentuk yang akan dipakai service 2C).
  const m = P.nilaiSumberMilestone(faktaMilestone({ keluarga: 'ALL_FAST', peristiwa: peristiwa({ eventCode: 'ALL_FAST' }) }), O)
  cek('rantai milestone: fakta kanonik → body ALL_FAST expected', m.ok && T.renderPesan({ keluarga: m.nilai.keluarga, bahasa: 'ID', vesselName: m.nilai.vesselName, voyageNumber: m.nilai.voyageNumber, portName: m.nilai.portName, eventLocalTime: m.nilai.eventLocalTime }).body === EXPECTED['wa1.all_fast.ID.v1'])
  const j = P.nilaiSumberJadwal(faktaJadwal())
  cek('rantai jadwal: fakta kanonik → body jadwal expected', j.ok && T.renderPesan({ keluarga: 'SCHEDULE_CHANGE', bahasa: 'EN', vesselName: j.nilai.vesselName, voyageNumber: j.nilai.voyageNumber, portName: j.nilai.portName, perubahan: j.nilai.perubahan }).body === EXPECTED['wa1.schedule.EN.v1'])
}

// ============================================================================ 9
bagian('[9] Mesin status & approval (TS-15, TS-16, Q8)')
{
  const s = P.transisiPesanSah
  cek('status persis PRD §12.3', P.STATUS_PESAN.join() === 'DRAFT,PREVIEWED,APPROVED,QUEUED_FAKE,FAKE_SENT,FAKE_FAILED,NEEDS_REVIEW,BLOCKED,CANCELED')
  cek('tak ada state SENT/DELIVERED/READ nyata', !P.STATUS_PESAN.some((x) => ['SENT', 'DELIVERED', 'READ'].includes(x)))
  cek('jalur bahagia DRAFT→PREVIEWED→APPROVED→QUEUED_FAKE→FAKE_SENT', s('DRAFT', 'PREVIEWED') && s('PREVIEWED', 'APPROVED') && s('APPROVED', 'QUEUED_FAKE') && s('QUEUED_FAKE', 'FAKE_SENT'))
  cek('tak bisa melompati preview/approval', !s('DRAFT', 'APPROVED') && !s('DRAFT', 'QUEUED_FAKE') && !s('PREVIEWED', 'QUEUED_FAKE') && !s('DRAFT', 'FAKE_SENT'))
  cek('FAKE_SENT, BLOCKED, CANCELED terminal', ['FAKE_SENT', 'BLOCKED', 'CANCELED'].every((t) => P.statusPesanTerminal(t) && P.STATUS_PESAN.every((k) => !s(t, k))))
  cek('FAKE_SENT tak bisa dipromosikan / diulang', !s('FAKE_SENT', 'QUEUED_FAKE') && !s('FAKE_SENT', 'APPROVED'))
  cek('retry manual: FAKE_FAILED → QUEUED_FAKE', s('FAKE_FAILED', 'QUEUED_FAKE') && P.bolehMintaSend('FAKE_FAILED'))
  cek('Send hanya dari APPROVED/FAKE_FAILED', P.STATUS_PESAN.filter(P.bolehMintaSend).join() === 'APPROVED,FAKE_FAILED')
  cek('AC-10: APPROVED → BLOCKED (sumber terhapus sebelum klaim)', s('APPROVED', 'BLOCKED') && s('QUEUED_FAKE', 'BLOCKED'))
  cek('approval basi: APPROVED → NEEDS_REVIEW; NEEDS_REVIEW → DRAFT (revisi)', s('APPROVED', 'NEEDS_REVIEW') && s('NEEDS_REVIEW', 'DRAFT') && !s('NEEDS_REVIEW', 'APPROVED'))
  cek('cancel hanya sebelum klaim (AC-18)', P.bolehCancel('DRAFT') && P.bolehCancel('APPROVED') && !P.bolehCancel('QUEUED_FAKE') && !P.bolehCancel('FAKE_SENT'))
  cek('setiap transisi sah wajib audit', P.STATUS_PESAN.every((a) => P.STATUS_PESAN.every((b) => P.transisiWajibAudit(a, b) === s(a, b))))
  cek('status tak dikenal ditolak', !s('X', 'DRAFT') && !s('DRAFT', 'SENT'))

  const g = P.gerbangApprovalSend
  cek('TS-16: tanpa approval → APPROVAL_REQUIRED (ACK sinyal tak pernah masuk gerbang)', g({ approval: null, snapshotFingerprint: 'abc' }).alasan === 'APPROVAL_REQUIRED')
  cek('TS-16: objek berstatus ACKNOWLEDGED bukan approval → APPROVAL_REQUIRED', g({ approval: { status: 'ACKNOWLEDGED', proposalHash: 'abc' }, snapshotFingerprint: 'abc' }).alasan === 'APPROVAL_REQUIRED')
  cek('approval PENDING/REJECTED/EXPIRED → APPROVAL_REQUIRED', ['PENDING', 'REJECTED', 'EXPIRED'].every((st) => g({ approval: { status: st, proposalHash: 'abc' }, snapshotFingerprint: 'abc' }).alasan === 'APPROVAL_REQUIRED'))
  cek('approval atas snapshot lain → APPROVAL_STALE', g({ approval: { status: 'APPROVED', proposalHash: 'lama' }, snapshotFingerprint: 'baru' }).alasan === 'APPROVAL_STALE')
  cek('approval APPROVED + fingerprint cocok → lolos', g({ approval: { status: 'APPROVED', proposalHash: 'abc' }, snapshotFingerprint: 'abc' }).ok)
  cek('fingerprint kosong tak pernah lolos', g({ approval: { status: 'APPROVED', proposalHash: '' }, snapshotFingerprint: '' }).alasan === 'APPROVAL_STALE')
  cek('gerbangApprovalSend tak menerima parameter sinyal (ACK ≠ approval)', !/reviewState|sinyal/i.test(P.gerbangApprovalSend.toString()))

  cek('Q8: kebijakan approval WA-1 TANPA TTL produk', P.KEBIJAKAN_APPROVAL_WA1.ttlProdukJam === null)
  cek('Q8: tak ada angka 720 di kebijakan komunikasi', !/\b720\b/.test(baca('src/services/communication/comm-policy.ts').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')))
  cek('kebijakan approval: non-produksi, penyedia FAKE, komunikasi eksternal tidak diaktifkan', P.KEBIJAKAN_APPROVAL_WA1.hanyaNonProduksi === true && P.KEBIJAKAN_APPROVAL_WA1.penyedia === 'FAKE' && P.KEBIJAKAN_APPROVAL_WA1.komunikasiEksternalDiaktifkan === false)
  cek('TS-15: EXTERNAL_COMMUNICATION tetap tanpa setuju-sendiri (tah-policy tak berubah)', TAH.SETUJU_SENDIRI_BAWAAN.EXTERNAL_COMMUNICATION === false)
  cek('TS-15: originator memutuskan kelas EXTERNAL_COMMUNICATION → SELF_APPROVAL_FORBIDDEN', TAH.bolehMemutuskan({ pemutus: { userId: 'u1', role: 'ADMIN' }, peranWajib: ['ADMIN', 'MANAJER_OPERASI'], kelas: 'EXTERNAL_COMMUNICATION', setujuSendiriJenis: true, originatorUserId: 'u1' }).kode === 'SELF_APPROVAL_FORBIDDEN')
  cek('kode alasan PRD §13.3 lengkap + Q4', ['EVENT_NOT_ALLOWED', 'SOURCE_NOT_FOUND', 'SOURCE_DELETED', 'SOURCE_SUPERSEDED', 'SCHEDULE_FIRST_SET', 'SCHEDULE_CLEARED', 'PORT_MISSING', 'PORT_AMBIGUOUS', 'TIMEZONE_MISSING', 'TIMEZONE_INVALID', 'TIME_IN_FUTURE', 'REQUIRED_DATA_MISSING', 'CONTACT_INELIGIBLE', 'CONSENT_NOT_GRANTED', 'UNAUTHORIZED', 'PREVIEW_REQUIRED', 'APPROVAL_REQUIRED', 'APPROVAL_STALE', 'SELF_APPROVAL_FORBIDDEN', 'MODE_NOT_FAKE', 'ENV_NOT_ALLOWED', 'FEATURE_DISABLED', 'ALREADY_FAKE_SENT', 'AUDIT_PERSIST_FAILED', 'FAKE_SIMULATED_FAILURE', 'SIGNAL_DISMISSED', 'SIGNAL_EXPIRED'].every((k) => P.KODE_ALASAN.includes(k)))
  cek('kode alasan unik', new Set(P.KODE_ALASAN).size === P.KODE_ALASAN.length)
  cek('D-2B-03: kode alasan REVISED ada (revisi lama → CANCELED)', P.KODE_ALASAN.includes('REVISED') && P.transisiPesanSah('PREVIEWED', 'CANCELED') && P.transisiPesanSah('NEEDS_REVIEW', 'CANCELED'))
  cek('D-2B-05: status candidate PERSIS ACTIVE, BLOCKED', P.STATUS_CANDIDATE.join() === 'ACTIVE,BLOCKED')
  cek('D-2C-01: PREVIEWED → BLOCKED dan NEEDS_REVIEW → BLOCKED (hard block); tak ada pelebaran lain', P.transisiPesanSah('PREVIEWED', 'BLOCKED') && P.transisiPesanSah('NEEDS_REVIEW', 'BLOCKED') && !P.transisiPesanSah('PREVIEWED', 'QUEUED_FAKE') && !P.transisiPesanSah('NEEDS_REVIEW', 'APPROVED') && !P.transisiPesanSah('BLOCKED', 'DRAFT'))
  cek('D-2B-04: sifat alasan — KERAS persis 9 kode, PULIH persis 6 kode, keduanya terpisah', P.ALASAN_KERAS.join() === 'SOURCE_NOT_FOUND,SOURCE_DELETED,SOURCE_SUPERSEDED,SCHEDULE_FIRST_SET,SCHEDULE_CLEARED,EVENT_NOT_ALLOWED,SIGNAL_DISMISSED,SIGNAL_EXPIRED,SIGNAL_STATE_INVALID' && P.ALASAN_PULIH.join() === 'TIMEZONE_MISSING,TIMEZONE_INVALID,PORT_MISSING,PORT_AMBIGUOUS,REQUIRED_DATA_MISSING,TIME_IN_FUTURE' && P.ALASAN_KERAS.every((k) => !P.ALASAN_PULIH.includes(k)))
  cek('sifatAlasanPrepare: KERAS/PULIH/TOLAK', P.sifatAlasanPrepare('SOURCE_DELETED') === 'KERAS' && P.sifatAlasanPrepare('TIMEZONE_MISSING') === 'PULIH' && ['FEATURE_DISABLED', 'CONTACT_INELIGIBLE', 'ALREADY_FAKE_SENT', 'UNAUTHORIZED'].every((k) => P.sifatAlasanPrepare(k) === 'TOLAK'))
  cek('semua alasan yang bisa dihasilkan revalidasi sumber/kelayakan sinyal tergolong KERAS atau PULIH', ['EVENT_NOT_ALLOWED', 'SOURCE_NOT_FOUND', 'SOURCE_DELETED', 'SOURCE_SUPERSEDED', 'SCHEDULE_FIRST_SET', 'SCHEDULE_CLEARED', 'PORT_MISSING', 'PORT_AMBIGUOUS', 'TIMEZONE_MISSING', 'TIMEZONE_INVALID', 'TIME_IN_FUTURE', 'REQUIRED_DATA_MISSING', 'SIGNAL_DISMISSED', 'SIGNAL_EXPIRED', 'SIGNAL_STATE_INVALID'].every((k) => P.sifatAlasanPrepare(k) !== 'TOLAK'))
  cek('D-2D-03: kode alasan APPROVAL_REJECTED ada & bukan hasil revalidasi (TOLAK)', P.KODE_ALASAN.includes('APPROVAL_REJECTED') && P.sifatAlasanPrepare('APPROVAL_REJECTED') === 'TOLAK' && P.sifatAlasanPrepare('APPROVAL_STALE') === 'TOLAK')
  cek('D-2D-02/03: PREVIEWED → APPROVED dan PREVIEWED → CANCELED sah; tak ada state "menunggu approval" baru', P.transisiPesanSah('PREVIEWED', 'APPROVED') && P.transisiPesanSah('PREVIEWED', 'CANCELED') && P.STATUS_PESAN.length === 9)
  cek('D-2B-09: status attempt PERSIS QUEUED_FAKE, FAKE_SENT, FAKE_FAILED (subset STATUS_PESAN)', P.STATUS_ATTEMPT.join() === 'QUEUED_FAKE,FAKE_SENT,FAKE_FAILED' && P.STATUS_ATTEMPT.every((x) => P.STATUS_PESAN.includes(x)))
}

// =========================================================================== 10
bagian('[10] TEST_FIXTURE (Q3)')
{
  cek('ada fixture, semuanya bertanda TEST_FIXTURE di penanda & nama', F.FIXTURE_PENERIMA.length >= 1 && F.FIXTURE_PENERIMA.every((f) => f.penanda === 'TEST_FIXTURE' && f.id.includes('TEST_FIXTURE') && f.nama.startsWith('TEST_FIXTURE')))
  cek('OD-2A-05: pengenal uji eksplisit TEST_FIXTURE_WA_nnn', F.FIXTURE_PENERIMA.every((f) => /^TEST_FIXTURE_WA_\d{3}$/.test(f.pengenal)))
  cek('OD-2A-05: fixture tanpa nomor telepon / semantik E.164 (tak ada "+" atau medan nomor)', F.FIXTURE_PENERIMA.every((f) => !('nomor' in f) && !/^\+|\d{8,}/.test(f.pengenal)))
  cek('OD-2A-05: sumber fixture tanpa angka berbentuk telepon', !/\+\d{6,}|\b0\d{9,}\b/.test(baca('src/services/communication/comm-fixture.ts')))
  cek('id & pengenal fixture unik', new Set(F.FIXTURE_PENERIMA.map((f) => f.id)).size === F.FIXTURE_PENERIMA.length && new Set(F.FIXTURE_PENERIMA.map((f) => f.pengenal)).size === F.FIXTURE_PENERIMA.length)
  cek('pengirimanEksternal selalu false', F.FIXTURE_PENERIMA.every((f) => f.pengirimanEksternal === false))
  cek('bukti izin bertipe TEST_FIXTURE dan menyatakan BUKAN consent klien', F.FIXTURE_PENERIMA.every((f) => f.buktiIzin.jenis === 'TEST_FIXTURE' && /BUKAN consent klien/.test(f.buktiIzin.keterangan)))
  cek('skenario FAKE ketiganya tercakup', ['SUCCESS', 'FAIL_BEFORE_ACCEPT', 'FAIL_ONCE_THEN_SUCCESS'].every((s) => F.FIXTURE_PENERIMA.some((f) => f.skenario === s)))
  cek('fixture beku (tak bisa diubah saat jalan)', Object.isFrozen(F.FIXTURE_PENERIMA) && F.FIXTURE_PENERIMA.every((f) => Object.isFrozen(f) && Object.isFrozen(f.buktiIzin)))
  cek('pilih fixture terdaftar → lolos', F.pilihPenerimaFixture('WA1_TEST_FIXTURE_SUCCESS').ok)
  cek('id tak terdaftar / nomor bebas → CONTACT_INELIGIBLE (FR-09)', ['TEST_FIXTURE_WA_999', 'nomor-bebas', 'lain', null, undefined].every((x) => F.pilihPenerimaFixture(x).alasan === 'CONTACT_INELIGIBLE'))
  const src = baca('src/services/communication/comm-fixture.ts').replace(/\/\/.*$/gm, '')
  cek('fixture tak merujuk Principal/Customer/DB/env', !/principal|customer|prisma|process\.env|forTenant/i.test(src))
}

// =========================================================================== 11
bagian('[11] JSON kanonik & sidik jari lokal')
{
  const j = H.jsonKanonikKomunikasi
  cek('urutan kunci tak berpengaruh', j({ b: 1, a: { d: 2, c: [3, { f: 1, e: 2 }] } }) === j({ a: { c: [3, { e: 2, f: 1 }], d: 2 }, b: 1 }))
  cek('undefined pada objek dibuang', j({ a: 1, b: undefined }) === '{"a":1}')
  cek('nilai tanpa bentuk stabil ditolak (NaN, Infinity, Date, BigInt, fungsi)', [NaN, Infinity, new Date(0), 1n, () => 1].every((v) => melempar(() => j({ v }))))
  const s1 = H.sidikJariKomunikasi('WA1_SNAPSHOT', { body: 'x', b: 2 })
  cek('sidik deterministik (sha256 hex 64)', s1 === H.sidikJariKomunikasi('WA1_SNAPSHOT', { b: 2, body: 'x' }) && /^[0-9a-f]{64}$/.test(s1))
  cek('domain berbeda → sidik berbeda', s1 !== H.sidikJariKomunikasi('WA1_SOURCE', { body: 'x', b: 2 }))
  cek('tak mengimpor helper intake (tanpa coupling sidik rilis produksi)', !/intake/.test(baca('src/services/communication/comm-hash.ts').replace(/\/\/.*$/gm, '')))
}

// =========================================================================== 12
bagian('[12] Egress & lingkup Step 2A')
{
  cek('NOL panggilan jaringan selama seluruh uji (fetch/http/https/net/tls/dns/WebSocket)', egress.length === 0, egress.join(','))
  const dir = join(AKAR, 'src/services/communication')
  const berkas = readdirSync(dir).filter((f) => f.endsWith('.ts')).sort()
  const MURNI = ['comm-fake-provider.ts', 'comm-fixture.ts', 'comm-hash.ts', 'comm-policy.ts', 'comm-template.ts']
  const SERVICE = 'communication.service.ts'
  const APPROVAL = 'communication-approval.service.ts'
  const SEND = 'communication-send.service.ts'
  const CANCEL = 'communication-cancel.service.ts'
  const READ = 'communication-read.service.ts'
  const ACCESS = 'comm-access.ts'
  cek('modul komunikasi = berkas murni (2A + penyedia FAKE 2E) + service Prepare (2C) + approval (2D) + Send (2E) + Cancel (2F) + baca (2G) + akses UI (2I)', berkas.join() === [...MURNI, SERVICE, APPROVAL, SEND, CANCEL, READ, ACCESS].sort().join(), berkas.join())
  const tanpaKomentar = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  {
    const kode = tanpaKomentar(readFileSync(join(dir, ACCESS), 'utf8'))
    const imp = [...kode.matchAll(/^import\b[\s\S]*?from '([^']+)'/gm)].map((x) => x[1])
    cek(`${ACCESS}: hanya pagar Hub + gerbang WA-1 (impor automation/access & comm-policy; tanpa DB/jaringan; env hanya untuk bacaKonfigurasiKomunikasi)`, imp.sort().join() === ['../automation/access', './comm-policy'].join() && !/prisma|forTenant|fetch\(|\$queryRaw/.test(kode) && [...kode.matchAll(/process\.env/g)].length === 1 && /bolehAksesAutomation\(pengguna\) && bacaKonfigurasiKomunikasi\(process\.env\)\.aktif/.test(kode))
  }
  const POLA_JARINGAN = /\bfetch\b|https?:|node:(http|https|net|tls|dns|dgram|http2|child_process)|['"](http|https|net|tls|dns|ws|undici|axios|node-fetch)['"]|WebSocket|XMLHttpRequest/
  const POLA_META = /wa\.me|graph\.facebook|whatsapp-web|baileys|twilio|@whiskeysockets|whatsapp-cloud/i
  for (const f of MURNI) {
    const kode = tanpaKomentar(readFileSync(join(dir, f), 'utf8'))
    const imporJalan = [...kode.matchAll(/^import\s+(?!type\b).*$/gm)].map((x) => x[0])
    const izin = f === 'comm-hash.ts' ? ["import { createHash } from 'node:crypto'"] : []
    cek(`${f}: impor saat jalan hanya yang diizinkan`, imporJalan.every((i) => izin.includes(i)), imporJalan.join(' | '))
    cek(`${f}: tanpa fetch/http/https/net/tls/dns/WebSocket/XMLHttpRequest`, !POLA_JARINGAN.test(kode))
    cek(`${f}: tanpa Meta/WhatsApp SDK atau wa.me`, !POLA_META.test(kode))
    cek(`${f}: tanpa DB/env/LLM`, !/prisma|forTenant|process\.env|openrouter|lib\/ai|anthropic|\$queryRaw|\$executeRaw/i.test(kode))
  }
  const sumberImpor = (kode) => [...kode.matchAll(/^import\b[\s\S]*?from '([^']+)'/gm)].map((x) => x[1])
  const IZIN_IMPOR = {
    [SERVICE]: ['@prisma/client', '../context', '../errors', '../tenant-db', '../finance/audit', '../automation/access', '../master/voyage-dates', '../tah/tah-policy', './comm-policy', './comm-template', './comm-fixture', './comm-hash'],
    [APPROVAL]: ['@prisma/client', '../context', '../errors', '../tenant-db', '../automation/gate', '../tah/registry', '../tah/tah-policy', './comm-policy', './comm-hash', './communication.service'],
    [CANCEL]: ['../context', '../errors', '../tenant-db', '../tah/tah-policy', './comm-policy', './communication.service', './communication-approval.service'],
    [READ]: ['@prisma/client', '../context', '../errors', '../tenant-db', './comm-policy', './communication.service'],
  }
  for (const f of [SERVICE, APPROVAL, CANCEL]) {
    const kode = tanpaKomentar(readFileSync(join(dir, f), 'utf8'))
    const imp = sumberImpor(kode)
    cek(`${f}: impor hanya dari daftar izin (tanpa @/lib/prisma, lib/ai, route, UI)`, imp.length > 0 && imp.every((x) => IZIN_IMPOR[f].includes(x)), imp.join(' | '))
    cek(`${f}: tanpa fetch/http/https/net/tls/dns/WebSocket/XMLHttpRequest`, !POLA_JARINGAN.test(kode))
    cek(`${f}: tanpa Meta/WhatsApp SDK atau wa.me`, !POLA_META.test(kode))
    cek(`${f}: DB hanya lewat forTenant (tanpa raw SQL / LLM)`, /forTenant\(ctx\)/.test(kode) && !/\$queryRaw|\$executeRaw|openrouter|lib\/ai|anthropic/i.test(kode))
    cek(`${f}: tanpa Send/Attempt/provider (tanpa CommunicationAttempt, penyedia, state kirim FAKE)`, !/communicationAttempt|CommunicationAttempt|penyedia|provider|'QUEUED_FAKE'|'FAKE_SENT'|'FAKE_FAILED'/i.test(kode))
    cek(`${f}: tak pernah MENULIS successKey / fakeReceipt (blok data)`, !/data:\s*\{[^}]*\b(successKey|fakeReceipt)\b/.test(kode))
  }
  {
    const kode = tanpaKomentar(readFileSync(join(dir, SERVICE), 'utf8'))
    cek(`${SERVICE}: process.env HANYA untuk gerbang WA`, [...kode.matchAll(/process\.env/g)].length === 1 && /bacaKonfigurasiKomunikasi\(process\.env\)/.test(kode))
    cek(`${SERVICE}: TIDAK membuat approval & tak memuat registry (hanya menghentikan approval tertaut)`, !/tahApprovalRequest\.create|tah\/registry|JENIS_APPROVAL_TAH/.test(kode) && /tahApprovalRequest\.updateMany/.test(kode))
  }
  {
    const kode = tanpaKomentar(readFileSync(join(dir, CANCEL), 'utf8'))
    cek(`${CANCEL}: tanpa process.env (gerbang lewat gerbang() service 2C)`, !/process\.env/.test(kode) && /gerbang\(ctx\)/.test(kode))
    cek(`${CANCEL}: tak menulis approval sendiri (hanya hentikanApprovalTertaut) & tak memuat registry`, !/tahApprovalRequest\.|tah\/registry|JENIS_APPROVAL/.test(kode) && /hentikanApprovalTertaut\(/.test(kode))
    cek(`${CANCEL}: memegang kunciCandidate sebelum membaca ulang pesan (AC-18)`, kode.indexOf('kunciCandidate(tx, c)') > 0 && kode.indexOf('kunciCandidate(tx, c)') < kode.indexOf('select: PILIH_PESAN_BATAL'))
    cek(`${CANCEL}: satu-satunya state tujuan = CANCELED dengan reasonCode CANCELED_BY_USER`, [...kode.matchAll(/state: '([A-Z_]+)'/g)].every((x) => x[1] === 'CANCELED') && /const ALASAN_BATAL: KodeAlasan = 'CANCELED_BY_USER'/.test(kode))
  }
  {
    const kode = tanpaKomentar(readFileSync(join(dir, READ), 'utf8'))
    const imp = sumberImpor(kode)
    cek(`${READ}: impor hanya dari daftar izin (tanpa lib/ai, route, UI, registry, penyedia)`, imp.length > 0 && imp.every((x) => IZIN_IMPOR[READ].includes(x)), imp.join(' | '))
    cek(`${READ}: READ-ONLY — tanpa create/update/delete/upsert/raw SQL/audit`, !/\.(create|createMany|update|updateMany|delete|deleteMany|upsert)\(|\$executeRaw|\$queryRaw|catatAudit|auditKomunikasi|kunciCandidate|hentikanApprovalTertaut/.test(kode))
    cek(`${READ}: tanpa fetch/http/https/net/tls/dns/WebSocket/XMLHttpRequest, Meta/WA SDK, process.env, LLM`, !POLA_JARINGAN.test(kode) && !POLA_META.test(kode) && !/process\.env|openrouter|lib\/ai|anthropic/i.test(kode))
    cek(`${READ}: setiap fungsi publik melewati gerbang(ctx) dan membaca lewat forTenant(ctx) REPEATABLE READ`, [...kode.matchAll(/export async function (\w+)/g)].length === 4 && [...kode.matchAll(/^  gerbang\(ctx\)$/gm)].length === 4 && /forTenant\(ctx\)\.\$transaction\(fn, \{ isolationLevel: Prisma\.TransactionIsolationLevel\.RepeatableRead \}\)/.test(kode))
    cek(`${READ}: daftar memakai samarkanPengenal; tak mengembalikan proposal / idempotencyKey / ipAddress`, /penerima: samarkanPengenal\(m\.recipientIdentifier\)/.test(kode) && !/proposal: true|idempotencyKey: true|ipAddress: true|logicalMessageKey: true/.test(kode))
  }
  {
    const kode = tanpaKomentar(readFileSync(join(dir, APPROVAL), 'utf8'))
    cek(`${APPROVAL}: process.env HANYA NODE_ENV untuk jenisBolehDiLingkungan`, [...kode.matchAll(/process\.env/g)].length === 1 && /jenisBolehDiLingkungan\(j, process\.env\.NODE_ENV\)/.test(kode))
    cek(`${APPROVAL}: memakai bolehMemutuskan & validasiRegistry TAH (tanpa kerangka approval kedua)`, /bolehMemutuskan\(/.test(kode) && /validasiRegistry\(/.test(kode) && /tahApprovalRequest\.create\(/.test(kode))
    cek(`${APPROVAL}: proposalHash = snapshotFingerprint, basisFingerprint = sourceFingerprint (tanpa hash alternatif)`, /proposalHash: m\.snapshotFingerprint/.test(kode) && /basisFingerprint: m\.sourceFingerprint/.test(kode) && !/createHash|sidikJariKomunikasi\(/.test(kode))
    cek(`${APPROVAL}: idempotencyKey = WA1:<messageId>`, /`WA1:\$\{messageId\}`/.test(kode))
  }
  {
    // Step 2E — service Send: satu-satunya penulis CommunicationAttempt / successKey / fakeReceipt.
    const kode = tanpaKomentar(readFileSync(join(dir, SEND), 'utf8'))
    const izin = ['@prisma/client', '../context', '../errors', '../tenant-db', '../tah/registry', '../tah/tah-policy', './comm-policy', './comm-template', './comm-fixture', './comm-hash', './comm-fake-provider', './communication.service', './communication-approval.service']
    const imp = sumberImpor(kode)
    cek(`${SEND}: impor hanya dari daftar izin (tanpa @/lib/prisma, lib/ai, route, UI)`, imp.length > 0 && imp.every((x) => izin.includes(x)), imp.join(' | '))
    cek(`${SEND}: registry hanya diimpor sebagai TIPE (definisi WA lewat jenisWa 2D)`, /import type \{ DefinisiApprovalWaFake \} from '\.\.\/tah\/registry'/.test(kode) && !/JENIS_APPROVAL_TAH|JENIS_APPROVAL_WA_FAKE/.test(kode))
    cek(`${SEND}: tanpa fetch/http/https/net/tls/dns/WebSocket/XMLHttpRequest`, !POLA_JARINGAN.test(kode))
    cek(`${SEND}: tanpa Meta/WhatsApp SDK atau wa.me`, !POLA_META.test(kode))
    cek(`${SEND}: DB hanya lewat forTenant (tanpa raw SQL / LLM) dan TANPA process.env (gerbang lewat 2C/2D)`, /forTenant\(ctx\)/.test(kode) && !/\$queryRaw|\$executeRaw|openrouter|lib\/ai|anthropic|process\.env/i.test(kode))
    cek(`${SEND}: transaksi Send REPEATABLE READ (K2) + denganUlang`, /isolationLevel: Prisma\.TransactionIsolationLevel\.RepeatableRead/.test(kode) && /denganUlang\(/.test(kode))
    cek(`${SEND}: TIDAK membuat approval & TIDAK mengubah keputusan approval (hanya execution*)`, !/tahApprovalRequest\.create/.test(kode) && !/data:\s*\{[^}]*\b(status|decidedByUserId|decidedAt|proposalHash|basisFingerprint)\s*:/.test(kode))
    cek(`${SEND}: eksekusi approval hanya lewat transisiEksekusiSah beku`, /transisiEksekusiSah\(a\.executionStatus, 'RUNNING', 'APPROVED'\)/.test(kode) && /transisiEksekusiSah\('RUNNING', 'SUCCEEDED', 'APPROVED'\)/.test(kode) && /transisiEksekusiSah\('RUNNING', 'FAILED', 'APPROVED'\)/.test(kode))
    cek(`${SEND}: penyedia HANYA FAKE murni (tanpa pemilihan penyedia dari input)`, /kirimLewatPenyediaFake\(/.test(kode) && !/input\??\.(provider|penyedia|scenario|skenario|mode|idempotencyKey|tenantId)/.test(kode))
    cek(`${SEND}: review PR #10 — batas percobaan lewat bolehUlangiEksekusi BEKU (tanpa angka batas sendiri) & klaim mengunci candidate`, /bolehUlangiEksekusi\(a\.executionStatus, percobaan\)/.test(kode) && /MAKS_PERCOBAAN_EKSEKUSI/.test(kode) && !/percobaan\s*[<>]=?\s*\d/.test(kode) && /await kunciCandidate\(tx, c\)\s*\n\s*const sekarang = new Date\(\)\s*\n\s*const na = await tx\.tahApprovalRequest\.updateMany/.test(kode))
    cek(`${SERVICE}: review PR #10 — revisi Prepare mengunci candidate SEBELUM memeriksa successKey/revisi aktif`, /await kunciCandidate\(tx, c\)\s*\n\s*const sukses = await tx\.communicationMessage\.findFirst/.test(tanpaKomentar(readFileSync(join(dir, SERVICE), 'utf8'))))
    cek(`${SEND}: kunci idempotensi diturunkan server (kunciIdempotensiSend dengan tenant dari ctx)`, /kunciIdempotensiSend\(\{ tenantId: ctx\.tenantId, messageId: m\.id, snapshotFingerprint: m\.snapshotFingerprint, requestKey \}\)/.test(kode))
  }
  {
    // Step 2E — penyedia FAKE: deterministik (tanpa jam/acak/env/crypto) — syarat aman transaksi diulang.
    const kode = tanpaKomentar(readFileSync(join(dir, 'comm-fake-provider.ts'), 'utf8'))
    cek('comm-fake-provider.ts: tanpa jam, acak, timer, crypto, atau impor saat jalan', !/\bDate\b|Math\.random|performance|setTimeout|setInterval|crypto|require\(|import\(/.test(kode) && [...kode.matchAll(/^import\s+(?!type\b)/gm)].length === 0)
  }
  // Batas lingkup — diamandemen secara sengaja pada slice yang memperluasnya. Step 2B
  // (persistensi) mengganti tiga kunci "tanpa schema/migrasi/TENANT_MODELS" menjadi bentuk 2B PERSIS;
  // rincian schema & DB diuji prisma/check-comm-schema.mjs.
  const schema = baca('prisma/schema.prisma')
  const modelKom = [...schema.matchAll(/^model (Communication\w*) \{/gm)].map((m) => m[1]).sort()
  cek('Step 2B: schema berisi PERSIS tiga model Communication*', modelKom.join() === 'CommunicationAttempt,CommunicationCandidate,CommunicationMessage', modelKom.join())
  const migWa = readdirSync(join(AKAR, 'prisma/migrations')).filter((d) => /wa1|communication/i.test(d))
  cek('Step 2B: PERSIS satu migrasi WA (…_wa1_step2b_communication)', migWa.length === 1 && /^\d{14}_wa1_step2b_communication$/.test(migWa[0]), migWa.join())
  cek('Step 2B: TENANT_MODELS memuat PERSIS tiga model Communication*', [...TENANT_MODELS].filter((m) => /^Communication/.test(m)).sort().join() === modelKom.join())
  const waReg = JENIS_APPROVAL_WA_FAKE
  cek('Step 2D R1: definisi WA terpisah selaras KEBIJAKAN_APPROVAL_WA1 (non-produksi, tanpa TTL, internal, tak bisa disunting)', waReg.kind === P.KEBIJAKAN_APPROVAL_WA1.kind && waReg.hanyaNonProduksi === P.KEBIJAKAN_APPROVAL_WA1.hanyaNonProduksi && waReg.kedaluwarsaJam === P.KEBIJAKAN_APPROVAL_WA1.ttlProdukJam && waReg.risiko === 'INTERNAL_WRITE' && waReg.bisaDiedit === false && waReg.setujuSendiri === true)
  cek('Step 2D R1: registry TAH lama tak memuat WA_INTERNAL_FAKE_TEST / CLIENT_WA_UPDATE (kontrak beku utuh)', !JENIS_APPROVAL_TAH.some((j) => ['WA_INTERNAL_FAKE_TEST', 'CLIENT_WA_UPDATE'].includes(j.kind)))
  const pembuatApproval = readdirSync(join(AKAR, 'src'), { recursive: true })
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .map((f) => `src/${f}`)
    .filter((f) => /tahApprovalRequest\.create\(/.test(baca(f)))
  cek('Step 2D R1: SATU-SATUNYA pembuat TahApprovalRequest = service approval WA (tanpa jalur NULL-TTL umum)', pembuatApproval.join() === 'src/services/communication/communication-approval.service.ts', pembuatApproval.join())
  const kodeAp = baca('src/services/communication/communication-approval.service.ts')
  cek('Step 2D R1: kind & expiresAt diturunkan dari definisi WA, bukan dari input', /kind: jenis\.kind,/.test(kodeAp) && /expiresAt: jenis\.kedaluwarsaJam,/.test(kodeAp) && /const j = JENIS_APPROVAL_WA_FAKE/.test(kodeAp) && !/input\??\.(kind|expiresAt|proposalHash|requiredRoles|actionRisk)/.test(kodeAp))
  const rujuk = /services\/communication/
  const jelajah = (rel, hasil = []) => {
    for (const d of readdirSync(join(AKAR, rel), { withFileTypes: true })) {
      const p = `${rel}/${d.name}`
      if (d.isDirectory()) jelajah(p, hasil)
      else if (/\.(ts|tsx)$/.test(d.name) && !p.startsWith('src/services/communication/')) hasil.push(p)
    }
    return hasil
  }
  const perujuk = jelajah('src').filter((p) => rujuk.test(baca(p)))
  // Step 2H — SATU-SATUNYA perujuk modul komunikasi di luar foldernya = 11 route API tipis berikut.
  const API = 'src/app/api/automation/communications'
  const RUTE = {
    'candidates/route.ts': ['GET', 'POST'],
    'candidates/[id]/route.ts': ['GET'],
    'candidates/[id]/history/route.ts': ['GET'],
    'candidates/[id]/revisions/route.ts': ['POST'],
    'messages/[id]/route.ts': ['GET'],
    'messages/[id]/preview/route.ts': ['POST'],
    'messages/[id]/approval-request/route.ts': ['POST'],
    'messages/[id]/send/route.ts': ['POST'],
    'messages/[id]/cancel/route.ts': ['POST'],
    'approvals/[id]/approve/route.ts': ['POST'],
    'approvals/[id]/reject/route.ts': ['POST'],
  }
  const harapRute = Object.keys(RUTE).map((r) => `${API}/${r}`).sort()
  {
    const http = tanpaKomentar(baca('src/services/http.ts'))
    const isiKetat = http.slice(http.indexOf('export async function jsonBodyKetat'))
    cek('Step 2H CSRF: jsonBodyKetat memanggil pastikanAsalSah PERTAMA, lalu mewajibkan application/json SEBELUM membaca body', /^export async function jsonBodyKetat[^{]*\{\s*pastikanAsalSah\(req\)\s*if \(!\/\^application\\\/json/.test(isiKetat) && isiKetat.indexOf('application') < isiKetat.indexOf('getReader'))
    cek('Step 2H CSRF: pastikanAsalSah menolak Sec-Fetch-Site selain same-origin dan Origin selain origin NEXTAUTH_URL (gagal tertutup)', /situs !== null && situs !== 'same-origin'/.test(http) && /!asal \|\| asal === 'null' \|\| asal !== asalAplikasi/.test(http) && /new URL\(process\.env\.NEXTAUTH_URL \?\? ''\)\.origin/.test(http))
  }
  // Step 2I — UI: halaman server (pagar bolehAksesKomunikasi) + komponen client (impor `type` saja).
  const UI_SERVER = ['src/app/(app)/automation/alerts/page.tsx', 'src/app/(app)/automation/communications/[id]/page.tsx', 'src/app/(app)/automation/communications/page.tsx', 'src/app/(app)/layout.tsx', 'src/app/(app)/voyages/[id]/page.tsx']
  const UI_CLIENT = ['src/components/automation/CommunicationList.tsx', 'src/components/automation/CommunicationWorkspace.tsx']
  cek('Step 2I: perujuk modul komunikasi di luar foldernya = PERSIS 11 route API + 5 berkas server UI + 2 komponen client', perujuk.sort().join() === [...harapRute, ...UI_SERVER, ...UI_CLIENT].sort().join(), perujuk.join(', '))
  for (const f of UI_SERVER) {
    const kode = tanpaKomentar(baca(f))
    const impKom = [...kode.matchAll(/^import\b[\s\S]*?from '(@\/services\/communication\/[^']+)'/gm)].map((x) => x[1])
    cek(`${f}: server UI hanya memakai comm-access (+ fixture & samaran untuk halaman detail), tanpa service bisnis`, impKom.every((x) => ['@/services/communication/comm-access', '@/services/communication/comm-fixture', '@/services/communication/comm-policy'].includes(x)) && /bolehAksesKomunikasi\(/.test(kode), impKom.join(' | '))
  }
  for (const f of ['src/app/(app)/automation/communications/page.tsx', 'src/app/(app)/automation/communications/[id]/page.tsx']) {
    cek(`${f}: halaman → notFound() bila bukan ADMIN/MANAJER_OPERASI + allowlist + flag WA-1 + non-produksi`, /if \(!bolehAksesKomunikasi\(ctx\)\) notFound\(\)/.test(baca(f)))
  }
  {
    const det = tanpaKomentar(baca('src/app/(app)/automation/communications/[id]/page.tsx'))
    cek('Step 2I: halaman detail meneruskan fixture dengan pengenal TERSAMAR saja (bukan pengenal utuh)', /samaran: samarkanPengenal\(f\.pengenal\)/.test(det) && !/pengenal: f\.pengenal|f\.pengenal \}/.test(det))
  }
  const KLIEN = [...UI_CLIENT, 'src/components/automation/comm-shared.tsx', 'src/components/automation/SignalList.tsx']
  for (const f of KLIEN) {
    const kode = tanpaKomentar(baca(f))
    const impServis = [...kode.matchAll(/^import\s+(type\s+)?[^'"]*?from '([^']+)'/gm)].filter((x) => x[2].startsWith('@/services/'))
    const fetchLain = [...kode.matchAll(/fetch\(([^)]*)/g)].map((x) => x[1]).filter((a) => !/^`\$\{API_KOMUNIKASI\}|^`\/api\/automation\/signals/.test(a.trim()))
    cek(`${f}: client — impor service HANYA \`import type\`; fetch hanya ke API (komunikasi/sinyal); tanpa prisma/forTenant/process.env`, /^'use client'/.test(baca(f)) && impServis.every((x) => x[1]) && fetchLain.length === 0 && !/prisma|forTenant|process\.env/.test(kode), fetchLain.join(' | '))
  }
  {
    const ws = tanpaKomentar(baca('src/components/automation/CommunicationWorkspace.tsx'))
    const sh = tanpaKomentar(baca('src/components/automation/comm-shared.tsx'))
    cek('Step 2I: label "SIMULASI — TIDAK DIKIRIM KE WHATSAPP" (PRD §8) ada & dipakai di daftar dan ruang kerja', /id: 'SIMULASI — TIDAK DIKIRIM KE WHATSAPP'/.test(sh) && /<SimulasiBanner/.test(ws) && /<SimulasiBanner/.test(tanpaKomentar(baca('src/components/automation/CommunicationList.tsx'))))
    cek('Step 2I: tanpa input nomor bebas / editor body (P-02) — penerima hanya <select> fixture; textarea hanya untuk catatan', !/type="tel"|contentEditable|setBody|recipientIdentifier:\s*[a-z]/.test(ws) && /recipientFixtureId: fixture/.test(ws) && [...ws.matchAll(/<textarea/g)].length === 1 && /dialog\.catatan/.test(ws))
    cek('Step 2I: pengenal utuh hanya lewat tombol eksplisit (?recipient=full); FAKE Send memakai requestKey baru per klik + kunci sinkron', /\?recipient=full`/.test(ws) && /requestKey: kunciPermintaan\(\)/.test(ws) && /if \(kunci\.current\) return/.test(ws) && /'content-type': 'application\/json'/.test(sh))
  }
  const semuaBerkasApi = existsSync(join(AKAR, API)) ? jelajah(API) : []
  cek('Step 2H: folder API komunikasi hanya berisi 11 route.ts tersebut', semuaBerkasApi.sort().join() === harapRute.join(), semuaBerkasApi.join(', '))
  const IZIN_RUTE = ['@/services/http', '@/services/communication/communication.service', '@/services/communication/communication-read.service', '@/services/communication/communication-approval.service', '@/services/communication/communication-send.service', '@/services/communication/communication-cancel.service']
  for (const [r, metode] of Object.entries(RUTE)) {
    const f = `${API}/${r}`
    const kode = tanpaKomentar(baca(f))
    const imp = [...kode.matchAll(/^import\b[\s\S]*?from '([^']+)'/gm)].map((x) => x[1])
    const ekspor = [...kode.matchAll(/^export const (GET|POST|PUT|PATCH|DELETE) = withTenant\(/gm)].map((x) => x[1])
    const tulis = metode.includes('POST')
    cek(`${r}: tipis — impor hanya http + service komunikasi; metode ${metode.join('/')} lewat withTenant; tanpa prisma/fetch/env/LLM/console`,
      imp.every((x) => IZIN_RUTE.includes(x)) && ekspor.sort().join() === [...metode].sort().join() && !/prisma|forTenant|\bfetch\(|process\.env|lib\/ai|openrouter|anthropic|console\.|catatAudit/.test(kode),
      `${imp.join(' | ')} :: ${ekspor.join(',')}`)
    if (tulis) {
      cek(`${r}: POST memanggil gerbang(ctx) SEBELUM membaca body (jsonBodyKetat, bukan jsonBody)`, kode.indexOf('gerbang(ctx)') > 0 && kode.indexOf('gerbang(ctx)') < kode.indexOf('jsonBodyKetat(req)') && !/\bjsonBody\(/.test(kode))
    }
    if (/\[id\]\/(route|history\/route)\.ts$/.test(r) && metode.includes('GET')) {
      cek(`${r}: GET detail menyamarkan pengenal secara bawaan (recipient=full eksplisit untuk utuh)`, /r === null \|\| r === 'masked' \? 'SAMAR' : r === 'full' \? 'UTUH' : r/.test(kode))
    }
  }
}

// =========================================================================== 13
bagian('[13] Penyedia FAKE (Step 2E) — deterministik, tanpa egress')
{
  const DASAR = 'a'.repeat(64)
  const kirim = (skenario, attemptNo, dasarReceipt = DASAR) => FK.kirimLewatPenyediaFake({ skenario, attemptNo, dasarReceipt })
  const s1 = kirim('SUCCESS', 1)
  cek('SUCCESS → diterima, receipt fake_ + 32 hex dari dasar', s1.diterima === true && s1.receipt === `fake_${DASAR.slice(0, 32)}`)
  cek('setiap hasil: provider=FAKE, simulation=true, externalDelivery=false', [kirim('SUCCESS', 1), kirim('FAIL_BEFORE_ACCEPT', 1), kirim('FAIL_ONCE_THEN_SUCCESS', 1), kirim('FAIL_ONCE_THEN_SUCCESS', 2)].every((h) => h.provider === 'FAKE' && h.simulation === true && h.externalDelivery === false))
  cek('FAIL_BEFORE_ACCEPT → gagal FAKE_SIMULATED_FAILURE di setiap attempt', [1, 2, 3, 7].every((n) => kirim('FAIL_BEFORE_ACCEPT', n).diterima === false && kirim('FAIL_BEFORE_ACCEPT', n).alasan === 'FAKE_SIMULATED_FAILURE'))
  cek('FAIL_ONCE_THEN_SUCCESS → attempt 1 gagal, attempt ≥2 diterima', kirim('FAIL_ONCE_THEN_SUCCESS', 1).diterima === false && kirim('FAIL_ONCE_THEN_SUCCESS', 2).diterima === true && kirim('FAIL_ONCE_THEN_SUCCESS', 5).diterima === true)
  cek('deterministik: input sama → keluaran identik (100×)', Array.from({ length: 100 }, () => JSON.stringify(kirim('FAIL_ONCE_THEN_SUCCESS', 2))).every((x, _, a) => x === a[0]))
  cek('dasar receipt beda → receipt beda', kirim('SUCCESS', 1, 'b'.repeat(64)).receipt !== s1.receipt)
  cek('skenario tak dikenal / attemptNo tak sah / dasar receipt tak sah → melempar', melempar(() => kirim('LIVE', 1)) && melempar(() => kirim('SUCCESS', 0)) && melempar(() => kirim('SUCCESS', 1.5)) && melempar(() => kirim('SUCCESS', 1, 'xyz')))
  cek('kunciIdempotensiSend: requestKey sama, konteks beda (tenant/pesan/snapshot) → kunci beda', (() => {
    const dasar = { tenantId: 't1', messageId: 'm1', snapshotFingerprint: 'f1', requestKey: 'rk-00000001' }
    const k = H.kunciIdempotensiSend(dasar)
    return /^[0-9a-f]{64}$/.test(k) && k === H.kunciIdempotensiSend({ ...dasar }) && [{ tenantId: 't2' }, { messageId: 'm2' }, { snapshotFingerprint: 'f2' }, { requestKey: 'rk-00000002' }].every((u) => H.kunciIdempotensiSend({ ...dasar, ...u }) !== k)
  })())
  cek('dasarReceiptFake: deterministik per (kunci, attemptNo)', H.dasarReceiptFake({ idempotencyKey: 'k', attemptNo: 1 }) === H.dasarReceiptFake({ idempotencyKey: 'k', attemptNo: 1 }) && H.dasarReceiptFake({ idempotencyKey: 'k', attemptNo: 1 }) !== H.dasarReceiptFake({ idempotencyKey: 'k', attemptNo: 2 }))
  cek('NOL panggilan jaringan selama uji penyedia FAKE', egress.length === 0, egress.join(','))
}

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`)
process.exit(gagal === 0 ? 0 : 1)
