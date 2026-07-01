// Ekstraksi instruksi bahasa → field Invoice TEKS saja. PENGAMAN UANG:
// AI TIDAK PERNAH mengisi tarif/harga/qty — itu diisi operator, lalu server
// menghitung subtotal/agency/PPN/total via computeInvoiceTotals. AI hanya bahasa:
// pihak tertagih, referensi, deskripsi baris, syarat bayar.

import { z } from 'zod'
import { chatCompletion, firstToolArguments, type ToolDef } from './openrouter'
import { blankMissing } from './extract-util'
import type { InvoiceData, InvoiceLine } from '@/lib/pdf/invoice-data'

// Partikular yang dikosongkan bila tak disebut (syarat bayar boilerplate tetap default).
const INVOICE_PARTICULARS = [
  'docNumber', 'invoiceDate', 'dueDate', 'billToName', 'billToAddress', 'billToAttn',
  'billToNpwp', 'vesselVoyage', 'portCall', 'refFda',
] as const

const lineSchema = z.object({ description: z.string(), detail: z.string().optional() })

const invoiceDraftSchema = z.object({
  docNumber: z.string().optional(),
  invoiceDate: z.string().optional(),
  dueDate: z.string().optional(),
  billToName: z.string().optional(),
  billToAddress: z.string().optional(),
  billToAttn: z.string().optional(),
  billToNpwp: z.string().optional(),
  vesselVoyage: z.string().optional(),
  portCall: z.string().optional(),
  refFda: z.string().optional(),
  paymentTerms: z.string().optional(),
  lines: z.array(lineSchema).optional(),
})

const TOOL: ToolDef = {
  type: 'function',
  function: {
    name: 'isi_invoice',
    description: 'Mengisi field TEKS Invoice keagenan kapal. JANGAN isi angka uang/tarif/jumlah.',
    parameters: {
      type: 'object',
      properties: {
        docNumber: { type: 'string', description: 'No. invoice bila disebut' },
        invoiceDate: { type: 'string', description: 'Tanggal invoice bila disebut' },
        dueDate: { type: 'string', description: 'Jatuh tempo bila disebut' },
        billToName: { type: 'string', description: 'Nama pihak yang ditagih (principal)' },
        billToAddress: { type: 'string', description: 'Alamat pihak tertagih' },
        billToAttn: { type: 'string', description: 'U.p. / kontak' },
        billToNpwp: { type: 'string', description: 'NPWP pihak tertagih bila disebut' },
        vesselVoyage: { type: 'string', description: 'Kapal / voyage' },
        portCall: { type: 'string', description: 'Pelabuhan / port call' },
        refFda: { type: 'string', description: 'Referensi FDA bila disebut' },
        paymentTerms: { type: 'string', description: 'Syarat pembayaran (teks)' },
        lines: {
          type: 'array',
          description: 'Baris tagihan — HANYA deskripsi & keterangan (TANPA harga/qty). Kosongkan bila tak disebut.',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string', description: 'Uraian jasa, mis. "Pilotage, towage & mooring"' },
              detail: { type: 'string', description: 'Keterangan, mis. "2 movements, 2 tugs"' },
            },
            required: ['description'],
          },
        },
      },
      required: [],
    },
  },
}

const SYSTEM_PROMPT = `Anda asisten yang mengisi field TEKS Invoice jasa keagenan kapal untuk perusahaan ship agent di Indonesia.

ATURAN KERAS:
- AI TIDAK BOLEH menulis angka uang, tarif, harga satuan, atau jumlah rupiah apa pun. Itu akan diisi operator manusia; mesin yang menghitung total.
- Tugas Anda HANYA mengisi bagian bahasa: pihak tertagih, referensi, dan DESKRIPSI baris jasa (uraian + keterangan), via tool "isi_invoice".
- Untuk baris tagihan: isi deskripsi & keterangan saja (mis. "Pilotage, towage & mooring" / "2 movements"). JANGAN isi harga/qty.
- Jangan mengarang nomor dokumen, tanggal, atau NPWP yang tidak disebut.
- Selalu panggil tool "isi_invoice".`

/** Ekstrak draft Invoice (teks) → Partial<InvoiceData>. qty/unitPrice dipaksa 0 (operator isi). */
export async function extractInvoiceDraft(instruction: string): Promise<Partial<InvoiceData>> {
  const resp = await chatCompletion({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: instruction },
    ],
    tools: [TOOL],
    toolChoice: { type: 'function', function: { name: 'isi_invoice' } },
  })

  const args = firstToolArguments(resp)
  if (!args) throw new Error('AI tidak mengembalikan data Invoice')

  const parsed = invoiceDraftSchema.parse(JSON.parse(args) as unknown)
  const out: Partial<InvoiceData> = {}
  for (const [k, v] of Object.entries(parsed)) {
    if (k === 'lines') continue
    if (typeof v === 'string' && v.trim()) (out as Record<string, unknown>)[k] = v.trim()
  }
  blankMissing(out, [...INVOICE_PARTICULARS]) // partikular tak disebut → kosong (bukan contoh)
  // Baris: deskripsi dari AI, angka NOL (operator isi tarif/qty di form; server hitung total).
  // Selalu kirim minimal 1 baris kosong agar TIDAK fallback ke baris contoh (sample money).
  out.lines = parsed.lines?.length
    ? parsed.lines.map<InvoiceLine>((l) => ({
        description: l.description.trim(),
        detail: l.detail?.trim() || undefined,
        qty: 0,
        unitPrice: 0,
      }))
    : [{ description: '', qty: 0, unitPrice: 0 }]
  return out
}
