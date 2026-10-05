// Penerima uji WA-1 — TEST_FIXTURE, konstanta kode murni (Step 2A, keputusan Q3).
// TANPA impor, tanpa DB, tanpa jaringan, tanpa process.env.
//
// • Penerima WA-1 HANYA fixture ini (§10.2). Principal.phone / Customer.phone
//   TIDAK pernah dipakai dan tidak dibaca di sini.
// • OD-2A-05: penerima diidentifikasi PENGENAL UJI eksplisit (`TEST_FIXTURE_WA_001`),
//   BUKAN nomor telepon — tanpa semantik E.164/produksi dan tak bisa dirutekan.
//   WA-1 tidak punya egress; pengenal hanya label snapshot. Pengenal di luar pola
//   ini ditolak (CONTACT_INELIGIBLE). Kontak WhatsApp/E.164/consent nyata = WA-2.
// • Bukti izin fixture = bukti UJI, BUKAN consent klien (§10.2) dan tak boleh
//   dipakai sebagai bukti kelayakan mode live.

import type { Hasil } from './comm-policy'

export const PENANDA_FIXTURE = 'TEST_FIXTURE' as const

/** Pengenal uji non-routable; sengaja tak berbentuk nomor telepon. */
export const POLA_PENGENAL_FIXTURE = /^TEST_FIXTURE_WA_\d{3}$/

export const SKENARIO_FAKE = ['SUCCESS', 'FAIL_BEFORE_ACCEPT', 'FAIL_ONCE_THEN_SUCCESS'] as const
export type SkenarioFake = (typeof SKENARIO_FAKE)[number]

export type FixturePenerima = {
  id: string
  penanda: typeof PENANDA_FIXTURE
  nama: string
  /** Pengenal uji (OD-2A-05) — bukan nomor telepon, bukan E.164. */
  pengenal: string
  aktif: boolean
  buktiIzin: { jenis: typeof PENANDA_FIXTURE; keterangan: string }
  skenario: SkenarioFake
  /** Selalu false — FAKE tak pernah mengirim ke luar. */
  pengirimanEksternal: false
}

const IZIN = { jenis: PENANDA_FIXTURE, keterangan: 'Bukti izin uji sintetis WA-1 — BUKAN consent klien.' } as const

export const FIXTURE_PENERIMA: readonly FixturePenerima[] = Object.freeze([
  {
    id: 'WA1_TEST_FIXTURE_SUCCESS',
    penanda: PENANDA_FIXTURE,
    nama: 'TEST_FIXTURE — Penerima Uji WA-1 (SUCCESS)',
    pengenal: 'TEST_FIXTURE_WA_001',
    aktif: true,
    buktiIzin: IZIN,
    skenario: 'SUCCESS',
    pengirimanEksternal: false,
  },
  {
    id: 'WA1_TEST_FIXTURE_FAIL',
    penanda: PENANDA_FIXTURE,
    nama: 'TEST_FIXTURE — Penerima Uji WA-1 (FAIL_BEFORE_ACCEPT)',
    pengenal: 'TEST_FIXTURE_WA_002',
    aktif: true,
    buktiIzin: IZIN,
    skenario: 'FAIL_BEFORE_ACCEPT',
    pengirimanEksternal: false,
  },
  {
    id: 'WA1_TEST_FIXTURE_RETRY',
    penanda: PENANDA_FIXTURE,
    nama: 'TEST_FIXTURE — Penerima Uji WA-1 (FAIL_ONCE_THEN_SUCCESS)',
    pengenal: 'TEST_FIXTURE_WA_003',
    aktif: true,
    buktiIzin: IZIN,
    skenario: 'FAIL_ONCE_THEN_SUCCESS',
    pengirimanEksternal: false,
  },
].map((f) => Object.freeze({ ...f, buktiIzin: Object.freeze({ ...f.buktiIzin }) })) as FixturePenerima[])

/**
 * SG-05 — penerima harus fixture terdaftar, bertanda TEST_FIXTURE, aktif,
 * pengenalnya cocok pola uji, dan bukti izinnya bertipe TEST_FIXTURE. Tak ada
 * input nomor bebas (FR-09): pemanggil hanya menyebut id fixture.
 */
export function pilihPenerimaFixture(id: unknown): Hasil<FixturePenerima> {
  const f = FIXTURE_PENERIMA.find((x) => x.id === id)
  if (!f || f.penanda !== PENANDA_FIXTURE || !f.aktif || !POLA_PENGENAL_FIXTURE.test(f.pengenal) || f.pengirimanEksternal !== false) {
    return { ok: false, alasan: 'CONTACT_INELIGIBLE' }
  }
  if (f.buktiIzin.jenis !== PENANDA_FIXTURE) return { ok: false, alasan: 'CONSENT_NOT_GRANTED' }
  return { ok: true, nilai: f }
}
