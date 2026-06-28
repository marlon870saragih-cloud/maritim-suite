import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { NAVY, GOLD, INK, GRAY, GRAYL, LINE, ROW, WHITE, fmt, base, Letterhead, DocFooter } from './base'
import { type SoaData, rowBalance, computeSoaTotals } from './soa-data'

const so = StyleSheet.create({
  title: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 21, color: NAVY, letterSpacing: 0.5 },
  sub: { fontFamily: 'Inter', fontSize: 6.5, letterSpacing: 1, color: GRAY, marginTop: 1, textTransform: 'uppercase' },
  no: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8, letterSpacing: 1, color: GOLD, marginTop: 2, textTransform: 'uppercase' },

  topRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, gap: 24 },
  kicker: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 1.6, color: GOLD, textTransform: 'uppercase', marginBottom: 6 },
  toName: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 13, color: NAVY },
  toLine: { fontFamily: 'Inter', fontSize: 8, color: GRAY, marginTop: 3, lineHeight: 1.45 },
  metaBox: { width: 230, borderWidth: 1, borderColor: LINE, borderRadius: 4, overflow: 'hidden' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, paddingHorizontal: 11 },
  metaLabel: { fontFamily: 'Inter', fontSize: 7.5, color: GRAY },
  metaVal: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8.5, color: NAVY },

  thead: { flexDirection: 'row', backgroundColor: NAVY, paddingVertical: 6, paddingHorizontal: 10, marginTop: 18, borderRadius: 2 },
  th: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 0.6, color: WHITE, textTransform: 'uppercase' },
  thDate: { width: 64 },
  thNo: { width: 110 },
  thRef: { flex: 1 },
  thAmt: { width: 84, textAlign: 'right' },
  thPaid: { width: 84, textAlign: 'right' },
  thBal: { width: 88, textAlign: 'right' },

  row: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: LINE },
  cDate: { width: 64, fontFamily: 'Inter', fontSize: 8, color: GRAY },
  cNo: { width: 110, fontFamily: 'Inter', fontWeight: 600, fontSize: 8.5, color: INK },
  cRef: { flex: 1, fontFamily: 'Inter', fontSize: 8, color: GRAYL, paddingRight: 6 },
  cAmt: { width: 84, textAlign: 'right', fontFamily: 'Inter', fontSize: 8.5, color: INK },
  cPaid: { width: 84, textAlign: 'right', fontFamily: 'Inter', fontSize: 8.5, color: '#1E7A45' },
  cBal: { width: 88, textAlign: 'right', fontFamily: 'Inter', fontWeight: 700, fontSize: 8.5, color: NAVY },

  opening: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: LINE, backgroundColor: ROW },
  openLabel: { flex: 1, fontFamily: 'Inter', fontWeight: 600, fontSize: 8.5, color: GRAY },

  bottom: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, gap: 24 },
  notesBox: { flex: 1 },
  notesCap: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 1.4, color: GOLD, textTransform: 'uppercase', marginBottom: 3 },
  notes: { fontFamily: 'Inter', fontSize: 8, color: GRAY, lineHeight: 1.5 },
  bankBox: { borderWidth: 1, borderColor: LINE, borderRadius: 4, backgroundColor: ROW, padding: 10, marginTop: 10 },
  bankRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  bankK: { fontFamily: 'Inter', fontSize: 7.6, color: GRAY },
  bankV: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7.8, color: NAVY },

  totBox: { width: 240, borderWidth: 1, borderColor: LINE, borderRadius: 5, overflow: 'hidden' },
  totLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, paddingHorizontal: 13, borderBottomWidth: 1, borderBottomColor: LINE },
  totLabel: { fontFamily: 'Inter', fontSize: 9, color: GRAY },
  totVal: { fontFamily: 'Inter', fontWeight: 700, fontSize: 9.5, color: NAVY },
  grand: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: NAVY, paddingVertical: 10, paddingHorizontal: 13 },
  grandLabel: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 11, color: WHITE },
  grandVal: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 14, color: WHITE },

  signWrap: { marginTop: 26, alignItems: 'flex-end' },
  signCap: { fontFamily: 'Inter', fontSize: 8, color: GRAY },
  signLine: { borderBottomWidth: 1, borderBottomColor: '#334155', height: 30, width: 200, marginTop: 6, marginBottom: 7 },
  signName: { fontFamily: 'Inter', fontWeight: 700, fontSize: 9.5, color: NAVY },
  signOrg: { fontFamily: 'Inter', fontSize: 8, color: GRAY, marginTop: 1 },
})

function MetaRow({ label, value, alt }: { label: string; value: string; alt?: boolean }) {
  return (
    <View style={[so.metaRow, alt ? { backgroundColor: ROW } : {}]}>
      <Text style={so.metaLabel}>{label}</Text>
      <Text style={so.metaVal}>{value}</Text>
    </View>
  )
}

export function SoaDocument({ data }: { data: SoaData }) {
  const t = data.tenant
  const { billed, paid, outstanding } = computeSoaTotals(data)
  const footRef = `${data.docNumber} · ${data.toName} · ${data.period}`

  return (
    <Document title={data.docNumber} author={t.companyName}>
      <Page size="A4" style={base.page}>
        <Letterhead
          tenant={t}
          right={
            <>
              <Text style={so.title}>STATEMENT OF ACCOUNT</Text>
              <Text style={so.sub}>Rekap Tagihan</Text>
              <Text style={so.no}>No. {data.docNumber}</Text>
            </>
          }
        />

        <View style={so.topRow}>
          <View style={{ flex: 1, maxWidth: 280 }}>
            <Text style={so.kicker}>Kepada</Text>
            <Text style={so.toName}>{data.toName}</Text>
            {data.toAddress ? <Text style={so.toLine}>{data.toAddress}</Text> : null}
            {data.toAttn ? <Text style={so.toLine}>Attn: {data.toAttn}</Text> : null}
            {data.toNpwp ? <Text style={so.toLine}>NPWP {data.toNpwp}</Text> : null}
          </View>
          <View style={so.metaBox}>
            <MetaRow label="Tanggal" value={data.statementDate} alt />
            <MetaRow label="Periode" value={data.period} />
            <MetaRow label="Mata uang" value={data.currency} alt />
          </View>
        </View>

        <View style={so.thead}>
          <Text style={[so.th, so.thDate]}>Tanggal</Text>
          <Text style={[so.th, so.thNo]}>No. Invoice</Text>
          <Text style={[so.th, so.thRef]}>Keterangan</Text>
          <Text style={[so.th, so.thAmt]}>Tagihan</Text>
          <Text style={[so.th, so.thPaid]}>Dibayar</Text>
          <Text style={[so.th, so.thBal]}>Saldo</Text>
        </View>

        {data.openingBalance ? (
          <View style={so.opening}>
            <Text style={so.openLabel}>Saldo awal periode ({data.period})</Text>
            <Text style={[so.cBal, { width: 88 }]}>{fmt(data.openingBalance)}</Text>
          </View>
        ) : null}

        {data.rows.map((r, i) => (
          <View key={i} style={so.row}>
            <Text style={so.cDate}>{r.date}</Text>
            <Text style={so.cNo}>{r.docNumber}</Text>
            <Text style={so.cRef}>{r.ref ?? ''}</Text>
            <Text style={so.cAmt}>{fmt(r.amount)}</Text>
            <Text style={so.cPaid}>{r.paid ? fmt(r.paid) : '—'}</Text>
            <Text style={so.cBal}>{fmt(rowBalance(r))}</Text>
          </View>
        ))}

        <View style={so.bottom}>
          <View style={so.notesBox}>
            {data.notes ? (
              <>
                <Text style={so.notesCap}>Catatan</Text>
                <Text style={so.notes}>{data.notes}</Text>
              </>
            ) : null}
            <View style={so.bankBox}>
              <View style={so.bankRow}><Text style={so.bankK}>Bank</Text><Text style={so.bankV}>{t.bankName ?? '—'}</Text></View>
              <View style={so.bankRow}><Text style={so.bankK}>No. Rekening</Text><Text style={so.bankV}>{t.bankAccount ?? '—'}</Text></View>
              <View style={so.bankRow}><Text style={so.bankK}>Atas Nama</Text><Text style={so.bankV}>{t.bankHolder ?? t.companyName}</Text></View>
            </View>
          </View>
          <View style={so.totBox}>
            {data.openingBalance ? (
              <View style={so.totLine}><Text style={so.totLabel}>Saldo awal</Text><Text style={so.totVal}>{data.currency} {fmt(data.openingBalance)}</Text></View>
            ) : null}
            <View style={so.totLine}><Text style={so.totLabel}>Total tagihan</Text><Text style={so.totVal}>{data.currency} {fmt(billed)}</Text></View>
            <View style={so.totLine}><Text style={so.totLabel}>Total dibayar</Text><Text style={[so.totVal, { color: '#1E7A45' }]}>({data.currency} {fmt(paid)})</Text></View>
            <View style={so.grand}>
              <Text style={so.grandLabel}>Saldo Terutang</Text>
              <Text style={so.grandVal}>{data.currency} {fmt(outstanding)}</Text>
            </View>
          </View>
        </View>

        <View style={so.signWrap}>
          <Text style={so.signCap}>Hormat kami,</Text>
          <View style={so.signLine} />
          <Text style={so.signName}>{data.signRole}</Text>
          <Text style={so.signOrg}>{t.companyName}</Text>
        </View>

        <DocFooter left={footRef} issuedAt={data.statementDate} />
      </Page>
    </Document>
  )
}
