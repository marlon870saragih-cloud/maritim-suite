import React from 'react'
import { View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import { registerPdfFonts } from './fonts'
import type { EpdaTenant } from './epda-data'

registerPdfFonts()

// ===== Palet & token bersama (dari EPDA/Invoice-Tribuana.pdf) =====
export const NAVY = '#0E2238'
export const GOLD = '#A87B2E'
export const INK = '#16202B'
export const GRAY = '#6B7A8D'
export const GRAYL = '#94A3B8'
export const LINE = '#E3E7EC'
export const ROW = '#F6F8FA'
export const WHITE = '#FFFFFF'

export const fmt = (n: number) => (n || 0).toLocaleString('en-US')

export const base = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 34,
    paddingHorizontal: 38,
    fontFamily: 'Inter',
    fontSize: 9,
    color: INK,
    backgroundColor: WHITE,
  },
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
  ruleNavy: { height: 2, backgroundColor: NAVY, marginTop: 9 },
  ruleGold: { height: 1, backgroundColor: GOLD, marginTop: 1.5, width: '38%' },
  footer: {
    position: 'absolute',
    bottom: 22,
    left: 38,
    right: 38,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: LINE,
    paddingTop: 8,
  },
  footText: { fontFamily: 'Inter', fontSize: 7.2, color: GRAYL },
})

function initials(name: string) {
  return name
    .split(' ')
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 3)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

// Kop surat: seal/logo + nama perusahaan + alamat (kiri), blok kanan dokumen-spesifik,
// lalu garis ganda navy + emas.
export function Letterhead({ tenant, right }: { tenant: EpdaTenant; right: React.ReactNode }) {
  return (
    <>
      <View style={base.header}>
        <View style={base.brandRow}>
          <View style={base.seal}>
            {tenant.logoUrl ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={tenant.logoUrl} style={base.sealLogo} />
            ) : (
              <Text style={base.sealText}>{initials(tenant.companyName)}</Text>
            )}
          </View>
          <View>
            <Text style={base.coName}>{tenant.companyName}</Text>
            {tenant.companyTagline ? <Text style={base.coTag}>{tenant.companyTagline}</Text> : null}
            <Text style={base.coAddr}>
              {[tenant.companyAddress, tenant.companyPhone, tenant.companyEmail].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>{right}</View>
      </View>
      <View style={base.ruleNavy} />
      <View style={base.ruleGold} />
    </>
  )
}

// Footer tetap: referensi dokumen (kiri) + "Page X of Y · Generated …" (kanan).
export function DocFooter({ left, issuedAt }: { left: string; issuedAt: string }) {
  return (
    <View style={base.footer} fixed>
      <Text style={base.footText}>{left}</Text>
      <Text
        style={base.footText}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages} · Generated ${issuedAt}`}
      />
    </View>
  )
}
