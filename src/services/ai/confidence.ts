// Formula keyakinan prediksi biaya — MURNI, tanpa satu pun impor nilai
// (K51, mengikuti K11). INTI Fase 6: lihat docs/FASE-6-AI-LAYER.md §5 (K68–K70).
//
// Kenapa berkas ini ada, dan kenapa ia yang paling penting di seluruh fase:
// prediksi tanpa angka keyakinan yang jujur adalah layar yang menampilkan
// "Rp 71.116.222 · keyakinan 87%" di atas satu dokumen buatan developer sendiri.
// Yang dijaga di sini bukan ketepatan prediksi (itu urusan data), melainkan
// kemampuan sistem untuk TAHU BAHWA IA BELUM TAHU — dan mengatakannya.
//
// Kontrak K51 (sama dengan calc-engine.ts & provenance.ts):
//   1. `import type` SAJA. Impor nilai relatif tanpa ekstensi gagal di Node,
//      yang ber-ekstensi `.ts` gagal di tsc (TS5097). `import type` terhapus
//      saat Node melakukan type-stripping, jadi aman di dua-duanya — berkas ini
//      bisa dijalankan `node` langsung, tanpa database. Konsekuensinya: modul
//      murni tak boleh saling memanggil di tingkat nilai. Faktor `M` karena itu
//      MASUK sebagai argumen dari similarity.ts, tidak diimpor.
//   2. Tidak melempar apa pun untuk kondisi domain. Masukan tak masuk akal
//      (n negatif, cv NaN, usia negatif) dinormalkan ke nilai paling pesimis,
//      bukan dilemparkan — layar prediksi tidak boleh bisa dirobohkan satu baris
//      histori yang ganjil.
//   3. Tidak ada `new Date()`. Usia sampel masuk sebagai angka bulan, dihitung
//      terhadap `tanggalJasa` dokumen (K68), bukan terhadap "hari ini".
//
// Karena murni, ConfidenceBadge.tsx di browser mengimpor berkas yang SAMA untuk
// menentukan band & teksnya — tidak ada ambang kembar antara server dan klien.

// -------------------------------------------------------------- tipe & ambang

/**
 * Tier provenance (K69). Urutan array = urutan dari yang paling dipercaya ke
 * yang paling tidak — dipakai sebagai dokumentasi, bukan sebagai peringkat yang
 * dihitung (topi-nya eksplisit di `TOPI`).
 */
export const TIER_PREDIKSI = ['NYATA', 'CAMPURAN', 'LATIHAN', 'KATALOG'] as const
export type TierPrediksi = (typeof TIER_PREDIKSI)[number]

export const BAND_KEYAKINAN = ['TINGGI', 'SEDANG', 'RENDAH'] as const
export type BandKeyakinan = (typeof BAND_KEYAKINAN)[number]

/**
 * ⚠️ SEMUA ANGKA DI BLOK INI SEMENTARA — P16 & P17 (§16). Blok ini adalah
 * TITIK SENTUH SATU-SATUNYA-nya, persis pola `approval-policy.ts` untuk P1:
 * menjawab P16/P17 berarti mengubah berkas ini saja, tanpa menyentuh satu pun
 * pemanggil, karena yang keluar tetap `{ confidence, tier, band }`.
 */

/** `k` pada S(n) = n/(n+k) (K68). Makin besar `k`, makin lambat sistem yakin. */
export const K_KECUKUPAN = 3

/** Sampel nyata minimal untuk keluar dari tier CAMPURAN (K69). */
export const AMBANG_NYATA = 3

/** Paruh waktu resensi, dalam bulan (K68) — tarif pelabuhan berubah tahunan. */
export const PARUH_RESENSI_BULAN = 12

/** Lantai R: data lama tetap bernilai sedikit, bukan nol (K68). */
export const LANTAI_RESENSI = 0.2

/**
 * V untuk n = 1 (K68). BUKAN 1: satu sampel punya cv = 0 secara matematis, dan
 * tanpa aturan ini satu dokumen tunggal akan tampak sebagai sumber paling
 * konsisten yang pernah ada. Sebarannya bukan sempit — sebarannya TIDAK
 * DIKETAHUI, dan itu dihukum.
 */
export const V_SAMPEL_TUNGGAL = 0.5

/**
 * K69 — topi provenance. Inilah pagar yang membuat data seed tak bisa
 * berpura-pura: berapa pun bagusnya S×R×V×M, tier yang tidak berpijak pada
 * kunjungan nyata tidak pernah boleh melewati topinya.
 */
export const TOPI: Readonly<Record<TierPrediksi, number>> = {
  NYATA: 0.95,
  CAMPURAN: 0.4,
  LATIHAN: 0.2,
  KATALOG: 0,
}

/** Batas bawah tiap band (K69): TINGGI ≥ 0,70 · SEDANG ≥ 0,40 · sisanya RENDAH. */
export const AMBANG_BAND: Readonly<Record<'TINGGI' | 'SEDANG', number>> = {
  TINGGI: 0.7,
  SEDANG: 0.4,
}

// ------------------------------------------------------------------- penolong

/** Angka yang tidak masuk akal (NaN/Infinity/negatif) → 0. Lihat kontrak 2. */
function angkaAman(nilai: number): number {
  return Number.isFinite(nilai) && nilai > 0 ? nilai : 0
}

/** Cacah sampel: bilangan bulat tak-negatif; pecahan/negatif/NaN → 0. */
function cacahAman(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

// -------------------------------------------------------- empat faktor (K68)

/**
 * **S — kecukupan sampel.** `S(n) = n / (n + K_KECUKUPAN)`, dengan `n = nNyata`.
 *
 * Bentuk jenuh yang **tak pernah mencapai 1**: berapa pun banyaknya data,
 * sistem ini tidak pernah berhak mengatakan yakin sepenuhnya soal harga masa
 * depan. `n = 0 → 0` ditangani sebagai cabang eksplisit — bukan karena
 * `0/(0+3)` salah (secara matematis ia memang 0 dan aman), tapi supaya
 * "tidak ada sampel → tidak ada keyakinan" terbaca sebagai keputusan di kode,
 * bukan sebagai kebetulan aritmatika yang bisa hilang saat `K_KECUKUPAN`
 * diubah menjawab P16.
 */
export function hitungS(n: number): number {
  const cacah = cacahAman(n)
  if (cacah === 0) return 0
  return cacah / (cacah + K_KECUKUPAN)
}

/**
 * **R — resensi.** `R = maks( LANTAI_RESENSI ; 0,5 ^ (usiaBulan / PARUH) )`.
 *
 * `usiaBulan` = umur median sampel terhadap `tanggalJasa` dokumen yang sedang
 * disusun — BUKAN terhadap "hari ini" (K68, sejalan K24). Modul murni tak boleh
 * memanggil `new Date()`, jadi umurnya memang harus datang sebagai argumen; itu
 * kebetulan yang menguntungkan, karena menghitung terhadap "hari ini" akan
 * membuat dokumen yang sama menghasilkan keyakinan berbeda tiap kali dibuka.
 *
 * Usia negatif (sampel bertanggal SESUDAH tanggal jasa dokumen — mungkin terjadi
 * saat menyusun dokumen mundur) diperlakukan sebagai 0 = paling segar.
 */
export function hitungR(usiaBulan: number): number {
  const usia = Number.isFinite(usiaBulan) && usiaBulan > 0 ? usiaBulan : 0
  const peluruhan = Math.pow(0.5, usia / PARUH_RESENSI_BULAN)
  return Math.max(LANTAI_RESENSI, peluruhan)
}

/**
 * **V — kerapatan sebaran.** `V = 1 / (1 + cv)` bila n ≥ 2; `V = 0,50` bila
 * n = 1 (lihat `V_SAMPEL_TUNGGAL`).
 *
 * n = 0: V tidak dipakai — S sudah 0 sehingga hasil akhirnya 0 apa pun V-nya.
 * Yang dikembalikan tetap **0, bukan 1**, supaya kalau suatu saat urutan
 * perkalian diubah, nilai yang menyelinap adalah yang pesimis.
 *
 * `cv` = simpangan baku SAMPEL (pembagi n−1) ÷ rata-rata, dihitung
 * `prediction-core.ts`. cv negatif/NaN → 0 (dianggap tak diketahui condong ke
 * rapat) hanya karena cv memang tak bisa negatif; sumber NaN yang sebenarnya
 * (rata-rata 0) sudah dijaga di `prediction-core.ts`.
 */
export function hitungV(nSampel: number, cv: number): number {
  const cacah = cacahAman(nSampel)
  if (cacah === 0) return 0
  if (cacah === 1) return V_SAMPEL_TUNGGAL
  return 1 / (1 + angkaAman(cv))
}

// --------------------------------------------------------------- tier & band

export type CacahSampel = {
  /** Item FDA ber-asal efektif 'NYATA' yang cocok (K58/K59). */
  nNyata: number
  /** Item FDA ber-asal 'SEED'/'UJI' yang cocok — dilaporkan, tak jadi basis. */
  nLatihan: number
}

/**
 * K69 — tier provenance. Perhatikan `nLatihan` hanya menentukan beda antara
 * LATIHAN dan KATALOG; ia tidak pernah menggeser tier ke atas. Itu K59:
 * **kenyataan mengalahkan contoh sejak sampel pertama.**
 */
export function tentukanTier({ nNyata, nLatihan }: CacahSampel): TierPrediksi {
  const nyata = cacahAman(nNyata)
  const latihan = cacahAman(nLatihan)
  if (nyata >= AMBANG_NYATA) return 'NYATA'
  if (nyata >= 1) return 'CAMPURAN'
  if (latihan >= 1) return 'LATIHAN'
  return 'KATALOG'
}

/** K69 — band dari nilai confidence yang SUDAH dipotong topi. */
export function tentukanBand(confidence: number): BandKeyakinan {
  const nilai = angkaAman(confidence)
  if (nilai >= AMBANG_BAND.TINGGI) return 'TINGGI'
  if (nilai >= AMBANG_BAND.SEDANG) return 'SEDANG'
  return 'RENDAH'
}

/**
 * Potong sebuah nilai mentah dengan topi tier-nya (K69).
 *
 * Diekspor terpisah supaya pagar utama Fase 6 bisa diuji SENDIRI, tanpa lewat
 * `hitungConfidence()`. Itu penting: pada implementasi hari ini tier LATIHAN
 * selalu berujung 0 karena S memakai `nNyata` (K68 menulisnya eksplisit:
 * *"n = nNyata … tanpa perkecualian dan tanpa cabang khusus"*), sehingga topi
 * LATIHAN tak pernah terlihat bekerja lewat jalur normal. Ia tetap dipasang
 * sebagai lapis kedua: kalau suatu hari S diberi makan sampel latihan (misalnya
 * menjawab P16 dengan "boleh, tapi dibatasi"), pagar ini sudah berdiri dan
 * sudah punya ujinya.
 */
export function terapkanTopi(nilaiMentah: number, tier: TierPrediksi): number {
  return Math.min(angkaAman(nilaiMentah), TOPI[tier])
}

// ----------------------------------------------------------- fungsi gabungan

export type MasukanConfidence = CacahSampel & {
  /** Umur median sampel dalam bulan, terhadap `tanggalJasa` dokumen (K68). */
  usiaBulan: number
  /** Simpangan baku sampel ÷ rata-rata `unitPrice` (prediction-core.ts). */
  cv: number
  /** Faktor kemiripan 1,00/0,85/0,70/0,55 dari `similarity.ts` (K63) — argumen, bukan impor. */
  m: number
}

export type HasilConfidence = {
  confidence: number
  tier: TierPrediksi
  band: BandKeyakinan
  /** Empat faktor apa adanya — supaya tooltip bisa menunjukkan asal angkanya. */
  faktor: { s: number; r: number; v: number; m: number }
  /** Nilai sebelum dipotong topi. Berguna untuk menjelaskan "kenapa cuma 0,20". */
  sebelumTopi: number
  topi: number
}

/**
 * K68 + K69 — `confidence = min( S(n) × R(usia) × V(cv) × M(kemiripan) , TOPI[tier] )`.
 *
 * `n` yang masuk ke S adalah **nNyata**, bukan nNyata+nLatihan. Ini bukan
 * kelalaian: K59 melarang sampel latihan menaikkan keyakinan sama sekali, dan
 * K68 menulis `n = nNyata` apa adanya. Akibatnya tier LATIHAN selalu
 * menghasilkan confidence 0 — sama dengan KATALOG — dan itulah keluaran yang
 * benar hari ini: angka median dari data contoh boleh ditampilkan (K59), tapi
 * keyakinannya nol. Yang membedakan keduanya di layar adalah TEKS-nya (K70),
 * bukan angkanya.
 *
 * `m` di luar (0,1] dijepit ke [0,1]: faktor kemiripan yang > 1 akan menaikkan
 * keyakinan melewati apa yang dibenarkan sampelnya, dan itu satu-satunya cara
 * formula ini bisa berbohong ke atas.
 */
export function hitungConfidence(masukan: MasukanConfidence): HasilConfidence {
  const tier = tentukanTier(masukan)
  const s = hitungS(masukan.nNyata)
  const r = hitungR(masukan.usiaBulan)
  const v = hitungV(masukan.nNyata, masukan.cv)
  const m = Math.min(1, angkaAman(masukan.m))

  const sebelumTopi = s * r * v * m
  const confidence = terapkanTopi(sebelumTopi, tier)

  return {
    confidence,
    tier,
    band: tentukanBand(confidence),
    faktor: { s, r, v, m },
    sebelumTopi,
    topi: TOPI[tier],
  }
}

// ----------------------------------------------------------- kata-kata (K70)

/**
 * K70 — enam keadaan teks. Kuncinya sengaja BUKAN `${tier}_${band}` bebas:
 * hanya tier NYATA yang bercabang menurut band. Untuk KATALOG & LATIHAN band
 * selalu RENDAH (topi 0 dan 0,20 keduanya di bawah 0,40), dan untuk CAMPURAN
 * band SEDANG memang bisa tercapai persis di 0,40 (nNyata = 2, cv 0, usia 0,
 * kemiripan 1 → 0,40 = topi) — dan di keadaan itu kalimat yang benar tetap
 * "baru {n} kunjungan nyata", bukan kalimat tier NYATA. Membuat baris ketujuh
 * untuk kasus itu berarti menjanjikan lebih dari yang dipunyai dua kunjungan.
 */
export const KUNCI_TEKS = [
  'KATALOG',
  'LATIHAN',
  'CAMPURAN_RENDAH',
  'NYATA_RENDAH',
  'NYATA_SEDANG',
  'NYATA_TINGGI',
] as const
export type KunciTeks = (typeof KUNCI_TEKS)[number]

export function kunciTeks(tier: TierPrediksi, band: BandKeyakinan): KunciTeks {
  if (tier === 'KATALOG') return 'KATALOG'
  if (tier === 'LATIHAN') return 'LATIHAN'
  if (tier === 'CAMPURAN') return 'CAMPURAN_RENDAH'
  if (band === 'TINGGI') return 'NYATA_TINGGI'
  if (band === 'SEDANG') return 'NYATA_SEDANG'
  return 'NYATA_RENDAH'
}

/**
 * Peta teks dua bahasa (konvensi `useT`/`STR` panel Fase 2/3), satu sumber untuk
 * server & klien. Placeholder `{n}` = jumlah kunjungan nyata, `{nLatihan}` =
 * jumlah baris contoh, `{periode}` = rentang tanggal sampel.
 */
export const TEKS_KEYAKINAN: Readonly<Record<'id' | 'en', Readonly<Record<KunciTeks, string>>>> = {
  id: {
    KATALOG: 'Belum ada biaya aktual tercatat — angka dari tarif katalog',
    LATIHAN: 'Berbasis data contoh/latihan — belum ada kunjungan nyata ({nLatihan} baris contoh)',
    CAMPURAN_RENDAH: 'Baru {n} kunjungan nyata — anggap ancar-ancar',
    NYATA_RENDAH: '{n} kunjungan nyata, tapi angkanya berbeda-beda jauh',
    NYATA_SEDANG: '{n} kunjungan nyata dalam {periode}',
    NYATA_TINGGI: '{n} kunjungan nyata, angka konsisten',
  },
  en: {
    KATALOG: 'No actual cost recorded yet — figure comes from the rate catalogue',
    LATIHAN: 'Based on sample/practice data — no real port call yet ({nLatihan} sample rows)',
    CAMPURAN_RENDAH: 'Only {n} real port call(s) — treat as a rough guide',
    NYATA_RENDAH: '{n} real port calls, but the figures vary widely',
    NYATA_SEDANG: '{n} real port calls within {periode}',
    NYATA_TINGGI: '{n} real port calls, figures are consistent',
  },
}

/**
 * Kolom "Yang HARUS ikut tampil" dari tabel K70, dibuat MESIN-BACA supaya
 * K64/1 (*"confidence tidak boleh ditampilkan tanpa `dasar.nNyata` di
 * sebelahnya"*) bisa ditegakkan oleh komponen, bukan diingat oleh manusia.
 */
export const PENDAMPING_WAJIB: Readonly<Record<KunciTeks, readonly string[]>> = {
  KATALOG: [],
  LATIHAN: ['nLatihan'],
  CAMPURAN_RENDAH: ['nNyata', 'rentangTanggal'],
  NYATA_RENDAH: ['nNyata', 'p25p75'],
  NYATA_SEDANG: ['nNyata', 'rentangTanggal'],
  NYATA_TINGGI: ['nNyata', 'p25p75'],
}

export type IsianTeks = {
  nNyata: number
  nLatihan: number
  /** Mis. "Feb–Jul 2026". `null` → frasa pengganti yang tidak mengarang tanggal. */
  periode?: string | null
}

/** Frasa pengganti saat `periode` tak diketahui — tidak pernah menebak tanggal. */
const PERIODE_TAK_DIKETAHUI: Readonly<Record<'id' | 'en', string>> = {
  id: 'periode yang tercatat',
  en: 'the recorded period',
}

/**
 * Isi teks K70 untuk sebuah hasil confidence. Semua placeholder diisi di sini —
 * UI tidak pernah merangkai kalimatnya sendiri, karena kalimat yang dirangkai di
 * dua tempat akan berbeda di salah satunya.
 */
export function teksKeyakinan(
  tier: TierPrediksi,
  band: BandKeyakinan,
  isian: IsianTeks,
  bahasa: 'id' | 'en' = 'id',
): string {
  const kunci = kunciTeks(tier, band)
  return TEKS_KEYAKINAN[bahasa][kunci]
    .replace('{n}', String(cacahAman(isian.nNyata)))
    .replace('{nLatihan}', String(cacahAman(isian.nLatihan)))
    .replace('{periode}', isian.periode ?? PERIODE_TAK_DIKETAHUI[bahasa])
}
