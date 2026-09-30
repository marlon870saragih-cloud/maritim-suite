// Ringkasan hasil jalan agen INTAKE untuk AgentRun — MURNI (PRD-005 Step 3B, owner Q3).
// Hanya `import type`.
//
// AgentRun.result untuk intake berisi DATA RINGKASAN SAJA: klasifikasi, jumlah, NAMA
// field yang terisi (bukan nilainya), kode flag, hasil validasi, tingkat duplikat.
// DILARANG: nilai field kunjungan (nama kapal, pelabuhan, tanggal, pihak, cargo),
// kontak, teks sumber, dokumen, prompt, respons penyedia, salinan proposal.
// Usulan tervalidasi lengkap tetap di VesselCallIntake.proposal (sumber kebenaran fitur).

import type { FieldUsulan, Proposal } from '../intake/intake-policy'

export const VERSI_RINGKASAN_INTAKE = 1

export type RingkasanHasilIntake = {
  versi: number
  classification: string
  /** Kapal non-dikecualikan dalam usulan. */
  jumlahKapal: number
  jumlahCargo: number
  /** Jumlah field tingkat atas + field kapal yang berisi nilai. */
  jumlahFieldTerisi: number
  /** NAMA field tingkat atas yang berisi nilai (tanpa nilainya). */
  fieldTerisi: string[]
  /** Jumlah flag seluruh field (tingkat atas + kapal). */
  jumlahFlag: number
  /** Kode flag unik, terurut (mis. NOT_IN_SOURCE). */
  kodeFlag: string[]
  /** true bila sistem menimpa klasifikasi AI (alasannya TIDAK disalin). */
  klasifikasiDitimpa: boolean
  duplicateLevel: string
  /** VALID = lolos validasi deterministik; hasil lain sudah tercermin di klasifikasi. */
  validasi: 'VALID'
}

/** Field tingkat atas yang berbentuk FieldUsulan (kontak & cargo SENGAJA di luar daftar ini). */
const FIELD_ATAS = [
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
  'requestDate',
] as const

const FIELD_KAPAL = ['name', 'imo', 'mmsi', 'callSign', 'vesselType', 'role'] as const

const terisi = (f: FieldUsulan<unknown> | undefined): boolean => !!f && f.value !== null && f.value !== undefined && f.value !== ''

export function ringkasHasilIntake(a: { classification: string; proposal: Proposal; duplicateLevel: string }): RingkasanHasilIntake {
  const p = a.proposal
  const kapal = (Array.isArray(p.vessels) ? p.vessels : []).filter((k) => !k.excluded)
  const fieldTerisi = FIELD_ATAS.filter((n) => terisi(p[n] as FieldUsulan<unknown>))
  let jumlahFieldKapal = 0
  const flag: string[] = []
  for (const n of FIELD_ATAS) for (const fl of (p[n] as FieldUsulan<unknown> | undefined)?.flags ?? []) flag.push(fl)
  for (const k of kapal) {
    for (const n of FIELD_KAPAL) {
      const f = k[n] as FieldUsulan<unknown>
      if (terisi(f)) jumlahFieldKapal++
      for (const fl of f?.flags ?? []) flag.push(fl)
    }
  }
  return {
    versi: VERSI_RINGKASAN_INTAKE,
    classification: a.classification,
    jumlahKapal: kapal.length,
    jumlahCargo: Array.isArray(p.cargoes) ? p.cargoes.length : 0,
    jumlahFieldTerisi: fieldTerisi.length + jumlahFieldKapal,
    fieldTerisi: [...fieldTerisi],
    jumlahFlag: flag.length,
    kodeFlag: Array.from(new Set(flag)).sort(),
    klasifikasiDitimpa: typeof p.classificationReason === 'string' && p.classificationReason.length > 0,
    duplicateLevel: a.duplicateLevel,
    validasi: 'VALID',
  }
}

/** Satu baris ≤ 300 karakter, tanpa nilai field. */
export function teksRingkasanIntake(r: RingkasanHasilIntake): string {
  return `INTAKE ${r.classification}: ${r.jumlahKapal} kapal, ${r.jumlahCargo} cargo, ${r.jumlahFieldTerisi} field terisi, ${r.jumlahFlag} flag, duplikat ${r.duplicateLevel}`
}
