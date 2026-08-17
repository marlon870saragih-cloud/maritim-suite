// Kebijakan SLA — MURNI, tanpa satu pun impor (K105, §4).
//
// ❌ MURNI, dan sengaja TERPISAH dari sla.ts. Pembagiannya: sla.ts adalah
// MESINNYA (rumus yang tidak akan berubah), berkas ini adalah KEBIJAKANNYA
// (angka yang belum disepakati siapa pun). Ini pola yang sudah dipakai
// approval-policy.ts untuk P1 dan anomaly-rules.ts untuk P19: mesinnya jalan,
// kebijakannya menunggu.
//
// ⚠️ INILAH SATU-SATUNYA TITIK SENTUH untuk P32 (ambang & SLA per kategori),
// P33 (jam kerja vs jam kalender), dan P34 (eskalasi). Kalau ada ambang SLA yang
// ditulis di berkas lain, jawaban atas P32-P34 nanti harus dicari di dua tempat —
// dan tempat kedua pasti terlewat.

/**
 * P32 — berapa lama sebelum tenggat sebuah tugas dianggap "mendekati".
 * Interim 12 jam: cukup lama untuk sempat dikerjakan pada shift yang sama,
 * cukup pendek untuk tidak menyalakan lonceng sehari penuh sebelumnya.
 *
 * Batasnya INKLUSIF: sisa tepat 12,000 jam sudah `MENDEKATI`, bukan `AMAN`.
 * Ditetapkan di sini supaya tidak ada dua tafsir saat angkanya diubah nanti.
 */
export const AMBANG_MENDEKATI_JAM = 12

/**
 * P32 — target penyelesaian bawaan per kategori tugas.
 *
 * Semuanya `null`, dan itu KEPUTUSAN, bukan pekerjaan yang belum selesai.
 * `null` berarti "tugas ini tak punya target waktu", yang jujur hari ini.
 * Mengisinya dengan tebakan berarti sistem mulai menilai pekerjaan orang dengan
 * standar yang tak pernah disepakati siapa pun — dan penilaian yang salah lebih
 * merusak daripada tidak ada penilaian.
 */
export const SLA_BAWAAN_PER_KATEGORI: Readonly<Record<string, number | null>> = {
  PORT_CLEARANCE: null,
  HUSBANDRY: null,
  CREW: null,
  FINANCE: null,
  DOCUMENT: null,
  VENDOR: null,
  OTHER: null,
}

/**
 * K102 — batas jumlah notifikasi per tenant per jalan job pengingat.
 * Lonjakan sepuluh ribu notifikasi karena satu bug tanggal adalah cara tercepat
 * membuat lonceng diabaikan selamanya.
 */
export const BATAS_NOTIFIKASI_PER_JALAN = 500

/**
 * K104/P33 — `null` = jam KALENDER 24/7, tanpa model hari kerja, hari libur, atau
 * jam operasional pelabuhan.
 *
 * Ini SALAH untuk urusan kantor/bank/instansi dan BENAR untuk sebagian besar
 * pekerjaan keagenan kapal — kapal tidak berhenti datang di hari Minggu dan
 * pandu bekerja 24 jam. Karena itu bawaannya jam kalender, dan kesalahannya
 * dibuat TERLIHAT: tooltip tenggat wajib menulis "dihitung dalam jam kalender
 * (24/7)". Kalau P33 dijawab "harus jam kerja", yang berubah hanya isi berkas
 * ini dan sla.ts; bentuk datanya tidak.
 */
export const JAM_KERJA: null = null

/**
 * K103/P34 — eskalasi satu tingkat, siaran, hanya untuk pelanggaran SLA.
 * Eskalasi berjenjang sengaja tidak dibangun: ia butuh pemetaan peran→penerima
 * yang belum ada jawabannya, dan berjenjang yang salah kalibrasi menghasilkan
 * kebisingan yang persis melatih orang mengabaikan lonceng.
 */
export const ESKALASI: Readonly<{ aktif: boolean; tingkat: number; keSiaran: boolean }> = {
  aktif: true,
  tingkat: 1,
  keSiaran: true,
}

export type KategoriTugas = keyof typeof SLA_BAWAAN_PER_KATEGORI

/**
 * SLA bawaan untuk sebuah kategori. Kategori tak dikenal → `null` (bukan galat):
 * `Task.category` adalah String bebas di skema, dan kategori baru tidak boleh
 * menggagalkan perhitungan — ia hanya belum punya target.
 *
 * `hasOwnProperty` dipakai (bukan `in`) supaya 'constructor'/'toString' yang ada
 * di rantai prototipe setiap objek tidak ikut lolos sebagai kategori sah —
 * alasan yang sama seperti di owner-guard.ts.
 */
export function slaBawaanKategori(category: string | null | undefined): number | null {
  if (typeof category !== 'string') return null
  if (!Object.prototype.hasOwnProperty.call(SLA_BAWAAN_PER_KATEGORI, category)) return null
  return SLA_BAWAAN_PER_KATEGORI[category]
}
