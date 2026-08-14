// Deskriptor ekstraksi Port (Fase 6h / K81) — dipakai `extract-target.ts`.
// Risiko rendah (tak menyentuh uang): data pelabuhan/berth dari lampiran
// (edaran pelabuhan, daftar pelabuhan operasional, dsb.).

import type { ToolDef } from './openrouter'
import type { TargetEkstraksi } from './extract-target'

export const PORT_FIELDS = ['name', 'unlocode', 'country', 'portAuthority', 'maxDraft', 'maxLoa', 'workingHours'] as const
export type PortField = (typeof PORT_FIELDS)[number]

/**
 * Cocokkan baris hasil ekstraksi dengan Port yang sudah ada. Beda dari
 * Customer/Vendor (cuma nama): UN/LOCODE lebih dapat diandalkan sebagai
 * kunci (dua pelabuhan beda nama dagang bisa saja typo-sama, tapi locode
 * baku) — dipakai LEBIH DULU bila draft punya nilainya, baru jatuh ke nama.
 * Urutan ini yang membaca `route.ts`, bukan array datar seperti target lain.
 */
export const PORT_MATCH_FIELD_PRIMARY: PortField = 'unlocode'
export const PORT_MATCH_FIELD_FALLBACK: PortField = 'name'

const TOOL: ToolDef = {
  type: 'function',
  function: {
    name: 'isi_daftar_pelabuhan',
    description: 'Mengisi daftar pelabuhan dari dokumen yang dilampirkan.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: 'Satu entri per pelabuhan yang ditemukan di dokumen. Daftar kosong bila tak ada satu pun.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Nama pelabuhan, apa adanya di dokumen' },
              unlocode: { type: 'string', description: 'Kode UN/LOCODE 5 huruf (mis. IDBPN, IDSMR, SGSIN), HURUF BESAR. Kosongkan bila tak tertulis — jangan ditebak dari nama kota' },
              country: { type: 'string', description: 'Kode negara 2 huruf (mis. ID, SG) bila tertulis, atau nama negara apa adanya' },
              portAuthority: { type: 'string', description: 'Otoritas/pengelola pelabuhan, mis. "Pelindo III", "KSOP Samarinda"' },
              maxDraft: { type: 'number', description: 'Draft maksimum dalam METER, angka murni' },
              maxLoa: { type: 'number', description: 'LOA maksimum yang bisa dilayani dalam METER, angka murni' },
              workingHours: { type: 'string', description: 'Jam operasional, apa adanya (mis. "24 jam", "06.00-18.00")' },
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

const SYSTEM_PROMPT = `Anda asisten yang membaca dokumen daftar pelabuhan (edaran pelabuhan, daftar pelabuhan operasional, port information) untuk perusahaan ship agent di Indonesia, dan memindahkannya ke database Master Pelabuhan.

ATURAN KERAS:
- Isi field HANYA lewat tool "isi_daftar_pelabuhan". Selalu panggil tool itu, walau hasilnya daftar kosong.
- Satu entri "items" per PELABUHAN yang berbeda.
- JANGAN mengarang. Field yang tidak tertulis jelas: KOSONGKAN — termasuk "unlocode": JANGAN menebak kode dari nama kota/pelabuhan, hanya isi bila kodenya benar-benar tertulis di dokumen.
- JANGAN menuliskan tarif/harga jasa pelabuhan apa pun — dokumen ini cuma data fasilitas, bukan biaya.
- "maxDraft"/"maxLoa" dalam METER. Bila dokumen memakai satuan feet/kaki, konversikan ke meter dan sebutkan itu murni angka meter (tanpa satuan di keluaran).`

export const PORT_TARGET: TargetEkstraksi<PortField> = {
  nama: 'pelabuhan',
  fields: PORT_FIELDS,
  numericFields: ['maxDraft', 'maxLoa'],
  tool: TOOL,
  systemPrompt: SYSTEM_PROMPT,
}
