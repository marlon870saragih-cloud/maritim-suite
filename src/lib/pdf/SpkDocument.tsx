import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { NAVY, GOLD, INK, GRAY, GRAYL, LINE, ROW, WHITE, base, Letterhead, DocFooter } from './base'
import { type SpkData, spkIntro } from './spk-data'

const sk = StyleSheet.create({
  // Blok kanan kop (judul dokumen + meta)
  docKind: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7.5, letterSpacing: 1.8, color: GOLD, textTransform: 'uppercase' },
  docNo: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 14, color: NAVY, marginTop: 2 },
  metaLine: { flexDirection: 'row', justifyContent: 'flex-end', gap: 6, marginTop: 3 },
  metaLabel: { fontFamily: 'Inter', fontSize: 7.5, color: GRAY },
  metaVal: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7.5, color: NAVY },

  // Judul dokumen
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 18 },
  title: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 24, color: NAVY, letterSpacing: 0.5 },
  subtitle: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7.5, letterSpacing: 1.6, color: GOLD, textTransform: 'uppercase', marginTop: 3 },
  badge: { borderWidth: 1, borderColor: NAVY, borderRadius: 3, paddingVertical: 5, paddingHorizontal: 12 },
  badgeText: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8, letterSpacing: 1.6, color: NAVY, textTransform: 'uppercase' },

  // Kotak info dua-kolom (para pihak / partikular kapal)
  infoBox: { borderWidth: 1, borderColor: LINE, borderRadius: 4, overflow: 'hidden', marginTop: 14 },
  infoRow: { flexDirection: 'row' },
  infoCell: { flex: 1, flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 11, gap: 8, alignItems: 'flex-start' },
  infoLabel: { fontFamily: 'Inter', fontWeight: 700, fontSize: 6.8, letterSpacing: 1, color: GRAYL, textTransform: 'uppercase', width: 64, marginTop: 1.5 },
  infoVal: { fontFamily: 'Inter', fontWeight: 700, fontSize: 9, color: NAVY, flex: 1, lineHeight: 1.3 },
  cellDivider: { borderLeftWidth: 1, borderLeftColor: LINE },

  intro: { fontFamily: 'Inter', fontSize: 9, color: INK, lineHeight: 1.55, marginTop: 13 },
  bold: { fontFamily: 'Inter', fontWeight: 700, color: NAVY },

  // Tabel lingkup pekerjaan
  thead: { flexDirection: 'row', backgroundColor: NAVY, paddingVertical: 6, paddingHorizontal: 11, marginTop: 16, borderRadius: 2 },
  thNo: { width: 30, fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 0.8, color: WHITE, textTransform: 'uppercase' },
  thText: { flex: 1, fontFamily: 'Inter', fontWeight: 700, fontSize: 7, letterSpacing: 0.8, color: WHITE, textTransform: 'uppercase' },
  scopeRow: { flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 11, borderBottomWidth: 1, borderBottomColor: LINE, alignItems: 'flex-start' },
  scopeNo: { width: 30, fontFamily: 'Inter', fontWeight: 700, fontSize: 8.5, color: GOLD },
  scopeBody: { flex: 1 },
  scopeText: { fontFamily: 'Inter', fontSize: 9, color: INK, lineHeight: 1.4 },
  scopeDetail: { fontFamily: 'Inter', fontSize: 7.6, color: GRAYL, marginTop: 1.5, lineHeight: 1.4 },

  // Ketentuan
  termsCap: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7.5, letterSpacing: 1.4, color: GOLD, textTransform: 'uppercase', marginTop: 16, marginBottom: 6 },
  termRow: { flexDirection: 'row', gap: 7, marginBottom: 4, paddingRight: 6 },
  termNo: { fontFamily: 'Inter', fontWeight: 700, fontSize: 8.5, color: NAVY, width: 12 },
  termText: { flex: 1, fontFamily: 'Inter', fontSize: 8.5, color: INK, lineHeight: 1.45 },

  // Tanda tangan dua kolom
  signRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 26, gap: 40 },
  signCol: { flex: 1 },
  signCap: { fontFamily: 'Inter', fontWeight: 700, fontSize: 7.5, letterSpacing: 1.4, color: GOLD, textTransform: 'uppercase', marginBottom: 4 },
  signOrg: { fontFamily: 'Spectral', fontWeight: 700, fontSize: 10.5, color: NAVY },
  signSpace: { height: 46 },
  signName: { fontFamily: 'Inter', fontWeight: 700, fontSize: 9.5, color: NAVY },
  signLine: { fontFamily: 'Inter', fontSize: 9, color: GRAY, marginTop: 1 },
  signTitle: { fontFamily: 'Inter', fontSize: 8, color: GRAY, marginTop: 1 },
})

function InfoCell({ label, value, divider }: { label: string; value: string; divider?: boolean }) {
  return (
    <View style={[sk.infoCell, divider ? sk.cellDivider : {}]}>
      <Text style={sk.infoLabel}>{label}</Text>
      <Text style={sk.infoVal}>{value}</Text>
    </View>
  )
}

function InfoRow({
  left,
  right,
  alt,
}: {
  left: { label: string; value: string }
  right: { label: string; value: string }
  alt?: boolean
}) {
  return (
    <View style={[sk.infoRow, alt ? { backgroundColor: ROW } : {}]}>
      <InfoCell label={left.label} value={left.value} />
      <InfoCell label={right.label} value={right.value} divider />
    </View>
  )
}

export function SpkDocument({ data }: { data: SpkData }) {
  const t = data.tenant
  const mainAgent = t.companyName
  const footRef = `${data.docNumber} · ${data.vesselName} · ${data.loadPort} – ${data.dischPort}`

  return (
    <Document title={data.docNumber} author={t.companyName}>
      <Page size="A4" style={base.page}>
        <Letterhead
          tenant={t}
          right={
            <>
              <Text style={sk.docKind}>Surat Penunjukan · SPK</Text>
              <Text style={sk.docNo}>{data.docNumber}</Text>
              <View style={sk.metaLine}>
                <Text style={sk.metaLabel}>Tanggal</Text>
                <Text style={sk.metaVal}>{data.issuedAt}</Text>
              </View>
              <View style={sk.metaLine}>
                <Text style={sk.metaLabel}>Berlaku</Text>
                <Text style={sk.metaVal}>{data.validity}</Text>
              </View>
              <View style={sk.metaLine}>
                <Text style={sk.metaLabel}>Sifat</Text>
                <Text style={sk.metaVal}>{data.appointmentType}</Text>
              </View>
            </>
          }
        />

        <View style={sk.titleRow}>
          <View>
            <Text style={sk.title}>Surat Penunjukan Kerja</Text>
            <Text style={sk.subtitle}>Sub-Agency Appointment · Keagenan Kapal</Text>
          </View>
          <View style={sk.badge}>
            <Text style={sk.badgeText}>Penunjukan</Text>
          </View>
        </View>

        {/* Para pihak */}
        <View style={sk.infoBox}>
          <InfoRow
            left={{ label: 'Kepada', value: data.toContact }}
            right={{ label: 'Penunjuk', value: mainAgent }}
          />
          <InfoRow
            left={{ label: 'Perusahaan', value: data.toCompany }}
            right={{ label: 'Peran', value: data.toRole }}
            alt
          />
          <InfoRow
            left={{ label: 'Kota', value: data.toCity }}
            right={{ label: 'Principal', value: data.principal }}
          />
        </View>

        <Text style={sk.intro}>
          {spkIntro(data, mainAgent)
            .split(new RegExp(`(${mainAgent}|${data.toCompany}|${data.toRole}|Main Agent)`))
            .map((part, i) =>
              part === mainAgent || part === data.toCompany || part === data.toRole || part === 'Main Agent' ? (
                <Text key={i} style={sk.bold}>
                  {part}
                </Text>
              ) : (
                part
              ),
            )}
        </Text>

        {/* Partikular kapal */}
        <View style={sk.infoBox}>
          <InfoRow
            left={{ label: 'Vessel', value: data.vesselName }}
            right={{ label: 'GT / NRT', value: data.gtNrt }}
          />
          <InfoRow
            left={{ label: 'Cargo', value: data.cargo }}
            right={{ label: 'Loading', value: data.loadingDate }}
            alt
          />
          <InfoRow
            left={{ label: 'Load Port', value: data.loadPort }}
            right={{ label: 'Disch Port', value: data.dischPort }}
          />
        </View>

        {/* Lingkup pekerjaan */}
        <View style={sk.thead}>
          <Text style={sk.thNo}>No</Text>
          <Text style={sk.thText}>Lingkup Pekerjaan Sub-Agen</Text>
        </View>
        {data.scopeItems.map((it, i) => (
          <View key={i} style={sk.scopeRow}>
            <Text style={sk.scopeNo}>{String(i + 1).padStart(2, '0')}</Text>
            <View style={sk.scopeBody}>
              <Text style={sk.scopeText}>{it.text}</Text>
              {it.detail ? <Text style={sk.scopeDetail}>{it.detail}</Text> : null}
            </View>
          </View>
        ))}

        {/* Ketentuan */}
        <Text style={sk.termsCap}>Ketentuan</Text>
        {data.terms.map((term, i) => (
          <View key={i} style={sk.termRow}>
            <Text style={sk.termNo}>{i + 1}.</Text>
            <Text style={sk.termText}>{term}</Text>
          </View>
        ))}

        {/* Tanda tangan */}
        <View style={sk.signRow} wrap={false}>
          <View style={sk.signCol}>
            <Text style={sk.signCap}>Diterima Oleh</Text>
            <Text style={sk.signOrg}>{data.toCompany}</Text>
            <View style={sk.signSpace} />
            <Text style={sk.signName}>{data.toContact}</Text>
            <Text style={sk.signLine}>( ______________________ )</Text>
          </View>
          <View style={sk.signCol}>
            <Text style={sk.signCap}>Disetujui Oleh</Text>
            <Text style={sk.signOrg}>{mainAgent}</Text>
            <View style={sk.signSpace} />
            <Text style={sk.signName}>{data.approvedByName}</Text>
            <Text style={sk.signTitle}>{data.approvedByTitle}</Text>
          </View>
        </View>

        <DocFooter left={footRef} issuedAt={data.issuedAt} />
      </Page>
    </Document>
  )
}
