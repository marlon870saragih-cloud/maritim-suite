// Deskriptor ekstraksi Customer (Fase 6h / K81) — dipakai `extract-target.ts`.
// Risiko rendah (tak menyentuh uang): daftar principal/pencharter/customer
// yang datang sebagai lampiran (Excel/PDF/foto daftar pelanggan).

import type { ToolDef } from './openrouter'
import type { TargetEkstraksi } from './extract-target'

export const CUSTOMER_FIELDS = [
  'name', 'customerType', 'address', 'npwp', 'email', 'phone', 'contactPerson', 'paymentTermDays',
] as const
export type CustomerField = (typeof CUSTOMER_FIELDS)[number]

/** Field dipakai mencocokkan baris hasil ekstraksi dengan Customer yang sudah ada — cocok nama (case-insensitive). */
export const CUSTOMER_MATCH_FIELD: CustomerField = 'name'

const TOOL: ToolDef = {
  type: 'function',
  function: {
    name: 'isi_daftar_customer',
    description: 'Mengisi daftar customer (pelanggan/principal/pencharter yang ditagih) dari dokumen yang dilampirkan.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: 'Satu entri per customer yang ditemukan di dokumen. Daftar kosong bila tak ada satu pun.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Nama perusahaan customer, apa adanya di dokumen' },
              customerType: { type: 'string', description: 'mis. "Shipowner", "Charterer", "Trader" — hanya bila tertulis eksplisit' },
              address: { type: 'string' },
              npwp: { type: 'string', description: 'NPWP, format apa adanya (boleh ada titik/strip)' },
              email: { type: 'string' },
              phone: { type: 'string' },
              contactPerson: { type: 'string', description: 'Nama orang kontak / PIC, bila disebut' },
              paymentTermDays: { type: 'number', description: 'Termin pembayaran dalam HARI, angka murni (mis. "NET 30" → 30)' },
            },
            required: ['name'],
            additionalProperties: false,
          },
        },
      },
      required: ['items'],
      additionalProperties: false,
    },
  },
}

const SYSTEM_PROMPT = `Anda asisten yang membaca dokumen daftar customer (pelanggan/principal/pencharter) untuk perusahaan ship agent di Indonesia, dan memindahkannya ke database Master Customer.

ATURAN KERAS:
- Isi field HANYA lewat tool "isi_daftar_customer". Selalu panggil tool itu, walau hasilnya daftar kosong.
- Satu entri "items" per PERUSAHAAN customer yang berbeda. Dokumen berisi tabel banyak baris → banyak entri. Dokumen satu perusahaan saja → satu entri.
- JANGAN mengarang. Field yang tidak tertulis jelas untuk baris tersebut: KOSONGKAN, jangan tebak dari baris lain atau dari pengetahuan umum tentang perusahaan itu.
- JANGAN menuliskan angka uang/tarif/harga apa pun — itu bukan bagian dari data customer.
- "paymentTermDays" hanya diisi bila dokumen eksplisit menyebut termin (mis. "30 hari", "NET 30", "TT 14 days" → 14). Jangan menebak dari kebiasaan industri.
- Nama perusahaan ditulis apa adanya (boleh menyertakan "PT"/"CV" bila memang tertulis begitu), jangan disingkat atau diperpanjang sendiri.`

export const CUSTOMER_TARGET: TargetEkstraksi<CustomerField> = {
  nama: 'customer',
  fields: CUSTOMER_FIELDS,
  numericFields: ['paymentTermDays'],
  tool: TOOL,
  systemPrompt: SYSTEM_PROMPT,
}
