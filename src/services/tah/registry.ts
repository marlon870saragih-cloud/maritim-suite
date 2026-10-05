// Registry TAH Core — DATA SAJA (PRD-005 Step 3A). Hanya `import type`.
//
// Konstanta kode, bukan konfigurasi DB: menambah agen/jenis persetujuan = satu
// entri di sini + ulasan kode. Aturan keabsahannya ada di tah-policy.ts
// (validasiRegistry) dan dikunci prisma/check-tah-policy.mjs.
//
// Step 3A hanya mendaftarkan:
//   • agen INTAKE — identitas & versi untuk AgentRun/AgentModelCall ekstraksi
//     Vessel Call Intake. Wiring ke intake baru di Step 3B.
//   • jenis TAH_DEV_NOOP — HANYA non-produksi, eksekutornya (Step 3C) tak berbuat
//     apa pun; ada supaya gerbang persetujuan bisa diuji ujung-ke-ujung tanpa
//     pengguna produksi (D6). Pengguna produksi native pertama = agen EPDA kelak.
//   • JENIS_APPROVAL_WA_FAKE (WA-1 Step 2D, keputusan owner R1) — lihat di bawah; SENGAJA
//     di luar JENIS_APPROVAL_TAH supaya kontrak TAH lama (tah-policy.ts, berkas BEKU
//     kandidat Validator V3) tak berubah sedikit pun.
// Kait fungsi jenis (validasiUsulan, sidikBasis, eksekusi, rekonsiliasi)
// ditambahkan Step 3C di service — sengaja tak ada di berkas data ini.

import type { DefinisiAgenData, DefinisiApprovalData } from './tah-policy'

export const AGEN_TAH: readonly DefinisiAgenData[] = [
  {
    key: 'INTAKE',
    // = VERSI_PENGEKSTRAK_INTAKE di lib/ai/vessel-call-extract.ts (dikunci uji).
    versi: 'vessel-call-extract/1',
    jenisRun: ['EXTRACT'],
    prompt: { id: 'vessel-call-extract', versi: '1' },
    // = nama tool yang dipaksa di vessel-call-extract.ts (dikunci uji).
    skema: { id: 'isi_intake_kunjungan', versi: '1' },
    modelEnv: 'TAH_INTAKE_MODEL',
    // Persetujuan intake TETAP alur intake sendiri (D6 — tidak ditulis ulang).
    jenisApproval: [],
  },
]

export const JENIS_APPROVAL_TAH: readonly DefinisiApprovalData[] = [
  {
    kind: 'TAH_DEV_NOOP',
    risiko: 'INTERNAL_ANNOTATION',
    peranWajib: ['ADMIN', 'MANAJER_OPERASI'],
    setujuSendiri: true,
    kedaluwarsaJam: 72,
    bisaDiedit: true,
    hanyaNonProduksi: true,
  },
]

/**
 * WA-1 Step 2D (keputusan owner R1, D-2D-01/05) — definisi approval WA-1 SIMULASI.
 *
 * SENGAJA terpisah dari JENIS_APPROVAL_TAH: `tah-policy.ts` (DefinisiApprovalData,
 * validasiRegistry) termasuk sidik BEKU kandidat Validator V3 FINAL (PRD-005) dan tak boleh
 * diubah, sedangkan kontrak itu mewajibkan `kedaluwarsaJam` 1..720. Q8 (tanpa TTL produk →
 * TahApprovalRequest.expiresAt NULL) karena itu TIDAK dibuka sebagai jalur umum: tipe di bawah
 * TERTUTUP & literal — setiap medan hanya punya satu nilai sah, jadi kombinasi lain (kelas
 * eksternal, boleh di produksi, bisa disunting, ber-TTL) tak lolos compiler. Service approval
 * memeriksa ulang setiap invarian saat jalan (gagal tertutup) sebelum membuat approval.
 * Komunikasi klien nyata (CLIENT_WA_UPDATE, EXTERNAL_COMMUNICATION, tanpa setuju-sendiri) BELUM ada.
 */
export type DefinisiApprovalWaFake = {
  readonly kind: 'WA_INTERNAL_FAKE_TEST'
  readonly risiko: 'INTERNAL_WRITE'
  readonly peranWajib: readonly ['ADMIN', 'MANAJER_OPERASI']
  readonly setujuSendiri: true
  /** Tanpa TTL produk (Q8) — HANYA definisi ini yang boleh menghasilkan expiresAt NULL. */
  readonly kedaluwarsaJam: null
  readonly bisaDiedit: false
  readonly hanyaNonProduksi: true
}

export const JENIS_APPROVAL_WA_FAKE: DefinisiApprovalWaFake = Object.freeze({
  kind: 'WA_INTERNAL_FAKE_TEST',
  risiko: 'INTERNAL_WRITE',
  peranWajib: Object.freeze(['ADMIN', 'MANAJER_OPERASI'] as const),
  setujuSendiri: true,
  kedaluwarsaJam: null,
  bisaDiedit: false,
  hanyaNonProduksi: true,
} as const)
