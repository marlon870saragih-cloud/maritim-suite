import { SAMPLE_EPDA, type EpdaTenant } from './epda-data'

// Bill of Lading berbasis BIMCO CONGENBILL 2022 (short-form, "to be used with
// charter parties"). Struktur/kolom = standar industri; teks klausul ditulis
// generik (bukan salinan teks berhak-cipta BIMCO), freight mengacu charter-party.
export type BlData = {
  tenant: EpdaTenant
  docNumber: string // B/L No.
  reference?: string // referensi/shipper's ref

  // Para pihak (alamat multiline)
  shipper: string
  consignee: string // "TO ORDER" → negotiable
  notifyParty: string

  // Carrier & kapal
  carrier: string // pengangkut / owner (BL ditandatangani atas namanya)
  vesselName: string
  voyageNo: string
  flag?: string

  // Pelabuhan
  portOfLoading: string
  portOfDischarge: string
  placeOfReceipt?: string
  placeOfDelivery?: string

  // Kargo (particulars furnished by shipper)
  marksNumbers: string
  packages: string // jumlah & jenis kemasan, mis. "In Bulk"
  description: string // uraian barang
  grossWeight: string // mis. "5,000.000 MT"
  measurement?: string // volume m³ (opsional)

  // Freight & ketentuan
  charterPartyDate: string // "as per Charter-Party dated ___"
  freightTerms: string // "Freight prepaid" / "Freight collect" / dsb.
  shippedOnBoardDate: string // tanggal shipped on board

  // Set copy: jumlah original (negotiable) + jumlah copy (non-negotiable)
  originalCount: string // mis. "3"
  copyCount: string // mis. "1"

  // Penerbitan & tanda tangan
  placeOfIssue: string
  dateOfIssue: string
  signedFor: string // mis. "As Agents for and on behalf of the Carrier"
  signatoryName: string
}

// ====== DATA CONTOH (kargo curah — batu bara) ======
export const SAMPLE_BL: BlData = {
  tenant: SAMPLE_EPDA.tenant,
  docNumber: 'BL/2026/07/0001',
  reference: 'SMD-COAL-118',
  shipper:
    'PT Bara Samarinda Energi\nJl. Yos Sudarso No. 12, Samarinda 75112\nKalimantan Timur, Indonesia',
  consignee: 'TO ORDER',
  notifyParty:
    'PT Nusantara Power Trading\nGraha Energi Lt. 8, Jl. Gatot Subroto Kav. 21\nJakarta 12930, Indonesia',
  carrier: 'PT Soechi Lines Tbk',
  vesselName: 'MT Soechi Asia',
  voyageNo: 'V.118',
  flag: 'Indonesia',
  portOfLoading: 'Samarinda, Indonesia',
  portOfDischarge: 'Surabaya, Indonesia',
  placeOfReceipt: '',
  placeOfDelivery: '',
  marksNumbers: 'N/M\n(No Marks — in Bulk)',
  packages: 'In Bulk',
  description: 'Steam Coal in Bulk\nGCV 4,200 GAR — origin East Kalimantan',
  grossWeight: '5,000.000 MT',
  measurement: '',
  charterPartyDate: '25 Jun 2026',
  freightTerms: 'Freight payable as per Charter-Party',
  shippedOnBoardDate: '02 Jul 2026',
  originalCount: '3',
  copyCount: '1',
  placeOfIssue: 'Samarinda',
  dateOfIssue: '02 Jul 2026',
  signedFor: 'As Agents for and on behalf of the Carrier',
  signatoryName: 'Marlon Saragih',
}

// Klausul atestasi standar (generik) — bukan teks berhak-cipta BIMCO.
export const BL_SHIPPED_CLAUSE =
  'SHIPPED at the Port of Loading in apparent good order and condition on board the Vessel for carriage to the ' +
  'Port of Discharge or so near thereto as she may safely get, the goods specified above. Weight, measure, quantity, ' +
  'quality, condition, contents and value unknown. Freight and all conditions, exceptions, liberties and exemptions ' +
  '(including the Law & Arbitration Clause) as per the Charter-Party referred to below are herewith incorporated. ' +
  'IN WITNESS whereof the Master or Agent of the said Vessel has signed the number of Bills of Lading stated below, ' +
  'all of this tenor and date, any one of which being accomplished the others to stand void.'

// Bangun daftar halaman set BL (negotiable original + non-negotiable copy).
export type BlCopy = { negotiable: boolean; label: string; index: number; ofOriginals: number }
export function buildBlCopies(originalCount: string, copyCount: string): BlCopy[] {
  const orig = Math.min(9, Math.max(1, parseInt(originalCount, 10) || 1))
  const copies = Math.min(9, Math.max(0, parseInt(copyCount, 10) || 0))
  const out: BlCopy[] = []
  for (let i = 1; i <= orig; i++) out.push({ negotiable: true, label: 'ORIGINAL', index: i, ofOriginals: orig })
  for (let i = 1; i <= copies; i++) out.push({ negotiable: false, label: 'COPY', index: i, ofOriginals: orig })
  return out
}
