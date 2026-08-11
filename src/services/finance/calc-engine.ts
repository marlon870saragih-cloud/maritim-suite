// Mesin hitung uang — MURNI, tanpa satu pun impor nilai (K11, docs/FASE-3-EPDA-ENGINE.md §2).
//
// Kontrak yang mengikat berkas ini dan semua saudaranya bertanda ❌ di §11:
//
//   1. `import type` SAJA — dan itu bukan sekadar selera. Terbukti empiris di repo
//      ini: impor nilai relatif TANPA ekstensi gagal di Node (ERR_MODULE_NOT_FOUND),
//      sedangkan yang BER-ekstensi `.ts` gagal di tsc (TS5097, karena
//      allowImportingTsExtensions mati). Jadi tak ada bentuk impor nilai
//      lintas-modul yang lolos keduanya. `import type` terhapus saat Node
//      melakukan type-stripping sehingga specifier-nya tak pernah di-resolve —
//      aman di dua-duanya. Konsekuensinya: modul murni tak boleh saling memanggil
//      di tingkat nilai; yang butuh (totals.ts) menerimanya sebagai argumen.
//
//   2. Tidak melempar ServiceError (itu impor). Kesalahan keluar lewat DUA saluran
//      yang beda artinya:
//        - `warnings`  → baris tetap boleh disimpan sebagai DRAFT; yang pemblokir
//                        (WARNING_PEMBLOKIR) menahan transisi ke PENDING_REVIEW (K16-2, K34).
//        - `pelanggaran` → caller WAJIB menolak dengan validation(); nilai tidak dihitung.
//
//   3. Tidak ada `new Date()`. Semua tanggal masuk sebagai argumen (K11).
//
// Karena murni, UI klien mengimpor berkas yang sama untuk total hidup di layar —
// tidak ada rumus kembar antara server dan browser. Server tetap menghitung ulang
// saat simpan dan nilai server yang menang.

import type { CalcMethod } from '@prisma/client'

// ------------------------------------------------------------------ peringatan

/**
 * Kode warning K16-2. Delapan pertama dipakai mesin & rate-resolver; dua
 * berikutnya diterbitkan autofill.service.ts (3b) dan didaftarkan di sini supaya
 * hanya ada satu daftar kode di repo.
 *
 * `PAJAK_TANPA_TARIF` adalah tambahan atas daftar §K16-2: K22 mewajibkan
 * `taxable = true` tanpa `taxPct` gagal SAAT SUBMIT (bukan diam-diam 0, bukan
 * pula gagal saat simpan DRAFT). Satu-satunya saluran dengan perilaku persis itu
 * adalah warning pemblokir.
 */
export type KodeWarning =
  | 'GT_TIDAK_ADA'
  | 'ETMAL_TIDAK_ADA'
  | 'TON_TIDAK_ADA'
  | 'TARIF_TIDAK_ADA'
  | 'TARIF_AMBIGU'
  | 'KURS_TIDAK_ADA'
  | 'MINIMUM_MENGIKAT'
  | 'BASIS_PERSEN_NOL'
  | 'PAJAK_TANPA_TARIF'
  | 'SATUAN_KARGO_BUKAN_TON'
  | 'PAKAI_TANGGAL_ESTIMASI'

export type CalcWarning = {
  kode: KodeWarning
  pesan: string
  /** Baris asal, bila warning-nya lahir dari satu baris. */
  itemId?: string | null
  /** Data pendukung untuk UI (mis. dua id tarif yang bersaing). */
  data?: Readonly<Record<string, string | number | null>>
}

/**
 * Warning yang menahan `DRAFT → PENDING_REVIEW` (K16-2 + panel §12/5).
 *
 * Yang TIDAK masuk di sini sengaja: `MINIMUM_MENGIKAT` cuma menjelaskan kenapa
 * `amount ≠ q × p` (K16-4) — kalau ia memblokir, tarif yang minimumnya memang
 * mengikat tak akan pernah bisa diajukan; `SATUAN_KARGO_BUKAN_TON` dan
 * `PAKAI_TANGGAL_ESTIMASI` menerangkan asal-usul sebuah USULAN yang operator
 * boleh timpa (K19, K17), bukan angka yang salah.
 */
export const WARNING_PEMBLOKIR: ReadonlySet<KodeWarning> = new Set<KodeWarning>([
  'GT_TIDAK_ADA',
  'ETMAL_TIDAK_ADA',
  'TON_TIDAK_ADA',
  'TARIF_TIDAK_ADA',
  'TARIF_AMBIGU',
  'KURS_TIDAK_ADA',
  'BASIS_PERSEN_NOL',
  'PAJAK_TANPA_TARIF',
])

export const adaWarningPemblokir = (warnings: readonly CalcWarning[]): boolean =>
  warnings.some((w) => WARNING_PEMBLOKIR.has(w.kode))

export const warningPemblokir = (warnings: readonly CalcWarning[]): CalcWarning[] =>
  warnings.filter((w) => WARNING_PEMBLOKIR.has(w.kode))

// ----------------------------------------------------------------- pelanggaran

/** Kesalahan keras: caller menerjemahkannya menjadi `validation()` (K16-1/3, K20, K23). */
export type KodePelanggaran =
  | 'FLAT_BERKUANTITAS'
  | 'QUANTITY_NEGATIF'
  | 'ANGKA_TIDAK_SAH'
  | 'PERSEN_BUKAN_MATA_UANG_DASAR'
  | 'DESIMAL_TIDAK_DIKENAL'

export type Pelanggaran = { kode: KodePelanggaran; pesan: string; itemId?: string | null }

// ------------------------------------------------------------------ pembulatan

const desimalSah = (d: unknown): d is number =>
  typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 8

/**
 * Pembulatan uang: half-up pada nilai ABSOLUT (K23).
 *
 * `Math.round(-0.5)` = `-0` di JS, jadi baris koreksi negatif akan membulat ke
 * arah yang berbeda dari padanan positifnya kalau tandanya tidak dipisah dulu.
 */
export function bulatkan(n: number, decimals: number): number {
  const k = Math.pow(10, decimals)
  const hasil = ((n < 0 ? -1 : 1) * Math.round(Math.abs(n) * k)) / k
  return hasil === 0 ? 0 : hasil
}

// ----------------------------------------------------------------------- etmal

const MS_PER_ETMAL = 24 * 60 * 60 * 1000

/**
 * Etmal = hari-pelabuhan (K17). Jam / 24, dibulatkan KE ATAS, minimum 1.
 * `null` bila salah satu tanggal kosong/tak sah atau `selesai < mulai`.
 *
 * Pemilihan tanggal mana yang masuk (ETB/ETA vs ATB/ATA) ada di
 * autofill.service.ts, bukan di sini — mesin tak tahu apa itu voyage.
 */
export function hitungEtmal(mulai: Date | null, selesai: Date | null): number | null {
  if (!mulai || !selesai) return null
  const ms = selesai.getTime() - mulai.getTime()
  if (!Number.isFinite(ms) || ms < 0) return null
  return Math.max(1, Math.ceil(ms / MS_PER_ETMAL))
}

// ------------------------------------------------------- usulan kuantitas K16

/** Konteks yang diberikan autofill ke mesin. Semua boleh null → warning, bukan lemparan. */
export type KonteksVoyage = {
  gt: number | null
  /** Belum dipakai formula mana pun; disiapkan (K16). */
  nrt: number | null
  etmal: number | null
  /** K18: konstan 1 sampai P7 dijawab. */
  calls: number
  cargoTon: number | null
  /** Basis PERCENTAGE dalam baseCurrency — dihitung totals.ts lintasan 1 (K20). */
  basisPersen: number
}

type SumberKuantitas = 'SATU' | 'GT' | 'GT_KALI_CALL' | 'GT_KALI_ETMAL' | 'ETMAL' | 'TON' | 'BASIS_PERSEN'

/**
 * Kolom `quantityUsul` tabel K16, sebagai tabel dan bukan rangkaian `if`.
 * Menambah anggota `CalcMethod` di schema.prisma akan membuat tsc gagal di sini —
 * itu memang yang diinginkan.
 */
const SUMBER_KUANTITAS: Readonly<Record<CalcMethod, SumberKuantitas>> = {
  FLAT: 'SATU',
  PER_UNIT: 'SATU',
  PER_GT: 'GT',
  PER_GT_PER_CALL: 'GT_KALI_CALL',
  PER_GT_PER_DAY: 'GT_KALI_ETMAL',
  PER_DAY: 'ETMAL',
  PER_HOUR: 'SATU',
  PER_TON: 'TON',
  PERCENTAGE: 'BASIS_PERSEN',
  // GT hanya memilih BARIS TARIF-nya, tidak mengalikan (K26).
  TIERED: 'SATU',
  MANUAL: 'SATU',
}

/** Satu-satunya `calcMethod` yang membagi 100 (K16-5). */
const PEMBAGI_SERATUS: ReadonlySet<CalcMethod> = new Set<CalcMethod>(['PERCENTAGE'])

export type UsulKuantitas = { quantity: number; warnings: CalcWarning[] }

/**
 * Nilai yang di-autofill SEKALI ke `DisbursementItem.quantity` (K16).
 * Sesudah tersimpan, mesin tak pernah menurunkannya lagi (K12) — kecuali baris
 * PERCENTAGE, yang basisnya memang fungsi dari baris lain (lihat totals.ts).
 *
 * `quantity` menyimpan SELURUH pengali yang sudah dikalikan habis (K13): untuk
 * PER_GT_PER_DAY dengan GT 8.432 dan 3 etmal, hasilnya 25.296 — bukan 8.432.
 */
export function usulKuantitas(calcMethod: CalcMethod, konteks: KonteksVoyage): UsulKuantitas {
  const warnings: CalcWarning[] = []
  const sumber = SUMBER_KUANTITAS[calcMethod]

  const gt = (): number => {
    if (konteks.gt === null || !Number.isFinite(konteks.gt)) {
      warnings.push({ kode: 'GT_TIDAK_ADA', pesan: 'GT kapal belum diisi — isi GT pada data kapal.' })
      return 0
    }
    return konteks.gt
  }
  const etmal = (): number => {
    if (konteks.etmal === null || !Number.isFinite(konteks.etmal)) {
      warnings.push({
        kode: 'ETMAL_TIDAK_ADA',
        pesan: 'Durasi (etmal) tak bisa dihitung — lengkapi ETB/ETA dan ETD/ETC voyage.',
      })
      return 0
    }
    return konteks.etmal
  }

  let quantity = 1
  if (sumber === 'GT') quantity = gt()
  else if (sumber === 'GT_KALI_CALL') quantity = gt() * konteks.calls
  else if (sumber === 'GT_KALI_ETMAL') quantity = gt() * etmal()
  else if (sumber === 'ETMAL') quantity = etmal()
  else if (sumber === 'TON') {
    if (konteks.cargoTon === null || !Number.isFinite(konteks.cargoTon)) {
      warnings.push({
        kode: 'TON_TIDAK_ADA',
        pesan: 'Tonase belum diketahui — isi jumlah ton pada baris ini.',
      })
      quantity = 0
    } else quantity = konteks.cargoTon
  } else if (sumber === 'BASIS_PERSEN') {
    if (!Number.isFinite(konteks.basisPersen) || konteks.basisPersen === 0) {
      warnings.push({
        kode: 'BASIS_PERSEN_NOL',
        pesan: 'Basis persentase masih 0 — tambahkan baris non-persen lebih dulu.',
      })
      quantity = 0
    } else quantity = konteks.basisPersen
  }

  return { quantity, warnings }
}

// ------------------------------------------------------------- hitungan baris

/**
 * Baris seperti yang TERSIMPAN — bukan konteks voyage. Sengaja begitu: invarian
 * K13 menuntut `amount` bisa diturunkan ulang hanya dari kolom yang tersimpan.
 */
export type BarisHitung = {
  calcMethod: CalcMethod
  quantity: number
  unitPrice: number
  /** Snapshot ServiceRate.minCharge (K15). */
  minCharge?: number | null
  /** `Currency.decimals` mata uang baris. Wajib; tak ada nilai bawaan (K23). */
  decimals: number | null
  /** Snapshot kurs → baseCurrency (K29). `null` = belum ada → warning, JANGAN pakai 1 (K30). */
  exchangeRate?: number | null
  /** `Currency.decimals` baseCurrency. Dihilangkan = mata uang baris sama dengan base. */
  decimalsBase?: number
  taxable?: boolean
  taxPct?: number | null
  itemId?: string | null
}

export type HasilBaris = {
  /** Dalam mata uang baris, sudah dibulatkan (K23). */
  amount: number
  /** Dalam baseCurrency induk. */
  amountBase: number
  /** `null` bila baris tidak kena pajak (K22) — bukan 0, biar bedanya terbaca. */
  taxAmount: number | null
  taxAmountBase: number | null
  warnings: CalcWarning[]
  pelanggaran: Pelanggaran[]
}

const nol = (warnings: CalcWarning[], pelanggaran: Pelanggaran[]): HasilBaris => ({
  amount: 0,
  amountBase: 0,
  taxAmount: null,
  taxAmountBase: null,
  warnings,
  pelanggaran,
})

/**
 * Inti Fase 3 (K13/K16/K23):
 *
 *   amount     = bulatkan( batasMinimum( f(calcMethod, quantity, unitPrice), minCharge ), decimals )
 *   amountBase = bulatkan( amount × exchangeRate, decimalsBase )
 *   f          = quantity × unitPrice        (÷ 100 khusus PERCENTAGE)
 */
export function hitungBaris(baris: BarisHitung): HasilBaris {
  const { calcMethod, quantity, unitPrice, itemId = null } = baris
  const warnings: CalcWarning[] = []
  const pelanggaran: Pelanggaran[] = []

  if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) {
    pelanggaran.push({
      kode: 'ANGKA_TIDAK_SAH',
      pesan: 'Kuantitas dan harga satuan harus berupa angka.',
      itemId,
    })
  }
  // K16-1: tanpa aturan ini FLAT dan PER_UNIT jadi tak terbedakan dan totalnya
  // bisa berkali-kali tanpa jejak.
  if (calcMethod === 'FLAT' && quantity !== 1) {
    pelanggaran.push({
      kode: 'FLAT_BERKUANTITAS',
      pesan: 'Jasa lump-sum tak punya kuantitas; pakai PER_UNIT bila memang berjumlah.',
      itemId,
    })
  }
  // K16-3: unitPrice negatif JUSTRU diizinkan (baris koreksi/diskon/refund di FDA).
  if (Number.isFinite(quantity) && quantity < 0) {
    pelanggaran.push({ kode: 'QUANTITY_NEGATIF', pesan: 'Kuantitas tidak boleh negatif.', itemId })
  }
  if (!desimalSah(baris.decimals)) {
    pelanggaran.push({
      kode: 'DESIMAL_TIDAK_DIKENAL',
      pesan: 'Mata uang baris belum terdaftar di Master › Mata Uang (jumlah desimalnya tak diketahui).',
      itemId,
    })
  }
  // K20: persentase dari total campuran mata uang tak punya arti tunggal.
  if (
    calcMethod === 'PERCENTAGE' &&
    baris.exchangeRate !== null &&
    baris.exchangeRate !== undefined &&
    baris.exchangeRate !== 1
  ) {
    pelanggaran.push({
      kode: 'PERSEN_BUKAN_MATA_UANG_DASAR',
      pesan: 'Baris berbasis persen wajib memakai mata uang dasar dokumen.',
      itemId,
    })
  }
  if (pelanggaran.length > 0) return nol(warnings, pelanggaran)

  const decimals = baris.decimals as number
  const decimalsBase = desimalSah(baris.decimalsBase) ? baris.decimalsBase : decimals

  let f = quantity * unitPrice
  if (PEMBAGI_SERATUS.has(calcMethod)) f = f / 100

  // K16-4: minimum diterapkan sesudah f, SEBELUM pembulatan.
  const minCharge = baris.minCharge
  if (minCharge !== null && minCharge !== undefined && Number.isFinite(minCharge) && f < minCharge) {
    warnings.push({
      kode: 'MINIMUM_MENGIKAT',
      pesan: 'Tarif minimum berlaku — jumlah baris ini bukan kuantitas × harga satuan.',
      itemId,
      data: { hitung: f, minCharge },
    })
    f = minCharge
  }

  const amount = bulatkan(f, decimals)

  // K30: kurs kosong TIDAK PERNAH dianggap 1. Satu baris USD 12.000 yang tercatat
  // Rp 12.000 alih-alih ~Rp 195 juta adalah kegagalan terburuk yang mungkin di modul ini.
  const kurs = baris.exchangeRate
  const kursAda = kurs !== null && kurs !== undefined && Number.isFinite(kurs)
  if (!kursAda) {
    warnings.push({
      kode: 'KURS_TIDAK_ADA',
      pesan: 'Kurs ke mata uang dasar belum ada — tambahkan di Master › Kurs atau isi manual.',
      itemId,
    })
  }
  const amountBase = kursAda ? bulatkan(amount * (kurs as number), decimalsBase) : 0

  let taxAmount: number | null = null
  let taxAmountBase: number | null = null
  if (baris.taxable === true) {
    // K22: tak ada angka 11 atau 12 di dalam kode. Tarif pajak selalu dari data.
    if (baris.taxPct === null || baris.taxPct === undefined || !Number.isFinite(baris.taxPct)) {
      warnings.push({
        kode: 'PAJAK_TANPA_TARIF',
        pesan: 'Baris ditandai kena pajak tapi tarif pajaknya kosong — lengkapi di katalog jasa.',
        itemId,
      })
    } else {
      taxAmount = bulatkan((amount * baris.taxPct) / 100, decimals)
      taxAmountBase = kursAda ? bulatkan(taxAmount * (kurs as number), decimalsBase) : 0
    }
  }

  return { amount, amountBase, taxAmount, taxAmountBase, warnings, pelanggaran }
}

// -------------------------------------------------------------- invarian K13

export type HasilVerifikasi = {
  cocok: boolean
  amountDiturunkan: number
  amountTersimpan: number
  amountBaseDiturunkan: number | null
  amountBaseTersimpan: number | null
}

/**
 * Bukti invarian K13: `amount` selalu bisa diturunkan ulang dari
 * `calcMethod` + `quantity` + `unitPrice` + `minCharge` saja.
 *
 * Dipakai uji, dan tersedia untuk pemeriksa data kalau nanti ada dokumen yang
 * angkanya dicurigai. Kalau fungsi ini pernah mengembalikan `cocok: false`,
 * artinya ada yang menulis `amount` di luar mesin — persis yang dilarang K14.
 */
export function verifikasiBaris(
  baris: BarisHitung & { amount: number; amountBase?: number },
): HasilVerifikasi {
  const ulang = hitungBaris(baris)
  const baseTersimpan = baris.amountBase === undefined ? null : baris.amountBase
  const baseDiturunkan = baris.amountBase === undefined ? null : ulang.amountBase
  return {
    cocok:
      ulang.pelanggaran.length === 0 &&
      ulang.amount === baris.amount &&
      (baseTersimpan === null || baseDiturunkan === baseTersimpan),
    amountDiturunkan: ulang.amount,
    amountTersimpan: baris.amount,
    amountBaseDiturunkan: baseDiturunkan,
    amountBaseTersimpan: baseTersimpan,
  }
}
