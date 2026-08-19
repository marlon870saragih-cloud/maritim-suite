// Cost Prediction — lapisan DB (Fase 6c · K60–K65).
// Pola meniru port.service.ts (⭐ MODUL RUJUKAN) — lihat docs/POLA-SERVICE-LAYER.md §5.
//
// Berkas ini adalah SATU-SATUNYA tempat yang menyambungkan modul murni Fase 6b
// (confidence.ts, prediction-core.ts, similarity.ts) ke database sungguhan.
// Semua ARTI hidup di modul murni; di sini hanya ada tiga pekerjaan:
//
//   1. membaca item FDA histori yang cocok — BERPAGAR INDUK (K65),
//   2. mengubahnya jadi `SampelHistori[]` lalu menyerahkannya ke modul murni,
//   3. merakit `PrediksiBaris` dengan angka uang yang SELURUHNYA berasal dari
//      `usulKuantitas()` + `hitungBaris()` Fase 3 (K61).
//
// ── K65: kenapa tak ada satu pun `disbursementItem` sebagai model akar ────────
// `DisbursementItem` TIDAK ada di `TENANT_MODELS` (tabel anak, tak membawa
// `tenantId`), jadi `prisma.disbursementItem.findMany(...)` — bahkan lewat
// `forTenant(ctx)` — membaca item milik SEMUA tenant tanpa satu pun penghalang.
// Ini query BACA LINTAS-DOKUMEN pertama di repo ini; K44 hanya pernah menuliskan
// jebakan ini untuk jalur TULIS.
//
// Aturan mutlak yang ditegakkan di seluruh berkas: setiap query grounding dimulai
// dari `forTenant(ctx).disbursement.findMany(...)` dengan `items` sebagai NESTED
// include. Guard menyuntikkan `tenantId` ke `where` INDUK, dan item ikut terpagari
// lewat relasi. Kebocoran semacam ini tidak akan pernah terlihat saat menguji
// dengan satu tenant — seed sengaja mengisi tiga tenant justru untuk itu.
//
// ── Kenapa jumlah query terikat pada JUMLAH TINGKAT, bukan jumlah baris ──────
// Satu pemanggilan predict memprediksi BANYAK jasa sekaligus untuk SATU
// voyage/dokumen. Kriteria tingkat kemiripan (pelabuhan/vesselType/GT/jendela)
// SAMA untuk semua jasa yang diminta — yang berbeda hanya `serviceId` tiap baris.
// Jadi loop-nya "per tingkat", bukan "per baris × per tingkat": satu query per
// tingkat mengambil seluruh dokumen histori yang cocok, dengan
// `items: { where: { serviceId: { in: SEMUA_YANG_DIMINTA } } }`, lalu hasilnya
// DIKELOMPOKKAN per `serviceId` di memori. Dokumen 20 baris karena itu memakai
// jumlah query yang sama dengan dokumen 2 baris.
//
// ── Yang SENGAJA tidak ada di sini ───────────────────────────────────────────
//   - aritmatika uang baru (K61: semua lewat `hitungBaris()`),
//   - perhitungan kuantitas kedua (K61: `usulKuantitas()` Fase 3),
//   - fungsi tanggal kedua (K24: `tanggalJasa()` autofill.service.ts),
//   - penyimpanan hasil prediksi (K66),
//   - pemanggilan LLM apa pun (narasi = 6c lanjutan, `explain.ts`).

import type { CalcMethod, DisbursementKind, DisbursementStatus, Prisma } from '@prisma/client'
import type { TenantContext } from '../context'
import { ServiceError, notFound, validation, rateLimited } from '../errors'
import { forTenant } from '../tenant-db'
import { pastikanLanggananAktif } from '../subscription'
import { pastikanKuota } from '../saas/quota.service'
// Fase 8j — pemakaian (K183/K184).
import { catatPemakaian } from '../saas/usage.service'
// Checklist go-live / K185 — jaring pengaman penyalahgunaan, BUKAN kuota
// K156 (lihat catatan panjang di rate-limit.ts: pertanyaan berbeda).
import { cekBolehPanggilAi, catatPanggilanAi } from '../security/rate-limit'
import { getLatestRate } from '../master/exchange-rate.service'
import {
  hitungBaris,
  usulKuantitas,
  type CalcWarning,
  type KonteksVoyage,
} from '../finance/calc-engine'
import {
  KODE_AGENCY_FEE,
  konteksVoyage,
  tanggalJasa,
  type VoyageUntukAutofill,
} from '../finance/autofill.service'
import { pilihTarif, type KandidatTarif } from '../finance/rate-resolver'
import { adalahNyata, asalEfektif } from './provenance'
import {
  median,
  ringkasSampel,
  type RingkasanSampel,
  type SampelHistori,
} from './prediction-core'
import {
  KRITERIA_KEMIRIPAN,
  TINGKAT_KEMIRIPAN,
  labelTingkat,
  pilihTingkat,
  tingkatMaksimum,
  type HitunganPerTingkat,
  type TingkatKemiripan,
} from './similarity'
import {
  hitungConfidence,
  teksKeyakinan,
  type BandKeyakinan,
  type TierPrediksi,
} from './confidence'

// ------------------------------------------------------------------ konstanta

/**
 * K62 — basis grounding hanya FDA yang benar-benar sudah jadi angka aktual.
 * `DRAFT`/`PENDING_REVIEW` dibuang karena angkanya belum disepakati siapa pun;
 * `EPDA`/`FPDA` tak pernah jadi basis (memakai estimasi untuk memprediksi
 * estimasi adalah lingkaran yang mengawetkan kesalahan pertama selamanya).
 */
export const STATUS_FDA_AKTUAL: readonly DisbursementStatus[] = ['FINAL', 'CLOSED', 'SENT']

/**
 * Batas jumlah dokumen sumber yang ikut di `dasar.sumber` (K64). Bukan batas
 * sampel — statistiknya tetap memakai SEMUA sampel; ini semata-mata supaya
 * respons untuk pelabuhan yang sudah ramai tidak membengkak jadi ratusan baris
 * yang tak seorang pun baca. Yang dibawa adalah 10 sampel TERBARU (urut menurun
 * menurut tanggal jasa), karena itu yang paling mungkin dicek ulang operator.
 */
export const BATAS_SUMBER = 10

/**
 * Batas dokumen histori yang ditarik per tingkat. Pengaman ukuran hasil, bukan
 * bagian dari spesifikasi: diurutkan `issuedAt` menurun, jadi yang tersisih
 * selalu yang paling tua — arah yang sama dengan faktor resensi R (K68) yang
 * memang sudah menekan nilai sampel lama mendekati lantainya.
 */
export const BATAS_DOKUMEN_HISTORI = 200

/**
 * Panjang bulan rata-rata Gregorian (365,2425 / 12 hari) untuk mengubah selisih
 * dua tanggal jadi "usia dalam bulan" yang diminta `hitungR()`.
 *
 * Dipakai angka rata-rata, bukan hitung kalender per bulan, karena R adalah
 * fungsi peluruhan halus dengan paruh 12 bulan: selisih 1–2 hari di batas bulan
 * menggeser R jauh di bawah presisi yang berarti, sedangkan hitung kalender
 * menambah satu aturan tanggal baru yang harus dirawat & diuji.
 */
const MS_PER_BULAN = 365.2425 * 24 * 60 * 60 * 1000 / 12

// ---------------------------------------------------------------------- tipe

/**
 * K64 — bentuk keluaran prediksi, satu objek per jasa yang diminta.
 * Disalin apa adanya dari docs/FASE-6-AI-LAYER.md §4/K64; jangan menambah field
 * uang baru di sini tanpa mengubah dokumennya lebih dulu.
 */
export type PrediksiBaris = {
  serviceId: string
  serviceCode: string
  calcMethod: CalcMethod
  tier: TierPrediksi
  /** `null` saat tier KATALOG — jangan pernah 0, itu terbaca "harganya nol". */
  unitPrice: { p25: number; median: number; p75: number } | null
  unitPriceKatalog: number | null
  minChargeMedian: number | null
  /** Dari `usulKuantitas()` Fase 3 (K61) — TIDAK dihitung ulang di sini. */
  quantity: number
  /** Dari `hitungBaris()` Fase 3 (K61) — tak ada aritmatika uang kedua. */
  amountPrediksi: number
  confidence: number
  band: BandKeyakinan
  dasar: {
    /** `null` bila tier KATALOG — tak ada tingkat yang menang. */
    tingkatKemiripan: TingkatKemiripan | null
    /** Label tingkat (K63 mewajibkannya selalu ikut di respons). */
    tingkatLabel: string | null
    nNyata: number
    nLatihan: number
    rentangTanggal: { dari: string; sampai: string } | null
    sumber: { disbursementId: string; docNumber: string; itemId: string; unitPrice: number }[]
  }
  /** Kode yang SUDAH ada di calc-engine.ts — Fase 6 tak menerbitkan kode baru. */
  warnings: CalcWarning[]
  /** Hasil `teksKeyakinan()` (K70) — siap tampil, bahasa dari pemanggil. */
  teks: string
}

export type OpsiPrediksi = { bahasa?: 'id' | 'en' }

/** Satu jasa yang diminta diprediksi, beserta snapshot baris yang relevan. */
type PermintaanBaris = {
  serviceId: string
  serviceCode: string
  /** Snapshot baris bila ada (K5); dari katalog bila prediksi tanpa dokumen. */
  calcMethod: CalcMethod
  currency: string
  /** `null` = belum diketahui → `hitungBaris()` menerbitkan KURS_TIDAK_ADA (K30). */
  exchangeRate: number | null
  taxable: boolean
  taxPct: number | null
}

/** Sampel + tanggal jasanya. `SampelHistori` sengaja tak punya kolom tanggal
 *  (modul murni tak boleh tahu tanggal); usianya dihitung di sini. */
type SampelBertanggal = { sampel: SampelHistori; tanggal: Date }

type StatusGrounding = {
  /** Hitungan sampel NYATA per tingkat — masukan `pilihTingkat()` (K63). */
  nyata: Record<TingkatKemiripan, number>
  /** Hitungan seluruh sampel (nyata + latihan) per tingkat — cadangan K59. */
  semua: Record<TingkatKemiripan, number>
  ringkas: Map<TingkatKemiripan, RingkasanSampel>
  /** Sudah menemukan sampel nyata → berhenti melonggarkan tingkat. */
  selesai: boolean
}

const hitunganKosong = (): Record<TingkatKemiripan, number> => ({ 1: 0, 2: 0, 3: 0, 4: 0 })

// ------------------------------------------------------------------- penolong

/**
 * Usia sebuah sampel, dalam bulan, terhadap `tanggalJasa` dokumen yang SEDANG
 * DISUSUN — bukan terhadap "hari ini" (K68, sejalan K24). Menghitung terhadap
 * hari ini akan membuat dokumen yang sama menghasilkan keyakinan berbeda tiap
 * kali dibuka.
 *
 * Nilai negatif (sampel bertanggal SESUDAH dokumen — mungkin saat menyusun
 * dokumen mundur) dibiarkan apa adanya; `hitungR()` sudah memperlakukannya
 * sebagai 0 = paling segar.
 */
function usiaBulan(sampel: Date, tanggalDokumen: Date): number {
  return (tanggalDokumen.getTime() - sampel.getTime()) / MS_PER_BULAN
}

/** `Currency.decimals` per kode (K23). Satu query untuk seluruh pemanggilan. */
async function petaDesimal(ctx: TenantContext): Promise<Map<string, number>> {
  const rows = await forTenant(ctx).currency.findMany({ select: { code: true, decimals: true } })
  return new Map(rows.map((r) => [r.code.toUpperCase(), r.decimals]))
}

/**
 * K61 — deteksi `MINIMUM_MENGIKAT` pada BARIS HISTORI.
 *
 * Sengaja TIDAK ditebak dari `amount === minCharge`: pembulatan (K23) dan baris
 * yang kebetulan bernilai persis sama dengan minimumnya akan membuat tebakan itu
 * salah di dua arah. Yang dipakai adalah mesin yang sama yang dulu menghasilkan
 * `amount` baris itu — dijalankan ulang atas snapshot kolomnya (K13: `amount`
 * selalu bisa diturunkan ulang dari kolom tersimpan) — lalu warning-nya dibaca.
 */
function minimumMengikat(
  item: {
    id: string
    calcMethod: CalcMethod
    quantity: number
    unitPrice: number
    minCharge: number | null
    currency: string
    exchangeRate: number
  },
  desimal: Map<string, number>,
): boolean {
  const hasil = hitungBaris({
    calcMethod: item.calcMethod,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    minCharge: item.minCharge,
    decimals: desimal.get(item.currency.toUpperCase()) ?? null,
    exchangeRate: item.exchangeRate,
    itemId: item.id,
  })
  return hasil.warnings.some((w) => w.kode === 'MINIMUM_MENGIKAT')
}

/**
 * Kriteria satu tingkat kemiripan (K63) sebagai `where` pada relasi Voyage.
 *
 * `null` = tingkat ini MUSTAHIL dievaluasi untuk voyage ini, jadi tak ada query
 * yang dijalankan. Tiga sebabnya, semuanya keputusan yang ditulis di sini karena
 * K63 tidak merincinya:
 *
 *   - `portId` kosong → "pelabuhan sama" tak punya arti. Mencocokkan
 *     `portId = null` dengan voyage lain yang juga tanpa pelabuhan berarti
 *     menyamakan dua ketidaktahuan; hasilnya angka dari pelabuhan yang tak
 *     diketahui, persis yang dilarang K63 (tingkat 5 tidak ada).
 *   - `vesselType` kosong pada tingkat yang mensyaratkannya → dua "tidak tahu"
 *     bukan berarti "sejenis".
 *   - `gt` kosong pada tingkat ber-toleransi GT → tak ada rentang yang bisa
 *     dihitung. Kapal tanpa GT tetap dapat prediksi lewat tingkat 4 (tanpa
 *     saringan GT), dan kuantitasnya tetap 0 + warning `GT_TIDAK_ADA` dari
 *     `usulKuantitas()` — harga satuan tetap berguna, jumlahnya yang belum bisa.
 */
function penyaringVoyage(
  tingkat: TingkatKemiripan,
  voyage: VoyageUntukAutofill,
  gt: number | null,
): Prisma.VoyageWhereInput | null {
  const kriteria = KRITERIA_KEMIRIPAN[tingkat]
  if (!voyage.portId) return null

  const vesselType = voyage.vessel?.vesselType ?? null
  if (kriteria.vesselTypeSama && !vesselType) return null

  const vessel: Prisma.VesselWhereInput = {}
  if (kriteria.vesselTypeSama) vessel.vesselType = vesselType
  if (kriteria.toleransiGtPct !== null) {
    if (gt === null || !Number.isFinite(gt) || gt <= 0) return null
    const selisih = (gt * kriteria.toleransiGtPct) / 100
    vessel.gt = { gte: gt - selisih, lte: gt + selisih }
  }

  const where: Prisma.VoyageWhereInput = { portId: voyage.portId, deletedAt: null }
  if (Object.keys(vessel).length > 0) where.vessel = vessel
  return where
}

// ------------------------------------------------------------------ grounding

/**
 * Satu query untuk SATU tingkat, mengambil seluruh dokumen FDA aktual yang cocok
 * kriteria tingkat itu, dengan item yang dibatasi pada jasa yang masih dicari.
 *
 * ⚠️ K65 — perhatikan bentuknya: akar query adalah `disbursement` (model
 * bertenant), dan `items` masuk sebagai NESTED include. Jangan pernah mengubah
 * ini jadi `disbursementItem.findMany({ where: { disbursement: {...} } })`, yang
 * terlihat setara tapi membaca item SELURUH tenant.
 */
async function dokumenHistori(
  ctx: TenantContext,
  arg: {
    penyaring: Prisma.VoyageWhereInput
    serviceIds: string[]
    kecualikanDisbursementId: string | null
  },
) {
  return forTenant(ctx).disbursement.findMany({
    where: {
      kind: 'FDA',
      status: { in: [...STATUS_FDA_AKTUAL] },
      supersededBy: null,
      deletedAt: null,
      ...(arg.kecualikanDisbursementId ? { id: { not: arg.kecualikanDisbursementId } } : {}),
      voyage: arg.penyaring,
    },
    select: {
      id: true,
      docNumber: true,
      issuedAt: true,
      dataOrigin: true,
      voyage: {
        select: { eta: true, ata: true, atb: true, dataOrigin: true },
      },
      items: {
        where: { serviceId: { in: arg.serviceIds } },
        select: {
          id: true,
          serviceId: true,
          calcMethod: true,
          quantity: true,
          unitPrice: true,
          minCharge: true,
          currency: true,
          exchangeRate: true,
        },
      },
    },
    orderBy: { issuedAt: 'desc' },
    take: BATAS_DOKUMEN_HISTORI,
  })
}

// -------------------------------------------------------------------- katalog

/**
 * Tarif katalog untuk SEMUA jasa yang diminta dalam satu query (K62 fallback).
 * Pemilihannya tetap `pilihTarif()` (K25) per jasa — saringan port/vesselType/
 * bracket GT + skor + tie-break tidak diduplikasi jadi `where` yang rumit.
 */
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
      id: true,
      serviceId: true,
      portId: true,
      vesselType: true,
      gtMin: true,
      gtMax: true,
      rate: true,
      currency: true,
      minCharge: true,
      effectiveFrom: true,
      effectiveTo: true,
      createdAt: true,
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

// ----------------------------------------------------------------------- inti

type BahanPrediksi = {
  voyage: VoyageUntukAutofill
  kind: DisbursementKind
  issuedAt: Date | null
  permintaan: PermintaanBaris[]
  /** Dokumen yang sedang disusun — tak boleh jadi sumber prediksi dirinya sendiri. */
  kecualikanDisbursementId: string | null
  bahasa: 'id' | 'en'
}

async function rakitPrediksi(ctx: TenantContext, bahan: BahanPrediksi): Promise<PrediksiBaris[]> {
  const { voyage, kind, permintaan, bahasa } = bahan
  if (permintaan.length === 0) return []

  // K24 — SATU tanggal untuk memilih tarif, kurs, DAN jendela kemiripan.
  const tgl = tanggalJasa(kind, voyage, bahan.issuedAt)
  const { konteks, warnings: warningKonteks } = konteksVoyage(kind, voyage, 0)

  const desimal = await petaDesimal(ctx)
  const serviceIds = permintaan.map((p) => p.serviceId)
  const kandidatTarif = await tarifKatalog(ctx, serviceIds, tgl)

  // ---- grounding: satu query per TINGKAT, dikelompokkan per serviceId di JS ----
  const status = new Map<string, StatusGrounding>(
    permintaan.map((p) => [
      p.serviceId,
      { nyata: hitunganKosong(), semua: hitunganKosong(), ringkas: new Map(), selesai: false },
    ]),
  )
  /** itemId → tanggal jasa dokumen asalnya (untuk usia & rentang tanggal). */
  const tanggalSampel = new Map<string, Date>()

  for (const tingkat of TINGKAT_KEMIRIPAN) {
    // Yang masih dicari: belum punya sampel nyata DAN tingkat ini masih di
    // bawah batas metode hitungnya (MANUAL/FLAT berhenti di tingkat 3 — K61).
    const sisa = permintaan.filter(
      (p) => status.get(p.serviceId)?.selesai === false && tingkat <= tingkatMaksimum(p.calcMethod),
    )
    if (sisa.length === 0) break

    const penyaring = penyaringVoyage(tingkat, voyage, konteks.gt)
    if (!penyaring) continue // tingkat tak bisa dievaluasi → tak ada query sama sekali

    const dokumen = await dokumenHistori(ctx, {
      penyaring,
      serviceIds: sisa.map((p) => p.serviceId),
      kecualikanDisbursementId: bahan.kecualikanDisbursementId,
    })

    // Pengelompokan per serviceId dikerjakan di MEMORI, bukan di SQL — itulah
    // yang membuat jumlah query terikat pada jumlah tingkat, bukan jumlah baris.
    const perService = new Map<string, SampelBertanggal[]>()
    const jendela = KRITERIA_KEMIRIPAN[tingkat].jendelaBulan

    for (const d of dokumen) {
      if (d.items.length === 0) continue
      // Tanggal jasa dokumen histori memakai fungsi K24 yang SAMA (kind FDA),
      // bukan `issuedAt` mentah — dokumen bisa diterbitkan jauh sesudah kunjungan.
      const tglSampel = tanggalJasa('FDA', d.voyage ?? { eta: null, ata: null, atb: null }, d.issuedAt)
      if (usiaBulan(tglSampel, tgl) > jendela) continue

      // K58 — asal EFEKTIF (yang paling pesimis antara voyage & dokumen), lalu
      // K59 — hanya 'NYATA' yang boleh menaikkan nNyata.
      const nyata = adalahNyata(asalEfektif(d.voyage?.dataOrigin ?? null, d.dataOrigin))

      for (const it of d.items) {
        if (!it.serviceId) continue
        const daftar = perService.get(it.serviceId) ?? []
        daftar.push({
          tanggal: tglSampel,
          sampel: {
            itemId: it.id,
            disbursementId: d.id,
            docNumber: d.docNumber,
            calcMethod: it.calcMethod,
            unitPrice: it.unitPrice,
            minCharge: it.minCharge,
            minimumMengikat: minimumMengikat(it, desimal),
            nyata,
          },
        })
        perService.set(it.serviceId, daftar)
        tanggalSampel.set(it.id, tglSampel)
      }
    }

    for (const p of sisa) {
      const st = status.get(p.serviceId)
      if (!st) continue
      const ditemukan = perService.get(p.serviceId) ?? []
      // Penyaringan calcMethod (K61) dikerjakan modul murni — hasilnya yang
      // menentukan apakah tingkat ini benar-benar "menghasilkan n ≥ 1".
      const ringkas = ringkasSampel(
        ditemukan.map((s) => s.sampel),
        p.calcMethod,
      )
      st.ringkas.set(tingkat, ringkas)
      st.nyata[tingkat] = ringkas.nNyata
      st.semua[tingkat] = ringkas.n
      // K59 — "kenyataan mengalahkan contoh sejak sampel pertama": begitu sebuah
      // tingkat memberi sampel NYATA, tak ada gunanya melonggarkan lagi. Tingkat
      // yang cuma memberi sampel latihan TIDAK menghentikan pencarian — kalau
      // tingkat berikutnya punya kunjungan nyata, kenyataan yang menang meski
      // kemiripannya lebih longgar.
      if (ringkas.nNyata >= 1) st.selesai = true
    }
  }

  // ----------------------------- perakitan ------------------------------------
  const hasil: PrediksiBaris[] = []

  for (const p of permintaan) {
    const st = status.get(p.serviceId)
    const hitunganNyata = (st?.nyata ?? hitunganKosong()) as HitunganPerTingkat
    const hitunganSemua = (st?.semua ?? hitunganKosong()) as HitunganPerTingkat

    // Keputusan tingkat & faktor M tetap milik modul murni (K63). Dipanggil dua
    // kali: kunjungan NYATA lebih dulu, sampel latihan hanya sebagai cadangan.
    const pilihan = pilihTingkat(hitunganNyata, p.calcMethod) ?? pilihTingkat(hitunganSemua, p.calcMethod)
    const ringkasPenuh = pilihan ? st?.ringkas.get(pilihan.tingkat) ?? null : null

    // K59 — sampel latihan tak pernah DICAMPUR ke sampel nyata; ia hanya
    // dilaporkan sebagai jumlah. Basis angka = nyata saja bila ada satu pun.
    const basis: RingkasanSampel | null =
      ringkasPenuh === null
        ? null
        : ringkasPenuh.nNyata >= 1
          ? ringkasSampel(
              ringkasPenuh.dipakai.filter((s) => s.nyata),
              p.calcMethod,
            )
          : ringkasPenuh

    const tanggalBasis = (basis?.dipakai ?? [])
      .map((s) => tanggalSampel.get(s.itemId))
      .filter((d): d is Date => d instanceof Date)

    const usia = median(tanggalBasis.map((d) => usiaBulan(d, tgl))) ?? 0
    const nNyata = basis?.nNyata ?? 0
    const nLatihan = ringkasPenuh?.nLatihan ?? 0

    const keyakinan = hitungConfidence({
      nNyata,
      nLatihan,
      usiaBulan: usia,
      cv: basis?.cv ?? 0,
      m: pilihan?.m ?? 0,
    })

    // K62 — tarif katalog: pembanding yang selalu ikut, DAN satu-satunya angka
    // yang tersisa saat tak ada sampel sama sekali.
    const tarif = pilihTarif(kandidatTarif.get(p.serviceId) ?? [], {
      tanggalJasa: tgl,
      portId: voyage.portId,
      vesselType: voyage.vessel?.vesselType ?? null,
      gt: konteks.gt,
    })

    const katalog = tarif.terpilih?.rate ?? null
    const minChargeMedian = basis?.minChargeMedian ?? null
    const hargaDipakai =
      keyakinan.tier === 'KATALOG' ? (katalog ?? 0) : (basis?.unitPrice?.median ?? katalog ?? 0)

    // K61 — kuantitas dari Fase 3, aritmatika dari Fase 3. Tak ada perkalian
    // uang yang ditulis di berkas ini.
    const usul = usulKuantitas(p.calcMethod, konteks)
    const baris = hitungBaris({
      calcMethod: p.calcMethod,
      quantity: usul.quantity,
      unitPrice: hargaDipakai,
      minCharge: minChargeMedian ?? tarif.terpilih?.minCharge ?? null,
      decimals: desimal.get(p.currency.toUpperCase()) ?? null,
      exchangeRate: p.exchangeRate,
      taxable: p.taxable,
      taxPct: p.taxPct,
    })

    const sumberTerurut = [...(basis?.dipakai ?? [])].sort((a, b) => {
      const ta = tanggalSampel.get(a.itemId)?.getTime() ?? 0
      const tb = tanggalSampel.get(b.itemId)?.getTime() ?? 0
      return tb - ta
    })

    const dari = tanggalBasis.length > 0 ? new Date(Math.min(...tanggalBasis.map((d) => d.getTime()))) : null
    const sampai = tanggalBasis.length > 0 ? new Date(Math.max(...tanggalBasis.map((d) => d.getTime()))) : null

    hasil.push({
      serviceId: p.serviceId,
      serviceCode: p.serviceCode,
      calcMethod: p.calcMethod,
      tier: keyakinan.tier,
      unitPrice: keyakinan.tier === 'KATALOG' ? null : (basis?.unitPrice ?? null),
      unitPriceKatalog: katalog,
      minChargeMedian,
      quantity: usul.quantity,
      amountPrediksi: baris.amount,
      confidence: keyakinan.confidence,
      band: keyakinan.band,
      dasar: {
        tingkatKemiripan: keyakinan.tier === 'KATALOG' ? null : (pilihan?.tingkat ?? null),
        tingkatLabel:
          keyakinan.tier === 'KATALOG' || !pilihan ? null : labelTingkat(pilihan.tingkat, bahasa),
        nNyata,
        nLatihan,
        rentangTanggal:
          dari && sampai ? { dari: dari.toISOString(), sampai: sampai.toISOString() } : null,
        sumber: sumberTerurut.slice(0, BATAS_SUMBER).map((s) => ({
          disbursementId: s.disbursementId,
          docNumber: s.docNumber,
          itemId: s.itemId,
          unitPrice: s.unitPrice,
        })),
      },
      // Warning dari mesin & autofill yang SUDAH ADA (K64): konteks voyage
      // (etmal/kargo), kuantitas (GT/etmal/ton hilang), tarif (tidak ada/ambigu),
      // dan hitungan baris (minimum mengikat, kurs kosong, pajak tanpa tarif).
      warnings: [...warningKonteks, ...usul.warnings, ...tarif.warnings, ...baris.warnings],
      teks: teksKeyakinan(
        keyakinan.tier,
        keyakinan.band,
        { nNyata, nLatihan, periode: teksPeriode(dari, sampai, bahasa) },
        bahasa,
      ),
    })
  }

  return hasil
}

/** "{periode}" pada teks K70. `null` → `teksKeyakinan()` memakai frasa penggantinya. */
function teksPeriode(dari: Date | null, sampai: Date | null, bahasa: 'id' | 'en'): string | null {
  if (!dari || !sampai) return null
  const lokal = bahasa === 'id' ? 'id-ID' : 'en-GB'
  const f = (d: Date) => d.toLocaleDateString(lokal, { month: 'short', year: 'numeric' })
  const a = f(dari)
  const b = f(sampai)
  return a === b ? a : `${a}–${b}`
}

// ------------------------------------------------------------------ pemuatan

const ITEM_ORDER = [{ displayOrder: 'asc' as const }, { createdAt: 'asc' as const }]

/**
 * Kurs untuk baris yang belum punya snapshot (jalur voyage, tanpa dokumen).
 *
 * Dipanggil paling banyak sekali per MATA UANG yang berbeda — bukan per baris —
 * dan sama sekali tidak dipanggil bila semua baris memakai mata uang dasar
 * (keadaan yang berlaku untuk seluruh katalog IDR hari ini). Kurs yang tak
 * ditemukan menghasilkan `null`, yang oleh `hitungBaris()` diterjemahkan jadi
 * warning `KURS_TIDAK_ADA` (K30) — bukan diam-diam dianggap 1.
 */
async function kursPrediksi(
  ctx: TenantContext,
  currency: string,
  baseCurrency: string,
  tgl: Date,
  cache: Map<string, number | null>,
): Promise<number | null> {
  const kode = currency.toUpperCase()
  if (kode === baseCurrency.toUpperCase()) return 1
  if (cache.has(kode)) return cache.get(kode) ?? null
  try {
    const kurs = await getLatestRate(ctx, kode, baseCurrency, tgl)
    cache.set(kode, kurs.rate)
    return kurs.rate
  } catch (e) {
    if (e instanceof ServiceError && e.code === 'NOT_FOUND') {
      cache.set(kode, null)
      return null
    }
    throw e
  }
}

/**
 * Checklist go-live / K185 — jaring pengaman penyalahgunaan pada endpoint AI.
 * `ctx.system` (skrip/job internal) dilewati: batas ini menahan PENGGUNA,
 * bukan proses sistem yang memang boleh memanggil berulang atas nama tenant.
 */
async function pastikanBelumMelebihiLajuAi(ctx: TenantContext): Promise<void> {
  if (ctx.system) return
  const { diblokir } = await cekBolehPanggilAi(ctx.userId)
  if (diblokir) {
    throw rateLimited('Terlalu banyak panggilan prediksi AI dalam waktu singkat. Tunggu beberapa menit sebelum mencoba lagi.')
  }
  await catatPanggilanAi(ctx.userId)
}

/**
 * Prediksi untuk SEMUA baris yang sudah ada di sebuah disbursement (dipakai
 * builder EPDA di 6d: kolom pembanding di samping `unitPrice` tiap baris).
 *
 * Dua sifat yang disengaja:
 *   - Baris ad-hoc (`serviceId = null`) DILEWATI. Grounding bekerja per jasa;
 *     baris tanpa jasa tak punya sesuatu untuk dibandingkan, dan mengarang
 *     pembanding untuknya berarti membandingkan deskripsi teks bebas.
 *   - Dua baris ber-`serviceId` sama menghasilkan SATU `PrediksiBaris` (K60:
 *     satu prediksi per jasa). Snapshot yang dipakai adalah baris pertama
 *     menurut urutan tampilan.
 */
export async function prediksiUntukDisbursement(
  ctx: TenantContext,
  disbursementId: string,
  opsi: OpsiPrediksi = {},
): Promise<PrediksiBaris[]> {
  // K54/K33 — dipanggil PALING AWAL, sebelum query berat: tenant yang masa
  // ujinya habis tak boleh memakai fitur baru, dan tak perlu dibayari querynya.
  await pastikanLanggananAktif(ctx)
  // Fase 8c / K156 — kuota panggilan AI, BERSEBELAHAN dengan gerbang langganan
  // di atas (K33). Dua pagar berdiri sendiri: langganan habis tetap menolak
  // meski kuota longgar, dan sebaliknya.
  await pastikanKuota(ctx, 'PANGGILAN_AI')
  // Checklist go-live / K185 — jaring pengaman penyalahgunaan (BUKAN kuota
  // K156 di atas — lihat catatan di security/rate-limit.ts).
  await pastikanBelumMelebihiLajuAi(ctx)
  // Fase 8j / K183 — dicatat begitu ketiga gerbang lolos (langganan+kuota+
  // laju), bukan menunggu hasil akhir: menjawab "fitur AI dipakai", bukan
  // "hasilnya tak kosong".
  await catatPemakaian(ctx, 'AI_PREDICT_USED', { jenis: 'disbursement' })

  const disb = await forTenant(ctx).disbursement.findFirst({
    where: { id: disbursementId, deletedAt: null },
    include: {
      items: { orderBy: ITEM_ORDER },
      voyage: { include: { vessel: true, cargoes: true } },
    },
  })
  if (!disb) throw notFound('Disbursement')
  if (!disb.voyage) throw notFound('Voyage')

  const pertama = new Map<string, (typeof disb.items)[number]>()
  for (const it of disb.items) {
    if (!it.serviceId || pertama.has(it.serviceId)) continue
    pertama.set(it.serviceId, it)
  }
  if (pertama.size === 0) return []

  const kode = await kodeJasa(ctx, Array.from(pertama.keys()))

  const permintaan: PermintaanBaris[] = []
  for (const [serviceId, it] of Array.from(pertama.entries())) {
    const serviceCode = kode.get(serviceId)
    if (!serviceCode) continue // jasa terhapus dari katalog — bukan alasan gagal
    permintaan.push({
      serviceId,
      serviceCode,
      calcMethod: it.calcMethod,
      currency: it.currency,
      exchangeRate: it.exchangeRate,
      taxable: it.taxable,
      taxPct: it.taxPct,
    })
  }

  return rakitPrediksi(ctx, {
    voyage: disb.voyage as VoyageUntukAutofill,
    kind: disb.kind,
    issuedAt: disb.issuedAt,
    permintaan,
    kecualikanDisbursementId: disb.id,
    bahasa: opsi.bahasa ?? 'id',
  })
}

export type OpsiPrediksiVoyage = OpsiPrediksi & { kind?: DisbursementKind }

/**
 * Prediksi untuk sebuah voyage TANPA disbursement (kartu "Perkiraan biaya
 * kunjungan" di Voyage Workspace, 6d).
 *
 * `kind` menentukan `tanggalJasa()` yang dipakai memilih tarif, kurs, dan jendela
 * kemiripan (K24). Bawaannya `'EPDA'` — kartu perkiraan biaya memang dibaca
 * sebelum kunjungan terjadi, jadi tanggal estimasi yang benar.
 */
export async function prediksiUntukVoyage(
  ctx: TenantContext,
  voyageId: string,
  serviceIds: string[],
  opsi: OpsiPrediksiVoyage = {},
): Promise<PrediksiBaris[]> {
  await pastikanLanggananAktif(ctx)
  // Fase 8c / K156 — kuota panggilan AI, BERSEBELAHAN dengan gerbang langganan
  // di atas (K33). Dua pagar berdiri sendiri: langganan habis tetap menolak
  // meski kuota longgar, dan sebaliknya.
  await pastikanKuota(ctx, 'PANGGILAN_AI')
  // Checklist go-live / K185 — lihat catatan pada prediksiUntukDisbursement().
  await pastikanBelumMelebihiLajuAi(ctx)
  // Fase 8j / K183.
  await catatPemakaian(ctx, 'AI_PREDICT_USED', { jenis: 'voyage' })

  const diminta = Array.from(
    new Set((serviceIds ?? []).filter((s) => typeof s === 'string' && s !== '')),
  )
  if (diminta.length === 0) throw validation('serviceIds wajib diisi minimal satu jasa.')

  const voyage = await forTenant(ctx).voyage.findFirst({
    where: { id: voyageId, deletedAt: null },
    include: { vessel: true, cargoes: true },
  })
  if (!voyage) throw notFound('Voyage')

  const services = await forTenant(ctx).serviceCatalog.findMany({
    where: { id: { in: diminta }, deletedAt: null },
    select: {
      id: true,
      serviceCode: true,
      calcMethod: true,
      defaultCurrency: true,
      taxable: true,
      taxPct: true,
    },
  })
  // Jasa milik tenant lain jatuh ke sini juga — NOT_FOUND, bukan FORBIDDEN
  // (POLA-SERVICE-LAYER §5 aturan 6: membedakannya membocorkan keberadaan data).
  if (services.length !== diminta.length) throw notFound('Jasa')

  const urutan = new Map(services.map((s) => [s.id, s]))
  const cacheKurs = new Map<string, number | null>()
  const tgl = tanggalJasa(opsi.kind ?? 'EPDA', voyage, null)

  const permintaan: PermintaanBaris[] = []
  for (const id of diminta) {
    const s = urutan.get(id)
    if (!s) continue
    // K21 — agency fee hidup di header dokumen, bukan sebagai baris jasa.
    // Memprediksinya sebagai baris berarti menyiapkan angka yang tak akan pernah
    // punya baris untuk ditempeli, dan berisiko terhitung dua kali di layar.
    if (s.serviceCode.toUpperCase() === KODE_AGENCY_FEE) continue
    const currency = (s.defaultCurrency || voyage.baseCurrency).toUpperCase()
    permintaan.push({
      serviceId: s.id,
      serviceCode: s.serviceCode,
      calcMethod: s.calcMethod,
      currency,
      exchangeRate: await kursPrediksi(ctx, currency, voyage.baseCurrency, tgl, cacheKurs),
      taxable: s.taxable,
      taxPct: s.taxPct,
    })
  }

  return rakitPrediksi(ctx, {
    voyage: voyage as VoyageUntukAutofill,
    kind: opsi.kind ?? 'EPDA',
    issuedAt: null,
    permintaan,
    kecualikanDisbursementId: null,
    bahasa: opsi.bahasa ?? 'id',
  })
}

/** `serviceCode` untuk sekumpulan id — satu query, dipagari tenant. */
async function kodeJasa(ctx: TenantContext, ids: string[]): Promise<Map<string, string>> {
  const rows = await forTenant(ctx).serviceCatalog.findMany({
    where: { id: { in: ids } },
    select: { id: true, serviceCode: true },
  })
  return new Map(rows.map((r) => [r.id, r.serviceCode]))
}
