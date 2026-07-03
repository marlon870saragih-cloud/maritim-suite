import { ClipboardList, Ship, Receipt, Users, type LucideIcon } from 'lucide-react'

/**
 * Sumber tunggal kategori dokumen Maritime Dokumen + daftar dokumen di tiap
 * kategori (hanya generator yang BENAR-BENAR ada di /dokumen/new/[type]).
 * Dipakai bersama oleh CategoryGrid (front door) & halaman kategori, supaya
 * badge jumlah = jumlah dokumen yang sebenarnya bisa dibuka.
 */
export type Bi = { id: string; en: string }

export type CatDoc = {
  type: string // segmen rute /dokumen/new/[type]
  label: Bi
  desc: Bi
}

export type DocCategory = {
  id: string
  title: string
  blurb: Bi
  icon: LucideIcon
  docs: CatDoc[]
  // token warna literal (bukan template) agar Tailwind JIT meng-generate-nya
  bar: string
  iconText: string
  badge: string
  hoverBorder: string
}

const D = (type: string, idL: string, enL: string, idD: string, enD: string): CatDoc => ({
  type,
  label: { id: idL, en: enL },
  desc: { id: idD, en: enD },
})

export const DOC_CATEGORIES: DocCategory[] = [
  {
    id: 'fal',
    title: 'FAL Forms',
    blurb: { id: 'Tujuh formulir baku IMO FAL untuk clearance.', en: 'The seven standard IMO FAL clearance forms.' },
    icon: ClipboardList,
    bar: 'bg-accent-blue',
    iconText: 'text-accent-blue',
    badge: 'bg-accent-blue/10 text-accent-blue',
    hoverBorder: 'hover:border-accent-blue/50',
    docs: [
      D('FAL_1', 'General Declaration', 'General Declaration', 'Deklarasi umum kapal (IMO FAL 1).', 'General vessel declaration (IMO FAL 1).'),
      D('FAL_2', 'Cargo Declaration', 'Cargo Declaration', 'Rincian muatan kapal (IMO FAL 2).', 'Cargo manifest (IMO FAL 2).'),
      D('FAL_3', "Ship's Stores", "Ship's Stores", 'Daftar perbekalan kapal (IMO FAL 3).', "Ship's stores list (IMO FAL 3)."),
      D('FAL_4', "Crew's Effects", "Crew's Effects", 'Deklarasi barang bawaan awak (IMO FAL 4).', "Crew's effects declaration (IMO FAL 4)."),
      D('FAL_5', 'Crew List', 'Crew List', 'Daftar awak kapal (IMO FAL 5).', 'Crew list (IMO FAL 5).'),
      D('FAL_6', 'Passenger List', 'Passenger List', 'Daftar penumpang (IMO FAL 6).', 'Passenger list (IMO FAL 6).'),
      D('FAL_7', 'Dangerous Goods', 'Dangerous Goods', 'Manifes barang berbahaya (IMO FAL 7).', 'Dangerous goods manifest (IMO FAL 7).'),
    ],
  },
  {
    id: 'portcall',
    title: 'Port Call Ops',
    blurb: { id: 'Dokumen operasi selama sandar di pelabuhan.', en: 'Operational documents during the port call.' },
    icon: Ship,
    bar: 'bg-accent-teal',
    iconText: 'text-accent-teal',
    badge: 'bg-accent-teal/10 text-accent-teal',
    hoverBorder: 'hover:border-accent-teal/50',
    docs: [
      D('BILL_OF_LADING', 'Bill of Lading', 'Bill of Lading', 'BL kargo curah (CONGENBILL 2022) — original & copy.', 'Bulk cargo BL (CONGENBILL 2022) — original & copy.'),
      D('NOR', 'Notice of Readiness', 'Notice of Readiness', 'Pernyataan kesiapan kapal muat/bongkar.', 'Vessel readiness to load/discharge.'),
      D('SOF', 'Statement of Facts', 'Statement of Facts', 'Kronologi kejadian selama port call.', 'Chronology of port-call events.'),
      D('TIME_SHEET', 'Time Sheet', 'Time Sheet', 'Rekap waktu operasi & laytime.', 'Operation time & laytime recap.'),
      D('ULLAGE_REPORT', 'Ullage Report', 'Ullage Report', 'Pengukuran ullage muatan cair.', 'Liquid cargo ullage survey.'),
      D('ARRIVAL_REPORT', 'Arrival Report', 'Arrival Report', 'Laporan kedatangan kapal.', 'Vessel arrival report.'),
      D('DEPARTURE_REPORT', 'Departure Report', 'Departure Report', 'Laporan keberangkatan kapal.', 'Vessel departure report.'),
      D('PORT_CALL_SUMMARY', 'Port Call Summary', 'Port Call Summary', 'Ringkasan satu port call.', 'Summary of one port call.'),
      D('BUNKER_REQUISITION', 'Bunker Requisition', 'Bunker Requisition', 'Permintaan pengisian bahan bakar.', 'Bunker fuel requisition.'),
      D('DAMAGE_REPORT', 'Damage Report', 'Damage Report', 'Laporan kerusakan kapal/muatan/fasilitas.', 'Damage to vessel/cargo/facility.'),
    ],
  },
  {
    id: 'clearance',
    title: 'Clearance & SIB',
    blurb: { id: 'Izin berlayar, penunjukan, jaminan & protes.', en: 'Sailing clearance, appointment, indemnity & protests.' },
    icon: Receipt,
    bar: 'bg-accent-amber',
    iconText: 'text-accent-amber',
    badge: 'bg-accent-amber/10 text-accent-amber',
    hoverBorder: 'hover:border-accent-amber/50',
    docs: [
      D('AGENCY_APPOINTMENT', 'Agency Appointment', 'Agency Appointment', 'Surat penunjukan keagenan.', 'Agency appointment letter.'),
      D('SIB', 'Surat Izin Berlayar', 'Port Clearance (SIB)', 'Persetujuan berlayar & kelengkapan clearance.', 'Sailing approval & clearance readiness.'),
      D('NOTICE_OF_ARRIVAL', 'Notice of Arrival', 'Notice of Arrival', 'Pemberitahuan kedatangan kapal ke otoritas.', 'Pre-arrival notice to authorities.'),
      D('MARITIME_DECLARATION_OF_HEALTH', 'Deklarasi Kesehatan', 'Declaration of Health', 'Deklarasi kesehatan maritim kapal.', 'Maritime declaration of health.'),
      D('LETTER_OF_AUTHORIZATION', 'Surat Kuasa (LOA)', 'Letter of Authorization', 'Surat kuasa menunjuk sub-agen/wakil.', 'Authorization to a sub-agent/representative.'),
      D('LETTER_OF_INDEMNITY', 'Letter of Indemnity', 'Letter of Indemnity', 'Surat jaminan ganti rugi (LOI).', 'Letter of indemnity (LOI).'),
      D('LETTER_OF_PROTEST', 'Letter of Protest', 'Letter of Protest', 'Surat protes resmi.', 'Formal letter of protest.'),
      D('NOTE_OF_PROTEST', 'Note of Protest', 'Note of Protest', 'Nota protes nakhoda.', "Master's note of protest."),
    ],
  },
  {
    id: 'crew',
    title: 'Crew & Husbandry',
    blurb: { id: 'Urusan awak: daftar, pergantian, sign on/off, shore pass.', en: 'Crew matters: list, change, sign on/off, shore pass.' },
    icon: Users,
    bar: 'bg-accent-purple',
    iconText: 'text-accent-purple',
    badge: 'bg-accent-purple/10 text-accent-purple',
    hoverBorder: 'hover:border-accent-purple/50',
    docs: [
      D('FAL_5', 'Crew List', 'Crew List', 'Daftar awak kapal (IMO FAL 5).', 'Crew list (IMO FAL 5).'),
      D('CREW_CHANGE_NOTICE', 'Crew Change Notice', 'Crew Change Notice', 'Pemberitahuan pergantian awak.', 'Crew change notice.'),
      D('CREW_SIGN_ON', 'Crew Sign-On', 'Crew Sign-On', 'Pemberitahuan awak naik kapal.', 'Crew embarkation notice.'),
      D('CREW_SIGN_OFF', 'Crew Sign-Off', 'Crew Sign-Off', 'Pemberitahuan awak turun kapal.', 'Crew disembarkation notice.'),
      D('SHORE_PASS', 'Shore Pass', 'Shore Pass', 'Izin awak turun ke darat.', 'Crew shore leave permit.'),
      D('CASH_TO_MASTER', 'Cash to Master', 'Cash to Master', 'Tanda terima uang tunai ke nakhoda.', 'Receipt of cash advance to master.'),
    ],
  },
]

export const getDocCategory = (id: string) => DOC_CATEGORIES.find((c) => c.id === id)
