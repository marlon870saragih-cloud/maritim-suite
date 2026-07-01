// Penomoran dokumen otomatis. Dipakai oleh Prisma extension (lib/prisma.ts) saat
// membuat MaritimeDocument: bila No. dokumen kosong / placeholder (tanpa angka),
// diisi otomatis berurutan per tenant + jenis + bulan → "PREFIX/YYYY/MM/NNNN".

// Prefix per jenis dokumen (mengikuti contoh masing-masing dokumen).
const PREFIX: Record<string, string> = {
  EPDA: 'EPDA', FPDA: 'FDA', INVOICE: 'INV', OFFICIAL_RECEIPT: 'KW',
  DEBIT_NOTE: 'DN', CREDIT_NOTE: 'CN', PURCHASE_REQUISITION: 'PR', PURCHASE_ORDER: 'PO',
  BDN: 'BDN', STATEMENT_OF_ACCOUNT: 'SOA', SPK: 'SPK',
  NOR: 'NOR', SOF: 'SOF', ARRIVAL_REPORT: 'AR', DEPARTURE_REPORT: 'DR',
  DAMAGE_REPORT: 'DMG', ULLAGE_REPORT: 'ULL', LETTER_OF_PROTEST: 'LOP', NOTE_OF_PROTEST: 'NOP',
  CREW_CHANGE_NOTICE: 'CCN', PORT_CALL_SUMMARY: 'PCS', LETTER_OF_INDEMNITY: 'LOI',
  TIME_SHEET: 'TS', BUNKER_REQUISITION: 'BRQ',
  FAL_5: 'CL', FAL_1: 'GD', FAL_3: 'SS', FAL_2: 'CD', AGENCY_APPOINTMENT: 'AA',
}

/** Perlu nomor otomatis bila kosong atau placeholder (tak mengandung satu angka pun). */
export function needsAutoNumber(docNumber: unknown): boolean {
  return !/\d/.test((docNumber ?? '').toString())
}

/** Jendela bulan berjalan (waktu lokal server) untuk menghitung urutan. */
export function monthWindow() {
  const now = new Date()
  const year = now.getFullYear()
  const monthIdx = now.getMonth()
  return {
    year,
    mm: String(monthIdx + 1).padStart(2, '0'),
    start: new Date(year, monthIdx, 1),
    end: new Date(year, monthIdx + 1, 1),
  }
}

/** Format final: PREFIX/YYYY/MM/NNNN. */
export function formatDocNumber(docType: string, year: number, mm: string, seq: number): string {
  const prefix = PREFIX[docType] ?? docType.replace(/_/g, '-')
  return `${prefix}/${year}/${mm}/${String(seq).padStart(4, '0')}`
}
