// Ekstraktor dokumen maritim (operasional). Pakai factory generik: tiap dokumen
// mendaftar field partikular + (opsional) kolom daftar. Field yang tak disebut user
// dikosongkan (tak jatuh ke nilai contoh). Field boilerplate (remarks, intro, scope,
// undertaking, masterName, penanda tangan) TIDAK didaftar → tetap pakai default form.
//
// KEBIJAKAN ANGKA (lihat prinsip "angka dihitung mesin"):
// - Angka FAKTUAL (transkripsi apa yang disebut user: jumlah, ullage, suhu, tanggal,
//   GT/IMO) BOLEH diisi AI — sifatnya seperti kata, tanpa perhitungan.
// - Angka UANG / HASIL HITUNG (harga, estimasi biaya, % laytime, densitas, rate) TIDAK
//   PERNAH diisi AI → kolom bertanda `guard` dipaksa 0 (operator isi / mesin hitung).

import type { ToolDef } from './openrouter'
import { runToolExtraction, pickStrings, blankMissing } from './extract-util'

type FieldDef = { key: string; desc: string }
// Kolom baris daftar. number=true → nilai numerik; guard=true → angka uang/hasil-hitung
// yang TIDAK ditanyakan ke AI & dipaksa 0 (operator/mesin). Tanpa guard = faktual (AI isi).
type ListCol = { key: string; desc: string; number?: boolean; guard?: boolean }

const NO_INVENT =
  'Jangan mengarang data yang tidak disebut pengguna (IMO, tanggal, nomor, dll) — kosongkan bila tak disebut. ' +
  'Untuk baris daftar: isi HANYA baris yang benar-benar disebut pengguna; jangan menambah baris karangan. ' +
  'JANGAN pernah menulis angka uang/tarif/harga/estimasi biaya — itu diisi operator, mesin yang menghitung. ' +
  'Gunakan Bahasa Indonesia/Inggris formal sesuai konteks dokumen.'

/** Bangun ekstraktor untuk satu dokumen maritim dari daftar field (+ kolom daftar opsional). */
export function makeMaritimeExtractor(opts: {
  toolName: string
  docDesc: string
  fields: FieldDef[]
  listKey?: string // field daftar (mis. 'events', 'crew', 'tanks')
  listDesc?: string // deskripsi daftar untuk tool
  listColumns?: ListCol[] // kolom baris; kolom `guard` tak ditanyakan ke AI (dipaksa 0)
  // Nilai tetap yang ditimpa ke hasil (angka uang/teknis skalar → 0; operator isi di form).
  overrides?: Record<string, unknown>
}): (instruction: string) => Promise<Record<string, unknown>> {
  const properties: Record<string, object> = {}
  for (const f of opts.fields) properties[f.key] = { type: 'string', description: f.desc }

  const cols = opts.listColumns ?? []
  const aiCols = cols.filter((c) => !c.guard) // hanya kolom faktual yang ditanyakan ke AI
  if (opts.listKey && aiCols.length) {
    const itemProps: Record<string, object> = {}
    for (const c of aiCols) itemProps[c.key] = { type: c.number ? 'number' : 'string', description: c.desc }
    properties[opts.listKey] = {
      type: 'array',
      description:
        opts.listDesc ?? 'Baris daftar — isi HANYA dari yang disebut pengguna; jangan mengarang baris.',
      items: { type: 'object', properties: itemProps, required: [] },
    }
  }

  const tool: ToolDef = {
    type: 'function',
    function: {
      name: opts.toolName,
      description: `Mengisi field ${opts.docDesc} (teks & angka faktual, tanpa uang).`,
      parameters: { type: 'object', properties, required: [] },
    },
  }
  const keys = opts.fields.map((f) => f.key)

  // Baris kosong default (agar tak fallback ke baris contoh saat disimpan).
  const emptyRow = (): Record<string, unknown> => {
    const r: Record<string, unknown> = {}
    for (const c of cols) r[c.key] = c.number ? 0 : ''
    return r
  }

  return async (instruction: string) => {
    const raw = (await runToolExtraction({
      system: `Anda asisten yang mengisi ${opts.docDesc} keagenan kapal. Tugas Anda HANYA mengisi field via tool. ${NO_INVENT}`,
      tool,
      instruction,
    })) as Record<string, unknown>

    const out = pickStrings<Record<string, unknown>>(raw, keys)
    blankMissing(out, keys)

    if (opts.listKey) {
      const rawList = Array.isArray(raw[opts.listKey]) ? (raw[opts.listKey] as unknown[]) : []
      out[opts.listKey] = rawList.length
        ? rawList.map((it) => {
            const src = it && typeof it === 'object' ? (it as Record<string, unknown>) : {}
            const row: Record<string, unknown> = {}
            for (const c of cols) {
              if (c.guard) {
                row[c.key] = c.number ? 0 : '' // uang/hasil-hitung → operator/mesin
              } else if (c.number) {
                const v = src[c.key]
                row[c.key] =
                  typeof v === 'number'
                    ? v
                    : v != null && v !== '' && Number.isFinite(Number(v))
                      ? Number(v)
                      : 0
              } else {
                const v = src[c.key]
                row[c.key] = typeof v === 'string' ? v.trim() : v != null ? String(v) : ''
              }
            }
            return row
          })
        : [emptyRow()]
    }

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

// ---- Arrival & Departure Report (events = kronologi faktual, AI boleh susun) ----
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
  listDesc: 'Kronologi kegiatan (waktu → uraian) yang disebut pengguna. Jangan mengarang.',
  listColumns: [
    { key: 'date', desc: 'Tanggal kejadian' },
    { key: 'time', desc: 'Jam, mis. 08:30' },
    { key: 'desc', desc: 'Uraian kegiatan' },
  ],
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

// ---- SOF (Statement of Facts) — events = kronologi faktual ----
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
  listDesc: 'Kronologi kegiatan kapal (waktu → uraian) yang disebut pengguna. Jangan mengarang.',
  listColumns: [
    { key: 'date', desc: 'Tanggal kejadian' },
    { key: 'time', desc: 'Jam, mis. 08:30' },
    { key: 'desc', desc: 'Uraian kegiatan' },
  ],
})

// ---- Crew List (FAL 5) — semua kolom faktual ----
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
  listDesc: 'Daftar awak yang disebut pengguna (nama, jabatan, kebangsaan, dll).',
  listColumns: [
    { key: 'name', desc: 'Nama awak' },
    { key: 'rank', desc: 'Jabatan/rank' },
    { key: 'nationality', desc: 'Kebangsaan' },
    { key: 'passport', desc: 'No. paspor' },
    { key: 'dob', desc: 'Tanggal lahir' },
    { key: 'seamanBook', desc: 'No. buku pelaut' },
  ],
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

// ---- Ship's Stores (FAL 3) — quantity = faktual (bukan uang) ----
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
  listDesc: 'Daftar perbekalan yang disebut pengguna (nama, jumlah, satuan, lokasi).',
  listColumns: [
    { key: 'item', desc: 'Nama barang' },
    { key: 'quantity', desc: 'Jumlah (faktual, mis. 500)' },
    { key: 'unit', desc: 'Satuan (kg, ltr, ctn)' },
    { key: 'location', desc: 'Lokasi simpan' },
  ],
})

// ---- Cargo Declaration (FAL 2) — kolom faktual (packages/weight = teks faktual) ----
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
  listDesc: 'Daftar muatan yang disebut pengguna (B/L, kemasan, uraian, berat).',
  listColumns: [
    { key: 'blNo', desc: 'No. B/L' },
    { key: 'marks', desc: 'Merek & nomor' },
    { key: 'packages', desc: 'Jumlah & jenis kemasan' },
    { key: 'description', desc: 'Uraian barang' },
    { key: 'weight', desc: 'Berat kotor, mis. "6.000 MT"' },
  ],
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

// ---- Crew Change Notice — kolom faktual ----
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
  listDesc: 'Daftar awak yang berganti (sign-on/off) yang disebut pengguna.',
  listColumns: [
    { key: 'name', desc: 'Nama awak' },
    { key: 'rank', desc: 'Jabatan/rank' },
    { key: 'nationality', desc: 'Kebangsaan' },
    { key: 'passport', desc: 'No. paspor' },
    { key: 'action', desc: 'Sign-on atau Sign-off' },
    { key: 'remark', desc: 'Keterangan' },
  ],
})

// ---- Port Call Summary (finance agregat → 0; documents = daftar faktual) ----
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
  listDesc: 'Daftar dokumen terkait port call yang disebut pengguna.',
  listColumns: [
    { key: 'label', desc: 'Nama dokumen' },
    { key: 'docNumber', desc: 'No. dokumen' },
    { key: 'status', desc: 'Status' },
  ],
  overrides: { finance: { epda: 0, fpda: 0, invoice: 0 } },
})

// ---- Time Sheet / Laytime (waktu = faktual; % laytime = HASIL HITUNG → guard) ----
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
  listDesc: 'Baris kronologi laytime (waktu → uraian) yang disebut pengguna.',
  listColumns: [
    { key: 'date', desc: 'Tanggal' },
    { key: 'fromTime', desc: 'Dari jam' },
    { key: 'toTime', desc: 'Sampai jam' },
    { key: 'description', desc: 'Uraian' },
    { key: 'percent', desc: '% laytime (dihitung mesin)', number: true, guard: true },
  ],
  overrides: { laytimeAllowedHours: 0, demurrageRate: 0, despatchRate: 0 },
})

// ---- Bunker Requisition (grade/qty/sulphur = faktual; harga = uang → guard) ----
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
  listDesc: 'Daftar bunker yang diminta (grade, jumlah MT, sulphur) yang disebut pengguna.',
  listColumns: [
    { key: 'grade', desc: 'Grade bahan bakar, mis. HSD/MFO/MGO' },
    { key: 'quantityMt', desc: 'Jumlah dalam MT bila disebut (faktual)', number: true },
    { key: 'sulphurPct', desc: 'Kandungan sulphur %, mis. "0.5"' },
    { key: 'unitPrice', desc: 'Harga (diisi operator)', number: true, guard: true },
  ],
})

// ---- Damage / Survey Report (temuan = faktual; estimasi biaya = uang → guard) ----
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
  listDesc: 'Daftar temuan kerusakan (lokasi, uraian, sebab, tingkat) yang disebut pengguna.',
  listColumns: [
    { key: 'location', desc: 'Lokasi kerusakan' },
    { key: 'description', desc: 'Uraian kerusakan' },
    { key: 'cause', desc: 'Dugaan sebab' },
    { key: 'severity', desc: 'Tingkat (ringan/sedang/berat)' },
    { key: 'estimate', desc: 'Estimasi biaya (diisi operator)', number: true, guard: true },
  ],
})

// ---- Ullage Report (ullage/suhu = faktual; volume & densitas = hasil hitung → guard) ----
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
  listDesc: 'Daftar tangki dengan pembacaan ullage & suhu yang disebut pengguna.',
  listColumns: [
    { key: 'tank', desc: 'Nama/nomor tangki' },
    { key: 'ullage', desc: 'Pembacaan ullage (cm/m)' },
    { key: 'tempC', desc: 'Suhu °C' },
    { key: 'volumeM3', desc: 'Volume m³ (dihitung mesin)', number: true, guard: true },
  ],
  overrides: { densityKgL: 0 },
})

// ---- Bill of Lading (CONGENBILL 2022) — semua teks/faktual. Field dgn default
// bagus (consignee "TO ORDER", freightTerms, originalCount/copyCount, signedFor,
// signatoryName) TIDAK didaftar → tetap pakai default form. ----
export const extractBl = makeMaritimeExtractor({
  toolName: 'isi_bl',
  docDesc: 'Bill of Lading (B/L) muatan curah',
  fields: [
    { key: 'docNumber', desc: 'No. B/L bila disebut' },
    { key: 'reference', desc: "Referensi/shipper's ref bila disebut" },
    { key: 'shipper', desc: 'Shipper — nama & alamat pengirim muatan' },
    { key: 'notifyParty', desc: 'Notify Party — pihak yang dikabari saat kapal tiba' },
    { key: 'carrier', desc: 'Carrier/pengangkut (owner kapal) yang BL diterbitkan atas namanya' },
    { key: 'vesselName', desc: 'Nama kapal' },
    { key: 'voyageNo', desc: 'No. voyage' },
    { key: 'flag', desc: 'Bendera' },
    { key: 'portOfLoading', desc: 'Port of Loading (pelabuhan muat)' },
    { key: 'portOfDischarge', desc: 'Port of Discharge (pelabuhan bongkar)' },
    { key: 'placeOfReceipt', desc: 'Place of Receipt bila multimoda' },
    { key: 'placeOfDelivery', desc: 'Place of Delivery bila multimoda' },
    { key: 'marksNumbers', desc: 'Marks & Numbers muatan (mis. N/M untuk curah)' },
    { key: 'packages', desc: 'Jumlah & jenis kemasan, mis. "In Bulk"' },
    { key: 'description', desc: 'Uraian barang, mis. "Steam Coal in Bulk" / "Crude Palm Oil"' },
    { key: 'grossWeight', desc: 'Berat kotor sebagai teks faktual, mis. "5,000 MT"' },
    { key: 'measurement', desc: 'Volume m³ bila disebut' },
    { key: 'charterPartyDate', desc: 'Tanggal Charter-Party bila disebut' },
    { key: 'shippedOnBoardDate', desc: 'Tanggal shipped on board' },
    { key: 'placeOfIssue', desc: 'Tempat penerbitan BL' },
    { key: 'dateOfIssue', desc: 'Tanggal penerbitan BL' },
  ],
})
