import { SAMPLE_EPDA, type EpdaTenant } from './epda-data'

export type LoiData = {
  tenant: EpdaTenant
  docNumber: string
  date: string // "01 Jul 2026"
  place: string
  // Pihak
  fromName: string // pemberi jaminan (mis. charterer/shipper/principal)
  toName: string // penerima jaminan (mis. Owners / Master)
  toAttn?: string
  // Perihal & partikular
  subject: string
  vesselName: string
  imo: string
  flag?: string
  voyageNo?: string
  port: string
  cargo: string
  cargoQty?: string
  blNumber?: string // No. Bill of Lading
  // Isi jaminan
  undertaking: string // paragraf jaminan (multiline)
  amount?: string // nilai/batas jaminan (opsional)
  validity?: string // masa berlaku (opsional)
  // Penanda tangan
  signatoryName: string
  signatoryTitle: string
}

// ====== DATA CONTOH (wording umum LOI serah-terima tanpa B/L asli) ======
export const SAMPLE_LOI: LoiData = {
  tenant: SAMPLE_EPDA.tenant,
  docNumber: 'LOI/2026/06/0091',
  date: '01 Jul 2026',
  place: 'Samarinda',
  fromName: 'PT Soechi Lines Tbk',
  toName: 'Owners of MT Soechi Asia',
  toAttn: 'The Master',
  subject: 'Delivery of cargo without production of original Bill(s) of Lading',
  vesselName: 'MT Soechi Asia',
  imo: '9456231',
  flag: 'Indonesia',
  voyageNo: 'V.118',
  port: 'Samarinda',
  cargo: 'MGO',
  cargoQty: '6,000 KL',
  blNumber: 'SLI/SMD/2026/118',
  undertaking:
    'In consideration of your complying with our above request, we hereby agree as follows: ' +
    '(1) To indemnify you, your servants and agents and to hold all of you harmless in respect of any liability, ' +
    'loss, damage or expense of whatsoever nature which you may sustain by reason of delivering the cargo in ' +
    'accordance with our request. (2) In the event of any proceedings being commenced against you in connection ' +
    'with the delivery of the cargo as aforesaid, to provide you on demand with sufficient funds to defend the same. ' +
    '(3) If the vessel or any other vessel or property belonging to you should be arrested or detained, to provide ' +
    'such bail or security as may be required and to indemnify you in respect thereof.',
  amount: '100% of the cargo value (open)',
  validity: '6 (six) months from the date of issue',
  signatoryName: 'Authorized Signatory',
  signatoryTitle: 'For and on behalf of PT Soechi Lines Tbk',
}
