// Uji mesin Task murni (services/ops/*.ts — modul murni Fase 7b).
//
// Jalankan:  node prisma/check-task-engine.mjs   (atau: npm run test:ops)
//
// TIDAK menyentuh database, TIDAK butuh server menyala. Itu memang intinya:
// aturan WAKTU dan STATUS dibuktikan benar SEBELUM satu baris pun menyentuh DB
// (§18/7b). Berkas .ts diimpor LANGSUNG (Node 24 mengurai TypeScript sendiri),
// jadi yang diuji adalah objek yang persis sama dengan yang dipakai aplikasi dan
// browser, bukan tiruannya (K11/K51).
//
// ⚠️ CARA MEMBUKTIKAN PAGAR K51 NYATA (diwajibkan §18/7b butir terakhir):
//    hilangkan kata `type` dari
//      `import type { StatusTugas } from './task-status'`
//    di src/services/ops/task-schedule.ts, lalu jalankan ulang berkas ini.
//    Ia HARUS gagal memuat seketika dengan ERR_MODULE_NOT_FOUND — ESM menuntut
//    ekstensi eksplisit, sedangkan menuliskan `.ts` eksplisit ditolak tsc
//    (TS5097). Tak ada bentuk impor NILAI lintas-modul murni yang lolos
//    keduanya; `import type` lolos karena hilang saat type-stripping.
//    Kembalikan kodenya, jalankan lagi, semua lulus.
//
//    Bagian 1 di bawah adalah lapis KEDUA pagar itu: impor nilai dari
//    '@prisma/client' TIDAK meruntuhkan Node (nilainya memang ada saat runtime),
//    jadi kemurnian juga diperiksa dengan MEMBACA sumber modulnya — pola yang
//    sama dengan check-epda-calc.mjs dan check-tenant-guard.mjs.

import { readFileSync } from 'node:fs'
import {
  JAM_BUKA_KEMBALI,
  PERAN_BOLEH_BUKA_KEMBALI,
  STATUS_TERMINAL_TUGAS,
  TRANSISI_TUGAS,
  adalahBukaKembali,
  bolehTransisiTugas,
  busurTugasAda,
  efekTransisiTugas,
  transisiTersediaTugas,
} from '../src/services/ops/task-status.ts'
import {
  JANGKAR_DIKENAL,
  STATUS_JADWAL_BEKU,
  hitungDueAt,
  jangkarDikenal,
  keputusanJadwalTugas,
  rencanaGeserJadwal,
  tanggalJangkar,
} from '../src/services/ops/task-schedule.ts'
import {
  BOBOT_AGENCY_TYPE,
  BOBOT_PORT,
  BOBOT_VESSEL_TYPE,
  adaPeringatanTemplate,
  lolosSaringanTemplate,
  pilihTemplate,
  skorTemplate,
} from '../src/services/ops/task-template-match.ts'
import {
  AMBANG_NORMALISASI,
  butuhNormalisasi,
  hitungPenempatan,
  normalisasiKolom,
  terapkanNormalisasi,
  urutanDiAtas,
  urutanDiAntara,
  urutanDiBawah,
  urutkanKolom,
} from '../src/services/ops/board-order.ts'
import {
  AMBANG_MENDEKATI_JAM,
  BATAS_NOTIFIKASI_PER_JALAN,
  JAM_KERJA,
  PERAN_ESKALASI_SLA,
  SLA_BAWAAN_PER_KATEGORI,
  slaBawaanKategori,
} from '../src/services/ops/sla-policy.ts'
import { KEADAAN_PERLU_PENGINGAT, PERINGKAT_KEGAWATAN, nilaiSla } from '../src/services/ops/sla.ts'

let lulus = 0
let gagal = 0

function cek(nama, syarat, keterangan = '') {
  if (syarat) {
    lulus++
    console.log(`  ✅ ${nama}`)
  } else {
    gagal++
    console.log(`  ❌ ${nama}${keterangan !== '' ? ` — ${keterangan}` : ''}`)
  }
}

const sama = (nama, dapat, harap) => cek(nama, dapat === harap, `dapat ${dapat}, harap ${harap}`)

/** Tanggal ISO → Date. Semua fixture memakai UTC eksplisit supaya zona waktu mesin tak ikut menguji. */
const t = (iso) => new Date(iso)
const iso = (d) => (d === null ? 'null' : d.toISOString())

const SEMUA_STATUS = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED']
const SEMUA_PERAN = [
  'ADMIN',
  'OPERATOR',
  'FINANCE',
  'VIEWER',
  'MANAJER_OPERASI',
  'PENYUSUN_BIAYA',
  'DIREKTUR',
]

// ============================================================================
// 1. Pagar K11/K51 — keenam modul benar-benar murni (pemeriksaan statis)
// ============================================================================
console.log('\n1. Pagar K11/K51: enam modul ops murni tanpa impor nilai')

const MODUL_MURNI = [
  'task-status.ts',
  'task-schedule.ts',
  'task-template-match.ts',
  'board-order.ts',
  'sla-policy.ts',
  'sla.ts',
]

const komentar = (b) => b.startsWith('//') || b.startsWith('*') || b.startsWith('/*')
const sumberModul = new Map()

for (const nama of MODUL_MURNI) {
  const isi = readFileSync(new URL(`../src/services/ops/${nama}`, import.meta.url), 'utf8')
  sumberModul.set(nama, isi)
  const kode = isi
    .split('\n')
    .map((b) => b.trim())
    .filter((b) => !komentar(b))

  const imporNilai = kode.filter((b) => b.startsWith('import ') && !b.startsWith('import type '))
  cek(`${nama}: setiap impor ber-\`import type\``, imporNilai.length === 0, imporNilai.join(' | '))
  cek(`${nama}: tanpa require()`, !kode.some((b) => b.includes('require(')))

  // Berbeda dari check-epda-calc.mjs yang melarang `new Date(` sama sekali:
  // task-schedule.ts MEMANG membangun Date dari argumen (dueAt = jangkar +
  // offset). Yang dilarang adalah MEMBACA JAM — `new Date()` tanpa argumen dan
  // `Date.now()`. Itulah yang membuat "buka kembali ≤ 24 jam" bisa diuji tanpa
  // menunggu 24 jam, dan tabel K94 bisa jadi fixture emas ber-timestamp tetap.
  cek(
    `${nama}: tanpa new Date() / Date.now() — jam selalu masuk sebagai argumen`,
    !kode.some((b) => b.includes('new Date()') || b.includes('Date.now(')),
  )

  // Service layer, route, dan alias `@/` TIDAK BOLEH disentuh sama sekali —
  // bahkan sebagai tipe. `import type { TaskStatus } from '@prisma/client'`
  // BOLEH: ia hilang saat type-stripping dan tak pernah di-resolve, sama seperti
  // calc-engine.ts yang mengimpor tipe CalcMethod.
  const terlarang = kode.filter(
    (b) =>
      b.startsWith('import') &&
      (b.includes("from '@/") || b.includes('.service') || b.includes("from 'next")),
  )
  cek(
    `${nama}: tak mengimpor service / next / alias @/`,
    terlarang.length === 0,
    terlarang.join(' | '),
  )

  // Kelas ber-"parameter property" (`constructor(readonly x: T)`) ditolak
  // penghapus-tipe Node dengan ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX — konvensi 7a,
  // lihat catatan OwnerGuardError di owner-guard.ts. Diperiksa pada KODE saja
  // (komentar sudah disaring), supaya catatan larangannya sendiri tidak memicu.
  cek(
    `${nama}: tanpa "parameter property" di constructor`,
    !/constructor\s*\([^)]*\b(readonly|public|private|protected)\b/.test(kode.join('\n')),
  )
}

// Satu-satunya impor relatif antar-modul murni WAJIB tetap ada: dialah sasaran
// bukti K51 di kepala berkas ini. Kalau ia hilang, buktinya jadi tak bisa
// dijalankan dan pagar ini diam-diam berhenti berarti.
cek(
  'task-schedule.ts memakai `import type` RELATIF ke task-status (sasaran bukti K51)',
  /import type \{[^}]*\} from '\.\/task-status'/.test(sumberModul.get('task-schedule.ts')),
)

// ============================================================================
// 2. Transisi status K91 — graf lima status
// ============================================================================
console.log('\n2. K91: graf transisi lima status')

sama('TRANSISI_TUGAS memuat kelima status', Object.keys(TRANSISI_TUGAS).length, 5)
for (const s of SEMUA_STATUS) cek(`status ${s} terdaftar di tabel transisi`, Array.isArray(TRANSISI_TUGAS[s]))
cek('CANCELLED terminal (tanpa tujuan)', TRANSISI_TUGAS.CANCELLED.length === 0)
cek('CANCELLED ada di STATUS_TERMINAL_TUGAS', STATUS_TERMINAL_TUGAS.has('CANCELLED'))
cek('DONE BUKAN terminal — punya jalan buka-kembali berpagar', !STATUS_TERMINAL_TUGAS.has('DONE'))

const ADMIN = 'ADMIN'
const SEKARANG = t('2026-09-01T12:00:00.000Z')

// `'blockedReason' in opsi` dan BUKAN `??`: uji di bagian 3 justru mengirim
// `null`/`undefined` dengan sengaja, dan `??` akan diam-diam menggantinya dengan
// alasan bawaan — uji yang selalu lulus karena tak pernah menguji apa pun.
const izin = (dari, ke, opsi = {}) =>
  bolehTransisiTugas({
    dari,
    ke,
    peran: opsi.peran ?? ADMIN,
    blockedReason:
      'blockedReason' in opsi
        ? opsi.blockedReason
        : ke === 'BLOCKED'
          ? 'menunggu dokumen pandu'
          : null,
    completedAt: opsi.completedAt ?? null,
    sekarang: opsi.sekarang ?? SEKARANG,
  })

console.log('\n   11 transisi SAH harus lolos:')
const SAH = [
  ['TODO', 'IN_PROGRESS'],
  ['TODO', 'BLOCKED'],
  ['TODO', 'CANCELLED'],
  ['IN_PROGRESS', 'TODO'],
  ['IN_PROGRESS', 'BLOCKED'],
  ['IN_PROGRESS', 'DONE'],
  ['IN_PROGRESS', 'CANCELLED'],
  ['BLOCKED', 'TODO'],
  ['BLOCKED', 'IN_PROGRESS'],
  ['BLOCKED', 'CANCELLED'],
]
for (const [dari, ke] of SAH) {
  const h = izin(dari, ke)
  cek(`${dari} → ${ke} lolos`, h.boleh === true, JSON.stringify(h))
}
const bukaSah = izin('DONE', 'IN_PROGRESS', {
  peran: 'MANAJER_OPERASI',
  completedAt: t('2026-09-01T10:00:00.000Z'),
})
cek('DONE → IN_PROGRESS (MANAJER_OPERASI, 2 jam lalu) lolos', bukaSah.boleh === true, JSON.stringify(bukaSah))

console.log('\n   10 transisi TAK SAH harus ditolak:')
const TAK_SAH = [
  ['TODO', 'DONE'], // wajib lewat IN_PROGRESS
  ['DONE', 'TODO'],
  ['DONE', 'BLOCKED'],
  ['DONE', 'CANCELLED'],
  ['CANCELLED', 'TODO'],
  ['CANCELLED', 'IN_PROGRESS'],
  ['CANCELLED', 'BLOCKED'],
  ['CANCELLED', 'DONE'],
  ['BLOCKED', 'DONE'],
  ['TODO', 'TODO'],
]
for (const [dari, ke] of TAK_SAH) {
  const h = izin(dari, ke)
  cek(
    `${dari} → ${ke} ditolak TRANSISI_TAK_SAH`,
    h.boleh === false && h.alasan === 'TRANSISI_TAK_SAH',
    JSON.stringify(h),
  )
}

// CANCELLED → apa pun, keempat tujuan sekaligus (butir eksplisit §18/7b).
const dariCancelled = SEMUA_STATUS.filter((s) => s !== 'CANCELLED').every(
  (ke) => izin('CANCELLED', ke).boleh === false,
)
cek('CANCELLED → APA PUN ditolak (keempat tujuan)', dariCancelled)
cek('busurTugasAda("TODO","DONE") = false', busurTugasAda('TODO', 'DONE') === false)
cek(
  'TODO → IN_PROGRESS → DONE: jalur yang BENAR memang terbuka',
  busurTugasAda('TODO', 'IN_PROGRESS') && busurTugasAda('IN_PROGRESS', 'DONE'),
)

// ============================================================================
// 3. BLOCKED wajib beralasan (K91)
// ============================================================================
console.log('\n3. K91: BLOCKED tanpa blockedReason ditolak')

for (const kosong of [null, undefined, '', '   ', '\n\t']) {
  const h = izin('TODO', 'BLOCKED', { blockedReason: kosong })
  cek(
    `blockedReason ${JSON.stringify(kosong)} → BLOKIR_TANPA_ALASAN`,
    h.boleh === false && h.alasan === 'BLOKIR_TANPA_ALASAN',
    JSON.stringify(h),
  )
}
cek(
  'blockedReason terisi → lolos',
  izin('IN_PROGRESS', 'BLOCKED', { blockedReason: 'menunggu SPB' }).boleh === true,
)
cek(
  'alasan kosong tidak menutupi transisi yang memang tak sah',
  izin('CANCELLED', 'BLOCKED', { blockedReason: null }).alasan === 'TRANSISI_TAK_SAH',
)

// ============================================================================
// 4. Buka kembali DONE → IN_PROGRESS: jendela 24 jam + pagar peran (K91)
// ============================================================================
console.log('\n4. K91: buka kembali berpagar peran + jendela waktu')

sama('jendela buka-kembali = 24 jam', JAM_BUKA_KEMBALI, 24)
cek('adalahBukaKembali(DONE, IN_PROGRESS)', adalahBukaKembali('DONE', 'IN_PROGRESS'))

const buka = (jamLalu, peran) =>
  bolehTransisiTugas({
    dari: 'DONE',
    ke: 'IN_PROGRESS',
    peran,
    completedAt: new Date(SEKARANG.getTime() - jamLalu * 3_600_000),
    sekarang: SEKARANG,
  })

const b2 = buka(2, ADMIN)
cek(`completedAt 2 jam lalu, ADMIN → boleh`, b2.boleh === true, JSON.stringify(b2))
const b2m = buka(2, 'MANAJER_OPERASI')
cek(`completedAt 2 jam lalu, MANAJER_OPERASI → boleh`, b2m.boleh === true, JSON.stringify(b2m))

const b30 = buka(30, ADMIN)
cek(
  `completedAt 30 jam lalu, ADMIN → ditolak BUKA_KEMBALI_KEDALUWARSA`,
  b30.boleh === false && b30.alasan === 'BUKA_KEMBALI_KEDALUWARSA',
  JSON.stringify(b30),
)

const bOp = buka(2, 'OPERATOR')
cek(
  `peran OPERATOR (2 jam lalu) → ditolak BUKA_KEMBALI_PERAN`,
  bOp.boleh === false && bOp.alasan === 'BUKA_KEMBALI_PERAN',
  JSON.stringify(bOp),
)

// Batas jendela: 24,000 jam masih boleh; 24,001 jam sudah tidak.
cek('tepat 24,000 jam → masih boleh (batas inklusif)', buka(24, ADMIN).boleh === true)
cek(
  'tepat 24 jam + 1 detik → ditolak',
  buka(24 + 1 / 3600, ADMIN).alasan === 'BUKA_KEMBALI_KEDALUWARSA',
)

const bolehPeran = SEMUA_PERAN.filter((p) => buka(1, p).boleh === true)
cek(
  'hanya ADMIN & MANAJER_OPERASI dari 7 peran yang boleh membuka kembali',
  bolehPeran.length === 2 && bolehPeran.includes('ADMIN') && bolehPeran.includes('MANAJER_OPERASI'),
  `dapat ${bolehPeran.join(',')}`,
)
sama('PERAN_BOLEH_BUKA_KEMBALI berisi 2 peran', PERAN_BOLEH_BUKA_KEMBALI.length, 2)

const bTanpa = bolehTransisiTugas({
  dari: 'DONE',
  ke: 'IN_PROGRESS',
  peran: ADMIN,
  completedAt: null,
  sekarang: SEKARANG,
})
cek(
  'DONE tanpa completedAt → ditolak (K99 dilanggar di tempat lain, jangan ditebak)',
  bTanpa.alasan === 'BUKA_KEMBALI_TANPA_COMPLETED_AT',
  JSON.stringify(bTanpa),
)

// Peran hanya berpengaruh pada buka-kembali — transisi lain tak dipagari di
// modul murni (pagar "tugas milik sendiri" K98 butuh DB, tinggal di 7c).
cek(
  'OPERATOR tetap boleh IN_PROGRESS → DONE (pagar peran hanya di buka-kembali)',
  izin('IN_PROGRESS', 'DONE', { peran: 'OPERATOR' }).boleh === true,
)
cek(
  'transisiTersediaTugas(DONE, OPERATOR) kosong — tombol tak muncul',
  transisiTersediaTugas('DONE', 'OPERATOR').length === 0,
)
cek(
  'transisiTersediaTugas(DONE, ADMIN) = [IN_PROGRESS]',
  transisiTersediaTugas('DONE', ADMIN).join(',') === 'IN_PROGRESS',
)

// ============================================================================
// 5. Efek transisi pada snapshot K99
// ============================================================================
console.log('\n5. K99: completedAt & startedAt di-snapshot, bukan turunan updatedAt')

const e1 = efekTransisiTugas({ dari: 'TODO', ke: 'IN_PROGRESS', startedAt: null, sekarang: SEKARANG })
cek('TODO → IN_PROGRESS mengisi startedAt', e1.startedAt?.getTime() === SEKARANG.getTime())

const e2 = efekTransisiTugas({
  dari: 'BLOCKED',
  ke: 'IN_PROGRESS',
  startedAt: t('2026-08-30T00:00:00.000Z'),
  sekarang: SEKARANG,
})
cek('IN_PROGRESS kedua kali TIDAK mereset startedAt', e2.startedAt === undefined)
cek('keluar dari BLOCKED mengosongkan blockedReason', e2.blockedReason === null)

const e3 = efekTransisiTugas({ dari: 'IN_PROGRESS', ke: 'DONE', sekarang: SEKARANG })
cek('masuk DONE mengisi completedAt', e3.completedAt?.getTime() === SEKARANG.getTime())

const e4 = efekTransisiTugas({ dari: 'DONE', ke: 'IN_PROGRESS', sekarang: SEKARANG })
cek('keluar DONE MENGOSONGKAN completedAt (K99)', e4.completedAt === null)

const e5 = efekTransisiTugas({
  dari: 'TODO',
  ke: 'BLOCKED',
  blockedReason: '  menunggu pandu  ',
  sekarang: SEKARANG,
})
cek('masuk BLOCKED menyimpan alasan yang sudah dirapikan', e5.blockedReason === 'menunggu pandu')

// ============================================================================
// 6. hitungDueAt — jangkar + offset (K94)
// ============================================================================
console.log('\n6. K94: hitungDueAt(anchor, offsetHours, jangkar)')

const ETA = t('2026-09-01T08:00:00.000Z')
const JANGKAR = {
  eta: ETA,
  etb: t('2026-09-01T14:00:00.000Z'),
  etc: t('2026-09-02T06:00:00.000Z'),
  etd: t('2026-09-02T18:00:00.000Z'),
  ata: null,
  voyageCreatedAt: t('2026-08-20T03:15:00.000Z'),
}

sama(
  "anchor='ETA', offsetHours=-24 → 2026-08-31T08:00:00.000Z",
  iso(hitungDueAt('ETA', -24, JANGKAR)),
  '2026-08-31T08:00:00.000Z',
)
sama(
  "anchor='ETA', offsetHours=+6 → 2026-09-01T14:00:00.000Z",
  iso(hitungDueAt('ETA', 6, JANGKAR)),
  '2026-09-01T14:00:00.000Z',
)
sama("offsetHours=0 → tepat jangkarnya", iso(hitungDueAt('ETA', 0, JANGKAR)), '2026-09-01T08:00:00.000Z')
sama('offsetHours=null diperlakukan 0', iso(hitungDueAt('ETA', null, JANGKAR)), '2026-09-01T08:00:00.000Z')
sama(
  "anchor='ETB', offsetHours=-2 → 2026-09-01T12:00:00.000Z",
  iso(hitungDueAt('ETB', -2, JANGKAR)),
  '2026-09-01T12:00:00.000Z',
)
sama(
  "anchor='VOYAGE_CREATED', offsetHours=+48 → 2026-08-22T03:15:00.000Z",
  iso(hitungDueAt('VOYAGE_CREATED', 48, JANGKAR)),
  '2026-08-22T03:15:00.000Z',
)

const etaKosong = hitungDueAt('ETA', -24, { ...JANGKAR, eta: null })
cek(
  'ETA null → null (BUKAN galat, BUKAN NaN, BUKAN Invalid Date)',
  etaKosong === null,
  `dapat ${etaKosong}`,
)
const ataKosong = hitungDueAt('ATA', 1, JANGKAR)
cek('ATA belum ada → null', ataKosong === null, `dapat ${ataKosong}`)
const manual = hitungDueAt('MANUAL', -24, JANGKAR)
cek("anchor='MANUAL' → null", manual === null, `dapat ${manual}`)
cek('anchor null → null', hitungDueAt(null, -24, JANGKAR) === null)
cek('anchor tak dikenal → null (bukan lempar)', hitungDueAt('BULAN_PURNAMA', -24, JANGKAR) === null)
cek('offsetHours NaN diperlakukan 0, hasil tetap Date sah', iso(hitungDueAt('ETA', NaN, JANGKAR)) === '2026-09-01T08:00:00.000Z')
cek('hasilnya selalu Date sah bila tidak null', !Number.isNaN(hitungDueAt('ETA', -24, JANGKAR).getTime()))

sama('JANGKAR_DIKENAL berisi 7 nilai', JANGKAR_DIKENAL.length, 7)
cek('jangkarDikenal("ETA")', jangkarDikenal('ETA'))
cek('jangkarDikenal("eta") = false (case-sensitive)', !jangkarDikenal('eta'))
cek('tanggalJangkar("MANUAL") = null', tanggalJangkar('MANUAL', JANGKAR) === null)

// ============================================================================
// 7. FIXTURE EMAS — tabel pergerakan jangkar K94, satu uji per baris
// ============================================================================
console.log('\n7. K94 fixture emas: tabel pergerakan jangkar (4 baris)')

// ETA voyage MUNDUR 2 hari: 2026-09-01T08:00Z → 2026-09-03T08:00Z.
const JANGKAR_BARU = { ...JANGKAR, eta: t('2026-09-03T08:00:00.000Z'), etb: t('2026-09-03T14:00:00.000Z') }
const DUE_LAMA = t('2026-08-31T08:00:00.000Z') // ETA − 24 jam, menurut ETA LAMA
const DUE_HARAP = '2026-09-02T08:00:00.000Z' // ETA − 24 jam, menurut ETA BARU

const tugas = (patch) => ({
  id: patch.id,
  status: 'TODO',
  anchor: 'ETA',
  offsetHours: -24,
  dueAt: DUE_LAMA,
  dueAtManual: false,
  ...patch,
})

console.log('   baris 1 — dueAtManual=false, status TODO/IN_PROGRESS/BLOCKED → IKUT BERGESER')
for (const status of ['TODO', 'IN_PROGRESS', 'BLOCKED']) {
  const k = keputusanJadwalTugas(tugas({ id: `b1-${status}`, status }), JANGKAR_BARU)
  cek(
    `${status} bergeser ${iso(DUE_LAMA)} → ${DUE_HARAP}`,
    k.geser === true && iso(k.dueAtBaru) === DUE_HARAP,
    JSON.stringify(k),
  )
}
cek(
  'BLOCKED memang TIDAK beku — ia pekerjaan berjalan yang sedang macet',
  !STATUS_JADWAL_BEKU.has('BLOCKED'),
)

console.log('   baris 2 — dueAtManual=true → TIDAK BERUBAH, selamanya')
const b2r = keputusanJadwalTugas(tugas({ id: 'b2', dueAtManual: true }), JANGKAR_BARU)
cek(
  'dueAtManual=true TIDAK bergeser (alasan DUE_AT_MANUAL)',
  b2r.geser === false && b2r.alasan === 'DUE_AT_MANUAL' && iso(b2r.dueAtLama) === iso(DUE_LAMA),
  JSON.stringify(b2r),
)
// dueAtManual menang atas SEGALANYA — termasuk atas jangkar yang sah & terisi.
const b2semua = ['TODO', 'IN_PROGRESS', 'BLOCKED'].every(
  (status) => keputusanJadwalTugas(tugas({ id: 'b2x', status, dueAtManual: true }), JANGKAR_BARU).geser === false,
)
cek('dueAtManual=true tak bergeser pada ketiga status berjalan', b2semua)

console.log('   baris 3 — status DONE/CANCELLED → TIDAK BERUBAH (tenggat masa lalu beku)')
for (const status of ['DONE', 'CANCELLED']) {
  const k = keputusanJadwalTugas(tugas({ id: `b3-${status}`, status }), JANGKAR_BARU)
  cek(
    `${status} TIDAK bergeser (alasan STATUS_SELESAI)`,
    k.geser === false && k.alasan === 'STATUS_SELESAI' && iso(k.dueAtLama) === iso(DUE_LAMA),
    JSON.stringify(k),
  )
}

console.log("   baris 4 — anchor 'MANUAL' atau null → TIDAK BERUBAH")
for (const anchor of ['MANUAL', null, 'BULAN_PURNAMA']) {
  const k = keputusanJadwalTugas(tugas({ id: `b4-${anchor}`, anchor }), JANGKAR_BARU)
  cek(
    `anchor ${JSON.stringify(anchor)} TIDAK bergeser (alasan JANGKAR_MANUAL)`,
    k.geser === false && k.alasan === 'JANGKAR_MANUAL',
    JSON.stringify(k),
  )
}

console.log('   tambahan — tanggal jangkar kosong & hitungan yang tidak berubah')
const b5 = keputusanJadwalTugas(tugas({ id: 'b5', anchor: 'ATA' }), JANGKAR_BARU)
cek(
  'jangkar sah tapi tanggalnya kosong → TANGGAL_JANGKAR_KOSONG (bukan galat)',
  b5.geser === false && b5.alasan === 'TANGGAL_JANGKAR_KOSONG',
  JSON.stringify(b5),
)
const b6 = keputusanJadwalTugas(tugas({ id: 'b6', dueAt: t(DUE_HARAP) }), JANGKAR_BARU)
cek(
  'dueAt sudah sama dengan hitungan baru → TIDAK_BERUBAH (nol UPDATE)',
  b6.geser === false && b6.alasan === 'TIDAK_BERUBAH',
  JSON.stringify(b6),
)

console.log('   rencana satu voyage — hanya yang perlu yang ditulis')
const rencana = rencanaGeserJadwal(
  [
    tugas({ id: 'r-todo' }),
    tugas({ id: 'r-inprogress', status: 'IN_PROGRESS' }),
    tugas({ id: 'r-blocked', status: 'BLOCKED' }),
    tugas({ id: 'r-manual', dueAtManual: true }),
    tugas({ id: 'r-done', status: 'DONE' }),
    tugas({ id: 'r-cancelled', status: 'CANCELLED' }),
    tugas({ id: 'r-anchor-manual', anchor: 'MANUAL' }),
  ],
  JANGKAR_BARU,
)
sama('7 tugas diperiksa', rencana.keputusan.length, 7)
sama('hanya 3 yang perlu ditulis', rencana.perluDigeser.length, 3)
cek(
  'yang ditulis persis tugas TODO/IN_PROGRESS/BLOCKED',
  rencana.perluDigeser.map((p) => p.id).sort().join(',') === 'r-blocked,r-inprogress,r-todo',
  rencana.perluDigeser.map((p) => p.id).join(','),
)
cek(
  'semua yang ditulis memakai dueAt yang sama & benar',
  rencana.perluDigeser.every((p) => iso(p.dueAt) === DUE_HARAP),
)

// ============================================================================
// 8. board-order K92 — sisip di tengah, di atas, dan normalisasi malas
// ============================================================================
console.log('\n8. K92: urutan papan Float, sisipan di tengah, normalisasi malas')

const kolomDasar = urutkanKolom([
  { id: 'A', boardOrder: 1.0 },
  { id: 'B', boardOrder: 2.0 },
])

sama('sisip di antara 1,0 dan 2,0 → 1,5', hitungPenempatan(kolomDasar, 1).boardOrder, 1.5)
sama('sisip paling atas → min − 1 = 0', hitungPenempatan(kolomDasar, 0).boardOrder, 0)
sama('sisip paling bawah → max + 1 = 3', hitungPenempatan(kolomDasar, 2).boardOrder, 3)
sama('kolom kosong → 1', hitungPenempatan([], 0).boardOrder, 1)
sama('indeks di luar rentang dijepit ke bawah', hitungPenempatan(kolomDasar, 99).boardOrder, 3)
sama('indeks negatif dijepit ke atas', hitungPenempatan(kolomDasar, -5).boardOrder, 0)
sama('urutanDiAtas(1)', urutanDiAtas(1), 0)
sama('urutanDiBawah(2)', urutanDiBawah(2), 3)
sama('urutanDiAntara(1,2)', urutanDiAntara(1, 2), 1.5)
cek('kolom baru belum butuh normalisasi', !butuhNormalisasi(kolomDasar))
cek('satu sisipan biasa tidak memicu normalisasi', hitungPenempatan(kolomDasar, 1).butuhNormalisasi === false)

console.log('\n   60 sisipan berturut-turut di CELAH YANG SAMA')
let kolom = [
  { id: 'atas', boardOrder: 1.0 },
  { id: 'bawah', boardOrder: 2.0 },
]
let normalisasiTerpicu = 0
let jejak = null // potret sebelum/sesudah normalisasi PERTAMA
let celahTerkecil = Infinity

for (let i = 1; i <= 60; i++) {
  const terurut = urutkanKolom(kolom)
  // Selalu menyisip di celah yang SAMA: tepat di bawah kartu teratas.
  const h = hitungPenempatan(terurut, 1)
  kolom = urutkanKolom([...terurut, { id: `k${String(i).padStart(2, '0')}`, boardOrder: h.boardOrder }])

  for (let j = 1; j < kolom.length; j++) {
    celahTerkecil = Math.min(celahTerkecil, kolom[j].boardOrder - kolom[j - 1].boardOrder)
  }

  if (h.butuhNormalisasi || butuhNormalisasi(kolom)) {
    const sebelumId = kolom.map((k) => k.id)
    const sebelumNilai = kolom.map((k) => k.boardOrder)
    const perubahan = normalisasiKolom(kolom)
    kolom = urutkanKolom(terapkanNormalisasi(kolom, perubahan))
    const sesudahId = kolom.map((k) => k.id)

    normalisasiTerpicu++
    if (jejak === null) {
      jejak = { iterasi: i, sebelumId, sebelumNilai, sesudahId, sesudahNilai: kolom.map((k) => k.boardOrder), jumlahUpdate: perubahan.length }
    }
  }
}

cek('normalisasi TERPICU dalam 60 sisipan', normalisasiTerpicu > 0, `terpicu ${normalisasiTerpicu}×`)
sama('kolom akhir berisi 62 kartu (2 awal + 60 sisipan)', kolom.length, 62)
cek(
  `celah terkecil yang pernah terjadi menyentuh ambang ${AMBANG_NORMALISASI}`,
  celahTerkecil < AMBANG_NORMALISASI,
  `celah terkecil ${celahTerkecil}`,
)

if (jejak) {
  console.log(`   normalisasi pertama pada sisipan ke-${jejak.iterasi}, ${jejak.jumlahUpdate} baris di-UPDATE`)
  console.log(`   id SEBELUM : ${jejak.sebelumId.join(' ')}`)
  console.log(`   id SESUDAH : ${jejak.sesudahId.join(' ')}`)
  console.log(`   nilai sebelum (3 teratas): ${jejak.sebelumNilai.slice(0, 3).join(' , ')}`)
  console.log(`   nilai sesudah (3 teratas): ${jejak.sesudahNilai.slice(0, 3).join(' , ')}`)
  cek(
    'URUTAN RELATIF id SAMA PERSIS sebelum & sesudah normalisasi',
    jejak.sebelumId.join('|') === jejak.sesudahId.join('|'),
    `sebelum ${jejak.sebelumId.join(',')} vs sesudah ${jejak.sesudahId.join(',')}`,
  )
  cek(
    'nilai memang berubah (bukan lulus karena tak terjadi apa-apa)',
    jejak.sebelumNilai.join('|') !== jejak.sesudahNilai.join('|'),
  )
  cek(
    'sesudah normalisasi kolom TIDAK lagi rapat',
    !butuhNormalisasi(urutkanKolom(kolom)),
  )
  cek(
    'nilai sesudah normalisasi adalah 1..n yang menaik ketat',
    jejak.sesudahNilai.every((v, i) => v === i + 1),
  )
}

// Bukti tambahan urutan relatif: id sisipan ke-60 harus tetap paling atas
// (setiap sisipan masuk ke celah teratas, jadi yang terbaru selalu di atas).
const urutanAkhir = kolom.map((k) => k.id)
sama('kartu tertua "atas" tetap paling awal', urutanAkhir[0], 'atas')
sama('sisipan terakhir (k60) berada tepat sesudahnya', urutanAkhir[1], 'k60')
sama('kartu "bawah" tetap paling akhir', urutanAkhir[urutanAkhir.length - 1], 'bawah')

// ============================================================================
// 9. nilaiSla K100 — lima keadaan + dua batas yang ditetapkan
// ============================================================================
console.log('\n9. K100: nilaiSla — lima keadaan, jam kalender (K104)')

sama('AMBANG_MENDEKATI_JAM = 12 (P32)', AMBANG_MENDEKATI_JAM, 12)
sama('BATAS_NOTIFIKASI_PER_JALAN = 500 (K102)', BATAS_NOTIFIKASI_PER_JALAN, 500)
cek('JAM_KERJA = null → jam kalender 24/7 (K104/P33)', JAM_KERJA === null)
cek(
  'PERAN_ESKALASI_SLA = ADMIN+MANAJER_OPERASI, bertarget bukan siaran (K103/P34 final)',
  Array.isArray(PERAN_ESKALASI_SLA) &&
    PERAN_ESKALASI_SLA.length === 2 &&
    PERAN_ESKALASI_SLA.includes('ADMIN') &&
    PERAN_ESKALASI_SLA.includes('MANAJER_OPERASI'),
  JSON.stringify(PERAN_ESKALASI_SLA),
)
cek(
  'SEMUA SLA bawaan per kategori masih null — kebijakan menunggu, bukan ditebak (P32)',
  Object.values(SLA_BAWAAN_PER_KATEGORI).every((v) => v === null),
  JSON.stringify(SLA_BAWAAN_PER_KATEGORI),
)
sama('7 kategori terdaftar', Object.keys(SLA_BAWAAN_PER_KATEGORI).length, 7)
cek('slaBawaanKategori("PORT_CLEARANCE") = null', slaBawaanKategori('PORT_CLEARANCE') === null)
cek('slaBawaanKategori kategori tak dikenal = null (bukan galat)', slaBawaanKategori('APA_SAJA') === null)
cek('slaBawaanKategori("constructor") = null (tak tertipu prototipe)', slaBawaanKategori('constructor') === null)

const DUE = t('2026-09-01T08:00:00.000Z')
const sla = (o) =>
  nilaiSla({
    dueAt: 'dueAt' in o ? o.dueAt : DUE,
    completedAt: o.completedAt ?? null,
    slaHours: o.slaHours ?? null,
    sekarang: o.sekarang ?? t('2026-09-01T00:00:00.000Z'),
    ambangMendekatiJam: AMBANG_MENDEKATI_JAM,
  })

console.log('   kelima keadaan:')
const sAman = sla({ sekarang: t('2026-08-30T08:00:00.000Z') }) // sisa 48 jam
sama('AMAN (sisa 48 jam)', sAman.keadaan, 'AMAN')
sama('  sisaJam = 48', sAman.sisaJam, 48)
cek('  telatJam null saat AMAN', sAman.telatJam === null)

const sDekat = sla({ sekarang: t('2026-08-31T22:00:00.000Z') }) // sisa 10 jam
sama('MENDEKATI (sisa 10 jam)', sDekat.keadaan, 'MENDEKATI')
sama('  sisaJam = 10', sDekat.sisaJam, 10)

const sTelat = sla({ sekarang: t('2026-09-01T10:00:00.000Z') }) // lewat 2 jam, belum selesai
sama('TERLAMBAT (lewat 2 jam, belum selesai)', sTelat.keadaan, 'TERLAMBAT')
sama('  telatJam = 2', sTelat.telatJam, 2)
sama('  sisaJam negatif = −2', sTelat.sisaJam, -2)

const sLanggar = sla({
  completedAt: t('2026-09-01T09:30:00.000Z'),
  sekarang: t('2026-09-05T00:00:00.000Z'),
})
sama('DILANGGAR (selesai 1,5 jam sesudah tenggat)', sLanggar.keadaan, 'DILANGGAR')
sama('  telatJam = 1,5', sLanggar.telatJam, 1.5)

const sTanpa = sla({ dueAt: null, sekarang: t('2030-01-01T00:00:00.000Z') })
sama('TIDAK_BER_SLA saat dueAt = null', sTanpa.keadaan, 'TIDAK_BER_SLA')
cek('  BUKAN AMAN dan BUKAN DILANGGAR', sTanpa.keadaan !== 'AMAN' && sTanpa.keadaan !== 'DILANGGAR')
cek('  sisaJam & telatJam null (tak mengarang angka)', sTanpa.sisaJam === null && sTanpa.telatJam === null)
cek(
  'dueAt null tetap TIDAK_BER_SLA walau completedAt terisi',
  sla({ dueAt: null, completedAt: t('2026-09-09T00:00:00.000Z') }).keadaan === 'TIDAK_BER_SLA',
)
cek('kelima keadaan benar-benar muncul', new Set([sAman.keadaan, sDekat.keadaan, sTelat.keadaan, sLanggar.keadaan, sTanpa.keadaan]).size === 5)

console.log('   batas 1 — selesai TEPAT pada detik dueAt:')
const sTepat = sla({ completedAt: t('2026-09-01T08:00:00.000Z'), sekarang: t('2026-09-02T00:00:00.000Z') })
cek(
  'completedAt === dueAt (detik yang sama) → BUKAN DILANGGAR',
  sTepat.keadaan !== 'DILANGGAR',
  `dapat ${sTepat.keadaan}`,
)
sama('  keadaannya AMAN', sTepat.keadaan, 'AMAN')
sama('  telatJam null', sTepat.telatJam, null)
const sSatuMs = sla({ completedAt: t('2026-09-01T08:00:00.001Z'), sekarang: t('2026-09-02T00:00:00.000Z') })
sama('completedAt = dueAt + 1 ms → DILANGGAR (batas benar-benar di titik itu)', sSatuMs.keadaan, 'DILANGGAR')
const sSatuMsAwal = sla({ completedAt: t('2026-09-01T07:59:59.999Z'), sekarang: t('2026-09-02T00:00:00.000Z') })
sama('completedAt = dueAt − 1 ms → AMAN', sSatuMsAwal.keadaan, 'AMAN')

console.log('   batas 2 — ambang MENDEKATI tepat 12 jam:')
const s12 = sla({ sekarang: t('2026-08-31T20:00:00.000Z') }) // sisa TEPAT 12,000 jam
sama('sisa tepat 12,000 jam → MENDEKATI (inklusif)', s12.keadaan, 'MENDEKATI')
sama('  sisaJam = 12', s12.sisaJam, 12)
const s12plus = sla({ sekarang: t('2026-08-31T19:59:59.999Z') }) // sisa 12,0000003 jam
sama('sisa 1 ms LEBIH dari 12 jam → AMAN', s12plus.keadaan, 'AMAN')
const s12minus = sla({ sekarang: t('2026-08-31T20:00:00.001Z') }) // sisa 11,9999997 jam
sama('sisa 1 ms KURANG dari 12 jam → MENDEKATI', s12minus.keadaan, 'MENDEKATI')
const s0 = sla({ sekarang: t('2026-09-01T08:00:00.000Z') }) // sekarang === dueAt
sama('sekarang === dueAt, belum selesai → MENDEKATI (TERLAMBAT butuh > ketat)', s0.keadaan, 'MENDEKATI')
sama('sekarang = dueAt + 1 ms → TERLAMBAT', sla({ sekarang: t('2026-09-01T08:00:00.001Z') }).keadaan, 'TERLAMBAT')

console.log('   K104 — jam KALENDER, bukan jam kerja:')
// Jumat 2026-08-28 pukul 17.00 UTC + slaHours 8 → Sabtu 2026-08-29 pukul 01.00.
const dueAkhirPekan = t('2026-08-29T01:00:00.000Z')
const sPekan = nilaiSla({
  dueAt: dueAkhirPekan,
  completedAt: null,
  slaHours: 8,
  sekarang: t('2026-08-28T17:00:00.000Z'),
  ambangMendekatiJam: AMBANG_MENDEKATI_JAM,
})
sama('tenggat Jumat 17.00 + 8 jam jatuh Sabtu 01.00 → sisa 8 jam', sPekan.sisaJam, 8)
sama('  dan itu MENDEKATI, akhir pekan tidak melompat', sPekan.keadaan, 'MENDEKATI')

cek('slaHours tidak mengubah keadaan (K99: hanya dueAt & completedAt)', sla({ slaHours: 999, sekarang: t('2026-08-30T08:00:00.000Z') }).keadaan === 'AMAN')
cek('PERINGKAT_KEGAWATAN: DILANGGAR paling gawat, TIDAK_BER_SLA paling ringan', PERINGKAT_KEGAWATAN.DILANGGAR === 0 && PERINGKAT_KEGAWATAN.TIDAK_BER_SLA === 4)
cek('KEADAAN_PERLU_PENGINGAT berisi 3 keadaan, tanpa AMAN/TIDAK_BER_SLA', KEADAAN_PERLU_PENGINGAT.size === 3 && !KEADAAN_PERLU_PENGINGAT.has('AMAN') && !KEADAAN_PERLU_PENGINGAT.has('TIDAK_BER_SLA'))

// ============================================================================
// 10. Pemilihan template K93 — skor, tie-break, ambiguitas, invarian urutan
// ============================================================================
console.log('\n10. K93: pemilihan TaskTemplate (pola skor K25)')

sama('BOBOT_PORT = 4', BOBOT_PORT, 4)
sama('BOBOT_AGENCY_TYPE = 2', BOBOT_AGENCY_TYPE, 2)
sama('BOBOT_VESSEL_TYPE = 1', BOBOT_VESSEL_TYPE, 1)
cek('port (4) mengalahkan agencyType+vesselType (3) — spesifik pelabuhan selalu menang', BOBOT_PORT > BOBOT_AGENCY_TYPE + BOBOT_VESSEL_TYPE)

const CTX = { portId: 'port-smd', agencyType: 'FULL', vesselType: 'TANKER' }
const tpl = (p) => ({
  id: p.id,
  name: p.name ?? p.id,
  portId: p.portId ?? null,
  agencyType: p.agencyType ?? null,
  vesselType: p.vesselType ?? null,
  isDefault: p.isDefault ?? false,
  isActive: p.isActive ?? true,
  deletedAt: p.deletedAt ?? null,
  updatedAt: p.updatedAt ?? t('2026-01-01T00:00:00.000Z'),
})

console.log('   a) template khusus pelabuhan mengalahkan template umum yang LEBIH BARU')
const khususLama = tpl({ id: 'khusus-smd', portId: 'port-smd', updatedAt: t('2024-01-01T00:00:00.000Z') })
const umumBaru = tpl({ id: 'umum-baru', isDefault: true, updatedAt: t('2026-08-17T00:00:00.000Z') })
const hasilA = pilihTemplate([umumBaru, khususLama], CTX)
sama('yang menang = khusus pelabuhan', hasilA.terpilih.id, 'khusus-smd')
sama('  skornya 4', hasilA.skor, 4)
cek('  meski lawannya lebih baru DAN isDefault', umumBaru.updatedAt > khususLama.updatedAt && umumBaru.isDefault)
cek('  tanpa peringatan ambigu', !adaPeringatanTemplate(hasilA, 'TEMPLATE_AMBIGU'))
sama('  skor template umum = 0 (null cocok apa saja, bernilai 0)', skorTemplate(umumBaru, CTX), 0)
sama('  skor penuh port+agency+vessel = 7', skorTemplate(tpl({ id: 'x', ...CTX }), CTX), 7)

console.log('   b) skor SAMA → isDefault menang')
const samaSkorBiasa = tpl({ id: 'a-tanpa-default', portId: 'port-smd', isDefault: false })
const samaSkorDefault = tpl({ id: 'z-dengan-default', portId: 'port-smd', isDefault: true })
const hasilB = pilihTemplate([samaSkorBiasa, samaSkorDefault], CTX)
sama('yang menang = yang isDefault', hasilB.terpilih.id, 'z-dengan-default')
cek('  skor keduanya memang sama', skorTemplate(samaSkorBiasa, CTX) === skorTemplate(samaSkorDefault, CTX))
cek('  isDefault menang meski id-nya lebih besar secara leksikal', 'z-dengan-default' > 'a-tanpa-default')
cek('  tidak ambigu (isDefault sudah memutuskan)', !adaPeringatanTemplate(hasilB, 'TEMPLATE_AMBIGU'))

console.log('   c) MASIH seri → TEMPLATE_AMBIGU ikut dikembalikan')
const kembar1 = tpl({ id: 'kembar-1', portId: 'port-smd', updatedAt: t('2026-05-05T00:00:00.000Z') })
const kembar2 = tpl({ id: 'kembar-2', portId: 'port-smd', updatedAt: t('2026-05-05T00:00:00.000Z') })
const hasilC = pilihTemplate([kembar1, kembar2], CTX)
cek('TEMPLATE_AMBIGU diterbitkan', adaPeringatanTemplate(hasilC, 'TEMPLATE_AMBIGU'))
cek('template TETAP dipilih (memberi tahu, bukan menghalangi)', hasilC.terpilih !== null)
const wAmbigu = hasilC.peringatan.find((p) => p.kode === 'TEMPLATE_AMBIGU')
cek(
  '  peringatan menyebut kedua id yang bersaing',
  wAmbigu.data.templateDipakai === 'kembar-1' && wAmbigu.data.templatePesaing === 'kembar-2',
  JSON.stringify(wAmbigu.data),
)
cek(
  'updatedAt lebih baru memutuskan sebelum ambigu terbit',
  pilihTemplate([kembar1, tpl({ id: 'kembar-3', portId: 'port-smd', updatedAt: t('2026-06-06T00:00:00.000Z') })], CTX)
    .terpilih.id === 'kembar-3',
)

console.log('   d) saringan — nilai terisi yang BERBEDA menggugurkan')
cek('template Balikpapan gugur di konteks Samarinda', !lolosSaringanTemplate(tpl({ id: 'bpp', portId: 'port-bpp' }), CTX))
cek('template isActive=false gugur', !lolosSaringanTemplate(tpl({ id: 'mati', isActive: false }), CTX))
cek('template terhapus (deletedAt) gugur', !lolosSaringanTemplate(tpl({ id: 'hapus', deletedAt: t('2026-01-02T00:00:00.000Z') }), CTX))
cek('template null-semua LOLOS (cocok apa saja)', lolosSaringanTemplate(tpl({ id: 'umum' }), CTX))
const hasilKosong = pilihTemplate([tpl({ id: 'bpp', portId: 'port-bpp' })], CTX)
cek(
  'tak ada yang cocok → terpilih null + TEMPLATE_TIDAK_ADA, BUKAN galat (K95 pintu 1)',
  hasilKosong.terpilih === null && adaPeringatanTemplate(hasilKosong, 'TEMPLATE_TIDAK_ADA'),
)
cek('  dan skornya null, bukan 0', hasilKosong.skor === null)

console.log('   e) INVARIAN URUTAN — 120 permutasi, hasilnya wajib identik')
// Uji jenis inilah yang menemukan bug nyata di pilihTarif: rantai tie-break yang
// tak diakhiri `id` membuat hasil bergantung pada urutan baris dari Postgres.
function permutasi(arr) {
  if (arr.length <= 1) return [arr]
  const keluar = []
  for (let i = 0; i < arr.length; i++) {
    const sisa = [...arr.slice(0, i), ...arr.slice(i + 1)]
    for (const p of permutasi(sisa)) keluar.push([arr[i], ...p])
  }
  return keluar
}

const KANDIDAT_ACAK = [
  tpl({ id: 't1-umum', isDefault: true, updatedAt: t('2026-08-16T00:00:00.000Z') }),
  tpl({ id: 't2-port', portId: 'port-smd', updatedAt: t('2025-02-02T00:00:00.000Z') }),
  tpl({ id: 't3-port-kembar', portId: 'port-smd', updatedAt: t('2025-02-02T00:00:00.000Z') }),
  tpl({ id: 't4-agency', agencyType: 'FULL', updatedAt: t('2026-07-07T00:00:00.000Z') }),
  tpl({ id: 't5-bpp', portId: 'port-bpp', updatedAt: t('2026-08-01T00:00:00.000Z') }),
]

const semuaPermutasi = permutasi(KANDIDAT_ACAK)
sama('jumlah permutasi yang diuji', semuaPermutasi.length, 120)

const acuan = pilihTemplate(KANDIDAT_ACAK, CTX)
let permBeda = 0
let urutanBeda = 0
let ambiguBeda = 0
for (const p of semuaPermutasi) {
  const h = pilihTemplate(p, CTX)
  if (h.terpilih?.id !== acuan.terpilih?.id) permBeda++
  if (h.kandidatLolos.map((k) => k.id).join('|') !== acuan.kandidatLolos.map((k) => k.id).join('|')) urutanBeda++
  if (adaPeringatanTemplate(h, 'TEMPLATE_AMBIGU') !== adaPeringatanTemplate(acuan, 'TEMPLATE_AMBIGU')) ambiguBeda++
}
console.log(`   acuan: terpilih=${acuan.terpilih.id} skor=${acuan.skor} urutan=[${acuan.kandidatLolos.map((k) => k.id).join(', ')}]`)
sama('0 permutasi menghasilkan PEMENANG berbeda', permBeda, 0)
sama('0 permutasi menghasilkan URUTAN kandidat berbeda', urutanBeda, 0)
sama('0 permutasi menghasilkan peringatan ambigu berbeda', ambiguBeda, 0)
cek('kasus uji ini memang MENGANDUNG seri sempurna (t2/t3) — bukan lulus karena mudah', acuan.kandidatLolos[0].id === 't2-port' && acuan.kandidatLolos[1].id === 't3-port-kembar')
cek('  dan karena itu memang menerbitkan TEMPLATE_AMBIGU', adaPeringatanTemplate(acuan, 'TEMPLATE_AMBIGU'))
cek('kandidat pelabuhan lain (t5-bpp) tersaring keluar di semua permutasi', !acuan.kandidatLolos.some((k) => k.id === 't5-bpp'))

// ============================================================================
console.log(`\n${'='.repeat(46)}`)
console.log(gagal === 0 ? `✅ SEMUA LULUS (${lulus} pemeriksaan)` : `❌ ${gagal} GAGAL, ${lulus} lulus`)
process.exitCode = gagal === 0 ? 0 : 1
