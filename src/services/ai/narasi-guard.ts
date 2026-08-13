// Pemeriksa angka pada narasi LLM — MURNI, tanpa satu pun impor nilai
// (K51, mengikuti K11). Lihat docs/FASE-6-AI-LAYER.md §4/K67 dan §7/K77.
//
// Kenapa berkas ini ada: K50 memisahkan tiga saluran keluaran — ANGKA (mesin),
// USULAN (konfirmasi manusia), NARASI (teks bebas). Narasi tidak pernah boleh
// memuat nominal baru. Tapi "tidak pernah boleh" yang hanya ditulis di system
// prompt adalah harapan, bukan pagar; model yang diminta menjelaskan tabel akan
// sesekali menulis angka yang enak dibaca alih-alih angka yang ada.
//
// Karena itu setiap narasi diperiksa MEKANIS sesudah jawaban diterima:
//
//   setiap deret angka ≥ 4 digit di narasi HARUS ada di payload
//   (dinormalkan: buang titik/koma pemisah ribuan) — kalau tidak, narasi DITOLAK
//   dan UI menampilkan "penjelasan tidak tersedia", bukan narasi yang lolos.
//
// **Menolak lebih baik daripada menayangkan.** Narasi salah-angka yang tampil di
// samping angka benar akan lebih dipercaya daripada tabelnya — itu satu-satunya
// alasan pemeriksaan ini ada, dan alasan kenapa arah kegagalannya sengaja
// dibuat mengganggu (kehilangan penjelasan) alih-alih diam (angka karangan).
//
// Ambang 4 digit dari K67: "3 kunjungan", "2 tug", "12 baris" tidak ikut kena;
// nominal rupiah selalu jauh di atasnya. Tahun "2026" persis 4 digit sehingga
// IKUT diperiksa — dan itu benar: tahun yang benar selalu ada di payload
// (tanggal dokumen), tahun karangan memang harus tertangkap.
//
// Kontrak K51: `import type` SAJA (berkas ini tak butuh satu pun tipe eksternal),
// tak melempar untuk kondisi domain, tak ada `new Date()`.

/** K67 — deret sependek ini diabaikan. Lihat catatan kepala. */
export const AMBANG_DIGIT = 4

/** Batas kedalaman penelusuran payload — pagar terhadap struktur patologis. */
const KEDALAMAN_MAKS = 12

/**
 * Deret angka beserta pemisahnya. Sengaja TIDAK menangkap tanda minus atau
 * simbol mata uang: yang diperiksa adalah deret digitnya, dan "-Rp 4.750.000"
 * memuat deret yang sama dengan "Rp 4.750.000".
 */
const POLA_ANGKA = /\d+(?:[.,]\d+)*/g

/** Buang nol di depan supaya "02026" dan "2026" dianggap deret yang sama. */
function tanpaNolDepan(digit: string): string {
  const potong = digit.replace(/^0+/, '')
  return potong === '' ? '0' : potong
}

/**
 * Bentuk-bentuk normal yang SAH untuk satu token angka.
 *
 * Kenapa lebih dari satu: K67 menyuruh "buang titik/koma pemisah ribuan", tapi
 * di teks Indonesia koma juga dipakai sebagai pemisah DESIMAL. Membuang keduanya
 * membabi buta mengubah "Rp 4.750.000,00" jadi deret 475000000 — sembilan digit
 * yang tak akan pernah ada di payload, sehingga narasi yang SEPENUHNYA BENAR
 * ditolak. Pemeriksaan yang menolak jawaban benar akan dimatikan orang dalam
 * seminggu, dan sesudah itu tak ada pemeriksaan sama sekali.
 *
 * Jadi tiap token menghasilkan beberapa kandidat dan cukup SATU yang cocok:
 *   - seluruh digit tanpa pemisah (tafsir K67 apa adanya);
 *   - bagian bulat saja, bila ekornya berbentuk desimal 1–2 digit (id: `,` / en: `.`).
 * Ini melonggarkan pemeriksaan hanya pada bentuk yang memang ambigu, bukan
 * secara umum.
 */
function kandidatToken(token: string): string[] {
  // Array + cek manual, bukan Set: `tsconfig` proyek ini tak menyalakan
  // downlevelIteration, jadi menyebar Set (`[...set]`) gagal kompilasi (TS2802).
  // Kandidatnya paling banyak dua — Set tak memberi apa pun di sini.
  const kandidat: string[] = [tanpaNolDepan(token.replace(/[.,]/g, ''))]

  // Ekor desimal 1–2 digit sesudah pemisah terakhir → bagian bulatnya juga sah.
  const desimal = /^(\d[\d.,]*)[.,](\d{1,2})$/.exec(token)
  if (desimal !== null) {
    const bulat = tanpaNolDepan(desimal[1].replace(/[.,]/g, ''))
    if (!kandidat.includes(bulat)) kandidat.push(bulat)
  }
  return kandidat
}

export type TokenAngka = {
  /** Apa adanya seperti tertulis di narasi — dipakai untuk pesan galat. */
  asli: string
  /** Bentuk normal yang menentukan panjang deret (dan karenanya ambang). */
  utama: string
  kandidat: readonly string[]
}

/** Ambil semua deret angka dari sebuah teks, tanpa menyaring ambang. */
export function ekstrakAngka(teks: string): TokenAngka[] {
  if (typeof teks !== 'string' || teks === '') return []
  const hasil: TokenAngka[] = []
  const cocok = teks.match(POLA_ANGKA)
  if (cocok === null) return []
  for (const token of cocok) {
    const kandidat = kandidatToken(token)
    hasil.push({ asli: token, utama: kandidat[0], kandidat })
  }
  return hasil
}

/**
 * Kumpulkan semua deret angka yang ADA di payload, dari angka maupun dari teks
 * (nomor dokumen "FDA/2026/08/0001", tanggal "2026-08-13", dan ringkasan yang
 * sudah dirakit server semuanya membawa angka sah).
 *
 * Kunci objek SENGAJA tidak ikut: nama field bukan data, dan memasukkannya akan
 * memperlebar himpunan "yang dianggap sah" tanpa satu pun manfaat.
 */
export function kumpulkanAngkaPayload(payload: unknown): Set<string> {
  const himpunan = new Set<string>()
  const dikunjungi = new WeakSet<object>()

  const telusuri = (nilai: unknown, kedalaman: number): void => {
    if (kedalaman > KEDALAMAN_MAKS) return
    if (nilai === null || nilai === undefined) return

    if (typeof nilai === 'number') {
      if (!Number.isFinite(nilai)) return
      const mutlak = Math.abs(nilai)
      himpunan.add(tanpaNolDepan(String(Math.trunc(mutlak))))
      himpunan.add(tanpaNolDepan(String(mutlak).replace(/\D/g, '')))
      return
    }

    if (typeof nilai === 'bigint') {
      himpunan.add(tanpaNolDepan(nilai.toString().replace(/\D/g, '')))
      return
    }

    if (typeof nilai === 'string') {
      for (const t of ekstrakAngka(nilai)) for (const k of t.kandidat) himpunan.add(k)
      return
    }

    if (typeof nilai !== 'object') return
    if (dikunjungi.has(nilai)) return
    dikunjungi.add(nilai)

    if (nilai instanceof Date) {
      const ms = nilai.getTime()
      if (Number.isFinite(ms)) {
        for (const t of ekstrakAngka(nilai.toISOString())) for (const k of t.kandidat) himpunan.add(k)
      }
      return
    }

    if (Array.isArray(nilai)) {
      for (const anak of nilai) telusuri(anak, kedalaman + 1)
      return
    }

    for (const anak of Object.values(nilai as Record<string, unknown>)) {
      telusuri(anak, kedalaman + 1)
    }
  }

  telusuri(payload, 0)
  return himpunan
}

export type HasilPeriksaNarasi = {
  diterima: boolean
  /** Token apa adanya seperti tertulis di narasi, urut kemunculan, tanpa duplikat. */
  angkaTakDikenal: string[]
  /** Berapa deret yang benar-benar diperiksa (≥ AMBANG_DIGIT) — untuk log/uji. */
  jumlahDiperiksa: number
}

/**
 * K67 — pemeriksaan utama. `payload` adalah objek yang DIKIRIM ke model
 * (mis. `PrediksiBaris` atau `KonteksAI`); narasi yang memuat deret ≥ 4 digit di
 * luar payload itu ditolak seluruhnya.
 *
 * Ditolak SELURUHNYA, bukan disensor per kalimat: menghapus satu angka dari
 * paragraf meninggalkan kalimat yang tetap terbaca dan tetap salah. Yang aman
 * adalah tidak menayangkan apa pun.
 */
export function periksaNarasi(narasi: string, payload: unknown): HasilPeriksaNarasi {
  const dikenal = kumpulkanAngkaPayload(payload)
  const takDikenal: string[] = []
  let diperiksa = 0

  for (const token of ekstrakAngka(narasi)) {
    if (token.utama.length < AMBANG_DIGIT) continue
    diperiksa++
    if (token.kandidat.some((k) => dikenal.has(k))) continue
    if (!takDikenal.includes(token.asli)) takDikenal.push(token.asli)
  }

  return {
    diterima: takDikenal.length === 0,
    angkaTakDikenal: takDikenal,
    jumlahDiperiksa: diperiksa,
  }
}

/** Teks pengganti saat narasi ditolak (K67) — dua bahasa, satu sumber. */
export const TEKS_NARASI_DITOLAK: Readonly<Record<'id' | 'en', string>> = {
  id: 'Penjelasan tidak tersedia — angka pada penjelasan tidak cocok dengan data.',
  en: 'Explanation unavailable — the figures in the explanation do not match the data.',
}
