import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { NAVY, GOLD, INK, GRAY, LINE, ROW, WHITE, base, Letterhead, DocFooter } from './base'
import { type CargoDeclData } from './cargo-data'

const cd = StyleSheet.create({
  title: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 19, color: NAVY, letterSpacing: 0.4 },
  sub: { fontFamily: 'Inter', fontSize: 6.5, letterSpacing: 1, color: GRAY, marginTop: 1, textTransform: 'uppercase' },
  no: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8, letterSpacing: 1, color: GOLD, marginTop: 2, textTransform: 'uppercase' },

  partGrid: { marginTop: 16, borderWidth: 1, borderColor: LINE, borderRadius: 5, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap' },
  pCell: { width: '50%', flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: LINE },
  pK: { width: '36%', backgroundColor: ROW, paddingVertical: 5, paddingHorizontal: 10, fontFamily: 'Inter', fontWeight: 700, fontSize: 7.5, color: GRAY, textTransform: 'uppercase' },
  pV: { flex: 1, paddingVertical: 5, paddingHorizontal: 10, fontFamily: 'Inter', fontWeight: 600, fontSize: 8.8, color: INK },

  thead: { flexDirection: 'row', backgroundColor: NAVY, paddingVertical: 6, paddingHorizontal: 8, marginTop: 16, borderRadius: 2 },
  th: { fontFamily: 'Inter', fontWeight: 700, fontSize: 6.8, letterSpacing: 0.4, color: WHITE, textTransform: 'uppercase' },
  cNo: { width: 20 },
  cBl: { width: 58 },
  cMarks: { width: 56 },
  cPack: { width: 70 },
  cDesc: { flex: 1 },
  cWt: { width: 70, textAlign: 'right' },

  row: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: LINE, alignItems: 'flex-start' },
  rowAlt: { backgroundColor: ROW },
  tNo: { width: 20, fontFamily: 'Inter', fontWeight: 700, fontSize: 8, color: GOLD },
  tBl: { width: 58, fontFamily: 'Inter', fontSize: 8, color: GRAY },
  tMarks: { width: 56, fontFamily: 'Inter', fontSize: 8, color: GRAY },
  tPack: { width: 70, fontFamily: 'Inter', fontSize: 8, color: INK },
  tDesc: { flex: 1, fontFamily: 'Inter', fontWeight: 600, fontSize: 8.5, color: INK, paddingRight: 6 },
  tWt: { width: 70, textAlign: 'right', fontFamily: 'Inter', fontWeight: 700, fontSize: 8.5, color: NAVY },

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
    <View style={cd.pCell}>
      <Text style={cd.pK}>{k}</Text>
      <Text style={cd.pV}>{v}</Text>
    </View>
  )
}

export function CargoDeclDocument({ data }: { data: CargoDeclData }) {
  const t = data.tenant
  const footRef = `${data.docNumber} · ${data.vesselName} · ${data.port}`

  return (
    <Document title={data.docNumber} author={t.companyName}>
      <Page size="A4" style={base.page}>
        <Letterhead
          tenant={t}
          right={
            <>
              <Text style={cd.title}>CARGO DECLARATION</Text>
              <Text style={cd.sub}>IMO FAL Form 2</Text>
              <Text style={cd.no}>No. {data.docNumber}</Text>
            </>
          }
        />

        <View style={cd.partGrid}>
          <PCell k="Vessel" v={data.vesselName} />
          <PCell k="IMO" v={data.imo} />
          <PCell k="Flag" v={data.flag || '—'} />
          <PCell k="Operation" v={data.mode} />
          <PCell k="Port of Loading" v={data.portOfLoading} />
          <PCell k="Port of Discharge" v={data.portOfDischarge} />
          <PCell k="Voyage" v={data.voyage || '—'} />
          <PCell k="Master" v={data.master} />
        </View>

        <View style={cd.thead}>
          <Text style={[cd.th, cd.cNo]}>#</Text>
          <Text style={[cd.th, cd.cBl]}>B/L No.</Text>
          <Text style={[cd.th, cd.cMarks]}>Marks</Text>
          <Text style={[cd.th, cd.cPack]}>Packages</Text>
          <Text style={[cd.th, cd.cDesc]}>Description of Goods</Text>
          <Text style={[cd.th, cd.cWt]}>Gross Weight</Text>
        </View>
        {data.items.map((c, i) => (
          <View key={i} style={[cd.row, i % 2 ? cd.rowAlt : {}]} wrap={false}>
            <Text style={cd.tNo}>{i + 1}</Text>
            <Text style={cd.tBl}>{c.blNo}</Text>
            <Text style={cd.tMarks}>{c.marks}</Text>
            <Text style={cd.tPack}>{c.packages}</Text>
            <Text style={cd.tDesc}>{c.description}</Text>
            <Text style={cd.tWt}>{c.weight}</Text>
          </View>
        ))}

        {data.remarks ? (
          <>
            <Text style={cd.remarkCap}>Remarks</Text>
            <Text style={cd.remark}>{data.remarks}</Text>
          </>
        ) : null}

        <View style={cd.signRow}>
          <View style={cd.signBox}>
            <Text style={cd.signCap}>Master</Text>
            <View style={cd.signLine} />
            <Text style={cd.signName}>{data.master || 'Master'}</Text>
            <Text style={cd.signSub}>MV/MT {data.vesselName}</Text>
          </View>
          <View style={cd.signBox}>
            <Text style={cd.signCap}>{data.signRole || 'Port Agent'}</Text>
            <View style={cd.signLine} />
            <Text style={cd.signName}>{t.companyName}</Text>
            <Text style={cd.signSub}>Authorised Agent</Text>
          </View>
        </View>

        <DocFooter left={footRef} issuedAt={''} />
      </Page>
    </Document>
  )
}
