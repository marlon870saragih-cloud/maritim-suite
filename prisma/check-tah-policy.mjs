// Uji murni TAH Core — PRD-005 Step 3A.
//
// Jalankan:  node prisma/check-tah-policy.mjs      (tanpa DB, tanpa dev server, tanpa jaringan)
//
// Lapis:
//   1. GERBANG — TAH_CORE_ENABLED gagal tertutup.
//   2. SETUJU-SENDIRI (D9 + override owner) — matriks 6 kelas × pemutus, konteks sistem.
//   3. MESIN AgentRun — seluruh pasangan transisi, penyelesaian terlambat, terlantar.
//   4. MESIN KEPUTUSAN — seluruh pasangan transisi, final, kedaluwarsa.
//   5. MESIN EKSEKUSI — seluruh pasangan, terpisah dari keputusan, invarian, label jujur.
//   6. REGISTRY — registry nyata sah & selaras kode intake; contoh rusak ditolak.
//   7. RETENSI (D3 + Q1) — 180 hari / 24 bulan kalender, PENDING tak tersentuh.
//   8. MODEL (D7 + Q4) — TAH_INTAKE_MODEL tak diset vs diset-tak-sah (gagal tertutup, tanpa fallback).
//   9. METADATA PENYEDIA — token boleh hilang, tak pernah melempar; daftar izin parameter; ukuran.
//  10. SKEMA / MIGRASI / KUNCI SUMBER — aditif, tanpa backfill, tenant-guarded, tanpa kolom
//      prompt/respons mentah/rahasia, lingkup Step 3A (intake belum di-wire, tanpa route/UI).
//  11. HUTANG — TD-005-01 & TD-005-02 tak bisa hilang diam-diam (dua arah).

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AMBANG_RUN_TERLANTAR_MENIT,
  BATAS_KLAIM_EKSEKUSI_MENIT,
  KEDALUWARSA_JAM_MAKS,
  KELAS_RISIKO,
  MAKS_PERCOBAAN_EKSEKUSI,
  RETENSI_HASIL_HARI,
  RETENSI_METADATA_BULAN,
  SETUJU_SENDIRI_BAWAAN,
  STATUS_EKSEKUSI,
  STATUS_KEPUTUSAN,
  STATUS_RUN,
  approvalFinal,
  bacaKonfigurasiTahCore,
  bacaMetaRespons,
  bacaPemakaianToken,
  batasRetensiTah,
  bolehMemutuskan,
  bolehUlangiEksekusi,
  hasilRunBolehDibersihkan,
  invarianStatus,
  jenisBolehDiLingkungan,
  jsonMuat,
  keputusanFinal,
  klaimEksekusiBasi,
  labelHasil,
  metadataApprovalBolehDihapus,
  metadataRunBolehDihapus,
  mundurBulanUtc,
  potongTeks,
  putuskanPenyelesaianRun,
  runTerlantar,
  saringParameterPanggilan,
  setujuSendiriEfektif,
  sudahKedaluwarsa,
  transisiEksekusiSah,
  transisiKeputusanSah,
  transisiRunSah,
  ukuranJson,
  usulanApprovalBolehDibersihkan,
  validasiRegistry,
} from '../src/services/tah/tah-policy.ts'
import { AGEN_TAH, JENIS_APPROVAL_TAH } from '../src/services/tah/registry.ts'
import {
  PETA_KEMAMPUAN_MODEL,
  bentukParameter,
  resolusiModelAgen,
  resolusiModelIntake,
  validasiPetaModel,
} from '../src/lib/ai/model-capabilities.ts'
import { PERAN_AUTOMATION } from '../src/services/automation/gate.ts'
import { TENANT_MODELS } from '../src/services/tenant-guard.ts'
import { PEMAKAIAN_AI_TERCATAT } from '../src/services/saas/commercial-policy.ts'

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
const bagian = (judul) => console.log(`\n${judul}`)

// Jaring pengaman: SETIAP panggilan jaringan di proses uji ini = gagal keras.
let fetchTerpanggil = 0
globalThis.fetch = async () => {
  fetchTerpanggil++
  throw new Error('JARINGAN_DILARANG_DALAM_UJI')
}

const HARI = 86_400_000
const MENIT = 60_000
const T0 = new Date('2026-09-24T05:00:00.000Z')

// =====================================================================
bagian('1. GERBANG — TAH_CORE_ENABLED (bawaan mati, gagal tertutup)')
{
  const k = (v) => bacaKonfigurasiTahCore(v === undefined ? {} : { TAH_CORE_ENABLED: v })
  cek('tak diset → mati (NONAKTIF)', !k(undefined).aktif && k(undefined).alasan === 'NONAKTIF')
  cek('"" → mati (NONAKTIF)', !k('').aktif && k('').alasan === 'NONAKTIF')
  cek('"false" → mati (NONAKTIF)', !k('false').aktif && k('false').alasan === 'NONAKTIF')
  for (const v of ['TRUE', 'True', '1', 'yes', 'on', 'true ,', 'enabled']) {
    cek(`"${v}" → mati (FLAG_TIDAK_SAH)`, !k(v).aktif && k(v).alasan === 'FLAG_TIDAK_SAH')
  }
  cek('"true" → aktif', k('true').aktif && k('true').alasan === null)
  cek('" true " (spasi) → aktif (dipangkas, pola gate.ts)', k(' true ').aktif)
}

// =====================================================================
bagian('2. SETUJU-SENDIRI — D9 dengan override owner (matriks eksplisit)')
{
  // Tabel harapan DITULIS ULANG di sini (bukan diturunkan dari SETUJU_SENDIRI_BAWAAN)
  // supaya uji benar-benar independen dari implementasi.
  const HARAPAN_OWNER = {
    READ_ONLY: true,
    INTERNAL_ANNOTATION: true,
    INTERNAL_WRITE: true,
    EXTERNALLY_VISIBLE: false,
    EXTERNAL_COMMUNICATION: false,
    FINANCIAL: false,
  }
  cek('enam kelas risiko persis sesuai D5', JSON.stringify(KELAS_RISIKO) === JSON.stringify(Object.keys(HARAPAN_OWNER)))
  for (const kelas of KELAS_RISIKO) {
    cek(`bawaan ${kelas}: setuju-sendiri ${HARAPAN_OWNER[kelas] ? 'BOLEH' : 'DILARANG'}`, SETUJU_SENDIRI_BAWAAN[kelas] === HARAPAN_OWNER[kelas])
  }

  const PERAN = ['ADMIN', 'MANAJER_OPERASI']
  const putus = (kelas, setelan, pemutus, originatorUserId, pemutusRevisiSebelumnya = null) =>
    bolehMemutuskan({ pemutus, peranWajib: PERAN, kelas, setujuSendiriJenis: setelan, originatorUserId, pemutusRevisiSebelumnya })
  const U1 = { userId: 'u1', role: 'MANAJER_OPERASI' }
  const U2 = { userId: 'u2', role: 'ADMIN' }
  const SYS = { userId: 'system', role: 'ADMIN', system: true }

  for (const kelas of KELAS_RISIKO) {
    for (const setelan of [true, false]) {
      const diri = putus(kelas, setelan, U1, 'u1')
      const harapDiri = HARAPAN_OWNER[kelas] && setelan
      cek(
        `${kelas} / setelan jenis=${setelan}: pemicu memutuskan sendiri → ${harapDiri ? 'boleh' : 'SELF_APPROVAL_FORBIDDEN'}`,
        harapDiri ? diri.boleh === true : diri.boleh === false && diri.kode === 'SELF_APPROVAL_FORBIDDEN',
      )
      cek(`${kelas} / setelan=${setelan}: orang lain → boleh`, putus(kelas, setelan, U2, 'u1').boleh === true)
      cek(`${kelas} / setelan=${setelan}: jalan terjadwal (tanpa originator) → manusia boleh`, putus(kelas, setelan, U1, null).boleh === true)
      const s = putus(kelas, setelan, SYS, null)
      cek(`${kelas} / setelan=${setelan}: konteks SISTEM → SYSTEM_CONTEXT_FORBIDDEN`, s.boleh === false && s.kode === 'SYSTEM_CONTEXT_FORBIDDEN')
    }
  }
  const sOwn = putus('INTERNAL_ANNOTATION', true, { ...SYS, userId: 'system:INTAKE' }, 'system:INTAKE')
  cek('konteks sistem tak pernah menyetujui permintaannya SENDIRI (bahkan kelas paling longgar)', sOwn.boleh === false && sOwn.kode === 'SYSTEM_CONTEXT_FORBIDDEN')
  const sysPeranLain = putus('READ_ONLY', true, { userId: 'system', role: 'VIEWER', system: true }, null)
  cek('konteks sistem ditolak SEBELUM pagar peran', sysPeranLain.kode === 'SYSTEM_CONTEXT_FORBIDDEN')
  const peran = putus('READ_ONLY', true, { userId: 'u3', role: 'OPERATOR' }, null)
  cek('peran di luar peranWajib → ROLE_NOT_ALLOWED', peran.boleh === false && peran.kode === 'ROLE_NOT_ALLOWED')
  const rev = putus('FINANCIAL', false, U2, 'u9', 'u2')
  cek('pemutus revisi sebelumnya dihitung "diri sendiri" (FINANCIAL → dilarang)', rev.boleh === false && rev.kode === 'SELF_APPROVAL_FORBIDDEN')
  cek('setujuSendiriEfektif: jenis tak bisa melonggarkan kelas (FINANCIAL + true → false)', setujuSendiriEfektif('FINANCIAL', true) === false)
  cek('setujuSendiriEfektif: jenis boleh memperketat (INTERNAL_WRITE + false → false)', setujuSendiriEfektif('INTERNAL_WRITE', false) === false)
}

// Pemeriksa transisi menyeluruh: SETIAP pasangan (dari, ke) dibandingkan dengan tabel harapan.
function cekSemuaPasangan(label, daftar, harapan, fn) {
  let salah = []
  for (const dari of daftar) {
    for (const ke of daftar) {
      const harap = (harapan[dari] ?? []).includes(ke)
      if (fn(dari, ke) !== harap) salah.push(`${dari}→${ke} (harap ${harap})`)
    }
  }
  cek(`${label}: ${daftar.length * daftar.length} pasangan transisi sesuai tabel`, salah.length === 0, salah.join(', '))
  cek(`${label}: status tak dikenal selalu ditolak`, !fn('BOGUS', daftar[0]) && !fn(daftar[0], 'BOGUS') && !fn('__proto__', 'constructor'))
}

// =====================================================================
bagian('3. MESIN AgentRun')
{
  cek('status run sesuai desain', JSON.stringify(STATUS_RUN) === JSON.stringify(['RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'ABANDONED']))
  cekSemuaPasangan(
    'AgentRun',
    STATUS_RUN,
    { RUNNING: ['SUCCEEDED', 'FAILED', 'CANCELLED', 'ABANDONED'], ABANDONED: ['SUCCEEDED', 'FAILED'] },
    transisiRunSah,
  )
  const p1 = putuskanPenyelesaianRun('RUNNING', 'SUCCEEDED')
  cek('RUNNING → SUCCEEDED: boleh, bukan terlambat', p1.boleh && !p1.terlambat)
  const p2 = putuskanPenyelesaianRun('ABANDONED', 'SUCCEEDED')
  cek('ABANDONED → SUCCEEDED: boleh, DITANDAI terlambat (lateCompletion)', p2.boleh && p2.terlambat)
  cek('ABANDONED → CANCELLED: ditolak', !putuskanPenyelesaianRun('ABANDONED', 'CANCELLED').boleh)
  cek('SUCCEEDED → FAILED: ditolak (jalan final tak dibuka kembali)', !putuskanPenyelesaianRun('SUCCEEDED', 'FAILED').boleh)
  cek('FAILED → SUCCEEDED: ditolak (ulang = jalan BARU)', !putuskanPenyelesaianRun('FAILED', 'SUCCEEDED').boleh)
  cek('ambang terlantar 15 menit', AMBANG_RUN_TERLANTAR_MENIT === 15)
  cek('RUNNING 16 menit → terlantar', runTerlantar('RUNNING', new Date(T0.getTime() - 16 * MENIT), T0))
  cek('RUNNING 14 menit → belum terlantar', !runTerlantar('RUNNING', new Date(T0.getTime() - 14 * MENIT), T0))
  cek('SUCCEEDED lama → tak pernah terlantar', !runTerlantar('SUCCEEDED', new Date(T0.getTime() - 99 * HARI), T0))
}

// =====================================================================
bagian('4. MESIN KEPUTUSAN persetujuan')
{
  cek(
    'status keputusan sesuai desain',
    JSON.stringify(STATUS_KEPUTUSAN) === JSON.stringify(['PENDING', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED', 'EXPIRED', 'CANCELLED', 'SUPERSEDED']),
  )
  cekSemuaPasangan(
    'Keputusan',
    STATUS_KEPUTUSAN,
    { PENDING: ['APPROVED', 'REJECTED', 'REVISION_REQUESTED', 'EXPIRED', 'CANCELLED', 'SUPERSEDED'] },
    transisiKeputusanSah,
  )
  cek('PENDING bukan final', !keputusanFinal('PENDING'))
  cek('semua selain PENDING final', STATUS_KEPUTUSAN.filter((s) => s !== 'PENDING').every(keputusanFinal))
  cek('status asing bukan final', !keputusanFinal('BOGUS'))
  cek('batas kedaluwarsa maksimal 720 jam (30 hari)', KEDALUWARSA_JAM_MAKS === 720)
  cek('PENDING lewat expiresAt → kedaluwarsa', sudahKedaluwarsa('PENDING', new Date(T0.getTime() - 1), T0))
  cek('PENDING tepat pada expiresAt → kedaluwarsa', sudahKedaluwarsa('PENDING', T0, T0))
  cek('PENDING sebelum expiresAt → belum', !sudahKedaluwarsa('PENDING', new Date(T0.getTime() + 1), T0))
  cek('APPROVED lewat expiresAt → TIDAK dikedaluwarsakan', !sudahKedaluwarsa('APPROVED', new Date(T0.getTime() - HARI), T0))
}

// =====================================================================
bagian('5. MESIN EKSEKUSI — terpisah dari keputusan')
{
  cek(
    'status eksekusi sesuai desain',
    JSON.stringify(STATUS_EKSEKUSI) ===
      JSON.stringify(['NOT_APPLICABLE', 'NOT_STARTED', 'RUNNING', 'SUCCEEDED', 'SUCCEEDED_WITH_WARNINGS', 'FAILED', 'CANCELLED']),
  )
  cekSemuaPasangan(
    'Eksekusi (keputusan APPROVED)',
    STATUS_EKSEKUSI,
    {
      NOT_APPLICABLE: ['NOT_STARTED'],
      NOT_STARTED: ['RUNNING', 'CANCELLED'],
      RUNNING: ['SUCCEEDED', 'SUCCEEDED_WITH_WARNINGS', 'FAILED'],
      FAILED: ['RUNNING', 'CANCELLED'],
    },
    (a, b) => transisiEksekusiSah(a, b, 'APPROVED'),
  )
  let bocor = []
  for (const k of STATUS_KEPUTUSAN.filter((s) => s !== 'APPROVED')) {
    for (const a of STATUS_EKSEKUSI) for (const b of STATUS_EKSEKUSI) if (transisiEksekusiSah(a, b, k)) bocor.push(`${k}:${a}→${b}`)
  }
  cek('eksekusi TAK PERNAH bergerak bila keputusan bukan APPROVED', bocor.length === 0, bocor.join(', '))

  let invSalah = []
  for (const k of STATUS_KEPUTUSAN) {
    for (const e of STATUS_EKSEKUSI) {
      const harap = k === 'APPROVED' ? e !== 'NOT_APPLICABLE' : e === 'NOT_APPLICABLE'
      if (invarianStatus(k, e) !== harap) invSalah.push(`${k}/${e}`)
    }
  }
  cek('invarian: eksekusi ≠ NOT_APPLICABLE HANYA bila APPROVED (seluruh 49 kombinasi)', invSalah.length === 0, invSalah.join(', '))
  cek('invarian menolak status asing', !invarianStatus('BOGUS', 'NOT_APPLICABLE') && !invarianStatus('APPROVED', 'BOGUS'))

  cek('APPROVED + FAILED → "tindakan gagal", BUKAN berhasil', labelHasil('APPROVED', 'FAILED') === 'DISETUJUI_TINDAKAN_GAGAL')
  cek('APPROVED + NOT_STARTED → menunggu eksekusi, BUKAN berhasil', labelHasil('APPROVED', 'NOT_STARTED') === 'DISETUJUI_MENUNGGU_EKSEKUSI')
  cek('APPROVED + RUNNING → sedang dieksekusi', labelHasil('APPROVED', 'RUNNING') === 'DISETUJUI_SEDANG_DIEKSEKUSI')
  cek('APPROVED + CANCELLED → eksekusi dibatalkan', labelHasil('APPROVED', 'CANCELLED') === 'DISETUJUI_EKSEKUSI_DIBATALKAN')
  cek('APPROVED + SUCCEEDED → berhasil', labelHasil('APPROVED', 'SUCCEEDED') === 'DISETUJUI_BERHASIL')
  cek('APPROVED + SUCCEEDED_WITH_WARNINGS → berhasil DENGAN peringatan', labelHasil('APPROVED', 'SUCCEEDED_WITH_WARNINGS') === 'DISETUJUI_BERHASIL_DENGAN_PERINGATAN')
  const labelBerhasil = new Set(['DISETUJUI_BERHASIL', 'DISETUJUI_BERHASIL_DENGAN_PERINGATAN'])
  let palsu = []
  for (const k of STATUS_KEPUTUSAN) for (const e of STATUS_EKSEKUSI) {
    if (labelBerhasil.has(labelHasil(k, e)) && !(k === 'APPROVED' && (e === 'SUCCEEDED' || e === 'SUCCEEDED_WITH_WARNINGS'))) palsu.push(`${k}/${e}`)
  }
  cek('label "berhasil" HANYA untuk eksekusi SUCCEEDED* (tak pernah dari APPROVED saja)', palsu.length === 0, palsu.join(', '))

  cek('maks percobaan eksekusi 5', MAKS_PERCOBAAN_EKSEKUSI === 5)
  cek('ulang FAILED percobaan 1 → boleh', bolehUlangiEksekusi('FAILED', 1).boleh)
  cek('ulang FAILED percobaan 5 → EXECUTION_ATTEMPTS_EXHAUSTED', bolehUlangiEksekusi('FAILED', 5).kode === 'EXECUTION_ATTEMPTS_EXHAUSTED')
  cek('ulang saat RUNNING → EXECUTION_IN_PROGRESS', bolehUlangiEksekusi('RUNNING', 0).kode === 'EXECUTION_IN_PROGRESS')
  cek('ulang SUCCEEDED → EXECUTION_NOT_RETRYABLE', bolehUlangiEksekusi('SUCCEEDED', 1).kode === 'EXECUTION_NOT_RETRYABLE')
  cek('batas klaim eksekusi 5 menit', BATAS_KLAIM_EKSEKUSI_MENIT === 5)
  cek('klaim RUNNING 6 menit → basi (rekonsiliasi)', klaimEksekusiBasi('RUNNING', new Date(T0.getTime() - 6 * MENIT), T0))
  cek('klaim RUNNING 4 menit → belum basi', !klaimEksekusiBasi('RUNNING', new Date(T0.getTime() - 4 * MENIT), T0))
  cek('FAILED tak pernah dianggap klaim basi', !klaimEksekusiBasi('FAILED', new Date(T0.getTime() - HARI), T0))
}

// =====================================================================
bagian('6. REGISTRY')
{
  const galatNyata = validasiRegistry(AGEN_TAH, JENIS_APPROVAL_TAH, PERAN_AUTOMATION)
  cek('registry nyata sah', galatNyata.length === 0, galatNyata.join('; '))
  cek('agen terdaftar di Step 3A hanya INTAKE', AGEN_TAH.map((a) => a.key).join() === 'INTAKE')
  cek('jenis persetujuan di Step 3A hanya TAH_DEV_NOOP', JENIS_APPROVAL_TAH.map((j) => j.kind).join() === 'TAH_DEV_NOOP')
  const intake = AGEN_TAH[0]
  const sumberEkstrak = baca('src/lib/ai/vessel-call-extract.ts')
  const versiKode = /VERSI_PENGEKSTRAK_INTAKE\s*=\s*'([^']+)'/.exec(sumberEkstrak)?.[1]
  cek('versi agen INTAKE = VERSI_PENGEKSTRAK_INTAKE di kode', intake.versi === versiKode, `${intake.versi} vs ${versiKode}`)
  cek('skema agen INTAKE = nama tool yang dipaksa di kode', new RegExp(`name:\\s*'${intake.skema.id}'`).test(sumberEkstrak))
  cek('persetujuan intake TETAP alur intake (jenisApproval kosong, D6)', intake.jenisApproval.length === 0)
  cek('agen INTAKE memakai setelan TAH_INTAKE_MODEL', intake.modelEnv === 'TAH_INTAKE_MODEL')
  const noop = JENIS_APPROVAL_TAH[0]
  cek('TAH_DEV_NOOP hanya non-produksi', noop.hanyaNonProduksi === true)
  cek('TAH_DEV_NOOP ditolak di produksi', !jenisBolehDiLingkungan(noop, 'production'))
  cek('TAH_DEV_NOOP boleh di development', jenisBolehDiLingkungan(noop, 'development'))

  const JENIS_OK = { kind: 'CONTOH', risiko: 'INTERNAL_WRITE', peranWajib: ['ADMIN'], setujuSendiri: true, kedaluwarsaJam: 24, bisaDiedit: false }
  const AGEN_OK = { key: 'CONTOH_AGEN', versi: 'x/1', jenisRun: ['EXTRACT'], jenisApproval: ['CONTOH'] }
  const tolak = (nama, agen, jenis, pola) => {
    const g = validasiRegistry(agen, jenis, PERAN_AUTOMATION)
    cek(`ditolak: ${nama}`, g.some((x) => pola.test(x)), g.join('; ') || '(tak ada galat)')
  }
  cek('contoh sah diterima', validasiRegistry([AGEN_OK], [JENIS_OK], PERAN_AUTOMATION).length === 0)
  tolak('key agen ganda', [AGEN_OK, AGEN_OK], [JENIS_OK], /key ganda/)
  tolak('kind ganda', [AGEN_OK], [JENIS_OK, JENIS_OK], /kind ganda/)
  tolak('key huruf kecil', [{ ...AGEN_OK, key: 'intake' }], [JENIS_OK], /key tidak sah/)
  tolak('kelas risiko asing', [AGEN_OK], [{ ...JENIS_OK, risiko: 'SUPER_SAFE' }], /kelas risiko/)
  for (const kelas of ['EXTERNALLY_VISIBLE', 'EXTERNAL_COMMUNICATION', 'FINANCIAL']) {
    tolak(`${kelas} + setujuSendiri:true (melonggarkan D9)`, [AGEN_OK], [{ ...JENIS_OK, risiko: kelas }], /lebih longgar/)
  }
  cek('FINANCIAL + setujuSendiri:false diterima (lebih ketat boleh)', validasiRegistry([AGEN_OK], [{ ...JENIS_OK, risiko: 'FINANCIAL', setujuSendiri: false }], PERAN_AUTOMATION).length === 0)
  tolak('peran di luar Automation Hub (FINANCE)', [AGEN_OK], [{ ...JENIS_OK, peranWajib: ['FINANCE'] }], /di luar peran/)
  tolak('peranWajib kosong', [AGEN_OK], [{ ...JENIS_OK, peranWajib: [] }], /peranWajib kosong/)
  tolak('kedaluwarsa 0 jam', [AGEN_OK], [{ ...JENIS_OK, kedaluwarsaJam: 0 }], /kedaluwarsaJam/)
  tolak('kedaluwarsa 721 jam', [AGEN_OK], [{ ...JENIS_OK, kedaluwarsaJam: 721 }], /kedaluwarsaJam/)
  tolak('kedaluwarsa pecahan', [AGEN_OK], [{ ...JENIS_OK, kedaluwarsaJam: 1.5 }], /kedaluwarsaJam/)
  tolak('agen merujuk jenis tak terdaftar', [{ ...AGEN_OK, jenisApproval: ['HANTU'] }], [JENIS_OK], /tidak terdaftar/)
  tolak('modelEnv tak sah', [{ ...AGEN_OK, modelEnv: 'tah-model' }], [JENIS_OK], /modelEnv/)
  tolak('prompt tanpa versi', [{ ...AGEN_OK, prompt: { id: 'p', versi: '' } }], [JENIS_OK], /prompt wajib/)
  tolak('jenisRun kosong', [{ ...AGEN_OK, jenisRun: [] }], [JENIS_OK], /jenisRun/)
  tolak('setujuSendiri bukan boolean', [AGEN_OK], [{ ...JENIS_OK, setujuSendiri: 'ya' }], /boolean/)
}

// =====================================================================
bagian('7. RETENSI — D3 + Q1 (hasil/usulan 180 hari, metadata 24 bulan kalender)')
{
  cek('konstanta 180 hari / 24 bulan', RETENSI_HASIL_HARI === 180 && RETENSI_METADATA_BULAN === 24)
  const iso = (d) => d.toISOString().slice(0, 10)
  cek('31 Mar 2026 − 1 bln = 28 Feb 2026 (dijepit)', iso(mundurBulanUtc(new Date('2026-03-31T10:00:00Z'), 1)) === '2026-02-28')
  cek('31 Mar 2028 − 1 bln = 29 Feb 2028 (kabisat)', iso(mundurBulanUtc(new Date('2028-03-31T10:00:00Z'), 1)) === '2028-02-29')
  cek('24 Sep 2026 − 24 bln = 24 Sep 2024', iso(mundurBulanUtc(T0, 24)) === '2024-09-24')
  cek('15 Jan 2026 − 24 bln = 15 Jan 2024 (lintas tahun)', iso(mundurBulanUtc(new Date('2026-01-15T00:00:00Z'), 24)) === '2024-01-15')
  cek('29 Feb 2028 − 24 bln = 28 Feb 2026', iso(mundurBulanUtc(new Date('2028-02-29T00:00:00Z'), 24)) === '2026-02-28')
  cek('jam/menit dipertahankan (UTC)', mundurBulanUtc(T0, 24).toISOString() === '2024-09-24T05:00:00.000Z')
  const b = batasRetensiTah(T0)
  cek('batas payload = sekarang − 180 hari', b.payloadSebelum.getTime() === T0.getTime() - 180 * HARI)

  const run = (o) => ({ status: 'SUCCEEDED', finishedAt: new Date(T0.getTime() - 181 * HARI), createdAt: new Date(T0.getTime() - 181 * HARI), resultPurgedAt: null, adaHasil: true, ...o })
  cek('hasil run selesai 181 hari lalu → dibersihkan', hasilRunBolehDibersihkan(run({}), T0))
  cek('hasil run selesai 179 hari lalu → belum', !hasilRunBolehDibersihkan(run({ finishedAt: new Date(T0.getTime() - 179 * HARI) }), T0))
  cek('run RUNNING (tanpa finishedAt) → TIDAK disentuh', !hasilRunBolehDibersihkan(run({ status: 'RUNNING', finishedAt: null }), T0))
  cek('hasil sudah dibersihkan → tak diulang', !hasilRunBolehDibersihkan(run({ resultPurgedAt: T0 }), T0))
  cek('run tanpa hasil → tak ada yang dibersihkan', !hasilRunBolehDibersihkan(run({ adaHasil: false }), T0))
  cek('metadata run 25 bulan → dihapus', metadataRunBolehDihapus({ status: 'FAILED', createdAt: new Date('2024-08-20T00:00:00Z') }, T0))
  cek('metadata run 23 bulan → dipertahankan', !metadataRunBolehDihapus({ status: 'FAILED', createdAt: new Date('2024-10-30T00:00:00Z') }, T0))
  cek('metadata run RUNNING tak pernah dihapus', !metadataRunBolehDihapus({ status: 'RUNNING', createdAt: new Date('2020-01-01T00:00:00Z') }, T0))

  const ap = (o) => ({ status: 'APPROVED', executionStatus: 'SUCCEEDED', finalizedAt: new Date(T0.getTime() - 181 * HARI), payloadPurgedAt: null, adaUsulan: true, ...o })
  cek('Q1: usulan final 181 hari → dibersihkan', usulanApprovalBolehDibersihkan(ap({}), T0))
  cek('Q1: usulan final 179 hari → belum', !usulanApprovalBolehDibersihkan(ap({ finalizedAt: new Date(T0.getTime() - 179 * HARI) }), T0))
  cek('Q1: PENDING TIDAK PERNAH dibersihkan (walau sangat tua)', !usulanApprovalBolehDibersihkan(ap({ status: 'PENDING', executionStatus: 'NOT_APPLICABLE', finalizedAt: null }), T0))
  cek('Q1: APPROVED + FAILED belum final → tak dibersihkan', !usulanApprovalBolehDibersihkan(ap({ executionStatus: 'FAILED' }), T0))
  cek('Q1: APPROVED + RUNNING belum final → tak dibersihkan', !usulanApprovalBolehDibersihkan(ap({ executionStatus: 'RUNNING' }), T0))
  cek('Q1: REJECTED 181 hari → dibersihkan', usulanApprovalBolehDibersihkan(ap({ status: 'REJECTED', executionStatus: 'NOT_APPLICABLE' }), T0))
  cek('Q1: final = keputusan final DAN eksekusi final', approvalFinal({ status: 'APPROVED', executionStatus: 'CANCELLED' }) && !approvalFinal({ status: 'APPROVED', executionStatus: 'NOT_STARTED' }))
  cek('Q1: metadata final 25 bulan → dihapus', metadataApprovalBolehDihapus(ap({ finalizedAt: new Date('2024-08-01T00:00:00Z') }), T0))
  cek('Q1: metadata PENDING tak pernah dihapus', !metadataApprovalBolehDihapus({ status: 'PENDING', executionStatus: 'NOT_APPLICABLE', finalizedAt: new Date('2020-01-01') }, T0))
  cek('Q1: metadata final 23 bulan → dipertahankan', !metadataApprovalBolehDihapus(ap({ finalizedAt: new Date('2024-10-30T00:00:00Z') }), T0))
  cek('Q1: final tanpa finalizedAt → tak pernah tersentuh (aman)', !usulanApprovalBolehDibersihkan(ap({ finalizedAt: null }), T0) && !metadataApprovalBolehDihapus(ap({ finalizedAt: null }), T0))
  cek('Q1: batas 24 bulan dihitung dari finalizedAt (pembersihan usulan tak menggeser jam)', metadataApprovalBolehDihapus(ap({ finalizedAt: new Date('2024-08-01T00:00:00Z'), payloadPurgedAt: new Date('2025-02-01T00:00:00Z') }), T0))
  cek('skema: TahApprovalRequest punya finalizedAt (dasar retensi, bukan updatedAt)', /^\s+finalizedAt\s+DateTime\?/m.test(baca('prisma/schema.prisma').match(/^model TahApprovalRequest \{[\s\S]*?^\}/m)?.[0] ?? ''))
  cek('kebijakan retensi persetujuan tak memakai updatedAt', !/updatedAt/.test(baca('src/services/tah/tah-policy.ts').slice(baca('src/services/tah/tah-policy.ts').indexOf('type BarisApprovalRetensi'), baca('src/services/tah/tah-policy.ts').indexOf('metadata respons penyedia')).replace(/\/\*\*[\s\S]*?\*\//g, '')))
}

// =====================================================================
bagian('8. MODEL — TAH_INTAKE_MODEL (D7 + Q4: tak diset = lama; diset tak sah = GAGAL TERTUTUP)')
{
  const g = validasiPetaModel()
  cek('peta kemampuan sah', g.length === 0, g.join('; '))
  const s5 = PETA_KEMAMPUAN_MODEL.find((e) => e.slug === 'anthropic/claude-sonnet-5')
  cek('anthropic/claude-sonnet-5 berstatus PENDING_SPIKE (belum boleh dipakai)', s5?.status === 'PENDING_SPIKE' && s5.kemampuan === null)

  const r = (v, lain = {}) => resolusiModelIntake(v === undefined ? { ...lain } : { TAH_INTAKE_MODEL: v, ...lain })
  const u = r(undefined, { OPENROUTER_SPK_MODEL: 'anthropic/claude-sonnet-4.5' })
  cek('TAK DISET → LEGACY, model null (pakai bawaan klien persis seperti sekarang)', u.aktif && u.mode === 'LEGACY' && u.model === null && u.kemampuan === null)
  cek('"" → dianggap tak diset (LEGACY)', r('').aktif && r('').mode === 'LEGACY')
  cek('"   " → dianggap tak diset (LEGACY)', r('   ').aktif && r('   ').mode === 'LEGACY')
  const ok = r('anthropic/claude-sonnet-4.5')
  cek('diset ke entri VERIFIED → EXPLICIT dengan kemampuannya', ok.aktif && ok.mode === 'EXPLICIT' && ok.model === 'anthropic/claude-sonnet-4.5' && ok.kemampuan?.supportsForcedToolChoice === true)

  const tolakModel = (label, nilai, detail) => {
    const x = r(nilai, { OPENROUTER_SPK_MODEL: 'anthropic/claude-sonnet-4.5' })
    cek(
      `diset ${label} → MODEL_TIDAK_TERVERIFIKASI/${detail}, TANPA fallback`,
      x.aktif === false && x.alasan === 'MODEL_TIDAK_TERVERIFIKASI' && x.detail === detail && !('model' in x),
      JSON.stringify(x),
    )
  }
  tolakModel('PENDING_SPIKE (sonnet-5)', 'anthropic/claude-sonnet-5', 'PENDING_SPIKE')
  tolakModel('model tak dikenal', 'openai/gpt-4o', 'MODEL_TIDAK_DIKENAL')
  tolakModel('slug huruf besar', 'Anthropic/Claude-Sonnet-4.5', 'SLUG_TIDAK_SAH')
  tolakModel('slug tanpa vendor', 'claude-sonnet-4.5', 'SLUG_TIDAK_SAH')
  tolakModel('slug dengan spasi/injeksi', 'anthropic/claude-sonnet-4.5; rm -rf', 'SLUG_TIDAK_SAH')
  tolakModel('slug URL', 'https://evil.example/model', 'SLUG_TIDAK_SAH')
  const petaBlok = [...PETA_KEMAMPUAN_MODEL, { slug: 'vendor/diblokir', status: 'BLOCKED', kemampuan: null, dasar: 'SPIKE', catatan: 'uji' }]
  const blok = resolusiModelAgen({ TAH_INTAKE_MODEL: 'vendor/diblokir' }, 'TAH_INTAKE_MODEL', petaBlok)
  cek('diset ke model BLOCKED → MODEL_TIDAK_TERVERIFIKASI/BLOCKED', !blok.aktif && blok.detail === 'BLOCKED')
  cek('peta dengan VERIFIED tanpa kemampuan ditolak validasi', validasiPetaModel([{ slug: 'a/b', status: 'VERIFIED', kemampuan: null, dasar: 'SPIKE', catatan: '' }]).length > 0)
  cek('peta dengan VERIFIED tanpa dasar bukti ditolak validasi', validasiPetaModel([{ slug: 'a/b', status: 'VERIFIED', kemampuan: { acceptsTemperature: true, supportsForcedToolChoice: true, supportsPdfNative: true }, dasar: 'NONE', catatan: '' }]).length > 0)

  const leg = bentukParameter(null, { temperature: 0, paksaTool: 'isi_intake_kunjungan', pdfNative: true })
  cek('LEGACY: parameter dikembalikan PERSIS (temperature 0, tool paksa, PDF native)', leg.ok && leg.temperature === 0 && leg.paksaTool === 'isi_intake_kunjungan' && leg.pdfNative === true)
  const tanpaSuhu = bentukParameter({ acceptsTemperature: false, supportsForcedToolChoice: true, supportsPdfNative: false }, { temperature: 0, paksaTool: 't', pdfNative: true })
  cek('model tanpa temperature: temperature DIBUANG, PDF native dimatikan', tanpaSuhu.ok && tanpaSuhu.temperature === undefined && tanpaSuhu.pdfNative === false)
  const tanpaTool = bentukParameter({ acceptsTemperature: true, supportsForcedToolChoice: false, supportsPdfNative: true }, { paksaTool: 't' })
  cek('model tanpa tool paksa: GALAT (tak diam-diam mengubah perilaku ekstraksi)', !tanpaTool.ok && tanpaTool.kode === 'FORCED_TOOL_TIDAK_DIDUKUNG')
}

// =====================================================================
bagian('9. METADATA PENYEDIA — token boleh hilang, tak pernah melempar')
{
  const kosong = { inputTokens: null, outputTokens: null, cachedInputTokens: null, reasoningTokens: null }
  const sama = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  cek('usage lengkap terbaca', sama(bacaPemakaianToken({ prompt_tokens: 1200, completion_tokens: 300, prompt_tokens_details: { cached_tokens: 100 }, completion_tokens_details: { reasoning_tokens: 50 } }), { inputTokens: 1200, outputTokens: 300, cachedInputTokens: 100, reasoningTokens: 50 }))
  cek('usage tanpa detail → cached/reasoning null', sama(bacaPemakaianToken({ prompt_tokens: 5, completion_tokens: 6 }), { inputTokens: 5, outputTokens: 6, cachedInputTokens: null, reasoningTokens: null }))
  let melempar = false
  const aneh = [undefined, null, 0, 'x', [], [1, 2], { prompt_tokens: '12' }, { prompt_tokens: -1 }, { prompt_tokens: 1.5 }, { prompt_tokens: NaN }, { prompt_tokens: 3e9 }, { prompt_tokens_details: 'x' }, { completion_tokens_details: null }]
  let semuaKosongAtauAman = true
  for (const a of aneh) {
    try {
      const h = bacaPemakaianToken(a)
      if (Object.values(h).some((v) => v !== null && !(Number.isSafeInteger(v) && v >= 0))) semuaKosongAtauAman = false
    } catch {
      melempar = true
    }
  }
  cek('13 bentuk usage rusak: tak pernah melempar', !melempar)
  cek('bentuk rusak → null (string/negatif/pecahan/NaN/terlalu besar ditolak)', semuaKosongAtauAman && sama(bacaPemakaianToken({ prompt_tokens: '12', completion_tokens: -1 }), kosong))

  const m = bacaMetaRespons({ id: 'gen-abc123', model: 'anthropic/claude-sonnet-4.5', usage: { prompt_tokens: 10, completion_tokens: 2 }, choices: [{ message: { content: 'RAHASIA' } }] })
  cek('meta respons: servedModel & id & token terbaca', m.servedModel === 'anthropic/claude-sonnet-4.5' && m.providerRequestId === 'gen-abc123' && m.pemakaian.inputTokens === 10)
  cek('meta respons: isi pesan TIDAK ikut', !JSON.stringify(m).includes('RAHASIA'))
  const m2 = bacaMetaRespons({ id: 'x'.repeat(300), model: 'bad model <script>' })
  cek('meta respons: model/id aneh dibuang (null)', m2.servedModel === null && m2.providerRequestId === null)
  let m3ok = true
  for (const a of [null, undefined, 'x', 42, [], { usage: 'x' }]) {
    try {
      bacaMetaRespons(a)
    } catch {
      m3ok = false
    }
  }
  cek('meta respons: masukan rusak tak pernah melempar', m3ok)

  const p = saringParameterPanggilan({ temperature: 0, toolChoice: 'isi_intake_kunjungan', pdfEngine: 'native', timeoutMs: 60000, maxTokens: 4096, apiKey: 'sk-or-RAHASIA', headers: { Authorization: 'Bearer x' }, messages: [{ content: 'dokumen' }], model: 'x' })
  cek('parameter: hanya daftar izin yang tersimpan', sama(Object.keys(p).sort(), ['maxTokens', 'pdfEngine', 'temperature', 'timeoutMs', 'toolChoice']))
  cek('parameter: kunci API / header / isi pesan TAK tersimpan', !/RAHASIA|Bearer|dokumen/.test(JSON.stringify(p)))
  cek('parameter: nilai di luar rentang dibuang', sama(saringParameterPanggilan({ temperature: 5, timeoutMs: -1, maxTokens: 1.5, toolChoice: 'DROP TABLE' }), {}))
  cek('parameter: masukan bukan objek → {}', sama(saringParameterPanggilan('x'), {}) && sama(saringParameterPanggilan(null), {}))

  cek('ukuran JSON UTF-8 (multibyte dihitung byte)', ukuranJson({ a: 'é' }) === 10)
  const siklus = {}
  siklus.a = siklus
  cek('JSON siklus → null (tak melempar)', ukuranJson(siklus) === null && !jsonMuat(siklus, 100))
  cek('jsonMuat batas', jsonMuat({ a: 1 }, 7) && !jsonMuat({ a: 1 }, 6))
  cek('potongTeks: karakter kontrol & baris baru dibuang', potongTeks('a\n\tb\u0000c', 50) === 'a b c')
  cek('potongTeks: dipotong dengan elipsis', potongTeks('x'.repeat(400), 300)?.length === 300)
  cek('potongTeks: kosong → null', potongTeks('   ', 10) === null && potongTeks(undefined, 10) === null)
}

// =====================================================================
bagian('10. SKEMA / MIGRASI / KUNCI SUMBER')
{
  const schema = baca('prisma/schema.prisma')
  const blok = (m) => schema.match(new RegExp(`^model ${m} \\{[\\s\\S]*?^\\}`, 'm'))?.[0] ?? ''
  const MODEL_TAH = ['AgentRun', 'AgentModelCall', 'TahApprovalRequest']
  // `payloadPurgedAt` (stempel waktu retensi) SAH; yang dilarang kolom ISI payload.
  const DILARANG = /raw|^payload$|payload(json|body|data|text)|secret|apikey|api_key|password|authori[sz]ation|bearer|credential|^messages?$|^response$|responsebody|^prompt$|prompttext|promptbody|systemprompt|^document|sourcetext|^content$/i
  const salahTangkap = ['promptId', 'promptVersion', 'promptHash', 'inputTokens', 'payloadPurgedAt', 'resultPurgedAt', 'errorDetail', 'proposal'].filter((f) => DILARANG.test(f))
  const lolos = ['rawResponse', 'payload', 'payloadJson', 'promptText', 'systemPrompt', 'prompt', 'apiKey', 'secretKey', 'authorization', 'messages', 'response', 'responseBody', 'sourceText', 'document'].filter((f) => !DILARANG.test(f))
  cek('pola kolom terlarang: menangkap kolom mentah/rahasia', lolos.length === 0, lolos.join(', '))
  cek('pola kolom terlarang: tak salah tangkap kolom metadata sah', salahTangkap.length === 0, salahTangkap.join(', '))
  for (const m of MODEL_TAH) {
    const b = blok(m)
    cek(`${m}: ada di schema`, b.length > 0)
    cek(`${m}: FK tenant CASCADE`, /tenant\s+Tenant\s+@relation\(fields: \[tenantId\], references: \[id\], onDelete: Cascade\)/.test(b))
    cek(`${m}: terdaftar di TENANT_MODELS`, TENANT_MODELS.has(m))
    const medan = [...b.matchAll(/^\s+(\w+)\s+[A-Z]\w*/gm)].map((x) => x[1])
    const buruk = medan.filter((f) => DILARANG.test(f))
    cek(`${m}: tanpa kolom prompt mentah / respons mentah / rahasia (D3)`, buruk.length === 0, buruk.join(', '))
  }
  cek('AgentModelCall: prompt hanya id/versi/hash', /promptId\s+String/.test(blok('AgentModelCall')) && /promptHash\s+String/.test(blok('AgentModelCall')))
  cek('AgentRun: subjek lama tanpa FK (D1)', !/subject\w*\s+\w+\??\s+@relation/.test(blok('AgentRun')))
  cek('TahApprovalRequest: status keputusan & eksekusi = dua kolom terpisah', /^\s+status\s+String/m.test(blok('TahApprovalRequest')) && /^\s+executionStatus\s+String/m.test(blok('TahApprovalRequest')))
  cek('Approval (keuangan) TIDAK disentuh — tanpa rujukan TAH', !/AgentRun|TahApproval/.test(blok('Approval')))
  for (const lama of ['MonitoringRun', 'MonitoringSignal', 'AisPollRun', 'VesselCallIntake']) {
    cek(`${lama}: tanpa kolom/rujukan TAH (D1=C)`, !/AgentRun|TahApproval|agentRun/.test(blok(lama)))
  }

  const dirMig = readdirSync(join(AKAR, 'prisma/migrations')).filter((d) => d.includes('prd005'))
  cek('tepat satu migrasi PRD-005', dirMig.length === 1, dirMig.join())
  const sql = dirMig[0] ? baca(`prisma/migrations/${dirMig[0]}/migration.sql`) : ''
  const pernyataan = sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
  const BARU = new Set(MODEL_TAH)
  const tabelDibuat = pernyataan.map((s) => /^CREATE TABLE "(\w+)"/.exec(s)?.[1]).filter(Boolean)
  cek('migrasi membuat tepat 3 tabel TAH', JSON.stringify([...tabelDibuat].sort()) === JSON.stringify([...MODEL_TAH].sort()), tabelDibuat.join())
  const asing = pernyataan.filter((s) => {
    if (/^CREATE TABLE "(\w+)"/.test(s)) return !BARU.has(/^CREATE TABLE "(\w+)"/.exec(s)[1])
    if (/^CREATE (UNIQUE )?INDEX "\w+" ON "(\w+)"/.test(s)) return !BARU.has(/ ON "(\w+)"/.exec(s)[1])
    if (/^ALTER TABLE "(\w+)" ADD CONSTRAINT "\w+" FOREIGN KEY/.test(s)) return !BARU.has(/^ALTER TABLE "(\w+)"/.exec(s)[1])
    return true
  })
  cek('migrasi MURNI ADITIF: hanya CREATE TABLE/INDEX & FK pada tabel baru', asing.length === 0, asing.map((s) => s.slice(0, 60)).join(' | '))
  cek('migrasi tanpa DROP / ALTER COLUMN / RENAME', !/\bDROP\b|ALTER COLUMN|RENAME/i.test(sql.replace(/--.*$/gm, '')))
  const tanpaBackfill = (teks) => !/\b(INSERT|UPDATE|DELETE|TRUNCATE|MERGE|COPY)\b/i.test(teks.replace(/--.*$/gm, '').replace(/ON (DELETE|UPDATE) (CASCADE|SET NULL|RESTRICT|NO ACTION)/gi, ''))
  cek('pemeriksa backfill menangkap UPDATE/INSERT sintetis', !tanpaBackfill('UPDATE "Voyage" SET x = 1;') && !tanpaBackfill('INSERT INTO "AgentRun" VALUES (1);') && tanpaBackfill('FOREIGN KEY ("a") REFERENCES "T"("id") ON DELETE CASCADE ON UPDATE CASCADE;'))
  cek('migrasi tanpa backfill (INSERT/UPDATE/DELETE/TRUNCATE)', tanpaBackfill(sql))
  cek('migrasi tanpa GRANT (portal default-deny, K147)', !/\bGRANT\b/i.test(sql.replace(/--.*$/gm, '')))
  cek('migrasi: FK tenant ketiganya CASCADE', MODEL_TAH.every((m) => new RegExp(`ALTER TABLE "${m}" ADD CONSTRAINT "${m}_tenantId_fkey" FOREIGN KEY \\("tenantId"\\) REFERENCES "Tenant"\\("id"\\) ON DELETE CASCADE`).test(sql)))
  const lain = readdirSync(join(AKAR, 'prisma/migrations')).filter((d) => !d.includes('prd005') && existsSync(join(AKAR, 'prisma/migrations', d, 'migration.sql')))
  cek('migrasi lama tak menyebut tabel TAH', lain.every((d) => !/AgentRun|AgentModelCall|TahApprovalRequest/.test(baca(`prisma/migrations/${d}/migration.sql`))))

  // Step 3B: + ringkasan-intake.ts (ringkasan Q3, murni).
  const MURNI = ['src/services/tah/tah-policy.ts', 'src/services/tah/registry.ts', 'src/services/tah/ringkasan-intake.ts', 'src/lib/ai/model-capabilities.ts']
  for (const f of MURNI) {
    const s = baca(f)
    const imporJalan = [...s.matchAll(/^import\s+(?!type\b).*$/gm)].map((x) => x[0])
    cek(`${f}: tanpa impor saat jalan (murni)`, imporJalan.length === 0, imporJalan.join(' | '))
    cek(`${f}: tanpa fetch/prisma/process.env`, !/\bfetch\s*\(|prisma\.|process\.env/.test(s))
  }
  const dirTah = join(AKAR, 'src/services/tah')
  const berkasTah = readdirSync(dirTah).filter((f) => f.endsWith('.ts'))
  // Step 3B memperluas lingkup yang disetujui: + agent-run.service.ts (buku besar), ringkasan-intake.ts (Q3).
  cek('src/services/tah berisi hanya berkas Step 3A+3B', berkasTah.sort().join() === 'agent-run.service.ts,registry.ts,ringkasan-intake.ts,tah-policy.ts', berkasTah.join())
  for (const f of berkasTah) {
    const s = baca(`src/services/tah/${f}`)
    cek(`tah/${f}: tak mengimpor approval keuangan (D2)`, !/finance\/approval|approval-policy|approval\.service/.test(s))
    cek(`tah/${f}: tak menyebut nama model (logika bisnis bebas nama model, D7)`, !/claude|sonnet|opus|haiku|gpt-|gemini|anthropic\//i.test(s))
  }

  // Lingkup Step 3A: belum ada wiring intake, service persetujuan, route, inbox, atau UI.
  // Step 3B: juga menangkap impor relatif `../tah/` dan perekam panggilan.
  const rujukTah = /AgentRun|agentRun|AgentModelCall|agentModelCall|TahApprovalRequest|tahApprovalRequest|model-capabilities|perekam-panggilan|services\/tah|\.\.\/tah\//
  const dirs = ['src/services/intake', 'src/lib/ai', 'src/app', 'src/components']
  const semua = []
  const jelajah = (rel) => {
    for (const d of readdirSync(join(AKAR, rel), { withFileTypes: true })) {
      const p = `${rel}/${d.name}`
      if (d.isDirectory()) jelajah(p)
      else if (/\.(ts|tsx)$/.test(d.name)) semua.push(p)
    }
  }
  for (const d of dirs) jelajah(d)
  // Step 3B — daftar izin PERSIS: hanya wiring buku besar intake. Route/UI/approve tetap nol.
  const DIIZINKAN_3B = new Set([
    'src/lib/ai/model-capabilities.ts',
    'src/lib/ai/perekam-panggilan.ts',
    'src/lib/ai/openrouter.ts',
    'src/lib/ai/vessel-call-extract.ts',
    'src/services/intake/fake-extractor.ts',
    'src/services/intake/intake-access.ts',
    'src/services/intake/intake-ledger.ts',
    // submitIntake SAJA (titik integrasi F); fungsi persetujuan dikunci sidik jari di check-tah-ledger.mjs.
    'src/services/intake/intake.service.ts',
  ])
  const bocor = semua.filter((f) => !DIIZINKAN_3B.has(f) && rujukTah.test(baca(f)))
  cek('Step 3B: di luar daftar izin, intake / lib ai / route / UI TIDAK merujuk TAH Core', bocor.length === 0, bocor.join(', '))
  cek('Step 3B: setiap berkas daftar izin memang ada', [...DIIZINKAN_3B].every((f) => existsSync(join(AKAR, f))))
  cek('Step 3B: TahApprovalRequest belum dipakai kode aplikasi mana pun', semua.every((f) => !/tahApprovalRequest|TahApprovalRequest/.test(baca(f))))
  cek('Step 3A/3B: belum ada route /api/tah', !existsSync(join(AKAR, 'src/app/api/tah')))
  cek('Step 3A/3B: belum ada halaman /automation/inbox', !existsSync(join(AKAR, 'src/app/(app)/automation/inbox')))
  cek('Step 3A/3B: belum ada unit systemd retensi TAH', !readdirSync(join(AKAR, 'deploy/systemd')).some((f) => /tah/i.test(f)))
}

// =====================================================================
bagian('11. HUTANG — TD-005-01 & TD-005-02 tak bisa hilang diam-diam')

/** Baca entri register: { id → { status, lengkap } }. */
function bacaRegister(teks) {
  const hasil = {}
  for (const m of teks.matchAll(/^## (TD-\d{3}-\d{2})\b[^\n]*\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)) {
    const isi = m[2]
    const status = /^- Status: (OPEN|RESOLVED)\s*$/m.exec(isi)?.[1] ?? null
    const lengkap = /^- Keputusan owner: \S/m.test(isi) && /^- Penjaga: \S/m.test(isi) && /\*\*Kriteria selesai:\*\*/.test(isi)
    hasil[m[1]] = { status, lengkap }
  }
  return hasil
}

/** Aturan dua arah: celah ada ⇒ OPEN; celah tertutup ⇒ wajib RESOLVED eksplisit. */
function evaluasiHutang(id, celahAda, register) {
  const e = register[id]
  if (!e) return { lulus: false, pesan: `${id} HILANG dari register — hutang tak boleh dihapus diam-diam` }
  if (!e.lengkap) return { lulus: false, pesan: `${id} tanpa keputusan owner / penjaga / kriteria selesai` }
  if (e.status === null) return { lulus: false, pesan: `${id} tanpa baris "- Status: OPEN|RESOLVED"` }
  if (celahAda && e.status !== 'OPEN') return { lulus: false, pesan: `${id} ditandai ${e.status} padahal celahnya MASIH ada di kode` }
  if (!celahAda && e.status === 'OPEN') return { lulus: false, pesan: `${id}: celah sudah tertutup di kode — tandai RESOLVED secara eksplisit` }
  return { lulus: true, pesan: `${id} ${e.status} (celah ${celahAda ? 'masih ada' : 'tertutup'})` }
}

/** TD-005-01 — celah ada bila nama pemakaian intake tak terhitung kuota AI ATAU pencatat AI belum aktif. */
function celahTd00501(sumberKuota, sumberIntake, pemakaianAiTercatat) {
  const awalan = /nama:\s*\{\s*startsWith:\s*'([^']+)'/.exec(sumberKuota)?.[1] ?? null
  const namaIntake = /catatPemakaian\(\s*ctx\s*,\s*'([A-Z_]+)'/.exec(sumberIntake)?.[1] ?? null
  const intakeTerhitung = awalan !== null && namaIntake !== null && namaIntake.startsWith(awalan)
  return { celah: !intakeTerhitung || pemakaianAiTercatat !== true, awalan, namaIntake }
}

/** TD-005-02 — celah ada bila approveIntake tak punya pagar setuju-sendiri & belum pindah ke gerbang native. */
function celahTd00502(sumberIntake) {
  const m = /export async function approveIntake\(([\s\S]*?)\nexport async function /.exec(sumberIntake)
  if (!m) return { celah: true, ditemukan: false }
  const badan = m[1]
  const adaPagar =
    /submittedByUserId[\s\S]{0,120}ctx\.userId|ctx\.userId[\s\S]{0,120}submittedByUserId|SELF_APPROVAL_FORBIDDEN/.test(badan) ||
    /tahApprovalRequest|bolehMemutuskan/.test(badan)
  return { celah: !adaPagar, ditemukan: true }
}

{
  // --- 11a. penjaga itu sendiri diuji dengan masukan sintetis ---
  const reg = (status, lengkap = true) => ({ 'TD-X': { status, lengkap } })
  cek('penjaga: celah ada + OPEN → lulus', evaluasiHutang('TD-X', true, reg('OPEN')).lulus)
  cek('penjaga: celah ada + RESOLVED → GAGAL', !evaluasiHutang('TD-X', true, reg('RESOLVED')).lulus)
  cek('penjaga: celah tertutup + OPEN → GAGAL (wajib ditutup eksplisit)', !evaluasiHutang('TD-X', false, reg('OPEN')).lulus)
  cek('penjaga: celah tertutup + RESOLVED → lulus', evaluasiHutang('TD-X', false, reg('RESOLVED')).lulus)
  cek('penjaga: entri hilang → GAGAL', !evaluasiHutang('TD-X', true, {}).lulus)
  cek('penjaga: entri tanpa status → GAGAL', !evaluasiHutang('TD-X', true, reg(null)).lulus)
  cek('penjaga: entri tanpa keputusan/penjaga/kriteria → GAGAL', !evaluasiHutang('TD-X', true, reg('OPEN', false)).lulus)

  const kuotaSintetis = "where: { nama: { startsWith: 'AI_' }, createdAt: {} }"
  cek('detektor TD-005-01: INTAKE_EXTRACTED + flag false → celah', celahTd00501(kuotaSintetis, "catatPemakaian(ctx, 'INTAKE_EXTRACTED', {})", false).celah)
  cek('detektor TD-005-01: nama AI_ + flag false → masih celah', celahTd00501(kuotaSintetis, "catatPemakaian(ctx, 'AI_INTAKE_EXTRACTED', {})", false).celah)
  cek('detektor TD-005-01: nama AI_ + flag true → tertutup', !celahTd00501(kuotaSintetis, "catatPemakaian(ctx, 'AI_INTAKE_EXTRACTED', {})", true).celah)
  cek('detektor TD-005-01: sumber tak terbaca → dianggap celah (aman)', celahTd00501('', '', true).celah)
  const approveTanpa = 'export async function approveIntake(ctx) {\n  requireIntake(ctx)\n}\nexport async function x() {}'
  const approveDengan = 'export async function approveIntake(ctx) {\n  if (row.submittedByUserId === ctx.userId) throw forbidden()\n}\nexport async function x() {}'
  cek('detektor TD-005-02: tanpa pagar → celah', celahTd00502(approveTanpa).celah)
  cek('detektor TD-005-02: dengan pagar setuju-sendiri → tertutup', !celahTd00502(approveDengan).celah)
  cek('detektor TD-005-02: fungsi tak ditemukan → dianggap celah (aman)', celahTd00502('').celah)

  // --- 11b. terapkan pada kode & register NYATA ---
  const JALUR_REGISTER = 'docs/TAH-TECH-DEBT.md'
  cek(`register hutang ada (${JALUR_REGISTER})`, existsSync(join(AKAR, JALUR_REGISTER)))
  const teksRegister = existsSync(join(AKAR, JALUR_REGISTER)) ? baca(JALUR_REGISTER) : ''
  const register = bacaRegister(teksRegister)
  const sumberIntake = baca('src/services/intake/intake.service.ts')

  const t1 = celahTd00501(baca('src/services/saas/quota.service.ts'), sumberIntake, PEMAKAIAN_AI_TERCATAT)
  console.log(`     fakta TD-005-01: awalan kuota=${t1.awalan}, nama intake=${t1.namaIntake}, PEMAKAIAN_AI_TERCATAT=${PEMAKAIAN_AI_TERCATAT}`)
  const e1 = evaluasiHutang('TD-005-01', t1.celah, register)
  cek('TD-005-01 (kuota AI) — register konsisten dengan kode', e1.lulus, e1.pesan)

  const t2 = celahTd00502(sumberIntake)
  console.log(`     fakta TD-005-02: approveIntake ditemukan=${t2.ditemukan}, pagar setuju-sendiri=${!t2.celah}`)
  const e2 = evaluasiHutang('TD-005-02', t2.celah, register)
  cek('TD-005-02 (setuju-sendiri intake terlihat portal) — register konsisten dengan kode', e2.lulus, e2.pesan)

  // --- 11c. bukti penjaga bekerja pada teks register NYATA yang dimutasi ---
  const tanpaTd1 = teksRegister.replace(/^## TD-005-01[\s\S]*?(?=^## )/m, '')
  cek('mutasi: TD-005-01 dihapus dari register → penjaga GAGAL', !evaluasiHutang('TD-005-01', t1.celah, bacaRegister(tanpaTd1)).lulus)
  const td2Selesai = teksRegister.replace(/(## TD-005-02[\s\S]*?- Status: )OPEN/, '$1RESOLVED')
  cek('mutasi: TD-005-02 ditandai RESOLVED tanpa perbaikan kode → penjaga GAGAL', !evaluasiHutang('TD-005-02', t2.celah, bacaRegister(td2Selesai)).lulus)
  const td1Selesai = teksRegister.replace(/(## TD-005-01[\s\S]*?- Status: )OPEN/, '$1RESOLVED')
  cek('mutasi: TD-005-01 ditandai RESOLVED tanpa perbaikan kode → penjaga GAGAL', !evaluasiHutang('TD-005-01', t1.celah, bacaRegister(td1Selesai)).lulus)
}

// =====================================================================
cek('tak ada panggilan jaringan selama uji', fetchTerpanggil === 0, `fetch terpanggil ${fetchTerpanggil}×`)

console.log(`\n${gagal === 0 ? '✅ SEMUA LULUS' : '❌ ADA YANG GAGAL'} — lulus ${lulus}, gagal ${gagal}`)
process.exit(gagal === 0 ? 0 : 1)
