// Uji murni AIS — PRD-003 Step 4.
//
// Jalankan:  node prisma/check-ais-contract.mjs      (tanpa DB, tanpa dev server, tanpa jaringan)
//
// Lapis:
//   1. KONFIGURASI — gagal tertutup, subset allowlist, FAKE ditolak di produksi,
//      D7 ambang basi dari env, D5 kuota tanpa nilai = tanpa panggilan.
//   2. KUOTA (D5) — keputusan murni.
//   3. PEMILIHAN KAPAL — D4 tug saja, D2 MMSI terverifikasi, dedupe, batas per jalan.
//   4. NORMALISASI — fixture baik/buruk/sentinel/mismatch/masa depan/tua.
//   5. JADWAL — jatuh tempo, backoff, lease, interval, bulan WITA, retensi, provider down.
//   6. ADAPTER — FAKE deterministik & tanpa jaringan; NONE tak terkonfigurasi.
//   7. KUNCI SUMBER — tanpa URL/vendor/MMSI pilot, batas tulis, urutan kuota→kunci→panggil,
//      tanpa payload mentah/kunci API di log/UI, migrasi aditif, systemd tak di-enable.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AIS_ERROR } from '../src/services/ais/contract.ts'
import { normalisasiObservasi, kanonikObservasi } from '../src/services/ais/normalize.ts'
import {
  AMBANG_PROVIDER_DOWN,
  BACKOFF_MAKS_JAM,
  BATAS_KAPAL_AIS_PER_JALAN,
  BAWAAN_AMBANG_STALE_JAM,
  ID_PENYEDIA,
  LEASE_DETIK,
  RETENSI_OBSERVASI_HARI,
  RETENSI_RUN_HARI,
  TIMEOUT_PANGGILAN_MS,
  ANGGARAN_JALAN_MS,
  awalBulanBisnisWita,
  batasRetensi,
  bacaKonfigurasiAis,
  hitungBackoffMs,
  intervalEfektifMenit,
  kapabilitasDiterima,
  kapalSumberPosisi,
  kunciApiSah,
  mmsiTerverifikasi,
  pecah,
  pilihKapalUntukPoll,
  providerDown,
  putuskanKuota,
  sudahJatuhTempo,
  tenantBolehAis,
} from '../src/services/ais/ais-policy.ts'
import { adapterFake, MMSI_FAKE } from '../src/services/ais/adapters/fake.ts'
import { adapterNone } from '../src/services/ais/adapters/none.ts'
import { AMBANG_AIS_PROVIDER_DOWN } from '../src/services/automation/monitoring-policy.ts'
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
const MENIT = 60_000

// Jaring pengaman: SETIAP panggilan jaringan di proses uji ini = gagal keras.
let fetchTerpanggil = 0
globalThis.fetch = async () => {
  fetchTerpanggil++
  throw new Error('JARINGAN_DILARANG_DALAM_UJI')
}

const ID_A = 'cmt2arl2i0000v7g82613796g'
// id fiksi berbentuk cuid — sengaja BUKAN id tenant produksi.
const ID_B = 'cmujibbbb0000v7aaaaaaaaaa'
const ENV = (ubah = {}) => ({
  AUTOMATION_MONITORING_ENABLED: 'true',
  AUTOMATION_TENANT_IDS: `${ID_A},${ID_B}`,
  AIS_ENABLED: 'true',
  AIS_TENANT_IDS: ID_A,
  AIS_PROVIDER: 'FAKE',
  AIS_MONTHLY_CALL_CAP: '1000',
  ...ubah,
})

// ============================================================== 1. konfigurasi

console.log('\n[1] Konfigurasi AIS — gagal tertutup')
{
  cek('bawaan (env kosong) → MATI', bacaKonfigurasiAis({}).aktif === false && bacaKonfigurasiAis({}).alasan === 'NONAKTIF')
  cek('AIS_ENABLED "TRUE"/"1" → FLAG_TIDAK_SAH', ['TRUE', '1', 'yes'].every((f) => bacaKonfigurasiAis(ENV({ AIS_ENABLED: f })).alasan === 'FLAG_TIDAK_SAH'))
  cek('Automation Hub mati → AIS mati', bacaKonfigurasiAis(ENV({ AUTOMATION_MONITORING_ENABLED: 'false' })).alasan === 'AUTOMATION_NONAKTIF')
  cek('allowlist AIS kosong → MATI', bacaKonfigurasiAis(ENV({ AIS_TENANT_IDS: '' })).alasan === 'ALLOWLIST_KOSONG')
  cek('satu id AIS tak sah → SELURUHNYA MATI', bacaKonfigurasiAis(ENV({ AIS_TENANT_IDS: `${ID_A},PT Tribuana` })).alasan === 'ALLOWLIST_TIDAK_SAH')
  cek('id AIS di luar AUTOMATION_TENANT_IDS → ALLOWLIST_BUKAN_SUBSET', (() => {
    const k = bacaKonfigurasiAis(ENV({ AUTOMATION_TENANT_IDS: ID_B, AIS_TENANT_IDS: ID_A }))
    return k.aktif === false && k.alasan === 'ALLOWLIST_BUKAN_SUBSET' && !tenantBolehAis(k, ID_A)
  })())
  cek('penyedia tak dikenal → MATI', bacaKonfigurasiAis(ENV({ AIS_PROVIDER: 'HIFLEET' })).alasan === 'PENYEDIA_TIDAK_DIKENAL')
  cek('penyedia berbentuk URL → MATI (config memilih ID, bukan URL)', bacaKonfigurasiAis(ENV({ AIS_PROVIDER: 'https://evil.example/api' })).alasan === 'PENYEDIA_TIDAK_DIKENAL')
  cek('AISStream tidak dikenal (DROPPED)', bacaKonfigurasiAis(ENV({ AIS_PROVIDER: 'AISSTREAM' })).alasan === 'PENYEDIA_TIDAK_DIKENAL')
  cek('FAKE ditolak di produksi', bacaKonfigurasiAis(ENV({ NODE_ENV: 'production' })).alasan === 'PENYEDIA_DILARANG_PRODUKSI')
  cek('NONE boleh di produksi (keadaan sah K175)', bacaKonfigurasiAis(ENV({ NODE_ENV: 'production', AIS_PROVIDER: 'NONE' })).aktif === true)
  cek('AIS_PROVIDER kosong → NONE', bacaKonfigurasiAis(ENV({ AIS_PROVIDER: '' })).penyedia === 'NONE')
  cek('daftar penyedia terdaftar tepat NONE, FAKE (tanpa adapter vendor spekulatif)', JSON.stringify([...ID_PENYEDIA]) === '["NONE","FAKE"]')
  const k = bacaKonfigurasiAis(ENV())
  cek('konfigurasi sah → AKTIF, hanya tenant A', k.aktif && tenantBolehAis(k, ID_A) && !tenantBolehAis(k, ID_B) && !tenantBolehAis(k, undefined))
  cek('interval bawaan 60 menit', k.intervalMenit === 60)
  cek('interval 5 / "abc" / 2000 → MATI (INTERVAL_TIDAK_SAH)', ['5', 'abc', '2000', '30.5'].every((v) => bacaKonfigurasiAis(ENV({ AIS_POLL_INTERVAL_MIN: v })).alasan === 'INTERVAL_TIDAK_SAH'))
  // D7 — tidak boleh hard-coded
  cek(`D7: ambang basi bawaan ${BAWAAN_AMBANG_STALE_JAM} jam`, k.ambangStaleJam === 6 && BAWAAN_AMBANG_STALE_JAM === 6)
  cek('D7: AIS_STALE_HOURS=12 → 12 (bisa dikonfigurasi)', bacaKonfigurasiAis(ENV({ AIS_STALE_HOURS: '12' })).ambangStaleJam === 12)
  cek('D7: AIS_STALE_HOURS=1.5 → 1.5', bacaKonfigurasiAis(ENV({ AIS_STALE_HOURS: '1.5' })).ambangStaleJam === 1.5)
  cek('D7: nilai tak sah (0 / abc / 500) → AIS MATI', ['0', 'abc', '500', '-3'].every((v) => bacaKonfigurasiAis(ENV({ AIS_STALE_HOURS: v })).alasan === 'AMBANG_STALE_TIDAK_SAH'))
  // D5
  cek('D5: kuota tak diisi → kuotaBulanan null', bacaKonfigurasiAis(ENV({ AIS_MONTHLY_CALL_CAP: '' })).kuotaBulanan === null && bacaKonfigurasiAis(ENV({ AIS_MONTHLY_CALL_CAP: undefined })).kuotaBulanan === null)
  cek('D5: kuota "0" / "-5" / "1.5" / "abc" / "1e3" → null', ['0', '-5', '1.5', 'abc', '1e3', ' '].every((v) => bacaKonfigurasiAis(ENV({ AIS_MONTHLY_CALL_CAP: v })).kuotaBulanan === null))
  cek('D5: kuota "1000" → 1000', k.kuotaBulanan === 1000)
  cek('kunci API < 16 karakter → tidak sah', !kunciApiSah('') && !kunciApiSah('pendek') && !kunciApiSah(undefined) && kunciApiSah('x'.repeat(16)))
}

// ==================================================================== 2. kuota

console.log('\n[2] D5 — kuota bulanan gagal tertutup')
{
  cek('kuota null + 0 panggilan → DITOLAK (KUOTA_TIDAK_DISET)', JSON.stringify(putuskanKuota(null, 0, 0)) === '{"boleh":false,"kode":"KUOTA_TIDAK_DISET"}')
  cek('kuota null + 1 panggilan → DITOLAK', putuskanKuota(null, 0, 1).boleh === false)
  cek('kuota 0 / NaN → DITOLAK', putuskanKuota(0, 0, 1).boleh === false && putuskanKuota(Number.NaN, 0, 1).boleh === false)
  cek('terpakai 999 + rencana 1 ≤ 1000 → BOLEH', putuskanKuota(1000, 999, 1).boleh === true)
  cek('terpakai 1000 + rencana 1 > 1000 → KUOTA_HABIS', JSON.stringify(putuskanKuota(1000, 1000, 1)) === '{"boleh":false,"kode":"KUOTA_HABIS"}')
}

// ======================================================= 3. pemilihan kapal

console.log('\n[3] Pemilihan kapal — D4 tug saja, D2 MMSI terverifikasi')
{
  const V = new Date('2026-09-01T00:00:00Z')
  const kp = (vesselId, role, isPrimary, mmsi = null, mmsiSource = null, mmsiVerifiedAt = null) => ({ vesselId, role, isPrimary, mmsi, mmsiSource, mmsiVerifiedAt, nama: vesselId })
  const tug = kp('v-tug', 'TUG', false, '990000001', 'COMPANY_DOCUMENT', V)
  const barge = kp('v-barge', 'BARGE', true, '990000002', 'COMPANY_DOCUMENT', V)
  cek('voyage tug+barge → hanya tug', JSON.stringify(kapalSumberPosisi([barge, tug]).map((k) => k.vesselId)) === '["v-tug"]')
  cek('kapal utama tanpa peran → kapal utama', kapalSumberPosisi([kp('v-1', null, true)]).map((k) => k.vesselId).join() === 'v-1')
  cek('kapal utama BARGE tanpa tug → tak ada sumber posisi', kapalSumberPosisi([barge]).length === 0)
  cek('BARGE tak pernah terpilih walau ber-MMSI terverifikasi', !pilihKapalUntukPoll([[barge], [barge, tug]]).diambil.some((k) => k.role === 'BARGE'))
  // MMSI fiksi 99xxxxxxx — MMSI pilot tidak dipakai sebagai fixture dalam bentuk apa pun.
  cek('MMSI PUBLIC_TRACKING → dilewati', !mmsiTerverifikasi(kp('x', 'TUG', true, '990000077', 'PUBLIC_TRACKING', null)))
  cek('PUBLIC_TRACKING dengan stempel palsu → tetap dilewati', !mmsiTerverifikasi(kp('x', 'TUG', true, '990000001', 'PUBLIC_TRACKING', V)))
  cek('sumber terverifikasi tanpa stempel waktu → dilewati', !mmsiTerverifikasi(kp('x', 'TUG', true, '990000001', 'COMPANY_DOCUMENT', null)))
  cek('MMSI 8 digit → dilewati', !mmsiTerverifikasi(kp('x', 'TUG', true, '99000000', 'COMPANY_DOCUMENT', V)))
  cek('tiga sumber terverifikasi diterima', ['COMPANY_DOCUMENT', 'PRINCIPAL_CONFIRMATION', 'OTHER_VERIFIED'].every((s) => mmsiTerverifikasi(kp('x', 'TUG', true, '990000001', s, V))))
  const tugPublik = kp('v-pub', 'TUG', false, '990000077', 'PUBLIC_TRACKING', null)
  const p = pilihKapalUntukPoll([[tug, barge], [tug], [tugPublik, barge]])
  cek('kapal sama di dua voyage → diambil sekali', p.diambil.length === 1 && p.diambil[0].vesselId === 'v-tug')
  cek('hitungan layak/tak terverifikasi benar', p.layak === 2 && p.tidakTerverifikasi === 1, JSON.stringify({ layak: p.layak, tv: p.tidakTerverifikasi }))
  const banyak = Array.from({ length: 60 }, (_, i) => [kp(`v${String(i).padStart(2, '0')}`, 'TUG', true, String(990100000 + i), 'COMPANY_DOCUMENT', V)])
  const pb = pilihKapalUntukPoll(banyak)
  cek(`batas ${BATAS_KAPAL_AIS_PER_JALAN} kapal per jalan`, pb.diambil.length === BATAS_KAPAL_AIS_PER_JALAN && pb.dibatasi === 10)
  cek('urutan deterministik (vesselId)', pb.diambil[0].vesselId === 'v00')
  cek('pecah batch sesuai maxMmsiPerRequest', pecah([1, 2, 3, 4, 5, 6, 7], 5).map((x) => x.length).join() === '5,2' && pecah([1, 2], 1).length === 2 && pecah([], 5).length === 0)
}

// ============================================================= 4. normalisasi

console.log('\n[4] Normalisasi observasi')
{
  const F = new Date('2026-09-15T04:00:00.000Z')
  const raw = (ubah = {}) => ({ mmsi: '990000001', positionAt: '2026-09-15T03:50:00.000Z', lat: -0.5, lon: 117.15, sog: 6.2, cog: 45.5, heading: 44, navStatus: 0, positionAccuracy: true, sourceType: 'TERRESTRIAL', providerRef: null, ...ubah })
  const ok = normalisasiObservasi(raw(), '990000001', F)
  cek('obs-ok-terrestrial → diterima', ok.ok && ok.obs.lat === -0.5 && ok.obs.sourceType === 'TERRESTRIAL')
  cek('ageSecAtFetch = 600 detik', ok.ok && ok.obs.ageSecAtFetch === 600)
  cek('positionAt ≠ fetchedAt (dua waktu, K176/2)', ok.ok && ok.obs.positionAt.getTime() !== ok.obs.fetchedAt.getTime())
  const sen = normalisasiObservasi(raw({ sog: 102.3, cog: 360, heading: 511, navStatus: 99, sourceType: 'SATELLITE' }), '990000001', F)
  cek('obs-sentinels: 102.3/360/511 → null, navStatus 99 → null', sen.ok && sen.obs.sogKnots === null && sen.obs.cogDeg === null && sen.obs.headingDeg === null && sen.obs.navStatus === null && sen.obs.sourceType === 'SATELLITE')
  const tolak = (ubah, diminta = '990000001') => { const h = normalisasiObservasi(raw(ubah), diminta, F); return h.ok ? 'OK' : h.alasan }
  cek('lat 91 / lon 181 (tidak tersedia) → REJECTED_INVALID', tolak({ lat: 91 }) === 'REJECTED_INVALID' && tolak({ lon: 181 }) === 'REJECTED_INVALID')
  cek('obs-zero-zero → REJECTED_INVALID', tolak({ lat: 0, lon: 0 }) === 'REJECTED_INVALID')
  cek('lat/lon null / NaN / string → REJECTED_INVALID', tolak({ lat: null }) === 'REJECTED_INVALID' && tolak({ lon: Number.NaN }) === 'REJECTED_INVALID' && tolak({ lat: '-0.5' }) === 'REJECTED_INVALID')
  cek('obs-missing-time → REJECTED_INVALID', tolak({ positionAt: null }) === 'REJECTED_INVALID' && tolak({ positionAt: 'kemarin' }) === 'REJECTED_INVALID')
  cek('obs-future (> 5 menit) → REJECTED_INVALID', tolak({ positionAt: '2026-09-15T04:06:00.000Z' }) === 'REJECTED_INVALID')
  cek('masa depan ≤ 5 menit (selisih jam) → diterima, umur 0', (() => { const h = normalisasiObservasi(raw({ positionAt: '2026-09-15T04:03:00.000Z' }), '990000001', F); return h.ok && h.obs.ageSecAtFetch === 0 })())
  cek('obs-30d-old → REJECTED_STALE', tolak({ positionAt: '2026-08-15T00:00:00.000Z' }) === 'REJECTED_STALE')
  cek('posisi 8 jam lalu → DITERIMA (basi dinilai monitoring, bukan dibuang)', tolak({ positionAt: '2026-09-14T20:00:00.000Z' }) === 'OK')
  cek('obs-mmsi-mismatch → REJECTED_MISMATCH', tolak({ mmsi: '990000033' }) === 'REJECTED_MISMATCH' && tolak({ mmsi: undefined }) === 'REJECTED_MISMATCH')
  cek('SOG 70 kn / negatif → REJECTED_INVALID', tolak({ sog: 70 }) === 'REJECTED_INVALID' && tolak({ sog: -1 }) === 'REJECTED_INVALID')
  cek('heading 360 / 12.5 → REJECTED_INVALID', tolak({ heading: 360 }) === 'REJECTED_INVALID' && tolak({ heading: 12.5 }) === 'REJECTED_INVALID')
  cek('sourceType tak dikenal → UNKNOWN (tak ditebak)', (() => { const h = normalisasiObservasi(raw({ sourceType: 'S-AIS' }), '990000001', F); return h.ok && h.obs.sourceType === 'UNKNOWN' })())
  cek('kanonik deterministik & tanpa medan mentah tambahan', ok.ok && kanonikObservasi(ok.obs) === kanonikObservasi(normalisasiObservasi(raw({ ekstraVendor: 'rahasia' }), '990000001', F).obs) && !kanonikObservasi(ok.obs).includes('rahasia'))
}

// ================================================================== 5. jadwal

console.log('\n[5] Jadwal, backoff, lease, bulan WITA, retensi, provider down')
{
  const S = new Date('2026-09-15T04:15:00.000Z')
  cek('belum pernah jalan → jatuh tempo', sudahJatuhTempo(null, S, 60))
  cek('jalan 30 menit lalu, interval 60 → belum', !sudahJatuhTempo(new Date(S.getTime() - 30 * MENIT), S, 60))
  cek('jalan 58.5 menit lalu (jitter timer) → jatuh tempo', sudahJatuhTempo(new Date(S.getTime() - 58.5 * MENIT), S, 60))
  cek('interval efektif: lantai 15 & batas adapter', intervalEfektifMenit({ intervalMenit: 15 }, { minPollIntervalSec: 3600 }) === 60 && intervalEfektifMenit({ intervalMenit: 60 }, { minPollIntervalSec: 0 }) === 60)
  cek('backoff 1× = interval; 2× = 2×; maks 6 jam', hitungBackoffMs(1, 60) === 60 * MENIT && hitungBackoffMs(2, 60) === 120 * MENIT && hitungBackoffMs(10, 60) === BACKOFF_MAKS_JAM * JAM && hitungBackoffMs(1000, 60) === 6 * JAM)
  cek('lease > TimeoutStartSec=360 & anggaran < timeout unit', LEASE_DETIK > 360 && ANGGARAN_JALAN_MS < 360_000 && TIMEOUT_PANGGILAN_MS <= 20_000)
  cek('awal bulan WITA: 2026-08-31T16:30Z = 1 Sep WITA', awalBulanBisnisWita(new Date('2026-08-31T16:30:00Z')).toISOString() === '2026-08-31T16:00:00.000Z')
  cek('awal bulan WITA: 2026-08-31T15:30Z masih Agustus WITA', awalBulanBisnisWita(new Date('2026-08-31T15:30:00Z')).toISOString() === '2026-07-31T16:00:00.000Z')
  const r = batasRetensi(S)
  cek(`D3: retensi observasi ${RETENSI_OBSERVASI_HARI} hari, run ${RETENSI_RUN_HARI} hari`, RETENSI_OBSERVASI_HARI === 90 && RETENSI_RUN_HARI === 180 &&
    S.getTime() - r.observasiSebelum.getTime() === 90 * 24 * JAM && S.getTime() - r.runSebelum.getTime() === 180 * 24 * JAM)
  cek('provider down: 2 gagal → belum', !providerDown({ consecutiveFailures: 2, outageStartedAt: new Date(S.getTime() - 5 * JAM) }, S))
  cek('provider down: 3 gagal < 3 jam → belum', !providerDown({ consecutiveFailures: 3, outageStartedAt: new Date(S.getTime() - 2.9 * JAM) }, S))
  cek('provider down: 3 gagal ≥ 3 jam → YA', providerDown({ consecutiveFailures: 3, outageStartedAt: new Date(S.getTime() - 3 * JAM) }, S))
  cek('provider down: tanpa state / tanpa outageStartedAt → belum', !providerDown(null, S) && !providerDown({ consecutiveFailures: 9, outageStartedAt: null }, S))
  cek('ambang provider down sama di ais-policy & monitoring-policy', JSON.stringify(AMBANG_PROVIDER_DOWN) === JSON.stringify(AMBANG_AIS_PROVIDER_DOWN))
}

// ================================================================= 6. adapter

console.log('\n[6] Adapter FAKE & NONE — tanpa jaringan')
{
  const now = new Date('2026-09-15T04:37:00.000Z')
  const fetchPalsu = async () => { fetchTerpanggil++; throw new Error('fetchImpl dilarang') }
  const ctx = (n = now) => ({ signal: new AbortController().signal, fetchImpl: fetchPalsu, now: n })
  cek('kapabilitas FAKE & NONE diterima registry', kapabilitasDiterima(adapterFake.capabilities) && kapabilitasDiterima(adapterNone.capabilities))
  cek('kapabilitas STREAM / tanpa waktu posisi / batch 0 → ditolak', !kapabilitasDiterima({ ...adapterFake.capabilities, delivery: 'STREAM' }) &&
    !kapabilitasDiterima({ ...adapterFake.capabilities, reportsPositionTime: false }) && !kapabilitasDiterima({ ...adapterFake.capabilities, maxMmsiPerRequest: 0 }))
  const r1 = await adapterFake.fetchLatest([MMSI_FAKE.OK, MMSI_FAKE.OK_SATELIT, MMSI_FAKE.NO_DATA, MMSI_FAKE.MISMATCH, '123456789'], ctx())
  cek('FAKE: batch campuran ok:true', r1.ok === true)
  cek('FAKE: perMmsi NO_DATA & NOT_FOUND', r1.ok && r1.perMmsi[MMSI_FAKE.NO_DATA] === 'NO_DATA' && r1.perMmsi['123456789'] === 'NOT_FOUND')
  cek('FAKE: mismatch mengembalikan MMSI lain', r1.ok && r1.observations.some((o) => o.mmsi === '990000033'))
  const r2 = await adapterFake.fetchLatest([MMSI_FAKE.OK], ctx(new Date('2026-09-15T04:59:00.000Z')))
  const pos = (r) => r.ok ? r.observations.find((o) => o.mmsi === MMSI_FAKE.OK)?.positionAt : null
  cek('FAKE: jam yang sama → positionAt identik (dasar uji dedupe)', pos(r1) === pos(r2) && pos(r1) === '2026-09-15T03:50:00.000Z', pos(r1))
  const r3 = await adapterFake.fetchLatest([MMSI_FAKE.OK], ctx(new Date('2026-09-15T05:01:00.000Z')))
  cek('FAKE: jam berikutnya → posisi baru', pos(r3) !== pos(r1))
  const t = await adapterFake.fetchLatest([MMSI_FAKE.OK, MMSI_FAKE.TIMEOUT], ctx())
  cek('FAKE: TIMEOUT → ok:false, retryable, tanpa teks vendor', !t.ok && t.code === 'PROVIDER_TIMEOUT' && t.retryable === true && Object.keys(t).every((k) => ['ok', 'code', 'retryable'].includes(k)))
  const rl = await adapterFake.fetchLatest([MMSI_FAKE.RATE_LIMIT], ctx())
  cek('FAKE: RATE_LIMITED → tidak diulang, ada resetAt', !rl.ok && rl.code === 'PROVIDER_RATE_LIMITED' && rl.retryable === false && !!rl.rateLimitResetAt)
  cek('kode galat adapter ∈ AIS_ERROR', [t.code, rl.code].every((c) => AIS_ERROR.includes(c)))
  cek('NONE: tak terkonfigurasi & tak memanggil apa pun', adapterNone.configured({}) === false && (await adapterNone.fetchLatest(['990000001'], ctx())).code === 'NOT_CONFIGURED')
  cek('TIDAK ADA panggilan jaringan (fetch global & fetchImpl) di seluruh uji', fetchTerpanggil === 0, `n=${fetchTerpanggil}`)
}

// ============================================================ 7. kunci sumber

console.log('\n[7] Kunci sumber')
{
  const dirAis = join(AKAR, 'src/services/ais')
  const berkas = [...readdirSync(dirAis).filter((f) => f.endsWith('.ts')), ...readdirSync(join(dirAis, 'adapters')).map((f) => `adapters/${f}`)]
  const isi = Object.fromEntries(berkas.map((f) => [f, readFileSync(join(dirAis, f), 'utf8')]))
  cek('adapter yang ada hanya none.ts & fake.ts (tanpa HiFleet/AISStream spekulatif)', readdirSync(join(dirAis, 'adapters')).sort().join() === 'fake.ts,none.ts')
  cek('tanpa URL/host penyedia di services/ais', Object.values(isi).every((s) => !/https?:\/\//.test(s)))
  cek('tanpa nama vendor (hifleet/aisstream/vesselfinder/marinetraffic/datalastic)', Object.values(isi).every((s) => !/hifleet|aisstream|vesselfinder|marinetraffic|datalastic/i.test(s)))
  cek('tanpa MMSI/call sign/nama pilot di services/ais', Object.values(isi).every((s) => !/525200433|YDB6405|MANDIRI|PATRA/i.test(s)))
  cek('tanpa panggilan fetch langsung di services/ais (hanya fetchImpl disuntik)', Object.values(isi).every((s) => !/[^.\w]fetch\(|globalThis\.fetch\(/.test(s)))
  cek('tanpa LLM', Object.values(isi).every((s) => !/openrouter|anthropic|lib\/ai/i.test(s)))
  const poll = isi['poll.service.ts']
  cek('poll.service TIDAK menulis tabel operasional',
    !/\.(voyage|vessel|voyageVessel|voyageEvent|task|portCall|monitoredVoyage|monitoringSignal|notification)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/.test(poll))
  cek('poll.service hanya menulis aisObservation/aisPollRun/aisProviderState',
    [...poll.matchAll(/\.(\w+)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/g)].every((m) => ['aisObservation', 'aisPollRun', 'aisProviderState'].includes(m[1])))
  cek('read.service tidak menulis apa pun', ![...isi['read.service.ts'].matchAll(/\.(\w+)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/g)].length)
  cek('tanpa $executeRaw/$queryRaw di services/ais', Object.values(isi).every((s) => !/\$executeRaw|\$queryRaw/.test(s)))
  const iKunci = poll.indexOf('lockedBy: token }')
  const iUlang = poll.indexOf('terakhirDalamKunci')
  const iKuota = poll.indexOf('putuskanKuota(')
  const iPanggil = poll.indexOf('adapter.fetchLatest(')
  cek('urutan: kunci sewa → cek ulang jatuh tempo → kuota (D5) → panggilan penyedia', iKunci > 0 && iUlang > iKunci && iKuota > iUlang && iPanggil > iKuota, `${iKunci}<${iUlang}<${iKuota}<${iPanggil}`)
  cek('penolakan kuota KELUAR (dan melepas kunci) sebelum panggilan', /if \(!kuota\.boleh\) \{[\s\S]*?await lepasKunci\(\)[\s\S]*?return hasil\(/.test(poll.slice(iKuota, iPanggil)))
  cek('kunci selalu dilepas di finally', /finally \{[\s\S]*?await lepasKunci\(run\.id\)/.test(poll))
  cek('observasi idempoten: createMany skipDuplicates', /aisObservation\.createMany\(\{\s*skipDuplicates: true/.test(poll))
  cek('respons mentah vendor tak disimpan (tanpa kolom payload/raw)', !/\bpayload\s*:|raw\s*:|JSON\.stringify\(r\b|JSON\.stringify\(raw/.test(poll) && !/payload\s+Json/.test(baca('prisma/schema.prisma').match(/model AisObservation \{[\s\S]*?\n\}/)?.[0] ?? ''))
  cek('log [ais-poll] hanya id/angka/kode (tanpa MMSI, URL, kunci)', [...poll.matchAll(/catatLog\(\{([^}]*)\}/g)].every((m) => !/mmsi|url|key|kunci|token|raw|body/i.test(m[1])))
  cek('galat adapter yang dilempar tak diteruskan (diganti kode)', /catch \{\s*\/\/[^\n]*\n\s*r = \{ ok: false, code: 'PROVIDER_BAD_RESPONSE'/.test(poll))
  cek('kunci API tak dibaca di services/ais Step 4 (belum ada adapter vendor)', Object.values(isi).every((s) => !/AIS_PROVIDER_API_KEY/.test(s)))
  const ui = ['VoyageAisPosition.tsx', 'AisHealthCard.tsx'].map((f) => baca(`src/components/automation/${f}`))
  cek('UI AIS tak menampilkan kunci/URL/peta', ui.every((s) => !/API_KEY|apiKey|https?:\/\/|<Map|leaflet|mapbox/i.test(s)))
  cek('setiap fungsi baca API memanggil requireAutomation', ['posisiAisVoyage', 'kesehatanAis'].every((fn) => {
    const s = isi['read.service.ts']
    const i = s.indexOf(`export async function ${fn}(`)
    return i >= 0 && s.slice(i, i + 300).includes('requireAutomation(ctx)')
  }))
  cek('poll per tenant memakai systemContext + requireAutomation', /systemContext\(tenantId, 'ais:position-poll'\)/.test(poll) && /requireAutomation\(ctx\)/.test(poll))
  const reg = isi['registry.ts']
  cek('registry: peta tetap NONE & FAKE saja', /NONE: adapterNone,\s*FAKE: adapterFake,\s*\}/.test(reg) && !/new URL|http/.test(reg))

  // skema & migrasi
  const schema = baca('prisma/schema.prisma')
  const blok = (nama) => schema.match(new RegExp(`model ${nama} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? ''
  for (const m of ['AisObservation', 'AisPollRun', 'AisProviderState']) {
    cek(`${m}: FK tenant CASCADE + TENANT_MODELS`, /tenant\s+Tenant\s+@relation\(fields: \[tenantId\], references: \[id\], onDelete: Cascade\)/.test(blok(m)) && TENANT_MODELS.has(m))
  }
  cek('AisObservation: FK vessel CASCADE, run SET NULL', /vessel\s+Vessel\s+@relation\(fields: \[vesselId\], references: \[id\], onDelete: Cascade\)/.test(blok('AisObservation')) && /run\s+AisPollRun\?\s+@relation\(fields: \[runId\], references: \[id\], onDelete: SetNull\)/.test(blok('AisObservation')))
  cek('AisObservation: unique (tenant, vessel, provider, positionAt)', /@@unique\(\[tenantId, vesselId, provider, positionAt\]\)/.test(blok('AisObservation')))
  cek('AisProviderState: unique (tenant, provider)', /@@unique\(\[tenantId, provider\]\)/.test(blok('AisProviderState')))
  cek('MarineDataCache & MonitoringSignal tak diubah bentuknya (voyageId tetap wajib)', /voyageId\s+String\n/.test(blok('MonitoringSignal')) && /payload\s+Json/.test(blok('MarineDataCache')))
  const dirMig = readdirSync(join(AKAR, 'prisma/migrations')).filter((d) => d.includes('prd003'))
  cek('tepat satu migrasi PRD-003', dirMig.length === 1, dirMig.join(','))
  const sql = dirMig[0] ? baca(`prisma/migrations/${dirMig[0]}/migration.sql`) : ''
  cek('migrasi aditif: tanpa DROP/ALTER COLUMN/SET NOT NULL/TRUNCATE/DELETE/UPDATE', sql.length > 0 && !/DROP |ALTER COLUMN|SET NOT NULL|TRUNCATE|DELETE FROM|UPDATE "/i.test(sql))
  cek('migrasi tanpa GRANT ke maritime_portal', !/GRANT|maritime_portal/i.test(sql))
  cek('migrasi hanya membuat 3 tabel AIS', [...sql.matchAll(/CREATE TABLE "(\w+)"/g)].map((m) => m[1]).sort().join(',') === 'AisObservation,AisPollRun,AisProviderState')
  cek('ALTER TABLE hanya menambah FK pada tabel AIS', [...sql.matchAll(/ALTER TABLE "(\w+)" ADD CONSTRAINT/g)].every((m) => m[1].startsWith('Ais')))
  cek('indeks positionAt DESC ada', /"positionAt" DESC/.test(sql))

  // job, route, env, systemd, dokumen
  const job = baca('src/app/api/jobs/run/route.ts')
  cek("job 'ais-position-poll' terdaftar", /'ais-position-poll': \(\) => jalankanPollAisSemuaTenant\(\)/.test(job))
  cek("job 'voyage-monitoring' tetap terdaftar", /'voyage-monitoring': \(\) => jalankanMonitoringSemuaTenant\(\)/.test(job))
  const routes = ['ais/health/route.ts', 'ais/voyages/[id]/route.ts']
  cek('route AIS memakai withTenant & tak membaca tenantId dari request', routes.every((r) => existsSync(join(AKAR, 'src/app/api/automation', r)) && /withTenant\(/.test(baca(`src/app/api/automation/${r}`)) && !/tenantId/.test(baca(`src/app/api/automation/${r}`))))
  const envEx = baca('.env.example')
  cek('.env.example: AIS bawaan MATI, NONE, kuota kosong, stale 6, tanpa kunci', /AIS_ENABLED="false"/.test(envEx) && /AIS_PROVIDER="NONE"/.test(envEx) && /AIS_MONTHLY_CALL_CAP=""/.test(envEx) && /AIS_STALE_HOURS="6"/.test(envEx) && /AIS_PROVIDER_API_KEY=""/.test(envEx) && /AIS_TENANT_IDS=""/.test(envEx))
  const unit = baca('deploy/systemd/maritime-ais-poll.service')
  const timer = baca('deploy/systemd/maritime-ais-poll.timer')
  cek('unit systemd: LoadCredential token, tanpa token/kunci di unit', /LoadCredential=job-token:\/etc\/tribuana\/job-runner-token/.test(unit) && !/AIS_PROVIDER_API_KEY=|x-job-token/.test(unit) && /ExecStart=\/usr\/local\/sbin\/maritime-job-run ais-position-poll/.test(unit))
  cek('timer :15 (reminders :00, monitoring :30)', /OnCalendar=\*-\*-\* \*:15:00/.test(timer) && /Unit=maritime-ais-poll\.service/.test(timer))
  cek('unit ditandai artefak lokal (belum dipasang/diaktifkan)', /BELUM dipasang\/diaktifkan/.test(unit) && /JANGAN dipasang\/diaktifkan/.test(timer))
  const doc = baca('docs/FASE-8-SAAS-COMMERCIAL.md')
  cek('dokumen K177 memuat amandemen PRD-003 D1 + D5 gagal tertutup', /Amandemen K177 — PRD-003/.test(doc) && /tidak ada satu pun panggilan ke penyedia/.test(doc))
}

console.log(`\n${gagal === 0 ? '✅ SEMUA LULUS' : '❌ ADA YANG GAGAL'} — lulus ${lulus}, gagal ${gagal}`)
if (gagal > 0) process.exitCode = 1
