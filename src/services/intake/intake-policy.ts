// Kebijakan MURNI Vessel Call Intake — PRD-004 Step 3.
//
//   AI extracts → SYSTEM VERIFIES (berkas ini) → Human approves → createVoyage() writes → Audit
//
// Semua yang menentukan identitas, duplikat, transisi status, dan syarat approval
// ada di sini, deterministik, tanpa DB/jaringan/LLM. Keluaran AI diperlakukan
// sebagai masukan TIDAK TEPERCAYA: bentuknya diperiksa ulang di validasiEkstraksi().
//
// TANPA impor runtime (pola monitoring-policy.ts / gate.ts) supaya Node bisa
// mengujinya langsung (prisma/check-intake-policy.mjs). Normalisasi identitas
// kapal TIDAK disalin: fungsi dari lib/vessels.ts disuntikkan lewat `NormalisasiKapal`,
// sehingga service dan uji memakai fungsi yang PERSIS sama.

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
export type FlagField = 'NOT_IN_SOURCE' | 'UNVERIFIED_SOURCE' | 'IMO_CHECK_DIGIT' | 'DATE_OUT_OF_RANGE' | 'NAME_ONLY_MATCH'

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

export type CargoUsulan = {
  name: string
  quantity: number | null
  unit: string | null
  operation: 'LOAD' | 'DISCHARGE' | null
  source: SumberField
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

/** Nama pelabuhan: huruf besar, tanda baca → spasi, awalan "PORT OF"/"PELABUHAN" dibuang. */
export function normalisasiNamaPort(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/^(PORT OF|PELABUHAN) /, '')
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

  /** Identitas & nama: harus tertulis di sumber (teks) atau ditandai belum terverifikasi (PDF/gambar). */
  const identitas = (nilai: string | null, pembanding = nilai): FieldUsulan => {
    if (!nilai) return fieldKosong()
    if (berteks) {
      return adaDiSumber(pembanding ?? nilai, sumberKompak) ? fieldDokumen(nilai) : fieldKosong(nilai, ['NOT_IN_SOURCE'])
    }
    return fieldDokumen(nilai, ['UNVERIFIED_SOURCE'])
  }
  const biasa = (nilai: string | null): FieldUsulan => (nilai ? fieldDokumen(nilai) : fieldKosong())
  const tanggal = (v: unknown): FieldUsulan => {
    const mentah = teks(v, 40)
    if (!mentah) return fieldKosong()
    const t = tanggalSah(mentah)
    if (!t || !dalamRentangTanggal(t, k.hariIni)) return fieldKosong(mentah, ['DATE_OUT_OF_RANGE'])
    return fieldDokumen(t)
  }
  const pilih = <T extends string>(v: unknown, daftar: readonly T[]): FieldUsulan<T> => {
    const t = teks(v, 40)?.toUpperCase() ?? null
    return t && (daftar as readonly string[]).includes(t) ? fieldDokumen(t as T) : fieldKosong<T>()
  }

  const kapalMentah = Array.isArray(o.vessels) ? o.vessels : []
  const vessels: KapalUsulan[] = []
  for (const kv of kapalMentah.slice(0, MAKS_KAPAL_INTAKE)) {
    const v = isObj(kv) ? kv : {}
    const imoMentah = teks(v.imo, 40)
    const imo = imoMentah ? k.norm.imo(imoMentah) : null
    let imoField = identitas(imo, imo)
    if (imo && imoField.value && !k.norm.imoSah(imo)) imoField = { ...imoField, flags: [...imoField.flags, 'IMO_CHECK_DIGIT'] }
    const mmsiMentah = teks(v.mmsi, 40)
    const mmsi = mmsiMentah ? k.norm.mmsi(mmsiMentah) : null
    const mmsiField = mmsi && k.norm.mmsiSah(mmsi) ? identitas(mmsi) : mmsiMentah ? fieldKosong(mmsiMentah) : fieldKosong()
    const cs = k.norm.callSign(teks(v.callSign, 40))
    const kapal: KapalUsulan = {
      name: identitas(teks(v.name)),
      imo: imoField,
      mmsi: mmsiField,
      callSign: identitas(cs),
      vesselType: biasa(teks(v.vesselType, 80)),
      role: pilih(v.role, PERAN_KAPAL),
      excluded: false,
    }
    if (kapal.name.value || kapal.imo.value || kapal.mmsi.value || kapal.callSign.value) vessels.push(kapal)
  }

  const cargoMentah = Array.isArray(o.cargoes) ? o.cargoes : []
  const cargoes: CargoUsulan[] = []
  for (const c of cargoMentah.slice(0, MAKS_CARGO_INTAKE)) {
    const v = isObj(c) ? c : {}
    const name = teks(v.name)
    if (!name) continue
    cargoes.push({
      name,
      quantity: angkaTakNegatif(v.quantity),
      unit: teks(v.unit, 20),
      operation: pilih(v.operation, OPERASI_CARGO).value,
      source: 'SOURCE_DOCUMENT',
    })
  }

  const kontak = isObj(o.contact) ? o.contact : null
  const contact: KontakUsulan | null = kontak
    ? { name: teks(kontak.name), email: teks(kontak.email), phone: teks(kontak.phone, 40) }
    : null

  const unlocode = normalisasiUnlocode(teks(o.portUnlocode, 20))
  const proposal: Proposal = {
    vessels,
    principalName: identitas(teks(o.principalName)),
    customerName: identitas(teks(o.customerName)),
    portName: identitas(teks(o.portName)),
    portUnlocode: identitas(unlocode),
    jetty: biasa(teks(o.jetty)),
    eta: tanggal(o.eta),
    etb: tanggal(o.etb),
    etc: tanggal(o.etc),
    etd: tanggal(o.etd),
    agencyType: pilih(o.agencyType, JENIS_KEAGENAN),
    clientReference: biasa(teks(o.clientReference)),
    requestDate: tanggal(o.requestDate),
    cargoes,
    contact: contact && (contact.name || contact.email || contact.phone) ? contact : null,
    classificationReason: null,
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

/** §7 — identitas kapal apa pun DAN (pelabuhan atau ETA). */
export function syaratMinimumTerpenuhi(p: Proposal): boolean {
  const adaKapal = p.vessels.some((v) => !v.excluded && (v.name.value || v.imo.value || v.mmsi.value || v.callSign.value))
  return adaKapal && !!(p.portName.value || p.portUnlocode.value || p.eta.value)
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
  const wajib = (h: HasilCocok): HasilCocok =>
    opsi.konfirmasiSemua && h.status === 'MATCHED' && !dipilihManusia(h) ? { ...h, requiresConfirmation: true } : h
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
    return pertahankanKonfirmasi(sebelum?.vessels[i], wajib(baru), berubah.has(`vessel:${i}`))
  })
  const principal =
    pertahankan(sebelum?.principal, 'principal', (id) => master.principals.some((x) => x.id === id)) ??
    pertahankanKonfirmasi(sebelum?.principal, wajib(cocokkanPihak(p.principalName.value, master.principals)), berubah.has('principal'))
  const customer =
    pertahankan(sebelum?.customer, 'customer', (id) => master.customers.some((x) => x.id === id && x.isActive !== false)) ??
    pertahankanKonfirmasi(sebelum?.customer, wajib(cocokkanPihak(p.customerName.value, master.customers)), berubah.has('customer'))
  const port =
    pertahankan(sebelum?.port, 'port', (id) => master.ports.some((x) => x.id === id)) ??
    pertahankanKonfirmasi(sebelum?.port, wajib(cocokkanPort(p.portName.value, p.portUnlocode.value, master.ports)), berubah.has('port'))
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
      reason = 'ETA_WITHIN_WINDOW'
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
