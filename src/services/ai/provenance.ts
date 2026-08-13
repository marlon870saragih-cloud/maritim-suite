// Provenance data — MURNI, tanpa satu pun impor nilai (K51, mengikuti K11).
//
// Berkas ini adalah inti Fase 6a: satu-satunya tempat yang tahu apa arti
// 'SEED'/'UJI'/'NYATA', bagaimana cap dipilih saat baris dibuat, dan bagaimana
// dua cap digabung. Semua yang membaca provenance (service, route, UI, skrip
// backfill lewat kembarannya di .mjs) memakai fungsi di sini — tidak ada
// tafsir kedua yang bisa basi.
//
// Kontrak K51 (sama dengan calc-engine.ts):
//   1. `import type` SAJA. Impor nilai relatif tanpa ekstensi gagal di Node,
//      yang ber-ekstensi `.ts` gagal di tsc (TS5097). `import type` terhapus
//      saat Node melakukan type-stripping, jadi aman di dua-duanya — berkas ini
//      bisa dijalankan `node` langsung, tanpa database.
//   2. Tidak melempar ServiceError (itu impor). Input tak dikenal → nilai
//      paling pesimis, bukan lemparan.
//   3. Tidak ada `new Date()`. Semua tanggal masuk sebagai argumen.

/**
 * K55 — tiga asal data. Sengaja konstanta di modul murni, BUKAN enum Prisma:
 * menambah enum berarti mengubah bentuk tipe yang dipakai seluruh modul murni
 * lewat `import type`, dan nilai keempat ('MIGRASI' dari Excel lama) nanti akan
 * menuntut migration lagi. String + konstanta memberi keamanan tipe yang sama
 * di TypeScript tanpa biaya itu.
 *
 * Urutan array BUKAN sekadar gaya: ia adalah urutan pesimis→optimis yang
 * dipakai `asalEfektif()` (K58). Jangan diacak.
 */
export const ASAL_DATA = ['SEED', 'UJI', 'NYATA'] as const

export type AsalData = (typeof ASAL_DATA)[number]

/**
 * K58 — peringkat untuk mengambil yang paling pesimis. SEED < UJI < NYATA.
 * Angka tidak pernah bocor ke luar modul ini; yang diekspor adalah fungsinya.
 */
const PERINGKAT: Readonly<Record<AsalData, number>> = {
  SEED: 0,
  UJI: 1,
  NYATA: 2,
}

/** Asal yang dipakai saat nilai tersimpan `null` atau tak dikenal (K57). */
export const ASAL_BAWAAN: AsalData = 'UJI'

/** true bila `nilai` benar-benar salah satu dari tiga asal yang sah. */
export function adalahAsalData(nilai: unknown): nilai is AsalData {
  return typeof nilai === 'string' && (ASAL_DATA as readonly string[]).includes(nilai)
}

/**
 * K57 — tafsir nilai tersimpan. `null` (baris yang lahir sebelum kolom ini ada)
 * berarti **BUKAN NYATA**, jadi dibaca sebagai 'UJI'.
 *
 * Arahnya adalah keputusan, bukan detail: kalau `null` dibaca 'NYATA', seluruh
 * residu testing hari ini naik pangkat jadi histori operasional — persis
 * kebohongan yang seluruh §3 ada untuk mencegahnya. Risiko arah sebaliknya
 * (meremehkan data yang sebenarnya asli) hari ini nol, karena tak ada data asli.
 *
 * Nilai tak dikenal (mis. 'MIGRASI' yang belum didukung) juga jatuh ke 'UJI' —
 * menebak lebih optimis dari yang kita pahami adalah cara paling murah membuat
 * angka keyakinan berbohong.
 */
export function bacaAsal(tersimpan: string | null | undefined): AsalData {
  return adalahAsalData(tersimpan) ? tersimpan : ASAL_BAWAAN
}

/**
 * K56 — cap untuk baris yang BARU dibuat, ditempel saat itu juga (snapshot).
 *
 *   goLiveAt === null  → 'UJI'   (tenant belum menyatakan mulai bekerja sungguhan)
 *   selain itu          → 'NYATA'
 *
 * `dibuatPada` diterima sebagai argumen (tak ada `new Date()` di modul murni).
 * Baris baru secara definisi lahir pada atau sesudah `goLiveAt` bila go-live
 * sudah lewat; tapi bila jam server/klien membuat `dibuatPada` mendahului
 * `goLiveAt` (mis. go-live dijadwalkan ke depan), yang benar adalah 'UJI' —
 * pekerjaan sungguhan belum dimulai.
 *
 * Yang SENGAJA tidak dilakukan: menyimpulkan asal dengan membandingkan
 * `createdAt` vs `goLiveAt` saat query. Itu salah dua kali — baris uji tetap
 * dibuat sesudah go-live (pelatihan, demo, reproduksi bug), dan mengubah
 * `goLiveAt` akan mengubah asal-usul dokumen lama secara diam-diam.
 */
export function asalUntukBarisBaru(
  goLiveAt: Date | null | undefined,
  dibuatPada: Date,
): AsalData {
  if (!goLiveAt) return 'UJI'
  return dibuatPada.getTime() >= goLiveAt.getTime() ? 'NYATA' : 'UJI'
}

/**
 * K58 — asal EFEKTIF sebuah disbursement = yang paling pesimis antara asal
 * voyage-nya dan asal dokumennya sendiri.
 *
 * Disbursement 'NYATA' di atas voyage 'UJI' adalah kombinasi yang pasti keliru
 * (kapal latihan, tanggal karangan, GT contoh) → dihitung 'UJI'. Kebalikannya
 * (voyage nyata, dokumen latihan — mis. simulasi "kalau pakai 4 tug") juga
 * jatuh ke 'UJI', dan itu memang benar.
 *
 * Menerima `string | null` mentah dari DB supaya pemanggil tak perlu
 * menormalkan dua kali; K57 diterapkan di dalam.
 */
export function asalEfektif(
  asalVoyage: string | null | undefined,
  asalDokumen: string | null | undefined,
): AsalData {
  return minAsal(bacaAsal(asalVoyage), bacaAsal(asalDokumen))
}

/** Ambil yang paling pesimis dari sekumpulan asal (SEED < UJI < NYATA). */
export function minAsal(...asal: readonly AsalData[]): AsalData {
  let hasil: AsalData = 'NYATA'
  for (const a of asal) {
    if (PERINGKAT[a] < PERINGKAT[hasil]) hasil = a
  }
  return hasil
}

/** Perbandingan peringkat — dipakai penyaring sampel Fase 6b/6c. */
export function bandingkanAsal(a: AsalData, b: AsalData): number {
  return PERINGKAT[a] - PERINGKAT[b]
}

/**
 * true hanya untuk 'NYATA'. Inilah satu-satunya predikat yang boleh menaikkan
 * `n_nyata` di formula confidence (K59) — jangan tulis `!== 'SEED'` di tempat
 * lain, karena 'UJI' pun tidak boleh ikut.
 */
export function adalahNyata(tersimpan: string | null | undefined): boolean {
  return bacaAsal(tersimpan) === 'NYATA'
}

/** Bentuk hitungan per asal — dipakai kartu Settings › Data & AI. */
export type HitunganAsal = Readonly<Record<AsalData, number>>

export const HITUNGAN_KOSONG: HitunganAsal = { SEED: 0, UJI: 0, NYATA: 0 }

/**
 * Rangkum daftar nilai `dataOrigin` mentah (termasuk `null`) jadi hitungan per
 * asal. `null` ikut terhitung sebagai 'UJI' (K57), sehingga jumlah ketiga angka
 * SELALU sama dengan panjang masukan — tidak ada baris yang hilang dari laporan.
 */
export function rangkumAsal(nilai: readonly (string | null | undefined)[]): HitunganAsal {
  const hasil: Record<AsalData, number> = { SEED: 0, UJI: 0, NYATA: 0 }
  for (const n of nilai) hasil[bacaAsal(n)]++
  return hasil
}

/** Label dua bahasa — dipakai server & klien, satu sumber (konvensi Fase 2/3). */
export const LABEL_ASAL: Readonly<Record<'id' | 'en', Readonly<Record<AsalData, string>>>> = {
  id: { SEED: 'Contoh (seed)', UJI: 'Latihan/uji', NYATA: 'Nyata' },
  en: { SEED: 'Sample (seed)', UJI: 'Practice/test', NYATA: 'Real' },
}
