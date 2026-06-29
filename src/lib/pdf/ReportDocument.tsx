import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { NAVY, GOLD, INK, GRAY, LINE, ROW, base, Letterhead, DocFooter } from './base'
import { REPORT_META, type ReportData } from './report-data'

const rp = StyleSheet.create({
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

  secCap: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 1.4, color: GOLD, textTransform: 'uppercase', marginTop: 18, marginBottom: 6 },
  tHead: { flexDirection: 'row', backgroundColor: NAVY },
  th: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7.5, color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5, paddingVertical: 5, paddingHorizontal: 9 },
  tRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: LINE },
  td: { fontFamily: 'Inter', fontSize: 8.5, color: INK, paddingVertical: 5, paddingHorizontal: 9 },

  remarkCap: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 1.4, color: GOLD, textTransform: 'uppercase', marginTop: 16, marginBottom: 3 },
  remark: { fontFamily: 'Inter', fontSize: 8.5, color: GRAY, lineHeight: 1.5 },

  signRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 32 },
  signBox: { width: 210 },
  signCap: { fontFamily: 'Inter', fontSize: 8, color: GRAY },
  signLine: { borderBottomWidth: 1, borderBottomColor: '#334155', height: 34, marginTop: 6, marginBottom: 7 },
  signName: { fontFamily: 'Inter', fontWeight: 700, fontSize: 9.5, color: NAVY },
  signSub: { fontFamily: 'Inter', fontSize: 8, color: GRAY, marginTop: 1 },
})

function KV({ k, v }: { k: string; v: string }) {
  return (
    <View style={rp.row}>
      <Text style={rp.cellK}>{k}</Text>
      <Text style={rp.cellV}>{v}</Text>
    </View>
  )
}

export function ReportDocument({ data }: { data: ReportData }) {
  const t = data.tenant
  const meta = REPORT_META[data.kind] ?? REPORT_META.ARRIVAL
  const lastEvent = data.events[data.events.length - 1]
  const keyTime = lastEvent ? `${lastEvent.date} ${lastEvent.time}` : '—'
  const footRef = `${data.docNumber} · ${data.vesselName} · ${data.port}`

  return (
    <Document title={data.docNumber} author={t.companyName}>
      <Page size="A4" style={base.page}>
        <Letterhead
          tenant={t}
          right={
            <>
              <Text style={rp.title}>{meta.title}</Text>
              <Text style={rp.no}>No. {data.docNumber}</Text>
            </>
          }
        />

        <View style={rp.toWrap}>
          <Text style={rp.kicker}>Kepada / To</Text>
          <Text style={rp.toName}>{data.toName}</Text>
          {data.toAttn ? <Text style={rp.toLine}>Attn: {data.toAttn}</Text> : null}
        </View>

        <Text style={rp.para}>
          Dear Sirs, we wish to report that <Text style={rp.bold}>MV/MT {data.vesselName}</Text> (IMO {data.imo}
          {data.flag ? `, ${data.flag}` : ''}
          {data.voyageNo ? `, Voy. ${data.voyageNo}` : ''}) {meta.intro}
        </Text>

        <View style={rp.grid}>
          <KV k="Vessel" v={data.vesselName} />
          <KV k="IMO / Flag" v={`${data.imo}${data.flag ? ' · ' + data.flag : ''}`} />
          <KV k="Port / Berth" v={`${data.port}${data.berth ? ' · ' + data.berth : ''}`} />
          {data.otherPort ? <KV k={meta.otherPortLabel} v={data.otherPort} /> : null}
          <KV k="Cargo" v={`${data.cargo}${data.cargoQty ? ' · ' + data.cargoQty : ''}`} />
          <View style={[rp.row, { borderBottomWidth: 0 }]}>
            <Text style={rp.cellK}>{data.kind === 'ARRIVAL' ? 'Arrived (All Fast)' : 'Departed (COSP)'}</Text>
            <Text style={[rp.cellV, { fontWeight: 700, color: NAVY }]}>{keyTime}</Text>
          </View>
        </View>

        <Text style={rp.secCap}>Movement Log</Text>
        <View style={{ borderWidth: 1, borderColor: LINE, borderRadius: 5, overflow: 'hidden' }}>
          <View style={rp.tHead}>
            <Text style={[rp.th, { width: '24%' }]}>Date</Text>
            <Text style={[rp.th, { width: '16%' }]}>Time</Text>
            <Text style={[rp.th, { flex: 1 }]}>Event</Text>
          </View>
          {data.events.map((e, i) => (
            <View key={i} style={[rp.tRow, i === data.events.length - 1 ? { borderBottomWidth: 0 } : {}]}>
              <Text style={[rp.td, { width: '24%' }]}>{e.date}</Text>
              <Text style={[rp.td, { width: '16%', fontFamily: 'Inter', fontWeight: 700, color: NAVY }]}>{e.time}</Text>
              <Text style={[rp.td, { flex: 1 }]}>{e.desc}</Text>
            </View>
          ))}
        </View>

        {data.remarks ? (
          <>
            <Text style={rp.remarkCap}>Remarks</Text>
            <Text style={rp.remark}>{data.remarks}</Text>
          </>
        ) : null}

        <View style={rp.signRow}>
          <View style={rp.signBox}>
            <Text style={rp.signCap}>Reported by — Port Agent</Text>
            <View style={rp.signLine} />
            <Text style={rp.signName}>{t.companyName}</Text>
            <Text style={rp.signSub}>Master: {data.masterName || '—'}</Text>
          </View>
          <View style={rp.signBox}>
            <Text style={rp.signCap}>Acknowledged</Text>
            <View style={rp.signLine} />
            <Text style={rp.signName}>{data.toName}</Text>
            <Text style={rp.signSub}>Date &amp; time of receipt: ____________</Text>
          </View>
        </View>

        <DocFooter left={footRef} issuedAt={lastEvent?.date ?? ''} />
      </Page>
    </Document>
  )
}
