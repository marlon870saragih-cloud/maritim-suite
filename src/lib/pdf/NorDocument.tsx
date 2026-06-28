import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { NAVY, GOLD, INK, GRAY, LINE, ROW, WHITE, base, Letterhead, DocFooter } from './base'
import { type NorData } from './nor-data'

const nr = StyleSheet.create({
  title: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 20, color: NAVY, letterSpacing: 0.5 },
  no: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8, letterSpacing: 1, color: GOLD, marginTop: 2, textTransform: 'uppercase' },

  toWrap: { marginTop: 18 },
  kicker: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 1.6, color: GOLD, textTransform: 'uppercase', marginBottom: 5 },
  toName: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 13, color: NAVY },
  toLine: { fontFamily: 'Inter', fontSize: 8.5, color: GRAY, marginTop: 2 },

  para: { fontFamily: 'Inter', fontSize: 9.5, color: INK, lineHeight: 1.65, marginTop: 16 },
  bold: { fontFamily: 'Inter', fontWeight: 700, color: NAVY },

  grid: { marginTop: 16, borderWidth: 1, borderColor: LINE, borderRadius: 5, overflow: 'hidden' },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: LINE },
  cellK: { width: '32%', backgroundColor: ROW, paddingVertical: 6, paddingHorizontal: 11, fontFamily: 'Inter', fontWeight: 700, fontSize: 8, color: GRAY, textTransform: 'uppercase', letterSpacing: 0.4 },
  cellV: { flex: 1, paddingVertical: 6, paddingHorizontal: 11, fontFamily: 'Inter', fontWeight: 600, fontSize: 9.5, color: INK },

  remarkCap: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 1.4, color: GOLD, textTransform: 'uppercase', marginTop: 16, marginBottom: 3 },
  remark: { fontFamily: 'Inter', fontSize: 8.5, color: GRAY, lineHeight: 1.5 },

  signRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 34 },
  signBox: { width: 210 },
  signCap: { fontFamily: 'Inter', fontSize: 8, color: GRAY },
  signLine: { borderBottomWidth: 1, borderBottomColor: '#334155', height: 34, marginTop: 6, marginBottom: 7 },
  signName: { fontFamily: 'Inter', fontWeight: 700, fontSize: 9.5, color: NAVY },
  signSub: { fontFamily: 'Inter', fontSize: 8, color: GRAY, marginTop: 1 },
})

function KV({ k, v }: { k: string; v: string }) {
  return (
    <View style={nr.row}>
      <Text style={nr.cellK}>{k}</Text>
      <Text style={nr.cellV}>{v}</Text>
    </View>
  )
}

export function NorDocument({ data }: { data: NorData }) {
  const t = data.tenant
  const op = (data.operation || 'loading').toLowerCase()
  const footRef = `${data.docNumber} · ${data.vesselName} · ${data.port}`

  return (
    <Document title={data.docNumber} author={t.companyName}>
      <Page size="A4" style={base.page}>
        <Letterhead
          tenant={t}
          right={
            <>
              <Text style={nr.title}>NOTICE OF READINESS</Text>
              <Text style={nr.no}>No. {data.docNumber}</Text>
            </>
          }
        />

        <View style={nr.toWrap}>
          <Text style={nr.kicker}>Kepada / To</Text>
          <Text style={nr.toName}>{data.toName}</Text>
          {data.toAttn ? <Text style={nr.toLine}>Attn: {data.toAttn}</Text> : null}
        </View>

        <Text style={nr.para}>
          Dear Sirs, please be informed that <Text style={nr.bold}>MV/MT {data.vesselName}</Text> (IMO {data.imo}
          {data.flag ? `, ${data.flag}` : ''}) arrived at <Text style={nr.bold}>{data.port}</Text>
          {data.berth ? ` (${data.berth})` : ''} on <Text style={nr.bold}>{data.arrivedDate} at {data.arrivedTime}</Text>,
          and is in all respects ready to commence <Text style={nr.bold}>{op}</Text> of{' '}
          <Text style={nr.bold}>{data.cargo}</Text>. Notice of Readiness is hereby tendered.
        </Text>

        <View style={nr.grid}>
          <KV k="Vessel" v={data.vesselName} />
          <KV k="IMO / Flag" v={`${data.imo}${data.flag ? ' · ' + data.flag : ''}`} />
          <KV k="Port / Berth" v={`${data.port}${data.berth ? ' · ' + data.berth : ''}`} />
          <KV k="Operation" v={data.operation} />
          <KV k="Cargo" v={data.cargo} />
          <KV k="Arrived" v={`${data.arrivedDate} ${data.arrivedTime}`} />
          <View style={[nr.row, { borderBottomWidth: 0 }]}>
            <Text style={nr.cellK}>NOR Tendered</Text>
            <Text style={[nr.cellV, { fontWeight: 700, color: NAVY }]}>{data.noticeDate} {data.noticeTime}</Text>
          </View>
        </View>

        {data.remarks ? (
          <>
            <Text style={nr.remarkCap}>Remarks</Text>
            <Text style={nr.remark}>{data.remarks}</Text>
          </>
        ) : null}

        <View style={nr.signRow}>
          <View style={nr.signBox}>
            <Text style={nr.signCap}>Tendered by — Master / Agent</Text>
            <View style={nr.signLine} />
            <Text style={nr.signName}>{data.masterName || 'Master'}</Text>
            <Text style={nr.signSub}>{t.companyName}</Text>
          </View>
          <View style={nr.signBox}>
            <Text style={nr.signCap}>Received / Acknowledged</Text>
            <View style={nr.signLine} />
            <Text style={nr.signName}>{data.toName}</Text>
            <Text style={nr.signSub}>Date &amp; time of receipt: ____________</Text>
          </View>
        </View>

        <DocFooter left={footRef} issuedAt={data.noticeDate} />
      </Page>
    </Document>
  )
}
