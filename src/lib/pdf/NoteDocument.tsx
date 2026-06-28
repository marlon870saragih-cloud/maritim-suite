import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { NAVY, GOLD, INK, GRAY, GRAYL, LINE, ROW, WHITE, fmt, base, Letterhead, DocFooter } from './base'
import { type NoteData, noteLineAmount, computeNoteTotals, NOTE_META } from './note-data'

const nt = StyleSheet.create({
  title: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 23, color: NAVY, letterSpacing: 1 },
  no: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8, letterSpacing: 1, color: GOLD, marginTop: 2, textTransform: 'uppercase' },

  topRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, gap: 24 },
  kicker: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 1.6, color: GOLD, textTransform: 'uppercase', marginBottom: 6 },
  toName: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 13, color: NAVY },
  toLine: { fontFamily: 'Inter', fontSize: 8, color: GRAY, marginTop: 3, lineHeight: 1.45 },

  metaBox: { width: 250, borderWidth: 1, borderColor: LINE, borderRadius: 4, overflow: 'hidden' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, paddingHorizontal: 11 },
  metaLabel: { fontFamily: 'Inter', fontSize: 7.5, color: GRAY },
  metaVal: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8.5, color: NAVY },

  effect: { marginTop: 14, borderLeftWidth: 3, paddingLeft: 10, paddingVertical: 5 },
  effectText: { fontFamily: 'Inter', fontWeight: 600, fontSize: 8.5, lineHeight: 1.4 },
  reasonCap: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 1.4, color: GOLD, textTransform: 'uppercase', marginTop: 12, marginBottom: 3 },
  reason: { fontFamily: 'Inter', fontSize: 8.5, color: GRAY, lineHeight: 1.5 },

  thead: { flexDirection: 'row', backgroundColor: NAVY, paddingVertical: 6, paddingHorizontal: 11, marginTop: 14, borderRadius: 2 },
  th: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 0.8, color: WHITE, textTransform: 'uppercase' },
  thNo: { width: 26 },
  thDesc: { flex: 1 },
  thQty: { width: 40, textAlign: 'right' },
  thUnit: { width: 92, textAlign: 'right' },
  thAmt: { width: 100, textAlign: 'right' },

  row: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 11, borderBottomWidth: 1, borderBottomColor: LINE, alignItems: 'flex-start' },
  cNo: { width: 26, fontFamily: 'Inter', fontWeight: 700, fontSize: 9, color: GOLD },
  cDesc: { flex: 1, paddingRight: 8 },
  cName: { fontFamily: 'Inter', fontWeight: 600, fontSize: 9.5, color: INK },
  cDetail: { fontFamily: 'Inter', fontSize: 7.6, color: GRAYL, marginTop: 1.5 },
  cQty: { width: 40, textAlign: 'right', fontFamily: 'Inter', fontSize: 9, color: INK },
  cUnit: { width: 92, textAlign: 'right', fontFamily: 'Inter', fontSize: 9, color: INK },
  cAmt: { width: 100, textAlign: 'right', fontFamily: 'Inter', fontWeight: 600, fontSize: 9, color: NAVY },

  bottom: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 },
  totBox: { width: 250, borderWidth: 1, borderColor: LINE, borderRadius: 5, overflow: 'hidden' },
  totLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, paddingHorizontal: 13, borderBottomWidth: 1, borderBottomColor: LINE },
  totLabel: { fontFamily: 'Inter', fontSize: 9, color: GRAY },
  totVal: { fontFamily: 'Inter', fontWeight: 700, fontSize: 9.5, color: NAVY },
  grand: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 13 },
  grandLabel: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 12, color: WHITE },
  grandVal: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 15, color: WHITE },

  signWrap: { marginTop: 26, alignItems: 'flex-end' },
  signCap: { fontFamily: 'Inter', fontSize: 8, color: GRAY },
  signLine: { borderBottomWidth: 1, borderBottomColor: '#334155', height: 30, width: 200, marginTop: 6, marginBottom: 7 },
  signName: { fontFamily: 'Inter', fontWeight: 700, fontSize: 9.5, color: NAVY },
  signOrg: { fontFamily: 'Inter', fontSize: 8, color: GRAY, marginTop: 1 },
})

function MetaRow({ label, value, alt }: { label: string; value: string; alt?: boolean }) {
  return (
    <View style={[nt.metaRow, alt ? { backgroundColor: ROW } : {}]}>
      <Text style={nt.metaLabel}>{label}</Text>
      <Text style={nt.metaVal}>{value}</Text>
    </View>
  )
}

export function NoteDocument({ data }: { data: NoteData }) {
  const t = data.tenant
  const m = NOTE_META[data.kind]
  const { subtotal, vat, total } = computeNoteTotals(data)
  const footRef = `${data.docNumber}${data.refDoc ? ` · Ref ${data.refDoc}` : ''}`

  return (
    <Document title={data.docNumber} author={t.companyName}>
      <Page size="A4" style={base.page}>
        <Letterhead
          tenant={t}
          right={
            <>
              <Text style={nt.title}>{m.title}</Text>
              <Text style={nt.no}>No. {data.docNumber}</Text>
            </>
          }
        />

        <View style={nt.topRow}>
          <View style={{ flex: 1, maxWidth: 280 }}>
            <Text style={nt.kicker}>{data.kind === 'debit' ? 'Didebit kepada' : 'Dikredit kepada'}</Text>
            <Text style={nt.toName}>{data.toName}</Text>
            {data.toAddress ? <Text style={nt.toLine}>{data.toAddress}</Text> : null}
            {data.toNpwp ? <Text style={nt.toLine}>NPWP {data.toNpwp}</Text> : null}
          </View>
          <View style={nt.metaBox}>
            <MetaRow label="Tanggal" value={data.noteDate} alt />
            {data.vesselVoyage ? <MetaRow label="Vessel / Voyage" value={data.vesselVoyage} /> : null}
            {data.refDoc ? <MetaRow label="Ref. dokumen" value={data.refDoc} alt /> : null}
          </View>
        </View>

        <View style={[nt.effect, { borderLeftColor: m.accent }]}>
          <Text style={[nt.effectText, { color: m.accent }]}>{m.effect}</Text>
        </View>

        <Text style={nt.reasonCap}>Alasan penyesuaian</Text>
        <Text style={nt.reason}>{data.reason}</Text>

        <View style={nt.thead}>
          <Text style={[nt.th, nt.thNo]}>#</Text>
          <Text style={[nt.th, nt.thDesc]}>Description</Text>
          <Text style={[nt.th, nt.thQty]}>Qty</Text>
          <Text style={[nt.th, nt.thUnit]}>Unit ({data.currency})</Text>
          <Text style={[nt.th, nt.thAmt]}>Amount ({data.currency})</Text>
        </View>
        {data.lines.map((l, i) => (
          <View key={i} style={nt.row}>
            <Text style={nt.cNo}>{String(i + 1).padStart(2, '0')}</Text>
            <View style={nt.cDesc}>
              <Text style={nt.cName}>{l.description}</Text>
              {l.detail ? <Text style={nt.cDetail}>{l.detail}</Text> : null}
            </View>
            <Text style={nt.cQty}>{l.qty}</Text>
            <Text style={nt.cUnit}>{fmt(l.unitPrice)}</Text>
            <Text style={nt.cAmt}>{fmt(noteLineAmount(l))}</Text>
          </View>
        ))}

        <View style={nt.bottom}>
          <View style={nt.totBox}>
            <View style={nt.totLine}>
              <Text style={nt.totLabel}>Subtotal</Text>
              <Text style={nt.totVal}>
                {data.currency} {fmt(subtotal)}
              </Text>
            </View>
            {data.vatPct ? (
              <View style={nt.totLine}>
                <Text style={nt.totLabel}>VAT (PPN) {data.vatPct}%</Text>
                <Text style={nt.totVal}>
                  {data.currency} {fmt(vat)}
                </Text>
              </View>
            ) : null}
            <View style={[nt.grand, { backgroundColor: m.accent }]}>
              <Text style={nt.grandLabel}>{data.kind === 'debit' ? 'Total Tambahan' : 'Total Pengurangan'}</Text>
              <Text style={nt.grandVal}>
                {data.currency} {fmt(total)}
              </Text>
            </View>
          </View>
        </View>

        <View style={nt.signWrap}>
          <Text style={nt.signCap}>For and on behalf of</Text>
          <View style={nt.signLine} />
          <Text style={nt.signName}>{data.signRole}</Text>
          <Text style={nt.signOrg}>{t.companyName}</Text>
        </View>

        <DocFooter left={footRef} issuedAt={data.noteDate} />
      </Page>
    </Document>
  )
}
