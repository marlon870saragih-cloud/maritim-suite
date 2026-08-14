// Deskriptor ekstraksi Tarif/ServiceRate (Fase 6h bagian 2 · K82) — dipakai `extract-target.ts`.
//
// ⚠️ SATU-SATUNYA target ekstraksi Fase 6 yang menyentuh UANG. Beda dari
// customer/vendor/port (yang eksplisit DILARANG menuliskan angka uang), tugas
// di sini JUSTRU membaca angka tarif dari dokumen — itu intinya. Yang
// menjaga keamanannya BUKAN larangan di sini, tapi pagar berlapis di luar
// berkas ini (K82, ditegakkan di route + `RateImportDialog.tsx`):
//   1. Hasil SELALU baris ServiceRate BARU, tak pernah menimpa (route).
//   2. Pratinjau WAJIB diff (tarif lama → baru + %) per baris, dengan
//      kotak centang PER BARIS — tak ada tombol "terima semua" (dialog).
//   3. Jasa yang tak dikenali di ServiceCatalog TIDAK dibuat otomatis —
//      diarahkan ke Master › Jasa dulu (route).
//   4. Setiap penyimpanan menulis AuditLog berisi nama berkas sumber (route
//      penyimpanan terpisah, `api/ai/rate-import/route.ts`).
// Berkas INI (K52) tetap tak boleh sentuh DB — pencocokan katalog/pelabuhan
// & perhitungan diff dikerjakan di route, bukan di sini.

import type { ToolDef } from './openrouter'
import type { TargetEkstraksi } from './extract-target'

export const RATE_FIELDS = [
  'serviceCode', 'serviceName', 'portUnlocode', 'portName', 'vesselType', 'gtMin', 'gtMax', 'rate', 'currency', 'minCharge', 'effectiveFrom',
] as const
export type RateField = (typeof RATE_FIELDS)[number]

const TOOL: ToolDef = {
  type: 'function',
  function: {
    name: 'isi_daftar_tarif',
    description: 'Mengisi daftar baris tarif jasa pelabuhan dari dokumen edaran/lembar tarif yang dilampirkan.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: 'Satu entri per BARIS tarif (satu jasa bisa punya beberapa baris bila tarifnya bertingkat per GT/tipe kapal). Daftar kosong bila tak ada satu pun.',
          items: {
            type: 'object',
            properties: {
              serviceCode: { type: 'string', description: 'Kode jasa BILA tertulis eksplisit di dokumen (mis. "PILOT", "TUG"). Kosongkan bila dokumen cuma menyebut nama, bukan kode.' },
              serviceName: { type: 'string', description: 'Nama jasa apa adanya di dokumen (mis. "Pilotage", "Jasa Pandu", "Tunda / Towage")' },
              portUnlocode: { type: 'string', description: 'UN/LOCODE pelabuhan BILA tertulis. Jangan menebak dari nama kota.' },
              portName: { type: 'string', description: 'Nama pelabuhan apa adanya, bila tarif ini spesifik satu pelabuhan. Kosongkan bila tarif berlaku umum/semua pelabuhan.' },
              vesselType: { type: 'string', description: 'Tipe kapal bila tarif dibedakan per tipe (mis. "Tanker", "Bulk Carrier"). Kosongkan bila berlaku semua tipe.' },
              gtMin: { type: 'number', description: 'Batas bawah GT untuk tarif ini, bila tarif bertingkat per rentang GT' },
              gtMax: { type: 'number', description: 'Batas atas GT untuk tarif ini, bila tarif bertingkat per rentang GT' },
              rate: { type: 'number', description: 'ANGKA TARIF, murni angka (buang pemisah ribuan), JANGAN dihitung/dikonversi — salin persis apa adanya di dokumen' },
              currency: { type: 'string', description: 'Kode mata uang 3 huruf (IDR/USD/dst). Kosongkan bila tak tertulis — JANGAN mengasumsikan IDR' },
              minCharge: { type: 'number', description: 'Biaya minimum (minimum charge) bila disebutkan terpisah dari tarif per unit' },
              effectiveFrom: { type: 'string', description: 'Tanggal mulai berlaku, format YYYY-MM-DD, HANYA bila eksplisit tertulis. Kosongkan bila dokumen tak menyebut tanggal berlaku — JANGAN memakai tanggal dokumen/hari ini sebagai tebakan' },
            },
            required: ['serviceName', 'rate'],
            additionalProperties: false,
          },
        },
      },
      required: ['items'],
      additionalProperties: false,
    },
  },
}

const SYSTEM_PROMPT = `Anda asisten yang membaca dokumen edaran/lembar tarif jasa pelabuhan (dari KSOP, Pelindo, atau daftar tarif internal) untuk perusahaan ship agent di Indonesia, dan mengeluarkan angkanya untuk DIPERIKSA MANUSIA sebelum disimpan — bukan disimpan otomatis.

ATURAN KERAS — INI DOKUMEN UANG, PALING KETAT DARI SEMUA TARGET EKSTRAKSI:
- Isi field HANYA lewat tool "isi_daftar_tarif". Selalu panggil tool itu, walau hasilnya daftar kosong.
- Satu entri "items" per BARIS tarif. Satu jasa dengan tarif bertingkat per rentang GT/tipe kapal = BEBERAPA entri (satu per tingkat), bukan digabung jadi satu.
- "rate" WAJIB angka MURNI dari dokumen. JANGAN menghitung, JANGAN mengonversi mata uang, JANGAN membulatkan, JANGAN menjumlahkan beberapa komponen jadi satu angka sendiri — salin PERSIS satu angka tarif yang tertulis untuk baris itu. Bila satu baris dokumen punya beberapa angka (mis. "tarif dasar" dan "biaya tambahan" terpisah), itu DUA baris hasil, bukan satu baris dijumlah.
- "currency" JANGAN diasumsikan. Bila dokumen tak menyebut mata uang sama sekali, kosongkan — biarkan operator yang menentukan, JANGAN menebak IDR/USD.
- "effectiveFrom" JANGAN diisi dari tanggal dokumen diterbitkan atau tanggal hari ini — HANYA bila dokumen eksplisit menyebut "berlaku mulai", "efektif", atau kalimat serupa yang menyatakan tanggal mulai berlaku tarif itu sendiri.
- Field yang tidak tertulis jelas untuk baris tersebut: KOSONGKAN. Jangan menebak dari baris lain atau dari pengetahuan umum tentang tarif pelabuhan Indonesia.
- Nama jasa ditulis apa adanya di dokumen (bahasa Indonesia atau Inggris, sesuai dokumen) — jangan diterjemahkan atau distandardisasi sendiri.`

export const RATE_TARGET: TargetEkstraksi<RateField> = {
  nama: 'tarif',
  fields: RATE_FIELDS,
  numericFields: ['gtMin', 'gtMax', 'rate', 'minCharge'],
  tool: TOOL,
  systemPrompt: SYSTEM_PROMPT,
}
