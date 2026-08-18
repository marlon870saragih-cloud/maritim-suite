// Kode peristiwa operasional (K130, Fase 7g) — MURNI (K11/K51): tak ada impor
// nilai, tak ada Date/DB. Daftar TETAP + 'OTHER', bukan enum Prisma — alasan
// sama dengan K55 (dataOrigin): daftar peristiwa pelabuhan akan bertambah dari
// pengalaman, dan tiap penambahan tak boleh butuh migration.
//
// `import type` untuk VoyageStatusStr aman di sini: voyage-status.ts sendiri
// murni (tak menyentuh DB), jadi tak melanggar kontrak berkas ini.

import type { VoyageStatusStr } from '@/components/voyage/voyage-status'

export const KODE_PERISTIWA = [
  'EOSP',
  'NOR_TENDERED',
  'PILOT_ON_BOARD',
  'ALL_FAST',
  'COMMENCED',
  'COMPLETED',
  'SAILED',
  'OTHER',
] as const
export type KodePeristiwa = (typeof KODE_PERISTIWA)[number]

export const LABEL_PERISTIWA: Readonly<Record<'id' | 'en', Record<KodePeristiwa, string>>> = {
  id: {
    EOSP: 'EOSP (Tiba di Perairan Pelabuhan)',
    NOR_TENDERED: 'NOR Diserahkan',
    PILOT_ON_BOARD: 'Pandu Naik Kapal',
    ALL_FAST: 'All Fast (Sandar Penuh)',
    COMMENCED: 'Mulai Bongkar/Muat',
    COMPLETED: 'Selesai Bongkar/Muat',
    SAILED: 'Kapal Berlayar/Berangkat',
    OTHER: 'Lainnya',
  },
  en: {
    EOSP: 'EOSP (End of Sea Passage)',
    NOR_TENDERED: 'NOR Tendered',
    PILOT_ON_BOARD: 'Pilot on Board',
    ALL_FAST: 'All Fast',
    COMMENCED: 'Commenced Loading/Discharging',
    COMPLETED: 'Completed Loading/Discharging',
    SAILED: 'Vessel Sailed',
    OTHER: 'Other',
  },
}

/**
 * K130 — peristiwa BOLEH menawarkan perubahan status voyage, TAPI TIDAK
 * PERNAH memindahkannya sendiri (itu pernyataan resmi operator, K96/K122).
 * Pemetaan mengikuti VOYAGE_LIFECYCLE persis: EOSP→tiba, ALL_FAST→sandar,
 * COMMENCED/COMPLETED→kerja kargo mulai/selesai, SAILED→berangkat.
 * NOR_TENDERED/PILOT_ON_BOARD/OTHER sengaja tanpa usulan — murni kronologi.
 */
export const USUL_STATUS: Readonly<Partial<Record<KodePeristiwa, VoyageStatusStr>>> = {
  EOSP: 'ARRIVED',
  ALL_FAST: 'BERTHED',
  COMMENCED: 'WORKING',
  COMPLETED: 'COMPLETED',
  SAILED: 'DEPARTED',
}

/**
 * K130 — peristiwa BOLEH mengisi ata/atb/atd, TAPI TIDAK PERNAH otomatis:
 * angka ini dipakai hitungEtmal() (K17) yang menentukan uang, jadi harus
 * tetap tawaran sekali klik, bukan efek samping mencatat peristiwa.
 */
export const USUL_JANGKAR: Readonly<Partial<Record<KodePeristiwa, 'ata' | 'atb' | 'atd'>>> = {
  EOSP: 'ata',
  ALL_FAST: 'atb',
  SAILED: 'atd',
}
