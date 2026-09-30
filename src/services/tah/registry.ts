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
