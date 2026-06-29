// Pembentuk XML impor Faktur Pajak Keluaran untuk Coretax DJP.
//
// Struktur mengikuti PERSIS sampel resmi DJP "Sample Faktur PK Template v.1.4"
// (root <TaxInvoiceBulk> + xsi:noNamespaceSchemaLocation="TaxInvoice.xsd"),
// termasuk urutan elemen & ejaan resmi <BuyerAdress> (memang tanpa "d" kedua).
// Sejak 1 Jan 2025 Coretax hanya menerima impor XML (CSV/PDF tak didukung).
//
// CATATAN PENTING (wajib diperiksa di Coretax sebelum submit):
// - TrxCode default '04' (DPP Nilai Lain) — sesuaikan kode transaksi bila perlu.
// - BuyerCountry 'IDN' (ISO 3166 alpha-3) — sampel resmi menulis "IND"; verifikasi.
// - Unit 'UM.0001' & Code '000000' generik untuk baris jasa lump-sum (Qty 1).
// File ini hanya menyusun data invoice tersimpan ke kerangka XML resmi.

export type EfakturSeller = {
  npwp: string // NPWP penjual (tenant)
}

// Satu baris jasa pada faktur (mis. tiap baris invoice + baris agency fee).
export type EfakturGood = {
  name: string
  amount: number // DPP baris (= harga × qty)
}

export type EfakturInvoice = {
  docNumber: string
  invoiceDate: string // "22 Jun 2026" atau ISO
  buyerName: string
  buyerNpwp: string
  buyerAddress: string
  vatRate: number // tarif PPN (%) faktur, mis. 11
  goods: EfakturGood[] // diitemisasi per baris; PPN dihitung per baris oleh Coretax
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

/** "22 Jun 2026" → "2026-06-22"; ISO atau format lain dikembalikan apa adanya bila gagal. */
export function toIsoDate(s: string): string {
  const v = (s || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  const m = v.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/)
  if (m) {
    const mm = MONTHS[m[2].slice(0, 3).toLowerCase()]
    if (mm) return `${m[3]}-${mm}-${m[1].padStart(2, '0')}`
  }
  return v
}

/** Ambil digit saja & normalkan NPWP ke 16 digit (NPWP lama 15 digit → prefix '0'). */
export function npwp16(raw: string): string {
  const d = (raw || '').replace(/\D/g, '')
  if (!d) return ''
  if (d.length === 15) return '0' + d
  return d
}

const xmlEsc = (v: string | number) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

/** Susun XML <TaxInvoiceBulk> Coretax dari daftar invoice. */
export function buildCoretaxXml(seller: EfakturSeller, invoices: EfakturInvoice[]): string {
  const sellerTin = npwp16(seller.npwp)
  const sellerIdtku = sellerTin ? sellerTin + '000000' : ''

  const items = invoices
    .map((inv) => {
      const buyerTin = npwp16(inv.buyerNpwp)
      const buyerIdtku = buyerTin ? buyerTin + '000000' : ''
      const rate = Number.isFinite(inv.vatRate) && inv.vatRate > 0 ? Math.round(inv.vatRate) : 11
      const goods = (inv.goods?.length ? inv.goods : [{ name: 'Jasa keagenan kapal', amount: 0 }])
        .map((g) => {
          const base = Math.round(g.amount || 0)
          const vat = Math.round((base * rate) / 100)
          return `				<GoodService>
					<Opt>B</Opt>
					<Code>000000</Code>
					<Name>${xmlEsc(g.name || 'Jasa keagenan kapal')}</Name>
					<Unit>UM.0001</Unit>
					<Price>${base}</Price>
					<Qty>1</Qty>
					<TotalDiscount>0</TotalDiscount>
					<TaxBase>${base}</TaxBase>
					<OtherTaxBase>${base}</OtherTaxBase>
					<VATRate>${rate}</VATRate>
					<VAT>${vat}</VAT>
					<STLGRate>0</STLGRate>
					<STLG>0</STLG>
				</GoodService>`
        })
        .join('\n')
      return `		<TaxInvoice>
			<TaxInvoiceDate>${xmlEsc(toIsoDate(inv.invoiceDate))}</TaxInvoiceDate>
			<TaxInvoiceOpt>Normal</TaxInvoiceOpt>
			<TrxCode>04</TrxCode>
			<AddInfo/>
			<CustomDoc/>
			<CustomDocMonthYear/>
			<RefDesc>${xmlEsc(inv.docNumber)}</RefDesc>
			<FacilityStamp/>
			<SellerIDTKU>${xmlEsc(sellerIdtku)}</SellerIDTKU>
			<BuyerTin>${xmlEsc(buyerTin)}</BuyerTin>
			<BuyerDocument>TIN</BuyerDocument>
			<BuyerCountry>IDN</BuyerCountry>
			<BuyerDocumentNumber/>
			<BuyerName>${xmlEsc(inv.buyerName)}</BuyerName>
			<BuyerAdress>${xmlEsc(inv.buyerAddress)}</BuyerAdress>
			<BuyerEmail/>
			<BuyerIDTKU>${xmlEsc(buyerIdtku)}</BuyerIDTKU>
			<ListOfGoodService>
${goods}
			</ListOfGoodService>
		</TaxInvoice>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="utf-8" ?>
<TaxInvoiceBulk xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="TaxInvoice.xsd">
	<TIN>${xmlEsc(sellerTin)}</TIN>
	<ListOfTaxInvoice>
${items}
	</ListOfTaxInvoice>
</TaxInvoiceBulk>`
}
