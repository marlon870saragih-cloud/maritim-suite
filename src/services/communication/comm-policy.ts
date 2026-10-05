// Komunikasi klien WA-1 — kebijakan MURNI (Step 2A). TANPA impor saat jalan.
//
// Sumber kebenaran: docs/whatsapp/PRD-WA-1.md v0.2 (frozen) + keputusan owner
// Q4/Q5/Q7/Q8/Q9/Q10 (audit WA-1 Step 1). Berkas ini hanya MEMUTUSKAN dari fakta
// yang disuntikkan pemanggil:
//   • gerbang INTERNAL_FAKE_TEST (flag WA khusus + NODE_ENV ≠ production)
//   • allowlist empat keluarga event pilot + kunci candidate
//   • kode alasan (§13.3 + SIGNAL_DISMISSED/SIGNAL_EXPIRED dari Q4)
//   • kelayakan sinyal P-08 (D-13) per sinyal & per grup ETA/ETD
//   • revalidasi sumber jadwal (termasuk supersession ketat Q5) & milestone
//   • zona waktu IANA bernama + format waktu lokal operasional (Q10)
//   • mesin status pesan (§12.3) & gerbang approval saat Send
//
// Tidak membaca database, tidak membaca process.env, tidak memanggil jaringan,
// tidak memakai LLM. Service (Step 2C/2E) membaca fakta lalu memanggil fungsi di
// sini — dua kali: sebelum Prepare dan sebelum Send. Diuji langsung oleh Node
// lewat prisma/check-comm-policy.mjs.

// ================================================================== gerbang

export const MODE_KOMUNIKASI = 'INTERNAL_FAKE_TEST' as const
export const PENYEDIA_KOMUNIKASI = 'FAKE' as const
/** Flag WA khusus (Q9: TANPA TAH_CORE_ENABLED). Harus PERSIS "true". */
export const FLAG_KOMUNIKASI = 'WA1_INTERNAL_FAKE_TEST_ENABLED'

export type KonfigurasiKomunikasi =
  | { aktif: true; mode: typeof MODE_KOMUNIKASI; penyedia: typeof PENYEDIA_KOMUNIKASI; alasan: null }
  | { aktif: false; mode: typeof MODE_KOMUNIKASI; penyedia: typeof PENYEDIA_KOMUNIKASI; alasan: 'FEATURE_DISABLED' | 'ENV_NOT_ALLOWED' }

/**
 * Gagal tertutup. Produksi diperiksa PALING DULU dan tak bisa dibuka flag apa pun
 * (D-12: tanpa pengecualian VM produksi). Variasi "Production"/" production " juga
 * dianggap produksi — salah tolak lebih aman daripada salah izinkan.
 */
export function bacaKonfigurasiKomunikasi(env: Readonly<Record<string, string | undefined>>): KonfigurasiKomunikasi {
  const dasar = { mode: MODE_KOMUNIKASI, penyedia: PENYEDIA_KOMUNIKASI } as const
  if ((env.NODE_ENV ?? '').trim().toLowerCase() === 'production') return { ...dasar, aktif: false, alasan: 'ENV_NOT_ALLOWED' }
  if ((env[FLAG_KOMUNIKASI] ?? '').trim() !== 'true') return { ...dasar, aktif: false, alasan: 'FEATURE_DISABLED' }
  return { ...dasar, aktif: true, alasan: null }
}

/** SG-01 — mode/penyedia selain INTERNAL_FAKE_TEST/FAKE ditolak tanpa fallback live. */
export function periksaModeFake(a: { mode: unknown; penyedia: unknown }): Hasil<null> {
  return a.mode === MODE_KOMUNIKASI && a.penyedia === PENYEDIA_KOMUNIKASI ? lolos(null) : tolak('MODE_NOT_FAKE')
}

// ============================================================== kode alasan

/**
 * PRD §13.3 (minimum) + Q4 (SIGNAL_DISMISSED, SIGNAL_EXPIRED) + SIGNAL_STATE_INVALID (gagal tertutup)
 * + REVISED (D-2B-03: revisi lama → CANCELED saat revisi baru dibuat).
 */
export const KODE_ALASAN = [
  'EVENT_NOT_ALLOWED',
  'SOURCE_NOT_FOUND',
  'SOURCE_DELETED',
  'SOURCE_SUPERSEDED',
  'SCHEDULE_FIRST_SET',
  'SCHEDULE_CLEARED',
  'PORT_MISSING',
  'PORT_AMBIGUOUS',
  'TIMEZONE_MISSING',
  'TIMEZONE_INVALID',
  'TIME_IN_FUTURE',
  'REQUIRED_DATA_MISSING',
  'CONTACT_INELIGIBLE',
  'CONSENT_NOT_GRANTED',
  'UNAUTHORIZED',
  'PREVIEW_REQUIRED',
  'APPROVAL_REQUIRED',
  'APPROVAL_STALE',
  'SELF_APPROVAL_FORBIDDEN',
  'MODE_NOT_FAKE',
  'ENV_NOT_ALLOWED',
  'FEATURE_DISABLED',
  'ALREADY_FAKE_SENT',
  'AUDIT_PERSIST_FAILED',
  'FAKE_SIMULATED_FAILURE',
  'SIGNAL_DISMISSED',
  'SIGNAL_EXPIRED',
  'SIGNAL_STATE_INVALID',
  'REVISED',
] as const
export type KodeAlasan = (typeof KODE_ALASAN)[number]

export type Hasil<T> = { ok: true; nilai: T } | { ok: false; alasan: KodeAlasan; medan?: string }

const lolos = <T>(nilai: T): Hasil<T> => ({ ok: true, nilai })
const tolak = <T = never>(alasan: KodeAlasan, medan?: string): Hasil<T> =>
  medan === undefined ? { ok: false, alasan } : { ok: false, alasan, medan }

// ========================================================= keluarga event

export const KELUARGA_EVENT = ['SCHEDULE_CHANGE', 'EOSP', 'ALL_FAST', 'SAILED'] as const
export type KeluargaEvent = (typeof KELUARGA_EVENT)[number]

/** Kode VoyageEvent pilot (D-03). Selain ini → EVENT_NOT_ALLOWED. */
export const KODE_MILESTONE_PILOT = ['EOSP', 'ALL_FAST', 'SAILED'] as const
export type KodeMilestone = (typeof KODE_MILESTONE_PILOT)[number]

export const adalahMilestonePilot = (v: unknown): v is KodeMilestone =>
  typeof v === 'string' && (KODE_MILESTONE_PILOT as readonly string[]).includes(v)

export const MEDAN_JADWAL = ['eta', 'etd'] as const
export type MedanJadwal = (typeof MEDAN_JADWAL)[number]

/** Bentuk minimum MonitoringSignal yang dibutuhkan kebijakan (diisi service). */
export type SinyalMasuk = {
  id: string
  tenantId: string
  voyageId: string
  kind: string
  sourceType: string
  sourceRef: string | null
  reviewState: string
  after: unknown
}

export type KunciCandidate = {
  tenantId: string
  voyageId: string
  sourceType: 'AUDIT_LOG' | 'VOYAGE_EVENT'
  sourceRef: string
}

export type KlasifikasiSinyal = { keluarga: KeluargaEvent; kunci: KunciCandidate }

const objek = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null

const teksIsi = (v: unknown): v is string => typeof v === 'string' && v !== ''

/**
 * FR-01 — hanya ETA_CHANGED (sumber AuditLog) dan OPERATIONAL_EVENT_RECORDED
 * EOSP/ALL_FAST/SAILED (sumber VoyageEvent). Sinyal lain (NOR_TENDERED,
 * COMMENCED, VOYAGE_STATUS_CHANGED, DATA_STALE, MONITORING_ERROR, AIS_*, …) →
 * EVENT_NOT_ALLOWED. Kelayakan reviewState diperiksa TERPISAH (kelayakanSinyal).
 */
export function klasifikasiSinyal(s: SinyalMasuk): Hasil<KlasifikasiSinyal> {
  if (!teksIsi(s.tenantId) || !teksIsi(s.voyageId)) return tolak('SOURCE_NOT_FOUND')
  if (s.kind === 'ETA_CHANGED') {
    if (s.sourceType !== 'AUDIT_LOG') return tolak('EVENT_NOT_ALLOWED')
    if (!teksIsi(s.sourceRef)) return tolak('SOURCE_NOT_FOUND')
    return lolos({
      keluarga: 'SCHEDULE_CHANGE',
      kunci: { tenantId: s.tenantId, voyageId: s.voyageId, sourceType: 'AUDIT_LOG', sourceRef: s.sourceRef },
    })
  }
  if (s.kind === 'OPERATIONAL_EVENT_RECORDED') {
    const kode = objek(s.after)?.eventCode
    if (s.sourceType !== 'VOYAGE_EVENT' || !adalahMilestonePilot(kode)) return tolak('EVENT_NOT_ALLOWED')
    if (!teksIsi(s.sourceRef)) return tolak('SOURCE_NOT_FOUND')
    return lolos({
      keluarga: kode,
      kunci: { tenantId: s.tenantId, voyageId: s.voyageId, sourceType: 'VOYAGE_EVENT', sourceRef: s.sourceRef },
    })
  }
  return tolak('EVENT_NOT_ALLOWED')
}

/** Kunci candidate `(tenantId, voyageId, sourceType, sourceRef)` sebagai teks tak ambigu. */
export function teksKunciCandidate(k: KunciCandidate): string {
  return JSON.stringify(['WA1C', k.tenantId, k.voyageId, k.sourceType, k.sourceRef])
}

/** P-06 — logical message = candidate key + identitas penerima (WA-1: pengenal TEST_FIXTURE, OD-2A-05). */
export function teksKunciPesanLogis(k: KunciCandidate, pengenalPenerima: string): string {
  return JSON.stringify(['WA1M', k.tenantId, k.voyageId, k.sourceType, k.sourceRef, pengenalPenerima])
}

// ====================================================== kelayakan sinyal (P-08)

/**
 * D-13 / Q4. OPEN & ACKNOWLEDGED boleh Prepare; DISMISSED/EXPIRED tidak.
 * ACKNOWLEDGED BUKAN approval — fungsi ini hanya menjawab "boleh disiapkan?",
 * dan gerbang approval (gerbangApprovalSend) sama sekali tidak menerima sinyal.
 * Nilai di luar empat status → SIGNAL_STATE_INVALID (gagal tertutup).
 */
export function kelayakanSinyal(reviewState: unknown): Hasil<null> {
  switch (reviewState) {
    case 'OPEN':
    case 'ACKNOWLEDGED':
      return lolos(null)
    case 'DISMISSED':
      return tolak('SIGNAL_DISMISSED')
    case 'EXPIRED':
      return tolak('SIGNAL_EXPIRED')
    default:
      return tolak('SIGNAL_STATE_INVALID')
  }
}

const PRIORITAS_SINYAL: readonly KodeAlasan[] = ['SIGNAL_STATE_INVALID', 'SIGNAL_DISMISSED', 'SIGNAL_EXPIRED']

/**
 * Q4 — semua sinyal dalam grup harus layak; satu tidak layak → seluruh grup
 * ditolak. Bila ada beberapa jenis pelanggaran, hasilnya deterministik menurut
 * PRIORITAS_SINYAL (tak bergantung urutan larik). Dipanggil sebelum Prepare DAN
 * sebelum Send (status sinyal bisa berubah di antaranya).
 */
export function kelayakanGrupSinyal(reviewStates: readonly unknown[]): Hasil<null> {
  if (reviewStates.length === 0) return tolak('SOURCE_NOT_FOUND')
  const alasan = new Set<KodeAlasan>()
  for (const r of reviewStates) {
    const h = kelayakanSinyal(r)
    if (!h.ok) alasan.add(h.alasan)
  }
  for (const a of PRIORITAS_SINYAL) if (alasan.has(a)) return tolak(a)
  return lolos(null)
}

// =============================================================== pengelompokan

export type GrupCandidate = {
  keluarga: KeluargaEvent
  kunci: KunciCandidate
  teksKunci: string
  /** Id sinyal anggota, terurut naik. */
  sinyalIds: string[]
  reviewStates: string[]
}

export type HasilPengelompokan = {
  grup: GrupCandidate[]
  ditolak: { sinyalId: string; alasan: KodeAlasan }[]
}

/**
 * K-2 / FR-02 — sinyal dengan kunci candidate sama menjadi SATU grup (dua sinyal
 * ETA_CHANGED eta+etd satu AuditLog → satu candidate). Milestone: satu
 * VoyageEvent.id = satu grup. Sinyal di luar pilot masuk `ditolak`. Hasil
 * terurut deterministik (teksKunci, lalu id sinyal).
 */
export function kelompokkanSinyal(sinyal: readonly SinyalMasuk[]): HasilPengelompokan {
  const peta = new Map<string, GrupCandidate>()
  const ditolak: HasilPengelompokan['ditolak'] = []
  for (const s of sinyal) {
    const k = klasifikasiSinyal(s)
    if (!k.ok) {
      ditolak.push({ sinyalId: s.id, alasan: k.alasan })
      continue
    }
    const teks = teksKunciCandidate(k.nilai.kunci)
    const g = peta.get(teks)
    if (g) {
      g.sinyalIds.push(s.id)
      g.reviewStates.push(s.reviewState)
    } else {
      peta.set(teks, { keluarga: k.nilai.keluarga, kunci: k.nilai.kunci, teksKunci: teks, sinyalIds: [s.id], reviewStates: [s.reviewState] })
    }
  }
  const grup = Array.from(peta.values()).sort((a, b) => (a.teksKunci < b.teksKunci ? -1 : a.teksKunci > b.teksKunci ? 1 : 0))
  for (const g of grup) {
    const pasangan = g.sinyalIds.map((id, i) => [id, g.reviewStates[i]] as const).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    g.sinyalIds = pasangan.map((p) => p[0])
    g.reviewStates = pasangan.map((p) => p[1])
  }
  ditolak.sort((a, b) => (a.sinyalId < b.sinyalId ? -1 : a.sinyalId > b.sinyalId ? 1 : 0))
  return { grup, ditolak }
}

// ======================================================= tanggal & waktu (K-1)

const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/

/** Kunci tanggal kalender "YYYY-MM-DD" yang benar-benar ada (2026-02-30 ditolak). */
export function kunciTanggalKalenderSah(v: unknown): v is string {
  if (typeof v !== 'string' || !POLA_TANGGAL.test(v)) return false
  const [y, m, d] = v.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

/**
 * Q10 — wilayah zona IANA bernama yang diterima. `UTC`, `GMT`, `Etc/*`, offset
 * tetap (`+08:00`), dan nama warisan tanpa wilayah (`EST5EDT`, `WET`) DITOLAK.
 */
export const WILAYAH_ZONA = ['Africa', 'America', 'Antarctica', 'Arctic', 'Asia', 'Atlantic', 'Australia', 'Europe', 'Indian', 'Pacific'] as const

const POLA_ZONA = /^[A-Z][A-Za-z]+(?:\/[A-Za-z0-9][A-Za-z0-9_+-]*){1,2}$/

let zonaDidukungCache: ReadonlySet<string> | null = null

/**
 * Daftar terkontrol dari runtime (Intl.supportedValuesOf). SENGAJA bukan
 * try/catch `Intl.DateTimeFormat`: Intl menerima `+08:00`, `UTC`, `asia/makassar`,
 * dan `Etc/GMT-8` (terbukti di audit Step 1).
 */
export function zonaDidukungRuntime(): ReadonlySet<string> {
  if (!zonaDidukungCache) {
    const f = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf
    zonaDidukungCache = new Set(typeof f === 'function' ? f('timeZone') : [])
  }
  return zonaDidukungCache
}

/**
 * FR-07 / SG-04 / Q10 — tanpa fallback, tanpa normalisasi diam-diam (spasi atau
 * huruf kecil = tidak sah). Kosong/null → TIMEZONE_MISSING; selain itu harus:
 * cocok pola Wilayah/Lokasi, wilayah di WILAYAH_ZONA, dan anggota daftar runtime.
 */
export function nilaiZonaWaktu(v: unknown, didukung: ReadonlySet<string> = zonaDidukungRuntime()): Hasil<string> {
  if (v === null || v === undefined || v === '') return tolak('TIMEZONE_MISSING', 'port.timezone')
  if (typeof v !== 'string' || !POLA_ZONA.test(v)) return tolak('TIMEZONE_INVALID', 'port.timezone')
  const wilayah = v.split('/')[0]
  if (!(WILAYAH_ZONA as readonly string[]).includes(wilayah)) return tolak('TIMEZONE_INVALID', 'port.timezone')
  if (didukung.has(v) || aliasZonaDidukung(v, didukung)) return lolos(v)
  return tolak('TIMEZONE_INVALID', 'port.timezone')
}

/**
 * ICU dapat mendaftar ID lama (mis. `Asia/Calcutta`) sementara IANA kini memakai
 * `Asia/Kolkata`. Nama baru diterima HANYA bila runtime meresolusikannya ke
 * anggota daftar DAN nama itu benar-benar alias (berbeda bukan sekadar huruf
 * besar/kecil) — `Asia/makassar` tetap ditolak, tanpa normalisasi diam-diam.
 */
function aliasZonaDidukung(v: string, didukung: ReadonlySet<string>): boolean {
  let resolusi: string
  try {
    resolusi = new Intl.DateTimeFormat('en-US', { timeZone: v }).resolvedOptions().timeZone
  } catch {
    return false
  }
  return resolusi !== v && resolusi.toLowerCase() !== v.toLowerCase() && didukung.has(resolusi)
}

const formatterZona = new Map<string, Intl.DateTimeFormat>()

/**
 * §11.1 — "YYYY-MM-DD HH:mm (UTC±HH:mm, <zona IANA>)". Menit dipotong (tidak
 * dibulatkan). Zona WAJIB sudah lolos nilaiZonaWaktu — selain itu melempar
 * (galat pemrograman, bukan jalur fallback).
 */
export function formatWaktuLokal(iso: string, zona: string, didukung: ReadonlySet<string> = zonaDidukungRuntime()): string {
  const z = nilaiZonaWaktu(zona, didukung)
  if (!z.ok) throw new RangeError(`Zona waktu tidak sah: ${z.alasan}`)
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) throw new RangeError('Waktu kejadian tidak valid.')
  let f = formatterZona.get(zona)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zona,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZoneName: 'longOffset',
    })
    formatterZona.set(zona, f)
  }
  const p: Record<string, string> = {}
  for (const x of f.formatToParts(t)) p[x.type] = x.value
  const offset = /^GMT$/.test(p.timeZoneName) ? '+00:00' : /^GMT([+-]\d{2}:\d{2})$/.exec(p.timeZoneName)?.[1]
  if (!offset || !/^\d{4}$/.test(p.year)) throw new RangeError('Format offset zona tidak dikenali.')
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} (UTC${offset}, ${zona})`
}

// ===================================================== fakta sumber (kontrak)

/** Diisi service 2C/2E dari DB. Tanggal voyage sudah berupa kunci "YYYY-MM-DD" (kunciTanggal). */
export type FaktaVoyage = {
  id: string
  voyageNumber: string | null
  deletedAt: string | null
  portId: string | null
  eta: string | null
  etd: string | null
}
export type FaktaPort = { id: string; name: string | null; timezone: string | null; deletedAt: string | null }
export type FaktaKapal = { name: string | null }

export type BarisAuditJadwal = {
  id: string
  tableName: string
  recordId: string
  /** ISO. */
  createdAt: string
  oldValue: unknown
  newValue: unknown
}

export type FaktaSumberJadwal = {
  /** AuditLog sumber candidate (sourceRef), atau null bila tak ditemukan di tenant ini. */
  audit: BarisAuditJadwal | null
  voyage: FaktaVoyage | null
  kapal: FaktaKapal | null
  port: FaktaPort | null
  /**
   * AuditLog tabel Voyage untuk voyage yang sama yang dibuat PADA/SESUDAH audit
   * sumber (boleh berlebih — yang lebih lama & baris sumber sendiri diabaikan).
   */
  auditSesudah: readonly BarisAuditJadwal[]
}

export type PerubahanJadwal = { medan: MedanJadwal; lama: string; baru: string }

export type FaktaKanonikJadwal = {
  keluarga: 'SCHEDULE_CHANGE'
  vesselName: string
  voyageNumber: string
  portName: string
  /** Urutan ETA lalu ETD (§6.2). */
  perubahan: PerubahanJadwal[]
}

const adalahUbahTanggal = (v: unknown): v is Record<string, unknown> & { medan: unknown[] } => {
  const o = objek(v)
  return !!o && o.peristiwa === 'UBAH_TANGGAL' && Array.isArray(o.medan)
}

const nilaiTeks = (v: string | null | undefined): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)

function dataWajib(
  voyage: FaktaVoyage,
  kapal: FaktaKapal | null,
  port: FaktaPort | null,
): Hasil<{ vesselName: string; voyageNumber: string; port: FaktaPort & { name: string } }> {
  const vesselName = nilaiTeks(kapal?.name)
  if (!vesselName) return tolak('REQUIRED_DATA_MISSING', 'vessel.name')
  const voyageNumber = nilaiTeks(voyage.voyageNumber)
  if (!voyageNumber) return tolak('REQUIRED_DATA_MISSING', 'voyage.voyageNumber')
  if (!voyage.portId || !port || port.id !== voyage.portId || port.deletedAt !== null || !nilaiTeks(port.name)) {
    return tolak('PORT_MISSING', 'voyage.portId')
  }
  return lolos({ vesselName, voyageNumber, port: { ...port, name: port.name as string } })
}

const lebihBaruAtauSama = (a: BarisAuditJadwal, sumber: BarisAuditJadwal): boolean =>
  a.id !== sumber.id && Date.parse(a.createdAt) >= Date.parse(sumber.createdAt)

/**
 * SG-03 + SG-04 untuk candidate jadwal. Urutan keputusan TETAP (deterministik):
 *   1. sumber ada & milik voyage ini; voyage ada & tak dihapus      (SG-03)
 *   2. bentuk UBAH_TANGGAL; medan ∩ {eta, etd} tak kosong            (SG-03)
 *   3. supersession (Q5): nilai voyage kini ≠ nilai baru, ATAU ada
 *      UBAH_TANGGAL lain PADA/SESUDAH sumber yang menyentuh medan sama  (SG-03)
 *   4. first-set / cleared pada medan MANA PUN → seluruh candidate (P-01)
 *   5. data wajib: nama kapal, nomor voyage, pelabuhan               (SG-04)
 * Waktu yang sama persis dengan sumber dianggap "lebih baru" — dua candidate
 * yang saling menyalip sama-sama diblokir (gagal tertutup).
 */
export function nilaiSumberJadwal(f: FaktaSumberJadwal): Hasil<FaktaKanonikJadwal> {
  const a = f.audit
  const v = f.voyage
  if (!a || !v || a.tableName !== 'Voyage' || a.recordId !== v.id) return tolak('SOURCE_NOT_FOUND')
  if (v.deletedAt !== null) return tolak('SOURCE_DELETED')
  if (!adalahUbahTanggal(a.newValue)) return tolak('SOURCE_NOT_FOUND')

  const lama = objek(a.oldValue) ?? {}
  const baru = a.newValue
  const medan = MEDAN_JADWAL.filter((m) => baru.medan.includes(m))
  if (medan.length === 0) return tolak('EVENT_NOT_ALLOWED')

  const nilai: { medan: MedanJadwal; lama: string | null; baru: string | null }[] = []
  for (const m of medan) {
    const l = lama[m] ?? null
    const b = baru[m] ?? null
    if ((l !== null && !kunciTanggalKalenderSah(l)) || (b !== null && !kunciTanggalKalenderSah(b))) {
      return tolak('REQUIRED_DATA_MISSING', m)
    }
    if (l === b) continue
    nilai.push({ medan: m, lama: l as string | null, baru: b as string | null })
  }
  if (nilai.length === 0) return tolak('EVENT_NOT_ALLOWED')

  for (const n of nilai) {
    if (v[n.medan] !== n.baru) return tolak('SOURCE_SUPERSEDED', n.medan)
  }
  for (const s of f.auditSesudah) {
    const nv = s.newValue
    if (s.tableName !== 'Voyage' || s.recordId !== v.id || !lebihBaruAtauSama(s, a) || !adalahUbahTanggal(nv)) continue
    const m = nilai.find((n) => nv.medan.includes(n.medan))
    if (m) return tolak('SOURCE_SUPERSEDED', m.medan)
  }

  for (const n of nilai) {
    if (n.lama === null) return tolak('SCHEDULE_FIRST_SET', n.medan)
    if (n.baru === null) return tolak('SCHEDULE_CLEARED', n.medan)
  }

  const w = dataWajib(v, f.kapal, f.port)
  if (!w.ok) return w
  return lolos({
    keluarga: 'SCHEDULE_CHANGE',
    vesselName: w.nilai.vesselName,
    voyageNumber: w.nilai.voyageNumber,
    portName: w.nilai.port.name,
    perubahan: nilai.map((n) => ({ medan: n.medan, lama: n.lama as string, baru: n.baru as string })),
  })
}

export type FaktaPeristiwa = {
  id: string
  voyageId: string
  eventCode: string
  /** ISO. */
  occurredAt: string
  deletedAt: string | null
  portCallId: string | null
}

export type FaktaSumberMilestone = {
  keluarga: KeluargaEvent
  peristiwa: FaktaPeristiwa | null
  voyage: FaktaVoyage | null
  kapal: FaktaKapal | null
  port: FaktaPort | null
  /** Diisi bila peristiwa.portCallId ada; null bila port call tak ditemukan. */
  portCall: { id: string; portRefId: string | null } | null
}

export type FaktaKanonikMilestone = {
  keluarga: KodeMilestone
  vesselName: string
  voyageNumber: string
  portName: string
  occurredAt: string
  timezone: string
  /** §11.1 — sudah diformat; dipakai template apa adanya. */
  eventLocalTime: string
}

/**
 * SG-03 + SG-04 untuk milestone. Urutan TETAP:
 *   1. peristiwa & voyage ada, saling cocok; keduanya tak dihapus   (SG-03, D-09)
 *   2. kode peristiwa = keluarga pilot candidate                       (SG-03)
 *   3. occurredAt sah & tidak di masa depan relatif `sekarang`         (D-14)
 *   4. data wajib + pelabuhan voyage (PORT_MISSING)                    (SG-04)
 *   5. port call peristiwa: tak ditemukan / portRefId null / berbeda dari
 *      pelabuhan voyage → PORT_AMBIGUOUS (Q7)
 *   6. zona waktu IANA bernama (Q10), tanpa fallback
 */
export function nilaiSumberMilestone(
  f: FaktaSumberMilestone,
  o: { sekarang: Date; zonaDidukung?: ReadonlySet<string> },
): Hasil<FaktaKanonikMilestone> {
  const p = f.peristiwa
  const v = f.voyage
  if (!p || !v || p.voyageId !== v.id) return tolak('SOURCE_NOT_FOUND')
  if (p.deletedAt !== null) return tolak('SOURCE_DELETED')
  if (v.deletedAt !== null) return tolak('SOURCE_DELETED')
  if (!adalahMilestonePilot(p.eventCode) || p.eventCode !== f.keluarga) return tolak('EVENT_NOT_ALLOWED')

  const terjadi = Date.parse(p.occurredAt)
  if (Number.isNaN(terjadi)) return tolak('REQUIRED_DATA_MISSING', 'event.occurredAt')
  if (terjadi > o.sekarang.getTime()) return tolak('TIME_IN_FUTURE', 'event.occurredAt')

  const w = dataWajib(v, f.kapal, f.port)
  if (!w.ok) return w
  if (p.portCallId !== null) {
    const pc = f.portCall
    if (!pc || pc.id !== p.portCallId || pc.portRefId === null || pc.portRefId !== v.portId) {
      return tolak('PORT_AMBIGUOUS', 'event.portCallId')
    }
  }

  const didukung = o.zonaDidukung ?? zonaDidukungRuntime()
  const z = nilaiZonaWaktu(w.nilai.port.timezone, didukung)
  if (!z.ok) return z

  const iso = new Date(terjadi).toISOString()
  return lolos({
    keluarga: p.eventCode,
    vesselName: w.nilai.vesselName,
    voyageNumber: w.nilai.voyageNumber,
    portName: w.nilai.port.name,
    occurredAt: iso,
    timezone: z.nilai,
    eventLocalTime: formatWaktuLokal(iso, z.nilai, didukung),
  })
}

// ============================================================ mesin status

export const STATUS_PESAN = [
  'DRAFT',
  'PREVIEWED',
  'APPROVED',
  'QUEUED_FAKE',
  'FAKE_SENT',
  'FAKE_FAILED',
  'NEEDS_REVIEW',
  'BLOCKED',
  'CANCELED',
] as const
export type StatusPesan = (typeof STATUS_PESAN)[number]

/**
 * PRD §12.3. Dua tambahan turunan AC-10 (ditandai): Send dari APPROVED atau
 * retry dari FAKE_FAILED yang menemukan sumber terhapus/superseded SEBELUM
 * klaim → BLOCKED. Tidak ada state SENT/DELIVERED/READ nyata di WA-1.
 * SETIAP transisi wajib diaudit (§14); lihat transisiWajibAudit.
 */
const TRANSISI_PESAN: Readonly<Record<StatusPesan, readonly StatusPesan[]>> = {
  DRAFT: ['PREVIEWED', 'BLOCKED', 'CANCELED'],
  PREVIEWED: ['APPROVED', 'DRAFT', 'CANCELED'],
  APPROVED: ['QUEUED_FAKE', 'NEEDS_REVIEW', 'CANCELED', /* AC-10 */ 'BLOCKED'],
  QUEUED_FAKE: ['FAKE_SENT', 'FAKE_FAILED', 'NEEDS_REVIEW', 'BLOCKED'],
  FAKE_SENT: [],
  FAKE_FAILED: ['QUEUED_FAKE', 'NEEDS_REVIEW', 'CANCELED', /* AC-10 */ 'BLOCKED'],
  NEEDS_REVIEW: ['DRAFT', 'CANCELED'],
  BLOCKED: [],
  CANCELED: [],
}

export function transisiPesanSah(dari: string, ke: string): boolean {
  const izin = (TRANSISI_PESAN as Record<string, readonly string[] | undefined>)[dari]
  return Array.isArray(izin) && izin.includes(ke)
}

/** D-2B-05 — status CommunicationCandidate. BLOCKED terminal (hanya alasan sumber keras, D-2B-04). */
export const STATUS_CANDIDATE = ['ACTIVE', 'BLOCKED'] as const
export type StatusCandidate = (typeof STATUS_CANDIDATE)[number]

/** D-2B-09 — status CommunicationAttempt, kosakata yang sama dengan STATUS_PESAN. */
export const STATUS_ATTEMPT = ['QUEUED_FAKE', 'FAKE_SENT', 'FAKE_FAILED'] as const
export type StatusAttempt = (typeof STATUS_ATTEMPT)[number]

export const statusPesanTerminal = (s: string): boolean => s === 'FAKE_SENT' || s === 'BLOCKED' || s === 'CANCELED'

/** §14 — seluruh transisi sah wajib menghasilkan entri audit; tak ada pengecualian. */
export const transisiWajibAudit = (dari: string, ke: string): boolean => transisiPesanSah(dari, ke)

/** FAKE Send hanya dari APPROVED, atau retry manual dari FAKE_FAILED (FR-16). */
export const bolehMintaSend = (s: string): boolean => s === 'APPROVED' || s === 'FAKE_FAILED'

/** FR-20 / AC-18 — cancel hanya sebelum klaim Send. */
export const bolehCancel = (s: string): boolean => transisiPesanSah(s, 'CANCELED')

// ======================================================= approval (Q1, Q8)

/**
 * Deskripsi kebijakan approval WA-1 — BUKAN entri registry (registry & service
 * approval = Step 2D). Q8: PRD WA-1 TANPA TTL produk (P-05) → `ttlProdukJam: null`.
 * Isu kompatibilitas tercatat: TahApprovalRequest.expiresAt wajib (non-null) dan
 * validasiRegistry mensyaratkan kedaluwarsaJam 1..720 → diselesaikan di audit 2D,
 * TANPA menetapkan expiry 720 jam di sini.
 */
export const KEBIJAKAN_APPROVAL_WA1 = {
  kind: 'WA_INTERNAL_FAKE_TEST',
  hanyaNonProduksi: true,
  penyedia: PENYEDIA_KOMUNIKASI,
  ttlProdukJam: null,
  /** Komunikasi eksternal (CLIENT_WA_UPDATE) TIDAK diaktifkan di WA-1. */
  komunikasiEksternalDiaktifkan: false,
} as const

/**
 * SG-07 — Send butuh approval APPROVED yang mengikat fingerprint snapshot persis.
 * Tak ada parameter sinyal: acknowledgement apa pun TIDAK PERNAH bisa memenuhi
 * gerbang ini (FR-17, AC-16).
 */
export function gerbangApprovalSend(a: {
  approval: { status: string; proposalHash: string } | null
  snapshotFingerprint: string
}): Hasil<null> {
  if (!a.approval || a.approval.status !== 'APPROVED') return tolak('APPROVAL_REQUIRED')
  if (!teksIsi(a.snapshotFingerprint) || a.approval.proposalHash !== a.snapshotFingerprint) return tolak('APPROVAL_STALE')
  return lolos(null)
}
