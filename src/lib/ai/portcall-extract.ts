// Ekstraksi instruksi bahasa → field Port Call. AI mengisi NAMA kapal/principal
// (dicocokkan ke master data jadi ID di route), pelabuhan, tanggal (ISO), & cargo.
// Tanggal diminta format YYYY-MM-DD agar langsung masuk input date form.

import { z } from 'zod'
import type { ToolDef } from './openrouter'
import { runToolExtraction } from './extract-util'

const schema = z.object({
  vesselName: z.string().optional(),
  principalName: z.string().optional(),
  port: z.string().optional(),
  portCode: z.string().optional(),
  eta: z.string().optional(),
  etd: z.string().optional(),
  cargo: z.string().optional(),
  cargoQty: z.string().optional(),
  cargoUnit: z.string().optional(),
  notes: z.string().optional(),
})

export type PortCallDraft = z.infer<typeof schema>

const TOOL: ToolDef = {
  type: 'function',
  function: {
    name: 'isi_portcall',
    description: 'Mengisi field Port Call (kunjungan kapal) dari instruksi pengguna.',
    parameters: {
      type: 'object',
      properties: {
        vesselName: { type: 'string', description: 'Nama kapal' },
        principalName: { type: 'string', description: 'Principal / pemilik / pencharter' },
        port: { type: 'string', description: 'Pelabuhan' },
        portCode: { type: 'string', description: 'Kode pelabuhan (UN/LOCODE) bila disebut' },
        eta: { type: 'string', description: 'ETA dalam format YYYY-MM-DD (konversi dari teks tanggal)' },
        etd: { type: 'string', description: 'ETD dalam format YYYY-MM-DD bila disebut' },
        cargo: { type: 'string', description: 'Nama muatan saja, mis. "MGO" / "CPO" / "Batubara"' },
        cargoQty: { type: 'string', description: 'Jumlah muatan (angka saja), mis. "6000"' },
        cargoUnit: { type: 'string', description: 'Satuan muatan, mis. "KL" / "MT" / "TEUS"' },
        notes: { type: 'string', description: 'Catatan tambahan bila ada' },
      },
      required: [],
    },
  },
}

const SYSTEM_PROMPT = `Anda asisten yang mengisi data Port Call (kunjungan kapal) untuk perusahaan ship agent di Indonesia.

ATURAN:
- Isi field via tool "isi_portcall".
- TANGGAL (eta/etd) WAJIB dikonversi ke format YYYY-MM-DD. Bila tahun tak disebut, gunakan tahun berjalan.
- Pisahkan muatan menjadi: cargo (nama saja), cargoQty (angka saja), cargoUnit (satuan). Mis. "MGO 6000 KL" → cargo "MGO", cargoQty "6000", cargoUnit "KL".
- Jangan mengarang data yang tidak disebut — kosongkan.
- Selalu panggil tool "isi_portcall".`

export async function extractPortCallDraft(instruction: string): Promise<PortCallDraft> {
  const raw = (await runToolExtraction({ system: SYSTEM_PROMPT, tool: TOOL, instruction })) as Record<string, unknown>
  const parsed = schema.parse(raw)
  const out: PortCallDraft = {}
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v === 'string' && v.trim()) (out as Record<string, unknown>)[k] = v.trim()
  }
  return out
}
