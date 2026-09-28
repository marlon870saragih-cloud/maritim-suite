// PRD-005 — LEKSIKON MARITIM TERKENDALI v2 (validator produksi intake; data murni, deterministik, berversi).
//
// v2 = v1 (src/lib/maritim-lexicon.ts, TIDAK diubah) + remediasi validator pasca-Eval-5 yang disetujui owner
// (audit false-negative Z05/Z07/Z08/Z40; keputusan owner "CONTROLLED VALIDATOR REMEDIATION"):
//   R1  WMT  — grup satuan SENDIRI (bukan alias MT; tak pernah dinormalkan ke MT).
//   R2  KL   — grup satuan SENDIRI (bukan alias CBM; tak pernah dinormalkan ke CBM).
//   R3  frasa operasi TERIKAT "TO BE LOADED" / "TO BE DISCHARGED" (BUKAN alias umum LOADED/DISCHARGED).
//   R4  label kontak/rekening sebagai bukan-jumlah (prasyarat pengikatan lintas baris; aturan lintas baris di validator).
//
// Pembagian peran (R5 tata kelola):
//   • v1 tetap milik makna HISTORIS: penilai scorer-3 (spike-eval4-scorer.mjs), pemeriksa GT gt-sumber-2
//     (spike-gt-konsistensi.mjs), pembekuan Eval-4 & Eval-5 — semuanya terikat ke sha256 v1 yang tak berubah.
//   • v2 HANYA dipakai validator produksi (services/intake/intake-policy.ts).
// Istilah di luar daftar TIDAK dikenali (gagal-tertutup). Setiap entri wajib punya provenans.
// Token dalam bentuk `tokenLeksikon` (huruf besar A-Z0-9, dipisah spasi; "m³" → "M3"). Tanpa impor, tanpa lookbehind.

export const VERSI_LEKSIKON = 'maritim-lexicon/2'
export const VERSI_LEKSIKON_DASAR = 'maritim-lexicon/1'

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

// ------------------------------------------------------------------ operasi muatan (kata tunggal — sama dengan v1)
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
    alias: Object.freeze(['DISCHARGE', 'DISCHARGING', 'UNLOAD', 'BONGKAR', 'DISCH']),
    konteks: 'BARIS_MUATAN',
    perluKonfirmasi: false,
    provenans: Object.freeze(['E1:E04', 'E1:E08', 'E2:T03', 'E2:T06', 'E2:T12', 'E1:E10', 'OWNER:D1']),
  }),
})

/**
 * R3 — FRASA operasi terikat (urutan token utuh, di baris muatan saja). SENGAJA bukan kata tunggal:
 * "LOADED"/"DISCHARGED" terbuka TIDAK dikenali ("coal was loaded at Samarinda … will be discharged at
 * Balikpapan" — korpus E1:E09; "loaded draft"; "last port … loaded").
 */
export const FRASA_OPERASI_LEKSIKON: Readonly<Record<'LOAD' | 'DISCHARGE', EntriLeksikon>> = Object.freeze({
  LOAD: Object.freeze({
    kanonik: 'LOAD',
    alias: Object.freeze(['TO BE LOADED']),
    konteks: 'BARIS_MUATAN',
    perluKonfirmasi: false,
    provenans: Object.freeze(['E5:Z07', 'OWNER:EVAL5-REMEDIASI-R3']),
  }),
  DISCHARGE: Object.freeze({
    kanonik: 'DISCHARGE',
    alias: Object.freeze(['TO BE DISCHARGED']),
    konteks: 'BARIS_MUATAN',
    perluKonfirmasi: false,
    provenans: Object.freeze(['OWNER:EVAL5-REMEDIASI-R3']),
  }),
})

/** Frasa yang BUKAN operasi muatan kunjungan ini — sama dengan v1 (tidak dikurangi). */
export const FRASA_BUKAN_OPERASI: readonly string[] = Object.freeze([
  'LOAD LINE', 'LOADLINE', 'LOAD PORT', 'LOADING PORT', 'PORT OF LOADING',
  'DISCHARGE PORT', 'DISCHARGING PORT', 'PORT OF DISCHARGE',
  'COMPLETION OF DISCHARGE', 'DISCHARGING COMPLETED', 'DISCHARGE COMPLETED',
  'COMPLETION OF LOADING', 'LOADING COMPLETED',
  'PELABUHAN MUAT', 'PELABUHAN BONGKAR',
])

/** Label field muatan di awal baris — sama dengan v1. */
export const LABEL_BARIS_MUATAN: readonly string[] = Object.freeze(['CARGO', 'MUATAN', 'OPERATION', 'KEGIATAN'])

// ------------------------------------------------------------------ satuan (hanya SESUDAH angka)
export type GrupSatuan = 'MT' | 'CBM' | 'WMT' | 'KL'
export const SATUAN_LEKSIKON: Readonly<Record<GrupSatuan, EntriLeksikon>> = Object.freeze({
  MT: Object.freeze({
    kanonik: 'MT',
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
  // R1 — wet metric tonne. Grup SENDIRI: "55000 WMT" berbukti sebagai 55000 WMT, BUKAN 55000 MT.
  WMT: Object.freeze({
    kanonik: 'WMT',
    alias: Object.freeze(['WMT']),
    konteks: 'SESUDAH_ANGKA',
    perluKonfirmasi: false,
    provenans: Object.freeze(['E5:Z05', 'OWNER:EVAL5-REMEDIASI-R1']),
  }),
  // R2 — kiloliter. Grup SENDIRI: "4500 KL" berbukti sebagai 4500 KL, BUKAN 4500 CBM.
  KL: Object.freeze({
    kanonik: 'KL',
    alias: Object.freeze(['KL']),
    konteks: 'SESUDAH_ANGKA',
    perluKonfirmasi: false,
    provenans: Object.freeze(['E5:Z08', 'OWNER:EVAL5-REMEDIASI-R2']),
  }),
})

// ------------------------------------------------------------------ jumlah (sama dengan v1, kecuali label bukan-jumlah R4)
export const PENANDA_PERKIRAAN: readonly string[] = Object.freeze(['APPROX', 'APPROX.', '+/-', 'SEKITAR'])
export const LABEL_JUMLAH: readonly string[] = Object.freeze(['QTY', 'QUANTITY', 'KUANTITAS', 'JUMLAH'])
export const MATA_UANG: readonly string[] = Object.freeze(['IDR', 'RP', 'USD', 'US', 'EUR', 'SGD', 'MYR', 'CNY', 'JPY'])
export const KATA_UANG: readonly string[] = Object.freeze([
  'PRICE', 'FREIGHT', 'RATE', 'FEE', 'FEES', 'DUES', 'TARIFF', 'TARIF', 'BIAYA', 'HARGA', 'LUMPSUM', 'LUMP SUM', 'COST', 'INVOICE',
])
/**
 * Label pengenal & partikular kapal: angka TEPAT sesudahnya BUKAN jumlah muatan. v2 menambah label KONTAK & REKENING
 * (R4, OWNER:EVAL5-REMEDIASI-R4) — hanya mengurangi bukti, tak pernah menambah.
 */
export const LABEL_BUKAN_JUMLAH: readonly string[] = Object.freeze([
  'IMO', 'MMSI', 'NO', 'NR', 'NOMOR', 'REF', 'VOY', 'VOYAGE', 'HULL', 'YARD', 'PO', 'CALL SIGN',
  'GRT', 'NRT', 'GT', 'DWT', 'LOA', 'BEAM', 'DRAFT', 'DRAUGHT',
  'TEL', 'TELP', 'TELEPON', 'PHONE', 'HP', 'WA', 'WHATSAPP', 'FAX', 'REKENING', 'REK', 'ACCOUNT', 'ACC', 'NPWP',
  // nomor tambatan: "Dermaga 2" + baris berikut "MT <nama kapal>" tak boleh menjadi "2 MT" (prefiks kapal MT ≠ satuan)
  'BERTH', 'JETTY', 'DERMAGA', 'PIER', 'WHARF',
])

export const LIPATAN_OCR_ANGKA: Readonly<Record<string, string>> = Object.freeze({ O: '0', o: '0', I: '1', l: '1' })
export const MIN_DIGIT_ASLI_OCR = 2

/**
 * R4 — aturan PENGIKATAN LINTAS BARIS (keputusan owner Z40), didokumentasikan di sini sebagai entri tata kelola;
 * penegakannya di validator (sambunganBarisMuatan). Rekonstruksi SATU baris muatan yang terlipat, bukan inferensi.
 */
export const ATURAN_LINTAS_BARIS = Object.freeze({
  id: 'SAMBUNG_ANGKA_SATUAN_NAMA',
  syarat: Object.freeze([
    'baris fisik N diakhiri token angka jumlah',
    'baris fisik N+1 (langsung sesudahnya, tanpa baris kosong) diawali satuan leksikon',
    'nama muatan baris usulan itu menyusul TEPAT sesudah satuan',
    'pengecualian yang ada tetap berlaku (label pengenal/partikular/kontak/rekening, uang, tarif per waktu)',
    'fragmen nomor telepon dikecualikan eksplisit',
    'tanpa pencocokan fuzzy; hanya pasangan N/N+1',
  ]),
  provenans: Object.freeze(['E5:Z40', 'OWNER:EVAL5-REMEDIASI-R4']),
})
