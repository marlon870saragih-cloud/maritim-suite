import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { NAVY, GOLD, INK, GRAY, LINE, ROW, WHITE, fmt, base, Letterhead, DocFooter } from './base'
import { type ReceiptData, terbilangRupiah } from './receipt-data'

const rc = StyleSheet.create({
  title: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 24, color: NAVY, letterSpacing: 1 },
  no: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8, letterSpacing: 1, color: GOLD, marginTop: 2, textTransform: 'uppercase' },

  body: { marginTop: 22, borderWidth: 1, borderColor: LINE, borderRadius: 5, overflow: 'hidden' },
  row: { flexDirection: 'row', paddingVertical: 11, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: LINE },
  rowAlt: { backgroundColor: ROW },
  label: { width: 130, fontFamily: 'Inter', fontWeight: 700, fontSize: 8, color: GRAY, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { flex: 1, fontFamily: 'Inter', fontSize: 10, color: INK, lineHeight: 1.45 },
  terbilang: { flex: 1, fontFamily: 'Spectral', fontWeight: 600, fontSize: 11, color: NAVY, lineHeight: 1.4 },

  bottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 24 },
  amountBox: { backgroundColor: NAVY, borderRadius: 6, paddingVertical: 14, paddingHorizontal: 22 },
  amountCap: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 1.4, color: GOLD, textTransform: 'uppercase' },
  amountVal: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 22, color: WHITE, marginTop: 3 },

  sign: { alignItems: 'center', width: 220 },
  signPlace: { fontFamily: 'Inter', fontSize: 9, color: GRAY },
  signCap: { fontFamily: 'Inter', fontSize: 8, color: GRAY, marginTop: 2 },
  signLine: { borderBottomWidth: 1, borderBottomColor: '#334155', height: 34, width: 190, marginTop: 6, marginBottom: 7 },
  signName: { fontFamily: 'Inter', fontWeight: 700, fontSize: 10, color: NAVY },
  signRole: { fontFamily: 'Inter', fontSize: 8, color: GRAY, marginTop: 1 },

  materai: { marginTop: 20, fontFamily: 'Inter', fontSize: 7.6, color: GRAY },
})

function Row({ label, value, terbilang, alt }: { label: string; value?: string; terbilang?: string; alt?: boolean }) {
  return (
    <View style={[rc.row, alt ? rc.rowAlt : {}]}>
      <Text style={rc.label}>{label}</Text>
      <Text style={terbilang ? rc.terbilang : rc.value}>{terbilang ?? value}</Text>
    </View>
  )
}

export function ReceiptDocument({ data }: { data: ReceiptData }) {
  const t = data.tenant
  const footRef = `${data.docNumber}${data.refDoc ? ` · Ref ${data.refDoc}` : ''}`

  return (
    <Document title={data.docNumber} author={t.companyName}>
      <Page size="A4" style={base.page}>
        <Letterhead
          tenant={t}
          right={
            <>
              <Text style={rc.title}>KWITANSI</Text>
              <Text style={rc.no}>No. {data.docNumber}</Text>
            </>
          }
        />

        <View style={rc.body}>
          <Row label="Telah terima dari" value={data.receivedFrom} alt />
          <Row label="Uang sejumlah" terbilang={terbilangRupiah(data.amount)} />
          <Row label="Untuk pembayaran" value={data.forPayment} alt />
          {data.refDoc ? <Row label="Referensi" value={data.refDoc} /> : null}
        </View>

        <View style={rc.bottom}>
          <View style={rc.amountBox}>
            <Text style={rc.amountCap}>Jumlah</Text>
            <Text style={rc.amountVal}>
              {data.currency} {fmt(data.amount)}
            </Text>
          </View>

          <View style={rc.sign}>
            <Text style={rc.signPlace}>
              {data.place}, {data.receiptDate}
            </Text>
            <Text style={rc.signCap}>Penerima,</Text>
            <View style={rc.signLine} />
            <Text style={rc.signName}>{data.signName}</Text>
            <Text style={rc.signRole}>
              {data.signRole} · {t.companyName}
            </Text>
          </View>
        </View>

        <Text style={rc.materai}>
          Kwitansi ini sah sebagai tanda terima pembayaran. Untuk jumlah di atas Rp 5.000.000, bermaterai cukup pada lembar asli.
        </Text>

        <DocFooter left={footRef} issuedAt={data.receiptDate} />
      </Page>
    </Document>
  )
}
