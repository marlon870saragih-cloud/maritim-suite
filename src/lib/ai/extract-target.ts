// Kerangka ekstraksi dokumen generik (Fase 6h · K81).
//
// Menggeneralisasi `vessel-extract.ts` (Fase 1): tiga jalur masukan yang sama
// (Excel diratakan jadi teks / PDF lewat blok `file` + plugin native / gambar
// lewat `image_url`) dipakai ulang APA ADANYA — yang khas per-target cuma
// daftar field, deskripsi field, dan aturan "jangan tertukar" (dibungkus jadi
// `TargetEkstraksi`). Menambah target baru = satu deskriptor baru
// (`customer-extract.ts`/`vendor-extract.ts`/`port-extract.ts` adalah
// contohnya), bukan menyalin ulang tiga jalur ini.
//
// ⚠️ K52 — BERKAS INI TIDAK BOLEH MENYENTUH DATABASE. Hanya `openrouter.ts`,
// `extract-util.ts` (blankMissing, murni), dan `vessel-extract.ts` (dipakai
// HANYA untuk `flattenWorkbook` — fungsinya generik, tak ada logika vessel di
// dalamnya) yang diimpor. `zod` untuk validasi bentuk, sudah dependency lama.
//
// ⚠️ Beda dari `vessel-extract.ts`: satu dokumen ship particular = SATU kapal,
// tapi satu dokumen Customer/Vendor/Port biasanya = SATU DAFTAR (lembar
// pelanggan, daftar rekanan pelabuhan). Jadi tool-call di sini SELALU
// mengembalikan array `items` (boleh kosong, boleh satu, boleh banyak) —
// bukan satu objek tunggal seperti `isi_kapal`.

import { z } from 'zod'
import {
  chatCompletion,
  firstToolArguments,
  PDF_NATIVE_PLUGIN,
  type ChatMessage,
  type ToolDef,
} from './openrouter'
import { blankMissing } from './extract-util'
import { flattenWorkbook } from './vessel-extract'

export type TargetEkstraksi<F extends string> = {
  /** Dipakai di pesan galat & log — bukan tampil ke pengguna. */
  nama: string
  fields: readonly F[]
  numericFields: readonly F[]
  tool: ToolDef
  /** WAJIB memuat larangan mengarang (K53) & instruksi "kosongkan bila tak tertulis". */
  systemPrompt: string
}

export type DraftBaris<F extends string> = Partial<Record<F, string>>

const MAX_CHARS = 24_000

const SHEET_INSTRUCTION =
  'Di bawah ini isi lembar kerja (Excel/CSV) yang sudah diratakan menjadi teks. Setiap baris = ' +
  'satu baris sheet, sel dipisah " | ", dan "[Sheet: nama]" menandai awal sheet. Baca seluruhnya ' +
  'dan isi via tool yang tersedia.\n\n'

const PDF_INSTRUCTION =
  'Berkas terlampir adalah dokumen yang perlu dibaca. Baca seluruh halaman dan isi via tool yang tersedia.'

const IMAGE_INSTRUCTION =
  'Gambar terlampir adalah foto/tangkapan layar dokumen yang perlu dibaca (mis. diteruskan lewat ' +
  'WhatsApp). Baca teks di dalamnya dan isi via tool yang tersedia. Kosongkan yang tidak terbaca ' +
  'jelas — jangan menebak dari gambar yang buram/terpotong.'

const numish = z.union([z.string(), z.number()]).optional()

/** Bersihkan angka dari teks dokumen — identik `vessel-extract.ts` (dipertahankan sengaja, bukan diimpor: berkas itu tak mengekspornya). */
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

function toDraftList<F extends string>(target: TargetEkstraksi<F>, raw: unknown): DraftBaris<F>[] {
  const bentuk: Record<string, z.ZodTypeAny> = {}
  for (const f of target.fields) bentuk[f] = target.numericFields.includes(f) ? numish : z.string().optional()
  const skemaBaris = z.object(bentuk)
  const skemaDaftar = z.object({ items: z.array(skemaBaris) })
  const parsed = skemaDaftar.parse(raw)

  return parsed.items.map((baris) => {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(baris)) {
      if (v === null || v === undefined) continue
      const text = typeof v === 'number' ? String(v) : String(v).trim()
      if (!text) continue
      const isNum = (target.numericFields as readonly string[]).includes(k)
      const val = isNum ? cleanNumeric(text) : text
      if (val) out[k] = val
    }
    return blankMissing(out as DraftBaris<F>, [...target.fields])
  })
}

async function jalankanEkstraksi<F extends string>(
  target: TargetEkstraksi<F>,
  content: ChatMessage['content'],
  plugins?: typeof PDF_NATIVE_PLUGIN,
): Promise<DraftBaris<F>[]> {
  const resp = await chatCompletion({
    messages: [
      { role: 'system', content: target.systemPrompt },
      { role: 'user', content },
    ],
    tools: [target.tool],
    toolChoice: { type: 'function', function: { name: target.tool.function.name } },
    plugins,
  })
  const args = firstToolArguments(resp)
  if (!args) throw new Error(`AI tidak mengembalikan data ${target.nama}`)
  return toDraftList(target, JSON.parse(args))
}

/** Ekstrak daftar dari workbook Excel (.xlsx/.xlsm). */
export async function extractDraftListFromWorkbook<F extends string>(
  target: TargetEkstraksi<F>,
  bytes: ArrayBuffer,
): Promise<DraftBaris<F>[]> {
  const sheet = await flattenWorkbook(bytes)
  if (!sheet.trim()) throw new Error('Berkas Excel kosong / tidak ada data yang bisa dibaca')
  return jalankanEkstraksi(target, SHEET_INSTRUCTION + sheet)
}

/** Ekstrak daftar dari teks tabular mentah (CSV). */
export async function extractDraftListFromText<F extends string>(
  target: TargetEkstraksi<F>,
  text: string,
): Promise<DraftBaris<F>[]> {
  const trimmed = text.slice(0, MAX_CHARS)
  if (!trimmed.trim()) throw new Error('Berkas kosong / tidak ada data yang bisa dibaca')
  return jalankanEkstraksi(target, SHEET_INSTRUCTION + trimmed)
}

/** Ekstrak daftar dari PDF — dikirim mentah ke vision model lewat blok `file`. */
export async function extractDraftListFromPdf<F extends string>(
  target: TargetEkstraksi<F>,
  bytes: Buffer,
  filename: string,
): Promise<DraftBaris<F>[]> {
  const content: ChatMessage['content'] = [
    { type: 'text', text: PDF_INSTRUCTION },
    { type: 'file', file: { filename: filename || 'dokumen.pdf', file_data: `data:application/pdf;base64,${bytes.toString('base64')}` } },
  ]
  try {
    return await jalankanEkstraksi(target, content, PDF_NATIVE_PLUGIN)
  } catch (e) {
    // Sama seperti vessel-extract.ts: kalau model tak dukung engine `native`, coba lagi tanpa plugin.
    const msg = e instanceof Error ? e.message.toLowerCase() : ''
    if (!/plugin|engine|native|file/.test(msg)) throw e
    return jalankanEkstraksi(target, content)
  }
}

/** Ekstrak daftar dari gambar (JPG/PNG/WEBP) — dikirim mentah lewat blok `image_url`. */
export async function extractDraftListFromImage<F extends string>(
  target: TargetEkstraksi<F>,
  bytes: Buffer,
  mimeType: string,
): Promise<DraftBaris<F>[]> {
  const content: ChatMessage['content'] = [
    { type: 'text', text: IMAGE_INSTRUCTION },
    { type: 'image_url', image_url: { url: `data:${mimeType};base64,${bytes.toString('base64')}` } },
  ]
  return jalankanEkstraksi(target, content)
}
