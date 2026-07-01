// Ekstraksi SOA (Statement of Account) — identitas pihak & periode (TEKS).
// openingBalance & rows (uang) DIPAKSA 0/kosong; operator isi, server hitung saldo.

import { z } from 'zod'
import type { ToolDef } from './openrouter'
import { runToolExtraction, MONEY_GUARD, pickStrings, blankMissing } from './extract-util'
import type { SoaData, SoaRow } from '@/lib/pdf/soa-data'

const STR_FIELDS = ['docNumber', 'statementDate', 'period', 'toName', 'toAddress', 'toNpwp', 'toAttn', 'notes', 'signRole'] as const
// Kosongkan partikular bila tak disebut (catatan & jabatan tetap default).
const PARTICULARS = ['docNumber', 'statementDate', 'period', 'toName', 'toAddress', 'toNpwp', 'toAttn'] as const

const schema = z.object(Object.fromEntries(STR_FIELDS.map((f) => [f, z.string().optional()])))

const TOOL: ToolDef = {
  type: 'function',
  function: {
    name: 'isi_soa',
    description: 'Mengisi field TEKS Statement of Account (rekap tagihan principal). JANGAN isi angka uang.',
    parameters: {
      type: 'object',
      properties: {
        docNumber: { type: 'string', description: 'No. SOA bila disebut' },
        statementDate: { type: 'string', description: 'Tanggal statement' },
        period: { type: 'string', description: 'Periode, mis. "Juni 2026"' },
        toName: { type: 'string', description: 'Principal langganan' },
        toAddress: { type: 'string', description: 'Alamat' },
        toNpwp: { type: 'string', description: 'NPWP bila disebut' },
        toAttn: { type: 'string', description: 'U.p. / kontak' },
        notes: { type: 'string', description: 'Catatan (teks)' },
        signRole: { type: 'string', description: 'Jabatan penanda tangan' },
      },
      required: [],
    },
  },
}

export async function extractSoaDraft(instruction: string): Promise<Partial<SoaData>> {
  const raw = (await runToolExtraction({
    system: `Anda asisten yang mengisi Statement of Account (rekap tagihan & saldo principal). ${MONEY_GUARD} Baris tagihan & saldo diisi operator.`,
    tool: TOOL,
    instruction,
  })) as Record<string, unknown>
  const parsed = schema.parse(raw)
  const out = pickStrings<SoaData>(parsed, [...STR_FIELDS]) as Partial<SoaData>
  blankMissing(out, [...PARTICULARS])
  out.openingBalance = 0
  // Satu baris kosong agar tak fallback ke baris contoh; operator isi.
  out.rows = [{ date: '', docNumber: '', amount: 0, paid: 0 } as SoaRow]
  return out
}
