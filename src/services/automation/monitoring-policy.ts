// Kebijakan pemantauan voyage internal — logika murni, TANPA impor (PRD-002 Step 5B).
//
// MONITOR → DETECT → EXPLAIN → RECOMMEND → HUMAN REVIEW. Berkas ini hanya
// MEMUTUSKAN: dari fakta satu voyage, sinyal apa yang layak lahir. Ia tidak
// membaca database, tidak menulis apa pun, tidak memanggil jaringan, dan
// tidak memakai LLM — penjelasan & rekomendasi adalah templat deterministik.
//
// Sumber fakta (dibaca service, disuntikkan ke sini):
//   • AuditLog Voyage  — perubahan tanggal (peristiwa UBAH_TANGGAL, Step 2)
//                        dan perubahan status (setVoyageStatus)
//   • VoyageEvent      — fakta SOF (K130). Sinyal MERUJUKnya, tak pernah
//                        menyalinnya balik.
//   • Voyage           — tanggal aktual (ata/atb/atd) & aktivitas terakhir
//   • Task             — hanya sebagai tanda aktivitas (DATA_STALE)
//
// Tanggal voyage bersemantik TANGGAL KALENDER "YYYY-MM-DD" (D4) — tak pernah
// ditafsirkan ulang sebagai jam. Hari bisnis WITA dan format waktu untuk teks
// disuntikkan pemanggil (lib/business-time.ts), supaya berkas ini tetap murni.

export const AGEN_MONITORING = 'voyage-monitoring'
export const VERSI_AGEN = '5b.1'

/** D5 — ambang pilot yang dikunci owner. */
export const AMBANG_DATA_STALE_JAM = 24
export const AMBANG_TANGGAL_AKTUAL_JAM = 12
export const AMBANG_ETA_MUNDUR_HARI = 1

export const JENIS_SINYAL = [
  'ETA_CHANGED',
  'VOYAGE_STATUS_CHANGED',
  'OPERATIONAL_EVENT_RECORDED',
  'ACTUAL_DATE_MISSING',
  'DATA_STALE',
  'MONITORING_ERROR',
] as const
export type JenisSinyal = (typeof JENIS_SINYAL)[number]

export const SEVERITY = ['INFO', 'WARNING', 'ERROR'] as const
export type Severity = (typeof SEVERITY)[number]

export const JENIS_SUMBER = ['AUDIT_LOG', 'VOYAGE_EVENT', 'VOYAGE', 'SYSTEM'] as const
export type JenisSumber = (typeof JENIS_SUMBER)[number]

export const STATUS_REVIEW = ['OPEN', 'ACKNOWLEDGED', 'DISMISSED', 'EXPIRED'] as const
export type StatusReview = (typeof STATUS_REVIEW)[number]

/** Status voyage yang menghentikan pemantauan otomatis. */
export const STATUS_BERHENTI = ['CLOSED', 'CANCELLED'] as const

/**
 * Kode peristiwa yang layak menjadi sinyal: seluruh KODE_PERISTIWA (event-codes.ts)
 * KECUALI 'OTHER'. Uji memastikan daftar ini tak pernah menyimpang dari
 * event-codes.ts — tak ada kode yang dikarang di sini.
 */
export const KODE_PERISTIWA_BERNILAI = [
  'EOSP',
  'NOR_TENDERED',
  'PILOT_ON_BOARD',
  'ALL_FAST',
  'COMMENCED',
  'COMPLETED',
  'SAILED',
] as const

export type MedanAktual = 'ata' | 'atb' | 'atd'
type MedanTanggal = 'eta' | 'etd' | MedanAktual

const JAM = 3_600_000
const HARI = 86_400_000
const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/

// ------------------------------------------------------------------ bentuk data

export type BarisAudit = { id: string; pada: string; lama: unknown; baru: unknown }
export type BarisPeristiwa = { id: string; kode: string; terjadi: string; dicatat: string }

export type FaktaVoyage = {
  voyageId: string
  voyageNumber: string
  status: string
  dihapus: boolean
  tanggal: Record<MedanTanggal, string | null>
  /** AuditLog tabel Voyage untuk voyage ini sejak pemantauan dimulai, urut naik. */
  audit: BarisAudit[]
  /** VoyageEvent yang tidak dihapus, urut naik. */
  peristiwa: BarisPeristiwa[]
  /** Waktu aktivitas terakhir lintas sumber (ISO), atau null. */
  aktivitasTerakhir: string | null
  /** Waktu pemantauan dimulai (ISO). */
  mulaiPantau: string
}

export type OpsiKebijakan = {
  sekarang: Date
  /** Tanggal bisnis WITA "YYYY-MM-DD" untuk `sekarang` (dari business-time.ts). */
  hariBisnis: string
  /** USUL_JANGKAR dari event-codes.ts: kode peristiwa → medan tanggal aktual. */
  petaJangkar: Readonly<Partial<Record<string, MedanAktual>>>
  /** Label manusia untuk kode peristiwa. */
  labelPeristiwa: (kode: string) => string
  /** Format waktu manusia (WITA) untuk ISO. */
  formatWaktu: (iso: string) => string
}

export type CalonSinyal = {
  kind: JenisSinyal
  severity: Severity
  dedupeKey: string
  sourceType: JenisSumber
  sourceRef: string | null
  sourceAt: string | null
  before: Record<string, string | null> | null
  after: Record<string, string | null> | null
  explanation: string
  recommendation: string
}

/**
 * Data sumber yang bentuknya rusak (mis. AuditLog UBAH_TANGGAL tanpa larik
 * `medan`). Dilempar, bukan diabaikan: kerusakan sumber harus terlihat sebagai
 * MONITORING_ERROR, bukan diam-diam menghasilkan "tidak ada perubahan".
 */
export class DataSumberTidakSah extends Error {
  readonly code = 'DATA_SUMBER_TIDAK_SAH'
  constructor(pesan: string) {
    super(pesan)
    this.name = 'DataSumberTidakSah'
  }
}

// ------------------------------------------------------------------- bantuan

const objek = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null

const LABEL_MEDAN: Record<MedanTanggal, string> = {
  eta: 'ETA',
  etd: 'ETD',
  ata: 'ATA',
  atb: 'ATB',
  atd: 'ATD',
}

function kunciTanggalSah(v: unknown, konteks: string): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'string' && POLA_TANGGAL.test(v)) return v
  throw new DataSumberTidakSah(`${konteks}: nilai tanggal tidak berbentuk YYYY-MM-DD.`)
}

/** Selisih hari kalender (baru − lama) antara dua kunci "YYYY-MM-DD". */
export function selisihHariKalender(lama: string, baru: string): number {
  const ms = (s: string) => {
    const [y, m, d] = s.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((ms(baru) - ms(lama)) / HARI)
}

/** Alasan pemantauan harus berhenti, atau null bila masih layak dipantau. */
export function alasanBerhenti(f: Pick<FaktaVoyage, 'dihapus' | 'status'>):
  | 'VOYAGE_DELETED'
  | 'VOYAGE_CLOSED'
  | 'VOYAGE_CANCELLED'
  | null {
  if (f.dihapus) return 'VOYAGE_DELETED'
  if (f.status === 'CLOSED') return 'VOYAGE_CLOSED'
  if (f.status === 'CANCELLED') return 'VOYAGE_CANCELLED'
  return null
}

// ------------------------------------------------------------------ detektor

function deteksiDariAudit(f: FaktaVoyage, a: BarisAudit): CalonSinyal[] {
  const baru = objek(a.baru)
  const lama = objek(a.lama)
  if (!baru) return []

  // 1. ETA_CHANGED — dari jejak UBAH_TANGGAL (Step 2). Hanya ETA & ETD.
  if (baru.peristiwa === 'UBAH_TANGGAL') {
    if (!Array.isArray(baru.medan)) {
      throw new DataSumberTidakSah(`AuditLog ${a.id}: UBAH_TANGGAL tanpa larik medan.`)
    }
    const hasil: CalonSinyal[] = []
    for (const medan of ['eta', 'etd'] as const) {
      if (!baru.medan.includes(medan)) continue
      const sebelum = kunciTanggalSah(lama?.[medan], `AuditLog ${a.id}`)
      const sesudah = kunciTanggalSah(baru[medan], `AuditLog ${a.id}`)
      if (sebelum === sesudah) continue

      const L = LABEL_MEDAN[medan]
      let explanation: string
      let severity: Severity = 'INFO'
      if (sebelum && sesudah) {
        const hari = selisihHariKalender(sebelum, sesudah)
        const arah = hari > 0 ? 'mundur' : 'maju'
        explanation = `${L} voyage ${f.voyageNumber} berubah dari ${sebelum} menjadi ${sesudah} (${arah} ${Math.abs(hari)} hari).`
        if (medan === 'eta' && hari >= AMBANG_ETA_MUNDUR_HARI) severity = 'WARNING'
      } else if (sesudah) {
        explanation = `${L} voyage ${f.voyageNumber} ditetapkan ${sesudah}.`
      } else {
        explanation = `${L} voyage ${f.voyageNumber} dikosongkan (sebelumnya ${sebelum}).`
      }

      hasil.push({
        kind: 'ETA_CHANGED',
        severity,
        dedupeKey: `ETA_CHANGED:${f.voyageId}:${a.id}:${medan}`,
        sourceType: 'AUDIT_LOG',
        sourceRef: a.id,
        sourceAt: a.pada,
        before: { [medan]: sebelum },
        after: { [medan]: sesudah },
        explanation,
        recommendation:
          severity === 'WARNING'
            ? `Periksa kembali ${L} dan tugas yang bergantung pada ${L}. Kabari pihak terkait bila perlu — sistem tidak mengirim kabar apa pun.`
            : `Periksa tugas yang bergantung pada ${L} voyage ini.`,
      })
    }
    return hasil
  }

  // 2. VOYAGE_STATUS_CHANGED — dari jejak setVoyageStatus().
  if (typeof baru.status === 'string') {
    const sebelum = typeof lama?.status === 'string' ? lama.status : null
    if (sebelum === baru.status) return []
    return [
      {
        kind: 'VOYAGE_STATUS_CHANGED',
        severity: 'INFO',
        dedupeKey: `VOYAGE_STATUS_CHANGED:${f.voyageId}:${a.id}`,
        sourceType: 'AUDIT_LOG',
        sourceRef: a.id,
        sourceAt: a.pada,
        before: { status: sebelum },
        after: { status: baru.status },
        explanation: `Status voyage ${f.voyageNumber} berubah dari ${sebelum ?? '—'} menjadi ${baru.status}.`,
        recommendation: 'Tidak ada tindakan wajib. Pastikan status sesuai kondisi lapangan.',
      },
    ]
  }

  return []
}

/**
 * Semua calon sinyal untuk satu voyage. Tidak ada efek samping; urutan hasil
 * deterministik. Voyage yang harus berhenti dipantau → larik kosong.
 */
export function deteksiSinyal(f: FaktaVoyage, o: OpsiKebijakan): CalonSinyal[] {
  if (alasanBerhenti(f)) return []

  const mulai = Date.parse(f.mulaiPantau)
  const sekarangMs = o.sekarang.getTime()
  const hasil: CalonSinyal[] = []

  // 1 & 2 — hanya perubahan SESUDAH pemantauan dimulai (tak membanjiri riwayat lama).
  for (const a of f.audit) {
    if (Date.parse(a.pada) < mulai) continue
    hasil.push(...deteksiDariAudit(f, a))
  }

  // 3. OPERATIONAL_EVENT_RECORDED — peristiwa bernilai yang dicatat sesudah mulai.
  const bernilai = new Set<string>(KODE_PERISTIWA_BERNILAI)
  for (const p of f.peristiwa) {
    if (!bernilai.has(p.kode)) continue
    if (Date.parse(p.dicatat) < mulai) continue
    const medan = o.petaJangkar[p.kode]
    hasil.push({
      kind: 'OPERATIONAL_EVENT_RECORDED',
      severity: 'INFO',
      dedupeKey: `OPERATIONAL_EVENT_RECORDED:${p.id}`,
      sourceType: 'VOYAGE_EVENT',
      sourceRef: p.id,
      sourceAt: p.terjadi,
      before: null,
      after: { eventCode: p.kode, occurredAt: p.terjadi },
      explanation: `Peristiwa ${o.labelPeristiwa(p.kode)} dicatat untuk voyage ${f.voyageNumber} (terjadi ${o.formatWaktu(p.terjadi)}).`,
      recommendation: medan
        ? `Pastikan tanggal ${LABEL_MEDAN[medan]} diisi lewat form voyage setelah diverifikasi.`
        : 'Tinjau kronologi voyage. Tidak ada tindakan wajib.',
    })
  }

  // 4. ACTUAL_DATE_MISSING — HANYA pemetaan yang benar-benar ada di USUL_JANGKAR
  //    (EOSP→ata, ALL_FAST→atb, SAILED→atd). COMMENCED/COMPLETED tak punya medan
  //    tanggal aktual, jadi sengaja tidak dideteksi.
  const terbaruPerMedan = new Map<MedanAktual, BarisPeristiwa>()
  for (const p of f.peristiwa) {
    const medan = o.petaJangkar[p.kode]
    if (!medan) continue
    const lama = terbaruPerMedan.get(medan)
    if (!lama || Date.parse(p.terjadi) >= Date.parse(lama.terjadi)) terbaruPerMedan.set(medan, p)
  }
  for (const medan of ['ata', 'atb', 'atd'] as const) {
    const p = terbaruPerMedan.get(medan)
    if (!p || f.tanggal[medan]) continue
    if (sekarangMs - Date.parse(p.terjadi) < AMBANG_TANGGAL_AKTUAL_JAM * JAM) continue
    hasil.push({
      kind: 'ACTUAL_DATE_MISSING',
      severity: 'WARNING',
      dedupeKey: `ACTUAL_DATE_MISSING:${f.voyageId}:${medan}`,
      sourceType: 'VOYAGE_EVENT',
      sourceRef: p.id,
      sourceAt: p.terjadi,
      before: null,
      after: { [medan]: null, eventCode: p.kode },
      explanation: `Peristiwa ${o.labelPeristiwa(p.kode)} tercatat ${o.formatWaktu(p.terjadi)}, tetapi tanggal ${LABEL_MEDAN[medan]} voyage ${f.voyageNumber} masih kosong setelah lebih dari ${AMBANG_TANGGAL_AKTUAL_JAM} jam.`,
      recommendation: `Lengkapi tanggal ${LABEL_MEDAN[medan]} melalui form voyage setelah diverifikasi dengan petugas operasi.`,
    })
  }

  // 5. DATA_STALE — tanpa aktivitas lintas sumber selama ambang; maksimal satu
  //    per voyage per hari bisnis WITA.
  const aktivitas = f.aktivitasTerakhir ? Date.parse(f.aktivitasTerakhir) : Number.NEGATIVE_INFINITY
  const acuan = Math.max(aktivitas, mulai)
  if (sekarangMs - acuan >= AMBANG_DATA_STALE_JAM * JAM) {
    const acuanIso = new Date(acuan).toISOString()
    hasil.push({
      kind: 'DATA_STALE',
      severity: 'WARNING',
      dedupeKey: `DATA_STALE:${f.voyageId}:${o.hariBisnis}`,
      sourceType: 'SYSTEM',
      sourceRef: null,
      sourceAt: acuanIso,
      before: null,
      after: { lastActivityAt: acuanIso },
      explanation: `Voyage ${f.voyageNumber} belum memiliki pembaruan selama lebih dari ${AMBANG_DATA_STALE_JAM} jam (aktivitas terakhir ${o.formatWaktu(acuanIso)}).`,
      recommendation:
        'Konfirmasi kondisi voyage dengan petugas operasi, lalu perbarui status atau catat peristiwa bila ada perkembangan.',
    })
  }

  return hasil
}

/** 6. MONITORING_ERROR — satu per voyage per jam UTC, tanpa detail teknis. */
export function sinyalGalatMonitoring(
  voyageId: string,
  voyageNumber: string | null,
  kodeGalat: string,
  sekarang: Date,
): CalonSinyal {
  const nama = voyageNumber ?? voyageId
  return {
    kind: 'MONITORING_ERROR',
    severity: 'ERROR',
    dedupeKey: `MONITORING_ERROR:${voyageId}:${sekarang.toISOString().slice(0, 13)}`,
    sourceType: 'SYSTEM',
    sourceRef: null,
    sourceAt: sekarang.toISOString(),
    before: null,
    after: { errorCode: kodeGalat },
    explanation: `Pemantauan voyage ${nama} gagal diproses (${kodeGalat}).`,
    recommendation: 'Periksa log server [jobs/run]. Voyage lain tetap diproses; jalan berikutnya mencoba lagi.',
  }
}
