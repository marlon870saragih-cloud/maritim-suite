// Ekstraksi partikular kapal (ship particular) dari PDF/Excel → field Master Vessel.
// Satu draft, dua jalur masuk; keduanya berujung di tool-call terpaksa `isi_kapal`.
//
// Kenapa Excel TIDAK dibaca dengan pencocokan header kolom sendiri:
// lembar partikular kapal tak punya template baku — kadang tabel banyak kapal
// dengan header di baris ke-5, kadang lembar spesifikasi dua kolom (label | nilai),
// kadang label disingkat ("G/T", "L.O.A", "Breadth (mld)"). Pencocokan header
// buatan sendiri akan rapuh untuk semua variasi itu. Jadi workbook cukup
// diratakan jadi teks (satu baris per baris sheet) lalu dibaca AI — jalur yang
// SAMA dengan ekstraksi teks di lib/ai/*-extract.ts lain. Konsekuensinya:
// tak ada dependensi baru, dan aturan "AI tak boleh mengarang" berlaku seragam.
//
// PDF dikirim mentah ke model (blok `file` OpenRouter + engine `native` → vision
// Claude), jadi PDF hasil scan pun terbaca tanpa OCR/rendering library terpisah.

import ExcelJS from 'exceljs'
import { z } from 'zod'
import {
  chatCompletion,
  firstToolArguments,
  PDF_NATIVE_PLUGIN,
  type ChatMessage,
  type ToolDef,
} from './openrouter'
import { blankMissing } from './extract-util'

// Cermin VesselInput (lib/vessels.ts). Draft dikembalikan sebagai STRING semua —
// bentuknya persis form Master Vessel, dan vesselFields() yang mengubah ke angka
// saat disimpan. Jadi tak ada dua tempat yang mem-parse angka.
export const VESSEL_FIELD_KEYS = [
  'name', 'imoNumber', 'callSign', 'flag', 'vesselType',
  'gt', 'nrt', 'loa', 'beam', 'maxDraft', 'yearBuilt',
] as const

export type VesselDraft = Partial<Record<(typeof VESSEL_FIELD_KEYS)[number], string>>

const NUMERIC_KEYS = ['gt', 'nrt', 'loa', 'beam', 'maxDraft', 'yearBuilt'] as const

// Model boleh mengembalikan angka atau string ("25,432") — dinormalkan sendiri di bawah.
const numish = z.union([z.string(), z.number()]).optional()

const schema = z.object({
  name: z.string().optional(),
  imoNumber: z.string().optional(),
  callSign: z.string().optional(),
  flag: z.string().optional(),
  vesselType: z.string().optional(),
  gt: numish,
  nrt: numish,
  loa: numish,
  beam: numish,
  maxDraft: numish,
  yearBuilt: numish,
})

const TOOL: ToolDef = {
  type: 'function',
  function: {
    name: 'isi_kapal',
    description: 'Mengisi partikular kapal dari dokumen ship particular yang dilampirkan.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nama kapal apa adanya, tanpa prefiks MV/MT bila memang tak tertulis' },
        imoNumber: { type: 'string', description: 'Nomor IMO, ANGKA SAJA 7 digit (buang teks "IMO No.")' },
        callSign: { type: 'string', description: 'Call sign / tanda panggilan radio' },
        flag: { type: 'string', description: 'Negara bendera, mis. "Indonesia" / "Panama"' },
        vesselType: { type: 'string', description: 'Tipe kapal, mis. "Oil/Chemical Tanker" / "Bulk Carrier" / "Tug Boat"' },
        gt: { type: 'number', description: 'Gross Tonnage / GT / G.T. Ini BUKAN DWT/deadweight' },
        nrt: { type: 'number', description: 'Net Register Tonnage (NRT / NT / Net Tonnage)' },
        loa: { type: 'number', description: 'Length Over All dalam METER. Bukan LBP/LPP' },
        beam: { type: 'number', description: 'Lebar (Beam / Breadth / Breadth moulded) dalam METER' },
        maxDraft: { type: 'number', description: 'Draft maksimum / summer draft dalam METER' },
        yearBuilt: { type: 'number', description: 'Tahun bangun (4 digit), dari "Built" / "Year of Build"' },
      },
      required: [],
    },
  },
}

const SYSTEM_PROMPT = `Anda asisten yang membaca dokumen "ship particular" (partikular kapal) dan memindahkannya ke database Master Vessel perusahaan ship agent di Indonesia.

ATURAN KERAS:
- Isi field HANYA lewat tool "isi_kapal". Selalu panggil tool itu.
- JANGAN mengarang. Bila sebuah field tidak tertulis jelas di dokumen, KOSONGKAN (jangan tebak, jangan ambil dari pengetahuan umum tentang kapal itu, jangan hitung dari field lain).
- Angka: tulis angka murni tanpa pemisah ribuan dan tanpa satuan. Contoh "25,432.50 T" → 25432.5.
- Jangan tertukar: GT bukan DWT/deadweight; LOA bukan LBP/LPP; NRT bukan GT.
- Panjang/lebar/draft dalam METER. Bila dokumen menyebut satuannya feet/ft, konversikan ke meter.
- Bila dokumen memuat LEBIH DARI SATU kapal, ambil satu saja: kapal pertama (atau yang datanya paling lengkap). Jangan mencampur data antar-kapal.
- Nomor IMO: angka saja, 7 digit. Bila dokumen tak mencantumkan IMO, kosongkan — JANGAN pakai nomor lain (official number, MMSI, nomor registrasi) sebagai IMO.`

const PDF_INSTRUCTION =
  'Berkas terlampir adalah dokumen partikular kapal. Baca seluruh halaman dan isi field ' +
  'via tool "isi_kapal". Kosongkan field yang tidak tertulis di dokumen.'

const SHEET_INSTRUCTION =
  'Di bawah ini isi lembar kerja (Excel/CSV) partikular kapal yang sudah diratakan menjadi teks. ' +
  'Setiap baris = satu baris sheet, sel dipisah " | ", dan "[Sheet: nama]" menandai awal sheet. ' +
  'Isi field via tool "isi_kapal". Kosongkan field yang tidak ada di data ini.\n\n'

/**
 * Bersihkan angka dari teks dokumen. Pemisah ribuan koma dibuang; koma yang
 * ternyata pemisah desimal (bukan grup 3 digit) diubah jadi titik.
 */
function cleanNumeric(raw: string): string {
  let s = raw.replace(/[^\d.,-]/g, '').trim()
  if (!s) return ''
  const hasDot = s.includes('.')
  const hasComma = s.includes(',')
  if (hasComma && hasDot) s = s.replace(/,/g, '')
  else if (hasComma) s = /,\d{3}(?:\D|$)/.test(s) ? s.replace(/,/g, '') : s.replace(/,/g, '.')
  const n = Number(s)
  return Number.isFinite(n) ? String(n) : ''
}

/** Validasi + normalisasi hasil tool-call jadi draft berisi string siap-form. */
function toDraft(raw: unknown): VesselDraft {
  const parsed = schema.parse(raw)
  const out: VesselDraft = {}
  for (const [k, v] of Object.entries(parsed)) {
    if (v === null || v === undefined) continue
    const text = typeof v === 'number' ? String(v) : v.trim()
    if (!text) continue
    const isNum = (NUMERIC_KEYS as readonly string[]).includes(k)
    const val = isNum ? cleanNumeric(text) : text
    if (val) (out as Record<string, string>)[k] = val
  }
  if (out.imoNumber) {
    const digits = out.imoNumber.replace(/\D/g, '')
    if (digits) out.imoNumber = digits
    else delete out.imoNumber
  }
  // Semua field yang tak diisi AI → string kosong, supaya form preview di klien
  // bisa langsung dipakai apa adanya tanpa sisa nilai dari import sebelumnya.
  return blankMissing(out, [...VESSEL_FIELD_KEYS])
}

async function runExtraction(content: ChatMessage['content'], plugins?: typeof PDF_NATIVE_PLUGIN) {
  const resp = await chatCompletion({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content },
    ],
    tools: [TOOL],
    toolChoice: { type: 'function', function: { name: TOOL.function.name } },
    plugins,
  })
  const args = firstToolArguments(resp)
  if (!args) throw new Error('AI tidak mengembalikan data kapal')
  return toDraft(JSON.parse(args))
}

/** Teks satu sel, apa pun bentuk value-nya di ExcelJS (formula/rich text/tanggal/hyperlink). */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'object') {
    const o = value as unknown as Record<string, unknown>
    if ('richText' in o && Array.isArray(o.richText)) {
      return (o.richText as { text?: string }[]).map((r) => r.text ?? '').join('')
    }
    if ('result' in o) return cellText(o.result as ExcelJS.CellValue)
    if ('text' in o && typeof o.text === 'string') return o.text
    return ''
  }
  return String(value)
}

const MAX_LINES = 400
const MAX_CHARS = 24_000

// ExcelJS.load() minta ArrayBuffer (tipe `Buffer` di typings-nya = ArrayBuffer),
// bukan Buffer Node — jadi jalur workbook memakai ArrayBuffer mentah.
/** Ratakan workbook jadi teks berbaris — masukan untuk jalur ekstraksi teks. */
export async function flattenWorkbook(bytes: ArrayBuffer): Promise<string> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(bytes)

  const lines: string[] = []
  wb.eachSheet((ws) => {
    if (lines.length >= MAX_LINES) return
    lines.push(`[Sheet: ${ws.name}]`)
    ws.eachRow({ includeEmpty: false }, (row) => {
      if (lines.length >= MAX_LINES) return
      // columnCount kadang 0 pada sheet tertentu → pakai cellCount baris sebagai cadangan,
      // supaya baris tidak ikut hilang.
      const width = Math.min(Math.max(ws.columnCount || 0, row.cellCount || 0), 40)
      const cells: string[] = []
      for (let c = 1; c <= width; c++) cells.push(cellText(row.getCell(c).value).replace(/\s+/g, ' ').trim())
      while (cells.length && !cells[cells.length - 1]) cells.pop()
      if (cells.some((c) => c)) lines.push(cells.join(' | '))
    })
  })

  return lines.join('\n').slice(0, MAX_CHARS)
}

/** Ekstrak draft kapal dari workbook Excel (.xlsx/.xlsm). */
export async function extractVesselDraftFromWorkbook(bytes: ArrayBuffer): Promise<VesselDraft> {
  const sheet = await flattenWorkbook(bytes)
  if (!sheet.trim()) throw new Error('Berkas Excel kosong / tidak ada data yang bisa dibaca')
  return runExtraction(SHEET_INSTRUCTION + sheet)
}

/** Ekstrak draft kapal dari teks tabular mentah (CSV). */
export async function extractVesselDraftFromText(text: string): Promise<VesselDraft> {
  const trimmed = text.slice(0, MAX_CHARS)
  if (!trimmed.trim()) throw new Error('Berkas kosong / tidak ada data yang bisa dibaca')
  return runExtraction(SHEET_INSTRUCTION + trimmed)
}

/** Ekstrak draft kapal dari PDF — dikirim mentah ke vision model lewat blok `file`. */
export async function extractVesselDraftFromPdf(bytes: Buffer, filename: string): Promise<VesselDraft> {
  const content: ChatMessage['content'] = [
    { type: 'text', text: PDF_INSTRUCTION },
    {
      type: 'file',
      file: {
        filename: filename || 'ship-particular.pdf',
        file_data: `data:application/pdf;base64,${bytes.toString('base64')}`,
      },
    },
  ]
  try {
    return await runExtraction(content, PDF_NATIVE_PLUGIN)
  } catch (e) {
    // Engine `native` bergantung pada dukungan file bawaan model di katalog OpenRouter.
    // Bila slug model diganti ke model yang tak mendukungnya, coba lagi tanpa blok
    // plugins agar OpenRouter memilih parser sendiri — daripada gagal total.
    const msg = e instanceof Error ? e.message.toLowerCase() : ''
    if (!/plugin|engine|native|file/.test(msg)) throw e
    return runExtraction(content)
  }
}
