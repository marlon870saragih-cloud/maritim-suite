import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { NAVY, GOLD, INK, GRAY, LINE, ROW, base, Letterhead, DocFooter } from './base'
import { type AppointmentData } from './appointment-data'

const ap = StyleSheet.create({
  title: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 19, color: NAVY, letterSpacing: 0.4 },
  sub: { fontFamily: 'Inter', fontSize: 6.5, letterSpacing: 1, color: GRAY, marginTop: 1, textTransform: 'uppercase' },
  no: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8, letterSpacing: 1, color: GOLD, marginTop: 2, textTransform: 'uppercase' },

  toWrap: { marginTop: 18 },
  kicker: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 1.6, color: GOLD, textTransform: 'uppercase', marginBottom: 5 },
  toName: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 13, color: NAVY },
  toLine: { fontFamily: 'Inter', fontSize: 8.5, color: GRAY, marginTop: 2, lineHeight: 1.45 },

  re: { fontFamily: 'Inter', fontWeight: 700, fontSize: 9.5, color: NAVY, marginTop: 14 },
  intro: { fontFamily: 'Inter', fontSize: 9.5, color: INK, lineHeight: 1.6, marginTop: 8 },

  grid: { marginTop: 14, borderWidth: 1, borderColor: LINE, borderRadius: 5, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '50%', flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: LINE },
  k: { width: '34%', backgroundColor: ROW, paddingVertical: 5, paddingHorizontal: 10, fontFamily: 'Inter', fontWeight: 700, fontSize: 7.3, color: GRAY, textTransform: 'uppercase' },
  v: { flex: 1, paddingVertical: 5, paddingHorizontal: 10, fontFamily: 'Inter', fontWeight: 600, fontSize: 8.6, color: INK },

  scopeCap: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 1.4, color: GOLD, textTransform: 'uppercase', marginTop: 16, marginBottom: 6 },
  scopeRow: { flexDirection: 'row', marginBottom: 5, paddingRight: 10 },
  scopeNum: { width: 18, fontFamily: 'Inter', fontWeight: 700, fontSize: 8.6, color: GOLD },
  scopeText: { flex: 1, fontFamily: 'Inter', fontSize: 8.8, color: INK, lineHeight: 1.5 },

  validity: { fontFamily: 'Inter', fontSize: 8.6, color: GRAY, lineHeight: 1.5, marginTop: 12 },

  signWrap: { marginTop: 28, alignItems: 'flex-end' },
  signCap: { fontFamily: 'Inter', fontSize: 8, color: GRAY },
  signLine: { borderBottomWidth: 1, borderBottomColor: '#334155', height: 32, width: 210, marginTop: 6, marginBottom: 7 },
  signName: { fontFamily: 'Inter', fontWeight: 700, fontSize: 10, color: NAVY },
  signSub: { fontFamily: 'Inter', fontSize: 8, color: GRAY, marginTop: 1 },
})

function Cell({ k, v }: { k: string; v: string }) {
  return (
    <View style={ap.cell}>
      <Text style={ap.k}>{k}</Text>
      <Text style={ap.v}>{v}</Text>
    </View>
  )
}

export function AppointmentDocument({ data }: { data: AppointmentData }) {
  const t = data.tenant
  const footRef = `${data.docNumber} · ${data.vesselName} · ${data.port}`

  return (
    <Document title={data.docNumber} author={t.companyName}>
      <Page size="A4" style={base.page}>
        <Letterhead
          tenant={t}
          right={
            <>
              <Text style={ap.title}>AGENCY APPOINTMENT</Text>
              <Text style={ap.sub}>Letter of Appointment</Text>
              <Text style={ap.no}>No. {data.docNumber}</Text>
            </>
          }
        />

        <View style={ap.toWrap}>
          <Text style={ap.kicker}>Kepada / To</Text>
          <Text style={ap.toName}>{data.toName}</Text>
          {data.toAddress ? <Text style={ap.toLine}>{data.toAddress}</Text> : null}
          {data.toAttn ? <Text style={ap.toLine}>Attn: {data.toAttn}</Text> : null}
        </View>

        <Text style={ap.re}>Re: Appointment as Port Agent — MV/MT {data.vesselName} at {data.port}</Text>
        <Text style={ap.intro}>{data.intro}</Text>

        <View style={ap.grid}>
          <Cell k="Vessel" v={data.vesselName} />
          <Cell k="IMO / Flag" v={`${data.imo}${data.flag ? ' · ' + data.flag : ''}`} />
          <Cell k="Port" v={data.port} />
          <Cell k="ETA" v={data.eta || '—'} />
          <Cell k="Voyage" v={data.voyage || '—'} />
          <Cell k="Date" v={data.date} />
        </View>

        <Text style={ap.scopeCap}>Scope of Services</Text>
        {data.scope.map((s, i) => (
          <View key={i} style={ap.scopeRow}>
            <Text style={ap.scopeNum}>{i + 1}.</Text>
            <Text style={ap.scopeText}>{s}</Text>
          </View>
        ))}

        {data.validity ? <Text style={ap.validity}>{data.validity}</Text> : null}

        <View style={ap.signWrap}>
          <Text style={ap.signCap}>For and on behalf of</Text>
          <View style={ap.signLine} />
          <Text style={ap.signName}>{data.signName}</Text>
          <Text style={ap.signSub}>{data.signRole} · {t.companyName}</Text>
        </View>

        <DocFooter left={footRef} issuedAt={data.date} />
      </Page>
    </Document>
  )
}
