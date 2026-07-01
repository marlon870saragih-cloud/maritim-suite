import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { NAVY, GOLD, INK, GRAY, GRAYL, LINE, ROW, WHITE, fmt, base, Letterhead, DocFooter } from './base'
import { type InvoiceData, lineAmount, isTaxable, computeInvoiceTotals } from './invoice-data'

const iv = StyleSheet.create({
  // header kanan
  invTitle: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 24, color: NAVY, letterSpacing: 1 },
  invNo: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8, letterSpacing: 1, color: GOLD, marginTop: 2, textTransform: 'uppercase' },

  // billed-to + meta
  topRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, gap: 24 },
  kicker: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 1.6, color: GOLD, textTransform: 'uppercase', marginBottom: 6 },
  billName: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 13, color: NAVY },
  billLine: { fontFamily: 'Inter', fontSize: 8, color: GRAY, marginTop: 3, lineHeight: 1.45 },

  metaBox: { width: 250, borderWidth: 1, borderColor: LINE, borderRadius: 4, overflow: 'hidden' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, paddingHorizontal: 11 },
  metaLabel: { fontFamily: 'Inter', fontSize: 7.5, color: GRAY },
  metaVal: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8.5, color: NAVY },

  // tabel
  thead: { flexDirection: 'row', backgroundColor: NAVY, paddingVertical: 6, paddingHorizontal: 11, marginTop: 18, borderRadius: 2 },
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
  exemptTag: { fontFamily: 'Inter', fontWeight: 700, fontSize: 6.2, letterSpacing: 0.5, color: GRAY, marginTop: 2, textTransform: 'uppercase' },
  cQty: { width: 40, textAlign: 'right', fontFamily: 'Inter', fontSize: 9, color: INK },
  cUnit: { width: 92, textAlign: 'right', fontFamily: 'Inter', fontSize: 9, color: INK },
  cAmt: { width: 100, textAlign: 'right', fontFamily: 'Inter', fontWeight: 600, fontSize: 9, color: NAVY },

  // bawah: terms+bank (kiri) + totals (kanan)
  bottom: { flexDirection: 'row', marginTop: 18, gap: 24 },
  left: { flex: 1 },
  para: { fontFamily: 'Inter', fontSize: 8, color: GRAY, lineHeight: 1.5, marginBottom: 16 },
  bankBox: { borderWidth: 1, borderColor: LINE, borderRadius: 4, backgroundColor: ROW, padding: 12 },
  bankRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  bankK: { fontFamily: 'Inter', fontSize: 8, color: GRAY },
  bankV: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8.2, color: NAVY },

  right: { width: 240 },
  totLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 13, borderBottomWidth: 1, borderBottomColor: LINE },
  totLabel: { fontFamily: 'Inter', fontSize: 9, color: GRAY },
  totVal: { fontFamily: 'Inter', fontWeight: 700, fontSize: 9.5, color: NAVY },
  grand: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: NAVY, paddingVertical: 10, paddingHorizontal: 13 },
  grandLabel: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 12, color: WHITE },
  grandVal: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 15, color: WHITE },
  totBox: { borderWidth: 1, borderColor: LINE, borderRadius: 5, overflow: 'hidden' },

  signWrap: { marginTop: 22, alignItems: 'flex-end' },
  signCap: { fontFamily: 'Inter', fontSize: 8, color: GRAY },
  signLine: { borderBottomWidth: 1, borderBottomColor: '#334155', height: 30, width: 200, marginTop: 6, marginBottom: 7 },
  signName: { fontFamily: 'Inter', fontWeight: 700, fontSize: 9.5, color: NAVY },
  signOrg: { fontFamily: 'Inter', fontSize: 8, color: GRAY, marginTop: 1 },

  thanks: { textAlign: 'center', fontFamily: 'Spectral', fontSize: 9.5, color: GRAY, marginTop: 22 },
})

function MetaRow({ label, value, alt }: { label: string; value: string; alt?: boolean }) {
  return (
    <View style={[iv.metaRow, alt ? { backgroundColor: ROW } : {}]}>
      <Text style={iv.metaLabel}>{label}</Text>
      <Text style={iv.metaVal}>{value}</Text>
    </View>
  )
}
function BankRow({ k, v }: { k: string; v: string }) {
  return (
    <View style={iv.bankRow}>
      <Text style={iv.bankK}>{k}</Text>
      <Text style={iv.bankV}>{v}</Text>
    </View>
  )
}

export function InvoiceDocument({ data }: { data: InvoiceData }) {
  const t = data.tenant
  const { subtotal, agency, dpp, vat, totalDue, hasExempt } = computeInvoiceTotals(data)
  const footRef = `${data.docNumber} · ${data.vesselVoyage} · ${data.portCall}`

  return (
    <Document title={data.docNumber} author={t.companyName}>
      <Page size="A4" style={base.page}>
        <Letterhead
          tenant={t}
          right={
            <>
              <Text style={iv.invTitle}>INVOICE</Text>
              <Text style={iv.invNo}>No. {data.docNumber}</Text>
            </>
          }
        />

        {/* billed to + meta */}
        <View style={iv.topRow}>
          <View style={{ flex: 1, maxWidth: 280 }}>
            <Text style={iv.kicker}>Billed to</Text>
            <Text style={iv.billName}>{data.billToName}</Text>
            {data.billToAddress ? <Text style={iv.billLine}>{data.billToAddress}</Text> : null}
            {data.billToAttn ? <Text style={iv.billLine}>Attn: {data.billToAttn}</Text> : null}
            {data.billToNpwp ? <Text style={iv.billLine}>NPWP {data.billToNpwp}</Text> : null}
          </View>
          <View style={iv.metaBox}>
            <MetaRow label="Invoice date" value={data.invoiceDate} alt />
            <MetaRow label="Vessel / Voyage" value={data.vesselVoyage} />
            <MetaRow label="Port call" value={data.portCall} alt />
            {data.refFda ? <MetaRow label="Ref. FDA" value={data.refFda} /> : null}
            <MetaRow label="Due date" value={data.dueDate} alt />
          </View>
        </View>

        {/* tabel tagihan */}
        <View style={iv.thead}>
          <Text style={[iv.th, iv.thNo]}>#</Text>
          <Text style={[iv.th, iv.thDesc]}>Description</Text>
          <Text style={[iv.th, iv.thQty]}>Qty</Text>
          <Text style={[iv.th, iv.thUnit]}>Unit ({data.currency})</Text>
          <Text style={[iv.th, iv.thAmt]}>Amount ({data.currency})</Text>
        </View>
        {data.lines.map((l, i) => (
          <View key={i} style={iv.row}>
            <Text style={iv.cNo}>{String(i + 1).padStart(2, '0')}</Text>
            <View style={iv.cDesc}>
              <Text style={iv.cName}>{l.description}</Text>
              {l.detail ? <Text style={iv.cDetail}>{l.detail}</Text> : null}
              {!isTaxable(l) ? <Text style={iv.exemptTag}>Non-taxable · Bebas PPN</Text> : null}
            </View>
            <Text style={iv.cQty}>{l.qty}</Text>
            <Text style={iv.cUnit}>{fmt(l.unitPrice)}</Text>
            <Text style={iv.cAmt}>{fmt(lineAmount(l))}</Text>
          </View>
        ))}

        {/* bawah */}
        <View style={iv.bottom}>
          <View style={iv.left}>
            <Text style={iv.kicker}>Payment terms</Text>
            <Text style={iv.para}>{data.paymentTerms}</Text>
            <Text style={iv.kicker}>Bank details</Text>
            <View style={iv.bankBox}>
              <BankRow k="Bank" v={t.bankName ?? '—'} />
              <BankRow k="Account No." v={t.bankAccount ?? '—'} />
              <BankRow k="Account name" v={t.bankHolder ?? t.companyName} />
              {t.bankSwift ? <BankRow k="SWIFT" v={t.bankSwift} /> : null}
            </View>
          </View>

          <View style={iv.right}>
            <View style={iv.totBox}>
              <View style={iv.totLine}>
                <Text style={iv.totLabel}>Subtotal</Text>
                <Text style={iv.totVal}>
                  {data.currency} {fmt(subtotal)}
                </Text>
              </View>
              <View style={iv.totLine}>
                <Text style={iv.totLabel}>Agency handling {data.agencyPct}%</Text>
                <Text style={iv.totVal}>
                  {data.currency} {fmt(agency)}
                </Text>
              </View>
              {hasExempt ? (
                <View style={iv.totLine}>
                  <Text style={iv.totLabel}>Taxable base (DPP)</Text>
                  <Text style={iv.totVal}>
                    {data.currency} {fmt(dpp)}
                  </Text>
                </View>
              ) : null}
              <View style={iv.totLine}>
                <Text style={iv.totLabel}>VAT (PPN) {data.vatPct}%{hasExempt ? ' · atas DPP' : ''}</Text>
                <Text style={iv.totVal}>
                  {data.currency} {fmt(vat)}
                </Text>
              </View>
              <View style={iv.grand}>
                <Text style={iv.grandLabel}>Total Due</Text>
                <Text style={iv.grandVal}>
                  {data.currency} {fmt(totalDue)}
                </Text>
              </View>
            </View>

            <View style={iv.signWrap}>
              <Text style={iv.signCap}>For and on behalf of</Text>
              <View style={iv.signLine} />
              <Text style={iv.signName}>{data.signRole}</Text>
              <Text style={iv.signOrg}>{t.companyName}</Text>
            </View>
          </View>
        </View>

        <Text style={iv.thanks}>Thank you for your business.</Text>

        <DocFooter left={footRef} issuedAt={data.invoiceDate} />
      </Page>
    </Document>
  )
}
