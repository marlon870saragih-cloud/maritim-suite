// Ekstraksi instruksi bahasa → field SPK terstruktur. AI dipaksa memanggil tool
// `isi_spk` yang parameternya = field SPK (TANPA uang — SPK bukan dokumen uang).
// Validasi Zod memastikan hasilnya rapi sebelum dipakai prefill form.

import { z } from 'zod'
import { chatCompletion, firstToolArguments, type ToolDef } from './openrouter'
import { blankMissing } from './extract-util'

// Partikular yang dikosongkan bila tak disebut (lihat pemakaian di bawah).
const SPK_PARTICULARS = [
  'docNumber', 'issuedAt', 'toContact', 'toCompany', 'toCity', 'principal',
  'vesselName', 'gtNrt', 'cargo', 'loadingDate', 'loadPort', 'dischPort',
] as const

// Field per-dokumen yang boleh diisi AI (subset SpkData tanpa `tenant`).
const scopeItemSchema = z.object({
  text: z.string(),
  detail: z.string().optional(),
})

export const spkDraftSchema = z.object({
  docNumber: z.string().optional(),
  issuedAt: z.string().optional(),
  validity: z.string().optional(),
  appointmentType: z.string().optional(),
  toContact: z.string().optional(),
  toCompany: z.string().optional(),
  toRole: z.string().optional(),
  toCity: z.string().optional(),
  principal: z.string().optional(),
  vesselName: z.string().optional(),
  gtNrt: z.string().optional(),
  cargo: z.string().optional(),
  loadingDate: z.string().optional(),
  loadPort: z.string().optional(),
  dischPort: z.string().optional(),
  scopeItems: z.array(scopeItemSchema).optional(),
  terms: z.array(z.string()).optional(),
  approvedByName: z.string().optional(),
  approvedByTitle: z.string().optional(),
})

export type SpkDraft = z.infer<typeof spkDraftSchema>

// JSON Schema untuk parameter tool (cermin dari spkDraftSchema di atas).
const TOOL: ToolDef = {
  type: 'function',
  function: {
    name: 'isi_spk',
    description: 'Mengisi field Surat Penunjukan Kerja (SPK) dari instruksi pengguna.',
    parameters: {
      type: 'object',
      properties: {
        docNumber: { type: 'string', description: 'No. SPK bila disebut, mis. 001/TSM/SPK/VI/2026' },
        issuedAt: { type: 'string', description: 'Tanggal terbit, mis. "29 Jun 2026"' },
        validity: { type: 'string', description: 'Masa berlaku, mis. "Sesuai jadwal kapal"' },
        appointmentType: { type: 'string', description: 'Sifat penunjukan, mis. "Penunjukan Sub-Agen"' },
        toContact: { type: 'string', description: 'Nama kontak penerima (KEPADA), mis. "Pak Hardi"' },
        toCompany: { type: 'string', description: 'Perusahaan sub-agen yang ditunjuk' },
        toRole: { type: 'string', description: 'Peran, mis. "Sub-Agent / Handling Agent"' },
        toCity: { type: 'string', description: 'Kota sub-agen' },
        principal: { type: 'string', description: 'Principal/pemilik kapal' },
        vesselName: { type: 'string', description: 'Nama kapal' },
        gtNrt: { type: 'string', description: 'GT/NRT kapal sebagaimana disebut (jangan mengarang)' },
        cargo: { type: 'string', description: 'Muatan + jumlah, mis. "Biodiesel B40 · ± 6,000 MT"' },
        loadingDate: { type: 'string', description: 'Tanggal muat' },
        loadPort: { type: 'string', description: 'Pelabuhan muat' },
        dischPort: { type: 'string', description: 'Pelabuhan bongkar' },
        scopeItems: {
          type: 'array',
          description: 'Lingkup pekerjaan sub-agen (kosongkan bila tak disebut — biar pakai default form)',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              detail: { type: 'string' },
            },
            required: ['text'],
          },
        },
        terms: {
          type: 'array',
          description: 'Ketentuan (kosongkan bila tak disebut)',
          items: { type: 'string' },
        },
        approvedByName: { type: 'string', description: 'Nama penanda tangan bila disebut' },
        approvedByTitle: { type: 'string', description: 'Jabatan penanda tangan bila disebut' },
      },
      required: [],
    },
  },
}

const SYSTEM_PROMPT = `Anda asisten yang mengisi field Surat Penunjukan Kerja (SPK) keagenan kapal untuk perusahaan ship agent di Indonesia.

ATURAN:
- Tugas Anda HANYA menerjemahkan instruksi pengguna menjadi nilai field melalui tool "isi_spk".
- JANGAN mengarang data yang tidak disebut pengguna — terutama angka (GT/NRT, jumlah cargo), tanggal, dan nomor dokumen. Bila tidak disebut, KOSONGKAN field tersebut (jangan tebak).
- Jangan menghitung apa pun. Tidak ada uang di dokumen ini.
- Untuk lingkup pekerjaan & ketentuan: isi HANYA bila pengguna menyebut poin spesifik; bila tidak, kosongkan agar form memakai template bawaan.
- Gunakan bahasa Indonesia yang rapi & formal untuk teks.
- Selalu panggil tool "isi_spk" untuk mengembalikan hasil.`

/** Ekstrak draft SPK dari instruksi bebas. Mengembalikan field yang valid saja. */
export async function extractSpkDraft(instruction: string): Promise<SpkDraft> {
  const resp = await chatCompletion({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: instruction },
    ],
    tools: [TOOL],
    toolChoice: { type: 'function', function: { name: 'isi_spk' } },
  })

  const args = firstToolArguments(resp)
  if (!args) throw new Error('AI tidak mengembalikan data SPK')

  const raw = JSON.parse(args) as unknown
  // Validasi + buang field yang tak dikenal/kosong.
  const parsed = spkDraftSchema.parse(raw)
  // Rapikan: hilangkan string kosong agar tak menimpa isian form jadi kosong.
  const clean: SpkDraft = {}
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v === 'string') {
      if (v.trim()) (clean as Record<string, unknown>)[k] = v.trim()
    } else if (Array.isArray(v)) {
      if (v.length) (clean as Record<string, unknown>)[k] = v
    }
  }
  // Partikular per-dokumen yang TAK disebut → kosongkan (agar lewat pintu universal
  // tidak jatuh ke nilai contoh saat disimpan). Boilerplate (validity, appointmentType,
  // toRole, scopeItems, terms, penanda tangan) dibiarkan default.
  blankMissing(clean, [...SPK_PARTICULARS])
  return clean
}
