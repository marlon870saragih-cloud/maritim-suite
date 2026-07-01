import type { EpdaTenant } from './epda-data'

/**
 * Mesin dokumen generik ("simple doc") — satu skema data mendefinisikan sebuah
 * dokumen (particulars + opsional paragraf/tabel/klausul + tanda tangan). Dipakai
 * untuk dokumen surat/daftar yang polanya seragam: SIB, Sign-On/Off, Shore Pass,
 * FAL 4/6/7. Semua dirender oleh SimpleDocument.tsx & SimpleDocForm.tsx dan disimpan
 * lewat /api/documents/simple/[type]. Angka/isi diketik pengguna; AI tak menulis apa pun di sini.
 */
export type Bi = { id: string; en: string }

export type SDField = { key: string; label: Bi; full?: boolean; textarea?: boolean }
export type SDCol = { key: string; label: Bi; flex?: number; w?: number }

export type SimpleData = {
  docNumber: string
  date: string
  fields: Record<string, string>
  intro?: string
  clauses?: string[]
  rows?: Record<string, string>[]
  remarks?: string
  signName: string
  signRole: string
}

export type SimpleRenderData = SimpleData & { tenant: EpdaTenant; docType: string }

export type SimpleSchema = {
  docType: string // nilai enum DocType
  category: 'fal' | 'portcall' | 'clearance' | 'crew'
  prefix: string // awalan nomor & nama file
  title: Bi
  subtitle: Bi
  label: Bi // nama pendek utk daftar/kategori
  desc: Bi
  fields: SDField[]
  introLabel?: Bi
  clausesLabel?: Bi
  table?: { label: Bi; addLabel: Bi; cols: SDCol[] }
  signCap: Bi
  sample: SimpleData
}

const F = (key: string, id: string, en: string, extra?: Partial<SDField>): SDField => ({ key, label: { id, en }, ...extra })
const C = (key: string, id: string, en: string, extra?: Partial<SDCol>): SDCol => ({ key, label: { id, en }, ...extra })

// ---- Skema dokumen ----
export const SIMPLE_SCHEMAS: Record<string, SimpleSchema> = {
  SIB: {
    docType: 'SIB',
    category: 'clearance',
    prefix: 'SIB',
    title: { id: 'SURAT IZIN BERLAYAR', en: 'PORT CLEARANCE (SIB)' },
    subtitle: { id: 'Surat Persetujuan Berlayar', en: 'Sailing / Port Clearance' },
    label: { id: 'Surat Izin Berlayar', en: 'Port Clearance (SIB)' },
    desc: { id: 'Persetujuan berlayar & kelengkapan clearance.', en: 'Sailing approval & clearance readiness.' },
    fields: [
      F('vesselName', 'Nama kapal', 'Vessel name'),
      F('imo', 'IMO / Call Sign', 'IMO / Call Sign'),
      F('flag', 'Bendera', 'Flag'),
      F('gt', 'GT / NRT', 'GT / NRT'),
      F('port', 'Pelabuhan', 'Port'),
      F('nextPort', 'Pelabuhan tujuan', 'Next port'),
      F('voyage', 'Voyage', 'Voyage'),
      F('master', 'Nakhoda', 'Master'),
      F('crewCount', 'Jumlah awak', 'Crew on board'),
      F('cargo', 'Muatan', 'Cargo'),
    ],
    introLabel: { id: 'Pernyataan', en: 'Statement' },
    signCap: { id: 'Diterbitkan oleh / Issued by', en: 'Issued by' },
    sample: {
      docNumber: 'SIB/2026/06/0001',
      date: '24 Jun 2026',
      fields: {
        vesselName: 'MT Soechi Asia', imo: '9456231 · YDXX', flag: 'Indonesia', gt: '8,432 / 4,102',
        port: 'Samarinda', nextPort: 'Balikpapan', voyage: 'V.024/S', master: 'Capt. Budi Santoso',
        crewCount: '18', cargo: 'CPO — 6,500 MT',
      },
      intro:
        'Berdasarkan pemeriksaan kelengkapan dokumen kapal dan pemenuhan kewajiban di pelabuhan, kapal tersebut di atas dinyatakan telah memenuhi persyaratan dan diberikan persetujuan untuk berlayar menuju pelabuhan tujuan.',
      remarks: '',
      signName: 'Marlon Saragih',
      signRole: 'Port Agent',
    },
  },

  CREW_SIGN_ON: {
    docType: 'CREW_SIGN_ON',
    category: 'crew',
    prefix: 'SGN-ON',
    title: { id: 'PEMBERITAHUAN SIGN-ON AWAK', en: 'CREW SIGN-ON NOTICE' },
    subtitle: { id: 'Naik / Sign-On', en: 'Notice of Crew Embarkation' },
    label: { id: 'Sign-On Awak', en: 'Crew Sign-On' },
    desc: { id: 'Pemberitahuan awak naik kapal.', en: 'Crew embarkation notice.' },
    fields: [
      F('vesselName', 'Nama kapal', 'Vessel name'),
      F('imo', 'IMO / Flag', 'IMO / Flag'),
      F('port', 'Pelabuhan', 'Port'),
      F('crewName', 'Nama awak', 'Crew name'),
      F('rank', 'Jabatan', 'Rank / Rating'),
      F('nationality', 'Kebangsaan', 'Nationality'),
      F('passport', 'No. Paspor', 'Passport No.'),
      F('seamanBook', "Buku Pelaut", "Seaman's Book"),
      F('joinDate', 'Tanggal naik', 'Sign-on date'),
      F('flight', 'Penerbangan / Catatan', 'Flight / Notes'),
    ],
    introLabel: { id: 'Pemberitahuan', en: 'Notice' },
    signCap: { id: 'Hormat kami / Port Agent', en: 'Port Agent' },
    sample: {
      docNumber: 'SGN-ON/2026/06/0001',
      date: '24 Jun 2026',
      fields: {
        vesselName: 'MT Soechi Asia', imo: '9456231 · Indonesia', port: 'Samarinda',
        crewName: 'Ahmad Fauzi', rank: 'Chief Officer', nationality: 'Indonesia', passport: 'C1234567',
        seamanBook: 'B9876543', joinDate: '24 Jun 2026', flight: 'GA-560 SUB→BPN',
      },
      intro:
        'Dengan ini diberitahukan bahwa awak kapal tersebut di bawah ini akan naik (sign-on) ke kapal dimaksud. Mohon bantuan proses imigrasi dan formalitas pelabuhan terkait.',
      signName: 'Marlon Saragih',
      signRole: 'Port Agent',
    },
  },

  CREW_SIGN_OFF: {
    docType: 'CREW_SIGN_OFF',
    category: 'crew',
    prefix: 'SGN-OFF',
    title: { id: 'PEMBERITAHUAN SIGN-OFF AWAK', en: 'CREW SIGN-OFF NOTICE' },
    subtitle: { id: 'Turun / Sign-Off', en: 'Notice of Crew Disembarkation' },
    label: { id: 'Sign-Off Awak', en: 'Crew Sign-Off' },
    desc: { id: 'Pemberitahuan awak turun kapal.', en: 'Crew disembarkation notice.' },
    fields: [
      F('vesselName', 'Nama kapal', 'Vessel name'),
      F('imo', 'IMO / Flag', 'IMO / Flag'),
      F('port', 'Pelabuhan', 'Port'),
      F('crewName', 'Nama awak', 'Crew name'),
      F('rank', 'Jabatan', 'Rank / Rating'),
      F('nationality', 'Kebangsaan', 'Nationality'),
      F('passport', 'No. Paspor', 'Passport No.'),
      F('seamanBook', "Buku Pelaut", "Seaman's Book"),
      F('signOffDate', 'Tanggal turun', 'Sign-off date'),
      F('flight', 'Repatriasi / Catatan', 'Repatriation / Notes'),
    ],
    introLabel: { id: 'Pemberitahuan', en: 'Notice' },
    signCap: { id: 'Hormat kami / Port Agent', en: 'Port Agent' },
    sample: {
      docNumber: 'SGN-OFF/2026/06/0001',
      date: '24 Jun 2026',
      fields: {
        vesselName: 'MT Soechi Asia', imo: '9456231 · Indonesia', port: 'Samarinda',
        crewName: 'Rudi Hartono', rank: 'Able Seaman', nationality: 'Indonesia', passport: 'C7654321',
        seamanBook: 'B1234567', signOffDate: '24 Jun 2026', flight: 'BPN→SUB→CGK',
      },
      intro:
        'Dengan ini diberitahukan bahwa awak kapal tersebut di bawah ini akan turun (sign-off) dari kapal dimaksud untuk repatriasi. Mohon bantuan proses imigrasi dan formalitas pelabuhan terkait.',
      signName: 'Marlon Saragih',
      signRole: 'Port Agent',
    },
  },

  SHORE_PASS: {
    docType: 'SHORE_PASS',
    category: 'crew',
    prefix: 'SP',
    title: { id: 'SHORE PASS', en: 'SHORE PASS' },
    subtitle: { id: 'Izin Turun ke Darat', en: 'Crew Shore Leave Pass' },
    label: { id: 'Shore Pass', en: 'Shore Pass' },
    desc: { id: 'Izin awak turun ke darat.', en: 'Crew shore leave permit.' },
    fields: [
      F('crewName', 'Nama awak', 'Crew name'),
      F('rank', 'Jabatan', 'Rank / Rating'),
      F('nationality', 'Kebangsaan', 'Nationality'),
      F('passport', 'No. Paspor', 'Passport No.'),
      F('vesselName', 'Nama kapal', 'Vessel name'),
      F('port', 'Pelabuhan', 'Port'),
      F('validFrom', 'Berlaku dari', 'Valid from'),
      F('validUntil', 'Berlaku sampai', 'Valid until'),
    ],
    introLabel: { id: 'Keterangan', en: 'Note' },
    signCap: { id: 'Diterbitkan oleh / Port Agent', en: 'Issued by / Port Agent' },
    sample: {
      docNumber: 'SP/2026/06/0001',
      date: '24 Jun 2026',
      fields: {
        crewName: 'Joko Widodo', rank: 'Bosun', nationality: 'Indonesia', passport: 'C5551234',
        vesselName: 'MT Soechi Asia', port: 'Samarinda', validFrom: '24 Jun 2026 08:00', validUntil: '24 Jun 2026 20:00',
      },
      intro:
        'Pemegang kartu ini adalah awak kapal tersebut di atas dan diberikan izin turun ke darat selama masa berlaku. Wajib membawa dokumen identitas dan kembali ke kapal sebelum batas waktu.',
      signName: 'Marlon Saragih',
      signRole: 'Port Agent',
    },
  },

  FAL_4: {
    docType: 'FAL_4',
    category: 'fal',
    prefix: 'FAL4',
    title: { id: "DEKLARASI BARANG AWAK", en: "CREW'S EFFECTS DECLARATION" },
    subtitle: { id: 'IMO FAL Form 4', en: 'IMO FAL Form 4' },
    label: { id: "Crew's Effects", en: "Crew's Effects" },
    desc: { id: 'Deklarasi barang bawaan awak (IMO FAL 4).', en: "Crew's effects declaration (IMO FAL 4)." },
    fields: [
      F('vesselName', 'Nama kapal', 'Vessel name'),
      F('imo', 'IMO / Call Sign', 'IMO / Call Sign'),
      F('flag', 'Bendera', 'Flag'),
      F('port', 'Pelabuhan', 'Port'),
      F('voyage', 'Voyage', 'Voyage'),
      F('mode', 'Kedatangan / Keberangkatan', 'Arrival / Departure'),
    ],
    table: {
      label: { id: 'Daftar barang awak', en: "Crew's effects" },
      addLabel: { id: 'Tambah baris', en: 'Add row' },
      cols: [
        C('name', 'Nama awak', 'Name', { flex: 1.4 }),
        C('rank', 'Jabatan', 'Rank', { flex: 1 }),
        C('effects', 'Barang / artikel kena bea', 'Effects / dutiable articles', { flex: 2 }),
        C('remarks', 'Keterangan', 'Remarks', { flex: 1 }),
      ],
    },
    signCap: { id: 'Nakhoda / Master', en: 'Master' },
    sample: {
      docNumber: 'FAL4/2026/06/0001',
      date: '24 Jun 2026',
      fields: {
        vesselName: 'MT Soechi Asia', imo: '9456231 · YDXX', flag: 'Indonesia', port: 'Samarinda',
        voyage: 'V.024/S', mode: 'Arrival',
      },
      rows: [
        { name: 'Ahmad Fauzi', rank: 'C/O', effects: '200 cig · 1 L liquor', remarks: 'Nil' },
        { name: 'Rudi Hartono', rank: 'A/B', effects: 'Nil', remarks: 'Nil' },
      ],
      signName: 'Capt. Budi Santoso',
      signRole: 'Master',
    },
  },

  FAL_6: {
    docType: 'FAL_6',
    category: 'fal',
    prefix: 'FAL6',
    title: { id: 'DAFTAR PENUMPANG', en: 'PASSENGER LIST' },
    subtitle: { id: 'IMO FAL Form 6', en: 'IMO FAL Form 6' },
    label: { id: 'Passenger List', en: 'Passenger List' },
    desc: { id: 'Daftar penumpang (IMO FAL 6).', en: 'Passenger list (IMO FAL 6).' },
    fields: [
      F('vesselName', 'Nama kapal', 'Vessel name'),
      F('imo', 'IMO / Call Sign', 'IMO / Call Sign'),
      F('flag', 'Bendera', 'Flag'),
      F('port', 'Pelabuhan', 'Port'),
      F('voyage', 'Voyage', 'Voyage'),
      F('mode', 'Kedatangan / Keberangkatan', 'Arrival / Departure'),
    ],
    table: {
      label: { id: 'Daftar penumpang', en: 'Passengers' },
      addLabel: { id: 'Tambah baris', en: 'Add row' },
      cols: [
        C('name', 'Nama (Keluarga, Depan)', 'Name (Family, Given)', { flex: 1.6 }),
        C('nationality', 'Kebangsaan', 'Nationality', { flex: 1 }),
        C('dob', 'Tgl lahir', 'Date of birth', { w: 66 }),
        C('embark', 'Naik di', 'Port of embark', { flex: 1 }),
        C('disembark', 'Turun di', 'Port of disembark', { flex: 1 }),
      ],
    },
    signCap: { id: 'Nakhoda / Master', en: 'Master' },
    sample: {
      docNumber: 'FAL6/2026/06/0001',
      date: '24 Jun 2026',
      fields: {
        vesselName: 'MT Soechi Asia', imo: '9456231 · YDXX', flag: 'Indonesia', port: 'Samarinda',
        voyage: 'V.024/S', mode: 'Arrival',
      },
      rows: [
        { name: 'Supercargo, Andi', nationality: 'Indonesia', dob: '1980-05-11', embark: 'Samarinda', disembark: 'Balikpapan' },
      ],
      signName: 'Capt. Budi Santoso',
      signRole: 'Master',
    },
  },

  FAL_7: {
    docType: 'FAL_7',
    category: 'fal',
    prefix: 'FAL7',
    title: { id: 'MANIFES BARANG BERBAHAYA', en: 'DANGEROUS GOODS MANIFEST' },
    subtitle: { id: 'IMO FAL Form 7', en: 'IMO FAL Form 7' },
    label: { id: 'Dangerous Goods', en: 'Dangerous Goods' },
    desc: { id: 'Manifes barang berbahaya (IMO FAL 7).', en: 'Dangerous goods manifest (IMO FAL 7).' },
    fields: [
      F('vesselName', 'Nama kapal', 'Vessel name'),
      F('imo', 'IMO / Call Sign', 'IMO / Call Sign'),
      F('flag', 'Bendera', 'Flag'),
      F('port', 'Pelabuhan', 'Port'),
      F('voyage', 'Voyage', 'Voyage'),
    ],
    table: {
      label: { id: 'Barang berbahaya', en: 'Dangerous goods' },
      addLabel: { id: 'Tambah baris', en: 'Add row' },
      cols: [
        C('bl', 'B/L', 'B/L', { w: 60 }),
        C('un', 'UN No.', 'UN No.', { w: 50 }),
        C('name', 'Proper Shipping Name', 'Proper Shipping Name', { flex: 2 }),
        C('imdg', 'Kelas', 'Class', { w: 40 }),
        C('pg', 'PG', 'PG', { w: 32 }),
        C('qty', 'Jumlah', 'Qty / Pkgs', { flex: 1 }),
        C('stow', 'Stowage', 'Stowage', { flex: 1 }),
      ],
    },
    signCap: { id: 'Nakhoda / Master', en: 'Master' },
    sample: {
      docNumber: 'FAL7/2026/06/0001',
      date: '24 Jun 2026',
      fields: {
        vesselName: 'MT Soechi Asia', imo: '9456231 · YDXX', flag: 'Indonesia', port: 'Samarinda', voyage: 'V.024/S',
      },
      rows: [
        { bl: 'BL-001', un: '1203', name: 'Gasoline', imdg: '3', pg: 'II', qty: '2 IBC', stow: 'On deck' },
      ],
      signName: 'Capt. Budi Santoso',
      signRole: 'Master',
    },
  },

  MARITIME_DECLARATION_OF_HEALTH: {
    docType: 'MARITIME_DECLARATION_OF_HEALTH',
    category: 'clearance',
    prefix: 'MDH',
    title: { id: 'DEKLARASI KESEHATAN MARITIM', en: 'MARITIME DECLARATION OF HEALTH' },
    subtitle: { id: 'Deklarasi Kesehatan', en: 'Health Clearance' },
    label: { id: 'Deklarasi Kesehatan', en: 'Maritime Declaration of Health' },
    desc: { id: 'Deklarasi kesehatan maritim kapal.', en: 'Maritime declaration of health.' },
    fields: [
      F('vesselName', 'Nama kapal', 'Vessel name'),
      F('imo', 'IMO / Call Sign', 'IMO / Call Sign'),
      F('flag', 'Bendera', 'Flag'),
      F('port', 'Pelabuhan kedatangan', 'Port of arrival'),
      F('lastPort', 'Pelabuhan asal', 'Last port'),
      F('arrivalDate', 'Tanggal tiba', 'Date of arrival'),
      F('personsOnBoard', 'Jumlah orang di atas kapal', 'Persons on board'),
      F('sickCases', 'Kasus sakit', 'Sick cases'),
    ],
    introLabel: { id: 'Deklarasi', en: 'Declaration' },
    signCap: { id: 'Nakhoda / Master', en: 'Master' },
    sample: {
      docNumber: 'MDH/2026/06/0001',
      date: '24 Jun 2026',
      fields: {
        vesselName: 'MT Soechi Asia', imo: '9456231 · YDXX', flag: 'Indonesia', port: 'Samarinda',
        lastPort: 'Balikpapan', arrivalDate: '24 Jun 2026', personsOnBoard: '18', sickCases: 'Nihil / Nil',
      },
      intro:
        'Dengan ini dinyatakan bahwa tidak terdapat kasus penyakit menular atau kondisi kesehatan yang wajib dilaporkan di atas kapal selama pelayaran, dan seluruh awak dalam keadaan sehat. Kapal memenuhi persyaratan kesehatan pelabuhan.',
      signName: 'Capt. Budi Santoso',
      signRole: 'Master',
    },
  },

  NOTICE_OF_ARRIVAL: {
    docType: 'NOTICE_OF_ARRIVAL',
    category: 'clearance',
    prefix: 'NOA',
    title: { id: 'PEMBERITAHUAN KEDATANGAN KAPAL', en: 'NOTICE OF ARRIVAL' },
    subtitle: { id: 'Pemberitahuan Pra-Kedatangan', en: 'Pre-Arrival Notification' },
    label: { id: 'Notice of Arrival', en: 'Notice of Arrival' },
    desc: { id: 'Pemberitahuan kedatangan kapal ke otoritas.', en: 'Pre-arrival notice to authorities.' },
    fields: [
      F('vesselName', 'Nama kapal', 'Vessel name'),
      F('imo', 'IMO / Flag', 'IMO / Flag'),
      F('port', 'Pelabuhan', 'Port'),
      F('eta', 'ETA', 'ETA'),
      F('lastPort', 'Pelabuhan asal', 'Last port'),
      F('nextPort', 'Pelabuhan tujuan', 'Next port'),
      F('cargo', 'Muatan', 'Cargo'),
      F('purpose', 'Tujuan singgah', 'Purpose of call'),
    ],
    introLabel: { id: 'Pemberitahuan', en: 'Notice' },
    signCap: { id: 'Hormat kami / Port Agent', en: 'Port Agent' },
    sample: {
      docNumber: 'NOA/2026/06/0001',
      date: '24 Jun 2026',
      fields: {
        vesselName: 'MT Soechi Asia', imo: '9456231 · Indonesia', port: 'Samarinda', eta: '24 Jun 2026 06:00',
        lastPort: 'Balikpapan', nextPort: 'Balikpapan', cargo: 'CPO — 6,500 MT', purpose: 'Muat / Loading',
      },
      intro:
        'Dengan hormat diberitahukan bahwa kapal tersebut di atas dijadwalkan tiba di pelabuhan sebagaimana rincian di bawah. Mohon kesiapan formalitas kedatangan dan pelayanan pelabuhan terkait.',
      signName: 'Marlon Saragih',
      signRole: 'Port Agent',
    },
  },

  CASH_TO_MASTER: {
    docType: 'CASH_TO_MASTER',
    category: 'crew',
    prefix: 'CTM',
    title: { id: 'TANDA TERIMA CASH TO MASTER', en: 'CASH TO MASTER RECEIPT' },
    subtitle: { id: 'Cash to Master', en: 'Cash Advance to Master' },
    label: { id: 'Cash to Master', en: 'Cash to Master' },
    desc: { id: 'Tanda terima uang tunai ke nakhoda.', en: 'Receipt of cash advance to master.' },
    fields: [
      F('vesselName', 'Nama kapal', 'Vessel name'),
      F('imo', 'IMO / Flag', 'IMO / Flag'),
      F('port', 'Pelabuhan', 'Port'),
      F('master', 'Nakhoda', 'Master'),
      F('currency', 'Mata uang', 'Currency'),
      F('amountFigure', 'Jumlah (angka)', 'Amount (figures)'),
      F('amountWords', 'Jumlah (terbilang)', 'Amount (in words)', { full: true }),
      F('purpose', 'Keperluan', 'Purpose'),
    ],
    introLabel: { id: 'Pernyataan', en: 'Statement' },
    signCap: { id: 'Diterima oleh / Master', en: 'Received by / Master' },
    sample: {
      docNumber: 'CTM/2026/06/0001',
      date: '24 Jun 2026',
      fields: {
        vesselName: 'MT Soechi Asia', imo: '9456231 · Indonesia', port: 'Samarinda', master: 'Capt. Budi Santoso',
        currency: 'USD', amountFigure: '5,000.00', amountWords: 'Five thousand US Dollars only', purpose: 'Cash to Master — ship operational expenses',
      },
      intro:
        'Telah diterima dengan baik sejumlah uang tunai tersebut di bawah ini sebagai Cash to Master untuk keperluan operasional kapal. Nakhoda mengakui penerimaan penuh atas jumlah dimaksud.',
      signName: 'Capt. Budi Santoso',
      signRole: 'Master',
    },
  },

  LETTER_OF_AUTHORIZATION: {
    docType: 'LETTER_OF_AUTHORIZATION',
    category: 'clearance',
    prefix: 'LOA',
    title: { id: 'SURAT KUASA / OTORISASI', en: 'LETTER OF AUTHORIZATION' },
    subtitle: { id: 'Otorisasi Sub-Agen / Wakil', en: 'Authorization to Sub-Agent / Representative' },
    label: { id: 'Letter of Authorization', en: 'Letter of Authorization' },
    desc: { id: 'Surat kuasa menunjuk sub-agen/wakil.', en: 'Authorization to a sub-agent/representative.' },
    fields: [
      F('toName', 'Kepada (penerima kuasa)', 'To (authorized party)', { full: true }),
      F('vesselName', 'Nama kapal', 'Vessel name'),
      F('imo', 'IMO / Flag', 'IMO / Flag'),
      F('port', 'Pelabuhan', 'Port'),
      F('scope', 'Lingkup kuasa', 'Scope of authority'),
      F('validUntil', 'Berlaku sampai', 'Valid until'),
    ],
    introLabel: { id: 'Isi Surat Kuasa', en: 'Authorization' },
    signCap: { id: 'Yang memberi kuasa / Port Agent', en: 'Authorized by / Port Agent' },
    sample: {
      docNumber: 'LOA/2026/06/0001',
      date: '24 Jun 2026',
      fields: {
        toName: 'PT Mitra Bahari — Balikpapan', vesselName: 'MT Soechi Asia', imo: '9456231 · Indonesia',
        port: 'Balikpapan', scope: 'Pengurusan clearance & pelayanan pelabuhan', validUntil: '30 Jun 2026',
      },
      intro:
        'Dengan ini kami memberikan kuasa kepada pihak tersebut di atas untuk bertindak atas nama kami sebagai sub-agen dalam pengurusan formalitas dan pelayanan kapal dimaksud di pelabuhan, sesuai lingkup dan masa berlaku yang ditetapkan.',
      signName: 'Marlon Saragih',
      signRole: 'Port Agent',
    },
  },
}

export const getSimpleSchema = (type: string): SimpleSchema | undefined => SIMPLE_SCHEMAS[type]

/** Gabung body tersimpan + sample agar field yang kosong tetap ada strukturnya. */
export function mergeSimple(schema: SimpleSchema, body: Partial<SimpleData>): SimpleData {
  const s = schema.sample
  return {
    docNumber: body.docNumber ?? s.docNumber,
    date: body.date ?? s.date,
    fields: { ...s.fields, ...(body.fields ?? {}) },
    intro: body.intro ?? s.intro,
    clauses: Array.isArray(body.clauses) ? body.clauses : s.clauses,
    rows: Array.isArray(body.rows) ? body.rows : s.rows,
    remarks: body.remarks ?? s.remarks,
    signName: body.signName ?? s.signName,
    signRole: body.signRole ?? s.signRole,
  }
}
