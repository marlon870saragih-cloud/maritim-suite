// Penerima uji WA-1 — TEST_FIXTURE, konstanta kode murni (Step 2A, keputusan Q3).
// TANPA impor, tanpa DB, tanpa jaringan, tanpa process.env.
//
// • Penerima WA-1 HANYA fixture ini (§10.2). Principal.phone / Customer.phone
//   TIDAK pernah dipakai dan tidak dibaca di sini.
// • Nomor diambil dari rentang Ofcom (Inggris) yang dicadangkan untuk drama/fiksi:
//   07700 900000–07700 900999 (= +44 7700 900000–900999) — tak dialokasikan ke
//   pelanggan mana pun. Tetap: WA-1 tidak punya egress sama sekali; nomor hanya
//   label snapshot. Nomor di luar rentang ini ditolak (CONTACT_INELIGIBLE).
// • Bukti izin fixture = bukti UJI, BUKAN consent klien (§10.2) dan tak boleh
//   dipakai sebagai bukti kelayakan mode live.

import type { Hasil } from './comm-policy'

export const PENANDA_FIXTURE = 'TEST_FIXTURE' as const

/** Rentang nomor fiksi Ofcom dalam bentuk kanonik internasional. */
export const POLA_NOMOR_FIXTURE = /^\+447700900\d{3}$/

export const SKENARIO_FAKE = ['SUCCESS', 'FAIL_BEFORE_ACCEPT', 'FAIL_ONCE_THEN_SUCCESS'] as const
export type SkenarioFake = (typeof SKENARIO_FAKE)[number]

export type FixturePenerima = {
  id: string
  penanda: typeof PENANDA_FIXTURE
  nama: string
  /** Kanonik internasional (+ kode negara), fiksi. */
  nomor: string
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
    nomor: '+447700900001',
    aktif: true,
    buktiIzin: IZIN,
    skenario: 'SUCCESS',
    pengirimanEksternal: false,
  },
  {
    id: 'WA1_TEST_FIXTURE_FAIL',
    penanda: PENANDA_FIXTURE,
    nama: 'TEST_FIXTURE — Penerima Uji WA-1 (FAIL_BEFORE_ACCEPT)',
    nomor: '+447700900002',
    aktif: true,
    buktiIzin: IZIN,
    skenario: 'FAIL_BEFORE_ACCEPT',
    pengirimanEksternal: false,
  },
  {
    id: 'WA1_TEST_FIXTURE_RETRY',
    penanda: PENANDA_FIXTURE,
    nama: 'TEST_FIXTURE — Penerima Uji WA-1 (FAIL_ONCE_THEN_SUCCESS)',
    nomor: '+447700900003',
    aktif: true,
    buktiIzin: IZIN,
    skenario: 'FAIL_ONCE_THEN_SUCCESS',
    pengirimanEksternal: false,
  },
].map((f) => Object.freeze({ ...f, buktiIzin: Object.freeze({ ...f.buktiIzin }) })) as FixturePenerima[])

/**
 * SG-05 — penerima harus fixture terdaftar, bertanda TEST_FIXTURE, aktif, nomor
 * dalam rentang fiksi, dan bukti izinnya bertipe TEST_FIXTURE. Tak ada input
 * nomor bebas (FR-09): pemanggil hanya menyebut id fixture.
 */
export function pilihPenerimaFixture(id: unknown): Hasil<FixturePenerima> {
  const f = FIXTURE_PENERIMA.find((x) => x.id === id)
  if (!f || f.penanda !== PENANDA_FIXTURE || !f.aktif || !POLA_NOMOR_FIXTURE.test(f.nomor) || f.pengirimanEksternal !== false) {
    return { ok: false, alasan: 'CONTACT_INELIGIBLE' }
  }
  if (f.buktiIzin.jenis !== PENANDA_FIXTURE) return { ok: false, alasan: 'CONSENT_NOT_GRANTED' }
  return { ok: true, nilai: f }
}
