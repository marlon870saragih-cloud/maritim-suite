// Ekstraksi Nota Debit/Kredit — teks penyesuaian. Baris: deskripsi saja, angka NOL
// (operator isi; server hitung). `kind` dipaksa oleh route, tak perlu diisi AI.

import { z } from 'zod'
import type { ToolDef } from './openrouter'
import { runToolExtraction, MONEY_GUARD, pickStrings, blankMissing } from './extract-util'
import type { NoteData, NoteLine } from '@/lib/pdf/note-data'

const STR_FIELDS = ['docNumber', 'noteDate', 'toName', 'toAddress', 'toNpwp', 'refDoc', 'vesselVoyage', 'reason'] as const

const schema = z.object({
  ...Object.fromEntries(STR_FIELDS.map((f) => [f, z.string().optional()])),
  lines: z.array(z.object({ description: z.string(), detail: z.string().optional() })).optional(),
})

function makeTool(name: string): ToolDef {
  return {
    type: 'function',
    function: {
      name,
      description: 'Mengisi field TEKS nota penyesuaian (debit/kredit). JANGAN isi angka uang.',
      parameters: {
        type: 'object',
        properties: {
          docNumber: { type: 'string', description: 'No. nota bila disebut' },
          noteDate: { type: 'string', description: 'Tanggal' },
          toName: { type: 'string', description: 'Pihak yang dinota' },
          toAddress: { type: 'string', description: 'Alamat' },
          toNpwp: { type: 'string', description: 'NPWP bila disebut' },
          refDoc: { type: 'string', description: 'Ref. invoice/FDA yang disesuaikan' },
          vesselVoyage: { type: 'string', description: 'Kapal / voyage' },
          reason: { type: 'string', description: 'Alasan penyesuaian (uraian)' },
          lines: {
            type: 'array',
            description: 'Baris penyesuaian — deskripsi & keterangan saja (TANPA harga/qty).',
            items: {
              type: 'object',
              properties: { description: { type: 'string' }, detail: { type: 'string' } },
              required: ['description'],
            },
          },
        },
        required: [],
      },
    },
  }
}

async function extract(instruction: string, toolName: string): Promise<Partial<NoteData>> {
  const raw = (await runToolExtraction({
    system: `Anda asisten yang mengisi nota penyesuaian (debit/kredit) tagihan keagenan kapal. ${MONEY_GUARD}`,
    tool: makeTool(toolName),
    instruction,
  })) as Record<string, unknown>
  const parsed = schema.parse(raw)
  const out = pickStrings<NoteData>(parsed, [...STR_FIELDS]) as Partial<NoteData>
  blankMissing(out, [...STR_FIELDS])
  out.lines = parsed.lines?.length
    ? parsed.lines.map<NoteLine>((l) => ({ description: l.description.trim(), detail: l.detail?.trim() || undefined, qty: 0, unitPrice: 0 }))
    : [{ description: '', qty: 0, unitPrice: 0 }]
  return out
}

export const extractDebitDraft = (instruction: string) => extract(instruction, 'isi_nota_debit')
export const extractCreditDraft = (instruction: string) => extract(instruction, 'isi_nota_kredit')
