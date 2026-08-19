// Aritmetika masa langganan — MURNI, tanpa satu pun impor (K163, Fase 8d).
//
// ❌ MURNI. `sekarang` disuntikkan; tak ada `new Date()` di dalam.
//
// KENAPA BERKAS INI ADA. Aturannya sudah ada dan sudah BENAR di
// `api/billing/notification/route.ts`: `base = max(sekarang, subscriptionEndsAt)`
// lalu `+ SUBSCRIPTION_DAYS`. Yang berubah di 8d adalah jumlah pemakainya —
// dari satu handler jadi TIGA (callback Midtrans, callback Duitku, dan tombol
// "Periksa status pembayaran" K163). Tiga salinan aritmetika yang sama adalah
// tiga tempat yang perlahan berbeda, dan perbedaannya berupa UANG: satu baris
// `+` yang meleset berarti pelanggan kehilangan hari yang sudah dibayar, atau
// mendapat hari yang tidak dibayar. Karena itu ia dipindahkan apa adanya ke
// satu fungsi, bukan ditulis ulang.

/**
 * K163 — kapan langganan berakhir sesudah satu pembayaran lunas.
 *
 * `base = max(sekarang, akhirSekarang)` — MEMBAYAR LEBIH AWAL TIDAK PERNAH
 * MENGHANGUSKAN SISA HARI. Tenant yang memperpanjang saat masih tersisa 10 hari
 * mendapat 10 + 30, bukan 30. Ini sifat yang sudah berlaku sejak jalur Midtrans
 * pertama, dan ia dipertahankan kata demi kata.
 *
 * `akhirSekarang` null / sudah lewat / tanggal rusak → dihitung dari `sekarang`.
 * Tak ada lemparan: fungsi ini dipanggil DI DALAM transaksi yang menandai
 * pembayaran lunas, dan melempar di sana berarti uang sudah masuk tapi
 * langganan tidak menyala — kegagalan paling mahal yang bisa dipilih.
 */
export function hitungAkhirLangganan(
  sekarang: Date,
  akhirSekarang: Date | null | undefined,
  hari: number,
): Date {
  const now = waktuSah(sekarang) ? sekarang.getTime() : Date.now()
  const akhir = waktuSah(akhirSekarang) ? akhirSekarang.getTime() : 0
  const base = Math.max(now, akhir)
  return new Date(base + bersihkanHari(hari) * 86_400_000)
}

function waktuSah(d: unknown): d is Date {
  return d instanceof Date && Number.isFinite(d.getTime())
}

/**
 * `hari` datang dari `SUBSCRIPTION_DAYS` — konstanta di `plans.ts`, jadi nilai
 * rusak berarti kekeliruan pemrogram, bukan data pengguna. Yang dilakukan di
 * sini hanya menahan supaya tidak MEMENDEKKAN langganan yang sudah berjalan
 * (nilai negatif akan menarik mundur tanggal akhir milik orang yang baru saja
 * membayar). Nol tetap diizinkan lewat apa adanya — ia keliru, tapi keliru yang
 * TIDAK merusak data lama, dan `check-billing.mjs` yang menangkapnya dengan
 * memastikan SUBSCRIPTION_DAYS memang bilangan bulat positif.
 */
function bersihkanHari(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0
}
