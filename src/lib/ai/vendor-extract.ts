// Deskriptor ekstraksi Vendor (Fase 6h / K81) — dipakai `extract-target.ts`.
// Risiko rendah (tak menyentuh uang): daftar rekanan pelabuhan (pandu, tunda,
// fresh water, dsb.) yang datang sebagai lampiran.

import type { ToolDef } from './openrouter'
import type { TargetEkstraksi } from './extract-target'

export const VENDOR_FIELDS = [
  'name', 'vendorType', 'address', 'npwp', 'email', 'phone', 'contactPerson', 'bankName', 'bankAccount', 'paymentTermDays',
] as const
export type VendorField = (typeof VENDOR_FIELDS)[number]

/** Cocokkan baris hasil ekstraksi dengan Vendor yang sudah ada — cocok nama (case-insensitive). */
export const VENDOR_MATCH_FIELD: VendorField = 'name'

const TOOL: ToolDef = {
  type: 'function',
  function: {
    name: 'isi_daftar_vendor',
    description: 'Mengisi daftar vendor/rekanan pelabuhan dari dokumen yang dilampirkan.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: 'Satu entri per vendor yang ditemukan di dokumen. Daftar kosong bila tak ada satu pun.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Nama perusahaan/rekanan, apa adanya di dokumen' },
              vendorType: { type: 'string', description: 'mis. "Pilot", "Tug", "Fresh Water", "Garbage Collection" — hanya bila tertulis/tersirat jelas dari konteks dokumen' },
              address: { type: 'string' },
              npwp: { type: 'string' },
              email: { type: 'string' },
              phone: { type: 'string' },
              contactPerson: { type: 'string' },
              bankName: { type: 'string', description: 'Nama bank untuk pembayaran, bila dicantumkan' },
              bankAccount: { type: 'string', description: 'Nomor rekening, apa adanya' },
              paymentTermDays: { type: 'number', description: 'Termin pembayaran dalam HARI, angka murni' },
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

const SYSTEM_PROMPT = `Anda asisten yang membaca dokumen daftar vendor/rekanan pelabuhan (pandu, tunda, fresh water, garbage, dsb.) untuk perusahaan ship agent di Indonesia, dan memindahkannya ke database Master Vendor.

ATURAN KERAS:
- Isi field HANYA lewat tool "isi_daftar_vendor". Selalu panggil tool itu, walau hasilnya daftar kosong.
- Satu entri "items" per PERUSAHAAN/rekanan yang berbeda.
- JANGAN mengarang. Field yang tidak tertulis jelas: KOSONGKAN.
- JANGAN menuliskan tarif/harga jasa — nomor rekening bank BUKAN tarif, boleh diisi bila memang tertulis untuk keperluan pembayaran vendor.
- "bankAccount"/"bankName" hanya diisi bila jelas berlabel rekening pembayaran vendor, jangan tertukar dengan nomor telepon atau NPWP.
- "paymentTermDays" hanya diisi bila eksplisit tertulis.`

export const VENDOR_TARGET: TargetEkstraksi<VendorField> = {
  nama: 'vendor',
  fields: VENDOR_FIELDS,
  numericFields: ['paymentTermDays'],
  tool: TOOL,
  systemPrompt: SYSTEM_PROMPT,
}
