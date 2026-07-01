// Ekstraksi PR & PO — teks + baris barang. qty & unit boleh (itu kuantitas, bukan
// uang), tapi `unitPrice` (harga satuan) DIPAKSA 0. `kind`/`taxPct` dari route/contoh.

import { z } from 'zod'
import type { ToolDef } from './openrouter'
import { runToolExtraction, MONEY_GUARD, pickStrings, blankMissing } from './extract-util'
import type { ProcData, ProcLine } from '@/lib/pdf/procurement-data'

const STR_FIELDS = ['docNumber', 'docDate', 'vesselVoyage', 'party', 'partyAddress', 'partyAttn', 'deliveryTo', 'neededBy', 'paymentTerms', 'reason'] as const
// Kosongkan partikular bila tak disebut (syarat bayar boilerplate tetap default).
const PARTICULARS = ['docNumber', 'docDate', 'vesselVoyage', 'party', 'partyAddress', 'partyAttn', 'deliveryTo', 'neededBy', 'reason'] as const

const schema = z.object({
  ...Object.fromEntries(STR_FIELDS.map((f) => [f, z.string().optional()])),
  lines: z.array(z.object({ description: z.string(), detail: z.string().optional(), unit: z.string().optional(), qty: z.number().optional() })).optional(),
})

function makeTool(name: string, isPo: boolean): ToolDef {
  return {
    type: 'function',
    function: {
      name,
      description: `Mengisi field ${isPo ? 'Purchase Order' : 'Purchase Requisition'} (TEKS + kuantitas). JANGAN isi harga satuan/uang.`,
      parameters: {
        type: 'object',
        properties: {
          docNumber: { type: 'string', description: 'No. dokumen bila disebut' },
          docDate: { type: 'string', description: 'Tanggal' },
          vesselVoyage: { type: 'string', description: 'Kapal tujuan barang' },
          party: { type: 'string', description: isPo ? 'Supplier (kepada)' : 'Peminta / departemen' },
          partyAddress: { type: 'string', description: 'Alamat pihak' },
          partyAttn: { type: 'string', description: 'U.p. / kontak' },
          deliveryTo: { type: 'string', description: 'Lokasi/kapal pengiriman' },
          neededBy: { type: 'string', description: 'Dibutuhkan/dikirim tanggal' },
          paymentTerms: { type: 'string', description: 'Syarat pembayaran (PO)' },
          reason: { type: 'string', description: isPo ? 'Catatan / instruksi' : 'Justifikasi kebutuhan' },
          lines: {
            type: 'array',
            description: 'Barang — deskripsi, keterangan, satuan (unit), dan qty (kuantitas, BUKAN harga). Tanpa harga.',
            items: {
              type: 'object',
              properties: {
                description: { type: 'string' },
                detail: { type: 'string' },
                unit: { type: 'string', description: 'satuan: pcs, set, ltr, drum, coil, kg…' },
                qty: { type: 'number', description: 'jumlah/kuantitas barang' },
              },
              required: ['description'],
            },
          },
        },
        required: [],
      },
    },
  }
}

async function extract(instruction: string, toolName: string, isPo: boolean): Promise<Partial<ProcData>> {
  const raw = (await runToolExtraction({
    system: `Anda asisten yang mengisi dokumen pengadaan (${isPo ? 'PO ke supplier' : 'PR permintaan internal'}) kebutuhan kapal. ${MONEY_GUARD} Kuantitas (qty) & satuan (unit) BOLEH diisi karena bukan uang; harga satuan TIDAK boleh.`,
    tool: makeTool(toolName, isPo),
    instruction,
  })) as Record<string, unknown>
  const parsed = schema.parse(raw)
  const out = pickStrings<ProcData>(parsed, [...STR_FIELDS]) as Partial<ProcData>
  blankMissing(out, [...PARTICULARS])
  out.lines = parsed.lines?.length
    ? parsed.lines.map<ProcLine>((l) => ({
        description: l.description.trim(),
        detail: l.detail?.trim() || undefined,
        unit: l.unit?.trim() || 'pcs',
        qty: Number.isFinite(l.qty) ? Number(l.qty) : 0,
        unitPrice: 0,
      }))
    : [{ description: '', unit: 'pcs', qty: 0, unitPrice: 0 }]
  return out
}

export const extractPrDraft = (instruction: string) => extract(instruction, 'isi_pr', false)
export const extractPoDraft = (instruction: string) => extract(instruction, 'isi_po', true)
