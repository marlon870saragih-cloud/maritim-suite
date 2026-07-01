import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { NAVY, GOLD, INK, GRAY, GRAYL, LINE, ROW, WHITE, fmt, base, Letterhead, DocFooter } from './base'
import type { EpdaTenant } from './epda-data'
import type { FinSummary } from '@/lib/finance-summary'

const TEAL = '#3E8E8E'
const RED = '#C0432E'
const AGING_COLORS: Record<string, string> = { current: TEAL, d30: GOLD, d60: '#B87333', d90: '#B5561E', d90p: RED }

const s = StyleSheet.create({
  title: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 19, color: NAVY, letterSpacing: 0.4, textAlign: 'right' },
  sub: { fontFamily: 'Inter', fontSize: 6.5, letterSpacing: 1, color: GRAY, marginTop: 1, textTransform: 'uppercase', textAlign: 'right' },
  gen: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8, letterSpacing: 1, color: GOLD, marginTop: 2, textTransform: 'uppercase', textAlign: 'right' },

  // KPI cards
  kpiRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  kpi: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 6, padding: 11, backgroundColor: ROW },
  kpiCap: { fontFamily: 'Inter', fontWeight: 700, fontSize: 6.6, letterSpacing: 0.8, color: GRAY, textTransform: 'uppercase' },
  kpiVal: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 14, color: NAVY, marginTop: 5 },
  kpiValRed: { color: RED },
  kpiSub: { fontFamily: 'Inter', fontSize: 6.8, color: GRAYL, marginTop: 2 },

  secCap: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8, letterSpacing: 1.4, color: GOLD, textTransform: 'uppercase', marginTop: 22, marginBottom: 8 },

  // aging bar chart
  ageRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
  ageLabel: { width: 110, fontFamily: 'Inter', fontSize: 8, color: INK },
  ageTrack: { flex: 1, height: 13, backgroundColor: '#EEF1F4', borderRadius: 3, overflow: 'hidden' },
  ageBar: { height: 13, borderRadius: 3 },
  ageVal: { width: 116, textAlign: 'right', fontFamily: 'Inter', fontWeight: 700, fontSize: 8, color: NAVY },
  ageCount: { width: 30, textAlign: 'right', fontFamily: 'Inter', fontSize: 7, color: GRAYL },

  // tables
  thead: { flexDirection: 'row', backgroundColor: NAVY, paddingVertical: 5, paddingHorizontal: 9, borderRadius: 2 },
  th: { fontFamily: 'Inter', fontWeight: 700, fontSize: 6.6, letterSpacing: 0.4, color: WHITE, textTransform: 'uppercase' },
  row: { flexDirection: 'row', paddingVertical: 4.5, paddingHorizontal: 9, borderBottomWidth: 1, borderBottomColor: LINE, alignItems: 'center' },
  rowAlt: { backgroundColor: ROW },
  td: { fontFamily: 'Inter', fontSize: 7.6, color: INK },
  tdMuted: { fontFamily: 'Inter', fontSize: 7.4, color: GRAY },
  rightCell: { textAlign: 'right', fontFamily: 'Inter', fontSize: 7.6, color: NAVY, fontWeight: 700 },

  // per-principal cols
  pName: { flex: 1 },
  pCount: { width: 46, textAlign: 'right' },
  pOut: { width: 100, textAlign: 'right' },

  // invoice list cols
  cDate: { width: 58 },
  cNo: { width: 96 },
  cPrin: { flex: 1 },
  cDpp: { width: 72, textAlign: 'right' },
  cVat: { width: 60, textAlign: 'right' },
  cTot: { width: 76, textAlign: 'right' },
  cStat: { width: 46, textAlign: 'right' },

  note: { fontFamily: 'Inter', fontSize: 7, color: GRAYL, marginTop: 8, lineHeight: 1.4 },
})

function Kpi({ cap, val, sub, red }: { cap: string; val: string; sub?: string; red?: boolean }) {
  return (
    <View style={s.kpi}>
      <Text style={s.kpiCap}>{cap}</Text>
      <Text style={[s.kpiVal, red ? s.kpiValRed : {}]}>{val}</Text>
      {sub ? <Text style={s.kpiSub}>{sub}</Text> : null}
    </View>
  )
}

const STATUS_SHORT: Record<string, string> = { DRAFT: 'Draf', FINAL: 'Final', SENT: 'Kirim', PAID: 'Lunas', CANCELLED: 'Batal' }

export function FinanceSummaryDocument({ tenant, summary }: { tenant: EpdaTenant; summary: FinSummary }) {
  const cur = summary.currency
  const maxAge = Math.max(...summary.aging.map((a) => a.value), 1)
  const topPrincipals = summary.byPrincipal.filter((p) => p.outstanding > 0).slice(0, 8)
  const listRows = summary.rows.slice(0, 34)

  return (
    <Document title={`Ringkasan Keuangan ${summary.generatedAt}`} author={tenant.companyName}>
      <Page size="A4" style={base.page}>
        <Letterhead
          tenant={tenant}
          right={
            <>
              <Text style={s.title}>RINGKASAN KEUANGAN</Text>
              <Text style={s.sub}>Financial Summary · Receivables</Text>
              <Text style={s.gen}>Per {summary.generatedAt}</Text>
            </>
          }
        />

        {/* KPI */}
        <View style={s.kpiRow}>
          <Kpi cap="Total Piutang / Outstanding" val={`${cur} ${fmt(summary.totalOutstanding)}`} sub={`${summary.count} invoice`} red={summary.totalOutstanding > 0} />
          <Kpi cap="Total Ditagih / Invoiced" val={`${cur} ${fmt(summary.totalInvoiced)}`} />
          <Kpi cap="Total Lunas / Paid" val={`${cur} ${fmt(summary.totalPaid)}`} />
          <Kpi cap="Jatuh Tempo / Overdue" val={`${summary.overdueCount}`} sub="invoice lewat tempo" red={summary.overdueCount > 0} />
        </View>

        {/* Aging chart */}
        <Text style={s.secCap}>Umur Piutang / Aging</Text>
        {summary.aging.map((a) => (
          <View key={a.key} style={s.ageRow}>
            <Text style={s.ageLabel}>{a.label}</Text>
            <View style={s.ageTrack}>
              <View style={[s.ageBar, { width: `${Math.round((a.value / maxAge) * 100)}%`, backgroundColor: AGING_COLORS[a.key] }]} />
            </View>
            <Text style={s.ageCount}>{a.count}</Text>
            <Text style={s.ageVal}>{cur} {fmt(a.value)}</Text>
          </View>
        ))}

        {/* Per principal */}
        {topPrincipals.length > 0 ? (
          <>
            <Text style={s.secCap}>Piutang per Principal</Text>
            <View style={s.thead}>
              <Text style={[s.th, s.pName]}>Principal</Text>
              <Text style={[s.th, s.pCount]}>Inv</Text>
              <Text style={[s.th, s.pOut]}>Outstanding ({cur})</Text>
            </View>
            {topPrincipals.map((p, i) => (
              <View key={p.principal} style={[s.row, i % 2 ? s.rowAlt : {}]} wrap={false}>
                <Text style={[s.td, s.pName]}>{p.principal}</Text>
                <Text style={[s.tdMuted, s.pCount]}>{p.count}</Text>
                <Text style={[s.rightCell, s.pOut]}>{fmt(p.outstanding)}</Text>
              </View>
            ))}
          </>
        ) : null}

        {/* Invoice list */}
        <Text style={s.secCap}>Daftar Invoice{summary.rows.length > listRows.length ? ` (${listRows.length} terbaru dari ${summary.rows.length})` : ''}</Text>
        <View style={s.thead}>
          <Text style={[s.th, s.cDate]}>Tanggal</Text>
          <Text style={[s.th, s.cNo]}>No.</Text>
          <Text style={[s.th, s.cPrin]}>Principal</Text>
          <Text style={[s.th, s.cDpp]}>DPP</Text>
          <Text style={[s.th, s.cVat]}>PPN</Text>
          <Text style={[s.th, s.cTot]}>Total</Text>
          <Text style={[s.th, s.cStat]}>Status</Text>
        </View>
        {listRows.map((r, i) => (
          <View key={r.docNumber + i} style={[s.row, i % 2 ? s.rowAlt : {}]} wrap={false}>
            <Text style={[s.tdMuted, s.cDate]}>{r.date || '—'}</Text>
            <Text style={[s.td, s.cNo]}>{r.docNumber}</Text>
            <Text style={[s.td, s.cPrin]}>{r.principal}</Text>
            <Text style={[s.tdMuted, s.cDpp]}>{fmt(r.dpp)}</Text>
            <Text style={[s.tdMuted, s.cVat]}>{fmt(r.vat)}</Text>
            <Text style={[s.rightCell, s.cTot]}>{fmt(r.total)}</Text>
            <Text style={[s.tdMuted, s.cStat]}>{STATUS_SHORT[r.status] ?? r.status}</Text>
          </View>
        ))}

        <Text style={s.note}>
          Semua angka dihitung otomatis dari data invoice tersimpan (bukan diketik/AI). Piutang = total invoice yang belum berstatus Lunas/Batal.
          DPP = dasar pengenaan PPN (hanya baris kena PPN + agency fee).
        </Text>

        <DocFooter left={`Ringkasan Keuangan · ${summary.company}`} issuedAt={summary.generatedAt} />
      </Page>
    </Document>
  )
}
