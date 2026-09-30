// Parser, normalisasi & validasi field kapal — dipakai bersama oleh route POST & PATCH /api/vessels.
//
// PRD-002 Step 2: berkas ini SENGAJA TANPA impor (pola tenant-guard.ts), supaya
// prisma/check-vessel-identity.mjs bisa memuat fungsi yang PERSIS SAMA dengan
// yang dipakai route & komponen klien, bukan tiruannya.

const str = (v: unknown): string | null => {
  if (typeof v !== 'string') return v == null ? null : String(v)
  const t = v.trim()
  return t === '' ? null : t
}
const num = (v: unknown): number | null => {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const int = (v: unknown): number | null => {
  const n = num(v)
  return n === null ? null : Math.trunc(n)
}

export type VesselInput = {
  name: string
  imoNumber: string | null
  flag: string | null
  callSign: string | null
  vesselType: string | null
  gt: number | null
  nrt: number | null
  loa: number | null
  beam: number | null
  maxDraft: number | null
  yearBuilt: number | null
}

/** Ambil & rapikan field kapal dari body request (nilai kosong → null). */
export function vesselFields(body: Record<string, unknown>): VesselInput {
  return {
    name: str(body.name) ?? '',
    imoNumber: str(body.imoNumber),
    flag: str(body.flag),
    callSign: str(body.callSign),
    vesselType: str(body.vesselType),
    gt: num(body.gt),
    nrt: num(body.nrt),
    loa: num(body.loa),
    beam: num(body.beam),
    maxDraft: num(body.maxDraft),
    yearBuilt: int(body.yearBuilt),
  }
}

// ------------------------------------------------------------------------
// PRD-002 Step 2 — izin, identitas kapal (IMO/MMSI/call sign), kapal voyage.

/** D1 — peran yang boleh membuat/mengubah/menghapus kapal. Sama dengan penulis voyage (voyage.service.ts). */
export const PERAN_UBAH_KAPAL = ['ADMIN', 'OPERATOR'] as const

/**
 * PRD-004 Step 3 / D3 — peran yang boleh MEMBUAT kapal (POST saja). MANAJER_OPERASI
 * ditambahkan agar approver intake bisa membuat master kapal yang belum ada
 * (dengan konfirmasi eksplisit). PATCH/DELETE tetap PERAN_UBAH_KAPAL.
 */
export const PERAN_BUAT_KAPAL = [...PERAN_UBAH_KAPAL, 'MANAJER_OPERASI'] as const

/**
 * D2 — asal nomor MMSI. Hanya PUBLIC_TRACKING yang BELUM terverifikasi (mis.
 * dibaca dari situs pelacakan kapal publik); tiga lainnya adalah konfirmasi dari
 * dokumen/pihak yang bisa dipertanggungjawabkan.
 */
export const SUMBER_MMSI = ['PUBLIC_TRACKING', 'COMPANY_DOCUMENT', 'PRINCIPAL_CONFIRMATION', 'OTHER_VERIFIED'] as const
export type SumberMmsi = (typeof SUMBER_MMSI)[number]
export const SUMBER_MMSI_TERVERIFIKASI: readonly SumberMmsi[] = ['COMPANY_DOCUMENT', 'PRINCIPAL_CONFIRMATION', 'OTHER_VERIFIED']

/** MMSI: buang spasi/titik/strip pemisah. Huruf TIDAK dibuang — "52520043A" harus ditolak, bukan diam-diam jadi 8 digit. */
export function normalisasiMmsi(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim().replace(/[\s.-]/g, '')
  return s === '' ? null : s
}

export const mmsiSah = (s: string): boolean => /^\d{9}$/.test(s)

/** IMO: buang awalan "IMO" & spasi. "0"/"0000000" = kapal tanpa nomor IMO (lazim untuk kapal domestik) → null. */
export function normalisasiImo(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim().replace(/^imo[\s:.#-]*/i, '').replace(/\s+/g, '')
  if (s === '' || /^0+$/.test(s)) return null
  return s
}

/** Check digit IMO: Σ d[i]×(7−i) untuk i=0..5, mod 10 = d[6]. */
export function imoCheckDigitSah(imo: string): boolean {
  if (!/^\d{7}$/.test(imo)) return false
  let jumlah = 0
  for (let i = 0; i < 6; i++) jumlah += Number(imo[i]) * (7 - i)
  return jumlah % 10 === Number(imo[6])
}

/** Call sign: huruf besar, tanpa spasi. Tidak unik — satu call sign bisa tercatat untuk pasangan tug/barge di dokumen lama. */
export function normalisasiCallSign(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim().toUpperCase().replace(/\s+/g, '')
  return s === '' ? null : s
}

export type IdentitasMmsi = {
  mmsi: string | null
  mmsiSource: string | null
  mmsiVerifiedAt: Date | null
}

/**
 * Kapan MMSI dianggap terverifikasi. Null untuk PUBLIC_TRACKING/tanpa MMSI.
 * Stempel waktu lama DIPERTAHANKAN bila MMSI dan sumbernya tidak berubah — menyimpan
 * ulang form tanpa mengubah apa pun tidak boleh menggeser tanggal verifikasi.
 */
export function hitungVerifikasiMmsi(
  sebelum: IdentitasMmsi | null,
  mmsi: string | null,
  sumber: string | null,
  sekarang: Date,
): Date | null {
  if (!mmsi || !sumber || !(SUMBER_MMSI_TERVERIFIKASI as readonly string[]).includes(sumber)) return null
  if (sebelum && sebelum.mmsi === mmsi && sebelum.mmsiSource === sumber && sebelum.mmsiVerifiedAt) {
    return sebelum.mmsiVerifiedAt
  }
  return sekarang
}

export type DataIdentitas = {
  imoNumber: string | null
  callSign: string | null
  /** Hanya ada bila body menyebut `mmsi`/`mmsiSource` — kunci yang tak disebut berarti TIDAK DIUBAH. */
  mmsi?: string | null
  mmsiSource?: string | null
  mmsiVerifiedAt?: Date | null
}

export type HasilIdentitas = {
  data: DataIdentitas
  /** Menolak penyimpanan (400). */
  errors: string[]
  /** Tidak menolak — data lama/domestik tetap boleh disimpan (mis. check digit IMO). */
  warnings: string[]
}

/**
 * Normalisasi + validasi identitas kapal dari body POST/PATCH.
 *
 * Aturan "kunci tak disebut = tidak diubah" untuk MMSI melindungi klien lama yang
 * mengirim body tanpa field MMSI (mis. tombol "tambah kapal" di Port Call Manager)
 * dari menghapus MMSI yang sudah tersimpan.
 */
export function identitasKapal(
  body: Record<string, unknown>,
  sebelum: IdentitasMmsi | null,
  sekarang: Date = new Date(),
): HasilIdentitas {
  const errors: string[] = []
  const warnings: string[] = []

  const imoNumber = normalisasiImo(body.imoNumber)
  if (imoNumber && !imoCheckDigitSah(imoNumber)) {
    warnings.push(
      /^\d{7}$/.test(imoNumber)
        ? `No. IMO ${imoNumber} tidak lolos pemeriksaan check digit — tetap disimpan, mohon periksa kembali.`
        : `No. IMO "${imoNumber}" bukan 7 digit angka — tetap disimpan, mohon periksa kembali.`,
    )
  }
  const data: DataIdentitas = { imoNumber, callSign: normalisasiCallSign(body.callSign) }

  const sentuhMmsi = 'mmsi' in body || 'mmsiSource' in body
  if (sentuhMmsi) {
    const mmsi = 'mmsi' in body ? normalisasiMmsi(body.mmsi) : (sebelum?.mmsi ?? null)
    let sumber = 'mmsiSource' in body ? str(body.mmsiSource) : (sebelum?.mmsiSource ?? null)
    if (sumber) sumber = sumber.toUpperCase()

    if (mmsi && !mmsiSah(mmsi)) errors.push('MMSI harus tepat 9 digit angka.')
    if (!mmsi) {
      sumber = null
    } else if (!sumber) {
      errors.push('Sumber MMSI wajib dipilih bila MMSI diisi.')
    } else if (!(SUMBER_MMSI as readonly string[]).includes(sumber)) {
      errors.push(`Sumber MMSI tidak dikenal. Pilihan: ${SUMBER_MMSI.join(', ')}.`)
    }

    data.mmsi = mmsi
    data.mmsiSource = sumber
    data.mmsiVerifiedAt = errors.length ? null : hitungVerifikasiMmsi(sebelum, mmsi, sumber, sekarang)
  }

  return { data, errors, warnings }
}

/** Peran kapal di dalam satu voyage. Kapal UTAMA tidak punya nilai di sini — ia ditentukan `Voyage.vesselId`. */
export const PERAN_KAPAL_VOYAGE = ['TUG', 'BARGE'] as const
export const MAKS_KAPAL_PER_VOYAGE = 10

export type KapalVoyageMasukan = { vesselId: string; role: string | null }

/** Validasi daftar kapal voyage (PUT /api/voyages/:id/vessels). Urutan larik = urutan tampil. */
export function bacaDaftarKapalVoyage(v: unknown): { items: KapalVoyageMasukan[]; errors: string[] } {
  const errors: string[] = []
  if (!Array.isArray(v)) return { items: [], errors: ['Daftar kapal wajib berupa larik.'] }
  if (v.length === 0) errors.push('Minimal satu kapal.')
  if (v.length > MAKS_KAPAL_PER_VOYAGE) errors.push(`Maksimal ${MAKS_KAPAL_PER_VOYAGE} kapal per voyage.`)

  const items: KapalVoyageMasukan[] = []
  v.forEach((raw, i) => {
    const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
    const vesselId = str(o.vesselId)
    if (!vesselId) {
      errors.push(`Kapal ke-${i + 1} belum dipilih.`)
      return
    }
    const r = str(o.role)
    const role = r ? r.toUpperCase() : null
    if (role && !(PERAN_KAPAL_VOYAGE as readonly string[]).includes(role)) {
      errors.push(`Peran "${r}" tidak dikenal. Pilihan: ${PERAN_KAPAL_VOYAGE.join(', ')}, atau kosong.`)
      return
    }
    items.push({ vesselId, role })
  })

  if (new Set(items.map((x) => x.vesselId)).size !== items.length) {
    errors.push('Kapal yang sama tidak boleh ditambahkan dua kali ke satu voyage.')
  }
  return { items, errors }
}
