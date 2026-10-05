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
const TAH = await import('../src/services/tah/tah-policy.ts')
const { JENIS_APPROVAL_TAH } = await import('../src/services/tah/registry.ts')
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
  cek('modul komunikasi hanya empat berkas murni Step 2A', berkas.join() === 'comm-fixture.ts,comm-hash.ts,comm-policy.ts,comm-template.ts', berkas.join())
  for (const f of berkas) {
    const s = readFileSync(join(dir, f), 'utf8')
    const kode = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    const imporJalan = [...kode.matchAll(/^import\s+(?!type\b).*$/gm)].map((x) => x[0])
    const izin = f === 'comm-hash.ts' ? ["import { createHash } from 'node:crypto'"] : []
    cek(`${f}: impor saat jalan hanya yang diizinkan`, imporJalan.every((i) => izin.includes(i)), imporJalan.join(' | '))
    cek(`${f}: tanpa fetch/http/https/net/tls/dns/WebSocket/XMLHttpRequest`, !/\bfetch\b|https?:|node:(http|https|net|tls|dns|dgram|http2|child_process)|['"](http|https|net|tls|dns|ws|undici|axios|node-fetch)['"]|WebSocket|XMLHttpRequest/.test(kode))
    cek(`${f}: tanpa Meta/WhatsApp SDK atau wa.me`, !/wa\.me|graph\.facebook|whatsapp-web|baileys|twilio|@whiskeysockets|whatsapp-cloud/i.test(kode))
    cek(`${f}: tanpa DB/env/LLM`, !/prisma|forTenant|process\.env|openrouter|lib\/ai|anthropic|\$queryRaw|\$executeRaw/i.test(kode))
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
  cek('Step 2A: registry TAH tanpa WA_INTERNAL_FAKE_TEST', !JENIS_APPROVAL_TAH.some((j) => j.kind === 'WA_INTERNAL_FAKE_TEST'))
  cek('Step 2A: belum ada route/halaman komunikasi', !existsSync(join(AKAR, 'src/app/api/automation/communications')) && !existsSync(join(AKAR, 'src/app/(app)/automation/communications')))
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
  cek('Step 2A: belum ada kode aplikasi yang memakai modul komunikasi', perujuk.length === 0, perujuk.join(', '))
}

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`)
process.exit(gagal === 0 ? 0 : 1)
