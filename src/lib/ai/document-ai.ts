// Pintu universal: instruksi bahasa → (1) tentukan jenis dokumen, (2) isi field.
// Route-agnostic: setiap dokumen dikenali lewat DocType (DB enum); rute form & segmen
// API simpan diturunkan dari DOC_META, jadi finance (/finance/{seg}/baru) & maritim
// (/dokumen/new/{TYPE}) sama-sama didukung. Tambah dokumen = 1 entri CATALOG + 1 ekstraktor.

import { chatCompletion, firstToolCall, type ToolDef } from './openrouter'
import { DOC_META } from '@/lib/documents'
import { extractSpkDraft } from './spk-extract'
import { extractInvoiceDraft } from './invoice-extract'
import { extractEpdaDraft, extractFpdaDraft } from './disbursement-extract'
import { extractReceiptDraft } from './receipt-extract'
import { extractDebitDraft, extractCreditDraft } from './note-extract'
import { extractPrDraft, extractPoDraft } from './procurement-extract'
import { extractBdnDraft } from './bdn-extract'
import { extractSoaDraft } from './soa-extract'
import {
  extractNor, extractReport, extractAppointment, extractProtest, extractLoi,
  extractSof, extractCrewList, extractGenDec, extractShipStores, extractCargoDecl,
  extractNoteProtest, extractCrewChange, extractPcSummary, extractTimeSheet,
  extractBunkerReq, extractDamage, extractUllage,
} from './maritime-extract'

type Extractor = (instruction: string) => Promise<object>
type CatalogEntry = { docType: string; when: string; extract: Extractor }

// Hanya dokumen yang SUDAH punya ekstraktor. label/api/rute dari DOC_META[docType].
const CATALOG: CatalogEntry[] = [
  // ── Finance ──
  { docType: 'SPK', when: 'menunjuk sub-agen / handling agent untuk menangani kapal di pelabuhan', extract: extractSpkDraft },
  { docType: 'EPDA', when: 'estimasi/proforma biaya pelabuhan (sebelum kapal datang)', extract: extractEpdaDraft },
  { docType: 'FPDA', when: 'rincian biaya final pelabuhan (setelah kapal selesai)', extract: extractFpdaDraft },
  { docType: 'INVOICE', when: 'menagih / membuat tagihan jasa keagenan ke principal (kena PPN)', extract: extractInvoiceDraft },
  { docType: 'OFFICIAL_RECEIPT', when: 'tanda terima / bukti pembayaran sudah diterima', extract: extractReceiptDraft },
  { docType: 'DEBIT_NOTE', when: 'menambah tagihan di luar FDA / koreksi naik', extract: extractDebitDraft },
  { docType: 'CREDIT_NOTE', when: 'mengurangi / mengembalikan kelebihan tagihan', extract: extractCreditDraft },
  { docType: 'PURCHASE_REQUISITION', when: 'permintaan internal pengadaan barang/jasa kebutuhan kapal', extract: extractPrDraft },
  { docType: 'PURCHASE_ORDER', when: 'memesan barang ke supplier', extract: extractPoDraft },
  { docType: 'BDN', when: 'bukti serah bunker/bahan bakar ke kapal', extract: extractBdnDraft },
  { docType: 'STATEMENT_OF_ACCOUNT', when: 'rekap tagihan & saldo per principal langganan', extract: extractSoaDraft },
  // ── Maritime (operasional) ──
  { docType: 'NOR', when: 'memberitahu kapal siap muat/bongkar (Notice of Readiness)', extract: extractNor },
  { docType: 'ARRIVAL_REPORT', when: 'laporan kedatangan kapal di pelabuhan', extract: extractReport },
  { docType: 'DEPARTURE_REPORT', when: 'laporan keberangkatan kapal dari pelabuhan', extract: extractReport },
  { docType: 'AGENCY_APPOINTMENT', when: 'surat konfirmasi penunjukan agen oleh principal', extract: extractAppointment },
  { docType: 'LETTER_OF_PROTEST', when: 'surat protes (keterlambatan, kerusakan, klaim, dsb)', extract: extractProtest },
  { docType: 'LETTER_OF_INDEMNITY', when: 'surat jaminan/indemnity (mis. serah cargo tanpa B/L asli)', extract: extractLoi },
  { docType: 'SOF', when: 'kronologi kegiatan kapal di pelabuhan (Statement of Facts) untuk laytime', extract: extractSof },
  { docType: 'FAL_5', when: 'daftar awak kapal (Crew List / FAL 5)', extract: extractCrewList },
  { docType: 'FAL_1', when: 'deklarasi umum kedatangan/keberangkatan (General Declaration / FAL 1)', extract: extractGenDec },
  { docType: 'FAL_3', when: "deklarasi perbekalan kapal (Ship's Stores / FAL 3)", extract: extractShipStores },
  { docType: 'FAL_2', when: 'deklarasi muatan (Cargo Declaration / FAL 2)', extract: extractCargoDecl },
  { docType: 'NOTE_OF_PROTEST', when: 'protes laut nakhoda atas cuaca buruk/peril of the sea (Sea Protest)', extract: extractNoteProtest },
  { docType: 'CREW_CHANGE_NOTICE', when: 'pemberitahuan pergantian awak (sign on/off) ke Imigrasi/Syahbandar', extract: extractCrewChange },
  { docType: 'PORT_CALL_SUMMARY', when: 'rekap satu port call (partikular, dokumen, ringkasan)', extract: extractPcSummary },
  { docType: 'TIME_SHEET', when: 'perhitungan laytime / demurrage-despatch (Time Sheet)', extract: extractTimeSheet },
  { docType: 'BUNKER_REQUISITION', when: 'permintaan pengisian bunker ke pemasok', extract: extractBunkerReq },
  { docType: 'DAMAGE_REPORT', when: 'laporan temuan kerusakan/survei', extract: extractDamage },
  { docType: 'ULLAGE_REPORT', when: 'laporan pengukuran ullage/volume tangki kargo cair', extract: extractUllage },
]

const CLASSIFY_TOOL: ToolDef = {
  type: 'function',
  function: {
    name: 'pilih_dokumen',
    description: 'Pilih satu jenis dokumen keagenan kapal yang paling sesuai kebutuhan pengguna.',
    parameters: {
      type: 'object',
      properties: { docType: { type: 'string', enum: CATALOG.map((c) => c.docType), description: 'Kode jenis dokumen' } },
      required: ['docType'],
    },
  },
}

const CLARIFY_TOOL: ToolDef = {
  type: 'function',
  function: {
    name: 'minta_klarifikasi',
    description: 'Pakai HANYA bila benar-benar tidak jelas jenis dokumen yang dimaksud pengguna. Ajukan satu pertanyaan singkat.',
    parameters: {
      type: 'object',
      properties: { question: { type: 'string', description: 'Pertanyaan klarifikasi singkat dalam Bahasa Indonesia' } },
      required: ['question'],
    },
  },
}

type Classification = { docType: string } | { clarify: string } | null

/** Tentukan jenis dokumen, atau ajukan pertanyaan bila ambigu. */
export async function classifyDocument(instruction: string): Promise<Classification> {
  const list = CATALOG.map((c) => `- ${c.docType}: ${DOC_META[c.docType]?.label ?? c.docType} → untuk ${c.when}`).join('\n')
  const resp = await chatCompletion({
    messages: [
      {
        role: 'system',
        content:
          `Tentukan satu jenis dokumen keagenan kapal yang dibutuhkan pengguna dari daftar berikut:\n${list}\n` +
          `Jika jelas, panggil pilih_dokumen dengan kode yang paling sesuai. ` +
          `Jika tidak jelas, panggil minta_klarifikasi dengan satu pertanyaan singkat. Jangan menebak bila ambigu.`,
      },
      { role: 'user', content: instruction },
    ],
    tools: [CLASSIFY_TOOL, CLARIFY_TOOL],
    toolChoice: 'required',
  })
  const call = firstToolCall(resp)
  if (!call) return null
  const parsed = JSON.parse(call.arguments) as { docType?: string; question?: string }
  if (call.name === 'minta_klarifikasi' && parsed.question) return { clarify: parsed.question.trim() }
  if (parsed.docType && CATALOG.some((c) => c.docType === parsed.docType)) return { docType: parsed.docType }
  return null
}

export type DraftResult =
  | { kind: 'doc'; docType: string; api: string; editHref: string; label: string; draft: object }
  | { kind: 'clarify'; question: string }

/** Klasifikasi + isi field, atau kembalikan pertanyaan klarifikasi. null bila gagal total. */
export async function draftDocument(instruction: string): Promise<DraftResult | null> {
  const c = await classifyDocument(instruction)
  if (!c) return null
  if ('clarify' in c) return { kind: 'clarify', question: c.clarify }
  const entry = CATALOG.find((e) => e.docType === c.docType)
  const meta = DOC_META[c.docType]
  if (!entry || !meta) return null
  const draft = await entry.extract(instruction)
  return { kind: 'doc', docType: c.docType, api: meta.api, editHref: meta.edit, label: meta.label, draft }
}
