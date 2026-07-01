import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { NAVY, GOLD, INK, GRAY, LINE, ROW, WHITE, base, Letterhead, DocFooter } from './base'
import { type SofData } from './sof-data'

const sf = StyleSheet.create({
  title: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 20, color: NAVY, letterSpacing: 0.5 },
  no: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8, letterSpacing: 1, color: GOLD, marginTop: 2, textTransform: 'uppercase' },

  // particulars 2 kolom
  partGrid: { marginTop: 16, borderWidth: 1, borderColor: LINE, borderRadius: 5, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap' },
  pCell: { width: '50%', flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: LINE },
  pK: { width: '38%', backgroundColor: ROW, paddingVertical: 5, paddingHorizontal: 10, fontFamily: 'Inter', fontWeight: 700, fontSize: 7.5, color: GRAY, textTransform: 'uppercase' },
  pV: { flex: 1, paddingVertical: 5, paddingHorizontal: 10, fontFamily: 'Inter', fontWeight: 600, fontSize: 8.8, color: INK },

  thead: { flexDirection: 'row', backgroundColor: NAVY, paddingVertical: 6, paddingHorizontal: 11, marginTop: 18, borderRadius: 2 },
  th: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 0.8, color: WHITE, textTransform: 'uppercase' },
  thDate: { width: 78 },
  thTime: { width: 54 },
  thDesc: { flex: 1 },

  row: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 11, borderBottomWidth: 1, borderBottomColor: LINE, alignItems: 'flex-start' },
  rowAlt: { backgroundColor: ROW },
  cDate: { width: 78, fontFamily: 'Inter', fontSize: 8.5, color: GRAY },
  cTime: { width: 54, fontFamily: 'Inter', fontWeight: 700, fontSize: 8.5, color: NAVY },
  cDesc: { flex: 1, fontFamily: 'Inter', fontSize: 8.8, color: INK, lineHeight: 1.4 },

  remarkCap: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 1.4, color: GOLD, textTransform: 'uppercase', marginTop: 16, marginBottom: 3 },
  remark: { fontFamily: 'Inter', fontSize: 8.5, color: GRAY, lineHeight: 1.5 },

  signRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 30 },
  signBox: { width: 210 },
  signCap: { fontFamily: 'Inter', fontSize: 8, color: GRAY },
  signLine: { borderBottomWidth: 1, borderBottomColor: '#334155', height: 32, marginTop: 6, marginBottom: 7 },
  signName: { fontFamily: 'Inter', fontWeight: 700, fontSize: 9.5, color: NAVY },
  signSub: { fontFamily: 'Inter', fontSize: 8, color: GRAY, marginTop: 1 },
})

function PCell({ k, v }: { k: string; v: string }) {
  return (
    <View style={sf.pCell}>
      <Text style={sf.pK}>{k}</Text>
      <Text style={sf.pV}>{v}</Text>
    </View>
  )
}

export function SofDocument({ data }: { data: SofData }) {
  const t = data.tenant
  const footRef = `${data.docNumber} · ${data.vesselName} · ${data.port}`

  return (
    <Document title={data.docNumber} author={t.companyName}>
      <Page size="A4" style={base.page}>
        <Letterhead
          tenant={t}
          right={
            <>
              <Text style={sf.title}>STATEMENT OF FACTS</Text>
              <Text style={sf.no}>No. {data.docNumber}</Text>
            </>
          }
        />

        <View style={sf.partGrid}>
          <PCell k="Vessel" v={data.vesselName} />
          <PCell k="IMO / Flag" v={`${data.imo}${data.flag ? ' · ' + data.flag : ''}`} />
          <PCell k="Port" v={data.port} />
          <PCell k="Berth" v={data.berth || '—'} />
          <PCell k="Operation" v={data.operation} />
          <PCell k="Cargo" v={`${data.cargo}${data.cargoQty ? ' · ' + data.cargoQty : ''}`} />
        </View>

        <View style={sf.thead}>
          <Text style={[sf.th, sf.thDate]}>Tanggal</Text>
          <Text style={[sf.th, sf.thTime]}>Jam</Text>
          <Text style={[sf.th, sf.thDesc]}>Keterangan / Event</Text>
        </View>
        {data.events.map((e, i) => (
          <View key={i} style={[sf.row, i % 2 ? sf.rowAlt : {}]}>
            <Text style={sf.cDate}>{e.date}</Text>
            <Text style={sf.cTime}>{e.time}</Text>
            <Text style={sf.cDesc}>{e.desc}</Text>
          </View>
        ))}

        {data.remarks ? (
          <>
            <Text style={sf.remarkCap}>Remarks</Text>
            <Text style={sf.remark}>{data.remarks}</Text>
          </>
        ) : null}

        <View style={sf.signRow}>
          <View style={sf.signBox}>
            <Text style={sf.signCap}>Master</Text>
            <View style={sf.signLine} />
            <Text style={sf.signName}>{data.master || 'Master'}</Text>
            <Text style={sf.signSub}>MV/MT {data.vesselName}</Text>
          </View>
          <View style={sf.signBox}>
            <Text style={sf.signCap}>{data.signRole || 'Port Agent'}</Text>
            <View style={sf.signLine} />
            <Text style={sf.signName}>{t.companyName}</Text>
            <Text style={sf.signSub}>Agen / Agent</Text>
          </View>
        </View>

        <DocFooter left={footRef} issuedAt={data.events[0]?.date ?? ''} />
      </Page>
    </Document>
  )
}
