// Uji waktu bisnis Asia/Makassar + kunci sumber infrastruktur — PRD-002 Step 3.
//
// Jalankan:  node prisma/check-business-time.mjs      (murni: tanpa DB, tanpa dev server)
//
// Dua lapis:
//   1. MURNI — lib/business-time.ts: batas tengah malam saat tanggal UTC ≠ tanggal
//      Samarinda, batas bulan/tahun, teks WITA, dan KEBAL terhadap zona mesin.
//   2. KUNCI SUMBER — berkas Step 3 dibaca apa adanya: kunci pengingat memakai
//      tanggal bisnis, instan mutlak tetap UTC, tanggal voyage (D4) tak tersentuh,
//      hitungan job dari hasil notify(), log tanpa token, berkas deploy tanpa rahasia.

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ZONA_BISNIS, bulanBisnis, tanggalBisnis, waktuBisnis } from '../src/lib/business-time.ts'

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
const t = (s) => new Date(s)

// ---------------------------------------------------------------------- murni

console.log('\n[1] Batas tengah malam: tanggal UTC berbeda dari tanggal Samarinda')
for (const [iso, wita, utc] of [
  ['2026-09-14T15:59:59.999Z', '2026-09-14', '2026-09-14'],
  ['2026-09-14T16:00:00.000Z', '2026-09-15', '2026-09-14'],
  ['2026-09-14T23:59:59.999Z', '2026-09-15', '2026-09-14'],
  ['2026-09-15T00:00:00.000Z', '2026-09-15', '2026-09-15'],
  ['2026-09-15T15:59:59.999Z', '2026-09-15', '2026-09-15'],
]) {
  const hasil = tanggalBisnis(t(iso))
  cek(
    `${iso} → WITA ${wita}${wita !== utc ? ` (UTC masih ${utc})` : ''}`,
    hasil === wita && t(iso).toISOString().slice(0, 10) === utc,
    `dapat ${hasil}`,
  )
}

console.log('\n[2] Batas bulan, tahun, dan tahun kabisat')
cek('30 Sep 23:59:59 WITA → bulan 2026-09', bulanBisnis(t('2026-09-30T15:59:59Z')) === '2026-09')
cek('1 Okt 00:00 WITA (UTC masih 30 Sep) → bulan 2026-10', bulanBisnis(t('2026-09-30T16:00:00Z')) === '2026-10')
cek('31 Des 16:00 UTC → 2027-01-01 WITA', tanggalBisnis(t('2026-12-31T16:00:00Z')) === '2027-01-01')
cek('31 Des 16:00 UTC → bulan 2027-01', bulanBisnis(t('2026-12-31T16:00:00Z')) === '2027-01')
cek('28 Feb 2028 16:00 UTC → 2028-02-29 WITA (kabisat)', tanggalBisnis(t('2028-02-28T16:00:00Z')) === '2028-02-29')

console.log('\n[3] Teks untuk manusia')
cek('16:05 UTC → "2026-09-15 00:05 WITA" (jam 00, bukan 24)', waktuBisnis(t('2026-09-14T16:05:00Z')) === '2026-09-15 00:05 WITA', waktuBisnis(t('2026-09-14T16:05:00Z')))
cek('15:59 UTC → "2026-09-14 23:59 WITA"', waktuBisnis(t('2026-09-14T15:59:00Z')) === '2026-09-14 23:59 WITA')
cek('zona lain diberi label zonanya', waktuBisnis(t('2026-09-14T16:05:00Z'), 'UTC') === '2026-09-14 16:05 UTC')

console.log('\n[4] Kebal terhadap zona waktu mesin')
const tzAsli = process.env.TZ
const instan = t('2026-09-14T16:30:00Z')
for (const tz of ['UTC', 'Asia/Makassar', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
  process.env.TZ = tz
  cek(
    `TZ mesin ${tz} → tetap 2026-09-15 / 00:30 WITA`,
    tanggalBisnis(instan) === '2026-09-15' && waktuBisnis(instan) === '2026-09-15 00:30 WITA',
    `offset mesin ${new Date(instan).getTimezoneOffset()} menit`,
  )
}
if (tzAsli === undefined) delete process.env.TZ
else process.env.TZ = tzAsli

console.log('\n[5] Masukan tak valid')
let lempar = null
try {
  tanggalBisnis(new Date('bukan-tanggal'))
} catch (e) {
  lempar = e
}
cek('Date tak valid → RangeError (bukan "NaN-NaN-NaN")', lempar instanceof RangeError)
cek('ZONA_BISNIS = Asia/Makassar', ZONA_BISNIS === 'Asia/Makassar')

// --------------------------------------------------------------- kunci sumber

console.log('\n[6] Kunci sumber — job pengingat')
const rj = baca('src/services/ops/reminder-job.ts')
cek('reminder-job mengimpor lib/business-time', rj.includes("from '@/lib/business-time'"))
cek('TASK_OVERDUE memakai tanggalBisnis(sekarang)', /TASK_OVERDUE:\$\{taskId\}:\$\{tanggalBisnis\(sekarang\)\}/.test(rj))
cek('VENDOR_DOC_EXPIRING memakai bulanBisnis(sekarang)', /VENDOR_DOC_EXPIRING:\$\{attachmentId\}:\$\{bulanBisnis\(sekarang\)\}/.test(rj))
cek('KUOTA memakai bulanBisnis(sekarang)', /:\$\{penerimaUserId\}:\$\{bulanBisnis\(sekarang\)\}/.test(rj))
cek('tak ada lagi tanggal/bulan UTC (.slice(0, 10) / .slice(0, 7)) di reminder-job', !/toISOString\(\)\.slice\(0, (10|7)\)/.test(rj))
cek('TASK_DUE tetap memakai INSTAN mutlak dueAt (UTC per jam)', /TASK_DUE:\$\{taskId\}:\$\{dueAt\.toISOString\(\)\.slice\(0, 13\)\}/.test(rj))
cek("teks pengingat tak lagi berlabel ' UTC'", !rj.includes("' UTC'"))
cek('hitungan dari hasil notify() (bukan baca-ulang database)', rj.includes("=== 'DIBUAT'") && !/const lahir = await kunciYangSudahAda/.test(rj))
cek('gagal tulis dihitung terpisah (field gagal)', /gagal: number/.test(rj) && /hasil\.gagal\+\+/.test(rj))

console.log('\n[7] Kunci sumber — notifikasi, endpoint, proxy')
const ns = baca('src/services/notification.service.ts')
cek("notify() mengembalikan 'DIBUAT' | 'DUPLIKAT' | 'GAGAL'", ns.includes("export type HasilNotify = 'DIBUAT' | 'DUPLIKAT' | 'GAGAL'") && ns.includes('Promise<HasilNotify>'))
cek('P2002 pada dedupeKey = DUPLIKAT, bukan galat', /'P2002'/.test(ns) && ns.includes("return 'DUPLIKAT'"))
const rt = baca('src/app/api/jobs/run/route.ts')
cek('respons /api/jobs/run membawa ok', /\n\s+ok,\n\s+dijalankanPada/.test(rt))
cek('log jalan terstruktur [jobs/run]', rt.includes('[jobs/run]') && rt.includes('function catatJalan'))
cek('catatJalan tak pernah menerima token/header', !/catatJalan\([^)]*(token|headers)/i.test(rt))
cek('route tetap tidak menerima parameter waktu dari HTTP', !/searchParams\.get\('(sekarang|now|waktu)'\)/.test(rt))
const rr = baca('src/app/api/jobs/run-reminders/route.ts')
cek('tombol Settings memakai JOB_RUNNER_BASE_URL lebih dulu', /JOB_RUNNER_BASE_URL \|\| process\.env\.NEXT_PUBLIC_APP_URL/.test(rr))

console.log('\n[8] Kunci sumber — tanggal voyage (D4) TIDAK disentuh Step 3')
const vd = baca('src/services/master/voyage-dates.ts')
cek('voyage-dates.ts tetap tanpa impor', !/^import /m.test(vd))
cek('voyage-dates.ts tetap memakai komponen UTC (bukan tanggal bisnis)', vd.includes('toISOString().slice(0, 10)') && !vd.includes('tanggalBisnis'))

console.log('\n[9] Kunci sumber — berkas deploy')
const jobRun = baca('deploy/scripts/maritime-job-run.sh')
const lapor = baca('deploy/scripts/pg-backup-report.sh')
const unitRem = baca('deploy/systemd/maritime-reminders.service')
const timerRem = baca('deploy/systemd/maritime-reminders.timer')
const unitLapor = baca('deploy/systemd/pg-backup-report@.service')
const dropIn = baca('deploy/systemd/pg-backup.service.d/10-lapor-status.conf')
const semuaDeploy = [jobRun, lapor, unitRem, timerRem, unitLapor, dropIn, baca('deploy/systemd/pg-backup-report.env.example')]
cek('token lewat STDIN curl (-H @-) di kedua skrip', jobRun.includes('-H @-') && lapor.includes('-H @-'))
cek('tak ada header token di argumen curl', !/-H\s+["']x-job-token/.test(jobRun + lapor))
cek('bawaan loopback 127.0.0.1:3001 (tak lewat nginx)', jobRun.includes('http://127.0.0.1:3001') && lapor.includes('http://127.0.0.1:3001'))
cek('tak ada rahasia tertanam (hex ≥32 / nilai token / sandi URL)', semuaDeploy.every((s) => !/[A-Fa-f0-9]{32,}/.test(s) && !/JOB_RUNNER_TOKEN\s*=/.test(s) && !/postgres(ql)?:\/\/[^\s:]+:[^\s@]+@/.test(s)))
cek('pelapor backup tidak pernah menghapus berkas', !/-delete\b/.test(lapor) && !/\brm\s+(-[a-z]+\s+)*"?\$(TERBARU|BACKUP_DIR)/.test(lapor))
cek('unit memakai LoadCredential job-token', unitRem.includes('LoadCredential=job-token:/etc/tribuana/job-runner-token') && unitLapor.includes('LoadCredential=job-token:/etc/tribuana/job-runner-token'))
cek('timer Persistent=true', timerRem.includes('Persistent=true'))
cek('drop-in OnSuccess/OnFailure → pg-backup-report@ok / @gagal', dropIn.includes('OnSuccess=pg-backup-report@ok.service') && dropIn.includes('OnFailure=pg-backup-report@gagal.service'))
cek('NGINX: tak ada konfigurasi nginx di deploy/', !existsSync(join(AKAR, 'deploy', 'nginx')) && !readdirSync(join(AKAR, 'deploy')).some((f) => /nginx/i.test(f)))

console.log(`\n${gagal === 0 ? '✅ SEMUA LULUS' : '❌ ADA YANG GAGAL'} — lulus ${lulus}, gagal ${gagal}`)
if (gagal > 0) process.exitCode = 1
