// Pemilihan ServiceRate — MURNI, tanpa impor nilai (K25/K26, §3).
//
// Yang ADA di sini: saring → skor → tie-break → jujur soal ambiguitas.
// Yang TIDAK ada di sini: query-nya. Kandidat datang sebagai array dari
// autofill.service.ts (3b) supaya bagian yang menentukan uang bisa diuji dengan
// array bikinan, tanpa database.

import type { CalcWarning } from './calc-engine'

/** Bentuk kandidat = subset ServiceRate yang benar-benar dipakai memilih. */
export type KandidatTarif = {
  id: string
  portId: string | null
  vesselType: string | null
  gtMin: number | null
  gtMax: number | null
  rate: number
  currency: string
  minCharge: number | null
  effectiveFrom: Date
  effectiveTo: Date | null
  createdAt: Date
}

export type KonteksTarif = {
  /** K24: tarif yang berlaku adalah tarif SAAT KUNJUNGAN, bukan saat pengetikan. */
  tanggalJasa: Date
  portId: string | null
  vesselType: string | null
  gt: number | null
}

export type HasilPilihTarif = {
  terpilih: KandidatTarif | null
  skor: number | null
  /** Kandidat yang lolos saringan, sudah terurut menang→kalah. */
  kandidatLolos: readonly KandidatTarif[]
  warnings: CalcWarning[]
}

/**
 * Bobot spesifisitas K25 langkah 2. 4 > 2 + 1 disengaja: tarif khusus pelabuhan
 * SELALU mengalahkan kombinasi apa pun dari kecocokan lain, karena tarif
 * pelabuhan itu regulasi lokal sedangkan jenis kapal dan bracket GT adalah
 * pemodelan kita sendiri.
 */
export const BOBOT_PORT = 4
export const BOBOT_VESSEL_TYPE = 2
export const BOBOT_BRACKET_GT = 1

const punyaBracket = (k: KandidatTarif): boolean => k.gtMin !== null || k.gtMax !== null

/** K25 langkah 1. */
export function lolosSaringan(k: KandidatTarif, ctx: KonteksTarif): boolean {
  const t = ctx.tanggalJasa.getTime()
  if (!(k.effectiveFrom.getTime() <= t)) return false
  if (k.effectiveTo !== null && !(k.effectiveTo.getTime() >= t)) return false
  if (k.portId !== null && k.portId !== ctx.portId) return false
  if (k.vesselType !== null && k.vesselType !== ctx.vesselType) return false

  if (punyaBracket(k)) {
    // GT kosong → hanya baris TANPA bracket yang lolos: memilih bracket tanpa
    // tahu GT-nya berarti menebak uang.
    if (ctx.gt === null || !Number.isFinite(ctx.gt)) return false
    if (k.gtMin !== null && ctx.gt < k.gtMin) return false
    if (k.gtMax !== null && ctx.gt > k.gtMax) return false
  }
  return true
}

/** K25 langkah 2. */
export function skorTarif(k: KandidatTarif, ctx: KonteksTarif): number {
  let skor = 0
  if (k.portId !== null && k.portId === ctx.portId) skor += BOBOT_PORT
  if (k.vesselType !== null && k.vesselType === ctx.vesselType) skor += BOBOT_VESSEL_TYPE
  if (punyaBracket(k)) skor += BOBOT_BRACKET_GT
  return skor
}

/**
 * Urutan menang: skor tertinggi → `effectiveFrom` terbaru → `createdAt` terbaru →
 * `id` terkecil (K25 langkah 3). Rantai tie-break diakhiri `id` supaya hasilnya
 * deterministik dan bisa diuji dengan array yang diacak.
 */
function bandingkan(a: KandidatTarif, b: KandidatTarif, ctx: KonteksTarif): number {
  const ds = skorTarif(b, ctx) - skorTarif(a, ctx)
  if (ds !== 0) return ds
  const df = b.effectiveFrom.getTime() - a.effectiveFrom.getTime()
  if (df !== 0) return df
  const dc = b.createdAt.getTime() - a.createdAt.getTime()
  if (dc !== 0) return dc
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export function pilihTarif(
  kandidat: readonly KandidatTarif[],
  ctx: KonteksTarif,
): HasilPilihTarif {
  const warnings: CalcWarning[] = []
  const lolos = kandidat.filter((k) => lolosSaringan(k, ctx)).sort((a, b) => bandingkan(a, b, ctx))

  if (lolos.length === 0) {
    // K27: tarif tidak ditemukan TIDAK memblokir penyimpanan DRAFT. Baris tersimpan
    // unitPrice = 0 + warning, dan warning inilah yang memblokir submit ke review.
    warnings.push({
      kode: 'TARIF_TIDAK_ADA',
      pesan: 'Tarif berlaku tidak ditemukan untuk tanggal & pelabuhan ini — isi di Master › Tarif.',
    })
    return { terpilih: null, skor: null, kandidatLolos: lolos, warnings }
  }

  const menang = lolos[0]
  const kedua = lolos[1]

  // K25 langkah 4: memilih diam-diam di antara dua tarif uang yang sama-sama sah
  // adalah tepat jenis kesalahan yang tak akan pernah ada yang menyadarinya.
  if (
    kedua &&
    skorTarif(kedua, ctx) === skorTarif(menang, ctx) &&
    kedua.effectiveFrom.getTime() === menang.effectiveFrom.getTime()
  ) {
    warnings.push({
      kode: 'TARIF_AMBIGU',
      pesan: '2 tarif bersaing dengan spesifisitas & tanggal berlaku yang sama — periksa Master › Tarif.',
      data: { tarifDipakai: menang.id, tarifPesaing: kedua.id },
    })
  }

  return { terpilih: menang, skor: skorTarif(menang, ctx), kandidatLolos: lolos, warnings }
}

/**
 * Label bracket untuk `basis` (K26). Teks tampilan saja — dilarang di-parse (K13).
 * Angka dibiarkan mentah; pemformatan lokal urusan lapisan tampilan.
 */
export function labelBracket(k: KandidatTarif): string | null {
  if (k.gtMin === null && k.gtMax === null) return null
  if (k.gtMax === null) return `bracket GT ${k.gtMin}+`
  if (k.gtMin === null) return `bracket GT ≤ ${k.gtMax}`
  return `bracket GT ${k.gtMin}–${k.gtMax}`
}
