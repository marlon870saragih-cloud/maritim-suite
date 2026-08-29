// Identitas surel portal — SATU tempat yang memutuskan "dua alamat ini orang
// yang sama atau bukan" (C1.4).
//
// KENAPA ADA. `PortalUser` unik per (tenantId, email) lewat btree biasa, dan
// btree PEKA huruf besar-kecil. Tanpa kanonikalisasi, `Ops@Samudra.co.id` dan
// `ops@samudra.co.id` lolos jadi DUA baris pada tenant yang sama — dua kata
// sandi, dua riwayat, satu manusia. Kendala database tidak menahannya, karena
// bagi Postgres keduanya memang benar-benar beda. Jadi aturan identitasnya
// harus ditegakkan di aplikasi, dan kalau ditegakkan di aplikasi ia hanya
// benar bila SEMUA jalur memakai aturan yang sama persis.
//
// TANPA IMPOR dan tanpa akses database — supaya bisa dipakai dari service
// (forTenant), dari `authorize()` NextAuth (yang berjalan pra-sesi dan sengaja
// memakai `prisma` mentah), maupun dari skrip uji Node langsung; dan supaya
// aturannya tak pernah ditulis ulang sedikit berbeda di tiga tempat.

/**
 * Bentuk kanonik satu alamat surel portal.
 *
 * SENGAJA hanya `trim()` + `toLowerCase()` — BUKAN normalisasi ala penyedia
 * (membuang titik pada Gmail, memangkas `+tag`). `a.b@gmail.com` dan
 * `ab@gmail.com` memang tiba di kotak surat yang sama, tapi memutuskan
 * keduanya ORANG yang sama adalah kebijakan bisnis, bukan kanonikalisasi —
 * dan salah menebaknya berarti menggabungkan dua identitas yang seharusnya
 * terpisah, yang tak bisa dibatalkan begitu kata sandinya sudah dipakai.
 *
 * Bagian huruf besar-kecil sendiri sudah pasti: RFC 5321 menyatakan domain
 * tak peka huruf, dan meski local-part secara teori peka, tak ada penyedia
 * arus utama yang memperlakukannya begitu — kendala unik kita pun sudah
 * mengandaikan tidak.
 */
export function normalisasiEmailPortal(nilai: string): string {
  return nilai.trim().toLowerCase()
}
