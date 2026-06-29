import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { NAVY, GOLD, INK, GRAY, LINE, ROW, base, Letterhead, DocFooter } from './base'
import { type NoteProtestData } from './noteprotest-data'

const np = StyleSheet.create({
  title: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 18, color: NAVY, letterSpacing: 0.5 },
  sub: { fontFamily: 'Inter', fontSize: 6.5, letterSpacing: 1, color: GRAY, marginTop: 1, textTransform: 'uppercase' },
  no: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8, letterSpacing: 1, color: GOLD, marginTop: 2, textTransform: 'uppercase' },

  placeRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 14 },
  placeVal: { fontFamily: 'Inter', fontWeight: 700, fontSize: 9.5, color: NAVY, textAlign: 'right' },

  grid: { marginTop: 10, borderWidth: 1, borderColor: LINE, borderRadius: 5, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '50%', flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: LINE },
  k: { width: '34%', backgroundColor: ROW, paddingVertical: 5, paddingHorizontal: 10, fontFamily: 'Inter', fontWeight: 700, fontSize: 7.5, color: GRAY, textTransform: 'uppercase' },
  v: { flex: 1, paddingVertical: 5, paddingHorizontal: 10, fontFamily: 'Inter', fontWeight: 600, fontSize: 8.8, color: INK },

  lead: { fontFamily: 'Inter', fontSize: 9.5, color: INK, lineHeight: 1.7, marginTop: 16, textAlign: 'justify' },
  bold: { fontFamily: 'Inter', fontWeight: 700, color: NAVY },
  body: { fontFamily: 'Inter', fontSize: 9.5, color: INK, lineHeight: 1.75, marginTop: 12, textAlign: 'justify' },
  reserve: { fontFamily: 'Inter', fontSize: 9.5, color: INK, lineHeight: 1.75, marginTop: 12, textAlign: 'justify' },

  notedCap: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 1.4, color: GOLD, textTransform: 'uppercase', marginTop: 16, marginBottom: 3 },
  noted: { fontFamily: 'Inter', fontSize: 8.8, color: INK, fontWeight: 600 },

  signRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 34 },
  signBox: { width: 220 },
  signCap: { fontFamily: 'Inter', fontSize: 8, color: GRAY },
  signLine: { borderBottomWidth: 1, borderBottomColor: '#334155', height: 34, marginTop: 6, marginBottom: 7 },
  signName: { fontFamily: 'Inter', fontWeight: 700, fontSize: 9.5, color: NAVY },
  signSub: { fontFamily: 'Inter', fontSize: 8, color: GRAY, marginTop: 1 },
})

function KV({ k, v }: { k: string; v: string }) {
  return (
    <View style={np.cell}>
      <Text style={np.k}>{k}</Text>
      <Text style={np.v}>{v || '—'}</Text>
    </View>
  )
}

export function NoteProtestDocument({ data }: { data: NoteProtestData }) {
  const t = data.tenant
  const footRef = `${data.docNumber} · ${data.vesselName} · ${data.place}`

  return (
    <Document title={data.docNumber} author={t.companyName}>
      <Page size="A4" style={base.page}>
        <Letterhead
          tenant={t}
          right={
            <>
              <Text style={np.title}>NOTE OF PROTEST</Text>
              <Text style={np.sub}>Sea Protest</Text>
              <Text style={np.no}>No. {data.docNumber}</Text>
            </>
          }
        />

        <View style={np.placeRow}>
          <Text style={np.placeVal}>{data.place}, {data.date}</Text>
        </View>

        <View style={np.grid}>
          <KV k="Vessel" v={data.vesselName} />
          <KV k="IMO / Flag" v={`${data.imo}${data.flag ? ' · ' + data.flag : ''}`} />
          <KV k="GRT" v={data.grt || '—'} />
          <KV k="Master" v={data.masterName} />
          <KV k="Voyage" v={`${data.voyageNo ? data.voyageNo + ' · ' : ''}${data.fromPort} → ${data.toPort}`} />
          <KV k="Cargo" v={data.cargo} />
          <KV k="Departed" v={data.departureDate} />
          <KV k="Arrived" v={data.arrivalDate} />
        </View>

        <Text style={np.lead}>
          I, <Text style={np.bold}>{data.masterName}</Text>, Master of the vessel <Text style={np.bold}>{data.vesselName}</Text>
          {' '}(IMO {data.imo}{data.flag ? `, ${data.flag}` : ''}), do hereby declare and note this Protest as follows:
        </Text>

        <Text style={np.body}>{data.statement}</Text>

        <Text style={np.reserve}>{data.reservation}</Text>

        <Text style={np.notedCap}>Dicatat di hadapan / Noted before</Text>
        <Text style={np.noted}>{data.notedBefore}</Text>

        <View style={np.signRow}>
          <View style={np.signBox}>
            <Text style={np.signCap}>The Master</Text>
            <View style={np.signLine} />
            <Text style={np.signName}>{data.masterName}</Text>
            <Text style={np.signSub}>{data.vesselName}</Text>
          </View>
          <View style={np.signBox}>
            <Text style={np.signCap}>Noted before / Witnessed</Text>
            <View style={np.signLine} />
            <Text style={np.signName}>{data.notedBefore}</Text>
            <Text style={np.signSub}>{data.place}, {data.date}</Text>
          </View>
        </View>

        <DocFooter left={footRef} issuedAt={data.date} />
      </Page>
    </Document>
  )
}
