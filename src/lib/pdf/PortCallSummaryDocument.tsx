import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { NAVY, GOLD, INK, GRAY, LINE, ROW, WHITE, base, Letterhead, DocFooter } from './base'
import { type PortCallSummaryData } from './pcsummary-data'

const fmt = (n: number) => (n || 0).toLocaleString('en-US')

const ps = StyleSheet.create({
  title: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 18, color: NAVY, letterSpacing: 0.5 },
  no: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8, letterSpacing: 1, color: GOLD, marginTop: 2, textTransform: 'uppercase' },

  partGrid: { marginTop: 16, borderWidth: 1, borderColor: LINE, borderRadius: 5, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap' },
  pCell: { width: '50%', flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: LINE },
  pK: { width: '36%', backgroundColor: ROW, paddingVertical: 5, paddingHorizontal: 10, fontFamily: 'Inter', fontWeight: 700, fontSize: 7.5, color: GRAY, textTransform: 'uppercase' },
  pV: { flex: 1, paddingVertical: 5, paddingHorizontal: 10, fontFamily: 'Inter', fontWeight: 600, fontSize: 8.8, color: INK },

  cap: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 1.4, color: GOLD, textTransform: 'uppercase', marginTop: 18, marginBottom: 6 },

  thead: { flexDirection: 'row', backgroundColor: NAVY, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 2 },
  th: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 0.5, color: WHITE, textTransform: 'uppercase' },
  row: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: LINE },
  rowAlt: { backgroundColor: ROW },
  tNo: { width: 22, fontFamily: 'Inter', fontWeight: 700, fontSize: 8, color: GOLD },
  tLabel: { width: 120, fontFamily: 'Inter', fontWeight: 600, fontSize: 8.5, color: NAVY },
  tNum: { flex: 1, fontFamily: 'Inter', fontSize: 8.5, color: INK },
  tStat: { width: 70, fontFamily: 'Inter', fontSize: 7.8, color: GRAY, textAlign: 'right', textTransform: 'uppercase' },
  empty: { fontFamily: 'Inter', fontSize: 8.5, color: GRAY, paddingVertical: 8, paddingHorizontal: 8 },

  finWrap: { flexDirection: 'row', gap: 10, marginTop: 6 },
  finBox: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 5, padding: 10 },
  finCap: { fontFamily: 'Inter', fontWeight: 700, fontSize: 6.8, letterSpacing: 0.6, color: GRAY, textTransform: 'uppercase' },
  finVal: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 12, color: NAVY, marginTop: 3 },
  finSub: { fontFamily: 'Inter', fontSize: 7, color: GRAY, marginTop: 2 },
  varPos: { color: '#B91C1C' },
  varNeg: { color: '#15803D' },

  remarkCap: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 1.4, color: GOLD, textTransform: 'uppercase', marginTop: 16, marginBottom: 3 },
  remark: { fontFamily: 'Inter', fontSize: 8.5, color: GRAY, lineHeight: 1.5 },

  signWrap: { marginTop: 24, alignItems: 'flex-end' },
  signCap: { fontFamily: 'Inter', fontSize: 8, color: GRAY },
  signLine: { borderBottomWidth: 1, borderBottomColor: '#334155', height: 30, width: 200, marginTop: 6, marginBottom: 7 },
  signName: { fontFamily: 'Inter', fontWeight: 700, fontSize: 9.5, color: NAVY },
  signSub: { fontFamily: 'Inter', fontSize: 8, color: GRAY, marginTop: 1 },
})

function PCell({ k, v }: { k: string; v: string }) {
  return (
    <View style={ps.pCell}>
      <Text style={ps.pK}>{k}</Text>
      <Text style={ps.pV}>{v || '—'}</Text>
    </View>
  )
}

export function PortCallSummaryDocument({ data }: { data: PortCallSummaryData }) {
  const t = data.tenant
  const f = data.finance
  const variance = f.fpda - f.epda
  const footRef = `${data.docNumber} · ${data.vesselName} · ${data.port}`

  return (
    <Document title={data.docNumber} author={t.companyName}>
      <Page size="A4" style={base.page}>
        <Letterhead
          tenant={t}
          right={
            <>
              <Text style={ps.title}>PORT CALL SUMMARY</Text>
              <Text style={ps.no}>No. {data.docNumber}</Text>
            </>
          }
        />

        <View style={ps.partGrid}>
          <PCell k="Vessel" v={data.vesselName} />
          <PCell k="IMO / Flag" v={`${data.imo}${data.flag ? ' · ' + data.flag : ''}`} />
          <PCell k="Port" v={`${data.port}${data.portCode ? ' (' + data.portCode + ')' : ''}`} />
          <PCell k="Principal" v={data.principal} />
          <PCell k="ETA / ETD" v={`${data.eta || '—'} → ${data.etd || '—'}`} />
          <PCell k="GT / NRT" v={`${data.gt || '—'} / ${data.nrt || '—'}`} />
          <PCell k="LOA / Draft" v={`${data.loa || '—'} / ${data.draft || '—'}`} />
          <PCell k="Cargo" v={data.cargo} />
        </View>

        <Text style={ps.cap}>Dokumen Diterbitkan</Text>
        <View style={{ borderWidth: 1, borderColor: LINE, borderRadius: 5, overflow: 'hidden' }}>
          <View style={ps.thead}>
            <Text style={[ps.th, { width: 22 }]}>#</Text>
            <Text style={[ps.th, { width: 120 }]}>Jenis</Text>
            <Text style={[ps.th, { flex: 1 }]}>Nomor</Text>
            <Text style={[ps.th, { width: 70, textAlign: 'right' }]}>Status</Text>
          </View>
          {data.documents.length === 0 ? (
            <Text style={ps.empty}>Belum ada dokumen terkait port call ini.</Text>
          ) : (
            data.documents.map((d, i) => (
              <View key={i} style={[ps.row, i % 2 ? ps.rowAlt : {}, i === data.documents.length - 1 ? { borderBottomWidth: 0 } : {}]} wrap={false}>
                <Text style={ps.tNo}>{i + 1}</Text>
                <Text style={ps.tLabel}>{d.label}</Text>
                <Text style={ps.tNum}>{d.docNumber}</Text>
                <Text style={ps.tStat}>{d.status}</Text>
              </View>
            ))
          )}
        </View>

        <Text style={ps.cap}>Rekap Finansial</Text>
        <View style={ps.finWrap}>
          <View style={ps.finBox}>
            <Text style={ps.finCap}>Estimasi (EPDA)</Text>
            <Text style={ps.finVal}>{fmt(f.epda)}</Text>
            <Text style={ps.finSub}>IDR</Text>
          </View>
          <View style={ps.finBox}>
            <Text style={ps.finCap}>Aktual (FPDA)</Text>
            <Text style={ps.finVal}>{fmt(f.fpda)}</Text>
            <Text style={[ps.finSub, variance > 0 ? ps.varPos : ps.varNeg]}>
              {variance > 0 ? '+' : ''}{fmt(variance)} vs estimasi
            </Text>
          </View>
          <View style={ps.finBox}>
            <Text style={ps.finCap}>Tagihan (Invoice)</Text>
            <Text style={ps.finVal}>{fmt(f.invoice)}</Text>
            <Text style={ps.finSub}>IDR</Text>
          </View>
        </View>

        {data.remarks ? (
          <>
            <Text style={ps.remarkCap}>Catatan</Text>
            <Text style={ps.remark}>{data.remarks}</Text>
          </>
        ) : null}

        <View style={ps.signWrap}>
          <Text style={ps.signCap}>Disusun oleh — {data.preparedBy}</Text>
          <View style={ps.signLine} />
          <Text style={ps.signName}>{t.companyName}</Text>
          <Text style={ps.signSub}>Tanggal: {data.date}</Text>
        </View>

        <DocFooter left={footRef} issuedAt={data.date} />
      </Page>
    </Document>
  )
}
