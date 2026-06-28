import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { NAVY, GOLD, INK, GRAY, LINE, ROW, WHITE, fmt, base, Letterhead, DocFooter } from './base'
import { type BdnData, bdnAmount } from './bdn-data'

const bd = StyleSheet.create({
  title: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 20, color: NAVY, letterSpacing: 0.5 },
  sub: { fontFamily: 'Inter', fontSize: 6.5, letterSpacing: 1, color: GRAY, marginTop: 1, textTransform: 'uppercase' },
  no: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8, letterSpacing: 1, color: GOLD, marginTop: 2, textTransform: 'uppercase' },

  // dua kolom info: kapal & pemasok
  twoCol: { flexDirection: 'row', gap: 16, marginTop: 16 },
  col: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 4, overflow: 'hidden' },
  colHead: { backgroundColor: ROW, paddingVertical: 5, paddingHorizontal: 11, fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 1.2, color: NAVY, textTransform: 'uppercase' },
  kv: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3.5, paddingHorizontal: 11 },
  k: { fontFamily: 'Inter', fontSize: 8, color: GRAY },
  v: { fontFamily: 'Inter', fontWeight: 600, fontSize: 8.5, color: INK, maxWidth: '60%', textAlign: 'right' },

  // spesifikasi produk
  prodHead: { flexDirection: 'row', backgroundColor: NAVY, paddingVertical: 6, paddingHorizontal: 11, marginTop: 16, borderRadius: 2 },
  prodHeadText: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7.5, letterSpacing: 1, color: WHITE, textTransform: 'uppercase' },
  specGrid: { borderWidth: 1, borderTopWidth: 0, borderColor: LINE, flexDirection: 'row', flexWrap: 'wrap' },
  spec: { width: '33.33%', paddingVertical: 7, paddingHorizontal: 11, borderBottomWidth: 1, borderRightWidth: 1, borderColor: LINE },
  specK: { fontFamily: 'Inter', fontSize: 6.8, letterSpacing: 0.6, color: GRAY, textTransform: 'uppercase' },
  specV: { fontFamily: 'Inter', fontWeight: 700, fontSize: 11, color: NAVY, marginTop: 2 },
  specUnit: { fontFamily: 'Inter', fontWeight: 400, fontSize: 7.5, color: GRAY },

  // nilai
  valueRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 14 },
  valueBox: { width: 260, borderWidth: 1, borderColor: LINE, borderRadius: 5, overflow: 'hidden' },
  valLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, paddingHorizontal: 13, borderBottomWidth: 1, borderBottomColor: LINE },
  valK: { fontFamily: 'Inter', fontSize: 9, color: GRAY },
  valV: { fontFamily: 'Inter', fontWeight: 700, fontSize: 9.5, color: NAVY },
  grand: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: NAVY, paddingVertical: 9, paddingHorizontal: 13 },
  grandLabel: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 11, color: WHITE },
  grandVal: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 14, color: WHITE },

  remarkCap: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 1.4, color: GOLD, textTransform: 'uppercase', marginTop: 16, marginBottom: 3 },
  remark: { fontFamily: 'Inter', fontSize: 8, color: GRAY, lineHeight: 1.5 },

  signRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 26 },
  signBox: { width: 200, alignItems: 'center' },
  signCap: { fontFamily: 'Inter', fontSize: 8, color: GRAY },
  signLine: { borderBottomWidth: 1, borderBottomColor: '#334155', height: 30, width: 180, marginTop: 6, marginBottom: 7 },
  signName: { fontFamily: 'Inter', fontWeight: 700, fontSize: 9.5, color: NAVY },
  signOrg: { fontFamily: 'Inter', fontSize: 8, color: GRAY, marginTop: 1 },
})

function KV({ k, v }: { k: string; v: string }) {
  return (
    <View style={bd.kv}>
      <Text style={bd.k}>{k}</Text>
      <Text style={bd.v}>{v}</Text>
    </View>
  )
}
function Spec({ k, v, unit, last }: { k: string; v: string; unit?: string; last?: boolean }) {
  return (
    <View style={[bd.spec, last ? { borderRightWidth: 0 } : {}]}>
      <Text style={bd.specK}>{k}</Text>
      <Text style={bd.specV}>
        {v}
        {unit ? <Text style={bd.specUnit}> {unit}</Text> : null}
      </Text>
    </View>
  )
}

export function BdnDocument({ data }: { data: BdnData }) {
  const t = data.tenant
  const amount = bdnAmount(data)
  const footRef = `${data.docNumber} · ${data.vesselName} · ${data.port}`

  return (
    <Document title={data.docNumber} author={t.companyName}>
      <Page size="A4" style={base.page}>
        <Letterhead
          tenant={t}
          right={
            <>
              <Text style={bd.title}>BUNKER DELIVERY NOTE</Text>
              <Text style={bd.sub}>MARPOL Annex VI</Text>
              <Text style={bd.no}>No. {data.docNumber}</Text>
            </>
          }
        />

        <View style={bd.twoCol}>
          <View style={bd.col}>
            <Text style={bd.colHead}>Kapal Penerima</Text>
            <KV k="Nama kapal" v={data.vesselName} />
            <KV k="IMO" v={data.imo} />
            {data.flag ? <KV k="Bendera" v={data.flag} /> : null}
            <KV k="Pelabuhan" v={data.port} />
            <KV k="Tanggal serah" v={data.deliveryDate} />
          </View>
          <View style={bd.col}>
            <Text style={bd.colHead}>Pemasok &amp; Pengantar</Text>
            <KV k="Pemasok" v={data.supplier} />
            {data.bargeName ? <KV k="Tongkang / truk" v={data.bargeName} /> : null}
            <KV k="Produk" v={data.productGrade} />
          </View>
        </View>

        <View style={bd.prodHead}>
          <Text style={bd.prodHeadText}>Spesifikasi Bahan Bakar</Text>
        </View>
        <View style={bd.specGrid}>
          <Spec k="Jumlah" v={fmt(data.quantityMt)} unit="MT" />
          <Spec k="Density @ 15°C" v={data.density15} unit="kg/m³" />
          <Spec k="Sulphur" v={data.sulphurPct} unit="% m/m" last />
          <Spec k="Viscosity" v={data.viscosity || '—'} unit={data.viscosity ? 'cSt' : ''} />
          <Spec k="Flash point" v={data.flashPoint || '—'} unit={data.flashPoint ? '°C' : ''} />
          <Spec k="Water content" v={data.waterPct || '—'} unit={data.waterPct ? '% v/v' : ''} last />
        </View>

        {data.pricePerMt ? (
          <View style={bd.valueRow}>
            <View style={bd.valueBox}>
              <View style={bd.valLine}>
                <Text style={bd.valK}>
                  {fmt(data.quantityMt)} MT × {data.currency} {fmt(data.pricePerMt)}/MT
                </Text>
                <Text style={bd.valV}>
                  {data.currency} {fmt(amount)}
                </Text>
              </View>
              <View style={bd.grand}>
                <Text style={bd.grandLabel}>Nilai Bunker</Text>
                <Text style={bd.grandVal}>
                  {data.currency} {fmt(amount)}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {data.remarks ? (
          <>
            <Text style={bd.remarkCap}>Catatan</Text>
            <Text style={bd.remark}>{data.remarks}</Text>
          </>
        ) : null}

        <View style={bd.signRow}>
          <View style={bd.signBox}>
            <Text style={bd.signCap}>Diserahkan oleh</Text>
            <View style={bd.signLine} />
            <Text style={bd.signName}>{data.signRole}</Text>
            <Text style={bd.signOrg}>{data.supplier}</Text>
          </View>
          <View style={bd.signBox}>
            <Text style={bd.signCap}>Diterima oleh</Text>
            <View style={bd.signLine} />
            <Text style={bd.signName}>{data.receiverName || 'Chief Engineer'}</Text>
            <Text style={bd.signOrg}>{data.vesselName}</Text>
          </View>
        </View>

        <DocFooter left={footRef} issuedAt={data.deliveryDate} />
      </Page>
    </Document>
  )
}
