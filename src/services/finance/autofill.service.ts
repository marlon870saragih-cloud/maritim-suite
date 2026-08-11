// Autofill / resolusi — SATU-SATUNYA tempat resolusi tarif, vendor, mata uang, dan
// kurs yang menyentuh DB (K12, K24–K28 · docs/FASE-3-EPDA-ENGINE.md §3).
//
// Pembagian kerja yang mengikat (K12):
//   - berkas ini jalan SEKALI, saat baris dibuat (atau saat operator menekan
//     "Perbarui dari katalog"). Boleh menyentuh DB.
//   - calc-engine.ts jalan SETIAP KALI dihitung. Tidak pernah menyentuh DB.
// Akibatnya `quantity`/`unitPrice` yang sudah tersimpan OTORITATIF: ETD berubah
// tidak mengubah baris lama sendiri.
//
// Semua skor/tie-break tarif dan semua rumus dipanggil dari modul murni 3a —
// tak ada satu pun aritmatika uang yang ditulis ulang di sini.

import type {
  Cargo,
  Disbursement,
  DisbursementKind,
  ServiceCatalog,
  ServiceCategory,
  CalcMethod,
  Vessel,
  Voyage,
} from '@prisma/client'
import type { TenantContext } from '../context'
import { ServiceError, validation } from '../errors'
import { forTenant } from '../tenant-db'
import { getLatestRate } from '../master/exchange-rate.service'
import { hitungEtmal, usulKuantitas, type CalcWarning, type KonteksVoyage } from './calc-engine'
import { labelBracket, pilihTarif, type KandidatTarif } from './rate-resolver'

/**
 * K21: agency fee hidup di header (`agencyPct`/`agencyAmount`), tidak boleh jadi
 * baris item — kalau dua-duanya dipakai, agency fee terhitung DUA KALI ke arah
 * yang menguntungkan Tribuana. Satu konstanta, satu berkas.
 */
export const KODE_AGENCY_FEE = 'AGENCY_FEE'

/** K19: satuan yang dianggap ton. Sisanya diabaikan — KL→MT butuh densitas (P13). */
const SATUAN_TON: ReadonlySet<string> = new Set([
  'MT',
  'TON',
  'TONS',
  'TONNE',
  'TONNES',
  'T',
  'METRIC TON',
])

/** K18: konstan 1 sampai P7 dijawab. Kalau berubah, cuma baris ini yang berubah. */
const CALLS = 1

export type VoyageUntukAutofill = Voyage & { vessel: Vessel | null; cargoes: Cargo[] }

export type DisbursementUntukAutofill = Pick<
  Disbursement,
  'kind' | 'baseCurrency' | 'issuedAt'
>

/** Timpaan operator. `undefined`/`null` = biarkan hasil autofill. */
export type TimpaItem = {
  quantity?: number | null
  unitPrice?: number | null
  minCharge?: number | null
  currency?: string | null
  vendorId?: string | null
  exchangeRate?: number | null
  description?: string | null
  unit?: string | null
  basis?: string | null
  calcMethod?: CalcMethod | null
  taxable?: boolean | null
  taxPct?: number | null
  sectionLetter?: string | null
  category?: ServiceCategory | null
  displayOrder?: number | null
}

export type UsulanItem = {
  serviceId: string | null
  vendorId: string | null
  category: ServiceCategory | null
  sectionLetter: string | null
  description: string
  basis: string | null
  quantity: number
  unit: string | null
  unitPrice: number
  minCharge: number | null
  calcMethod: CalcMethod
  currency: string
  exchangeRate: number
  taxable: boolean
  taxPct: number | null
  displayOrder: number
  warnings: CalcWarning[]
}

// ------------------------------------------------------------------ tanggal K24

/**
 * K24 — satu tanggal untuk memilih tarif DAN kurs, supaya keduanya tak pernah
 * memakai tanggal berbeda pada dokumen yang sama.
 *
 * Bukan "hari ini": catatan EPDA nyata Tribuana berbunyi *"Government tariffs
 * follow PP/PM rates prevailing at the time of the call."* — tarif yang berlaku
 * adalah tarif saat KUNJUNGAN, bukan saat pengetikan.
 */
export function tanggalJasa(
  kind: DisbursementKind,
  voyage: Pick<Voyage, 'eta' | 'ata' | 'atb'>,
  issuedAt: Date | null,
): Date {
  const urutan =
    kind === 'FDA'
      ? [voyage.ata, voyage.atb, voyage.eta, issuedAt]
      : [voyage.eta, voyage.ata, issuedAt]
  return urutan.find((d): d is Date => d instanceof Date) ?? new Date()
}

// -------------------------------------------------------------------- etmal K17

/**
 * K17 — pemilihan tanggalnya di sini; pembulatannya di mesin (`hitungEtmal`).
 * FDA yang tanggal aktualnya belum lengkap jatuh ke tanggal estimasi + warning,
 * bukan gagal: FDA sering disusun sebelum ATD masuk.
 */
function etmalVoyage(
  kind: DisbursementKind,
  voyage: Pick<Voyage, 'eta' | 'etb' | 'etc' | 'etd' | 'ata' | 'atb' | 'atd'>,
): { etmal: number | null; warnings: CalcWarning[] } {
  const estimasi = hitungEtmal(voyage.etb ?? voyage.eta, voyage.etd ?? voyage.etc)
  if (kind !== 'FDA') return { etmal: estimasi, warnings: [] }

  const aktual = hitungEtmal(voyage.atb ?? voyage.ata, voyage.atd)
  if (aktual !== null) return { etmal: aktual, warnings: [] }

  return {
    etmal: estimasi,
    warnings: [
      {
        kode: 'PAKAI_TANGGAL_ESTIMASI',
        pesan: 'Tanggal aktual (ATB/ATD) belum lengkap — durasi memakai tanggal estimasi.',
      },
    ],
  }
}

// ---------------------------------------------------------------- cargoTon K19

/**
 * K19 — Σ kargo yang satuannya memang ton. Satuan volume (KL, m3) DIABAIKAN:
 * mengubah KL → MT butuh densitas produk, dan menebak densitas berarti menebak
 * uang. Cargo nyata di DB berbunyi "B40, 6000 KL" — tepat kasus ini.
 */
function cargoTonVoyage(cargoes: readonly Cargo[]): {
  cargoTon: number | null
  warnings: CalcWarning[]
} {
  const warnings: CalcWarning[] = []
  let jumlah: number | null = null
  const satuanLain: string[] = []

  for (const c of cargoes) {
    if (c.quantity === null || !Number.isFinite(c.quantity)) continue
    const satuan = (c.unit ?? '').trim().toUpperCase()
    if (SATUAN_TON.has(satuan)) jumlah = (jumlah ?? 0) + c.quantity
    else if (satuan !== '') satuanLain.push(satuan)
  }

  if (satuanLain.length > 0) {
    warnings.push({
      kode: 'SATUAN_KARGO_BUKAN_TON',
      pesan: `Kargo bersatuan ${Array.from(new Set(satuanLain)).join(', ')} tidak dikonversi ke ton — isi tonase pada baris ini bila perlu.`,
    })
  }

  return { cargoTon: jumlah, warnings }
}

/**
 * KonteksVoyage untuk mesin hitung (K16). `basisPersen` datang dari luar karena
 * ia fungsi dari baris LAIN dalam dokumen yang sama (K20, lintasan 1).
 */
export function konteksVoyage(
  kind: DisbursementKind,
  voyage: VoyageUntukAutofill,
  basisPersen: number,
): { konteks: KonteksVoyage; warnings: CalcWarning[] } {
  const { etmal, warnings: wEtmal } = etmalVoyage(kind, voyage)
  const { cargoTon, warnings: wCargo } = cargoTonVoyage(voyage.cargoes)

  return {
    konteks: {
      gt: voyage.vessel?.gt ?? null,
      nrt: voyage.vessel?.nrt ?? null,
      etmal,
      calls: CALLS,
      cargoTon,
      basisPersen,
    },
    warnings: [...wEtmal, ...wCargo],
  }
}

// ----------------------------------------------------------------------- kurs

const tanggalIndo = (d: Date): string =>
  d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * Snapshot kurs saat baris disimpan (K29/K30).
 *
 * Tiga kasus, urut: mata uang sama → 1 tanpa query; ada baris ExchangeRate →
 * pakai `getLatestRate` (JANGAN tulis pencari kurs kedua); tidak ada → VALIDATION.
 *
 * Kurs kosong TIDAK PERNAH diam-diam dianggap 1: satu baris USD 12.000 yang
 * tercatat Rp 12.000 alih-alih ~Rp 195 juta adalah kegagalan terburuk yang mungkin
 * di modul ini, dan totalnya tetap "kelihatan wajar".
 *
 * `getLatestRate` melempar NOT_FOUND; di sini diterjemahkan jadi VALIDATION —
 * 404 akan membingungkan operator yang tidak salah URL, cuma kurang data.
 * Kurs terbalik TIDAK dihitung otomatis (1/rate menghasilkan selisih rekonsiliasi).
 */
export async function kursSnapshot(
  ctx: TenantContext,
  currency: string,
  baseCurrency: string,
  tgl: Date,
  timpa?: number | null,
): Promise<number> {
  if (timpa !== null && timpa !== undefined) {
    if (!Number.isFinite(timpa) || timpa <= 0) throw validation('Kurs harus lebih besar dari 0.')
    return timpa
  }
  if (currency === baseCurrency) return 1

  try {
    const kurs = await getLatestRate(ctx, currency, baseCurrency, tgl)
    return kurs.rate
  } catch (e) {
    if (e instanceof ServiceError && e.code === 'NOT_FOUND') {
      throw validation(
        `Kurs ${currency} → ${baseCurrency} per ${tanggalIndo(tgl)} belum ada. ` +
          'Tambahkan di Master › Kurs, atau isi kurs manual pada baris ini.',
      )
    }
    throw e
  }
}

// ----------------------------------------------------------------- tarif K25

/**
 * Kandidat tarif. Saringan tanggal dilakukan di SQL (murah, mempersempit baris);
 * saringan port/vesselType/bracket GT + skor + tie-break dikerjakan `pilihTarif`
 * yang murni dan sudah teruji — bukan diduplikasi jadi `where` yang rumit.
 */
async function kandidatTarif(
  ctx: TenantContext,
  serviceId: string,
  tgl: Date,
): Promise<KandidatTarif[]> {
  return forTenant(ctx).serviceRate.findMany({
    where: {
      serviceId,
      effectiveFrom: { lte: tgl },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: tgl } }],
    },
    select: {
      id: true,
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
}

// ------------------------------------------------------------------ basis K13

const angka = (n: number): string => n.toLocaleString('id-ID')

/**
 * `basis` adalah teks untuk manusia dan PDF SAJA. Tak ada satu baris kode pun yang
 * boleh mem-parse-nya (K13) — larangan ini ditulis karena `parseQty()` di
 * `epda-data.ts` adalah kesalahan yang sedang ditinggalkan.
 */
function teksBasis(
  calcMethod: CalcMethod,
  a: {
    quantity: number
    unitPrice: number
    unit: string | null
    konteks: KonteksVoyage
    tarif: KandidatTarif | null
  },
): string | null {
  const { gt, etmal, calls } = a.konteks
  switch (calcMethod) {
    case 'FLAT':
      return 'lump sum per call'
    case 'PER_UNIT':
      return `${angka(a.quantity)} ${a.unit ?? 'unit'} × ${angka(a.unitPrice)}`
    case 'PER_GT':
      return gt === null ? null : `${angka(gt)} GT`
    case 'PER_GT_PER_CALL':
      return gt === null ? null : `${angka(gt)} GT × ${angka(calls)} call`
    case 'PER_GT_PER_DAY':
      return gt === null || etmal === null ? null : `${angka(gt)} GT × ${angka(etmal)} etmal`
    case 'PER_DAY':
      return etmal === null ? null : `${angka(etmal)} etmal`
    case 'PER_HOUR':
      return `${angka(a.quantity)} jam`
    case 'PER_TON':
      return `${angka(a.quantity)} ${a.unit ?? 'MT'}`
    case 'PERCENTAGE':
      return `${angka(a.unitPrice)}% dari ${angka(a.quantity)}`
    case 'TIERED':
      return a.tarif ? (labelBracket(a.tarif) ?? 'lump sum per bracket') : null
    case 'MANUAL':
      return null
  }
}

// ------------------------------------------------------------------- usulan

/**
 * Usulan baris lengkap: tarif, mata uang, vendor, seksi, pajak, kuantitas awal
 * (K24–K28). Dipakai baik oleh penambahan satu jasa maupun oleh template.
 *
 * Tarif tidak ditemukan TIDAK memblokir penyimpanan DRAFT (K27): baris tersimpan
 * `unitPrice = 0` + warning, dan warning itulah yang memblokir submit ke review
 * (K30/K34). Operator sering menyusun kerangka EPDA sebelum tarif resmi masuk;
 * memblokir di sini akan menghentikan pekerjaan, memblokir di submit menghentikan
 * DOKUMEN SALAH KELUAR — itu tempat pagar yang benar.
 */
export async function usulkanItem(
  ctx: TenantContext,
  arg: {
    disb: DisbursementUntukAutofill
    voyage: VoyageUntukAutofill
    service: ServiceCatalog
    basisPersen: number
    timpa?: TimpaItem
  },
): Promise<UsulanItem> {
  const { disb, voyage, service, basisPersen } = arg
  const timpa = arg.timpa ?? {}

  if (service.serviceCode.toUpperCase() === KODE_AGENCY_FEE) {
    throw validation(
      'Agency fee tidak ditambahkan sebagai baris jasa — atur persentasenya di field agencyPct pada header dokumen.',
    )
  }

  const tgl = tanggalJasa(disb.kind, voyage, disb.issuedAt)
  const { konteks, warnings: wKonteks } = konteksVoyage(disb.kind, voyage, basisPersen)
  const warnings: CalcWarning[] = [...wKonteks]

  const calcMethod = timpa.calcMethod ?? service.calcMethod

  // K14: MANUAL tidak pernah di-autofill dan tidak pernah memunculkan
  // TARIF_TIDAK_ADA — itu satu-satunya beda berarti antara MANUAL dan PER_UNIT.
  let tarif: KandidatTarif | null = null
  if (calcMethod !== 'MANUAL') {
    const hasil = pilihTarif(await kandidatTarif(ctx, service.id, tgl), {
      tanggalJasa: tgl,
      portId: voyage.portId,
      vesselType: voyage.vessel?.vesselType ?? null,
      gt: konteks.gt,
    })
    tarif = hasil.terpilih
    warnings.push(...hasil.warnings)
  }

  let quantity: number
  if (timpa.quantity !== null && timpa.quantity !== undefined) {
    quantity = timpa.quantity
  } else {
    const usul = usulKuantitas(calcMethod, konteks)
    quantity = usul.quantity
    warnings.push(...usul.warnings)
  }

  const unitPrice = timpa.unitPrice ?? tarif?.rate ?? 0
  const minCharge = timpa.minCharge ?? tarif?.minCharge ?? null
  // K27: tarif MENANG atas katalog — tarif SGSIN wajar ber-SGD walau katalog IDR.
  const currency = (
    timpa.currency ??
    tarif?.currency ??
    service.defaultCurrency ??
    disb.baseCurrency
  ).toUpperCase()
  const unit = timpa.unit ?? service.defaultUnit ?? null

  const exchangeRate = await kursSnapshot(
    ctx,
    currency,
    disb.baseCurrency,
    tgl,
    timpa.exchangeRate,
  )

  return {
    serviceId: service.id,
    // ServiceRate tak punya kolom vendor; vendor per pelabuhan adalah penambahan
    // skema tersendiri, bukan Fase 3 (K27).
    vendorId: timpa.vendorId ?? service.defaultVendorId ?? null,
    category: timpa.category ?? service.category,
    sectionLetter: timpa.sectionLetter ?? service.sectionLetter,
    description: timpa.description ?? service.serviceName,
    basis: timpa.basis ?? teksBasis(calcMethod, { quantity, unitPrice, unit, konteks, tarif }),
    quantity,
    unit,
    unitPrice,
    minCharge,
    calcMethod,
    currency,
    exchangeRate,
    taxable: timpa.taxable ?? service.taxable,
    taxPct: timpa.taxPct ?? service.taxPct,
    displayOrder: timpa.displayOrder ?? service.displayOrder,
    warnings,
  }
}
