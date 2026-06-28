import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { NAVY, GOLD, INK, GRAY, GRAYL, LINE, ROW, WHITE, fmt, base, Letterhead, DocFooter } from './base'
import { type ProcData, procLineAmount, computeProcTotals, PROC_META } from './procurement-data'

const pr = StyleSheet.create({
  title: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 21, color: NAVY, letterSpacing: 1 },
  no: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8, letterSpacing: 1, color: GOLD, marginTop: 2, textTransform: 'uppercase' },

  topRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, gap: 24 },
  kicker: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 1.6, color: GOLD, textTransform: 'uppercase', marginBottom: 6 },
  partyName: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 13, color: NAVY },
  partyLine: { fontFamily: 'Inter', fontSize: 8, color: GRAY, marginTop: 3, lineHeight: 1.45 },

  metaBox: { width: 250, borderWidth: 1, borderColor: LINE, borderRadius: 4, overflow: 'hidden' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, paddingHorizontal: 11 },
  metaLabel: { fontFamily: 'Inter', fontSize: 7.5, color: GRAY },
  metaVal: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8.5, color: NAVY },

  reasonCap: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 1.4, color: GOLD, textTransform: 'uppercase', marginTop: 14, marginBottom: 3 },
  reason: { fontFamily: 'Inter', fontSize: 8.5, color: GRAY, lineHeight: 1.5 },

  thead: { flexDirection: 'row', backgroundColor: NAVY, paddingVertical: 6, paddingHorizontal: 11, marginTop: 14, borderRadius: 2 },
  th: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 0.8, color: WHITE, textTransform: 'uppercase' },
  thNo: { width: 22 },
  thDesc: { flex: 1 },
  thQty: { width: 38, textAlign: 'right' },
  thUnitName: { width: 38, textAlign: 'right' },
  thPrice: { width: 86, textAlign: 'right' },
  thAmt: { width: 92, textAlign: 'right' },

  row: { flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 11, borderBottomWidth: 1, borderBottomColor: LINE, alignItems: 'flex-start' },
  cNo: { width: 22, fontFamily: 'Inter', fontWeight: 700, fontSize: 9, color: GOLD },
  cDesc: { flex: 1, paddingRight: 8 },
  cName: { fontFamily: 'Inter', fontWeight: 600, fontSize: 9.5, color: INK },
  cDetail: { fontFamily: 'Inter', fontSize: 7.6, color: GRAYL, marginTop: 1.5 },
  cQty: { width: 38, textAlign: 'right', fontFamily: 'Inter', fontSize: 9, color: INK },
  cUnitName: { width: 38, textAlign: 'right', fontFamily: 'Inter', fontSize: 8.5, color: GRAY },
  cPrice: { width: 86, textAlign: 'right', fontFamily: 'Inter', fontSize: 9, color: INK },
  cAmt: { width: 92, textAlign: 'right', fontFamily: 'Inter', fontWeight: 600, fontSize: 9, color: NAVY },

  bottom: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, gap: 24 },
  left: { flex: 1 },
  para: { fontFamily: 'Inter', fontSize: 8, color: GRAY, lineHeight: 1.5 },

  totBox: { width: 240, borderWidth: 1, borderColor: LINE, borderRadius: 5, overflow: 'hidden' },
  totLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, paddingHorizontal: 13, borderBottomWidth: 1, borderBottomColor: LINE },
  totLabel: { fontFamily: 'Inter', fontSize: 9, color: GRAY },
  totVal: { fontFamily: 'Inter', fontWeight: 700, fontSize: 9.5, color: NAVY },
  grand: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: NAVY, paddingVertical: 10, paddingHorizontal: 13 },
  grandLabel: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 11, color: WHITE },
  grandVal: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 14, color: WHITE },

  signRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 30 },
  signBox: { width: 200, alignItems: 'center' },
  signCap: { fontFamily: 'Inter', fontSize: 8, color: GRAY },
  signLine: { borderBottomWidth: 1, borderBottomColor: '#334155', height: 30, width: 180, marginTop: 6, marginBottom: 7 },
  signName: { fontFamily: 'Inter', fontWeight: 700, fontSize: 9.5, color: NAVY },
  signOrg: { fontFamily: 'Inter', fontSize: 8, color: GRAY, marginTop: 1 },
})

function MetaRow({ label, value, alt }: { label: string; value: string; alt?: boolean }) {
  return (
    <View style={[pr.metaRow, alt ? { backgroundColor: ROW } : {}]}>
      <Text style={pr.metaLabel}>{label}</Text>
      <Text style={pr.metaVal}>{value}</Text>
    </View>
  )
}

export function ProcurementDocument({ data }: { data: ProcData }) {
  const t = data.tenant
  const m = PROC_META[data.kind]
  const { subtotal, tax, total } = computeProcTotals(data)
  const footRef = `${data.docNumber}${data.vesselVoyage ? ` · ${data.vesselVoyage}` : ''}`

  return (
    <Document title={data.docNumber} author={t.companyName}>
      <Page size="A4" style={base.page}>
        <Letterhead
          tenant={t}
          right={
            <>
              <Text style={pr.title}>{m.title}</Text>
              <Text style={pr.no}>No. {data.docNumber}</Text>
            </>
          }
        />

        <View style={pr.topRow}>
          <View style={{ flex: 1, maxWidth: 280 }}>
            <Text style={pr.kicker}>{m.partyLabel}</Text>
            <Text style={pr.partyName}>{data.party}</Text>
            {data.partyAddress ? <Text style={pr.partyLine}>{data.partyAddress}</Text> : null}
            {data.partyAttn ? <Text style={pr.partyLine}>Attn: {data.partyAttn}</Text> : null}
          </View>
          <View style={pr.metaBox}>
            <MetaRow label="Tanggal" value={data.docDate} alt />
            {data.vesselVoyage ? <MetaRow label="Vessel / Voyage" value={data.vesselVoyage} /> : null}
            {data.deliveryTo ? <MetaRow label="Kirim ke" value={data.deliveryTo} alt /> : null}
            {data.neededBy ? <MetaRow label={data.kind === 'pr' ? 'Dibutuhkan' : 'Tgl kirim'} value={data.neededBy} /> : null}
          </View>
        </View>

        {data.reason ? (
          <>
            <Text style={pr.reasonCap}>{m.reasonLabel}</Text>
            <Text style={pr.reason}>{data.reason}</Text>
          </>
        ) : null}

        <View style={pr.thead}>
          <Text style={[pr.th, pr.thNo]}>#</Text>
          <Text style={[pr.th, pr.thDesc]}>Item</Text>
          <Text style={[pr.th, pr.thQty]}>Qty</Text>
          <Text style={[pr.th, pr.thUnitName]}>Unit</Text>
          <Text style={[pr.th, pr.thPrice]}>Harga ({data.currency})</Text>
          <Text style={[pr.th, pr.thAmt]}>Jumlah ({data.currency})</Text>
        </View>
        {data.lines.map((l, i) => (
          <View key={i} style={pr.row}>
            <Text style={pr.cNo}>{String(i + 1).padStart(2, '0')}</Text>
            <View style={pr.cDesc}>
              <Text style={pr.cName}>{l.description}</Text>
              {l.detail ? <Text style={pr.cDetail}>{l.detail}</Text> : null}
            </View>
            <Text style={pr.cQty}>{l.qty}</Text>
            <Text style={pr.cUnitName}>{l.unit}</Text>
            <Text style={pr.cPrice}>{fmt(l.unitPrice)}</Text>
            <Text style={pr.cAmt}>{fmt(procLineAmount(l))}</Text>
          </View>
        ))}

        <View style={pr.bottom}>
          <View style={pr.left}>
            {m.showTerms && data.paymentTerms ? (
              <>
                <Text style={pr.reasonCap}>Syarat</Text>
                <Text style={pr.para}>{data.paymentTerms}</Text>
              </>
            ) : null}
          </View>
          <View style={pr.totBox}>
            <View style={pr.totLine}>
              <Text style={pr.totLabel}>Subtotal</Text>
              <Text style={pr.totVal}>
                {data.currency} {fmt(subtotal)}
              </Text>
            </View>
            {data.taxPct ? (
              <View style={pr.totLine}>
                <Text style={pr.totLabel}>PPN {data.taxPct}%</Text>
                <Text style={pr.totVal}>
                  {data.currency} {fmt(tax)}
                </Text>
              </View>
            ) : null}
            <View style={pr.grand}>
              <Text style={pr.grandLabel}>{m.totalLabel}</Text>
              <Text style={pr.grandVal}>
                {data.currency} {fmt(total)}
              </Text>
            </View>
          </View>
        </View>

        <View style={pr.signRow}>
          <View style={pr.signBox}>
            <Text style={pr.signCap}>Dibuat oleh</Text>
            <View style={pr.signLine} />
            <Text style={pr.signName}>{data.signRole}</Text>
            <Text style={pr.signOrg}>{t.companyName}</Text>
          </View>
          <View style={pr.signBox}>
            <Text style={pr.signCap}>Disetujui</Text>
            <View style={pr.signLine} />
            <Text style={pr.signName}>Branch Manager</Text>
            <Text style={pr.signOrg}>{t.companyName}</Text>
          </View>
        </View>

        <DocFooter left={footRef} issuedAt={data.docDate} />
      </Page>
    </Document>
  )
}
