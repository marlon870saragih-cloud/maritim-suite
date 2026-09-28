// Kebijakan MURNI Vessel Call Intake — PRD-004 Step 3.
//
//   AI extracts → SYSTEM VERIFIES (berkas ini) → Human approves → createVoyage() writes → Audit
//
// Semua yang menentukan identitas, duplikat, transisi status, dan syarat approval
// ada di sini, deterministik, tanpa DB/jaringan/LLM. Keluaran AI diperlakukan
// sebagai masukan TIDAK TEPERCAYA: bentuknya diperiksa ulang di validasiEkstraksi().
//
// TANPA impor runtime (pola monitoring-policy.ts / gate.ts) — SATU pengecualian (Eval-4, audit alias
// maritim): leksikon maritim, modul DATA murni tanpa impor apa pun. Sejak Validator V3 (SPEC:V3,
// docs/PRD-005-VALIDATOR-V3.md) validator memakai lib/maritim-lexicon-v3.ts; v1 & v2 tak diubah (v1 tetap milik
// penilai & pemeriksa GT historis — makna Eval-4/Eval-5 beku tidak bergeser). prisma/check-intake-policy.mjs memuat
// berkas ini lewat jiti (objek yang sama; impor .ts eksplisit ditolak tsc TS5097). Normalisasi identitas
// kapal TIDAK disalin: fungsi dari lib/vessels.ts disuntikkan lewat `NormalisasiKapal`,
// sehingga service dan uji memakai fungsi yang PERSIS sama.

import {
  ALIAS_SATUAN_WARISAN,
  BUKAN_BUKTI_OPERASI,
  FAMILI_OPERASI,
  FRASA_BUKAN_OPERASI,
  FRASA_MULTI_PELABUHAN,
  FRASA_PELABUHAN_BONGKAR,
  FRASA_PELABUHAN_MUAT,
  KATA_UANG,
  KEPALA_BLOK_MUATAN,
  LABEL_BARIS_MUATAN,
  LABEL_BUKAN_JUMLAH,
  LABEL_JUMLAH,
  LABEL_OPERASI,
  MATA_UANG,
  NAMA_MUATAN_UMUM as NAMA_MUATAN_UMUM_V3,
  PENANDA_KOREKSI,
  PENANDA_LAMPAU,
  PENANDA_MASA_DEPAN,
  PENANDA_MUATAN_LAIN,
  PENANDA_PERKIRAAN_DEKAT,
  PENANDA_PERKIRAAN_KATA,
  PENANDA_PERKIRAAN_SIMBOL,
  PENANDA_TARIF,
  PENANDA_TOLERANSI,
  SALAM_PENUTUP,
  SATUAN_STANDAR_INFORMATIF,
  SATUAN_TERLARANG,
  KATA_STRUKTURAL,
  tokenLeksikon,
} from '../../lib/maritim-lexicon-v3'

// ----------------------------------------------------------------- konstanta

export const STATUS_INTAKE = ['NEEDS_REVIEW', 'CREATING', 'COMPLETED', 'LINKED_EXISTING', 'REJECTED', 'FAILED'] as const
export type StatusIntake = (typeof STATUS_INTAKE)[number]
/** Status akhir: activeHashKey dikosongkan, kontak dihapus, tak bisa diubah lagi. */
export const STATUS_TERMINAL: readonly StatusIntake[] = ['COMPLETED', 'LINKED_EXISTING', 'REJECTED']
/** Status yang masih "memegang" hash input (menahan pemrosesan ulang input yang sama). */
export const STATUS_AKTIF: readonly StatusIntake[] = ['NEEDS_REVIEW', 'CREATING', 'FAILED']

export const KLASIFIKASI = [
  'NEW_NOMINATION',
  'NEW_APPOINTMENT',
  'NOT_RELEVANT',
  'INSUFFICIENT_INFORMATION',
  'UNSUPPORTED_REQUEST',
] as const
export type Klasifikasi = (typeof KLASIFIKASI)[number]
/** D5 — satu-satunya klasifikasi yang boleh di-approve pada pilot. */
export const KLASIFIKASI_PILOT: readonly Klasifikasi[] = ['NEW_NOMINATION', 'NEW_APPOINTMENT']

/**
 * Eval-4 (OWNER D10) — klasifikasi yang BOLEH ditautkan ke voyage yang sudah ada. Daftar-izin (gagal-tertutup:
 * klasifikasi baru/tak dikenal TIDAK bisa ditautkan). NOT_RELEVANT & UNSUPPORTED_REQUEST sengaja tidak ada.
 * FUTURE_REQUIREMENT (TD-005-03): pembaruan operasional (revisi ETA/ETB/ETD untuk voyage yang ada) butuh alur
 * tautkan/perbarui KHUSUS dengan klasifikasinya sendiri — bukan dengan melonggarkan daftar ini.
 */
export const KLASIFIKASI_BOLEH_TAUTKAN: readonly Klasifikasi[] = ['NEW_NOMINATION', 'NEW_APPOINTMENT', 'INSUFFICIENT_INFORMATION']
export const bolehTautkanVoyage = (classification: string): boolean => (KLASIFIKASI_BOLEH_TAUTKAN as readonly string[]).includes(classification)

export const JENIS_INPUT = ['TEXT', 'PDF', 'IMAGE', 'WORKBOOK', 'CSV'] as const
export type JenisInput = (typeof JENIS_INPUT)[number]
/** Masukan yang teksnya bisa dicek ulang terhadap nilai hasil AI. */
export const INPUT_BERTEKS: readonly JenisInput[] = ['TEXT', 'WORKBOOK', 'CSV']
/**
 * Step 4F — masukan yang dibaca AI dari visual (PDF/gambar) tak bisa dicek ulang
 * terhadap teks. Setiap kecocokan master otomatis dari masukan ini WAJIB
 * dikonfirmasi manusia (pengganti konfirmasi "sudah dicek dengan dokumen asli",
 * yang tak bermakna bila dokumen asli tidak disimpan).
 */
export const INPUT_VISUAL: readonly JenisInput[] = ['PDF', 'IMAGE']
export const inputVisual = (kind: string): boolean => (INPUT_VISUAL as readonly string[]).includes(kind)

export const LEVEL_DUPLIKAT = ['NO_DUPLICATE', 'POSSIBLE_DUPLICATE', 'LIKELY_DUPLICATE'] as const
export type LevelDuplikat = (typeof LEVEL_DUPLIKAT)[number]
export const peringkatDuplikat = (l: string): number => Math.max(0, (LEVEL_DUPLIKAT as readonly string[]).indexOf(l))

export const KEPUTUSAN_DUPLIKAT = ['CONTINUE_AS_NEW', 'LINK_EXISTING'] as const
export type KeputusanDuplikat = (typeof KEPUTUSAN_DUPLIKAT)[number]

/** Ambang duplikat (hari kalender) — SATU tempat, bisa dikalibrasi tanpa perubahan desain. */
export const AMBANG_DUPLIKAT_LIKELY_HARI = 3
export const AMBANG_DUPLIKAT_POSSIBLE_HARI = 7

export const STATUS_VOYAGE_AKTIF = ['PLANNED', 'CONFIRMED', 'ARRIVED', 'BERTHED', 'WORKING'] as const
export const STATUS_VOYAGE_SELESAI = ['COMPLETED', 'DEPARTED'] as const
export const STATUS_VOYAGE_DIABAIKAN = ['CLOSED', 'CANCELLED'] as const

export const MAKS_KAPAL_INTAKE = 10
export const MAKS_CARGO_INTAKE = 20
export const MAKS_PANJANG_NILAI = 200
export const MIN_PANJANG_ALASAN = 10
export const MIN_PANJANG_ALASAN_TOLAK = 3
/**
 * Daftar intake. ETA & nama kapal/pelabuhan diturunkan dari JSON proposal di
 * JavaScript, bukan kolom basis data, sehingga cari & urut-per-ETA tak bisa
 * dijalankan di SQL. Server memindai baris ber-status terpilih sampai batas ini,
 * lalu mencari/mengurutkan/memenggal di memori. Bila batas tersentuh, hasilnya
 * ditandai terpotong supaya UI tidak diam-diam menyembunyikan baris.
 */
export const MAKS_PINDAI_INTAKE = 1000
export const UKURAN_HALAMAN_INTAKE = 25
export const MAKS_UKURAN_HALAMAN_INTAKE = 100

/** Rentang tanggal yang diterima dari dokumen (relatif hari ini, hari kalender). */
export const TANGGAL_MUNDUR_HARI = 30
export const TANGGAL_MAJU_HARI = 365
/** Klaim CREATING lebih tua dari ini dianggap terputus → direkonsiliasi. */
export const BATAS_KLAIM_MENIT = 5

export const AWALAN_NAMA_KAPAL = ['MV', 'MT', 'TB', 'TK', 'OB', 'SPOB', 'LCT', 'KM', 'KMP'] as const
export const BENTUK_BADAN_USAHA = ['PT', 'CV', 'TBK', 'LTD', 'PTE', 'INC', 'CO'] as const
export const PERAN_KAPAL = ['TUG', 'BARGE'] as const
export const JENIS_KEAGENAN = ['FULL', 'PROTECTIVE', 'HUSBANDRY'] as const
export const OPERASI_CARGO = ['LOAD', 'DISCHARGE'] as const

// ----------------------------------------------------------------- tipe

export type SumberField = 'SOURCE_DOCUMENT' | 'MASTER_MATCH' | 'USER_EDITED' | 'SYSTEM_DERIVED' | 'EMPTY'
export type FlagField =
  | 'NOT_IN_SOURCE'
  | 'UNVERIFIED_SOURCE'
  | 'IMO_CHECK_DIGIT'
  | 'DATE_OUT_OF_RANGE'
  | 'DATE_NOT_IN_SOURCE'
  | 'OCR_CORRECTED'
  | 'NAME_ONLY_MATCH'
  | 'ILLEGIBLE_VALUE'
  | 'NOT_A_VESSEL_NAME'
  | 'IMO_FORMAT_INVALID'

export type FieldUsulan<T = string> = {
  value: T | null
  source: SumberField
  flags: FlagField[]
  /** Nilai asli dari AI sebelum validasi/edit — untuk audit, bukan untuk ditulis ke Voyage. */
  extracted: T | null
  /** true bila manusia sudah memeriksa nilai ini (wajib untuk UNVERIFIED_SOURCE). */
  confirmed: boolean
}

export type KapalUsulan = {
  name: FieldUsulan
  imo: FieldUsulan
  mmsi: FieldUsulan
  callSign: FieldUsulan
  vesselType: FieldUsulan
  role: FieldUsulan<'TUG' | 'BARGE'>
  /** Peninjau mengeluarkan kapal ini dari usulan (mis. kapal lain yang hanya disebut). */
  excluded: boolean
}

/**
 * PRD-005 Eval-4 prep — flag validasi baris muatan. Nilai yang tak berbukti DIKOSONGKAN (flag hanya
 * jejak); flag di PERLU_KONFIRMASI_CARGO berarti nilainya DIPERTAHANKAN tetapi wajib dikonfirmasi manusia.
 */
export type FlagCargo =
  | 'UNVERIFIED_SOURCE'
  | 'OCR_CORRECTED'
  | 'CARGO_QUANTITY_NOT_IN_SOURCE'
  | 'CARGO_UNIT_NOT_IN_SOURCE'
  | 'CARGO_UNIT_WITHOUT_QUANTITY'
  | 'CARGO_OPERATION_NOT_IN_SOURCE'
  | 'CARGO_OPERATION_CONTRADICTS_SOURCE'
  | 'CARGO_OPERATION_AMBIGUOUS'
  | 'APPROXIMATE_QUANTITY'
  // V3 (SPEC:V3 §7) — review: nilai dipertahankan, wajib dikonfirmasi
  | 'CARGO_OPERATION_CONTEXTUAL'
  | 'CARGO_OPERATION_DOCUMENT_LEVEL'
  | 'CARGO_EVIDENCE_QUOTED'
  | 'CARGO_CORRECTION_APPLIED'
  // V3 — jejak: nilai dikosongkan
  | 'CARGO_OPERATION_PAST_REFERENCE'
  | 'CARGO_RELATION_AMBIGUOUS'
  | 'CARGO_CORRECTION_UNRESOLVED'
  // V3 — informatif (bukan gerbang)
  | 'CARGO_UNIT_NONSTANDARD'

/** OWNER D7/D8: jumlah perkiraan & koreksi OCR tetap terlihat, tetapi wajib dikonfirmasi sebelum menjadi data operasional. */
export const PERLU_KONFIRMASI_CARGO: readonly FlagCargo[] = [
  'UNVERIFIED_SOURCE',
  'OCR_CORRECTED',
  'CARGO_OPERATION_AMBIGUOUS',
  'APPROXIMATE_QUANTITY',
  // V3 (SPEC:V3 §7): tier 2/3, bukti kutipan, koreksi diterapkan — tak pernah tepercaya otomatis
  'CARGO_OPERATION_CONTEXTUAL',
  'CARGO_OPERATION_DOCUMENT_LEVEL',
  'CARGO_EVIDENCE_QUOTED',
  'CARGO_CORRECTION_APPLIED',
]

export type CargoUsulan = {
  name: string
  quantity: number | null
  unit: string | null
  operation: 'LOAD' | 'DISCHARGE' | null
  /** Asal baris. SOURCE_DOCUMENT = dari dokumen; kepercayaan ditentukan `flags` (lihat cargoTepercaya). */
  source: SumberField
  /**
   * Eval-4 prep — hasil validasi grounding. OPSIONAL hanya demi baris lama: proposal tersimpan tanpa
   * field ini TIDAK dipercaya otomatis (wajib dikonfirmasi — cargoTepercaya).
   */
  flags?: FlagCargo[]
  /** true bila peninjau sudah memeriksa baris ini. */
  confirmed?: boolean
  /** V3 — jejak aturan (id aturan per field, tier operasi, zona); TANPA teks sumber. */
  jejak?: JejakMuatan
}

export type KontakUsulan = { name: string | null; email: string | null; phone: string | null }

export type Proposal = {
  vessels: KapalUsulan[]
  principalName: FieldUsulan
  customerName: FieldUsulan
  portName: FieldUsulan
  portUnlocode: FieldUsulan
  jetty: FieldUsulan
  eta: FieldUsulan
  etb: FieldUsulan
  etc: FieldUsulan
  etd: FieldUsulan
  agencyType: FieldUsulan
  clientReference: FieldUsulan
  requestDate: FieldUsulan
  cargoes: CargoUsulan[]
  /** PII (§23) — hanya selama non-terminal, untuk prefill master baru. */
  contact: KontakUsulan | null
  /** Alasan sistem menimpa klasifikasi AI (null bila tidak ditimpa). */
  classificationReason: string | null
  /**
   * PRD-005 E5 Step 2 — jumlah entri kapal usulan AI yang DIBUANG validator karena tak satu pun
   * identitasnya (nama/IMO/MMSI/call sign) terverifikasi di sumber. Hanya hitungan — nilai yang
   * ditolak TIDAK disimpan di mana pun. Opsional: baris lama tanpa field ini = 0.
   */
  vesselsDropped?: number
  /**
   * Eval-4 prep — jumlah baris muatan usulan AI yang DIBUANG validator: nama muatan tidak tertulis di
   * sumber, atau hanya kata umum ("cargo"/"muatan"). Hanya hitungan; baris lama tanpa field ini = 0.
   */
  cargoesDropped?: number
}

export type StatusCocok = 'MATCHED' | 'AMBIGUOUS' | 'NOT_FOUND' | 'CONFLICT'
export type BasisCocok =
  | 'EXACT_IMO'
  | 'EXACT_MMSI_VERIFIED'
  | 'EXACT_CALL_SIGN'
  | 'NAME_NORMALIZED'
  | 'UNLOCODE'
  | 'SELECTED_BY_REVIEWER'
  | 'CREATED_BY_REVIEWER'

export type KandidatCocok = { id: string; label: string; basis: string; warning?: string | null; mmsiUnverified?: boolean }

export type HasilCocok = {
  status: StatusCocok
  basis: BasisCocok | null
  selectedId: string | null
  candidates: KandidatCocok[]
  requiresConfirmation: boolean
  confirmed: boolean
  /** Principal/customer: peninjau SECARA SADAR membiarkan kosong. */
  leftEmpty: boolean
}

export type Matches = {
  vessels: HasilCocok[]
  principal: HasilCocok
  customer: HasilCocok
  port: HasilCocok
}

export type NormalisasiKapal = {
  imo: (v: unknown) => string | null
  imoSah: (imo: string) => boolean
  mmsi: (v: unknown) => string | null
  mmsiSah: (mmsi: string) => boolean
  callSign: (v: unknown) => string | null
}

// ----------------------------------------------------------------- utilitas

const MS_HARI = 86_400_000

function teks(v: unknown, maks = MAKS_PANJANG_NILAI): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  return t === '' ? null : t.slice(0, maks)
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

export const fieldKosong = <T = string>(extracted: T | null = null, flags: FlagField[] = []): FieldUsulan<T> => ({
  value: null,
  source: 'EMPTY',
  flags,
  extracted,
  confirmed: false,
})

const fieldDokumen = <T = string>(value: T, flags: FlagField[] = []): FieldUsulan<T> => ({
  value,
  source: 'SOURCE_DOCUMENT',
  flags,
  extracted: value,
  confirmed: false,
})

/** Teks sumber untuk hash: trim, CRLF→LF, spasi/tab berulang dirapatkan, spasi di ujung baris dibuang. */
export function normalisasiTeksSumber(s: string): string {
  return s
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t\f\v]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Bentuk ringkas untuk uji "nilai ada di teks sumber": huruf besar, hanya huruf & angka. */
export const kompak = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, '')

function adaDiSumber(nilai: string, sumberKompak: string): boolean {
  const k = kompak(nilai)
  return k.length > 0 && sumberKompak.includes(k)
}

/**
 * PRD-005 E5 Step 2 — lipatan salah-baca OCR, SEMPIT dan eksplisit. Hanya dipakai SESUDAH uji
 * harfiah gagal, pada bentuk `kompak` (huruf besar, hanya A-Z0-9), di KEDUA sisi (nilai & sumber):
 *   0 → O   ·   1 → I   ·   L → I   (huruf kecil 'l' sudah menjadi 'L' oleh kompak)
 * Tidak ada jarak edit, kemiripan, atau koreksi ejaan: "BALIKPAPN" ≠ "BALIKPAPAN".
 */
export const LIPATAN_OCR: Readonly<Record<string, string>> = { '0': 'O', '1': 'I', L: 'I' }
export const lipatOcr = (k: string): string => k.replace(/[01L]/g, (c) => LIPATAN_OCR[c])
/** Nilai sependek ini terlalu mudah cocok kebetulan sesudah dilipat — jalur OCR ditolak. */
export const MIN_PANJANG_OCR = 4

function adaDiSumberOcr(nilai: string, sumberOcr: string): boolean {
  const k = lipatOcr(kompak(nilai))
  return k.length >= MIN_PANJANG_OCR && sumberOcr.includes(k)
}

/**
 * PRD-005 E5 Step 8 (P0-1) — identitas kapal yang TERSELUBUNG/tak terbaca. `kompak` membuang semua
 * non-alfanumerik, sehingga "MV ##R#A ###R" (faks tak terbaca) menjadi "MVRAR" dan lolos uji sumber.
 * Dua sisi, keduanya umum (tanpa daftar kasus):
 *   • nilai dari AI memuat karakter penyelubung (# ? * _ �) atau penanda tak terbaca → ditolak;
 *   • bukti di sumber tak boleh BERSENTUHAN dengan token sumber yang terselubung (nilai yang
 *     membuang penyelubungnya sendiri, mis. "RAR" / "MV" dari "MV ##R#A ###R").
 * Satu '#' pembuka nomor ("#5", "No#12", "IMO#9876543") bukan penyelubung.
 */
export const KARAKTER_PENYELUBUNG = /[#?*_\uFFFD]/
const KARAKTER_PENYELUBUNG_G = /[#?*_\uFFFD]/g
const KATA_TAK_TERBACA = 'ILLEGIBLE|UNREADABLE|UNCLEAR|TIDAK TERBACA|TAK TERBACA|TIDAK JELAS'
const PENANDA_KATA = new RegExp(`\\b(?:${KATA_TAK_TERBACA})\\b`, 'i')
/** Nilai AI: kata penanda tak terbaca, atau elipsis (nilai terpotong). */
const PENANDA_NILAI = new RegExp(`\\b(?:${KATA_TAK_TERBACA})\\b|\\.{3,}|\\u2026`, 'i')
const NOMOR_BERTANDA = /^[A-Z]*#\d+$/i
/** Penanda yang dipakai di bentuk kompak sumber untuk token terselubung (bukan A-Z0-9). */
const TANDA_SELUBUNG = '~'

export function nilaiTerselubung(v: string): boolean {
  if (PENANDA_NILAI.test(v)) return true
  // Satu '#' pembuka nomor ("#5", "No#12", "IMO#9876543") bukan penyelubung.
  return KARAKTER_PENYELUBUNG.test(v.trim().replace(/(^|\s)[A-Z]*#(?=\d)/gi, '$1'))
}

/**
 * Token sumber (dipisah spasi) yang terselubung. Tanda baca biasa BUKAN penyelubung: "7??", "**MV X**",
 * "???" berdiri sendiri, "____" (isian kosong), "#5", "IMO#9876543", email.
 */
function tokenTerselubung(token: string): boolean {
  if (token.includes('@') || token.includes('://')) return false
  if (token.includes('\uFFFD') || PENANDA_KATA.test(token)) return true
  const inti = token.replace(/^[?*_!.,:;()[\]"']+|[?*_!.,:;()[\]"']+$/g, '')
  const jumlah = (inti.match(KARAKTER_PENYELUBUNG_G) ?? []).length
  if (jumlah === 0 || NOMOR_BERTANDA.test(inti)) return false
  if (jumlah >= 2) return true
  // Satu penyelubung: hanya bila diapit alfanumerik (R#A, 99?4).
  return /[A-Za-z0-9][#?*_][A-Za-z0-9]/.test(inti)
}

/** Bentuk kompak sumber dengan setiap token terselubung diganti TANDA_SELUBUNG (untuk identitas kapal). */
export function kompakBerselubung(sumber: string): string {
  const bertanda = sumber
    .replace(new RegExp(`\\[(?:${KATA_TAK_TERBACA})\\]`, 'gi'), ` ${TANDA_SELUBUNG} `)
    .split(/(\s+)/)
    .map((t) => (tokenTerselubung(t) ? TANDA_SELUBUNG : t))
    .join('')
  return bertanda.toUpperCase().replace(/[^A-Z0-9~]/g, '')
}

/** Ada kemunculan `k` di `sumber` yang TIDAK bersentuhan dengan token terselubung. */
function adaTanpaSelubung(k: string, sumber: string): boolean {
  if (k.length === 0) return false
  for (let i = sumber.indexOf(k); i >= 0; i = sumber.indexOf(k, i + 1)) {
    if (sumber[i - 1] !== TANDA_SELUBUNG && sumber[i + k.length] !== TANDA_SELUBUNG) return true
  }
  return false
}

/**
 * PRD-005 E5 Step 8 (P0-2) — nilai yang BUKAN nama kapal walau tertulis harfiah di sumber:
 *   • hanya angka (sesudah awalan MV/TB/… dibuang);
 *   • label pengenal non-kapal + nomor: Hull/Yard/NB/Newbuilding/PO/Ref/IMO/MMSI (+ No) diikuti token
 *     berangka, atau label umum (Reference/Order/Voyage/Voy/Job/Contract/Project/Building) yang
 *     WAJIB diikuti "No/Nr/Number/Nomor" lalu token berangka.
 * Nama asli yang memuat angka ("OCEAN 7", "BINTANG 12") tetap sah.
 */
const LABEL_PENGENAL_KUAT = 'HULL|YARD|NB|NEWBUILDING|NEW BUILDING|PO|REF|IMO|MMSI'
const LABEL_PENGENAL_UMUM = 'REFERENCE|ORDER|PURCHASE ORDER|VOYAGE|VOY|JOB|CONTRACT|PROJECT|BUILDING'
const SEBUTAN_NOMOR = 'NO|NR|NUMBER|NOMOR|NUM'
const POLA_BUKAN_NAMA = new RegExp(
  `^(?:(?:${LABEL_PENGENAL_KUAT})(?: (?:${SEBUTAN_NOMOR}))?|(?:${LABEL_PENGENAL_UMUM}) (?:${SEBUTAN_NOMOR}))(?: [A-Z0-9]+)*$`,
)
export function bukanNamaKapal(v: string): boolean {
  const n = normalisasiNamaKapal(v)
  if (!n) return false
  if (/^[0-9 ]+$/.test(n)) return true
  return POLA_BUKAN_NAMA.test(n) && /\d/.test(n.replace(new RegExp(`^(?:${LABEL_PENGENAL_KUAT}|${LABEL_PENGENAL_UMUM})`), ''))
}

/** Nama kapal: huruf besar, titik dibuang, tanda baca → spasi, awalan MV/MT/TB/… dibuang. */
export function normalisasiNamaKapal(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const token = v.toUpperCase().replace(/\./g, '').replace(/[^A-Z0-9]+/g, ' ').trim().split(' ').filter(Boolean)
  while (token.length > 1 && (AWALAN_NAMA_KAPAL as readonly string[]).includes(token[0])) token.shift()
  const s = token.join(' ')
  return s === '' ? null : s
}

/** Nama principal/customer: huruf besar, tanda baca dibuang, bentuk badan usaha (PT, CV, Tbk, …) dibuang. */
export function normalisasiNamaPihak(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const token = v
    .toUpperCase()
    .replace(/[.,]/g, '')
    .replace(/[^A-Z0-9&]+/g, ' ')
    .trim()
    .split(' ')
    .filter((t) => t && !(BENTUK_BADAN_USAHA as readonly string[]).includes(t))
  const s = token.join(' ')
  return s === '' ? null : s
}

/**
 * Nama pelabuhan: huruf besar, tanda baca → spasi, awalan "PORT OF"/"PELABUHAN"/"PEL" (singkatan "Pel.") dibuang.
 * Awalan hanya dibuang di AWAL dan sebagai TOKEN UTUH diikuti nama (sesudah tanda baca → spasi), jadi kata yang
 * sekadar diawali PEL (mis. "PELITA") tidak tersentuh.
 */
export function normalisasiNamaPort(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/^(PORT OF|PELABUHAN|PEL) /, '')
  return s === '' ? null : s
}

export function normalisasiUnlocode(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.toUpperCase().replace(/[\s-]/g, '')
  return /^[A-Z]{2}[A-Z0-9]{3}$/.test(s) ? s : null
}

/** 'YYYY-MM-DD' ketat, tahun 4 digit, tanggal kalender nyata. */
export function tanggalSah(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.toISOString().slice(0, 10) === s ? s : null
}

const hariUtc = (ymd: string): number => {
  const [y, m, d] = ymd.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / MS_HARI
}

/** Selisih hari kalender mutlak antara dua 'YYYY-MM-DD'; null bila salah satu kosong. */
export function selisihHari(a: string | null, b: string | null): number | null {
  if (!a || !b) return null
  return Math.abs(hariUtc(a) - hariUtc(b))
}

export function dalamRentangTanggal(ymd: string, hariIni: string): boolean {
  const d = hariUtc(ymd) - hariUtc(hariIni)
  return d >= -TANGGAL_MUNDUR_HARI && d <= TANGGAL_MAJU_HARI
}

// ----------------------------------------------------------------- bukti tanggal (PRD-005 E5 Step 1)
//
// Tanggal hasil AI dari masukan berteks (TEXT/CSV/WORKBOOK) hanya bertahan bila sumber
// memuat tanggal LENGKAP (dengan tahun eksplisit) di field yang BERSESUAIAN: sesudah label
// field itu di baris yang sama (atau baris berikutnya bila labelnya berdiri sendiri), atau
// di kolom tabel yang judulnya label itu. Tahun TIDAK PERNAH diterima dari tempat lain
// (tanggal surat, ETD, tahun berjalan, konteks) — lihat E15: "ETA : 13/11" + "ETD :
// 13-Nov-26" → ETA 2026-11-13 DIBUANG walau ETD kebetulan jatuh di tanggal yang sama.
// Hari lebih dulu (DD/MM). Umum untuk semua model — tak ada logika per model.

export const FIELD_TANGGAL_BERLABEL = ['eta', 'etb', 'etc', 'etd', 'requestDate'] as const
export type FieldTanggalBerlabel = (typeof FIELD_TANGGAL_BERLABEL)[number]

/** Singkatan berhuruf dengan pemisah opsional: "ETA", "E T A", "E.T.A". */
const sgk = (h: string): string => h.split('').join('[ .]?')

const LABEL_TANGGAL: Readonly<Record<FieldTanggalBerlabel, string>> = {
  eta: `${sgk('eta')}|tiba(?:nya)?|kedatangan|arriv(?:al|e|es|ing)?`,
  etb: `${sgk('etb')}|sandar|berth(?:ing|ed)?`,
  etc: `${sgk('etc')}|selesai`,
  etd: `${sgk('etd')}|berangkat|depart(?:ure|s|ing)?|sailing`,
  requestDate: 'tanggal surat|tgl\\.? surat|date(?:d)?',
}

// Tanpa lookbehind / grup bernama: modul ini ikut dibundel ke peramban (IntakeReview/IntakeList),
// dan lookbehind tak bisa ditranspilasi (Safari < 16.4 gagal mengurai seluruh bundel).
// Grup 1 = awalan (awal baris / bukan huruf-angka); grup 2.. = satu per field, urut FIELD_TANGGAL_BERLABEL.
const POLA_LABEL = new RegExp(
  `(^|[^a-z0-9])(?:${FIELD_TANGGAL_BERLABEL.map((f) => `(${LABEL_TANGGAL[f]})`).join('|')})(?![a-z0-9])`,
  'gi',
)
const labelUtuh = (f: FieldTanggalBerlabel): RegExp =>
  new RegExp(`^(?:${LABEL_TANGGAL[f]})\\.?\\s*(?:\\([^)]*\\))?\\s*:?$`, 'i')

const BULAN: Readonly<Record<string, number>> = {
  jan: 1, januari: 1, january: 1,
  feb: 2, februari: 2, pebruari: 2, february: 2,
  mar: 3, maret: 3, march: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  agu: 8, agt: 8, agus: 8, agustus: 8, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oktober: 10, oct: 10, october: 10,
  nov: 11, nopember: 11, november: 11,
  des: 12, desember: 12, dec: 12, december: 12,
}

const ymd = (y: number, m: number, d: number): string | null =>
  tanggalSah(`${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)

/**
 * Semua tanggal LENGKAP (tahun eksplisit) di satu potongan teks, sebagai 'YYYY-MM-DD'.
 * Didukung: YYYY-MM-DD (juga / .), DD/MM/YYYY, DD.MM.YYYY, DD-MM-YYYY, DD-Mon-YY, DD-Mon-YYYY,
 * DD <bulan Inggris/Indonesia> YYYY, <bulan Inggris> DD, YYYY. Tanpa tahun → tak ada hasil.
 */
export function tanggalEksplisit(potongan: string): string[] {
  const s = potongan.toLowerCase()
  const hasil = new Set<string>()
  const tambah = (v: string | null) => {
    if (v) hasil.add(v)
  }
  // Grup 1 setiap pola = awalan pengganti lookbehind (lihat POLA_LABEL).
  for (const m of Array.from(s.matchAll(/(^|\D)(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/g))) tambah(ymd(+m[2], +m[3], +m[4]))
  for (const m of Array.from(s.matchAll(/(^|\D)(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?!\d)/g))) tambah(ymd(+m[4], +m[3], +m[2]))
  // DD <bulan> YYYY  |  DD-Mon-YY(YY) — tahun 2 digit hanya dengan pemisah '-' / '/' di kedua sisi.
  for (const m of Array.from(s.matchAll(/(^|[^a-z0-9])(\d{1,2})(?:st|nd|rd|th)?([\s\-/.]+)([a-z]+)\.?([\s\-/.,]+)(\d{4}|\d{2})(?![0-9])/g))) {
    const bln = BULAN[m[4]]
    if (!bln) continue
    if (m[6].length === 2 && !(/^[-/]$/.test(m[3]) && /^[-/]$/.test(m[5]))) continue
    tambah(ymd(m[6].length === 2 ? 2000 + +m[6] : +m[6], bln, +m[2]))
  }
  for (const m of Array.from(s.matchAll(/(^|[^a-z])([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?!\d)/g))) {
    const bln = BULAN[m[2]]
    if (bln) tambah(ymd(+m[4], bln, +m[3]))
  }
  return Array.from(hasil)
}

type TemuanLabel = { field: FieldTanggalBerlabel; awal: number; akhir: number }

function labelDiBaris(baris: string): TemuanLabel[] {
  const out: TemuanLabel[] = []
  for (const m of Array.from(baris.matchAll(POLA_LABEL))) {
    const field = FIELD_TANGGAL_BERLABEL.find((_, i) => m[i + 2] !== undefined)
    const awal = (m.index ?? 0) + m[1].length
    if (field) out.push({ field, awal, akhir: (m.index ?? 0) + m[0].length })
  }
  return out
}

const hanyaPemisah = (t: string): boolean => /^[\s:=\-–—|.,;/()&]*$/.test(t)
const PEMISAH_SEL = ['|', '\t', ';', ','] as const

/**
 * Tanggal lengkap yang dibuktikan sumber UNTUK field tertentu — tak pernah dari field lain.
 * (a) Sebaris: teks sesudah label field sampai label field lain berikutnya. Label yang hanya
 *     dipisahkan tanda baca ("ETA/ETB: …") berbagi potongan sesudahnya. Bila sisa baris hanya
 *     tanda baca, potongan diambil dari baris tak-kosong berikutnya (sampai label pertamanya).
 * (b) Tabel: pada baris tanpa tanggal, sel yang isinya PERSIS label field (mis. "ETA", "ETA (LT)")
 *     menjadi judul kolom; sel di kolom yang sama pada baris-baris berikutnya (jumlah sel sama)
 *     menjadi potongannya.
 */
export function buktiTanggalDiSumber(field: FieldTanggalBerlabel, sumber: string): string[] {
  const bukti = new Set<string>()
  const ambil = (t: string) => {
    for (const v of tanggalEksplisit(t)) bukti.add(v)
  }
  const baris = sumber.replace(/\r\n?/g, '\n').split('\n')
  const utuh = labelUtuh(field)

  for (let i = 0; i < baris.length; i++) {
    const b = baris[i]

    // (b) judul kolom tabel — baris yang memuat tanggal bukan judul (mis. "ETA | 13/11/2026").
    const pemisah = PEMISAH_SEL.find((p) => b.includes(p))
    if (pemisah && tanggalEksplisit(b).length === 0) {
      const sel = b.split(pemisah).map((x) => x.trim())
      const kolom = sel.length >= 2 ? sel.findIndex((x) => utuh.test(x)) : -1
      if (kolom >= 0) {
        for (let j = i + 1; j < baris.length; j++) {
          if (!baris[j].trim()) break
          const isi = baris[j].split(pemisah).map((x) => x.trim())
          if (isi.length !== sel.length) break
          ambil(isi[kolom])
        }
        continue // baris judul tidak diperlakukan sebagai label sebaris
      }
    }

    // (a) sebaris
    const label = labelDiBaris(b)
    for (let k = 0; k < label.length; k++) {
      if (label[k].field !== field) continue
      let n = k + 1
      while (n < label.length && hanyaPemisah(b.slice(label[n - 1].akhir, label[n].awal))) n++
      const dari = label[n - 1].akhir
      const potongan = b.slice(dari, n < label.length ? label[n].awal : b.length)
      if (!hanyaPemisah(potongan)) {
        ambil(potongan)
        continue
      }
      // Label berdiri sendiri di ujung baris → nilai di baris tak-kosong berikutnya.
      const j = baris.findIndex((x, idx) => idx > i && x.trim() !== '')
      if (j < 0) continue
      const lanjut = labelDiBaris(baris[j])
      ambil(lanjut.length ? baris[j].slice(0, lanjut[0].awal) : baris[j])
    }
  }
  return Array.from(bukti)
}

// ----------------------------------------------------------------- lifecycle

const TRANSISI: Readonly<Record<StatusIntake, readonly StatusIntake[]>> = {
  NEEDS_REVIEW: ['CREATING', 'REJECTED', 'LINKED_EXISTING'],
  CREATING: ['COMPLETED', 'FAILED'],
  FAILED: ['CREATING', 'REJECTED', 'COMPLETED'],
  COMPLETED: [],
  LINKED_EXISTING: [],
  REJECTED: [],
}

export function transisiSah(dari: string, ke: string): boolean {
  const boleh = (TRANSISI as Record<string, readonly string[]>)[dari]
  return !!boleh && boleh.includes(ke)
}

export const statusTerminal = (s: string): boolean => (STATUS_TERMINAL as readonly string[]).includes(s)

/** Rekonsiliasi klaim CREATING yang terputus. null = tak perlu tindakan. */
export function keputusanRekonsiliasi(
  intake: { status: string; claimedAt: Date | null },
  voyageAda: boolean,
  sekarang: Date,
): 'COMPLETED' | 'FAILED' | null {
  if (intake.status !== 'CREATING') return null
  if (voyageAda) return 'COMPLETED'
  const umur = intake.claimedAt ? sekarang.getTime() - intake.claimedAt.getTime() : Infinity
  return umur > BATAS_KLAIM_MENIT * 60_000 ? 'FAILED' : null
}

// ----------------------------------------------------------------- ekstraksi

export type KonteksValidasi = {
  inputKind: JenisInput
  /** Teks sumber (teks/CSV/Excel diratakan). null untuk PDF/gambar. */
  sourceText: string | null
  /** Hari bisnis 'YYYY-MM-DD'. */
  hariIni: string
  norm: NormalisasiKapal
}

export type HasilValidasi = { classification: Klasifikasi; proposal: Proposal }

/**
 * Keluaran AI → usulan yang aman. Nilai yang tak lolos DIBUANG (bukan dikoreksi),
 * dan klasifikasi AI tak pernah bisa menaikkan permintaan tak lengkap menjadi NEW_*.
 * Kunci yang tak dikenal (mis. angka uang) diabaikan begitu saja.
 */
export function validasiEkstraksi(raw: unknown, k: KonteksValidasi): HasilValidasi {
  const o = isObj(raw) ? raw : {}
  const berteks = (INPUT_BERTEKS as readonly string[]).includes(k.inputKind) && !!k.sourceText
  const sumberKompak = berteks ? kompak(k.sourceText ?? '') : ''
  const sumberOcr = berteks ? lipatOcr(sumberKompak) : ''
  // P0-1: bentuk bukti KHUSUS identitas kapal — token terselubung ditandai, bukan dibuang diam-diam.
  const sumberKapal = berteks ? kompakBerselubung(k.sourceText ?? '') : ''
  const sumberKapalOcr = berteks ? lipatOcr(sumberKapal) : ''

  /**
   * Identitas & nama: harus tertulis di sumber (teks) atau ditandai belum terverifikasi (PDF/gambar).
   * Teks: uji harfiah DULU; hanya bila gagal, uji lipatan OCR → nilai dipertahankan dengan
   * OCR_CORRECTED (kecocokan master darinya wajib dikonfirmasi — lihat cocokkanSemua).
   * `ocrBoleh` = syarat tambahan deterministik untuk jalur OCR (mis. check digit IMO).
   */
  const identitas = (nilai: string | null, pembanding = nilai, ocrBoleh = true): FieldUsulan => {
    if (!nilai) return fieldKosong()
    if (berteks) {
      const cari = pembanding ?? nilai
      if (adaDiSumber(cari, sumberKompak)) return fieldDokumen(nilai)
      if (ocrBoleh && adaDiSumberOcr(cari, sumberOcr)) return fieldDokumen(nilai, ['OCR_CORRECTED'])
      return fieldKosong(nilai, ['NOT_IN_SOURCE'])
    }
    return fieldDokumen(nilai, ['UNVERIFIED_SOURCE'])
  }
  /**
   * Identitas KAPAL (nama/IMO/MMSI/call sign): nilai terselubung ditolak (ILLEGIBLE_VALUE), dan bukti
   * sumber tak boleh bersentuhan dengan token terselubung. Selebihnya sama dengan `identitas`.
   */
  const identitasKapal = (nilai: string | null, ocrBoleh = true): FieldUsulan => {
    if (!nilai) return fieldKosong()
    if (nilaiTerselubung(nilai)) return fieldKosong(nilai, ['ILLEGIBLE_VALUE'])
    if (berteks) {
      const kk = kompak(nilai)
      if (adaTanpaSelubung(kk, sumberKapal)) return fieldDokumen(nilai)
      const ko = lipatOcr(kk)
      if (ocrBoleh && ko.length >= MIN_PANJANG_OCR && adaTanpaSelubung(ko, sumberKapalOcr)) return fieldDokumen(nilai, ['OCR_CORRECTED'])
      // Tertulis di sumber, tetapi hanya bersentuhan dengan token terselubung → tak terbaca, bukan "tidak tertulis".
      if (sumberKompak.includes(kk) || (ocrBoleh && ko.length >= MIN_PANJANG_OCR && sumberOcr.includes(ko))) return fieldKosong(nilai, ['ILLEGIBLE_VALUE'])
      return fieldKosong(nilai, ['NOT_IN_SOURCE'])
    }
    return fieldDokumen(nilai, ['UNVERIFIED_SOURCE'])
  }
  const biasa = (nilai: string | null): FieldUsulan => (nilai ? fieldDokumen(nilai) : fieldKosong())
  /** Tanggal: format + rentang (tetap), lalu untuk masukan berteks WAJIB berbukti di field-nya sendiri. */
  const tanggal = (v: unknown, field: FieldTanggalBerlabel): FieldUsulan => {
    const mentah = teks(v, 40)
    if (!mentah) return fieldKosong()
    const t = tanggalSah(mentah)
    if (!t || !dalamRentangTanggal(t, k.hariIni)) return fieldKosong(mentah, ['DATE_OUT_OF_RANGE'])
    if (berteks && !buktiTanggalDiSumber(field, k.sourceText ?? '').includes(t)) return fieldKosong(mentah, ['DATE_NOT_IN_SOURCE'])
    return fieldDokumen(t)
  }
  const pilih = <T extends string>(v: unknown, daftar: readonly T[]): FieldUsulan<T> => {
    const t = teks(v, 40)?.toUpperCase() ?? null
    return t && (daftar as readonly string[]).includes(t) ? fieldDokumen(t as T) : fieldKosong<T>()
  }

  const kapalMentah = Array.isArray(o.vessels) ? o.vessels : []
  const vessels: KapalUsulan[] = []
  let vesselsDropped = 0
  for (const kv of kapalMentah.slice(0, MAKS_KAPAL_INTAKE)) {
    const v = isObj(kv) ? kv : {}
    const imoMentah = teks(v.imo, 40)
    const imo = imoMentah ? k.norm.imo(imoMentah) : null
    // P0-3: IMO wajib tepat 7 digit (terselubung → ILLEGIBLE_VALUE; bentuk lain → IMO_FORMAT_INVALID).
    // Jalur OCR tak pernah melewati validasi IMO: IMO yang hanya cocok lewat lipatan wajib lolos check digit.
    let imoField = !imo
      ? fieldKosong()
      : nilaiTerselubung(imo)
        ? fieldKosong(imo, ['ILLEGIBLE_VALUE'])
        : !/^\d{7}$/.test(imo)
          ? fieldKosong(imo, ['IMO_FORMAT_INVALID'])
          : identitasKapal(imo, k.norm.imoSah(imo))
    // K2 tetap: check digit salah → nilai DIPERTAHANKAN + ditandai (tidak dihitung syarat minimum).
    if (imo && imoField.value && !k.norm.imoSah(imo)) imoField = { ...imoField, flags: [...imoField.flags, 'IMO_CHECK_DIGIT'] }
    const mmsiMentah = teks(v.mmsi, 40)
    const mmsi = mmsiMentah ? k.norm.mmsi(mmsiMentah) : null
    const mmsiField =
      mmsiMentah && nilaiTerselubung(mmsiMentah)
        ? fieldKosong(mmsiMentah, ['ILLEGIBLE_VALUE'])
        : mmsi && k.norm.mmsiSah(mmsi)
          ? identitasKapal(mmsi)
          : mmsiMentah
            ? fieldKosong(mmsiMentah)
            : fieldKosong()
    const csMentah = teks(v.callSign, 40)
    const cs = csMentah && nilaiTerselubung(csMentah) ? null : k.norm.callSign(csMentah)
    const namaMentah = teks(v.name)
    // P0-2: label pengenal non-kapal + nomor / hanya angka → bukan nama kapal (apa pun jenis masukannya).
    const nameField = namaMentah && !nilaiTerselubung(namaMentah) && bukanNamaKapal(namaMentah) ? fieldKosong(namaMentah, ['NOT_A_VESSEL_NAME']) : identitasKapal(namaMentah)
    const kapal: KapalUsulan = {
      name: nameField,
      imo: imoField,
      mmsi: mmsiField,
      callSign: csMentah && !cs ? fieldKosong(csMentah, ['ILLEGIBLE_VALUE']) : identitasKapal(cs),
      vesselType: biasa(teks(v.vesselType, 80)),
      role: pilih(v.role, PERAN_KAPAL),
      excluded: false,
    }
    if (kapal.name.value || kapal.imo.value || kapal.mmsi.value || kapal.callSign.value) vessels.push(kapal)
    // Entri yang MEMBAWA identitas dari AI tapi semuanya ditolak → dibuang (F2 tetap tertutup), dihitung saja.
    else if (kapal.name.extracted || kapal.imo.extracted || kapal.mmsi.extracted || kapal.callSign.extracted) vesselsDropped++
  }

  const unlocode = normalisasiUnlocode(teks(o.portUnlocode, 20))
  const portName = identitas(teks(o.portName))
  const portUnlocode = identitas(unlocode)

  const cargoMentah = Array.isArray(o.cargoes) ? o.cargoes : []
  const cargoes: CargoUsulan[] = []
  let cargoesDropped = 0
  const buktiMuatan = berteks ? buktiMuatanDari(k.sourceText ?? '') : null
  const usulanMuatan: UsulanMuatan[] = []
  for (const c of cargoMentah.slice(0, MAKS_CARGO_INTAKE)) {
    const v = isObj(c) ? c : {}
    const name = teks(v.name)
    if (!name) continue
    usulanMuatan.push({ name, quantity: angkaTakNegatif(v.quantity), unit: teks(v.unit, 20), operation: pilih(v.operation, OPERASI_CARGO).value })
  }
  for (const baris of validasiMuatanV3(usulanMuatan, buktiMuatan, { portName: portName.value, portUnlocode: portUnlocode.value })) {
    if (baris) cargoes.push(baris)
    else cargoesDropped++
  }

  const kontak = isObj(o.contact) ? o.contact : null
  const contact: KontakUsulan | null = kontak
    ? { name: teks(kontak.name), email: teks(kontak.email), phone: teks(kontak.phone, 40) }
    : null

  const proposal: Proposal = {
    vessels,
    principalName: identitas(teks(o.principalName)),
    customerName: identitas(teks(o.customerName)),
    portName,
    portUnlocode,
    jetty: biasa(teks(o.jetty)),
    eta: tanggal(o.eta, 'eta'),
    etb: tanggal(o.etb, 'etb'),
    etc: tanggal(o.etc, 'etc'),
    etd: tanggal(o.etd, 'etd'),
    agencyType: pilih(o.agencyType, JENIS_KEAGENAN),
    clientReference: biasa(teks(o.clientReference)),
    requestDate: tanggal(o.requestDate, 'requestDate'),
    cargoes,
    contact: contact && (contact.name || contact.email || contact.phone) ? contact : null,
    classificationReason: null,
    vesselsDropped,
    cargoesDropped,
  }

  let classification: Klasifikasi = (KLASIFIKASI as readonly string[]).includes(o.classification as string)
    ? (o.classification as Klasifikasi)
    : 'INSUFFICIENT_INFORMATION'
  if (!(KLASIFIKASI as readonly string[]).includes(o.classification as string)) {
    proposal.classificationReason = 'CLASSIFICATION_INVALID'
  }
  if (kapalMentah.length > MAKS_KAPAL_INTAKE) {
    classification = 'UNSUPPORTED_REQUEST'
    proposal.classificationReason = 'TOO_MANY_VESSELS'
  } else if ((KLASIFIKASI_PILOT as readonly string[]).includes(classification) && !syaratMinimumTerpenuhi(proposal)) {
    classification = 'INSUFFICIENT_INFORMATION'
    proposal.classificationReason = 'MINIMUM_FIELDS_MISSING'
  }
  return { classification, proposal }
}

function angkaTakNegatif(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : null
  if (typeof v !== 'string') return null
  // Pola cleanNumeric (extract-target.ts): "5,000" = ribuan, "12,5" = desimal.
  let s = v.replace(/[^\d.,-]/g, '')
  if (!s) return null
  if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '')
  else if (s.includes(',')) s = /,\d{3}(?:\D|$)/.test(s) ? s.replace(/,/g, '') : s.replace(/,/g, '.')
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : null
}

// ----------------------------------------------------------------- grounding muatan V3 (SPEC:V3)
//
// Spesifikasi beku: docs/PRD-005-VALIDATOR-V3.md. Validator MEMVERIFIKASI fakta usulan model terhadap bukti sumber;
// ia TIDAK menemukan ulang fakta muatan lewat daftar-putih inklusi (satuan/operasi). Leksikon v3 hanya memuat kelas
// TERTUTUP (famili morfologi, pengecualian, satuan terlarang, penanda lampau/perkiraan/zona/koreksi).
//
//   §3  tokenizer ber-rentang: kata / angka / simbol; anggota KOMPOSIT ("H-beam", "PO-4518") bukan label mandiri.
//   §6  peta zona: TOP | QUOTED | SIG. SIG tak pernah mengikat; QUOTED tak pernah tepercaya.
//   §4  jumlah+satuan: verifikasi PASANGAN usulan (angka Q tepat + satuan U harfiah bersebelahan) di jendela ikat
//       barisnya sendiri, lolos mesin pengecualian (label, uang, tarif, telepon, referensi, dimensi, persen, tanggal).
//       Satuan disimpan dengan EJAAN SUMBER (D1); satuan tak dikenal tapi berbentuk sah & tertulis tidak otomatis
//       tidak sah (D4). Penanda perkiraan (±, approx, sekitar, rentang, toleransi) → APPROXIMATE_QUANTITY.
//   §5  operasi: famili morfologi tertutup → item bukti {famili, kuat/lemah, lampau, zona} → T1 (tepercaya bila KUAT,
//       baris/blok muatan) / T2 (kalimat; review) / T3 (dokumen; review, syarat D2). Lampau-saja → null (D7).
//   §6.3 koreksi: pola penggantian eksplisit; selain itu null + review.

/** Kata umum yang BUKAN komoditas — baris bernama ini dibuang (bukan fakta muatan). */
export const NAMA_MUATAN_UMUM: readonly string[] = NAMA_MUATAN_UMUM_V3

/** Token kata utuh (sama dengan leksikon): huruf besar A-Z0-9 ("m³" → "M3"). */
export const tokenMuatan = tokenLeksikon
function indeksUrutan(cari: readonly string[], sumber: readonly string[]): number {
  if (cari.length === 0) return -1
  for (let i = 0; i + cari.length <= sumber.length; i++) if (cari.every((t, j) => sumber[i + j] === t)) return i
  return -1
}
const adaUrutanToken = (cari: readonly string[], sumber: readonly string[]): boolean => indeksUrutan(cari, sumber) >= 0
const urutanDi = (daftar: readonly string[], sumber: readonly string[]) => daftar.some((d) => adaUrutanToken(d.split(' '), sumber))
const berakhirDengan = (daftar: readonly string[], t: readonly string[]) =>
  daftar.some((d) => {
    const x = d.split(' ')
    return x.length <= t.length && x.every((w, i) => t[t.length - x.length + i] === w)
  })

/**
 * Nilai SATU token angka dari dokumen sumber — aturan tetap, satu tafsiran per token:
 *   • tanpa pemisah → apa adanya ("5000");
 *   • dua jenis pemisah → yang TERAKHIR desimal ("1,234.5" / "1.234,5");
 *   • satu jenis pemisah, tiap grup sesudahnya TEPAT 3 digit → RIBUAN ("5,000" / "5.000" / "12.500.000");
 *   • satu pemisah dengan bukan-3 digit sesudahnya → desimal ("12,5" / "12.5").
 * Tafsiran lain dari token yang sama TIDAK pernah dicoba: model yang membaca "5.000" sebagai 5 tidak
 * berbukti → jumlahnya dikosongkan (gagal-tertutup), bukan ditebak.
 */
export function nilaiAngkaSumber(tok: string): number | null {
  if (!/^\d+(?:[.,]\d+)*$/.test(tok)) return null
  const titik = tok.includes('.')
  const koma = tok.includes(',')
  let s: string
  if (titik && koma) {
    const desimal = tok.lastIndexOf('.') > tok.lastIndexOf(',') ? '.' : ','
    const ribu = desimal === '.' ? ',' : '.'
    const [utuh, pecahan, ...lebih] = tok.split(ribu).join('').split(desimal)
    if (lebih.length) return null
    s = `${utuh}.${pecahan}`
  } else if (!titik && !koma) {
    s = tok
  } else {
    const bagian = tok.split(titik ? '.' : ',')
    if (bagian.slice(1).every((b) => b.length === 3)) s = bagian.join('')
    else if (bagian.length === 2) s = bagian.join('.')
    else return null
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

const POLA_BULAN = 'JAN|FEB|MAR|APR|MAY|MEI|JUN|JUL|AUG|AGU|AGT|SEP|OCT|OKT|NOV|DEC|DES'
const POLA_TANGGAL_SUMBER = [
  /\b\d{1,4}[/.-]\d{1,2}[/.-]\d{2,4}\b/g,
  new RegExp(`\\b\\d{1,2}[\\s-]+(?:${POLA_BULAN})[A-Z]*\\.?[\\s-]+\\d{2,4}\\b`, 'gi'),
  new RegExp(`\\b(?:${POLA_BULAN})[A-Z]*\\.?\\s+\\d{1,2},?\\s+\\d{4}\\b`, 'gi'),
  /\b\d{1,2}:\d{2}\b/g,
]
/** Token angka kandidat OCR; O/o/I/l hanya sebagai salah-baca OCR (≥ 2 digit asli, satuan terverifikasi — D8). */
const POLA_TOKEN_ANGKA_OCR = /(^|[^A-Za-z0-9.,])([0-9OoIl](?:[0-9OoIl]|[.,](?=[0-9OoIl]))*)(?![A-Za-z0-9])/g
const LIPATAN_OCR_ANGKA: Readonly<Record<string, string>> = { O: '0', o: '0', I: '1', l: '1' }
const MIN_DIGIT_ASLI_OCR = 2

/**
 * Angka di posisi [awal, akhir) bagian dari rangkaian nomor telepon? Rangkaian = karakter [0-9 ()+-] yang
 * bersambung dengan angka itu; telepon bila diawali "+" / "0" / "(0" dan memuat ≥ 8 digit. Rentang jumlah
 * ("5000-6000 MT") tidak cocok (tak diawali + / 0).
 */
function fragmenTelepon(x: string, awal: number, akhir: number): boolean {
  let a = awal
  while (a > 0 && /[0-9()+\- ]/.test(x[a - 1])) a--
  let b = akhir
  while (b < x.length && /[0-9()+\- ]/.test(x[b])) b++
  const rantai = x.slice(a, b).trim()
  return /^(?:\+|\(?0)/.test(rantai) && (rantai.match(/[0-9]/g) ?? []).length >= 8
}

// ------------------------------------------------------------ §3 tokenizer ber-rentang
type Tok = { t: string; u: string; s: number; e: number; k: 'W' | 'N' | 'S' }
/** Huruf besar per karakter (panjang tetap), "³"→"3", "²"→"2". */
const besar = (s: string): string =>
  s.replace(/[^]/g, (c) => {
    if (c === '³') return '3'
    if (c === '²') return '2'
    const u = c.toUpperCase()
    return u.length === 1 ? u : c
  })
const POLA_TOKEN = /(\d+(?:[.,]\d+)*)|([A-Za-zÀ-ɏ³²]+)|(\S)/g
function tokenisasi(x: string): Tok[] {
  const hasil: Tok[] = []
  const pola = new RegExp(POLA_TOKEN.source, 'g')
  for (let m = pola.exec(x); m; m = pola.exec(x)) {
    const t = m[0]
    hasil.push({ t, u: besar(t), s: m.index, e: m.index + t.length, k: m[1] !== undefined ? 'N' : m[2] !== undefined ? 'W' : 'S' })
  }
  return hasil
}
const alnum = (t: Tok | undefined): boolean => !!t && (t.k === 'W' || t.k === 'N')
const nempel = (a: Tok | undefined, b: Tok | undefined): boolean => !!a && !!b && a.e === b.s
/** §3.2 anggota komposit: bersambung lewat '-' / '/' ke token alfanumerik (H-BEAM, PO-4518, LOAD/DISCHARGE). */
function anggotaKomposit(tok: readonly Tok[], i: number): boolean {
  const ki = tok[i - 1]
  const ka = tok[i + 1]
  const kiri = ki?.k === 'S' && ['-', '/'].includes(ki.t) && nempel(ki, tok[i]) && alnum(tok[i - 2]) && nempel(tok[i - 2], ki)
  const kanan = ka?.k === 'S' && ['-', '/'].includes(ka.t) && nempel(tok[i], ka) && alnum(tok[i + 2]) && nempel(ka, tok[i + 2])
  return kiri || kanan
}
/** Urutan kata (token W/N, simbol diabaikan) cocok berakhir tepat di indeks kata `akhir`. */
const kataSaja = (tok: readonly Tok[]): Tok[] => tok.filter((x) => x.k !== 'S')
const normSatuan = (s: string): string => besar(s).replace(/\s+/g, ' ').replace(/\.+$/, '').trim()
const semuaTerlarang = new Set<string>(Object.values(SATUAN_TERLARANG).flat())
const bentukOperasiSemua = new Set(Object.values(FAMILI_OPERASI).flatMap((f) => [...f.kuat, ...f.lemah, ...f.lampau]))
/** ADDENDUM-1 AM3: kelas struktural tertutup yang boleh ada di segmen bebas-nama. */
const KATA_STRUKTUR = new Set<string>(
  ([] as string[]).concat(
    LABEL_BARIS_MUATAN, LABEL_JUMLAH, LABEL_OPERASI.flatMap((x) => x.split(' ')), Array.from(bentukOperasiSemua), BUKAN_BUKTI_OPERASI,
    SATUAN_TERLARANG.kataFungsi, PENANDA_PERKIRAAN_KATA.flatMap((x) => x.split(' ')), PENANDA_TOLERANSI, PENANDA_MASA_DEPAN,
    PENANDA_LAMPAU.flatMap((x) => x.split(' ')), ['TO', 'SAMPAI', 'HINGGA', 'S', 'D'], KATA_STRUKTURAL,
  ),
)
const satuanTerlarang = (bagian: string): boolean => {
  const b = normSatuan(bagian)
  return semuaTerlarang.has(b) || bentukOperasiSemua.has(b) || MATA_UANG.includes(b) || KATA_UANG.includes(b) || LABEL_BUKAN_JUMLAH.includes(b)
}

// ------------------------------------------------------------ §6.1 peta zona
type Zona = 'TOP' | 'QUOTED' | 'SIG'
const POLA_BATAS_KUTIPAN = [/^\s*-{2,}\s*(?:original message|forwarded message|pesan asli|pesan terusan)/i, /^\s*(?:on|pada)\b.{3,200}\b(?:wrote|menulis)\s*:\s*$/i]
const salamPenutup = (baris: string): boolean => {
  const n = baris.toUpperCase().replace(/[^A-Z]+/g, ' ').trim()
  return n.length > 0 && SALAM_PENUTUP.includes(n)
}
function petaZona(fisik: readonly string[]): Zona[] {
  const zona: Zona[] = []
  let kutip = false
  let sig = false
  for (let i = 0; i < fisik.length; i++) {
    const l = fisik[i]
    const batasDari = /^\s*(?:from|dari)\s*:/i.test(l) && fisik.slice(i + 1, i + 5).some((x) => /^\s*(?:sent|date|tanggal|dikirim|to|kepada)\s*:/i.test(x))
    if (POLA_BATAS_KUTIPAN.some((p) => p.test(l)) || batasDari) {
      kutip = true
      sig = false
      zona.push('QUOTED')
      continue
    }
    if (/^\s*>/.test(l)) {
      zona.push('QUOTED')
      continue
    }
    if (/^\s*--\s*$/.test(l) || salamPenutup(l)) sig = true
    zona.push(sig ? 'SIG' : kutip ? 'QUOTED' : 'TOP')
  }
  return zona
}

// ------------------------------------------------------------ §5.1 struktur
type Logis = { teks: string; zona: Zona; tok: Tok[]; kosong: boolean }
const POLA_DAFTAR = /^\s*(?:[•\-*·]|[a-z]\.|\d+\.|\(\w{1,3}\))\s+/i
const POLA_LABEL_BARIS = /^\s*([A-Za-z][A-Za-z0-9 .\/()&-]{0,30}?)\s*:/
function barisLogis(fisik: readonly string[], zona: readonly Zona[]): Logis[] {
  const hasil: Logis[] = []
  for (let i = 0; i < fisik.length; i++) {
    const a = fisik[i]
    const b = fisik[i + 1]
    const sambung =
      b !== undefined && a.trim() !== '' && b.trim() !== '' && zona[i] === zona[i + 1] && !/[.:;!?]\s*$/.test(a) &&
      !POLA_DAFTAR.test(b) && !/^\s*>/.test(b) && !POLA_LABEL_BARIS.test(b) && (/^\s*[a-z]/.test(b) || /\d\s*$/.test(a) || /-\s*$/.test(a))
    const teks = sambung ? `${a.replace(/\s+$/, '')} ${b.replace(/^\s+/, '')}` : a
    hasil.push({ teks, zona: zona[i], tok: tokenisasi(teks), kosong: teks.trim() === '' })
    if (sambung) i++
  }
  return hasil
}
const kataAwal = (l: Logis): string[] => kataSaja(l.tok).slice(0, 2).map((x) => x.u)
const berlabelDi = (l: Logis, daftar: readonly string[]): boolean => {
  const w = kataAwal(l)
  return daftar.some((d) => {
    const x = d.split(' ')
    return x.every((v, i) => w[i] === v)
  })
}
/** Blok muatan (§5.1): indeks kepala → indeks baris item (termasuk kepala). */
function blokMuatan(ls: readonly Logis[]): number[][] {
  const blok: number[][] = []
  for (let i = 0; i < ls.length; i++) {
    const l = ls[i]
    if (l.kosong || !berlabelDi(l, KEPALA_BLOK_MUATAN) || !/:/.test(l.teks)) continue
    const isi = [i]
    for (let j = i + 1; j < ls.length; j++) {
      const x = ls[j]
      if (x.kosong || x.zona !== l.zona) break
      if (!(POLA_DAFTAR.test(x.teks) || /^\s{2,}\S/.test(x.teks))) break
      isi.push(j)
    }
    blok.push(isi)
  }
  return blok
}
/** Grup label (§5.1): baris "Label: nilai" berurutan → id grup per baris logis (-1 = bukan). */
function grupLabel(ls: readonly Logis[]): number[] {
  const id: number[] = []
  let g = -1
  let aktif = false
  for (const l of ls) {
    if (!l.kosong && POLA_LABEL_BARIS.test(l.teks) && !POLA_DAFTAR.test(l.teks)) {
      if (!aktif) g++
      aktif = true
      id.push(g)
    } else {
      aktif = false
      id.push(-1)
    }
  }
  return id
}
const labelOperasi = (l: Logis): boolean => {
  const m = POLA_LABEL_BARIS.exec(l.teks)
  return !!m && LABEL_OPERASI.includes(tokenLeksikon(m[1]).join(' '))
}
/** Segmen (§5.1): id segmen per indeks token. */
function segmenToken(tok: readonly Tok[]): number[] {
  const id: number[] = []
  let s = 0
  tok.forEach((x, i) => {
    const pemisah =
      (x.k === 'S' && (x.t === ';' || x.t === '&' || (x.t === '+' && !['/', '-'].includes(tok[i + 1]?.t ?? '')) || (x.t === ',' && !nempel(x, tok[i + 1])))) ||
      (x.k === 'W' && ['AND', 'DAN', 'SERTA'].includes(x.u))
    if (pemisah) s++
    id.push(s)
    if (pemisah) s++
  })
  return id
}
/** Klausa (§5.1): id klausa per indeks token (pemisah . ; ? !). */
function klausaToken(tok: readonly Tok[]): number[] {
  const id: number[] = []
  let c = 0
  for (const x of tok) {
    id.push(c)
    if (x.k === 'S' && ['.', ';', '?', '!'].includes(x.t)) c++
  }
  return id
}

// ------------------------------------------------------------ penyebutan nama muatan
type Rentang = [number, number]
function polaNama(tNama: readonly string[]): RegExp | null {
  if (!tNama.length) return null
  const isi = tNama.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^A-Z0-9]+')
  return new RegExp(`(^|[^A-Z0-9])(${isi})(?![A-Z0-9])`, 'g')
}
function sebutan(teks: string, tNama: readonly string[], ocr: boolean): Rentang[] {
  const p = polaNama(ocr ? tNama.map(lipatOcr) : tNama)
  if (!p) return []
  const x = ocr ? lipatOcr(besar(teks)) : besar(teks)
  const hasil: Rentang[] = []
  for (let m = p.exec(x); m; m = p.exec(x)) {
    const a = m.index + m[1].length
    hasil.push([a, a + m[2].length])
    p.lastIndex = a + 1
  }
  return hasil
}

// ------------------------------------------------------------ §5.2 item bukti operasi
type ItemOperasi = { f: 'LOAD' | 'DISCHARGE'; kuat: boolean; lampau: boolean; i: number }
const FRASA_BUKAN_OP = FRASA_BUKAN_OPERASI.map((f) => f.split(' '))
const PENANDA_LAMPAU_T = PENANDA_LAMPAU.map((f) => f.split(' '))
const PENANDA_MUATAN_LAIN_T = PENANDA_MUATAN_LAIN.map((f) => f.split(' '))
function itemOperasi(l: Logis): ItemOperasi[] {
  const u = l.tok.map((x) => x.u)
  const buang = new Set<number>()
  for (const f of FRASA_BUKAN_OP)
    for (let i = 0; i + f.length <= u.length; i++) if (f.every((w, j) => u[i + j] === w)) for (let j = 0; j < f.length; j++) buang.add(i + j)
  const kl = klausaToken(l.tok)
  const lampauKlausa = new Map<number, boolean>()
  const lampau = (c: number): boolean => {
    if (!lampauKlausa.has(c)) {
      const w = l.tok.filter((x, i) => kl[i] === c && x.k === 'W').map((x) => x.u)
      lampauKlausa.set(c, PENANDA_LAMPAU_T.some((p) => adaUrutanToken(p, w)))
    }
    return lampauKlausa.get(c) as boolean
  }
  const hasil: ItemOperasi[] = []
  l.tok.forEach((x, i) => {
    if (x.k !== 'W' || buang.has(i) || BUKAN_BUKTI_OPERASI.includes(x.u) || anggotaKomposit(l.tok, i)) return
    for (const f of ['LOAD', 'DISCHARGE'] as const) {
      const b = FAMILI_OPERASI[f]
      let kuat: boolean
      let lp = false
      if (b.kuat.includes(x.u)) kuat = true
      else if (b.lemah.includes(x.u)) {
        const sebelum = l.tok.slice(0, i).filter((y) => y.k === 'W').slice(-2).map((y) => y.u)
        kuat = sebelum.some((w) => PENANDA_MASA_DEPAN.includes(w))
      } else if (b.lampau.includes(x.u)) {
        kuat = false
        lp = true
      } else continue
      hasil.push({ f, kuat, lampau: lp || lampau(kl[i]), i })
    }
  })
  return hasil
}

// ------------------------------------------------------------ §4 okurensi angka
type Okurensi = {
  nilai: number
  l: number
  s: number
  e: number
  perkiraan: boolean
  ocr: boolean
  /** satuan model cocok: LITERAL (ejaan sumber) / LEGACY (alias v2 beku) / null */
  cocok: 'LITERAL' | 'LEGACY' | null
  ejaan: string | null
  /** bukti jumlah (ADDENDUM-1 AM1): pasangan usulan model, label jumlah, atau satuan alias v2 beku */
  terverifikasi: boolean
  /** rentang frasa satuan di teks baris logis (untuk uji segmen bebas-nama AM3) */
  satuanS: number
  satuanE: number
}
type HasilOkurensi = { ok: Okurensi | null; tolak: string | null }
const PEMISAH_LABEL = [':', '=', '#', '.', '(', ')', '-']
const LABEL_BUKAN_JUMLAH_T = LABEL_BUKAN_JUMLAH.map((x) => x.split(' '))
const grupWarisan = (s: string): string | null => {
  const n = normSatuan(s)
  for (const [g, a] of Object.entries(ALIAS_SATUAN_WARISAN)) if (a.includes(n)) return g
  return null
}
const bentukSatuanSah = (u: string): boolean =>
  u.length <= 20 && /^[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ0-9³².]*(?: [A-Za-zÀ-ɏ][A-Za-zÀ-ɏ0-9³².]*){0,2}$/.test(u.trim()) && !u.trim().split(' ').some(satuanTerlarang)
/** Awalan teks sumber `sisa` sama dengan satuan `u` (huruf besar, ³→3, spasi dirapatkan) + batas → ejaan sumber, atau null. */
function awalanSatuan(sisa: string, u: string): string | null {
  const target = normSatuan(u)
  if (!target) return null
  let n = ''
  let i = 0
  let spasi = false
  while (i < sisa.length && n.length < target.length) {
    const c = sisa[i]
    if (/\s/.test(c)) {
      if (!spasi && n.length) n += ' '
      spasi = true
    } else {
      n += besar(c)
      spasi = false
    }
    i++
  }
  if (n !== target) return null
  if (i < sisa.length && /[A-Za-z0-9À-ɏ³²]/.test(sisa[i])) return null
  return sisa.slice(0, i)
}
function cekOkurensi(ls: readonly Logis[], li: number, s: number, e: number, nilai: number, ocr: boolean, U: string | null, namaRentang: readonly Rentang[]): HasilOkurensi {
  const l = ls[li]
  const x = l.teks
  const tok = l.tok
  const tolak = (r: string): HasilOkurensi => ({ ok: null, tolak: r })
  if (l.zona === 'SIG') return tolak('EXCL_ZONE_SIG')
  for (const p of POLA_TANGGAL_SUMBER) {
    const r = new RegExp(p.source, p.flags)
    for (let m = r.exec(x); m; m = r.exec(x)) if (s >= m.index && e <= m.index + m[0].length) return tolak('EXCL_DATE')
  }
  const iSeb = tok.map((t, i) => (t.e <= s ? i : -1)).filter((i) => i >= 0).pop() ?? -1
  const iSes = tok.findIndex((t) => t.s >= e)
  const seb = iSeb >= 0 ? tok[iSeb] : undefined
  const ses = iSes >= 0 ? tok[iSes] : undefined
  // §3.3 referensi: angka menempel di kiri ke huruf, atau lewat - / . # ke alfanumerik (kecuali rentang angka-angka)
  let rentangKedua = false
  if (seb && seb.e === s) {
    if (seb.k === 'W') return tolak('EXCL_REF')
    if (seb.k === 'S' && ['-', '/', '.', '#', '–'].includes(seb.t) && alnum(tok[iSeb - 1]) && nempel(tok[iSeb - 1], seb)) {
      const kiri = tok[iSeb - 1]
      // rantai yang menempel ke kiri memuat huruf → referensi ("PO-4518-2207"); hanya angka → rentang ("5000-6000")
      let kiriRef = kiri.k === 'W'
      for (let r = iSeb - 1; r > 0 && nempel(tok[r - 1], tok[r]); r--) if (tok[r - 1].k === 'W') kiriRef = true
      const q1 = kiri.k === 'N' ? nilaiAngkaSumber(kiri.t) : null
      if (['-', '–'].includes(seb.t) && kiri.k === 'N' && !kiriRef && q1 !== null && q1 < nilai && nilai <= 2 * q1) rentangKedua = true
      else return tolak('EXCL_REF')
    }
  }
  // §4.4 label tepat sebelum (melewati pemisah label), MANDIRI & di luar rentang nama muatan
  let j = iSeb
  while (j >= 0 && tok[j].k === 'S' && PEMISAH_LABEL.includes(tok[j].t)) j--
  if (j >= 0 && tok[j].k === 'W') {
    const kata = tok.slice(0, j + 1)
    for (const lab of LABEL_BUKAN_JUMLAH_T) {
      if (lab.length > j + 1) continue
      const potong = kata.slice(kata.length - lab.length)
      if (!lab.every((w, k) => potong[k].u === w && potong[k].k === 'W')) continue
      const iAwal = j - lab.length + 1
      const komposit = potong.some((_, k) => anggotaKomposit(tok, iAwal + k))
      const dalamNama = namaRentang.some(([a, b]) => tok[iAwal].s >= a && tok[j].e <= b)
      if (!komposit && !dalamNama) return tolak('EXCL_LABEL')
    }
  }
  if (fragmenTelepon(x, s, e)) return tolak('EXCL_PHONE')
  // uang: mata uang / kata tarif di klausa sebelum, '$', atau sesudah angka
  const sebelum = x.slice(0, s)
  const klausa = tokenLeksikon(sebelum.split(/[;()|\t\n]|,\s/).pop() ?? '')
  if (/\$\s*$/.test(sebelum) || urutanDi(MATA_UANG, klausa) || urutanDi(KATA_UANG, klausa)) return tolak('EXCL_MONEY')
  const tSesudah = tokenLeksikon(x.slice(e))
  if (tSesudah.length && (urutanDi(MATA_UANG, tSesudah.slice(0, 1)) || urutanDi(KATA_UANG, tSesudah.slice(0, 2)))) return tolak('EXCL_MONEY')
  // tarif sebelum angka: '@' / PER / EACH / SETIAP / TIAP
  if (seb && ((seb.k === 'S' && seb.t === '@') || (seb.k === 'W' && PENANDA_TARIF.includes(seb.u)))) return tolak('EXCL_RATE')
  if (ses && ses.k === 'S' && ses.t === '%') return tolak('EXCL_PCT')
  if ((ses && (ses.u === 'X' || ses.t === '×') && ses.s - e <= 1) || (seb && (seb.u === 'X' || seb.t === '×') && s - seb.e <= 1)) return tolak('EXCL_DIM')
  // ADDENDUM-1 AM4: angka di klausa berpenanda lampau ("last voyage … 4.100 MT") tak pernah jumlah muatan kini
  {
    const kl = klausaToken(tok)
    const iQ = tok.findIndex((t) => t.s >= s)
    const cQ = iQ >= 0 ? kl[iQ] : kl[iSeb] ?? 0
    const w = tok.filter((t, i) => kl[i] === cQ && t.k === 'W').map((t) => t.u)
    if (PENANDA_MUATAN_LAIN_T.some((p) => adaUrutanToken(p, w))) return tolak('EXCL_PAST_CLAUSE')
  }
  // §4.6 rentang: Q1 - Q2 U / Q1 TO Q2 U / Q1 S/D Q2 U
  let titik = e
  let perkiraan = rentangKedua
  {
    let k = iSes
    const t0 = tok[k]
    let lompat = 0
    if (t0 && t0.k === 'S' && ['-', '–', '—', '~'].includes(t0.t)) lompat = 1
    else if (t0 && t0.k === 'W' && ['TO', 'SAMPAI', 'HINGGA'].includes(t0.u)) lompat = 1
    else if (t0 && t0.u === 'S' && tok[k + 1]?.t === '/' && tok[k + 2]?.u === 'D') lompat = 3
    // ADDENDUM-1 AM5: rentang hanya bila Q1 < Q2 ≤ 2·Q1 ("Gasoline 90 - 18.000 KL" bukan rentang)
    const q2 = lompat && tok[k + lompat]?.k === 'N' ? nilaiAngkaSumber(tok[k + lompat].t) : null
    if (q2 !== null && nilai < q2 && q2 <= 2 * nilai) {
      k += lompat
      titik = tok[k].e
      perkiraan = true
    }
  }
  const celah = /^[ \t]*(?:\|[ \t]*)?/.exec(x.slice(titik))?.[0] ?? ''
  const pSatuan = titik + celah.length
  const sisa = x.slice(pSatuan)
  const tSatuan = tok.find((t) => t.s === pSatuan)
  let cocok: Okurensi['cocok'] = null
  let ejaan: string | null = null
  let panjangSatuan = 0
  if (U && bentukSatuanSah(U)) {
    const lit = awalanSatuan(sisa, U)
    if (lit) {
      cocok = 'LITERAL'
      ejaan = lit.trim()
      panjangSatuan = lit.length
    } else {
      const g = grupWarisan(U)
      if (g) {
        for (const a of ALIAS_SATUAN_WARISAN[g as keyof typeof ALIAS_SATUAN_WARISAN]) {
          const w = awalanSatuan(sisa, a)
          if (w) {
            cocok = 'LEGACY'
            ejaan = U.trim()
            panjangSatuan = w.length
            break
          }
        }
      }
    }
  }
  // AM1: satuan sumber alias v2 beku (paritas v2) — memverifikasi jumlah walau satuan model tak cocok
  let warisanSumber = false
  if (!cocok && tSatuan && tSatuan.k === 'W')
    for (const a of Object.values(ALIAS_SATUAN_WARISAN).flat()) {
      const w = awalanSatuan(sisa, a)
      if (w) {
        warisanSumber = true
        panjangSatuan = w.length
        break
      }
    }
  // label jumlah tepat sebelum ("Qty: 5000") atau satuan berlabel ("Quantity (MT): 5000")
  let k2 = iSeb
  while (k2 >= 0 && tok[k2].k === 'S' && [':', '='].includes(tok[k2].t)) k2--
  const kataSebelum = tok.slice(0, k2 + 1).filter((t) => t.k === 'W').map((t) => t.u)
  let labelJumlah = k2 >= 0 && tok[k2].k === 'W' && berakhirDengan(LABEL_JUMLAH, kataSebelum)
  let satuanLabel: [number, number] | null = null
  if (!labelJumlah && k2 >= 0 && tok[k2].t === ')') {
    const buka = tok.slice(0, k2).map((t) => t.t).lastIndexOf('(')
    if (buka > 0 && tok[buka - 1]?.k === 'W' && LABEL_JUMLAH.includes(tok[buka - 1].u)) {
      labelJumlah = true
      const dalam = x.slice(tok[buka].e, tok[k2].s)
      satuanLabel = [tok[buka].e, tok[k2].s]
      if (!cocok && U && bentukSatuanSah(U)) {
        if (normSatuan(dalam) === normSatuan(U)) {
          cocok = 'LITERAL'
          ejaan = dalam.trim()
        } else if (grupWarisan(U) && grupWarisan(U) === grupWarisan(dalam)) {
          cocok = 'LEGACY'
          ejaan = U.trim()
        }
      }
    }
  }
  const terverifikasi = !!cocok || warisanSumber || labelJumlah
  if (!terverifikasi) return tolak(tSatuan && tSatuan.k === 'W' && !satuanTerlarang(tSatuan.t) ? 'EXCL_UNIT_NOT_PROPOSED' : 'EXCL_NO_UNIT')
  // tarif sesudah satuan: '/' atau PER/EACH/SETIAP/TIAP
  if (panjangSatuan) {
    const sesudahSatuan = x.slice(pSatuan + panjangSatuan)
    const t1 = tokenLeksikon(sesudahSatuan)[0]
    if (/^\s*\//.test(sesudahSatuan) || (t1 && PENANDA_TARIF.includes(t1) && /^\s*[A-Za-z]/.test(sesudahSatuan))) return tolak('EXCL_RATE')
  }
  if (ocr && !(cocok || warisanSumber)) return tolak('EXCL_NO_UNIT')
  // §4.6 penanda perkiraan: prefiks (≤ 3 token sebelum, segmen sama), sufiks toleransi (segmen sama)
  const seg = segmenToken(tok)
  const iAngka = tok.findIndex((t) => t.s >= s)
  const segQ = iSeb >= 0 ? seg[iSeb] : 0
  const st = Math.max(0, iSeb - 2)
  const tiga = tok.slice(st, iSeb + 1).filter((t, k) => seg[st + k] === segQ || t.k === 'S')
  const simbol = tiga.filter((t) => t.k === 'S').map((t) => t.t).join('')
  const kataTiga = tiga.filter((t) => t.k === 'W').map((t) => t.u)
  if (PENANDA_PERKIRAAN_SIMBOL.some((p) => simbol.includes(p)) || /\+\/-/.test(simbol.replace(/\s/g, ''))) perkiraan = true
  if (PENANDA_PERKIRAAN_KATA.some((p) => adaUrutanToken(p.split(' '), kataTiga))) perkiraan = true
  if (seb && seb.k === 'W' && PENANDA_PERKIRAAN_DEKAT.includes(seb.u)) perkiraan = true
  if (seb && seb.t === '.' && tok[iSeb - 1]?.k === 'W' && PENANDA_PERKIRAAN_DEKAT.includes(tok[iSeb - 1].u)) perkiraan = true
  if (!perkiraan && iAngka >= 0) {
    const segA = seg[iAngka] ?? segQ
    const sesudahSeg = tok.filter((t, k) => k > iAngka && seg[k] === segA)
    const w = sesudahSeg.filter((t) => t.k === 'W').map((t) => t.u)
    const sym = sesudahSeg.map((t) => t.t).join('')
    if (w.some((v) => PENANDA_TOLERANSI.includes(v)) || /(?:\+\/-|±)\d+(?:[.,]\d+)?%/.test(sym)) perkiraan = true
  }
  return { ok: { nilai, l: li, s, e, perkiraan, ocr, cocok, ejaan, terverifikasi, satuanS: satuanLabel ? satuanLabel[0] : pSatuan, satuanE: satuanLabel ? satuanLabel[1] : pSatuan + panjangSatuan }, tolak: null }
}
/** Semua okurensi angka bernilai `nilai` (atau semua angka bila null) pada baris logis `li`. */
function okurensiBaris(ls: readonly Logis[], li: number, nilai: number | null, U: string | null, namaRentang: readonly Rentang[]): { ok: Okurensi[]; tolak: string[] } {
  const l = ls[li]
  const ok: Okurensi[] = []
  const tolak: string[] = []
  const lihat = new Set<number>()
  for (const t of l.tok) {
    if (t.k !== 'N') continue
    const v = nilaiAngkaSumber(t.t)
    if (v === null || (nilai !== null && Math.abs(v - nilai) >= 1e-9)) continue
    lihat.add(t.s)
    const h = cekOkurensi(ls, li, t.s, t.e, v, false, U, namaRentang)
    if (h.ok) ok.push(h.ok)
    else if (h.tolak) tolak.push(h.tolak)
  }
  const pola = new RegExp(POLA_TOKEN_ANGKA_OCR.source, 'g')
  for (let m = pola.exec(l.teks); m; m = pola.exec(l.teks)) {
    const mentah = m[2]
    if (!/[OoIl]/.test(mentah)) continue
    if ((mentah.match(/[0-9]/g) ?? []).length < MIN_DIGIT_ASLI_OCR) continue
    const v = nilaiAngkaSumber(mentah.replace(/[OoIl]/g, (c) => LIPATAN_OCR_ANGKA[c]))
    if (v === null || (nilai !== null && Math.abs(v - nilai) >= 1e-9)) continue
    const s = m.index + m[1].length
    const h = cekOkurensi(ls, li, s, s + mentah.length, v, true, U, namaRentang)
    if (h.ok) ok.push(h.ok)
    else if (h.tolak) tolak.push(h.tolak)
  }
  return { ok, tolak }
}

// ------------------------------------------------------------ §6.3 koreksi
const NUM = '(\\d[\\d.,]*)'
const POLA_GANTI: Array<{ p: RegExp; x: number | null; y: number }> = [
  { p: new RegExp(`\\b(?:from|dari)\\s+${NUM}[^\\d\\n]{0,15}?\\s+(?:to|menjadi|jadi)\\s+${NUM}`, 'gi'), x: 1, y: 2 },
  { p: new RegExp(`${NUM}[^\\d\\n]{0,12}?\\s*(?:->|→|=>)\\s*${NUM}`, 'g'), x: 1, y: 2 },
  { p: new RegExp(`${NUM}[^\\d\\n(]{0,12}\\(\\s*bukan\\s+${NUM}`, 'gi'), x: 2, y: 1 },
  { p: new RegExp(`${NUM}[^\\d\\n]{0,12}?\\s+instead\\s+of\\s+${NUM}`, 'gi'), x: 2, y: 1 },
  { p: new RegExp(`\\b(?:revised|changed|diubah|diganti)\\s+(?:to|menjadi|jadi)\\s+${NUM}`, 'gi'), x: null, y: 1 },
  { p: new RegExp(`\\bmenjadi\\s+${NUM}`, 'gi'), x: null, y: 1 },
]
const angkaKoreksi = (s: string | undefined): number | null => (s ? nilaiAngkaSumber(s.replace(/[.,]+$/, '')) : null)

// ------------------------------------------------------------ dokumen bukti
type BuktiMuatan = {
  ls: Logis[]
  blok: number[][]
  grup: number[]
  /** QUOTED ditekan oleh penanda "disregard previous" di TOP (§6.2). */
  kutipanDitekan: boolean
  adaKoreksi: boolean
  koreksiX: Set<number>
  koreksiY: Set<number>
  multiPelabuhan: boolean
  items: ItemOperasi[][]
}
const POLA_ABAIKAN = /\b(?:disregard|ignore)\b.{0,30}\b(?:previous|earlier|above|below|prior|last)\b|\babaikan\b|\bcancel(?:led)?\b.{0,15}\bprevious\b/i
function buktiMuatanDari(sumber: string): BuktiMuatan {
  const fisik = sumber.split(/\r?\n/)
  const zona = petaZona(fisik)
  const ls = barisLogis(fisik, zona)
  const top = ls.filter((l) => l.zona === 'TOP')
  const kataTop = top.map((l) => l.tok.filter((t) => t.k === 'W').map((t) => t.u))
  const adaKoreksi = kataTop.some((w) => urutanDi(PENANDA_KOREKSI, w))
  const koreksiX = new Set<number>()
  const koreksiY = new Set<number>()
  if (adaKoreksi)
    for (const l of top)
      for (const { p, x, y } of POLA_GANTI) {
        const r = new RegExp(p.source, p.flags)
        for (let m = r.exec(l.teks); m; m = r.exec(l.teks)) {
          const vy = angkaKoreksi(m[y])
          if (vy !== null) koreksiY.add(vy)
          const vx = x ? angkaKoreksi(m[x]) : null
          if (vx !== null) koreksiX.add(vx)
        }
      }
  // §5.4 multi-pelabuhan (bukan SIG)
  const nonSig = ls.filter((l) => l.zona !== 'SIG')
  const kata = nonSig.map((l) => l.tok.map((t) => t.u))
  const ada = (daftar: readonly string[]) => kata.some((w) => urutanDi(daftar, w))
  const locode = new Set<string>()
  for (const l of nonSig)
    l.tok.forEach((t, i) => {
      if (t.k !== 'W' || !/^[A-Z]{2}[A-Z2-9]{3}$/.test(t.t)) return
      const p = l.tok[i - 1]
      const p2 = l.tok[i - 2]
      if ((p?.t === '(' ) || (p?.t === '-' && !nempel(p, t)) || (p?.k === 'W' && ['LOCODE', 'UNLOCODE'].includes(p.u)) || (p?.t === ':' && p2?.k === 'W' && ['LOCODE', 'UNLOCODE'].includes(p2.u))) locode.add(t.t)
    })
  const multiPelabuhan = (ada(FRASA_PELABUHAN_MUAT) && ada(FRASA_PELABUHAN_BONGKAR)) || ada(FRASA_MULTI_PELABUHAN) || locode.size >= 2
  return {
    ls,
    blok: blokMuatan(ls),
    grup: grupLabel(ls),
    kutipanDitekan: top.some((l) => POLA_ABAIKAN.test(l.teks)),
    adaKoreksi,
    koreksiX,
    koreksiY,
    multiPelabuhan,
    items: ls.map(itemOperasi),
  }
}

/** Jejak aturan per baris (SPEC:V3 §7) — id aturan, tier, zona; TANPA teks sumber. */
export type JejakMuatan = { name?: string; quantity?: string; unit?: string; operation?: string; tier?: 1 | 2 | 3; zona?: 'TOP' | 'QUOTED' }
type UsulanMuatan = { name: string; quantity: number | null; unit: string | null; operation: 'LOAD' | 'DISCHARGE' | null }
type KonteksMuatan = { portName: string | null; portUnlocode: string | null }

/**
 * Baris muatan usulan AI → baris tervalidasi (V3), atau null (DIBUANG) bila namanya tak berbukti.
 * `b` null = masukan tanpa teks (PDF/gambar): tak bisa dibuktikan → UNVERIFIED_SOURCE, wajib dikonfirmasi.
 */
function validasiMuatanV3(rows: readonly UsulanMuatan[], b: BuktiMuatan | null, ktx: KonteksMuatan): Array<CargoUsulan | null> {
  if (!b) {
    return rows.map((v) => {
      if (NAMA_MUATAN_UMUM.includes(tokenMuatan(v.name).join(' '))) return null
      const flags: FlagCargo[] = ['UNVERIFIED_SOURCE']
      let unit = v.unit
      if (v.quantity === null && unit !== null) {
        unit = null
        flags.push('CARGO_UNIT_WITHOUT_QUANTITY')
      }
      return { name: v.name, quantity: v.quantity, unit, operation: v.operation, source: 'SOURCE_DOCUMENT', flags, confirmed: false }
    })
  }
  const { ls } = b
  const zonaBoleh = (z: Zona): boolean => z === 'TOP' || (z === 'QUOTED' && !b.kutipanDitekan)
  // Lintasan 1 — nama (§4.1): urutan kata utuh di TOP/QUOTED; jalur OCR sempit sesudah uji harfiah gagal.
  type Nama = { t: string[]; ocr: boolean; sebut: Map<number, Rentang[]> }
  const nama: Array<Nama | null> = rows.map((v) => {
    const t = tokenMuatan(v.name)
    if (!t.length || NAMA_MUATAN_UMUM.includes(t.join(' '))) return null
    for (const ocr of [false, true]) {
      if (ocr && t.map(lipatOcr).join('').length < MIN_PANJANG_OCR) break
      const sebut = new Map<number, Rentang[]>()
      ls.forEach((l, i) => {
        if (!zonaBoleh(l.zona)) return
        const r = sebutan(l.teks, t, ocr)
        if (r.length) sebut.set(i, r)
      })
      if (sebut.size) return { t, ocr, sebut }
    }
    return null
  })
  const terverifikasi = nama.filter((n): n is Nama => !!n)
  const barisTunggal = terverifikasi.length === 1
  /** Rentang sebutan nama muatan LAIN (bukan nama ini; sebutan yang termuat di sebutan nama ini diabaikan). */
  const sebutanLain = (n: Nama, li: number): Rentang[] => {
    const milik = n.sebut.get(li) ?? []
    return terverifikasi
      .filter((m) => m.t.join(' ') !== n.t.join(' '))
      .flatMap((m) => m.sebut.get(li) ?? [])
      .filter(([a, z]) => !milik.some(([p, q]) => a >= p && z <= q))
  }
  const blokNama = (n: Nama): number[] => {
    const hasil = new Set<number>()
    for (const bl of b.blok) if (bl.some((i) => n.sebut.has(i)) && !bl.some((i) => sebutanLain(n, i).length)) bl.forEach((i) => hasil.add(i))
    return Array.from(hasil)
  }
  const labelMuatanBaris = (li: number): boolean => berlabelDi(ls[li], LABEL_BARIS_MUATAN)
  /** AM3 (b): banyaknya okurensi jumlah terverifikasi (tanpa satuan model) pada satu baris logis. */
  const cacheJumlah = new Map<number, number>()
  const jumlahTerverifikasiBaris = (li: number): number => {
    if (!cacheJumlah.has(li)) cacheJumlah.set(li, okurensiBaris(ls, li, null, null, []).ok.length)
    return cacheJumlah.get(li) as number
  }
  /** §4.7 okurensi di jendela ikat baris ini? */
  const terikat = (n: Nama, o: Okurensi, blok: readonly number[]): boolean => {
    const l = ls[o.l]
    const seg = segmenToken(l.tok)
    const iO = l.tok.findIndex((t) => t.s >= o.s)
    const sg = iO >= 0 ? seg[iO] : -1
    const idx = l.tok.map((_, i) => i).filter((i) => seg[i] === sg)
    const awal = idx.length ? l.tok[idx[0]].s : o.s
    const akhir = idx.length ? l.tok[idx[idx.length - 1]].e : o.e
    const milik = n.sebut.get(o.l) ?? []
    const lain = sebutanLain(n, o.l)
    // (a) segmen bersinggungan dengan sebutan nama baris ini
    if (milik.some(([p, q]) => p < akhir && q > awal)) return true
    // ADDENDUM-1 AM3: (b)(c)(d) hanya bila segmen jumlah BEBAS NAMA (tiap kata = sebutan nama sendiri, frasa satuan,
    // atau kelas struktural tertutup) — komoditas yang tak diusulkan model tak pernah "dipinjamkan" ke baris lain.
    const bebasNama = idx.every((i) => {
      const t = l.tok[i]
      if (t.k !== 'W') return true
      if (milik.some(([p, q]) => t.s >= p && t.e <= q)) return true
      if (t.s >= o.satuanS && t.e <= o.satuanE) return true
      return KATA_STRUKTUR.has(t.u)
    })
    if (!bebasNama) return false
    if (milik.length && !lain.length && jumlahTerverifikasiBaris(o.l) === 1) return true
    if (blok.includes(o.l)) return true
    if (barisTunggal && labelMuatanBaris(o.l) && !lain.length && jumlahTerverifikasiBaris(o.l) === 1) return true
    return false
  }

  return rows.map((v, ri) => {
    const n = nama[ri]
    if (!n) return null
    const flags: FlagCargo[] = []
    const tambah = (f: FlagCargo) => {
      if (!flags.includes(f)) flags.push(f)
    }
    const jejak: JejakMuatan = { name: n.ocr ? 'N_OCR' : 'N_LITERAL' }
    if (n.ocr) tambah('OCR_CORRECTED')
    const zonaNama: 'TOP' | 'QUOTED' = Array.from(n.sebut.keys()).some((i) => ls[i].zona === 'TOP') ? 'TOP' : 'QUOTED'
    // §6.2 nama hanya di kutipan → tak pernah tepercaya
    if (zonaNama === 'QUOTED') tambah('CARGO_EVIDENCE_QUOTED')
    const blok = blokNama(n)
    const U = v.unit !== null && v.unit.trim() !== '' ? v.unit : null
    let quantity: number | null = v.quantity
    let unit: string | null = U
    let dipakai: Okurensi | null = null

    // ---------------- §4 jumlah + satuan
    if (v.quantity !== null) {
      const q = v.quantity
      // jendela: baris sebutan, blok, baris berlabel muatan (tunggal); per zona (TOP dulu, QUOTED bila TOP kosong)
      const jendela = new Set<number>(Array.from(n.sebut.keys()).concat(blok))
      if (barisTunggal) ls.forEach((_, i) => labelMuatanBaris(i) && jendela.add(i))
      const kumpul = (nilai: number | null, zona: Zona) => {
        const ok: Okurensi[] = []
        const lain: Okurensi[] = []
        const tolak: string[] = []
        for (const li of Array.from(jendela).sort((a, c) => a - c)) {
          if (ls[li].zona !== zona) continue
          const h = okurensiBaris(ls, li, nilai, U, n.sebut.get(li) ?? [])
          tolak.push(...h.tolak)
          for (const o of h.ok) (terikat(n, o, blok) ? ok : lain).push(o)
        }
        return { ok, lain, tolak }
      }
      let zonaQ: 'TOP' | 'QUOTED' = 'TOP'
      let h = kumpul(q, 'TOP')
      // §6.2: QUOTED hanya bila TOP sama sekali tak punya bukti jumlah terikat untuk baris ini (nilai apa pun)
      if (!h.ok.length && zonaBoleh('QUOTED') && !kumpul(null, 'TOP').ok.length) {
        const hq = kumpul(q, 'QUOTED')
        if (hq.ok.length) {
          h = hq
          zonaQ = 'QUOTED'
        } else {
          h = { ok: h.ok, lain: [...h.lain, ...hq.lain], tolak: [...h.tolak, ...hq.tolak] }
        }
      }
      const skor = (o: Okurensi) => (o.cocok ? 0 : 4) + (o.ocr ? 2 : 0) + (o.perkiraan ? 1 : 0)
      dipakai = h.ok.sort((a, c) => skor(a) - skor(c))[0] ?? null
      if (dipakai) {
        // §6.3 koreksi: ≥ 2 jumlah terikat berbeda untuk baris ini + penanda koreksi di TOP
        if (b.adaKoreksi) {
          const semua = kumpul(null, zonaQ).ok.map((o) => o.nilai)
          if (new Set(semua).size >= 2) {
            if (b.koreksiY.has(q) && !b.koreksiX.has(q)) {
              tambah('CARGO_CORRECTION_APPLIED')
              jejak.quantity = 'Q_CORRECTION_TARGET'
            } else {
              quantity = null
              dipakai = null
              tambah('CARGO_CORRECTION_UNRESOLVED')
              jejak.quantity = 'Q_CORRECTION'
            }
          }
        }
      }
      if (dipakai) {
        jejak.quantity ??= dipakai.cocok ? 'Q_PAIR' : 'Q_LEGACY_ADJ'
        if (zonaQ === 'QUOTED') tambah('CARGO_EVIDENCE_QUOTED')
        if (dipakai.perkiraan) tambah('APPROXIMATE_QUANTITY')
        if (dipakai.ocr) tambah('OCR_CORRECTED')
      } else if (quantity !== null) {
        quantity = null
        if (h.lain.length) {
          tambah('CARGO_RELATION_AMBIGUOUS')
          jejak.quantity = 'Q_RELATION'
        } else {
          tambah('CARGO_QUANTITY_NOT_IN_SOURCE')
          // §6.2 jejak: angka hanya ada di zona yang tak boleh mengikat (SIG / kutipan yang ditekan)
          const diZonaTerlarang = ls.some((l) => !zonaBoleh(l.zona) && l.tok.some((t) => t.k === 'N' && nilaiAngkaSumber(t.t) === q))
          jejak.quantity = h.tolak.length ? h.tolak[0] : diZonaTerlarang ? 'EXCL_ZONE' : 'Q_NOT_FOUND'
        }
      }
      // satuan: HANYA satuan model yang cocok (harfiah → ejaan sumber; alias v2 beku → ejaan model)
      if (U !== null) {
        if (dipakai && dipakai.cocok && dipakai.ejaan) {
          unit = dipakai.ejaan
          jejak.unit = dipakai.cocok === 'LITERAL' ? 'U_LITERAL' : 'U_LEGACY'
          if (!SATUAN_STANDAR_INFORMATIF.includes(normSatuan(unit))) tambah('CARGO_UNIT_NONSTANDARD')
        } else {
          unit = null
          tambah('CARGO_UNIT_NOT_IN_SOURCE')
          jejak.unit = !bentukSatuanSah(U) ? 'U_SHAPE_OR_DENIED' : 'U_MISMATCH'
        }
      }
    }
    // Satuan tanpa jumlah bukan fakta muatan.
    if (quantity === null && unit !== null) {
      unit = null
      tambah('CARGO_UNIT_WITHOUT_QUANTITY')
      jejak.unit = 'U_NO_QUANTITY'
    }

    // ---------------- §5 operasi
    let operation = v.operation
    if (operation !== null) {
      const O = operation
      const lawanDari = (f: string) => f !== O
      const pilihZona = (): 'TOP' | 'QUOTED' | null => {
        if (b.items.some((it, i) => it.length && ls[i].zona === 'TOP')) return 'TOP'
        if (zonaBoleh('QUOTED') && b.items.some((it, i) => it.length && ls[i].zona === 'QUOTED')) return 'QUOTED'
        return null
      }
      const zona = pilihZona()
      let hasil: { nilai: 'LOAD' | 'DISCHARGE' | null; tier?: 1 | 2 | 3; flag: FlagCargo[]; aturan: string } | null = null
      let adaLampauO = false
      if (zona) {
        // T1 — baris sebutan, blok, baris label operasi di grup label bersebutan, baris berlabel muatan (tunggal), baris jumlah
        const t1 = new Set<number>()
        for (const i of Array.from(n.sebut.keys())) if (ls[i].zona === zona) t1.add(i)
        for (const i of blok) if (ls[i].zona === zona) t1.add(i)
        const grupSebut = new Set(Array.from(n.sebut.keys()).map((i) => b.grup[i]).filter((g) => g >= 0))
        ls.forEach((l, i) => {
          if (l.zona !== zona) return
          if (grupSebut.has(b.grup[i]) && labelOperasi(l)) t1.add(i)
          if (barisTunggal && labelMuatanBaris(i) && !sebutanLain(n, i).length) t1.add(i)
        })
        if (dipakai && ls[dipakai.l].zona === zona) t1.add(dipakai.l)
        const itT1 = Array.from(t1).flatMap((i) => b.items[i])
        adaLampauO ||= itT1.some((x) => x.lampau && x.f === O)
        const kini1 = itT1.filter((x) => !x.lampau)
        const o1 = kini1.filter((x) => x.f === O)
        const l1 = kini1.filter((x) => lawanDari(x.f))
        if (o1.length && l1.length) hasil = { nilai: O, tier: 1, flag: o1.some((x) => x.kuat) ? ['CARGO_OPERATION_AMBIGUOUS'] : ['CARGO_OPERATION_AMBIGUOUS', 'CARGO_OPERATION_CONTEXTUAL'], aturan: 'O_T1_AMBIGUOUS' }
        else if (l1.length) hasil = { nilai: null, tier: 1, flag: ['CARGO_OPERATION_CONTRADICTS_SOURCE'], aturan: 'O_CONTRADICTS' }
        else if (o1.some((x) => x.kuat)) hasil = { nilai: O, tier: 1, flag: [], aturan: 'O_T1' }
        else if (o1.length) hasil = { nilai: O, tier: 1, flag: ['CARGO_OPERATION_CONTEXTUAL'], aturan: 'O_T1_WEAK' }
        // T2 — kalimat bersebutan (paragraf = baris logis tak kosong berurutan, zona sama)
        if (!hasil) {
          const itT2: ItemOperasi[] = []
          for (const [li, rent] of Array.from(n.sebut.entries())) {
            if (ls[li].zona !== zona) continue
            let a = li
            while (a > 0 && !ls[a - 1].kosong && ls[a - 1].zona === zona) a--
            let z = li
            while (z + 1 < ls.length && !ls[z + 1].kosong && ls[z + 1].zona === zona) z++
            // token paragraf (indeks global) + item
            type TP = { tok: Tok; li: number; i: number }
            const par: TP[] = []
            for (let k = a; k <= z; k++) ls[k].tok.forEach((t, i) => par.push({ tok: t, li: k, i }))
            for (const [p] of rent) {
              const pos = par.findIndex((x) => x.li === li && x.tok.s >= p)
              if (pos < 0) continue
              let ka = pos
              while (ka > 0 && !(par[ka - 1].tok.k === 'S' && ['.', '?', '!'].includes(par[ka - 1].tok.t))) ka--
              let kz = pos
              while (kz + 1 < par.length && !(par[kz].tok.k === 'S' && ['.', '?', '!'].includes(par[kz].tok.t))) kz++
              if (kz - ka + 1 > 40) {
                ka = Math.max(ka, pos - 20)
                kz = Math.min(kz, pos + 20)
              }
              const dalam = new Set(par.slice(ka, kz + 1).map((x) => `${x.li}:${x.i}`))
              for (let k = a; k <= z; k++) for (const it of b.items[k]) if (dalam.has(`${k}:${it.i}`)) itT2.push(it)
            }
          }
          adaLampauO ||= itT2.some((x) => x.lampau && x.f === O)
          const kini2 = itT2.filter((x) => !x.lampau)
          const o2 = kini2.filter((x) => x.f === O)
          const l2 = kini2.filter((x) => lawanDari(x.f))
          if (o2.length && l2.length) hasil = { nilai: O, tier: 2, flag: ['CARGO_OPERATION_AMBIGUOUS', 'CARGO_OPERATION_CONTEXTUAL'], aturan: 'O_T2_AMBIGUOUS' }
          else if (l2.length) hasil = { nilai: null, tier: 2, flag: ['CARGO_OPERATION_CONTRADICTS_SOURCE'], aturan: 'O_CONTRADICTS' }
          else if (o2.length) hasil = { nilai: O, tier: 2, flag: ['CARGO_OPERATION_CONTEXTUAL'], aturan: 'O_T2' }
        }
        // T3 — tingkat dokumen (D2): semua syarat wajib
        if (!hasil) {
          const idxZona = ls.map((l, i) => (l.zona === zona ? i : -1)).filter((i) => i >= 0)
          const semua = idxZona.flatMap((i) => b.items[i].map((it) => ({ it, li: i })))
          adaLampauO ||= semua.some((x) => x.it.lampau && x.it.f === O)
          const kini3 = semua.filter((x) => !x.it.lampau)
          const famili = new Set(kini3.map((x) => x.it.f))
          let pelabuhanOk = !b.multiPelabuhan
          if (!pelabuhanOk) {
            const tPort = ktx.portName ? tokenLeksikon(ktx.portName) : []
            pelabuhanOk = kini3.some(({ li }) => {
              const w = ls[li].tok.map((t) => t.u)
              return (tPort.length > 0 && adaUrutanToken(tPort, w)) || (!!ktx.portUnlocode && w.includes(ktx.portUnlocode))
            })
          }
          if (barisTunggal && famili.size === 1 && famili.has(O) && !b.adaKoreksi && pelabuhanOk)
            hasil = { nilai: O, tier: 3, flag: ['CARGO_OPERATION_DOCUMENT_LEVEL'], aturan: 'O_T3' }
        }
        if (hasil && hasil.nilai !== null && zona === 'QUOTED') hasil.flag = [...hasil.flag, 'CARGO_EVIDENCE_QUOTED']
      }
      if (!hasil) {
        operation = null
        if (adaLampauO) {
          tambah('CARGO_OPERATION_PAST_REFERENCE')
          jejak.operation = 'O_PAST_ONLY'
        } else {
          tambah('CARGO_OPERATION_NOT_IN_SOURCE')
          jejak.operation = 'O_NONE'
        }
      } else {
        operation = hasil.nilai
        hasil.flag.forEach(tambah)
        jejak.operation = hasil.aturan
        if (hasil.tier) jejak.tier = hasil.tier
        if (hasil.nilai !== null && zona) jejak.zona = zona
      }
    }
    if (!jejak.zona) jejak.zona = zonaNama
    return { name: v.name, quantity, unit, operation, source: 'SOURCE_DOCUMENT', flags, confirmed: false, jejak }
  })
}

/**
 * Baris muatan boleh menjadi data operasional (voyage cargo → tonase autofill finance) tanpa
 * konfirmasi lagi? Gagal-tertutup: baris lama tanpa `flags` (sebelum grounding) TIDAK dipercaya.
 */
export function cargoTepercaya(c: CargoUsulan): boolean {
  if (c.confirmed === true || c.source === 'USER_EDITED') return true
  if (c.source !== 'SOURCE_DOCUMENT' || !Array.isArray(c.flags)) return false
  return !c.flags.some((f) => PERLU_KONFIRMASI_CARGO.includes(f))
}

/**
 * PRD-005 E5 Step 10B — aturan P0 tingkat-NILAI, diperiksa ULANG pada proposal tersimpan (tanpa dokumen
 * sumber), sehingga proposal lama (sebelum P0, tanpa flag P0) tak dipercaya hanya karena flag-nya tak ada:
 * nilai terselubung, "nama" berupa label pengenal + nomor / hanya angka, IMO bukan 7 digit / check digit
 * salah (flag K2 sudah ada sebelum P0), MMSI bukan 9 digit. Nilai yang DIISI PENINJAU (USER_EDITED)
 * adalah keputusan manusia dan tetap mengikuti aturan servis (IMO 7 digit, MMSI 9 digit) — tak diubah.
 * Uji BUKTI SUMBER (token terselubung di dokumen) TIDAK bisa diulang: dokumen asli tak disimpan (D4).
 */
function nilaiIdentitasTepercaya(f: FieldUsulan, jenis: 'name' | 'imo' | 'mmsi' | 'callSign'): boolean {
  if (typeof f.value !== 'string' || f.value.trim() === '') return false
  if (f.source === 'USER_EDITED') return true
  const v = f.value
  if (nilaiTerselubung(v)) return false
  if (jenis === 'name') return !bukanNamaKapal(v)
  if (jenis === 'imo') return /^\d{7}$/.test(v) && !f.flags.includes('IMO_CHECK_DIGIT')
  if (jenis === 'mmsi') return /^\d{9}$/.test(v)
  return true
}

/**
 * PRD-005 E5 Step 8 (P0-3) — identitas kapal TEPERCAYA untuk syarat minimum. IMO dengan check digit
 * salah tetap tampil & ditandai (K2), tetapi TIDAK dihitung sebagai identitas. Step 10B: memakai aturan
 * P0 tingkat-nilai yang diperiksa ulang (lihat nilaiIdentitasTepercaya), bukan sekadar ketiadaan flag.
 */
export function identitasKapalTepercaya(v: KapalUsulan): boolean {
  if (v.excluded) return false
  return (['name', 'imo', 'mmsi', 'callSign'] as const).some((j) => nilaiIdentitasTepercaya(v[j], j))
}

/** §7 — identitas kapal tepercaya DAN (pelabuhan atau ETA). */
export function syaratMinimumTerpenuhi(p: Proposal): boolean {
  const adaKapal = p.vessels.some(identitasKapalTepercaya)
  return adaKapal && !!(p.portName.value || p.portUnlocode.value || p.eta.value)
}

/**
 * PRD-005 E5 Step 10 (P1 opsi A) — alasan klasifikasi yang BOLEH memicu tinjauan subtipe:
 * null (model sendiri menjawab INSUFFICIENT), CLASSIFICATION_INVALID (model tak mengklasifikasi), dan
 * (Step 10B, keputusan owner) MINIMUM_FIELDS_MISSING — hanya bila proposal SAAT INI (mis. sesudah peninjau
 * melengkapi field) memenuhi syarat minimum; subtipe asli model TIDAK dipulihkan. TOO_MANY_VESSELS TIDAK.
 */
export const ALASAN_TINJAUAN_SUBTIPE: readonly (string | null)[] = [null, 'CLASSIFICATION_INVALID', 'MINIMUM_FIELDS_MISSING']

/**
 * P1 opsi A — data minimum kunjungan TERVERIFIKASI validator (P0), tetapi model menjawab
 * INSUFFICIENT_INFORMATION: peninjau wajib memilih Nominasi/Appointment. Murni & deterministik;
 * TIDAK mengubah classification maupun classificationReason, dan TIDAK menebak subtipe.
 */
export function perluTinjauanSubtipe(classification: string, p: Proposal): boolean {
  return (
    classification === 'INSUFFICIENT_INFORMATION' &&
    ALASAN_TINJAUAN_SUBTIPE.includes(p.classificationReason ?? null) &&
    syaratMinimumTerpenuhi(p)
  )
}

/**
 * Status turunan untuk tampilan tinjauan (DTO) — deterministik dari proposal tervalidasi SAAT INI.
 * subtypeReviewRequired hanya selama NEEDS_REVIEW (status terminal/lain tak menampilkan aksi subtipe).
 */
export function turunanTinjauanIntake(status: string, classification: string, p: Proposal): { minimumSatisfied: boolean; subtypeReviewRequired: boolean } {
  return {
    minimumSatisfied: syaratMinimumTerpenuhi(p),
    subtypeReviewRequired: status === 'NEEDS_REVIEW' && perluTinjauanSubtipe(classification, p),
  }
}

// ----------------------------------------------------------------- matching

export type KapalMaster = {
  id: string
  name: string
  imoNumber: string | null
  mmsi: string | null
  mmsiVerifiedAt: Date | string | null
  callSign: string | null
}
export type PihakMaster = { id: string; name: string; isActive?: boolean }
export type PortMaster = { id: string; name: string; unlocode: string | null }

const MAKS_KANDIDAT = 10

export const cocokKosong = (status: StatusCocok = 'NOT_FOUND'): HasilCocok => ({
  status,
  basis: null,
  selectedId: null,
  candidates: [],
  requiresConfirmation: false,
  confirmed: false,
  leftEmpty: false,
})

function labelKapal(v: KapalMaster): string {
  return [v.name, v.imoNumber ? `IMO ${v.imoNumber}` : null, v.mmsi ? `MMSI ${v.mmsi}` : null, v.callSign ? `CS ${v.callSign}` : null]
    .filter(Boolean)
    .join(' · ')
}

function kumpulkanKandidat(daftar: Array<{ v: KapalMaster; basis: string }>): KandidatCocok[] {
  const lihat = new Map<string, KandidatCocok>()
  for (const { v, basis } of daftar) {
    const ada = lihat.get(v.id)
    if (ada) ada.basis = ada.basis.includes(basis) ? ada.basis : `${ada.basis}+${basis}`
    else lihat.set(v.id, { id: v.id, label: labelKapal(v), basis, mmsiUnverified: !!v.mmsi && !v.mmsiVerifiedAt })
  }
  return Array.from(lihat.values()).slice(0, MAKS_KANDIDAT)
}

/**
 * §10 — pencocokan kapal bertingkat. IMO (check digit sah) → MMSI TERVERIFIKASI →
 * call sign unik → nama ternormalisasi (wajib konfirmasi). MMSI yang belum
 * terverifikasi TIDAK PERNAH menjadi dasar kecocokan — hanya kandidat.
 * Dua identitas kuat yang menunjuk kapal berbeda → CONFLICT (tanpa pilihan).
 */
export function cocokkanKapal(
  u: { name: string | null; imo: string | null; mmsi: string | null; callSign: string | null },
  kapal: readonly KapalMaster[],
  norm: NormalisasiKapal,
): HasilCocok {
  const imo = u.imo ? norm.imo(u.imo) : null
  const imoSah = !!imo && norm.imoSah(imo)
  const mmsi = u.mmsi ? norm.mmsi(u.mmsi) : null
  const mmsiSah = !!mmsi && norm.mmsiSah(mmsi)
  const cs = u.callSign ? norm.callSign(u.callSign) : null
  const nama = normalisasiNamaKapal(u.name)

  const viaImo = imoSah ? kapal.filter((v) => norm.imo(v.imoNumber) === imo) : []
  const viaMmsi = mmsiSah ? kapal.filter((v) => v.mmsi === mmsi && !!v.mmsiVerifiedAt) : []
  const viaMmsiBelum = mmsiSah ? kapal.filter((v) => v.mmsi === mmsi && !v.mmsiVerifiedAt) : []
  const viaCs = cs ? kapal.filter((v) => norm.callSign(v.callSign) === cs) : []
  const viaNama = nama ? kapal.filter((v) => normalisasiNamaKapal(v.name) === nama) : []
  const viaSebagian =
    nama && nama.length >= 3
      ? kapal.filter((v) => {
          const n = normalisasiNamaKapal(v.name)
          return !!n && n !== nama && n.length >= 3 && (n.includes(nama) || nama.includes(n))
        })
      : []

  const semua = kumpulkanKandidat([
    ...viaImo.map((v) => ({ v, basis: 'EXACT_IMO' })),
    ...viaMmsi.map((v) => ({ v, basis: 'EXACT_MMSI_VERIFIED' })),
    ...viaMmsiBelum.map((v) => ({ v, basis: 'MMSI_UNVERIFIED' })),
    ...viaCs.map((v) => ({ v, basis: 'EXACT_CALL_SIGN' })),
    ...viaNama.map((v) => ({ v, basis: 'NAME_NORMALIZED' })),
    ...viaSebagian.map((v) => ({ v, basis: 'NAME_PARTIAL' })),
  ])
  const hasil = (status: StatusCocok, basis: BasisCocok | null, selectedId: string | null, konfirmasi: boolean): HasilCocok => ({
    ...cocokKosong(status),
    basis,
    selectedId,
    candidates: semua,
    requiresConfirmation: konfirmasi,
  })

  const unikImo = viaImo.length === 1 ? viaImo[0].id : null
  const unikMmsi = viaMmsi.length === 1 ? viaMmsi[0].id : null
  const unikCs = viaCs.length === 1 ? viaCs[0].id : null
  const kuat = new Set([unikImo, unikMmsi, unikCs].filter((x): x is string => !!x))
  if (kuat.size > 1) return hasil('CONFLICT', null, null, false)
  if (viaImo.length > 1 || viaMmsi.length > 1) return hasil('AMBIGUOUS', null, null, false)

  const bertentangan = (v: KapalMaster): boolean => {
    const imoV = norm.imo(v.imoNumber)
    if (imoSah && imoV && imoV !== imo) return true
    if (mmsiSah && v.mmsi && v.mmsiVerifiedAt && v.mmsi !== mmsi) return true
    return false
  }

  const utama = unikImo ?? unikMmsi ?? (viaCs.length === 1 ? unikCs : null)
  if (utama) {
    const v = kapal.find((x) => x.id === utama)!
    if (bertentangan(v)) return hasil('CONFLICT', null, null, false)
    // Kapal lain yang sama namanya / MMSI belum-terverifikasi yang sama tidak mengalahkan identitas kuat.
    return hasil('MATCHED', unikImo ? 'EXACT_IMO' : unikMmsi ? 'EXACT_MMSI_VERIFIED' : 'EXACT_CALL_SIGN', utama, false)
  }
  if (viaCs.length > 1) return hasil('AMBIGUOUS', null, null, false)

  if (viaNama.length === 1) {
    const v = viaNama[0]
    if (bertentangan(v)) return hasil('CONFLICT', null, null, false)
    if (viaMmsiBelum.some((x) => x.id !== v.id)) return hasil('AMBIGUOUS', null, null, false)
    return { ...hasil('MATCHED', 'NAME_NORMALIZED', v.id, true) }
  }
  if (viaNama.length > 1 || semua.length > 0) return hasil('AMBIGUOUS', null, null, false)
  return hasil('NOT_FOUND', null, null, false)
}

/** §10 — principal/customer: nama ternormalisasi; SELALU butuh konfirmasi peninjau. */
export function cocokkanPihak(namaUsulan: string | null, daftar: readonly PihakMaster[]): HasilCocok {
  const nama = normalisasiNamaPihak(namaUsulan)
  if (!nama) return cocokKosong()
  const peringatan = (p: PihakMaster) => (p.isActive === false ? 'INACTIVE' : null)
  const sama = daftar.filter((p) => normalisasiNamaPihak(p.name) === nama)
  const sebagian = daftar.filter((p) => {
    const n = normalisasiNamaPihak(p.name)
    return !!n && n !== nama && n.length >= 3 && nama.length >= 3 && (n.includes(nama) || nama.includes(n))
  })
  const candidates: KandidatCocok[] = [
    ...sama.map((p) => ({ id: p.id, label: p.name, basis: 'NAME_NORMALIZED', warning: peringatan(p) })),
    ...sebagian.map((p) => ({ id: p.id, label: p.name, basis: 'NAME_PARTIAL', warning: peringatan(p) })),
  ].slice(0, MAKS_KANDIDAT)
  const aktif = sama.filter((p) => p.isActive !== false)
  if (aktif.length === 1 && sama.length === 1) {
    return { ...cocokKosong('MATCHED'), basis: 'NAME_NORMALIZED', selectedId: aktif[0].id, candidates, requiresConfirmation: true }
  }
  if (candidates.length > 0) return { ...cocokKosong('AMBIGUOUS'), candidates }
  return cocokKosong()
}

/** §10 — pelabuhan: UN/LOCODE dulu, lalu nama (konfirmasi). Port TIDAK pernah dibuat intake. */
export function cocokkanPort(namaUsulan: string | null, unlocodeUsulan: string | null, ports: readonly PortMaster[]): HasilCocok {
  const kode = normalisasiUnlocode(unlocodeUsulan)
  const nama = normalisasiNamaPort(namaUsulan)
  const viaKode = kode ? ports.filter((p) => normalisasiUnlocode(p.unlocode) === kode) : []
  const viaNama = nama ? ports.filter((p) => normalisasiNamaPort(p.name) === nama) : []
  const viaSebagian = nama && nama.length >= 3
    ? ports.filter((p) => {
        const n = normalisasiNamaPort(p.name)
        return !!n && n !== nama && (n.includes(nama) || nama.includes(n))
      })
    : []
  const lihat = new Map<string, KandidatCocok>()
  for (const [p, basis] of [
    ...viaKode.map((p) => [p, 'UNLOCODE'] as const),
    ...viaNama.map((p) => [p, 'NAME_NORMALIZED'] as const),
    ...viaSebagian.map((p) => [p, 'NAME_PARTIAL'] as const),
  ]) {
    if (!lihat.has(p.id)) lihat.set(p.id, { id: p.id, label: p.unlocode ? `${p.name} (${p.unlocode})` : p.name, basis })
  }
  const candidates = Array.from(lihat.values()).slice(0, MAKS_KANDIDAT)

  if (viaKode.length === 1) {
    if (viaNama.length > 0 && !viaNama.some((p) => p.id === viaKode[0].id)) {
      return { ...cocokKosong('CONFLICT'), candidates }
    }
    return { ...cocokKosong('MATCHED'), basis: 'UNLOCODE', selectedId: viaKode[0].id, candidates }
  }
  if (viaNama.length === 1 && viaKode.length === 0) {
    return { ...cocokKosong('MATCHED'), basis: 'NAME_NORMALIZED', selectedId: viaNama[0].id, candidates, requiresConfirmation: true }
  }
  if (candidates.length > 0) return { ...cocokKosong('AMBIGUOUS'), candidates }
  return cocokKosong()
}

export type MasterTenant = {
  vessels: readonly KapalMaster[]
  principals: readonly PihakMaster[]
  customers: readonly PihakMaster[]
  ports: readonly PortMaster[]
}

const dipilihManusia = (m: HasilCocok | undefined): boolean =>
  !!m && (m.basis === 'SELECTED_BY_REVIEWER' || m.basis === 'CREATED_BY_REVIEWER')

/**
 * Hitung ulang seluruh pencocokan. Pilihan peninjau DIPERTAHANKAN kecuali field
 * sumbernya diubah (`berubah`) — mengubah nama kapal membatalkan pilihan kapal itu.
 * Pilihan yang id-nya sudah tak ada di master (terhapus) dibuang.
 */
export function cocokkanSemua(
  p: Proposal,
  master: MasterTenant,
  norm: NormalisasiKapal,
  sebelum: Matches | null,
  berubah: ReadonlySet<string> = new Set(),
  opsi: { konfirmasiSemua?: boolean } = {},
): Matches {
  // Step 4F — masukan visual: kecocokan otomatis apa pun (termasuk IMO persis) wajib dikonfirmasi.
  // E5 Step 2 — begitu juga kecocokan yang memakai nilai OCR_CORRECTED (dipulihkan dari salah baca OCR).
  const wajib = (h: HasilCocok, ocr = false): HasilCocok =>
    (opsi.konfirmasiSemua || ocr) && h.status === 'MATCHED' && !dipilihManusia(h) ? { ...h, requiresConfirmation: true } : h
  const ocr = (...f: FieldUsulan[]): boolean => f.some((x) => x.value !== null && x.flags.includes('OCR_CORRECTED'))
  const pertahankan = (lama: HasilCocok | undefined, kunci: string, ada: (id: string) => boolean): HasilCocok | null => {
    if (!lama || berubah.has(kunci)) return null
    if (lama.leftEmpty) return lama
    if (dipilihManusia(lama) && lama.selectedId && ada(lama.selectedId)) return lama
    return null
  }
  const vessels = p.vessels.map((v, i) => {
    const tetap = pertahankan(sebelum?.vessels[i], `vessel:${i}`, (id) => master.vessels.some((x) => x.id === id))
    if (tetap) return tetap
    const baru = cocokkanKapal(
      { name: v.name.value, imo: v.imo.value, mmsi: v.mmsi.value, callSign: v.callSign.value },
      master.vessels,
      norm,
    )
    return pertahankanKonfirmasi(sebelum?.vessels[i], wajib(baru, ocr(v.name, v.imo, v.mmsi, v.callSign)), berubah.has(`vessel:${i}`))
  })
  const principal =
    pertahankan(sebelum?.principal, 'principal', (id) => master.principals.some((x) => x.id === id)) ??
    pertahankanKonfirmasi(sebelum?.principal, wajib(cocokkanPihak(p.principalName.value, master.principals), ocr(p.principalName)), berubah.has('principal'))
  const customer =
    pertahankan(sebelum?.customer, 'customer', (id) => master.customers.some((x) => x.id === id && x.isActive !== false)) ??
    pertahankanKonfirmasi(sebelum?.customer, wajib(cocokkanPihak(p.customerName.value, master.customers), ocr(p.customerName)), berubah.has('customer'))
  const port =
    pertahankan(sebelum?.port, 'port', (id) => master.ports.some((x) => x.id === id)) ??
    pertahankanKonfirmasi(sebelum?.port, wajib(cocokkanPort(p.portName.value, p.portUnlocode.value, master.ports), ocr(p.portName, p.portUnlocode)), berubah.has('port'))
  return { vessels, principal, customer, port }
}

/** Konfirmasi atas kecocokan otomatis tetap berlaku hanya bila hasilnya menunjuk id yang SAMA. */
function pertahankanKonfirmasi(lama: HasilCocok | undefined, baru: HasilCocok, berubah: boolean): HasilCocok {
  if (!lama || berubah || !lama.confirmed || !baru.selectedId || lama.selectedId !== baru.selectedId) return baru
  return { ...baru, confirmed: true }
}

/** Kecocokan yang boleh dipakai saat approve: dipilih/dibuat manusia, atau otomatis & (bila perlu) dikonfirmasi. */
export function idTerpakai(m: HasilCocok): string | null {
  if (m.leftEmpty || !m.selectedId) return null
  if (dipilihManusia(m)) return m.selectedId
  if (m.status !== 'MATCHED') return null
  if (m.requiresConfirmation && !m.confirmed) return null
  return m.selectedId
}

/**
 * Kapal utama (Voyage.vesselId) = kapal ber-peran TUG bila ada pasangan, selain itu
 * kapal pertama yang tidak dikeluarkan. Mengembalikan indeks di proposal.vessels.
 */
export function indeksKapalUtama(p: Proposal): number {
  const aktif = p.vessels.map((v, i) => ({ v, i })).filter((x) => !x.v.excluded)
  if (aktif.length === 0) return -1
  const tug = aktif.find((x) => x.v.role.value === 'TUG')
  return (tug ?? aktif[0]).i
}

// ----------------------------------------------------------------- duplikat

export type KandidatVoyage = {
  id: string
  voyageNumber: string
  status: string
  portId: string | null
  portName?: string | null
  eta: string | null
  vesselIds: readonly string[]
  vesselName?: string | null
}
export type KandidatIntakeLain = { id: string; portId: string | null; eta: string | null; vesselIds: readonly string[] }

export type KandidatDuplikat = {
  type: 'VOYAGE' | 'INTAKE'
  id: string
  label: string
  status: string
  portId: string | null
  portName: string | null
  eta: string | null
  vesselName: string | null
  level: LevelDuplikat
  reason: string
}

export type HasilDuplikat = { level: LevelDuplikat; candidates: KandidatDuplikat[] }

/**
 * §11 — tiga level deterministik. Kandidat: voyage tenant yang sama, tidak terhapus,
 * status bukan CLOSED/CANCELLED, dengan kapal utama ATAU salah satu kapal
 * VoyageVessel sama dengan kapal usulan; plus intake lain yang masih aktif.
 */
export function nilaiDuplikat(
  u: { vesselIds: readonly string[]; portId: string | null; eta: string | null },
  voyages: readonly KandidatVoyage[],
  intakeLain: readonly KandidatIntakeLain[] = [],
): HasilDuplikat {
  const kapal = new Set(u.vesselIds)
  const candidates: KandidatDuplikat[] = []
  if (kapal.size === 0) return { level: 'NO_DUPLICATE', candidates }

  for (const v of voyages) {
    if ((STATUS_VOYAGE_DIABAIKAN as readonly string[]).includes(v.status)) continue
    if (!v.vesselIds.some((id) => kapal.has(id))) continue
    const d = selisihHari(u.eta, v.eta)
    const pelabuhanSama = !!u.portId && !!v.portId && u.portId === v.portId
    const aktif = (STATUS_VOYAGE_AKTIF as readonly string[]).includes(v.status)
    const selesai = (STATUS_VOYAGE_SELESAI as readonly string[]).includes(v.status)
    let level: LevelDuplikat = 'NO_DUPLICATE'
    let reason = ''
    if (pelabuhanSama && aktif && ((d !== null && d <= AMBANG_DUPLIKAT_LIKELY_HARI) || v.eta === null)) {
      level = 'LIKELY_DUPLICATE'
      reason = v.eta === null ? 'SAME_PORT_ACTIVE_NO_ETA' : 'SAME_PORT_ACTIVE_ETA_CLOSE'
    } else if (d !== null && d <= AMBANG_DUPLIKAT_POSSIBLE_HARI) {
      level = 'POSSIBLE_DUPLICATE'
      // Pelabuhan yang berbeda adalah alasan terkuat ini BUKAN duplikat, jadi
      // disebut terpisah — peninjau tak perlu membandingkan sendiri (4G C-2).
      reason =
        !u.portId || !v.portId
          ? 'ETA_WITHIN_WINDOW_PORT_UNKNOWN'
          : u.portId !== v.portId
            ? 'ETA_WITHIN_WINDOW_OTHER_PORT'
            : 'ETA_WITHIN_WINDOW'
    } else if (!u.portId || !v.portId) {
      level = 'POSSIBLE_DUPLICATE'
      reason = 'PORT_MISSING'
    } else if (!u.eta || !v.eta) {
      level = 'POSSIBLE_DUPLICATE'
      reason = 'ETA_MISSING'
    } else if (selesai && pelabuhanSama && d !== null && d <= AMBANG_DUPLIKAT_LIKELY_HARI) {
      level = 'POSSIBLE_DUPLICATE'
      reason = 'RECENTLY_COMPLETED_SAME_PORT'
    }
    if (level === 'NO_DUPLICATE') continue
    candidates.push({
      type: 'VOYAGE',
      id: v.id,
      label: v.voyageNumber,
      status: v.status,
      portId: v.portId,
      portName: v.portName ?? null,
      eta: v.eta,
      vesselName: v.vesselName ?? null,
      level,
      reason,
    })
  }

  for (const it of intakeLain) {
    if (!it.vesselIds.some((id) => kapal.has(id))) continue
    const d = selisihHari(u.eta, it.eta)
    if (d === null || d > AMBANG_DUPLIKAT_LIKELY_HARI) continue
    candidates.push({
      type: 'INTAKE',
      id: it.id,
      label: it.id,
      status: 'OPEN_INTAKE',
      portId: it.portId,
      portName: null,
      eta: it.eta,
      vesselName: null,
      level: 'POSSIBLE_DUPLICATE',
      reason: 'OTHER_ACTIVE_INTAKE',
    })
  }

  candidates.sort((a, b) => peringkatDuplikat(b.level) - peringkatDuplikat(a.level))
  const level = candidates.reduce<LevelDuplikat>(
    (acc, c) => (peringkatDuplikat(c.level) > peringkatDuplikat(acc) ? c.level : acc),
    'NO_DUPLICATE',
  )
  return { level, candidates: candidates.slice(0, 20) }
}

/** Id kapal terpilih (tidak dikeluarkan) — dasar pencarian duplikat. */
export function kapalTerpilih(p: Proposal, m: Matches): string[] {
  const ids: string[] = []
  p.vessels.forEach((v, i) => {
    if (v.excluded) return
    const id = m.vessels[i] ? idTerpakai(m.vessels[i]) ?? m.vessels[i].selectedId : null
    if (id && !ids.includes(id)) ids.push(id)
  })
  return ids
}

// ----------------------------------------------------------------- approval

export type SyaratApproval =
  | 'STATUS_NOT_REVIEWABLE'
  | 'CLASSIFICATION_NOT_SUPPORTED'
  | 'PRIMARY_VESSEL_UNRESOLVED'
  | 'VESSEL_UNRESOLVED'
  | 'VESSEL_CONFIRMATION_REQUIRED'
  | 'DUPLICATE_VESSEL_SELECTED'
  | 'PORT_UNRESOLVED'
  | 'PORT_CONFIRMATION_REQUIRED'
  | 'ETA_MISSING'
  | 'PRINCIPAL_UNRESOLVED'
  | 'CUSTOMER_UNRESOLVED'
  | 'SOURCE_FIELDS_UNCONFIRMED'
  | 'CARGO_CONFIRMATION_REQUIRED'
  | 'DUPLICATE_DECISION_REQUIRED'
  | 'DUPLICATE_REVIEW_CONFIRMATION_REQUIRED'
  | 'DUPLICATE_REASON_REQUIRED'
  | 'PORTAL_ACK_REQUIRED'

export type KeputusanApproval = {
  duplicateDecision: string | null
  decisionReason: string | null
  /** POSSIBLE: "sudah diperiksa"; LIKELY: konfirmasi eksplisit. */
  duplicateConfirmed: boolean
  portalExposureAck: boolean
}

/** Field ber-UNVERIFIED_SOURCE yang belum dikonfirmasi, sebagai path (mis. "vessels.0.name"). */
export function fieldBelumDikonfirmasi(p: Proposal): string[] {
  const hasil: string[] = []
  const cek = (path: string, f: FieldUsulan<unknown>) => {
    if (f.value !== null && f.flags.includes('UNVERIFIED_SOURCE') && !f.confirmed) hasil.push(path)
  }
  p.vessels.forEach((v, i) => {
    if (v.excluded) return
    for (const k of ['name', 'imo', 'mmsi', 'callSign'] as const) cek(`vessels.${i}.${k}`, v[k])
  })
  for (const k of ['principalName', 'customerName', 'portName', 'portUnlocode'] as const) cek(k, p[k])
  return hasil
}

/**
 * §15 — daftar syarat yang BELUM terpenuhi (kosong = boleh approve). Dipanggil
 * server saat approve (dengan duplikat yang baru dihitung ulang) dan saat layar
 * review dibuka (keputusan kosong → syarat keputusan ikut tampil).
 */
export function syaratApproval(a: {
  status: string
  classification: string
  proposal: Proposal
  matches: Matches
  duplicateLevel: string
  keputusan: KeputusanApproval
  /** Jumlah akses portal aktif untuk customer terpilih. */
  portalAccessCount: number
  /** 'NEEDS_REVIEW' untuk approve, 'FAILED' untuk retry. */
  statusDiharapkan?: StatusIntake
}): SyaratApproval[] {
  const s: SyaratApproval[] = []
  const { proposal: p, matches: m, keputusan: k } = a
  if (a.status !== (a.statusDiharapkan ?? 'NEEDS_REVIEW')) s.push('STATUS_NOT_REVIEWABLE')
  if (!(KLASIFIKASI_PILOT as readonly string[]).includes(a.classification)) s.push('CLASSIFICATION_NOT_SUPPORTED')

  const utama = indeksKapalUtama(p)
  if (utama < 0 || !m.vessels[utama] || !idTerpakai(m.vessels[utama])) s.push('PRIMARY_VESSEL_UNRESOLVED')
  const terpakai: string[] = []
  let belum = false
  let perluKonfirmasi = false
  p.vessels.forEach((v, i) => {
    if (v.excluded) return
    const h = m.vessels[i]
    const id = h ? idTerpakai(h) : null
    if (id) {
      terpakai.push(id)
      return
    }
    if (h && h.status === 'MATCHED' && h.requiresConfirmation && !h.confirmed) perluKonfirmasi = true
    else belum = true
  })
  if (belum) s.push('VESSEL_UNRESOLVED')
  if (perluKonfirmasi) s.push('VESSEL_CONFIRMATION_REQUIRED')
  if (new Set(terpakai).size !== terpakai.length) s.push('DUPLICATE_VESSEL_SELECTED')

  if (!idTerpakai(m.port)) {
    s.push(m.port.status === 'MATCHED' && m.port.requiresConfirmation && !m.port.confirmed ? 'PORT_CONFIRMATION_REQUIRED' : 'PORT_UNRESOLVED')
  }
  if (!p.eta.value || !tanggalSah(p.eta.value)) s.push('ETA_MISSING')
  if (!m.principal.leftEmpty && !idTerpakai(m.principal)) s.push('PRINCIPAL_UNRESOLVED')
  if (!m.customer.leftEmpty && !idTerpakai(m.customer)) s.push('CUSTOMER_UNRESOLVED')
  // Eval-4 prep — muatan yang belum tepercaya (PDF/gambar, OCR, operasi ambigu, baris lama tanpa
  // jejak validasi) tak boleh menjadi voyage cargo / tonase finance tanpa konfirmasi manusia.
  if (p.cargoes.some((c) => !cargoTepercaya(c))) s.push('CARGO_CONFIRMATION_REQUIRED')
  // Step 4F — SOURCE_FIELDS_UNCONFIRMED tidak lagi disyaratkan: untuk masukan PDF/gambar
  // setiap kecocokan master wajib dikonfirmasi satu per satu (cocokkanSemua konfirmasiSemua),
  // sehingga pemeriksaan tetap nyata walau dokumen asli tidak disimpan.

  const level = a.duplicateLevel
  if (level !== 'NO_DUPLICATE') {
    if (k.duplicateDecision !== 'CONTINUE_AS_NEW') s.push('DUPLICATE_DECISION_REQUIRED')
    else if (!k.duplicateConfirmed) s.push('DUPLICATE_REVIEW_CONFIRMATION_REQUIRED')
    if (level === 'LIKELY_DUPLICATE' && k.duplicateDecision === 'CONTINUE_AS_NEW' && (k.decisionReason ?? '').trim().length < MIN_PANJANG_ALASAN) {
      s.push('DUPLICATE_REASON_REQUIRED')
    }
  }
  if (idTerpakai(m.customer) && a.portalAccessCount > 0 && !k.portalExposureAck) s.push('PORTAL_ACK_REQUIRED')
  return s
}

// ----------------------------------------------------------------- penyuntingan

export const FIELD_BISA_DIEDIT = [
  'principalName',
  'customerName',
  'portName',
  'portUnlocode',
  'jetty',
  'eta',
  'etb',
  'etc',
  'etd',
  'agencyType',
  'clientReference',
] as const
export type FieldBisaDiedit = (typeof FIELD_BISA_DIEDIT)[number]
export const FIELD_TANGGAL: readonly string[] = ['eta', 'etb', 'etc', 'etd']
export const FIELD_KAPAL_BISA_DIEDIT = ['name', 'imo', 'mmsi', 'callSign', 'vesselType', 'role'] as const

/** Entitas pencocokan yang terdampak oleh perubahan satu field. */
export function kunciCocokUntukField(field: string): string | null {
  if (field === 'principalName') return 'principal'
  if (field === 'customerName') return 'customer'
  if (field === 'portName' || field === 'portUnlocode') return 'port'
  return null
}

export const fieldDiedit = <T = string>(lama: FieldUsulan<T>, nilai: T | null): FieldUsulan<T> => ({
  value: nilai,
  source: nilai === null ? 'EMPTY' : 'USER_EDITED',
  flags: [],
  extracted: lama.extracted,
  confirmed: true,
})

/** Kontak (PII) dikosongkan saat status terminal (§23). */
export function tanpaKontak(p: Proposal): Proposal {
  return { ...p, contact: null }
}

/**
 * Catatan voyage dari field yang tak punya kolom sendiri (jetty, rujukan, tanggal permintaan).
 * Step 4F — TANPA id internal: jejak intake disimpan di Voyage.sourceIntakeId + AuditLog.
 */
export function catatanVoyage(p: Proposal): string {
  const baris = ['Dibuat dari Intake Kunjungan Kapal.']
  if (p.clientReference.value) baris.push(`Rujukan pengirim: ${p.clientReference.value}`)
  if (p.jetty.value) baris.push(`Jetty: ${p.jetty.value}`)
  if (p.requestDate.value) baris.push(`Tanggal permintaan: ${p.requestDate.value}`)
  return baris.join('\n')
}

// ----------------------------------------------------------------- bentuk JSON tersimpan

/**
 * JSON kanonik (kunci objek terurut). WAJIB untuk membandingkan nilai hasil hitung
 * dengan kolom Json tersimpan: PostgreSQL JSONB menyusun ulang urutan kunci.
 */
export function jsonKanonik(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(jsonKanonik).join(',')}]`
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    return `{${Object.keys(v as Record<string, unknown>)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${jsonKanonik((v as Record<string, unknown>)[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(v) ?? 'null'
}

/** Validasi bentuk JSON `proposal` saat DIBACA — baris rusak tak boleh diam-diam dipakai approve. */
export function proposalSah(v: unknown): v is Proposal {
  if (!isObj(v) || !Array.isArray(v.vessels) || !Array.isArray(v.cargoes)) return false
  const f = (x: unknown) => isObj(x) && 'value' in x && typeof x.source === 'string' && Array.isArray(x.flags)
  const kunci = ['principalName', 'customerName', 'portName', 'portUnlocode', 'jetty', 'eta', 'etb', 'etc', 'etd', 'agencyType', 'clientReference', 'requestDate']
  if (!kunci.every((k) => f(v[k]))) return false
  return v.vessels.every((k) => isObj(k) && ['name', 'imo', 'mmsi', 'callSign', 'vesselType', 'role'].every((x) => f(k[x])))
}

export function matchesSah(v: unknown, jumlahKapal: number): v is Matches {
  const h = (x: unknown) => isObj(x) && typeof x.status === 'string' && Array.isArray(x.candidates)
  return isObj(v) && Array.isArray(v.vessels) && v.vessels.length === jumlahKapal && v.vessels.every(h) && h(v.principal) && h(v.customer) && h(v.port)
}

// ----------------------------------------------------------------- tampilan (Step 4F)

/** Urutan kekuatan dasar kecocokan — kandidat dengan basis gabungan ditampilkan dengan yang terkuat. */
export const URUTAN_BASIS = [
  'EXACT_IMO',
  'EXACT_MMSI_VERIFIED',
  'EXACT_CALL_SIGN',
  'UNLOCODE',
  'MMSI_UNVERIFIED',
  'NAME_NORMALIZED',
  'NAME_PARTIAL',
] as const

export function basisTerkuat(basis: string): string {
  const bagian = basis.split('+')
  return URUTAN_BASIS.find((b) => bagian.includes(b)) ?? bagian[0]
}

/** Kandidat berisiko: memilihnya wajib melalui konfirmasi eksplisit di layar. */
export function kandidatBerisiko(h: HasilCocok, k: KandidatCocok): boolean {
  const b = k.basis.split('+')
  return h.status === 'CONFLICT' || b.includes('MMSI_UNVERIFIED') || (b.includes('NAME_PARTIAL') && b.length === 1) || !!k.warning
}

/** Kandidat selain yang sedang terpilih (hindari nama yang sama tampil dua kali). */
export const kandidatLain = (h: HasilCocok): KandidatCocok[] => h.candidates.filter((c) => c.id !== h.selectedId)

const NAMA_IDENTITAS: Record<'id' | 'en', Record<string, string>> = {
  id: { EXACT_IMO: 'IMO', EXACT_MMSI_VERIFIED: 'MMSI terverifikasi', EXACT_CALL_SIGN: 'call sign', NAME_NORMALIZED: 'nama' },
  en: { EXACT_IMO: 'IMO', EXACT_MMSI_VERIFIED: 'verified MMSI', EXACT_CALL_SIGN: 'call sign', NAME_NORMALIZED: 'name' },
}

const KALIMAT_KONFLIK = {
  id: {
    dua: (a: string, na: string, b: string, nb: string) => `${a} cocok dengan ${na}, tetapi ${b} cocok dengan ${nb}.`,
    satu: (a: string, na: string, dok: string) => `${a} cocok dengan ${na}, tetapi ${dok} di dokumen berbeda dengan data master kapal itu.`,
    identitas: 'identitas',
    umum: 'Identitas kapal di dokumen saling bertentangan dengan data master.',
    pastikan: 'Pastikan kapal yang benar sebelum memilih.',
  },
  en: {
    dua: (a: string, na: string, b: string, nb: string) => `${a} matches ${na}, but ${b} matches ${nb}.`,
    satu: (a: string, na: string, dok: string) => `${a} matches ${na}, but the ${dok} in the document differs from that vessel’s master data.`,
    identitas: 'identity',
    umum: 'The vessel identity in the document conflicts with master data.',
    pastikan: 'Make sure you choose the right vessel.',
  },
}

/**
 * Penjelasan konflik identitas kapal dalam bahasa operator, mis.
 * "IMO cocok dengan Kapal A, tetapi MMSI terverifikasi cocok dengan Kapal B."
 */
export function penjelasanKonflik(
  h: HasilCocok,
  usulan: { imo: string | null; mmsi: string | null },
  lang: 'id' | 'en' = 'id',
): string | null {
  if (h.status !== 'CONFLICT') return null
  const K = KALIMAT_KONFLIK[lang]
  const perKapal: Array<{ nama: string; identitas: string }> = []
  for (const c of h.candidates) {
    const identitas = c.basis.split('+').map((b) => NAMA_IDENTITAS[lang][b]).filter((x): x is string => !!x)
    if (identitas.length) perKapal.push({ nama: c.label.split(' · ')[0], identitas: identitas.join(' & ') })
  }
  if (perKapal.length >= 2) {
    const [a, b] = perKapal
    return `${K.dua(a.identitas, a.nama, b.identitas, b.nama)} ${K.pastikan}`
  }
  if (perKapal.length === 1) {
    const dok = [usulan.imo ? `IMO ${usulan.imo}` : null, usulan.mmsi ? `MMSI ${usulan.mmsi}` : null].filter(Boolean).join(' / ')
    return `${K.satu(perKapal[0].identitas, perKapal[0].nama, dok || K.identitas)} ${K.pastikan}`
  }
  return `${K.umum} ${K.pastikan}`
}

/** Tanggal kalender 'YYYY-MM-DD' → "01 Nov 2026" (tanpa geser zona waktu). */
export function formatTanggal(ymd: string | null | undefined, lang: 'id' | 'en' = 'id'): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd ?? '—'
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatJumlah(n: number | null | undefined, lang: 'id' | 'en' = 'id'): string {
  return n === null || n === undefined ? '' : n.toLocaleString(lang === 'id' ? 'id-ID' : 'en-GB', { maximumFractionDigits: 3 })
}
