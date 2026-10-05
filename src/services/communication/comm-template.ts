// Template pesan WA-1 — deterministik, TANPA LLM (Step 2A). Hanya `import type`.
//
// Delapan template berversi PRD-WA-1 §11 (ID/EN × jadwal/EOSP/ALL_FAST/SAILED),
// disalin PERSIS — urutan baris, tanda baca, dan signature tetap. Input sama +
// versi sama → body identik byte-per-byte (AC-07).
//
// Aturan:
//   • Data (nama kapal/pelabuhan, nomor voyage) dinormalisasi: karakter kontrol,
//     newline, dan pemisah baris Unicode → satu spasi; spasi beruntun dirapatkan.
//     Teks data yang memuat `{{` atau `}}` DITOLAK (tak boleh menyamar jadi token).
//   • Token yang tak terisi, atau `{{`/`}}` yang tersisa di hasil → GAGAL.
//   • Jadwal: tanggal "YYYY-MM-DD" saja, tanpa jam & zona (K-1).
//   • Milestone: waktu lokal operasional yang SUDAH diformat formatWaktuLokal()
//     (comm-policy.ts) — bentuknya diperiksa ulang di sini.
//   • ALL_FAST tanpa terminal/berth (K-3).
//   • Send memakai body snapshot; berkas ini tak pernah dipanggil ulang saat Send.

import type { KeluargaEvent, PerubahanJadwal } from './comm-policy'

export const BAHASA_PESAN = ['ID', 'EN'] as const
export type BahasaPesan = (typeof BAHASA_PESAN)[number]

export const VERSI_TEMPLATE = 1

export class GalatTemplate extends Error {
  readonly code: 'TEMPLATE_DATA_INVALID' | 'TEMPLATE_TOKEN_UNRESOLVED' | 'TEMPLATE_INPUT_INVALID'
  constructor(code: GalatTemplate['code'], pesan: string) {
    super(pesan)
    this.name = 'GalatTemplate'
    this.code = code
  }
}

const SLUG: Readonly<Record<KeluargaEvent, string>> = {
  SCHEDULE_CHANGE: 'schedule',
  EOSP: 'eosp',
  ALL_FAST: 'all_fast',
  SAILED: 'sailed',
}

/** Mis. `wa1.schedule.ID.v1` (§11.1). */
export function idTemplate(keluarga: KeluargaEvent, bahasa: BahasaPesan): string {
  return `wa1.${SLUG[keluarga]}.${bahasa}.v${VERSI_TEMPLATE}`
}

const PEMBUKA: Readonly<Record<BahasaPesan, string>> = {
  ID: '[SIMULASI INTERNAL — TIDAK DIKIRIM]',
  EN: '[INTERNAL SIMULATION — NOT SENT]',
}
const PENUTUP: Readonly<Record<BahasaPesan, string>> = {
  ID: 'Hormat kami,\nPT Tribuana Solusi Maritim',
  EN: 'Regards,\nPT Tribuana Solusi Maritim',
}
const BARIS_VOYAGE: Readonly<Record<BahasaPesan, string>> = {
  ID: 'Voyage: {{voyage_number}} | Pelabuhan: {{port_name}}',
  EN: 'Voyage: {{voyage_number}} | Port: {{port_name}}',
}
const SAPAAN: Readonly<Record<BahasaPesan, string>> = { ID: 'Yth. Bapak/Ibu,', EN: 'Dear Sir/Madam,' }

const susun = (bahasa: BahasaPesan, judul: string, isi: string): string =>
  [PEMBUKA[bahasa], judul, BARIS_VOYAGE[bahasa], SAPAAN[bahasa], isi, PENUTUP[bahasa]].join('\n')

/** Teks template mentah per (keluarga, bahasa) — §11.2–§11.5. */
export const TEMPLATE: Readonly<Record<KeluargaEvent, Readonly<Record<BahasaPesan, string>>>> = {
  SCHEDULE_CHANGE: {
    ID: susun('ID', 'Update Jadwal Kapal — {{vessel_name}}', 'Berikut perubahan jadwal {{vessel_name}}:\n{{schedule_lines_ID}}'),
    EN: susun('EN', 'Vessel Schedule Update — {{vessel_name}}', 'Please note the following schedule changes for {{vessel_name}}:\n{{schedule_lines_EN}}'),
  },
  EOSP: {
    ID: susun('ID', 'Update Kapal — {{vessel_name}}', 'Milestone EOSP untuk {{vessel_name}} pada kunjungan {{port_name}} tercatat pada {{event_local_time}}.'),
    EN: susun('EN', 'Vessel Update — {{vessel_name}}', 'The EOSP milestone for {{vessel_name}} on the {{port_name}} port call was recorded at {{event_local_time}}.'),
  },
  ALL_FAST: {
    ID: susun('ID', 'Update Sandar — {{vessel_name}}', '{{vessel_name}} — ALL FAST tercatat di {{port_name}} pada {{event_local_time}}.'),
    EN: susun('EN', 'Berthing Update — {{vessel_name}}', '{{vessel_name}} — ALL FAST recorded at {{port_name}} at {{event_local_time}}.'),
  },
  SAILED: {
    ID: susun('ID', 'Update Keberangkatan — {{vessel_name}}', '{{vessel_name}} telah berangkat dari {{port_name}} pada {{event_local_time}}.'),
    EN: susun('EN', 'Departure Update — {{vessel_name}}', '{{vessel_name}} sailed from {{port_name}} at {{event_local_time}}.'),
  },
}

const LABEL_MEDAN = { eta: 'ETA', etd: 'ETD' } as const

/**
 * Normalisasi data teks: C0/C1, DEL, U+2028/2029 → spasi; spasi beruntun → satu;
 * trim. Kosong sesudahnya, atau memuat `{{`/`}}` → GalatTemplate.
 */
export function normalisasiTeksData(v: unknown, nama: string): string {
  if (typeof v !== 'string') throw new GalatTemplate('TEMPLATE_DATA_INVALID', `${nama} wajib teks.`)
  // eslint-disable-next-line no-control-regex
  const bersih = v.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (bersih === '') throw new GalatTemplate('TEMPLATE_DATA_INVALID', `${nama} kosong.`)
  if (bersih.includes('{{') || bersih.includes('}}')) throw new GalatTemplate('TEMPLATE_DATA_INVALID', `${nama} memuat penanda token.`)
  return bersih
}

/**
 * Isi token `{{nama}}` sekali jalan (nilai tak pernah dipindai ulang). Token
 * tanpa nilai, atau sisa `{{`/`}}` di hasil → TEMPLATE_TOKEN_UNRESOLVED.
 */
export function isiTemplate(teks: string, nilai: Readonly<Record<string, string>>): string {
  const hasil = teks.replace(/\{\{([a-zA-Z_]+)\}\}/g, (_, k: string) => {
    if (!Object.prototype.hasOwnProperty.call(nilai, k)) {
      throw new GalatTemplate('TEMPLATE_TOKEN_UNRESOLVED', `Token {{${k}}} tidak terisi.`)
    }
    return nilai[k]
  })
  if (hasil.includes('{{') || hasil.includes('}}')) {
    throw new GalatTemplate('TEMPLATE_TOKEN_UNRESOLVED', 'Penanda token tersisa di hasil render.')
  }
  return hasil
}

const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/
const POLA_WAKTU_LOKAL = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2} \(UTC[+-]\d{2}:\d{2}, [A-Z][A-Za-z]+(?:\/[A-Za-z0-9][A-Za-z0-9_+-]*){1,2}\)$/

export type InputPesan = {
  keluarga: KeluargaEvent
  bahasa: BahasaPesan
  vesselName: string
  voyageNumber: string
  portName: string
  /** Wajib & hanya untuk SCHEDULE_CHANGE. */
  perubahan?: readonly PerubahanJadwal[]
  /** Wajib & hanya untuk milestone. */
  eventLocalTime?: string
}

export type PesanTerender = { templateId: string; templateVersion: number; bahasa: BahasaPesan; body: string }

function barisJadwal(bahasa: BahasaPesan, perubahan: readonly PerubahanJadwal[]): string {
  const urut = (['eta', 'etd'] as const).map((m) => perubahan.filter((p) => p.medan === m))
  if (urut.some((x) => x.length > 1) || urut[0].length + urut[1].length !== perubahan.length || perubahan.length === 0) {
    throw new GalatTemplate('TEMPLATE_INPUT_INVALID', 'Perubahan jadwal harus berisi eta dan/atau etd, masing-masing paling banyak sekali.')
  }
  return urut
    .flat()
    .map((p) => {
      if (!POLA_TANGGAL.test(p.lama) || !POLA_TANGGAL.test(p.baru)) {
        throw new GalatTemplate('TEMPLATE_INPUT_INVALID', 'Tanggal jadwal harus YYYY-MM-DD.')
      }
      const L = LABEL_MEDAN[p.medan]
      return bahasa === 'ID' ? `${L}: dari ${p.lama} menjadi ${p.baru}.` : `${L}: revised from ${p.lama} to ${p.baru}.`
    })
    .join('\n')
}

/** Render deterministik. Melempar GalatTemplate bila input tak sah — tak pernah menebak. */
export function renderPesan(i: InputPesan): PesanTerender {
  if (!(BAHASA_PESAN as readonly string[]).includes(i.bahasa)) throw new GalatTemplate('TEMPLATE_INPUT_INVALID', 'Bahasa harus ID atau EN.')
  const tmpl = TEMPLATE[i.keluarga]?.[i.bahasa]
  if (!tmpl) throw new GalatTemplate('TEMPLATE_INPUT_INVALID', 'Keluarga event tidak dikenal.')

  const nilai: Record<string, string> = {
    vessel_name: normalisasiTeksData(i.vesselName, 'vessel_name'),
    voyage_number: normalisasiTeksData(i.voyageNumber, 'voyage_number'),
    port_name: normalisasiTeksData(i.portName, 'port_name'),
  }
  if (i.keluarga === 'SCHEDULE_CHANGE') {
    if (i.eventLocalTime !== undefined || !i.perubahan) throw new GalatTemplate('TEMPLATE_INPUT_INVALID', 'Jadwal: perubahan wajib, tanpa waktu lokal.')
    nilai[`schedule_lines_${i.bahasa}`] = barisJadwal(i.bahasa, i.perubahan)
  } else {
    if (i.perubahan !== undefined || typeof i.eventLocalTime !== 'string' || !POLA_WAKTU_LOKAL.test(i.eventLocalTime)) {
      throw new GalatTemplate('TEMPLATE_INPUT_INVALID', 'Milestone: waktu lokal "YYYY-MM-DD HH:mm (UTC±HH:mm, Zona)" wajib, tanpa perubahan jadwal.')
    }
    nilai.event_local_time = i.eventLocalTime
  }
  return { templateId: idTemplate(i.keluarga, i.bahasa), templateVersion: VERSI_TEMPLATE, bahasa: i.bahasa, body: isiTemplate(tmpl, nilai) }
}
