import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { NAVY, GOLD, INK, GRAY, LINE, ROW, WHITE, base, Letterhead, DocFooter } from './base'
import { damageTotal, type DamageData } from './damage-data'

const fmt = (n: number) => (n || 0).toLocaleString('en-US')

const dm = StyleSheet.create({
  title: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 18, color: NAVY, letterSpacing: 0.5 },
  sub: { fontFamily: 'Inter', fontSize: 6.5, letterSpacing: 1, color: GRAY, marginTop: 1, textTransform: 'uppercase' },
  no: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8, letterSpacing: 1, color: GOLD, marginTop: 2, textTransform: 'uppercase' },

  partGrid: { marginTop: 16, borderWidth: 1, borderColor: LINE, borderRadius: 5, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap' },
  pCell: { width: '50%', flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: LINE },
  pK: { width: '36%', backgroundColor: ROW, paddingVertical: 5, paddingHorizontal: 10, fontFamily: 'Inter', fontWeight: 700, fontSize: 7.5, color: GRAY, textTransform: 'uppercase' },
  pV: { flex: 1, paddingVertical: 5, paddingHorizontal: 10, fontFamily: 'Inter', fontWeight: 600, fontSize: 8.8, color: INK },

  cap: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 1.4, color: GOLD, textTransform: 'uppercase', marginTop: 16, marginBottom: 6 },

  thead: { flexDirection: 'row', backgroundColor: NAVY, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 2 },
  th: { fontFamily: 'Inter', fontWeight: 700, fontSize: 6.8, letterSpacing: 0.5, color: WHITE, textTransform: 'uppercase' },
  row: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: LINE, alignItems: 'flex-start' },
  rowAlt: { backgroundColor: ROW },
  cNo: { width: 18 },
  cLoc: { width: 92 },
  cDesc: { flex: 1 },
  cCause: { width: 84 },
  cSev: { width: 46 },
  cEst: { width: 78, textAlign: 'right' },
  tNo: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8, color: GOLD },
  tLoc: { fontFamily: 'Inter', fontWeight: 600, fontSize: 8, color: NAVY },
  td: { fontFamily: 'Inter', fontSize: 7.8, color: INK },
  tdG: { fontFamily: 'Inter', fontSize: 7.8, color: GRAY },

  totalRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  totalBox: { width: 240, borderTopWidth: 2, borderTopColor: NAVY, paddingTop: 6, flexDirection: 'row', justifyContent: 'space-between' },
  totK: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 10.5, color: NAVY },
  totV: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 10.5, color: NAVY },

  concCap: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 1.4, color: GOLD, textTransform: 'uppercase', marginTop: 14, marginBottom: 3 },
  conc: { fontFamily: 'Inter', fontSize: 8.8, color: INK, lineHeight: 1.6 },
  remark: { fontFamily: 'Inter', fontSize: 8.5, color: GRAY, lineHeight: 1.5, marginTop: 6 },

  signRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 30 },
  signBox: { width: 150 },
  signCap: { fontFamily: 'Inter', fontSize: 7.5, color: GRAY },
  signLine: { borderBottomWidth: 1, borderBottomColor: '#334155', height: 28, marginTop: 6, marginBottom: 6 },
  signName: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8.5, color: NAVY },
})

function PCell({ k, v }: { k: string; v: string }) {
  return (
    <View style={dm.pCell}>
      <Text style={dm.pK}>{k}</Text>
      <Text style={dm.pV}>{v || '—'}</Text>
    </View>
  )
}

export function DamageDocument({ data }: { data: DamageData }) {
  const t = data.tenant
  const total = damageTotal(data)
  const hasEst = total > 0
  const footRef = `${data.docNumber} · ${data.vesselName} · ${data.port}`

  return (
    <Document title={data.docNumber} author={t.companyName}>
      <Page size="A4" style={base.page}>
        <Letterhead
          tenant={t}
          right={
            <>
              <Text style={dm.title}>DAMAGE REPORT</Text>
              <Text style={dm.sub}>Survey Findings</Text>
              <Text style={dm.no}>No. {data.docNumber}</Text>
            </>
          }
        />

        <View style={dm.partGrid}>
          <PCell k="Vessel" v={data.vesselName} />
          <PCell k="IMO / Flag" v={`${data.imo}${data.flag ? ' · ' + data.flag : ''}`} />
          <PCell k="Port / Voyage" v={`${data.port}${data.voyageNo ? ' · ' + data.voyageNo : ''}`} />
          <PCell k="Tanggal & Tempat" v={`${data.date} · ${data.place}`} />
          <PCell k="Occasion" v={data.occasion} />
          <PCell k="Surveyor" v={data.surveyor} />
          <View style={[dm.pCell, { width: '100%', borderBottomWidth: 0 }]}>
            <Text style={dm.pK}>Attended By</Text>
            <Text style={dm.pV}>{data.attendedBy || '—'}</Text>
          </View>
        </View>

        <Text style={dm.cap}>Temuan Kerusakan</Text>
        <View style={{ borderWidth: 1, borderColor: LINE, borderRadius: 5, overflow: 'hidden' }}>
          <View style={dm.thead}>
            <Text style={[dm.th, dm.cNo]}>#</Text>
            <Text style={[dm.th, dm.cLoc]}>Lokasi / Objek</Text>
            <Text style={[dm.th, dm.cDesc]}>Uraian Kerusakan</Text>
            <Text style={[dm.th, dm.cCause]}>Penyebab</Text>
            <Text style={[dm.th, dm.cSev]}>Tingkat</Text>
            {hasEst ? <Text style={[dm.th, dm.cEst]}>Estimasi</Text> : null}
          </View>
          {data.items.map((it, i) => (
            <View key={i} style={[dm.row, i % 2 ? dm.rowAlt : {}, i === data.items.length - 1 ? { borderBottomWidth: 0 } : {}]} wrap={false}>
              <Text style={[dm.tNo, dm.cNo]}>{i + 1}</Text>
              <Text style={[dm.tLoc, dm.cLoc]}>{it.location}</Text>
              <Text style={[dm.td, dm.cDesc]}>{it.description}</Text>
              <Text style={[dm.tdG, dm.cCause]}>{it.cause}</Text>
              <Text style={[dm.tdG, dm.cSev]}>{it.severity}</Text>
              {hasEst ? <Text style={[dm.td, dm.cEst]}>{fmt(it.estimate)}</Text> : null}
            </View>
          ))}
        </View>

        {hasEst ? (
          <View style={dm.totalRow}>
            <View style={dm.totalBox}>
              <Text style={dm.totK}>Total Estimasi</Text>
              <Text style={dm.totV}>{data.currency} {fmt(total)}</Text>
            </View>
          </View>
        ) : null}

        {data.conclusion ? (
          <>
            <Text style={dm.concCap}>Kesimpulan</Text>
            <Text style={dm.conc}>{data.conclusion}</Text>
          </>
        ) : null}
        {data.remarks ? <Text style={dm.remark}>{data.remarks}</Text> : null}

        <View style={dm.signRow}>
          <View style={dm.signBox}>
            <Text style={dm.signCap}>Surveyor</Text>
            <View style={dm.signLine} />
            <Text style={dm.signName}>{data.surveyor}</Text>
          </View>
          <View style={dm.signBox}>
            <Text style={dm.signCap}>Master</Text>
            <View style={dm.signLine} />
            <Text style={dm.signName}>{data.vesselName}</Text>
          </View>
          <View style={dm.signBox}>
            <Text style={dm.signCap}>Port Agent</Text>
            <View style={dm.signLine} />
            <Text style={dm.signName}>{t.companyName}</Text>
          </View>
        </View>

        <DocFooter left={footRef} issuedAt={data.date} />
      </Page>
    </Document>
  )
}
