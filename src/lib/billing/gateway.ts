// Identitas gerbang pembayaran — MURNI, tanpa satu pun impor (K159/K162, Fase 8d).
//
// ❌ MURNI. Tak ada `Date.now()`, tak ada `Math.random()`, tak ada env, tak ada
// DB. Epoch & bagian acak MASUK sebagai argumen — supaya `buatOrderId()` bisa
// diuji dengan nilai tetap dan dua pemanggil menghasilkan bentuk yang sama
// persis. Pola & alasan sama dengan `sekarang` di sla.ts.
//
// ⚠️ KENAPA BERKAS INI ADA, dan kenapa awalannya bukan kosmetik (K159).
//
// Handler callback yang lama mencari pesanan dengan `findUnique({ where: {
// orderId } })` — HANYA dengan orderId. Dengan dua gerbang yang berbagi satu
// ruang nama, callback bertanda tangan SAH dari gerbang A bisa menunjuk baris
// Payment yang lahir di gerbang B, dan handler tak punya cara menolaknya.
// Skenarionya bukan hipotetis: `merchantOrderId` Duitku sepenuhnya ditentukan
// KITA, jadi siapa pun yang memegang akun merchant Duitku (termasuk kami
// sendiri saat menguji sandbox, atau merchant lain yang bereksperimen) bisa
// membuat transaksi ber-`merchantOrderId` yang menyerupai pesanan Midtrans.
//
// Hal ini menjadi NYATA di pemasangan kami: satu akun merchant Duitku yang SAMA
// dipakai bersama produk lain (Salindia). Ruang nama `merchantOrderId` benar-
// benar dibagi dengan aplikasi lain, bukan cuma secara teori.
//
// Tiga pagar, dan ketiganya wajib — satu saja tidak cukup:
//   1. AWALAN di berkas ini membuat tabrakan terlihat sebelum menyentuh DB.
//   2. Handler mencari dengan `orderId` DAN `gateway` (lihat kedua route).
//   3. `@@unique([gateway, orderId])` di skema, BERDAMPINGAN dengan
//      `@unique([orderId])` yang lama — yang lama itu yang menjamin awalannya
//      benar-benar dipakai, bukan sekadar konvensi penamaan.

export const GERBANG = ['MIDTRANS', 'DUITKU'] as const
export type Gerbang = (typeof GERBANG)[number]

/**
 * Awalan WAJIB per gerbang.
 *
 *   Sebelum Fase 8 :  SUB-<planId>-<epoch>-<acak>
 *   Fase 8d        :  SUB-<MT|DK>-<planId>-<epoch>-<acak>
 *
 * Baris lama tetap berbentuk `SUB-<planId>-…` dan TIDAK di-backfill (K159/M6).
 * `gerbangDariOrderId()` di bawah mengembalikan `null` untuknya, dan itu benar:
 * ia memang bukan bukti gerbang apa pun. Yang menangani baris lama adalah
 * handler Midtrans, yang sengaja juga menerima `gateway = null` (lihat route).
 */
export const AWALAN: Readonly<Record<Gerbang, string>> = {
  MIDTRANS: 'SUB-MT-',
  DUITKU: 'SUB-DK-',
}

export function adalahGerbang(x: unknown): x is Gerbang {
  return typeof x === 'string' && (GERBANG as readonly string[]).includes(x)
}

/**
 * Bentuk `orderId` untuk sebuah pesanan.
 *
 * `epoch` & `acak` disuntikkan (modul murni). Pemanggil memakai `Date.now()` dan
 * `Math.random().toString(36).slice(2, 6)` — persis seperti kode checkout lama,
 * supaya bentuknya tidak berubah selain awalannya.
 *
 * Hasilnya hanya memuat `A-Z 0-9 -`, aman untuk kedua gerbang (Midtrans
 * `order_id` & Duitku `merchantOrderId` sama-sama membatasi panjang ±50 dan
 * melarang sebagian simbol). Panjang khasnya ±29 karakter.
 */
export function buatOrderId(gerbang: Gerbang, planId: string, epoch: number, acak: string): string {
  return `${AWALAN[gerbang]}${planId}-${epoch}-${acak}`
}

/**
 * Gerbang yang DIKLAIM oleh sebuah orderId, dari awalannya saja.
 *
 * ⚠️ Ini BUKAN otentikasi dan tak boleh dipakai untuk memilih algoritma tanda
 * tangan — K160 menegaskan algoritma ditentukan oleh PATH endpoint, tak pernah
 * oleh isi permintaan. Fungsi ini hanya alat bantu baca (rekonsiliasi, log,
 * pemeriksaan kewarasan di uji).
 *
 * `null` = tak berawalan gerbang apa pun (baris sebelum Fase 8d, atau orderId
 * milik pihak lain).
 */
export function gerbangDariOrderId(orderId: unknown): Gerbang | null {
  if (typeof orderId !== 'string') return null
  for (const g of GERBANG) if (orderId.startsWith(AWALAN[g])) return g
  return null
}

/**
 * K162 — gerbang mana yang ditawarkan lebih dulu.
 *
 * Urutan: pilihan terakhir yang BERHASIL (`Tenant.preferredGateway`) → bawaan
 * dari `commercial-policy.ts` → gerbang pertama yang tersedia. `bawaan`
 * disuntikkan, tidak diimpor: `GERBANG_BAWAAN` tinggal di commercial-policy.ts
 * sebagai titik sentuh tunggal P50 (K146), dan modul murni tak boleh saling
 * memanggil di tingkat nilai (K11/K51).
 *
 * `tersedia` = gerbang yang kredensialnya benar-benar terisi. Gerbang yang tak
 * terkonfigurasi TIDAK PERNAH terpilih — K163: "aplikasi tak pernah menampilkan
 * tombol yang pasti gagal". Kalau tak ada satu pun yang tersedia → `null`, dan
 * layar menampilkan jalur transfer manual.
 */
export function pilihGerbang(
  preferred: unknown,
  tersedia: readonly Gerbang[],
  bawaan: Gerbang,
): Gerbang | null {
  if (tersedia.length === 0) return null
  if (adalahGerbang(preferred) && tersedia.includes(preferred)) return preferred
  if (tersedia.includes(bawaan)) return bawaan
  return tersedia[0]
}

/** Gerbang lain yang bisa dicoba ("Pembayaran tidak berhasil? Coba lewat …"). */
export function gerbangAlternatif(sekarang: Gerbang, tersedia: readonly Gerbang[]): Gerbang | null {
  return tersedia.find((g) => g !== sekarang) ?? null
}

/** Nama untuk layar. Bukan i18n — ini nama merek, sama di kedua bahasa. */
export const LABEL_GERBANG: Readonly<Record<Gerbang, string>> = {
  MIDTRANS: 'Midtrans',
  DUITKU: 'Duitku',
}
