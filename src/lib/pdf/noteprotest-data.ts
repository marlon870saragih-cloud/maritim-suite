import { SAMPLE_EPDA, type EpdaTenant } from './epda-data'

export type NoteProtestData = {
  tenant: EpdaTenant
  docNumber: string
  date: string // tanggal protes dicatat
  place: string // tempat protes dicatat (pelabuhan kedatangan)
  // Nakhoda & kapal
  masterName: string
  vesselName: string
  imo: string
  flag?: string
  grt?: string
  // Pelayaran
  voyageNo?: string
  fromPort: string
  toPort: string
  cargo: string
  departureDate: string
  arrivalDate: string
  // Isi protes
  statement: string // uraian kondisi cuaca/laut yang dihadapi (multiline)
  reservation: string // klausul reservasi hak (standar)
  // Dicatat di hadapan
  notedBefore: string // Notaris / Syahbandar (nama & jabatan)
}

// ====== DATA CONTOH (wording umum Note of Protest / Sea Protest) ======
export const SAMPLE_NOTEPROTEST: NoteProtestData = {
  tenant: SAMPLE_EPDA.tenant,
  docNumber: 'NOP/2026/06/0121',
  date: '01 Jul 2026',
  place: 'Samarinda',
  masterName: 'Capt. Budi Santoso',
  vesselName: 'MT Soechi Asia',
  imo: '9456231',
  flag: 'Indonesia',
  grt: '8,500',
  voyageNo: 'V.118',
  fromPort: 'Balikpapan',
  toPort: 'Samarinda',
  cargo: 'MGO 6,000 KL',
  departureDate: '28 Jun 2026',
  arrivalDate: '30 Jun 2026',
  statement:
    'During the voyage from the above port of departure to the port of arrival, the vessel encountered heavy weather, ' +
    'strong winds of Beaufort force 7–8, rough to very rough seas and heavy swell, causing the vessel to labour and ' +
    'pitch heavily and to ship water on deck. The Master took all reasonable precautions for the safety of the vessel, ' +
    'crew and cargo, reducing speed and altering course as necessary.',
  reservation:
    'NOW THEREFORE, I, the Master, do hereby note and extend this Protest against all losses, damages, shortages or ' +
    'consequences whatsoever sustained or that may hereafter appear to have been sustained by reason of the said heavy ' +
    'weather and the perils of the sea, reserving the right to extend this Protest at time and place convenient.',
  notedBefore: 'Kantor Kesyahbandaran dan Otoritas Pelabuhan (KSOP) Samarinda',
}
