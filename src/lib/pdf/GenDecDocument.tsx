import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { NAVY, GOLD, INK, GRAY, LINE, ROW, WHITE, base, Letterhead, DocFooter } from './base'
import { type GenDecData } from './gendec-data'

const gd = StyleSheet.create({
  title: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 19, color: NAVY, letterSpacing: 0.4 },
  sub: { fontFamily: 'Inter', fontSize: 6.5, letterSpacing: 1, color: GRAY, marginTop: 1, textTransform: 'uppercase' },
  no: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8, letterSpacing: 1, color: GOLD, marginTop: 2, textTransform: 'uppercase' },

  grid: { marginTop: 16, borderWidth: 1, borderColor: LINE, borderRadius: 5, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '50%', flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: LINE },
  cellFull: { width: '100%', flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: LINE },
  k: { width: '34%', backgroundColor: ROW, paddingVertical: 5, paddingHorizontal: 10, fontFamily: 'Inter', fontWeight: 700, fontSize: 7.3, color: GRAY, textTransform: 'uppercase' },
  kFull: { width: '17%', backgroundColor: ROW, paddingVertical: 5, paddingHorizontal: 10, fontFamily: 'Inter', fontWeight: 700, fontSize: 7.3, color: GRAY, textTransform: 'uppercase' },
  v: { flex: 1, paddingVertical: 5, paddingHorizontal: 10, fontFamily: 'Inter', fontWeight: 600, fontSize: 8.6, color: INK },

  secCap: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 1.4, color: GOLD, textTransform: 'uppercase', marginTop: 16, marginBottom: 6 },

  attRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4.5, paddingHorizontal: 11, borderBottomWidth: 1, borderBottomColor: LINE },
  attRowAlt: { backgroundColor: ROW },
  attLabel: { fontFamily: 'Inter', fontSize: 8.6, color: INK },
  attCopies: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8.6, color: NAVY },
  attBox: { borderWidth: 1, borderColor: LINE, borderRadius: 5, overflow: 'hidden' },
  attHead: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: NAVY, paddingVertical: 5, paddingHorizontal: 11 },
  attHeadT: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, color: WHITE, textTransform: 'uppercase', letterSpacing: 0.6 },

  remark: { fontFamily: 'Inter', fontSize: 8.5, color: GRAY, lineHeight: 1.5, marginTop: 4 },

  signRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 28 },
  signBox: { width: 210 },
  signCap: { fontFamily: 'Inter', fontSize: 8, color: GRAY },
  signLine: { borderBottomWidth: 1, borderBottomColor: '#334155', height: 30, marginTop: 6, marginBottom: 7 },
  signName: { fontFamily: 'Inter', fontWeight: 700, fontSize: 9.5, color: NAVY },
  signSub: { fontFamily: 'Inter', fontSize: 8, color: GRAY, marginTop: 1 },
})

function Cell({ k, v, full }: { k: string; v: string; full?: boolean }) {
  return (
    <View style={full ? gd.cellFull : gd.cell}>
      <Text style={full ? gd.kFull : gd.k}>{k}</Text>
      <Text style={gd.v}>{v}</Text>
    </View>
  )
}

export function GenDecDocument({ data }: { data: GenDecData }) {
  const t = data.tenant
  const footRef = `${data.docNumber} · ${data.vesselName} · ${data.port}`

  return (
    <Document title={data.docNumber} author={t.companyName}>
      <Page size="A4" style={base.page}>
        <Letterhead
          tenant={t}
          right={
            <>
              <Text style={gd.title}>GENERAL DECLARATION</Text>
              <Text style={gd.sub}>IMO FAL Form 1</Text>
              <Text style={gd.no}>No. {data.docNumber}</Text>
            </>
          }
        />

        <View style={gd.grid}>
          <Cell k="Vessel" v={data.vesselName} />
          <Cell k="IMO / Call Sign" v={`${data.imo}${data.callSign ? ' · ' + data.callSign : ''}`} />
          <Cell k="Flag" v={data.flag || '—'} />
          <Cell k="Type / GRT" v={`${data.vesselType || '—'}${data.grt ? ' · ' + data.grt : ''}`} />
          <Cell k="Arr / Dep" v={data.mode} />
          <Cell k="Date & Time" v={data.dateTime} />
          <Cell k="Port" v={data.port} />
          <Cell k="Berth" v={data.berth || '—'} />
          <Cell k="Last Port" v={data.lastPort} />
          <Cell k="Next Port" v={data.nextPort} />
          <Cell k="Voyage" v={data.voyage || '—'} />
          <Cell k="Master" v={data.master} />
          <Cell k="Crew / Pax" v={`${data.crewCount} crew · ${data.passengerCount} pax`} />
          <Cell k="Cargo (brief)" v={data.cargoBrief} />
        </View>

        <Text style={gd.secCap}>Dokumen Lampiran / Attached Documents</Text>
        <View style={gd.attBox}>
          <View style={gd.attHead}>
            <Text style={gd.attHeadT}>Document</Text>
            <Text style={gd.attHeadT}>Copies</Text>
          </View>
          {data.attachments.map((a, i) => (
            <View key={i} style={[gd.attRow, i % 2 ? gd.attRowAlt : {}]}>
              <Text style={gd.attLabel}>{a.label}</Text>
              <Text style={gd.attCopies}>{a.copies}</Text>
            </View>
          ))}
        </View>

        {data.remarks ? (
          <>
            <Text style={gd.secCap}>Remarks</Text>
            <Text style={gd.remark}>{data.remarks}</Text>
          </>
        ) : null}

        <View style={gd.signRow}>
          <View style={gd.signBox}>
            <Text style={gd.signCap}>Master</Text>
            <View style={gd.signLine} />
            <Text style={gd.signName}>{data.master || 'Master'}</Text>
            <Text style={gd.signSub}>MV/MT {data.vesselName}</Text>
          </View>
          <View style={gd.signBox}>
            <Text style={gd.signCap}>{data.signRole || 'Port Agent'}</Text>
            <View style={gd.signLine} />
            <Text style={gd.signName}>{t.companyName}</Text>
            <Text style={gd.signSub}>Authorised Agent</Text>
          </View>
        </View>

        <DocFooter left={footRef} issuedAt={''} />
      </Page>
    </Document>
  )
}
