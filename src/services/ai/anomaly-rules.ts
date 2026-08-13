// Delapan aturan anomali — MURNI, tanpa satu pun impor nilai (K51, mengikuti
// K11). Lihat docs/FASE-6-AI-LAYER.md §6 (K71–K74).
//
// ⚠️ SEMUA AMBANG ADA DI SATU BLOK (`AMBANG`) DAN SEMUANYA SEMENTARA — P19
// (§16), plus P12 khusus untuk `VARIANCE_BESAR`. Blok itu adalah TITIK SENTUH
// SATU-SATUNYA, persis pola `approval-policy.ts` untuk P1: menjawab P19 berarti
// mengubah angka di satu tempat, tanpa menyentuh satu pun pemanggil.
//
// Dua sifat yang membedakan anomali dari warning Fase 3, dan yang menentukan
// seluruh bentuk berkas ini:
//
//   1. Anomali **tidak pernah memblokir** transisi status (K72). Warning Fase 3
//      adalah DATA YANG KURANG (GT kosong, kurs tak ada) — objektif, memang harus
//      menahan dokumen. Anomali adalah HEURISTIK BERAMBANG yang belum pernah
//      dikalibrasi ke kenyataan Tribuana. Heuristik yang bisa menghentikan
//      pekerjaan akan (a) menghentikan pekerjaan yang benar, lalu (b) dimatikan
//      orang, lalu (c) tidak pernah dinyalakan lagi.
//   2. Setiap anomali **menyebut ambang yang dipakai** (K73). *"Rp 8.500.000 vs
//      median Rp 4.750.000 dari 5 kunjungan — selisih 79%, ambang 30%"* bisa
//      diperdebatkan operator. *"Baris ini mencurigakan"* tidak bisa, dan karena
//      itu akan diabaikan.
//
// Kontrak K51: `import type` SAJA; tak melempar untuk kondisi domain (aturan
// yang tak punya bahan cukup mengembalikan `null`, bukan lemparan); tak ada
// `new Date()`; tak ada satu pun query — semua data masuk sebagai argumen yang
// sudah dibaca `anomaly.service.ts` (berpagar tenant lewat induk, K65).

import type { CalcMethod } from '@prisma/client'

// -------------------------------------------------------------- tipe (K73)

export const KODE_ANOMALI = [
  'HARGA_MENYIMPANG',
  'DI_LUAR_KATALOG',
  'MANUAL_BESAR',
  'JASA_HILANG',
  'BARIS_GANDA',
  'KURS_MENYIMPANG',
  'VARIANCE_BESAR',
  'TOTAL_MENYIMPANG',
] as const
export type KodeAnomali = (typeof KODE_ANOMALI)[number]

export type TingkatAnomali = 'INFO' | 'PERHATIAN' | 'TINGGI'

export type Anomali = {
  kode: KodeAnomali
  tingkat: TingkatAnomali
  itemId: string | null
  pesan: string
  dasar: {
    nilai: number
    pembanding: number | null
    ambang: number
    nNyata: number
    nLatihan: number
  }
}

// ------------------------------------------------------------- ambang (P19)

/**
 * ⚠️ INTERIM — P19 & P12. Semua dalam PERSEN kecuali `MIN_SAMPEL_HISTORI`.
 *
 * Angka-angka ini berasal dari tabel K71, dan tabel K71 berasal dari dugaan
 * kami, bukan dari Tribuana. Yang ditanyakan P19 persis: *"berapa selisih yang
 * menurut Tribuana layak dipertanyakan vs wajar?"* Sampai dijawab, ambang
 * longgar lebih baik daripada ambang ketat — panel yang berisik pada minggu
 * pertama adalah panel yang dimatikan pada minggu kedua.
 */
export const AMBANG = {
  /** |unitPrice − median histori| ÷ median (K71). */
  HARGA_MENYIMPANG_PCT: 30,
  /** Selisih terhadap `ServiceRate` terpilih; 1% = toleransi pembulatan, bukan kebijakan. */
  DI_LUAR_KATALOG_PCT: 1,
  /** `amountBase` baris MANUAL sebagai porsi `grandTotal`. */
  MANUAL_BESAR_PCT: 20,
  /** Jasa yang muncul di ≥ x% kunjungan serupa tapi absen di dokumen ini. */
  JASA_HILANG_PCT: 80,
  /** `exchangeRate` baris vs `getLatestRate()` pada `tanggalJasa`. */
  KURS_MENYIMPANG_PCT: 5,
  /**
   * ⚠️ **BELUM ADA JAWABAN — P12.** Fase 3 menyebut ambang variance "kosmetik";
   * Fase 6/T1 mengusulkan menaikkannya jadi pemblokir 6e karena di sini ia ikut
   * menentukan kapan sistem menyebut sesuatu ganjil.
   *
   * TODO(P12): ganti angka ini dengan jawaban Marlon. 25% dipilih sebagai
   * default sementara mengikuti pola P1–P14 Fase 3 (pakai default aman, jangan
   * memblokir pekerjaan menunggu jawaban): ia duduk di antara ambang harga (30%)
   * dan ambang total (35%), sehingga baris yang meleset lebih jauh dari
   * estimasinya sendiri tetap tertangkap tanpa membanjiri panel. Aturan ini
   * hanya berjalan pada FDA yang punya padanan EPDA (`variancePct` non-null),
   * jadi radius salahnya sempit.
   */
  VARIANCE_BESAR_PCT: 25,
  /** `grandTotal` dokumen vs median kunjungan serupa. */
  TOTAL_MENYIMPANG_PCT: 35,
  /** K74 — aturan berbasis histori mati sendiri di bawah ini, DAN mengatakannya. */
  MIN_SAMPEL_HISTORI: 3,
} as const

/**
 * Tingkat keparahan per kode. Bukan properti aturan yang dihitung, melainkan
 * penilaian tetap: `BARIS_GANDA` dan `TOTAL_MENYIMPANG` menyentuh uang yang
 * ditagihkan dua kali / dokumen yang salah secara keseluruhan, sedangkan
 * `DI_LUAR_KATALOG` dan `JASA_HILANG` sangat sering benar-benar wajar (tarif
 * negosiasi, jasa yang memang tak dipakai) — INFO supaya tidak melatih orang
 * mengabaikan panelnya.
 */
export const TINGKAT_ATURAN: Readonly<Record<KodeAnomali, TingkatAnomali>> = {
  HARGA_MENYIMPANG: 'PERHATIAN',
  DI_LUAR_KATALOG: 'INFO',
  MANUAL_BESAR: 'PERHATIAN',
  JASA_HILANG: 'INFO',
  BARIS_GANDA: 'TINGGI',
  KURS_MENYIMPANG: 'PERHATIAN',
  VARIANCE_BESAR: 'PERHATIAN',
  TOTAL_MENYIMPANG: 'TINGGI',
}

/**
 * Aturan mana yang butuh histori (kolom "Butuh histori?" tabel K71).
 *
 * Catatan ketidakcocokan dokumen yang sengaja tidak ditebak: tabel K71 menandai
 * TIGA aturan sebagai butuh histori, sedangkan contoh kalimat di K74 menulis
 * *"4 pemeriksaan berbasis histori"*. Yang dipakai di sini adalah TABEL-nya
 * (normatif), dan jumlah di kalimat panel dihitung dari peta ini — sehingga
 * angka yang dilihat operator tidak akan pernah berbeda dari perilaku kodenya,
 * berapa pun nanti jawabannya.
 */
export const BUTUH_HISTORI: Readonly<Record<KodeAnomali, boolean>> = {
  HARGA_MENYIMPANG: true,
  DI_LUAR_KATALOG: false,
  MANUAL_BESAR: false,
  JASA_HILANG: true,
  BARIS_GANDA: false,
  KURS_MENYIMPANG: false,
  VARIANCE_BESAR: false,
  TOTAL_MENYIMPANG: true,
}

// ------------------------------------------------------------------ masukan

/** Satu baris dokumen yang sedang diperiksa, sudah dibaca service. */
export type BarisPeriksa = {
  itemId: string
  serviceId: string | null
  /** Untuk pesan yang bisa dibaca manusia; boleh kosong. */
  deskripsi: string
  calcMethod: CalcMethod
  unitPrice: number
  /** Nominal mata uang baris — TIDAK dipakai `MANUAL_BESAR` (lihat catatannya). */
  amount: number
  /** Nominal dalam `baseCurrency` — satu-satunya yang bisa dibandingkan dengan arti. */
  amountBase: number
  exchangeRate: number | null
  /** `ServiceRate` terpilih (`pilihTarif()`, K25); `null` bila tak ada tarif. */
  unitPriceKatalog: number | null
  /** Dari `hitungVariance()` (K46) untuk baris FDA; `null` di EPDA. */
  variancePct: number | null
}

/** Statistik satu jasa dari kunjungan serupa, sudah dirangkum service. */
export type HistoriJasa = {
  serviceId: string
  /** Nama jasa untuk pesan; boleh kosong. */
  nama: string
  medianUnitPrice: number | null
  /** Persentase kunjungan serupa yang memuat jasa ini (0–100). */
  kemunculanPct: number
}

export type KonteksPeriksa = {
  /** `grandTotal` dokumen dalam `baseCurrency`. */
  grandTotalBase: number
  /** Median `grandTotal` kunjungan serupa; `null` bila tak terhitung. */
  medianGrandTotalHistori: number | null
  /** Kurs acuan `getLatestRate()` pada `tanggalJasa`; `null` bila tak ada. */
  kursAcuan: number | null
  nNyata: number
  nLatihan: number
  bahasa?: 'id' | 'en'
}

export type MasukanAnomali = {
  baris: readonly BarisPeriksa[]
  histori: readonly HistoriJasa[]
  konteks: KonteksPeriksa
}

// ------------------------------------------------------------------ penolong

/**
 * Format angka tanpa `Intl`/`toLocaleString`: keduanya bergantung data locale
 * runtime, dan pesan anomali dipakai sebagai fixture uji. Determinisme di sini
 * lebih berharga daripada kerapian.
 */
function formatAngka(nilai: number, bahasa: 'id' | 'en'): string {
  const bulat = Math.round(Math.abs(nilai))
  const pemisah = bahasa === 'id' ? '.' : ','
  const digit = String(bulat)
  let hasil = ''
  for (let i = 0; i < digit.length; i++) {
    if (i > 0 && (digit.length - i) % 3 === 0) hasil += pemisah
    hasil += digit[i]
  }
  return (nilai < 0 ? '-' : '') + hasil
}

/** Persen dengan satu desimal, titik desimal dipaksa '.' supaya deterministik. */
function formatPersen(nilai: number): string {
  return (Math.round(nilai * 10) / 10).toFixed(1)
}

/** Selisih relatif dalam persen; `null` bila pembanding 0 (jangan cetak Infinity). */
function selisihPct(nilai: number, pembanding: number): number | null {
  if (!Number.isFinite(nilai) || !Number.isFinite(pembanding) || pembanding === 0) return null
  return (Math.abs(nilai - pembanding) / Math.abs(pembanding)) * 100
}

// -------------------------------------------------------------- teks (2 bhs)

/**
 * Templat pesan dua bahasa. Placeholder: `{nilai}` `{pembanding}` `{selisih}`
 * `{ambang}` `{n}` `{jasa}`. Ambang SELALU ikut di kalimatnya — itu K73, bukan
 * hiasan.
 */
export const TEKS_ANOMALI: Readonly<Record<'id' | 'en', Readonly<Record<KodeAnomali, string>>>> = {
  id: {
    HARGA_MENYIMPANG:
      'Harga satuan {nilai} vs median {pembanding} dari {n} kunjungan nyata — selisih {selisih}%, ambang {ambang}%',
    DI_LUAR_KATALOG:
      'Harga satuan {nilai} berbeda dari tarif katalog {pembanding} — selisih {selisih}%, ambang {ambang}%',
    MANUAL_BESAR:
      'Baris manual {nilai} = {selisih}% dari total dokumen {pembanding} — ambang {ambang}%',
    JASA_HILANG:
      'Jasa "{jasa}" ada di {selisih}% kunjungan serupa ({n} kunjungan nyata) tapi tidak ada di dokumen ini — ambang {ambang}%',
    BARIS_GANDA: 'Baris kembar: jasa yang sama bernilai sama persis ({nilai}) — periksa penggandaan',
    KURS_MENYIMPANG:
      'Kurs baris {nilai} menyimpang {selisih}% dari kurs acuan {pembanding} — ambang {ambang}%',
    VARIANCE_BESAR:
      'Selisih aktual vs estimasi {selisih}% pada baris ini — ambang sementara {ambang}% (P12 belum dijawab)',
    TOTAL_MENYIMPANG:
      'Total dokumen {nilai} menyimpang {selisih}% dari median {pembanding} pada {n} kunjungan nyata — ambang {ambang}%',
  },
  en: {
    HARGA_MENYIMPANG:
      'Unit price {nilai} vs median {pembanding} from {n} real port calls — {selisih}% apart, threshold {ambang}%',
    DI_LUAR_KATALOG:
      'Unit price {nilai} differs from catalogue rate {pembanding} — {selisih}% apart, threshold {ambang}%',
    MANUAL_BESAR:
      'Manual line {nilai} = {selisih}% of document total {pembanding} — threshold {ambang}%',
    JASA_HILANG:
      'Service "{jasa}" appears in {selisih}% of similar port calls ({n} real calls) but is missing here — threshold {ambang}%',
    BARIS_GANDA: 'Duplicate line: same service with the exact same amount ({nilai}) — check for double entry',
    KURS_MENYIMPANG:
      'Line exchange rate {nilai} deviates {selisih}% from the reference rate {pembanding} — threshold {ambang}%',
    VARIANCE_BESAR:
      'Actual vs estimate differs by {selisih}% on this line — interim threshold {ambang}% (P12 unanswered)',
    TOTAL_MENYIMPANG:
      'Document total {nilai} deviates {selisih}% from the median {pembanding} across {n} real port calls — threshold {ambang}%',
  },
}

type IsianPesan = {
  nilai?: string
  pembanding?: string
  selisih?: number
  ambang?: number
  n?: number
  jasa?: string
}

function pesanAnomali(kode: KodeAnomali, isian: IsianPesan, bahasa: 'id' | 'en'): string {
  return TEKS_ANOMALI[bahasa][kode]
    .replace('{nilai}', isian.nilai ?? '')
    .replace('{pembanding}', isian.pembanding ?? '')
    .replace('{selisih}', isian.selisih === undefined ? '' : formatPersen(isian.selisih))
    .replace('{ambang}', isian.ambang === undefined ? '' : String(isian.ambang))
    .replace('{n}', isian.n === undefined ? '' : String(isian.n))
    .replace('{jasa}', isian.jasa ?? '')
}

function buatAnomali(
  kode: KodeAnomali,
  itemId: string | null,
  pesan: string,
  dasar: { nilai: number; pembanding: number | null; ambang: number },
  konteks: KonteksPeriksa,
): Anomali {
  return {
    kode,
    tingkat: TINGKAT_ATURAN[kode],
    itemId,
    pesan,
    dasar: { ...dasar, nNyata: konteks.nNyata, nLatihan: konteks.nLatihan },
  }
}

/** K74 — apakah aturan berbasis histori boleh bunyi sama sekali. */
export function historiCukup(konteks: KonteksPeriksa): boolean {
  return konteks.nNyata >= AMBANG.MIN_SAMPEL_HISTORI
}

// ------------------------------------------------------- 1. HARGA_MENYIMPANG

/**
 * Butuh histori (n ≥ 3). Dibandingkan terhadap **median harga satuan**, bukan
 * `amount`: `amount` histori adalah fungsi GT & etmal kapal ITU (K61).
 */
export function aturanHargaMenyimpang(
  baris: BarisPeriksa,
  histori: HistoriJasa | undefined,
  konteks: KonteksPeriksa,
): Anomali | null {
  if (!historiCukup(konteks)) return null
  const median = histori?.medianUnitPrice ?? null
  if (median === null || median <= 0) return null
  const selisih = selisihPct(baris.unitPrice, median)
  if (selisih === null || selisih <= AMBANG.HARGA_MENYIMPANG_PCT) return null
  const bahasa = konteks.bahasa ?? 'id'
  return buatAnomali(
    'HARGA_MENYIMPANG',
    baris.itemId,
    pesanAnomali(
      'HARGA_MENYIMPANG',
      {
        nilai: formatAngka(baris.unitPrice, bahasa),
        pembanding: formatAngka(median, bahasa),
        selisih,
        ambang: AMBANG.HARGA_MENYIMPANG_PCT,
        n: konteks.nNyata,
      },
      bahasa,
    ),
    { nilai: baris.unitPrice, pembanding: median, ambang: AMBANG.HARGA_MENYIMPANG_PCT },
    konteks,
  )
}

// -------------------------------------------------------- 2. DI_LUAR_KATALOG

/**
 * Tak butuh histori — inilah salah satu aturan yang membuat fitur ini berguna
 * hari ini juga, dengan nol data nyata (K71).
 *
 * `MANUAL` dikecualikan menurut definisinya: nominalnya memang diketik operator
 * dan tak punya tarif katalog untuk dibandingkan (K14/K16).
 */
export function aturanDiLuarKatalog(baris: BarisPeriksa, konteks: KonteksPeriksa): Anomali | null {
  if (baris.calcMethod === 'MANUAL') return null
  const katalog = baris.unitPriceKatalog
  if (katalog === null || katalog <= 0) return null
  const selisih = selisihPct(baris.unitPrice, katalog)
  if (selisih === null || selisih <= AMBANG.DI_LUAR_KATALOG_PCT) return null
  const bahasa = konteks.bahasa ?? 'id'
  return buatAnomali(
    'DI_LUAR_KATALOG',
    baris.itemId,
    pesanAnomali(
      'DI_LUAR_KATALOG',
      {
        nilai: formatAngka(baris.unitPrice, bahasa),
        pembanding: formatAngka(katalog, bahasa),
        selisih,
        ambang: AMBANG.DI_LUAR_KATALOG_PCT,
      },
      bahasa,
    ),
    { nilai: baris.unitPrice, pembanding: katalog, ambang: AMBANG.DI_LUAR_KATALOG_PCT },
    konteks,
  )
}

// ----------------------------------------------------------- 3. MANUAL_BESAR

/**
 * ⚠️ Memakai **`amountBase`**, bukan `amount` — dan itu bukan detail gaya.
 * `grandTotal` dokumen ada dalam `baseCurrency`; baris bisa dalam mata uang
 * lain. Membandingkan `amount` USD dengan `grandTotal` IDR menghasilkan porsi
 * ~0,006% dan aturan ini tak pernah bunyi untuk baris asing — persis baris yang
 * paling perlu diperiksa. Satu-satunya besaran yang bisa dibandingkan dengan
 * arti adalah yang sudah dikonversi (alasan sama dengan `variance.ts`).
 */
export function aturanManualBesar(baris: BarisPeriksa, konteks: KonteksPeriksa): Anomali | null {
  if (baris.calcMethod !== 'MANUAL') return null
  const total = konteks.grandTotalBase
  if (!Number.isFinite(total) || total <= 0) return null
  const porsi = (Math.abs(baris.amountBase) / total) * 100
  if (porsi <= AMBANG.MANUAL_BESAR_PCT) return null
  const bahasa = konteks.bahasa ?? 'id'
  return buatAnomali(
    'MANUAL_BESAR',
    baris.itemId,
    pesanAnomali(
      'MANUAL_BESAR',
      {
        nilai: formatAngka(baris.amountBase, bahasa),
        pembanding: formatAngka(total, bahasa),
        selisih: porsi,
        ambang: AMBANG.MANUAL_BESAR_PCT,
      },
      bahasa,
    ),
    { nilai: baris.amountBase, pembanding: total, ambang: AMBANG.MANUAL_BESAR_PCT },
    konteks,
  )
}

// ------------------------------------------------------------ 4. JASA_HILANG

/**
 * Butuh histori (n ≥ 3). Satu-satunya aturan yang bicara tentang baris yang
 * TIDAK ada — karena itu `itemId` selalu `null` dan panel tak bisa melompat ke
 * mana pun; yang ditawarkan UI nanti adalah "tambahkan jasa ini".
 */
export function aturanJasaHilang(
  barisDokumen: readonly BarisPeriksa[],
  histori: readonly HistoriJasa[],
  konteks: KonteksPeriksa,
): Anomali[] {
  if (!historiCukup(konteks)) return []
  const bahasa = konteks.bahasa ?? 'id'
  const adaDiDokumen = new Set(
    barisDokumen.map((b) => b.serviceId).filter((id): id is string => id !== null),
  )
  const hasil: Anomali[] = []
  for (const h of histori) {
    if (adaDiDokumen.has(h.serviceId)) continue
    if (!Number.isFinite(h.kemunculanPct) || h.kemunculanPct < AMBANG.JASA_HILANG_PCT) continue
    hasil.push(
      buatAnomali(
        'JASA_HILANG',
        null,
        pesanAnomali(
          'JASA_HILANG',
          {
            selisih: h.kemunculanPct,
            ambang: AMBANG.JASA_HILANG_PCT,
            n: konteks.nNyata,
            jasa: h.nama,
          },
          bahasa,
        ),
        { nilai: h.kemunculanPct, pembanding: null, ambang: AMBANG.JASA_HILANG_PCT },
        konteks,
      ),
    )
  }
  return hasil
}

// ------------------------------------------------------------ 5. BARIS_GANDA

/**
 * Tak butuh histori. `serviceId` sama **dan** `amount` sama persis — tanpa
 * toleransi, karena dua baris jasa sama yang nilainya kebetulan sama persis
 * hampir selalu berarti satu baris tersalin dua kali (dan kalau memang sengaja,
 * operator menutupnya sekali klik; K72 menjamin ia tak menghalangi apa pun).
 *
 * Baris tanpa `serviceId` (mis. MANUAL bebas) dilewati: "jasa yang sama" tak
 * bisa dibuktikan, dan menebaknya dari deskripsi akan menandai baris sah yang
 * memang berulang (dua kali pandu, dua kali tunda).
 *
 * `dasar.ambang = 0` bukan tempat kosong: nol adalah TOLERANSInya, dan K73
 * mewajibkan setiap anomali membawa ambangnya.
 */
export function aturanBarisGanda(
  barisDokumen: readonly BarisPeriksa[],
  konteks: KonteksPeriksa,
): Anomali[] {
  const bahasa = konteks.bahasa ?? 'id'
  const terlihat = new Map<string, BarisPeriksa>()
  const hasil: Anomali[] = []
  for (const b of barisDokumen) {
    if (b.serviceId === null) continue
    const kunci = `${b.serviceId}|${b.amount}`
    const pertama = terlihat.get(kunci)
    if (pertama === undefined) {
      terlihat.set(kunci, b)
      continue
    }
    hasil.push(
      buatAnomali(
        'BARIS_GANDA',
        b.itemId,
        pesanAnomali('BARIS_GANDA', { nilai: formatAngka(b.amount, bahasa) }, bahasa),
        { nilai: b.amount, pembanding: pertama.amount, ambang: 0 },
        konteks,
      ),
    )
  }
  return hasil
}

// -------------------------------------------------------- 6. KURS_MENYIMPANG

/** Tak butuh histori. Kurs acuan datang dari `getLatestRate()` pada `tanggalJasa` (K29). */
export function aturanKursMenyimpang(baris: BarisPeriksa, konteks: KonteksPeriksa): Anomali | null {
  const acuan = konteks.kursAcuan
  const kurs = baris.exchangeRate
  if (acuan === null || acuan <= 0) return null
  if (kurs === null || !Number.isFinite(kurs) || kurs <= 0) return null
  const selisih = selisihPct(kurs, acuan)
  if (selisih === null || selisih <= AMBANG.KURS_MENYIMPANG_PCT) return null
  const bahasa = konteks.bahasa ?? 'id'
  return buatAnomali(
    'KURS_MENYIMPANG',
    baris.itemId,
    pesanAnomali(
      'KURS_MENYIMPANG',
      {
        nilai: formatAngka(kurs, bahasa),
        pembanding: formatAngka(acuan, bahasa),
        selisih,
        ambang: AMBANG.KURS_MENYIMPANG_PCT,
      },
      bahasa,
    ),
    { nilai: kurs, pembanding: acuan, ambang: AMBANG.KURS_MENYIMPANG_PCT },
    konteks,
  )
}

// --------------------------------------------------------- 7. VARIANCE_BESAR

/**
 * ⚠️ Ambangnya PLACEHOLDER — lihat `AMBANG.VARIANCE_BESAR_PCT` dan P12/T1.
 *
 * `variancePct` dihitung `hitungVariance()` (K46) dan sudah `null` bila basisnya
 * 0 — jadi aturan ini tak pernah melihat `Infinity`. Ia diam total pada dokumen
 * EPDA (tak ada padanan aktual untuk dibandingkan).
 */
export function aturanVarianceBesar(baris: BarisPeriksa, konteks: KonteksPeriksa): Anomali | null {
  const pct = baris.variancePct
  if (pct === null || !Number.isFinite(pct)) return null
  const besar = Math.abs(pct)
  if (besar <= AMBANG.VARIANCE_BESAR_PCT) return null
  const bahasa = konteks.bahasa ?? 'id'
  return buatAnomali(
    'VARIANCE_BESAR',
    baris.itemId,
    pesanAnomali(
      'VARIANCE_BESAR',
      { selisih: besar, ambang: AMBANG.VARIANCE_BESAR_PCT },
      bahasa,
    ),
    { nilai: pct, pembanding: null, ambang: AMBANG.VARIANCE_BESAR_PCT },
    konteks,
  )
}

// -------------------------------------------------------- 8. TOTAL_MENYIMPANG

/** Butuh histori (n ≥ 3). Satu-satunya aturan tingkat dokumen — `itemId` `null`. */
export function aturanTotalMenyimpang(konteks: KonteksPeriksa): Anomali | null {
  if (!historiCukup(konteks)) return null
  const median = konteks.medianGrandTotalHistori
  if (median === null || median <= 0) return null
  const selisih = selisihPct(konteks.grandTotalBase, median)
  if (selisih === null || selisih <= AMBANG.TOTAL_MENYIMPANG_PCT) return null
  const bahasa = konteks.bahasa ?? 'id'
  return buatAnomali(
    'TOTAL_MENYIMPANG',
    null,
    pesanAnomali(
      'TOTAL_MENYIMPANG',
      {
        nilai: formatAngka(konteks.grandTotalBase, bahasa),
        pembanding: formatAngka(median, bahasa),
        selisih,
        ambang: AMBANG.TOTAL_MENYIMPANG_PCT,
        n: konteks.nNyata,
      },
      bahasa,
    ),
    { nilai: konteks.grandTotalBase, pembanding: median, ambang: AMBANG.TOTAL_MENYIMPANG_PCT },
    konteks,
  )
}

// -------------------------------------------------------------- orkestrasi

/**
 * Jalankan kedelapan aturan. Urutan keluaran deterministik: per-dokumen dulu,
 * lalu per-baris menurut urutan baris di dokumen — supaya panel tidak berganti
 * susunan tiap kali dibuka pada data yang sama.
 */
export function jalankanSemuaAturan({ baris, histori, konteks }: MasukanAnomali): Anomali[] {
  const petaHistori = new Map(histori.map((h) => [h.serviceId, h]))
  const hasil: Anomali[] = []

  const total = aturanTotalMenyimpang(konteks)
  if (total !== null) hasil.push(total)

  hasil.push(...aturanJasaHilang(baris, histori, konteks))

  for (const b of baris) {
    const h = b.serviceId === null ? undefined : petaHistori.get(b.serviceId)
    const perBaris = [
      aturanHargaMenyimpang(b, h, konteks),
      aturanDiLuarKatalog(b, konteks),
      aturanManualBesar(b, konteks),
      aturanKursMenyimpang(b, konteks),
      aturanVarianceBesar(b, konteks),
    ]
    for (const a of perBaris) if (a !== null) hasil.push(a)
  }

  hasil.push(...aturanBarisGanda(baris, konteks))
  return hasil
}

// ------------------------------------------------------ aturan nonaktif (K74)

export type AturanNonaktif = {
  kode: KodeAnomali
  alasan: Readonly<Record<'id' | 'en', string>>
  nNyata: number
  minimal: number
}

/**
 * K74 — aturan berbasis histori mati sendiri saat `nNyata < 3`, **dan
 * mengatakannya.** Bukan diam-diam tidak jalan: panel menampilkan baris abu
 * *"{k} pemeriksaan berbasis histori belum aktif — butuh minimal 3 kunjungan
 * nyata di pelabuhan ini (sekarang: 0)."*
 *
 * Tanpa ini, "tidak ada anomali" terbaca sebagai "dokumen bersih", padahal yang
 * terjadi adalah separuh pemeriksaannya belum pernah dijalankan. Operator juga
 * jadi tahu bahwa mengisi FDA dengan rajin adalah yang menghidupkannya —
 * informasi yang tak akan pernah ia dapat dari panel kosong.
 */
export function aturanNonaktif(konteks: KonteksPeriksa): AturanNonaktif[] {
  if (historiCukup(konteks)) return []
  return KODE_ANOMALI.filter((kode) => BUTUH_HISTORI[kode]).map((kode) => ({
    kode,
    alasan: {
      id: `Butuh minimal ${AMBANG.MIN_SAMPEL_HISTORI} kunjungan nyata di pelabuhan ini (sekarang: ${konteks.nNyata})`,
      en: `Needs at least ${AMBANG.MIN_SAMPEL_HISTORI} real port calls at this port (now: ${konteks.nNyata})`,
    },
    nNyata: konteks.nNyata,
    minimal: AMBANG.MIN_SAMPEL_HISTORI,
  }))
}

/** Kalimat siap-tempel untuk baris abu panel (K74). */
export function ringkasanNonaktif(konteks: KonteksPeriksa, bahasa: 'id' | 'en' = 'id'): string | null {
  const daftar = aturanNonaktif(konteks)
  if (daftar.length === 0) return null
  return bahasa === 'id'
    ? `${daftar.length} pemeriksaan berbasis histori belum aktif — butuh minimal ${AMBANG.MIN_SAMPEL_HISTORI} kunjungan nyata di pelabuhan ini (sekarang: ${konteks.nNyata}).`
    : `${daftar.length} history-based checks are not active yet — they need at least ${AMBANG.MIN_SAMPEL_HISTORI} real port calls at this port (now: ${konteks.nNyata}).`
}
