// Template pesan klien WA-2a Step 2F (F2) — deterministik, TANPA LLM, MURNI (tanpa DB/jaringan/env).
//
// Delapan template disetujui owner (ID/EN × SCHEDULE_CHANGE/EOSP/ALL_FAST/SAILED), disalin PERSIS:
// urutan baris, baris kosong, tanda baca, dan signature tetap. Input sama → body identik byte-per-byte.
//
// Aturan (keputusan owner F2):
//   • Data dinamis dipakai APA ADANYA atau DITOLAK — tidak pernah diubah diam-diam. Ditolak bila:
//     bukan teks / kosong / spasi di awal-akhir; karakter kontrol, pemisah baris, zero-width, atau
//     kendali arah teks (bidi); penanda token `{{`/`}}`; penanda format WhatsApp (* _ ~ `);
//     awalan baris yang diubah WhatsApp menjadi kutipan/daftar (`>`, `-`, `•`, `1.`).
//   • SCHEDULE_CHANGE: hanya ETA/ETD yang berubah (urutan ETA lalu ETD), tanggal `YYYY-MM-DD` (K-1),
//     nilai lama ≠ nilai baru; ada kalimat "jadwal dapat berubah". Tanpa ETB (K-3).
//   • Milestone: waktu lokal `YYYY-MM-DD HH:mm (UTC±HH:mm, Zona)` yang sudah diformat dari sumber
//     tervalidasi (revalidasi F3) — bentuknya diperiksa ulang di sini.
//   • Semua template memuat pemberitahuan bahwa balasan belum dipantau (inbound = WA-2c).
//   • Tanpa nama PIC / nomor staf; sapaan generik. Body ≤ 4096 karakter (batas teks WhatsApp).
// Template ini bukan template resmi Meta/WhatsApp; registrasi template resmi = fase provider.

import { KELUARGA_PESAN_KLIEN } from './wa2-policy'

export const BAHASA_PESAN_KLIEN = ['ID', 'EN'] as const
export type BahasaPesanKlien = (typeof BAHASA_PESAN_KLIEN)[number]
export type KeluargaTemplateKlien = (typeof KELUARGA_PESAN_KLIEN)[number]

export const VERSI_TEMPLATE_KLIEN = 1
/** Batas panjang teks satu pesan WhatsApp. */
export const MAKS_KARAKTER_BODY = 4096

export type KodeGalatTemplateKlien = 'TEMPLATE_DATA_INVALID' | 'TEMPLATE_INPUT_INVALID' | 'TEMPLATE_TOKEN_UNRESOLVED'

export class GalatTemplateKlien extends Error {
  readonly code: KodeGalatTemplateKlien
  constructor(code: KodeGalatTemplateKlien, pesan: string) {
    super(pesan)
    this.name = 'GalatTemplateKlien'
    this.code = code
  }
}

const SLUG: Readonly<Record<KeluargaTemplateKlien, string>> = {
  SCHEDULE_CHANGE: 'schedule',
  EOSP: 'eosp',
  ALL_FAST: 'allfast',
  SAILED: 'sailed',
}

/** Mis. `wa2.schedule.ID.v1`. */
export function idTemplateKlien(keluarga: KeluargaTemplateKlien, bahasa: BahasaPesanKlien): string {
  return `wa2.${SLUG[keluarga]}.${bahasa}.v${VERSI_TEMPLATE_KLIEN}`
}

const BALASAN: Readonly<Record<BahasaPesanKlien, string>> = {
  ID: 'Balasan ke nomor ini belum kami pantau. Mohon hubungi kami melalui saluran yang biasa Anda gunakan.',
  EN: 'Replies to this number are not yet monitored. Please contact us through your usual channel.',
}
const PENUTUP: Readonly<Record<BahasaPesanKlien, string>> = {
  ID: 'Hormat kami,\nPT Tribuana Solusi Maritim',
  EN: 'Regards,\nPT Tribuana Solusi Maritim',
}
const BARIS_VOYAGE: Readonly<Record<BahasaPesanKlien, string>> = {
  ID: 'Voyage: {{voyage_number}} | Pelabuhan: {{port_name}}',
  EN: 'Voyage: {{voyage_number}} | Port: {{port_name}}',
}
const SAPAAN: Readonly<Record<BahasaPesanKlien, string>> = { ID: 'Yth. Bapak/Ibu,', EN: 'Dear Sir/Madam,' }
const JADWAL_BERUBAH: Readonly<Record<BahasaPesanKlien, string>> = {
  ID: 'Jadwal dapat berubah sewaktu-waktu.',
  EN: 'Schedule is subject to change.',
}

const susun = (bahasa: BahasaPesanKlien, judul: string, isi: readonly string[]): string =>
  [judul, BARIS_VOYAGE[bahasa], '', SAPAAN[bahasa], '', ...isi, '', BALASAN[bahasa], '', PENUTUP[bahasa]].join('\n')

/** Teks template mentah per (keluarga, bahasa) — disetujui owner F2. */
export const TEMPLATE_KLIEN: Readonly<Record<KeluargaTemplateKlien, Readonly<Record<BahasaPesanKlien, string>>>> = Object.freeze({
  SCHEDULE_CHANGE: Object.freeze({
    ID: susun('ID', 'Update Jadwal Kapal — {{vessel_name}}', ['Berikut perubahan jadwal {{vessel_name}}:', '{{schedule_lines_ID}}', '', JADWAL_BERUBAH.ID]),
    EN: susun('EN', 'Vessel Schedule Update — {{vessel_name}}', ['Please note the following schedule changes for {{vessel_name}}:', '{{schedule_lines_EN}}', '', JADWAL_BERUBAH.EN]),
  }),
  EOSP: Object.freeze({
    ID: susun('ID', 'Update Kapal — {{vessel_name}}', ['Milestone EOSP untuk {{vessel_name}} pada kunjungan {{port_name}} tercatat pada {{event_local_time}}.']),
    EN: susun('EN', 'Vessel Update — {{vessel_name}}', ['The EOSP milestone for {{vessel_name}} on the {{port_name}} port call was recorded at {{event_local_time}}.']),
  }),
  ALL_FAST: Object.freeze({
    ID: susun('ID', 'Update Sandar — {{vessel_name}}', ['{{vessel_name}} — ALL FAST tercatat di {{port_name}} pada {{event_local_time}}.']),
    EN: susun('EN', 'Berthing Update — {{vessel_name}}', ['{{vessel_name}} — ALL FAST recorded at {{port_name}} at {{event_local_time}}.']),
  }),
  SAILED: Object.freeze({
    ID: susun('ID', 'Update Keberangkatan — {{vessel_name}}', ['{{vessel_name}} telah berangkat dari {{port_name}} pada {{event_local_time}}.']),
    EN: susun('EN', 'Departure Update — {{vessel_name}}', ['{{vessel_name}} sailed from {{port_name}} at {{event_local_time}}.']),
  }),
})

// ================================================================ validasi data (tolak, jangan ubah)

// C0, DEL, C1, pemisah baris/paragraf, zero-width, kendali arah teks (bidi), BOM.
// eslint-disable-next-line no-control-regex
const KARAKTER_TERLARANG = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/
const PENANDA_FORMAT_WA = /[*_~`]/
const AWALAN_BARIS_WA = /^(?:>|-|•|\d+\.\s)/

/** Teks data dipakai APA ADANYA; tidak sah → GalatTemplateKlien (tak pernah dinormalisasi). */
export function periksaTeksData(v: unknown, nama: string): string {
  if (typeof v !== 'string') throw new GalatTemplateKlien('TEMPLATE_DATA_INVALID', `${nama} wajib teks.`)
  if (v.trim() === '') throw new GalatTemplateKlien('TEMPLATE_DATA_INVALID', `${nama} kosong.`)
  if (v !== v.trim()) throw new GalatTemplateKlien('TEMPLATE_DATA_INVALID', `${nama} diawali/diakhiri spasi.`)
  if (KARAKTER_TERLARANG.test(v)) throw new GalatTemplateKlien('TEMPLATE_DATA_INVALID', `${nama} memuat karakter kontrol/tak terlihat.`)
  if (v.includes('{{') || v.includes('}}')) throw new GalatTemplateKlien('TEMPLATE_DATA_INVALID', `${nama} memuat penanda token.`)
  if (PENANDA_FORMAT_WA.test(v)) throw new GalatTemplateKlien('TEMPLATE_DATA_INVALID', `${nama} memuat penanda format WhatsApp.`)
  if (AWALAN_BARIS_WA.test(v)) throw new GalatTemplateKlien('TEMPLATE_DATA_INVALID', `${nama} diawali penanda kutipan/daftar WhatsApp.`)
  return v
}

/** Isi token `{{nama}}` sekali jalan (nilai tak dipindai ulang); token tanpa nilai / sisa penanda → gagal. */
function isiToken(teks: string, nilai: Readonly<Record<string, string>>): string {
  const hasil = teks.replace(/\{\{([a-zA-Z_]+)\}\}/g, (_, k: string) => {
    if (!Object.prototype.hasOwnProperty.call(nilai, k)) throw new GalatTemplateKlien('TEMPLATE_TOKEN_UNRESOLVED', `Token {{${k}}} tidak terisi.`)
    return nilai[k]
  })
  if (hasil.includes('{{') || hasil.includes('}}')) throw new GalatTemplateKlien('TEMPLATE_TOKEN_UNRESOLVED', 'Penanda token tersisa di hasil render.')
  return hasil
}

const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/
const POLA_WAKTU_LOKAL = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2} \(UTC[+-]\d{2}:\d{2}, [A-Z][A-Za-z]+(?:\/[A-Za-z0-9][A-Za-z0-9_+-]*){1,2}\)$/

/** Tanggal kalender sah `YYYY-MM-DD` (bukan hanya bentuk: 2026-02-30 ditolak). */
function tanggalSah(v: unknown): v is string {
  if (typeof v !== 'string' || !POLA_TANGGAL.test(v)) return false
  const d = new Date(`${v}T00:00:00.000Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

export type PerubahanJadwalKlien = { medan: 'eta' | 'etd'; lama: string; baru: string }

export type InputPesanKlien = {
  keluarga: KeluargaTemplateKlien
  bahasa: BahasaPesanKlien
  vesselName: string
  voyageNumber: string
  portName: string
  /** Wajib & hanya untuk SCHEDULE_CHANGE: medan yang BERUBAH saja. */
  perubahan?: readonly PerubahanJadwalKlien[]
  /** Wajib & hanya untuk milestone. */
  eventLocalTime?: string
}

export type PesanKlienTerender = { templateId: string; templateVersion: number; bahasa: BahasaPesanKlien; body: string }

const LABEL_MEDAN = { eta: 'ETA', etd: 'ETD' } as const

function barisJadwal(bahasa: BahasaPesanKlien, perubahan: readonly PerubahanJadwalKlien[]): string {
  if (!Array.isArray(perubahan) || perubahan.length === 0 || perubahan.length > 2) {
    throw new GalatTemplateKlien('TEMPLATE_INPUT_INVALID', 'Perubahan jadwal wajib berisi ETA dan/atau ETD.')
  }
  const urut = (['eta', 'etd'] as const).map((m) => perubahan.filter((p) => p?.medan === m))
  if (urut.some((x) => x.length > 1) || urut[0].length + urut[1].length !== perubahan.length) {
    throw new GalatTemplateKlien('TEMPLATE_INPUT_INVALID', 'Perubahan jadwal hanya ETA/ETD, masing-masing paling banyak sekali.')
  }
  return urut
    .flat()
    .map((p: PerubahanJadwalKlien) => {
      if (!tanggalSah(p.lama) || !tanggalSah(p.baru)) throw new GalatTemplateKlien('TEMPLATE_INPUT_INVALID', 'Tanggal jadwal harus YYYY-MM-DD yang sah.')
      if (p.lama === p.baru) throw new GalatTemplateKlien('TEMPLATE_INPUT_INVALID', 'Medan jadwal yang tidak berubah tidak boleh ditampilkan.')
      const L = LABEL_MEDAN[p.medan]
      return bahasa === 'ID' ? `${L}: dari ${p.lama} menjadi ${p.baru}.` : `${L}: revised from ${p.lama} to ${p.baru}.`
    })
    .join('\n')
}

/** Render deterministik. Input tidak sah → GalatTemplateKlien; tak pernah menebak atau mengubah data. */
export function renderPesanKlien(i: InputPesanKlien): PesanKlienTerender {
  if (!(BAHASA_PESAN_KLIEN as readonly unknown[]).includes(i?.bahasa)) throw new GalatTemplateKlien('TEMPLATE_INPUT_INVALID', 'Bahasa harus ID atau EN.')
  if (!(KELUARGA_PESAN_KLIEN as readonly unknown[]).includes(i.keluarga)) throw new GalatTemplateKlien('TEMPLATE_INPUT_INVALID', 'Keluarga event tidak dikenal.')
  const tmpl = TEMPLATE_KLIEN[i.keluarga][i.bahasa]

  const nilai: Record<string, string> = {
    vessel_name: periksaTeksData(i.vesselName, 'vessel_name'),
    voyage_number: periksaTeksData(i.voyageNumber, 'voyage_number'),
    port_name: periksaTeksData(i.portName, 'port_name'),
  }
  if (i.keluarga === 'SCHEDULE_CHANGE') {
    if (i.eventLocalTime !== undefined || i.perubahan === undefined) throw new GalatTemplateKlien('TEMPLATE_INPUT_INVALID', 'Jadwal: perubahan wajib, tanpa waktu kejadian.')
    nilai[`schedule_lines_${i.bahasa}`] = barisJadwal(i.bahasa, i.perubahan)
  } else {
    if (i.perubahan !== undefined || typeof i.eventLocalTime !== 'string' || !POLA_WAKTU_LOKAL.test(i.eventLocalTime)) {
      throw new GalatTemplateKlien('TEMPLATE_INPUT_INVALID', 'Milestone: waktu lokal "YYYY-MM-DD HH:mm (UTC±HH:mm, Zona)" wajib, tanpa perubahan jadwal.')
    }
    // Nama zona IANA bisa memuat `_` (mis. America/North_Dakota/New_Salem) → format miring WhatsApp: tolak.
    if (PENANDA_FORMAT_WA.test(i.eventLocalTime)) throw new GalatTemplateKlien('TEMPLATE_DATA_INVALID', 'event_local_time memuat penanda format WhatsApp.')
    nilai.event_local_time = i.eventLocalTime
  }
  const body = isiToken(tmpl, nilai)
  if (body.length > MAKS_KARAKTER_BODY) throw new GalatTemplateKlien('TEMPLATE_DATA_INVALID', `Body melebihi ${MAKS_KARAKTER_BODY} karakter.`)
  return { templateId: idTemplateKlien(i.keluarga, i.bahasa), templateVersion: VERSI_TEMPLATE_KLIEN, bahasa: i.bahasa, body }
}
