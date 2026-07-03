import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { NAVY, GOLD, INK, GRAY, GRAYL, LINE, ROW, base, Letterhead, DocFooter } from './base'
import { type BlData, type BlCopy, BL_SHIPPED_CLAUSE, buildBlCopies } from './bl-data'

const bl = StyleSheet.create({
  title: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 17, color: NAVY, letterSpacing: 0.5 },
  sub: { fontFamily: 'Inter', fontSize: 6.6, letterSpacing: 0.8, color: GRAY, marginTop: 1, textTransform: 'uppercase' },
  no: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8, letterSpacing: 1, color: GOLD, marginTop: 3, textTransform: 'uppercase' },

  // Stempel copy
  stampNeg: { marginTop: 6, borderWidth: 1, borderColor: GOLD, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 6, alignSelf: 'flex-end' },
  stampNegT: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 0.8, color: GOLD, textTransform: 'uppercase' },
  stampCopy: { marginTop: 6, borderWidth: 1, borderColor: GRAYL, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 6, alignSelf: 'flex-end' },
  stampCopyT: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 0.8, color: GRAY, textTransform: 'uppercase' },

  // Kotak pihak
  partiesRow: { flexDirection: 'row', marginTop: 14, gap: 8 },
  partiesCol: { flex: 1, gap: 8 },
  sideCol: { width: 150, gap: 8 },
  box: { borderWidth: 1, borderColor: LINE, borderRadius: 4, overflow: 'hidden' },
  boxCap: { backgroundColor: ROW, paddingVertical: 3, paddingHorizontal: 8, fontFamily: 'Inter', fontWeight: 700, fontSize: 6.6, letterSpacing: 0.8, color: GRAY, textTransform: 'uppercase' },
  boxVal: { paddingVertical: 5, paddingHorizontal: 8, fontFamily: 'Inter', fontSize: 8.6, color: INK, lineHeight: 1.4 },

  kvRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, borderWidth: 1, borderColor: LINE, borderRadius: 4, overflow: 'hidden' },
  kv: { width: '50%', flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: LINE },
  kvK: { width: '38%', backgroundColor: ROW, paddingVertical: 4, paddingHorizontal: 8, fontFamily: 'Inter', fontWeight: 700, fontSize: 6.8, color: GRAY, textTransform: 'uppercase' },
  kvV: { flex: 1, paddingVertical: 4, paddingHorizontal: 8, fontFamily: 'Inter', fontWeight: 600, fontSize: 8.4, color: INK },

  // Tabel kargo
  cargoCap: { fontFamily: 'Inter', fontWeight: 700, fontSize: 6.6, letterSpacing: 0.8, color: GRAY, textTransform: 'uppercase', marginTop: 12, marginBottom: 3 },
  tbl: { borderWidth: 1, borderColor: LINE, borderRadius: 4, overflow: 'hidden' },
  thr: { flexDirection: 'row', backgroundColor: NAVY },
  th: { fontFamily: 'Inter', fontWeight: 700, fontSize: 6.6, color: '#FFFFFF', paddingVertical: 4, paddingHorizontal: 7, textTransform: 'uppercase' },
  tr: { flexDirection: 'row', minHeight: 46 },
  td: { fontFamily: 'Inter', fontSize: 8.4, color: INK, paddingVertical: 5, paddingHorizontal: 7, lineHeight: 1.4, borderRightWidth: 1, borderRightColor: LINE },
  cMarks: { width: '20%' },
  cPkg: { width: '18%' },
  cDesc: { flex: 1 },
  cWt: { width: '20%' },
  cMeas: { width: '15%', borderRightWidth: 0 },
  unknownNote: { fontFamily: 'Inter', fontSize: 6.8, color: GRAY, fontStyle: 'normal', marginTop: 3 },

  clause: { fontFamily: 'Inter', fontSize: 7.6, color: INK, lineHeight: 1.55, marginTop: 10, textAlign: 'justify' },
  freightRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, borderWidth: 1, borderColor: LINE, borderRadius: 4, overflow: 'hidden' },

  footRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  issueBox: { width: 250 },
  cap: { fontFamily: 'Inter', fontWeight: 700, fontSize: 6.6, letterSpacing: 0.6, color: GRAY, textTransform: 'uppercase' },
  val: { fontFamily: 'Inter', fontWeight: 600, fontSize: 8.8, color: NAVY, marginTop: 2 },
  origLine: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8.4, color: NAVY, marginTop: 8 },
  signBox: { width: 220 },
  signLine: { borderBottomWidth: 1, borderBottomColor: '#334155', height: 34, marginTop: 6, marginBottom: 6 },
  signName: { fontFamily: 'Inter', fontWeight: 700, fontSize: 9.5, color: NAVY },
  signSub: { fontFamily: 'Inter', fontSize: 7.6, color: GRAY, marginTop: 1 },
})

function Box({ cap, val }: { cap: string; val: string }) {
  return (
    <View style={bl.box}>
      <Text style={bl.boxCap}>{cap}</Text>
      <Text style={bl.boxVal}>{val || '—'}</Text>
    </View>
  )
}
function KV({ k, v }: { k: string; v: string }) {
  return (
    <View style={bl.kv}>
      <Text style={bl.kvK}>{k}</Text>
      <Text style={bl.kvV}>{v || '—'}</Text>
    </View>
  )
}

function BlFace({ data, copy }: { data: BlData; copy: BlCopy }) {
  const t = data.tenant
  const footRef = `${data.docNumber} · ${data.vesselName} · ${data.portOfLoading} → ${data.portOfDischarge}`
  const stampText = copy.negotiable
    ? `NEGOTIABLE · ORIGINAL ${copy.index} of ${copy.ofOriginals}`
    : 'NON-NEGOTIABLE COPY'

  return (
    <Page size="A4" style={base.page}>
      <Letterhead
        tenant={t}
        right={
          <>
            <Text style={bl.title}>BILL OF LADING</Text>
            <Text style={bl.sub}>To be used with Charter-Parties</Text>
            <Text style={bl.no}>B/L No. {data.docNumber}</Text>
            <View style={copy.negotiable ? bl.stampNeg : bl.stampCopy}>
              <Text style={copy.negotiable ? bl.stampNegT : bl.stampCopyT}>{stampText}</Text>
            </View>
          </>
        }
      />

      <View style={bl.partiesRow}>
        <View style={bl.partiesCol}>
          <Box cap="Shipper" val={data.shipper} />
          <Box cap="Consignee (or order)" val={data.consignee} />
          <Box cap="Notify Party" val={data.notifyParty} />
        </View>
        <View style={bl.sideCol}>
          <Box cap="B/L No." val={data.docNumber} />
          <Box cap="Reference" val={data.reference || '—'} />
          <Box cap="Carrier" val={data.carrier} />
        </View>
      </View>

      <View style={bl.kvRow}>
        <KV k="Vessel" v={`${data.vesselName}${data.flag ? ' (' + data.flag + ')' : ''}`} />
        <KV k="Voyage No." v={data.voyageNo} />
        <KV k="Port of Loading" v={data.portOfLoading} />
        <KV k="Port of Discharge" v={data.portOfDischarge} />
        <KV k="Place of Receipt" v={data.placeOfReceipt || '—'} />
        <KV k="Place of Delivery" v={data.placeOfDelivery || '—'} />
      </View>

      <Text style={bl.cargoCap}>Particulars furnished by the Shipper</Text>
      <View style={bl.tbl}>
        <View style={bl.thr}>
          <Text style={[bl.th, bl.cMarks]}>Marks &amp; Nos.</Text>
          <Text style={[bl.th, bl.cPkg]}>No. &amp; kind of pkgs</Text>
          <Text style={[bl.th, bl.cDesc]}>Description of Goods</Text>
          <Text style={[bl.th, bl.cWt]}>Gross Weight</Text>
          <Text style={[bl.th, bl.cMeas]}>Measurement</Text>
        </View>
        <View style={bl.tr}>
          <Text style={[bl.td, bl.cMarks]}>{data.marksNumbers || '—'}</Text>
          <Text style={[bl.td, bl.cPkg]}>{data.packages || '—'}</Text>
          <Text style={[bl.td, bl.cDesc]}>{data.description || '—'}</Text>
          <Text style={[bl.td, bl.cWt]}>{data.grossWeight || '—'}</Text>
          <Text style={[bl.td, bl.cMeas]}>{data.measurement || '—'}</Text>
        </View>
      </View>
      <Text style={bl.unknownNote}>
        Weight, measure, quantity, quality, condition, contents and value unknown — said to weigh/contain as declared.
      </Text>

      <Text style={bl.clause}>{BL_SHIPPED_CLAUSE}</Text>

      <View style={bl.freightRow}>
        <KV k="Freight" v={data.freightTerms} />
        <KV k="Charter-Party dated" v={data.charterPartyDate} />
        <KV k="Shipped on board" v={data.shippedOnBoardDate} />
        <KV k="No. of original B/L" v={String(copy.ofOriginals)} />
      </View>

      <View style={bl.footRow}>
        <View style={bl.issueBox}>
          <Text style={bl.cap}>Place &amp; Date of Issue</Text>
          <Text style={bl.val}>
            {data.placeOfIssue}
            {data.dateOfIssue ? ` · ${data.dateOfIssue}` : ''}
          </Text>
          <Text style={bl.origLine}>
            Number of original Bills of Lading: {copy.ofOriginals}
          </Text>
        </View>
        <View style={bl.signBox}>
          <Text style={bl.cap}>Signed for the Carrier</Text>
          <View style={bl.signLine} />
          <Text style={bl.signName}>{data.signatoryName}</Text>
          <Text style={bl.signSub}>{data.signedFor}</Text>
          <Text style={bl.signSub}>{t.companyName}</Text>
        </View>
      </View>

      <DocFooter left={`${footRef} · ${copy.negotiable ? 'ORIGINAL' : 'COPY'}`} issuedAt={data.dateOfIssue} />
    </Page>
  )
}

export function BlDocument({ data }: { data: BlData }) {
  const t = data.tenant
  const copies = buildBlCopies(data.originalCount, data.copyCount)
  return (
    <Document title={data.docNumber} author={t.companyName}>
      {copies.map((c, i) => (
        <BlFace key={i} data={data} copy={c} />
      ))}
    </Document>
  )
}
