// Ekstraksi Kwitansi — teks penerimaan. `amount` (jumlah uang) DIPAKSA 0 (operator
// isi di form; server hitung & "terbilang" otomatis). AI hanya bahasa.

import { z } from 'zod'
import type { ToolDef } from './openrouter'
import { runToolExtraction, MONEY_GUARD, pickStrings, blankMissing } from './extract-util'
import type { ReceiptData } from '@/lib/pdf/receipt-data'

const STR_FIELDS = ['docNumber', 'receiptDate', 'receivedFrom', 'forPayment', 'refDoc', 'place', 'signName', 'signRole'] as const
// Partikular yang dikosongkan bila tak disebut (nama/jabatan penerima tetap default).
const PARTICULARS = ['docNumber', 'receiptDate', 'receivedFrom', 'forPayment', 'refDoc', 'place'] as const

const schema = z.object(Object.fromEntries(STR_FIELDS.map((f) => [f, z.string().optional()])))

const TOOL: ToolDef = {
  type: 'function',
  function: {
    name: 'isi_kwitansi',
    description: 'Mengisi field TEKS kwitansi/tanda terima pembayaran. JANGAN isi jumlah uang.',
    parameters: {
      type: 'object',
      properties: {
        docNumber: { type: 'string', description: 'No. kwitansi bila disebut' },
        receiptDate: { type: 'string', description: 'Tanggal' },
        receivedFrom: { type: 'string', description: 'Diterima dari (pembayar/principal)' },
        forPayment: { type: 'string', description: 'Untuk pembayaran … (uraian)' },
        refDoc: { type: 'string', description: 'Ref. invoice/FDA bila disebut' },
        place: { type: 'string', description: 'Tempat (kota) tanda tangan' },
        signName: { type: 'string', description: 'Nama penerima bila disebut' },
        signRole: { type: 'string', description: 'Jabatan penerima bila disebut' },
      },
      required: [],
    },
  },
}

export async function extractReceiptDraft(instruction: string): Promise<Partial<ReceiptData>> {
  const raw = (await runToolExtraction({
    system: `Anda asisten yang mengisi kwitansi/tanda terima pembayaran jasa keagenan kapal. ${MONEY_GUARD}`,
    tool: TOOL,
    instruction,
  })) as Record<string, unknown>
  const parsed = schema.parse(raw)
  const out = pickStrings<ReceiptData>(parsed, [...STR_FIELDS]) as Partial<ReceiptData>
  blankMissing(out, [...PARTICULARS])
  out.amount = 0 // operator isi jumlah; jangan pakai nilai contoh.
  return out
}
