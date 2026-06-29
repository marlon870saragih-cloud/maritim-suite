import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { NAVY, GOLD, INK, GRAY, LINE, ROW, WHITE, base, Letterhead, DocFooter } from './base'
import { computeLaytime, rowCountedHours, type TimeSheetData } from './timesheet-data'

const fmt = (n: number) => (n || 0).toLocaleString('en-US')
const hrs = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString('en-US')} h`

const ts = StyleSheet.create({
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
  row: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: LINE },
  rowAlt: { backgroundColor: ROW },
  cDate: { width: 64 },
  cTime: { width: 76 },
  cDesc: { flex: 1 },
  cPct: { width: 38, textAlign: 'right' },
  cHrs: { width: 52, textAlign: 'right' },
  td: { fontFamily: 'Inter', fontSize: 8, color: INK },
  tdG: { fontFamily: 'Inter', fontSize: 8, color: GRAY },

  sumWrap: { flexDirection: 'row', gap: 10, marginTop: 14 },
  sumBox: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 5, padding: 10 },
  sumCap: { fontFamily: 'Inter', fontWeight: 700, fontSize: 6.8, letterSpacing: 0.6, color: GRAY, textTransform: 'uppercase' },
  sumVal: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 13, color: NAVY, marginTop: 3 },

  resultBox: { marginTop: 12, borderWidth: 1, borderRadius: 6, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resLabel: { fontFamily: 'Inter', fontWeight: 700, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 },
  resSub: { fontFamily: 'Inter', fontSize: 8, color: GRAY, marginTop: 2 },
  resAmt: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 16 },

  remarkCap: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 1.4, color: GOLD, textTransform: 'uppercase', marginTop: 14, marginBottom: 3 },
  remark: { fontFamily: 'Inter', fontSize: 8.5, color: GRAY, lineHeight: 1.5 },

  signWrap: { marginTop: 22, alignItems: 'flex-end' },
  signCap: { fontFamily: 'Inter', fontSize: 8, color: GRAY },
  signLine: { borderBottomWidth: 1, borderBottomColor: '#334155', height: 30, width: 200, marginTop: 6, marginBottom: 7 },
  signName: { fontFamily: 'Inter', fontWeight: 700, fontSize: 9.5, color: NAVY },
  signSub: { fontFamily: 'Inter', fontSize: 8, color: GRAY, marginTop: 1 },
})

const DEMUR = '#B91C1C'
const DESP = '#15803D'

function PCell({ k, v }: { k: string; v: string }) {
  return (
    <View style={ts.pCell}>
      <Text style={ts.pK}>{k}</Text>
      <Text style={ts.pV}>{v || '—'}</Text>
    </View>
  )
}

export function TimeSheetDocument({ data }: { data: TimeSheetData }) {
  const t = data.tenant
  const r = computeLaytime(data)
  const footRef = `${data.docNumber} · ${data.vesselName} · ${data.port}`
  const isDemur = r.kind === 'DEMURRAGE'
  const color = r.kind === 'EVEN' ? NAVY : isDemur ? DEMUR : DESP

  return (
    <Document title={data.docNumber} author={t.companyName}>
      <Page size="A4" style={base.page}>
        <Letterhead
          tenant={t}
          right={
            <>
              <Text style={ts.title}>TIME SHEET</Text>
              <Text style={ts.sub}>Laytime Statement</Text>
              <Text style={ts.no}>No. {data.docNumber}</Text>
            </>
          }
        />

        <View style={ts.partGrid}>
          <PCell k="Vessel" v={data.vesselName} />
          <PCell k="IMO / Flag" v={`${data.imo}${data.flag ? ' · ' + data.flag : ''}`} />
          <PCell k="Port / Voyage" v={`${data.port}${data.voyageNo ? ' · ' + data.voyageNo : ''}`} />
          <PCell k="Charterer" v={data.charterer} />
          <PCell k="Operation" v={data.operation} />
          <PCell k="Cargo" v={`${data.cargo}${data.cargoQty ? ' · ' + data.cargoQty : ''}`} />
          <PCell k="NOR Tendered" v={data.norTendered} />
          <PCell k="Laytime Commenced" v={data.laytimeCommenced} />
        </View>

        <Text style={ts.cap}>Perincian Waktu</Text>
        <View style={{ borderWidth: 1, borderColor: LINE, borderRadius: 5, overflow: 'hidden' }}>
          <View style={ts.thead}>
            <Text style={[ts.th, ts.cDate]}>Date</Text>
            <Text style={[ts.th, ts.cTime]}>From – To</Text>
            <Text style={[ts.th, ts.cDesc]}>Description</Text>
            <Text style={[ts.th, ts.cPct]}>%</Text>
            <Text style={[ts.th, ts.cHrs]}>Counted</Text>
          </View>
          {data.rows.map((row, i) => (
            <View key={i} style={[ts.row, i % 2 ? ts.rowAlt : {}, i === data.rows.length - 1 ? { borderBottomWidth: 0 } : {}]} wrap={false}>
              <Text style={[ts.tdG, ts.cDate]}>{row.date}</Text>
              <Text style={[ts.td, ts.cTime]}>{row.fromTime}–{row.toTime}</Text>
              <Text style={[ts.td, ts.cDesc]}>{row.description}</Text>
              <Text style={[ts.tdG, ts.cPct]}>{row.percent}%</Text>
              <Text style={[ts.td, ts.cHrs, { fontWeight: 700, color: NAVY }]}>{hrs(rowCountedHours(row))}</Text>
            </View>
          ))}
        </View>

        <View style={ts.sumWrap}>
          <View style={ts.sumBox}>
            <Text style={ts.sumCap}>Laytime Allowed</Text>
            <Text style={ts.sumVal}>{hrs(r.allowedHours)}</Text>
          </View>
          <View style={ts.sumBox}>
            <Text style={ts.sumCap}>Laytime Used</Text>
            <Text style={ts.sumVal}>{hrs(r.usedHours)}</Text>
          </View>
          <View style={ts.sumBox}>
            <Text style={ts.sumCap}>Balance</Text>
            <Text style={[ts.sumVal, { color }]}>{r.balanceHours >= 0 ? '+' : '−'}{hrs(Math.abs(r.balanceHours))}</Text>
          </View>
        </View>

        <View style={[ts.resultBox, { borderColor: color }]}>
          <View>
            <Text style={[ts.resLabel, { color }]}>
              {r.kind === 'EVEN' ? 'Laytime Even' : isDemur ? 'Demurrage' : 'Despatch'}
            </Text>
            <Text style={ts.resSub}>
              {r.kind === 'EVEN'
                ? 'Waktu terpakai sama dengan diizinkan'
                : `${(Math.round(r.days * 1000) / 1000).toLocaleString('en-US')} hari × ${data.currency} ${fmt(isDemur ? data.demurrageRate : data.despatchRate)}/hari`}
            </Text>
          </View>
          <Text style={[ts.resAmt, { color }]}>{data.currency} {fmt(r.amount)}</Text>
        </View>

        {data.remarks ? (
          <>
            <Text style={ts.remarkCap}>Remarks</Text>
            <Text style={ts.remark}>{data.remarks}</Text>
          </>
        ) : null}

        <View style={ts.signWrap}>
          <Text style={ts.signCap}>Disusun oleh — Port Agent</Text>
          <View style={ts.signLine} />
          <Text style={ts.signName}>{t.companyName}</Text>
          <Text style={ts.signSub}>Tanggal: {data.date}</Text>
        </View>

        <DocFooter left={footRef} issuedAt={data.date} />
      </Page>
    </Document>
  )
}
