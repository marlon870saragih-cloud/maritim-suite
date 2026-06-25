import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { type EpdaData, sectionSubtotal, computeTotals } from './epda-data'
import { NAVY, GOLD, INK, GRAY, GRAYL, LINE, ROW, WHITE, fmt, Letterhead, DocFooter } from './base'

const s = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 34,
    paddingHorizontal: 38,
    fontFamily: 'Inter',
    fontSize: 9,
    color: INK,
    backgroundColor: WHITE,
  },

  // ---- header ----
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  brandRow: { flexDirection: 'row', gap: 14, maxWidth: 360 },
  seal: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: NAVY,
    borderWidth: 1.5,
    borderColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sealLogo: { width: 46, height: 46, borderRadius: 23, objectFit: 'cover' },
  sealText: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 12, color: GOLD },
  coName: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 17, color: NAVY, lineHeight: 1.1 },
  coTag: { fontFamily: 'Inter', fontWeight: 700, fontSize: 6.5, letterSpacing: 1.6, color: GOLD, marginTop: 3, textTransform: 'uppercase' },
  coAddr: { fontFamily: 'Inter', fontSize: 7.6, color: GRAY, marginTop: 6, lineHeight: 1.5, maxWidth: 250 },

  metaBox: { alignItems: 'flex-end' },
  metaKicker: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 1.4, color: GOLD, textTransform: 'uppercase' },
  metaNo: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 13, color: NAVY, marginTop: 2 },
  metaRow: { flexDirection: 'row', marginTop: 5 },
  metaLabel: { fontFamily: 'Inter', fontSize: 8, color: GRAY, marginRight: 6 },
  metaVal: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8, color: NAVY },

  ruleNavy: { height: 2, backgroundColor: NAVY, marginTop: 9 },
  ruleGold: { height: 1, backgroundColor: GOLD, marginTop: 1.5, width: '38%' },

  // ---- title ----
  title: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 18, color: NAVY, marginTop: 11 },
  subtitle: { fontFamily: 'Inter', fontWeight: 600, fontSize: 7, letterSpacing: 2.4, color: GOLD, marginTop: 2, textTransform: 'uppercase' },

  // ---- particulars ----
  partBox: { marginTop: 7, borderWidth: 1, borderColor: LINE, borderRadius: 4, overflow: 'hidden' },
  partRow: { flexDirection: 'row' },
  partCell: { flex: 1, flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 12, alignItems: 'baseline' },
  partCellBorder: { borderRightWidth: 1, borderRightColor: LINE },
  partLabel: { fontFamily: 'Inter', fontWeight: 600, fontSize: 7, letterSpacing: 0.5, color: GRAYL, width: 64, textTransform: 'uppercase' },
  partVal: { fontFamily: 'Inter', fontWeight: 700, fontSize: 9.5, color: NAVY, flex: 1 },

  // ---- table ----
  thead: { flexDirection: 'row', backgroundColor: NAVY, paddingVertical: 5, paddingHorizontal: 12, marginTop: 9, borderRadius: 2 },
  th: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7.2, letterSpacing: 1, color: WHITE, textTransform: 'uppercase' },
  thDesc: { flex: 1 },
  thQty: { width: 86, textAlign: 'right' },
  thRate: { width: 86, textAlign: 'right' },
  thAmt: { width: 92, textAlign: 'right' },

  secRow: { flexDirection: 'row', backgroundColor: ROW, paddingVertical: 2.5, paddingHorizontal: 12, alignItems: 'center' },
  secLetter: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8.5, color: GOLD, marginRight: 8 },
  secTitle: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8.2, letterSpacing: 1, color: NAVY, textTransform: 'uppercase' },

  itemRow: { flexDirection: 'row', paddingVertical: 1.5, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: LINE, alignItems: 'flex-start' },
  itemDesc: { flex: 1, paddingRight: 8 },
  itemName: { fontFamily: 'Inter', fontSize: 9.5, color: INK },
  itemBasis: { fontFamily: 'Inter', fontSize: 7.4, color: GRAYL, marginTop: 1.5 },
  itemQty: { width: 86, textAlign: 'right', fontFamily: 'Inter', fontSize: 9, color: INK },
  itemRate: { width: 86, textAlign: 'right', fontFamily: 'Inter', fontSize: 9, color: INK },
  itemAmt: { width: 92, textAlign: 'right', fontFamily: 'Inter', fontSize: 9, color: INK },

  subRow: { flexDirection: 'row', paddingVertical: 2, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: LINE },
  subLabel: { flex: 1, textAlign: 'right', fontFamily: 'Inter', fontWeight: 600, fontSize: 7.6, letterSpacing: 1, color: GRAY, paddingRight: 12, textTransform: 'uppercase' },
  subAmt: { width: 92, textAlign: 'right', fontFamily: 'Inter', fontWeight: 700, fontSize: 9.5, color: NAVY },

  // ---- totals ----
  totalsWrap: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6 },
  totalsBox: { width: '56%', borderWidth: 1, borderColor: LINE, borderRadius: 5, overflow: 'hidden' },
  totLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4.5, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: LINE },
  totLabel: { fontFamily: 'Inter', fontSize: 9, color: GRAY },
  totVal: { fontFamily: 'Inter', fontWeight: 700, fontSize: 9.5, color: NAVY },
  grandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: NAVY, paddingVertical: 7.5, paddingHorizontal: 14 },
  grandLabel: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 12, color: WHITE },
  grandVal: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 16, color: WHITE },
  usdNote: { textAlign: 'right', fontFamily: 'Inter', fontSize: 7.4, color: GRAYL, marginTop: 6 },

  // ---- footer ----
  footer: { position: 'absolute', bottom: 22, left: 38, right: 38, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: LINE, paddingTop: 8 },
  footText: { fontFamily: 'Inter', fontSize: 7.2, color: GRAYL },

  // ---- page 2 ----
  p2head: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7.6, letterSpacing: 1.6, color: GOLD, textTransform: 'uppercase', marginBottom: 10 },
  p2cols: { flexDirection: 'row', gap: 26 },
  notesCol: { flex: 1 },
  noteItem: { flexDirection: 'row', marginBottom: 8 },
  noteNo: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8.5, color: NAVY, width: 14 },
  noteText: { flex: 1, fontFamily: 'Inter', fontSize: 8.5, color: '#334155', lineHeight: 1.55 },
  remitBox: { width: 230, backgroundColor: ROW, borderWidth: 1, borderColor: LINE, borderRadius: 8, padding: 16 },
  remitRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 },
  remitK: { fontFamily: 'Inter', fontSize: 8.5, color: GRAY },
  remitV: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8.8, color: NAVY },

  signRow: { flexDirection: 'row', gap: 40, marginTop: 36 },
  signCol: { flex: 1 },
  signCap: { fontFamily: 'Inter', fontSize: 8.5, color: GRAY },
  signLine: { borderBottomWidth: 1, borderBottomColor: '#334155', height: 34, marginBottom: 8 },
  signName: { fontFamily: 'Inter', fontWeight: 700, fontSize: 9.5, color: NAVY },
  signOrg: { fontFamily: 'Inter', fontSize: 8.2, color: GRAY, marginTop: 1 },
})

function Particular({ label, value, border }: { label: string; value: string; border?: boolean }) {
  return (
    <View style={[s.partCell, border ? s.partCellBorder : {}]}>
      <Text style={s.partLabel}>{label}</Text>
      <Text style={s.partVal}>{value}</Text>
    </View>
  )
}

type Variant = 'EPDA' | 'FPDA' | 'FOA'

const VARIANT: Record<
  Variant,
  { kicker: string; title: string; subtitle: string; validLabel: string; totalLabel: string }
> = {
  EPDA: {
    kicker: 'Estimate · Proforma',
    title: 'Estimated Port Disbursement Account',
    subtitle: 'Proforma Estimate of Port Call Charges',
    validLabel: 'Valid until',
    totalLabel: 'Estimated Total',
  },
  FPDA: {
    kicker: 'Final · Statement',
    title: 'Final Disbursement Account',
    subtitle: 'Statement of Actual Port Call Charges',
    validLabel: 'Payment due',
    totalLabel: 'Total Disbursements',
  },
  FOA: {
    kicker: 'Final · Outturn',
    title: 'Final Outturn Account',
    subtitle: 'Final Statement of Port Call Charges',
    validLabel: 'Settled',
    totalLabel: 'Total Outturn',
  },
}

// EPDA & FPDA berbagi struktur — beda judul/label + (FPDA) blok settlement dana muka.
export function EpdaDocument({ data }: { data: EpdaData }) {
  return <DisbursementDocument data={data} variant="EPDA" />
}

export function DisbursementDocument({
  data,
  variant = 'EPDA',
}: {
  data: EpdaData
  variant?: Variant
}) {
  const t = data.tenant
  const V = VARIANT[variant]
  const { subtotal, agencyAmount, total, usd } = computeTotals(data)
  const advance = variant === 'FPDA' ? data.advanceReceived ?? 0 : 0
  const balance = total - advance
  const docFootRef = `${data.docNumber} · ${data.vesselName} · ${data.port}`

  return (
    <Document title={data.docNumber} author={t.companyName}>
      {/* ============ HALAMAN 1 ============ */}
      <Page size="A4" style={s.page}>
        {/* header (kop bersama dari base) */}
        <Letterhead
          tenant={t}
          right={
            <>
              <Text style={s.metaKicker}>{V.kicker}</Text>
              <Text style={s.metaNo}>{data.docNumber}</Text>
              <View style={s.metaRow}>
                <Text style={s.metaLabel}>Issued</Text>
                <Text style={s.metaVal}>{data.issuedAt}</Text>
              </View>
              <View style={s.metaRow}>
                <Text style={s.metaLabel}>{V.validLabel}</Text>
                <Text style={s.metaVal}>{data.validUntil}</Text>
              </View>
              <View style={s.metaRow}>
                <Text style={s.metaLabel}>Currency</Text>
                <Text style={s.metaVal}>{data.currency}</Text>
              </View>
            </>
          }
        />

        {/* title */}
        <Text style={s.title}>{V.title}</Text>
        <Text style={s.subtitle}>{V.subtitle}</Text>

        {/* particulars */}
        <View style={s.partBox}>
          <View style={[s.partRow, { backgroundColor: ROW }]}>
            <Particular label="Vessel" value={data.vesselName} border />
            <Particular label="Principal" value={data.principal} />
          </View>
          <View style={s.partRow}>
            <Particular label="IMO / Flag" value={`${data.imo} · ${data.flag}`} border />
            <Particular label="Port" value={`${data.port} (${data.portCode})`} />
          </View>
          <View style={[s.partRow, { backgroundColor: ROW }]}>
            <Particular label="GT / NRT" value={`${data.gt} / ${data.nrt}`} border />
            <Particular label="ETA / ETD" value={`${data.eta} · ${data.etd}`} />
          </View>
          <View style={s.partRow}>
            <Particular label="LOA / Draft" value={`${data.loa} · ${data.draft}`} border />
            <Particular label="Cargo" value={data.cargo} />
          </View>
        </View>

        {/* table header */}
        <View style={s.thead}>
          <Text style={[s.th, s.thDesc]}>Description</Text>
          <Text style={[s.th, s.thQty]}>Qty / Basis</Text>
          <Text style={[s.th, s.thRate]}>Rate ({data.currency})</Text>
          <Text style={[s.th, s.thAmt]}>Amount ({data.currency})</Text>
        </View>

        {/* sections */}
        {data.sections.map((sec) => (
          <View key={sec.letter} wrap={false}>
            <View style={s.secRow}>
              <Text style={s.secLetter}>{sec.letter}</Text>
              <Text style={s.secTitle}>{sec.title}</Text>
            </View>
            {sec.items.map((it, i) => (
              <View key={i} style={s.itemRow}>
                <View style={s.itemDesc}>
                  <Text style={s.itemName}>{it.description}</Text>
                  {it.basis ? <Text style={s.itemBasis}>{it.basis}</Text> : null}
                </View>
                <Text style={s.itemQty}>{it.qty ?? ''}</Text>
                <Text style={s.itemRate}>{it.rate != null ? fmt(it.rate) : '—'}</Text>
                <Text style={s.itemAmt}>{fmt(it.amount)}</Text>
              </View>
            ))}
            <View style={s.subRow}>
              <Text style={s.subLabel}>Subtotal {sec.letter}</Text>
              <Text style={s.subAmt}>{fmt(sectionSubtotal(sec))}</Text>
            </View>
          </View>
        ))}

        {/* totals */}
        <View style={s.totalsWrap} wrap={false}>
          <View style={s.totalsBox}>
            <View style={s.totLine}>
              <Text style={s.totLabel}>Subtotal (A + B + C + D)</Text>
              <Text style={s.totVal}>
                {data.currency} {fmt(subtotal)}
              </Text>
            </View>
            <View style={s.totLine}>
              <Text style={s.totLabel}>Agency handling {data.agencyPct}%</Text>
              <Text style={s.totVal}>
                {data.currency} {fmt(agencyAmount)}
              </Text>
            </View>
            {variant === 'FPDA' ? (
              <>
                <View style={s.totLine}>
                  <Text style={s.totLabel}>{V.totalLabel}</Text>
                  <Text style={s.totVal}>
                    {data.currency} {fmt(total)}
                  </Text>
                </View>
                {advance > 0 ? (
                  <View style={s.totLine}>
                    <Text style={s.totLabel}>Less: Advance received</Text>
                    <Text style={s.totVal}>
                      ({data.currency} {fmt(advance)})
                    </Text>
                  </View>
                ) : null}
                <View style={s.grandRow}>
                  <Text style={s.grandLabel}>
                    {balance >= 0 ? 'Balance Due to Agent' : 'Refund to Principal'}
                  </Text>
                  <Text style={s.grandVal}>
                    {data.currency} {fmt(Math.abs(balance))}
                  </Text>
                </View>
              </>
            ) : (
              <View style={s.grandRow}>
                <Text style={s.grandLabel}>{V.totalLabel}</Text>
                <Text style={s.grandVal}>
                  {data.currency} {fmt(total)}
                </Text>
              </View>
            )}
          </View>
        </View>
        {variant === 'EPDA' && usd ? (
          <Text style={s.usdNote}>
            ~ USD {fmt(usd)} @ {fmt(data.usdRate!)} · indicative only
          </Text>
        ) : null}

        <DocFooter left={docFootRef} issuedAt={data.issuedAt} />
      </Page>

      {/* ============ HALAMAN 2 ============ */}
      <Page size="A4" style={s.page}>
        <View style={s.p2cols}>
          <View style={s.notesCol}>
            <Text style={s.p2head}>Notes & Conditions</Text>
            {data.notes.map((n, i) => (
              <View key={i} style={s.noteItem}>
                <Text style={s.noteNo}>{i + 1}.</Text>
                <Text style={s.noteText}>{n}</Text>
              </View>
            ))}
          </View>
          <View style={s.remitBox}>
            <Text style={s.p2head}>Remittance</Text>
            <View style={s.remitRow}>
              <Text style={s.remitK}>Bank</Text>
              <Text style={s.remitV}>{t.bankName ?? '—'}</Text>
            </View>
            <View style={s.remitRow}>
              <Text style={s.remitK}>Account</Text>
              <Text style={s.remitV}>{t.bankAccount ?? '—'}</Text>
            </View>
            <View style={s.remitRow}>
              <Text style={s.remitK}>Holder</Text>
              <Text style={s.remitV}>{t.bankHolder ?? t.companyName}</Text>
            </View>
            {t.bankSwift ? (
              <View style={s.remitRow}>
                <Text style={s.remitK}>SWIFT</Text>
                <Text style={s.remitV}>{t.bankSwift}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={s.signRow}>
          <View style={s.signCol}>
            <Text style={s.signCap}>Prepared by</Text>
            <View style={{ height: 8 }} />
            <View style={s.signLine} />
            <Text style={s.signName}>{data.preparedByRole}</Text>
            <Text style={s.signOrg}>{t.companyName}</Text>
          </View>
          <View style={s.signCol}>
            <Text style={s.signCap}>Approved by</Text>
            <View style={{ height: 8 }} />
            <View style={s.signLine} />
            <Text style={s.signName}>{data.approvedByRole}</Text>
            <Text style={s.signOrg}>{t.companyName}</Text>
          </View>
        </View>

        <DocFooter left={docFootRef} issuedAt={data.issuedAt} />
      </Page>
    </Document>
  )
}
