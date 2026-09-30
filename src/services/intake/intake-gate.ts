// Gerbang fitur Vessel Call Intake — logika MURNI, TANPA impor (PRD-004 Step 3).
//
// Aktif hanya bila VESSEL_CALL_INTAKE_ENABLED bernilai PERSIS "true" (bawaan mati).
// Gerbang ini BERLAPIS di atas gerbang Automation Hub (allowlist tenant + peran),
// tidak menggantikannya — lihat intake-access.ts.
//
// Pengekstrak: OPENROUTER (bawaan) atau FAKE (uji/dev tanpa jaringan). FAKE di
// produksi, atau nilai tak dikenal → seluruh fitur MATI (gagal tertutup, pola AIS).

export const PENGEKSTRAK_INTAKE = ['OPENROUTER', 'FAKE'] as const
export type PengekstrakIntake = (typeof PENGEKSTRAK_INTAKE)[number]

export type AlasanIntakeNonaktif = 'NONAKTIF' | 'FLAG_TIDAK_SAH' | 'PENGEKSTRAK_TIDAK_SAH' | 'PENGEKSTRAK_DILARANG_PRODUKSI'

export type KonfigurasiIntake = {
  aktif: boolean
  pengekstrak: PengekstrakIntake
  /** Batas waktu panggilan AI (ms). */
  batasWaktuMs: number
  alasan: AlasanIntakeNonaktif | null
}

export const BATAS_WAKTU_AI_BAWAAN_MS = 60_000

export function bacaKonfigurasiIntake(env: Readonly<Record<string, string | undefined>>): KonfigurasiIntake {
  const mati = (alasan: AlasanIntakeNonaktif): KonfigurasiIntake => ({
    aktif: false,
    pengekstrak: 'OPENROUTER',
    batasWaktuMs: BATAS_WAKTU_AI_BAWAAN_MS,
    alasan,
  })
  const flag = (env.VESSEL_CALL_INTAKE_ENABLED ?? '').trim()
  if (flag === '' || flag === 'false') return mati('NONAKTIF')
  if (flag !== 'true') return mati('FLAG_TIDAK_SAH')

  const p = (env.VESSEL_CALL_INTAKE_EXTRACTOR ?? 'OPENROUTER').trim() || 'OPENROUTER'
  if (!(PENGEKSTRAK_INTAKE as readonly string[]).includes(p)) return mati('PENGEKSTRAK_TIDAK_SAH')
  if (p === 'FAKE' && env.NODE_ENV === 'production') return mati('PENGEKSTRAK_DILARANG_PRODUKSI')

  return { aktif: true, pengekstrak: p as PengekstrakIntake, batasWaktuMs: BATAS_WAKTU_AI_BAWAAN_MS, alasan: null }
}
