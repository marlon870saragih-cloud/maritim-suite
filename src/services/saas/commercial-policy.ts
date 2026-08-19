// Kebijakan komersial — MURNI, tanpa satu pun impor nilai (K146, Fase 8c).
//
// ❌ MURNI, dan sengaja TERPISAH dari quota.ts. Pembagiannya persis pola
// sla-policy.ts vs sla.ts (K105) dan approval-policy.ts (P1): quota.ts adalah
// MESINNYA (rumus yang tidak akan berubah), berkas ini adalah KEBIJAKANNYA
// (angka yang belum disepakati siapa pun).
//
// ⚠️ INILAH SATU-SATUNYA TITIK SENTUH untuk P48 (skema harga), P49 (batas tiap
// paket), P50 (gerbang bawaan), P51 (retensi sesudah berhenti), dan P60 (SLA
// dukungan). Kalau ada angka komersial yang ditulis di berkas lain, jawaban
// atas P48-P51 nanti harus dicari di dua tempat — dan tempat kedua pasti
// terlewat.
//
// KENAPA SEMUA KUOTA `null`. Ini pernyataan, bukan pekerjaan yang belum
// selesai. `plans.ts` hari ini menagih 250/450/600 rb berdasar jumlah MODUL;
// blueprint §11.3 mengusulkan 2,5/6/12 jt berdasar PENGGUNA & VOYAGE. Selisih
// sepuluh kali lipat dengan dasar pembatasan yang berbeda jenis (P48). Mengisi
// kuota dengan tebakan berarti sistem mulai MENOLAK PEKERJAAN PELANGGAN
// BERBAYAR dengan batas yang tak pernah disepakati siapa pun — dan penolakan
// yang salah pada pelanggan berbayar jauh lebih merusak daripada tidak ada
// batas sama sekali. Mesinnya jalan, angkanya menunggu.

import type { Plan } from '@prisma/client'

/**
 * Batas satu paket. SEMUA field boleh `null`, dan `null` berarti **tak
 * dibatasi** — bukan "nol", bukan "belum dihitung". Bedanya menentukan:
 * `null` mematikan seluruh penghitungan (quota.ts → TIDAK_DIBATASI, tanpa satu
 * query pun), sedangkan `0` adalah kebijakan sah yang berarti "tidak boleh
 * sama sekali".
 */
export type Kuota = {
  /** Pengguna ber-`isActive: true`. Yang dinonaktifkan membebaskan kursi. */
  penggunaAktif: number | null
  /** Voyage yang dibuat dalam BULAN BERJALAN (monthWindow, K32). */
  voyagePerBulan: number | null
  /** Total `Attachment.sizeBytes` yang belum dihapus, dalam megabyte. */
  penyimpananMB: number | null
  /** Panggilan AI dalam bulan berjalan. ⚠️ Lihat CATATAN SUMBER di bawah. */
  panggilanAiPerBulan: number | null
}

/** Kuota yang sepenuhnya terbuka — dipakai sebagai bawaan & untuk paket tak dikenal. */
export const TANPA_BATAS: Readonly<Kuota> = {
  penggunaAktif: null,
  voyagePerBulan: null,
  penyimpananMB: null,
  panggilanAiPerBulan: null,
}

/**
 * P48/P49 — batas per paket, dikunci pada `id` di `BILLING_PLANS` (`m1`/`m2`/
 * `all`), BUKAN pada enum `Plan`. Alasannya K155: enum `Plan` sudah tertulis di
 * `Tenant.plan` dan tidak boleh diubah; yang berubah kalau P48 dijawab adalah
 * isi tabel harga, dan `id`-nya ikut berubah bersamanya.
 *
 * `TRIAL` tidak punya baris di sini: ia bukan paket yang dijual, dan batas
 * waktunya (`trialEndsAt`) sudah ditegakkan `lib/billing/access.ts`. Trial yang
 * juga berkuota berarti dua pagar berbeda menolak orang yang belum pernah
 * membayar apa pun — cara termahal kehilangan calon pelanggan.
 */
export const KUOTA_PER_PAKET: Readonly<Record<string, Readonly<Kuota>>> = {
  m1: TANPA_BATAS,
  m2: TANPA_BATAS,
  all: TANPA_BATAS,
}

/**
 * Batas untuk sebuah `planId`. Paket tak dikenal → `TANPA_BATAS`, BUKAN
 * lemparan dan BUKAN nol.
 *
 * Arah kegagalannya sengaja berlawanan dengan `portal-guard.ts` (K148,
 * fail-closed): di sana yang tak dikenal MELEMPAR karena taruhannya kebocoran
 * data ke pihak luar. Di sini yang tak dikenal MEMBUKA, karena taruhannya
 * menolak pekerjaan pelanggan yang sudah membayar. Dua pagar, dua arah, dan
 * keduanya benar untuk apa yang mereka jaga.
 *
 * `hasOwnProperty` (bukan `in`) supaya 'constructor'/'toString' yang ada di
 * rantai prototipe setiap objek tidak lolos sebagai paket sah — alasan yang
 * sama seperti di owner-guard.ts & sla-policy.ts.
 */
export function kuotaUntukPaket(planId: string | null | undefined): Readonly<Kuota> {
  if (typeof planId !== 'string') return TANPA_BATAS
  if (!Object.prototype.hasOwnProperty.call(KUOTA_PER_PAKET, planId)) return TANPA_BATAS
  return KUOTA_PER_PAKET[planId]
}

// ------------------------------------------------------------------ jenis kuota

/**
 * Empat jenis yang bisa dipagari. Daftar TERTUTUP — `pastikanKuota()` menolak
 * yang di luar ini sebagai VALIDATION (bug pemanggil), bukan diam-diam
 * meloloskan.
 */
export const JENIS_KUOTA = ['VOYAGE', 'PENGGUNA', 'PENYIMPANAN', 'PANGGILAN_AI'] as const
export type JenisKuota = (typeof JENIS_KUOTA)[number]

/** Jenis → field `Kuota` yang membatasinya. */
export const FIELD_KUOTA: Readonly<Record<JenisKuota, keyof Kuota>> = {
  VOYAGE: 'voyagePerBulan',
  PENGGUNA: 'penggunaAktif',
  PENYIMPANAN: 'penyimpananMB',
  PANGGILAN_AI: 'panggilanAiPerBulan',
}

/**
 * Apakah ADA paket mana pun yang memasang batas untuk jenis ini.
 *
 * Ini yang mewujudkan §17/8c butir 1 secara harfiah — "bawaan `batas = null` →
 * tak ada query tambahan". Karena `KUOTA_PER_PAKET` adalah konstanta, jawaban
 * "tak ada paket yang membatasi VOYAGE" bisa diambil TANPA menyentuh database
 * sama sekali: tak perlu membaca paket tenant, tak perlu menghitung apa pun.
 * `pastikanKuota()` berhenti di sini dan biaya fitur ini benar-benar NOL selama
 * P49 belum dijawab.
 */
export function adaBatasTerpasang(jenis: JenisKuota): boolean {
  const field = FIELD_KUOTA[jenis]
  return Object.values(KUOTA_PER_PAKET).some((k) => k[field] !== null)
}

/**
 * ⚠️ CATATAN SUMBER — `PANGGILAN_AI` BELUM PUNYA PENCATAT.
 *
 * Hitungannya membaca `UsageEvent` (nama berawalan `AI_`), tabel yang lahir di
 * 8a tapi baru akan DIISI oleh `usage.service.ts`/`catatPemakaian()` di 8j
 * (K183). Artinya: selama 8j belum ada, batas AI yang diisi di
 * `KUOTA_PER_PAKET` akan membaca 0 selamanya dan TIDAK PERNAH menahan apa pun.
 *
 * Itu bahaya yang halus — blueprint §11.5 menandai AI sebagai biaya berubah
 * yang justru paling perlu dibatasi ("batas AI bukan kenyamanan, ia yang
 * menjaga margin"), jadi kuota AI yang diam-diam mati adalah rasa aman palsu
 * pada pos biaya yang paling mahal.
 *
 * Karena itu jurang ini dibuat BERISIK, bukan dicatat di komentar saja:
 * `prisma/check-quota.mjs` GAGAL begitu ada paket yang mengisi
 * `panggilanAiPerBulan` bukan-null selama penanda di bawah masih `false`.
 * Sesudah 8j memasang pencatatnya, ubah penanda ini jadi `true` — satu baris,
 * dan ujinya berhenti mengeluh.
 */
export const PEMAKAIAN_AI_TERCATAT = false

// ------------------------------------------------------- angka komersial lain

/** K156 — 80% → peringatkan, jangan blokir. Rasio 0..1, bukan persen. */
export const AMBANG_PERINGATAN_KUOTA = 0.8

/** P51 — sudah berlaku di `api/auth/register` sejak Fase 0; ditulis di sini agar satu tempat. */
export const HARI_TRIAL = 7

/** P50 — gerbang bawaan di checkout. Duitku menyusul di 8d bila env terisi (K162). */
export const GERBANG_BAWAAN: 'MIDTRANS' | 'DUITKU' = 'MIDTRANS'

/** P60 — `null` = belum menjanjikan waktu tanggap apa pun. Halaman bantuan hanya menulis jam layanan. */
export const SLA_DUKUNGAN: number | null = null

/**
 * P51/P59 — `null` = TIDAK ADA penghapusan otomatis. Data tenant yang berhenti
 * berlangganan tetap ada selamanya (K157/K188). Kode yang menghapus data
 * pelanggan berdasarkan tebakan adalah kode yang tak boleh ditulis.
 */
export const RETENSI_SESUDAH_BERHENTI_HARI: number | null = null

/** P54 — batas kiriman tagihan vendor per hari. `null` = belum dibatasi (dipakai 8g/K172). */
export const BATAS_KIRIMAN_VENDOR_PER_HARI: number | null = null

/** Dipakai `plans.ts` untuk memetakan enum ke id paket saat menghitung kuota tenant. */
export const PAKET_UNTUK_PLAN: Readonly<Record<Plan, string | null>> = {
  TRIAL: null,
  STARTER: 'm1',
  PRO: 'm2',
  FULL_SUITE: 'all',
}

// ------------------------------------------------------------------------ K165

export type Addon = { id: string; labelId: string; labelEn: string; priceIDR: number | null }

/**
 * K165 — Add-on lisensi: baris TAMBAHAN pada pesanan yang sama, bukan mesin
 * langganan kedua (prorata/siklus penagihan sendiri ditolak eksplisit — itu
 * produk tersendiri). Blueprint §11.3 menyebut empat kandidat: tiga jasa
 * manusia (penyiapan, pelatihan, templat) dan satu yang menyalakan fitur
 * (data AIS, §8/8h — belum dibangun, boleh dicoret seluruhnya per P55).
 *
 * `priceIDR: null` = BELUM DIJUAL, bukan gratis. Tak ada P-jawaban yang
 * menetapkan harganya (beda dari P48/P49 yang setidaknya punya interim jelas
 * "semua null = tak dibatasi" — untuk add-on, null yang sama berarti "tak
 * muncul di checkout sama sekali"). Menjualnya dengan harga karangan adalah
 * kesalahan yang tercatat di uang orang, bukan di kode — persis alasan
 * KUOTA_PER_PAKET dan RETENSI_SESUDAH_BERHENTI_HARI di atas.
 */
export const KATALOG_ADDON: readonly Addon[] = [
  { id: 'setup', labelId: 'Penyiapan & pemindahan data', labelEn: 'Setup & data migration', priceIDR: null },
  { id: 'training', labelId: 'Pelatihan tim', labelEn: 'Team training', priceIDR: null },
  { id: 'template', labelId: 'Penyesuaian templat dokumen', labelEn: 'Document template customization', priceIDR: null },
]

/** Add-on yang BENAR-BENAR bisa dibeli hari ini. Kosong sampai satu pun diberi harga. */
export function addonTersedia(): readonly Addon[] {
  return KATALOG_ADDON.filter((a) => a.priceIDR !== null)
}

/** `hasOwnProperty`-gaya pencarian aman — lihat alasan yang sama di `kuotaUntukPaket`. */
export function addonById(id: unknown): Addon | null {
  if (typeof id !== 'string') return null
  return KATALOG_ADDON.find((a) => a.id === id) ?? null
}

/**
 * Total harga sekumpulan add-on. `null` bila SATU SAJA dari yang diminta tak
 * dikenal atau belum dijual — pemanggil WAJIB menolak seluruh permintaan,
 * bukan diam-diam mengabaikan sebagian. Menerima sebagian addon yang diminta
 * tanpa memberi tahu pembeli adalah kelas kebocoran monetisasi yang sama
 * dengan yang dicegah `pastikanKuota` (satu pemeriksa, satu titik panggil).
 */
export function totalHargaAddon(ids: readonly unknown[]): number | null {
  let total = 0
  for (const id of ids) {
    const a = addonById(id)
    if (!a || a.priceIDR === null) return null
    total += a.priceIDR
  }
  return total
}
