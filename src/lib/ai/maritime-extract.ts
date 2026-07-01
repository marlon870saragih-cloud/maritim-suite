// Ekstraktor dokumen maritim (operasional) — semua TEKS (tanpa uang). Pakai factory
// generik: tiap dokumen cukup mendaftar field partikular. Field yang tak disebut user
// dikosongkan (tak jatuh ke nilai contoh). Field boilerplate (remarks, intro, scope,
// undertaking, masterName, penanda tangan) TIDAK didaftar → tetap pakai default form.

import type { ToolDef } from './openrouter'
import { runToolExtraction, pickStrings, blankMissing } from './extract-util'

type FieldDef = { key: string; desc: string }

const NO_INVENT =
  'Jangan mengarang data yang tidak disebut pengguna (IMO, tanggal, nomor, dll) — kosongkan bila tak disebut. ' +
  'Gunakan Bahasa Indonesia/Inggris formal sesuai konteks dokumen.'

/** Bangun ekstraktor untuk satu dokumen maritim dari daftar field. */
export function makeMaritimeExtractor(opts: {
  toolName: string
  docDesc: string
  fields: FieldDef[]
  listKey?: string // field daftar yang dipaksa skeleton kosong (hindari fallback contoh)
  listSkeleton?: Record<string, unknown>[]
  // Nilai tetap yang ditimpa ke hasil (mis. angka/objek uang/teknis → 0 agar tak pakai
  // nilai contoh; operator isi di form).
  overrides?: Record<string, unknown>
}): (instruction: string) => Promise<Record<string, unknown>> {
  const properties: Record<string, object> = {}
  for (const f of opts.fields) properties[f.key] = { type: 'string', description: f.desc }
  const tool: ToolDef = {
    type: 'function',
    function: { name: opts.toolName, description: `Mengisi field ${opts.docDesc} (teks).`, parameters: { type: 'object', properties, required: [] } },
  }
  const keys = opts.fields.map((f) => f.key)

  return async (instruction: string) => {
    const raw = (await runToolExtraction({
      system: `Anda asisten yang mengisi ${opts.docDesc} keagenan kapal. Tugas Anda HANYA mengisi field via tool. ${NO_INVENT}`,
      tool,
      instruction,
    })) as Record<string, unknown>
    const out = pickStrings<Record<string, unknown>>(raw, keys)
    blankMissing(out, keys)
    if (opts.listKey) out[opts.listKey] = (opts.listSkeleton ?? [{}]).map((s) => ({ ...s }))
    if (opts.overrides) Object.assign(out, opts.overrides)
    return out
  }
}

// ---- NOR (Notice of Readiness) ----
export const extractNor = makeMaritimeExtractor({
  toolName: 'isi_nor',
  docDesc: 'Notice of Readiness (NOR)',
  fields: [
    { key: 'docNumber', desc: 'No. NOR bila disebut' },
    { key: 'vesselName', desc: 'Nama kapal' },
    { key: 'imo', desc: 'No. IMO bila disebut' },
    { key: 'flag', desc: 'Bendera' },
    { key: 'port', desc: 'Pelabuhan' },
    { key: 'berth', desc: 'Tempat sandar/labuh' },
    { key: 'operation', desc: 'Operasi: Loading atau Discharging' },
    { key: 'cargo', desc: 'Muatan' },
    { key: 'toName', desc: 'Ditujukan kepada (charterer/receiver/shipper/agent)' },
    { key: 'toAttn', desc: 'U.p.' },
    { key: 'arrivedDate', desc: 'Tanggal tiba' },
    { key: 'arrivedTime', desc: 'Jam tiba' },
    { key: 'noticeDate', desc: 'Tanggal NOR di-tender' },
    { key: 'noticeTime', desc: 'Jam NOR di-tender' },
  ],
})

// ---- Arrival & Departure Report (struktur sama; events skeleton kosong) ----
export const extractReport = makeMaritimeExtractor({
  toolName: 'isi_report',
  docDesc: 'laporan pergerakan kapal (Arrival/Departure Report)',
  fields: [
    { key: 'docNumber', desc: 'No. dokumen bila disebut' },
    { key: 'vesselName', desc: 'Nama kapal' },
    { key: 'imo', desc: 'IMO bila disebut' },
    { key: 'flag', desc: 'Bendera' },
    { key: 'port', desc: 'Pelabuhan' },
    { key: 'berth', desc: 'Tempat sandar' },
    { key: 'otherPort', desc: 'Pelabuhan asal (arrival) / tujuan (departure)' },
    { key: 'voyageNo', desc: 'No. voyage' },
    { key: 'toName', desc: 'Ditujukan kepada (principal/owner)' },
    { key: 'toAttn', desc: 'U.p.' },
    { key: 'cargo', desc: 'Muatan' },
    { key: 'cargoQty', desc: 'Jumlah muatan' },
  ],
  listKey: 'events',
  listSkeleton: [{ date: '', time: '', desc: '' }],
})

// ---- Agency Appointment ----
export const extractAppointment = makeMaritimeExtractor({
  toolName: 'isi_appointment',
  docDesc: 'Agency Appointment (surat penunjukan agen oleh principal)',
  fields: [
    { key: 'docNumber', desc: 'No. dokumen bila disebut' },
    { key: 'date', desc: 'Tanggal' },
    { key: 'toName', desc: 'Principal yang menunjuk' },
    { key: 'toAddress', desc: 'Alamat principal' },
    { key: 'toAttn', desc: 'U.p.' },
    { key: 'vesselName', desc: 'Nama kapal' },
    { key: 'imo', desc: 'IMO bila disebut' },
    { key: 'flag', desc: 'Bendera' },
    { key: 'port', desc: 'Pelabuhan' },
    { key: 'eta', desc: 'ETA' },
    { key: 'voyage', desc: 'No. voyage' },
  ],
})

// ---- Letter of Protest (AI boleh menyusun subject/statement dari uraian user) ----
export const extractProtest = makeMaritimeExtractor({
  toolName: 'isi_protest',
  docDesc: 'Letter of Protest',
  fields: [
    { key: 'docNumber', desc: 'No. dokumen bila disebut' },
    { key: 'vesselName', desc: 'Nama kapal' },
    { key: 'imo', desc: 'IMO bila disebut' },
    { key: 'flag', desc: 'Bendera' },
    { key: 'port', desc: 'Pelabuhan' },
    { key: 'place', desc: 'Tempat penerbitan' },
    { key: 'date', desc: 'Tanggal' },
    { key: 'toName', desc: 'Pihak yang diprotes' },
    { key: 'toAttn', desc: 'U.p.' },
    { key: 'subject', desc: 'Perihal protes (ringkas)' },
    { key: 'statement', desc: 'Pernyataan protes — susun dari uraian pengguna bila ada; jangan mengarang fakta' },
    { key: 'holdResponsible', desc: 'Pihak yang dimintai tanggung jawab' },
  ],
})

// ---- Letter of Indemnity (undertaking legal = boilerplate, tetap default) ----
export const extractLoi = makeMaritimeExtractor({
  toolName: 'isi_loi',
  docDesc: 'Letter of Indemnity (LOI)',
  fields: [
    { key: 'docNumber', desc: 'No. dokumen bila disebut' },
    { key: 'date', desc: 'Tanggal' },
    { key: 'place', desc: 'Tempat' },
    { key: 'fromName', desc: 'Pemberi jaminan (charterer/shipper/principal)' },
    { key: 'toName', desc: 'Penerima jaminan (Owners/Master)' },
    { key: 'toAttn', desc: 'U.p.' },
    { key: 'subject', desc: 'Perihal' },
    { key: 'vesselName', desc: 'Nama kapal' },
    { key: 'imo', desc: 'IMO bila disebut' },
    { key: 'flag', desc: 'Bendera' },
    { key: 'voyageNo', desc: 'No. voyage' },
    { key: 'port', desc: 'Pelabuhan' },
    { key: 'cargo', desc: 'Muatan' },
    { key: 'cargoQty', desc: 'Jumlah muatan' },
    { key: 'blNumber', desc: 'No. Bill of Lading bila disebut' },
  ],
})

// ---- SOF (Statement of Facts) ----
export const extractSof = makeMaritimeExtractor({
  toolName: 'isi_sof',
  docDesc: 'Statement of Facts (SOF)',
  fields: [
    { key: 'docNumber', desc: 'No. SOF bila disebut' },
    { key: 'vesselName', desc: 'Nama kapal' },
    { key: 'imo', desc: 'IMO bila disebut' },
    { key: 'flag', desc: 'Bendera' },
    { key: 'port', desc: 'Pelabuhan' },
    { key: 'berth', desc: 'Tempat sandar' },
    { key: 'operation', desc: 'Operasi: Loading/Discharging' },
    { key: 'cargo', desc: 'Muatan' },
    { key: 'cargoQty', desc: 'Jumlah muatan' },
    { key: 'master', desc: 'Nakhoda' },
  ],
  listKey: 'events',
  listSkeleton: [{ date: '', time: '', desc: '' }],
})

// ---- Crew List (FAL 5) ----
export const extractCrewList = makeMaritimeExtractor({
  toolName: 'isi_crewlist',
  docDesc: 'Crew List (FAL 5)',
  fields: [
    { key: 'docNumber', desc: 'No. dokumen bila disebut' },
    { key: 'vesselName', desc: 'Nama kapal' },
    { key: 'imo', desc: 'IMO bila disebut' },
    { key: 'flag', desc: 'Bendera' },
    { key: 'callSign', desc: 'Call sign bila disebut' },
    { key: 'port', desc: 'Pelabuhan' },
    { key: 'voyage', desc: 'No. voyage' },
    { key: 'mode', desc: 'Arrival atau Departure' },
    { key: 'masterName', desc: 'Nama nakhoda' },
  ],
  listKey: 'crew',
  listSkeleton: [{ name: '', rank: '', nationality: '', passport: '', dob: '', seamanBook: '' }],
})

// ---- General Declaration (FAL 1) — attachments standar tetap default ----
export const extractGenDec = makeMaritimeExtractor({
  toolName: 'isi_gendec',
  docDesc: 'General Declaration (FAL 1)',
  fields: [
    { key: 'docNumber', desc: 'No. dokumen bila disebut' },
    { key: 'vesselName', desc: 'Nama kapal' },
    { key: 'imo', desc: 'IMO bila disebut' },
    { key: 'callSign', desc: 'Call sign bila disebut' },
    { key: 'flag', desc: 'Bendera' },
    { key: 'vesselType', desc: 'Jenis kapal' },
    { key: 'grt', desc: 'GRT bila disebut' },
    { key: 'mode', desc: 'Arrival atau Departure' },
    { key: 'port', desc: 'Pelabuhan' },
    { key: 'dateTime', desc: 'Tanggal & jam tiba/berangkat' },
    { key: 'berth', desc: 'Tempat sandar' },
    { key: 'lastPort', desc: 'Pelabuhan terakhir' },
    { key: 'nextPort', desc: 'Pelabuhan berikut' },
    { key: 'voyage', desc: 'No. voyage' },
    { key: 'cargoBrief', desc: 'Ringkasan muatan' },
    { key: 'crewCount', desc: 'Jumlah awak bila disebut' },
    { key: 'passengerCount', desc: 'Jumlah penumpang bila disebut' },
    { key: 'master', desc: 'Nakhoda' },
  ],
})

// ---- Ship's Stores (FAL 3) ----
export const extractShipStores = makeMaritimeExtractor({
  toolName: 'isi_shipstores',
  docDesc: "Ship's Stores Declaration (FAL 3)",
  fields: [
    { key: 'docNumber', desc: 'No. dokumen bila disebut' },
    { key: 'vesselName', desc: 'Nama kapal' },
    { key: 'imo', desc: 'IMO bila disebut' },
    { key: 'flag', desc: 'Bendera' },
    { key: 'port', desc: 'Pelabuhan' },
    { key: 'mode', desc: 'Arrival atau Departure' },
    { key: 'master', desc: 'Nakhoda' },
  ],
  listKey: 'stores',
  listSkeleton: [{ item: '', quantity: '', unit: '', location: '' }],
})

// ---- Cargo Declaration (FAL 2) ----
export const extractCargoDecl = makeMaritimeExtractor({
  toolName: 'isi_cargo',
  docDesc: 'Cargo Declaration (FAL 2)',
  fields: [
    { key: 'docNumber', desc: 'No. dokumen bila disebut' },
    { key: 'vesselName', desc: 'Nama kapal' },
    { key: 'imo', desc: 'IMO bila disebut' },
    { key: 'flag', desc: 'Bendera' },
    { key: 'port', desc: 'Pelabuhan' },
    { key: 'mode', desc: 'Loading atau Discharging' },
    { key: 'voyage', desc: 'No. voyage' },
    { key: 'master', desc: 'Nakhoda' },
    { key: 'portOfLoading', desc: 'Pelabuhan muat' },
    { key: 'portOfDischarge', desc: 'Pelabuhan bongkar' },
  ],
  listKey: 'items',
  listSkeleton: [{ blNo: '', marks: '', packages: '', description: '', weight: '' }],
})

// ---- Note of Protest (statement/reservation legal = boilerplate, tetap default) ----
export const extractNoteProtest = makeMaritimeExtractor({
  toolName: 'isi_noteprotest',
  docDesc: 'Note of Protest (Sea Protest)',
  fields: [
    { key: 'docNumber', desc: 'No. dokumen bila disebut' },
    { key: 'date', desc: 'Tanggal' },
    { key: 'place', desc: 'Tempat dicatat' },
    { key: 'masterName', desc: 'Nama nakhoda' },
    { key: 'vesselName', desc: 'Nama kapal' },
    { key: 'imo', desc: 'IMO bila disebut' },
    { key: 'flag', desc: 'Bendera' },
    { key: 'grt', desc: 'GRT bila disebut' },
    { key: 'voyageNo', desc: 'No. voyage' },
    { key: 'fromPort', desc: 'Pelabuhan asal' },
    { key: 'toPort', desc: 'Pelabuhan tiba' },
    { key: 'cargo', desc: 'Muatan' },
    { key: 'departureDate', desc: 'Tanggal berangkat' },
    { key: 'arrivalDate', desc: 'Tanggal tiba' },
  ],
})

// ---- Crew Change Notice ----
export const extractCrewChange = makeMaritimeExtractor({
  toolName: 'isi_crewchange',
  docDesc: 'Crew Change Notice',
  fields: [
    { key: 'docNumber', desc: 'No. dokumen bila disebut' },
    { key: 'vesselName', desc: 'Nama kapal' },
    { key: 'imo', desc: 'IMO bila disebut' },
    { key: 'flag', desc: 'Bendera' },
    { key: 'port', desc: 'Pelabuhan' },
    { key: 'date', desc: 'Tanggal' },
    { key: 'toName', desc: 'Ditujukan kepada (Imigrasi/Syahbandar/Principal)' },
    { key: 'toAttn', desc: 'U.p.' },
  ],
  listKey: 'crew',
  listSkeleton: [{ name: '', rank: '', nationality: '', passport: '', action: '', remark: '' }],
})

// ---- Port Call Summary (finance agregat → 0; documents skeleton) ----
export const extractPcSummary = makeMaritimeExtractor({
  toolName: 'isi_pcsummary',
  docDesc: 'Port Call Summary',
  fields: [
    { key: 'docNumber', desc: 'No. dokumen bila disebut' },
    { key: 'date', desc: 'Tanggal' },
    { key: 'vesselName', desc: 'Nama kapal' },
    { key: 'imo', desc: 'IMO bila disebut' },
    { key: 'flag', desc: 'Bendera' },
    { key: 'port', desc: 'Pelabuhan' },
    { key: 'portCode', desc: 'Kode pelabuhan' },
    { key: 'eta', desc: 'ETA' },
    { key: 'etd', desc: 'ETD' },
    { key: 'gt', desc: 'GT bila disebut' },
    { key: 'nrt', desc: 'NRT bila disebut' },
    { key: 'loa', desc: 'LOA bila disebut' },
    { key: 'draft', desc: 'Draft bila disebut' },
    { key: 'cargo', desc: 'Muatan' },
    { key: 'principal', desc: 'Principal' },
  ],
  listKey: 'documents',
  listSkeleton: [{ label: '', docNumber: '', status: '' }],
  overrides: { finance: { epda: 0, fpda: 0, invoice: 0 } },
})

// ---- Time Sheet / Laytime (angka laytime & rate → 0; rows skeleton) ----
export const extractTimeSheet = makeMaritimeExtractor({
  toolName: 'isi_timesheet',
  docDesc: 'Time Sheet / Laytime Statement',
  fields: [
    { key: 'docNumber', desc: 'No. dokumen bila disebut' },
    { key: 'date', desc: 'Tanggal' },
    { key: 'vesselName', desc: 'Nama kapal' },
    { key: 'imo', desc: 'IMO bila disebut' },
    { key: 'flag', desc: 'Bendera' },
    { key: 'port', desc: 'Pelabuhan' },
    { key: 'voyageNo', desc: 'No. voyage' },
    { key: 'operation', desc: 'Loading atau Discharging' },
    { key: 'cargo', desc: 'Muatan' },
    { key: 'cargoQty', desc: 'Jumlah muatan' },
    { key: 'charterer', desc: 'Charterer (ditujukan kepada)' },
    { key: 'norTendered', desc: 'NOR di-tender (tgl & jam)' },
    { key: 'laytimeCommenced', desc: 'Laytime mulai (tgl & jam)' },
  ],
  listKey: 'rows',
  listSkeleton: [{ date: '', fromTime: '', toTime: '', description: '', percent: 0 }],
  overrides: { laytimeAllowedHours: 0, demurrageRate: 0, despatchRate: 0 },
})

// ---- Bunker Requisition (harga/qty bunker → 0; lines skeleton) ----
export const extractBunkerReq = makeMaritimeExtractor({
  toolName: 'isi_bunkerreq',
  docDesc: 'Bunker Requisition',
  fields: [
    { key: 'docNumber', desc: 'No. dokumen bila disebut' },
    { key: 'date', desc: 'Tanggal' },
    { key: 'vesselName', desc: 'Nama kapal' },
    { key: 'imo', desc: 'IMO bila disebut' },
    { key: 'flag', desc: 'Bendera' },
    { key: 'port', desc: 'Pelabuhan' },
    { key: 'supplierName', desc: 'Pemasok bunker' },
    { key: 'supplierAttn', desc: 'U.p.' },
    { key: 'deliveryDate', desc: 'Tanggal/ETA bunkering' },
    { key: 'deliveryMode', desc: 'Cara antar: Barge/Pipeline/Truck' },
    { key: 'deliveryPoint', desc: 'Titik serah (alongside/anchorage/berth)' },
  ],
  listKey: 'lines',
  listSkeleton: [{ grade: '', quantityMt: 0, sulphurPct: '', unitPrice: 0 }],
})

// ---- Damage / Survey Report (estimate per item → 0; items skeleton) ----
export const extractDamage = makeMaritimeExtractor({
  toolName: 'isi_damage',
  docDesc: 'Damage / Survey Report',
  fields: [
    { key: 'docNumber', desc: 'No. dokumen bila disebut' },
    { key: 'date', desc: 'Tanggal' },
    { key: 'place', desc: 'Tempat' },
    { key: 'vesselName', desc: 'Nama kapal' },
    { key: 'imo', desc: 'IMO bila disebut' },
    { key: 'flag', desc: 'Bendera' },
    { key: 'port', desc: 'Pelabuhan' },
    { key: 'voyageNo', desc: 'No. voyage' },
    { key: 'occasion', desc: 'Saat survei (mis. on arrival)' },
    { key: 'surveyor', desc: 'Surveyor' },
    { key: 'attendedBy', desc: 'Pihak yang hadir' },
  ],
  listKey: 'items',
  listSkeleton: [{ location: '', description: '', cause: '', severity: '', estimate: 0 }],
})

// ---- Ullage Report (densitas → 0; tanks skeleton) ----
export const extractUllage = makeMaritimeExtractor({
  toolName: 'isi_ullage',
  docDesc: 'Ullage Report',
  fields: [
    { key: 'docNumber', desc: 'No. dokumen bila disebut' },
    { key: 'date', desc: 'Tanggal' },
    { key: 'vesselName', desc: 'Nama kapal' },
    { key: 'imo', desc: 'IMO bila disebut' },
    { key: 'flag', desc: 'Bendera' },
    { key: 'port', desc: 'Pelabuhan' },
    { key: 'voyageNo', desc: 'No. voyage' },
    { key: 'product', desc: 'Jenis kargo cair' },
    { key: 'condition', desc: 'Kondisi (before/after loading, on arrival)' },
  ],
  listKey: 'tanks',
  listSkeleton: [{ tank: '', ullage: '', tempC: '', volumeM3: 0 }],
  overrides: { densityKgL: 0 },
})
