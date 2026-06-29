import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { NAVY, GOLD, INK, GRAY, LINE, ROW, base, Letterhead, DocFooter } from './base'
import { type LoiData } from './loi-data'

const li = StyleSheet.create({
  title: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 18, color: NAVY, letterSpacing: 0.5 },
  no: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8, letterSpacing: 1, color: GOLD, marginTop: 2, textTransform: 'uppercase' },

  meta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  toWrap: { maxWidth: '62%' },
  kicker: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 1.6, color: GOLD, textTransform: 'uppercase', marginBottom: 5 },
  toName: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 12, color: NAVY },
  toLine: { fontFamily: 'Inter', fontSize: 8.5, color: GRAY, marginTop: 2 },
  placeWrap: { alignItems: 'flex-end' },
  placeVal: { fontFamily: 'Inter', fontWeight: 700, fontSize: 9.5, color: NAVY },

  re: { fontFamily: 'Inter', fontSize: 9.5, color: INK, marginTop: 16 },
  reBold: { fontFamily: 'Inter', fontWeight: 700, color: NAVY },

  grid: { marginTop: 12, borderWidth: 1, borderColor: LINE, borderRadius: 5, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '50%', flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: LINE },
  k: { width: '34%', backgroundColor: ROW, paddingVertical: 5, paddingHorizontal: 10, fontFamily: 'Inter', fontWeight: 700, fontSize: 7.5, color: GRAY, textTransform: 'uppercase' },
  v: { flex: 1, paddingVertical: 5, paddingHorizontal: 10, fontFamily: 'Inter', fontWeight: 600, fontSize: 8.8, color: INK },

  open: { fontFamily: 'Inter', fontSize: 9.5, color: INK, lineHeight: 1.7, marginTop: 14, textAlign: 'justify' },
  body: { fontFamily: 'Inter', fontSize: 9.5, color: INK, lineHeight: 1.75, marginTop: 10, textAlign: 'justify' },

  termRow: { flexDirection: 'row', marginTop: 10 },
  termBox: { flex: 1 },
  termCap: { fontFamily: 'Inter', fontWeight: 700, fontSize: 6.8, letterSpacing: 0.6, color: GRAY, textTransform: 'uppercase' },
  termVal: { fontFamily: 'Inter', fontWeight: 600, fontSize: 9, color: NAVY, marginTop: 2 },

  signRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 32 },
  signBox: { width: 220 },
  signCap: { fontFamily: 'Inter', fontSize: 8, color: GRAY },
  signLine: { borderBottomWidth: 1, borderBottomColor: '#334155', height: 34, marginTop: 6, marginBottom: 7 },
  signName: { fontFamily: 'Inter', fontWeight: 700, fontSize: 9.5, color: NAVY },
  signSub: { fontFamily: 'Inter', fontSize: 8, color: GRAY, marginTop: 1 },
})

function KV({ k, v }: { k: string; v: string }) {
  return (
    <View style={li.cell}>
      <Text style={li.k}>{k}</Text>
      <Text style={li.v}>{v || '—'}</Text>
    </View>
  )
}

export function LoiDocument({ data }: { data: LoiData }) {
  const t = data.tenant
  const footRef = `${data.docNumber} · ${data.vesselName} · ${data.port}`

  return (
    <Document title={data.docNumber} author={t.companyName}>
      <Page size="A4" style={base.page}>
        <Letterhead
          tenant={t}
          right={
            <>
              <Text style={li.title}>LETTER OF INDEMNITY</Text>
              <Text style={li.no}>No. {data.docNumber}</Text>
            </>
          }
        />

        <View style={li.meta}>
          <View style={li.toWrap}>
            <Text style={li.kicker}>Kepada / To</Text>
            <Text style={li.toName}>{data.toName}</Text>
            {data.toAttn ? <Text style={li.toLine}>Attn: {data.toAttn}</Text> : null}
          </View>
          <View style={li.placeWrap}>
            <Text style={li.kicker}>Tempat &amp; Tanggal</Text>
            <Text style={li.placeVal}>{data.place}</Text>
            <Text style={li.placeVal}>{data.date}</Text>
          </View>
        </View>

        <Text style={li.re}>
          <Text style={li.reBold}>Re: </Text>
          {data.subject}
        </Text>

        <View style={li.grid}>
          <KV k="Vessel" v={data.vesselName} />
          <KV k="IMO / Flag" v={`${data.imo}${data.flag ? ' · ' + data.flag : ''}`} />
          <KV k="Voyage / Port" v={`${data.voyageNo ? data.voyageNo + ' · ' : ''}${data.port}`} />
          <KV k="B/L No." v={data.blNumber || '—'} />
          <KV k="Cargo" v={`${data.cargo}${data.cargoQty ? ' · ' + data.cargoQty : ''}`} />
          <KV k="From / Pemberi" v={data.fromName} />
        </View>

        <Text style={li.open}>
          We, <Text style={li.reBold}>{data.fromName}</Text>, hereby request you to deliver the cargo specified above
          in connection with the matter referred to in the subject of this letter.
        </Text>

        <Text style={li.body}>{data.undertaking}</Text>

        <View style={li.termRow}>
          <View style={li.termBox}>
            <Text style={li.termCap}>Nilai / Batas Jaminan</Text>
            <Text style={li.termVal}>{data.amount || '—'}</Text>
          </View>
          <View style={li.termBox}>
            <Text style={li.termCap}>Masa Berlaku</Text>
            <Text style={li.termVal}>{data.validity || '—'}</Text>
          </View>
        </View>

        <View style={li.signRow}>
          <View style={li.signBox}>
            <Text style={li.signCap}>Yours faithfully — {data.signatoryTitle}</Text>
            <View style={li.signLine} />
            <Text style={li.signName}>{data.signatoryName}</Text>
            <Text style={li.signSub}>{data.fromName}</Text>
          </View>
          <View style={li.signBox}>
            <Text style={li.signCap}>Diketahui / Witnessed — {t.companyName}</Text>
            <View style={li.signLine} />
            <Text style={li.signName}>As Port Agent</Text>
            <Text style={li.signSub}>{data.place}, {data.date}</Text>
          </View>
        </View>

        <DocFooter left={footRef} issuedAt={data.date} />
      </Page>
    </Document>
  )
}
