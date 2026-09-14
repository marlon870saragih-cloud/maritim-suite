// Uji murni Automation Hub — PRD-002 Step 5B.
//
// Jalankan:  node prisma/check-automation-policy.mjs      (tanpa DB, tanpa dev server)
//
// Lapis:
//   1. GERBANG — default mati, gagal tertutup, cocok lewat tenantId (bukan nama), peran.
//   2. KEBIJAKAN — keenam detektor, ambang D5, kunci dedupe, keputusan berhenti.
//   3. WAKTU — batas hari bisnis WITA, kebal zona mesin, semantik tanggal voyage D4 tetap.
//   4. PENYEDIA — tanpa penyedia, tanpa jaringan, tanpa data posisi.
//   5. KUNCI SUMBER — tak ada LLM/fetch, service tak menulis tabel operasional,
//      skema/migrasi/tenant-guard/route/job sesuai kontrak.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  bacaKonfigurasiAutomation,
  peranBolehAutomation,
  tenantBolehAutomation,
} from '../src/services/automation/gate.ts'
import {
  AMBANG_DATA_STALE_JAM,
  AMBANG_ETA_MUNDUR_HARI,
  AMBANG_TANGGAL_AKTUAL_JAM,
  DataSumberTidakSah,
  KODE_PERISTIWA_BERNILAI,
  alasanBerhenti,
  deteksiSinyal,
  selisihHariKalender,
  sinyalGalatMonitoring,
} from '../src/services/automation/monitoring-policy.ts'
import { penyediaTidakAda, statusPenyedia } from '../src/services/automation/provider.ts'
import { KODE_PERISTIWA, LABEL_PERISTIWA, USUL_JANGKAR } from '../src/services/ops/event-codes.ts'
import { tanggalBisnis, waktuBisnis } from '../src/lib/business-time.ts'
import { kunciTanggal } from '../src/services/master/voyage-dates.ts'
import { TENANT_MODELS } from '../src/services/tenant-guard.ts'

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
const JAM = 3_600_000

// =================================================================== 1. gerbang

console.log('\n[1] Gerbang fitur & tenant')
const ID_A = 'cmt2arl2i0000v7g82613796g'
const ID_B = 'cmqrpn1230002v7jkyex74epd'
cek('bawaan (env kosong) → MATI', bacaKonfigurasiAutomation({}).aktif === false && bacaKonfigurasiAutomation({}).alasan === 'NONAKTIF')
cek('flag "false" → MATI', bacaKonfigurasiAutomation({ AUTOMATION_MONITORING_ENABLED: 'false', AUTOMATION_TENANT_IDS: ID_A }).aktif === false)
cek('flag "TRUE"/"1"/"yes" → MATI (FLAG_TIDAK_SAH)', ['TRUE', '1', 'yes'].every((f) => {
  const k = bacaKonfigurasiAutomation({ AUTOMATION_MONITORING_ENABLED: f, AUTOMATION_TENANT_IDS: ID_A })
  return k.aktif === false && k.alasan === 'FLAG_TIDAK_SAH'
}))
cek('flag true + allowlist kosong → MATI (gagal tertutup)', bacaKonfigurasiAutomation({ AUTOMATION_MONITORING_ENABLED: 'true' }).alasan === 'ALLOWLIST_KOSONG')
cek('flag true + satu entri tak sah → SELURUHNYA MATI', (() => {
  const k = bacaKonfigurasiAutomation({ AUTOMATION_MONITORING_ENABLED: 'true', AUTOMATION_TENANT_IDS: `${ID_A},PT Tribuana Solusi Maritim` })
  return k.aktif === false && k.alasan === 'ALLOWLIST_TIDAK_SAH' && !tenantBolehAutomation(k, ID_A)
})())
const KONF = bacaKonfigurasiAutomation({ AUTOMATION_MONITORING_ENABLED: ' true ', AUTOMATION_TENANT_IDS: ` ${ID_A} ` })
cek('flag true + id sah → AKTIF', KONF.aktif && KONF.tenantIds.has(ID_A))
cek('tenant di allowlist diizinkan', tenantBolehAutomation(KONF, ID_A))
cek('tenant lain (nama hampir sama) DITOLAK', !tenantBolehAutomation(KONF, ID_B))
cek('nama perusahaan bukan identitas (ditolak)', !tenantBolehAutomation(KONF, 'PT Tribuana Solusi Maritim'))
cek('tenantId kosong/undefined ditolak', !tenantBolehAutomation(KONF, undefined) && !tenantBolehAutomation(KONF, ''))
cek('ADMIN & MANAJER_OPERASI diizinkan', peranBolehAutomation('ADMIN') && peranBolehAutomation('MANAJER_OPERASI'))
cek('OPERATOR/VIEWER/FINANCE/DIREKTUR/PENYUSUN_BIAYA/undefined ditolak',
  ['OPERATOR', 'VIEWER', 'FINANCE', 'DIREKTUR', 'PENYUSUN_BIAYA', undefined, 'admin'].every((r) => !peranBolehAutomation(r)))

// ================================================================== 2. kebijakan

const SEKARANG = new Date('2026-09-15T04:00:00.000Z') // 12:00 WITA
const opsi = (sekarang = SEKARANG) => ({
  sekarang,
  hariBisnis: tanggalBisnis(sekarang),
  petaJangkar: USUL_JANGKAR,
  labelPeristiwa: (k) => LABEL_PERISTIWA.id[k] ?? k,
  formatWaktu: (iso) => waktuBisnis(new Date(iso)),
})
const iso = (msLalu) => new Date(SEKARANG.getTime() - msLalu).toISOString()
const fakta = (ubah = {}) => ({
  voyageId: 'vUji',
  voyageNumber: 'VYG-UJI-1',
  status: 'CONFIRMED',
  dihapus: false,
  tanggal: { eta: '2026-10-01', etd: null, ata: null, atb: null, atd: null },
  audit: [],
  peristiwa: [],
  aktivitasTerakhir: iso(1 * JAM),
  mulaiPantau: iso(5 * JAM),
  ...ubah,
})
const auditTanggal = (id, lama, baru, medan, msLalu = 2 * JAM) => ({
  id,
  pada: iso(msLalu),
  lama: { peristiwa: 'UBAH_TANGGAL', ...lama },
  baru: { peristiwa: 'UBAH_TANGGAL', medan, ...baru },
})
const hanya = (hasil, kind) => hasil.filter((s) => s.kind === kind)

console.log('\n[2a] ETA_CHANGED')
{
  const h = deteksiSinyal(fakta({ audit: [auditTanggal('a1', { eta: '2026-10-01' }, { eta: '2026-10-03' }, ['eta'])] }), opsi())
  const s = hanya(h, 'ETA_CHANGED')
  cek('ETA mundur 2 hari → tepat 1 sinyal', s.length === 1, `n=${s.length}`)
  cek(`ETA mundur ≥ ${AMBANG_ETA_MUNDUR_HARI} hari → WARNING`, s[0]?.severity === 'WARNING')
  cek('dedupeKey = ETA_CHANGED:<voyage>:<audit>:<medan>', s[0]?.dedupeKey === 'ETA_CHANGED:vUji:a1:eta', s[0]?.dedupeKey)
  cek('sumber AUDIT_LOG merujuk id audit', s[0]?.sourceType === 'AUDIT_LOG' && s[0]?.sourceRef === 'a1')
  cek('before/after hanya medan yang berubah', JSON.stringify(s[0]?.before) === '{"eta":"2026-10-01"}' && JSON.stringify(s[0]?.after) === '{"eta":"2026-10-03"}')
  cek('penjelasan deterministik menyebut arah & selisih', s[0]?.explanation.includes('mundur 2 hari'), s[0]?.explanation)
  cek('rekomendasi tidak mengklaim kabar sudah terkirim', /tidak mengirim kabar/.test(s[0]?.recommendation ?? ''))
}
{
  const maju = hanya(deteksiSinyal(fakta({ audit: [auditTanggal('a2', { eta: '2026-10-03' }, { eta: '2026-10-02' }, ['eta'])] }), opsi()), 'ETA_CHANGED')
  cek('ETA maju 1 hari → INFO', maju.length === 1 && maju[0].severity === 'INFO' && maju[0].explanation.includes('maju 1 hari'))
  const etd = hanya(deteksiSinyal(fakta({ audit: [auditTanggal('a3', { etd: '2026-10-05' }, { etd: '2026-10-09' }, ['etd'])] }), opsi()), 'ETA_CHANGED')
  cek('ETD mundur → INFO (eskalasi D5 hanya untuk ETA)', etd.length === 1 && etd[0].severity === 'INFO')
  const set = hanya(deteksiSinyal(fakta({ audit: [auditTanggal('a4', { eta: null }, { eta: '2026-10-01' }, ['eta'])] }), opsi()), 'ETA_CHANGED')
  cek('ETA ditetapkan dari kosong → INFO "ditetapkan"', set.length === 1 && set[0].severity === 'INFO' && set[0].explanation.includes('ditetapkan'))
  const dua = hanya(deteksiSinyal(fakta({ audit: [auditTanggal('a5', { eta: '2026-10-01', etd: null }, { eta: '2026-10-02', etd: '2026-10-04' }, ['eta', 'etd'])] }), opsi()), 'ETA_CHANGED')
  cek('satu audit mengubah ETA & ETD → dua sinyal berbeda kunci', dua.length === 2 && new Set(dua.map((s) => s.dedupeKey)).size === 2)
  const sama = hanya(deteksiSinyal(fakta({ audit: [auditTanggal('a6', { eta: '2026-10-01' }, { eta: '2026-10-01' }, ['eta'])] }), opsi()), 'ETA_CHANGED')
  cek('tanggal sama → tanpa sinyal', sama.length === 0)
  const lama = hanya(deteksiSinyal(fakta({ audit: [auditTanggal('a7', { eta: '2026-10-01' }, { eta: '2026-10-09' }, ['eta'], 9 * JAM)] }), opsi()), 'ETA_CHANGED')
  cek('perubahan SEBELUM pemantauan dimulai diabaikan (tanpa banjir riwayat)', lama.length === 0)
  const lainMedan = hanya(deteksiSinyal(fakta({ audit: [auditTanggal('a8', { etb: '2026-10-01' }, { etb: '2026-10-02' }, ['etb'])] }), opsi()), 'ETA_CHANGED')
  cek('perubahan ETB saja → bukan ETA_CHANGED', lainMedan.length === 0)
  let lempar = null
  try { deteksiSinyal(fakta({ audit: [{ id: 'rusak', pada: iso(1 * JAM), lama: {}, baru: { peristiwa: 'UBAH_TANGGAL', medan: 'eta' } }] }), opsi()) } catch (e) { lempar = e }
  cek('AuditLog UBAH_TANGGAL tanpa larik medan → DataSumberTidakSah', lempar instanceof DataSumberTidakSah && lempar.code === 'DATA_SUMBER_TIDAK_SAH')
  lempar = null
  try { deteksiSinyal(fakta({ audit: [auditTanggal('rusak2', { eta: '2026-10-01' }, { eta: '1 Okt 2026' }, ['eta'])] }), opsi()) } catch (e) { lempar = e }
  cek('nilai tanggal bukan YYYY-MM-DD → DataSumberTidakSah', lempar instanceof DataSumberTidakSah)
  cek('selisihHariKalender lintas bulan/kabisat', selisihHariKalender('2028-02-28', '2028-03-01') === 2 && selisihHariKalender('2026-12-31', '2027-01-01') === 1)
}

console.log('\n[2b] VOYAGE_STATUS_CHANGED')
{
  const s = hanya(deteksiSinyal(fakta({ audit: [{ id: 's1', pada: iso(1 * JAM), lama: { status: 'CONFIRMED' }, baru: { status: 'ARRIVED' } }] }), opsi()), 'VOYAGE_STATUS_CHANGED')
  cek('transisi status → tepat 1 sinyal INFO', s.length === 1 && s[0].severity === 'INFO')
  cek('dedupeKey per audit', s[0]?.dedupeKey === 'VOYAGE_STATUS_CHANGED:vUji:s1')
  cek('before/after status', s[0]?.before?.status === 'CONFIRMED' && s[0]?.after?.status === 'ARRIVED')
  const tak = hanya(deteksiSinyal(fakta({ audit: [{ id: 's2', pada: iso(1 * JAM), lama: { peristiwa: 'UBAH_KAPAL_VOYAGE' }, baru: { peristiwa: 'UBAH_KAPAL_VOYAGE', kapal: [] } }] }), opsi()), 'VOYAGE_STATUS_CHANGED')
  cek('audit lain (UBAH_KAPAL_VOYAGE) → bukan sinyal status', tak.length === 0)
}

console.log('\n[2c] OPERATIONAL_EVENT_RECORDED')
{
  const kodeTanpaOther = KODE_PERISTIWA.filter((k) => k !== 'OTHER')
  cek('KODE_PERISTIWA_BERNILAI = KODE_PERISTIWA tanpa OTHER (tak ada kode karangan)',
    JSON.stringify([...KODE_PERISTIWA_BERNILAI]) === JSON.stringify(kodeTanpaOther), JSON.stringify(KODE_PERISTIWA_BERNILAI))
  const p = (id, kode, terjadiLalu, dicatatLalu = 1 * JAM) => ({ id, kode, terjadi: iso(terjadiLalu), dicatat: iso(dicatatLalu) })
  const h = deteksiSinyal(fakta({ peristiwa: [p('e1', 'SAILED', 1 * JAM), p('e2', 'OTHER', 1 * JAM), p('e3', 'EOSP', 9 * JAM, 9 * JAM)] }), opsi())
  const s = hanya(h, 'OPERATIONAL_EVENT_RECORDED')
  cek('SAILED dicatat sesudah mulai → 1 sinyal INFO', s.length === 1 && s[0].sourceRef === 'e1' && s[0].severity === 'INFO', `n=${s.length}`)
  cek('OTHER → tanpa sinyal', !s.some((x) => x.sourceRef === 'e2'))
  cek('peristiwa dicatat sebelum pemantauan → tanpa sinyal', !s.some((x) => x.sourceRef === 'e3'))
  cek('dedupeKey per VoyageEvent id; sumber VOYAGE_EVENT', s[0]?.dedupeKey === 'OPERATIONAL_EVENT_RECORDED:e1' && s[0]?.sourceType === 'VOYAGE_EVENT')
  cek('teks memakai label peristiwa & waktu WITA', s[0]?.explanation.includes('Kapal Berlayar') && s[0]?.explanation.includes('WITA'), s[0]?.explanation)
}

console.log('\n[2d] ACTUAL_DATE_MISSING')
{
  const p = (id, kode, terjadiLalu) => ({ id, kode, terjadi: iso(terjadiLalu), dicatat: iso(terjadiLalu) })
  cek('pemetaan yang dipakai = USUL_JANGKAR (EOSP→ata, ALL_FAST→atb, SAILED→atd)', JSON.stringify(USUL_JANGKAR) === '{"EOSP":"ata","ALL_FAST":"atb","SAILED":"atd"}')
  const telat = hanya(deteksiSinyal(fakta({ peristiwa: [p('x1', 'SAILED', 13 * JAM)] }), opsi()), 'ACTUAL_DATE_MISSING')
  cek(`SAILED ${AMBANG_TANGGAL_AKTUAL_JAM + 1} jam lalu & atd kosong → WARNING`, telat.length === 1 && telat[0].severity === 'WARNING' && telat[0].dedupeKey === 'ACTUAL_DATE_MISSING:vUji:atd', telat[0]?.dedupeKey)
  const belum = hanya(deteksiSinyal(fakta({ peristiwa: [p('x2', 'SAILED', 11 * JAM)] }), opsi()), 'ACTUAL_DATE_MISSING')
  cek('SAILED 11 jam lalu → belum sinyal', belum.length === 0)
  const terisi = hanya(deteksiSinyal(fakta({ tanggal: { eta: '2026-10-01', etd: null, ata: null, atb: null, atd: '2026-09-14' }, peristiwa: [p('x3', 'SAILED', 20 * JAM)] }), opsi()), 'ACTUAL_DATE_MISSING')
  cek('atd sudah terisi → tanpa sinyal', terisi.length === 0)
  const eosp = hanya(deteksiSinyal(fakta({ peristiwa: [p('x4', 'EOSP', 13 * JAM), p('x5', 'ALL_FAST', 13 * JAM)] }), opsi()), 'ACTUAL_DATE_MISSING')
  cek('EOSP→ata dan ALL_FAST→atb terdeteksi', eosp.map((s) => s.dedupeKey).sort().join('|') === 'ACTUAL_DATE_MISSING:vUji:ata|ACTUAL_DATE_MISSING:vUji:atb')
  const commenced = hanya(deteksiSinyal(fakta({ peristiwa: [p('x6', 'COMMENCED', 30 * JAM), p('x7', 'COMPLETED', 30 * JAM)] }), opsi()), 'ACTUAL_DATE_MISSING')
  cek('COMMENCED/COMPLETED tanpa pemetaan → sengaja tidak dideteksi', commenced.length === 0)
}

console.log('\n[2e] DATA_STALE')
{
  const basi = hanya(deteksiSinyal(fakta({ aktivitasTerakhir: iso(25 * JAM), mulaiPantau: iso(30 * JAM) }), opsi()), 'DATA_STALE')
  cek(`tanpa aktivitas > ${AMBANG_DATA_STALE_JAM} jam → WARNING`, basi.length === 1 && basi[0].severity === 'WARNING')
  cek('dedupeKey per hari bisnis WITA', basi[0]?.dedupeKey === `DATA_STALE:vUji:${tanggalBisnis(SEKARANG)}`, basi[0]?.dedupeKey)
  cek('23 jam → tanpa sinyal', hanya(deteksiSinyal(fakta({ aktivitasTerakhir: iso(23 * JAM), mulaiPantau: iso(30 * JAM) }), opsi()), 'DATA_STALE').length === 0)
  cek('pemantauan baru dimulai 2 jam lalu (aktivitas 40 jam lalu) → tanpa sinyal', hanya(deteksiSinyal(fakta({ aktivitasTerakhir: iso(40 * JAM), mulaiPantau: iso(2 * JAM) }), opsi()), 'DATA_STALE').length === 0)
  cek('tanpa aktivitas sama sekali → acuan waktu mulai', hanya(deteksiSinyal(fakta({ aktivitasTerakhir: null, mulaiPantau: iso(26 * JAM) }), opsi()), 'DATA_STALE').length === 1)
  // Batas hari WITA: 15:59 UTC dan 16:01 UTC di tanggal UTC sama → hari bisnis berbeda.
  const t1 = new Date('2026-09-15T15:59:00.000Z')
  const t2 = new Date('2026-09-15T16:01:00.000Z')
  const f = fakta({ aktivitasTerakhir: '2026-09-13T00:00:00.000Z', mulaiPantau: '2026-09-13T00:00:00.000Z' })
  const k1 = hanya(deteksiSinyal(f, opsi(t1)), 'DATA_STALE')[0]?.dedupeKey
  const k2 = hanya(deteksiSinyal(f, opsi(t2)), 'DATA_STALE')[0]?.dedupeKey
  cek('melewati tengah malam WITA (16:00 UTC) → kunci hari berbeda', k1 === 'DATA_STALE:vUji:2026-09-15' && k2 === 'DATA_STALE:vUji:2026-09-16', `${k1} / ${k2}`)
  const k3 = hanya(deteksiSinyal(f, opsi(new Date('2026-09-15T01:00:00.000Z'))), 'DATA_STALE')[0]?.dedupeKey
  cek('dua jalan di hari WITA yang sama → kunci sama (maks. satu per hari)', k3 === k1)
}

console.log('\n[2f] Siklus hidup & galat')
{
  cek('CLOSED → berhenti', alasanBerhenti({ dihapus: false, status: 'CLOSED' }) === 'VOYAGE_CLOSED')
  cek('CANCELLED → berhenti', alasanBerhenti({ dihapus: false, status: 'CANCELLED' }) === 'VOYAGE_CANCELLED')
  cek('dihapus → berhenti (menang atas status)', alasanBerhenti({ dihapus: true, status: 'CONFIRMED' }) === 'VOYAGE_DELETED')
  cek('voyage aktif → tidak berhenti', alasanBerhenti({ dihapus: false, status: 'WORKING' }) === null)
  const penuh = fakta({
    status: 'CLOSED',
    audit: [auditTanggal('z1', { eta: '2026-10-01' }, { eta: '2026-10-05' }, ['eta'])],
    aktivitasTerakhir: iso(99 * JAM),
    mulaiPantau: iso(99 * JAM),
  })
  cek('voyage CLOSED → deteksi kosong walau ada perubahan & basi', deteksiSinyal(penuh, opsi()).length === 0)
  const g = sinyalGalatMonitoring('vUji', 'VYG-UJI-1', 'DATA_SUMBER_TIDAK_SAH', SEKARANG)
  cek('MONITORING_ERROR → ERROR, sumber SYSTEM', g.kind === 'MONITORING_ERROR' && g.severity === 'ERROR' && g.sourceType === 'SYSTEM')
  cek('MONITORING_ERROR dedupe per voyage per jam UTC', g.dedupeKey === 'MONITORING_ERROR:vUji:2026-09-15T04')
  cek('penjelasan galat tanpa stack/detail teknis', !/\bat\s|Error:|\n/.test(g.explanation) && g.explanation.includes('DATA_SUMBER_TIDAK_SAH'))
  const f2 = fakta({ audit: [auditTanggal('d1', { eta: '2026-10-01' }, { eta: '2026-10-03' }, ['eta'])], peristiwa: [{ id: 'd2', kode: 'SAILED', terjadi: iso(13 * JAM), dicatat: iso(1 * JAM) }] })
  cek('deterministik: masukan sama → keluaran identik', JSON.stringify(deteksiSinyal(f2, opsi())) === JSON.stringify(deteksiSinyal(f2, opsi())))
  cek('semua kunci dedupe dalam satu jalan unik', (() => { const h = deteksiSinyal(f2, opsi()); return new Set(h.map((s) => s.dedupeKey)).size === h.length })())
}

// ====================================================================== 3. waktu

console.log('\n[3] Waktu: kebal zona mesin, D4 tetap')
{
  const f = fakta({
    audit: [auditTanggal('t1', { eta: '2026-10-01' }, { eta: '2026-10-02' }, ['eta'])],
    peristiwa: [{ id: 't2', kode: 'SAILED', terjadi: iso(13 * JAM), dicatat: iso(1 * JAM) }],
    aktivitasTerakhir: iso(25 * JAM),
    mulaiPantau: iso(26 * JAM),
  })
  const tzAsli = process.env.TZ
  const hasil = []
  for (const tz of ['UTC', 'Asia/Makassar', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
    process.env.TZ = tz
    hasil.push(JSON.stringify(deteksiSinyal(f, opsi())))
  }
  if (tzAsli === undefined) delete process.env.TZ
  else process.env.TZ = tzAsli
  cek('4 zona mesin → keluaran identik', new Set(hasil).size === 1)
  cek('kunciTanggal voyage (D4) tetap komponen UTC', kunciTanggal(new Date('2026-10-01T00:00:00.000Z')) === '2026-10-01' && kunciTanggal(new Date('2026-09-30T23:30:00.000Z')) === '2026-09-30')
}

// =================================================================== 4. penyedia

console.log('\n[4] Penyedia posisi: tidak ada, dan itu sah')
{
  cek('penyediaTidakAda tidak terkonfigurasi', penyediaTidakAda.terkonfigurasi === false && penyediaTidakAda.nama === 'NONE')
  cek('posisiKapal() → null (tanpa data buatan)', (await penyediaTidakAda.posisiKapal({ mmsi: '000000000' })) === null)
  const st = statusPenyedia()
  cek('status penyedia menjelaskan Step 5C & pemantauan internal tetap berjalan', st.terkonfigurasi === false && /Step 5C/.test(st.pesan) && /tetap berjalan/.test(st.pesan))
}

// =============================================================== 5. kunci sumber

console.log('\n[5] Kunci sumber')
const dirAuto = join(AKAR, 'src/services/automation')
const berkasAuto = readdirSync(dirAuto).filter((f) => f.endsWith('.ts'))
const isiAuto = berkasAuto.map((f) => [f, readFileSync(join(dirAuto, f), 'utf8')])
cek('tak ada LLM/OpenRouter di services/automation', isiAuto.every(([, s]) => !/openrouter|lib\/ai|\/ai\/|anthropic/i.test(s)), berkasAuto.join(','))
cek('tak ada panggilan jaringan (fetch/http) di services/automation', isiAuto.every(([, s]) => !/\bfetch\(|https?:\/\/|node:http/.test(s)))
cek('tak ada MMSI/call sign pilot di kode automation', isiAuto.every(([, s]) => !/525200433|YDB6405|MANDIRI|PATRA/i.test(s)))
const svc = baca('src/services/automation/monitoring.service.ts')
cek('service TIDAK menulis tabel operasional',
  !/\.(voyage|vessel|voyageVessel|voyageEvent|task|portCall|cargo|disbursement|invoice|customer|principal)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/.test(svc))
cek('service hanya menulis monitoredVoyage/monitoringRun/monitoringSignal',
  [...svc.matchAll(/\.(\w+)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/g)].every((m) => ['monitoredVoyage', 'monitoringRun', 'monitoringSignal'].includes(m[1])),
  [...new Set([...svc.matchAll(/\.(\w+)\.(create|updateMany)\(/g)].map((m) => m[1]))].join(','))
cek('tak ada $executeRaw / $queryRaw di service', !/\$executeRaw|\$queryRaw/.test(svc))
cek('setiap fungsi API service memanggil requireAutomation', ['listPemantauan', 'mulaiPemantauan', 'hentikanPemantauan', 'listSinyal', 'reviewSinyal', 'kesehatanAutomation', 'jalankanMonitoringTenant'].every((fn) => {
  const i = svc.indexOf(`export async function ${fn}(`)
  return i >= 0 && svc.slice(i, i + 400).includes('requireAutomation(ctx)')
}))
cek('notifikasi hanya untuk WARNING/ERROR (INFO dikembalikan lebih dulu)', /if \(c\.severity === 'INFO'\) return/.test(svc))
cek('penerima notifikasi hanya ADMIN & MANAJER_OPERASI, bertarget (userId)', /PERAN_PENERIMA: Role\[\] = \['ADMIN', 'MANAJER_OPERASI'\]/.test(svc) && /userId: u\.id/.test(svc))
cek('dedupe notifikasi diturunkan dari dedupe sinyal', /dedupeKey: `AH:\$\{c\.dedupeKey\}:\$\{u\.id\}`/.test(svc))
cek('duplikat sinyal ditangani lewat P2002 (penjaga balapan terakhir)', /code === 'P2002'\) return 'DUPLIKAT'/.test(svc))
cek('kunci yang sudah ada disaring SEBELUM create (log produksi tak dibanjiri P2002 tiap jam)',
  /monitoringSignal\.findMany\(\{\s*where: \{ dedupeKey: \{ in:/.test(svc) && /sudahAda\.has\(c\.dedupeKey\)/.test(svc))

const schema = baca('prisma/schema.prisma')
const blok = (nama) => schema.match(new RegExp(`model ${nama} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? ''
for (const m of ['MonitoredVoyage', 'MonitoringRun', 'MonitoringSignal']) {
  cek(`${m}: bertenant + FK tenant CASCADE`, /tenantId\s+String/.test(blok(m)) && /tenant\s+Tenant\s+@relation\(fields: \[tenantId\], references: \[id\], onDelete: Cascade\)/.test(blok(m)))
  cek(`${m}: terdaftar di TENANT_MODELS`, TENANT_MODELS.has(m))
}
cek('MonitoredVoyage & MonitoringSignal: FK voyage CASCADE', ['MonitoredVoyage', 'MonitoringSignal'].every((m) => /voyage\s+Voyage\s+@relation\(fields: \[voyageId\], references: \[id\], onDelete: Cascade\)/.test(blok(m))))
cek('MonitoringSignal: @@unique([tenantId, dedupeKey])', /@@unique\(\[tenantId, dedupeKey\]\)/.test(blok('MonitoringSignal')))
cek('MonitoredVoyage: @@unique([tenantId, voyageId])', /@@unique\(\[tenantId, voyageId\]\)/.test(blok('MonitoredVoyage')))

const dirMig = readdirSync(join(AKAR, 'prisma/migrations')).filter((d) => d.includes('prd002_step5b'))
cek('tepat satu migrasi Step 5B', dirMig.length === 1, dirMig.join(','))
const sql = dirMig[0] ? baca(`prisma/migrations/${dirMig[0]}/migration.sql`) : ''
cek('migrasi aditif: tanpa DROP/ALTER COLUMN/SET NOT NULL/TRUNCATE/DELETE', sql.length > 0 && !/DROP |ALTER COLUMN|SET NOT NULL|TRUNCATE|DELETE FROM/i.test(sql))
cek('migrasi tanpa GRANT ke maritime_portal (portal tak bisa membaca)', !/GRANT|maritime_portal/i.test(sql))
cek('migrasi hanya menyentuh tiga tabel baru', [...sql.matchAll(/CREATE TABLE "(\w+)"/g)].map((m) => m[1]).sort().join(',') === 'MonitoredVoyage,MonitoringRun,MonitoringSignal')

const job = baca('src/app/api/jobs/run/route.ts')
cek("job 'voyage-monitoring' terdaftar di /api/jobs/run", /'voyage-monitoring': \(\) => jalankanMonitoringSemuaTenant\(\)/.test(job))
const routes = ['monitored-voyages/route.ts', 'monitored-voyages/[id]/route.ts', 'signals/route.ts', 'signals/[id]/review/route.ts', 'health/route.ts']
cek('semua route /api/automation memakai withTenant', routes.every((r) => existsSync(join(AKAR, 'src/app/api/automation', r)) && /withTenant\(/.test(baca(`src/app/api/automation/${r}`))))
cek('route tidak membaca tenantId dari request', routes.every((r) => !/tenantId/.test(baca(`src/app/api/automation/${r}`))))
const envEx = baca('.env.example')
cek('.env.example: bawaan MATI & allowlist kosong (tanpa id produksi)', /AUTOMATION_MONITORING_ENABLED="false"/.test(envEx) && /AUTOMATION_TENANT_IDS=""/.test(envEx))
cek('halaman /automation & /automation/alerts digerbangi (notFound)', ['src/app/(app)/automation/page.tsx', 'src/app/(app)/automation/alerts/page.tsx'].every((p) => /if \(!bolehAksesAutomation\(ctx\)\) notFound\(\)/.test(baca(p))))
cek('UI tak menampilkan posisi/peta palsu', ['MonitoringOverview.tsx', 'SignalList.tsx', 'VoyageMonitoringSection.tsx'].every((f) => !/latitude|longitude|<Map|leaflet|mapbox/i.test(baca(`src/components/automation/${f}`))))

console.log(`\n${gagal === 0 ? '✅ SEMUA LULUS' : '❌ ADA YANG GAGAL'} — lulus ${lulus}, gagal ${gagal}`)
if (gagal > 0) process.exitCode = 1
