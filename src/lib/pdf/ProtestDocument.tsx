import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { NAVY, GOLD, INK, GRAY, base, Letterhead, DocFooter } from './base'
import { type ProtestData } from './protest-data'

const lp = StyleSheet.create({
  title: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 20, color: NAVY, letterSpacing: 0.5 },
  no: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8, letterSpacing: 1, color: GOLD, marginTop: 2, textTransform: 'uppercase' },

  meta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 },
  toWrap: { maxWidth: '60%' },
  kicker: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 1.6, color: GOLD, textTransform: 'uppercase', marginBottom: 5 },
  toName: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 13, color: NAVY },
  toLine: { fontFamily: 'Inter', fontSize: 8.5, color: GRAY, marginTop: 2 },
  placeWrap: { alignItems: 'flex-end' },
  placeVal: { fontFamily: 'Inter', fontWeight: 700, fontSize: 9.5, color: NAVY },

  re: { fontFamily: 'Inter', fontSize: 9.5, color: INK, marginTop: 18 },
  reBold: { fontFamily: 'Inter', fontWeight: 700, color: NAVY },

  ship: { marginTop: 12, borderLeftWidth: 2, borderLeftColor: GOLD, paddingLeft: 10 },
  shipLine: { fontFamily: 'Inter', fontSize: 8.5, color: GRAY, marginTop: 1 },
  shipBold: { fontFamily: 'Inter', fontWeight: 700, fontSize: 9.5, color: NAVY },

  para: { fontFamily: 'Inter', fontSize: 9.5, color: INK, lineHeight: 1.7, marginTop: 14, textAlign: 'justify' },
  hold: { fontFamily: 'Inter', fontSize: 9.5, color: INK, lineHeight: 1.7, marginTop: 12 },
  holdName: { fontFamily: 'Inter', fontWeight: 700, color: NAVY },

  remarkCap: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 1.4, color: GOLD, textTransform: 'uppercase', marginTop: 16, marginBottom: 3 },
  remark: { fontFamily: 'Inter', fontSize: 8.5, color: GRAY, lineHeight: 1.5 },

  signRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 36 },
  signBox: { width: 210 },
  signCap: { fontFamily: 'Inter', fontSize: 8, color: GRAY },
  signLine: { borderBottomWidth: 1, borderBottomColor: '#334155', height: 34, marginTop: 6, marginBottom: 7 },
  signName: { fontFamily: 'Inter', fontWeight: 700, fontSize: 9.5, color: NAVY },
  signSub: { fontFamily: 'Inter', fontSize: 8, color: GRAY, marginTop: 1 },
})

export function ProtestDocument({ data }: { data: ProtestData }) {
  const t = data.tenant
  const footRef = `${data.docNumber} · ${data.vesselName} · ${data.port}`

  return (
    <Document title={data.docNumber} author={t.companyName}>
      <Page size="A4" style={base.page}>
        <Letterhead
          tenant={t}
          right={
            <>
              <Text style={lp.title}>LETTER OF PROTEST</Text>
              <Text style={lp.no}>No. {data.docNumber}</Text>
            </>
          }
        />

        <View style={lp.meta}>
          <View style={lp.toWrap}>
            <Text style={lp.kicker}>Kepada / To</Text>
            <Text style={lp.toName}>{data.toName}</Text>
            {data.toAttn ? <Text style={lp.toLine}>Attn: {data.toAttn}</Text> : null}
          </View>
          <View style={lp.placeWrap}>
            <Text style={lp.kicker}>Tempat &amp; Tanggal</Text>
            <Text style={lp.placeVal}>{data.place}</Text>
            <Text style={lp.placeVal}>{data.date}</Text>
          </View>
        </View>

        <Text style={lp.re}>
          <Text style={lp.reBold}>Re: </Text>
          {data.subject}
        </Text>

        <View style={lp.ship}>
          <Text style={lp.shipBold}>MV/MT {data.vesselName}</Text>
          <Text style={lp.shipLine}>
            IMO {data.imo}
            {data.flag ? ` · ${data.flag}` : ''} · Port: {data.port}
          </Text>
        </View>

        <Text style={lp.para}>{data.statement}</Text>

        <Text style={lp.hold}>
          We hereby tender this Letter of Protest and hold{' '}
          <Text style={lp.holdName}>{data.holdResponsible}</Text> responsible for all consequences,
          losses, and expenses arising therefrom.
        </Text>

        {data.remarks ? (
          <>
            <Text style={lp.remarkCap}>Without Prejudice</Text>
            <Text style={lp.remark}>{data.remarks}</Text>
          </>
        ) : null}

        <View style={lp.signRow}>
          <View style={lp.signBox}>
            <Text style={lp.signCap}>Tendered by — Master</Text>
            <View style={lp.signLine} />
            <Text style={lp.signName}>{data.masterName || 'Master'}</Text>
            <Text style={lp.signSub}>{data.vesselName}</Text>
          </View>
          <View style={lp.signBox}>
            <Text style={lp.signCap}>Received / Acknowledged</Text>
            <View style={lp.signLine} />
            <Text style={lp.signName}>{data.toName}</Text>
            <Text style={lp.signSub}>Date &amp; time of receipt: ____________</Text>
          </View>
        </View>

        <DocFooter left={footRef} issuedAt={data.date} />
      </Page>
    </Document>
  )
}
