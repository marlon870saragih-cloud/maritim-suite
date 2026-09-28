// PRD-005 — LEKSIKON MARITIM v3 (validator produksi intake; data murni, deterministik, berversi).
//
// Spesifikasi beku: docs/PRD-005-VALIDATOR-V3.md (SPEC:V3). Prinsip V3: validator MEMVERIFIKASI fakta usulan model
// terhadap bukti sumber; ia TIDAK menemukan ulang fakta muatan lewat daftar-putih inklusi. Karena itu berkas ini
// memuat terutama KELAS TERTUTUP: famili morfologi operasi, frasa bukan-operasi, penanda lampau/masa depan, penanda
// perkiraan, kelas label pengecualian, kelas satuan TERLARANG (arah aman), penanda zona & koreksi. Satu-satunya daftar
// satuan "diterima" adalah kelompok alias v2 yang DIBEKUKAN (kompatibilitas, tak pernah bertambah) dan himpunan satuan
// standar INFORMATIF (hanya memicu flag informatif; bukan gerbang).
//
// v1 (maritim-lexicon.ts) & v2 (maritim-lexicon-v2.ts) TIDAK diubah (artefak historis). Tanpa impor, tanpa lookbehind.
// Setiap entri berprovenans SPEC:V3 §n — tak satu pun berasal dari kasus evaluasi Eval-5/Eval-6 (dilarang, diuji).

export const VERSI_LEKSIKON = 'maritim-lexicon/3'
export const PROVENANS = 'SPEC:V3'

/** Token kata utuh (bentuk nama muatan, sama dengan v1/v2): huruf besar A-Z0-9 ("m³" → "M3"). */
export function tokenLeksikon(s: string): string[] {
  return s.toUpperCase().replace(/³/g, '3').split(/[^A-Z0-9]+/).filter(Boolean)
}

// ------------------------------------------------------------------ §4.1 / §4.7 label baris muatan
export const NAMA_MUATAN_UMUM: readonly string[] = Object.freeze(['CARGO', 'CARGOES', 'THE CARGO', 'MUATAN', 'BARANG', 'GOODS', 'COMMODITY', 'KOMODITAS'])
/** Label baris muatan (awal baris logis). */
export const LABEL_BARIS_MUATAN: readonly string[] = Object.freeze(['CARGO', 'CARGOES', 'MUATAN', 'KARGO', 'COMMODITY', 'KOMODITAS', 'OPERATION', 'KEGIATAN', 'QTY', 'QUANTITY', 'KUANTITAS', 'JUMLAH'])
/** Kepala blok muatan (§5.1) = label baris muatan tanpa OPERATION/KEGIATAN. */
export const KEPALA_BLOK_MUATAN: readonly string[] = Object.freeze(['CARGO', 'CARGOES', 'MUATAN', 'KARGO', 'COMMODITY', 'KOMODITAS', 'QTY', 'QUANTITY', 'KUANTITAS', 'JUMLAH'])
/** Label jumlah tanpa satuan (§4.5.3). */
export const LABEL_JUMLAH: readonly string[] = Object.freeze(['QTY', 'QUANTITY', 'KUANTITAS', 'JUMLAH'])
/** Label baris operasi dalam grup label (§5.1). */
export const LABEL_OPERASI: readonly string[] = Object.freeze(['OPERATION', 'OPERATIONS', 'OPERASI', 'KEGIATAN', 'ACTIVITY', 'CARGO OPERATION'])

// ------------------------------------------------------------------ §4.4 label pengecualian (angka TEPAT sesudahnya ≠ jumlah)
export const LABEL_BUKAN_JUMLAH: readonly string[] = Object.freeze([
  // pengenal / referensi
  'IMO', 'MMSI', 'NO', 'NR', 'NOMOR', 'REF', 'VOY', 'VOYAGE', 'HULL', 'YARD', 'PO', 'CALL SIGN', 'INV', 'INVOICE', 'CONTRACT', 'KONTRAK', 'BL',
  // partikular kapal
  'GRT', 'NRT', 'GT', 'DWT', 'LOA', 'BEAM', 'DRAFT', 'DRAUGHT', 'DEADWEIGHT',
  // kontak / rekening
  'TEL', 'TELP', 'TELEPON', 'PHONE', 'HP', 'WA', 'WHATSAPP', 'FAX', 'MOBILE', 'REKENING', 'REK', 'ACCOUNT', 'ACC', 'NPWP',
  // tambatan
  'BERTH', 'JETTY', 'DERMAGA', 'PIER', 'WHARF',
])

// ------------------------------------------------------------------ §4.4 uang & tarif
export const MATA_UANG: readonly string[] = Object.freeze(['IDR', 'RP', 'USD', 'US', 'EUR', 'SGD', 'MYR', 'CNY', 'JPY', 'RUPIAH', 'DOLLAR', 'DOLLARS'])
export const KATA_UANG: readonly string[] = Object.freeze([
  'PRICE', 'FREIGHT', 'RATE', 'FEE', 'FEES', 'DUES', 'TARIFF', 'TARIF', 'BIAYA', 'HARGA', 'LUMPSUM', 'LUMP SUM', 'COST', 'INVOICE',
])
/** ADDENDUM-1 AM3: kata struktural tambahan yang boleh ada di segmen "bebas nama". */
export const KATA_STRUKTURAL: readonly string[] = Object.freeze(['TOTAL'])
/** Penanda tarif per-satuan: sesudah satuan, atau tepat sebelum angka (bersama '@' dan '/'). */
export const PENANDA_TARIF: readonly string[] = Object.freeze(['PER', 'EACH', 'SETIAP', 'TIAP'])

// ------------------------------------------------------------------ §4.3 kelas satuan TERLARANG (arah aman)
export const SATUAN_TERLARANG: Readonly<Record<string, readonly string[]>> = Object.freeze({
  panjang: Object.freeze(['M', 'MTR', 'METER', 'METERS', 'METRE', 'METRES', 'CM', 'MM', 'KM', 'FT', 'FEET', 'FOOT', 'INCH', 'NM', 'NMI', 'MILE', 'MILES']),
  kecepatan: Object.freeze(['KN', 'KNOT', 'KNOTS', 'KTS']),
  waktu: Object.freeze(['SEC', 'DETIK', 'MIN', 'MENIT', 'HR', 'HRS', 'HOUR', 'HOURS', 'JAM', 'DAY', 'DAYS', 'HARI', 'WEEK', 'WEEKS', 'MINGGU', 'MONTH', 'MONTHS', 'BULAN', 'YEAR', 'YEARS', 'TAHUN']),
  // ADDENDUM-1 AM2: penanda waktu ("0915 LT")
  waktuZona: Object.freeze(['LT', 'UTC', 'GMT', 'WIB', 'WITA', 'WIT', 'H']),
  persen: Object.freeze(['PCT', 'PERCENT', 'PERSEN']),
  suhuDaya: Object.freeze(['DEG', 'DEGREE', 'DEGREES', 'CELSIUS', 'KW', 'KVA', 'RPM']),
  partikular: Object.freeze(['DWT', 'GRT', 'NRT', 'GT', 'LOA', 'BEAM', 'DRAFT', 'DRAUGHT', 'DEADWEIGHT']),
  awalanKapal: Object.freeze(['MV', 'TB', 'TK', 'OB', 'SPOB', 'LCT', 'KM', 'KMP']),
  kapalAwak: Object.freeze(['VESSEL', 'VESSELS', 'SHIP', 'SHIPS', 'KAPAL', 'TUG', 'TUGS', 'BARGE', 'BARGES', 'TONGKANG', 'CREW', 'ORANG', 'PERSONS', 'PAX', 'GANG', 'GANGS', 'SHIFT', 'SHIFTS', 'HATCH', 'HATCHES', 'PALKA']),
  badanUsaha: Object.freeze(['PT', 'CV', 'TBK', 'LTD', 'PTE', 'INC', 'CO', 'CORP', 'LLC']),
  bulanHari: Object.freeze([
    'JAN', 'JANUARY', 'JANUARI', 'FEB', 'FEBRUARY', 'FEBRUARI', 'MAR', 'MARCH', 'MARET', 'APR', 'APRIL', 'MAY', 'MEI', 'JUN', 'JUNE', 'JUNI',
    'JUL', 'JULY', 'JULI', 'AUG', 'AUGUST', 'AGU', 'AGT', 'AGS', 'AGUSTUS', 'SEP', 'SEPT', 'SEPTEMBER', 'OCT', 'OCTOBER', 'OKT', 'OKTOBER',
    'NOV', 'NOVEMBER', 'DEC', 'DECEMBER', 'DES', 'DESEMBER',
    'MON', 'MONDAY', 'TUE', 'TUESDAY', 'WED', 'WEDNESDAY', 'THU', 'THURSDAY', 'FRI', 'FRIDAY', 'SAT', 'SATURDAY', 'SUN', 'SUNDAY',
    'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU',
  ]),
  dimensi: Object.freeze(['X']),
  kataFungsi: Object.freeze([
    'TO', 'FOR', 'AND', 'OR', 'OF', 'IN', 'AT', 'ON', 'BY', 'FROM', 'WITH', 'THE', 'A', 'AN', 'IS', 'ARE', 'BE', 'WILL', 'AS', 'PER', 'EACH',
    'DAN', 'ATAU', 'DI', 'KE', 'DARI', 'UNTUK', 'UTK', 'DENGAN', 'DGN', 'YANG', 'YG', 'PADA', 'OLEH', 'SEBAGAI', 'AKAN', 'SUDAH', 'TELAH',
    'ITU', 'INI', 'DALAM', 'BAGI', 'SETIAP', 'TIAP', 'SEKITAR', 'APPROX', 'ABT', 'ABOUT',
  ]),
})

/** §4.5.2 kelompok alias v2 yang DIBEKUKAN (kompatibilitas; tak pernah bertambah; TON/TONS sengaja tidak ada — D1). */
export const ALIAS_SATUAN_WARISAN: Readonly<Record<'MT' | 'CBM' | 'WMT' | 'KL', readonly string[]>> = Object.freeze({
  MT: Object.freeze(['MT', 'METRIC TON', 'METRIC TONS', 'METRIC TONNE', 'METRIC TONNES', 'TONNE', 'TONNES']),
  CBM: Object.freeze(['CBM', 'M3']),
  WMT: Object.freeze(['WMT']),
  KL: Object.freeze(['KL']),
})
/** §4.5.7 satuan standar INFORMATIF: di luar himpunan ini → CARGO_UNIT_NONSTANDARD (informatif, bukan gerbang). */
export const SATUAN_STANDAR_INFORMATIF: readonly string[] = Object.freeze(Object.values(ALIAS_SATUAN_WARISAN).flat())

// ------------------------------------------------------------------ §4.6 perkiraan
export const PENANDA_PERKIRAAN_KATA: readonly string[] = Object.freeze([
  'APPROX', 'APPROXIMATELY', 'APPRX', 'ABT', 'ABOUT', 'AROUND', 'CIRCA', 'ROUGHLY', 'NEARLY', 'EST', 'ESTIMATED', 'ESTIMATE',
  'SEKITAR', 'KURANG LEBIH', 'LEBIH KURANG', 'KIRA KIRA', 'ESTIMASI',
])
/** Simbol perkiraan (urutan token simbol tanpa jarak, atau berspasi untuk "+ / -"). */
export const PENANDA_PERKIRAAN_SIMBOL: readonly string[] = Object.freeze(['±', '+/-', '+-', '~', '≈'])
/** Hanya TEPAT sebelum angka. */
export const PENANDA_PERKIRAAN_DEKAT: readonly string[] = Object.freeze(['CA'])
export const PENANDA_TOLERANSI: readonly string[] = Object.freeze(['MOLOO', 'MOLCO', 'TOLERANCE', 'TOLERANSI'])
export const PEMISAH_RENTANG_KATA: readonly string[] = Object.freeze(['TO', 'SAMPAI', 'HINGGA', 'S/D'])

// ------------------------------------------------------------------ §5.2 famili morfologi operasi (tertutup)
export type FamiliOperasi = 'LOAD' | 'DISCHARGE'
export type BentukOperasi = { readonly kuat: readonly string[]; readonly lemah: readonly string[]; readonly lampau: readonly string[] }
export const FAMILI_OPERASI: Readonly<Record<FamiliOperasi, BentukOperasi>> = Object.freeze({
  LOAD: Object.freeze({
    kuat: Object.freeze(['LOAD', 'LOADS', 'LOADING', 'MUAT', 'MEMUAT', 'MEMUATKAN', 'PEMUATAN']),
    lemah: Object.freeze(['LOADED', 'DIMUAT']),
    lampau: Object.freeze(['TERMUAT']),
  }),
  DISCHARGE: Object.freeze({
    kuat: Object.freeze(['DISCHARGE', 'DISCHARGES', 'DISCHARGING', 'DISCH', 'DISCHG', 'UNLOAD', 'UNLOADS', 'UNLOADING', 'BONGKAR', 'MEMBONGKAR', 'PEMBONGKARAN', 'BONGKARAN']),
    lemah: Object.freeze(['DISCHARGED', 'UNLOADED', 'DIBONGKAR']),
    lampau: Object.freeze(['TERBONGKAR']),
  }),
})
/** Penanda masa depan: bentuk LEMAH → KUAT bila salah satunya ada dalam 2 kata sebelumnya. */
export const PENANDA_MASA_DEPAN: readonly string[] = Object.freeze(['AKAN', 'WILL', 'BE', 'SHALL', 'UNTUK', 'UTK', 'RENCANA', 'PLANNED'])
/** Kata benda muatan — BUKAN bukti operasi. */
export const BUKAN_BUKTI_OPERASI: readonly string[] = Object.freeze(['MUATAN', 'BERMUATAN', 'KARGO'])
/** Frasa bukan-operasi (urutan token; '/' adalah token). Dibuang sebelum pencocokan famili. */
export const FRASA_BUKAN_OPERASI: readonly string[] = Object.freeze([
  'LOAD PORT', 'LOADING PORT', 'PORT OF LOADING', 'PORT OF DISCHARGE', 'DISCHARGE PORT', 'DISCHARGING PORT', 'POL', 'POD',
  'PELABUHAN MUAT', 'PELABUHAN BONGKAR', 'LOADED DRAFT', 'LOADED DRAUGHT', 'LOAD LINE', 'LOADLINE',
  'COMPLETION OF LOADING', 'COMPLETION OF DISCHARGE', 'LOADING COMPLETED', 'DISCHARGE COMPLETED', 'DISCHARGING COMPLETED',
  'LOADING RATE', 'DISCHARGE RATE', 'DISCHARGING RATE', 'LOAD RATE', 'LOADING MASTER', 'BONGKAR MUAT', 'MUAT BONGKAR', 'TKBM',
  'L / D', 'LOAD / DISCHARGE',
])
/** Penanda lampau/sebelumnya (dalam klausa yang sama → item LAMPAU). */
export const PENANDA_LAMPAU: readonly string[] = Object.freeze([
  'WAS', 'WERE', 'HAS BEEN', 'HAD BEEN', 'PREVIOUS', 'PREVIOUSLY', 'LAST VOYAGE', 'LAST PORT', 'LAST CARGO', 'LAST CALL', 'LAST TRIP',
  'EX', 'FORMER', 'FORMERLY', 'PRIOR', 'EARLIER', 'ALREADY', 'COMPLETED',
  'TELAH', 'SUDAH', 'SEBELUMNYA', 'LALU', 'TERAKHIR', 'SELESAI', 'EKS',
])

/**
 * ADDENDUM-1 AM4: penanda VOYAGE/MUATAN LAIN (subset PENANDA_LAMPAU). Angka di klausa bertanda ini bukan jumlah muatan
 * kunjungan ini. Kala lampau biasa (WAS/TELAH/SUDAH …) TIDAK termasuk: "7,500 MT coal was loaded" = muatan kini di kapal.
 */
export const PENANDA_MUATAN_LAIN: readonly string[] = Object.freeze([
  'LAST VOYAGE', 'LAST CARGO', 'LAST CALL', 'LAST TRIP', 'LAST PORT', 'PREVIOUS', 'PREVIOUSLY', 'FORMER', 'FORMERLY', 'PRIOR',
  'EX', 'SEBELUMNYA', 'EKS', 'LALU', 'TERAKHIR',
])

// ------------------------------------------------------------------ §5.4 multi-pelabuhan
export const FRASA_PELABUHAN_MUAT: readonly string[] = Object.freeze(['POL', 'LOAD PORT', 'LOADING PORT', 'PORT OF LOADING', 'PELABUHAN MUAT'])
export const FRASA_PELABUHAN_BONGKAR: readonly string[] = Object.freeze(['POD', 'DISCHARGE PORT', 'DISCHARGING PORT', 'PORT OF DISCHARGE', 'PELABUHAN BONGKAR'])
export const FRASA_MULTI_PELABUHAN: readonly string[] = Object.freeze(['LAST PORT', 'NEXT PORT', 'PREVIOUS PORT', 'PELABUHAN SEBELUMNYA', 'PELABUHAN BERIKUTNYA', 'TRANSIT'])

// ------------------------------------------------------------------ §6 zona & koreksi
export const SALAM_PENUTUP: readonly string[] = Object.freeze([
  'BEST REGARDS', 'KIND REGARDS', 'WARM REGARDS', 'WARMEST REGARDS', 'REGARDS', 'RGDS', 'BRGDS', 'B RGDS', 'BEST', 'THANKS', 'THANK YOU',
  'MANY THANKS', 'THANKS AND REGARDS', 'THANKS REGARDS', 'CHEERS', 'SALAM', 'SALAM HORMAT', 'HORMAT KAMI', 'HORMAT SAYA', 'TERIMA KASIH',
  'TERIMAKASIH', 'TRIMS', 'WASSALAM', 'TKS', 'THX',
])
export const PENANDA_KOREKSI: readonly string[] = Object.freeze([
  'CORRECTION', 'CORRECTED', 'KOREKSI', 'REVISI', 'REVISED', 'REVISION', 'AMENDED', 'AMENDMENT', 'UPDATED', 'DIGANTI', 'DIUBAH',
  'CHANGED TO', 'MENJADI', 'INSTEAD OF', 'BUKAN',
])
