import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { NAVY, GOLD, INK, GRAY, LINE, ROW, WHITE, base, Letterhead, DocFooter } from './base'
import { type CrewChangeData } from './crewchange-data'

const cc = StyleSheet.create({
  title: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 18, color: NAVY, letterSpacing: 0.5 },
  no: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8, letterSpacing: 1, color: GOLD, marginTop: 2, textTransform: 'uppercase' },

  meta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  toWrap: { maxWidth: '62%' },
  kicker: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 1.6, color: GOLD, textTransform: 'uppercase', marginBottom: 5 },
  toName: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 12, color: NAVY },
  toLine: { fontFamily: 'Inter', fontSize: 8.5, color: GRAY, marginTop: 2 },
  placeWrap: { alignItems: 'flex-end' },
  placeVal: { fontFamily: 'Inter', fontWeight: 700, fontSize: 9.5, color: NAVY },

  partGrid: { marginTop: 14, borderWidth: 1, borderColor: LINE, borderRadius: 5, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap' },
  pCell: { width: '50%', flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: LINE },
  pK: { width: '36%', backgroundColor: ROW, paddingVertical: 5, paddingHorizontal: 10, fontFamily: 'Inter', fontWeight: 700, fontSize: 7.5, color: GRAY, textTransform: 'uppercase' },
  pV: { flex: 1, paddingVertical: 5, paddingHorizontal: 10, fontFamily: 'Inter', fontWeight: 600, fontSize: 8.8, color: INK },

  intro: { fontFamily: 'Inter', fontSize: 9, color: INK, lineHeight: 1.6, marginTop: 14 },

  thead: { flexDirection: 'row', backgroundColor: NAVY, paddingVertical: 6, paddingHorizontal: 8, marginTop: 14, borderRadius: 2 },
  th: { fontFamily: 'Inter', fontWeight: 700, fontSize: 6.8, letterSpacing: 0.5, color: WHITE, textTransform: 'uppercase' },
  cNo: { width: 20 },
  cName: { flex: 1.4 },
  cRank: { flex: 1.1 },
  cNat: { width: 60 },
  cPass: { width: 64 },
  cAct: { width: 52 },
  cRem: { flex: 1.1 },

  row: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: LINE, alignItems: 'flex-start' },
  rowAlt: { backgroundColor: ROW },
  tNo: { width: 20, fontFamily: 'Inter', fontWeight: 700, fontSize: 8, color: GOLD },
  tName: { flex: 1.4, fontFamily: 'Inter', fontWeight: 600, fontSize: 8.3, color: INK },
  tRank: { flex: 1.1, fontFamily: 'Inter', fontSize: 8, color: INK },
  tNat: { width: 60, fontFamily: 'Inter', fontSize: 8, color: GRAY },
  tPass: { width: 64, fontFamily: 'Inter', fontSize: 8, color: GRAY },
  tAct: { width: 52, fontFamily: 'Inter', fontWeight: 700, fontSize: 7.8, color: NAVY },
  tRem: { flex: 1.1, fontFamily: 'Inter', fontSize: 7.8, color: GRAY },

  counts: { flexDirection: 'row', gap: 18, marginTop: 10 },
  countItem: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8.5, color: NAVY },

  remarkCap: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 1.4, color: GOLD, textTransform: 'uppercase', marginTop: 14, marginBottom: 3 },
  remark: { fontFamily: 'Inter', fontSize: 8.5, color: GRAY, lineHeight: 1.5 },

  signWrap: { marginTop: 24, alignItems: 'flex-end' },
  signCap: { fontFamily: 'Inter', fontSize: 8, color: GRAY },
  signLine: { borderBottomWidth: 1, borderBottomColor: '#334155', height: 30, width: 200, marginTop: 6, marginBottom: 7 },
  signName: { fontFamily: 'Inter', fontWeight: 700, fontSize: 9.5, color: NAVY },
  signSub: { fontFamily: 'Inter', fontSize: 8, color: GRAY, marginTop: 1 },
})

function PCell({ k, v }: { k: string; v: string }) {
  return (
    <View style={cc.pCell}>
      <Text style={cc.pK}>{k}</Text>
      <Text style={cc.pV}>{v}</Text>
    </View>
  )
}

export function CrewChangeDocument({ data }: { data: CrewChangeData }) {
  const t = data.tenant
  const footRef = `${data.docNumber} · ${data.vesselName} · ${data.port}`
  const onCount = data.crew.filter((c) => /on/i.test(c.action)).length
  const offCount = data.crew.filter((c) => /off/i.test(c.action)).length

  return (
    <Document title={data.docNumber} author={t.companyName}>
      <Page size="A4" style={base.page}>
        <Letterhead
          tenant={t}
          right={
            <>
              <Text style={cc.title}>CREW CHANGE NOTICE</Text>
              <Text style={cc.no}>No. {data.docNumber}</Text>
            </>
          }
        />

        <View style={cc.meta}>
          <View style={cc.toWrap}>
            <Text style={cc.kicker}>Kepada / To</Text>
            <Text style={cc.toName}>{data.toName}</Text>
            {data.toAttn ? <Text style={cc.toLine}>Attn: {data.toAttn}</Text> : null}
          </View>
          <View style={cc.placeWrap}>
            <Text style={cc.kicker}>Tanggal</Text>
            <Text style={cc.placeVal}>{data.date}</Text>
          </View>
        </View>

        <View style={cc.partGrid}>
          <PCell k="Vessel" v={data.vesselName} />
          <PCell k="IMO / Flag" v={`${data.imo}${data.flag ? ' · ' + data.flag : ''}`} />
          <PCell k="Port" v={data.port} />
          <PCell k="Date" v={data.date} />
        </View>

        <Text style={cc.intro}>
          Dear Sirs, we hereby notify the following crew change(s) to be effected on board{' '}
          MV/MT {data.vesselName} at {data.port}, and request the necessary clearance.
        </Text>

        <View style={cc.thead}>
          <Text style={[cc.th, cc.cNo]}>#</Text>
          <Text style={[cc.th, cc.cName]}>Name</Text>
          <Text style={[cc.th, cc.cRank]}>Rank</Text>
          <Text style={[cc.th, cc.cNat]}>Nationality</Text>
          <Text style={[cc.th, cc.cPass]}>Passport</Text>
          <Text style={[cc.th, cc.cAct]}>Action</Text>
          <Text style={[cc.th, cc.cRem]}>Remark</Text>
        </View>
        {data.crew.map((c, i) => (
          <View key={i} style={[cc.row, i % 2 ? cc.rowAlt : {}]} wrap={false}>
            <Text style={cc.tNo}>{i + 1}</Text>
            <Text style={cc.tName}>{c.name}</Text>
            <Text style={cc.tRank}>{c.rank}</Text>
            <Text style={cc.tNat}>{c.nationality}</Text>
            <Text style={cc.tPass}>{c.passport}</Text>
            <Text style={cc.tAct}>{c.action}</Text>
            <Text style={cc.tRem}>{c.remark || ''}</Text>
          </View>
        ))}

        <View style={cc.counts}>
          <Text style={cc.countItem}>Sign On: {onCount}</Text>
          <Text style={cc.countItem}>Sign Off: {offCount}</Text>
        </View>

        {data.remarks ? (
          <>
            <Text style={cc.remarkCap}>Remarks</Text>
            <Text style={cc.remark}>{data.remarks}</Text>
          </>
        ) : null}

        <View style={cc.signWrap}>
          <Text style={cc.signCap}>Submitted by — {data.agentName}</Text>
          <View style={cc.signLine} />
          <Text style={cc.signName}>{t.companyName}</Text>
          <Text style={cc.signSub}>As agents for and on behalf of the Owners</Text>
        </View>

        <DocFooter left={footRef} issuedAt={data.date} />
      </Page>
    </Document>
  )
}
