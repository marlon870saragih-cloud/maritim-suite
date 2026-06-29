import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { NAVY, GOLD, INK, GRAY, LINE, ROW, WHITE, base, Letterhead, DocFooter } from './base'
import { ullageTotalVolume, ullageTotalMt, type UllageData } from './ullage-data'

const num = (n: number, d = 1) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })

const ul = StyleSheet.create({
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
  cNo: { width: 20 },
  cTank: { flex: 1 },
  cUll: { width: 70, textAlign: 'right' },
  cTemp: { width: 56, textAlign: 'right' },
  cVol: { width: 90, textAlign: 'right' },
  tNo: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8, color: GOLD },
  tTank: { fontFamily: 'Inter', fontWeight: 600, fontSize: 8.3, color: NAVY },
  td: { fontFamily: 'Inter', fontSize: 8.3, color: INK },

  totRow: { flexDirection: 'row', backgroundColor: ROW, paddingVertical: 6, paddingHorizontal: 8, borderTopWidth: 1.5, borderTopColor: NAVY },
  totLabel: { flex: 1, fontFamily: 'Inter', fontWeight: 700, fontSize: 8.5, color: NAVY },
  totVol: { width: 90, textAlign: 'right', fontFamily: 'Inter', fontWeight: 700, fontSize: 8.5, color: NAVY },

  mtWrap: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 },
  mtBox: { width: 280, borderWidth: 1, borderColor: NAVY, borderRadius: 6, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mtCap: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 0.6, color: GRAY, textTransform: 'uppercase' },
  mtSub: { fontFamily: 'Inter', fontSize: 7.5, color: GRAY, marginTop: 2 },
  mtVal: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 16, color: NAVY },

  remarkCap: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 1.4, color: GOLD, textTransform: 'uppercase', marginTop: 14, marginBottom: 3 },
  remark: { fontFamily: 'Inter', fontSize: 8.5, color: GRAY, lineHeight: 1.5 },

  signRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 28 },
  signBox: { width: 200 },
  signCap: { fontFamily: 'Inter', fontSize: 8, color: GRAY },
  signLine: { borderBottomWidth: 1, borderBottomColor: '#334155', height: 30, marginTop: 6, marginBottom: 6 },
  signName: { fontFamily: 'Inter', fontWeight: 700, fontSize: 9, color: NAVY },
})

function PCell({ k, v }: { k: string; v: string }) {
  return (
    <View style={ul.pCell}>
      <Text style={ul.pK}>{k}</Text>
      <Text style={ul.pV}>{v || '—'}</Text>
    </View>
  )
}

export function UllageDocument({ data }: { data: UllageData }) {
  const t = data.tenant
  const totalVol = ullageTotalVolume(data)
  const totalMt = ullageTotalMt(data)
  const footRef = `${data.docNumber} · ${data.vesselName} · ${data.port}`

  return (
    <Document title={data.docNumber} author={t.companyName}>
      <Page size="A4" style={base.page}>
        <Letterhead
          tenant={t}
          right={
            <>
              <Text style={ul.title}>ULLAGE REPORT</Text>
              <Text style={ul.sub}>Cargo Tank Measurement</Text>
              <Text style={ul.no}>No. {data.docNumber}</Text>
            </>
          }
        />

        <View style={ul.partGrid}>
          <PCell k="Vessel" v={data.vesselName} />
          <PCell k="IMO / Flag" v={`${data.imo}${data.flag ? ' · ' + data.flag : ''}`} />
          <PCell k="Port / Voyage" v={`${data.port}${data.voyageNo ? ' · ' + data.voyageNo : ''}`} />
          <PCell k="Tanggal" v={data.date} />
          <PCell k="Product" v={data.product} />
          <PCell k="Condition" v={data.condition} />
          <PCell k="Density @15°C" v={`${data.densityKgL} kg/L`} />
          <PCell k="Surveyor" v={data.surveyor} />
        </View>

        <Text style={ul.cap}>Pengukuran Tangki</Text>
        <View style={{ borderWidth: 1, borderColor: LINE, borderRadius: 5, overflow: 'hidden' }}>
          <View style={ul.thead}>
            <Text style={[ul.th, ul.cNo]}>#</Text>
            <Text style={[ul.th, ul.cTank]}>Tank</Text>
            <Text style={[ul.th, ul.cUll]}>Ullage</Text>
            <Text style={[ul.th, ul.cTemp]}>Temp °C</Text>
            <Text style={[ul.th, ul.cVol]}>Volume (m³)</Text>
          </View>
          {data.tanks.map((tk, i) => (
            <View key={i} style={[ul.row, i % 2 ? ul.rowAlt : {}]} wrap={false}>
              <Text style={[ul.tNo, ul.cNo]}>{i + 1}</Text>
              <Text style={[ul.tTank, ul.cTank]}>{tk.tank}</Text>
              <Text style={[ul.td, ul.cUll]}>{tk.ullage}</Text>
              <Text style={[ul.td, ul.cTemp]}>{tk.tempC}</Text>
              <Text style={[ul.td, ul.cVol, { fontWeight: 700, color: NAVY }]}>{num(tk.volumeM3, 1)}</Text>
            </View>
          ))}
          <View style={ul.totRow}>
            <Text style={ul.totLabel}>Total Observed Volume</Text>
            <Text style={ul.totVol}>{num(totalVol, 1)} m³</Text>
          </View>
        </View>

        <View style={ul.mtWrap}>
          <View style={ul.mtBox}>
            <View>
              <Text style={ul.mtCap}>Total Quantity</Text>
              <Text style={ul.mtSub}>{num(totalVol, 1)} m³ × {data.densityKgL} kg/L</Text>
            </View>
            <Text style={ul.mtVal}>{num(totalMt, 3)} MT</Text>
          </View>
        </View>

        {data.remarks ? (
          <>
            <Text style={ul.remarkCap}>Remarks</Text>
            <Text style={ul.remark}>{data.remarks}</Text>
          </>
        ) : null}

        <View style={ul.signRow}>
          <View style={ul.signBox}>
            <Text style={ul.signCap}>Surveyor</Text>
            <View style={ul.signLine} />
            <Text style={ul.signName}>{data.surveyor}</Text>
          </View>
          <View style={ul.signBox}>
            <Text style={ul.signCap}>Chief Officer / Master</Text>
            <View style={ul.signLine} />
            <Text style={ul.signName}>{data.vesselName}</Text>
          </View>
        </View>

        <DocFooter left={footRef} issuedAt={data.date} />
      </Page>
    </Document>
  )
}
