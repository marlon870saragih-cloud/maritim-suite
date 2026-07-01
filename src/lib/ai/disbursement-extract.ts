// Ekstraksi EPDA & FPDA — partikular kapal/call + catatan (TEKS). Seksi biaya
// dikirim sebagai SKELETON KOSONG (A/B/C/D, item kosong) agar TIDAK fallback ke
// seksi contoh (sample money). Operator isi tarif di form; server hitung total.

import { z } from 'zod'
import type { ToolDef } from './openrouter'
import { runToolExtraction, MONEY_GUARD, pickStrings, blankMissing } from './extract-util'
import type { EpdaData, EpdaSection } from '@/lib/pdf/epda-data'

const STR_FIELDS = [
  'docNumber', 'issuedAt', 'validUntil', 'vesselName', 'principal', 'imo', 'flag',
  'port', 'portCode', 'gt', 'nrt', 'eta', 'etd', 'loa', 'draft', 'cargo',
] as const

const schema = z.object({
  ...Object.fromEntries(STR_FIELDS.map((f) => [f, z.string().optional()])),
  notes: z.array(z.string()).optional(),
})

// Kerangka 4 seksi standar dengan satu baris kosong — operator isi tarif & jumlah.
const EMPTY_SECTIONS: EpdaSection[] = [
  { letter: 'A', title: 'Port Authority & Government Charges', items: [{ description: '', basis: '', qty: '', rate: 0, amount: 0 }] },
  { letter: 'B', title: 'Pilotage, Towage & Mooring', items: [{ description: '', basis: '', qty: '', rate: 0, amount: 0 }] },
  { letter: 'C', title: 'Clearance & Documentation', items: [{ description: '', basis: '', qty: '', rate: 0, amount: 0 }] },
  { letter: 'D', title: 'Agency & Disbursements', items: [{ description: '', basis: '', qty: '', rate: 0, amount: 0 }] },
]

const props: Record<string, object> = {
  docNumber: { type: 'string', description: 'No. dokumen bila disebut' },
  issuedAt: { type: 'string', description: 'Tanggal terbit' },
  validUntil: { type: 'string', description: 'Berlaku s/d' },
  vesselName: { type: 'string', description: 'Nama kapal' },
  principal: { type: 'string', description: 'Principal / pemilik' },
  imo: { type: 'string', description: 'No. IMO bila disebut' },
  flag: { type: 'string', description: 'Bendera kapal' },
  port: { type: 'string', description: 'Pelabuhan' },
  portCode: { type: 'string', description: 'Kode pelabuhan (UN/LOCODE) bila disebut' },
  gt: { type: 'string', description: 'GT bila disebut' },
  nrt: { type: 'string', description: 'NRT bila disebut' },
  eta: { type: 'string', description: 'ETA' },
  etd: { type: 'string', description: 'ETD' },
  loa: { type: 'string', description: 'LOA (mis. "112.5 m")' },
  draft: { type: 'string', description: 'Draft maks (mis. "6.8 m")' },
  cargo: { type: 'string', description: 'Muatan, mis. "MGO 6,000 KL — Discharge"' },
  notes: { type: 'array', items: { type: 'string' }, description: 'Catatan/ketentuan bila disebut' },
}

function makeTool(name: string): ToolDef {
  return {
    type: 'function',
    function: { name, description: 'Mengisi partikular kapal & call untuk dokumen disbursement (TEKS).', parameters: { type: 'object', properties: props, required: [] } },
  }
}

async function extract(instruction: string, toolName: string): Promise<Partial<EpdaData>> {
  const raw = (await runToolExtraction({
    system: `Anda asisten yang mengisi partikular kapal & port call untuk dokumen disbursement (EPDA/FPDA) keagenan kapal. ${MONEY_GUARD} Jangan isi rincian biaya per-seksi — itu diisi operator.`,
    tool: makeTool(toolName),
    instruction,
  })) as Record<string, unknown>
  const parsed = schema.parse(raw)
  const out = pickStrings<EpdaData>(parsed, [...STR_FIELDS]) as Partial<EpdaData>
  blankMissing(out, [...STR_FIELDS]) // partikular tak disebut → kosong (bukan nilai contoh)
  if (Array.isArray(parsed.notes) && parsed.notes.length) out.notes = parsed.notes
  out.sections = EMPTY_SECTIONS.map((s) => ({ ...s, items: s.items.map((it) => ({ ...it })) }))
  return out
}

export const extractEpdaDraft = (instruction: string) => extract(instruction, 'isi_epda')

export async function extractFpdaDraft(instruction: string): Promise<Partial<EpdaData>> {
  const out = await extract(instruction, 'isi_fpda')
  out.advanceReceived = 0 // FPDA: jangan pakai dana muka contoh; operator isi.
  return out
}
