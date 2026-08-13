// Tingkat kemiripan "kunjungan serupa" — MURNI, tanpa satu pun impor nilai
// (K51, mengikuti K11). Lihat docs/FASE-6-AI-LAYER.md §4/K63.
//
// ⚠️ SEMUA AMBANG DI BERKAS INI SEMENTARA — P18 (§16). Berkas ini adalah TITIK
// SENTUH SATU-SATUNYA-nya: menjawab P18 ("bracket GT resmi berapa? tarif
// Tribuana peka jenis kapal atau cuma GT?") berarti mengubah `KRITERIA_KEMIRIPAN`
// saja; bentuk keluarannya (tingkat + faktor M) tidak berubah, jadi tak satu pun
// pemanggil ikut disunting.
//
// ── Bentuk API: kenapa "hitungan sampel per tingkat", bukan "kriteria" ───────
// Modul murni tak boleh tahu Prisma (K51), jadi ia mustahil mencocokkan sendiri
// pelabuhan/GT/tanggal. Tiga bentuk dipertimbangkan:
//
//   (a) terima kriteria mentah (portId, gt, vesselType, tanggal) dan kembalikan
//       predikat → modul ini jadi setengah query builder yang tetap tak bisa
//       menjalankan apa pun; service tetap harus menulis WHERE-nya sendiri, dan
//       jadilah dua tempat yang harus sepakat.
//   (b) terima boolean "cocok" per tingkat → membuang `n`, padahal `n` justru
//       yang menentukan tingkat mana yang dipilih (berhenti di tingkat pertama
//       yang n ≥ 1) DAN yang dipakai `hitungS()`. Caller harus membawa `n`
//       terpisah — dua nilai yang wajib sinkron, satu-satunya bentuk bug yang
//       tak akan pernah kelihatan di layar.
//   (c) ✅ terima `Record<TingkatKemiripan, number>` = berapa sampel yang
//       ditemukan di tiap tingkat. `Record` atas union literal membuat tingkat
//       yang lupa diisi jadi galat kompilasi, dan membuat tingkat 5 MUSTAHIL
//       diekspresikan — bukan cuma tidak dianjurkan.
//
// Dipilih (c). Kriteria queries tetap diekspor sebagai DATA (`KRITERIA_KEMIRIPAN`)
// supaya service merakit WHERE-nya dari satu sumber, tapi keputusan "tingkat
// mana yang menang" tinggal di sini dan bisa diuji tanpa database.
//
// ── Tingkat 5 tidak ada, dan tidak boleh bisa diketik ────────────────────────
// K63: tarif pelabuhan adalah regulasi lokal (alasan yang sama dengan bobot
// `portId +4` di K25). Harga pandu Samarinda tidak mengatakan apa pun tentang
// Balikpapan. Kalau pelabuhannya belum pernah dikunjungi, jawabannya "belum ada
// data" (tier KATALOG), bukan angka dari pelabuhan lain. Karena itu union-nya
// literal 1|2|3|4 — tak ada `number` di mana pun pada permukaan modul ini.

import type { CalcMethod } from '@prisma/client'

export const TINGKAT_KEMIRIPAN = [1, 2, 3, 4] as const
export type TingkatKemiripan = (typeof TINGKAT_KEMIRIPAN)[number]

/** Faktor `M` yang masuk ke `hitungConfidence()` sebagai argumen (K63/K68). */
export const FAKTOR_M: Readonly<Record<TingkatKemiripan, number>> = {
  1: 1.0,
  2: 0.85,
  3: 0.7,
  4: 0.55,
}

export type KriteriaKemiripan = {
  /** Selalu true. Ditulis eksplisit supaya "pelabuhan sama" terbaca sebagai syarat, bukan asumsi. */
  pelabuhanSama: true
  vesselTypeSama: boolean
  /** Toleransi GT dalam persen; `null` = GT tidak disaring sama sekali. */
  toleransiGtPct: number | null
  jendelaBulan: number
  /** Label dua bahasa untuk *"3 kunjungan di Samarinda, kapal sejenis, GT ±25%"* (K63). */
  label: Readonly<Record<'id' | 'en', string>>
}

/** ⚠️ Interim P18 — ±25%/±50% dan 24/36 bulan adalah angka karangan kami, bukan bracket resmi. */
export const KRITERIA_KEMIRIPAN: Readonly<Record<TingkatKemiripan, KriteriaKemiripan>> = {
  1: {
    pelabuhanSama: true,
    vesselTypeSama: true,
    toleransiGtPct: 25,
    jendelaBulan: 24,
    label: {
      id: 'pelabuhan sama, kapal sejenis, GT ±25%, ≤ 24 bulan',
      en: 'same port, same vessel type, GT ±25%, ≤ 24 months',
    },
  },
  2: {
    pelabuhanSama: true,
    vesselTypeSama: true,
    toleransiGtPct: 50,
    jendelaBulan: 36,
    label: {
      id: 'pelabuhan sama, kapal sejenis, GT ±50%, ≤ 36 bulan',
      en: 'same port, same vessel type, GT ±50%, ≤ 36 months',
    },
  },
  3: {
    pelabuhanSama: true,
    vesselTypeSama: false,
    toleransiGtPct: 50,
    jendelaBulan: 36,
    label: {
      id: 'pelabuhan sama, semua jenis kapal, GT ±50%, ≤ 36 bulan',
      en: 'same port, any vessel type, GT ±50%, ≤ 36 months',
    },
  },
  4: {
    pelabuhanSama: true,
    vesselTypeSama: false,
    toleransiGtPct: null,
    jendelaBulan: 36,
    label: {
      id: 'pelabuhan sama, ≤ 36 bulan',
      en: 'same port, ≤ 36 months',
    },
  },
}

/**
 * K61 — untuk `MANUAL` dan `FLAT`, `unitPrice` **adalah** nominalnya, bukan
 * harga per GT/etmal/ton. Membandingkannya antar kunjungan tetap sah, tapi hanya
 * bila kapal & pelabuhannya sebanding — jadi kemiripan "diperketat satu tingkat".
 *
 * Tafsir yang dipakai (ditulis di sini karena K61 tidak merincinya): tingkat
 * terlonggar dicoret, yakni tingkat maksimum turun dari 4 ke 3. Tingkat 4
 * ("pelabuhan saja") berarti membandingkan lump sum kapal 2.000 GT dengan kapal
 * 40.000 GT — untuk metode yang nominalnya TIDAK dinormalkan terhadap GT, itu
 * bukan pelonggaran, itu perbandingan yang salah. Tafsir alternatif (menggeser
 * kriteria tiap tingkat satu notch) menghasilkan tabel kelima yang harus
 * dirawat; ini tidak.
 */
export const CALC_METHOD_NOMINAL: readonly CalcMethod[] = ['MANUAL', 'FLAT']

export function tingkatMaksimum(calcMethod: CalcMethod): TingkatKemiripan {
  return CALC_METHOD_NOMINAL.includes(calcMethod) ? 3 : 4
}

/** Berapa sampel ditemukan di tiap tingkat. Record → tak ada tingkat yang bisa lupa diisi. */
export type HitunganPerTingkat = Readonly<Record<TingkatKemiripan, number>>

export const HITUNGAN_TINGKAT_KOSONG: HitunganPerTingkat = { 1: 0, 2: 0, 3: 0, 4: 0 }

export type PilihanKemiripan = {
  tingkat: TingkatKemiripan
  m: number
  n: number
  kriteria: KriteriaKemiripan
}

/**
 * K63 — pilih tingkat **paling ketat** yang menghasilkan `n ≥ 1`, berhenti di
 * situ. Tak ada penggabungan antar tingkat: menggabung 2 sampel ketat dengan 9
 * sampel longgar menghasilkan median yang didominasi yang longgar, lalu
 * dilaporkan dengan `M` yang mana?
 *
 * `null` = tak ada sampel di tingkat mana pun → service menjatuhkan ke tier
 * KATALOG (K62) dan mengaku sedang mengulang autofill. Itu keluaran yang benar,
 * bukan kegagalan.
 */
export function pilihTingkat(
  hitungan: HitunganPerTingkat,
  calcMethod?: CalcMethod,
): PilihanKemiripan | null {
  const batas = calcMethod === undefined ? 4 : tingkatMaksimum(calcMethod)
  for (const tingkat of TINGKAT_KEMIRIPAN) {
    if (tingkat > batas) break
    const n = hitungan[tingkat]
    if (Number.isFinite(n) && n >= 1) {
      return { tingkat, m: FAKTOR_M[tingkat], n: Math.floor(n), kriteria: KRITERIA_KEMIRIPAN[tingkat] }
    }
  }
  return null
}

/** Teks tingkat yang dipakai — K63 mewajibkannya selalu ikut di respons & layar. */
export function labelTingkat(tingkat: TingkatKemiripan, bahasa: 'id' | 'en' = 'id'): string {
  return KRITERIA_KEMIRIPAN[tingkat].label[bahasa]
}
