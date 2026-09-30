// PRD-005 Eval-4 — LEKSIKON MARITIM TERKENDALI (data murni, deterministik, berversi).
//
// Dipakai BERSAMA sebagai DATA oleh validator intake (services/intake/intake-policy.ts), penilai
// scorer-3 (prisma/spike-eval4-scorer.mjs) dan pemeriksa konsistensi GT (prisma/spike-gt-konsistensi.mjs).
// Masing-masing memakai logika pencocokannya SENDIRI — penilai tidak memakai validator sebagai orakel.
//
// BUKAN kamus sinonim: tak ada kemiripan/fuzzy, tak ada AI, tak bisa dikonfigurasi dari luar.
// Setiap alias wajib punya provenans: kasus korpus repo (E1:/E2:/E3:…) atau keputusan owner (OWNER:D…).
// Istilah di luar daftar TIDAK dikenali (gagal-tertutup: nilai dikosongkan / wajib konfirmasi).
// Belum disetujui (audit alias maritim): DISCHG, LDG, LOADG, L/D, TON/TONS→MT, M/T, ATA/ATB/ATD.
//
// Semua token ditulis dalam bentuk `tokenLeksikon` (huruf besar A-Z0-9, dipisah spasi; "m³" → "M3").
// Berkas ini ikut dibundel ke peramban: tanpa regex lookbehind / grup bernama.
// Mengubah isi berkas ini = identitas baru untuk Eval-4 (sha256 berkas diikat saat pembekuan).

export const VERSI_LEKSIKON = 'maritim-lexicon/1'

export type KonteksLeksikon =
  /** Hanya pada baris muatan: baris yang memuat nama komoditas, jumlah muatan berbukti, atau label muatan. */
  | 'BARIS_MUATAN'
  /** Hanya TEPAT sesudah angka jumlah (satuan). */
  | 'SESUDAH_ANGKA'

export type EntriLeksikon = {
  readonly kanonik: string
  readonly alias: readonly string[]
  readonly konteks: KonteksLeksikon
  readonly perluKonfirmasi: boolean
  readonly provenans: readonly string[]
}

/** Token kata utuh untuk pencocokan leksikon: huruf besar A-Z0-9 ("m³" → "M3"). */
export function tokenLeksikon(s: string): string[] {
  return s.toUpperCase().replace(/³/g, '3').split(/[^A-Z0-9]+/).filter(Boolean)
}

// ------------------------------------------------------------------ operasi muatan
export const OPERASI_LEKSIKON: Readonly<Record<'LOAD' | 'DISCHARGE', EntriLeksikon>> = Object.freeze({
  LOAD: Object.freeze({
    kanonik: 'LOAD',
    alias: Object.freeze(['LOAD', 'LOADING', 'MUAT', 'MEMUAT']),
    konteks: 'BARIS_MUATAN',
    perluKonfirmasi: false,
    provenans: Object.freeze(['E1:E01', 'E1:E13', 'E2:T01', 'E3:H20', 'E2:T09', 'E2:T11', 'OWNER:D-Eval4-remediasi']),
  }),
  DISCHARGE: Object.freeze({
    kanonik: 'DISCHARGE',
    // DISCH — OWNER D1: alias DISCHARGE HANYA di konteks operasi muatan (bukti korpus: E1:E10).
    alias: Object.freeze(['DISCHARGE', 'DISCHARGING', 'UNLOAD', 'BONGKAR', 'DISCH']),
    konteks: 'BARIS_MUATAN',
    perluKonfirmasi: false,
    provenans: Object.freeze(['E1:E04', 'E1:E08', 'E2:T03', 'E2:T06', 'E2:T12', 'E1:E10', 'OWNER:D1']),
  }),
})

/**
 * Frasa yang BUKAN operasi muatan kunjungan ini (label pelabuhan, garis muat, peristiwa selesai).
 * Tokennya DIHAPUS dari baris sebelum bukti operasi dicari. Daftar pengecualian bersifat
 * konservatif: menambahnya hanya mengurangi bukti (nilai dikosongkan → ditinjau), tak pernah menambah.
 */
export const FRASA_BUKAN_OPERASI: readonly string[] = Object.freeze([
  'LOAD LINE', 'LOADLINE', 'LOAD PORT', 'LOADING PORT', 'PORT OF LOADING',
  'DISCHARGE PORT', 'DISCHARGING PORT', 'PORT OF DISCHARGE',
  'COMPLETION OF DISCHARGE', 'DISCHARGING COMPLETED', 'DISCHARGE COMPLETED',
  'COMPLETION OF LOADING', 'LOADING COMPLETED',
  'PELABUHAN MUAT', 'PELABUHAN BONGKAR',
])

/** Label field muatan di awal baris ("Cargo :", "Muatan:", "Operation :", "Kegiatan :"). */
export const LABEL_BARIS_MUATAN: readonly string[] = Object.freeze(['CARGO', 'MUATAN', 'OPERATION', 'KEGIATAN'])

// ------------------------------------------------------------------ satuan (hanya SESUDAH angka)
export const SATUAN_LEKSIKON: Readonly<Record<'MT' | 'CBM', EntriLeksikon>> = Object.freeze({
  MT: Object.freeze({
    kanonik: 'MT',
    // OWNER D5. TON/TONS TIDAK (D3); M/T TIDAK (D4).
    alias: Object.freeze(['MT', 'METRIC TON', 'METRIC TONS', 'METRIC TONNE', 'METRIC TONNES', 'TONNE', 'TONNES']),
    konteks: 'SESUDAH_ANGKA',
    perluKonfirmasi: false,
    provenans: Object.freeze(['E1:E01', 'E1:E16', 'OWNER:D5']),
  }),
  CBM: Object.freeze({
    kanonik: 'CBM',
    alias: Object.freeze(['CBM', 'M3']),
    konteks: 'SESUDAH_ANGKA',
    perluKonfirmasi: false,
    provenans: Object.freeze(['OWNER:D6']),
  }),
})

// ------------------------------------------------------------------ jumlah
/** Penanda perkiraan TEPAT sebelum angka (OWNER D7; korpus E1:E03 "+/-", E1:E09 "approx.", E1:E07 "sekitar"). */
export const PENANDA_PERKIRAAN: readonly string[] = Object.freeze(['APPROX', 'APPROX.', '+/-', 'SEKITAR'])

/** Label jumlah muatan (tanpa satuan) — angka TEPAT sesudahnya boleh menjadi bukti jumlah. */
export const LABEL_JUMLAH: readonly string[] = Object.freeze(['QTY', 'QUANTITY', 'KUANTITAS', 'JUMLAH'])

/** Mata uang: angka yang didahului salah satunya BUKAN jumlah muatan (E1:E12 "IDR 45.600.000", E1:E13 "USD 9.75"). */
export const MATA_UANG: readonly string[] = Object.freeze(['IDR', 'RP', 'USD', 'US', 'EUR', 'SGD', 'MYR', 'CNY', 'JPY'])
/** Kata uang/tarif: angka pada klausa sesudah kata ini BUKAN jumlah muatan (E1:E13 "Freight rate", "Port dues"). */
export const KATA_UANG: readonly string[] = Object.freeze([
  'PRICE', 'FREIGHT', 'RATE', 'FEE', 'FEES', 'DUES', 'TARIFF', 'TARIF', 'BIAYA', 'HARGA', 'LUMPSUM', 'LUMP SUM', 'COST', 'INVOICE',
])
/** Label pengenal & partikular kapal: angka TEPAT sesudahnya BUKAN jumlah muatan. */
export const LABEL_BUKAN_JUMLAH: readonly string[] = Object.freeze([
  'IMO', 'MMSI', 'NO', 'NR', 'NOMOR', 'REF', 'VOY', 'VOYAGE', 'HULL', 'YARD', 'PO', 'CALL SIGN',
  'GRT', 'NRT', 'GT', 'DWT', 'LOA', 'BEAM', 'DRAFT', 'DRAUGHT',
])

/** OWNER D8 — lipatan OCR ANGKA yang diizinkan (hanya di dalam token angka; lihat validator). */
export const LIPATAN_OCR_ANGKA: Readonly<Record<string, string>> = Object.freeze({ O: '0', o: '0', I: '1', l: '1' })
/** Minimal digit ASLI dalam token angka ber-lipatan OCR. */
export const MIN_DIGIT_ASLI_OCR = 2
