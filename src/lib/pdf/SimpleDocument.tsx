import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { NAVY, GOLD, INK, GRAY, LINE, ROW, WHITE, base, Letterhead, DocFooter } from './base'
import { getSimpleSchema, type SimpleRenderData, type Bi } from './simple-docs'

const s = StyleSheet.create({
  title: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 18, color: NAVY, letterSpacing: 0.4, textAlign: 'right' },
  sub: { fontFamily: 'Inter', fontSize: 6.5, letterSpacing: 1, color: GRAY, marginTop: 1, textTransform: 'uppercase', textAlign: 'right' },
  no: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8, letterSpacing: 1, color: GOLD, marginTop: 2, textTransform: 'uppercase', textAlign: 'right' },

  grid: { marginTop: 16, borderWidth: 1, borderColor: LINE, borderRadius: 5, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '50%', flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: LINE },
  k: { width: '36%', backgroundColor: ROW, paddingVertical: 5, paddingHorizontal: 10, fontFamily: 'Inter', fontWeight: 700, fontSize: 7.3, color: GRAY, textTransform: 'uppercase' },
  v: { flex: 1, paddingVertical: 5, paddingHorizontal: 10, fontFamily: 'Inter', fontWeight: 600, fontSize: 8.6, color: INK },

  bodyCap: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 1.4, color: GOLD, textTransform: 'uppercase', marginTop: 16, marginBottom: 5 },
  body: { fontFamily: 'Inter', fontSize: 9.5, color: INK, lineHeight: 1.6 },

  thead: { flexDirection: 'row', backgroundColor: NAVY, paddingVertical: 6, paddingHorizontal: 8, marginTop: 16, borderRadius: 2 },
  th: { fontFamily: 'Inter', fontWeight: 700, fontSize: 6.8, letterSpacing: 0.4, color: WHITE, textTransform: 'uppercase' },
  thNo: { width: 22 },
  row: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: LINE, alignItems: 'flex-start' },
  rowAlt: { backgroundColor: ROW },
  tNo: { width: 22, fontFamily: 'Inter', fontWeight: 700, fontSize: 8, color: GOLD },
  td: { fontFamily: 'Inter', fontSize: 8.3, color: INK },

  clauseRow: { flexDirection: 'row', marginBottom: 5, paddingRight: 10 },
  clauseNum: { width: 18, fontFamily: 'Inter', fontWeight: 700, fontSize: 8.6, color: GOLD },
  clauseText: { flex: 1, fontFamily: 'Inter', fontSize: 8.8, color: INK, lineHeight: 1.5 },

  remarkCap: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 1.4, color: GOLD, textTransform: 'uppercase', marginTop: 14, marginBottom: 3 },
  remark: { fontFamily: 'Inter', fontSize: 8.5, color: GRAY, lineHeight: 1.5 },

  signWrap: { marginTop: 28, alignItems: 'flex-end' },
  signCap: { fontFamily: 'Inter', fontSize: 8, color: GRAY },
  signLine: { borderBottomWidth: 1, borderBottomColor: '#334155', height: 32, width: 210, marginTop: 6, marginBottom: 7 },
  signName: { fontFamily: 'Inter', fontWeight: 700, fontSize: 10, color: NAVY },
  signSub: { fontFamily: 'Inter', fontSize: 8, color: GRAY, marginTop: 1 },
})

// PDF selalu Inggris untuk header baku (label kolom/particulars) agar konsisten
// sebagai dokumen resmi; isi (nilai) mengikuti apa yang diketik pengguna.
const en = (b: Bi) => b.en

export function SimpleDocument({ data }: { data: SimpleRenderData }) {
  const schema = getSimpleSchema(data.docType)
  const t = data.tenant
  if (!schema) return <Document><Page size="A4" style={base.page}><Text>Unknown document</Text></Page></Document>

  const footRef = `${data.docNumber} · ${data.fields.vesselName ?? ''} · ${data.fields.port ?? ''}`
  const cols = schema.table?.cols ?? []
  const colStyle = (c: { flex?: number; w?: number }) => (c.w != null ? { width: c.w } : { flex: c.flex ?? 1 })

  return (
    <Document title={data.docNumber} author={t.companyName}>
      <Page size="A4" style={base.page}>
        <Letterhead
          tenant={t}
          right={
            <>
              <Text style={s.title}>{en(schema.title)}</Text>
              <Text style={s.sub}>{en(schema.subtitle)}</Text>
              <Text style={s.no}>No. {data.docNumber}</Text>
            </>
          }
        />

        {/* particulars */}
        <View style={s.grid}>
          {schema.fields.map((f) => (
            <View key={f.key} style={s.cell}>
              <Text style={s.k}>{en(f.label)}</Text>
              <Text style={s.v}>{data.fields[f.key] || '—'}</Text>
            </View>
          ))}
        </View>

        {/* intro / statement */}
        {schema.introLabel && data.intro ? (
          <>
            <Text style={s.bodyCap}>{en(schema.introLabel)}</Text>
            <Text style={s.body}>{data.intro}</Text>
          </>
        ) : null}

        {/* table */}
        {schema.table && data.rows && data.rows.length > 0 ? (
          <>
            <View style={s.thead}>
              <Text style={[s.th, s.thNo]}>#</Text>
              {cols.map((c) => (
                <Text key={c.key} style={[s.th, colStyle(c)]}>
                  {en(c.label)}
                </Text>
              ))}
            </View>
            {data.rows.map((r, i) => (
              <View key={i} style={[s.row, i % 2 ? s.rowAlt : {}]} wrap={false}>
                <Text style={s.tNo}>{i + 1}</Text>
                {cols.map((c) => (
                  <Text key={c.key} style={[s.td, colStyle(c)]}>
                    {r[c.key] || ''}
                  </Text>
                ))}
              </View>
            ))}
          </>
        ) : null}

        {/* numbered clauses */}
        {schema.clausesLabel && data.clauses && data.clauses.length > 0 ? (
          <>
            <Text style={s.bodyCap}>{en(schema.clausesLabel)}</Text>
            {data.clauses.map((cl, i) => (
              <View key={i} style={s.clauseRow}>
                <Text style={s.clauseNum}>{i + 1}.</Text>
                <Text style={s.clauseText}>{cl}</Text>
              </View>
            ))}
          </>
        ) : null}

        {data.remarks ? (
          <>
            <Text style={s.remarkCap}>Remarks</Text>
            <Text style={s.remark}>{data.remarks}</Text>
          </>
        ) : null}

        <View style={s.signWrap}>
          <Text style={s.signCap}>{en(schema.signCap)}</Text>
          <View style={s.signLine} />
          <Text style={s.signName}>{data.signName}</Text>
          <Text style={s.signSub}>{data.signRole} · {t.companyName}</Text>
        </View>

        <DocFooter left={footRef} issuedAt={data.date} />
      </Page>
    </Document>
  )
}
