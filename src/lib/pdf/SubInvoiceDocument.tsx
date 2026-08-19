// Kuitansi langganan (K164, Fase 8e) — dokumen PDF TERPISAH dari InvoiceDocument
// (tagihan keagenan tenant kepada pelanggannya, §1.3). Kop dokumen ini memakai
// identitas PENJUAL (Maritime Suite / `IDENTITAS_PENJUAL`), BUKAN
// `Tenant.logoUrl` milik pembeli — satu-satunya dokumen di seluruh aplikasi
// yang begitu, dan itu disengaja: tenant tidak menerbitkan kuitansi ber-merek
// dirinya sendiri untuk uang yang ia BAYARKAN ke pihak lain.

import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { NAVY, GOLD, INK, GRAY, GRAYL, LINE, ROW, WHITE, fmt, base, Letterhead, DocFooter } from './base'
import type { SubInvoiceData } from './sub-invoice-data'

const si = StyleSheet.create({
  title: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 24, color: NAVY, letterSpacing: 1 },
  no: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8, letterSpacing: 1, color: GOLD, marginTop: 2, textTransform: 'uppercase' },

  topRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, gap: 24 },
  kicker: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 1.6, color: GOLD, textTransform: 'uppercase', marginBottom: 6 },
  billName: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 13, color: NAVY },
  billLine: { fontFamily: 'Inter', fontSize: 8, color: GRAY, marginTop: 3, lineHeight: 1.45 },

  metaBox: { width: 230, borderWidth: 1, borderColor: LINE, borderRadius: 4, overflow: 'hidden' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, paddingHorizontal: 11 },
  metaLabel: { fontFamily: 'Inter', fontSize: 7.5, color: GRAY },
  metaVal: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8.5, color: NAVY },

  thead: { flexDirection: 'row', backgroundColor: NAVY, paddingVertical: 6, paddingHorizontal: 11, marginTop: 18, borderRadius: 2 },
  th: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 0.8, color: WHITE, textTransform: 'uppercase' },
  thDesc: { flex: 1 },
  thAmt: { width: 110, textAlign: 'right' },

  row: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 11, borderBottomWidth: 1, borderBottomColor: LINE },
  cDesc: { flex: 1, fontFamily: 'Inter', fontSize: 9.5, color: INK },
  cAmt: { width: 110, textAlign: 'right', fontFamily: 'Inter', fontWeight: 600, fontSize: 9, color: NAVY },

  bottom: { flexDirection: 'row', marginTop: 18, gap: 24 },
  left: { flex: 1 },
  para: { fontFamily: 'Inter', fontSize: 7.6, color: GRAYL, lineHeight: 1.5 },

  right: { width: 230 },
  totBox: { borderWidth: 1, borderColor: LINE, borderRadius: 5, overflow: 'hidden' },
  totLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 13, borderBottomWidth: 1, borderBottomColor: LINE },
  totLabel: { fontFamily: 'Inter', fontSize: 9, color: GRAY },
  totVal: { fontFamily: 'Inter', fontWeight: 700, fontSize: 9.5, color: NAVY },
  grand: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: NAVY, paddingVertical: 10, paddingHorizontal: 13 },
  grandLabel: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 12, color: WHITE },
  grandVal: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 15, color: WHITE },

  thanks: { textAlign: 'center', fontFamily: 'Spectral', fontSize: 9.5, color: GRAY, marginTop: 22 },
})

function MetaRow({ label, value, alt }: { label: string; value: string; alt?: boolean }) {
  return (
    <View style={[si.metaRow, alt ? { backgroundColor: ROW } : {}]}>
      <Text style={si.metaLabel}>{label}</Text>
      <Text style={si.metaVal}>{value}</Text>
    </View>
  )
}

export function SubInvoiceDocument({ data }: { data: SubInvoiceData }) {
  return (
    <Document title={data.docNumber} author={data.seller.companyName}>
      <Page size="A4" style={base.page}>
        <Letterhead
          tenant={data.seller}
          right={
            <>
              <Text style={si.title}>KUITANSI LANGGANAN</Text>
              <Text style={si.no}>No. {data.docNumber}</Text>
            </>
          }
        />

        <View style={si.topRow}>
          <View style={{ flex: 1, maxWidth: 280 }}>
            <Text style={si.kicker}>Ditagihkan kepada</Text>
            <Text style={si.billName}>{data.billToName}</Text>
            {data.billToAddress ? <Text style={si.billLine}>{data.billToAddress}</Text> : null}
          </View>
          <View style={si.metaBox}>
            <MetaRow label="Tanggal terbit" value={data.issuedDate} alt />
            <MetaRow label="Tanggal lunas" value={data.paidDate} />
            <MetaRow label="Metode bayar" value={data.paymentMethod} alt />
            {data.gatewayRef ? <MetaRow label="Ref. gerbang" value={data.gatewayRef} /> : null}
          </View>
        </View>

        <View style={si.thead}>
          <Text style={[si.th, si.thDesc]}>Keterangan</Text>
          <Text style={[si.th, si.thAmt]}>Jumlah ({data.currency})</Text>
        </View>
        {data.items.map((l, i) => (
          <View key={i} style={si.row}>
            <Text style={si.cDesc}>{l.description}</Text>
            <Text style={si.cAmt}>{fmt(l.amount)}</Text>
          </View>
        ))}

        <View style={si.bottom}>
          <View style={si.left}>
            <Text style={si.para}>
              Kuitansi ini adalah bukti pembayaran langganan Maritime Suite — bukan tagihan keagenan.
              {data.taxAmount === 0
                ? ' Dokumen ini tidak memuat komponen pajak; perlakuan PPN atas langganan menyusul kebijakan yang berlaku.'
                : ''}
            </Text>
          </View>

          <View style={si.right}>
            <View style={si.totBox}>
              <View style={si.totLine}>
                <Text style={si.totLabel}>Subtotal</Text>
                <Text style={si.totVal}>
                  {data.currency} {fmt(data.subtotal)}
                </Text>
              </View>
              {data.taxAmount > 0 ? (
                <View style={si.totLine}>
                  <Text style={si.totLabel}>PPN</Text>
                  <Text style={si.totVal}>
                    {data.currency} {fmt(data.taxAmount)}
                  </Text>
                </View>
              ) : null}
              <View style={si.grand}>
                <Text style={si.grandLabel}>Total Dibayar</Text>
                <Text style={si.grandVal}>
                  {data.currency} {fmt(data.grandTotal)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <Text style={si.thanks}>Terima kasih telah berlangganan Maritime Suite.</Text>

        <DocFooter left={data.docNumber} issuedAt={data.issuedDate} />
      </Page>
    </Document>
  )
}
