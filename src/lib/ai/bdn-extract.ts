// Ekstraksi BDN (Bunker Delivery Note) — kapal, pemasok, spesifikasi produk (TEKS).
// quantityMt (jumlah MT) boleh (kuantitas); pricePerMt (harga) DIPAKSA 0.

import { z } from 'zod'
import type { ToolDef } from './openrouter'
import { runToolExtraction, MONEY_GUARD, pickStrings, blankMissing } from './extract-util'
import type { BdnData } from '@/lib/pdf/bdn-data'

const STR_FIELDS = [
  'docNumber', 'deliveryDate', 'vesselName', 'imo', 'flag', 'port', 'supplier', 'bargeName',
  'productGrade', 'density15', 'viscosity', 'sulphurPct', 'flashPoint', 'waterPct', 'pourPoint',
  'remarks', 'receiverName', 'signRole',
] as const
// Kosongkan partikular & spesifikasi bila tak disebut (supplier/remarks/jabatan tetap default).
const PARTICULARS = [
  'docNumber', 'deliveryDate', 'vesselName', 'imo', 'flag', 'port', 'bargeName',
  'productGrade', 'density15', 'viscosity', 'sulphurPct', 'flashPoint', 'waterPct', 'pourPoint', 'receiverName',
] as const

const schema = z.object({
  ...Object.fromEntries(STR_FIELDS.map((f) => [f, z.string().optional()])),
  quantityMt: z.number().optional(),
})

const props: Record<string, object> = {
  docNumber: { type: 'string', description: 'No. BDN bila disebut' },
  deliveryDate: { type: 'string', description: 'Tanggal & waktu serah' },
  vesselName: { type: 'string', description: 'Kapal penerima' },
  imo: { type: 'string', description: 'IMO bila disebut' },
  flag: { type: 'string', description: 'Bendera' },
  port: { type: 'string', description: 'Pelabuhan' },
  supplier: { type: 'string', description: 'Pemasok bunker' },
  bargeName: { type: 'string', description: 'Tongkang/truk pengirim' },
  productGrade: { type: 'string', description: 'Jenis produk: MGO/HSFO/VLSFO/B30 …' },
  quantityMt: { type: 'number', description: 'Jumlah dalam MT (kuantitas, bukan harga) bila disebut' },
  density15: { type: 'string', description: 'Density @15°C bila disebut' },
  viscosity: { type: 'string', description: 'Viskositas bila disebut' },
  sulphurPct: { type: 'string', description: 'Kandungan sulfur % bila disebut' },
  flashPoint: { type: 'string', description: 'Flash point bila disebut' },
  waterPct: { type: 'string', description: 'Kadar air % bila disebut' },
  pourPoint: { type: 'string', description: 'Pour point bila disebut' },
  remarks: { type: 'string', description: 'Catatan serah terima' },
  receiverName: { type: 'string', description: 'Nama penerima (chief engineer/master)' },
  signRole: { type: 'string', description: 'Jabatan penanda tangan pemasok' },
}

const TOOL: ToolDef = {
  type: 'function',
  function: { name: 'isi_bdn', description: 'Mengisi field TEKS Bunker Delivery Note. JANGAN isi harga.', parameters: { type: 'object', properties: props, required: [] } },
}

export async function extractBdnDraft(instruction: string): Promise<Partial<BdnData>> {
  const raw = (await runToolExtraction({
    system: `Anda asisten yang mengisi Bunker Delivery Note (serah bunker ke kapal). ${MONEY_GUARD} Jangan mengarang spesifikasi teknis (density, sulfur, dll) yang tidak disebut.`,
    tool: TOOL,
    instruction,
  })) as Record<string, unknown>
  const parsed = schema.parse(raw)
  const out = pickStrings<BdnData>(parsed, [...STR_FIELDS]) as Partial<BdnData>
  blankMissing(out, [...PARTICULARS])
  out.quantityMt = Number.isFinite(parsed.quantityMt) ? Number(parsed.quantityMt) : 0
  out.pricePerMt = 0 // operator isi harga; server hitung nilai.
  return out
}
