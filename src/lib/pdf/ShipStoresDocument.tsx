import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { NAVY, GOLD, INK, GRAY, LINE, ROW, WHITE, base, Letterhead, DocFooter } from './base'
import { type ShipStoresData } from './shipstores-data'

const ss = StyleSheet.create({
  title: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 19, color: NAVY, letterSpacing: 0.4 },
  sub: { fontFamily: 'Inter', fontSize: 6.5, letterSpacing: 1, color: GRAY, marginTop: 1, textTransform: 'uppercase' },
  no: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8, letterSpacing: 1, color: GOLD, marginTop: 2, textTransform: 'uppercase' },

  partGrid: { marginTop: 16, borderWidth: 1, borderColor: LINE, borderRadius: 5, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap' },
  pCell: { width: '50%', flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: LINE },
  pK: { width: '36%', backgroundColor: ROW, paddingVertical: 5, paddingHorizontal: 10, fontFamily: 'Inter', fontWeight: 700, fontSize: 7.5, color: GRAY, textTransform: 'uppercase' },
  pV: { flex: 1, paddingVertical: 5, paddingHorizontal: 10, fontFamily: 'Inter', fontWeight: 600, fontSize: 8.8, color: INK },

  thead: { flexDirection: 'row', backgroundColor: NAVY, paddingVertical: 6, paddingHorizontal: 11, marginTop: 16, borderRadius: 2 },
  th: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 0.6, color: WHITE, textTransform: 'uppercase' },
  cNo: { width: 22 },
  cItem: { flex: 1 },
  cQty: { width: 80, textAlign: 'right' },
  cUnit: { width: 60 },
  cLoc: { width: 110 },

  row: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 11, borderBottomWidth: 1, borderBottomColor: LINE, alignItems: 'flex-start' },
  rowAlt: { backgroundColor: ROW },
  tNo: { width: 22, fontFamily: 'Inter', fontWeight: 700, fontSize: 8, color: GOLD },
  tItem: { flex: 1, fontFamily: 'Inter', fontWeight: 600, fontSize: 8.7, color: INK },
  tQty: { width: 80, textAlign: 'right', fontFamily: 'Inter', fontWeight: 700, fontSize: 8.7, color: NAVY },
  tUnit: { width: 60, fontFamily: 'Inter', fontSize: 8.5, color: GRAY, paddingLeft: 8 },
  tLoc: { width: 110, fontFamily: 'Inter', fontSize: 8.3, color: GRAY },

  remarkCap: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 1.4, color: GOLD, textTransform: 'uppercase', marginTop: 14, marginBottom: 3 },
  remark: { fontFamily: 'Inter', fontSize: 8.5, color: GRAY, lineHeight: 1.5 },

  signRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 26 },
  signBox: { width: 210 },
  signCap: { fontFamily: 'Inter', fontSize: 8, color: GRAY },
  signLine: { borderBottomWidth: 1, borderBottomColor: '#334155', height: 30, marginTop: 6, marginBottom: 7 },
  signName: { fontFamily: 'Inter', fontWeight: 700, fontSize: 9.5, color: NAVY },
  signSub: { fontFamily: 'Inter', fontSize: 8, color: GRAY, marginTop: 1 },
})

function PCell({ k, v }: { k: string; v: string }) {
  return (
    <View style={ss.pCell}>
      <Text style={ss.pK}>{k}</Text>
      <Text style={ss.pV}>{v}</Text>
    </View>
  )
}

export function ShipStoresDocument({ data }: { data: ShipStoresData }) {
  const t = data.tenant
  const footRef = `${data.docNumber} · ${data.vesselName} · ${data.port}`

  return (
    <Document title={data.docNumber} author={t.companyName}>
      <Page size="A4" style={base.page}>
        <Letterhead
          tenant={t}
          right={
            <>
              <Text style={ss.title}>SHIP&apos;S STORES DECLARATION</Text>
              <Text style={ss.sub}>IMO FAL Form 3</Text>
              <Text style={ss.no}>No. {data.docNumber}</Text>
            </>
          }
        />

        <View style={ss.partGrid}>
          <PCell k="Vessel" v={data.vesselName} />
          <PCell k="IMO" v={data.imo} />
          <PCell k="Flag" v={data.flag || '—'} />
          <PCell k="Port" v={data.port} />
          <PCell k="Arrival / Departure" v={data.mode} />
          <PCell k="Master" v={data.master} />
        </View>

        <View style={ss.thead}>
          <Text style={[ss.th, ss.cNo]}>#</Text>
          <Text style={[ss.th, ss.cItem]}>Article / Item</Text>
          <Text style={[ss.th, ss.cQty]}>Quantity</Text>
          <Text style={[ss.th, ss.cUnit]}>Unit</Text>
          <Text style={[ss.th, ss.cLoc]}>Location</Text>
        </View>
        {data.stores.map((s, i) => (
          <View key={i} style={[ss.row, i % 2 ? ss.rowAlt : {}]} wrap={false}>
            <Text style={ss.tNo}>{i + 1}</Text>
            <Text style={ss.tItem}>{s.item}</Text>
            <Text style={ss.tQty}>{s.quantity}</Text>
            <Text style={ss.tUnit}>{s.unit}</Text>
            <Text style={ss.tLoc}>{s.location || '—'}</Text>
          </View>
        ))}

        {data.remarks ? (
          <>
            <Text style={ss.remarkCap}>Remarks</Text>
            <Text style={ss.remark}>{data.remarks}</Text>
          </>
        ) : null}

        <View style={ss.signRow}>
          <View style={ss.signBox}>
            <Text style={ss.signCap}>Master</Text>
            <View style={ss.signLine} />
            <Text style={ss.signName}>{data.master || 'Master'}</Text>
            <Text style={ss.signSub}>MV/MT {data.vesselName}</Text>
          </View>
          <View style={ss.signBox}>
            <Text style={ss.signCap}>{data.signRole || 'Port Agent'}</Text>
            <View style={ss.signLine} />
            <Text style={ss.signName}>{t.companyName}</Text>
            <Text style={ss.signSub}>Authorised Agent</Text>
          </View>
        </View>

        <DocFooter left={footRef} issuedAt={''} />
      </Page>
    </Document>
  )
}
