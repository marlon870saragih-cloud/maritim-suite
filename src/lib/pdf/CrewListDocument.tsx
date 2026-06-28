import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { NAVY, GOLD, INK, GRAY, LINE, ROW, WHITE, base, Letterhead, DocFooter } from './base'
import { type CrewListData } from './crewlist-data'

const cl = StyleSheet.create({
  title: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 20, color: NAVY, letterSpacing: 0.5 },
  sub: { fontFamily: 'Inter', fontSize: 6.5, letterSpacing: 1, color: GRAY, marginTop: 1, textTransform: 'uppercase' },
  no: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8, letterSpacing: 1, color: GOLD, marginTop: 2, textTransform: 'uppercase' },

  partGrid: { marginTop: 16, borderWidth: 1, borderColor: LINE, borderRadius: 5, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap' },
  pCell: { width: '50%', flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: LINE },
  pK: { width: '36%', backgroundColor: ROW, paddingVertical: 5, paddingHorizontal: 10, fontFamily: 'Inter', fontWeight: 700, fontSize: 7.5, color: GRAY, textTransform: 'uppercase' },
  pV: { flex: 1, paddingVertical: 5, paddingHorizontal: 10, fontFamily: 'Inter', fontWeight: 600, fontSize: 8.8, color: INK },

  thead: { flexDirection: 'row', backgroundColor: NAVY, paddingVertical: 6, paddingHorizontal: 8, marginTop: 16, borderRadius: 2 },
  th: { fontFamily: 'Inter', fontWeight: 700, fontSize: 6.8, letterSpacing: 0.5, color: WHITE, textTransform: 'uppercase' },
  cNo: { width: 22 },
  cName: { flex: 1.4 },
  cRank: { flex: 1.1 },
  cNat: { width: 64 },
  cPass: { width: 70 },
  cDob: { width: 70 },

  row: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: LINE, alignItems: 'flex-start' },
  rowAlt: { backgroundColor: ROW },
  tNo: { width: 22, fontFamily: 'Inter', fontWeight: 700, fontSize: 8, color: GOLD },
  tName: { flex: 1.4, fontFamily: 'Inter', fontWeight: 600, fontSize: 8.5, color: INK },
  tRank: { flex: 1.1, fontFamily: 'Inter', fontSize: 8.3, color: INK },
  tNat: { width: 64, fontFamily: 'Inter', fontSize: 8.3, color: GRAY },
  tPass: { width: 70, fontFamily: 'Inter', fontSize: 8.3, color: GRAY },
  tDob: { width: 70, fontFamily: 'Inter', fontSize: 8.3, color: GRAY },

  remarkCap: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 1.4, color: GOLD, textTransform: 'uppercase', marginTop: 14, marginBottom: 3 },
  remark: { fontFamily: 'Inter', fontSize: 8.5, color: GRAY, lineHeight: 1.5 },
  count: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8.5, color: NAVY, marginTop: 10 },

  signWrap: { marginTop: 24, alignItems: 'flex-end' },
  signCap: { fontFamily: 'Inter', fontSize: 8, color: GRAY },
  signLine: { borderBottomWidth: 1, borderBottomColor: '#334155', height: 30, width: 200, marginTop: 6, marginBottom: 7 },
  signName: { fontFamily: 'Inter', fontWeight: 700, fontSize: 9.5, color: NAVY },
  signSub: { fontFamily: 'Inter', fontSize: 8, color: GRAY, marginTop: 1 },
})

function PCell({ k, v }: { k: string; v: string }) {
  return (
    <View style={cl.pCell}>
      <Text style={cl.pK}>{k}</Text>
      <Text style={cl.pV}>{v}</Text>
    </View>
  )
}

export function CrewListDocument({ data }: { data: CrewListData }) {
  const t = data.tenant
  const footRef = `${data.docNumber} · ${data.vesselName} · ${data.port}`

  return (
    <Document title={data.docNumber} author={t.companyName}>
      <Page size="A4" style={base.page}>
        <Letterhead
          tenant={t}
          right={
            <>
              <Text style={cl.title}>CREW LIST</Text>
              <Text style={cl.sub}>IMO FAL Form 5</Text>
              <Text style={cl.no}>No. {data.docNumber}</Text>
            </>
          }
        />

        <View style={cl.partGrid}>
          <PCell k="Vessel" v={data.vesselName} />
          <PCell k="IMO / Call Sign" v={`${data.imo}${data.callSign ? ' · ' + data.callSign : ''}`} />
          <PCell k="Flag" v={data.flag || '—'} />
          <PCell k="Port" v={data.port} />
          <PCell k="Voyage" v={data.voyage || '—'} />
          <PCell k="Arrival / Departure" v={data.mode} />
        </View>

        <View style={cl.thead}>
          <Text style={[cl.th, cl.cNo]}>#</Text>
          <Text style={[cl.th, cl.cName]}>Name (Family, Given)</Text>
          <Text style={[cl.th, cl.cRank]}>Rank / Rating</Text>
          <Text style={[cl.th, cl.cNat]}>Nationality</Text>
          <Text style={[cl.th, cl.cPass]}>Passport No.</Text>
          <Text style={[cl.th, cl.cDob]}>Date of Birth</Text>
        </View>
        {data.crew.map((c, i) => (
          <View key={i} style={[cl.row, i % 2 ? cl.rowAlt : {}]} wrap={false}>
            <Text style={cl.tNo}>{i + 1}</Text>
            <Text style={cl.tName}>{c.name}</Text>
            <Text style={cl.tRank}>{c.rank}</Text>
            <Text style={cl.tNat}>{c.nationality}</Text>
            <Text style={cl.tPass}>{c.passport}</Text>
            <Text style={cl.tDob}>{c.dob}</Text>
          </View>
        ))}

        <Text style={cl.count}>Total crew on board: {data.crew.length}</Text>

        {data.remarks ? (
          <>
            <Text style={cl.remarkCap}>Remarks</Text>
            <Text style={cl.remark}>{data.remarks}</Text>
          </>
        ) : null}

        <View style={cl.signWrap}>
          <Text style={cl.signCap}>Certified true — Master / {data.signRole}</Text>
          <View style={cl.signLine} />
          <Text style={cl.signName}>{data.masterName || data.signRole}</Text>
          <Text style={cl.signSub}>{t.companyName}</Text>
        </View>

        <DocFooter left={footRef} issuedAt={''} />
      </Page>
    </Document>
  )
}
