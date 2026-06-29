import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { NAVY, GOLD, INK, GRAY, LINE, ROW, WHITE, base, Letterhead, DocFooter } from './base'
import { bunkerLineAmount, bunkerTotal, bunkerTotalMt, type BunkerReqData } from './bunkerreq-data'

const fmt = (n: number) => (n || 0).toLocaleString('en-US')

const br = StyleSheet.create({
  title: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 18, color: NAVY, letterSpacing: 0.5 },
  sub: { fontFamily: 'Inter', fontSize: 6.5, letterSpacing: 1, color: GRAY, marginTop: 1, textTransform: 'uppercase' },
  no: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8, letterSpacing: 1, color: GOLD, marginTop: 2, textTransform: 'uppercase' },

  toWrap: { marginTop: 16 },
  kicker: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 1.6, color: GOLD, textTransform: 'uppercase', marginBottom: 5 },
  toName: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 13, color: NAVY },
  toLine: { fontFamily: 'Inter', fontSize: 8.5, color: GRAY, marginTop: 2 },

  partGrid: { marginTop: 14, borderWidth: 1, borderColor: LINE, borderRadius: 5, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap' },
  pCell: { width: '50%', flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: LINE },
  pK: { width: '36%', backgroundColor: ROW, paddingVertical: 5, paddingHorizontal: 10, fontFamily: 'Inter', fontWeight: 700, fontSize: 7.5, color: GRAY, textTransform: 'uppercase' },
  pV: { flex: 1, paddingVertical: 5, paddingHorizontal: 10, fontFamily: 'Inter', fontWeight: 600, fontSize: 8.8, color: INK },

  intro: { fontFamily: 'Inter', fontSize: 9, color: INK, lineHeight: 1.6, marginTop: 14 },

  thead: { flexDirection: 'row', backgroundColor: NAVY, paddingVertical: 6, paddingHorizontal: 8, marginTop: 12, borderRadius: 2 },
  th: { fontFamily: 'Inter', fontWeight: 700, fontSize: 6.8, letterSpacing: 0.5, color: WHITE, textTransform: 'uppercase' },
  row: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: LINE },
  rowAlt: { backgroundColor: ROW },
  cNo: { width: 20 },
  cGrade: { flex: 1 },
  cQty: { width: 70, textAlign: 'right' },
  cSul: { width: 56, textAlign: 'right' },
  cPrice: { width: 78, textAlign: 'right' },
  cAmt: { width: 86, textAlign: 'right' },
  tNo: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8, color: GOLD },
  tGrade: { fontFamily: 'Inter', fontWeight: 600, fontSize: 8.5, color: INK },
  tCell: { fontFamily: 'Inter', fontSize: 8.3, color: INK },
  tCellG: { fontFamily: 'Inter', fontSize: 8.3, color: GRAY },

  totalRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 },
  totalBox: { width: 260, borderTopWidth: 2, borderTopColor: NAVY, paddingTop: 7 },
  totLine: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  totK: { fontFamily: 'Inter', fontSize: 8.5, color: GRAY },
  totV: { fontFamily: 'Inter', fontWeight: 600, fontSize: 8.5, color: INK },
  grandK: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 10.5, color: NAVY },
  grandV: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 10.5, color: NAVY },

  termCap: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 1.4, color: GOLD, textTransform: 'uppercase', marginTop: 14, marginBottom: 3 },
  term: { fontFamily: 'Inter', fontSize: 8.5, color: GRAY, lineHeight: 1.5 },

  signWrap: { marginTop: 22, alignItems: 'flex-end' },
  signCap: { fontFamily: 'Inter', fontSize: 8, color: GRAY },
  signLine: { borderBottomWidth: 1, borderBottomColor: '#334155', height: 30, width: 200, marginTop: 6, marginBottom: 7 },
  signName: { fontFamily: 'Inter', fontWeight: 700, fontSize: 9.5, color: NAVY },
  signSub: { fontFamily: 'Inter', fontSize: 8, color: GRAY, marginTop: 1 },
})

function PCell({ k, v }: { k: string; v: string }) {
  return (
    <View style={br.pCell}>
      <Text style={br.pK}>{k}</Text>
      <Text style={br.pV}>{v || '—'}</Text>
    </View>
  )
}

export function BunkerReqDocument({ data }: { data: BunkerReqData }) {
  const t = data.tenant
  const total = bunkerTotal(data)
  const totalMt = bunkerTotalMt(data)
  const hasPrice = total > 0
  const footRef = `${data.docNumber} · ${data.vesselName} · ${data.port}`

  return (
    <Document title={data.docNumber} author={t.companyName}>
      <Page size="A4" style={base.page}>
        <Letterhead
          tenant={t}
          right={
            <>
              <Text style={br.title}>BUNKER REQUISITION</Text>
              <Text style={br.sub}>Permintaan Bunker</Text>
              <Text style={br.no}>No. {data.docNumber}</Text>
            </>
          }
        />

        <View style={br.toWrap}>
          <Text style={br.kicker}>Kepada / Supplier</Text>
          <Text style={br.toName}>{data.supplierName}</Text>
          {data.supplierAttn ? <Text style={br.toLine}>Attn: {data.supplierAttn}</Text> : null}
        </View>

        <View style={br.partGrid}>
          <PCell k="Vessel" v={data.vesselName} />
          <PCell k="IMO / Flag" v={`${data.imo}${data.flag ? ' · ' + data.flag : ''}`} />
          <PCell k="Port" v={data.port} />
          <PCell k="Delivery (ETA)" v={data.deliveryDate} />
          <PCell k="Delivery Mode" v={data.deliveryMode} />
          <PCell k="Delivery Point" v={data.deliveryPoint} />
        </View>

        <Text style={br.intro}>
          Dengan hormat, kami mengajukan permintaan bunker berikut untuk MV/MT {data.vesselName} di {data.port}.
          Mohon konfirmasi ketersediaan, harga, dan jadwal.
        </Text>

        <View style={br.thead}>
          <Text style={[br.th, br.cNo]}>#</Text>
          <Text style={[br.th, br.cGrade]}>Grade / Spec</Text>
          <Text style={[br.th, br.cQty]}>Qty (MT)</Text>
          <Text style={[br.th, br.cSul]}>Sulphur</Text>
          {hasPrice ? <Text style={[br.th, br.cPrice]}>Harga/MT</Text> : null}
          {hasPrice ? <Text style={[br.th, br.cAmt]}>Jumlah</Text> : null}
        </View>
        {data.lines.map((l, i) => (
          <View key={i} style={[br.row, i % 2 ? br.rowAlt : {}, i === data.lines.length - 1 ? { borderBottomWidth: 0 } : {}]} wrap={false}>
            <Text style={[br.tNo, br.cNo]}>{i + 1}</Text>
            <Text style={[br.tGrade, br.cGrade]}>{l.grade}</Text>
            <Text style={[br.tCell, br.cQty, { fontWeight: 700, color: NAVY }]}>{fmt(l.quantityMt)}</Text>
            <Text style={[br.tCellG, br.cSul]}>{l.sulphurPct}%</Text>
            {hasPrice ? <Text style={[br.tCellG, br.cPrice]}>{fmt(l.unitPrice)}</Text> : null}
            {hasPrice ? <Text style={[br.tCell, br.cAmt]}>{fmt(bunkerLineAmount(l))}</Text> : null}
          </View>
        ))}

        <View style={br.totalRow}>
          <View style={br.totalBox}>
            <View style={br.totLine}>
              <Text style={br.totK}>Total Quantity</Text>
              <Text style={br.totV}>{fmt(totalMt)} MT</Text>
            </View>
            {hasPrice ? (
              <View style={br.totLine}>
                <Text style={br.grandK}>Estimasi Nilai</Text>
                <Text style={br.grandV}>{data.currency} {fmt(total)}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {data.terms ? (
          <>
            <Text style={br.termCap}>Syarat &amp; Permintaan</Text>
            <Text style={br.term}>{data.terms}</Text>
          </>
        ) : null}
        {data.remarks ? <Text style={[br.term, { marginTop: 4 }]}>{data.remarks}</Text> : null}

        <View style={br.signWrap}>
          <Text style={br.signCap}>Diminta oleh — {data.requestedBy}</Text>
          <View style={br.signLine} />
          <Text style={br.signName}>{t.companyName}</Text>
          <Text style={br.signSub}>As agents for and on behalf of the Owners · {data.date}</Text>
        </View>

        <DocFooter left={footRef} issuedAt={data.date} />
      </Page>
    </Document>
  )
}
