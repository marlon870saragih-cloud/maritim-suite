// Anomaly Detection — lapisan DB (Fase 6e · K71–K74).
// Pola meniru port.service.ts (⭐ MODUL RUJUKAN) — lihat docs/POLA-SERVICE-LAYER.md §5.
//
// Semua ARTI (delapan aturan, semua ambang) hidup di `anomaly-rules.ts` (murni,
// 6b). Berkas ini hanya membaca baris dokumen + "kunjungan serupa" dari DB dan
// menyerahkannya ke fungsi murni itu — persis pembagian kerja `prediction.
// service.ts` (6c) terhadap `confidence.ts`/`prediction-core.ts`.
//
// ⚠️ K65 tetap berlaku: query "kunjungan serupa" WAJIB mulai dari
// `forTenant(ctx).disbursement`, `items` sebagai nested include. TIDAK ADA
// `disbursementItem` sebagai model akar di berkas ini.
//
// ⚠️ Penyederhanaan sadar dari K63 (dicatat, bukan disembunyikan): 6c meladeni
// SATU jasa per pemanggilan dengan tangga 4 tingkat kemiripan yang melonggar
// sampai `n ≥ 1`. Anomaly detection butuh POPULASI kunjungan serupa (untuk
// menghitung "berapa % kunjungan memuat jasa X" dan "median grandTotal
// kunjungan serupa") — pertanyaan berbeda bentuk dari "harga satuan jasa X".
// Di sini dipakai SATU kriteria pragmatis tetap (pelabuhan sama WAJIB +
// vesselType sama JIKA diketahui + GT ±50% JIKA diketahui + ≤36 bulan,
// mendekati "tingkat 2/3" K63) — TANPA tangga yang melonggar sendiri. Ini
// sejalan status increment ini sendiri (⚠️ terhalang P19 — ambang & definisi
// "serupa" untuk anomali belum final): menambah tangga penuh sekarang berarti
// merawat presisi yang belum ada gunanya sebelum P19 dijawab.
//
// ⚠️ K71/KURS_MENYIMPANG lintas mata uang: satu dokumen bisa punya baris
// bermata uang berbeda-beda, sedangkan `KonteksPeriksa.kursAcuan` cuma satu
// angka. Karena itu berkas ini TIDAK memanggil `jalankanSemuaAturan()` sekali
// untuk seluruh dokumen (yang mengasumsikan satu kurs acuan); tiap baris
// mendapat `kursAcuan` MILIKNYA SENDIRI (per mata uang, dicache) lewat
// `konteksBaris()`, dan kedelapan aturan dipanggil satu-satu (semuanya sudah
// diekspor individual dari anomaly-rules.ts, bukan cuma lewat pembungkusnya).

import type { CalcMethod, DisbursementKind } from '@prisma/client'
import type { TenantContext } from '../context'
import { ServiceError } from '../errors'
import { forTenant } from '../tenant-db'
import { pastikanLanggananAktif } from '../subscription'
import { getLatestRate } from '../master/exchange-rate.service'
import { tanggalJasa, type VoyageUntukAutofill } from '../finance/autofill.service'
import { getDisbursement, getDisbursementDetail, muatVoyage } from '../finance/disbursement.service'
import { variancePasangan } from '../finance/fda.service'
import { pilihTarif, type KandidatTarif } from '../finance/rate-resolver'
import { adalahNyata, asalEfektif } from './provenance'
import { median } from './prediction-core'
import { STATUS_FDA_AKTUAL } from './prediction.service'
import {
  aturanBarisGanda,
  aturanDiLuarKatalog,
  aturanHargaMenyimpang,
  aturanJasaHilang,
  aturanKursMenyimpang,
  aturanManualBesar,
  aturanNonaktif,
  aturanTotalMenyimpang,
  aturanVarianceBesar,
  ringkasanNonaktif,
  type Anomali,
  type AturanNonaktif,
  type BarisPeriksa,
  type HistoriJasa,
  type KonteksPeriksa,
} from './anomaly-rules'

export type HasilAnomali = {
  anomali: Anomali[]
  nonaktif: AturanNonaktif[]
  ringkasanNonaktif: string | null
}

/** Bulan Gregorian rata-rata dalam ms — sama seperti `prediction.service.ts` (K68). */
const MS_PER_BULAN = (365.2425 * 24 * 60 * 60 * 1000) / 12
const JENDELA_BULAN = 36

// ------------------------------------------------------------- tarif katalog

/** Tarif ServiceRate per jasa yang diminta — pola sama `prediction.service.ts` §K62. */
async function tarifKatalog(
  ctx: TenantContext,
  serviceIds: string[],
  tgl: Date,
): Promise<Map<string, KandidatTarif[]>> {
  const rows = await forTenant(ctx).serviceRate.findMany({
    where: {
      serviceId: { in: serviceIds },
      effectiveFrom: { lte: tgl },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: tgl } }],
    },
    select: {
      id: true, serviceId: true, portId: true, vesselType: true, gtMin: true, gtMax: true,
      rate: true, currency: true, minCharge: true, effectiveFrom: true, effectiveTo: true, createdAt: true,
    },
  })
  const peta = new Map<string, KandidatTarif[]>()
  for (const r of rows) {
    const daftar = peta.get(r.serviceId) ?? []
    daftar.push(r)
    peta.set(r.serviceId, daftar)
  }
  return peta
}

// ------------------------------------------------------------ variance (K46)

/**
 * `variancePct` per item FDA, lewat `variancePasangan()` (fda.service.ts) yang
 * SUDAH ADA — tak ada hitungan variance kedua di sini (sama prinsipnya dengan
 * K61: satu mesin, dipakai ulang). Dokumen EPDA atau FDA tanpa padanan EPDA
 * → peta kosong (rule VARIANCE_BESAR diam total, itu perilaku yang benar).
 */
async function variancePerItem(ctx: TenantContext, disbursementId: string, kind: string): Promise<Map<string, number>> {
  if (kind !== 'FDA') return new Map()
  try {
    const hasil = await variancePasangan(ctx, disbursementId)
    const peta = new Map<string, number>()
    for (const b of hasil.baris) {
      if (b.fda && b.variancePct !== null) peta.set(b.fda.id, b.variancePct)
    }
    return peta
  } catch {
    // FDA tanpa EPDA asal (semua baris ad-hoc) — variancePasangan() melempar
    // validation(); di sini itu bukan galat, cuma "tak ada yang dibandingkan".
    return new Map()
  }
}

// -------------------------------------------------------- kunjungan serupa

type DokumenSerupa = {
  id: string
  grandTotalBase: number
  nyata: boolean
  items: { serviceId: string | null; unitPrice: number }[]
}

/**
 * Populasi "kunjungan serupa" — SATU kriteria pragmatis tetap (lihat catatan
 * kepala berkas). `forTenant(ctx).disbursement` sebagai akar (K65).
 */
async function kunjunganSerupa(
  ctx: TenantContext,
  voyage: VoyageUntukAutofill,
  tgl: Date,
  kecualikanId: string,
): Promise<DokumenSerupa[]> {
  if (!voyage.portId) return []
  const vesselType = voyage.vessel?.vesselType ?? null
  const gt = voyage.vessel?.gt ?? null

  const vesselWhere: Record<string, unknown> = {}
  if (vesselType) vesselWhere.vesselType = vesselType
  if (gt !== null && Number.isFinite(gt) && gt > 0) {
    const selisih = (gt * 50) / 100
    vesselWhere.gt = { gte: gt - selisih, lte: gt + selisih }
  }

  const batasAtas = new Date(tgl.getTime())
  const batasBawah = new Date(tgl.getTime() - JENDELA_BULAN * MS_PER_BULAN)

  const dokumen = await forTenant(ctx).disbursement.findMany({
    where: {
      kind: 'FDA',
      status: { in: [...STATUS_FDA_AKTUAL] },
      supersededBy: null,
      deletedAt: null,
      id: { not: kecualikanId },
      issuedAt: { gte: batasBawah, lte: batasAtas },
      voyage: {
        portId: voyage.portId,
        deletedAt: null,
        ...(Object.keys(vesselWhere).length > 0 ? { vessel: vesselWhere } : {}),
      },
    },
    select: {
      id: true,
      grandTotal: true,
      dataOrigin: true,
      voyage: { select: { dataOrigin: true } },
      items: { select: { serviceId: true, unitPrice: true } },
    },
    take: 200,
  })

  return dokumen.map((d) => ({
    id: d.id,
    grandTotalBase: d.grandTotal,
    nyata: adalahNyata(asalEfektif(d.voyage?.dataOrigin ?? null, d.dataOrigin)),
    items: d.items,
  }))
}

/** Ringkas populasi jadi `HistoriJasa[]` (K71 JASA_HILANG/HARGA_MENYIMPANG) + median grandTotal. */
function ringkasPopulasi(
  populasi: readonly DokumenSerupa[],
  hargaSatuanPerJasa: Map<string, number[]>,
  namaJasa: Map<string, string>,
): { histori: HistoriJasa[]; medianGrandTotal: number | null; nNyata: number; nLatihan: number } {
  const nyata = populasi.filter((d) => d.nyata)
  const latihan = populasi.filter((d) => !d.nyata)

  const kemunculan = new Map<string, number>()
  for (const d of nyata) {
    const dilihat = new Set<string>()
    for (const it of d.items) {
      if (!it.serviceId || dilihat.has(it.serviceId)) continue
      dilihat.add(it.serviceId)
      kemunculan.set(it.serviceId, (kemunculan.get(it.serviceId) ?? 0) + 1)
    }
  }

  const histori: HistoriJasa[] = Array.from(kemunculan.entries()).map(([serviceId, jumlah]) => ({
    serviceId,
    nama: namaJasa.get(serviceId) ?? serviceId,
    medianUnitPrice: median(hargaSatuanPerJasa.get(serviceId) ?? []),
    kemunculanPct: nyata.length === 0 ? 0 : (jumlah / nyata.length) * 100,
  }))

  return {
    histori,
    medianGrandTotal: nyata.length === 0 ? null : median(nyata.map((d) => d.grandTotalBase)),
    nNyata: nyata.length,
    nLatihan: latihan.length,
  }
}

// ----------------------------------------------------------------------- inti

export async function anomaliUntukDisbursement(
  ctx: TenantContext,
  disbursementId: string,
  opsi: { bahasa?: 'id' | 'en' } = {},
): Promise<HasilAnomali> {
  // K54/K33 — sama seperti prediction.service.ts: fitur AI, gerbang di awal.
  await pastikanLanggananAktif(ctx)
  const bahasa = opsi.bahasa ?? 'id'

  const disb = await getDisbursement(ctx, disbursementId)
  const detail = await getDisbursementDetail(ctx, disbursementId)
  const voyage = await muatVoyage(ctx, disb.voyageId)
  // Dokumen tanpa satu baris pun: tak ada apa pun untuk diperiksa, dan
  // menjalankan JASA_HILANG pada dokumen kosong akan menandai SEMUA jasa
  // umum sebagai "hilang" — kebisingan, bukan temuan.
  if (disb.items.length === 0) {
    return { anomali: [], nonaktif: [], ringkasanNonaktif: null }
  }

  const tgl = tanggalJasa(disb.kind as DisbursementKind, voyage, disb.issuedAt)

  const serviceIds = Array.from(new Set(disb.items.map((it) => it.serviceId).filter((s): s is string => s !== null)))
  const [kandidatTarif, varianceMap, populasi] = await Promise.all([
    tarifKatalog(ctx, serviceIds, tgl),
    variancePerItem(ctx, disbursementId, disb.kind),
    kunjunganSerupa(ctx, voyage, tgl, disbursementId),
  ])

  // Jasa (kode) untuk item DAN untuk baris HistoriJasa yang mungkin ditemukan
  // di dokumen histori tapi TAK ADA di dokumen ini (JASA_HILANG) — satu query.
  const semuaServiceId = Array.from(
    new Set([...serviceIds, ...populasi.flatMap((d) => d.items.map((it) => it.serviceId).filter((s): s is string => s !== null))]),
  )
  const katalog = await forTenant(ctx).serviceCatalog.findMany({
    where: { id: { in: semuaServiceId } },
    select: { id: true, serviceName: true },
  })
  const namaJasa = new Map(katalog.map((k) => [k.id, k.serviceName]))

  // Harga satuan NYATA per jasa dari populasi serupa — dasar `medianUnitPrice`
  // HistoriJasa (HARGA_MENYIMPANG). K59: hanya dokumen ber-asal-efektif NYATA.
  const hargaSatuanPerJasa = new Map<string, number[]>()
  for (const d of populasi) {
    if (!d.nyata) continue
    for (const it of d.items) {
      if (it.serviceId && Number.isFinite(it.unitPrice) && it.unitPrice > 0) {
        const arr = hargaSatuanPerJasa.get(it.serviceId) ?? []
        arr.push(it.unitPrice)
        hargaSatuanPerJasa.set(it.serviceId, arr)
      }
    }
  }

  const { histori, medianGrandTotal, nNyata, nLatihan } = ringkasPopulasi(populasi, hargaSatuanPerJasa, namaJasa)
  const petaHistori = new Map(histori.map((h) => [h.serviceId, h]))

  // kursAcuan PER MATA UANG (bukan satu angka global) — lihat catatan kepala berkas.
  const mataUangUnik = Array.from(new Set(disb.items.map((it) => it.currency.toUpperCase())))
  const petaKurs = new Map<string, number | null>()
  for (const kode of mataUangUnik) {
    if (kode === disb.baseCurrency.toUpperCase()) {
      petaKurs.set(kode, 1)
      continue
    }
    try {
      const kurs = await getLatestRate(ctx, kode, disb.baseCurrency, tgl)
      petaKurs.set(kode, kurs.rate)
    } catch (e) {
      if (e instanceof ServiceError && e.code === 'NOT_FOUND') petaKurs.set(kode, null)
      else throw e
    }
  }

  const konteksDasar: KonteksPeriksa = {
    grandTotalBase: detail.hitung.grandTotal,
    medianGrandTotalHistori: medianGrandTotal,
    kursAcuan: null, // ditimpa per baris — lihat konteksBaris()
    nNyata,
    nLatihan,
    bahasa,
  }
  const konteksBaris = (kodeMataUang: string): KonteksPeriksa => ({
    ...konteksDasar,
    kursAcuan: petaKurs.get(kodeMataUang.toUpperCase()) ?? null,
  })

  const baris: BarisPeriksa[] = disb.items.map((it) => {
    const tarif = it.serviceId
      ? pilihTarif(kandidatTarif.get(it.serviceId) ?? [], {
          tanggalJasa: tgl,
          portId: voyage.portId,
          vesselType: voyage.vessel?.vesselType ?? null,
          gt: voyage.vessel?.gt ?? null,
        })
      : { terpilih: null }
    return {
      itemId: it.id,
      serviceId: it.serviceId,
      deskripsi: it.description,
      calcMethod: it.calcMethod as CalcMethod,
      unitPrice: it.unitPrice,
      amount: it.amount,
      amountBase: it.amountBase,
      exchangeRate: it.exchangeRate,
      unitPriceKatalog: tarif.terpilih?.rate ?? null,
      variancePct: varianceMap.get(it.id) ?? null,
    }
  })

  // ------------------------------------------------ jalankan kedelapan aturan
  const hasil: Anomali[] = []

  const total = aturanTotalMenyimpang(konteksDasar)
  if (total !== null) hasil.push(total)

  hasil.push(...aturanJasaHilang(baris, histori, konteksDasar))

  for (const b of baris) {
    const h = b.serviceId === null ? undefined : petaHistori.get(b.serviceId)
    const kBaris = konteksBaris(disb.items.find((it) => it.id === b.itemId)?.currency ?? disb.baseCurrency)
    const perBaris = [
      aturanHargaMenyimpang(b, h, konteksDasar),
      aturanDiLuarKatalog(b, konteksDasar),
      aturanManualBesar(b, konteksDasar),
      aturanKursMenyimpang(b, kBaris),
      aturanVarianceBesar(b, konteksDasar),
    ]
    for (const a of perBaris) if (a !== null) hasil.push(a)
  }

  hasil.push(...aturanBarisGanda(baris, konteksDasar))

  return {
    anomali: hasil,
    nonaktif: aturanNonaktif(konteksDasar),
    ringkasanNonaktif: ringkasanNonaktif(konteksDasar, bahasa),
  }
}
